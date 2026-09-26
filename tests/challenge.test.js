// node tests/challenge.test.js — the Riyadh sandstorm challenge: plan-drawn asset positions never change its simulation.
global.window = {};
require('../data.js'); require('../layout.js'); require('../sim.js');
const D = window.VISION_DATA, L = window.VisionLayout, SIM = window.VisionSim;
let fails = 0; const ok = (l, c, info='') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l.padEnd(74)} ${info}`); };
// The same world placement as engine.js W.place (lon/lat spread 3.4× around the anchor city) — the simulation's frame.
const city = n => D.cities.find(c => c.name === n);
const place = (lon, lat, anchor) => { let [x, z] = L.geo(lon, lat); const c = anchor && city(anchor); if (c) { const [ax, az] = L.geo(c.lon, c.lat); x = ax + (x - ax) * 3.4; z = az + (z - az) * 3.4; } return [x, z]; };
SIM.setWorld({setProjectState(){}, place});

// ---- Drawn positions: every asset sits on its own district parcel (or open ground), away from roads and other parcels
const C = SIM.CHALLENGES.sandstorm, S = L.CHALLENGE_SITES.sandstorm;
ok('Every sandstorm asset has a place on the district plan', C.assets.every(a => S[a.id]));
const expect = {ksia:'ksip', 'expo-site':'expo', 'murabba-site':'newmurabba', 'metro-ops':'metro', 'sub-east':null, freight:null};
ok('Assets are drawn on their matching parcel (airport, Expo, New Murabba, Metro)', C.assets.every(a => L.footprintAt(...S[a.id]) === expect[a.id]), C.assets.map(a => a.id + '→' + L.footprintAt(...S[a.id])).join(' '));
ok('Grid and freight assets sit on open ground, clear of city roads', ['sub-east', 'freight'].every(id => L.cityRoadDist(...S[id]) > .03 && !L.footprintAt(...S[id])));
ok('Drawn asset markers are spread apart (≥ 0.15) so their click zones stay distinct', C.assets.every((a, i) => C.assets.every((b, j) => i >= j || Math.hypot(S[a.id][0] - S[b.id][0], S[a.id][1] - S[b.id][1]) >= .15)));

// ---- Simulation is untouched: the same response plan gives the pinned outcome
function run(){
  SIM.init({mode:'challenge', difficulty:'executive', challenge:'sandstorm'});
  for (let i = 0; i < 40 && !SIM.state.challenge; i++) SIM.tickMonth();
  const ch = SIM.state.challenge; if (!ch) return null;
  for (const a of ch.assets) { const u = ch.units.find(u => !u.pos && u.supports.includes(a.kind)); if (u) SIM.dispatch(u.type, [...a.pos], a.id); }
  SIM.setToggle('pauseOutdoor', true);
  let review = null; SIM.on((ev, d) => { if (ev === 'challengeEnd') review = d; });
  for (let i = 0; i < 4000 && !review; i++) SIM.challengeTick(.05);
  return review && {score:review.score, continuity:review.continuity, stabilization:review.stabilization};
}
const r = run();
ok('The scripted sandstorm response finishes with a review', !!r, JSON.stringify(r));
ok('Its outcome matches the pinned V5 result (score 57, continuity 77, stabilised 88)', r && r.score === 57 && r.continuity === 77 && r.stabilization === 88, JSON.stringify(r));
const r2 = run(); ok('The challenge simulation is deterministic', JSON.stringify(r) === JSON.stringify(r2));

// ---- Drawing units: a stateless sim → plan map, exact at every site, never folding, invertible for clicks
const base0 = (() => { const as = SIM.challengeAssets('sandstorm'); return [as.reduce((t, a) => t + a.pos[0], 0) / as.length + .35, as.reduce((t, a) => t + a.pos[1], 0) / as.length + .3]; })();
const WP = L.planWarp([...SIM.challengeAssets('sandstorm').map(a => ({s:a.pos, v:S[a.id]})), {s:base0, v:S._base}]);
ok('The unit map never folds (no triangle flips orientation)', WP.folds === 0, `${WP.tris} triangles`);
ok('A unit on site is drawn exactly at its drawn asset; at base, at the drawn base', SIM.challengeAssets('sandstorm').every(a => { const f = WP.fwd(a.pos), v = S[a.id]; return Math.hypot(f[0] - v[0], f[1] - v[1]) < 1e-9; }) && Math.hypot(WP.fwd(base0)[0] - S._base[0], WP.fwd(base0)[1] - S._base[1]) < 1e-9);
{ let worst = 0; for (let i = 0; i < 300; i++) { const v = [S._base[0] - 1.2 + (i % 20) * .1, S._base[1] - .9 + Math.floor(i / 20) * .1], r = WP.fwd(WP.inv(v)); worst = Math.max(worst, Math.hypot(r[0] - v[0], r[1] - v[1])); }
  ok('Open-ground clicks map back to the simulated point drawn under the pointer', worst < 1e-9, worst.toExponential(1)); }

// ---- Save and resume mid-storm: same state, same drawing, same result
{ const setup = () => { SIM.init({mode:'challenge', difficulty:'executive', challenge:'sandstorm'}); for (let i = 0; i < 40 && !SIM.state.challenge; i++) SIM.tickMonth();
    const ch = SIM.state.challenge; for (const a of ch.assets) { const u = ch.units.find(u => !u.pos && u.supports.includes(a.kind)); if (u) SIM.dispatch(u.type, [...a.pos], a.id); }
    SIM.setToggle('pauseOutdoor', true); };
  const finish = () => { for (let i = 0; i < 4000 && !SIM.state.lastReview; i++) SIM.challengeTick(.05); const r = SIM.state.lastReview; return r && JSON.stringify({score:r.score, continuity:r.continuity, stabilization:r.stabilization}); };
  setup(); for (let i = 0; i < 20; i++) SIM.challengeTick(.05);        // 1 s in: units still on the road
  let ch = SIM.state.challenge; const moving = ch.units.filter(u => u.pos && !u.onsite).length;
  for (let i = 0; i < 600; i++) SIM.challengeTick(.05);                  // then deep into the storm
  ch = SIM.state.challenge; const exposed = ch.assets.filter(a => a.exposure > .08).length;
  // send the survey drone on to the freight corridor so a unit is in transit at the snapshot
  const dest = ch.assets.find(a => a.id === 'freight'); SIM.dispatch('drone', [...dest.pos], dest.id); for (let i = 0; i < 4; i++) SIM.challengeTick(.05);
  ch = SIM.state.challenge; const transit = ch.units.filter(u => u.pos && !u.onsite).length;
  const saved = SIM.serialize(), drawnBefore = ch.units.filter(u => u.pos).map(u => WP.fwd(u.pos).map(v => v.toFixed(9)).join());
  ok('Test run has units in transit and exposed assets', moving > 0 && transit > 0 && exposed > 0, `${moving} moving at start, ${transit} in transit at snapshot, ${exposed} exposed`);
  const straight = finish();
  SIM.load(saved); const re = SIM.state.challenge;
  ok('After reload the challenge state is identical (units, targets, assignments, assets)', JSON.stringify(re) === JSON.stringify(JSON.parse(saved).challenge));
  ok('After reload every unit is drawn at the same place, heading to its drawn asset', JSON.stringify(re.units.filter(u => u.pos).map(u => WP.fwd(u.pos).map(v => v.toFixed(9)).join())) === JSON.stringify(drawnBefore)
    && re.units.filter(u => u.target && u.assetId).every(u => { const t = WP.fwd(u.target), v = S[u.assetId]; return Math.hypot(t[0] - v[0], t[1] - v[1]) < .06; }));
  const resumed = finish();
  ok('Finishing after reload gives the same result as never stopping', !!straight && straight === resumed, `${straight} vs ${resumed}`); }


console.log(fails ? `\n${fails} FAILED` : '\nAll challenge tests passed');
process.exit(fails ? 1 : 0);
