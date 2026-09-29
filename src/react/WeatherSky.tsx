import { useEffect, useRef, type CSSProperties } from "react";
import { WeatherEngine, type EngineOptions, type WeatherParams } from "../engine/WeatherEngine";
import { PRESETS, type Condition } from "../engine/presets";

export interface WeatherSkyProps extends EngineOptions {
  /** Condição pronta. Pode ser sobrescrita pelos parâmetros abaixo. */
  condition?: Condition;
  /** Hora local 0..24. Padrão: hora atual. */
  hour?: number;
  cloud?: number;
  rain?: number;
  storm?: number;
  wind?: number;
  /** Sobrescrevem a posição calculada pela hora (0..1 no eixo X, -1..1 na elevação). */
  sunX?: number;
  sunY?: number;
  moonX?: number;
  moonY?: number;
  /** Raios em fração da altura da tela. */
  sunSize?: number;
  moonSize?: number;
  /** 0 nova, 0.25 crescente, 0.5 cheia, 0.75 minguante. Padrão: fase real de hoje. */
  moonPhase?: number;
  /** Nascer e pôr do sol em horas locais (ex.: vindos da API). */
  sunrise?: number;
  sunset?: number;
  /** Gotas no vidro, 0..1. */
  glass?: number;
  /** Reflexo do sol na lente, 0..1. */
  flare?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Fundo de clima animado. O React só repassa parâmetros:
 * o loop de animação vive dentro da engine e nunca causa re-render.
 */
export function WeatherSky({
  condition = "clear", hour, cloud, rain, storm, wind,
  sunX, sunY, moonX, moonY, sunSize, moonSize, moonPhase, sunrise, sunset, glass, flare,
  className, style, ...options
}: WeatherSkyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WeatherEngine | null>(null);

  // cria uma vez; as opções da engine só valem na montagem
  useEffect(() => {
    const engine = new WeatherEngine(canvasRef.current!, options);
    engineRef.current = engine;
    return () => { engine.destroy(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const now = new Date();
    const params: Partial<WeatherParams> = {
      ...PRESETS[condition],
      hour: hour ?? now.getHours() + now.getMinutes() / 60,
    };
    if (cloud !== undefined) params.cloud = cloud;
    if (rain !== undefined) params.rain = rain;
    if (storm !== undefined) params.storm = storm;
    if (wind !== undefined) params.wind = wind;
    Object.assign(params, strip({ sunX, sunY, moonX, moonY, sunSize, moonSize, moonPhase, sunrise, sunset, glass, flare }));
    engineRef.current?.set(params);
  }, [condition, hour, cloud, rain, storm, wind, sunX, sunY, moonX, moonY, sunSize, moonSize, moonPhase, sunrise, sunset, glass, flare]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    />
  );
}

function strip<T extends Record<string, number | undefined>>(o: T) {
  const out: Partial<Record<keyof T, number>> = {};
  for (const k in o) if (o[k] !== undefined) out[k] = o[k] as number;
  return out;
}
