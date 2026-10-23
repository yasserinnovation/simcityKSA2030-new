# V20 premium render pass

A progressive upgrade of the existing three.js renderer. The engine, the `VisionWorld` API, the simulation, the missions, the controls, the saves and the classic renderer are unchanged. Every addition sits behind the graphics preset, and **Reduced** draws exactly as before: no post target, the original shading, and no models loaded.

Captures: `before/` and `after/` (`node tools/check-premium.js before|after`), 1440 × 900 plus phone 390 × 844. They cover the Kingdom view, the Riyadh plan, the Expo and skyline close views, the West region, night, the desktop UI and the phone.

## What changed

| Area | Change | Tiers |
|---|---|---|
| Presets | Ultra / High / Medium / Reduced (Settings → Graphics). The HD button keeps its meaning: HD means High or Ultra, LITE means Reduced. Ultra steps down to High automatically if it stays below ~35 fps; High drops to Reduced as before. | all |
| Post-processing (`premium.js`) | Multisampled scene target, selective bloom (5–6 level dual filter), aerial perspective from the depth buffer, filmic highlight shoulder, colour grade (cool shadows, warm highlights, gentle S-curve), vignette and dither. | Medium (no haze, light bloom), High, Ultra |
| HDR emitters | Ultra renders to half float. Night facades, beacons, city lights and sun glints on water go above 1.0, so only they bloom, by day as well. Medium and High use an 8-bit target and bloom by night, when every surface is graded dark. | Ultra / Medium, High |
| Soft shadows | Rotated Poisson-disc PCF: 12 taps on High, 16 taps with a 4096 map on Ultra (was a 3 × 3 grid). | High, Ultra |
| Stylized lighting | Wrap on the sun term, cool-tinted shadowed faces, soft sky rim on walls. | Medium and up |
| Night consistency | The pastel neighbourhood houses (`world-cosmetics.js`) now follow the world's cool night grade. Before, they stayed bright at night because the dimming was applied before the sRGB encode. | all |
| Camera | Long region-to-region moves rise in a gentle arc. Only the drawn eye lifts: `camera.dist` and the tested camera states are unchanged. Off on Reduced and with `prefers-reduced-motion`. | Medium and up |
| GLB pipeline (`assets.js`) | Manifest-driven models (Meshy-ready) loaded on demand: Draco, Meshopt and KTX2 decoders; normalised scale; PBR lighting matched to day and night; the engine's sun shadow map received by every model and cast by props; instanced props with LOD files; rigged characters with idle / walk / cheer cross-fades; texture budget per tier. | Medium and up |
| Content | The "Vision Guide", an original stylized explorer (rigged, 3 clips, 27 KB after Meshopt), walks promenades at Expo, New Murabba, ROSHN, King Salman Park and Sports Boulevard in close views. A completion burst nearby makes the guides cheer. | Medium (half the guides), High, Ultra |

## Verification

- `npm test`: all gameplay suites pass.
- `npm run test:render`: both renderers pass, with no console errors.
- `npm run test:tutorial`: the tutorial and City Builder consequence flows pass on desktop and at phone width, in English and Arabic.
- `node tests/premium.smoke.js` (new, 26 checks):
  - every preset boots and draws, and its post state matches;
  - the night bloom frame draws;
  - the HD/LITE toggle keeps its meaning;
  - the GLB manifest loads, characters stand on the plaza, walk, cheer and cross-fade;
  - instanced props load from a second manifest, switch LOD by distance and hide beyond their range;
  - Reduced draws no character;
  - on an emulated phone (390 × 844, touch, DPR 3), the menu, the national map and the City Builder play by tap without errors.

Frame time, Riyadh plan view, local Chrome (ANGLE / Direct3D, integrated GPU), 120 frames per tier. These are observed runs, not guaranteed numbers:

| Preset | Before mean / p95 (ms) | After mean / p95 (ms) |
|---|---:|---:|
| Ultra | — | 44.7 / 50.6 |
| High | 23.2 / 27.2 | 26.2 / 29.8 |
| Medium | 15.9 / 20.3 | 17.3 / 20.7 |
| Reduced | 13.8 / 17.3 | 12.7 / 14.9 |
| Phone (390 × 844, High) | 18.7 | 18.1 |

Post-processing measured on its own costs about +2.9 ms on High and +2.4 ms on Medium.

A half-float target with multisampling cost about 9 ms on this GPU, which is why only Ultra uses one. Ultra is meant for discrete GPUs.

Close views with the guides visible add about 40 draw calls (one per guide plus its contact shadow).

## Known limits

- On Windows/ANGLE, three.js's own PMREM blur shader (the environment map for GLB reflections) logs a harmless Direct3D compiler warning (`X4122`) once, when models first load. It is a warning, not an error.
- The camera near plane (0.1) clips views closer than the game's own minimum zoom (0.25). Only debug captures can reach that.
- Characters find their floor with the engine's `floorAt` query: the highest upward-facing world or landmark surface below 0.0105 at 72 points round each promenade. A manifest `y` overrides it. The query costs about 110 ms once, when models first load in a close view. Diriyah stays out because its ring would cross the enclosure walls.
- No Meshy models are included. The pipeline and the optimiser are ready (see the README, "GLB models"), and the shipped guide and the fixture shade are original, procedurally authored assets.
- The procedural world stays vertex-coloured. "PBR" for it means the existing GGX highlight plus the new lighting terms. Textured PBR applies to GLB models.
- Real-device mobile testing (thermal throttling, touch feel) still needs a hands-on pass. The phone checks here are emulated in desktop Chrome.
