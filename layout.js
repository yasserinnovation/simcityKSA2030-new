// Vision Nexus 2030 — map layout and selection rules (pure: no WebGL, testable headlessly).
//  • Every project has a FOOTPRINT: a clear disc that belongs to it. Generic city blocks, palms, trees and other decoration
//    are never placed inside a footprint, a city core, or on a road.
//  • Riyadh uses an ILLUSTRATIVE DISTRICT PLAN (not survey geography): the ten Riyadh projects sit in named districts
//    around a compact tower core, with clear space between them. Other projects keep their mapped positions.
//  • resolvePick() decides what a click/tap selects from what is actually visible under the pointer.
(() => {
  'use strict';
  const D = window.VISION_DATA;
  const PJ = D.projection, KX = PJ.scale * Math.cos(PJ.lat0 * Math.PI / 180), KZ = PJ.scale;
  const geo = (lon, lat) => [(lon - PJ.lon0) * KX, -(lat - PJ.lat0) * KZ];
  const ANCHOR_SPREAD = 3.4;

  // Footprint radius (world units) — the space a project's landmark, progress pad and marker may use.
  const FOOT = {ksip:.16, expo:.11, newmurabba:.10, park:.11, metro:.08, greenriyadh:.10, sports:.08, diriyah:.10, qiddiya:.12, roshn:.10,
    renewables:.13, neom:.10, oxagon:.10, trojena:.09, hydrogen:.12, alula:.12, hajj:.10, masar:.08, jeddahcentral:.08, ceer:.06, lucid:.055,
    eastern:.12, jazan:.08, soudah:.09, redsea:.10, amaala:.08, sindalah:.06, madinah:.08, haramain:.08, green:.09};
  const DEFAULT_R = .09, GAP = .04;
  // Compact downtown towers (Kingdom Centre, Al Faisaliah, CBD) — nothing else is built inside a city core.
  const CORE = {Riyadh:.13, Jeddah:.06, Makkah:.11, Madinah:.10, Dammam:.08};
  // Illustrative Riyadh district plan: offsets from the city centre (east +x, south +z).
  // Solved so that districts sit between the four intercity roads leaving Riyadh (bearings ≈ −147°, −14°, 108°, 132°).
  const RIYADH_PLAN = {
    newmurabba:[-.05,-.28],   // New downtown, just north of the core
    ksip:[.06,-.58],          // Airport district, far north
    expo:[.34,-.40],          // Expo grounds, north-east
    park:[.28,.07],           // King Salman Park, east of the core
    greenriyadh:[.32,.34],    // Green Riyadh belt, south-east
    metro:[.03,.27],          // Metro depot and interchange, south
    qiddiya:[-.44,.28],       // Qiddiya on the Tuwaiq escarpment, south-west
    diriyah:[-.38,.01],       // Diriyah heritage district, west
    sports:[-.51,-.17],       // Sports Boulevard, west
    roshn:[-.24,-.49]         // ROSHN communities, north-west
  };
  // The City Builder's own district east of the core (city_ui.js setupGrid: centre core + (1.02, .12), 40 tiles × .027).
  // No Riyadh district footprint may enter it. (It already spans Hofuf and the Al-Ahsa oasis far to the east; that
  // pre-existing overlap is left as is so the national view keeps Hofuf's look.)
  const RESERVED = [{name:'City Builder district', anchor:'Riyadh', x0:.48, x1:1.56, z0:-.42, z1:.66}];
  // Small illustrative offsets that keep a project clear of the landmark core of the city it belongs to.
  const NUDGE = {madinah:[.24,.02], jeddahcentral:[.12,-.16], hajj:[.10,.12], masar:[-.08,.30]};
  // Projects that sit on their own intercity corridor: that road may pass through their footprint (it serves them).
  // Riyadh's district plan has no such exception — no road crosses a Riyadh project.
  const ROAD_SERVED = new Set(['alula','madinah','jeddahcentral','haramain','ceer','lucid','jazan','soudah','green','neom','oxagon','hajj','masar','renewables']);
  // Shorter names used when a full label does not fit.
  const SHORT = {ksip:'KSIA Airport', hajj:'Hajj', haramain:'Haramain Rail', jazan:'Jazan Industry', lucid:'EV Factory', renewables:'Renewables',
    green:'Green Initiative', eastern:'East Energy', ceer:'Ceer', hydrogen:'NEOM H2', roshn:'ROSHN', alula:'AlUla', expo:'Expo 2030', park:'KS Park',
    greenriyadh:'Green Riyadh', newmurabba:'New Murabba', metro:'Metro', sports:'Sports Blvd', qiddiya:'Qiddiya', jeddahcentral:'Jeddah Central',
    madinah:'Rua Al Madinah', masar:'Masar', soudah:'Soudah', redsea:'Red Sea', amaala:'AMAALA', trojena:'Trojena', oxagon:'Oxagon', neom:'THE LINE', sindalah:'Sindalah', diriyah:'Diriyah'};

  const cities = {}; for (const c of D.cities) { const [x, z] = geo(c.lon, c.lat); cities[c.name] = {name:c.name, x, z, size:c.size}; }
  // Resolve positions: Riyadh plan → anchored spread → mapped lon/lat.
  const projects = {};
  for (const p of D.projects) {
    let [x, z] = geo(p.lon, p.lat);
    const a = p.anchor && cities[p.anchor];
    if (p.anchor === 'Riyadh' && RIYADH_PLAN[p.id]) { x = a.x + RIYADH_PLAN[p.id][0]; z = a.z + RIYADH_PLAN[p.id][1]; }
    else if (a) { const s = p.spread || ANCHOR_SPREAD; x = a.x + (x - a.x) * s; z = a.z + (z - a.z) * s; }
    if (NUDGE[p.id]) { x += NUDGE[p.id][0]; z += NUDGE[p.id][1]; }
    const r = FOOT[p.id] || DEFAULT_R;
    // Progress pad and marker sit on the camera-facing (south, +z) edge of the footprint, so the landmark never hides them
    // from the default views; the landmark itself stays at the centre.
    projects[p.id] = {id:p.id, x, z, r, pad:[x, z + r * .72], illustrative:p.anchor === 'Riyadh' && !!RIYADH_PLAN[p.id]};
  }
  const reservedRects = RESERVED.map(r => { const a = cities[r.anchor]; return {name:r.name, x0:a.x + r.x0, x1:a.x + r.x1, z0:a.z + r.z0, z1:a.z + r.z1}; });
  const cores = Object.entries(CORE).map(([name, r]) => ({name, x:cities[name].x, z:cities[name].z, r}));
  const roads = D.roads.map(r => r.map(w => typeof w === 'string' ? [cities[w].x, cities[w].z] : geo(w[0], w[1])));
  const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  const roadDist = (x, z) => { let d = Infinity; for (const r of roads) for (let i = 1; i < r.length; i++) d = Math.min(d, segDist(x, z, r[i - 1], r[i])); return d; };
  // Which project's footprint contains a point (used to tag geometry for picking); null when none.
  function footprintAt(x, z){ let best = null, bd = Infinity; for (const p of Object.values(projects)) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r && d < bd) { bd = d; best = p.id; } } return best; }
  // Decoration (generic blocks, palms, trees) may only go where it cannot be mistaken for — or cover — a project.
  const inReserved = (x, z, pad = 0) => reservedRects.some(r => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
  // `tall` decoration (palms, trees) also keeps a view corridor clear on the camera-facing (south) side of each footprint,
  // so it cannot stand between the planning cameras and a project.
  function decorAllowed(x, z, margin = .02, roadClear = .028, tall = false){
    for (const p of Object.values(projects)) { if (Math.hypot(x - p.x, z - p.z) < p.r + margin) return false;
      if (tall && z > p.z && z - p.z < p.r + .16 && Math.abs(x - p.x) < p.r + .03) return false; }
    for (const c of cores) if (Math.hypot(x - c.x, z - c.z) < c.r + margin * .5) return false;
    return roadDist(x, z) >= roadClear;
  }
  // Mission-only sites (dry port, rail gateways…) are drawn where they belong but nudged out of any project footprint,
  // so their marker and label never sit on a project. Mission rules keep using lon/lat; only the drawing moves.
  function clearOf(x, z, r = .05){
    for (let pass = 0; pass < 4; pass++) { let moved = false;
      for (const p of Object.values(projects)) { const d = Math.hypot(x - p.x, z - p.z), need = p.r + r + .01; if (d < need) { const k = d > 1e-6 ? need / d : 1; x = p.x + (x - p.x) * k; z = p.z + (z - p.z) * k + (d > 1e-6 ? 0 : need); moved = true; } }
      if (!moved) break; }
    return [x, z];
  }
  const insideCore = (name, x, z) => { const c = cores.find(c => c.name === name); return !!c && Math.hypot(x - c.x, z - c.z) < c.r; };

  // Pick resolution. Inputs are what the renderer measured under the pointer:
  //   center: project id of the front-most pixel at the pointer (depth-tested ID buffer), or null
  //   around: [{id, d}] project pixels within the tolerance radius (d = pixel distance from the pointer)
  //   markers: [{id, d}] project markers (beacons) within the tolerance radius
  //   cluster: optional list of project ids when the view is clustered (Kingdom overview)
  // Returns {select:id} | {choose:[ids]} | null. The front-most visible object always wins over a nearby marker.
  function resolvePick({center = null, around = [], markers = [], cluster = null} = {}){
    const withCluster = id => cluster && cluster.length > 1 && cluster.includes(id) ? {choose:cluster.slice()} : {select:id};
    if (center) return withCluster(center);
    const near = [...new Map(around.slice().sort((a, b) => a.d - b.d).map(h => [h.id, h])).values()];
    if (near.length === 1) return withCluster(near[0].id);
    if (near.length > 1) return near[0].d * 2 <= near[1].d ? withCluster(near[0].id) : {choose:near.map(h => h.id)};
    const mk = [...new Map(markers.slice().sort((a, b) => a.d - b.d).map(h => [h.id, h])).values()];
    if (mk.length === 1) return withCluster(mk[0].id);
    if (mk.length > 1) return mk[0].d * 2 <= mk[1].d ? withCluster(mk[0].id) : {choose:mk.map(h => h.id)};
    return null;
  }

  window.VisionLayout = {clearOf, reservedRects, inReserved, FOOT, CORE, GAP, RIYADH_PLAN, NUDGE, ROAD_SERVED, SHORT, projects, cores, roads, geo, footprintAt, decorAllowed, insideCore, roadDist, resolvePick};
})();
