// Todos os shaders são GLSL ES 3.0 (WebGL2) e não usam atributos:
// a geometria sai de gl_VertexID, então não existe nenhum buffer para gerenciar.

/** Triângulo que cobre a tela inteira. */
export const SKY_VS = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Céu, sol, lua, estrelas, nuvens procedurais e relâmpago. */
export const SKY_FS = /* glsl */ `#version 300 es
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform float u_cloud;     // 0..1 cobertura
uniform float u_rain;      // 0..1 intensidade
uniform float u_storm;     // 0..1 escurecimento de tempestade
uniform float u_wind;      // -1..1
uniform vec2  u_sun;       // x 0..1, elevação -1..1
uniform vec2  u_moon;      // x 0..1, elevação -1..1
uniform float u_sunSize;   // raio, fração da altura da tela
uniform float u_moonSize;  // raio, fração da altura da tela
uniform float u_moonPhase; // 0 nova, 0.25 crescente, 0.5 cheia, 0.75 minguante
uniform float u_flash;     // 0..1
uniform float u_flashX;    // 0..1

out vec4 o;

#define PI 3.14159265

// Ruído de valor + fBm. Pode ser trocado por lygia/generative/snoise.glsl.
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

// Crateras: células com um anel escuro e borda clara.
float craters(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float acc = 0.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y);
    float h = hash(i + g);
    if (h < 0.55) continue;
    vec2 c = g + vec2(hash(i + g + 3.1), hash(i + g + 7.7)) * 0.8 + 0.1;
    float r = mix(0.12, 0.38, hash(i + g + 1.7));
    float d = length(f - c) / r;
    acc += (smoothstep(1.0, 0.7, d) * 0.55 - smoothstep(1.15, 0.95, d) * smoothstep(0.85, 1.0, d) * 0.6) * (h - 0.55) * 2.2;
  }
  return acc;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float asp = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * asp, uv.y);
  float px = 1.0 / u_res.y;   // um pixel em unidades da cena

  float sunH = u_sun.y;
  float day = smoothstep(-0.12, 0.3, sunH);
  float twi = smoothstep(-0.3, -0.02, sunH) * (1.0 - smoothstep(0.02, 0.4, sunH));

  // ---- gradiente do céu
  vec3 top = mix(vec3(0.015, 0.03, 0.10), vec3(0.14, 0.42, 0.84), day);
  vec3 bot = mix(vec3(0.07, 0.11, 0.25), vec3(0.55, 0.78, 0.96), day);
  top = mix(top, vec3(0.20, 0.22, 0.48), twi * 0.7);
  bot = mix(bot, vec3(0.98, 0.58, 0.36), twi);
  vec3 sky = mix(bot, top, pow(uv.y, 0.8));

  // ---- céu encoberto: dessatura e acinzenta
  float over = clamp(u_cloud * 0.72 + u_rain * 0.35 + u_storm * 0.3, 0.0, 1.0);
  float heavy = smoothstep(0.55, 1.0, u_cloud);                    // céu fechado de verdade
  vec3 greyDay = mix(vec3(0.60, 0.65, 0.71), vec3(0.43, 0.47, 0.53), heavy);
  greyDay = mix(greyDay, vec3(0.28, 0.31, 0.36), u_storm);
  greyDay *= 1.0 - u_rain * 0.15;
  vec3 grey = mix(vec3(0.07, 0.08, 0.11), greyDay, day);
  sky = mix(sky, mix(grey * 1.08, grey * 0.9, uv.y), over * 0.85);

  // ---- estrelas em duas camadas (pequenas e densas + poucas e brilhantes)
  float starVis = (1.0 - day) * (1.0 - over) * smoothstep(0.15, 0.55, uv.y);
  for (int l = 0; l < 2; l++) {
    float sc = l == 0 ? 140.0 : 55.0;
    vec2 sg = p * sc;
    vec2 cell = floor(sg);
    float sh = hash(cell + float(l) * 17.0);
    vec2 off = vec2(hash(cell + 2.3), hash(cell + 5.9)) * 0.6 + 0.2;
    float size = l == 0 ? 0.09 : 0.14;
    float s = step(l == 0 ? 0.985 : 0.993, sh) * smoothstep(size, 0.0, length(fract(sg) - off));
    s *= 0.55 + 0.45 * sin(u_time * (0.8 + sh * 2.5) + sh * 60.0);
    sky += s * starVis * (l == 0 ? 0.55 : 1.0) * mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.92, 0.82), hash(cell + 9.1));
  }

  // ---- posições: arco que respeita as margens da tela
  vec2 sunP  = vec2(mix(0.12, 0.88, u_sun.x) * asp, 0.1 + 0.5 * sunH);
  vec2 moonP = vec2(mix(0.12, 0.88, u_moon.x) * asp, 0.12 + 0.5 * u_moon.y);
  float ds = length(p - sunP);
  float dm = length(p - moonP);

  float lowSun = 1.0 - smoothstep(0.0, 0.45, sunH);
  vec3 sunCol = mix(vec3(1.0, 0.93, 0.80), vec3(1.0, 0.52, 0.22), lowSun);
  float sunVis = smoothstep(-0.08, 0.04, sunH) * (1.0 - over * 0.92);
  float moonVis = smoothstep(-0.02, 0.1, u_moon.y) * (1.0 - day * 0.85) * (1.0 - over * 0.92);

  vec3 col = sky;

  // ---- SOL: bloom largo + coroa + raios sutis + disco com escurecimento de borda
  float R = u_sunSize;
  float ang = atan(p.y - sunP.y, p.x - sunP.x);
  float rays = 0.5 + 0.5 * sin(ang * 14.0 + sin(ang * 5.0 + u_time * 0.15) * 2.0 + u_time * 0.04);
  rays = pow(rays, 16.0) * exp(-(ds - R) * 9.0) * 0.06;
  float bloom = exp(-ds * 5.0) * 0.28 + exp(-max(ds - R, 0.0) * 24.0) * 0.32 + exp(-max(ds - R, 0.0) * 80.0) * 0.4;
  col += sunCol * (bloom + rays) * sunVis;
  float sd = ds / R;
  float disc = smoothstep(1.0, 1.0 - 1.5 * px / R, sd);
  vec3 discCol = mix(sunCol * 1.05, vec3(1.0, 0.99, 0.95), pow(max(1.0 - sd * sd, 0.0), 0.35));
  col = mix(col, discCol * 1.08, disc * sunVis);

  // ---- LUA: esfera iluminada pela fase, com mares e crateras
  float MR = u_moonSize;
  vec2 mp = (p - moonP) / MR;
  float mr = length(mp);
  // halo proporcional à parte iluminada
  float lit = 0.5 - 0.5 * cos(u_moonPhase * 2.0 * PI);
  col += vec3(0.65, 0.74, 0.95) * (exp(-dm * 7.0) * 0.18 + exp(-max(dm - MR, 0.0) * 30.0) * 0.22) * lit * moonVis;
  if (mr < 1.05) {
    float z = sqrt(max(1.0 - mr * mr, 0.0));
    vec3 n = vec3(mp, z);
    float a = u_moonPhase * 2.0 * PI;
    // hemisfério sul: a parte iluminada da crescente fica à esquerda
    vec3 Ld = normalize(vec3(-sin(a), 0.12, -cos(a)));
    float diff = smoothstep(-0.06, 0.18, dot(n, Ld));
    float maria = smoothstep(0.4, 0.72, fbm(mp * 1.5 + vec2(3.1, 7.4))) * 0.22;
    float detail = fbm(mp * 6.0 + 11.0) * 0.07;
    float cr = craters(mp * 4.2 + 2.0) * 0.08 + craters(mp * 9.0 + 5.0) * 0.035;
    float albedo = clamp(0.9 - maria - detail + cr, 0.45, 1.0) * (0.8 + 0.2 * z);
    vec3 moonCol = vec3(0.94, 0.95, 0.97) * albedo * diff;
    moonCol += vec3(0.10, 0.12, 0.17) * albedo * (1.0 - diff) * 0.22;   // luz cinérea
    float edge = smoothstep(1.0, 1.0 - 1.5 * px / MR, mr);
    col = mix(col, max(moonCol, col * 0.6 * (1.0 - diff)), edge * moonVis);
  }

  // ---- nuvens: fBm com domain warping, duas camadas com parallax
  vec2 q = p * vec2(1.3, 2.2);
  vec2 drift = vec2(u_time * (0.012 + 0.03 * abs(u_wind)) * sign(u_wind + 0.001), 0.0);
  vec2 w = vec2(fbm(q * 0.8 + drift * 0.5), fbm(q * 0.8 + vec2(5.2, 1.3) - drift * 0.3));
  float nn = fbm(q + w * 0.9 + drift);
  float cov = mix(0.62, 0.2, u_cloud);
  float dens = smoothstep(cov, cov + 0.22, nn) * mix(0.6, 1.0, smoothstep(0.0, 0.7, uv.y));
  float n2 = fbm(q * 2.1 - drift * 0.6 + 11.0);
  float dens2 = smoothstep(cov + 0.04, cov + 0.3, n2) * 0.55;
  float D = clamp(dens + dens2 * (1.0 - dens), 0.0, 1.0);

  // iluminação barata: compara a densidade um passo na direção da luz
  vec2 lightP = day > 0.2 ? sunP : moonP;
  vec2 L = normalize(lightP - p + 1e-4);
  float nl = fbm(q + w * 0.9 + drift + L * 0.08);
  float cl = clamp(0.5 + (nn - nl) * 4.0, 0.0, 1.0);

  vec3 cLight = mix(vec3(0.26, 0.29, 0.38), mix(vec3(1.0), sunCol, 0.2 + twi * 0.5), day);
  vec3 cShade = mix(vec3(0.07, 0.08, 0.12), mix(vec3(0.62, 0.67, 0.75), vec3(0.62, 0.50, 0.52), twi), day);
  cShade = mix(cShade, cShade * 0.72, heavy);
  cShade = mix(cShade, cShade * 0.55, u_storm);
  cLight = mix(cLight, cLight * 0.82, heavy);
  cLight = mix(cLight, cLight * 0.7, u_storm * 0.8 + u_rain * 0.2);
  vec3 cloudCol = mix(cShade, cLight, cl * (1.0 - 0.5 * dens));

  col = mix(col, cloudCol, D * 0.95);
  col += sunCol * exp(-ds * 4.0) * D * (1.0 - D) * 0.9 * smoothstep(-0.08, 0.04, sunH);  // borda prateada
  col += vec3(0.7, 0.78, 1.0) * exp(-dm * 6.0) * D * (1.0 - D) * 0.35 * lit * (1.0 - day);
  col = mix(col, grey * 1.1, u_rain * 0.18 * (1.0 - uv.y));                             // névoa da chuva

  // ---- relâmpago ilumina as nuvens por dentro
  float fl = u_flash * (0.35 + 0.65 * exp(-abs(p.x - u_flashX * asp) * 2.0));
  col += vec3(0.75, 0.8, 1.0) * fl * (0.25 + D * 1.1);

  col *= 1.0 - (0.16 * heavy + 0.08 * u_rain) * day;                 // luz geral mais baixa sob céu fechado
  col *= 1.0 - 0.18 * length(uv - 0.5);                              // vinheta
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;       // dither contra banding
  o = vec4(col, 1.0);
}`;

/**
 * Chuva caindo, sem estado: cada gota é um quad (6 vértices) calculado só do índice e do tempo.
 * Física por gota:
 * - diâmetro D sorteado de Marshall-Palmer (Λ vem da taxa de chuva);
 * - velocidade terminal de Atlas et al. (1973);
 * - distância z do observador, com mais gotas ao longe (o volume cresce com z²);
 * - inclinação = vento / velocidade de queda: garoa voa com o vento, gota grande cai reta;
 * - o rastro é o quanto a gota anda durante o tempo de integração do olho (~1/40 s),
 *   e fica mais fraco quanto mais rápido e fino (Garg & Nayar 2006: o brilho depende de
 *   quanto tempo a gota fica sobre cada ponto).
 */
export const RAIN_VS = /* glsl */ `#version 300 es
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform float u_lambda;  // mm⁻¹
uniform float u_windMs;  // m/s
uniform float u_scale;   // px de CSS -> px do canvas
uniform float u_ppm;     // px do canvas por metro a 1 m de distância

out float v_t;
out float v_s;
out float v_a;

float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main() {
  int id = gl_VertexID;
  float drop = float(id / 6);
  int c = id % 6;

  float ha = h1(drop + 0.13);
  float hb = h1(drop * 1.71 + 4.1);
  float he = h1(drop * 2.37 + 9.7);
  float hf = h1(drop * 3.11 + 2.9);

  // diâmetro: exponencial truncada entre 0,3 e 5,5 mm
  float lo = exp(-u_lambda * 0.3), hi = exp(-u_lambda * 5.5);
  float D = -log(lo - he * (lo - hi)) / u_lambda;
  float v = max(9.65 - 10.3 * exp(-0.6 * D), 2.2 * min(D, 0.5));   // m/s

  float z = mix(0.8, 25.0, pow(hf, 1.25));                          // m
  float s = u_ppm / z;                                              // px por metro nessa distância
  float vpx = v * s;

  float H = u_res.y * 1.3;
  float y = fract(hb - u_time * vpx / H);                           // 1 = topo, 0 = base
  float slope = u_windMs / v;
  float fall = (1.0 - y) * H;
  float x0 = mix(-max(slope, 0.0) * H, u_res.x - min(slope, 0.0) * H, ha);
  vec2 head = vec2(x0 + slope * fall, y * H - 0.15 * u_res.y);

  vec2 dir = normalize(vec2(slope, -1.0));
  float len = max(vpx / 22.0, 1.5 * u_scale);   // o olho integra ~45 ms
  float wid = max(D * 0.001 * s, 0.55 * u_scale);
  vec2 tail = head - dir * len;
  vec2 side = vec2(-dir.y, dir.x) * wid * 0.5;

  float t = (c == 2 || c == 3 || c == 5) ? 1.0 : 0.0;
  float sd = (c == 1 || c == 4 || c == 5) ? 1.0 : -1.0;
  vec2 pos = mix(tail, head, t) + side * sd;

  gl_Position = vec4(pos / u_res * 2.0 - 1.0, 0.0, 1.0);
  v_t = t;
  v_s = sd;
  // gotas maiores e mais próximas aparecem mais; o ar úmido apaga as distantes
  v_a = (0.16 + 0.5 * smoothstep(0.3, 2.5, D)) * (0.3 + 0.7 * exp(-z / 10.0));
}`;

export const RAIN_FS = /* glsl */ `#version 300 es
precision mediump float;
in float v_t;
in float v_s;
in float v_a;
uniform float u_flash;
uniform vec3 u_color;   // a gota reflete o céu em volta: clara de dia, apagada à noite
out vec4 o;
void main() {
  float a = v_a * v_t * (0.4 + 0.6 * (1.0 - abs(v_s)));
  vec3 c = u_color * (1.0 + u_flash * 1.5);
  o = vec4(c * a, a);
}`;

/* ------------------------------------------------------------------ gotas no vidro
 * Arquitetura:
 * 1. as gotas simuladas em JS são desenhadas como sprites numa textura de normais;
 * 2. gotículas finas se acumulam numa textura persistente;
 * 3. a névoa do vidro se acumula noutra; as gotas apagam as duas por onde passam;
 * 4. o passe final refrata a cena usando essas texturas.
 */

/** Sprite de gota: um quad por instância (x, y, largura, altura, tamanho). */
export const DROP_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec4 a_drop;
layout(location = 1) in float a_size;
uniform vec2 u_res;
out vec2 v_uv;
out float v_size;
void main() {
  int c = gl_VertexID;
  vec2 corner = vec2((c == 1 || c == 2 || c == 4) ? 1.0 : -1.0, (c == 2 || c == 4 || c == 5) ? 1.0 : -1.0);
  vec2 pos = a_drop.xy + corner * a_drop.zw * 0.5;
  gl_Position = vec4(pos / u_res * 2.0 - 1.0, 0.0, 1.0);
  v_uv = corner;
  v_size = a_size;
}`;

/** Gotículas geradas na GPU, posições sorteadas por instância. */
export const DROPLET_VS = /* glsl */ `#version 300 es
uniform vec2 u_res;
uniform float u_seed;
uniform vec2 u_sizeRange;
out vec2 v_uv;
out float v_size;
float h(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  int c = gl_VertexID;
  vec2 corner = vec2((c == 1 || c == 2 || c == 4) ? 1.0 : -1.0, (c == 2 || c == 4 || c == 5) ? 1.0 : -1.0);
  float id = float(gl_InstanceID) + 1.0;
  vec2 center = vec2(h(id * 12.9898 + u_seed), h(id * 78.233 + u_seed * 1.37)) * u_res;
  float s = mix(u_sizeRange.x, u_sizeRange.y, pow(h(id * 3.71 + u_seed * 2.13), 2.0));
  gl_Position = vec4((center + corner * s * 0.5) / u_res * 2.0 - 1.0, 0.0, 1.0);
  v_uv = corner;
  v_size = 0.04;
}`;

/** Normal da cúpula (rg), tamanho (b) e densidade (a), com alfa pré-multiplicado. */
export const DROP_FS = /* glsl */ `#version 300 es
precision mediump float;
in vec2 v_uv;
in float v_size;
out vec4 o;
void main() {
  float r2 = dot(v_uv, v_uv);
  if (r2 > 1.0) discard;
  float a = 1.0 - r2;
  vec2 enc = 0.5 + 0.5 * v_uv;
  o = vec4(enc * a, v_size * a, a);
}`;

/** Por onde a gota passa, apaga gotículas e névoa. */
export const ERASE_FS = /* glsl */ `#version 300 es
precision mediump float;
in vec2 v_uv;
in float v_size;
out vec4 o;
void main() {
  float r2 = dot(v_uv, v_uv);
  if (r2 > 1.0) discard;
  o = vec4(0.0, 0.0, 0.0, smoothstep(0.2, 0.5, 1.0 - r2));
}`;

/** Quad de tela cheia com uma cor fixa (acumular ou esmaecer texturas). */
export const FILL_FS = /* glsl */ `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 o;
void main() { o = u_color; }`;

/** Passe final: refração pelas gotas, vidro embaçado e reflexo do sol na lente. */
export const GLASS_FS = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_scene;
uniform sampler2D u_drops;
uniform sampler2D u_droplets;
uniform sampler2D u_mist;
uniform vec2  u_res;
uniform float u_glass;    // 0..1 liga/desliga o efeito de vidro
uniform vec2  u_sunUV;
uniform float u_sunVis;
uniform float u_flare;
uniform float u_flash;

out vec4 o;

vec3 scene(vec2 uv) { return texture(u_scene, clamp(uv, 0.0, 1.0)).rgb; }

vec3 blur(vec2 uv, float r) {
  vec2 px = r / u_res;
  vec3 c = scene(uv) * 0.2;
  c += scene(uv + vec2( px.x,  px.y)) * 0.1;
  c += scene(uv + vec2(-px.x,  px.y)) * 0.1;
  c += scene(uv + vec2( px.x, -px.y)) * 0.1;
  c += scene(uv + vec2(-px.x, -px.y)) * 0.1;
  c += scene(uv + vec2( px.x * 2.0, 0.0)) * 0.1;
  c += scene(uv + vec2(-px.x * 2.0, 0.0)) * 0.1;
  c += scene(uv + vec2(0.0,  px.y * 2.0)) * 0.1;
  c += scene(uv + vec2(0.0, -px.y * 2.0)) * 0.1;
  return c;
}

vec3 ghost(vec2 uv, vec2 pos, float r, vec3 tint, float asp) {
  vec2 q = (uv - pos) * vec2(asp, 1.0);
  float hex = max(abs(q.x) * 0.866 + abs(q.y) * 0.5, abs(q.y));
  float body = smoothstep(r, r * 0.75, hex);
  float rim = smoothstep(r, r * 0.92, hex) * smoothstep(r * 0.7, r * 0.9, hex);
  return tint * (body * 0.5 + rim * 0.8);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float asp = u_res.x / u_res.y;

  // ---- vidro embaçado: a névoa acumulada desfoca e clareia o fundo
  float mist = texture(u_mist, uv).r * u_glass;
  vec3 col = scene(uv);
  if (mist > 0.003) col = mix(col, blur(uv, 6.0) * 0.96 + 0.025, clamp(mist, 0.0, 1.0));

  // ---- gotas: a mais densa entre gota grande e gotícula define a normal
  vec4 rd = texture(u_drops, uv);
  vec4 dl = texture(u_droplets, uv);
  float a = max(rd.a, dl.a);
  float mask = smoothstep(0.3, 0.42, a) * u_glass;

  vec2 toSun = (u_sunUV - uv) * vec2(asp, 1.0);
  float ds = length(toSun);

  // o reflexo só aparece se o sol estiver realmente à vista na cena
  float lum = dot(scene(u_sunUV), vec3(0.3, 0.59, 0.11));
  bool onScreen = all(greaterThan(u_sunUV, vec2(-0.05))) && all(lessThan(u_sunUV, vec2(1.05)));
  float fv = onScreen ? smoothstep(0.8, 0.97, lum) * u_sunVis * u_flare : 0.0;

  if (mask > 0.001) {
    vec3 comp = rd.a >= dl.a ? rd.rgb / max(rd.a, 1e-4) : dl.rgb / max(dl.a, 1e-4);
    vec2 n = (comp.xy - 0.5) * 2.0;          // -1..1
    float sz = comp.z;

    // lente: amostra o lado oposto, invertendo e ampliando o que está atrás
    // o deslocamento cresce com o tamanho: gotícula quase não distorce, gota grande inverte a cena
    vec2 ruv = uv - n * (0.004 + sz * 0.2) * vec2(1.0 / asp, 1.0);
    vec3 inside = blur(ruv, 0.8) * 1.04 + 0.01;

    vec3 N = normalize(vec3(n * 0.85, sqrt(max(0.08, 1.0 - dot(n, n) * 0.72))));
    vec3 Ld = normalize(mix(vec3(-0.45, 0.85, 1.0), vec3(normalize(toSun + 1e-4), 0.7), step(0.001, fv)));
    float lam = clamp(dot(N, Ld), 0.0, 1.0);
    float shade = smoothstep(0.02, 0.4, sz);                       // gotícula quase não tem sombra
    inside *= 1.0 - shade * (0.1 - 0.14 * lam);                   // lado de sombra
    inside *= 1.0 - smoothstep(0.78, 1.0, length(n)) * (0.08 + 0.24 * shade);   // borda fina
    float spec = pow(max(dot(N, normalize(Ld + vec3(0.0, 0.0, 1.0))), 0.0), 80.0);
    inside += vec3(1.0, 0.97, 0.9) * spec * (0.4 + fv * 2.2 * exp(-ds * 2.0)) * (0.3 + 0.7 * shade);
    inside += vec3(0.8, 0.85, 1.0) * u_flash * 0.3;

    col = mix(col, inside, mask);
  }

  // ---- reflexo do sol na lente
  if (fv > 0.001) {
    vec2 axis = vec2(0.5) - u_sunUV;
    vec3 fl = vec3(0.0);
    fl += ghost(uv, u_sunUV + axis * 0.42, 0.030, vec3(0.35, 0.65, 1.0), asp) * 0.07;
    fl += ghost(uv, u_sunUV + axis * 0.78, 0.060, vec3(0.45, 1.0, 0.7), asp) * 0.035;
    fl += ghost(uv, u_sunUV + axis * 1.22, 0.018, vec3(1.0, 0.75, 0.35), asp) * 0.16;
    fl += ghost(uv, u_sunUV + axis * 1.55, 0.095, vec3(0.65, 0.55, 1.0), asp) * 0.025;
    fl += ghost(uv, u_sunUV + axis * 1.95, 0.042, vec3(1.0, 0.55, 0.45), asp) * 0.07;
    fl += vec3(exp(-pow((ds - 0.300) * 30.0, 2.0)),
               exp(-pow((ds - 0.308) * 30.0, 2.0)),
               exp(-pow((ds - 0.316) * 30.0, 2.0))) * 0.045;
    fl += vec3(1.0, 0.95, 0.85) * exp(-ds * 3.2) * 0.07;
    fl += vec3(0.75, 0.85, 1.0) * exp(-abs(toSun.y) * 220.0) * exp(-abs(toSun.x) * 3.5) * 0.06;
    col += fl * fv * (1.0 - mist * 0.6);
  }

  o = vec4(col, 1.0);
}`;
