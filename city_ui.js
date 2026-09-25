// Vision Nexus 2030 — Riyadh City Builder interface.
(() => {
  'use strict';
  const G = window.VNP, VC = window.VisionCity; if (!G || !VC) return;
  const {W, $, $$, esc, VM} = G, t = (...a) => G.t(...a), N = VC.N;
  const ui = {tool:'select', density:1, dragA:null, dragB:null, pending:null, stops:[], freq:6, speed:0, acc:0, overlay:null, sel:null, panel:null, dayT:.3, last:performance.now(), quick:false, active:false};
  let grid = null;

  /* ============================ GRID PLACEMENT ========================== */
  function setupGrid(){
    const core = W.place(46.68, 24.71, 'Riyadh'), ts = .027, n = N;
    const cx = core[0] + 1.02, cz = core[1] + .12;                       // new district east of the centre, clear of the landmark cluster
    grid = {x0:cx - n * ts / 2, z0:cz - n * ts / 2, ts, n}; G.cityGrid = grid;
    return grid;
  }
  const tileAt = (x, z) => { const i = Math.floor((x - grid.x0) / grid.ts), j = Math.floor((z - grid.z0) / grid.ts); return i >= 0 && j >= 0 && i < N && j < N ? [i, j] : null; };
  const center = u => [grid.x0 + ((u % N) + .5) * grid.ts, grid.z0 + (((u / N) | 0) + .5) * grid.ts];
  function anchorsInGrid(){
    const out = [], nodes = VM.BOARDS.riyadh.nodes;
    for (const [id, n] of Object.entries(nodes)) { const p = G.nodePos(id, 'riyadh'), tt = tileAt(p[0], p[1]); if (!tt) continue; out.push({id, name:n.name.en, nameL:n.name, i:Math.max(1, Math.min(N - 2, tt[0])), j:Math.max(1, Math.min(N - 2, tt[1])), r:1, jobs:n.core ? 420 : 160}); }
    return out;
  }

  /* ================================ ENTER =============================== */
  G.openCity = (fresh) => {
    setupGrid();
    let loaded = false;
    if (!fresh) for (const key of [VC.KEY, VC.KEY + '.backup']) { if (loaded) break; let s = null; try { s = localStorage.getItem(key); if (s) { VC.load(s); loaded = true; } } catch(e) { try { if (s) localStorage.setItem(VC.KEY + '.unreadable', s); } catch(e2) {} G.toast(t('cityLoadFail')); } }
    if (!loaded) VC.newCity({seed:(Date.now() % 100000) || 7, anchors:anchorsInGrid()});
    ui.active = true; ui.speed = 0; ui.tool = 'select'; ui.overlay = null; ui.sel = null; ui.panel = null;
    G.hideAll(); $('#chud').classList.remove('hidden'); $('#play').classList.remove('hidden');
    W.setBeacons(false); W.setProjectLabels(false); W.setHazard(null); W.setEntities([]); W.setDynamicLabels([]); W.setMissionScene({links:[], sites:[]}); W.setOverlay([]);
    W.onGroundClick(null); W.onGroundDrag(onDrag); W.onGroundHover(onHover);
    const c = [grid.x0 + N * grid.ts / 2, grid.z0 + N * grid.ts / 2], K = W.place(45.3, 23.7), core = W.place(46.68, 24.71, 'Riyadh');
    if (!G.profile.reduced) {   // one continuous move: Kingdom → Riyadh → the new district
      W.cam(.1, 1.05, 12, K[0], K[1], .6); say(t('zoomKingdom'), 'info');
      setTimeout(() => { if (!ui.active) return; W.cam(.3, .95, 4.2, core[0] + .3, core[1], .5); say(t('zoomRiyadh'), 'info'); }, 1300);
      setTimeout(() => { if (!ui.active) return; W.cam(.35, .82, 1.9, c[0], c[1], .5); say(loaded ? t('cityResumed') : t('cityWelcome'), 'info'); }, 2800);
    } else W.cam(.35, .82, 1.9, c[0], c[1], 2);
    render(); renderHUD(); if (G.profile.reduced) say(loaded ? t('cityResumed') : t('cityWelcome'), 'info');
  };
  function leaveCity(){ save(); ui.active = false; W.setDynamicLabels([]); W.setHazard(null); W.setProjectLabels(true); W.onGroundDrag(null); W.onGroundHover(null); W.setCity(null); W.setOverlay([]); W.setEntities([]); W.setMissionLights([]); $('#chud').classList.add('hidden'); G.showMenu(); }
  function save(){ try { const prev = localStorage.getItem(VC.KEY); if (prev) localStorage.setItem(VC.KEY + '.backup', prev); localStorage.setItem(VC.KEY, VC.serialize());
      const S = VC.state, deltas = VC.factorDeltas(), old = (G.profile.city && G.profile.city.deltas) || [], d = VC.dateOf();
      G.profile.compEvents = G.profile.compEvents || [];
      for (const x of deltas) { const o = old.find(y => y.factor === x.factor), from = o ? o.delta : 0; if (Math.abs(x.delta - from) >= .1) G.profile.compEvents.push({factor:x.factor, from, to:x.delta, why:x.why, source:'city', year:d.year, month:d.month}); }
      for (const o of old) if (!deltas.some(x => x.factor === o.factor)) G.profile.compEvents.push({factor:o.factor, from:o.delta, to:0, why:o.why, source:'city', year:d.year, month:d.month});
      if (G.profile.compEvents.length > 120) G.profile.compEvents = G.profile.compEvents.slice(-120);
      G.profile.city = {deltas, month:S.month, pop:S.m.pop, caps:S.caps.slice(), transitShare:+(S.m.transitShare || 0).toFixed(3)}; G.saveProfile(); } catch(e) {} }
  G.citySummary = () => { try { const s = JSON.parse(localStorage.getItem(VC.KEY) || localStorage.getItem(VC.KEY + '.backup')); if (!s) return null; const y = s.startYear + Math.floor(s.month / 12); return {month:s.month, year:y, pop:(s.m || {}).pop || 0}; } catch(e) { return null; } };

  /* ============================== RENDERING ============================= */
  const OVERLAYS = {
    access:{icon:'🛣', f:(tl, u, m) => tl.k !== 'z' && tl.k !== 'f' ? null : (m.access[u] < 0 ? [.95,.35,.3] : m.compGate[m.comp[m.access[u]]] ? [.35,.85,.45] : [1,.7,.25])},
    transit:{icon:'🚌', f:(tl) => tl.k === 'z' ? (tl.transit ? [.35,.75,.95] : [.85,.85,.82]) : null},
    power:{icon:'⚡', f:(tl) => tl.k === 'z' || tl.k === 'f' ? (tl.pow ? [.98,.85,.3] : noRoad(tl) ? [.68,.68,.66] : [.6,.3,.3]) : null},
    water:{icon:'💧', f:(tl) => tl.k === 'z' ? (tl.wat ? [.35,.65,.95] : noRoad(tl) ? [.68,.68,.66] : [.6,.3,.3]) : null},
    education:{icon:'🏫', f:(tl) => tl.k === 'z' && tl.zone === 'R' ? (tl.cov && tl.cov.edu ? [.4,.8,.5] : tl.st >= 3 ? [.95,.45,.3] : null) : null},
    health:{icon:'🏥', f:(tl) => tl.k === 'z' && tl.zone === 'R' ? (tl.cov && tl.cov.health ? [.4,.8,.5] : tl.st >= 3 ? [.95,.45,.3] : null) : null},
    environment:{icon:'🌳', f:(tl) => tl.k === 'z' ? ramp(((tl.cov && tl.cov.park ? 70 : 45) - (tl.lv0 < 35 ? 10 : 0)) / 100) : null},
    landvalue:{icon:'💎', f:(tl) => tl.k === 'z' ? ramp((tl.lv0 || 0) / 100) : null},
    unmet:{icon:'⚠', f:(tl) => tl.k === 'z' && tl.st < 3 ? (tl.needs && tl.needs.every(n => n.ok || n.k === 'upgrade') ? [.98,.85,.35] : [.95,.35,.3]) : null},
    traffic:{icon:'🚗', f:(tl, u, m) => tl.k === 'r' ? ramp(1 - Math.min(1.4, m.vc[u] || 0) / 1.4) : null}
  };
  const noRoad = tl => tl.needs && tl.needs.some(n => n.k === 'road' && !n.ok);
  const ramp = v => v > .66 ? [.35,.85,.45] : v > .45 ? [.75,.9,.4] : v > .3 ? [1,.78,.3] : [.95,.35,.3];
  function render(){
    const S = VC.state, m = S.m;
    const stopTiles = new Set(S.routes.flatMap(r => r.stops));
    const tiles = S.tiles.map((tl, u) => ({k:tl.k, zone:tl.zone, st:tl.st, lv:tl.lv, style:tl.seedN, art:tl.art, avenue:tl.avenue, bridge:tl.bridge, rail:tl.rail, fac:tl.fac, inactive:tl.inactive || (tl.fac === 'terminal' && !tl.railLinked), opened:tl.fac === 'invest' && S.invest && S.invest.opened, stop:stopTiles.has(u), mix:tl.mix}));
    const ov = ui.overlay ? S.tiles.map((tl, u) => OVERLAYS[ui.overlay].f(tl, u, m)) : null;
    const preview = [];
    if (ui.pending && ui.pending.p.tiles) for (const [i, j] of ui.pending.p.tiles) preview.push({i, j, ok:ui.pending.p.ok && !(ui.pending.p.bad || []).some(b => b[0] === i && b[1] === j)});
    for (const s of ui.stops) preview.push({i:s % N, j:(s / N) | 0, ok:true});
    const routes = S.routes.map(r => ({path:r.path, color:r.crowded ? [1,.45,.3] : [1,.85,.2]}));
    if (ui.overlay === 'power' || ui.overlay === 'water') {   // show the utility network actually carrying supply along the roads
      const col = ui.overlay === 'power' ? [1,.86,.2] : [.35,.7,1], key = ui.overlay === 'power' ? 'pow' : 'wat';
      const supplied = new Set(); S.tiles.forEach((tl, u) => { if (tl[key] && m.access[u] >= 0) supplied.add(m.comp[m.access[u]]); });
      for (let u = 0; u < N * N; u++) { if (S.tiles[u].k !== 'r' || !supplied.has(m.comp[u])) continue; const i = u % N; if (i + 1 < N && S.tiles[u + 1].k === 'r') routes.push({path:[u, u + 1], color:col}); if (u + N < N * N && S.tiles[u + N].k === 'r') routes.push({path:[u, u + N], color:col}); } }
    if (ui.tool === 'route' && ui.stops.length > 1) { const p = VC.routePreview(ui.stops, ui.freq); if (p.path) routes.push({path:p.path, color:[.4,1,.6]}); }
    W.setCity({...grid, tiles, overlay:ov, preview, routes});
    flows();
  }
  // Moving traffic, buses and waiting passengers from the simulated loads
  function flows(){
    const S = VC.state, m = S.m, ov = [], ents = [], lights = [], rush = .6 + .6 * Math.max(0, Math.sin(ui.dayT * Math.PI * 2 - .4));
    const isR = (i, j) => i >= 0 && j >= 0 && i < N && j < N && S.tiles[j * N + i].k === 'r';
    for (const [uS, v] of Object.entries(m.vc || {})) { const u = +uS, i = u % N, j = (u / N) | 0, c = center(u), h = grid.ts * .48;
      const horiz = isR(i - 1, j) || isR(i + 1, j), vert = isR(i, j - 1) || isR(i, j + 1);
      const segs = []; if (horiz || !vert) segs.push([[c[0] - h, c[1]], [c[0] + h, c[1]]]); if (vert) segs.push([[c[0], c[1] - h], [c[0], c[1] + h]]);
      for (const [a, b] of segs) ov.push({a, b, color:v > 1 ? [1,.45,.3] : v > .7 ? [1,.85,.4] : [.98,.97,.92], flow:true, noLine:true, both:true, n:Math.min(5, Math.max(1, Math.round(v * 3 * rush))), speed:Math.max(.12, .9 - v * .4), size:2.6, y:W.ground + .016}); }
    for (const r of S.routes) { for (let k = 1; k < r.path.length; k++) { const a = center(r.path[k - 1]), b = center(r.path[k]); if (k % 3 === 0) ov.push({a, b, color:[1,.8,.15], flow:true, noLine:true, n:1, speed:.5 + r.freq * .04, size:4.8, y:W.ground + .02}); }
      const perStop = (r.riders || 0) / Math.max(1, r.stops.length); for (const s of r.stops) { const c = center(s); for (let q = 0; q < Math.min(8, Math.round(perStop / 6)); q++) ents.push({x:c[0] + ((q % 3) - 1) * grid.ts * .15, z:c[1] + grid.ts * .35, y:W.ground + .016, color:[.95,.9,.8], size:2.4}); } }
    for (let u = 0; u < N * N; u++) { const tl = S.tiles[u]; if (tl.k === 'z' && tl.st === 3 && tl.occ > .2 && (u * 7) % 3 === 0) { const c = center(u); lights.push([c[0], c[1], 2.4 + tl.lv * .8]); } if (tl.k === 'r' && (u % 3 === 0) && !tl.art) { const c = center(u); lights.push([c[0], c[1], 1.6]); } }
    // services come alive with the people they serve
    for (let u = 0; u < N * N; u++) { const tl = S.tiles[u]; if (tl.k !== 'f' || !tl.load || tl.inactive) continue; const c = center(u), day = ui.dayT > .28 && ui.dayT < .75; const n = Math.round(Math.min(8, tl.load * 8) * (day ? 1 : .3)); for (let q = 0; q < n; q++) ents.push({x:c[0] + Math.cos(q * 2.3) * grid.ts * .45, z:c[1] + Math.sin(q * 2.3) * grid.ts * .45, y:W.ground + .016, color:[[1,.9,.75],[.8,.9,1],[1,.8,.6]][q % 3], size:2.2}); }
    W.setOverlay(ov); W.setEntities(ents); W.setMissionLights(lights);
    const labs = [];
    for (let u = 0; u < N * N; u++) { const tl = S.tiles[u]; if (tl.k === 'a' && tl.name) { const c = center(u); labs.push({id:'ca' + u, text:tl.nameL ? t(tl.nameL) : tl.name, x:c[0], z:c[1], cls:'city-lab'}); } if (tl.k === 'f' && (tl.fac === 'invest' || tl.fac === 'terminal')) { const c = center(u); labs.push({id:'cf' + u, text:t(VC.FAC[tl.fac].name), x:c[0], z:c[1], cls:'city-lab sm'}); } }
    W.setDynamicLabels(labs);
    if (S.weather && S.weather.type === 'dust' && !G.profile.reduced) { const c = [grid.x0 + N * grid.ts / 2, grid.z0 + N * grid.ts / 2]; W.setHazard({x:c[0], z:c[1], r:N * grid.ts * .6, type:'dust', intensity:.55}); } else W.setHazard(null);
  }

  /* ================================= HUD ================================ */
  const month = mm => { const d = VC.dateOf(mm); return G.month(d.month, d.year); };
  function renderHUD(){
    const S = VC.state, m = S.m, d = VC.dateOf(), beyond = d.year > 2030;
    const bar = k => { const v = m.demand[k]; return `<button class="dem" data-dem="${k}" title="${esc(t('demandWhy'))}"><span>${k}</span><i class="${v >= 0 ? 'pos' : 'neg'}" style="--v:${Math.min(100, Math.abs(v))}%"></i></button>`; };
    $('#cTop').innerHTML = `<div class="ct-title"><b>🏗 ${esc(t('cityTitle'))}</b><small>${beyond ? esc(t('beyond2030')) + ' · ' : ''}${month(S.month)}</small></div>
      <div class="ct-speed">${[0,1,3].map(s => `<button class="${ui.speed === s ? 'on' : ''}" data-speed="${s}" aria-label="${s ? s + '×' : t('pause')}">${s ? s + '×' : 'Ⅱ'}</button>`).join('')}</div>
      <div class="ct-stat" title="${esc(t('creditsNote'))}"><small>${esc(t('budget'))}</small><b class="${S.budget < 0 ? 'neg' : ''}">◆ ${S.budget.toFixed(1)}</b><em class="${m.budget.net < 0 ? 'neg' : 'pos'}">${m.budget.net >= 0 ? '+' : ''}${m.budget.net}/${esc(t('mo'))}</em></div>
      <div class="ct-stat"><small>${esc(t('residents'))}</small><b>${m.pop.toLocaleString()}</b></div>
      <div class="ct-stat"><small>${esc(t('jobsLbl'))}</small><b>${m.jobs.toLocaleString()}</b></div>
      <div class="ct-stat"><small>${esc(t('commute'))}</small><b>${m.commute}′</b></div>
      <div class="ct-dem"><small>${esc(t('demand'))}</small>${bar('R')}${bar('C')}${bar('I')}</div>
      <div class="ct-stat"><small>${esc(t('weather'))}</small><b>${S.weather && S.weather.type === 'dust' ? '🌪' : (S.month % 12 >= 5 && S.month % 12 <= 7) ? '🔥' : '☀'}</b></div>
      <div class="ct-btns"><button class="icon-btn" data-panel="missions" title="${esc(t('cityMissions'))}">🏅</button><button class="icon-btn" data-panel="goals" title="${esc(t('goals'))}">🎯</button><button class="icon-btn" data-panel="budget" title="${esc(t('budget'))}">◆</button><button class="icon-btn" data-panel="overlays" title="${esc(t('overlays'))}">🗺</button><button class="icon-btn" id="cLens" title="Competitiveness">📊</button><button class="icon-btn" id="cKingdom" title="${esc(t('toKingdom'))}">🌍</button><button class="icon-btn" id="cExit" title="${esc(t('backMenu'))}">✕</button></div>`;
    $$('#cTop [data-speed]').forEach(b => b.onclick = () => { ui.speed = +b.dataset.speed; renderHUD(); });
    $$('#cTop [data-panel]').forEach(b => b.onclick = () => openPanel(ui.panel === b.dataset.panel ? null : b.dataset.panel));
    $$('#cTop [data-dem]').forEach(b => b.onclick = () => openPanel('demand:' + b.dataset.dem));
    $('#cLens').onclick = () => G.showLens('overview');
    $('#cExit').onclick = leaveCity;
    $('#cKingdom').onclick = () => { if (ui.kingdom) { ui.kingdom = false; const c = [grid.x0 + N * grid.ts / 2, grid.z0 + N * grid.ts / 2]; W.cam(.35, .82, 1.7, c[0], c[1], .5); } else { ui.kingdom = true; const K = W.place(45.3, 23.7); W.cam(.1, 1.05, 14, K[0], K[1], .45); } };
    renderTools(); renderMissionCard();
  }
  const TOOLS = [
    {id:'select', icon:'👆'}, {id:'road', icon:'🛣', cost:VC.COST.road}, {id:'avenue', icon:'🛣️', cost:VC.COST.avenue, cap:'avenue'}, {id:'remove', icon:'🧹'},
    {id:'rail', icon:'🛤', cost:VC.COST.rail},
    {id:'zoneR', icon:'🏠', dens:true}, {id:'zoneC', icon:'🏬', dens:true}, {id:'zoneI', icon:'🏭', dens:true}, {id:'zoneT', icon:'🏨', dens:true}, {id:'zoneM', icon:'🏘', dens:true, cap:'mixed'},
    {id:'gas', fac:1}, {id:'solar', fac:1}, {id:'battery', fac:1}, {id:'pump', fac:1}, {id:'tower', fac:1},
    {id:'school', fac:1}, {id:'training', fac:1}, {id:'clinic', fac:1}, {id:'park', fac:1}, {id:'emergency', fac:1}, {id:'digital', fac:1, cap:'digital'}, {id:'terminal', fac:1}, {id:'invest', fac:1},
    {id:'route', icon:'🚌'}
  ];
  function renderTools(){
    const S = VC.state;
    $('#cTools').innerHTML = TOOLS.map(tl => { const f = VC.FAC[tl.id], locked = tl.cap && !S.caps.includes(tl.cap);
      return `<button class="ctool ${ui.tool === tl.id ? 'on' : ''} ${locked ? 'locked' : ''}" data-tool="${tl.id}" title="${esc(f ? t(f.name) : t('tool_' + tl.id))}"><span>${locked ? '🔒' : f ? f.icon : tl.icon}</span><small>${esc(f ? t(f.name) : t('tool_' + tl.id))}</small>${f ? `<em>◆${f.cost}</em>` : tl.cost ? `<em>◆${tl.cost}/▢</em>` : ''}</button>`; }).join('')
      + (['zoneR','zoneC','zoneI','zoneT','zoneM'].includes(ui.tool) ? `<div class="dens">${[1,2,3].map(d => `<button class="${ui.density === d ? 'on' : ''} ${(d === 2 && !S.caps.includes('medium')) || (d === 3 && !S.caps.includes('high')) ? 'locked' : ''}" data-dens="${d}">${esc(t('dens' + d))}</button>`).join('')}</div>` : '')
      + `<button class="ctool" id="cUndo" ${VC.canUndo() ? '' : 'disabled'}><span>↶</span><small>${esc(t('undo'))}</small></button>`;
    $$('#cTools [data-tool]').forEach(b => b.onclick = () => selectTool(b.dataset.tool));
    $$('#cTools [data-dens]').forEach(b => b.onclick = () => { ui.density = +b.dataset.dens; renderTools(); });
    $('#cUndo').onclick = () => { if (VC.doUndo()) { G.sfx('click'); say(t('undone'), 'info'); render(); renderHUD(); refreshPanel(); } };
  }
  function selectTool(id){ ui.tool = id; ui.pending = null; ui.stops = []; $('#cConfirm').classList.add('hidden'); G.sfx('click');
    if (id === 'route') say(t('routeHelp'), 'info'); else if (id !== 'select') say(t('toolHelp_' + (VC.FAC[id] ? 'fac' : id)), 'info');
    render(); renderTools(); }

  /* ============================== INPUT ================================= */
  function onDrag(phase, x, z){
    if (!ui.active) return false;
    const tt = x != null ? tileAt(x, z) : null;
    if (phase === 'down') {
      if (!tt) return false;
      if (ui.tool === 'select') { inspect(tt); return false; }          // let a plain click orbit / select
      if (ui.tool === 'route') { addStop(tt); return true; }
      ui.dragA = tt; ui.dragB = tt; updatePreview(); return true;
    }
    if (phase === 'move' && ui.dragA && tt) { if (VC.FAC[ui.tool]) ui.dragA = tt; ui.dragB = tt; updatePreview(); return; }
    if (phase === 'up' && ui.dragA) { if (tt) ui.dragB = VC.FAC[ui.tool] ? ui.dragA : tt; updatePreview(); ui.dragA = null; if (ui.pending && ui.pending.p.ok && ui.quick) confirmPending(); else showConfirm(); return; }
    if (phase === 'cancel') { ui.dragA = null; }
  }
  let hoverTile = null;
  function onHover(x, z){ if (!ui.active || !VC.FAC[ui.tool]) return; const tt = tileAt(x, z); if (!tt || (hoverTile && tt[0] === hoverTile[0] && tt[1] === hoverTile[1])) return; hoverTile = tt; ui.pending = {tool:ui.tool, a:tt, b:tt, p:VC.preview(ui.tool, tt, tt)}; render(); }
  function updatePreview(){ const a = ui.dragA || ui.pending && ui.pending.a, b = ui.dragB; ui.pending = {tool:ui.tool, a:ui.dragA || a, b, p:VC.preview(ui.tool, ui.dragA || a, b, {density:ui.density})}; if (!ui.dragA) ui.pending.a = a; render(); }
  function showConfirm(){
    const P = ui.pending; if (!P) return; const p = P.p, el = $('#cConfirm');
    const facts = [];
    if (p.cost != null) facts.push(`${esc(t('cost'))}: ◆ ${p.cost}`);
    if (p.newTiles) facts.push(`${p.newTiles} ${esc(t('parcelsLbl'))}`); if (p.intersections) facts.push(`${p.intersections} ${esc(t('intersections'))}`);
    if (p.tiles && P.tool.startsWith('zone')) facts.push(`${p.tiles.length} ${esc(t('parcelsLbl'))}`);
    if (p.upkeep) facts.push(`${esc(t('upkeep'))} ◆${p.upkeep}/${esc(t('mo'))}`);
    if (P.tool === 'road' && p.newTiles) facts.push(`${esc(t('upkeep'))} ◆${(p.newTiles * .01).toFixed(2)}/${esc(t('mo'))}`);
    if (p.est) { const e = p.est; facts.push(`${esc(t('atFull'))}: ${e.people ? `+${e.people} ${esc(t('residents'))}` : ''}${e.people && e.jobs ? ' · ' : ''}${e.jobs ? `+${e.jobs} ${esc(t('jobsLbl'))}` : ''}`);
      facts.push(`⚡ ${e.power} / ${esc(t('spare'))} ${e.spareP}${e.power > e.spareP ? ' ⚠' : ''} · 💧 ${e.water} / ${esc(t('spare'))} ${e.spareW}${e.water > e.spareW ? ' ⚠' : ''}${e.trips ? ` · 🚗 +${e.trips} ${esc(t('peakTrips'))}` : ''}`); }
    el.innerHTML = `<b>${esc(t(VC.FAC[P.tool] ? VC.FAC[P.tool].name : 'tool_' + P.tool))}</b><p>${facts.join('<br>')}</p>${p.info ? `<p class="${/Not connected|no road|No road|غير متصل|بلا/.test(t(p.info)) ? 'warnTxt' : 'okTxt'}">${esc(t(p.info))}</p>` : ''}${p.why ? `<p class="warnTxt">${esc(t(p.why))}</p>` : ''}
      <div class="row-btns"><button class="primary sm" id="cOk" ${p.ok ? '' : 'disabled'}>${esc(t('build'))} ⏎</button><button class="secondary sm" id="cNo">${esc(t('cancel'))}</button><label class="qb"><input type="checkbox" id="cQuick" ${ui.quick ? 'checked' : ''}/> ${esc(t('quickBuild'))}</label></div>`;
    el.classList.remove('hidden');
    $('#cOk').onclick = confirmPending; $('#cNo').onclick = cancelPending; $('#cQuick').onchange = e => { ui.quick = e.target.checked; };
  }
  function confirmPending(){ const P = ui.pending; if (!P) return; const r = VC.apply(P.tool, P.a, P.b, {density:ui.density});
    if (!r.ok) { G.sfx('warn'); say(t(r.why || 'cannotBuild'), 'warn'); } else { G.sfx('commit'); const c = center(VC.idx(P.a[0], P.a[1])); if (VC.FAC[P.tool] && !G.profile.reduced) W.burst(c[0], c[1]); }
    ui.pending = null; $('#cConfirm').classList.add('hidden'); render(); renderHUD(); refreshPanel(); save(); }
  function cancelPending(){ ui.pending = null; $('#cConfirm').classList.add('hidden'); render(); }
  function addStop(tt){ const u = VC.idx(tt[0], tt[1]); if (VC.state.tiles[u].k !== 'r') { G.sfx('warn'); say(t('stopOnRoad'), 'warn'); return; } ui.stops.push(u); routePanel(); render(); }
  function routePanel(){
    const p = VC.routePreview(ui.stops, ui.freq), el = $('#cConfirm');
    el.innerHTML = `<b>🚌 ${esc(t('tool_route'))}</b><p>${ui.stops.length} ${esc(t('stops'))}${p.path ? ` · ${p.path.length} ${esc(t('parcelsLbl'))} · ${esc(t('cost'))} ◆${p.cost} · ${esc(t('upkeep'))} ◆${p.upkeep}/${esc(t('mo'))}` : ''}</p>${p.why && ui.stops.length > 1 ? `<p class="warnTxt">${esc(t(p.why))}</p>` : ''}
      <label class="freq">${esc(t('frequency'))} <select id="cFreq">${[2,4,6,8,12].map(f => `<option value="${f}" ${f === ui.freq ? 'selected' : ''} ${f > 8 && !VC.state.caps.includes('express') ? 'disabled' : ''}>${f}/${esc(t('hour'))}</option>`).join('')}</select></label>
      <div class="row-btns"><button class="primary sm" id="cRouteOk" ${p.ok ? '' : 'disabled'}>${esc(t('finishRoute'))}</button><button class="secondary sm" id="cRouteUndo" ${ui.stops.length ? '' : 'disabled'}>${esc(t('removeLastStop'))}</button><button class="link" id="cRouteNo">${esc(t('cancel'))}</button></div>`;
    el.classList.remove('hidden');
    $('#cFreq').onchange = e => { ui.freq = +e.target.value; routePanel(); };
    $('#cRouteOk').onclick = () => { const r = VC.addRoute(ui.stops, ui.freq); if (!r.ok) { say(t(r.why), 'warn'); return; } G.sfx('commit'); say(t('routeCreated'), 'good'); ui.stops = []; el.classList.add('hidden'); render(); renderHUD(); save(); };
    $('#cRouteUndo').onclick = () => { ui.stops.pop(); routePanel(); render(); };
    $('#cRouteNo').onclick = () => { ui.stops = []; el.classList.add('hidden'); render(); };
  }

  /* ============================ PANELS ================================== */
  function openPanel(which){ ui.panel = which; refreshPanel(); }
  function refreshPanel(){
    const el = $('#cPanel'), S = VC.state, m = S.m;
    if (!ui.panel) { el.classList.add('hidden'); return; }
    let h = '';
    if (ui.panel === 'inspect' && ui.sel) h = inspectHTML(ui.sel);
    else if (ui.panel.startsWith('demand:')) { const k = ui.panel.split(':')[1]; h = `<h3>${esc(t('demand'))} · ${k === 'R' ? esc(t('homes')) : k === 'C' ? esc(t('business')) : esc(t('industry'))}: ${Math.round(m.demand[k])}</h3><p class="hint">${esc(t('demandExplain'))}</p><ul class="causes">${m.demandWhy[k].map(c => `<li class="${c.v >= 0 ? 'pos' : 'neg'}"><span>${esc(t(c.label))}</span><em>${c.v >= 0 ? '+' : ''}${c.v.toFixed(1)}</em></li>`).join('')}</ul>`; }
    else if (ui.panel === 'budget') h = budgetHTML();
    else if (ui.panel === 'missions') h = missionsHTML();
    else if (ui.panel === 'goals') h = goalsHTML();
    else if (ui.panel === 'overlays') h = `<h3>🗺 ${esc(t('overlays'))}</h3><div class="ovl">${[null, ...Object.keys(OVERLAYS)].map(k => `<button class="${ui.overlay === k ? 'on' : ''}" data-ov="${k || ''}">${k ? OVERLAYS[k].icon + ' ' + esc(t('ov_' + k)) : esc(t('ovNone'))}</button>`).join('')}</div>${ui.overlay ? `<p class="legend"><b>${esc(t('ov_' + ui.overlay))}</b> — ${esc(t('ovWhy_' + ui.overlay))}</p>` : ''}`;
    el.innerHTML = `<button class="icon-btn close" id="cpClose">✕</button>` + h; el.classList.remove('hidden');
    $('#cpClose').onclick = () => { ui.panel = null; el.classList.add('hidden'); };
    $$('#cPanel [data-ov]').forEach(b => b.onclick = () => { ui.overlay = b.dataset.ov || null; render(); refreshPanel(); });
    $$('#cPanel [data-tax]').forEach(i => i.oninput = () => { VC.setTax(i.dataset.tax, +i.value); VC.compute(); refreshPanel(); renderHUD(); });
    $$('#cPanel [data-fund]').forEach(i => i.onchange = () => { VC.setFund(i.dataset.fund, +i.value / 100); refreshPanel(); renderHUD(); render(); });
    $$('#cPanel [data-cm]').forEach(b => b.onclick = () => { const r = VC.startMission(b.dataset.cm); if (!r.ok) { say(t(r.why), 'warn'); return; } G.sfx('commit'); ui.panel = null; refreshPanel(); render(); renderHUD(); save(); });
    const ab = $('#cmAbandon'); if (ab) ab.onclick = () => { VC.abandonMission(); renderHUD(); refreshPanel(); save(); };
    const cons = $('#cConserve'); if (cons) cons.onchange = e => { VC.setPolicy('conserve', e.target.checked); refreshPanel(); renderHUD(); };
    const loan = $('#cLoan'); if (loan) loan.onclick = () => { const r = VC.takeLoan(); say(t(r.ok ? 'loanTaken' : r.why), r.ok ? 'info' : 'warn'); refreshPanel(); renderHUD(); };
    $$('#cPanel [data-rfreq]').forEach(s => s.onchange = () => { if (!VC.setRouteFreq(+s.dataset.rfreq, +s.value)) say(t('expressLocked'), 'warn'); render(); refreshPanel(); renderHUD(); });
    bindOffers('#cPanel');
    $$('#cPanel [data-rdel]').forEach(b => b.onclick = () => { VC.removeRoute(+b.dataset.rdel); render(); refreshPanel(); renderHUD(); });
  }
  function inspect(tt){ ui.sel = VC.idx(tt[0], tt[1]); ui.panel = 'inspect'; refreshPanel(); }
  const STAGE = st => t(['stage0','stage1','stage2','stage3','stage4'][st] || 'stage0');
  function inspectHTML(u){
    const S = VC.state, tl = S.tiles[u], m = S.m;
    const tick = ok => ok ? '✅' : '⛔';
    if (tl.k === 'z') { const needs = tl.needs || [], first = needs.find(n => !n.ok && n.k !== 'upgrade');
      return `<h3>${tl.zone === 'R' ? '🏠 ' + esc(t('homes')) : tl.zone === 'C' ? '🏬 ' + esc(t('business')) : '🏭 ' + esc(t('industry'))} · ${esc(t('dens' + tl.den))}</h3>
        <p><b>${esc(STAGE(tl.st))}</b>${tl.st >= 3 ? ` · ${esc(t('level'))} ${tl.lv} · ${Math.round(tl.cap * tl.occ)}/${tl.cap} ${tl.zone === 'R' ? esc(t('residents')) : esc(t('jobsLbl'))}` : ''}</p>
        ${first ? `<p class="why">${esc(t('whyNot'))}: <b>${esc(t(first.why))}</b></p>` : tl.st < 3 ? `<p class="okTxt">${esc(t('readyToGrow'))}</p>` : ''}
        <ul class="needs">${needs.map(n => `<li>${tick(n.ok)} ${esc(t('need_' + n.k))}${!n.ok && n.why ? ` — <small>${esc(t(n.why))}</small>` : ''}</li>`).join('')}</ul>
        ${tl.st === 2 ? `<p>⏳ ${esc(t('buildLeft', {n:Math.max(1, tl.build || 1)}))}</p>` : ''}
        ${tl.zone === 'M' && tl.st >= 3 ? `<p>${esc(t('mixShare', {h:Math.round((tl.mix ?? .5) * 100), s:Math.round((1 - (tl.mix ?? .5)) * 100)}))}</p>` : ''}
        ${['C','T','M'].includes(tl.zone) ? `<p>${esc(t('customers'))}: <b>${m.pop.toLocaleString()}</b> ${esc(t('residentsNearby'))}${tl.zone === 'T' ? ' · ' + esc(t('visitorsNote')) : ''}</p>` : ''}
        ${['C','I','T'].includes(tl.zone) ? `<p>${esc(t('workforce'))}: <b>${Math.round(m.labor * m.jobAccess)}</b> ${esc(t('workersReach'))}</p>` : ''}
        ${tl.zone === 'I' ? `<p>${tl.byRail ? '🚆 ' + esc(t('freightRail')) : '🚚 ' + esc(t('freightTruck'))}</p>` : ''}
        <p class="facts">${esc(t('landValue'))} <b>${tl.lv0 || 0}</b> · ${esc(t('transitAccess'))} ${tick(tl.transit)} · 🏫${tick(tl.cov && tl.cov.edu)} 🏥${tick(tl.cov && tl.cov.health)} 🌳${tick(tl.cov && tl.cov.park)} 🚒${tick(tl.cov && tl.cov.safety)}</p>
        <p class="hint">${esc(t('demand'))} ${tl.zone}: ${Math.round(m.demand[tl.zone])}</p>`; }
    if (tl.k === 'r') { const v = m.vc[u] || 0, rs = S.routes.filter(r => r.path.includes(u));
      return `<h3>🛣 ${esc(t(tl.art ? 'arterial' : tl.avenue ? 'avenue' : 'street'))}${tl.bridge ? ' · ' + esc(t('bridge')) : ''}</h3><p>${esc(t('trafficLoad'))}: <b>${Math.round(v * 100)}%</b> ${esc(t('ofCapacity'))} (${tl.cap})</p>
        <p class="hint">${m.compGate[m.comp[u]] ? esc(t('connectedNet')) : esc(t('isolatedNet'))}</p>
        ${rs.map(r => `<div class="route-row"><b>🚌 ${esc(t('route'))} ${r.id}</b> · ${r.riders || 0} ${esc(t('riders'))}${r.crowded ? ' · <span class="warnTxt">' + esc(t('crowded')) + '</span>' : ''}<br><label>${esc(t('frequency'))} <select data-rfreq="${r.id}">${[2,4,6,8,12].map(f => `<option ${f === r.freq ? 'selected' : ''}>${f}</option>`).join('')}</select>/${esc(t('hour'))}</label> <button class="link" data-rdel="${r.id}">${esc(t('removeRoute'))}</button></div>`).join('')}`; }
    if (tl.k === 'x') return `<h3>🛤 ${esc(t('tool_rail'))}</h3><p class="hint">${m.railEdgeC[m.railComp[u]] ? esc(t('railLinked')) : esc(t('railNotLinked'))}</p>`;
    if (tl.k === 'f' && tl.fac === 'invest') { const p = m.readinessParts || {}, S2 = VC.state;
      return `<h3>💠 ${esc(t(VC.FAC.invest.name))}</h3><p class="hint">${esc(t('fictionalNote'))}</p><p>${esc(t('readiness'))}: <b>${m.readiness ?? 0}</b> / 70</p>
        <ul class="causes">${[['access',30],['utilities',20],['services',20],['talent',15],['confidence',15]].map(([k, w]) => `<li><span>${esc(t('rp_' + k))} (${w}%)</span><em>${p[k] ?? 0}</em></li>`).join('')}</ul>
        ${S2.invest && S2.invest.offer ? `<p class="okTxt">${esc(t(S2.invest.opened ? 'complexOpen' : 'complexBuilding'))}</p>` : (m.readiness || 0) >= 70 ? offersHTML() : `<p class="hint">${esc(t('offersAt70'))}</p>`}`; }
    if (tl.k === 'f') { const f = VC.FAC[tl.fac];
      return `<h3>${f.icon} ${esc(t(f.name))}</h3>${tl.fac === 'terminal' ? `<p class="${tl.railLinked ? 'okTxt' : 'warnTxt'}">${esc(t(tl.railLinked ? 'terminalLinked' : 'terminalNotLinked'))}</p>` : ''}${tl.inactive ? `<p class="warnTxt">${esc(t('facInactive'))}</p>` : ''}${f.serve ? `<p>${esc(t('capacityUsed'))}: <b>${Math.round((tl.load || 0) * 100)}%</b>${tl.full ? ' · <span class="warnTxt">' + esc(t('full')) + '</span>' : ''}</p>` : ''}
        ${f.power || f.solar ? `<p>${esc(t('powerSupply'))}: ${m.power.used.toFixed(0)}/${m.power.supply.toFixed(0)}</p>` : ''}${f.water ? `<p>${esc(t('waterSupply'))}: ${m.water.used.toFixed(0)}/${m.water.supply.toFixed(0)}</p>` : ''}<p class="hint">${esc(t('upkeep'))} ◆${f.upkeep}/${esc(t('mo'))}</p>`; }
    if (tl.k === 'a') { const c = S.tiles.find(x => x.k === 'a' && x.anchor === tl.anchor && x.name); return `<h3>⭐ ${esc(c ? c.name : '')}</h3><p class="hint">${esc(t('anchorNote'))}</p>`; }
    if (tl.k === 'w') return `<h3>〰 ${esc(t('wadi'))}</h3><p class="hint">${esc(t('wadiNote'))}</p>`;
    return `<h3>${esc(t('emptyParcel'))}</h3><p class="hint">${esc(t('emptyNote'))}</p>`;
  }
  function budgetHTML(){
    const S = VC.state, b = S.m.budget;
    return `<h3>◆ ${esc(t('cityBudget'))}</h3><p class="hint">${esc(t('creditsNote'))}</p>
      <table class="btable"><tr><td>${esc(t('taxIncome'))}</td><td class="pos">+${b.income}</td></tr><tr><td>${esc(t('upkeep'))}</td><td class="neg">−${b.upkeep}</td></tr><tr><td>${esc(t('busOps'))}</td><td class="neg">−${b.bus}</td></tr>${b.loan ? `<tr><td>${esc(t('loanPay'))}</td><td class="neg">−${b.loan}</td></tr>` : ''}<tr class="tot"><td>${esc(t('netMonth'))}</td><td class="${b.net >= 0 ? 'pos' : 'neg'}">${b.net >= 0 ? '+' : ''}${b.net}</td></tr></table>
      <h4>${esc(t('taxes'))}</h4>${['R','C','I'].map(z => `<label class="slider">${z} <input type="range" min="0" max="15" value="${S.tax[z]}" data-tax="${z}"/> <b>${S.tax[z]}%</b></label>`).join('')}
      <p class="hint">${esc(t('taxHint'))}</p>
      <h4>${esc(t('funding'))}</h4>${['edu','health','park','safety','train'].map(k => `<label class="slider">${esc(t('fund_' + k))} <input type="range" min="50" max="130" step="10" value="${Math.round(S.fund[k] * 100)}" data-fund="${k}"/> <b>${Math.round(S.fund[k] * 100)}%</b></label>`).join('')}
      <h4>${esc(t('policies'))}</h4><label class="qb"><input type="checkbox" id="cConserve" ${S.policy && S.policy.conserve ? 'checked' : ''}/> ${esc(t('conserve'))}</label>
      <h4>${esc(t('financing'))}</h4>${S.loan ? `<p>${esc(t('loanActive', {n:S.loan.left, p:S.loan.pay}))}</p>` : `<button class="secondary sm" id="cLoan">${esc(t('takeLoan'))}</button>`}`;
  }
  function goalsHTML(){
    const S = VC.state;
    return `<h3>🎯 ${esc(t('goals'))}</h3><h4>${esc(t('challengesLbl'))}</h4><ul class="goals">${S.challenges.filter(c => !c.doneAt).map(c => { const d = VC.CHALLENGES.find(x => x.id === c.id); return `<li class="ch"><b>${esc(t(d.text))}</b><small>${esc(t(d.hint))}</small></li>`; }).join('') || `<li class="hint">${esc(t('noChallenges'))}</li>`}</ul>
      <h4>${esc(t('milestonesLbl'))}</h4><ul class="goals">${VC.MILESTONES.map(ms => `<li class="${S.goals[ms.id] != null ? 'done' : ''}">${S.goals[ms.id] != null ? '✅' : '○'} ${esc(t(ms.text))}${ms.cap ? ` <small>→ ${esc(t(VC.CAPS[ms.cap].name))}</small>` : ''}</li>`).join('')}</ul>
      <h4>${esc(t('capabilitiesLbl'))}</h4><ul class="goals">${Object.entries(VC.CAPS).map(([k, c]) => `<li class="${S.caps.includes(k) ? 'done' : ''}">${S.caps.includes(k) ? '🔓' : '🔒'} ${esc(t(c.name))} <small>${S.caps.includes(k) ? '' : esc(t(c.how))}</small></li>`).join('')}</ul>
      <h4>${esc(t('cityScenario'))} <span class="badge sim">${esc(t('simulated'))}</span></h4><ul class="causes">${VC.factorDeltas().map(d => `<li class="${d.delta >= 0 ? 'pos' : 'neg'}"><span>${esc(t(window.VisionCompetitiveness.OBSERVED.FACTORS.find(f => f.id === d.factor).name))}: ${esc(t(d.why))}</span><em>${d.delta > 0 ? '+' : ''}${d.delta}</em></li>`).join('') || `<li class="hint">${esc(t('cityScenarioEmpty'))}</li>`}</ul>`;
  }

  function offersHTML(){ return `<div class="offers"><p class="hint">${esc(t('offersFictional'))}</p><button class="primary sm" data-offer="A">💠 ${esc(t('offerA_city'))}</button><button class="secondary sm" data-offer="B">🔷 ${esc(t('offerB_city'))}</button></div>`; }
  function bindOffers(root){ $$(root + ' [data-offer]').forEach(b => b.onclick = () => { const r = VC.acceptOffer(b.dataset.offer); if (!r.ok) { say(t(r.why || 'cannotBuild'), 'warn'); return; } G.sfx('commit'); say(t('offerAccepted'), 'good'); render(); renderHUD(); refreshPanel(); save(); }); }
  function missionsHTML(){ const S = VC.state, act = S.mission && !S.mission.done;
    return `<h3>🏅 ${esc(t('cityMissions'))}</h3><p class="hint">${esc(t('cityMissionsNote'))}</p>` + VC.CMISSIONS.map(d => { const rec = G.profile.missions['city:' + d.id] || {};
      return `<div class="cm-card"><div><span class="arc-tag sm">${d.arc}</span> <b>${esc(t(d.title))}</b> ${rec.medal ? `<span class="medal-chip ${rec.medal}">${esc(t(rec.medal))}</span>` : ''}</div><p>${esc(t(d.brief))}</p><small>${d.months} ${esc(t('months'))} · +◆${d.grant} · ${esc(t('reward'))}: ${esc(t(VC.CAPS[d.cap].name))}</small>
        ${act ? '' : `<button class="primary sm" data-cm="${d.id}">${esc(t(rec.medal ? 'replay' : 'startMission'))}</button>`}</div>`; }).join('') + (act ? `<button class="secondary sm" id="cmAbandon">${esc(t('abandonMission'))}</button>` : ''); }
  function renderMissionCard(){ const el = $('#cMission'), st = VC.missionStatus();
    if (!st || st.mission.done) { el.classList.add('hidden'); return; }
    el.innerHTML = `<div class="cm-head"><span class="arc-tag sm">${st.def.arc}</span> <b>${esc(t(st.def.title))}</b><small>${st.left} ${esc(t('monthsLeft'))}</small></div>
      <ul class="needs">${st.checks.map(c => `<li>${c.ok ? '✅' : '⬜'} ${esc(t(c.label))}${c.v != null ? ` <b>${esc(String(c.v))}</b>` : ''}</li>`).join('')}</ul>
      ${st.def.id === 'cD' && VC.state.invest && !VC.state.invest.offer && (VC.state.m.readiness || 0) >= 70 ? offersHTML() : ''}<p class="hint">${esc(t(st.def.hint))}</p>`;
    el.classList.remove('hidden'); bindOffers('#cMission'); }
  function showCityResult(r, id){
    const d = VC.CMISSIONS.find(x => x.id === id), el = $('#cResult'), b = r.before, a = r.after, rec = G.profile.missions['city:' + id] || {};
    if (r.medal) { const better = !rec.medal || (rec.medal === 'silver' && r.medal === 'gold'); if (better || !rec.compDeltas) { rec.medal = r.medal; rec.compDeltas = r.deltas.map(x => ({factor:x.factor, delta:x.delta, why:x.why})); }
      if (!rec.medal || better) G.profile.points += r.points; else G.profile.points += 1; G.profile.missions['city:' + id] = rec; G.saveProfile(); }
    const diff = (k, lbl, unit = '') => a[k] !== b[k] ? `<li><span>${esc(t(lbl))}</span><b>${b[k] ?? '—'}${unit} → ${a[k] ?? '—'}${unit}</b></li>` : '';
    const facDiff = Object.keys({...b.fac, ...a.fac}).filter(k => (a.fac[k] || 0) !== (b.fac[k] || 0)).map(k => `${VC.FAC[k].icon} ${t(VC.FAC[k].name)} +${(a.fac[k] || 0) - (b.fac[k] || 0)}`);
    const built = [a.roads > b.roads ? `🛣 ${a.roads - b.roads} ${t('roadParcels')}` : '', a.railTiles > b.railTiles ? `🛤 ${a.railTiles - b.railTiles} ${t('railParcels')}` : '', a.routes > b.routes ? `🚌 ${a.routes - b.routes} ${t('busRoutes')}` : '', ...facDiff].filter(Boolean);
    const next = VC.CMISSIONS[VC.CMISSIONS.findIndex(x => x.id === id) + 1];
    el.innerHTML = `<div class="sheet-card glass wide"><div class="sheet-head"><b>🏅 ${esc(t(d.title))} — ${esc(t(r.medal || 'notYet'))}</b><button class="icon-btn" id="crClose">✕</button></div>
      ${r.critical && r.medal ? `<p class="warnTxt">${esc(t('criticalCap'))}</p>` : ''}
      <div class="cmp-grid">
        <section><h4>1 · ${esc(t('cmpBuilt'))}</h4><ul class="plain">${built.map(x => `<li>${esc(x)}</li>`).join('') || `<li class="hint">—</li>`}</ul></section>
        <section><h4>2 · ${esc(t('cmpChanged'))}</h4><ul class="causes">${diff('pop','residents')}${diff('jobs','jobsLbl')}${diff('commute','commute',"′")}${diff('riders','riders')}${diff('nearStop','nearStopPct','%')}${diff('renew','solarShare','%')}${diff('rail','railShare','%')}${diff('readiness','readiness')}${diff('skilled','skilledReach')}${diff('budget','budget')}</ul></section>
        <section><h4>3 · ${esc(t('cmpFactors'))} <span class="badge sim">${esc(t('simulated'))}</span></h4><ul class="causes">${r.deltas.map(x => `<li class="${x.delta >= 0 ? 'pos' : 'neg'}"><span>${esc(t(window.VisionCompetitiveness.OBSERVED.FACTORS.find(f => f.id === x.factor).name))}: ${esc(t(x.why))}</span><em>${x.delta > 0 ? '+' : ''}${x.delta}</em></li>`).join('') || `<li class="hint">${esc(t('noFactorChange'))}</li>`}</ul></section>
        <section><h4>4 · ${esc(t('cmpEarned'))}</h4><p>${r.medal ? `${esc(t(r.medal))} · ✦ +${r.points}${r.cap ? ` · 🔓 ${esc(t(VC.CAPS[r.cap].name))}` : ''}` : esc(t('noReward'))}</p></section>
        <section><h4>5 · ${esc(t('cmpNext'))}</h4><p>${esc(t(r.medal ? (next ? next.title : 'allCityMissions') : r.hint))}</p></section>
      </div><div class="row-btns"><button class="primary" id="crOk">${esc(t('continueBtn'))}</button><button class="secondary" id="crLens">📊 ${esc(t('openLens'))}</button></div></div>`;
    el.classList.remove('hidden');
    $('#crClose').onclick = $('#crOk').onclick = () => el.classList.add('hidden');
    $('#crLens').onclick = () => { el.classList.add('hidden'); G.showLens('factors'); };
    if (r.medal && !G.profile.reduced) { const c = [grid.x0 + N * grid.ts / 2, grid.z0 + N * grid.ts / 2], K = W.place(45.3, 23.7); W.burst(c[0], c[1]); W.cam(.2, 1.0, 6, (c[0] + K[0]) / 2, (c[1] + K[1]) / 2, .5); setTimeout(() => ui.active && W.cam(.35, .82, 1.9, c[0], c[1], .5), 3500); }
  }

  /* ============================== MESSAGES ============================== */
  function say(text, kind){ const el = $('#cTicker'); el.textContent = text; el.className = 'cticker ' + (kind || ''); clearTimeout(say.t); say.t = setTimeout(() => el.classList.add('fade'), 7000); el.classList.remove('fade'); }

  /* ================================= LOOP =============================== */
  function loop(now){
    const dt = Math.min(250, now - ui.last); ui.last = now;
    if (ui.active) {
      ui.dayT = (ui.dayT + dt / 1000 / (ui.speed ? 24 / ui.speed : 60)) % 1;
      if (!G.profile.reduced) W.setNight(Math.max(0, Math.cos((ui.dayT - .02) * Math.PI * 2)) * .6 * (ui.dayT > .7 || ui.dayT < .3 ? 1 : 0));
      if (ui.speed > 0 && $('#lensPanel').classList.contains('hidden')) {
        ui.acc += dt * ui.speed;
        if (ui.acc >= 2600) { ui.acc = 0; const ev = VC.tick(); handleEvents(ev); render(); renderHUD(); if (ui.panel) refreshPanel(); if (VC.state.month % 1 === 0) save(); }
      }
      if ((ui.flowT = (ui.flowT || 0) + dt) > 1500) { ui.flowT = 0; flows(); }
    }
    requestAnimationFrame(loop);
  }
  function handleEvents(ev){
    let pause = false;
    for (const e of ev) {
      if (e.type === 'milestone') { say('🏅 ' + t(e.text), 'good'); G.sfx('medal'); if (!G.profile.reduced) { const c = [grid.x0 + N * grid.ts / 2, grid.z0 + N * grid.ts / 2]; W.burst(c[0], c[1]); } }
      if (e.type === 'challenge') { say('🎯 ' + t(e.text) + ' — ' + t(e.hint), 'challenge'); G.sfx('warn'); }
      if (e.type === 'challengeDone') { G.profile.points += e.reward; G.saveProfile(); say('✅ ' + t(e.text) + ' · ✦ +' + e.reward, 'good'); G.sfx('complete'); }
      if (e.type === 'warn') say(t(e.text), 'warn');
      if (e.type === 'weather' && e.text) say((e.w === 'dust' ? '🌪 ' : '🔥 ') + t(e.text), 'challenge');
      if (e.type === 'cityMission') { G.sfx(e.result.medal ? 'medal' : 'warn'); showCityResult(e.result, e.id); }
      if (e.pause) pause = true;
    }
    if (pause) { ui.speed = 0; say(($('#cTicker').textContent || '') + ' · ' + t('autoPaused'), 'challenge'); }
    if (VC.dateOf().year > 2030 && !ui.beyondShown) { ui.beyondShown = true; say(t('beyondEntered'), 'info'); }
  }
  addEventListener('keydown', e => {
    if (!ui.active || (e.target.closest && e.target.closest('input,select,textarea'))) return;
    if (e.key === 'Enter' && ui.pending && !$('#cConfirm').classList.contains('hidden') && ui.tool !== 'route') confirmPending();
    if (e.key === 'Escape') { if (ui.pending || ui.stops.length) { cancelPending(); ui.stops = []; $('#cConfirm').classList.add('hidden'); render(); } else selectTool('select'); }
    if (e.code === 'Space') { e.preventDefault(); ui.speed = ui.speed ? 0 : 1; renderHUD(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { if (VC.doUndo()) { render(); renderHUD(); } }
  });
  G.cityStep = n => { for (let k = 0; k < n; k++) handleEvents(VC.tick()); render(); renderHUD(); save(); };   // advances months through the same event handling as the game loop
  G.cityUI = ui; G.cityRender = () => { render(); renderHUD(); };
  requestAnimationFrame(loop);
})();
