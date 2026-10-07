# Assets and credits

Every third-party file shipped with Vision Nexus 2030, with its source and licence. Everything is stored locally, so the game makes no network requests.

| Asset | Path | Source | Licence | Size |
|---|---|---|---|---|
| three.js r186 (core) | `vendor/three/three.module.js`, `vendor/three/three.core.js` | npm `three@0.186.1` (https://threejs.org) | MIT (`vendor/three/LICENSE`) | 2.07 MB |
| Tajawal (400/500/700/800, Arabic + Latin subsets) | `vendor/fonts/Tajawal-*.woff2` | Google Fonts (Boutros Fonts) | SIL Open Font License 1.1 | 0.08 MB |
| IBM Plex Sans Arabic (400/500/600/700, Arabic + Latin subsets) | `vendor/fonts/IBMPlexSansArabic-*.woff2` | Google Fonts (IBM) | SIL Open Font License 1.1 | 0.25 MB |
| Landmark models (104 low-poly assets) | `models.js` (source: `VN2030_Assets.blend`, scripts in `tools/blender/`) | Made for this project | Project's own | 1.76 MB |

Development only, not shipped with the game: `playwright-core` (Apache-2.0), used by `tests/render.smoke.js`.

HDRIs, textures and GLB models will be added in later phases. Each one will be listed here with its source and licence (CC0 / Poly Haven only).
