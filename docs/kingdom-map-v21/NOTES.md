# V21 Kingdom map: reference look

The National Simulation's Kingdom view, rebuilt toward `../../refrence.png` (the parent folder's reference image). Geography, city and project positions, IDs, picking, routes and gameplay are unchanged. Everything here appears only on the national overview (camera distance > 6); regional and city views are untouched.

| Element | Change | Where |
|---|---|---|
| Framing | The Kingdom view is closer (distance 14.4 → 11.2), centred slightly south, so Saudi fills the screen as in the reference. | `engine.js` |
| Seas | Turquoise shallows, vivid cyan-blue mid water, saturated deep blue, white surf on every coast; open ocean past the world's edge. | `engine.js` (water shader, clear colour) |
| Neighbours | New procedural terrain: warm tan desert with ridged terracotta mountains, flat at the coasts, below Saudi's raised plateau. | `country-overview.js` |
| Saudi land | Golden-orange desert with tone variation, terracotta rock, lush highland green; a wide glowing gold border. | `country-overview.js` |
| Vegetation | 26 oases (turquoise pond, green rim, ring of palms) and palm groves round every city (instanced, one draw call). The V19 ghaf dots are hidden on this view. | `country-overview.js` |
| Highways | Light carriageways with a soft sand shadow and gold centre dashes, on the existing intercity routes. | `country-overview.js` |
| Landmarks | Riyadh (Kingdom Centre, Al Faisaliah, glass skyline, Najdi quarter); Jeddah (Jeddah Tower, waterfront, port, ships); Makkah (Haram, Kaaba, minarets, clock tower); Madinah (Prophet's Mosque, green dome); Dammam (towers, refinery, harbour, tankers, offshore platform); NEOM (The Line, marina); AlUla (sandstone formations, carved tomb); towns, Aseer villages, Jazan port. | `kingdom-landmarks.js` |
| Desert detail | Terracotta mesas, camel caravans, three solar fields, a wind farm near Sakakah. | `country-overview.js` |
| Clouds | Painted cloud sprites round the map's edges, and mist over Aseer. | `country-overview.js` |
| Badges | NEOM, AlUla, Tabuk, Sakakah, Madinah, Jeddah, Makkah, Riyadh, Dammam, Aseer and Jazan, in the reference's colours and icons, in English and Arabic. A click opens the region (Sakakah has none). They replace the region and city chips on this view. | `kingdom-landmarks.js`, `engine.js`, `styles.css` |
| Labels | Neighbour names in soft white; sea names in light italic. | `styles.css` |
| Bottom bar | Six glossy rounded buttons: Kingdom, Riyadh, Makkah & West (Kaaba icon), NEOM & Northwest, Eastern, Aseer & South. Gold when active, translated into Arabic, two-line labels on phones. | `index.html`, `styles.css`, `national_ar.js` |
| Tilt-shift | Off on this view, so the map is crisp edge to edge. | `styles.css` |

## Verification

- All test suites pass: `npm test`, `test:render`, `test:tutorial` and `test:premium`.
- `node tools/check-kingdom-map.js after`:
  - no console errors;
  - the Riyadh badge click opens the Riyadh view;
  - captures in English and Arabic, on desktop and phone.

Kingdom view frame time (ms), local Chrome, integrated GPU (observed runs). The closer framing puts less of the world on screen, which offsets the added detail:

| Preset | Before | After |
|---|---:|---:|
| High | 21.7 | 18.7 |
| Medium | 15.6 | 12.9 |
| Reduced | 9.5 | 9.1 |
| Phone, emulated | 19.0 | 15.8 |

## Remaining gaps

- The reference is a painted illustration. This is real-time low-poly geometry with baked lighting, so it matches the palette, composition and elements, not painterly texture detail.
- The Empty Quarter dunes keep the V19 ridge pattern.
- Badge positions are hand-tuned offsets. On very narrow screens, badges that would collide are hidden, as the existing label placer does.
- The landmarks are original stylized interpretations, not architectural replicas, and use no logos.

## V22 pass (Kingdom diorama)

V21 kept the near top-down camera and small props, so it still looked like the old map. V22 changes the presentation only. Geography, IDs, gameplay, the regional views and the click targets are unchanged.

| Area | Change | Where |
|---|---|---|
| Camera | Tilted to elevation 0.82 (was 1.02) at dist 9. Portrait screens pull back more (`regionFit` exponent 0.66) and centre lower (`regionZ`). | `engine.js` |
| Landmarks | Footprints ×2.5, heights ×3.3 and spread ×2.2 (were ×1.75 / ×1.35). Kingdom Centre and Jeddah Tower are shortened so they don't read as needles. | `kingdom-landmarks.js` |
| Terrain | A broad, ridged red-rock Hejaz escarpment, plus rugged hills over the western shield. Broken crescent dunes replace the ridge stripes. Stronger sun/shade with cool shadows. Finer grid (.04). | `country-overview.js` |
| Plateau | A terracotta cliff skirt along the border, and an unlit gold rim with a bright core. | `country-overview.js` |
| Vegetation | 44 oases, palm belts along the highways, 56 farm circles (Qassim, Al-Jouf, Hail, Wadi al-Dawasir, Al-Ahsa) and about 1,250 shaded low-poly trees in Aseer and round Madinah. | `country-overview.js` |
| Colour fix | MeshBasic output is sRGB-encoded while these colours are display-space, so the basic materials (palms, trees, ships, rim) now get linear colours. In V21 they looked washed out and grey. | `country-overview.js` |
| Neighbours | Finer, sharper ridges with more contrast. Polygons drawn on to lat 37.5, so the tilted view never shows their end. | `country-overview.js` |
| Clouds | Domed cartoon cumulus, lit from the upper left, in the corners of the frame. | `country-overview.js` |
| Labels | Removed an old `opacity:.65!important` on overview country names. It overrode the placer's hide, so hidden names stayed on screen at stale positions ("Yemen" by Iran). Badges are a little larger. | `styles.css` |
| Engine mist | The engine's Aseer mist moved to the detail layer (dist < 7.2), so the taller overview mountains don't cut through it. | `engine.js` |

Captures: `v22/` (`node tools/check-kingdom-map.js v22`). All test suites pass. No console errors, and the badge click opens the Riyadh view.

Frame time, Kingdom view (ms, observed runs):

| Preset | V21 | V22 |
|---|---:|---:|
| High | 18.7 | 22.5 |
| Medium | 12.9 | 14.3 |
| Reduced | 9.1 | 11.1 |
| Phone, emulated | 15.8 | 18.3 |

The extra cost comes from the denser terrain and neighbours (about 48k + 123k triangles on High) and the vegetation. High stays close to the V19 Kingdom view (21.7 ms).

Remaining gaps: it's still low-poly, not painted. On phones, Makkah, Tabuk and Sakakah give way to nearby badges.

## V22b (brief from `bad.png`)

`bad.png` showed the V19 overview (old region labels, striped dunes, flat camera) under the new V21 bottom bar. The browser had served old cached scripts with the new page: Python's `http.server` sends no cache headers. Fixes:
- `boot.js` loads every script as `name.js?v=BUILD`, and `index.html` stamps `boot.js` and `styles.css` the same way. Bump `BUILD` with each build.
- `Launch_Prototype.bat` and `launch.sh` now prefer `node tools/serve.js`, which sends `Cache-Control: no-cache`.

Visual additions against the brief:
- **Water:** narrower, broken turquoise shallows with reef patches, so the coast no longer has a cyan halo.
- **Islands:** 30 islands with reefs (Red Sea Global, Al Wajh, Farasan, the Gulf).
- **Rail:** corridors from `D.rails`, drawn as ballast, sleepers and steel, beside the highways.
- **Airports:** runways and terminals at Jeddah, Riyadh, Dammam and Madinah.
- **Contact shadows:** under the five big city clusters.
- **Neighbours:** 30% less saturated.
- **Roads:** fixed: their strips faced downward, so the baked light greyed them out.
- **Navigation:** larger bottom-nav icons on wide screens.

All test suites pass, with no console errors, and the badge click works. Frame times were noisy because the game was also open in a browser on the same GPU: High measured 23 to 31 ms over three runs, against 22.5 ms for V22.

## V23 (brief from `Screenshot 2026-10-24 011736.png`)

`refrence(5).png` was not on this computer, so `refrence.png` was used as the target.

| Area | Change |
|---|---|
| Composition | The main menu is now a drawer. By default it shows a compact summary (mission, Play, City Builder, tutorial) with an "All options" button, docked in the open-sea corner: Red Sea side in English, Arabian Sea side in Arabic. When expanded, the camera shifts and zooms out so the map moves away from it. Progress is untouched: the drawer only re-renders the menu. The menu has the six-button region bar. The menu's day/night cycle is removed, because it was greying the map. Phones: a smaller summary, and the map lifted above it. |
| Camera | Every Kingdom view goes through `VisionWorld.kingdomCam(speed, dx, zoom, dz)`. |
| Border | One thin warm-gold line with a faint halo, instead of the stacked bright strips. |
| Terrain | Quieter, paler neighbours. The lumpy "western shield" is mostly removed. The western ranges get stratified ledges and cliff bands. The Tuwaiq escarpment is a chain of layered cliff blocks along its real line. |
| Vegetation | 16 named oases (Al-Ahsa, Al-Kharj, Qassim, Hail, Tayma, Khaybar, AlUla, Dumat al-Jandal, Tabuk, Najran, Bisha, Wadi al-Dawasir, Aflaj, Majmaah, Sakakah, Abha foothills) in irregular clumps, with water only at Al-Ahsa, Tayma and Dumat. Three palm silhouettes. Roadside palms only near towns. The random palm-and-pond bundles are gone. |
| Cities | Jeddah is anchored on its coast. The Makkah district moves inland, apart from Jeddah. |
| Roads and rail | Displayed routes are smoothed (Chaikin), with subtler centre markings. |
| Clouds | Three irregular textures with layered puffs and soft rims. |
| Boot | The neighbour coast fade reads a precomputed land mask. It used to run ~17 polygon tests per vertex, about 19 s of boot. |

Verification:
- `npm test`: passes.
- `npm run test:tutorial`: both suites pass.
- `node tools/check-kingdom-map.js v23`: no console errors, and the badge click opens Riyadh.
- `npm run test:render` and `npm run test:premium` **failed** in this session. Their 30-second boot wait timed out: the machine was loaded, with game tabs open in Chrome and other apps. Under the same load the committed V21 build took 56 s to boot, against 45 s for V23. Re-run both on an idle machine.
- Frame times from the same loaded runs are not meaningful.

Remaining gaps:
- Landmarks are authored from primitives; there are no detailed models. Kingdom Centre, Al Faisaliah, the PIF Tower, Masmak, the Haram, the green dome and Jeddah Tower are stylized silhouettes, not modelled architecture.
- No Aseer terraces or waterfalls, no NEOM bridges, no AlUla rock-cut facades in detail, and no mountain switchbacks or road bridges.
- Lighting is baked into vertex colours: no real-time shadows or ambient occlusion on this view, and no texture maps.
- The neighbouring terrain is a smooth heightfield, so it stays soft rather than crisp.
