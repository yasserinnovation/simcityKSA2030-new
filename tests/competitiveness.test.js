// node tests/competitiveness.test.js — verifies the observed 2026 baseline and the separation of observed / simulated / forecast data.
global.window = {};
require('../data.js'); require('../mission.js'); require('../competitiveness.js');
const C = window.VisionCompetitiveness, V = window.VisionMissions, O = C.OBSERVED;
let fails = 0; const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ok('Source label exact', O.SOURCE.label.en === 'IMD World Competitiveness Yearbook 2026 — Saudi Arabia one-page profile; challenges provided by the National Competitiveness Center');
ok('Overall 13th of 70; history 24→17→16→17→13', O.RANKS.overall.of === 70 && eq(O.RANKS.overall.history, {2022:24, 2023:17, 2024:16, 2025:17, 2026:13}));
ok('EMEA 8th of 45; history 17→12→10→11→8', O.RANKS.emea.of === 45 && eq(O.RANKS.emea.history, {2022:17, 2023:12, 2024:10, 2025:11, 2026:8}));
ok('Pop>20m 4th of 32; history 8→4→5→5→4', O.RANKS.pop20m.of === 32 && eq(O.RANKS.pop20m.history, {2022:8, 2023:4, 2024:5, 2025:5, 2026:4}));
const expected = {domestic:[58.7,9], trade:[55.5,20], investment:[55.1,18], employment:[55.7,22], prices:[57.6,16], pubfin:[64.7,11], tax:[64.3,10], institutional:[55.3,28], legislation:[66.9,9], societal:[47.0,42],
  productivity:[63.9,13], labor:[61.9,6], finance:[60.7,17], management:[65.2,9], attitudes:[78.0,4], basic:[64.1,3], tech:[55.1,29], science:[50.1,29], health:[47.6,43], education:[53.1,37]};
ok('Exactly 4 domains and 20 factors (5 per domain)', O.DOMAINS.length === 4 && O.FACTORS.length === 20 && O.DOMAINS.every(d => O.FACTORS.filter(f => f.domain === d.id).length === 5));
ok('All 20 factor scores and ranks match the baseline table', Object.entries(expected).every(([id, [sc, rk]]) => { const f = O.FACTORS.find(x => x.id === id); return f && f.score === sc && f.rank === rk && f.year === 2026; }));
ok('Change annotations stored as untranscribed metadata, not measured changes', O.FACTORS.every(f => f.change === null && /not transcribed/.test(f.changeNote)));
const fact = id => O.FACTS.find(f => f.id === id);
ok('Precise PDF figures used (2,150; 3.750; 37.07; 73,621; 2.03; 3.24; −2.96)', fact('land').value === 2150 && fact('fx').value === 3.750 && fact('population').value === 37.07 && fact('gdppc').value === 73621 && fact('inflation').value === 2.03 && fact('unemployment').value === 3.24 && fact('current').value === -2.96);
ok('Rounded slide values kept only as metadata', fact('land').slide === '2,149.7' && fact('fx').slide === '3.8' && fact('population').slide === '37.1');
ok('Fact years: 2025 for economy, 2024 for investment stocks/flows', ['land','fx','population','gdp','gdppc','growth','inflation','unemployment','labor','current'].every(id => fact(id).year === 2025) && fact('fdistock').year === 2024 && fact('fdiflow').year === 2024);
ok('Fact ranks: 25,18,18,14,22,15,25,53,28,46; land rank not from PDF', eq(['population','gdp','gdppc','growth','inflation','unemployment','labor','current','fdistock','fdiflow'].map(id => fact(id).rank), [25,18,18,14,22,15,25,53,28,46]) && fact('land').rank === null && /slide/.test(fact('land').rankNote.en));
ok('Five challenges → arcs A–E', O.CHALLENGES.map(c => c.arc).join('') === 'ABCDE');
ok('Every factor has a gameplay role and at least one mission', O.FACTORS.every(f => C.ROLE[f.id] && C.ROLE[f.id].where.length && C.ROLE[f.id].where.every(mid => V.mission(mid))));
ok('Observed dataset is frozen', Object.isFrozen(O) && Object.isFrozen(O.FACTORS[0]) && Object.isFrozen(O.RANKS.overall.history));
try { O.FACTORS[0].score = 99; } catch (e) {}
try { O.FACTS[1].value = 1; } catch (e) {}
ok('Mutation attempts do not change observed values', O.FACTORS[0].score === 58.7 && fact('land').value === 2150);
// Play missions and feed results into the scenario; observed data must be untouched.
const snapshot = JSON.stringify(O);
const profile = {missions:{}};
const runMission = (mid, plan, auto, order) => { V.init(mid); while (!V.state.done) { for (const [id, t] of (plan[V.state.turn] || [])) V.addPlan(id, t); for (const pid of order || []) if (V.validTargets('advance').includes(pid)) V.addPlan('advance', pid); if (auto && !V.state.invest.offer && (V.state.m.readiness || 0) >= 62 && V.state.m.readinessParts.infra === 100) V.addPlan(auto); V.endTurn(); } const r = V.state.result; profile.missions[mid] = {medal:r.medal, compDeltas:C.deltasFor(r)}; return r; };
const r1 = runMission('m1', {1:[['brt','brt:core-expo'],['brt','brt:core-ksip']],3:[['freq']]});
const rc = runMission('c1', {1:[['freight','freight:eastgate-dryport'],['digital']],2:[['warehouse','dryport']],3:[['freight','freight:westgate-dryport']]});
const rd = runMission('d1', {1:[['academy','diriyah'],['brt','brt:core-diriyah']],2:[['brt','brt:diriyah-qiddiya'],['permits']]}, 'offerB');
const rt = runMission('t1', {1:[['academy','murabba']]}, null, ['solar','logistics','industry']);
ok('Arc missions C, D, E win with a sensible strategy', !!rc.medal && !!rd.medal && !!rt.medal);
ok('Observed data unchanged after playing four missions', JSON.stringify(O) === snapshot);
const sc = C.scenario(profile);
ok('Scenario index starts from the observed baseline average', Math.abs(sc.baseIndex - O.FACTORS.reduce((a, f) => a + f.score, 0) / 20) < .06);
ok('Scenario deltas are traceable (every delta has causes)', sc.factors.every(f => f.delta === 0 || f.causes.length > 0));
ok('Supply-chain win improves International Trade in the scenario only', sc.factors.find(f => f.id === 'trade').current > 55.5 && O.FACTORS.find(f => f.id === 'trade').score === 55.5);
ok('Investment win improves International Investment; Education improves from academies', sc.factors.find(f => f.id === 'investment').delta > 0 && sc.factors.find(f => f.id === 'education').delta > 0);
const fc = C.forecast(profile);
ok('Forecast is a labelled range for 2030, never a rank', fc.year === 2030 && fc.low <= fc.mid && fc.mid <= fc.high && !('rank' in fc));
ok('Unfinished missions change nothing', C.deltasFor({medal:null, measures:{trust:90}}).length === 0);
const worse = {missions:{m1:{medal:'gold', compDeltas:C.deltasFor(r1)}}}, better = {missions:{m1:{medal:'gold', compDeltas:C.deltasFor(r1)}}};
ok('Replaying stores the best result per mission (no stacking)', C.scenario(worse).index === C.scenario(better).index);
console.log(fails ? `\n${fails} FAILED` : '\nAll competitiveness tests passed'); process.exit(fails ? 1 : 0);
