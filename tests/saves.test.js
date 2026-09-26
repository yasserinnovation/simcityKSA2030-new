// node tests/saves.test.js — save integrity: separate world saves, migration, and City Builder edits made while paused.
global.window = {};
require('../data.js'); require('../sim.js'); require('../saves.js'); require('../city.js');
const SIM = window.VisionSim, SV = window.VisionSaves, C = window.VisionCity;
SIM.setWorld({setProjectState(){}, place:(lon, lat) => [lon, lat]});   // minimal 3D-world stub for headless runs
let fails = 0; const ok = (l, c, info='') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l.padEnd(70)} ${info}`); };
// In-memory Storage with the same interface as localStorage
function store(init = {}){ const m = new Map(Object.entries(init)); return {getItem:k => m.has(k) ? m.get(k) : null, setItem:(k, v) => m.set(k, String(v)), removeItem:k => m.delete(k), key:i => [...m.keys()][i] ?? null, get length(){ return m.size; }, keys:() => [...m.keys()]}; }
const campaignAt = months => { SIM.init({mode:'campaign', difficulty:'executive'}); for (let i = 0; i < months; i++) SIM.tickMonth(); return JSON.parse(SIM.serialize()); };
const challenge = id => { SIM.init({mode:'challenge', difficulty:'executive', challenge:id}); return JSON.parse(SIM.serialize()); };

// ---- 1. A Timed Challenge never overwrites the Campaign
{ const st = store();
  SIM.init({mode:'campaign', difficulty:'executive'}); for (let i = 0; i < 14; i++) SIM.tickMonth(); SV.write(st, SIM.state);
  SIM.init({mode:'challenge', difficulty:'executive', challenge:'sandstorm'}); SV.write(st, SIM.state);
  const camp = SV.read(st, 'campaign'), ch = SV.read(st, 'challenge-sandstorm');
  ok('Challenge and campaign are saved in separate slots', camp && ch && camp.mode === 'campaign' && camp.month === 14 && ch.mode === 'challenge');
  SIM.init({mode:'challenge', difficulty:'executive', challenge:'sandstorm'}); SV.retire(st, 'challenge-sandstorm'); SV.write(st, SIM.state);   // "Try another strategy"
  ok('Retrying a challenge replaces only that challenge (campaign still month 14)', SV.read(st, 'campaign').month === 14);
  ok('The replaced challenge attempt is kept as a one-step backup', !!st.getItem(SV.keyOf('challenge-sandstorm') + '.replaced'));
  SIM.init({mode:'challenge', difficulty:'executive', challenge:'hajj'}); SV.write(st, SIM.state);
  ok('Each Timed Challenge has its own slot', SV.list(st).map(w => w.slot).join(',') === 'campaign,challenge-hajj,challenge-sandstorm');
  SIM.load(st.getItem(SV.keyOf('campaign'))); SIM.continueSandbox(); SV.write(st, SIM.state);
  ok('Beyond 2030 continues in the campaign world (no new slot)', SV.read(st, 'campaign').mode === 'sandbox' && !SV.read(st, 'sandbox'));
  SIM.init({mode:'sandbox', difficulty:'executive'}); SV.write(st, SIM.state);
  ok('A fresh Sandbox gets its own slot and leaves the campaign alone', SV.read(st, 'sandbox') && SV.read(st, 'campaign').month === 14);
  ok('A loaded save carries its slot, so autosave writes back to the same world', JSON.parse(st.getItem(SV.keyOf('challenge-hajj'))).slot === 'challenge-hajj'); }

// ---- 2. Migration from the old single key ('visionNexus2030.save.v3')
{ const legacy = campaignAt(9), st = store({[SV.LEGACY]:JSON.stringify(legacy)});
  const r = SV.migrate(st);
  ok('Legacy campaign save moves to the campaign slot unchanged', r.migrated && r.slot === 'campaign' && SV.read(st, 'campaign').month === 9 && SV.read(st, 'campaign').budget === legacy.budget);
  ok('Legacy key is removed but its data is kept as .migrated', st.getItem(SV.LEGACY) === null && JSON.parse(st.getItem(SV.LEGACY + '.migrated')).month === 9);
  ok('Migration runs once (second call is a no-op)', SV.migrate(st).migrated === false && SV.read(st, 'campaign').month === 9); }
{ const st = store({[SV.LEGACY]:JSON.stringify(challenge('rainfall'))});
  ok('Legacy challenge save moves to its challenge slot', SV.migrate(st).slot === 'challenge-rainfall' && !SV.read(st, 'campaign')); }
{ SIM.init({mode:'sandbox', difficulty:'executive'}); const sb = JSON.parse(SIM.serialize());
  const c = campaignAt(2); c.mode = 'sandbox'; c.log.push({month:84, text:'Future chapter — Beyond 2030: the Kingdom continues with no mandate limits.', kind:'success'});
  ok('Legacy fresh sandbox → sandbox slot; legacy Beyond 2030 → campaign slot', SV.slotOf(sb) === 'sandbox' && SV.slotOf(c) === 'campaign'); }
{ const st = store({[SV.LEGACY]:JSON.stringify(campaignAt(3))}); SV.write(st, JSON.parse(JSON.stringify(Object.assign(campaignAt(20), {slot:'campaign'}))));
  const r = SV.migrate(st);
  ok('Migration never overwrites a newer world save (old copy kept as .legacy)', r.conflict && SV.read(st, 'campaign').month === 20 && JSON.parse(st.getItem(SV.keyOf('campaign') + '.legacy')).month === 3); }
{ const st = store({[SV.LEGACY]:'{not json'}); const r = SV.migrate(st);
  ok('An unreadable legacy save is left untouched', !r.migrated && st.getItem(SV.LEGACY) === '{not json'); }

// ---- 3. City Builder: edits made while paused are due for saving promptly (no month tick, no navigation)
{ C.newCity({seed:7}); const st = store(); const save = () => { const rv = C.rev(); st.setItem(C.KEY, C.serialize()); return rv; };
  let savedRev = save(); const month0 = C.state.month;
  ok('A freshly saved city has nothing due', !C.autosaveDue(savedRev, Date.now() + 1000));
  C.apply('road', [7,14], [20,14]);
  ok('Placing a road while paused makes a save due (after a short quiet period)', C.autosaveDue(savedRev, Date.now() + 500) && !C.autosaveDue(savedRev, Date.now() - 1000) && C.state.month === month0);
  savedRev = save();
  const t0 = C.rev(), refused = C.apply('road', [7,14], [20,14]);   // already a road: nothing to build
  ok('A refused action does not count as a change', refused.ok === false && C.rev() === t0 && !C.autosaveDue(savedRev, Date.now() + 1000), `→ ${refused.ok}`);
  C.apply('remove', [18,14], [20,14]); ok('Removal while paused is due for saving', C.autosaveDue(savedRev, Date.now() + 500)); savedRev = save();
  C.doUndo(); ok('Undo while paused is due for saving', C.autosaveDue(savedRev, Date.now() + 500)); savedRev = save();
  const road19 = C.state.tiles[C.idx(19,14)].k;
  C.takeLoan(); ok('Taking a loan while paused is due for saving', C.autosaveDue(savedRev, Date.now() + 500)); savedRev = save();
  C.setTax('R', 12); C.setPolicy('conserve', true); ok('Budget and policy changes while paused are due for saving', C.autosaveDue(savedRev, Date.now() + 500)); savedRev = save();
  const live = C.serialize(); C.newCity({seed:99}); C.load(st.getItem(C.KEY));
  ok('Reloading the saved city restores every paused edit (road, undo, loan, tax, policy)', C.serialize() === live && road19 === 'r' && C.state.loan && C.state.tax.R === 12 && C.state.policy.conserve && C.state.month === month0); }

console.log(fails ? `\n${fails} FAILED` : '\nAll save-integrity tests passed');
process.exit(fails ? 1 : 0);
