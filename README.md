# Vision Nexus 2030 — The Kingdom in Motion (build V9 — visual refinement)

The build label is shown in the bottom corner of the screen. If you see a "Strategic Actions" panel, "Path to 2030" or a calendar past 2030, you are running an older copy of the files.

An unofficial Saudi strategy game in the browser (WebGL, no install, no build step).
## How to launch (works offline)
The game runs from a tiny local web server, because browsers block the ES modules, models and textures of the three.js renderer on `file://` pages. Nothing is downloaded from the internet: three.js and the fonts are in `vendor/`.
- **Windows:** double-click `Launch_Prototype.bat`. It starts `python -m http.server 8000` (or `node tools/serve.js` if Python is missing) and opens http://localhost:8000.
- **macOS / Linux:** run `./launch.sh` (same fallbacks).
- **Any system with Node:** `npm start`, then open http://localhost:8000.
- **Renderers:** http://localhost:8000/index.html uses the three.js renderer; add `?renderer=classic` for the original hand-written WebGL renderer (kept for comparison). Opening `index.html` directly from disk still works and uses the classic renderer. Add `?debug=1` for the frame-time counter.
- **Tests:** `npm test` (game logic, headless) and `npm install && npm run test:render` (Playwright smoke test against your installed Chrome or Edge).

## Renderer upgrade (build V8)
The 3D world is drawn by **three.js** (vendored in `vendor/three`). The upgrade toward a cinematic, Unreal-like look happens in phases; each phase has notes and comparison screenshots in `docs/`.
- **Phase 1 — renderer swap with parity (done):** `engine.js` now renders through three.js with the original shaders and geometry; the `VisionWorld` API is unchanged. Repeated props and vehicles use InstancedMesh. Picking and City Builder tools behave exactly as before. See `docs/phase1/NOTES.md`.
- The original renderer stays available as `engine_classic.js` (`index.html?renderer=classic`).
- Third-party files and licences: `ASSETS_CREDITS.md`.

## Visual refinement (build V9)
A styling pass on the three.js build. Rules, missions, calculations, data, saves, controls, maps and building models are unchanged. Before/after screenshots (same camera, state and seeded randomness, 1440×900, High quality) are in `docs/style-before/`, `docs/style-after/` and side by side in `docs/style-compare/`.
- **Interface:** one palette shared by the HUD and the 3D cues (panels `#FAF9F5`, text and primary actions `#153F36`, selection and objectives `#C99B45`, navigation `#203E5B`), 12–14px card corners, one Arabic-compatible font (Tajawal). Equal KPI and measure cards; a change arrow appears only once there is an earlier month to compare with. Collapsed side panels keep a labelled tab to reopen them. Mission and City Builder tools show their real cost (a range when it depends on the place chosen) and distinct available / selected / unavailable / locked states. Selection is gold, warnings terracotta, errors red.
- **Labels:** the selected object's label is placed first; sea, country and road names give way to landmarks; nothing is smaller than 11px. Riyadh and Eastern Province district names now appear in Arabic in mission mode.
- **World:** softer daylight (more sky fill, lifted shadows, broader and fainter highlights, slightly muted colour), muted sand, and calm teal water with gentler glints. Night mode is unchanged in readability. No extra render passes, SSAO or HDRI.
- **Selection:** a gold outline on the footprint with four corner brackets (ribbons get a gold edge). No building glow and no scene dimming.
- **Decluttering:** decorative flights are drawn only in the Kingdom overview (in close views they crossed downtown towers and labels), and tall palms or trees are not placed where their crown would cover a road or the wadi from the default camera.
- **Performance:** measured with a 5-second frame count per quality level (1440×900, Intel integrated GPU via Direct3D 11, vsync off), two alternating runs per build. V8 → V9, Kingdom view: High 31.9–32.0 → 30.3–32.2 fps, Medium 43.9–45.2 → 42.6–44.9, Reduced 43.3–43.4 → 41.8–44.6. Riyadh close-up: High 32.8–33.6 → 32.1–33.4, Medium 42.2–43.4 → 42.1–42.2, Reduced 42.7–43.7 → 41.8–43.1. The differences are within run-to-run variation; no regression was measured.
- **Possible future work (not done here):** authored models replacing procedural ones, proportion and bevel passes, converting the remaining merged props to InstancedMesh, ambient occlusion and contact shadows, a custom icon set in place of emoji, and a City Builder toolbar that fits 1440px without scrolling.

## Play first
**Mission 1 — Connect for the Opening.** Choose **Bus rapid transit**, tap *City Centre ↔ Expo 2030 site*, then **Add to plan**. Add *City Centre ↔ King Salman Airport* the same way, then press **End turn**. You will see the transformation moment. Finish the mission to see the victory moment.

## The Riyadh chapter (free introductory chapter)
Five connected missions, 3–5 minutes each. They are turn-based: time only moves when you press End turn.
| # | Mission | What makes it hard |
|---|---|---|
| 1 | Connect for the Opening | Metro vs bus vs roads; new lanes jam the central ring |
| 2 | Welcome the World | Visitor beds only fill in well-connected districts; crowds cost trust |
| 3 | Power the Growth | Evening peak, where solar fades; clean vs reliable vs cheap |
| 4 | Deliver Together | Three projects share crews, wait on each other and need materials by road |
| 5 | Sandstorm Over Riyadh | Six phases, 3 response actions each; shelter before the storm arrives, reroute before roads close |

Every action shows its cost, time, crews, prerequisites, forecast effects and trade-off before you commit, and the predicted change also appears on the map. After each turn, each indicator change is listed with its causes.

**Scoring:** the main objective must be met to earn a medal. Gold also needs every measure (delivery, budget, trust, sustainability, resilience) at 50 or above. Up to three optional objectives add stars. When you miss, the result screen shows why and suggests a route.

## All regions — six playable chapters, 14 missions
Each chapter has its own map (nodes, roads, transit corridors, a central cordon and its own cost scale) in `mission.js` → `BOARDS`.
| Chapter | Unlock | Missions |
|---|---|---|
| **Riyadh — The Connected City** (free) | — | Connect for the Opening · Welcome the World · Power the Growth · Deliver Together · Sandstorm Over Riyadh |
| **Makkah & the West** | Medal in Riyadh 5 | Pilgrim Flow (Hajj build-up to the Holy Sites) · Jeddah Rainfall |
| **NEOM & the Northwest** | Medal in Riyadh 5 | Building from Zero (everything arrives at Oxagon Port; THE LINE depends on the hydrogen plant; Trojena needs transit) · Clean Power, Day and Night (≥50% renewables with no evening outages; new **wind farm** action) |
| **The East — Energy Transition** | Medal in Riyadh 5 | Industrial Energy Transition (an oil plant retires on turn 4) · Shamal Dust Storm (Jubail → Qatif → Dammam → Khobar) |
| **Aseer & the South** | Medal in Riyadh 5 | Mountain Summer (hotels, and cable-car or shuttle access to Soudah and Rijal Almaa) · Flash Floods from Jazan to Abha |
| **Beyond 2030 — Future Chapter** | Medals in any two regional finales | Kingdom Connect 2035: high-speed rail and express coaches between all regions (the land bridge, the South and the North) |

In every mission, careless play fails and at least two different strategies can win; `tests/missions.test.js` checks this for all 14 missions. Storm roads that you close in time now reopen after the storm passes, or immediately with a clearance crew.




## V7 — City Missions and deeper city systems
- **City Missions (🏅 in the City Builder).** The five 2026 challenge arcs are played in your own district and judged only on outcomes:
  - **A · Connect the District:** a bus route that serves both gateways and is actually used.
  - **B · Power the Next District:** every connected building powered, with at least 50% solar that holds through dust storms.
  - **C · Three Continents, One Network:** freight rail you draw to the district edge, logistics terminals, and at least 50% of freight moving by rail with reliability 70 or more.
  - **D · Unlock the Investment:** an investment site you designate reaches readiness 70 from real access, utilities, services, skills and area quality. Then choose a fictional offer.
  - **E · Talent Powers Delivery:** trainees, and skilled workers who can reach jobs within 30 minutes.
- **Medals.** Gold needs a fast finish without breaching the budget, environment or job-access limits; otherwise silver. A win grants a capability that also affects board missions: Gateway interchange, Smart grid, Rail yard, Investor network or Academy partnership.
- **After every mission, board or city:** *what I built → what changed → scenario factors → what I earned → what to try next.*
- **New tools:** freight rail (with level crossings), logistics terminals, tourism and hospitality zones, mixed-use zones (the homes/shops balance shifts with demand), an investment site, and a water conservation policy.
- **Weather:** dust storms cut solar output and slow roads for a month; summer heat raises power and water demand.
- **Previews before you build:** new residents or jobs, power and water compared with spare capacity, peak trips and upkeep.
- **Inspector:** now shows workforce, customers, construction time left and freight mode.
- **Demand** now also responds to investment, land availability and the active mission.
- **Competitiveness:** city outcomes, including Prices from construction pressure, feed the fictional scenario. Every change is kept as an event record in the Lens.
- **Mission stars are outcome-based.** Stars that checked for specific links now use actual transit times, e.g. Airport to Expo within 40 minutes by any transit.
- **Graphics setting:** High (shadows, full resolution), Medium (no shadows, 80% resolution) or Reduced. Touch dragging is supported (touch-action disabled on the map canvas).

## City Builder — Riyadh (V6)
A free-form district east of the City Centre, on a 40 × 40 parcel grid with existing arterials, a wadi and protected landmarks.

- **Build:** drag roads (with a preview of cost, connection and new intersections, then confirm, or tick *Quick build*), avenue upgrades, demolition, homes, business or industry zones at three densities, facilities, and bus routes placed stop by stop.
- **Growth:** a parcel develops only when it has a road connected to the city network, power, water and positive demand. It goes from serviced plot to construction to occupied, and upgrades density when land value and services allow. It empties if conditions are lost. **Inspect** any parcel to see exactly what it is missing.
- **Utilities follow the roads.** The regional grid enters only at the arterial gates, so an isolated solar farm powers nothing, and solar needs batteries for the evening peak. Schools, clinics, parks, training centres, civil defence and the digital hub have a limited reach and capacity, and they can fill up.
- **Traffic:** commuters are routed over your actual roads and bus routes, and congestion settles to an equilibrium. Bus riders depend on stop locations, travel time and frequency, and buses can become crowded. Disconnected roads carry no trips.
- **Demand bars** (R/C/I) open their causes. There are 10 overlays with legends: access, transit, power, water, education, health, environment, land value, unmet needs and traffic.
- **Budget:** fictional credits, with taxes, service funding, upkeep, bus operations and a short-term financing option that states its future cost.
- **Time:** pause, 1× or 3×, with a day/night cycle. The game auto-pauses for challenges and milestones. Undo is available within a month. The city autosaves (with a backup) and resumes after a refresh.
- **Goals:** milestones unlock capabilities (medium and high density, avenues, digital hub, 12/h buses). Planning challenges appear when a problem emerges (a congested corridor, full schools, power or water shortfalls, poor job access) and award insight points when solved.
- **Competitiveness:** city outcomes feed the fictional scenario factors, with explanations and capped effects, marked *City Builder* in the Lens. Observed 2026 data never changes.

**First neighbourhood:**
1. Menu → **🏗 City Builder — Riyadh** (scroll to zoom).
2. **Road** → drag east about 14 parcels from the vertical arterial → **Build**.
3. Drag a second road from its end down to the horizontal arterial → **Build**.
4. **Homes** → drag along one side of the new road → **Build**.
5. **Business** → drag along the other side → **Build**.
6. Press **3×**.
7. Use **Inspect** on a parcel to see its needs, and **🗺 Overlays** to see why.

**Missions:** every mission that offered preset bus lanes now also has **Custom bus route**: choose stops in order along existing roads. Mission 1 accepts any solution that meets its mobility goal. For example, two custom routes (City Centre → Expo and City Centre → Airport) plus frequency earn gold.

## National competitiveness (V5)
- **Dataset** (`competitiveness.js`): source label *IMD World Competitiveness Yearbook 2026 — Saudi Arabia one-page profile; challenges provided by the National Competitiveness Center*. It is versioned and frozen, and includes:
  - reference year and units for every value
  - overall and peer-group rank histories for 2022–2026
  - 4 domains × 20 factors with 2026 scores and ranks
  - 13 economy facts with their data years and PDF ranks
- **Rounded figures:** where the slides round a number, the precise PDF value is used and the rounded slide value is kept as tooltip metadata. The land-area rank "9" is attributed to the slide only.
- **Change annotations:** the "change from previous year" notes are stored as *not transcribed*, because the notation could not be verified.
- **Kept separate:** *Observed* (blue badge), *Simulated* (green), *Forecast* (dashed amber). Playing never changes observed values, and this is tested. The game never calculates a world rank; it shows a fictional **Scenario Competitiveness Index**, the simple average of the 20 factor scores after your mission effects.
- **National Competitiveness Lens** (📊 in the menu and in every mission HUD) has four tabs:
  - **Overview:** rank charts, baseline → scenario → 2030 forecast, and the five arcs.
  - **Domains & factors:** each factor opens the chain *2026 observed baseline → actions taken → scenario change → current in-game result → source and assumptions*, plus where it matters in play.
  - **Economy facts.**
  - **Sources.**
- **Every factor has a gameplay role.** Each is mapped to systems and missions (tested). Live couplings:
  - Attitudes & Values raises transit uptake.
  - Prices adds a 10% price pressure when too many builds run at once.
  - Labor Market adds skilled crews once it is strengthened.
  - Technological Infrastructure improves logistics visibility.
- **Credits:** game currency is shown as **◆ investment credits**, explicitly fictional and not GDP or government spending.

## Riyadh chapter = the five 2026 challenges as campaign arcs (9 missions)
| # | Arc | Mission |
|---|---|---|
| 1 | A · Advance Vision 2030 | Connect for the Opening |
| 2 | D · Private sector | Welcome the World |
| 3 | B · Energy & environment | Power the Next District (solar is useless without a grid connection) |
| 4 | C · Supply-chain hub | **Three Continents, One Network:** freight from the Gulf ports, Red Sea ports and air cargo to Riyadh Dry Port. Freight rail, warehouses and a digital logistics platform, with animated container flows |
| 5 | E · Human capital | **Talent Powers Delivery:** systems work needs skilled crews; academies train them after a delay. Apprenticeships and a research lab are also available |
| 6 | D · Private sector | **Unlock the Investment:** raise Qiddiya's readiness (access, processes, talent, confidence) and choose fictional offer A (fast capital) or B (local partnership) |
| 7 | A · Advance Vision 2030 | Deliver Together |
| 8 | B · Energy & environment | Sandstorm Over Riyadh |
| 9 | A · Advance Vision 2030 | **Connect the Momentum:** link Riyadh to Jeddah and Dammam on the national map before 2030 |

The other regions (West, NEOM, East, South and Beyond 2030) remain a visible progression path after Riyadh.

## Try it
- **Strongest visual moment:**
  1. Open `index.html` (first visit) and watch the opening flight: the Red Sea coast, then the **2026 starting point, 13th of 70**, then Riyadh at dusk.
  2. Press **Play Mission**, choose **Bus rapid transit**, tap **City Centre ↔ Expo 2030 site**, press **Add to plan**, then **End turn**. The new line builds with a before → after caption.
- **First complete loop:** in Mission 1 add **Bus rapid transit** City Centre ↔ Expo and City Centre ↔ King Salman Airport, then **End turn**. On turn 3 add **Boost transit frequency**. Press **End turn** until the result appears.
  - The victory zoom and the Gold medal follow, with the **Competitiveness effect** listed.
  - **Upgrades** lets you spend points.
  - **What If?** rewinds to a decision.
  - Refresh the page mid-mission and choose **Resume** to continue.
  - Press **📊** to see your scenario next to the 2026 baseline.

## Progression
- **Profile** with medals, stars and insight points, saved in the browser. An unfinished mission resumes after a refresh.
- **Upgrade tree.** Each upgrade changes what you can do:
  - *Smart Mobility:* bus priority lanes and a congestion lens.
  - *Resilient Energy:* batteries and storm microgrids.
  - *Talent Accelerator:* an extra crew, an extra response action and fast-track.
  - *Advanced Logistics:* hubs and night deliveries.
  - *Digital Twin Insights:* exact forecasts, a medal prediction and a two-phase storm forecast.
- **What If?** rewinds to any decision so you can try another choice and compare both results side by side.
- **Daily and weekly challenges** use fresh constraints (tight budget, heat wave, visitor surge, car-free pledge, crews on loan) and award bonus points on the first medal.
- **Share card:** a downloadable image showing your medal, measures and the network you built.
- Your best builds from every mission stay in the world, visible on the menu.

## Other features
- **Living world:** pedestrians gather around busy districts and landmarks, and the menu slowly cycles from day to dusk with city lights.
- **Opening flight** over the Red Sea coast to Riyadh at dusk, with city lights. It is skippable and shorter on repeat visits.
- **English and Arabic,** with a mirrored right-to-left layout and Arabic map labels.
- **Reduced-effects setting,** touch-sized controls and a bottom-sheet layout on phones.
- **National simulation (advanced):** the original 2024–2030 simulation is still in the menu. It now starts paused, pauses when you open a project, and labels anything after 2030 as "Beyond 2030 — Future chapter".
- **Future chapters** are shown as planned expansions (Makkah & the West, NEOM, the East, Beyond 2030), with no purchase prompts. Nothing required to win is sold.

## Architecture
| File | Role |
|---|---|
| `data.js` | Geography and the 30 projects |
| `engine.js` | WebGL renderer: terrain, water, shadows, day/night and city lights, mission builds, traffic flows, hazards, bursts, labels |
| `mission.js` | Deterministic, DOM-free, turn-based mission simulation (network, visitors, energy, projects, storm, scoring, forecast, rewind, save) |
| `play_core.js` / `play_mission.js` | Mission-mode interface (menus, HUD, decisions, moments, results) |
| `i18n.js` | English/Arabic text |
| `national_ar.js` | Arabic layer and mirrored layout for the national simulation |
| `sim.js` / `game.js` | National simulation (advanced mode) |
| `city.js` / `city_ui.js` | City Builder simulation (deterministic, DOM-free) / its interface |
| `tests/city.test.js` | 34 checks, including all five City Missions (fail and win paths), plus the Phase 1–3 completion tests, undo, save/load, financing, determinism, scenario hook |
| `tests/competitiveness.test.js` | 24 checks: exact ranks, 20 factors, facts and years, frozen data, observed/simulated/forecast separation |
| `competitiveness.js` / `lens.js` | Versioned source dataset + scenario engine / the Competitiveness Lens |
| `tests/missions.test.js` | `node tests/missions.test.js` runs 54 checks covering all 18 missions (including custom routes): each mission has multiple winning strategies, careless play fails, and rewind, save and board switching work |

## Still a prototype
- Art is procedural low-poly, upgraded in place; there are no authored GLTF models or elevation terrain yet.
- All six chapters are playable. Regional chapters have two missions each; more missions per region would deepen them.
- The national simulation's fixed labels, projects, packages, statuses and common messages are in Arabic (`national_ar.js`, mirrored layout). Some long generated sentences, such as project descriptions and rare log lines, stay in English.
- Sound effects are simple synthesised tones.
- Testing was done in a headless browser; real-device performance and touch feel still need a hands-on pass.
