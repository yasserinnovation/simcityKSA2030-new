# Kingdom diorama pass

The active three.js game now uses `kingdom-diorama.js`, original procedural scenery, alongside the earlier regional landmark modules. No external assets or paid provider jobs were used. No campaign IDs, progress rules or saved-state formats changed.

Water now transitions from turquoise shallows to deep navy. The shader adds reef mottling and stronger animated surf; merged geometric reef gardens, sandbars and coral clusters hug the two game coastlines. New layered cargo ships, yachts and sailboats drift along the coastal routes. Decorative reef placements are illustrative, not marine survey data.

The national border uses nested additive gold ribbons following every vertex of the existing `VISION_DATA.saudi` polygon. This preserves the game's geography; it does not replace its simplified outline with survey-accurate GIS boundaries. Neighbouring ground is muted to give Saudi Arabia stronger visual separation.

Additional western ridges use the existing geological generator on an independent seeded stream, avoid regional plans and roads, and reserve their footprints from dunes. The Empty Quarter's existing sculpted height fields gain fine shader ripple shading. Southwest plantation terraces, date palms and central farming circles are original miniature geometry with layout clearance checks.

Intercity viaduct decks and supports follow existing route segments. Thirty cosmetic vehicles/trains move along existing road and rail polylines. No simulation traffic was altered. The inherited polylines remain; this pass does not replace them with a new curved road-routing system.

Ten rounded, vertex-shaded cloud clusters drift at multiple altitudes. Their soft ground projections move with the same cloud centers and sun direction, and appear only when their projected footprint stays on Saudi land. These are approximate projected shadows rather than volumetric ray tracing. All new movement respects reduced-motion preferences. Clouds and tilt-shift appear at Kingdom zoom; close inspection remains sharp.

One post-processing render target gives a restrained tilt-shift blur and vignette at wide zoom. Regional views bypass it, labels and UI remain sharp, and the picking buffer bypasses all decorative effects. Each animated ship, cloud cluster and vehicle is batched into one vertex-coloured draw. Frame diagnostics include the main scene plus the post-process pass.

This is implemented in the existing browser renderer. The request's Unreal Engine 5, Octane, HDR/global-illumination and 8K terms were treated as visual references: no engine migration, path tracing, true volumetric clouds or native 8K render is claimed. Comparison images are 1920 × 1080, 16:9, at matched cameras, fixed daylight and High quality.

Validation: five before/after map views; eight selectable project/place targets, six GPU picking samples each; no browser errors; complete-preview leaves project states and local storage unchanged. All seven gameplay suites passed. Both three.js and classic renderer smoke checks passed. Detailed results: `after/results.json`. No frame-rate improvement is claimed.
