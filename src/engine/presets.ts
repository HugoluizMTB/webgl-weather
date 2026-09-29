import type { WeatherParams } from "./WeatherEngine";

/** Condições que acontecem em Recife, traduzidas em parâmetros da engine. */
export const PRESETS = {
  clear:   { cloud: 0.08, rain: 0,    storm: 0,   wind: 0.25 },
  partly:  { cloud: 0.45, rain: 0,    storm: 0,   wind: 0.3 },
  cloudy:  { cloud: 0.95, rain: 0,    storm: 0,   wind: 0.3 },
  drizzle: { cloud: 0.8,  rain: 0.22, storm: 0,   wind: 0.2 },
  showers: { cloud: 0.6,  rain: 0.5,  storm: 0,   wind: 0.35 },
  rain:    { cloud: 0.92, rain: 0.65, storm: 0.1, wind: 0.3 },
  heavy:   { cloud: 1,    rain: 1,    storm: 0.35, wind: 0.4 },
  storm:   { cloud: 1,    rain: 0.85, storm: 1,   wind: 0.55 },
} satisfies Record<string, Omit<WeatherParams, "hour">>;

export type Condition = keyof typeof PRESETS;
