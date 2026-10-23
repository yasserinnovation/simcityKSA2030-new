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
