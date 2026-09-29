import { SKY_VS, SKY_FS, RAIN_VS, RAIN_FS, GLASS_FS, DROP_VS, DROPLET_VS, DROP_FS, ERASE_FS, FILL_FS } from "./shaders";
import { RainSimulator, type RainOptions } from "./RainSimulator";
import {
  dropConcentration, fractionAbove, mpLambda, rainRateFromIntensity, terminalVelocity,
} from "./rainPhysics";

/** Parâmetros físicos da cena. Todos são interpolados suavemente. */
export interface WeatherParams {
  /** Cobertura de nuvens, 0..1 */
  cloud: number;
  /** Intensidade da chuva, 0..1 */
  rain: number;
  /** Tempestade (escurece e liga relâmpagos), 0..1 */
  storm: number;
  /** Vento, -1..1 (positivo sopra para a direita) */
  wind: number;
  /** Hora local, 0..24. Calcula a posição do sol e da lua. */
  hour: number;
  /** Sobrescreve a posição horizontal do sol, 0 (esquerda) a 1 (direita). */
  sunX?: number;
  /** Sobrescreve a elevação do sol, -1 (abaixo do horizonte) a 1 (topo). */
  sunY?: number;
  /** Sobrescreve a posição horizontal da lua, 0..1. */
  moonX?: number;
  /** Sobrescreve a elevação da lua, -1..1. */
  moonY?: number;
  /** Raio do sol, fração da altura da tela (padrão 0.042). */
  sunSize?: number;
  /** Raio da lua, fração da altura da tela (padrão 0.036). */
  moonSize?: number;
  /** Fase da lua: 0 nova, 0.25 crescente, 0.5 cheia, 0.75 minguante. Padrão: fase real de hoje. */
  moonPhase?: number;
  /** Nascer do sol em horas locais (ex.: 5.25). Vem da API de clima. */
  sunrise?: number;
  /** Pôr do sol em horas locais (ex.: 17.6). */
  sunset?: number;
  /** Gotas no vidro, 0..1 (multiplica a água que a chuva deixa). Padrão 1. */
  glass?: number;
  /** Reflexo do sol na lente, 0..1. Padrão 1. */
  flare?: number;
}

export interface EngineOptions {
  /** Fração da resolução nativa a renderizar. Nuvens são suaves, 0.5–0.7 já fica ótimo. */
  renderScale?: number;
  /** Teto de fps. 30 economiza bateria em aparelhos fracos. */
  maxFps?: number;
  /** Máximo de gotas com chuva em 100%. */
  maxDrops?: number;
  /** Tempo (s) das transições entre climas. */
  transition?: number;
  /** Nascer e pôr do sol em horas (padrão: Recife). */
  sunrise?: number;
  sunset?: number;
}

type State = {
  cloud: number; rain: number; storm: number; wind: number;
  sunX: number; sunH: number; moonX: number; moonH: number;
  sunSize: number; moonSize: number; moonPhase: number;
  glass: number; flare: number;
};

type Prog = { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer };

/** Área de referência (px de CSS) para a densidade de gotas: uma tela de celular. */
const REF_AREA = 390 * 800;

/**
 * Traduz a chuva em comportamento das gotas:
 * garoa = gotas pequenas e raras (quem manda são as gotículas), quase nada escorre;
 * chuva = gotas médias, algumas escorrem;
 * temporal/trovoada = muitas gotas grandes, escorrem mais e inclinadas pelo vento.
 */
/** Pixels de CSS por milímetro de vidro (escala do "vidro" na tela). */
export const GLASS_PX_PER_MM = 6;
/** Vento: 1 na engine = 12 m/s. */
export const WIND_MS = 12;

/**
 * Traduz a chuva em números físicos para o vidro.
 * O fluxo de gotas vem de Marshall-Palmer (concentração × velocidade de queda × área);
 * uma janela vertical pega mais chuva quanto mais o vento a empurra contra o vidro.
 */
export function rainOptionsFor(rain: number, storm: number, wind: number, px: number, cssArea: number, wetness: number):
  RainOptions & { dropletsPerSecond: number } {
  const rate = rainRateFromIntensity(rain) * (1 + storm * 0.5);
  const windMs = wind * WIND_MS;
  const areaM2 = (cssArea / (GLASS_PX_PER_MM * GLASS_PX_PER_MM)) * 1e-6;
  const exposure = 0.35 + 0.65 * clamp01(Math.abs(windMs) / 6);
  const minD = 0.7;
  const impacts = rate > 0
    ? dropConcentration(rate) * terminalVelocity(Math.max(1 / mpLambda(rate), 0.4)) * areaM2 * exposure
    : 0;
  const big = rate > 0 ? fractionAbove(rate, minD) : 0;
  return {
    rainRate: rate,
    impactsPerSecond: impacts * big,
    dropletsPerSecond: impacts * (1 - big),
    minDiameter: minD,
    spawnLimit: 700,
    windMs,
    mmToPx: GLASS_PX_PER_MM * px,
    wetness,
    // chovendo, a evaporação é real (lenta); secando, é acelerada para o vidro limpar em segundos
    evaporation: rate > 0 ? 0.0005 : 0.1,
    pinning: 0.06,
  };
}

const KEYS: (keyof State)[] = [
  "cloud", "rain", "storm", "wind", "sunX", "sunH", "moonX", "moonH", "sunSize", "moonSize", "moonPhase", "glass", "flare",
];

/** Fase real da lua para uma data: 0 nova, 0.5 cheia. */
export function moonPhaseFor(date = new Date()) {
  const synodic = 29.530588853;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - knownNew) / 86400000;
  return (((days / synodic) % 1) + 1) % 1;
}

export class WeatherEngine {
  private gl: WebGL2RenderingContext | null = null;
  private opts: Required<EngineOptions>;
  private sky?: Prog;
  private rainP?: Prog;
  private glassP?: Prog;
  private dropP?: Prog;
  private dropletP?: Prog;
  private eraseP?: Prog;
  private fillP?: Prog;
  private vao: WebGLVertexArrayObject | null = null;
  private dropVao: WebGLVertexArrayObject | null = null;
  private dropBuf: WebGLBuffer | null = null;
  private dropData = new Float32Array(0);

  /** Alvos de renderização: cena, gotas, gotículas (persistente) e névoa (persistente). */
  private rt: Record<"scene" | "drops" | "droplets" | "mist", Target> | null = null;
  private rtW = 0;
  private rtH = 0;

  /** Água no vidro: sobe rápido com chuva e seca devagar. Controla a névoa. */
  private wet = 0;
  private sim = new RainSimulator(rainOptionsFor(0, 0, 0, 1, 1, 0));
  private dropletCarry = 0;
  /** Acúmulos para as texturas de 8 bits: mudanças menores que 1/255 por quadro se perderiam no arredondamento. */
  private mistAddAcc = 0;
  private mistFadeAcc = 0;
  private dropletFadeAcc = 1;
  private glassDry = true;
  /** Segundos de gotículas e névoa a pré-acumular no próximo quadro. */
  private warmup = 0;

  private cur: State;
  private target: State;
  private hasTarget = false;

  private time = Math.random() * 100;
  private last = 0;
  private raf = 0;
  private visible = true;
  private reduced: boolean;
  private flash = 0;
  private flashT = -1;
  private flashX = 0.5;
  private nextFlash = 2;

  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private mq: MediaQueryList;

  constructor(private canvas: HTMLCanvasElement, options: EngineOptions = {}) {
    this.opts = {
      renderScale: 0.6, maxFps: 60, maxDrops: 2600, transition: 1.6,
      sunrise: 5.3, sunset: 17.6, ...options,
    };
    const blank: State = {
      cloud: 0, rain: 0, storm: 0, wind: 0.2, sunX: 0.5, sunH: 0.8, moonX: 0.5, moonH: -0.3,
      sunSize: 0.042, moonSize: 0.036, moonPhase: moonPhaseFor(),
      glass: 1, flare: 1,
    };
    this.cur = { ...blank };
    this.target = { ...blank };

    this.mq = matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = this.mq.matches;
    this.mq.addEventListener("change", this.onMotionPref);

    this.initGL();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.kick(); });
    this.io.observe(canvas);
    document.addEventListener("visibilitychange", this.kick);
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
  }

  /** Muda o clima. A primeira chamada é aplicada na hora; as seguintes fazem transição. */
  set(p: Partial<WeatherParams>, immediate = false) {
    const t = this.target;
    if (p.cloud !== undefined) t.cloud = clamp01(p.cloud);
    if (p.rain !== undefined) t.rain = clamp01(p.rain);
    if (p.storm !== undefined) t.storm = clamp01(p.storm);
    if (p.wind !== undefined) t.wind = Math.max(-1, Math.min(1, p.wind));
    if (p.sunrise !== undefined) this.opts.sunrise = p.sunrise;
    if (p.sunset !== undefined) this.opts.sunset = p.sunset;
    if (p.hour !== undefined) Object.assign(t, this.astro(p.hour));
    if (p.sunX !== undefined) t.sunX = p.sunX;
    if (p.sunY !== undefined) t.sunH = p.sunY;
    if (p.moonX !== undefined) t.moonX = p.moonX;
    if (p.moonY !== undefined) t.moonH = p.moonY;
    if (p.sunSize !== undefined) t.sunSize = Math.max(0.005, p.sunSize);
    if (p.moonSize !== undefined) t.moonSize = Math.max(0.005, p.moonSize);
    if (p.moonPhase !== undefined) t.moonPhase = ((p.moonPhase % 1) + 1) % 1;
    if (p.glass !== undefined) t.glass = clamp01(p.glass);
    if (p.flare !== undefined) t.flare = clamp01(p.flare);
    if (immediate || !this.hasTarget || this.reduced) {
      this.cur = { ...t };
      this.wet = t.rain > 0.02 ? clamp01(0.3 + t.rain * 0.9) : 0;
      this.prewarmRain();
    }
    this.hasTarget = true;
    if (!this.gl) this.paintFallback();
    this.kick();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro?.disconnect();
    this.io?.disconnect();
    document.removeEventListener("visibilitychange", this.kick);
    this.mq.removeEventListener("change", this.onMotionPref);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    const gl = this.gl;
    if (gl) {
      if (this.sky) gl.deleteProgram(this.sky.prog);
      if (this.rainP) gl.deleteProgram(this.rainP.prog);
      if (this.glassP) gl.deleteProgram(this.glassP.prog);
      for (const p of [this.dropP, this.dropletP, this.eraseP, this.fillP]) if (p) gl.deleteProgram(p.prog);
      if (this.dropVao) gl.deleteVertexArray(this.dropVao);
      if (this.dropBuf) gl.deleteBuffer(this.dropBuf);
      this.freeTargets();
      if (this.vao) gl.deleteVertexArray(this.vao);
    }
    this.gl = null;
  }

  // ------------------------------------------------------------------ setup

  private initGL() {
    const gl = this.canvas.getContext("webgl2", {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, powerPreference: "low-power",
    });
    if (!gl) { this.gl = null; this.paintFallback(); return; }
    this.gl = gl;
    try {
      this.sky = this.program(SKY_VS, SKY_FS,
        ["u_res", "u_time", "u_cloud", "u_rain", "u_storm", "u_wind", "u_sun", "u_moon",
         "u_sunSize", "u_moonSize", "u_moonPhase", "u_flash", "u_flashX"]);
      this.rainP = this.program(RAIN_VS, RAIN_FS,
        ["u_res", "u_time", "u_lambda", "u_windMs", "u_scale", "u_ppm", "u_flash", "u_color"]);
      this.glassP = this.program(SKY_VS, GLASS_FS,
        ["u_scene", "u_drops", "u_droplets", "u_mist", "u_res", "u_glass", "u_sunUV", "u_sunVis", "u_flare", "u_flash"]);
      this.dropP = this.program(DROP_VS, DROP_FS, ["u_res"]);
      this.eraseP = this.program(DROP_VS, ERASE_FS, ["u_res"]);
      this.dropletP = this.program(DROPLET_VS, DROP_FS, ["u_res", "u_seed", "u_sizeRange"]);
      this.fillP = this.program(SKY_VS, FILL_FS, ["u_color"]);
    } catch (err) {
      console.warn("[webgl-weather] shader failed, using CSS fallback", err);
      this.gl = null;
      this.paintFallback();
      return;
    }
    this.vao = gl.createVertexArray(); // vazio: a geometria vem de gl_VertexID

    // instâncias das gotas: (x, y, largura, altura) + tamanho
    this.dropVao = gl.createVertexArray();
    this.dropBuf = gl.createBuffer();
    gl.bindVertexArray(this.dropVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dropBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    this.rt = null;
    this.rtW = this.rtH = 0;
    this.resize();
  }

  private program(vs: string, fs: string, names: string[]) {
    const gl = this.gl!;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    const prog = gl.createProgram()!;
    const v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const n of names) u[n] = gl.getUniformLocation(prog, n);
    return { prog, u };
  }

  private resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr * this.opts.renderScale));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr * this.opts.renderScale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.sim.resize(w, h);
    if (!this.raf) this.render(); // mantém o quadro correto mesmo pausado
  };

  // ------------------------------------------------------------------ loop

  private kick = () => {
    const run = !!this.gl && this.visible && !document.hidden && !this.reduced;
    if (run && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    } else if (!run && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (!run && this.gl) this.render(); // quadro estático
  };

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const minDt = 1000 / this.opts.maxFps - 1;
    if (now - this.last < minDt) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.render(dt);
  };

  private update(dt: number) {
    this.time += dt;
    const k = 1 - Math.exp(-dt / (this.opts.transition / 3));
    for (const key of KEYS) this.cur[key] += (this.target[key] - this.cur[key]) * k;

    // vidro: molha em segundos, seca em ~meio minuto depois que a chuva para
    const c = this.cur;
    const wetTarget = c.rain > 0.02 ? clamp01(0.3 + c.rain * 0.9) : 0;
    const tau = wetTarget > this.wet ? 2.5 : 30;
    this.wet += (wetTarget - this.wet) * (1 - Math.exp(-dt / tau));

    // simulação das gotas no vidro
    if (c.glass > 0.01) {
      this.sim.options = rainOptionsFor(c.rain, c.storm, c.wind, this.pxScale(), this.cssArea(), this.wet);
      this.sim.update(Math.min(dt, 1 / 20));
    }

    // relâmpagos: agendados aleatoriamente, com dois pulsos cada
    if (this.cur.storm > 0.3) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0 && this.flashT < 0) {
        this.flashT = 0;
        this.flashX = 0.15 + Math.random() * 0.7;
        this.nextFlash = (2.5 + Math.random() * 6) / this.cur.storm;
      }
    }
    if (this.flashT >= 0) {
      this.flashT += dt;
      const t = this.flashT;
      this.flash = Math.exp(-t * 9) + (t > 0.18 ? 0.75 * Math.exp(-(t - 0.18) * 7) : 0);
      if (t > 1.4) { this.flashT = -1; this.flash = 0; }
    }
  }

  private makeTarget(W: number, H: number): Target {
    const gl = this.gl!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo };
  }

  private ensureTargets(W: number, H: number) {
    if (this.rt && this.rtW === W && this.rtH === H) return;
    this.freeTargets();
    this.rt = {
      scene: this.makeTarget(W, H),
      drops: this.makeTarget(W, H),
      droplets: this.makeTarget(W, H),
      mist: this.makeTarget(W, H),
    };
    this.rtW = W;
    this.rtH = H;
    this.warmup = Math.max(this.warmup, this.wet > 0.05 ? 8 : 0);
  }

  private freeTargets() {
    const gl = this.gl;
    if (!gl || !this.rt) return;
    for (const t of Object.values(this.rt)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    this.rt = null;
  }

  private fill(target: Target, r: number, g: number, b: number, a: number, src: number, dst: number) {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.enable(gl.BLEND);
    gl.blendFunc(src, dst);
    gl.useProgram(this.fillP!.prog);
    gl.uniform4f(this.fillP!.u.u_color, r, g, b, a);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Atualiza gotículas, névoa e gotas nas texturas do vidro. */
  private renderGlass(W: number, H: number, dt: number) {
    const gl = this.gl!;
    const rt = this.rt!;
    const c = this.cur;
    const raining = c.rain > 0.02;
    const px = this.pxScale();
    const area = this.cssArea() / REF_AREA;

    let steps = dt;
    if (this.warmup > 0) { steps += this.warmup; this.warmup = 0; }

    const drops0 = this.sim.drops.length;

    // vidro totalmente seco: limpa tudo de uma vez, sem sobrar mancha
    if (!raining && drops0 === 0) {
      if (!this.glassDry) {
        for (const t of [rt.droplets, rt.mist]) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        this.glassDry = true;
        this.mistAddAcc = this.mistFadeAcc = 0;
        this.dropletFadeAcc = 1;
      }
    } else {
      this.glassDry = false;
    }

    // gotículas: nascem enquanto chove
    const perSec = raining ? (this.sim.options as RainOptions & { dropletsPerSecond: number }).dropletsPerSecond ?? 0 : 0;
    this.dropletCarry += perSec * steps;
    const count = Math.min(Math.floor(this.dropletCarry), 20000);
    this.dropletCarry -= count;
    if (count > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.droplets.fbo);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.dropletP!.prog);
      gl.uniform2f(this.dropletP!.u.u_res, W, H);
      gl.uniform1f(this.dropletP!.u.u_seed, Math.random() * 100);
      const mm = GLASS_PX_PER_MM * px;
      gl.uniform2f(this.dropletP!.u.u_sizeRange, 0.5 * mm, 2.6 * mm);
      gl.bindVertexArray(this.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    }
    // somem por multiplicação, aplicada em lotes de pelo menos 4%
    this.dropletFadeAcc *= Math.exp(-steps / (raining ? 14 : 3));
    if (this.dropletFadeAcc < 0.96) {
      this.fill(rt.droplets, 0, 0, 0, 1 - this.dropletFadeAcc, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      this.dropletFadeAcc = 1;
    }

    // névoa: embaça enquanto chove, desembaça em linha reta quando seca
    if (raining) this.mistAddAcc += (steps / (14 - 9 * c.rain)) * this.wet;
    if (this.mistAddAcc >= 3 / 255) {
      const k = Math.min(this.mistAddAcc, 1);
      this.fill(rt.mist, k, k, k, k, gl.ONE, gl.ONE);
      this.mistAddAcc = 0;
    }
    this.mistFadeAcc += steps / (raining ? 40 : 5);
    if (this.mistFadeAcc >= 3 / 255) {
      const k = Math.min(this.mistFadeAcc, 1);
      gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
      this.fill(rt.mist, k, k, k, k, gl.ONE, gl.ONE);
      gl.blendEquation(gl.FUNC_ADD);
      this.mistFadeAcc = 0;
    }

    // gotas simuladas
    const drops = this.sim.drops;
    const n = drops.length;
    if (this.dropData.length < n * 5) this.dropData = new Float32Array(Math.max(n * 5, 512) * 2);
    const d = this.dropData;
    const sizeRef = 1 / 4;   // raio da base em mm → 0..1
    for (let i = 0; i < n; i++) {
      const o = drops[i];
      d[i * 5] = o.x;
      d[i * 5 + 1] = o.y;
      d[i * 5 + 2] = o.width;
      d[i * 5 + 3] = o.height;
      d[i * 5 + 4] = Math.min(1, o.a * sizeRef);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dropBuf);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * 5), gl.DYNAMIC_DRAW);

    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.drops.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (n > 0) {
      gl.bindVertexArray(this.dropVao);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.dropP!.prog);
      gl.uniform2f(this.dropP!.u.u_res, W, H);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);

      // as gotas limpam gotículas e névoa por onde passam
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.eraseP!.prog);
      gl.uniform2f(this.eraseP!.u.u_res, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.droplets.fbo);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.mist.fbo);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    }
    gl.disable(gl.BLEND);
  }

  private render(dt = 0) {
    const gl = this.gl;
    if (!gl || !this.sky || !this.rainP || !this.glassP || gl.isContextLost()) return;
    const W = this.canvas.width, H = this.canvas.height;
    const c = this.cur;
    this.ensureTargets(W, H);
    const rt = this.rt!;
    gl.viewport(0, 0, W, H);
    gl.bindVertexArray(this.vao);

    // ---- céu e chuva na textura da cena
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.scene.fbo);
    const s = this.sky;
    gl.useProgram(s.prog);
    gl.uniform2f(s.u.u_res, W, H);
    gl.uniform1f(s.u.u_time, this.time);
    gl.uniform1f(s.u.u_cloud, c.cloud);
    gl.uniform1f(s.u.u_rain, c.rain);
    gl.uniform1f(s.u.u_storm, c.storm);
    gl.uniform1f(s.u.u_wind, c.wind);
    gl.uniform2f(s.u.u_sun, c.sunX, c.sunH);
    gl.uniform2f(s.u.u_moon, c.moonX, c.moonH);
    gl.uniform1f(s.u.u_sunSize, c.sunSize);
    gl.uniform1f(s.u.u_moonSize, c.moonSize);
    gl.uniform1f(s.u.u_moonPhase, c.moonPhase);
    gl.uniform1f(s.u.u_flash, this.flash * c.storm);
    gl.uniform1f(s.u.u_flashX, this.flashX);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // quantidade visível cresce com a concentração de gotas no ar (Marshall-Palmer)
    const rate = rainRateFromIntensity(c.rain) * (1 + c.storm * 0.5);
    const drops = rate > 0
      ? Math.round(this.opts.maxDrops * clamp01(dropConcentration(rate) / 4000) * smooth(0.02, 0.12, c.rain))
      : 0;
    if (drops > 0) {
      const r = this.rainP;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(r.prog);
      gl.uniform2f(r.u.u_res, W, H);
      gl.uniform1f(r.u.u_time, this.time);
      gl.uniform1f(r.u.u_lambda, mpLambda(rate));
      gl.uniform1f(r.u.u_windMs, c.wind * WIND_MS);
      gl.uniform1f(r.u.u_scale, this.pxScale());
      gl.uniform1f(r.u.u_ppm, H / 1.15);                 // ~60° de campo de visão vertical
      gl.uniform1f(r.u.u_flash, this.flash * c.storm);
      const day = smooth(-0.12, 0.3, c.sunH);
      const k = 1 - 0.25 * c.cloud * day;
      gl.uniform3f(r.u.u_color, (0.34 + 0.52 * day) * k, (0.38 + 0.52 * day) * k, (0.46 + 0.49 * day) * k);
      gl.drawArrays(gl.TRIANGLES, 0, drops * 6);
      gl.disable(gl.BLEND);
    }

    // ---- vidro
    if (c.glass > 0.01) this.renderGlass(W, H, dt);

    // ---- composição final na tela
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.bindVertexArray(this.vao);
    const g = this.glassP;
    gl.useProgram(g.prog);
    const bind = (unit: number, tex: WebGLTexture, name: string) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(g.u[name], unit);
    };
    bind(0, rt.scene.tex, "u_scene");
    bind(1, rt.drops.tex, "u_drops");
    bind(2, rt.droplets.tex, "u_droplets");
    bind(3, rt.mist.tex, "u_mist");
    gl.uniform2f(g.u.u_res, W, H);
    gl.uniform1f(g.u.u_glass, c.glass);
    gl.uniform2f(g.u.u_sunUV, 0.12 + 0.76 * c.sunX, 0.1 + 0.5 * c.sunH);
    const over = clamp01(c.cloud * 0.72 + c.rain * 0.35 + c.storm * 0.3);
    gl.uniform1f(g.u.u_sunVis, smooth(-0.08, 0.04, c.sunH) * (1 - over * 0.92));
    gl.uniform1f(g.u.u_flare, c.flare);
    gl.uniform1f(g.u.u_flash, this.flash * c.storm);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private pxScale() {
    return Math.min(window.devicePixelRatio || 1, 2) * this.opts.renderScale;
  }

  private cssArea() {
    return Math.max(1, this.canvas.clientWidth * this.canvas.clientHeight);
  }

  /** Quando a página abre já chovendo, o vidro já começa molhado. */
  private prewarmRain() {
    const c = this.cur;
    this.sim.clear();
    if (c.rain <= 0.02 || c.glass <= 0.01) return;
    this.sim.options = rainOptionsFor(c.rain, c.storm, c.wind, this.pxScale(), this.cssArea(), this.wet);
    for (let i = 0; i < 180; i++) this.sim.update(1 / 30);
    this.warmup = 8;
  }

  // ------------------------------------------------------------------ helpers

  /** Converte hora em posição do sol e da lua. */
  private astro(hour: number) {
    const { sunrise, sunset } = this.opts;
    const h = ((hour % 24) + 24) % 24;
    const dayLen = sunset - sunrise;
    const dayT = (h - sunrise) / dayLen;
    const sunH = Math.sin(Math.PI * dayT);
    const sunX = Math.min(1.1, Math.max(-0.1, dayT));
    const nightT = (((h - sunset) % 24) + 24) % 24 / (24 - dayLen);
    const inNight = nightT <= 1;
    return {
      sunX, sunH,
      moonX: inNight ? nightT : 1.1,
      moonH: inNight ? Math.sin(Math.PI * nightT) * 0.75 : -0.3,
    };
  }

  /** Sem WebGL2: um gradiente em CSS aproximado. */
  private paintFallback() {
    const c = this.target;
    const day = c.sunH > 0.05;
    const overcast = c.cloud > 0.6 || c.rain > 0.3;
    const top = !day ? "#0b1230" : overcast ? (c.storm > 0.5 ? "#4a525e" : "#7d8895") : "#2b73d6";
    const bot = !day ? "#1b2447" : overcast ? (c.storm > 0.5 ? "#6b7380" : "#a7b1bc") : "#8fc8f4";
    this.canvas.style.background = `linear-gradient(to bottom, ${top}, ${bot})`;
  }

  private onMotionPref = () => {
    this.reduced = this.mq.matches;
    if (this.reduced) this.cur = { ...this.target };
    this.kick();
  };

  private onLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  private onRestored = () => {
    this.initGL();
    this.kick();
  };
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function smooth(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
