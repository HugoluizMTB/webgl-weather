import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FALLBACK_PLACE, hasGeoPermission, loadSavedPlace, locateApprox, locatePrecise, type Place,
} from "./location";
import { conditionLabel, fetchWeather, localHourAt, toSkyParams, type LiveWeather } from "./openMeteo";

export type LiveStatus = "locating" | "loading" | "ready" | "error";

export interface LiveState {
  status: LiveStatus;
  place: Place | null;
  weather: LiveWeather | null;
  /** Hora local no lugar, atualizada a cada 30 s. */
  hour: number;
  label: string;
  sky: ReturnType<typeof toSkyParams> | null;
  error: string | null;
  /** Pede o GPS. Chame a partir de um clique. */
  requestPreciseLocation: () => Promise<void>;
  refresh: () => void;
}

const REFRESH_MS = 10 * 60 * 1000;

/**
 * Céu ao vivo: descobre onde a pessoa está, busca o clima e mantém tudo atualizado.
 * Ordem: GPS se já houver permissão → último lugar salvo → IP → Recife.
 */
export function useLiveWeather(enabled = true): LiveState {
  const [place, setPlace] = useState<Place | null>(null);
  const [weather, setWeather] = useState<LiveWeather | null>(null);
  const [status, setStatus] = useState<LiveStatus>("locating");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (p: Place) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPlace(p);
    setStatus("loading");
    try {
      const w = await fetchWeather(p.lat, p.lon, ac.signal);
      if (ac.signal.aborted) return;
      setWeather(w);
      setError(null);
      setStatus("ready");
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e instanceof TypeError
        ? "Can't reach the weather service"
        : e instanceof Error ? e.message : "Failed to fetch the weather");
      setStatus("error");
    }
  }, []);

  // descoberta inicial, sem pop-up
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setStatus("locating");
      let p: Place | null = null;
      if (await hasGeoPermission()) {
        try { p = await locatePrecise(); } catch { /* segue para o próximo */ }
      }
      p ??= loadSavedPlace();
      if (!p) {
        try { p = await locateApprox(); } catch { /* segue para o fallback */ }
      }
      if (!cancelled) load(p ?? FALLBACK_PLACE);
    })();
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, [enabled, load]);

  // atualiza o clima periodicamente e ao voltar para a aba
  useEffect(() => {
    if (!enabled || !place) return;
    const id = setInterval(() => load(place), REFRESH_MS);
    const onVis = () => {
      if (!document.hidden && weather && Date.now() - weather.fetchedAt > REFRESH_MS) load(place);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled, place, weather, load]);

  // relógio: o sol anda sozinho
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [enabled]);

  const requestPreciseLocation = useCallback(async () => {
    setStatus("locating");
    try {
      await load(await locatePrecise());
    } catch (e) {
      const denied = (e as GeolocationPositionError)?.code === 1;
      setError(denied ? "Location permission denied" : "Couldn't get GPS location");
      setStatus(weather ? "ready" : "error");
    }
  }, [load, weather]);

  const refresh = useCallback(() => { if (place) load(place); }, [place, load]);

  const hour = useMemo(
    () => (weather ? localHourAt(weather.utcOffsetSeconds, now) : new Date(now).getHours() + new Date(now).getMinutes() / 60),
    [weather, now],
  );
  const sky = useMemo(() => (weather ? toSkyParams(weather) : null), [weather]);
  const label = weather ? conditionLabel(weather.code) : "";

  return { status, place, weather, hour, label, sky, error, requestPreciseLocation, refresh };
}
