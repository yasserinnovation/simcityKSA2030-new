// Vision Nexus 2030 — Riyadh City Builder simulation (deterministic, DOM-free).
// Grid of parcels. Roads carry access, utilities and trips; zones develop only when there is
// access, power, water and demand. Trips are assigned to the player's actual roads and bus routes.
(() => {
  'use strict';
  const L = (en, ar) => ({en, ar});
  const VERSION = 1, N = 40;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const idx = (i, j) => j * N + i, inb = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  const NB = [[0,-1],[1,0],[0,1],[-1,0]];
  const rngAt = (seed, a, b) => { let t = (seed * 374761393 + a * 668265263 + b * 2246822519) >>> 0; t = Math.imul(t ^ (t >>> 15), 2246822507); t = Math.imul(t ^ (t >>> 13), 3266489909); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };

  /* ============================== CATALOGUE =========================== */
  const ZCAP = {R:[0,10,30,80], C:[0,8,24,60], I:[0,12,30,50], T:[0,8,22,50], M:[0,12,32,80]};   // M = mixed use (homes over shops)          // people (R) or jobs (C/I) per parcel by level
  const BUILD_MONTHS = [0,1,2,3];
  const FAC = {
    gas:      {name:L('Gas power plant','محطة كهرباء غازية'), cost:14, upkeep:.55, power:90, jobs:12, pollution:4, icon:'🏭'},
    solar:    {name:L('Solar farm','مزرعة شمسية'), cost:10, upkeep:.2, solar:45, jobs:3, icon:'☀'},
    battery:  {name:L('Grid battery','بطارية الشبكة'), cost:6, upkeep:.15, storage:45, jobs:1, icon:'🔋'},
    pump:     {name:L('Water pumping station','محطة ضخ المياه'), cost:9, upkeep:.3, water:110, jobs:6, icon:'💧'},
    tower:    {name:L('Water tower','خزان مياه مرتفع'), cost:4, upkeep:.1, water:35, jobs:1, icon:'🗼'},
    school:   {name:L('School','مدرسة'), cost:10, upkeep:.45, reach:10, cap:180, serve:'edu', jobs:18, icon:'🏫'},
    training: {name:L('Training centre','مركز تدريب'), cost:9, upkeep:.4, reach:12, cap:120, serve:'train', jobs:10, icon:'🎓'},
    clinic:   {name:L('Clinic','عيادة'), cost:12, upkeep:.5, reach:12, cap:600, serve:'health', jobs:22, icon:'🏥'},
    park:     {name:L('Neighbourhood park','حديقة حي'), cost:3, upkeep:.06, reach:4, cap:260, serve:'park', jobs:1, walk:true, icon:'🌳'},
    emergency:{name:L('Civil defence station','مركز الدفاع المدني'), cost:9, upkeep:.4, reach:14, cap:1400, serve:'safety', jobs:12, icon:'🚒'},
    terminal: {name:L('Logistics terminal','محطة لوجستية'), cost:10, upkeep:.4, jobs:25, freightCap:60, reach:6, icon:'🚉'},
    invest:   {name:L('Investment site (fictional)','موقع استثماري (خيالي)'), cost:2, upkeep:0, jobs:0, unique:true, icon:'💠'},
    digital:  {name:L('Digital connectivity hub','مركز الاتصال الرقمي'), cost:8, upkeep:.3, reach:8, cap:99999, serve:'digital', jobs:8, walk:true, cap_unlock:'digital', icon:'📡'}
  };
  const COST = {road:.25, avenue:.6, bridge:.9, rail:.45, remove:.08, zone:.04, stop:.4, routeTile:.03};
  const CAPS = {                         // capabilities earned through play (never sold)
    medium:{name:L('Medium-density zoning','كثافة متوسطة'), how:L('Reach 250 residents','الوصول إلى 250 ساكنًا')},
    avenue:{name:L('Avenue upgrade','ترقية إلى جادة'), how:L('Reach 600 residents','الوصول إلى 600 ساكن')},
    high:{name:L('High-density zoning','كثافة عالية'), how:L('Reach 1,400 residents with 30% of homes near a bus stop','الوصول إلى 1400 ساكن مع 30٪ من المنازل قرب محطة حافلات')},
    digital:{name:L('Digital connectivity hub','مركز الاتصال الرقمي'), how:L('Reach 700 jobs','الوصول إلى 700 وظيفة')},
    mixed:{name:L('Mixed-use zoning','تخصيص متعدد الاستخدامات'), how:L('Reach 250 residents','الوصول إلى 250 ساكنًا')},
    interchange:{name:L('Gateway interchange','محطة تبادل البوابات'), how:L('Win the city mission Connect the District','الفوز بمهمة المدينة «اربط الحي»')},
    smartgrid:{name:L('Smart grid','الشبكة الذكية'), how:L('Win the city mission Power the Next District','الفوز بمهمة «طاقة للحي التالي» في المدينة')},
    railyard:{name:L('Rail yard','ساحة القطارات'), how:L('Win the city mission Three Continents','الفوز بمهمة «ثلاث قارات» في المدينة')},
    academy:{name:L('Academy partnership','شراكة أكاديمية'), how:L('Win the city mission Talent Powers Delivery','الفوز بمهمة «المواهب تدفع الإنجاز» في المدينة')},
    investor:{name:L('Investor network','شبكة المستثمرين'), how:L('Win the city mission Unlock the Investment','الفوز بمهمة «أطلق الاستثمار» في المدينة')},
    express:{name:L('High-frequency buses (12/h)','حافلات عالية التردد (12/ساعة)'), how:L('Carry 300 bus riders','نقل 300 راكب حافلات')}
  };

  let S = null;

  /* ================================ SETUP ============================== */
  function newCity(opts = {}){
    const tiles = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) tiles.push({k:'e'});
    S = {v:VERSION, seed:opts.seed || 2026, month:0, startYear:2026, tiles, routes:[], budget:70, loan:null, policy:{conserve:false}, weather:{type:'clear', left:0}, spend:[], mission:null, missionLog:[], invest:null,
      tax:{R:7, C:7, I:7}, fund:{edu:1, health:1, park:1, safety:1, train:1, digital:1}, caps:[], goals:{}, challenges:[], log:[], hist:[], spentThisMonth:0, m:{}, nextRoute:1};
    // Existing arterials (cannot be removed) with gates to the rest of Riyadh
    for (let i = 0; i < N; i++) setRoad(i, 21, true);
    for (let j = 0; j < N; j++) setRoad(6, j, true);
    for (const [i, j] of [[0,21],[N-1,21],[6,0],[6,N-1]]) S.tiles[idx(i, j)].gate = true;
    // A dry wadi runs diagonally: parcels are unbuildable; roads need a bridge
    for (let t = 0; t < N; t++) { const i = Math.round(10 + t * .72), j = Math.round(2 + t * .9); for (const di of [0, 1]) if (inb(i + di, j) && S.tiles[idx(i + di, j)].k === 'e') S.tiles[idx(i + di, j)] = {k:'w'}; }
    for (const a of opts.anchors || []) {
      for (let dj = -a.r; dj <= a.r; dj++) for (let di = -a.r; di <= a.r; di++) { const i = a.i + di, j = a.j + dj; if (!inb(i, j)) continue; const T = S.tiles[idx(i, j)]; if (T.k === 'r') continue; S.tiles[idx(i, j)] = {k:'a', anchor:a.id, center:di === 0 && dj === 0}; }
      S.tiles[idx(a.i, a.j)].jobs = a.jobs; S.tiles[idx(a.i, a.j)].name = a.name;
    }
    compute();
    return S;
  }
  function setRoad(i, j, arterial){ const T = S.tiles[idx(i, j)]; S.tiles[idx(i, j)] = {k:'r', art:!!arterial, cap:arterial ? 260 : 120, bridge:T.k === 'w', gate:T.gate}; }
  const has = c => S.caps.includes(c);
  const cvt = x => x.k === 'x' || (x.k === 'r' && x.rail);   // rail-carrying parcel

  /* =========================== PLAYER ACTIONS ========================= */
  // Every action returns a preview: {ok, cost, tiles, why, info} — nothing changes until apply()
  function linePath(a, b){ const out = []; let [i, j] = a; const [i2, j2] = b; const horizFirst = Math.abs(i2 - i) >= Math.abs(j2 - j);
    const stepI = () => { while (i !== i2) { out.push([i, j]); i += Math.sign(i2 - i); } }, stepJ = () => { while (j !== j2) { out.push([i, j]); j += Math.sign(j2 - j); } };
    if (horizFirst) { stepI(); stepJ(); } else { stepJ(); stepI(); } out.push([i2, j2]); return out; }
  function rect(a, b){ const out = []; for (let j = Math.min(a[1], b[1]); j <= Math.max(a[1], b[1]); j++) for (let i = Math.min(a[0], b[0]); i <= Math.max(a[0], b[0]); i++) out.push([i, j]); return out; }
  function preview(tool, a, b, opt = {}){
    const T = (i, j) => S.tiles[idx(i, j)];
    if (tool === 'road' || tool === 'avenue') {
      const path = linePath(a, b).filter(([i, j]) => inb(i, j)); let cost = 0, bad = [], newTiles = 0, inter = 0;
      for (const [i, j] of path) { const t = T(i, j);
        if (tool === 'avenue') { if (t.k !== 'r' || t.art || t.avenue) continue; cost += COST.avenue; newTiles++; continue; }
        if (t.k === 'r') continue; if (t.k === 'a' || t.k === 'f') { bad.push([i, j]); continue; }
        cost += t.k === 'w' ? COST.bridge : t.k === 'z' ? COST.road + COST.remove : COST.road; newTiles++;
        if (NB.filter(([di, dj]) => inb(i + di, j + dj) && T(i + di, j + dj).k === 'r').length >= 2) inter++; }
      if (tool === 'avenue' && !has('avenue')) return {ok:false, why:L('Avenue upgrades unlock at 600 residents','تُفتح ترقية الجادات عند 600 ساكن')};
      const connects = tool === 'avenue' || path.some(([i, j]) => T(i, j).k === 'r' || NB.some(([di, dj]) => inb(i + di, j + dj) && T(i + di, j + dj).k === 'r' && !path.some(p => p[0] === i + di && p[1] === j + dj)));
      return {ok:!bad.length && newTiles > 0 && cost <= S.budget, tiles:path, bad, cost:+cost.toFixed(2), newTiles, intersections:inter, connects,
        why:bad.length ? L('Cannot build through protected landmarks or facilities','لا يمكن البناء عبر المعالم المحمية أو المرافق') : cost > S.budget ? L('Not enough credits','الأرصدة غير كافية') : !newTiles ? L('Nothing new to build here','لا جديد لبنائه هنا') : null,
        info:connects ? L('Connects to the existing network','يتصل بالشبكة القائمة') : L('Not connected yet — isolated roads carry no trips','غير متصل بعد — الطرق المعزولة لا تحمل رحلات')};
    }
    if (tool === 'rail') {
      const path = linePath(a, b).filter(([i, j]) => inb(i, j)); let cost = 0, bad = [], n = 0, xing = 0;
      for (const [i, j] of path) { const t = T(i, j); if (cvt(t)) continue; if (['a','f','z'].includes(t.k)) { bad.push([i, j]); continue; } if (t.k === 'r') { xing++; cost += COST.rail * .5; } else cost += t.k === 'w' ? COST.rail * 2.5 : COST.rail; n++; }
      const edge = path.some(([i, j]) => i === 0 || j === 0 || i === N - 1 || j === N - 1) || path.some(([i, j]) => NB.some(([di, dj]) => inb(i + di, j + dj) && cvt(T(i + di, j + dj)) && railEdgeAt(idx(i + di, j + dj))));
      return {ok:!bad.length && n > 0 && cost <= S.budget, tiles:path, bad, cost:+cost.toFixed(2), newTiles:n, intersections:xing, connects:edge,
        why:bad.length ? L('Rail cannot run through buildings, zones or landmarks','لا يمكن مد السكة عبر المباني أو المناطق المخصصة أو المعالم') : cost > S.budget ? L('Not enough credits','الأرصدة غير كافية') : !n ? L('Nothing new to build here','لا جديد لبنائه هنا') : null,
        info:edge ? L(`Connects to the national freight line at the district edge${xing ? ` · ${xing} level crossing(s) slow road traffic` : ''}`, `يتصل بخط الشحن الوطني عند حافة الحي${xing ? ` · ${xing} تقاطع سكة يبطئ المرور` : ''}`) : L('Not connected to the national freight line yet — extend it to the district edge','غير متصل بخط الشحن الوطني بعد — مدّه إلى حافة الحي'),
        upkeep:+(n * .015).toFixed(2)};
    }
    if (['zoneR','zoneC','zoneI','zoneT','zoneM'].includes(tool)) {
      const zone = tool.slice(-1), den = opt.density || 1;
      if (zone === 'M' && !has('mixed')) return {ok:false, why:L('Mixed-use zoning unlocks at 250 residents','يُفتح التخصيص متعدد الاستخدامات عند 250 ساكنًا')};
      if (den === 2 && !has('medium')) return {ok:false, why:L('Medium density unlocks at 250 residents','تُفتح الكثافة المتوسطة عند 250 ساكنًا')};
      if (den === 3 && !has('high')) return {ok:false, why:L('High density unlocks at 1,400 residents with bus coverage','تُفتح الكثافة العالية عند 1400 ساكن مع تغطية الحافلات')};
      const tiles = rect(a, b).filter(([i, j]) => inb(i, j) && (T(i, j).k === 'e' || (T(i, j).k === 'z' && (T(i, j).zone !== zone || T(i, j).den !== den))));
      const cost = +(tiles.length * COST.zone).toFixed(2), noAccess = tiles.filter(([i, j]) => !accessRoad(i, j)).length;
      const full = (tiles.length - noAccess) * ZCAP[zone][den], pw = full * {R:.08, C:.12, I:.2, T:.12, M:.1}[zone] * utilF(), wt = full * {R:.1, C:.06, I:.15, T:.12, M:.08}[zone] * (S.policy.conserve ? .8 : 1) * utilF('w');
      const spareP = S.m.power ? S.m.power.supply - S.m.power.used : 0, spareW = S.m.water ? S.m.water.supply - S.m.water.used : 0;
      const est = {people:zone === 'R' ? full : zone === 'M' ? Math.round(full * .5) : 0, jobs:zone === 'R' ? 0 : zone === 'M' ? Math.round(full * .5) : full, power:+pw.toFixed(1), water:+wt.toFixed(1), spareP:+spareP.toFixed(1), spareW:+spareW.toFixed(1), trips:Math.round((zone === 'R' ? full * .5 : zone === 'M' ? full * .25 : 0))};
      return {ok:tiles.length > 0 && cost <= S.budget, tiles, cost, zone, den, est, why:!tiles.length ? L('No empty parcels in this area','لا قطع فارغة في هذه المنطقة') : cost > S.budget ? L('Not enough credits','الأرصدة غير كافية') : null,
        info:noAccess ? L(`${noAccess} parcel(s) have no road access yet and will not develop`, `${noAccess} قطعة بلا وصول بالطرق بعد ولن تتطور`) : L('All parcels have road access','جميع القطع لها وصول بالطرق')};
    }
    if (tool === 'remove') {
      const tiles = rect(a, b).filter(([i, j]) => inb(i, j) && ['r','z','f','x'].includes(T(i, j).k) && !T(i, j).art);
      let people = 0, jobs = 0, cost = 0; for (const [i, j] of tiles) { const t = T(i, j); cost += t.k === 'f' ? 1 : t.st === 3 ? .5 * t.lv : COST.remove; if (t.k === 'z' && t.st >= 3) { if (t.zone === 'R') people += Math.round(t.cap * t.occ); else jobs += Math.round(t.cap * t.occ); } }
      return {ok:tiles.length > 0 && cost <= S.budget, tiles, cost:+cost.toFixed(2), people, jobs, why:!tiles.length ? L('Nothing removable here (arterials and landmarks are protected)','لا شيء قابل للإزالة هنا (الطرق الرئيسية والمعالم محمية)') : null,
        info:L(`Demolition: ${people} residents and ${jobs} jobs displaced`, `الهدم: تهجير ${people} ساكنًا و${jobs} وظيفة`)};
    }
    if (FAC[tool]) {
      const [i, j] = a, t = T(i, j), f = FAC[tool];
      if (f.cap_unlock && !has(f.cap_unlock)) return {ok:false, why:L(`${f.name.en} unlocks at 700 jobs`, `يُفتح ${f.name.ar} عند 700 وظيفة`)};
      if (f.unique && S.tiles.some(x => x.k === 'f' && x.fac === tool)) return {ok:false, why:L('Only one investment site can be designated','يمكن تحديد موقع استثماري واحد فقط')};
      const ok = t.k === 'e' || (t.k === 'z' && t.st < 3);
      return {ok:ok && f.cost <= S.budget, tiles:[[i, j]], cost:f.cost, why:!ok ? L('Choose an empty parcel','اختر قطعة فارغة') : f.cost > S.budget ? L('Not enough credits','الأرصدة غير كافية') : null,
        info:accessRoad(i, j) ? L(`Upkeep ${f.upkeep} credits/month${f.serve ? ` · would reach about ${reachEstimate(i, j, f)} homes` : ''}${f.power || f.solar ? ` · adds ${f.power || f.solar} power to this network` : ''}${f.water ? ` · adds ${f.water} water` : ''}`, `صيانة ${f.upkeep} رصيد/شهر${f.serve ? ` · سيصل إلى نحو ${reachEstimate(i, j, f)} مسكن` : ''}`) : L('No road access: it will not work until a road reaches it','بلا وصول بالطرق: لن يعمل حتى يصله طريق')};
    }
    return {ok:false};
  }
  const undo = [];
  function apply(tool, a, b, opt = {}){
    const p = preview(tool, a, b, opt); if (!p.ok) return p;
    undo.push({json:JSON.stringify(S), month:S.month, label:tool}); if (undo.length > 25) undo.shift();
    S.budget -= p.cost; S.spentThisMonth += p.cost;
    for (const [i, j] of p.tiles) {
      if (FAC[tool] && tool === 'invest') { S.tiles[idx(i, j)] = {k:'f', fac:'invest', built:S.month}; S.invest = S.invest || {site:idx(i, j), offer:null}; S.invest.site = idx(i, j); continue; }
      const t = S.tiles[idx(i, j)];
      if (tool === 'road') { if (t.k !== 'r' && t.k !== 'a' && t.k !== 'f') setRoad(i, j, false); }
      else if (tool === 'rail') { if (t.k === 'r') t.rail = true; else if (t.k !== 'x') S.tiles[idx(i, j)] = {k:'x', bridge:t.k === 'w'}; }
      else if (tool === 'avenue') { if (t.k === 'r' && !t.art) { t.avenue = true; t.cap = 240; } }
      else if (tool === 'remove') { if (t.k === 'x') { S.tiles[idx(i, j)] = t.bridge ? {k:'w'} : {k:'e'}; continue; } if (t.k === 'r') { S.routes = S.routes.filter(r => !r.path.includes(idx(i, j))); } S.tiles[idx(i, j)] = t.bridge ? {k:'w'} : {k:'e'}; }
      else if (FAC[tool]) S.tiles[idx(i, j)] = {k:'f', fac:tool, built:S.month};
      else S.tiles[idx(i, j)] = {k:'z', zone:p.zone, den:p.den, st:0, lv:0, occ:0, cap:0, why:null, seedN:(i * 31 + j * 17) % 7};
    }
    log(L(`Built: ${tool}`, `تم البناء: ${tool}`), 'build');
    settle(); return {ok:true, cost:p.cost};
  }
  // Undo is available until one simulated month has passed after the action
  function canUndo(){ return undo.length && S.month - undo[undo.length - 1].month <= 1; }
  function doUndo(){ if (!canUndo()) return false; const u = undo.pop(); S = JSON.parse(u.json); compute(); return true; }

  /* ============================== BUS ROUTES =========================== */
  function roadPathTiles(fromIdx, toIdx){      // BFS along roads
    const prev = new Map([[fromIdx, -1]]), q = [fromIdx];
    while (q.length) { const u = q.shift(); if (u === toIdx) break; const ui = u % N, uj = (u / N) | 0;
      for (const [di, dj] of NB) { const vi = ui + di, vj = uj + dj; if (!inb(vi, vj)) continue; const v = idx(vi, vj); if (S.tiles[v].k !== 'r' || prev.has(v)) continue; prev.set(v, u); q.push(v); } }
    if (!prev.has(toIdx)) return null; const out = []; let c = toIdx; while (c !== -1) { out.push(c); c = prev.get(c); } return out.reverse();
  }
  function routePreview(stops, freq = 6){
    if (stops.length < 2) return {ok:false, why:L('Place at least two stops on roads','ضع محطتين على الأقل على الطرق')};
    for (const s of stops) if (S.tiles[s].k !== 'r') return {ok:false, why:L('Stops must be on roads you have built','يجب أن تكون المحطات على طرق مبنية')};
    let path = [stops[0]];
    for (let k = 1; k < stops.length; k++) { const seg = roadPathTiles(stops[k - 1], stops[k]); if (!seg) return {ok:false, why:L('These stops are not connected by road','هذه المحطات غير متصلة بطريق')}; path = path.concat(seg.slice(1)); }
    const cost = +(stops.length * COST.stop + path.length * COST.routeTile).toFixed(2);
    return {ok:cost <= S.budget, path, stops, cost, upkeep:+routeUpkeep(path.length, freq).toFixed(2), why:cost > S.budget ? L('Not enough credits','الأرصدة غير كافية') : null};
  }
  const routeUpkeep = (len, freq) => .05 + len * freq * .0022;
  function addRoute(stops, freq = 6){ const p = routePreview(stops, freq); if (!p.ok) return p; undo.push({json:JSON.stringify(S), month:S.month, label:'route'});
    S.budget -= p.cost; S.spentThisMonth += p.cost; S.routes.push({id:S.nextRoute++, stops:p.stops, path:p.path, freq}); settle(); return {ok:true}; }
  function setRouteFreq(id, freq){ const r = S.routes.find(x => x.id === id); if (!r) return false; if (freq > 8 && !has('express')) return false; r.freq = freq; compute(); return true; }
  function removeRoute(id){ S.routes = S.routes.filter(r => r.id !== id); compute(); }

  /* ============================== BUDGET =============================== */
  function setTax(z, v){ S.tax[z] = clamp(Math.round(v), 0, 15); }
  function setPolicy(k, v){ S.policy[k] = !!v; compute(); }
  function setFund(k, v){ S.fund[k] = clamp(+v, .5, 1.3); compute(); }
  function takeLoan(){ if (S.loan) return {ok:false, why:L('Repay the current loan first','سدد القرض الحالي أولًا')}; S.loan = {left:24, pay:1.3}; S.budget += 25; log(L('Short-term financing: +25 credits now, repaid at 1.3/month for 24 months (31.2 total).','تمويل قصير الأجل: +25 رصيدًا الآن، يُسدد 1.3 شهريًا لمدة 24 شهرًا (31.2 إجمالًا).'), 'budget'); return {ok:true}; }

  /* =============================== COMPUTE ============================= */
  // Recomputes networks, utilities, services, trips and demand from the current layout (no growth).
  function compute(){
    const T = S.tiles, m = {};
    // ---- road components; which touch a gate (connected to Riyadh)
    const comp = new Int32Array(N * N).fill(-1); let nc = 0; const compGate = [];
    for (let u = 0; u < N * N; u++) { if (T[u].k !== 'r' || comp[u] >= 0) continue; const q = [u]; comp[u] = nc; let g = false;
      while (q.length) { const v = q.pop(); if (T[v].gate) g = true; const vi = v % N, vj = (v / N) | 0; for (const [di, dj] of NB) { const wi = vi + di, wj = vj + dj; if (!inb(wi, wj)) continue; const w = idx(wi, wj); if (T[w].k === 'r' && comp[w] < 0) { comp[w] = nc; q.push(w); } } }
      compGate.push(g); nc++; }
    // ---- access node for each non-road parcel (first adjacent road)
    const access = new Int32Array(N * N).fill(-1);
    for (let u = 0; u < N * N; u++) { if (T[u].k === 'r' || T[u].k === 'w' || T[u].k === 'e') continue; const ui = u % N, uj = (u / N) | 0;
      for (const [di, dj] of NB) { const vi = ui + di, vj = uj + dj; if (inb(vi, vj) && T[idx(vi, vj)].k === 'r') { access[u] = idx(vi, vj); break; } }
      if (access[u] < 0 && T[u].k === 'a') { // anchors: any road touching the landmark area
        const id = T[u].anchor; for (let v = 0; v < N * N && access[u] < 0; v++) if (T[v].k === 'a' && T[v].anchor === id) { const vi = v % N, vj = (v / N) | 0; for (const [di, dj] of NB) if (inb(vi + di, vj + dj) && T[idx(vi + di, vj + dj)].k === 'r') { access[u] = idx(vi + di, vj + dj); break; } } }
    }
    const connected = u => access[u] >= 0 && compGate[comp[access[u]]];
    // ---- road-distance BFS helper (multi-source), limited reach
    const roadDist = (sources, reach) => { const d = new Map(); const q = []; for (const s of sources) if (s >= 0 && !d.has(s)) { d.set(s, 0); q.push(s); }
      for (let h = 0; h < q.length; h++) { const u = q[h], du = d.get(u); if (du >= reach) continue; const ui = u % N, uj = (u / N) | 0;
        for (const [di, dj] of NB) { const vi = ui + di, vj = uj + dj; if (!inb(vi, vj)) continue; const v = idx(vi, vj); if (T[v].k !== 'r' || d.has(v)) continue; d.set(v, du + 1); q.push(v); } } return d; };
    // ---- utilities per connected component (utilities run along roads; the regional grid enters at gates)
    const supply = {}; const addS = (c, k, v) => { supply[c] = supply[c] || {power:0, water:0, solar:0, storage:0}; supply[c][k] += v; };
    for (let c = 0; c < nc; c++) if (compGate[c]) { addS(c, 'power', 30); addS(c, 'water', 30); }
    for (let u = 0; u < N * N; u++) if (T[u].k === 'f' && access[u] >= 0) { const f = FAC[T[u].fac], c = comp[access[u]]; if (f.power) addS(c, 'power', f.power); if (f.solar) addS(c, 'solar', f.solar); if (f.storage) addS(c, 'storage', f.storage); if (f.water) addS(c, 'water', f.water); }
    const dust = S.weather && S.weather.type === 'dust'; let solarEff = 0;
    for (const c in supply) { const s = supply[c]; const sf = (dust ? .6 : 1), st = has('smartgrid') ? 1.3 : 1; const e = s.solar * sf * (.7 + .3 * clamp(s.storage * st / Math.max(1, s.solar), 0, 1)); s.power += e; solarEff += e; }   // solar needs storage for the evening peak
    const hf = utilF(), hw = utilF('w') * (S.policy && S.policy.conserve ? .8 : 1);
    const pw = t => t.k === 'z' ? (t.cap * t.occ * {R:.08, C:.12, I:.2, T:.12, M:.1}[t.zone] + (t.st === 2 ? 1 : 0)) * hf : t.k === 'f' ? (t.fac === 'invest' ? 6 : 1) : 0;
    const wt = t => t.k === 'z' ? (t.cap * t.occ * {R:.1, C:.06, I:.15, T:.12, M:.08}[t.zone] + (t.st === 2 ? .5 : 0)) * hw : t.k === 'f' && t.fac === 'invest' ? 4 : 0;
    const used = {}; const users = [];
    for (let u = 0; u < N * N; u++) { const t = T[u]; if (t.k === 'z' || t.k === 'f') users.push(u); t.pow = false; t.wat = false; }
    users.sort((a, b) => a - b);
    // allocate nearest-first from each component's facility/gate order (deterministic by index)
    for (const u of users) { const t = T[u]; if (!connected(u) && t.k !== 'f') continue; const c = access[u] >= 0 ? comp[access[u]] : -1; const s = supply[c]; if (!s) continue; used[c] = used[c] || {p:0, w:0};
      const needP = Math.max(pw(t), t.k === 'z' ? .5 : 0), needW = Math.max(wt(t), t.k === 'z' ? .3 : 0);
      if (used[c].p + needP <= s.power) { used[c].p += needP; t.pow = true; } if (used[c].w + needW <= s.water) { used[c].w += needW; t.wat = true; } }
    m.power = {supply:Object.values(supply).reduce((a, s) => a + s.power, 0), used:Object.values(used).reduce((a, s) => a + s.p, 0)}; m.renewShare = m.power.supply ? clamp(solarEff / m.power.supply, 0, 1) : 0;
    m.unpowered = users.filter(u => T[u].k === 'z' && T[u].st >= 1 && connected(u) && !T[u].pow).length;
    m.water = {supply:Object.values(supply).reduce((a, s) => a + s.water, 0), used:Object.values(used).reduce((a, s) => a + s.w, 0)};
    // ---- services: reach along roads (walk reach for parks/digital), capacity allocated nearest first
    for (const t of T) t.cov = {};
    const resTiles = []; for (let u = 0; u < N * N; u++) if (T[u].k === 'z' && (T[u].zone === 'R' || T[u].zone === 'M') && T[u].st >= 3) resTiles.push(u);
    m.svc = {};
    for (let u = 0; u < N * N; u++) { const t = T[u]; if (t.k !== 'f') continue; const f = FAC[t.fac]; if (!f.serve) continue;
      const k = f.serve, fund = (S.fund[k] || 1) * (k === 'train' && has('academy') ? 1.3 : 1); let capLeft = f.cap * fund, demand = 0, served = 0;
      let cands;
      if (f.walk) { const ui = u % N, uj = (u / N) | 0; cands = (k === 'digital' ? T.map((x, v) => v).filter(v => T[v].k === 'z') : resTiles).map(v => [v, Math.hypot((v % N) - ui, ((v / N) | 0) - uj)]).filter(([v, d]) => d <= f.reach); }
      else { if (access[u] < 0 || !compGate[comp[access[u]]]) { t.inactive = true; continue; } const d = roadDist([access[u]], f.reach); cands = resTiles.filter(v => d.has(access[v])).map(v => [v, d.get(access[v])]); }
      t.inactive = false; cands.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      for (const [v, d] of cands) { const need = k === 'edu' ? T[v].cap * T[v].occ * .2 : k === 'train' ? T[v].cap * T[v].occ * .1 : k === 'digital' ? 0 : T[v].cap * T[v].occ; demand += need;
        if (capLeft >= need) { capLeft -= need; served += need; T[v].cov[k] = true; } }
      t.load = f.cap * fund ? (f.cap * fund - capLeft) / (f.cap * fund) : 0; t.full = capLeft < 5 && demand > served;
      m.svc[k] = m.svc[k] || {cap:0, served:0, demand:0}; m.svc[k].cap += f.cap * fund; m.svc[k].served += served; m.svc[k].demand += demand; }
    // ---- transit access: parcels within 3 tiles (grid distance) of a stop
    const stopSet = new Map(); for (const r of S.routes) for (const s of r.stops) stopSet.set(s, (stopSet.get(s) || []).concat(r.id));
    const nearStop = u => { const ui = u % N, uj = (u / N) | 0; let best = null, bd = 4; for (const [s, rs] of stopSet) { const d = Math.abs((s % N) - ui) + Math.abs(((s / N) | 0) - uj); if (d < bd) { bd = d; best = {s, d, routes:rs}; } } return best; };
    // ---- land value
    const nearCount = (u, pred, r) => { const ui = u % N, uj = (u / N) | 0; let c = 0; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const vi = ui + di, vj = uj + dj; if (inb(vi, vj) && pred(T[idx(vi, vj)])) c++; } return c; };
    const prevVC = S.m.vc || {};
    for (let u = 0; u < N * N; u++) { const t = T[u]; if (t.k !== 'z') continue;
      const ns = nearStop(u); t.transit = !!ns;
      let lv = 34 + (t.cov.park ? 12 : 0) + (t.cov.edu ? 8 : 0) + (t.cov.health ? 8 : 0) + (t.cov.safety ? 5 : 0) + (t.transit ? 8 : 0) + (t.cov.digital && t.zone !== 'R' ? 8 : 0)
        + (nearCount(u, x => x.k === 'a', 5) ? 10 : 0);
      if (t.zone !== 'I') lv -= Math.min(18, nearCount(u, x => x.k === 'z' && x.zone === 'I' && x.st >= 3, 3) * 4) + Math.min(12, nearCount(u, x => x.k === 'f' && x.fac === 'gas', 4) * 10);
      if (access[u] >= 0 && (prevVC[access[u]] || 0) > 1) lv -= 8;
      if (!t.cov.park && t.den >= 2 && t.zone === 'R') lv -= 5;                          // heat exposure without green space
      t.lv0 = clamp(Math.round(lv), 0, 100); }
    // ---- trips: commuters from homes to jobs over the actual road network, with bus alternatives
    const W = new Map(), J = new Map();   // access node -> workers / jobs
    let pop = 0, jobs = 0, Cjobs = 0, Ijobs = 0, Tjobs = 0;
    for (let u = 0; u < N * N; u++) { const t = T[u]; const a = access[u];
      if (t.k === 'z' && t.st >= 3) { const n = t.cap * t.occ, mix = t.zone === 'M' ? (t.mix ?? .5) : t.zone === 'R' ? 1 : 0, res = n * mix, jb = n - res;
        if (res) { pop += res; if (connected(u)) W.set(a, (W.get(a) || 0) + res * .5); }
        if (jb) { jobs += jb; if (t.zone === 'C' || t.zone === 'M') Cjobs += jb; else if (t.zone === 'T') Tjobs += jb; else Ijobs += jb; if (connected(u)) J.set(a, (J.get(a) || 0) + jb); } }
      if (t.k === 'f' && connected(u) && (t.jobs || FAC[t.fac].jobs)) { const fj = t.jobs || FAC[t.fac].jobs; jobs += fj; J.set(a, (J.get(a) || 0) + fj); }
      if (t.k === 'a' && t.jobs && connected(u)) { jobs += t.jobs; J.set(a, (J.get(a) || 0) + t.jobs); } }
    // gates: jobs elsewhere in Riyadh
    for (let u = 0; u < N * N; u++) if (T[u].gate && T[u].k === 'r') J.set(u, (J.get(u) || 0) + 90);
    const regional = compGate.some(x => x) ? 700 : 0;   // jobs elsewhere in Riyadh reachable through the gates
    const baseT = u => (T[u].avenue ? .8 : T[u].art ? .7 : 1) * (dust ? 1.15 : 1) * (T[u].rail ? 1.2 : 1) * (1 + .9 * Math.pow(Math.min(prevVC[u] || 0, 2.2), 2));
    const load = new Map(); let accW = 0, accOK = 0, tripSum = 0, timeSum = 0, reachWorkers = 0, busRiders = 0, noAccessWorkers = 0;
    const routeRide = new Map(S.routes.map(r => [r.id, 0]));
    const routePos = new Map(S.routes.map(r => [r.id, new Map(r.path.map((p, k) => [p, k]))]));
    const destList = [...J.entries()];
    for (const [o, w] of W) {
      // Dijkstra from o over roads
      const dist = new Map([[o, 0]]), prev = new Map(), open = [[0, o]];
      while (open.length) { let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k; const [du, u] = open.splice(bi, 1)[0]; if (du > dist.get(u)) continue; const ui = u % N, uj = (u / N) | 0;
        for (const [di, dj] of NB) { const vi = ui + di, vj = uj + dj; if (!inb(vi, vj)) continue; const v = idx(vi, vj); if (T[v].k !== 'r') continue; const nd = du + baseT(v) * .8; if (!dist.has(v) || nd < dist.get(v)) { dist.set(v, nd); prev.set(v, u); open.push([nd, v]); } } }
      let wsum = 0, near = 0; const ds = [];
      for (const [d, jn] of destList) { if (!dist.has(d)) continue; const tt = dist.get(d) + 4 + (T[d].gate ? ((d % N) === 0 ? 12 : 5) : 0);   /* driving on into central Riyadh traffic beyond the district */ const g = jn * Math.exp(-tt / 22); ds.push([d, tt, g]); wsum += g; if (tt <= 30) near += jn; }
      accW += w; accOK += w * Math.min(1, near / Math.max(1, w * 1.5));   // are there enough jobs within 30 minutes?
      if (!wsum) { noAccessWorkers += w; accW += w; continue; }
      const so = nearStopNode(o);
      for (const [d, tCar, g] of ds) { const trips = w * g / wsum; let bus = 0;
        if (so) { const sd = nearStopNode(d); if (sd) for (const rid of so.routes) { if (!sd.routes.includes(rid)) continue; const r = S.routes.find(x => x.id === rid), pos = routePos.get(rid); const ride = Math.abs(pos.get(sd.s) - pos.get(so.s)) * .75, wait = 30 / r.freq, walk = (so.d + sd.d) * 3; const tBus = walk + wait + ride + 2 + (T[d].gate ? 3 : 0);
          const share = Math.min(.9, .18 + .72 / (1 + Math.exp((tBus - tCar * 1.2) / 6))); bus = Math.max(bus, trips * share); /* 18% have no car and ride whenever a route serves their trip */ if (bus) { routeRide.set(rid, routeRide.get(rid) + bus); timeSum += bus * tBus; } break; } }
        const car = trips - bus; busRiders += bus; tripSum += trips; timeSum += car * tCar; if (tCar <= 30) reachWorkers += trips;
        let c = d; while (c !== undefined && c !== o) { load.set(c, (load.get(c) || 0) + car); c = prev.get(c); } load.set(o, (load.get(o) || 0) + car); }
    }
    function nearStopNode(u){ const ui = u % N, uj = (u / N) | 0; let best = null, bd = 4; for (const [s, rs] of stopSet) { const d = Math.abs((s % N) - ui) + Math.abs(((s / N) | 0) - uj); if (d < bd) { bd = d; best = {s, d, routes:rs}; } } return best; }
    // bus capacity: 60 passengers per bus, peak 2 hours
    for (const r of S.routes) { const cap = r.freq * 60 * 2, ride = routeRide.get(r.id); r.riders = Math.round(ride); r.crowded = ride > cap; if (ride > cap) { busRiders -= ride - cap; r.riders = cap; } }
    // freight rail components (touching the district edge = connected to the national freight line)
    const railComp = new Int32Array(N * N).fill(-1), railEdgeC = []; let nr = 0;
    for (let u = 0; u < N * N; u++) { if (!cvt(T[u]) || railComp[u] >= 0) continue; const q = [u]; railComp[u] = nr; let e = false;
      while (q.length) { const v = q.pop(), vi = v % N, vj = (v / N) | 0; if (vi === 0 || vj === 0 || vi === N - 1 || vj === N - 1) e = true; for (const [di, dj] of NB) { const wi = vi + di, wj = vj + dj; if (!inb(wi, wj)) continue; const w = idx(wi, wj); if (cvt(T[w]) && railComp[w] < 0) { railComp[w] = nr; q.push(w); } } }
      railEdgeC.push(e); nr++; }
    m.railComp = Array.from(railComp); m.railEdgeC = railEdgeC;
    const terms = []; for (let u = 0; u < N * N; u++) if (T[u].k === 'f' && T[u].fac === 'terminal') { const ui = u % N, uj = (u / N) | 0; const onRail = NB.some(([di, dj]) => inb(ui + di, uj + dj) && cvt(T[idx(ui + di, uj + dj)]) && railEdgeC[railComp[idx(ui + di, uj + dj)]]); T[u].railLinked = onRail; if (onRail && connected(u)) terms.push({u, cap:FAC.terminal.freightCap * (has('railyard') ? 1.5 : 1), used:0, reach:roadDist([access[u]], FAC.terminal.reach)}); }
    let fDemand = 0, fRail = 0, fTruck = 0, fLost = 0;
    // freight: industrial jobs go by rail through a linked terminal, otherwise by truck to the nearest gate (trucks count double)
    for (let u = 0; u < N * N; u++) { const t = T[u]; if (!(t.k === 'z' && t.zone === 'I' && t.st >= 3) || !connected(u)) continue; const trucks0 = t.cap * t.occ * .15 * 2; fDemand += trucks0 / 2;
      let railMoved = 0; for (const tm of terms) { if (!tm.reach.has(access[u])) continue; const mv = Math.min(trucks0 / 2 - railMoved, tm.cap - tm.used); if (mv > 0) { tm.used += mv; railMoved += mv; } }
      fRail += railMoved; t.byRail = railMoved > 0; const trucks = (trucks0 / 2 - railMoved) * 2; if (trucks <= .01) continue; let c = access[u]; const d = roadDist([c], 60); let best = null, bd = 1e9; for (let g = 0; g < N * N; g++) if (T[g].gate && d.has(g) && d.get(g) < bd) { bd = d.get(g); best = g; } if (best == null) { fLost += trucks / 2; continue; } fTruck += trucks / 2; const pth = roadPathTiles(c, best) || []; for (const p of pth) load.set(p, (load.get(p) || 0) + trucks); }
    m.freight = {demand:+fDemand.toFixed(1), rail:+fRail.toFixed(1), truck:+fTruck.toFixed(1), lost:+fLost.toFixed(1), share:fDemand ? (fRail + fTruck) / fDemand : 1, railShare:fDemand ? fRail / fDemand : 0, terminals:terms.length};
    const vc = {}; let congested = 0, maxVC = 0; const allU = new Set([...load.keys(), ...Object.keys(prevVC).map(Number)]);
    for (const u of allU) { if (!T[u] || T[u].k !== 'r') continue; const calc = (load.get(u) || 0) / T[u].cap, prev = prevVC[u]; const v = prev == null ? calc : prev + (calc - prev) * .5;   // successive averaging → stable equilibrium
      if (v < .005) continue; vc[u] = +v.toFixed(3); if (v > 1) congested++; maxVC = Math.max(maxVC, v); }
    m.freight.reliability = Math.round(clamp(45 + m.freight.railShare * 40 + (m.svc.digital ? 10 : 0) + m.freight.terminals * 4 - Math.min(20, congested * 1.5) - (dust ? 8 : 0), 0, 100));
    // ---- demand (responds to jobs, reachable housing, affordability via taxes, services, land value, investment, land supply and missions)
    const zonedLeft = z => T.filter(x => x.k === 'z' && x.zone === z && x.st < 3).length, zonedAll = z => Math.max(1, T.filter(x => x.k === 'z' && x.zone === z).length);
    const landF = z => { const r = zonedLeft(z) / zonedAll(z); return r < .15 ? 5 : r > .6 ? -4 : 0; };
    const inv = S.invest && S.invest.offer, mctx = S.mission && !S.mission.done ? (CMISSIONS.find(x => x.id === S.mission.id) || {}).demand || {} : {};
    const labor = pop * .5, lvAvg = resTiles.length ? resTiles.reduce((a, v) => a + T[v].lv0, 0) / resTiles.length : 45;
    const commute = tripSum ? timeSum / tripSum : 20, jobAccess = accW ? accOK / accW : 1;
    const dem = {
      R:[{label:L('Jobs waiting for workers (district + rest of Riyadh)','وظائف تنتظر عاملين (الحي وبقية الرياض)'), v:clamp((jobs + regional - labor) * .09, -40, 45)}, {label:L('Base attraction of Riyadh','جاذبية الرياض الأساسية'), v:14}, {label:L('Neighbourhood quality (land value)','جودة الحي (قيمة الأرض)'), v:(lvAvg - 40) * .4}, {label:L('Residential tax','ضريبة السكن'), v:-(S.tax.R - 7) * 5}, {label:L('Commute times','أزمنة التنقل'), v:-Math.max(0, commute - 34) * 1.5}, {label:L('Access to jobs','الوصول إلى الوظائف'), v:(jobAccess - .7) * 30}, {label:L('Land available for homes','الأراضي المتاحة للمساكن'), v:landF('R')}, ...(mctx.R ? [{label:mctx.label, v:mctx.R}] : [])],
      C:[{label:L('Shoppers and services needed','متسوقون وخدمات مطلوبة'), v:clamp((pop * .14 - Cjobs) * .3, -40, 45)}, {label:L('Base activity','نشاط أساسي'), v:10}, {label:L('Commercial tax','ضريبة تجارية'), v:-(S.tax.C - 7) * 5}, {label:L('Digital connectivity','الاتصال الرقمي'), v:(m.svc.digital ? 6 : 0)}, {label:L('Investment confidence (fictional offer)','ثقة الاستثمار (عرض خيالي)'), v:inv === 'A' ? 7 : inv === 'B' ? 5 : 0 + (has('investor') ? 4 : 0)}, {label:L('Land available for business','الأراضي المتاحة للأعمال'), v:landF('C')}, ...(mctx.C ? [{label:mctx.label, v:mctx.C}] : [])],
      I:[{label:L('Workforce available','القوى العاملة المتاحة'), v:clamp((labor * .3 - Ijobs) * .15, -40, 40)}, {label:L('Regional freight demand','طلب الشحن الإقليمي'), v:18}, {label:L('Industrial tax','ضريبة صناعية'), v:-(S.tax.I - 7) * 5}, {label:L('Skills from training','مهارات من التدريب'), v:(m.svc.train ? Math.min(8, m.svc.train.served / 10) : 0)}, {label:L('Rail freight access','الوصول إلى الشحن بالقطار'), v:m.freight.terminals ? 6 : 0}, ...(mctx.I ? [{label:mctx.label, v:mctx.I}] : [])],
      T:[{label:L('Landmarks and attractions nearby','معالم وجاذبية قريبة'), v:T.some(x => x.k === 'a') ? 12 : 4}, {label:L('Visitors expected (Riyadh)','الزوار المتوقعون (الرياض)'), v:16}, {label:L('Neighbourhood quality','جودة الحي'), v:(lvAvg - 45) * .4}, {label:L('Visitor beds already built','أسرّة الزوار المبنية'), v:-Tjobs * .12}, {label:L('Bus access for visitors','وصول الزوار بالحافلات'), v:S.routes.length ? 5 : 0}, ...(mctx.T ? [{label:mctx.label, v:mctx.T}] : [])]
    };
    dem.M = dem.R.map(c => ({label:c.label, v:c.v * .5})).concat(dem.C.map(c => ({label:c.label, v:c.v * .5})));
    m.demand = {}; for (const z of ['R','C','I','T','M']) m.demand[z] = clamp(dem[z].reduce((a, c) => a + c.v, 0), -100, 100); m.demandWhy = dem;
    // ---- budget (fictional credits)
    let roadTiles = 0, upkeep = 0; for (const t of T) { if (t.k === 'r' && !t.art) { roadTiles++; upkeep += t.avenue ? .02 : .01; } if (t.k === 'f') upkeep += FAC[t.fac].upkeep * (S.fund[FAC[t.fac].serve] || 1); if (t.k === 'x') upkeep += .015; }
    if (S.policy && S.policy.conserve) upkeep += .3;
    const busCost = S.routes.reduce((a, r) => a + routeUpkeep(r.path.length, r.freq), 0);
    const income = S.tax.R / 100 * pop * .12 + S.tax.C / 100 * Cjobs * .13 + S.tax.I / 100 * Ijobs * .12 + S.tax.C / 100 * Tjobs * .16 + busRiders * .002 + (S.invest && S.invest.opened ? .8 : 0);
    m.budget = {income:+income.toFixed(2), upkeep:+upkeep.toFixed(2), bus:+busCost.toFixed(2), loan:S.loan ? S.loan.pay : 0}; m.budget.net = +(income - upkeep - busCost - m.budget.loan).toFixed(2);
    Object.assign(m, {Tjobs:Math.round(Tjobs), pop:Math.round(pop), jobs:Math.round(jobs), Cjobs:Math.round(Cjobs), Ijobs:Math.round(Ijobs), labor:Math.round(labor), commute:+commute.toFixed(1), jobAccess:+jobAccess.toFixed(3), busRiders:Math.round(busRiders),
      congested, maxVC:+maxVC.toFixed(2), vc, trips:Math.round(tripSum), transitShare:tripSum ? busRiders / tripSum : 0, access:Array.from(access), comp:Array.from(comp), compGate,
      homesNearStop:resTiles.length ? resTiles.filter(v => T[v].transit).length / resTiles.length : 0, lvAvg:Math.round(lvAvg), unemployment:labor ? clamp(1 - Math.min(jobs, labor) / labor, 0, 1) : 0});
    m.env = resTiles.length ? Math.round(resTiles.reduce((a, v) => a + (T[v].cov.park ? 70 : 45) - (T[v].lv0 < 35 ? 10 : 0), 0) / resTiles.length) : 60;
    // investment site readiness (actual accessibility, utilities, services and talent around the site)
    if (S.invest && S.invest.site != null && T[S.invest.site] && T[S.invest.site].fac === 'invest') { const u = S.invest.site, si = u % N, sj = (u / N) | 0, near = resTiles.filter(v => Math.abs((v % N) - si) + Math.abs(((v / N) | 0) - sj) <= 8);
      const cov = k => near.length ? near.filter(v => T[v].cov[k]).length / near.length : 0, stop = nearStopNode(access[u] >= 0 ? access[u] : u);
      const parts = {access:connected(u) ? (stop ? 100 : 60) : 0, utilities:(T[u].pow ? 50 : 0) + (T[u].wat ? 50 : 0), services:Math.round((cov('health') + cov('edu')) * 50), talent:Math.round(clamp((S.skilled || 0) / 60, 0, 1) * 100), confidence:Math.round(clamp(lvAvg, 0, 100))};
      m.readinessParts = parts; m.readiness = Math.round(parts.access * .3 + parts.utilities * .2 + parts.services * .2 + parts.talent * .15 + parts.confidence * .15); }
    m.skilled = Math.round(S.skilled || 0); m.trainees = m.svc.train ? Math.round(m.svc.train.served) : 0;
    m.skilledEmployed = Math.round(Math.min(S.skilled || 0, (Ijobs + Cjobs * .3)) * jobAccess);
    // why each zoned parcel is (not) developing
    S.m = m;
    for (let u = 0; u < N * N; u++) { const t = T[u]; if (t.k !== 'z') continue; t.needs = needsOf(u, connected); }
    return m;
  }
  function settle(){ for (let k = 0; k < 6; k++) compute(); return S.m; }
  const isHeat = () => { const mo = S.month % 12; return mo >= 5 && mo <= 7; };
  function utilF(k){ let f = 1; if (isHeat()) f *= k === 'w' ? 1.15 : 1.1; return f; }
  function railEdgeAt(u){ const m = S.m || {}; return !!(m.railComp && m.railComp[u] >= 0 && m.railEdgeC[m.railComp[u]]); }
  function reachEstimate(i, j, f){ let c = 0; for (let u = 0; u < N * N; u++) { const t = S.tiles[u]; if (t.k !== 'z' || (t.zone !== 'R' && t.zone !== 'M')) continue; const d = f.walk ? Math.hypot((u % N) - i, ((u / N) | 0) - j) : Math.abs((u % N) - i) + Math.abs(((u / N) | 0) - j); if (d <= f.reach) c++; } return c; }
  function accessRoad(i, j){ return NB.some(([di, dj]) => inb(i + di, j + dj) && S.tiles[idx(i + di, j + dj)].k === 'r'); }
  function needsOf(u, connected){
    const t = S.tiles[u], i = u % N, j = (u / N) | 0, d = S.m.demand || {R:1, C:1, I:1};
    const out = [];
    out.push({k:'road', ok:accessRoad(i, j) && connected(u), why:!accessRoad(i, j) ? L('No road next to this parcel','لا يوجد طريق بجوار هذه القطعة') : !connected(u) ? L('The road is not connected to the city network','الطريق غير متصل بشبكة المدينة') : null});
    out.push({k:'power', ok:!!t.pow, why:t.pow ? null : L('No power: add generation on this network or connect it to the arterials','لا كهرباء: أضف توليدًا على هذه الشبكة أو اربطها بالطرق الرئيسية')});
    out.push({k:'water', ok:!!t.wat, why:t.wat ? null : L('No water: add a pumping station on this network','لا مياه: أضف محطة ضخ على هذه الشبكة')});
    const dv = (S.m.demand || d)[t.zone];
    if (t.zone === 'T') out.push({k:'appeal', ok:(t.lv0 || 0) >= 40, why:(t.lv0 || 0) >= 40 ? null : L('Visitors need an attractive area: land value 40+ (parks, transit, landmarks)','يحتاج الزوار إلى منطقة جذابة: قيمة أرض 40+ (حدائق ونقل ومعالم)')});
    out.push({k:'demand', ok:dv > 0, why:dv > 0 ? null : L(`No demand for ${{R:'homes', C:'shops and offices', I:'industry', T:'visitor accommodation', M:'mixed-use buildings'}[t.zone]} right now`, `لا طلب على ${{R:'المساكن', C:'المتاجر والمكاتب', I:'الصناعة', T:'إقامة الزوار', M:'المباني متعددة الاستخدامات'}[t.zone]} حاليًا`)});
    if (t.st >= 3 && t.lv < t.den) { const need = [0, 45, 62][t.lv]; out.push({k:'upgrade', ok:(t.lv0 || 0) >= need && (t.zone !== 'R' || (t.cov.edu && t.cov.health)), why:L(`To grow to level ${t.lv + 1}: land value ${need}+${t.zone === 'R' ? ', school and clinic coverage' : ''}`, `للنمو إلى المستوى ${t.lv + 1}: قيمة أرض ${need}+${t.zone === 'R' ? '، وتغطية مدرسة وعيادة' : ''}`)}); }
    return out;
  }

  /* ================================= TICK ============================== */
  function tick(){
    S.month++; const T = S.tiles, m = S.m, events = [];
    // weather: occasional dust storms (solar output and road speeds drop for a month); summer heat raises power and water demand
    if (S.weather.left > 0) { S.weather.left--; if (!S.weather.left) { S.weather.type = 'clear'; events.push({type:'weather', w:'clear'}); } }
    else if (S.month > 6 && rngAt(S.seed, S.month, 99991) < .07) { S.weather = {type:'dust', left:1}; events.push({type:'weather', w:'dust', text:L('Dust storm: solar output −40% and roads slower this month. Batteries and a smart grid soften the impact.','عاصفة ترابية: إنتاج الطاقة الشمسية −40٪ والطرق أبطأ هذا الشهر. البطاريات والشبكة الذكية تخففان الأثر.')}); }
    if (S.month % 12 === 5) events.push({type:'weather', w:'heat', text:L('Summer heat: power and water demand rise until September.','حرارة الصيف: يرتفع الطلب على الكهرباء والمياه حتى سبتمبر.')});
    // skills: trainees graduate into the workforce
    S.skilled = Math.min((S.skilled || 0) + (m.trainees || 0) * .08, (m.labor || 0) * .6);
    // mixed-use parcels shift between homes and shops with demand (change of use)
    for (const t of T) if (t.k === 'z' && t.zone === 'M' && t.st >= 3) { const tgt = clamp(.5 + ((m.demand.R || 0) - (m.demand.C || 0)) / 200, .3, .7); const before = t.mix ?? .5; t.mix = +(before + clamp(tgt - before, -.05, .05)).toFixed(3); }
    // investment complex under construction
    if (S.invest && S.invest.offer && !S.invest.opened) { S.invest.buildLeft--; if (S.invest.buildLeft <= 0) { S.invest.opened = true; const st = T[S.invest.site]; if (st) st.jobs = S.invest.offer === 'A' ? 260 : 200; events.push({type:'milestone', id:'invest', text:L('The investment complex has opened (fictional scenario).','افتُتح المجمع الاستثماري (سيناريو خيالي).')}); } }
    S.spend.push(S.spentThisMonth || 0); if (S.spend.length > 6) S.spend.shift();
    for (let u = 0; u < N * N; u++) { const t = T[u]; if (t.k !== 'z') continue; const r = rngAt(S.seed, S.month, u), needs = t.needs || [];
      const ok = k => (needs.find(n => n.k === k) || {}).ok, basics = ok('road') && ok('power') && ok('water'), dv = m.demand[t.zone];
      if (t.st === 0) { if (basics) t.st = 1; continue; }                                                    // serviced plot
      if (t.st === 1) { if (basics && dv > 0 && r < .18 + dv / 140 * ((t.lv0 || 40) / 55)) { t.st = 2; t.lv = 1; t.build = BUILD_MONTHS[1]; } else if (!basics) t.st = 0; continue; }
      if (t.st === 2) { if (basics) { t.build--; if (t.build <= 0) { t.st = 3; t.cap = ZCAP[t.zone][t.lv]; events.push({type:'built', u, lv:t.lv}); } } continue; }
      if (t.st >= 3) {
        const target = basics ? clamp(.35 + dv / 80, .2, 1) : 0;
        t.occ = +(t.occ + clamp(target - t.occ, -.2, .25)).toFixed(3);
        if (t.occ <= .02 && !basics) { t.empty = (t.empty || 0) + 1; if (t.empty >= 6) { t.st = 4; events.push({type:'abandoned', u}); } } else t.empty = 0;
        const up = needs.find(n => n.k === 'upgrade');
        if (t.st === 3 && up && up.ok && t.occ > .85 && dv > 25 && r < .25) { t.st = 2; t.lv++; t.build = BUILD_MONTHS[t.lv]; events.push({type:'upgrading', u, lv:t.lv}); }
      }
      if (t.st === 4 && basics && dv > 10) { t.st = 1; t.occ = 0; t.cap = 0; }                              // redevelop
    }
    // budget
    const b = m.budget; S.budget += b.net; if (S.loan) { S.loan.left--; if (S.loan.left <= 0) S.loan = null; }
    S.spentThisMonth = 0;
    compute();
    progress(events);
    missionTick(events);
    S.hist.push({month:S.month, pop:S.m.pop, jobs:S.m.jobs, commute:S.m.commute, riders:S.m.busRiders, budget:+S.budget.toFixed(1), net:S.m.budget.net, maxVC:S.m.maxVC}); if (S.hist.length > 120) S.hist.shift();
    if (S.m.budget.net < 0 && S.budget < -S.m.budget.net * 3) events.push({type:'warn', text:L('Operating costs exceed income. Raise taxes, cut funding, grow the tax base, or take short-term financing.','تكاليف التشغيل تفوق الدخل. ارفع الضرائب أو خفّض التمويل أو وسّع القاعدة الضريبية أو خذ تمويلًا قصير الأجل.'), pause:true});
    return events;
  }
  /* ========================= GOALS AND CAPABILITIES ===================== */
  const MILESTONES = [
    {id:'first', test:m => m.pop >= 40, text:L('First residents have moved in','انتقل أول السكان')},
    {id:'medium', test:m => m.pop >= 250, cap:'medium', text:L('Growing neighbourhood: medium density unlocked','حي ينمو: فُتحت الكثافة المتوسطة')},
    {id:'mixed', test:m => m.pop >= 250, cap:'mixed', text:L('Lively streets: mixed-use zoning unlocked','شوارع حيوية: فُتح التخصيص متعدد الاستخدامات')},
    {id:'avenue', test:m => m.pop >= 600, cap:'avenue', text:L('Busy streets: avenue upgrades unlocked','شوارع نشطة: فُتحت ترقية الجادات')},
    {id:'digital', test:m => m.jobs >= 700, cap:'digital', text:L('Job centre: digital connectivity hub unlocked','مركز وظائف: فُتح مركز الاتصال الرقمي')},
    {id:'express', test:m => m.busRiders >= 300, cap:'express', text:L('Transit habit: high-frequency buses unlocked','عادة النقل العام: فُتحت الحافلات عالية التردد')},
    {id:'high', test:m => m.pop >= 1400 && m.homesNearStop >= .3, cap:'high', text:L('District: high density unlocked','حي متكامل: فُتحت الكثافة العالية')}
  ];
  const CHALLENGES = [
    {id:'corridor', when:m => m.congested >= 3, done:m => m.maxVC < 1, text:L('Relieve the congested corridor: bring every road below capacity','خفف الممر المزدحم: اجعل كل طريق دون سعته'), hint:L('Add a parallel road, an avenue upgrade, or a bus route connecting homes with jobs.','أضف طريقًا موازيًا أو ترقية جادة أو مسار حافلات يربط المساكن بالوظائف.')},
    {id:'school', when:m => m.svc.edu ? m.svc.edu.demand - m.svc.edu.served > 30 : m.pop > 250, done:m => m.svc.edu && m.svc.edu.demand - m.svc.edu.served <= 10, text:L('Make room at school for every child','وفّر مقعدًا دراسيًا لكل طفل'), hint:L('Add a school near unserved homes or raise education funding.','أضف مدرسة قرب المساكن غير المخدومة أو ارفع تمويل التعليم.')},
    {id:'power', when:m => S.tiles.filter(t => t.k === 'z' && t.st >= 1 && !t.pow).length >= 4, done:m => S.tiles.filter(t => t.k === 'z' && t.st >= 1 && !t.pow).length === 0, text:L('Power the growing district','زوّد الحي النامي بالكهرباء'), hint:L('Build generation on the same road network: a gas plant, or solar with a battery.','ابنِ توليدًا على شبكة الطرق نفسها: محطة غاز أو طاقة شمسية مع بطارية.')},
    {id:'water', when:m => S.tiles.filter(t => t.k === 'z' && t.st >= 1 && !t.wat).length >= 4, done:m => S.tiles.filter(t => t.k === 'z' && t.st >= 1 && !t.wat).length === 0, text:L('Keep water flowing to new homes','أبقِ المياه تتدفق إلى المساكن الجديدة'), hint:L('Add a pumping station or water tower on the connected network.','أضف محطة ضخ أو خزانًا مرتفعًا على الشبكة المتصلة.')},
    {id:'jobs', when:m => m.pop > 200 && m.jobAccess < .6, done:m => m.jobAccess >= .75, text:L('Connect homes to jobs','اربط المساكن بالوظائف'), hint:L('Zone jobs nearby, connect roads to the landmarks, or add a bus route.','خصص وظائف قريبة أو اربط الطرق بالمعالم أو أضف مسار حافلات.')}
  ];
  function progress(events){
    for (const ms of MILESTONES) if (!S.goals[ms.id] && ms.test(S.m)) { S.goals[ms.id] = S.month; if (ms.cap && !S.caps.includes(ms.cap)) S.caps.push(ms.cap); events.push({type:'milestone', id:ms.id, text:ms.text, cap:ms.cap, pause:!!ms.cap}); }
    for (const ch of CHALLENGES) { const cur = S.challenges.find(c => c.id === ch.id && !c.doneAt);
      if (!cur && !S.challenges.some(c => c.id === ch.id && S.month - (c.doneAt || c.start) < 6) && ch.when(S.m)) { S.challenges.push({id:ch.id, start:S.month}); events.push({type:'challenge', id:ch.id, text:ch.text, hint:ch.hint, pause:true}); }
      else if (cur && ch.done(S.m)) { cur.doneAt = S.month; events.push({type:'challengeDone', id:ch.id, text:ch.text, reward:1}); } }
  }
  function log(text, kind){ S.log.push({month:S.month, text, kind}); if (S.log.length > 80) S.log.shift(); }

  /* ============================ CITY MISSIONS ============================ */
  // The five 2026 challenge arcs, played in your own district. Success is judged on outcomes, never on placing a named asset.
  const nearGate = (s, gi, gj) => Math.abs((s % N) - gi) + Math.abs(((s / N) | 0) - gj) <= 3;
  const CMISSIONS = [
    {id:'cA', arc:'A', months:12, grant:20, cap:'interchange', title:L('Connect the District','اربط الحي'),
      brief:L('Link your neighbourhoods to the City Centre (west gate) and to the Dammam road (east gate) with a bus route people actually use.','اربط أحياءك بوسط المدينة (البوابة الغربية) وبطريق الدمام (البوابة الشرقية) بمسار حافلات يستخدمه الناس فعلًا.'),
      demand:{label:L('Mission: event visitors','المهمة: زوار الفعاليات'), C:4},
      checks:m => [{label:L('Homes near a bus stop ≥ 60%','المساكن القريبة من محطة ≥ 60٪'), ok:m.homesNearStop >= .6, v:Math.round(m.homesNearStop * 100) + '%'},
        {label:L('One bus route serves both the west and east gates','مسار حافلات واحد يخدم البوابتين الغربية والشرقية'), ok:S.routes.some(r => r.stops.some(s => nearGate(s, 0, 21)) && r.stops.some(s => nearGate(s, N - 1, 21)))},
        {label:L('Bus riders ≥ 30','ركاب الحافلات ≥ 30'), ok:m.busRiders >= 30, v:m.busRiders}],
      hint:L('Place stops close to homes and at both ends of the horizontal arterial. Frequency matters.','ضع المحطات قرب المساكن وعند طرفي الطريق الرئيسي الأفقي. التردد مهم.'),
      deltas:(m, k) => [['basic', 1.2 * k, L('District connected to both gateways by bus','ربط الحي بالبوابتين بالحافلات')], ['productivity', (30 - m.commute) * .05 * k, L(`Average commute ${m.commute} minutes`, `متوسط التنقل ${m.commute} دقيقة`)], ['societal', m.homesNearStop * 1.2 * k, L(`${Math.round(m.homesNearStop * 100)}% of homes near a bus stop`, `${Math.round(m.homesNearStop * 100)}٪ من المساكن قرب محطة`)]]},
    {id:'cB', arc:'B', months:12, grant:25, cap:'smartgrid', title:L('Power the Next District','طاقة للحي التالي'),
      brief:L('Grow the district on clean power: every connected building supplied, at least half of the power from solar — and it must hold through a dust storm or the summer peak.','نمِّ الحي بطاقة نظيفة: كل مبنى متصل مزوّد، ونصف الكهرباء على الأقل من الشمس — ويجب أن يصمد أثناء عاصفة ترابية أو ذروة الصيف.'),
      checks:m => [{label:L('Residents ≥ 150','السكان ≥ 150'), ok:m.pop >= 150, v:m.pop}, {label:L('No connected building without power','لا مبنى متصل بلا كهرباء'), ok:m.unpowered === 0, v:m.unpowered},
        {label:L('Solar share of supply ≥ 50%','حصة الشمس من الإمداد ≥ 50٪'), ok:m.renewShare >= .5, v:Math.round(m.renewShare * 100) + '%'}],
      hint:L('Solar only counts on the same road network, and needs batteries for the evening. A gas plant is reliable but lowers the solar share.','الطاقة الشمسية تُحتسب فقط على شبكة الطرق نفسها وتحتاج بطاريات للمساء. محطة الغاز موثوقة لكنها تخفض حصة الشمس.'),
      deltas:(m, k) => [['health', m.renewShare * 2 * k, L(`${Math.round(m.renewShare * 100)}% solar power`, `${Math.round(m.renewShare * 100)}٪ طاقة شمسية`)], ['basic', .6 * k, L('Reliable district grid','شبكة حي موثوقة')], ['pubfin', m.budget.net >= 0 ? .4 * k : -.4, L(`Operating balance ${m.budget.net}/month`, `رصيد التشغيل ${m.budget.net}/شهر`)]]},
    {id:'cC', arc:'C', months:15, grant:30, cap:'railyard', title:L('Three Continents, One Network','ثلاث قارات، شبكة واحدة'),
      brief:L('Build a logistics district. Draw a freight rail line to the district edge (the national freight line), place a logistics terminal on it, and move most freight by rail instead of trucks.','ابنِ حيًا لوجستيًا. ارسم خط شحن بالقطار إلى حافة الحي (خط الشحن الوطني)، وضع محطة لوجستية عليه، وانقل معظم الشحن بالقطار بدل الشاحنات.'),
      demand:{label:L('Mission: regional freight contracts','المهمة: عقود شحن إقليمية'), I:8},
      checks:m => [{label:L('Industry & logistics jobs ≥ 80','وظائف الصناعة واللوجستيات ≥ 80'), ok:m.Ijobs >= 80, v:m.Ijobs}, {label:L('Freight moved ≥ 85%','الشحن المنقول ≥ 85٪'), ok:m.freight.share >= .85, v:Math.round(m.freight.share * 100) + '%'},
        {label:L('Freight by rail ≥ 50% and reliability ≥ 70','الشحن بالقطار ≥ 50٪ والموثوقية ≥ 70'), ok:m.freight.railShare >= .5 && m.freight.reliability >= 70, v:`${Math.round(m.freight.railShare * 100)}% · ${m.freight.reliability}`}],
      hint:L('A terminal only works if it touches a rail line that reaches the district edge, and industry within 6 road parcels of it.','المحطة تعمل فقط إذا لامست خط سكة يصل إلى حافة الحي، مع صناعة ضمن 6 قطع طرق منها.'),
      deltas:(m, k) => [['trade', (m.freight.share * .8 + m.freight.railShare) * k, L(`${Math.round(m.freight.railShare * 100)}% of freight by rail`, `${Math.round(m.freight.railShare * 100)}٪ من الشحن بالقطار`)], ['productivity', (m.freight.reliability - 60) * .03 * k, L(`Freight reliability ${m.freight.reliability}`, `موثوقية الشحن ${m.freight.reliability}`)], ['tech', m.svc.digital ? .6 * k : 0, L('Digital connectivity in the logistics district','اتصال رقمي في الحي اللوجستي')]]},
    {id:'cD', arc:'D', months:18, grant:20, cap:'investor', title:L('Unlock the Investment','أطلق الاستثمار'),
      brief:L('Designate an investment site, then make it ready: road and bus access, power and water, clinics and schools around it, skilled people and an attractive area. At readiness 70 two fictional offers appear.','حدّد موقعًا استثماريًا ثم جهّزه: وصول بالطرق والحافلات، وكهرباء ومياه، وعيادات ومدارس حوله، ومهارات ومنطقة جذابة. عند جاهزية 70 يظهر عرضان خياليان.'),
      checks:m => [{label:L('Investment readiness ≥ 70','جاهزية الاستثمار ≥ 70'), ok:(m.readiness || 0) >= 70 || !!(S.invest && S.invest.offer), v:m.readiness ?? '—'}, {label:L('A fictional offer accepted and the complex opened','قبول عرض خيالي وافتتاح المجمع'), ok:!!(S.invest && S.invest.opened)},
        {label:L('Credits not negative','الأرصدة غير سالبة'), ok:S.budget >= 0, v:S.budget.toFixed(1)}],
      hint:L('Readiness = access 30% · utilities 20% · services 20% · skills 15% · area quality 15%. Inspect the site to see each part.','الجاهزية = الوصول 30٪ · المرافق 20٪ · الخدمات 20٪ · المهارات 15٪ · جودة المنطقة 15٪. افحص الموقع لرؤية كل جزء.'),
      deltas:(m, k) => [['investment', 1.4 * k, L(`Fictional investment ${S.invest && S.invest.offer === 'B' ? 'local partnership' : 'fast-capital'} offer secured`, `تأمين عرض استثمار خيالي ${S.invest && S.invest.offer === 'B' ? 'بشراكة محلية' : 'برأس مال سريع'}`)], ['finance', .6 * k, L('Project financed','تمويل المشروع')], ['institutional', .4 * k, L('Site prepared with clear access and utilities','تجهيز الموقع بوصول ومرافق واضحة')]]},
    {id:'cE', arc:'E', months:18, grant:22, cap:'academy', title:L('Talent Powers Delivery','المواهب تدفع الإنجاز'),
      brief:L('Build a training pipeline: training centres near homes, graduates who can actually reach jobs, and enough skilled workers for industry and business. Skills take months to develop.','ابنِ مسار تدريب: مراكز تدريب قرب المساكن، وخريجون يصلون فعلًا إلى الوظائف، وعمالة ماهرة كافية للصناعة والأعمال. المهارات تحتاج أشهرًا لتتطور.'),
      checks:m => [{label:L('Trainees enrolled ≥ 40','المتدربون الملتحقون ≥ 40'), ok:m.trainees >= 40, v:m.trainees}, {label:L('Skilled workers who can reach jobs ≥ 60','عمالة ماهرة تصل إلى الوظائف ≥ 60'), ok:m.skilledEmployed >= 60, v:m.skilledEmployed},
        {label:L('Business and industry jobs ≥ 150','وظائف الأعمال والصناعة ≥ 150'), ok:m.Cjobs + m.Ijobs >= 150, v:m.Cjobs + m.Ijobs}],
      hint:L('Training centres serve homes by road within 12 parcels and can fill up. Graduates only count if jobs are within a 30-minute commute.','مراكز التدريب تخدم المساكن ضمن 12 قطعة بالطرق وقد تمتلئ. الخريجون يُحتسبون فقط إذا كانت الوظائف ضمن 30 دقيقة.'),
      deltas:(m, k) => [['education', Math.min(2, m.trainees / 60) * k, L(`${m.trainees} trainees enrolled`, `${m.trainees} متدربًا ملتحقًا`)], ['labor', Math.min(2, m.skilledEmployed / 100) * k, L(`${m.skilledEmployed} skilled workers reach jobs`, `${m.skilledEmployed} عاملًا ماهرًا يصلون إلى الوظائف`)], ['employment', (.12 - m.unemployment) * 6 * k, L(`District unemployment ${Math.round(m.unemployment * 100)}%`, `بطالة الحي ${Math.round(m.unemployment * 100)}٪`)]]}
  ];
  function summary(){ const m = S.m, T = S.tiles, fac = {}; for (const t of T) if (t.k === 'f') fac[t.fac] = (fac[t.fac] || 0) + 1;
    const zones = {}; for (const t of T) if (t.k === 'z' && t.st >= 3) zones[t.zone] = (zones[t.zone] || 0) + 1;
    return {month:S.month, pop:m.pop, jobs:m.jobs, commute:m.commute, riders:m.busRiders, nearStop:Math.round(m.homesNearStop * 100), renew:Math.round((m.renewShare || 0) * 100), freight:Math.round(((m.freight || {}).share || 0) * 100), rail:Math.round(((m.freight || {}).railShare || 0) * 100), readiness:m.readiness ?? null, skilled:m.skilledEmployed || 0, env:m.env, budget:+S.budget.toFixed(1),
      roads:T.filter(t => t.k === 'r' && !t.art).length, railTiles:T.filter(cvt).length, routes:S.routes.length, fac, zones}; }
  function startMission(id){ const d = CMISSIONS.find(x => x.id === id); if (!d) return {ok:false}; if (S.mission && !S.mission.done) return {ok:false, why:L('Finish or abandon the current city mission first','أنهِ مهمة المدينة الحالية أو تخلَّ عنها أولًا')};
    S.mission = {id, start:S.month, deadline:S.month + d.months, before:summary(), done:false}; S.budget += d.grant; log(L(`City mission started: ${d.title.en}`, `بدأت مهمة المدينة: ${d.title.ar}`), 'mission'); settle(); return {ok:true}; }
  function abandonMission(){ if (S.mission && !S.mission.done) { S.mission.done = true; S.mission.result = {medal:null, abandoned:true}; } }
  function missionStatus(){ if (!S.mission) return null; const d = CMISSIONS.find(x => x.id === S.mission.id); const checks = d.checks(S.m); return {def:d, checks, met:checks.every(c => c.ok), left:S.mission.deadline - S.month, mission:S.mission}; }
  function acceptOffer(which){ if (!S.invest || S.invest.offer) return {ok:false}; if ((S.m.readiness || 0) < 70) return {ok:false, why:L('Offers arrive at readiness 70','تصل العروض عند جاهزية 70')};
    S.invest.offer = which; const inc = 0; S.budget += (which === 'A' ? 15 : 8) - inc; S.invest.buildLeft = which === 'A' ? 1 : 2; if (which === 'B') S.skilled = (S.skilled || 0) + 20; settle(); return {ok:true}; }
  function missionTick(events){
    const st = missionStatus(); if (!st || st.mission.done) return;
    const d = st.def, m = S.m, used = S.month - st.mission.start;
    if (st.met || st.left <= 0) {
      const critical = S.budget < 0 || m.env < 40 || m.jobAccess < .5;
      const medal = !st.met ? null : (used <= d.months * 2 / 3 && !critical) ? 'gold' : 'silver';
      const k = {gold:1, silver:.7}[medal] || 0;
      const after = summary();
      const deltas = medal ? d.deltas(m, k).map(([factor, v, why]) => ({factor, delta:+clamp(v, -3, 3).toFixed(2), why})).filter(x => Math.abs(x.delta) >= .05) : [];
      if (medal && d.cap && !S.caps.includes(d.cap)) S.caps.push(d.cap);
      st.mission.done = true; st.mission.result = {medal, used, before:st.mission.before, after, deltas, cap:medal ? d.cap : null, points:{gold:3, silver:2}[medal] || 0, critical, hint:d.hint};
      S.missionLog.push({id:d.id, medal, month:S.month});
      events.push({type:'cityMission', id:d.id, result:st.mission.result, pause:true});
    }
  }

  /* ======================= COMPETITIVENESS (SCENARIO) ==================== */
  // City outcomes → fictional scenario factor changes, each with an explanation. Never an official statistic.
  function factorDeltas(){
    const m = S.m, out = []; if (!m || m.pop < 150) return out;
    const add = (factor, v, why) => { v = clamp(v, -3, 3); if (Math.abs(v) >= .05) out.push({factor, delta:+v.toFixed(2), why}); };
    const cov = k => m.svc[k] && m.svc[k].demand ? m.svc[k].served / m.svc[k].demand : 0;
    add('education', (cov('edu') - .5) * 3 + cov('train') * .8, L(`${Math.round(cov('edu') * 100)}% of students have a reachable school place${m.svc.train ? '; training centre running' : ''}`, `${Math.round(cov('edu') * 100)}٪ من الطلاب لهم مقعد دراسي قريب${m.svc.train ? '؛ مركز التدريب يعمل' : ''}`));
    add('health', (cov('health') - .5) * 2 + (m.env - 55) * .04, L(`${Math.round(cov('health') * 100)}% clinic coverage; environment ${m.env}`, `تغطية العيادات ${Math.round(cov('health') * 100)}٪؛ البيئة ${m.env}`));
    add('basic', (m.jobAccess - .6) * 3 - m.congested * .05, L(`${Math.round(m.jobAccess * 100)}% of workers reach a job within 30 minutes`, `${Math.round(m.jobAccess * 100)}٪ من العاملين يصلون إلى وظيفة خلال 30 دقيقة`));
    add('tech', m.svc.digital ? 1.2 : 0, L('Digital connectivity hub serving the district','مركز اتصال رقمي يخدم الحي'));
    add('employment', (.12 - m.unemployment) * 8, L(`Simulated district unemployment ${Math.round(m.unemployment * 100)}%`, `بطالة الحي المحاكاة ${Math.round(m.unemployment * 100)}٪`));
    add('labor', cov('train') * 1.2 + Math.min(1, (m.skilledEmployed || 0) / 150), L(`Training reaching workers; ${m.skilledEmployed || 0} skilled workers can reach jobs`, `التدريب يصل إلى العاملين؛ ${m.skilledEmployed || 0} عاملًا ماهرًا يصلون إلى وظائف`));
    
    add('productivity', (30 - m.commute) * .08, L(`Average commute ${m.commute} minutes`, `متوسط زمن التنقل ${m.commute} دقيقة`));
    add('pubfin', m.budget.net >= 0 ? Math.min(1, m.budget.net / 4) : Math.max(-1.5, m.budget.net / 3), L(`City operating balance ${m.budget.net >= 0 ? '+' : ''}${m.budget.net} credits/month`, `رصيد تشغيل المدينة ${m.budget.net} رصيد/شهر`));
    add('investment', Math.min(1.2, m.Cjobs / 500), L(`${m.Cjobs} commercial jobs attracted`, `استقطاب ${m.Cjobs} وظيفة تجارية`));
    add('societal', (m.homesNearStop - .3) * 1.5 + (cov('park') - .4), L(`${Math.round(m.homesNearStop * 100)}% of homes near a bus stop; park access ${Math.round(cov('park') * 100)}%`, `${Math.round(m.homesNearStop * 100)}٪ من المساكن قرب محطة حافلات؛ الوصول إلى الحدائق ${Math.round(cov('park') * 100)}٪`));
    const avgSpend = S.spend.length ? S.spend.reduce((a, b) => a + b, 0) / S.spend.length : 0;
    add('prices', avgSpend > 12 ? -Math.min(1.2, (avgSpend - 12) * .08) : .2, avgSpend > 12 ? L(`Construction pressure: ${avgSpend.toFixed(1)} credits of building per month competes for materials`, `ضغط البناء: ${avgSpend.toFixed(1)} رصيد بناء شهريًا يتنافس على المواد`) : L('Construction paced without cost pressure','وتيرة بناء دون ضغط تكاليف'));
    if (m.freight && m.freight.demand > 5) add('trade', (m.freight.share - .6) * 2 + m.freight.railShare, L(`${Math.round(m.freight.share * 100)}% of district freight moved, ${Math.round(m.freight.railShare * 100)}% by rail (reliability ${m.freight.reliability})`, `نقل ${Math.round(m.freight.share * 100)}٪ من شحن الحي، ${Math.round(m.freight.railShare * 100)}٪ بالقطار (الموثوقية ${m.freight.reliability})`));
    if (m.readiness != null) add('investment', (m.readiness - 50) * .03 + (S.invest && S.invest.opened ? .8 : 0), L(`Investment-site readiness ${m.readiness}${S.invest && S.invest.opened ? ' · fictional complex opened' : ''}`, `جاهزية الموقع الاستثماري ${m.readiness}${S.invest && S.invest.opened ? ' · افتُتح المجمع الخيالي' : ''}`));
    if (m.renewShare) add('health', m.renewShare * 1.2, L(`${Math.round(m.renewShare * 100)}% of district power from solar`, `${Math.round(m.renewShare * 100)}٪ من كهرباء الحي من الطاقة الشمسية`));
    add('domestic', Math.min(1.5, m.pop / 2000), L(`District population ${m.pop}`, `سكان الحي ${m.pop}`));
    return out;
  }

  /* ================================ SAVE ================================ */
  const KEY = 'visionNexus2030.city.v1';
  function serialize(){ return JSON.stringify(S); }
  function load(txt){ const d = JSON.parse(txt); if (!d || d.v !== VERSION) throw new Error('Incompatible city save'); S = d; S.policy = S.policy || {conserve:false}; S.weather = S.weather || {type:'clear', left:0}; S.spend = S.spend || []; S.missionLog = S.missionLog || []; if (S.invest === undefined) S.invest = null; undo.length = 0; settle(); return S; }
  function dateOf(m = S.month){ return {year:S.startYear + Math.floor(m / 12), month:m % 12}; }

  // Save integrity: every successful change through the public API bumps a revision, so the UI can save edits made
  // while time is paused (not only on month ticks or when leaving). autosaveDue() is the rule: unsaved changes that
  // have been quiet for `quiet` ms (default 400) are due to be written.
  let rev = 0, revAt = 0;
  const changed = r => !(r === false || (r && typeof r === 'object' && r.ok === false));
  const tracked = f => (...a) => { const r = f(...a); if (changed(r)) { rev++; revAt = Date.now(); } return r; };
  const autosaveDue = (savedRev, now = Date.now(), quiet = 400) => rev !== savedRev && now - revAt >= quiet;

  window.VisionCity = {N, FAC, COST, CAPS, MILESTONES, CHALLENGES, KEY, idx, newCity:tracked(newCity), preview, apply:tracked(apply), canUndo, doUndo:tracked(doUndo), routePreview, addRoute:tracked(addRoute), setRouteFreq:tracked(setRouteFreq), removeRoute:tracked(removeRoute),
    setTax:tracked(setTax), setFund:tracked(setFund), setPolicy:tracked(setPolicy), takeLoan:tracked(takeLoan), compute, settle, CMISSIONS, startMission:tracked(startMission), abandonMission:tracked(abandonMission), missionStatus, acceptOffer:tracked(acceptOffer), summary, tick:tracked(tick), factorDeltas, serialize, load:tracked(load), dateOf, roadPathTiles,
    rev:() => rev, autosaveDue, get state(){ return S; }, set state(v){ S = v; }};
})();
