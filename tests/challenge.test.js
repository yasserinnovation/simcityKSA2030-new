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

console.log(fails ? `\n${fails} FAILED` : '\nAll challenge tests passed');
process.exit(fails ? 1 : 0);
