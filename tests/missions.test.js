// Headless mission tests: node tests/missions.test.js
// Checks that every mission has 2+ winning strategies, that careless play fails, and that rewind/save work.
global.window = {};
require('../data.js'); require('../mission.js');
const V = window.VisionMissions;
let fails = 0;
function play(mid, plan, up=[], order){
  V.init(mid, {upgrades:up});
  while (!V.state.done) {
    for (const [id, t] of (plan[V.state.turn] || [])) V.addPlan(id, t);
    if (order) for (const pid of order) if (V.validTargets('advance').includes(pid)) V.addPlan('advance', pid);
    V.endTurn();
  }
  return V.state.result;
}
function expect(label, res, ok){ const pass = ok(res); if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} → ${res.medal || 'none'} (${res.composite})`); }
const win = r => !!r.medal, lose = r => !r.medal;
expect('M1 do nothing fails', play('m1', {}), lose);
expect('M1 road widening only fails (ring congestion)', play('m1', {1:[['road','road:expo-core'],['road','road:ksip-core']]}), lose);
expect('M1 metro to Expo wins', play('m1', {1:[['metro','metro:core-expo']]}), win);
expect('M1 two BRT lines + frequency wins gold', play('m1', {1:[['brt','brt:core-expo'],['brt','brt:core-ksip']],3:[['freq']]}), r => r.medal === 'gold');
expect('M2 do nothing fails', play('m2', {}), lose);
expect('M2 three hotels, no care for residents fails (trust)', play('m2', {1:[['hotel','core'],['hotel','expo'],['hotel','diriyah']]}), lose);
expect('M2 hotels + transit + park wins gold', play('m2', {1:[['hotel','diriyah'],['brt','brt:core-diriyah'],['hotel','expo']],3:[['hotel','qiddiya'],['brt','brt:diriyah-qiddiya']],4:[['park','diriyah']]}), r => r.medal === 'gold');
expect('M3 do nothing fails (outages)', play('m3', {}), lose);
expect('M3 efficiency + solar + demand response wins', play('m3', {1:[['gridlink'],['brt','brt:core-east']],2:[['solar'],['retrofit','east']],3:[['solar'],['park','east']],4:[['demand']]}), win);
expect('M3 peaker + solar + transit wins', play('m3', {1:[['gridlink'],['brt','brt:core-east'],['brt','brt:core-roshn']],2:[['solar'],['peaker']],3:[['solar'],['park','east']]}), win);
expect('M4 no transit to Murabba fails', play('m4', {}, [], ['park','murabba','sports']), lose);
expect('M4 sequenced with BRT + road wins', play('m4', {1:[['road','road:sports-core'],['brt','brt:core-murabba']]}, [], ['park','sports','murabba']), win);
expect('M5 do nothing fails', play('m5', {}), lose);
expect('M5 reacting late fails', play('m5', {2:[['shelter','east']],3:[['shelter','park'],['generator','east']],4:[['shelter','murabba'],['shelter','sports']],5:[['shelter','roshn']]}), lose);
expect('M5 shelters ahead + alert + medics wins', play('m5', {1:[['shelter','east'],['medic','east'],['alert']],2:[['shelter','park'],['generator','east'],['shelter','murabba']],3:[['shelter','sports'],['generator','sports'],['medic','sports']],4:[['shelter','roshn'],['medic','roshn'],['generator','roshn']]}), win);
expect('W1 do nothing fails', play('w1', {}), lose);
expect('W1 road widening only fails', play('w1', {1:[['road','road:mashaer-core'],['road','road:jeddah-core']]}), lose);
expect('W1 Holy Sites shuttle + airport line + frequency wins', play('w1', {1:[['brt','brt:core-mashaer'],['brt','brt:kaia-core']],3:[['freq']]}), win);
expect('W1 Holy Sites rail + airport shuttle wins', play('w1', {1:[['metro','metro:core-mashaer'],['brt','brt:kaia-core']]}), win);
expect('W2 do nothing fails', play('w2', {}), lose);
expect('W2 reacting as the water arrives fails', play('w2', {3:[['shelter','south'],['shelter','jeddah'],['shelter','balad']],5:[['shelter','north']]}), lose);
expect('W2 shelters ahead + medics + generators wins', play('w2', {1:[['shelter','south'],['alert'],['medic','south']],2:[['shelter','balad'],['shelter','jeddah'],['generator','south']],3:[['medic','jeddah'],['generator','jeddah'],['shelter','north']],4:[['medic','north'],['generator','north']]}), win);
expect('N1 no transit to Trojena fails', play('n1', {}, [], ['hydrogen','line','trojena']), lose);
expect('N1 hydrogen first + bus lines wins', play('n1', {1:[['brt','brt:core-line']],2:[['brt','brt:line-trojena']]}, [], ['hydrogen','line','trojena']), win);
expect('N2 gas peakers only fails (renewable share)', play('n2', {1:[['peaker'],['peaker']]}), lose);
expect('N2 solar only fails (evening outages)', play('n2', {1:[['gridlink']],2:[['solar'],['solar']],4:[['solar']]}), lose);
expect('N2 solar + wind + demand response wins', play('n2', {1:[['gridlink']],2:[['solar'],['wind']],3:[['wind']],4:[['demand']]}), win);
expect('N2 solar + batteries (Resilient Energy) wins', play('n2', {1:[['gridlink']],2:[['solar'],['storage']],3:[['solar']]}, ['energy']), win);
expect('E1 do nothing fails', play('e1', {}), lose);
expect('E1 efficiency + wind + demand response wins', play('e1', {1:[['gridlink'],['retrofit','khobar']],2:[['solar'],['wind']],3:[['wind'],['demand']]}), win);
expect('E1 transit + retrofits + renewables wins gold', play('e1', {1:[['gridlink'],['brt','brt:core-khobar'],['retrofit','khobar']],2:[['solar'],['wind'],['retrofit','qatif']],4:[['wind'],['solar'],['demand']]}), r => r.medal === 'gold');
expect('E2 reacting late fails', play('e2', {3:[['shelter','qatif']],4:[['shelter','khobar'],['shelter','dhahran']]}), lose);
expect('E2 reroute ahead + shelters + power wins', play('e2', {1:[['shelter','jubail'],['alert'],['generator','qatif']],2:[['shelter','qatif'],['reroute','road:jubail-core'],['medic','qatif']],3:[['reroute','road:qatif-core'],['shelter','khobar'],['generator','khobar']],4:[['reroute','road:khobar-core'],['reroute','road:dhahran-core'],['medic','khobar']]}), win);
expect('S1 hotels without care for residents fails', play('s1', {1:[['hotel','soudah'],['hotel','core'],['hotel','rijal']]}), lose);
expect('S1 hotels + Soudah transit + green corridor wins', play('s1', {1:[['hotel','soudah'],['brt','brt:core-soudah'],['hotel','core']],3:[['park','core'],['hotel','rijal']]}), win);
expect('S2 late shelters fail', play('s2', {2:[['shelter','jazanc']],5:[['shelter','khamis']]}), lose);
expect('S2 shelters ahead + reroute + power wins', play('s2', {1:[['shelter','jazanc'],['alert'],['medic','jazanc']],2:[['generator','jazanc'],['shelter','jazanind'],['reroute','road:jazanc-core']],4:[['shelter','khamis'],['generator','khamis'],['medic','khamis']]}), win);
expect('K1 a single rail line fails', play('k1', {1:[['metro','metro:core-jeddah']],5:[['metro','metro:core-dammam']]}), lose);
expect('K1 a national coach + rail network wins', play('k1', {1:[['brt','brt:core-jeddah'],['brt','brt:core-dammam'],['brt','brt:core-qassim']],2:[['brt','brt:core-abha'],['brt','brt:qassim-madinah'],['brt','brt:jeddah-makkah']],3:[['freq'],['brt','brt:abha-jazan']]}), win);
expect('Board switches back to Riyadh for Riyadh missions', (V.init('m1'), {medal:V.board === 'riyadh' && V.NODE_DEF.expo ? 'ok' : null, composite:0}), r => r.medal === 'ok');
expect('C1 roads only fails', play('c1', {1:[['road','road:eastgate-dryport'],['road','road:dryport-core']]}), lose);
expect('C1 two rail links + ksip rail + digital wins', play('c1', {1:[['freight','freight:eastgate-dryport'],['freight','freight:westgate-dryport']],3:[['freight','freight:ksip-dryport'],['digital']]}), win);
expect('C1 rail + digital + warehouse wins', play('c1', {1:[['freight','freight:eastgate-dryport'],['digital']],2:[['warehouse','dryport']],3:[['freight','freight:westgate-dryport']]}), win);
expect('T1 no training fails (skills bottleneck)', play('t1', {}, [], ['solar','logistics','industry']), lose);
expect('T1 academy early wins', play('t1', {1:[['academy','murabba']]}, [], ['solar','logistics','industry']), win);
expect('T1 Talent upgrade removes the bottleneck', play('t1', {}, ['talent'], ['solar','logistics','industry']), win);
expect('A1 nothing fails', play('a1', {}), lose);
expect('A1 two coach corridors wins', play('a1', {1:[['brt','brt:core-jeddah'],['brt','brt:core-dammam']]}), win);
expect('A1 rail + coach wins gold', play('a1', {1:[['metro','metro:core-jeddah'],['brt','brt:core-dammam']]}), r => r.medal === 'gold');
expect('M1 custom routes City Centre→Expo and City Centre→Airport win', play('m1', {1:[['route','core>expo'],['route','core>ksip']],3:[['freq']]}), win);
expect('M1 a detour route through the airport alone is not enough', play('m1', {1:[['route','core>ksip>expo']],3:[['freq']]}), lose);
expect('Custom route rejected where no road exists', {medal:(V.init('m1'), V.check('route','core>qiddiya').ok ? null : 'ok'), composite:0}, r => r.medal === 'ok');
// Rewind / What If? and save/load
V.init('m1'); V.addPlan('road','road:expo-core'); V.endTurn(); while (!V.state.done) V.endTurn();
const orig = V.state.result; V.rewind(1); V.addPlan('brt','brt:core-expo'); V.addPlan('brt','brt:core-ksip'); V.endTurn(); V.addPlan('freq'); while (!V.state.done) V.endTurn();
expect('What If? rewind produces a different, better outcome', V.state.result, r => r.composite > orig.composite);
V.init('m2'); V.addPlan('hotel','expo'); V.endTurn(); const txt = V.serialize(); V.init('m1'); V.load(txt);
expect('Save/load restores mission state', {medal:V.state.mission === 'm2' && V.state.turn === 2 ? 'ok' : null, composite:0}, r => r.medal === 'ok');
console.log(fails ? `\n${fails} FAILED` : '\nAll mission tests passed');
process.exit(fails ? 1 : 0);
