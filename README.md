# WebGL Weather

**Demo:** https://hugoluizmtb.github.io/webgl-weather/

I've always thought the animated background of the macOS (and iOS) Weather app is one of the most beautiful details in the system: the sky shifting with the time of day, clouds drifting by, rain hitting the glass and running down. This project is my attempt to recreate it in React, running in the browser, with real weather data for wherever the viewer is.

Everything is drawn in real time on the GPU with WebGL2. There are no videos, images or sprites. The sky, clouds, sun, moon, stars, lightning and raindrops all come from shaders and a physical simulation of the drops.

## Tech stack

- **Plain WebGL2** (GLSL ES 3.0), no Three.js or any other rendering library.
- **TypeScript** for the engine (`src/engine`), which runs its own loop and does not depend on React.
- **React 18** only as a thin shell: the component passes parameters through and never re-renders per frame.
- **Vite** for development and builds.
- **GitHub Actions + GitHub Pages** to publish the demo on every push to `main`.

## The research behind it

The goal was not to eyeball the look, but to start from how things actually work and only then tune by eye. Before writing each part, I researched the physics and the literature:

- **Rain:** drop size distribution (Marshall & Palmer), terminal fall speed (Gunn & Kinzer, Atlas et al.), slant from wind, and streak brightness as a function of exposure time (Garg & Nayar). Details in [Rain physics](#rain-physics).
- **Drops on glass:** when surface tension holds a drop in place and when it slides (Furmidge), sliding speed (Le Grand, Daerr & Limat), and the "pearls" a fast drop sheds from its tail (Podgorski, Flesselles & Limat).
- **Refraction:** each drop acts as a lens. The shader uses the drop's normal to sample the opposite side of the scene, flipping and magnifying what's behind it, like a real drop; tiny droplets barely distort. Fogged glass blurs and brightens the background.
- **Light and shadow:** drops have a shaded side, a dark rim and a specular highlight facing the sun. Clouds compare their own density one step toward the sun, which produces lit edges. Lightning lights the clouds from within.
- **Sun and moon:** their position follows the location's local time and the real sunrise and sunset times. The sun has limb darkening and turns orange near the horizon. The moon is a sphere lit by today's real phase (computed from the synodic month), with maria, craters and earthshine, and the crescent is oriented for the southern hemisphere.
- **Recife's climate:** the presets use easterly wind, like the southeast trade winds that bring the April–July rainy season.

## Weather APIs

| Service | Used for | Key |
|---|---|---|
| [Open-Meteo](https://open-meteo.com) | Current and daily weather: temperature, cloud cover by altitude, precipitation, wind, gusts, visibility, UV, sunrise and sunset, WMO condition code | Not needed (free for non-commercial use) |
| [BigDataCloud](https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api) | City name and approximate IP-based location | Not needed (may only be called from the user's browser) |

Open-Meteo is currently the only weather source. The mapping to sky parameters is isolated in `toSkyParams` (`src/live/openMeteo.ts`), so another API can be plugged in by rewriting just that file.

## Usage

```tsx
import { WeatherSky } from "webgl-weather";

<div style={{ position: "relative", height: 400, borderRadius: 24, overflow: "hidden" }}>
  <WeatherSky condition="rain" style={{ position: "absolute", inset: 0 }} />
  {/* your content on top */}
</div>
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `condition` | `"clear" \| "partly" \| "cloudy" \| "drizzle" \| "showers" \| "rain" \| "heavy" \| "storm"` | `"clear"` | Ready-made preset |
| `hour` | `number` (0–24) | current hour | Sun/moon position and sky color |
| `cloud`, `rain`, `storm` | `number` (0–1) | from preset | Override the preset |
| `wind` | `number` (-1–1) | from preset | Slants the rain and moves the clouds |
| `sunX`, `moonX` | `number` (0–1) | from hour | Manual horizontal position |
| `sunY`, `moonY` | `number` (-1–1) | from hour | Manual elevation (below 0 sets below the horizon) |
| `sunSize` | `number` | `0.042` | Sun radius, as a fraction of screen height |
| `moonSize` | `number` | `0.036` | Moon radius, as a fraction of screen height |
| `moonPhase` | `number` (0–1) | today's real phase | 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter |
| `renderScale` | `number` | `0.6` | Fraction of native resolution |
| `maxFps` | `number` | `60` | Frame rate cap |
| `maxDrops` | `number` | `1600` | Drops at 100% rain |
| `transition` | `number` | `1.6` | Transition duration (s) |
| `sunrise`, `sunset` | `number` | `5.3`, `17.6` | Sunrise and sunset times |
| `glass` | `number` (0–1) | `1` | Drops on the glass (water comes from the rain and dries on its own) |
| `flare` | `number` (0–1) | `1` | Sun lens flare |

### Typography (`WeatherHeader`)

Header with city, temperature, condition and high/low, ready to sit on top of the sky.

```tsx
import { WeatherSky, WeatherHeader } from "webgl-weather";

<WeatherSky condition="partly" />
<WeatherHeader
  city="Recife" temp={29} condition="Partly cloudy" hi={31} lo={24}
  typography={{ preset: "editorial", tempWeight: 250, scale: 1.1, align: "left" }}
/>
```

| Option | Default | Description |
|---|---|---|
| `preset` | `"moderna"` | `nativa` (SF/system), `moderna` (Manrope), `geometrica` (Outfit), `editorial` (Fraunces + Manrope), `grotesca` (Bricolage Grotesque), `expandida` (Unbounded + Manrope) |
| `tempWeight`, `cityWeight`, `labelWeight` | from preset | Weight of each level |
| `scale` | `1` | Multiplies every size |
| `tracking` | from preset | Temperature letter spacing, in `em` |
| `shadow` | `0.5` | Legibility shadow over bright skies, 0–1 |
| `align` | `"center"` | `"center"` or `"left"` |
| `display`, `text` | from preset | Any `font-family`, to use your own font |

The preset fonts come from Google Fonts. Load the ones you use:

```html
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&family=Outfit:wght@100..900&family=Fraunces:opsz,wght,SOFT@9..144,100..900,0..100&family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Unbounded:wght@200..900&display=swap" rel="stylesheet">
```

### Without React

```ts
import { WeatherEngine, PRESETS } from "webgl-weather";

const engine = new WeatherEngine(canvas, { renderScale: 0.5 });
engine.set({ ...PRESETS.storm, hour: 19 });
// ...
engine.destroy();
```

## Live sky

The `useLiveWeather()` hook finds out where the user is, fetches the weather from Open-Meteo and keeps everything up to date:

```tsx
import { WeatherSky, WeatherHeader, useLiveWeather } from "webgl-weather";

function Card() {
  const live = useLiveWeather();
  if (!live.weather || !live.sky) return null;
  return (
    <>
      <WeatherSky hour={live.hour} {...live.sky} />
      <WeatherHeader city={live.place!.city} temp={Math.round(live.weather.temp)}
        condition={live.label} hi={Math.round(live.weather.hi)} lo={Math.round(live.weather.lo)} />
      <button onClick={live.requestPreciseLocation}>Use my location</button>
    </>
  );
}
```

**Location order:** GPS if permission was already granted → last saved place → approximate IP location (no prompt) → Recife. GPS is only requested when the user clicks "Use my location", as browsers recommend.

**Time and sun:** the time is the location's time zone (`utc_offset_seconds` from the API), not the device's. Sunrise and sunset come from the API, so the sky darkens at the right time in any city.

**Refresh:** weather is fetched again every 10 minutes and whenever the tab becomes visible; the clock ticks every 30 seconds.

### How the API becomes sky (`toSkyParams`)

| Open-Meteo field | Becomes | How |
|---|---|---|
| `cloud_cover`, `cloud_cover_low/mid/high` | `cloud` | Total cover, with low clouds weighted more |
| `weather_code` (WMO) | floor for `cloud`, `rain`, `storm` and the condition label | Table in `src/live/openMeteo.ts` |
| `precipitation` | `rain` | mm converted to intensity |
| `wind_speed_10m`, `wind_direction_10m` | `wind` | Strength and direction (east = right side of the screen) |
| `wind_gusts_10m` | `storm` | Strong gusts darken the sky a bit |
| `sunrise`, `sunset` | sun and moon position | Location's local time |

Snow (codes 71–77, 85, 86) still shows as an overcast sky, without flakes.

## Deploying to GitHub Pages

The `.github/workflows/deploy.yml` workflow runs `npm run build` and publishes the `dist` folder on every push to `main`. `vite.config.ts` uses `base: "./"`, so the build works from any subpath. Browser geolocation requires HTTPS, which GitHub Pages already provides. There is no backend and there are no environment variables.

## Rain physics

The rain numbers come from the meteorology and surface physics literature (`src/engine/rainPhysics.ts`):

| Phenomenon | Model | Where it's used |
|---|---|---|
| Drop size | Marshall & Palmer (1948): N(D) = 8000·e^(−ΛD), Λ = 4.1·R^−0.21 | Diameter of each falling drop and each impact on the glass |
| Fall speed | Atlas et al. (1973), fit of Gunn & Kinzer (1949): v = 9.65 − 10.3·e^(−0.6D) m/s | Streak speed and length |
| Slant | wind ÷ fall speed | Drizzle blows with the wind; large drops fall almost straight |
| Streak brightness | Garg & Nayar (2006): depends on how long the drop stays over each pixel | Thin, fast streaks are fainter; distant drops fade into the humidity |
| Flux on the glass | concentration × speed × area × wind exposure | How many drops hit per second; a vertical window catches more rain with wind |
| Pinned drop | Furmidge (1962): ρgV = wγ(cos θr − cos θa), with common window glass angles | Critical radius ≈ 2.5 mm: below it the drop doesn't slide |
| Sliding drop | Le Grand, Daerr & Limat (2005): speed linear in the excess over critical | Bigger drops slide faster |
| Pearling | Podgorski, Flesselles & Limat (2001) | Above ~45 mm/s the tail forms a cusp and sheds droplets |

The engine's 0–1 intensity is mapped to mm/h on a logarithmic scale (0.2 ≈ 0.4 mm/h drizzle; 0.65 ≈ 5 mm/h moderate; 1 ≈ 30 mm/h very heavy). In live mode, the API's precipitation becomes mm/h directly.

Two deliberate artistic liberties: evaporation after the rain stops is sped up (real glass takes minutes to dry), and the on-screen glass scale is fixed at `GLASS_PX_PER_MM` (6 CSS px per millimeter).

**Recife:** the rainy season runs from April to July, driven by easterly wave disturbances that arrive with the southeast trade winds. That's why the presets use moderate easterly wind and heavy rain comes in slanted.

## How it works

The scene has three passes per frame. The first two draw into a texture; the third reads that texture and draws to the screen:

1. **Sky** (`SKY_FS`): a full-screen triangle. The fragment shader computes the gradient from the sun's elevation (day, twilight, night), greys the sky according to cloud cover, draws the sun, moon and stars, and generates clouds with fBm and *domain warping* in two parallax layers. Cloud lighting compares density one step toward the sun, which creates lit edges. Lightning is a uniform that lights the clouds from within.
2. **Rain** (`RAIN_VS`): stateless particles. Each drop is a 6-vertex quad whose position is computed in the vertex shader from `gl_VertexID` and time alone, so JavaScript never updates a single drop. Drops in the background are smaller, slower and more transparent.

The sun has a limb-darkened disc, corona, bloom and subtle slowly rotating rays, and turns more orange near the horizon. The moon is rendered as a sphere lit by its phase, with maria, procedural craters and earthshine on the dark side; the crescent is oriented for the southern hemisphere. The default phase is computed from the date (`moonPhaseFor()`).

3. **Glass**: the drops are a **JavaScript simulation** (`RainSimulator.ts`): drops simulated on the CPU, drawn as normals into a texture and refracted in the shader. Motion uses momentum and friction: small drops are held by surface tension; above a critical size they occasionally break free, speed up, slow down and stop smoothly, meandering slightly and pushed by the wind. Along the way they leave droplets behind and lose water. Drops that touch merge, and the bigger one may start sliding again. Fine droplets and glass fog live in persistent textures that drops wipe clean as they pass. Since these textures are 8-bit, changes are applied in batches (anything under 1/255 per frame would be lost to rounding) and, once the glass is fully dry, they are cleared completely so no smudge is left. Behavior changes with the rain: **drizzle** fogs the glass and covers it in droplets, with almost nothing sliding; **rain** brings medium drops; **heavy rain and thunderstorms** bring large drops that slide often. The same pass renders the **sun flare**: hexagonal ghosts along the sun–center axis, a halo with color dispersion, and a veiling glare. To know whether the sun is actually visible, the shader measures scene brightness at the sun's position; when a cloud passes in front, the flare fades out on its own.

The engine interpolates every parameter with exponential decay, so any change becomes a transition.

## Performance

- Renders at 60% resolution by default; the clouds are soft and the difference is unnoticeable.
- Pauses automatically when the canvas leaves the viewport (IntersectionObserver) or the tab is hidden.
- Respects `prefers-reduced-motion`: shows a static frame.
- Without WebGL2, falls back to a CSS gradient.
- Handles WebGL context loss (common on iOS when switching apps).

## Running the demo

```bash
npm install
npm run dev            # development server
npm run build:single   # builds dist/index.html with everything inlined
```

## License

MIT. See [LICENSE](LICENSE).
