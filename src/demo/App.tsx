import { useEffect, useRef, useState } from "react";
import { WeatherSky } from "../react/WeatherSky";
import { WeatherHeader, TYPE_PRESETS, type TypePreset } from "../react/WeatherHeader";
import { moonPhaseFor } from "../engine/WeatherEngine";
import type { Condition } from "../engine/presets";
import { useLiveWeather } from "../live/useLiveWeather";
import type { LiveWeather } from "../live/openMeteo";
import { rainCategory } from "../engine/rainPhysics";

const CONDITIONS: { id: Condition; label: string; hi: number; lo: number }[] = [
  { id: "clear", label: "Clear", hi: 31, lo: 24 },
  { id: "partly", label: "Partly cloudy", hi: 30, lo: 24 },
  { id: "cloudy", label: "Cloudy", hi: 28, lo: 23 },
  { id: "drizzle", label: "Drizzle", hi: 27, lo: 23 },
  { id: "showers", label: "Showers", hi: 29, lo: 23 },
  { id: "rain", label: "Rain", hi: 26, lo: 22 },
  { id: "heavy", label: "Heavy rain", hi: 25, lo: 22 },
  { id: "storm", label: "Thunderstorm", hi: 26, lo: 22 },
];

function recifeHour() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Recife", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 12);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return Math.round(((h % 24) + m / 60) * 4) / 4;
}

const fmtHour = (h: number) => {
  const total = Math.round(h * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

function phaseName(f: number) {
  if (f < 0.03 || f > 0.97) return "New moon";
  if (f < 0.22) return "Waxing crescent";
  if (f < 0.28) return "First quarter";
  if (f < 0.47) return "Waxing gibbous";
  if (f < 0.53) return "Full moon";
  if (f < 0.72) return "Waning gibbous";
  if (f < 0.78) return "Last quarter";
  return "Waning crescent";
}

const CARDINAL = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
const cardinal = (deg: number) => CARDINAL[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

export function App() {
  const [mode, setMode] = useState<"live" | "manual">("live");
  const [hudOpen, setHudOpen] = useState(false);
  const live = useLiveWeather(true);
  const w = live.weather;
  const isLive = mode === "live" && !!w && !!live.sky;

  const [condition, setCondition] = useState<Condition>("partly");
  const [hour, setHour] = useState(recifeHour);
  const [sunSize, setSunSize] = useState(0.042);
  const [moonSize, setMoonSize] = useState(0.036);
  const [moonPhase, setMoonPhase] = useState(() => Math.round(moonPhaseFor() * 100) / 100);
  const [wind, setWind] = useState(0.3);
  const [glass, setGlass] = useState(1);
  const [flare, setFlare] = useState(1);

  // tipografia
  const [preset, setPreset] = useState<TypePreset>("moderna");
  const base = TYPE_PRESETS[preset];
  const [tempWeight, setTempWeight] = useState<number>(base.tempWeight);
  const [scale, setScale] = useState(1);
  const [tracking, setTracking] = useState<number>(base.tracking);
  const [shadow, setShadow] = useState(0.5);
  const [align, setAlign] = useState<"center" | "left">("center");
  const choosePreset = (id: TypePreset) => {
    setPreset(id);
    setTempWeight(TYPE_PRESETS[id].tempWeight);
    setTracking(TYPE_PRESETS[id].tracking);
  };

  const c = CONDITIONS.find((x) => x.id === condition)!;
  const night = hour < 5.3 || hour > 17.6;
  const manualTemp = night ? c.lo + 1 : Math.round(c.lo + (c.hi - c.lo) * Math.sin(Math.PI * (hour - 5.3) / 12.3));

  // o que vai para a tela: ao vivo ou manual
  const view = isLive
    ? {
        city: live.place?.city ?? "—",
        temp: Math.round(w!.temp),
        label: live.label,
        hi: Math.round(w!.hi),
        lo: Math.round(w!.lo),
        hour: live.hour,
        sky: live.sky!,
      }
    : { city: "Recife", temp: manualTemp, label: c.label, hi: c.hi, lo: c.lo, hour, sky: null };

  return (
    <div className="stage">
      <WeatherSky
        className="sky"
        condition={isLive ? "clear" : condition}
        hour={view.hour}
        wind={view.sky ? view.sky.wind : wind}
        cloud={view.sky?.cloud}
        rain={view.sky?.rain}
        storm={view.sky?.storm}
        sunrise={view.sky?.sunrise ?? 5.3}
        sunset={view.sky?.sunset ?? 17.6}
        glass={glass}
        flare={flare}
        sunSize={sunSize}
        moonSize={moonSize}
        moonPhase={moonPhase}
      />

      <WeatherHeader
        city={view.city}
        temp={view.temp}
        condition={view.label}
        hi={view.hi}
        lo={view.lo}
        typography={{ preset, tempWeight, scale, tracking, shadow, align }}
      />

      <a className="gh" href="https://github.com/HugoluizMTB/webgl-weather" target="_blank" rel="noreferrer"
        aria-label="Source on GitHub">
        <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>
      <Welcome />
      <LiquidGlassFilter />
      <section className={hudOpen ? "controls open" : "controls"} aria-label="Demo controls">
        <button className="handle" aria-expanded={hudOpen} aria-controls="hud-body"
          onClick={() => setHudOpen((o) => !o)}>
          <span className="grip" aria-hidden />
          <span className="peek">
            <span>{view.city} · {view.temp}° · {view.label}</span>
            <span className="peek-hint">{hudOpen ? "Collapse" : "Settings"}</span>
          </span>
        </button>
        <div className="sheet-body" id="hud-body" {...(hudOpen ? {} : { inert: "" })}>
        <div className="sheet-inner">
        <div className="seg top" role="radiogroup" aria-label="Mode">
          <button role="radio" aria-checked={mode === "live"} className={mode === "live" ? "on" : ""}
            onClick={() => setMode("live")}>Live</button>
          <button role="radio" aria-checked={mode === "manual"} className={mode === "manual" ? "on" : ""}
            onClick={() => setMode("manual")}>Manual</button>
        </div>

        {mode === "live" ? (
          <LivePanel live={live} />
        ) : (
          <>
        <div className="chips" role="radiogroup" aria-label="Condition">
            {CONDITIONS.map((x) => (
              <button
                key={x.id}
                role="radio"
                aria-checked={x.id === condition}
                className={x.id === condition ? "chip on" : "chip"}
                onClick={() => setCondition(x.id)}
              >
                {x.label}
              </button>
            ))}
          </div>
  
          <Slider label="Time" value={hour} display={fmtHour(hour)}
            min={0} max={23.75} step={0.25} onChange={setHour} />
  
          <details className="fine">
            <summary>Fine-tuning</summary>
            <Slider label="Sun size" value={sunSize} display={`${Math.round(sunSize * 1000)}`}
              min={0.02} max={0.09} step={0.002} onChange={setSunSize} />
            <Slider label="Moon size" value={moonSize} display={`${Math.round(moonSize * 1000)}`}
              min={0.018} max={0.09} step={0.002} onChange={setMoonSize} />
            <Slider label="Moon phase" value={moonPhase} display={phaseName(moonPhase)}
              min={0} max={1} step={0.01} onChange={setMoonPhase} wide />
            <Slider label="Wind" value={wind} display={wind.toFixed(1)}
              min={-1} max={1} step={0.1} onChange={setWind} />
          </details>
          </>
        )}

        <details className="fine">
          <summary>Effects</summary>
          <Slider label="Drops on glass" value={glass} display={`${Math.round(glass * 100)}%`}
            min={0} max={1} step={0.05} onChange={setGlass} />
          <Slider label="Sun flare" value={flare} display={`${Math.round(flare * 100)}%`}
            min={0} max={1} step={0.05} onChange={setFlare} />
        </details>

        <details className="fine">
          <summary>Typography</summary>
          <div className="chips small" role="radiogroup" aria-label="Font">
            {(Object.keys(TYPE_PRESETS) as TypePreset[]).map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={id === preset}
                className={id === preset ? "chip on" : "chip"}
                style={{ fontFamily: TYPE_PRESETS[id].display }}
                onClick={() => choosePreset(id)}
              >
                {TYPE_PRESETS[id].label}
              </button>
            ))}
          </div>
          <Slider label="Weight" value={tempWeight} display={String(tempWeight)}
            min={base.weightRange[0]} max={base.weightRange[1]} step={50} onChange={setTempWeight} />
          <Slider label="Size" value={scale} display={`${Math.round(scale * 100)}%`}
            min={0.7} max={1.3} step={0.05} onChange={setScale} />
          <Slider label="Tracking" value={tracking} display={tracking.toFixed(2)}
            min={-0.1} max={0.04} step={0.01} onChange={setTracking} />
          <Slider label="Shadow" value={shadow} display={`${Math.round(shadow * 100)}%`}
            min={0} max={1} step={0.05} onChange={setShadow} />
          <div className="row">
            <span className="row-label">Alignment</span>
            <div className="seg" role="radiogroup" aria-label="Alignment">
              {(["center", "left"] as const).map((a) => (
                <button key={a} role="radio" aria-checked={align === a}
                  className={align === a ? "on" : ""} onClick={() => setAlign(a)}>
                  {a === "center" ? "Center" : "Left"}
                </button>
              ))}
            </div>
            <span />
          </div>
        </details>
        </div>
        </div>
      </section>
    </div>
  );
}

const WELCOME_KEY = "webgl-weather:welcomed";

// explicação de uso: aparece só na primeira visita
function Welcome() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(WELCOME_KEY) === "1"; } catch { /* storage bloqueado */ }
    if (!seen) ref.current?.showModal();
  }, []);
  const remember = () => { try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* storage bloqueado */ } };

  return (
    <dialog ref={ref} className="welcome" aria-labelledby="welcome-title" onClose={remember}>
      <h2 id="welcome-title">Welcome to WebGL Weather</h2>
      <p>A live, animated sky rendered on your GPU, inspired by the macOS Weather app.</p>
      <ul>
        <li><strong>Live</strong> shows the real weather where you are. Tap <em>Use my location</em> for a precise GPS fix.</li>
        <li><strong>Manual</strong> lets you pick any condition and move through the time of day.</li>
        <li>Tap the bar at the bottom to open or close the settings: effects, typography and real-time data.</li>
      </ul>
      <form method="dialog">
        <button className="welcome-ok" autoFocus>Got it</button>
      </form>
    </dialog>
  );
}

// refração nas bordas (Chromium); outros navegadores ficam só com o blur
function LiquidGlassFilter() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <filter id="liquid-glass" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

function Slider(props: {
  label: string; value: number; display: string; min: number; max: number; step: number;
  onChange: (v: number) => void; wide?: boolean;
}) {
  return (
    <label className={props.wide ? "row wide" : "row"}>
      <span className="row-label">{props.label}</span>
      <input
        type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="row-value">{props.display}</span>
    </label>
  );
}

function LivePanel({ live }: { live: ReturnType<typeof useLiveWeather> }) {
  const w = live.weather;
  const busy = live.status === "locating" || live.status === "loading";
  const precise = live.place?.source === "gps";

  return (
    <div className="live">
      <div className="live-status">
        <span>
          {live.place ? live.place.city : "Locating…"}
          {live.place?.source === "ip" && <em> · approximate location</em>}
          {live.place?.source === "fallback" && <em> · default location</em>}
          {busy && <em> · updating…</em>}
        </span>
        {!precise && (
          <button className="link" onClick={live.requestPreciseLocation} disabled={busy}>
            Use my location
          </button>
        )}
      </div>

      {live.error && (
        <p className="live-error">
          {live.error}.{" "}
          {!w && "Showing manual mode meanwhile. "}
          <button className="link" onClick={live.refresh}>Try again</button>
        </p>
      )}

      {w && <LiveDetails w={w} hour={live.hour} />}
    </div>
  );
}

function LiveDetails({ w, hour }: { w: LiveWeather; hour: number }) {
  const items: [string, string][] = [
    ["Local time", fmtHour(Math.floor(hour * 60) / 60)],
    ["Feels like", `${Math.round(w.feelsLike)}°`],
    ["Humidity", `${Math.round(w.humidity)}%`],
    ["Wind", `${Math.round(w.windSpeed)} km/h ${cardinal(w.windDirection)}`],
    ["Gusts", `${Math.round(w.windGusts)} km/h`],
    ["Clouds", `${Math.round(w.cloudCover)}%`],
    ["Low · mid · high", `${w.cloudLow} · ${w.cloudMid} · ${w.cloudHigh}%`],
    ["Rain now", w.precipitation > 0
      ? `${(w.precipitation * 4).toFixed(1)} mm/h · ${rainCategory(w.precipitation * 4)}`
      : "no rain"],
    ["Chance of rain", `${w.rainChance}%`],
    ["Visibility", `${(w.visibility / 1000).toFixed(w.visibility < 10000 ? 1 : 0)} km`],
    ["Max UV", `${Math.round(w.uvMax)}`],
    ["Sun", `${fmtHour(w.sunrise)} – ${fmtHour(w.sunset)}`],
  ];
  return (
    <details className="fine" open>
      <summary>Real-time data</summary>
      <dl className="grid">
        {items.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </details>
  );
}
