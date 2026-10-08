# Vision Nexus 2030 — The Kingdom in Motion (build V11 — miniature world)

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

## Miniature-world polish (build V11)

Art direction: the illustrated Saudi map (`refrence.png`, kept outside the repository) for colour relationships, regional character and interface quality. It is treated as inspiration, not geography: nothing was moved, re-scaled or added to match it. V11 changes only colours, marker sizes, interface styling and a help control. **Palette and lighting cannot reproduce the reference's illustrated architecture**; that needs the new assets proposed below.

- **Interface (A):** a localized **"?" map-controls help** (`help.js`) replaces the browser tooltip that covered the map edge. It finds a free spot beside the HUD, opens in English or Arabic and closes on Esc or a click on the map. Navigator titles are limited to two lines (full name when selected). KPI labels wrap to two short lines below 1280px instead of being cut off.
- **Marker hierarchy (A):** idle projects get a smaller head, thinner pedestal tiers and a shorter stalk, so buildings lead. Selected, hovered, active and warning (blocked or waiting) projects keep a prominent head. Cluster beacons and footprint outlines are quieter. Selection targets are unchanged (footprint picking and the head, wherever it is drawn). The selection outline gains a navy keyline so it reads on light trees.
- **Light, water, border (B):** the broad stepped yellow border becomes a thin, muted gold outline that is weaker than the selection outline. It came from a yellow base showing between the border grid cells; that base is now sand. Cliff lips are sand-coloured. Water shades from turquoise to blue over a wider distance, so the shoreline no longer shows triangular patches, and the foam and glints are quieter. Shadows are a little softer, and dunes sit just below the sand tone.
- **Regions (C):** Hejaz mountains are terracotta, Northwest ranges pale stone, eastern hills cooler and paler, and the southern forest escarpment a richer green with deeper rock behind it. The Riyadh escarpment and Tuwaiq terraces, the strongest orange on the plan, are muted toward warm sand. Same rocks in the same places, with the same random sequence.
- **Effects:** unchanged from V10 and still tied to real events: the interruptible camera, the gold ripple and caption on real completions (never replayed after a reload), off on Reduced and with reduced motion.

Screenshots: `docs/style-before-v11/` (V10) and `docs/style-v11/` (V11) use identical seeds, camera views, game state and High quality. They cover Kingdom, Riyadh, a selection, West, NEOM/Northwest, East, South, mission, City Builder and a 1100×700 window, in EN and AR, plus `7_help_*` for the help panel. Side by side: `docs/style-compare-v11/`.

Frame rate (Intel integrated GPU, D3D11, 1440×900, vsync off, two alternating runs per build): Kingdom High 93.7–94.1 (V10) vs 94.0–94.1 (V11); Medium 175.2–175.5 vs 174.7–177.5; Reduced 201.8–205.3 vs 201.6–204.6. Riyadh High 95.7–144.4 vs 98.1–98.2 (the 144 is a one-off spike); Medium 185.9–186.9 vs 185.8–186.2; Reduced 206.4–207.9 vs 208.5–209.5. No measurable change.

**Asset proposal (not done; each needs new models or textures):**
| Asset | Region / place | Visual benefit | Expected cost | Gameplay and selection |
|---|---|---|---|---|
| Sculpted mountain set (3–4 rugged rock meshes in place of blob + cone) | Hejaz, Northwest, Aseer ranges | Rugged, layered mountains like the reference, without orange "piles" | Similar triangle count if instanced; one shared mesh per type | Decorative only, placed by the existing `range()` positions; never on footprints |
| Landmark detail models (Kaaba precinct, Prophet's Mosque domes, Kingdom Centre, Jeddah Tower) | Makkah, Madinah, Riyadh, Jeddah | Recognisable silhouettes at city scale | +20–60k triangles total | Same footprint, same `p.x/p.z` and pick id; size fitted with `fitFoot` |
| Sand ripple and rock-strata ground texture (one tiling texture) | Kingdom surface, cliffs | Painted terrain variation instead of flat colour | One texture fetch per fragment; about 1 MB | Ground only; picking unaffected |
| Window light (emissive) maps for towers | Riyadh, Jeddah, Dammam skylines | Warm lit windows at night | One small texture; no new pass | Visual only |
| Low-poly palm and acacia variants, ports and ships with more detail | Coasts, oases, Jubail, Jeddah | Richer coasts and oases | Instanced; small | Decor stays off parcels (`LY.decorAllowed`) |
| Custom icon set for region navigation and the action bar (SVG) | Interface | Consistent icons instead of emoji | Negligible | Same buttons and labels |

**Remaining limitations:** the classic renderer (`?renderer=classic`) gets the interface changes but not the V11 world colours or markers. Mountains are still blob + cone shapes, only recoloured. The City Builder toolbar still scrolls sideways at about 1440px. Emoji icons remain.

## Navy & gold art direction (build V10)

One palette for the interface and the world: navy `#142D46`, teal `#176B70`, gold `#E8B75A`, panels `#F7F3E9`, sand `#DCC398`, terracotta `#B97852`, vegetation `#62865A`, shallow water `#49BFC3`, deep water `#176C99`.

- **Interface:** compact navy bars (top bar, bottom bar, mission and City Builder toolbars, mode switcher) with white text and translucent KPI tiles; warm-white information cards; gold only for the selected item, the objective and the key action (End turn, Start); hover lift and pressed states; softly shadowed map labels. Tajawal / IBM Plex Sans Arabic as before.
- **World (three.js renderer):** warm sun with cool sky fill, so lit sand is golden and shadows are cool and readable; stronger contact darkening grounds buildings; controlled saturation; fainter cloud shadows; sea from shallow teal to deep blue with brighter foam and glints; neighbouring countries paler so the Kingdom reads first.
- **Regional tones** (same places, same geometry): terracotta Hejaz, pale-stone northwest, cooler eastern coastal flats, richer Aseer greens, warm Riyadh desert.
- **Completion:** the existing completion burst now leads with gold and draws one expanding gold ring on the ground; the confirmation caption gets a one-shot gold ripple. Both run only from the real completion events and are off with reduced motion.
- Screenshots: `docs/style-v10/`, side by side with V9 in `docs/style-compare-v10/`.
- Measured frame rate (Intel integrated GPU, D3D11, 1440×900, vsync off, two alternating runs per build, V9 → V10): Kingdom High 87.0–87.2 → 86.2–86.4; Kingdom Medium 130.6–133.2 → 120.9–125.1; Kingdom Reduced 118.5–124.6 → 116.5–119.5; Riyadh High 86.5–102.6 → 84.3–109.7; Riyadh Medium 134.7–145.9 → 130.5–143.1; Riyadh Reduced 129.7–130.9 → 136.2–137.0.
- Not done (needs new models or textures): authored building models, ground textures, window emissive maps, a custom icon set in place of emoji. The classic renderer (`?renderer=classic`) keeps its own lighting.

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
