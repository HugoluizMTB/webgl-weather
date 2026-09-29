import type { WeatherParams } from "../engine/WeatherEngine";
import { intensityFromRainRate } from "../engine/rainPhysics";

/**
 * Open-Meteo: gratuito para uso não comercial, sem chave, com CORS liberado.
 * Para uso comercial há um plano com chave (customer-api.open-meteo.com).
 */
const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

const CURRENT = [
  "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day",
  "precipitation", "weather_code", "cloud_cover", "cloud_cover_low", "cloud_cover_mid",
  "cloud_cover_high", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "visibility",
] as const;

const DAILY = [
  "temperature_2m_max", "temperature_2m_min", "sunrise", "sunset",
  "uv_index_max", "precipitation_probability_max",
] as const;

/** Dados normalizados que o app usa. */
export interface LiveWeather {
  temp: number;
  feelsLike: number;
  humidity: number;        // %
  precipitation: number;   // mm
  code: number;            // código WMO
  isDay: boolean;
  cloudCover: number;      // %
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  windSpeed: number;       // km/h
  windDirection: number;   // graus, de onde o vento vem
  windGusts: number;       // km/h
  visibility: number;      // m
  hi: number;
  lo: number;
  uvMax: number;
  rainChance: number;      // %
  sunrise: number;         // hora local decimal
  sunset: number;
  timezone: string;
  utcOffsetSeconds: number;
  fetchedAt: number;
}

export async function fetchWeather(lat: number, lon: number, signal?: AbortSignal): Promise<LiveWeather> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lon.toFixed(4));
  url.searchParams.set("current", CURRENT.join(","));
  url.searchParams.set("daily", DAILY.join(","));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
  const j = await res.json();
  const c = j.current;
  const d = j.daily;

  return {
    temp: c.temperature_2m,
    feelsLike: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    precipitation: c.precipitation ?? 0,
    code: c.weather_code,
    isDay: c.is_day === 1,
    cloudCover: c.cloud_cover ?? 0,
    cloudLow: c.cloud_cover_low ?? 0,
    cloudMid: c.cloud_cover_mid ?? 0,
    cloudHigh: c.cloud_cover_high ?? 0,
    windSpeed: c.wind_speed_10m ?? 0,
    windDirection: c.wind_direction_10m ?? 0,
    windGusts: c.wind_gusts_10m ?? 0,
    visibility: c.visibility ?? 10000,
    hi: d.temperature_2m_max?.[0],
    lo: d.temperature_2m_min?.[0],
    uvMax: d.uv_index_max?.[0] ?? 0,
    rainChance: d.precipitation_probability_max?.[0] ?? 0,
    sunrise: isoToHour(d.sunrise?.[0], 5.5),
    sunset: isoToHour(d.sunset?.[0], 17.75),
    timezone: j.timezone,
    utcOffsetSeconds: j.utc_offset_seconds ?? 0,
    fetchedAt: Date.now(),
  };
}

/** "2026-09-28T05:13" -> 5.216 */
function isoToHour(iso: string | undefined, fallback: number) {
  const m = iso?.match(/T(\d{2}):(\d{2})/);
  return m ? Number(m[1]) + Number(m[2]) / 60 : fallback;
}

/** Hora local decimal no fuso do lugar, independente do fuso do aparelho. */
export function localHourAt(utcOffsetSeconds: number, now = Date.now()) {
  const d = new Date(now + utcOffsetSeconds * 1000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

// ------------------------------------------------------------------ códigos WMO

type CodeInfo = { label: string; rain?: number; storm?: number; minCloud?: number };

const WMO: Record<number, CodeInfo> = {
  0: { label: "Clear" },
  1: { label: "Mostly clear" },
  2: { label: "Partly cloudy" },
  3: { label: "Cloudy", minCloud: 0.92 },
  45: { label: "Fog", minCloud: 0.9 },
  48: { label: "Freezing fog", minCloud: 0.9 },
  51: { label: "Light drizzle", rain: 0.12, minCloud: 0.75 },
  53: { label: "Drizzle", rain: 0.2, minCloud: 0.8 },
  55: { label: "Heavy drizzle", rain: 0.3, minCloud: 0.85 },
  56: { label: "Freezing drizzle", rain: 0.15, minCloud: 0.8 },
  57: { label: "Freezing drizzle", rain: 0.3, minCloud: 0.85 },
  61: { label: "Light rain", rain: 0.35, minCloud: 0.8 },
  63: { label: "Rain", rain: 0.6, minCloud: 0.9 },
  65: { label: "Heavy rain", rain: 0.9, minCloud: 0.97, storm: 0.3 },
  66: { label: "Freezing rain", rain: 0.4, minCloud: 0.85 },
  67: { label: "Heavy freezing rain", rain: 0.8, minCloud: 0.95 },
  71: { label: "Light snow", minCloud: 0.85 },
  73: { label: "Snow", minCloud: 0.9 },
  75: { label: "Heavy snow", minCloud: 0.95 },
  77: { label: "Snow grains", minCloud: 0.85 },
  80: { label: "Light showers", rain: 0.4, minCloud: 0.6 },
  81: { label: "Showers", rain: 0.65, minCloud: 0.7 },
  82: { label: "Heavy showers", rain: 1, minCloud: 0.85, storm: 0.35 },
  85: { label: "Snow showers", minCloud: 0.8 },
  86: { label: "Heavy snow showers", minCloud: 0.9 },
  95: { label: "Thunderstorm", rain: 0.75, storm: 0.85, minCloud: 0.95 },
  96: { label: "Thunderstorm with hail", rain: 0.85, storm: 1, minCloud: 1 },
  99: { label: "Thunderstorm with heavy hail", rain: 0.95, storm: 1, minCloud: 1 },
};

export function conditionLabel(code: number) {
  return WMO[code]?.label ?? "Unknown conditions";
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Converte a resposta da API em parâmetros físicos da engine.
 * Usa os números contínuos (cobertura, mm, vento) e o código WMO como piso,
 * então o céu reage a variações que o código sozinho não mostraria.
 */
export function toSkyParams(w: LiveWeather): Omit<WeatherParams, "hour"> & { sunrise: number; sunset: number } {
  const info = WMO[w.code] ?? { label: "" };

  // nuvens baixas pesam mais: são as que escurecem o céu
  const weighted = (w.cloudLow * 1 + w.cloudMid * 0.75 + w.cloudHigh * 0.35) / 100;
  const cloud = clamp01(Math.max(w.cloudCover / 100 * 0.85 + weighted * 0.15, info.minCloud ?? 0));

  // a condição atual do Open-Meteo vem de dados de 15 min: a soma do período × 4 ≈ mm/h
  const rainFromMm = intensityFromRainRate(w.precipitation * 4);
  const rain = clamp01(Math.max(info.rain ?? 0, rainFromMm));

  const gustStorm = clamp01((w.windGusts - 55) / 40) * 0.3;
  const storm = clamp01(Math.max(info.storm ?? 0, gustStorm));

  // direção meteorológica = de onde vem; o movimento é para o lado oposto.
  // Leste fica à direita da tela.
  const eastward = -Math.sin((w.windDirection * Math.PI) / 180);
  // a engine usa 1 = 12 m/s; a API manda km/h
  const strength = clamp01(w.windSpeed / 3.6 / 12);
  const wind = Math.max(-1, Math.min(1, eastward * Math.max(strength, 0.08)));

  return { cloud, rain, storm, wind, sunrise: w.sunrise, sunset: w.sunset };
}
