/**
 * Física da chuva usada pela engine. Todas as fórmulas vêm da literatura:
 *
 * - Distribuição de tamanhos: Marshall & Palmer (1948)
 *     N(D) = N0 · e^(−ΛD),  N0 = 8000 m⁻³ mm⁻¹,  Λ = 4,1 · R^−0,21 mm⁻¹  (R em mm/h)
 * - Velocidade terminal: Atlas et al. (1973), ajuste às medições de Gunn & Kinzer (1949)
 *     v(D) = 9,65 − 10,3 · e^(−0,6D)  m/s  (D em mm)
 * - Gota parada num vidro inclinado: balanço de Furmidge (1962)
 *     ρ g V = w γ (cos θr − cos θa)
 *   com a gota como calota esférica de ângulo de contato θ: V ≈ π a³ θ / 4.
 * - Gota escorrendo: começa a andar acima de um Bond crítico e a velocidade cresce
 *   linearmente com o excesso (Le Grand, Daerr & Limat, 2005). Acima de uma velocidade
 *   crítica a traseira vira cúspide e solta "pérolas" (Podgorski, Flesselles & Limat, 2001).
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Inclinação Λ da distribuição de Marshall-Palmer (mm⁻¹). */
export function mpLambda(rainRate: number) {
  return 4.1 * Math.pow(Math.max(rainRate, 0.02), -0.21);
}

/** Concentração total de gotas no ar (m⁻³). */
export function dropConcentration(rainRate: number) {
  return 8000 / mpLambda(rainRate);
}

/** Velocidade terminal (m/s) para diâmetro D (mm). Abaixo de ~0,5 mm usa um limite linear. */
export function terminalVelocity(D: number) {
  return Math.max(9.65 - 10.3 * Math.exp(-0.6 * D), 2.2 * Math.min(D, 0.5));
}

/** Sorteia um diâmetro (mm) da distribuição, truncada entre min e max. */
export function sampleDiameter(rainRate: number, min = 0.1, max = 6) {
  const l = mpLambda(rainRate);
  const a = Math.exp(-l * min), b = Math.exp(-l * max);
  return -Math.log(a - Math.random() * (a - b)) / l;
}

/** Fração das gotas com diâmetro maior que D. */
export function fractionAbove(rainRate: number, D: number) {
  return Math.exp(-mpLambda(rainRate) * D);
}

/**
 * Intensidade 0..1 da engine ⇄ taxa de chuva em mm/h (escala logarítmica).
 * 0,2 ≈ 0,4 mm/h (garoa) · 0,5 ≈ 2 mm/h (fraca) · 0,65 ≈ 5 mm/h (moderada)
 * 0,85 ≈ 13 mm/h (forte) · 1 ≈ 30 mm/h (muito forte).
 */
export function rainRateFromIntensity(intensity: number) {
  return intensity <= 0.02 ? 0 : 0.15 * Math.pow(10, intensity * 2.3);
}

export function intensityFromRainRate(rate: number) {
  return rate <= 0.05 ? 0 : clamp01(Math.log10(rate / 0.15) / 2.3);
}

/** Classificação usual da intensidade (mm/h). */
export function rainCategory(rate: number) {
  if (rate <= 0) return "sem chuva";
  if (rate < 1) return "garoa";
  if (rate < 2.5) return "fraca";
  if (rate < 7.6) return "moderada";
  if (rate < 50) return "forte";
  return "violenta";
}

// ------------------------------------------------------------------ gotas no vidro

export interface GlassProps {
  /** Ângulo de contato de equilíbrio (graus). Vidro comum: ~30°. */
  contactAngle: number;
  /** Ângulos de avanço e recuo (graus). A diferença (histerese) é o que segura a gota. */
  advancing: number;
  receding: number;
}

export const WINDOW_GLASS: GlassProps = { contactAngle: 30, advancing: 40, receding: 20 };

const RHO = 1000;      // kg/m³
const G = 9.81;        // m/s²
const GAMMA = 0.072;   // tensão superficial da água, N/m

/** Fator k da calota: V = k · a³ (a = raio da base). */
export function capFactor(glass: GlassProps) {
  return (Math.PI * (glass.contactAngle * Math.PI / 180)) / 4;
}

/** Raio da base (mm) de uma gota de volume V (mm³) pousada no vidro. */
export function footprintRadius(volume: number, glass = WINDOW_GLASS) {
  return Math.cbrt(Math.max(volume, 0) / capFactor(glass));
}

/** Volume (mm³) de uma gota de chuva esférica de diâmetro D (mm). */
export function sphereVolume(D: number) {
  return (Math.PI / 6) * D * D * D;
}

/**
 * Raio crítico da base (mm) acima do qual a gota escorre num vidro vertical.
 * Para vidro comum dá ≈ 2,5 mm (≈ 6 µL), coerente com experimentos em que gotas
 * de poucos µL não escorregam nem com a superfície a 90°.
 */
export function criticalFootprint(glass = WINDOW_GLASS) {
  const hyst = Math.cos(glass.receding * Math.PI / 180) - Math.cos(glass.advancing * Math.PI / 180);
  const a = Math.sqrt((2 * GAMMA * hyst) / (RHO * G * capFactor(glass)));
  return a * 1000;
}
