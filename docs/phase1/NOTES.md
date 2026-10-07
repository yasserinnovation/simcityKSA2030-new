# Phase 1 — three.js renderer swap with parity

**Goal:** replace the hand-written WebGL internals of `engine.js` with a three.js `WebGLRenderer` that keeps the exact `window.VisionWorld` API, with no visual or behavioural change. `engine_classic.js` (open `index.html?renderer=classic`) is the untouched original, kept for comparison.

## What changed (engine.js only)
- **Renderer and resources:**
  - three.js `WebGLRenderer` (r186, vendored) owns the GL context, buffers, render targets and draw calls.
  - A real `THREE.PerspectiveCamera` is kept in sync with the game camera, ready for Phase 2.
- **Shaders:** the original shaders run unchanged as `RawShaderMaterial`s:
  - lit mesh with soft PCF shadows (the 3×3 filter is now unrolled, which removes a Direct3D compiler warning)
  - depth, sea, picking, points and lines
- **Passes:** these mirror the old renderer: sun shadow map, then the scene, then ID picking.
  - The shadow map and ID picking each use their own `WebGLRenderTarget`.
  - Picking renders only inside a scissor box under the pointer, as before.
- **InstancedMesh** is used for:
  - trees, ghaf, palms, houses (with and without the rooftop tank) and turbine towers: 639 instances on the national map, more in the City Builder and mission builds;
  - ships, trains, planes and convoys, with matrices updated every frame.
  - Instance colour tints only the parts that varied before: tree foliage, house walls and trim, convoy bodies.
  - The random sequence used to scatter decoration is consumed exactly as before, so every layout is identical.
  - Flow dots, hazards, lights and bursts are still one `THREE.Points` draw call; that is already a single call, so they were not turned into InstancedMesh.
- **Debug:** `?debug=1` shows an fps/ms/draw-call overlay, also available as `VisionWorld.debug.frameStats()`.
- **API:** the `VisionWorld` API is unchanged except for the new optional `debug.frameStats()`. No other game file was edited for this phase.

## Verification
| Check | Result |
|---|---|
| Logic tests (7 suites, 283 checks) | all pass |
| `tests/render.smoke.js`, both renderers | pass: no console errors, canvas not blank (Kingdom view and City Builder) |
| Triangle count, national map | 433,158, identical to classic |
| Picking, 43 landmarks in the 5 default region views, mouse and touch | identical results to classic (every one visible and selects itself) |
| City Builder road drag (real mouse events) | preview shown, road built; `pick()` lands on the exact tile |
| Canvas statistics, Kingdom view | 1,641 vs 1,644 colours; contrast 30.49 vs 30.49 |

## Screenshots: `docs/baseline/` vs `docs/phase1/`
The same 8 views (Kingdom, Riyadh, mission in progress, City Builder; English and Arabic) were taken with the same script. They are visually equivalent. The only differences come from things that move or are random:
- vehicle and plane positions;
- label placement timing;
- in the Phase 1 City Builder shots, a dust storm rolled in (the City Builder's weather is random per new district), so the dust particles and hazard ring appear; that also shows the hazard rendering works.

The screenshots come from headless Chrome on the SwiftShader CPU renderer. Its automatic quality drop applies to both renderers the same way, so these shots show the Reduced look without shadows. On the real GPU, shadows render at High (checked separately).

## Frame times: Kingdom view, 1440×900, vsync off
**Intel integrated GPU (Direct3D 11 via ANGLE):**

| Setting | three.js | classic |
|---|---|---|
| High | 92.9 fps, 10.8 ms | 84.2 fps, 11.9 ms |
| Medium | 179.2 fps, 5.6 ms | 154.4 fps, 6.5 ms |
| Reduced | 205.8 fps, 4.9 ms | 232.9 fps, 4.3 ms |

**SwiftShader (CPU software rendering, a worst case):** three.js 3.1 / 4.2 / 6.2 fps, classic 3.2 / 4.6 / 6.2 fps.

## Download sizes
| Item | Size |
|---|---|
| three.js core (`three.module.js` + `three.core.js`) | 2.07 MB |
| Fonts (Tajawal and IBM Plex Sans Arabic, Arabic and Latin subsets) | 336 KB |
| `models.js` (landmark models) | 1.76 MB |
| `engine.js` | 180 KB |

## Not in Phase 1 (by design)
- PBR materials, tone mapping, HDRI, post-processing (Phase 2)
- Height-mapped terrain and the new water shader (Phase 3)
- GLB loading, wind sway, birds and other life (Phase 4)
- Interface declutter (Phase 5)

Flat-ground assumptions recorded for Phase 3:
- the ground height constant `G` and the `SEA`/`NEI` levels;
- the City Builder layer `G+.011`;
- `pickGround` (a ray against y = G);
- `screenOf` / `project(…, G)`, marker heights, label heights and `W.ground`.
