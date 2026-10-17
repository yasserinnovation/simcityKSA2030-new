# V17 clay-country art pass

Normal three.js gameplay now includes 199 pastel neighbourhood plots with roof trims, teal rooftop panels, windows, garden terraces, rounded trees and contact-shadow shapes. Placement uses VisionLayout.decorAllowed to retain project footprints, road corridors and view corridors. Terrain receives a warmer clay tint across every quality tier. Twelve rounded cloud clusters drift at country zoom; three airships orbit Riyadh, Jeddah and Dammam. They disappear at close inspection. Reduced-motion preferences freeze their motion. Decorative geometry is hidden for picking and shadow passes; no save or simulation state is modified.

Interface chrome uses teal gradients, softer cards and restrained hover movement. The classic renderer retains its original geometry.

Verification: clay-v17/results.json records no browser errors, unchanged preview storage/project state, passing airport/park picking, all eight construction fixtures and Arabic RTL. Both existing renderer smoke paths passed. cosmetics-check.json records the generated object counts and a changing animated raster. Browser frame intervals varied; no speedup or stable target frame rate is claimed. The additional geometry is approximately 71k triangles before the final cloud shading adjustment (which adds no triangles).

These are authored procedural cosmetics inspired by the supplied references, not a recreation of their image quality. The underlying terrain and landmark models retain their existing shapes. Before/after V16 comparison files remain historical evidence; clay-v17/ contains the current art-pass captures. Reproduce with node tools/visual-slice-check.js clay-v17 and node tools/check-clay-world.js (the latter uses the running server on port 8016).
