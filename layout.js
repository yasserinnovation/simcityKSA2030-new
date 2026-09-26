// Vision Nexus 2030 — map layout and selection rules (pure: no WebGL, testable headlessly).
//  • Every project owns a FOOTPRINT (a circle, or a ribbon for linear places such as Sports Boulevard and Green Riyadh).
//    Generic blocks, palms, trees and other decoration are never placed inside a footprint, a city core, a road, the
//    metro track or the wadi.
//  • Riyadh follows a STYLIZED NORTH-UP PLANNING MAP (not surveyed geography): King Fahd Road is the north–south spine,
//    King Salman Road the northern axis, King Khalid Road the western flank, the Northern Ring Road and Sports Boulevard
//    mid-map corridors. Other projects keep their mapped positions.
//  • Only the drawing moves. The simulation and missions keep using lon/lat, and the City Builder picks the landmarks of
//    a new city in a frozen logical frame (cityAnchorFrame), so balance and saves are untouched.
//  • resolvePick() decides what a click/tap selects from what is actually visible under the pointer.
(() => {
  'use strict';
  const D = window.VISION_DATA;
  const PJ = D.projection, KX = PJ.scale * Math.cos(PJ.lat0 * Math.PI / 180), KZ = PJ.scale;
  const geo = (lon, lat) => [(lon - PJ.lon0) * KX, -(lat - PJ.lat0) * KZ];
  const ANCHOR_SPREAD = 3.4;
  const GAP = .04, ROAD_CLEAR = .015, DEFAULT_R = .09;

  const cities = {}; for (const c of D.cities) { const [x, z] = geo(c.lon, c.lat); cities[c.name] = {name:c.name, x, z, size:c.size}; }
  const RY = cities.Riyadh;
  const R = (dx, dz) => [RY.x + dx, RY.z + dz];                       // Riyadh plan offset → world
  const Rs = pts => pts.map(([a, b]) => R(a, b));

  // ---------------------------------------------------------------- the Riyadh plan (offsets: +x east, −z north)
  // Five main corridors (plus the road that curves back from Qiddiya).
  const CITY_ROADS = [
    {id:'kingFahd',   name:{en:'King Fahd Road', ar:'طريق الملك فهد'},        kind:'road', w:.022, pts:Rs([[0,-.95],[0,.85]])},
    {id:'kingSalman', name:{en:'King Salman Road', ar:'طريق الملك سلمان'},    kind:'road', w:.02,  pts:Rs([[-.85,-.48],[.85,-.48]])},
    {id:'kingKhalid', name:{en:'King Khalid Road', ar:'طريق الملك خالد'},     kind:'road', w:.02,  pts:Rs([[-.70,-.95],[-.71,-.40],[-.70,0],[-.68,.25]])},
    {id:'northRing',  name:{en:'Northern Ring Road', ar:'الطريق الدائري الشمالي'}, kind:'road', w:.02, pts:Rs([[-.85,-.26],[.85,-.26]])},
    {id:'qiddiyaRd',  name:{en:'Qiddiya Road', ar:'طريق القدية'},             kind:'road', w:.016, pts:Rs([[-.47,.40],[-.34,.33],[-.16,.33],[0,.34]]), minor:true}
  ];
  // Metro: station at the southern foot of the skyline, rail around King Salman Park and north to the airport terminal.
  const METRO_ROUTE = Rs([[0,.22],[.20,.22],[.40,.19],[.46,.10],[.46,-.22],[.46,-.44],[.49,-.56]]);
  const WADI = Rs([[-.42,-.70],[-.40,-.40],[-.38,-.14],[-.38,.08],[-.43,.20],[-.52,.26]]);   // Wadi Hanifa beside Diriyah
  const RIDGES = Rs([[-.78,.14],[-.60,.20],[-.44,.26],[-.34,.40],[-.30,.56]]);                  // stepped Tuwaiq cliffs between the city and Qiddiya
  const RIYADH_CORE = {x:RY.x, z:RY.z, r:.12, id:'riyadh-core'};                              // the skyline: a clickable place, not a project
  // Landmarks. `r` = circle footprint; `ribbon` = linear footprint (points + half-width). `pad` = marker / progress pad.
  const RIYADH_PLAN = {
    newmurabba:{at:[-.16,-.61], r:.10},
    roshn:     {at:[.17,-.61],  r:.09},
    ksip:      {at:[.55,-.64],  r:.13, pad:[.52,-.56]},
    expo:      {at:[.60,-.37],  r:.075},
    metro:     {at:[0,.22],     r:.06, pad:[.035,.245]},
    park:      {at:[.30,.02],   r:.10},
    diriyah:   {at:[-.52,-.09], r:.09},
    sports:    {at:[-.18,-.20], ribbon:{pts:[[-.40,-.20],[-.20,-.20],[0,-.20],[.20,-.20],[.40,-.20]], hw:.03}, pad:[-.26,-.20]},
    renewables:{at:[-.47,-.62], r:.10},
    qiddiya:   {at:[-.56,.44],  r:.10},
    greenriyadh:{at:[.34,.44],  ribbon:{pts:[[.12,.40],[.26,.43],[.40,.47],[.56,.44],[.70,.48],[.86,.46]], hw:.07}, pad:[.30,.44]}
  };
  // Roads that legitimately enter a footprint because they serve it (downtown and the metro station sit on King Fahd
  // Road; Sports Boulevard bridges it).
  const ON_ROAD = {'riyadh-core':['kingFahd'], metro:['kingFahd'], sports:['kingFahd'], qiddiya:['qiddiyaRd']};

  // Footprint radii elsewhere in the Kingdom (unchanged mapped positions).
  const FOOT = {neom:.10, oxagon:.10, trojena:.09, hydrogen:.12, alula:.12, hajj:.10, masar:.08, jeddahcentral:.08, ceer:.06, lucid:.055,
    eastern:.12, jazan:.08, soudah:.09, redsea:.10, amaala:.08, sindalah:.06, madinah:.08, haramain:.08, green:.09};
  const CORE = {Jeddah:.06, Makkah:.11, Madinah:.10, Dammam:.08};
  const NUDGE = {madinah:[.24,.02], jeddahcentral:[.12,-.16], hajj:[.10,.12], masar:[-.08,.30]};
  const ROAD_SERVED = new Set(['alula','madinah','jeddahcentral','haramain','ceer','lucid','jazan','soudah','green','neom','oxagon','hajj','masar']);
  const SHORT = {ksip:'KSIA Airport', hajj:'Hajj', haramain:'Haramain Rail', jazan:'Jazan Industry', lucid:'EV Factory', renewables:'Renewables',
    green:'Green Initiative', eastern:'East Energy', ceer:'Ceer', hydrogen:'NEOM H2', roshn:'ROSHN', alula:'AlUla', expo:'Expo 2030', park:'KS Park',
    greenriyadh:'Green Riyadh', newmurabba:'New Murabba', metro:'Metro', sports:'Sports Blvd', qiddiya:'Qiddiya', jeddahcentral:'Jeddah Central',
    madinah:'Rua Al Madinah', masar:'Masar', soudah:'Soudah', redsea:'Red Sea', amaala:'AMAALA', trojena:'Trojena', oxagon:'Oxagon', neom:'THE LINE', sindalah:'Sindalah', diriyah:'Diriyah'};

  // ---------------------------------------------------------------- geometry helpers
  const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  const polyDist = (x, z, pts) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(x, z, pts[i - 1], pts[i])); return d; };

  // ---------------------------------------------------------------- resolve positions
  // Legacy (V5) positions: lon/lat spread around the anchor city. Used only for the City Builder's frozen anchor frame.
  const legacy = {};
  for (const p of D.projects) { let [x, z] = geo(p.lon, p.lat); const a = p.anchor && cities[p.anchor]; if (a) { const s = p.spread || ANCHOR_SPREAD; x = a.x + (x - a.x) * s; z = a.z + (z - a.z) * s; } legacy[p.id] = [x, z]; }
  const projects = {};
  for (const p of D.projects) {
    const plan = RIYADH_PLAN[p.id];
    if (plan) {
      const [x, z] = R(...plan.at), ribbon = plan.ribbon ? {pts:Rs(plan.ribbon.pts), hw:plan.ribbon.hw} : null;
      const r = plan.r || .06;                                             // ribbons: small radius around the label anchor for rings/cues
      const pad = plan.pad ? R(...plan.pad) : [x, z + r * .72];
      projects[p.id] = {id:p.id, x, z, r, ribbon, pad, illustrative:true};
      continue;
    }
    let [x, z] = legacy[p.id];
    if (NUDGE[p.id]) { x += NUDGE[p.id][0]; z += NUDGE[p.id][1]; }
    const r = FOOT[p.id] || DEFAULT_R;
    projects[p.id] = {id:p.id, x, z, r, ribbon:null, pad:[x, z + r * .72], illustrative:false};
  }
  const cores = [{name:'Riyadh', x:RIYADH_CORE.x, z:RIYADH_CORE.z, r:RIYADH_CORE.r}, ...Object.entries(CORE).map(([name, r]) => ({name, x:cities[name].x, z:cities[name].z, r}))];

  // Intercity roads and rails that reach Riyadh join the plan at a gate on a named road instead of cutting across it.
  const GATES = [R(.85,-.26), R(-.70,-.95), R(-.68,.25), R(0,.85), R(0,-.95), R(.85,-.48), R(-.85,-.48)];
  function gateToward(other){ let best = null, bd = Infinity; for (const g of GATES) { const d = Math.hypot(g[0] - other[0], g[1] - other[1]); if (d < bd) { bd = d; best = g; } } return best; }
  const toPts = r => r.map(w => typeof w === 'string' ? [cities[w].x, cities[w].z] : geo(w[0], w[1]));
  // A gate segment that would cross a Riyadh footprint gets one waypoint around it (on the side away from the plan centre).
  function detour(a, b){
    for (const p of Object.values(projects)) { if (!p.illustrative || p.ribbon) continue;
      if (segDist(p.x, p.z, a, b) >= p.r + .03) continue;
      let ox = p.x - RY.x, oz = p.z - RY.z; const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l;
      return [[p.x + ox * (p.r + .09), p.z + oz * (p.r + .09)]]; }
    return [];
  }
  function remap(list){ return list.map(r => { let pts = toPts(r);
    for (let i = 0; i < pts.length; i++) if (r[i] === 'Riyadh') { const nb = pts[i + 1] || pts[i - 1]; pts[i] = gateToward(nb);
      const extra = detour(pts[i], nb); if (extra.length) { pts = i === 0 ? [pts[0], ...extra, ...pts.slice(1)] : [...pts.slice(0, i), ...extra, ...pts.slice(i)]; } }
    return pts; }); }
  const intercity = remap(D.roads), rails = remap(D.rails);
  const cityRoads = CITY_ROADS.map(r => ({...r}));
  const roads = [...intercity, ...cityRoads.map(r => r.pts)];            // everything decoration must keep off
  const roadDist = (x, z) => { let d = Infinity; for (const r of roads) d = Math.min(d, polyDist(x, z, r)); return d; };
  const cityRoadDist = (x, z, except = []) => { let d = Infinity; for (const r of cityRoads) if (!except.includes(r.id)) d = Math.min(d, polyDist(x, z, r.pts) - r.w / 2); return d; };

  // Distance from a point to the outside of a footprint (negative inside).
  const footDist = (p, x, z) => p.ribbon ? polyDist(x, z, p.ribbon.pts) - p.ribbon.hw : Math.hypot(x - p.x, z - p.z) - p.r;
  // Which project's footprint contains a point (used to tag geometry for picking); null when none.
  function footprintAt(x, z){
    let best = null, bd = Infinity;
    for (const p of Object.values(projects)) { const d = footDist(p, x, z); if (d < 0 && d < bd) { bd = d; best = p.id; } }
    if (best) return best;
    if (polyDist(x, z, METRO_ROUTE) < .014) return 'metro';                                        // the rail is part of the Metro
    if (Math.hypot(x - RIYADH_CORE.x, z - RIYADH_CORE.z) < RIYADH_CORE.r) return RIYADH_CORE.id;   // the skyline
    return null;
  }
  // Decoration (generic blocks, palms, trees) may only go where it cannot be mistaken for — or cover — a project.
  // `tall` decoration also keeps a view corridor clear on the camera-facing (south) side of circular footprints.
  function decorAllowed(x, z, margin = .02, roadClear = .028, tall = false){
    for (const p of Object.values(projects)) { if (footDist(p, x, z) < margin) return false;
      if (tall && !p.ribbon && z > p.z && z - p.z < p.r + .16 && Math.abs(x - p.x) < p.r + .03) return false; }
    for (const c of cores) if (Math.hypot(x - c.x, z - c.z) < c.r + margin * .5) return false;
    if (polyDist(x, z, METRO_ROUTE) < .02 + margin * .5 || polyDist(x, z, WADI) < .03) return false;
    return roadDist(x, z) >= roadClear;
  }
  const insideCore = (name, x, z) => { const c = cores.find(c => c.name === name); return !!c && Math.hypot(x - c.x, z - c.z) < c.r; };
  // Mission-only sites (dry port, rail gateways…) are drawn where they belong but nudged out of any project footprint.
  function clearOf(x, z, r = .05){
    for (let pass = 0; pass < 6; pass++) { let moved = false;
      for (const p of Object.values(projects)) { if (p.ribbon) continue; const d = Math.hypot(x - p.x, z - p.z), need = p.r + r + .01; if (d < need) { const k = d > 1e-6 ? need / d : 1; x = p.x + (x - p.x) * k; z = p.z + (z - p.z) * k + (d > 1e-6 ? 0 : need); moved = true; } }
      if (!moved) break; }
    return [x, z];
  }

  // City Builder district: drawn south-east of the Riyadh plan — the nearest spot that is fully on land (clear of the
  // Gulf coast), crosses no intercity road or rail and holds no project. New-city landmarks are still chosen in the
  // ORIGINAL frame (grid centre core + (1.02, .12), V5 node positions), so city gameplay and saves are unchanged.
  const CITY_GRID = {ts:.027, n:40, visual:{dx:1.55, dz:.85}, logical:{dx:1.02, dz:.12}};
  const cityAnchorFrame = {origin:[RY.x + CITY_GRID.logical.dx, RY.z + CITY_GRID.logical.dz], legacy};
  const half = CITY_GRID.ts * CITY_GRID.n / 2;
  const reservedRects = [{name:'City Builder district', x0:RY.x + CITY_GRID.visual.dx - half, x1:RY.x + CITY_GRID.visual.dx + half, z0:RY.z + CITY_GRID.visual.dz - half, z1:RY.z + CITY_GRID.visual.dz + half}];
  const inReserved = (x, z, pad = 0) => reservedRects.some(r => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);

  // Pick resolution (see engine.js): front-most visible object wins; ambiguous or clustered → a choice list.
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

  // ---------------------------------------------------------------- mission and challenge sites (presentation only)
  // Mission-only sites and timed-challenge assets are drawn at these plan positions. Their simulation keeps its own
  // lon/lat and world coordinates, so distances, exposure and outcomes do not change.
  const MISSION_SITES = {'riyadh:dryport':R(.72,-.13), 'riyadh:eastgate':R(.86,-.31), 'riyadh:westgate':R(-.62,.31)};
  const CHALLENGE_SITES = {sandstorm:{ksia:R(.54,-.575), 'expo-site':R(.60,-.35), 'murabba-site':R(-.16,-.555), 'sub-east':R(.70,.02),
    freight:R(.90,-.27), 'metro-ops':R(.03,.235), _base:R(.62,.12)}};

  // Route a mission line between two plan points (spur → named roads → spur). Road corridors (viaRoads) always follow
  // the plan's roads unless that is a long detour and the straight line is clear; other lines go straight when that
  // crosses no district parcel or city core. Ribbons (boulevard, green corridor) may be crossed.
  const ROAD_NET = (() => {
    const nodes = [], edges = [], nodeRoad = [];
    for (const r of cityRoads) { let prev = -1;
      for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / .02));
        for (let k = (i === 1 ? 0 : 1); k <= n; k++) { const id = nodes.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]) - 1; edges[id] = []; nodeRoad[id] = r.id; if (prev >= 0) { edges[id].push(prev); edges[prev].push(id); } prev = id; } } }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++)
      if (!edges[i].includes(j) && Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]) < .022) { edges[i].push(j); edges[j].push(i); }   // junctions
    return {nodes, edges, nodeRoad};
  })();
  const nodeRoad = ROAD_NET.nodeRoad;
  const circles = () => Object.values(projects).filter(p => !p.ribbon);
  function segBlocked(a, b, skip){
    for (const p of circles()) { if (skip.includes(p.id)) continue; if (segDist(p.x, p.z, a, b) < p.r) return true; }
    for (const c of cores) { if (skip.includes('core:' + c.name)) continue; if (segDist(c.x, c.z, a, b) < c.r) return true; }
    return false;
  }
  const ownedBy = pt => [...circles().filter(p => Math.hypot(pt[0] - p.x, pt[1] - p.z) < p.r + .03).map(p => p.id), ...cores.filter(c => Math.hypot(pt[0] - c.x, pt[1] - c.z) < c.r + .03).map(c => 'core:' + c.name)];
  const inPlan = pt => Math.abs(pt[0] - RY.x) < .95 && Math.abs(pt[1] - RY.z) < .98;
  const routeCache = new Map();
  const pathLen = pts => pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
  function routeBetween(A, B, viaRoads = false){
    const key = A.map(v => v.toFixed(4)) + '|' + B.map(v => v.toFixed(4)) + (viaRoads ? 'R' : ''); if (routeCache.has(key)) return routeCache.get(key);
    const skip = [...ownedBy(A), ...ownedBy(B)], blocked = segBlocked(A, B, skip);
    let out = [A, B];
    if (inPlan(A) && inPlan(B) && (blocked || viaRoads)) {
      const {nodes, edges} = ROAD_NET;
      // Candidate on-ramps: the nearest node of each named road that can be reached without crossing another parcel.
      const ramps = pt => { const own = ownedBy(pt), best = new Map();
        nodes.forEach((q, i) => { const d = Math.hypot(q[0] - pt[0], q[1] - pt[1]), r = nodeRoad[i], cur = best.get(r);
          if ((!cur || d < cur.d) && !segBlocked(pt, q, own)) best.set(r, {i, d}); });
        const all = [...best.values()], near = Math.min(...all.map(r => r.d));
        return all.filter(r => r.d <= near * 1.5 + .03); };                  // short on-ramps only: a spur is not a road
      const dijkstra = s => { const dist = new Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(-1), done = new Uint8Array(nodes.length); dist[s] = 0;
        for (;;) { let u = -1, ud = Infinity; for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
          if (u < 0) break; done[u] = 1;
          for (const v of edges[u]) { const d = ud + Math.hypot(nodes[u][0] - nodes[v][0], nodes[u][1] - nodes[v][1]); if (d < dist[v]) { dist[v] = d; prev[v] = u; } } }
        return {dist, prev}; };
      let bestPath = null, bestCost = Infinity;
      const rb = ramps(B);
      for (const ra of ramps(A)) { const {dist, prev} = dijkstra(ra.i);
        for (const r of rb) { const c = 3 * (ra.d + r.d) + dist[r.i]; if (c < bestCost) { bestCost = c; const path = []; for (let v = r.i; v >= 0; v = prev[v]) path.unshift(nodes[v]); bestPath = path; } } }
      if (bestPath) { const path = bestPath;
        const simple = [path[0]]; for (let i = 1; i < path.length - 1; i++) { const a = simple[simple.length - 1], b = path[i], c = path[i + 1];
          if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 1e-6) simple.push(b); }
        if (path.length > 1) simple.push(path[path.length - 1]);
        const routed = [A, ...simple, B];
        if (blocked || pathLen(routed) <= 2.2 * Math.hypot(B[0] - A[0], B[1] - A[1])) out = routed; }
    }
    routeCache.set(key, out); return out;
  }

  window.VisionLayout = {GAP, ROAD_CLEAR, FOOT, CORE, RIYADH_PLAN, NUDGE, ROAD_SERVED, ON_ROAD, SHORT, RIYADH_CORE, CITY_ROADS:cityRoads, METRO_ROUTE, WADI, RIDGES,
    CITY_GRID, cityAnchorFrame, legacy, projects, cores, roads, intercity, rails, geo, R, polyDist, footDist, footprintAt, decorAllowed, insideCore, roadDist, cityRoadDist,
    clearOf, reservedRects, inReserved, resolvePick, MISSION_SITES, CHALLENGE_SITES, routeBetween};
})();
