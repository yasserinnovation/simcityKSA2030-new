// node tests/tutorial.test.js — the tutorial scenario on the real City Builder simulation (headless, deterministic).
// Checks that every tutorial step is a real simulation outcome, that the KPIs it reports come from the simulation, and that
// the scenario setting (gridPower) never changes existing worlds or old saves.
global.window = {}; require('../city.js'); const C = window.VisionCity;
let fails = 0; const ok = (l, c, info = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l.padEnd(84)} ${info}`); };
const S = () => C.state, homes = () => S().tiles.filter(t => t.k === 'z' && t.zone === 'R');
const tutorialCity = () => C.newCity({seed:2030, anchors:[], gridPower:0, budget:40});

// ---------- save compatibility: worlds without the field behave exactly as before
C.newCity({seed:7}); const plain = JSON.parse(C.serialize());
ok('A normal new City Builder world does not carry the tutorial setting', plain.gridPower === undefined);
C.apply('road', [7,14], [16,14]); C.apply('zoneR', [8,13], [15,13]);
ok('Normal worlds still get 30 units of regional power at the gates', Math.round(S().m.power.supply) === 30 && homes().every(t => t.pow));
const old = JSON.parse(C.serialize()); delete old.gridPower; C.load(JSON.stringify(old));
ok('An old save (no gridPower field) loads with the regional supply unchanged', Math.round(S().m.power.supply) === 30);
const ref = (() => { C.newCity({seed:11}); C.apply('road', [7,14], [20,14]); C.apply('zoneR', [8,13], [19,13]); for (let k = 0; k < 12; k++) C.tick(); return C.summary(); })();
const again = (() => { C.newCity({seed:11}); C.apply('road', [7,14], [20,14]); C.apply('zoneR', [8,13], [19,13]); for (let k = 0; k < 12; k++) C.tick(); return C.summary(); })();
ok('Normal worlds are unchanged and deterministic (same layout → same outcome)', JSON.stringify(ref) === JSON.stringify(again) && ref.pop > 0, `pop ${ref.pop}`);

// ---------- the tutorial scenario, step by step, through the public API the interface uses
tutorialCity();
ok('Tutorial world: 40 credits, no spare regional power, water at the gates', S().budget === 40 && S().gridPower === 0);
const iso = C.preview('road', [20,5], [25,5]);
ok('Road step: an isolated street previews as not connected', iso.ok && !iso.connects && /Not connected/.test(iso.info.en));
ok('Road step: a street from the main road previews as connected', C.preview('road', [7,14], [16,14]).connects);
C.apply('road', [7,14], [16,14]);
ok('Road step: the street joins a gate-connected network', S().tiles.filter((t, u) => t.k === 'r' && !t.art && S().m.compGate[S().m.comp[u]]).length === 10);
const zp = C.preview('zoneR', [8,12], [15,13]);
ok('Homes step: zoning plots away from the road is flagged in the preview', /no road access/.test(zp.info.en));
C.apply('zoneR', [8,13], [15,13]);
ok('Homes step: zoned plots have road access but no power', homes().length === 8 && homes().every(t => t.needs.find(n => n.k === 'road').ok && !t.pow));
for (let k = 0; k < 3; k++) C.tick();
ok('Without power nothing is built, whatever time passes', homes().every(t => t.st === 0) && S().m.pop === 0);
const solarFar = C.preview('solar', [22,4], [22,4]);
ok('Power step: a solar farm away from roads is flagged', /No road access/.test(solarFar.info.en));
C.apply('solar', [22,4]);
ok('Power step: an unconnected solar farm powers nothing', homes().every(t => !t.pow));
C.doUndo(); C.apply('solar', [16,13]);
ok('Power step: a solar farm beside the street powers every plot', homes().every(t => t.pow), `${S().m.power.used.toFixed(1)}/${S().m.power.supply.toFixed(1)}`);
const before = {pop:S().m.pop, net:S().m.budget.net}; let months = 0;
while (homes().filter(t => t.st >= 3).length < 6 && months < 18) { C.tick(); months++; }
ok('Time step: residents arrive through construction (plot → building → occupied)', S().m.pop > before.pop && homes().filter(t => t.st >= 3).length >= 6, `${before.pop} → ${S().m.pop} in ${months} months`);
ok('Time step: the monthly balance improves because residents pay tax', S().m.budget.net > before.net && S().m.budget.income > 0, `${before.net} → ${S().m.budget.net}`);
const land0 = Math.round(homes().filter(t => t.st >= 3).reduce((a, t) => a + t.lv0, 0) / homes().filter(t => t.st >= 3).length), env0 = S().m.env;
const pp = C.preview('park', [10,12], [10,12]);
ok('Park step: a park without a road is not reported as "will not work" (parks serve on foot)', !/will not work/.test(pp.info.en));
C.apply('park', [10,12]);
const served = homes().filter(t => t.st >= 3 && t.cov.park), land1 = Math.round(served.reduce((a, t) => a + t.lv0, 0) / served.length);
ok('Park step: homes within walking reach are served', served.length >= 4, `${served.length} homes`);
ok('Park step: land value of served homes rises (simulation, not a counter)', land1 > land0, `${land0} → ${land1}`);
ok('Park step: the neighbourhood environment score rises', S().m.env > env0, `${env0} → ${S().m.env}`);
ok('Tutorial world never has challenges forced on it by the scenario itself', Array.isArray(S().challenges));
const saved = C.serialize(); tutorialCity(); C.load(saved);
ok('Tutorial world save/load keeps its setting and progress (Resume)', S().gridPower === 0 && S().m.pop > 0 && homes().every(t => t.pow));

console.log(fails ? `\n${fails} FAILED` : '\nAll tutorial simulation tests passed'); process.exit(fails ? 1 : 0);
