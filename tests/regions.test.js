// node tests/regions.test.js — the four regional 3D plans: reference files, geography, geometry, selection, compatibility.
const fs = require('fs'), path = require('path');
global.window = {};
require('../data.js');
const D = window.VISION_DATA, before = JSON.stringify(D.projects.map(p => [p.id, p.lon, p.lat, p.anchor]));
require('../regions.js'); require('../layout.js'); require('../mission.js');
const RG = window.VisionRegions, L = window.VisionLayout, VM = window.VisionMissions, geo = RG.geo;
let fails = 0; const ok = (l, c, info='') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l.padEnd(80)} ${info}`); };
const SA = D.saudi.map(([a, b]) => geo(a, b)), NB = D.neighbours.map(n => n.map(([a, b]) => geo(a, b)));
const pip = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const saudi = (x, z) => pip(x, z, SA), anyLand = (x, z) => saudi(x, z) || NB.some(P => pip(x, z, P));
const at = (reg, id) => { const P = RG.PLANS[reg]; const q = P.projects[id] || P.places[id]; return q.at; };
const pr = id => L.projects[id], pl = id => L.places['place:' + id];
const inland = (reg, [x, z]) => reg === 'east' ? RG.coastE(z) - x : x - RG.coastW(z);

// ---- Reference images: exact names in the project root (estern.png is spelled that way on purpose)
const REF = {east:'estern.png', west:'western.png', northwest:'neom.png', south:'south.png'}, root = path.join(__dirname, '..');
ok('Each region names its exact reference file', Object.entries(REF).every(([k, f]) => RG.PLANS[k].reference === f && L.REGION_VIEWS[k].reference === f));
ok('All four reference files resolve in the project root and are PNG images', Object.values(REF).every(f => { const p = path.join(root, f); if (!fs.existsSync(p)) return false; const b = fs.readFileSync(p).subarray(0, 8); return b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG'; }),
  Object.values(REF).map(f => f + (fs.existsSync(path.join(root, f)) ? ' ✓' : ' missing')).join(', '));
ok('No plan refers to a guessed name (eastern.png, an assets folder…)', !/eastern\.png|assets\//.test(fs.readFileSync(path.join(root, 'regions.js'), 'utf8')));

// ---- National view: regions sit in their recognisable directions around Riyadh
{ const c = k => L.REGION_VIEWS[k].camera, ry = L.RIYADH_CORE;
  ok('NEOM / Northwest is north-west, Western Corridor west, Southwest south-west, Eastern Province east (Gulf side)',
    c('northwest').x < ry.x && c('northwest').z < ry.z && c('west').x < ry.x && c('south').x < ry.x && c('south').z > ry.z && c('east').x > ry.x && c('northwest').z < c('west').z && c('west').z < c('south').z);
  const B = Object.entries(L.REGION_VIEWS).map(([k, v]) => [k, v.bounds]); B.push(['riyadh', {x0:ry.x - .95, x1:ry.x + .95, z0:ry.z - 1.03, z1:ry.z + .93}]); const r = L.reservedRects[0]; B.push(['city builder', r]);
  const ov = []; for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i][1], b = B[j][1]; if (a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1) ov.push(B[i][0] + '/' + B[j][0]); }
  ok('Region plans, the Riyadh plan and the City Builder district never overlap', !ov.length, ov.join(' '));
  ok('Every region camera looks at its own plan and planAt() finds it', Object.entries(L.REGION_VIEWS).every(([k, v]) => L.planAt(v.camera.x, v.camera.z) === k));
  ok('Every region has English and Arabic names', Object.values(L.REGION_VIEWS).every(v => v.name.en && /[؀-ۿ]/.test(v.name.ar))); }

// ---- Geometry of every plan: land stays land, sea stays sea, clear gaps, roads on land and never through a landmark
{ const issues = [];
  const seg = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  const poly = (x, z, pts) => { let d = 1e9; for (let i = 1; i < pts.length; i++) d = Math.min(d, seg(x, z, pts[i - 1], pts[i])); return d; };
  for (const [rid, P] of Object.entries(RG.PLANS)) {
    const items = [...Object.entries(P.projects).map(([id, p]) => ({id, kind:'project', ...p})), ...Object.entries(P.places).map(([id, p]) => ({id:'place:' + id, kind:'place', ...p}))];
    const fd = (it, x, z) => it.ribbon ? poly(x, z, it.ribbon.pts) - it.ribbon.hw : Math.hypot(x - it.at[0], z - it.at[1]) - it.r;
    for (const it of items) { const [x, z] = it.at;
      if (it.sea ? anyLand(x, z) : !saudi(x, z)) issues.push(`${rid}:${it.id} ${it.sea ? 'should be at sea' : 'not on land'}`);
      const pad = it.pad || [x, z + (it.r || .03) * .72]; if (!it.sea && !saudi(...pad)) issues.push(`${rid}:${it.id} marker at sea`); }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const a = items[i], c = items[j], need = (a.kind === 'place' || c.kind === 'place') ? .015 : .04;
      const d = a.ribbon && c.ribbon ? 1 : a.ribbon ? fd(a, ...c.at) - c.r : c.ribbon ? fd(c, ...a.at) - a.r : Math.hypot(a.at[0] - c.at[0], a.at[1] - c.at[1]) - a.r - c.r;
      if (d < need) issues.push(`${rid}:${a.id}/${c.id} gap ${d.toFixed(3)}`); }
    for (const r of P.roads) { if (r.kind === 'boat') { if (r.pts.slice(1, -1).some(q => anyLand(...q))) issues.push(`${rid}:${r.id} boat on land`); continue; }
      if (r.kind === 'causeway') continue;
      for (let i = 1; i < r.pts.length; i++) for (let t = 0; t <= 1; t += .1) { const x = r.pts[i - 1][0] + (r.pts[i][0] - r.pts[i - 1][0]) * t, z = r.pts[i - 1][1] + (r.pts[i][1] - r.pts[i - 1][1]) * t; if (!saudi(x, z)) { issues.push(`${rid}:${r.id} leaves the land`); i = r.pts.length; break; } }
      const ends = [r.pts[0], r.pts[r.pts.length - 1]];
      for (const it of items) { if (it.id === 'haramain') continue;
        let md = 1e9; for (let i = 1; i < r.pts.length; i++) for (let t = 0; t <= 1; t += .05) { const x = r.pts[i - 1][0] + (r.pts[i][0] - r.pts[i - 1][0]) * t, z = r.pts[i - 1][1] + (r.pts[i][1] - r.pts[i - 1][1]) * t; md = Math.min(md, fd(it, x, z)); }
        if (md < r.w / 2 && !ends.some(e => fd(it, ...e) < .03)) issues.push(`${rid}:${r.id} runs through ${it.id}`); } }
    for (const [x, z] of P.isles) if (anyLand(x, z)) issues.push(`${rid}: island on land`);
  }
  ok('Plans: land/sea correct, footprints apart, roads on land and never through a landmark', !issues.length, issues.slice(0, 6).join('; '));
  const cross = []; for (const r of [...L.intercity, ...L.rails]) for (const it of Object.values(L.projects).filter(p => p.region && p.region !== 'riyadh' && !p.ribbon)) if (poly(it.x, it.z, r) < it.r) cross.push(it.id);
  ok('Intercity roads and rails stop at a plan gate instead of crossing regional landmarks', !cross.length, cross.join(' '));
  const gates = Object.values(RG.PLANS).flatMap(P => P.gates.map(g => ({g, P})));
  ok('Every gate meets one of its plan’s own roads or railways', gates.every(({g, P}) => P.roads.some(r => r.kind === g.kind && r.pts.some(q => Math.hypot(q[0] - g.pt[0], q[1] - g.pt[1]) < 1e-9)))); }

// ---- Eastern Province (estern.png)
ok('East: Jubail → Qatif → Dammam → Al Khobar from north to south along the Gulf coast', pr('eastern').z < pl('qatif').z && pl('qatif').z < pl('dammam').z && pl('dammam').z < pl('khobar').z
  && ['qatif', 'dammam', 'khobar'].every(id => inland('east', [pl(id).x, pl(id).z]) < .1) && inland('east', [pr('eastern').x, pr('eastern').z]) < .1);
ok('East: Dhahran is south-west / inland of Dammam', pl('dhahran').x < pl('dammam').x && pl('dhahran').z > pl('dammam').z && inland('east', [pl('dhahran').x, pl('dhahran').z]) > .12);
ok('East: Al Ahsa / Hofuf is far south-west inland, well away from the Gulf', pr('green').z > pl('khobar').z && inland('east', [pr('green').x, pr('green').z]) > .3 && inland('east', [pl('hofuf').x, pl('hofuf').z]) > .4);
{ const E = RG.PLANS.east.roads, id = x => E.find(r => r.id === x);
  ok('East: a coastal highway, a separate inland highway and a Dammam–Al Ahsa railway', id('eCoast') && id('eInland') && id('eRail').kind === 'rail'
    && Math.hypot(...id('eRail').pts[0].map((v, i) => v - [pl('dammam').x, pl('dammam').z][i])) - pl('dammam').r < .07 && L.polyDist(pl('hofuf').x, pl('hofuf').z, id('eRail').pts) < .06);
  ok('East: the King Fahd Causeway starts at Al Khobar and extends over the Gulf', Math.hypot(pl('khobar').x - id('eCauseway').pts[0][0], pl('khobar').z - id('eCauseway').pts[0][1]) - pl('khobar').r < .03 && id('eCauseway').pts.slice(1).every(q => !saudi(...q))); }

// ---- Western Corridor (western.png)
{ const W = RG.PLANS.west.roads, hr = pr('haramain').ribbon.pts, dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  ok('West: Madinah in the north, KAEC on the coast between Madinah and Jeddah, Jeddah on the central coast', pl('madinah').z < pr('ceer').z && pr('ceer').z < pl('jeddah').z && inland('west', [pr('ceer').x, pr('ceer').z]) < .09 && inland('west', [pl('jeddah').x, pl('jeddah').z]) < .09);
  ok('West: Makkah is inland east of Jeddah, with a land buffer to the Red Sea', pl('makkah').x > pl('jeddah').x + .2 && inland('west', [pl('makkah').x, pl('makkah').z]) > .3);
  ok('West: Masar Makkah is wholly inland and extends west from central Makkah', pr('masar').ribbon.pts.every(q => inland('west', q) > .15) && pr('masar').x < pl('makkah').x && Math.abs(pr('masar').ribbon.pts[0][0] - (pl('makkah').x - pl('makkah').r)) < .05);
  ok('West: Taif is east of Makkah; a mountain road (not the railway) links them', pl('taif').x > pl('makkah').x + .2 && W.find(r => r.id === 'wTaif').kind === 'road' && dist(W.find(r => r.id === 'wTaif').pts[0], [pl('makkah').x, pl('makkah').z]) < .07);
  ok('West: Haramain railway runs Madinah → KAEC → Jeddah → Makkah and does not reach Taif', dist(hr[0], [pl('madinah').x, pl('madinah').z]) < .12 && L.polyDist(pr('ceer').x, pr('ceer').z, hr) - pr('ceer').r < .08
    && L.polyDist(pl('jeddah').x, pl('jeddah').z, hr) - pl('jeddah').r < .05 && dist(hr[hr.length - 1], [pl('makkah').x, pl('makkah').z]) < .11 && L.polyDist(pl('taif').x, pl('taif').z, hr) > .2);
  ok('West: Rua Al Madinah is immediately east of the Prophet’s Mosque, inside Madinah', pr('madinah').x > pl('madinah').x && dist([pr('madinah').x, pr('madinah').z], [pl('madinah').x, pl('madinah').z]) < .15);
  ok('West: Ceer sits in KAEC, not in Jeddah or Makkah; Jeddah Central is inside Jeddah on the water', dist([pr('ceer').x, pr('ceer').z], [pl('jeddah').x, pl('jeddah').z]) > .3 && dist([pr('jeddahcentral').x, pr('jeddahcentral').z], [pl('jeddah').x, pl('jeddah').z]) < .12 && inland('west', [pr('jeddahcentral').x, pr('jeddahcentral').z]) < .03); }

// ---- NEOM / Northwest (neom.png)
{ const nw = RG.PLANS.northwest, line = pr('neom');
  ok('NW: Sindalah is a small island offshore in the north-west', !anyLand(pr('sindalah').x, pr('sindalah').z) && pr('sindalah').x < pr('oxagon').x && pr('sindalah').r <= .05);
  ok('NW: THE LINE is one slim corridor from the NEOM coast inland, crossing no other landmark', line.ribbon.hw <= .01 && inland('west', line.ribbon.pts[0]) < .06 && line.ribbon.pts[line.ribbon.pts.length - 1][0] - line.ribbon.pts[0][0] > .5
    && Object.values(L.projects).filter(p => p.id !== 'neom' && !p.ribbon).every(p => L.footDist(line, p.x, p.z) > p.r));
  ok('NW: Trojena is inland in the mountains; Oxagon on the coast; Green Hydrogen on Oxagon’s inland side', inland('west', [pr('trojena').x, pr('trojena').z]) > .3 && inland('west', [pr('oxagon').x, pr('oxagon').z]) < .03 && pr('hydrogen').x > pr('oxagon').x && Math.hypot(pr('hydrogen').x - pr('oxagon').x, pr('hydrogen').z - pr('oxagon').z) < .25);
  ok('NW: Tabuk east of NEOM; AlUla far south-east inland; AMAALA then the Red Sea Destination farther south', pl('tabuk').x > line.ribbon.pts[line.ribbon.pts.length - 1][0] && pr('alula').x > pl('tabuk').x && pr('alula').z > pl('tabuk').z
    && pr('amaala').z > pr('oxagon').z && pr('redsea').z > pr('amaala').z + .3 && inland('west', [pr('amaala').x, pr('amaala').z]) < .04);
  ok('NW: islands are reached by boat routes; there is no invented regional railway', nw.roads.filter(r => r.kind === 'boat').length >= 2 && !nw.roads.some(r => r.kind === 'rail'));
  ok('NW: "NEOM" is a regional heading, not a town', nw.heading && nw.heading.text.en === 'NEOM' && !Object.values(nw.places).some(q => /NEOM/.test(q.name.en))); }

// ---- Southwest (south.png)
{ const S = RG.PLANS.south.roads;
  ok('South: Jazan Industrial City is north of Jazan on the coast, with a clear gap between them', pr('jazan').z < pl('jazanc').z && Math.hypot(pr('jazan').x - pl('jazanc').x, pr('jazan').z - pl('jazanc').z) - pr('jazan').r - pl('jazanc').r > .2
    && inland('west', [pr('jazan').x, pr('jazan').z]) < .1 && inland('west', [pl('jazanc').x, pl('jazanc').z]) < .06);
  ok('South: Soudah is west of Abha on the high ridge; Abha on the plateau; Najran well east', pr('soudah').x < pl('abha').x && inland('west', [pl('abha').x, pl('abha').z]) > .3 && pl('najran').x > pl('abha').x + .5);
  ok('South: coastal road links both Jazans; a mountain road climbs to Abha with a Soudah branch; a highway runs on to Najran',
    L.polyDist(pr('jazan').x, pr('jazan').z, S.find(r => r.id === 'sCoast').pts) < pr('jazan').r + .03 && L.polyDist(pl('jazanc').x, pl('jazanc').z, S.find(r => r.id === 'sCoast').pts) < pl('jazanc').r + .06
    && S.find(r => r.id === 'sSoudah') && S.find(r => r.id === 'sNajran').pts.slice(-1)[0][0] > pl('najran').x - .1);
  ok('South: "Aseer" is a regional heading across the mountains, not a city model', RG.PLANS.south.heading.text.en === 'Aseer' && !Object.keys(RG.PLANS.south.places).includes('aseer')); }

// ---- Selection: every regional landmark is its own click target
{ const ids = [...Object.values(RG.PLANS).flatMap(P => Object.keys(P.projects))], plc = Object.keys(L.places);
  ok('Every regional project is tagged at its marker pad (click target = what is drawn)', ids.every(id => L.footprintAt(...pr(id).pad) === id), ids.filter(id => L.footprintAt(...pr(id).pad) !== id).join(' '));
  ok('Every city/district place is tagged at its centre and has an Arabic name', plc.every(id => L.footprintAt(L.places[id].x, L.places[id].z) === id && /[؀-ۿ]/.test(L.places[id].name.ar)), plc.filter(id => L.footprintAt(L.places[id].x, L.places[id].z) !== id).join(' '));
  ok('Cities on a plan are drawn (and clustered) at their place on the plan', ['Dammam', 'Jeddah', 'Makkah', 'Madinah', 'Taif', 'Tabuk', 'Abha', 'Jazan', 'Najran', 'Hofuf'].every(c => { const q = Object.values(L.places).find(p => p.city === c); return q && L.cityDisplay[c][0] === q.x && L.cityDisplay[c][1] === q.z; })); }

// ---- Compatibility: data, missions and saves are untouched by the plans
ok('Project source data (lon/lat/anchor) is unchanged', JSON.stringify(D.projects.map(p => [p.id, p.lon, p.lat, p.anchor])) === before);
{ const missing = []; for (const [b, B] of Object.entries(VM.BOARDS)) for (const [id, n] of Object.entries(B.nodes)) { if (n.project || b === 'riyadh') continue;
    const [x, z] = geo(n.lon, n.lat); if (!L.planAt(x, z, .1)) continue;   // outside every regional plan: drawn where it is
    if (!L.MISSION_SITES[b + ':' + id]) missing.push(b + ':' + id); }
  ok('Every mission-only site on the regional boards has a drawn place on its plan', !missing.length, missing.join(' ')); }
ok('Mission sites on regional plans sit on land', Object.entries(L.MISSION_SITES).filter(([k]) => !k.startsWith('riyadh:')).every(([, q]) => saudi(...q)));
{ const src = fs.readFileSync(path.join(root, 'saves.js'), 'utf8') + fs.readFileSync(path.join(root, 'sim.js'), 'utf8');
  ok('Saves and the simulation do not depend on the regional plans (no save-shape change)', !/VisionRegions|VisionLayout|PLANS/.test(src)); }

console.log(fails ? `\n${fails} FAILED` : '\nAll region tests passed');
process.exit(fails ? 1 : 0);
