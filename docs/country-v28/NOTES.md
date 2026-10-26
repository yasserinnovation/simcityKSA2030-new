# V28 Living Kingdom

This update applies the cinematic concept to the actual country renderer. Terrain, settlements, landmarks, reefs and clouds are geometry and remain dimensional while the camera moves. The generated image is not part of the scene.

## Five gaps addressed

1. **Separate oval dunes:** replaced by continuous, asymmetric sand relief with warped crests, variable amplitude and gentle transitions at the national boundary. Tuwaiq is now terrain relief instead of a row of cylindrical stamps.
2. **Flat surrounding land:** added sculpted relief for the surrounding geography, with distinct mountain belts and muted warm colors. Neighboring terrain tapers away from the Saudi boundary to keep the gold rim visible.
3. **Sparse settlements:** expanded the existing national district kit, improved glass facade detail, changed Al Faisaliyah to a square pyramid silhouette, added mosque colonnade detail and strengthened the AlUla composition. Its two carved tomb facades and open Elephant Rock arch are actual meshes.
4. **Simple coast and atmosphere:** added layered reef shelves, raised sand islets, more cargo vessels, sea-surface highlights, a moving Jeddah fountain, and drifting clouds made from a shared implicit surface. Roads and trains follow the displayed terrain-aware curves. Solid islets participate in vessel-route exclusion.
5. **Obscured world:** added a reversible cinematic country mode. It hides labels, HUD and menus, while keeping camera input active. Bottom-edge / touch / keyboard controls reveal the return and AlUla actions. Escape or H restores the interface; modal and mode changes exit it automatically.

## Launch

Extract the full project, close the old server with Ctrl+C, and double-click **Launch_Prototype.bat** in the folder containing **package.json**. Keep the server window open. Use **http://127.0.0.1:8123** and the same browser for existing saves. Press Escape to reveal the **V28 · Living Kingdom** badge.

`npm start` works from that same folder; no npm install or asset download is needed to play. `./launch.sh` supports macOS/Linux. Opening the HTML as a file uses the older classic renderer.

## Actual captures

[Interactive comparison](review.html)

Both comparison images use Chrome 131 headless shell, 1280 × 800, High quality, fixed daylight and decorative animation time, and the same V27 national camera. The screenshots are actual rasterized game output, not generated artwork. `after/showcase.jpg` uses the real cinematic-mode UI behavior; the comparison captures suppress overlays for consistent inspection.

| View | V27 | V28 |
|---|---|---|
| Identical national camera | [Before](before/kingdom-matched.jpg) | [After](after/kingdom-matched.jpg) |
| AlUla, identical camera | [Before](before/alula.jpg) | [After](after/alula.jpg) |
| Northwest | [Before](before/northwest.jpg) | [After](after/northwest.jpg) |
| Riyadh at national detail level | [Before](before/riyadh-national.jpg) | [After](after/riyadh-national.jpg) |

## Compatibility and evidence

The authoritative data, regional plans, project identifiers, simulation/economy code and save schemas are unchanged. The synthetic V27 save fixture was generated using commit `d9bf87dee991b1cc69a80193a17f2158b63e09c7`. Both campaign and city saves load identically and match V27 after three further months of simulation, including resources and progression. Decorative buildings do not count as player construction or generate resources.

Commands: `npm test`, `npm run test:compatibility`, `npm run test:launcher`, `npm run test:showcase`, `npm run test:render`, `npm run test:cinematic`, `npm run test:tutorial`. Development tests need Playwright Core and Chrome/Edge; playing does not.

`npm run check:showcase` records actual screenshots and a short timing sample. `node tools/check-showcase.js before` additionally requires the V27 Git history. Baseline and candidate measurements use the same software renderer and camera; the raw results are in `before/results.json` and `after/results.json`.

## Verification results

All seven test commands above passed: eight logic suites, two V27 compatibility scenarios, three launcher groups, eight renderer checks, cinematic geometry plus eight browser checks, nine country-view groups, and 57 tutorial / City Builder browser checks. After the final road-height and detail-budget changes, the eight-group phone/interaction smoke check passed again. Captures recorded no browser errors or missing requests. [Structured report](validation.json).

The country scene now includes 522 district buildings (V27: 164), two enlarged AlUla tomb facades and an open rock arch, 70 reef patches, 54 raised islets, 21 moving vessels and eight shared-geometry clouds on High. The scene batches small static details and instances traffic and vegetation; Reduced simplifies the terrain and tree geometry, reduces vegetation density, and uses four clouds.

| Quality | V27 mean / p95 frame time | V28 mean / p95 frame time | Main-pass calls V27 → V28 | Main-pass triangles V27 → V28 |
|---|---|---|---|---|
| High | 587.1 / 1053.0 ms | 547.6 / 953.9 ms | 107 → 108 | 537,272 → 870,424 |
| Reduced | 216.7 / 534.5 ms | 247.2 / 978.1 ms | 107 → 104 | 381,900 → 497,472 |

These timings are from CPU-based SwiftShader, Chrome 131, 1280 × 800, with 18 measured frames after six warm-up frames. They are noisy diagnostics, not a GPU benchmark. Reduced has a higher cost than V27 in this sample; sustained desktop-GPU and physical-phone frame rates still need measurement. A smooth frame rate is not claimed.

## Remaining limitations

This is a stylized real-time implementation. Architectural detail, surface textures and atmosphere remain simpler than the generated concept. The national outline and regional anchors retain the game's illustrative geographic layout; the underlying coastal polygon is not a newly surveyed coastline. Most regional planning close-ups retain their previous models; AlUla remains inspectable at close range.

Clouds are sculpted meshes rather than a volumetric ray-marching weather system. Glazing uses a restrained shader reflection rather than a live environment reflection capture. No external models, paid generation jobs or new audio assets are required.

Performance sampling uses CPU-based SwiftShader, with 18 measured frames after six warm-up frames. This is a short diagnostic, not a physical-GPU or phone frame-rate claim. Browser phone checks emulate a viewport and touch input. Node/Python launch behavior is tested with real Linux processes; the Windows batch file is reviewed, not executed on a Windows host.
