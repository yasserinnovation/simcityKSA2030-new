// node tests/layout.test.js — map layout (footprints, districts, decoration rules) and click-selection priority.
global.window = {};
require('../data.js');
const D = window.VISION_DATA, before = JSON.stringify(D.projects.map(p => [p.id, p.lon, p.lat]));
require('../layout.js');
const L = window.VisionLayout, P = Object.values(L.projects);
let fails = 0; const ok = (l, c, info='') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l.padEnd(74)} ${info}`); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---- Placement and footprints
ok('Every project has a footprint and a marker pad', P.length === D.projects.length && P.every(p => p.r > 0 && p.pad));
const pairs = []; for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (dist(P[i], P[j]) < P[i].r + P[j].r + L.GAP) pairs.push(P[i].id + '/' + P[j].id);
ok('No two footprints touch (clear gap between every pair)', !pairs.length, pairs.join(' '));
const cores = []; for (const p of P) for (const c of L.cores) if (dist(p, c) < p.r + c.r + L.GAP) cores.push(p.id + '@' + c.name);
ok('No footprint sits inside a city tower/landmark core', !cores.length, cores.join(' '));
const riyadh = P.filter(p => D.projects.find(q => q.id === p.id).anchor === 'Riyadh');
ok('No intercity road crosses a Riyadh district footprint', riyadh.every(p => L.roadDist(p.x, p.z) >= p.r) && riyadh.every(p => !L.ROAD_SERVED.has(p.id)));
const roadCross = P.filter(p => L.roadDist(p.x, p.z) < p.r && !L.ROAD_SERVED.has(p.id)).map(p => p.id);
ok('Elsewhere, only projects served by their own corridor road have a road in the footprint', !roadCross.length, roadCross.join(' '));
const rc = L.cores.find(c => c.name === 'Riyadh');
ok('No Riyadh district footprint enters the City Builder district', riyadh.every(p => { const r = L.reservedRects[0]; const nx = Math.max(r.x0, Math.min(p.x, r.x1)), nz = Math.max(r.z0, Math.min(p.z, r.z1)); return Math.hypot(p.x - nx, p.z - nz) >= p.r + .02; }));
ok('Riyadh keeps a recognisable centre: all 10 districts within 0.75 of the core, none inside it', riyadh.length === 10 && riyadh.every(p => dist(p, rc) <= .75 && dist(p, rc) >= rc.r + p.r));
ok('Riyadh districts are marked illustrative (not survey geography)', riyadh.every(p => p.illustrative) && P.filter(p => p.illustrative).length === 10);
ok('Marker pads sit inside their footprint, on the camera-facing (south) edge', P.every(p => { const d = Math.hypot(p.pad[0] - p.x, p.pad[1] - p.z); return d + .026 <= p.r + .012 && p.pad[1] > p.z; }));
ok('Layout never changes the source data (lon/lat untouched)', JSON.stringify(D.projects.map(p => [p.id, p.lon, p.lat])) === before);

// ---- Decoration rules (palms, trees, generic blocks)
ok('Tall decoration keeps a clear view corridor on the camera-facing side of each project', P.every(p => !L.decorAllowed(p.x, p.z + p.r + .1, .02, .028, true)));
ok('Decoration is refused inside every project footprint', P.every(p => !L.decorAllowed(p.x, p.z) && !L.decorAllowed(p.x + p.r * .9, p.z)));
const roadMids = L.roads.flatMap(r => r.slice(1).map((b, i) => [(r[i][0] + b[0]) / 2, (r[i][1] + b[1]) / 2]));
ok('Decoration is refused inside city cores and on every road segment', L.cores.every(c => !L.decorAllowed(c.x, c.z)) && roadMids.every(([x, z]) => !L.decorAllowed(x, z)), `${roadMids.length} road midpoints`);
let open = null; for (let lon = 42; lon <= 49 && !open; lon += .25) for (let lat = 19; lat <= 28 && !open; lat += .25) { const [x, z] = L.geo(lon, lat); if (L.roadDist(x, z) > .3 && P.every(p => dist(p, {x, z}) > p.r + .3) && L.cores.every(c => dist(c, {x, z}) > .5)) open = [x, z]; }
const [ox, oz] = open;
ok('Decoration is allowed in open desert away from projects and roads', L.decorAllowed(ox, oz));
ok('footprintAt tags geometry to the right project (and nothing outside)', P.every(p => L.footprintAt(p.x, p.z) === p.id) && L.footprintAt(ox, oz) === null);
ok('Short label names exist for every Riyadh district', riyadh.every(p => L.SHORT[p.id] && L.SHORT[p.id].length <= 14));

{ const pk = L.projects.park, q = L.clearOf(pk.x + .05, pk.z + .03), q2 = L.clearOf(5, 5);
  ok('Mission-only sites are nudged clear of project footprints (and left alone elsewhere)', P.every(p => Math.hypot(q[0] - p.x, q[1] - p.z) >= p.r + .05) && q2[0] === 5 && q2[1] === 5); }
// ---- Selection priority (what a click selects from what is under the pointer)
const R = L.resolvePick;
ok('The front-most visible object wins over another project’s nearby marker', R({center:'expo', markers:[{id:'ksip', d:2}]}).select === 'expo');
ok('A near miss on a single object selects it', R({around:[{id:'metro', d:4}, {id:'metro', d:5}]}).select === 'metro');
ok('Two objects equally close under the pointer → choice list, not a guess', JSON.stringify(R({around:[{id:'qiddiya', d:4}, {id:'diriyah', d:5}]}).choose) === '["qiddiya","diriyah"]');
ok('One object clearly nearer (≤ half the distance) is selected', R({around:[{id:'park', d:2}, {id:'greenriyadh', d:6}]}).select === 'park');
ok('Marker-only hits resolve the same way (one → select, crowded → choose)', R({markers:[{id:'roshn', d:3}]}).select === 'roshn' && R({markers:[{id:'roshn', d:6}, {id:'sports', d:8}]}).choose.length === 2);
ok('In the Kingdom overview a click on a clustered city offers its projects', R({center:'expo', cluster:['expo','ksip','metro']}).choose.length === 3);
ok('Nothing under the pointer selects nothing', R({}) === null && R({around:[], markers:[]}) === null);

console.log(fails ? `\n${fails} FAILED` : '\nAll layout tests passed');
process.exit(fails ? 1 : 0);
