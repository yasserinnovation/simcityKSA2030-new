# V24 — Cinematic districts

This upgrade keeps the existing vanilla JavaScript, Three.js/WebGL renderer, procedural Saudi world, mission boards and city simulation. Unreal Engine is an art-direction reference; the result is a detailed, stylized miniature city. It does not claim Unreal rendering, ray tracing, Lumen or Nanite.

## Five priorities implemented

1. **Architecture that reads during play.** The old City Builder placed much of its building geometry below the raised parcel surface. The new drawing adapter starts on that surface. Najdi-inspired courtyard villas have screened windows, doors, roof parapets, tanks and pergolas; shops have glazing, signs, awnings and seating. Density upgrades retain distinct silhouettes. All 13 services have recognizable structures: clinic roof markings, school shade canopies, water tanks, solar rows, battery cabinets, a logistics crane and containers, and landscaped parks. Rooftop equipment, courtyard palms and deterministic colour variation add detail without external downloads.
2. **A coherent light/material treatment.** Sandstone, limestone, petrol glass and subdued vegetation replace excessive saturation. Warmer directional light, deeper readable shadows, world-space material grain and restrained sky Fresnel reflections distinguish stone, roads and glazing. High/Ultra add an eight-sample depth-based contact-occlusion pass with a small radius and an 18% darkness cap. Existing soft shadows, bloom, haze, grading and day/night transitions remain. Powered, occupied windows emit warm light at night.
3. **Living streets.** Crossing stripes and slim lamps give road junctions scale. At close zoom, original instanced car/bus models replace traffic dots on Medium and above. Their positions and density use the existing road-load segments and bus paths; this adds no traffic simulation or collision rules. Segment phases and vehicle colours vary deterministically. At distant views and on Reduced, the inexpensive original flow markers remain. Existing walking characters, construction stages and completion effects remain active.
4. **Camera control and framing.** Project inspection frames the selected footprint more closely. Manual pointer, wheel and camera-key input cancels cinematic motion, including pending district-entry camera cuts. OS reduced-motion disables camera interpolation. Form controls keep keyboard input. The opening sequence waits until every script is ready, fixing a race that could skip the first-run tutorial on a slow device.
5. **A consistent interface and soundscape.** Petrol/gold surfaces, compact tool cards, original SVG icons, readable focus indicators and an actual script-loading progress screen. Settings add persistent master volume and a separate wind-ambience switch in English/Arabic. One Web Audio master bus controls existing effects and the original synthesized, gently panning desert wind. Mute silences sounds already playing; hiding the page silences the bus; playback starts only after a user gesture.

## Preserved behaviour and assets

No simulation, economy, progression, mission definition, footprint, route or save-schema change. The art adapter only reads the parcel state. Empty plots and construction stages are still controlled by the game; the comparison district really has 38 occupied plots after 16 ticks. Service inactivity and utility shortages retain their cues. Placement collisions are parcel/footprint validation, not character physics; the existing placement and routing checks remain authoritative.

All existing models, fonts, translations, music-like interaction cues, controls and launchers are included. New architecture, icons, shaders and wind synthesis are original source code; no new external asset license or network service is required. See [asset credits](../../ASSETS_CREDITS.md).

The classic renderer remains available as `?renderer=classic` and is the `file://` fallback. New 3D architecture/material/contact-shading features live in the default Three.js renderer; interface and sound changes also work with classic.

## Launch

1. Download the complete branch and extract it, or check out `codex/cinematic-v24`.
2. In the project directory, run `npm start` with Node.js installed. No dependency installation or build is required to play.
3. Open **http://127.0.0.1:8123**. The badge should read **V24 (Cinematic districts)**.
4. Play the neighbourhood tutorial or choose **City Builder**. High/Ultra show full architecture detail, contact shading and shadows. Settings → Medium/Reduced lowers cost. The original Windows/macOS/Linux launchers also work, with Python as a fallback.

Keep the same browser/local address when upgrading to retain local saves. Sound and quality are in **All options → Settings**; the home-screen sound button mutes immediately. Drag to orbit, right-drag/Shift-drag to pan, wheel/pinch to zoom; WASD/arrows, Q/E and +/- are retained.

## Reproducible comparison

[Open the side-by-side gallery](review.html) while the local server is running: **http://127.0.0.1:8123/docs/cinematic-v24/review.html**.

`node tools/check-cinematic.js before` serves the original runtime files from git revision `202b6871d95482e91348a94cb6fa23229c5f7f86`; `npm run check:cinematic` captures this version. Both use 1280×800, High, fixed camera/time and the same normal simulation operations. The script creates its own server. Baseline capture requires a git checkout containing that revision; the shipped images do not.

The headless host lacks a system colour-emoji font, so some original emoji icons show missing glyphs in the baseline images. The new SVG icons do not depend on that font. Scenery and gameplay state are otherwise compared under the same capture conditions.

For tests only, `npm install` installs `playwright-core`. Use installed Chrome, or set `CHROME_PATH` to a compatible Chromium executable. The captures explicitly use ANGLE/SwiftShader to make the environment clear. Browser UI checks exercise real clicks, drags and key events; the capture script seeds a district through the simulation API for repeatable comparisons.

## Performance strategy and limits

Static world batches are split into local cells only when the camera approaches. Main/picking passes cull against the camera; the depth pass uses the sun frustum so off-camera shadow casters are retained. The national view still uses the original large batches. Use `?culling=off` for diagnostics. Small city details scale with quality, cars and buses share instanced prototypes, and no new large textures or model downloads are introduced. Existing resolution scaling, distance detail, adaptive quality and the four graphics presets remain.

Timing results and final validation are recorded below. Software-rendered timings are diagnostic evidence, not a 30/60 FPS claim for a phone or desktop GPU. Real-device GPU validation remains necessary before setting a minimum hardware target.


## Validation results — 26 October 2026

| Check | Result |
| --- | --- |
| `npm test` | 305 assertions passed across all eight simulation, mission, progression, layout, save and tutorial suites. |
| `npm run test:render` | 8 checks passed; default Three.js and classic both boot and draw Kingdom/City Builder without console errors. Re-run after the startup fix. |
| `npm run test:cinematic` | Geometry contracts and 8 browser checks passed: volume/mute, persistence, camera input, close-up selection, quality gating and phone RTL settings. |
| `npm run test:tutorial` | 57 browser checks passed: full tutorial, real drag placements, invalid locations, utilities, growth, services, bus paths, mode switching, save/resume/isolation and Arabic phone controls. |
| `npm run test:premium` | 25 functional checks passed: all four presets, night, rigged GLB loading, floor placement, walking, cheering/blending, instanced prop LOD, Reduced and phone interaction. One performance assertion failed: **263.7 ms/frame**, versus the test's **<50 ms** threshold, in software-rendered phone emulation. |
| Comparison captures | Before and after completed with zero browser errors and zero failed HTTP asset requests; identical occupied-plot count. |
| Static checks | JavaScript syntax and `git diff --check` passed. |

The test host used Chrome headless shell **131.0.6778.204** with **ANGLE/SwiftShader**, not a hardware GPU. Captured district timings below use 30 measured animation frames per preset after six discarded warm-up frames, at 1280×800. They include browser scheduling and software GPU work. Triangles/draw calls are the reported main scene pass; they exclude shadow and post-processing passes.

| Quality | Before mean / p95 (ms) | After mean / p95 (ms) | Main triangles, before → after | Main draw calls, before → after |
| --- | ---: | ---: | ---: | ---: |
| High | 457.6 / 574.5 | 450.1 / 843.6 | 2,095,519 → 1,535,203 | 73 → 143 |
| Medium | 315.1 / 443.6 | 329.6 / 448.2 | 2,086,323 → 1,521,589 | 72 → 142 |
| Reduced | 247.8 / 378.3 | 223.2 / 445.5 | 1,839,541 → 1,413,010 | 48 → 116 |

High's submitted triangle count falls by about **27%**, despite the richer city; Reduced falls by about **23%**. Local culling increases draw calls and retains extra cell buffers, a deliberate geometry-versus-submission/memory tradeoff. Mean software timing improves slightly on High and by about 10% on Reduced, while Medium and some tail timings are worse. These short software runs do **not** establish a general FPS improvement or certify smooth gameplay on a physical device. The phone performance threshold remains unmet on this host; verify target hardware with the built-in `?debug=1` overlay before release.

Raw reports: [before](before/results.json), [after](after/results.json), [test summary](validation.json). The after gallery also includes [night](after/city-night.jpg) and [Arabic phone settings](after/mobile-settings.jpg).
