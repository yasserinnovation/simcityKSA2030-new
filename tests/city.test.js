// node tests/city.test.js — City Builder phase completion tests (deterministic, headless).
global.window = {}; require('../city.js'); const C = window.VisionCity;
let fails = 0; const ok = (l, c) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); };
const S = () => C.state, run = n => { const ev = []; for (let k = 0; k < n; k++) ev.push(...C.tick()); return ev; }, grown = () => S().tiles.filter(t => t.k === 'z' && t.st >= 3).length;
// ---------- Phase 1
C.newCity({seed:7});
ok('Road preview shows cost, connection and does not build yet', (() => { const p = C.preview('road', [7,14], [20,14]); return p.ok && p.cost > 0 && p.connects && S().tiles[C.idx(10,14)].k === 'e'; })());
ok('Two connected roads are built', C.apply('road', [7,14], [20,14]).ok && C.apply('road', [20,15], [20,20]).ok && S().tiles[C.idx(20,20)].k === 'r');
ok('Homes and businesses zoned', C.apply('zoneR', [8,12], [19,13]).ok && C.apply('zoneC', [8,15], [19,15]).ok);
const r0 = S().tiles[C.idx(10,12)];
ok('A parcel without a road reports why it cannot develop', r0.needs.some(n => n.k === 'road' && !n.ok && /No road/.test(n.why.en)));
run(10);
ok('Buildings develop over time (plot → construction → occupied)', grown() >= 10 && S().m.pop > 40);
ok('Undo restores the layout before the last change', (() => { C.apply('road', [8,17], [12,17]); const had = S().tiles[C.idx(9,17)].k === 'r'; C.doUndo(); return had && S().tiles[C.idx(9,17)].k === 'e'; })());
const saved = C.serialize(); C.newCity({seed:1}); C.load(saved);
ok('Save → reload keeps the city and continues', S().m.pop > 40 && run(1) && S().month === 11);
// ---------- Phase 2
C.newCity({seed:8}); S().budget = 300;
C.apply('road', [26,5], [34,5]); C.apply('zoneR', [26,4], [34,4]); run(6);
ok('Zoning next to an isolated road does not grow', grown() === 0 && S().tiles.find(t => t.k === 'z').needs.some(n => n.k === 'road' && /not connected/.test(n.why.en)));
C.apply('road', [34,6], [34,20]); run(8);
ok('Connecting the road to the network enables growth', grown() > 0);
C.apply('zoneR', [26,6], [33,9]); C.apply('road', [26,10], [33,10]); C.apply('zoneR', [26,11], [33,13]); C.apply('road', [25,6], [25,13]);
for (let j = 7; j <= 19; j += 3) C.apply('road', [35,j], [39,j]); C.apply('zoneR', [35,6], [39,20]); run(14);
const acc = t => t.needs.find(n => n.k === 'road').ok;
const stalledBefore = S().tiles.filter(t => t.k === 'z' && acc(t) && t.st < 3 && t.needs.some(n => (n.k === 'water' || n.k === 'power') && !n.ok)).length;
ok('Growth outruns utility capacity (parcels stall for power/water)', stalledBefore > 0);
C.apply('pump', [33,14]); C.apply('gas', [33,16]); run(8);
ok('Adding a pumping station and plant on the network clears the constraint', S().tiles.filter(t => t.k === 'z' && acc(t) && t.st < 3 && t.needs.some(n => (n.k === 'water' || n.k === 'power') && !n.ok)).length === 0);
const supBefore = S().m.power.supply; C.apply('solar', [2,2]); ok('An isolated solar farm (no road access) adds no power to the district', S().tiles[C.idx(2,2)].k === 'f' && S().m.power.supply === supBefore);
C.apply('road', [3,2], [5,2]); ok('Connecting the solar farm by road adds its (storage-limited) output', S().m.power.supply > supBefore);
// ---------- Phase 3
C.newCity({seed:9}); S().budget = 400;
C.apply('road', [20,3], [36,3]); C.apply('road', [36,3], [36,20]); for (let j = 5; j <= 11; j += 3) C.apply('road', [20,j], [35,j]); C.apply('road', [20,3], [20,11]);
C.apply('zoneR', [21,4], [35,4]); C.apply('zoneR', [21,6], [35,7]); C.apply('zoneR', [21,9], [35,10]); C.apply('zoneR', [21,1], [35,2]);
C.apply('road', [24,22], [38,22]); C.apply('road', [24,26], [38,26]); C.apply('road', [24,22], [24,26]); C.apply('zoneC', [25,23], [38,25]); C.apply('zoneI', [25,27], [38,28]);
C.apply('pump', [37,12]); C.apply('gas', [37,14]); C.apply('school', [19,6]); C.apply('clinic', [19,9]);
run(36); C.settle();
const base = {commute:S().m.commute, vc:S().m.maxVC, net:S().m.budget.net};
ok('Two districts linked by one road become congested as they grow', base.vc > 1 && S().m.congested > 0);
const snap = C.serialize();
C.apply('road', [20,12], [20,20]);
ok('A second connecting road lowers commute time and peak congestion', S().m.commute < base.commute && S().m.maxVC < base.vc);
C.load(snap); C.addRoute([C.idx(21,5), C.idx(35,5), C.idx(36,12), C.idx(36,21), C.idx(30,22)], 8);
ok('A useful bus route carries riders, eases congestion and costs upkeep', S().m.busRiders > 10 && S().m.maxVC < base.vc && S().m.budget.net < base.net);
C.load(snap); C.addRoute([C.idx(21,5), C.idx(22,5)], 8);
ok('A bus route with no useful destinations barely helps', S().m.commute >= base.commute - .3);
C.load(snap); C.apply('road', [26,11], [26,19]);
ok('A dead-end spur carries no through-traffic', Math.abs(S().m.commute - base.commute) < .3);
ok('Taking short-term financing shows its future cost', (() => { const b = S().budget; const r = C.takeLoan(); return r.ok && S().budget === b + 25 && S().loan.pay * S().loan.left > 25; })());
// ---------- Phase 5 hook
ok('City outcomes produce explained scenario factor changes (capped)', (() => { const d = C.factorDeltas(); return d.length > 3 && d.every(x => Math.abs(x.delta) <= 3 && x.why && x.why.en); })());
ok('Deterministic: same seed and actions → same city', (() => { const a = []; for (const k of [0, 1]) { C.newCity({seed:42}); C.apply('road', [7,14], [20,14]); C.apply('zoneR', [8,13], [19,13]); run(8); a.push(C.serialize()); } return a[0] === a[1]; })());

// ---------- City missions (outcome-based, played in the same district)
const place=(f,i,j)=>{ for(let r=0;r<6;r++) for(let dj=-r;dj<=r;dj++) for(let di=-r;di<=r;di++){ const a=i+di,b=j+dj; if(a<0||b<0||a>39||b>39) continue; const t=C.state.tiles[C.idx(a,b)]; if(t.k!=='e') continue; const adj=[[0,1],[1,0],[0,-1],[-1,0]].some(([x,y])=>{const tt=C.state.tiles[C.idx(a+x,b+y)]; return tt&&tt.k==='r';}); if(!adj) continue; const r2=C.apply(f,[a,b],[a,b]); if(r2.ok) return [a,b]; } return null; };
const mbase=(seed=11)=>{ C.newCity({seed}); S().budget=200;
  C.apply('road',[7,14],[24,14]); C.apply('road',[24,15],[24,20]); C.apply('road',[7,10],[24,10]); C.apply('road',[24,11],[24,13]); C.apply('road',[7,17],[24,17]);
  C.apply('zoneR',[8,13],[23,13]); C.apply('zoneR',[8,11],[23,11]); C.apply('zoneC',[8,15],[23,15]); C.apply('zoneR',[8,9],[23,9]); C.apply('zoneC',[8,16],[23,16]);
  C.apply('road',[8,11],[8,12]); C.apply('road',[16,11],[16,12]); C.apply('zoneR',[9,12],[15,12]); C.apply('zoneR',[17,12],[23,12]);
  place('pump',25,16); place('gas',25,18); place('park',8,12); place('park',20,12); place('park',14,8); place('school',7,15); place('clinic',7,16); place('park',12,18); run(18); };
const res=l=>{ const st=S().mission; const r=st.result||{}; console.log(l.padEnd(40), 'medal', r.medal, 'used', r.used, 'checks', JSON.stringify(C.missionStatus().checks.map(c=>(c.ok?'✓':'✗')+(c.v??''))), 'budget', S().budget.toFixed(1), 'deltas', (r.deltas||[]).map(d=>d.factor+':'+d.delta).join(' ')); };

const runM = n => { for (let k = 0; k < n && !(S().mission && S().mission.done); k++) C.tick(); return S().mission.result || {}; };
mbase(); const msnap = C.serialize();
const tryM = (id, act, n) => { C.load(msnap); C.startMission(id); act(); return runM(n); };
ok('cA: doing nothing fails', !tryM('cA', () => {}, 12).medal);
ok('cA: a gateway bus route through the homes wins', !!tryM('cA', () => C.addRoute([C.idx(1,21),C.idx(6,17),C.idx(10,17),C.idx(10,14),C.idx(16,14),C.idx(16,10),C.idx(22,10),C.idx(24,14),C.idx(24,21),C.idx(38,21)],8), 12).medal);
ok('cB: an isolated solar farm cannot win', !tryM('cB', () => C.apply('solar',[3,3],[3,3]), 12).medal);
ok('cB: gas plant only fails the solar-share goal', !tryM('cB', () => { place('gas',25,18); }, 12).medal);
ok('cB: adding solar + batteries on the network wins', !!tryM('cB', () => { place('solar',25,18); place('solar',25,19); place('solar',25,20); place('battery',25,12); place('battery',25,11); place('battery',23,18); }, 12).medal);
ok('cB: replacing the gas plant with solar + batteries also wins', !!tryM('cB', () => { C.apply('remove',[25,18],[26,20]); for (const k of [0,1,2]) place('solar',22+k,19); place('battery',23,20); place('battery',21,18); }, 12).medal);
ok('cC: industry served only by trucks fails', !tryM('cC', () => { C.apply('road',[26,22],[38,22]); C.apply('zoneI',[27,23],[38,24]); }, 15).medal);
ok('cC: a freight rail line to the edge with terminals wins', !!tryM('cC', () => { C.apply('road',[26,22],[38,22]); C.apply('zoneI',[27,23],[38,24]); C.apply('rail',[27,26],[39,26]); C.apply('road',[26,23],[26,25]); place('terminal',27,25); C.apply('road',[33,23],[33,25]); place('terminal',34,25); }, 15).medal);
ok('cD: an unprepared investment site fails', !tryM('cD', () => place('invest',25,10), 18).medal);
ok('cD: a prepared site (access, utilities, services, skills) reaches offers and wins', (() => { C.load(msnap); C.startMission('cD'); place('invest',25,10); place('training',25,13); place('clinic',25,12); place('school',25,14); place('park',26,11); C.addRoute([C.idx(7,10),C.idx(17,10),C.idx(24,10),C.idx(24,20)],6);
  for (let k = 0; k < 18 && !S().mission.done; k++) { C.tick(); if ((S().m.readiness || 0) >= 70 && !S().invest.offer) C.acceptOffer('B'); } return !!(S().mission.result || {}).medal; })());
ok('cE: no training fails', !tryM('cE', () => {}, 18).medal);
ok('cE: training centres near homes plus reachable jobs win', !!tryM('cE', () => { place('training',7,11); place('training',25,13); C.apply('road',[26,22],[38,22]); C.apply('zoneI',[27,23],[38,24]); }, 18).medal);
ok('A city mission win records a before/after comparison and explained factor changes', (() => { const r = S().mission.result; return r.before && r.after && r.after.month > r.before.month && r.deltas.every(d => d.why && d.why.en); })());
console.log(fails ? `\n${fails} FAILED` : '\nAll city tests passed'); process.exit(fails ? 1 : 0);
