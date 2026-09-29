/**
 * Gotas no vidro, em unidades físicas (volume em mm³, tamanho em mm, velocidade em mm/s).
 *
 * Simulação na CPU; as gotas são desenhadas como normais numa textura e
 * refratadas no shader.
 *
 * Física (ver rainPhysics.ts):
 * - cada impacto traz uma gota com diâmetro sorteado de Marshall-Palmer;
 *   no vidro ela vira uma calota de raio a ≈ 1,09·D;
 * - abaixo do raio crítico (≈ 2,5 mm no vidro comum) a histerese segura a gota;
 * - acima dele, a gota escorre com velocidade proporcional ao excesso
 *   (Le Grand, Daerr & Limat 2005) e pode ficar presa em imperfeições do vidro
 *   até crescer mais (é o "anda-para" das gotas reais);
 * - rápida o bastante, solta pérolas pela traseira (Podgorski et al. 2001);
 * - varre as gotículas do caminho e cresce com elas;
 * - gotas que se encostam se fundem, somando volume.
 * Coordenadas em pixels do canvas, y para cima.
 */

import { footprintRadius, criticalFootprint, sampleDiameter, sphereVolume, WINDOW_GLASS } from "./rainPhysics";

export interface RainOptions {
  /** Taxa de chuva (mm/h); 0 = não está chovendo. */
  rainRate: number;
  /** Impactos por segundo de gotas grandes o bastante para simular. */
  impactsPerSecond: number;
  /** Menor diâmetro simulado (mm); as menores viram gotículas na textura. */
  minDiameter: number;
  spawnLimit: number;
  /** Vento horizontal (m/s, positivo para a direita). */
  windMs: number;
  /** Pixels do canvas por milímetro de vidro. */
  mmToPx: number;
  /** Molhado do vidro 0..1: quanta água as gotas recolhem ao escorrer. */
  wetness: number;
  /** Evaporação: mm³ perdidos por segundo por mm² de base. */
  evaporation: number;
  /** Chance de ficar presa por mm percorrido (sujeira e riscos do vidro). */
  pinning: number;
}

const rr = (a: number, b: number) => a + Math.random() * (b - a);

/** Raio crítico da base no vidro comum (mm). */
export const CRITICAL_A = criticalFootprint(WINDOW_GLASS);
/** mm/s de velocidade por unidade de excesso acima do crítico. */
const SPEED_PER_EXCESS = 90;
const MAX_SPEED = 320;
/** Acima disto a traseira vira cúspide e solta pérolas (mm/s). */
const PEARLING_SPEED = 45;

export class Drop {
  x: number;
  y: number;
  vol: number;
  a = 0;
  /** mm/s para baixo. */
  speed = 0;
  /** Achatamento do impacto, some em frações de segundo. */
  spread = 0.25;
  dead = false;
  parent: Drop | null = null;
  /** Presa numa imperfeição até o excesso passar deste valor. */
  private pinnedUntil = -1;
  private seed = Math.random() * 100;
  private toPearl: number;

  constructor(private sim: RainSimulator, x: number, y: number, vol: number) {
    this.x = x; this.y = y; this.vol = vol;
    this.a = footprintRadius(vol);
    this.toPearl = rr(2, 5);
  }

  get width() { return this.a * this.sim.options.mmToPx * 2.6 * (1 + this.spread); }
  get height() {
    // corre esticada: vira oval e ganha ponta na traseira
    const stretch = 1 + Math.min(this.speed / 260, 0.55);
    return this.a * this.sim.options.mmToPx * 2.6 * (1 + this.spread * 0.5) * stretch;
  }

  update(dt: number, time: number) {
    const o = this.sim.options;
    const px = o.mmToPx;

    // evaporação proporcional à área de base: as pequenas somem primeiro
    this.vol -= o.evaporation * Math.PI * this.a * this.a * dt;
    if (this.vol < 0.004) { this.dead = true; return; }
    this.a = footprintRadius(this.vol);
    this.spread *= Math.exp(-dt * 6);

    const excess = this.a / CRITICAL_A - 1;

    // presa numa imperfeição: solta quando cresce o bastante
    if (this.pinnedUntil >= 0) {
      if (excess > this.pinnedUntil) this.pinnedUntil = -1;
      else { this.speed = 0; return; }
    }

    const target = excess > 0 ? Math.min(excess * SPEED_PER_EXCESS, MAX_SPEED) : 0;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt / 0.12));
    if (this.speed < 0.5) { this.speed = 0; return; }

    const dist = this.speed * dt;                     // mm
    // o vento empurra de leve para o lado; um serpentear lento vem das imperfeições
    const lateral = o.windMs * 0.035 + Math.sin(time * 0.9 + this.seed) * 0.07 + Math.sin(time * 2.3 + this.seed * 1.7) * 0.04;
    this.x += lateral * dist * px;
    this.y -= dist * px;

    // varre gotículas do caminho e cresce com elas
    this.vol += o.wetness * dist * this.a * 2 * 0.006;

    // imperfeição do vidro: mais fácil prender quem está só um pouco acima do crítico
    if (Math.random() < o.pinning * dist * Math.exp(-excess * 2.5)) {
      this.pinnedUntil = excess + rr(0.05, 0.35);
      this.speed = 0;
      return;
    }

    // pérolas: a cúspide traseira solta gotinhas
    if (this.speed > PEARLING_SPEED) {
      this.toPearl -= dist;
      if (this.toPearl <= 0) {
        this.toPearl = rr(1.5, 4) * (PEARLING_SPEED / this.speed + 0.5);
        const pv = this.vol * rr(0.015, 0.05);
        const p = new Drop(this.sim, this.x + rr(-0.2, 0.2) * this.a * px, this.y + this.a * px * 1.1, pv);
        p.spread = 0;
        p.parent = this;
        this.vol -= pv;
        this.sim.add(p);
      }
    }
  }

  merge(other: Drop) {
    const v = this.vol + other.vol;
    this.x = (this.x * this.vol + other.x * other.vol) / v;
    this.y = (this.y * this.vol + other.y * other.vol) / v;
    this.speed = (this.speed * this.vol + other.speed * other.vol) / v;
    this.vol = v;
    this.a = footprintRadius(v);
    this.pinnedUntil = -1;                           // a fusão sacode a gota
  }
}

export class RainSimulator {
  drops: Drop[] = [];
  width = 1;
  height = 1;
  private time = 0;
  private carry = 0;
  private cells = new Map<number, Drop[]>();

  constructor(public options: RainOptions) {}

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.drops = this.drops.filter((d) => d.x >= 0 && d.x <= w && d.y <= h * 1.1);
  }

  clear() { this.drops.length = 0; }

  add(d: Drop) { this.drops.push(d); }

  update(dt: number) {
    const o = this.options;
    this.time += dt;

    if (o.rainRate > 0) {
      this.carry += o.impactsPerSecond * dt;
      while (this.carry >= 1) {
        this.carry -= 1;
        if (this.drops.length >= o.spawnLimit) continue;
        const D = sampleDiameter(o.rainRate, o.minDiameter, 5.5);
        const d = new Drop(this, Math.random() * this.width, Math.random() * this.height, sphereVolume(D));
        this.add(d);
      }
    } else {
      this.carry = 0;
    }

    for (const d of this.drops) {
      if (!d.dead) d.update(dt, this.time);
      const m = 20 * o.mmToPx;
      if (d.y < -m || d.x < -m || d.x > this.width + m) d.dead = true;
    }
    this.collide();

    let w = 0;
    for (const d of this.drops) if (!d.dead) this.drops[w++] = d;
    this.drops.length = w;
    for (const d of this.drops) {
      if (d.parent && (d.parent.dead || Math.abs(d.parent.y - d.y) > d.parent.a * o.mmToPx * 3)) d.parent = null;
    }
  }

  private collide() {
    const px = this.options.mmToPx;
    const cell = Math.max(CRITICAL_A * 2.5 * px, 6);
    const key = (cx: number, cy: number) => (cx * 73856093) ^ (cy * 19349663);
    this.cells.clear();
    for (const d of this.drops) {
      if (d.dead) continue;
      const k = key(Math.floor(d.x / cell), Math.floor(d.y / cell));
      const list = this.cells.get(k);
      if (list) list.push(d); else this.cells.set(k, [d]);
    }
    for (const a of this.drops) {
      if (a.dead) continue;
      const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const list = this.cells.get(key(cx + ox, cy + oy));
          if (!list) continue;
          for (const b of list) {
            if (b === a || b.dead || a.dead) continue;
            if (b.parent === a || a.parent === b) continue;
            const dx = a.x - b.x, dy = a.y - b.y;
            // as bases se tocam
            const lim = (a.a + b.a) * px * 0.95;
            if (dx * dx + dy * dy < lim * lim) {
              if (a.vol >= b.vol) { a.merge(b); b.dead = true; }
              else { b.merge(a); a.dead = true; }
            }
          }
        }
      }
    }
  }
}
