// node tests/layout.test.js — map layout (Riyadh planning map, footprints, decoration rules) and click-selection priority.
global.window = {};
require('../data.js');
const D = window.VISION_DATA, before = JSON.stringify(D.projects.map(p => [p.id, p.lon, p.lat, p.anchor]));
require('../layout.js');
const L = window.VisionLayout, P = Object.values(L.projects);
let fails = 0; const ok = (l, c, info='') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l.padEnd(78)} ${info}`); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const RY = L.RIYADH_CORE, rel = p => ({dx:p.x - RY.x, dz:p.z - RY.z});          // +dx east, +dz south (north is −dz)
const road = id => L.CITY_ROADS.find(r => r.id === id), X = id => L.projects[id];
const riyadh = P.filter(p => p.region === 'riyadh'), circles = P.filter(p => !p.ribbon);

// ---- Placement and footprints
ok('Every project has a footprint and a marker pad', P.length === D.projects.length && P.every(p => p.r > 0 && p.pad));
const gapPairs = []; for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const a = P[i], b = P[j];
  const d = a.ribbon && b.ribbon ? Infinity : a.ribbon ? L.footDist(a, b.x, b.z) - b.r : b.ribbon ? L.footDist(b, a.x, a.z) - a.r : dist(a, b) - a.r - b.r;
  if (d < L.GAP) gapPairs.push(a.id + '/' + b.id); }
ok('No two footprints touch (clear gap between every pair, ribbons included)', !gapPairs.length, gapPairs.join(' '));
const coreHits = []; for (const p of circles) for (const c of L.cores) if (dist(p, c) < p.r + c.r + L.GAP) coreHits.push(p.id + '@' + c.name);
ok('No footprint sits inside a city tower core', !coreHits.length, coreHits.join(' '));
ok('Riyadh has 11 illustrative districts (not survey geography)', riyadh.length === 11 && riyadh.every(p => D.projects.find(q => q.id === p.id)));
ok('Layout never changes the source data (lon/lat/anchor untouched)', JSON.stringify(D.projects.map(p => [p.id, p.lon, p.lat, p.anchor])) === before);
ok('Marker pads sit inside their footprint (well inside, except on slim corridors)', P.every(p => L.footDist(p, p.pad[0], p.pad[1]) < (p.ribbon && p.ribbon.hw < .02 ? 0 : -.01)));

// ---- Corridors (north-up plan)
const fahd = road('kingFahd').pts, salman = road('kingSalman').pts, khalid = road('kingKhalid').pts, ring = road('northRing').pts;
ok('King Fahd Road is the north–south spine through downtown', fahd.every(q => Math.abs(q[0] - RY.x) < 1e-9) && L.polyDist(RY.x, RY.z, fahd) < 1e-9 && fahd[0][1] < RY.z - .8 && fahd[1][1] > RY.z + .8);
ok('King Salman Road runs east–west across the upper map', salman.every(q => Math.abs(q[1] - salman[0][1]) < 1e-9) && salman[0][1] < RY.z - .4);
ok('Northern Ring Road runs east–west across the middle, south of King Salman Road', ring.every(q => q[1] === ring[0][1]) && ring[0][1] > salman[0][1] && ring[0][1] < RY.z);
ok('King Khalid Road runs north–south along the western edge', khalid.every(q => q[0] < RY.x - .6) && khalid[khalid.length - 1][1] - khalid[0][1] > .9);
const J = [RY.x, salman[0][1]];   // the King Fahd / King Salman junction
const sp = X('sports'), spz = sp.ribbon.pts.map(q => q[1]);
ok('Sports Boulevard is one continuous E–W ribbon just south of the Northern Ring', spz.every(z => z > ring[0][1] && z - ring[0][1] < .1) && sp.ribbon.pts.length >= 3);
ok('Sports Boulevard links the Diriyah/wadi side to the eastern districts', L.polyDist(sp.ribbon.pts[0][0], sp.ribbon.pts[0][1], L.WADI) < .06 && sp.ribbon.pts[sp.ribbon.pts.length - 1][0] > RY.x + .35);
ok('Named city roads never pass through a district footprint (except their own corridor)', riyadh.every(p => L.CITY_ROADS.every(r => (L.ON_ROAD[p.id] || []).includes(r.id) || P.every(q => q.id !== p.id) || L.polyDist(p.x, p.z, r.pts) - r.w / 2 >= (p.ribbon ? -1 : p.r))));
ok('Intercity roads and rails reach Riyadh at gates, crossing no district footprint', riyadh.filter(p => !p.ribbon).every(p => [...L.intercity, ...L.rails].every(r => L.polyDist(p.x, p.z, r) >= p.r)));

// ---- Landmark table
ok('★ Downtown sits at the centre, on King Fahd Road', L.polyDist(RY.x, RY.z, fahd) < 1e-9 && L.footprintAt(RY.x + .05, RY.z) === RY.id);
{ const m = X('metro'), r = L.METRO_ROUTE, e = r[r.length - 1];
  ok('Riyadh Metro station at the southern foot of the skyline, on King Fahd Road', rel(m).dz > RY.r && rel(m).dz < RY.r + .15 && Math.abs(rel(m).dx) < .02);
  ok('Metro route begins at the station and terminates inside the airport', Math.hypot(r[0][0] - m.x, r[0][1] - m.z) < .01 && L.footDist(X('ksip'), e[0], e[1]) < 0);
  const crossed = riyadh.filter(p => !['metro', 'ksip', 'sports'].includes(p.id) && r.some((q, i) => i && L.polyDist(p.x, p.z, [r[i - 1], q]) < (p.r || 0)));
  ok('The blue rail crosses no other district', !crossed.length, crossed.map(p => p.id).join(' '));
  const pk = X('park'); ok('Rail runs around King Salman Park (south and east sides)', L.polyDist(pk.x, pk.z + pk.r + .05, r) < .1 && L.polyDist(pk.x + pk.r + .08, pk.z, r) < .1); }
ok('King Salman Park is south-east of downtown', rel(X('park')).dx > .15 && rel(X('park')).dz > -.05);
ok('New Murabba is north-west of the junction, left of King Fahd Road', X('newmurabba').x + X('newmurabba').r < J[0] && X('newmurabba').z < J[1]);
ok('New Murabba (Mukaab) keeps clear space on all four sides', P.every(p => p.id === 'newmurabba' || L.footDist(p, X('newmurabba').x, X('newmurabba').z) > X('newmurabba').r + .05));
ok('ROSHN is north of King Salman Road and east of King Fahd Road', X('roshn').z + X('roshn').r < J[1] && X('roshn').x - X('roshn').r > J[0]);
ok('King Salman International Airport is far north-east', rel(X('ksip')).dx > .4 && rel(X('ksip')).dz < -.5);
ok('Expo 2030 is immediately south of the airport, in its own parcel', X('expo').z > X('ksip').z && Math.abs(X('expo').x - X('ksip').x) < .1 && dist(X('expo'), X('ksip')) - X('expo').r - X('ksip').r >= L.GAP);
ok('Diriyah is west, alongside King Khalid Road and the wadi', rel(X('diriyah')).dx < -.4 && L.polyDist(X('diriyah').x, X('diriyah').z, khalid) < .25 && L.polyDist(X('diriyah').x, X('diriyah').z, L.WADI) < .2);
ok('Renewables are in the outer north-west, west of New Murabba', X('renewables').x + X('renewables').r < X('newmurabba').x - X('newmurabba').r && rel(X('renewables')).dz < -.4);
{ const q = X('qiddiya'), ridgeZ = Math.max(...L.RIDGES.map(p => p[1]).slice(0, 3));
  ok('Qiddiya is far south-west, beyond the Tuwaiq ridges', rel(q).dx < -.4 && rel(q).dz > .3 && q.z > ridgeZ);
  ok('A road curves back from Qiddiya toward the city', L.polyDist(q.x, q.z, road('qiddiyaRd').pts) < q.r + .02 && L.polyDist(RY.x, road('qiddiyaRd').pts.slice(-1)[0][1], fahd) < .01); }
{ const g = X('greenriyadh'), xs = g.ribbon.pts.map(q => q[0]);
  ok('Green Riyadh is a broad SE corridor continuing beyond the frame', g.ribbon.hw >= .06 && Math.max(...xs) > RY.x + .8 && g.ribbon.pts.every(q => q[1] > RY.z + .3));
  ok('Green Riyadh is distinct from King Salman Park', L.footDist(g, X('park').x, X('park').z) > X('park').r + L.GAP); }

// ---- Decoration rules (palms, trees, generic blocks)
ok('Tall decoration keeps a clear view corridor south of each circular project', circles.every(p => !L.decorAllowed(p.x, p.z + p.r + .1, .02, .028, true)));
ok('Decoration is refused inside every project footprint', P.every(p => !L.decorAllowed(p.x, p.z) && !L.decorAllowed(p.pad[0], p.pad[1])));
const roadMids = L.roads.flatMap(r => r.slice(1).map((b, i) => [(r[i][0] + b[0]) / 2, (r[i][1] + b[1]) / 2]));
ok('Decoration is refused in city cores, on every road, on the metro and in the wadi', L.cores.every(c => !L.decorAllowed(c.x, c.z)) && roadMids.every(([x, z]) => !L.decorAllowed(x, z))
  && L.METRO_ROUTE.every(([x, z]) => !L.decorAllowed(x, z)) && L.WADI.every(([x, z]) => !L.decorAllowed(x, z)), `${roadMids.length} road midpoints`);
let open = null; for (let lon = 42; lon <= 49 && !open; lon += .25) for (let lat = 19; lat <= 28 && !open; lat += .25) { const [x, z] = L.geo(lon, lat); if (L.roadDist(x, z) > .3 && P.every(p => L.footDist(p, x, z) > .3) && L.cores.every(c => dist(c, {x, z}) > .5)) open = [x, z]; }
const [ox, oz] = open;
ok('Decoration is allowed in open desert away from projects and roads', L.decorAllowed(ox, oz));
ok('footprintAt tags geometry to the right project (and nothing outside)', P.every(p => L.footprintAt(p.pad[0], p.pad[1]) === p.id) && L.footprintAt(ox, oz) === null);
ok('The metro rail between districts tags as Metro (clickable line)', L.footprintAt(...L.METRO_ROUTE[4]) === 'metro');
ok('Short label names exist for every Riyadh district', riyadh.every(p => L.SHORT[p.id] && L.SHORT[p.id].length <= 14));
{ const pk = L.projects.park, q = L.clearOf(pk.x + .05, pk.z + .03), q2 = L.clearOf(5, 5);
  ok('Mission-only sites are nudged clear of project footprints (and left alone elsewhere)', circles.every(p => Math.hypot(q[0] - p.x, q[1] - p.z) >= p.r + .05) && q2[0] === 5 && q2[1] === 5); }

// ---- City Builder: drawn south-east of the plan, on land; new-city anchors decided in the frozen V5 frame
{ const r = L.reservedRects[0], hit = riyadh.filter(p => { const nx = Math.max(r.x0, Math.min(p.x, r.x1)), nz = Math.max(r.z0, Math.min(p.z, r.z1)); return L.footDist(p, nx, nz) < .02; });
  ok('No Riyadh district footprint enters the City Builder district', !hit.length, hit.map(p => p.id).join(' '));
  const S = D.saudi.map(([a, b]) => L.geo(a, b)), pip = (x, z) => { let c = false; for (let i = 0, j = S.length - 1; i < S.length; j = i++) { const [xi, zi] = S[i], [xj, zj] = S[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  let land = true; for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) if (!pip(r.x0 - .05 + (r.x1 - r.x0 + .1) * i / 20, r.z0 - .05 + (r.z1 - r.z0 + .1) * j / 20)) land = false;
  const inR = (x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const crossing = [...L.intercity, ...L.rails, ...L.CITY_ROADS.map(c => c.pts)].filter(pts => pts.some((q, k) => k && [0, .25, .5, .75, 1].some(t => inR(pts[k - 1][0] + (q[0] - pts[k - 1][0]) * t, pts[k - 1][1] + (q[1] - pts[k - 1][1]) * t))));
  ok('City Builder district lies fully on land (clear of the Gulf coast)', land);
  ok('No road, rail or project sits inside the City Builder district', !crossing.length && P.every(p => !inR(p.x, p.z)), `${crossing.length} crossing`);
  const f = L.cityAnchorFrame; ok('City Builder anchor frame is frozen to V5 (origin +1.02,+.12; lon/lat spread positions)', Math.abs(f.origin[0] - RY.x - 1.02) < 1e-9 && Math.abs(f.origin[1] - RY.z - .12) < 1e-9
    && D.projects.every(p => { const [x, z] = L.geo(p.lon, p.lat), a = p.anchor && D.cities.find(c => c.name === p.anchor); if (!a) return f.legacy[p.id][0] === x; const [ax, az] = L.geo(a.lon, a.lat), s = p.spread || 3.4; return Math.abs(f.legacy[p.id][0] - (ax + (x - ax) * s)) < 1e-9 && Math.abs(f.legacy[p.id][1] - (az + (z - az) * s)) < 1e-9; })); }

// ---- Mission-only sites and mission lines (presentation only)
{ const M = Object.entries(L.MISSION_SITES).filter(([k]) => k.startsWith('riyadh:'));
  ok('Mission-only sites sit on open ground: no parcel, core or city road underneath', M.every(([, q]) => !L.footprintAt(q[0], q[1]) && L.cores.every(c => Math.hypot(q[0] - c.x, q[1] - c.z) > c.r + .03) && L.cityRoadDist(q[0], q[1]) > .02), M.map(([k]) => k).join(' '));
  const planC = circles.filter(p => p.region === 'riyadh'), pts = [[RY.x, RY.z], ...planC.map(p => [p.x, p.z]), ...M.map(([, q]) => q)], crossings = [];
  for (const A of pts) for (const B of pts) if (A !== B) for (const road of [false, true]) { const path = L.routeBetween(A, B, road);
    for (const p of planC) { if (L.ON_ROAD[p.id]) continue;   // the Metro station straddles King Fahd Road by design
      if (Math.hypot(A[0] - p.x, A[1] - p.z) < p.r + .03 || Math.hypot(B[0] - p.x, B[1] - p.z) < p.r + .03) continue;
      if (L.polyDist(p.x, p.z, path) < p.r) crossings.push(p.id); } }
  ok('Mission lines never cross another district parcel (straight or routed; roads may pass under the Metro canopy)', !crossings.length, `${pts.length * (pts.length - 1) * 2} routes; ${[...new Set(crossings)].join(' ')}`);
  const ks = L.projects.ksip, rt = L.routeBetween([RY.x, RY.z], [ks.x, ks.z], true);
  ok('A road corridor follows King Fahd and King Salman Roads (not a diagonal)', rt.length > 3 && rt.slice(1, -1).every(q => L.cityRoadDist(q[0], q[1]) < .01), rt.length + ' points');
  ok('Routes are cached (same array for the same request)', L.routeBetween([RY.x, RY.z], [ks.x, ks.z], true) === rt); }

// ---- Selection priority (what a click selects from what is under the pointer)
const Rv = L.resolvePick;
ok('The front-most visible object wins over another project’s nearby marker', Rv({center:'expo', markers:[{id:'ksip', d:2}]}).select === 'expo');
ok('A near miss on a single object selects it', Rv({around:[{id:'metro', d:4}, {id:'metro', d:5}]}).select === 'metro');
ok('Two objects equally close under the pointer → choice list, not a guess', JSON.stringify(Rv({around:[{id:'qiddiya', d:4}, {id:'diriyah', d:5}]}).choose) === '["qiddiya","diriyah"]');
ok('One object clearly nearer (≤ half the distance) is selected', Rv({around:[{id:'park', d:2}, {id:'greenriyadh', d:6}]}).select === 'park');
ok('Marker-only hits resolve the same way (one → select, crowded → choose)', Rv({markers:[{id:'roshn', d:3}]}).select === 'roshn' && Rv({markers:[{id:'roshn', d:6}, {id:'sports', d:8}]}).choose.length === 2);
ok('In the Kingdom overview a click on a clustered city offers its projects', Rv({center:'expo', cluster:['expo','ksip','metro']}).choose.length === 3);
ok('Nothing under the pointer selects nothing', Rv({}) === null && Rv({around:[], markers:[]}) === null);

console.log(fails ? `\n${fails} FAILED` : '\nAll layout tests passed');
process.exit(fails ? 1 : 0);
