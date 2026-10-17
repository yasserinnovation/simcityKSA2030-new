# Vision Nexus 2030 — V16 visual slice

Work date: 10 October 2026. Playable folder: VisionNexus2030-assets. Branch: visual-slice-v16. Existing uncommitted work was retained; no commit includes someone else's changes.

Open [interactive comparison](review.html). Launch the game with the existing Launch_Prototype.bat, or run npm start in this folder. For isolated completed visuals use index.html?preview=complete. Normal gameplay retains actual construction stages.

## Implementation

- Airport: individual aircraft windows/doors, winglets, engine rims; instanced equipment wheels, hubs, tow bars, belt fittings, GPU cable and bus window dividers. Connected glass gate concourses, roof ribs, concrete apron joints, floodlight pylons, hangar cladding and landside planting.
- Park: queue rails were incorrectly placed at G + y even though y already contained G. They were below ground. Rails are now above the paving, with posts, alternate-end switchback connections, connected queue pockets, arrival planting, raised gardens and a seating pergola.
- Coaster: cyclic rail offsets close the seam; arc-length sampling keeps car spacing consistent. Instance matrices include track pitch. Station platforms sit beside the track, with its canopy above the train envelope.
- Rendering: explicit palette roughness assignments and a restrained dielectric GGX highlight replace the uniform glossy highlight. A soft highlight shoulder preserves pale roof detail. This is a custom material response, not a full textured PBR/HDR pipeline.
- Decorative moving vehicles are omitted from the ID pass so they cannot mask a project. Static site detail retains its project's picking identity. Instance buffer replacement disposes owned resources while retaining shared prototype attributes and materials.
- Continuation (opt-in with ?culling=on): static scenery has local spatial batches below camera distance 1.8, built lazily on first approach. Whole triangles, normals, colours and IDs are copied unchanged. Three.js rejects off-screen cells in the main and picking passes. Normal project-focus/regional/national views and the complete shadow pass retain the original batches; an invisible group skips spatial scene traversal there. Normal gameplay keeps the original renderer batches because repeated frame timings were inconsistent. Use ?culling=off to reproduce the same scene without this experiment.
- Existing quality gates remain: architecture on all tiers; close props on High/Medium; tiny detail on High. Global material response applies across Riyadh. No gameplay calculation, road, ID, footprint, save schema or translation source was changed.

## Readiness and provenance

Both expected folders and all named reference/source files were accessed. The provided target newriyadh.jpg was viewed.

- game-dev --version, capabilities --json and doctor --json: command unavailable on PATH. CLI package receipts, sealed GPU captures and credential-status checks are unavailable. No credentials were read or configured.
- Blender executable: C:/Program Files/Blender Foundation/Blender 5.2/blender.exe; --version returned 5.2.2 LTS. No Blender source edit or new export was performed.
- Vendored three.js r186 (credits identify package 0.186.1). Geometry comes from procedural helpers and the compact models.js export of the existing Blender source. No active GLB loader or runtime asset manifest was found. No GLB, HDR, texture or provider asset was added.
- Installed playwright-core and Chrome/Edge were used for local browser captures. No software installation, downloads or paid jobs occurred.
- Blender source SHA-256 remains: d636f749366479a7a4c187718e7b1e562b7140dd0e2a34ec7e0b6904a9b1c0be.
- New visual-details.js provenance: authored locally for this project. Existing asset credits remain applicable.

## Verification

All seven npm test suites passed: missions, city, competitiveness, layout, regions, saves and challenge. The existing render smoke test passed again after spatial culling for three.js and classic, with nonblank Kingdom/City Builder views and no console errors. The final slice capture also reported 0 browser errors.

- Preview leaves local storage unchanged: true.
- Preview leaves renderer project state byte-identical: true.
- Airport and Qiddiya model picking: true (12 sampled visible pixels per site).
- Foundations, structure, exterior and operational fixtures: true (8 checks). Fixture state is changed only inside the disposable test browser context.
- Arabic: lang=ar; dir=rtl.
- Missing requested models: []. Empty starting sites are legitimate design-stage gating, not missing assets.

## Measured performance

Same 1440 × 900 viewport, DPR 1, camera, quality, construction state, fixed daylight (night=0, storm=0) and decorative time (12 seconds). Runs were sequential. Each row samples 120 requestAnimationFrame intervals after 1.8 seconds settling. These are browser presentation/frame intervals, not GPU timer queries or independently verified hardware benchmarks. WebGL returned renderer/vendor WebKit WebGL/WebKit.

The corrected daylight baseline reconstructs the pre-pass shader/site kit while retaining capture-only helpers and instance plumbing. Exact served baseline sources are preserved as before/served-engine.js and before/served-riyadh.js. This is a controlled visual/relative frame comparison, not a pristine Git checkout benchmark. Earlier dusk/overlapping measurements were superseded.

| Camera/state/tier | Median ms before → after | P95 ms before → after | Draw calls | Rendered triangles |
|---|---|---|---|---|
| overview-normal-high | 16.6 → 21.3 | 16.9 → 29.2 | 38 → 191 | 726,992 → 229,518 |
| airport-normal-high | 12.6 → 20.9 | 16.9 → 45.9 | 38 → 91 | 726,992 → 159,801 |
| qiddiya-normal-high | 12.6 → 20.8 | 16.9 → 45.8 | 38 → 82 | 726,992 → 175,349 |
| overview-complete-preview-high | 16.7 → 33.2 | 20.9 → 46.0 | 66 → 220 | 784,447 → 316,944 |
| airport-complete-preview-high | 16.6 → 24.1 | 16.9 → 33.3 | 66 → 120 | 784,447 → 247,227 |
| qiddiya-complete-preview-high | 16.6 → 21.0 | 16.9 → 29.7 | 66 → 111 | 784,447 → 262,775 |
| airport-complete-preview-medium | 8.3 → 12.5 | 12.5 → 16.7 | 60 → 114 | 772,887 → 228,307 |
| qiddiya-complete-preview-medium | 8.3 → 12.4 | 12.4 → 16.6 | 60 → 105 | 772,887 → 243,855 |
| airport-complete-preview-low | 4.4 → 8.4 | 8.5 → 12.8 | 39 → 93 | 606,644 → 187,913 |
| qiddiya-complete-preview-low | 4.3 → 12.4 | 8.4 → 13.0 | 39 → 84 | 606,644 → 203,461 |

The optimized High completed airport/park close-ups measured approximately 41 fps median. Repeated runs varied materially; a reliable frame-rate improvement was not established. The experimental batching is therefore disabled by default. Draw calls increase because the static scene is split into local cells, while submitted triangles decrease substantially. Local static batches also use additional geometry/instance buffers; memory and startup cost were not independently benchmarked.

## Spatial-culling comparison: identical visuals

The unculled and culled runs use the same current engine/site geometry, quality, fixed time, lighting and camera. The switch is ?culling=off versus ?culling=on. The after screenshots show the opt-in path. These sequential browser samples are diagnostic evidence, not hardware or causal proof. Wider-view checks after visiting a close view retained identical draw-call and triangle counts, but their timings also varied; see culling-wide-views.json.

| Camera/tier | Median ms off → on | P95 ms off → on | Submitted triangles off → on |
|---|---|---|---|
| overview-complete-preview-high | 20.8 → 33.2 | 25.2 → 46.0 | 825,450 → 316,944 |
| airport-complete-preview-high | 20.8 → 24.1 | 25.1 → 33.3 | 825,450 → 247,227 |
| qiddiya-complete-preview-high | 20.8 → 21.0 | 25.2 → 29.7 | 825,450 → 262,775 |
| airport-complete-preview-medium | 12.5 → 12.5 | 16.8 → 16.7 | 806,530 → 228,307 |
| qiddiya-complete-preview-medium | 12.6 → 12.4 | 16.8 → 16.6 | 806,530 → 243,855 |
| airport-complete-preview-low | 8.3 → 8.4 | 12.6 → 12.8 | 618,333 → 187,913 |
| qiddiya-complete-preview-low | 8.4 → 12.4 | 12.6 → 13.0 | 618,333 → 203,461 |

Pixel comparison of PNG captures: all Qiddiya images are byte-identical in decoded RGB pixels. Airport High completed view has 0.029% of pixels differing by more than 6 channel levels; its mean absolute channel difference is 0.0056 out of 255. Airport Medium has 0.139% differing pixels. The inspected airport view retains the same visible architecture, services and shadows. Raw raster statistics are in culling-pixel-comparison.json.

## Remaining visual gaps

This is an incremental procedural slice over the existing V15 kits, not a finished photoreal city. Palms, lawns and surrounding houses still have simple silhouettes; airport/park scale is intentionally illustrative. Glass has no real environment-map reflection, and no normal/roughness textures, HDR illumination, physically calibrated exposure, bloom or imported optimized GLB/LOD packages were introduced. Lower tiers preserve silhouettes but omit service/queue micro-detail. No independent hardware performance measurement or sealed Game Development Studio run is available without its CLI.

## Files and evidence

- Engine changes: engine.js (roughness, instance pitch, picking, ownership and capture helpers).
- Site changes: riyadh.js and visual-details.js; loader integration: boot.js.
- Reproduction: node tools/visual-slice-check.js unculled; then node tools/visual-slice-check.js after; node tools/compare-culling.js; node tools/check-culling-views.js; node tools/write-visual-report.js. The earlier pre-detail baseline remains in before/. Run browser capture commands with local browser/network permission.
- Screenshots: before/ and after/. Measurements: before/results.json and after/results.json. Normal, completed preview, all four construction phases and High/Medium/Reduced captures are included.
