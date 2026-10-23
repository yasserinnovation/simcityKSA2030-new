# Assets and credits

Every third-party file shipped with Vision Nexus 2030, with its source and licence. Everything is stored locally, so the game makes no network requests.

| Asset | Path | Source | Licence | Size |
|---|---|---|---|---|
| three.js r186 (core) | `vendor/three/three.module.js`, `vendor/three/three.core.js` | npm `three@0.186.1` (https://threejs.org) | MIT (`vendor/three/LICENSE`) | 2.07 MB |
| Tajawal (400/500/700/800, Arabic + Latin subsets) | `vendor/fonts/Tajawal-*.woff2` | Google Fonts (Boutros Fonts) | SIL Open Font License 1.1 | 0.08 MB |
| IBM Plex Sans Arabic (400/500/600/700, Arabic + Latin subsets) | `vendor/fonts/IBMPlexSansArabic-*.woff2` | Google Fonts (IBM) | SIL Open Font License 1.1 | 0.25 MB |
| three.js r186 add-ons: GLTFLoader, DRACOLoader, KTX2Loader, SkeletonUtils, BufferGeometryUtils, WorkerPool, ColorSpaces, RoomEnvironment | `vendor/three/addons/` | npm `three@0.186.1` (`examples/jsm`) | MIT (`vendor/three/addons/LICENSE`) | 0.25 MB |
| Draco decoder (WASM) | `vendor/three/addons/libs/draco/gltf/` | Google Draco, via npm `three@0.186.1` | Apache-2.0 | 0.6 MB |
| Basis Universal transcoder (WASM) | `vendor/three/addons/libs/basis/` | Binomial Basis Universal, via npm `three@0.186.1` | Apache-2.0 | 0.6 MB |
| meshoptimizer decoder, ktx-parse, zstddec | `vendor/three/addons/libs/` | via npm `three@0.186.1` | MIT | 0.1 MB |
| Vision Guide character (rigged, Idle/Walk/Cheer) | `assets/models/vn_guide.glb` (source: `tools/character/make-guide.js`) | Made for this project (procedural) | Project's own | 27 KB |
| Solar shade canopy (test fixture prop + LOD) | `assets/models/vn_shade.glb`, `vn_shade_lod1.glb` | Made for this project (procedural) | Project's own | 33 KB |
| Landmark models (104 low-poly assets) | `models.js` (source: `VN2030_Assets.blend`, scripts in `tools/blender/`) | Made for this project | Project's own | 1.76 MB |

Development only, not shipped with the game: `playwright-core` (Apache-2.0), used by `tests/render.smoke.js`; `@gltf-transform/cli` (MIT, fetched by npx in `tools/optimize-glb.js`); three.js `GLTFExporter` (MIT, `tools/character/`).

V16 airport and park detail geometry in `visual-details.js` was authored locally for this project. It adds no external assets, official logos or ride branding. The existing Blender source was retained unchanged; this pass exports no new GLB assets.

V17 clay-country cosmetics in `world-cosmetics.js` are locally authored procedural geometry: pastel neighbourhoods, garden terraces, rounded clouds and animated airships. User references guide the style; their image pixels are not shipped or used as textures.

Western-region detail in `west-clay.js` is locally authored procedural geometry inspired by Hejaz heritage and landmarks. The fountain and western neighbourhoods in `world-cosmetics.js` are also original geometry; no tourism photography, logos or third-party model assets were imported. Reference links and the illustrative-placement limits are in `docs/west-clay/NOTES.md`.

Southern landmarks, Al-Jawhara stadium and named Jeddah heritage houses in `scenic-landmarks.js`, plus southern neighbourhoods/mist in `world-cosmetics.js`, are locally authored procedural geometry. The user-supplied stadium photo informs its silhouette and façade. References, placement limits and verification are in `docs/south-landmarks/NOTES.md`; no reference image pixels, logos or third-party meshes are shipped.

Eastern industrial/civic geometry in `east-clay.js` and Gulf neighbourhoods, pumpjack motion and cooling steam in `world-cosmetics.js` are locally authored. The supplied industrial references inform the design; no reference pixels or third-party models are shipped. Source references and verification are in `docs/east-clay/NOTES.md`.

HDRIs, textures and GLB models will be added in later phases. Each one will be listed here with its source and licence (CC0 / Poly Haven only).

NEOM clay pass: original local procedural geometry in neom-clay.js and cosmetic cable cars/Tabuk neighbourhoods in world-cosmetics.js. User-provided references informed the style; no reference image is embedded as an asset. Concept ring gardens are artistic additions.

Kingdom diorama: original local procedural scenery and post-processing in kingdom-diorama.js, with original terrain/water shader updates in engine.js. User-provided reference informed the art direction; no reference image is embedded as a runtime asset.

V19 country overview: original procedural terrain, dune heightfields, merged destination silhouettes, route resurfacing and instanced regional groves. No newly downloaded or generated external assets. Existing data and assets retain their original attribution.

V21 Kingdom map: original procedural geometry in `kingdom-landmarks.js` (landmark clusters, badge icons as inline SVG) and `country-overview.js` (neighbour terrain, oases, palms, mesas, clouds from a generated canvas texture). The user-supplied `refrence.png` guided the art direction; none of its pixels are shipped.
