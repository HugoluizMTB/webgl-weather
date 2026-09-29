import type { CSSProperties } from "react";

export interface Typography {
  /** Família da temperatura e da cidade. */
  display: string;
  /** Família da condição e da linha de máx./mín. */
  text: string;
  /** Peso da temperatura. */
  tempWeight: number;
  /** Peso do nome da cidade. */
  cityWeight: number;
  /** Peso da condição e de máx./mín. */
  labelWeight: number;
  /** Faixa de pesos que a fonte de display suporta. */
  weightRange: [number, number];
  /** Multiplica todos os tamanhos. */
  scale: number;
  /** Espaçamento entre letras da temperatura, em em. */
  tracking: number;
  /** Força da sombra que garante leitura sobre céu claro, 0..1. */
  shadow: number;
  align: "center" | "left";
}

const SYSTEM = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", Roboto, sans-serif`;

/**
 * Pares tipográficos prontos. As fontes precisam estar carregadas na página
 * (veja o README para o link do Google Fonts).
 */
export const TYPE_PRESETS = {
  nativa: {
    label: "Native",
    display: SYSTEM, text: SYSTEM,
    tempWeight: 200, cityWeight: 400, labelWeight: 500, weightRange: [100, 900],
    tracking: -0.04,
  },
  moderna: {
    label: "Modern",
    display: `"Manrope", ${SYSTEM}`, text: `"Manrope", ${SYSTEM}`,
    tempWeight: 300, cityWeight: 500, labelWeight: 600, weightRange: [200, 800],
    tracking: -0.06,
  },
  geometrica: {
    label: "Geometric",
    display: `"Outfit", ${SYSTEM}`, text: `"Outfit", ${SYSTEM}`,
    tempWeight: 200, cityWeight: 400, labelWeight: 500, weightRange: [100, 900],
    tracking: -0.06,
  },
  editorial: {
    label: "Editorial",
    display: `"Fraunces", Georgia, serif`, text: `"Manrope", ${SYSTEM}`,
    tempWeight: 300, cityWeight: 400, labelWeight: 600, weightRange: [100, 900],
    tracking: -0.04,
  },
  grotesca: {
    label: "Grotesque",
    display: `"Bricolage Grotesque", ${SYSTEM}`, text: `"Bricolage Grotesque", ${SYSTEM}`,
    tempWeight: 300, cityWeight: 500, labelWeight: 500, weightRange: [200, 800],
    tracking: -0.05,
  },
  expandida: {
    label: "Expanded",
    display: `"Unbounded", ${SYSTEM}`, text: `"Manrope", ${SYSTEM}`,
    tempWeight: 300, cityWeight: 400, labelWeight: 600, weightRange: [200, 900],
    tracking: -0.07,
  },
} satisfies Record<string, Omit<Typography, "scale" | "shadow" | "align"> & { label: string }>;

export type TypePreset = keyof typeof TYPE_PRESETS;

export function typographyFrom(preset: TypePreset, overrides: Partial<Typography> = {}): Typography {
  const { label: _label, ...base } = TYPE_PRESETS[preset];
  return { scale: 1, shadow: 0.5, align: "center", ...base, ...overrides };
}

export interface WeatherHeaderProps {
  city: string;
  temp: number;
  condition: string;
  hi?: number;
  lo?: number;
  typography?: Partial<Typography> & { preset?: TypePreset };
  className?: string;
  style?: CSSProperties;
}

export function WeatherHeader({ city, temp, condition, hi, lo, typography = {}, className, style }: WeatherHeaderProps) {
  const { preset = "moderna", ...over } = typography;
  const t = typographyFrom(preset, over);
  const s = t.scale;
  const sh = t.shadow;
  const left = t.align === "left";

  // sombra em camadas: uma curta para o contorno e uma larga para o contraste
  const textShadow = sh > 0
    ? `0 1px 2px rgba(0,0,0,${0.12 * sh}), 0 2px 28px rgba(8,16,36,${0.35 * sh})`
    : "none";

  return (
    <header
      className={className}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: left ? "flex-start" : "center",
        textAlign: left ? "left" : "center",
        padding: left ? `clamp(40px, 8vh, 88px) 28px 0` : `clamp(44px, 10vh, 104px) 16px 0`,
        color: "#fff",
        textShadow,
        fontFeatureSettings: '"tnum" 1, "lnum" 1',
        WebkitFontSmoothing: "antialiased",
        ...style,
      }}
    >
      <h1 style={{
        margin: 0,
        fontFamily: t.display,
        fontWeight: t.cityWeight,
        fontSize: `${2.05 * s}rem`,
        letterSpacing: "-0.01em",
        lineHeight: 1.1,
      }}>
        {city}
      </h1>

      <p
        aria-label={`${temp} degrees`}
        style={{
          position: "relative",
          margin: 0,
          fontFamily: t.display,
          fontWeight: t.tempWeight,
          fontSize: `clamp(${5.6 * s}rem, ${22 * s}vw, ${8.75 * s}rem)`,
          letterSpacing: `${t.tracking}em`,
          lineHeight: 1,
          fontVariationSettings: t.display.includes("Fraunces") ? '"opsz" 144, "SOFT" 50' : undefined,
        }}
      >
        {temp}
        <span aria-hidden="true" style={{
          // o grau fica fora do fluxo; no modo centralizado o número continua no centro óptico
          position: left ? "relative" : "absolute",
          left: left ? undefined : "100%",
          top: left ? undefined : 0,
          marginLeft: "0.02em",
          letterSpacing: 0,
        }}>°</span>
      </p>

      <p style={{
        margin: `${4 * s}px 0 0`,
        fontFamily: t.text,
        fontWeight: t.labelWeight,
        fontSize: `${1.2 * s}rem`,
        opacity: 0.82,
      }}>
        {condition}
      </p>

      {(hi !== undefined || lo !== undefined) && (
        <p style={{
          display: "flex",
          gap: "0.8em",
          margin: `${2 * s}px 0 0`,
          fontFamily: t.text,
          fontWeight: t.labelWeight,
          fontSize: `${1.2 * s}rem`,
        }}>
          {hi !== undefined && <span>H:{hi}°</span>}
          {lo !== undefined && <span>L:{lo}°</span>}
        </p>
      )}
    </header>
  );
}
