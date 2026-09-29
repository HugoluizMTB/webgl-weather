/**
 * Localização do usuário.
 * - GPS pelo navegador quando a pessoa permite (exige HTTPS, a Vercel já entrega).
 * - Sem permissão: localização aproximada por IP, sem nenhum pop-up.
 * O nome da cidade vem do endpoint gratuito client-side da BigDataCloud,
 * que só pode ser chamado do próprio navegador do usuário (fair use).
 */

export interface Place {
  lat: number;
  lon: number;
  city: string;
  region?: string;
  country?: string;
  source: "gps" | "ip" | "fallback";
}

const GEO_ENDPOINT = "https://api.bigdatacloud.net/data/reverse-geocode-client";

/** Usado quando nada funciona. */
export const FALLBACK_PLACE: Place = {
  lat: -8.0476, lon: -34.877, city: "Recife", region: "Pernambuco", country: "Brazil", source: "fallback",
};

const STORAGE_KEY = "webgl-weather:place";

export function loadSavedPlace(): Place | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Place) : null;
  } catch {
    return null;
  }
}

function savePlace(p: Place) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* armazenamento indisponível */ }
}

/** Já existe permissão concedida? Não abre nenhum pop-up. */
export async function hasGeoPermission(): Promise<boolean> {
  try {
    const s = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return s?.state === "granted";
  } catch {
    return false;
  }
}

function gpsPosition(timeout = 9000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Geolocation unavailable"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false, timeout, maximumAge: 10 * 60 * 1000,
    });
  });
}

async function reverseGeocode(lat?: number, lon?: number, signal?: AbortSignal) {
  const url = new URL(GEO_ENDPOINT);
  if (lat !== undefined && lon !== undefined) {
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
  }
  url.searchParams.set("localityLanguage", "en");
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geocoding responded ${res.status}`);
  return res.json() as Promise<{
    latitude: number; longitude: number; city?: string; locality?: string;
    principalSubdivision?: string; countryName?: string;
  }>;
}

function toPlace(g: Awaited<ReturnType<typeof reverseGeocode>>, source: Place["source"], lat?: number, lon?: number): Place {
  return {
    lat: lat ?? g.latitude,
    lon: lon ?? g.longitude,
    city: g.city || g.locality || g.principalSubdivision || "Your location",
    region: g.principalSubdivision,
    country: g.countryName,
    source,
  };
}

/** Pede o GPS (mostra o pop-up do navegador). Use num clique do usuário. */
export async function locatePrecise(signal?: AbortSignal): Promise<Place> {
  const pos = await gpsPosition();
  const { latitude: lat, longitude: lon } = pos.coords;
  let place: Place;
  try {
    place = toPlace(await reverseGeocode(lat, lon, signal), "gps", lat, lon);
  } catch {
    place = { lat, lon, city: "Your location", source: "gps" };
  }
  savePlace(place);
  return place;
}

/** Localização aproximada por IP, sem pop-up. */
export async function locateApprox(signal?: AbortSignal): Promise<Place> {
  const g = await reverseGeocode(undefined, undefined, signal);
  if (typeof g.latitude !== "number") throw new Error("No coordinates from IP");
  return toPlace(g, "ip");
}
