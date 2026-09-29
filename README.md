# WebGL Weather

**Demo:** https://hugoluizmtb.github.io/webgl-weather/

Sempre achei o fundo animado do app Tempo do macOS (e do iOS) um dos detalhes mais bonitos do sistema: o céu que muda com a hora, as nuvens que passam, a chuva batendo no vidro e escorrendo. Este projeto é a minha tentativa de replicar isso em React, rodando no navegador, com dados de clima reais do lugar onde a pessoa está.

Tudo é desenhado em tempo real na GPU com WebGL2: não há vídeo, imagem nem sprite. O céu, as nuvens, o sol, a lua, as estrelas, os raios e as gotas saem de shaders e de uma simulação física das gotas.

## Tecnologias

- **WebGL2 puro** (GLSL ES 3.0), sem Three.js nem outra biblioteca de renderização.
- **TypeScript** na engine (`src/engine`), que roda o próprio loop e não depende de React.
- **React 18** só como casca: o componente repassa parâmetros e não re-renderiza por quadro.
- **Vite** para desenvolvimento e build.
- **GitHub Actions + GitHub Pages** para publicar a demo a cada push na `main`.

## A pesquisa por trás

A ideia era não "chutar" a aparência, e sim partir de como as coisas funcionam de verdade e só depois ajustar pelo olho. Antes de escrever cada parte, pesquisei a física e a literatura:

- **Chuva:** distribuição do tamanho das gotas (Marshall & Palmer), velocidade terminal de queda (Gunn & Kinzer, Atlas et al.), inclinação pelo vento e o brilho dos rastros conforme o tempo de exposição (Garg & Nayar). Detalhes na seção [Física da chuva](#física-da-chuva).
- **Gotas no vidro:** quando a tensão superficial segura uma gota e quando ela escorre (Furmidge), a velocidade de escorrimento (Le Grand, Daerr & Limat) e as "pérolas" que ela solta pela traseira (Podgorski, Flesselles & Limat).
- **Refração:** cada gota funciona como uma lente. O shader usa a normal da gota para amostrar o lado oposto da cena, invertendo e ampliando o que está atrás, como numa gota de verdade; gotículas quase não distorcem. O vidro embaçado desfoca e clareia o fundo.
- **Luz e sombra:** as gotas têm lado de sombra, borda escura e brilho especular apontado para o sol. As nuvens comparam a própria densidade um passo na direção do sol, o que cria as bordas iluminadas. O relâmpago acende as nuvens por dentro.
- **Sol e lua:** a posição segue a hora local do lugar e os horários reais de nascer e pôr do sol. O sol tem escurecimento de borda e fica alaranjado perto do horizonte. A lua é uma esfera iluminada pela fase real do dia (calculada pelo mês sinódico), com mares, crateras e luz cinérea, e a crescente é orientada para o hemisfério sul.
- **Clima de Recife:** os presets usam vento de leste, como os alísios de sudeste que trazem a quadra chuvosa de abril a julho.

## APIs de clima

| Serviço | Para quê | Chave |
|---|---|---|
| [Open-Meteo](https://open-meteo.com) | Clima atual e do dia: temperatura, nuvens por altitude, precipitação, vento, rajadas, visibilidade, UV, nascer e pôr do sol, código WMO da condição | Não precisa (grátis para uso não comercial) |
| [BigDataCloud](https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api) | Nome da cidade e localização aproximada por IP | Não precisa (só pode ser chamado do navegador do usuário) |

Hoje o Open-Meteo é a única fonte de clima. A conversão para os parâmetros do céu fica isolada em `toSkyParams` (`src/live/openMeteo.ts`), então outra API pode entrar reescrevendo só esse arquivo.

## Uso

```tsx
import { WeatherSky } from "webgl-weather";

<div style={{ position: "relative", height: 400, borderRadius: 24, overflow: "hidden" }}>
  <WeatherSky condition="rain" style={{ position: "absolute", inset: 0 }} />
  {/* seu conteúdo por cima */}
</div>
```

### Props

| Prop | Tipo | Padrão | Descrição |
|---|---|---|---|
| `condition` | `"clear" \| "partly" \| "cloudy" \| "drizzle" \| "showers" \| "rain" \| "heavy" \| "storm"` | `"clear"` | Preset pronto |
| `hour` | `number` (0–24) | hora atual | Posição do sol/lua e cor do céu |
| `cloud`, `rain`, `storm` | `number` (0–1) | do preset | Sobrescrevem o preset |
| `wind` | `number` (-1–1) | do preset | Inclina a chuva e move as nuvens |
| `sunX`, `moonX` | `number` (0–1) | pela hora | Posição horizontal manual |
| `sunY`, `moonY` | `number` (-1–1) | pela hora | Elevação manual (abaixo de 0 some no horizonte) |
| `sunSize` | `number` | `0.042` | Raio do sol, fração da altura da tela |
| `moonSize` | `number` | `0.036` | Raio da lua, fração da altura da tela |
| `moonPhase` | `number` (0–1) | fase real de hoje | 0 nova, 0.25 crescente, 0.5 cheia, 0.75 minguante |
| `renderScale` | `number` | `0.6` | Fração da resolução nativa |
| `maxFps` | `number` | `60` | Teto de quadros por segundo |
| `maxDrops` | `number` | `1600` | Gotas com chuva em 100% |
| `transition` | `number` | `1.6` | Duração das transições (s) |
| `sunrise`, `sunset` | `number` | `5.3`, `17.6` | Horários do nascer e pôr do sol |
| `glass` | `number` (0–1) | `1` | Gotas no vidro (a água vem da chuva e seca sozinha) |
| `flare` | `number` (0–1) | `1` | Reflexo do sol na lente |

### Tipografia (`WeatherHeader`)

Cabeçalho com cidade, temperatura, condição e máx./mín., pronto para ir por cima do céu.

```tsx
import { WeatherSky, WeatherHeader } from "webgl-weather";

<WeatherSky condition="partly" />
<WeatherHeader
  city="Recife" temp={29} condition="Sol entre nuvens" hi={31} lo={24}
  typography={{ preset: "editorial", tempWeight: 250, scale: 1.1, align: "left" }}
/>
```

| Opção | Padrão | Descrição |
|---|---|---|
| `preset` | `"moderna"` | `nativa` (SF/sistema), `moderna` (Manrope), `geometrica` (Outfit), `editorial` (Fraunces + Manrope), `grotesca` (Bricolage Grotesque), `expandida` (Unbounded + Manrope) |
| `tempWeight`, `cityWeight`, `labelWeight` | do preset | Pesos de cada nível |
| `scale` | `1` | Multiplica todos os tamanhos |
| `tracking` | do preset | Espaçamento da temperatura, em `em` |
| `shadow` | `0.5` | Sombra de leitura sobre céu claro, 0–1 |
| `align` | `"center"` | `"center"` ou `"left"` |
| `display`, `text` | do preset | Qualquer `font-family` para usar sua própria fonte |

As fontes dos presets vêm do Google Fonts. Carregue as que for usar:

```html
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&family=Outfit:wght@100..900&family=Fraunces:opsz,wght,SOFT@9..144,100..900,0..100&family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Unbounded:wght@200..900&display=swap" rel="stylesheet">
```

### Sem React

```ts
import { WeatherEngine, PRESETS } from "webgl-weather";

const engine = new WeatherEngine(canvas, { renderScale: 0.5 });
engine.set({ ...PRESETS.storm, hour: 19 });
// ...
engine.destroy();
```

## Céu ao vivo

O hook `useLiveWeather()` descobre onde a pessoa está, busca o clima no Open-Meteo e mantém tudo atualizado:

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
      <button onClick={live.requestPreciseLocation}>Usar minha localização</button>
    </>
  );
}
```

**Ordem da localização:** GPS se a permissão já foi dada → último lugar salvo → localização aproximada por IP (sem pop-up) → Recife. O GPS só é pedido quando a pessoa clica em "Usar minha localização", que é o que os navegadores recomendam.

**Hora e sol:** a hora é a do fuso do lugar (`utc_offset_seconds` da API), não a do aparelho. Nascer e pôr do sol vêm da API, então o céu escurece na hora certa em qualquer cidade.

**Atualização:** o clima é buscado de novo a cada 10 minutos e quando a aba volta a ficar visível; o relógio anda a cada 30 segundos.

### Como a API vira céu (`toSkyParams`)

| Campo do Open-Meteo | Vira | Como |
|---|---|---|
| `cloud_cover`, `cloud_cover_low/mid/high` | `cloud` | Cobertura total, com as nuvens baixas pesando mais |
| `weather_code` (WMO) | piso de `cloud`, `rain`, `storm` e o texto da condição | Tabela em `src/live/openMeteo.ts` |
| `precipitation` | `rain` | mm convertidos em intensidade |
| `wind_speed_10m`, `wind_direction_10m` | `wind` | Força e sentido (leste = direita da tela) |
| `wind_gusts_10m` | `storm` | Rajadas fortes escurecem um pouco |
| `sunrise`, `sunset` | posição do sol e da lua | Horário local do lugar |

Neve (códigos 71–77, 85, 86) ainda aparece como céu nublado, sem flocos.

## Deploy no GitHub Pages

O workflow `.github/workflows/deploy.yml` roda `npm run build` e publica a pasta `dist` a cada push na `main`. O `vite.config.ts` usa `base: "./"`, então o build funciona em qualquer subpasta. A geolocalização do navegador exige HTTPS, que o GitHub Pages já fornece. Não há backend nem variáveis de ambiente.

## Física da chuva

Os números da chuva vêm da literatura de meteorologia e de física de superfícies (`src/engine/rainPhysics.ts`):

| Fenômeno | Modelo | Onde entra |
|---|---|---|
| Tamanho das gotas | Marshall & Palmer (1948): N(D) = 8000·e^(−ΛD), Λ = 4,1·R^−0,21 | Diâmetro de cada gota caindo e de cada impacto no vidro |
| Velocidade de queda | Atlas et al. (1973), ajuste de Gunn & Kinzer (1949): v = 9,65 − 10,3·e^(−0,6D) m/s | Velocidade e comprimento dos rastros |
| Inclinação | vento ÷ velocidade de queda | Garoa voa com o vento; gota grande cai quase reta |
| Brilho do rastro | Garg & Nayar (2006): depende de quanto tempo a gota fica sobre cada ponto | Rastros finos e rápidos são mais fracos; gotas distantes somem na umidade |
| Fluxo no vidro | concentração × velocidade × área × exposição ao vento | Quantas gotas batem por segundo; janela vertical pega mais chuva com vento |
| Gota presa | Furmidge (1962): ρgV = wγ(cos θr − cos θa), com ângulos do vidro comum | Raio crítico ≈ 2,5 mm: abaixo disso a gota não escorre |
| Gota escorrendo | Le Grand, Daerr & Limat (2005): velocidade linear no excesso sobre o crítico | Gotas maiores descem mais rápido |
| Pérolas | Podgorski, Flesselles & Limat (2001) | Acima de ~45 mm/s a traseira vira cúspide e solta gotinhas |

A intensidade 0–1 da engine é convertida em mm/h numa escala logarítmica (0,2 ≈ 0,4 mm/h garoa; 0,65 ≈ 5 mm/h moderada; 1 ≈ 30 mm/h muito forte). No modo ao vivo, a precipitação da API vira mm/h diretamente.

Duas liberdades artísticas, assumidas: a evaporação depois que a chuva para é acelerada (na vida real um vidro leva minutos para secar), e a escala do vidro na tela é fixa em `GLASS_PX_PER_MM` (6 px de CSS por milímetro).

**Recife:** a quadra chuvosa vai de abril a julho, puxada pelos distúrbios ondulatórios de leste que chegam com os alísios de sudeste. Por isso os presets usam vento de leste moderado, e as chuvas fortes vêm inclinadas.

## Como funciona

A cena tem três passes por quadro. Os dois primeiros desenham numa textura; o terceiro lê essa textura e desenha na tela:

1. **Céu** (`SKY_FS`): um triângulo de tela cheia. O fragment shader calcula o gradiente pela elevação do sol (dia, crepúsculo, noite), acinzenta o céu conforme a nebulosidade, desenha sol, lua e estrelas, e gera as nuvens com fBm e *domain warping* em duas camadas com parallax. A iluminação das nuvens compara a densidade um passo na direção do sol, o que cria bordas iluminadas. O relâmpago é um uniform que ilumina as nuvens por dentro.
2. **Chuva** (`RAIN_VS`): partículas sem estado. Cada gota é um quad de 6 vértices cuja posição é calculada no vertex shader só a partir de `gl_VertexID` e do tempo, então o JavaScript não atualiza nenhuma gota. As gotas ao fundo são menores, mais lentas e mais transparentes.

O sol tem disco com escurecimento de borda, coroa, bloom e raios sutis que giram devagar, e fica mais alaranjado perto do horizonte. A lua é renderizada como uma esfera iluminada pela fase, com mares, crateras procedurais e luz cinérea no lado escuro; a orientação da crescente segue o hemisfério sul. A fase padrão é calculada a partir da data (`moonPhaseFor()`).

3. **Vidro**: as gotas são uma **simulação em JavaScript** (`RainSimulator.ts`): gotas simuladas na CPU, desenhadas como normais numa textura e refratadas no shader. O movimento usa impulso e atrito: gotas pequenas ficam presas pela tensão superficial; acima de um tamanho crítico elas às vezes soltam, aceleram, desaceleram e param de forma contínua, serpenteando de leve e puxadas pelo vento. Pelo caminho deixam gotinhas e perdem água. Gotas que se encostam se fundem, e a maior pode voltar a escorrer. Gotículas finas e a névoa do vidro ficam em texturas persistentes que as gotas apagam por onde passam. Como essas texturas são de 8 bits, as mudanças são aplicadas em lotes (menores que 1/255 por quadro se perderiam no arredondamento) e, quando o vidro seca de vez, elas são limpas por completo, sem sobrar mancha. O comportamento muda com a chuva: **garoa** embaça e cobre de gotículas, quase nada escorre; **chuva** traz gotas médias; **chuva forte e trovoada** trazem gotas grandes que escorrem com frequência. O mesmo passe faz o **reflexo do sol**: fantasmas hexagonais ao longo do eixo sol–centro, halo com dispersão de cor e véu de luz. Para saber se o sol está visível de verdade, o shader mede o brilho da cena no ponto do sol; quando uma nuvem passa na frente, o reflexo some sozinho.

A engine interpola todos os parâmetros com decaimento exponencial, então qualquer mudança vira uma transição.

## Desempenho

- Renderiza a 60% da resolução por padrão; as nuvens são suaves e a diferença é imperceptível.
- Pausa sozinha quando o canvas sai da tela (IntersectionObserver) ou a aba fica oculta.
- Respeita `prefers-reduced-motion`: mostra um quadro estático.
- Sem WebGL2, cai para um gradiente em CSS.
- Trata perda de contexto WebGL (comum no iOS ao trocar de app).

## Rodar a demo

```bash
npm install
npm run dev            # servidor de desenvolvimento
npm run build:single   # gera dist/index.html com tudo embutido
```

## Licença

MIT. Veja [LICENSE](LICENSE).
