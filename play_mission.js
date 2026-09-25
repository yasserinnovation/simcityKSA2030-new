// Vision Nexus 2030 — mission HUD: decisions on the map, turns, transformation & victory moments, results, What If?.
(() => {
  'use strict';
  const G = window.VNP; if (!G) return;
  const {W, VM, $, $$, esc} = G, t = (...a) => G.t(...a);
  const S = () => VM.state;
  const ui = {sel:null, target:null, fc:null, busy:false, lens:false, coach:0, whatIf:null, runMeta:null, hazardAnim:null};
  const fmt = (v, d=0) => (Math.round(v * 10**d) / 10**d).toFixed(d);
  const sgn = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v), Math.abs(v) < 10 ? 1 : 0);
  const nodeName = id => t(VM.NODE_DEF[id].name);
  const linkName = id => { const [kind, pair] = id.split(':'); const [a, b] = pair.split('-'); return `${nodeName(a)} ↔ ${nodeName(b)}`; };
  const targetName = (aid, tg) => { if (tg == null) return ''; if (aid === 'route') return String(tg).split('>').map(nodeName).join(' → '); const a = VM.ACTIONS[aid]; if (a.target === 'node' || a.target === 'project') return nodeName(a.target === 'project' ? S().projects[tg].node : tg); if (a.target === 'build') { const b = S().builds.find(x => x.bid === tg); return b ? t(G.aname(b.action)) : tg; } return linkName(tg); };
  const M = () => VM.mission(S().mission);

  /* ============================== START ============================== */
  G.startMission = (mid, opts={}) => {
    if (!G.unlocked(mid)) return;
    const r = G.loadRun(); let cur = null; try { cur = r && r.s ? JSON.parse(r.s) : null; } catch(e) {}
    if (cur && !cur.done && !opts.confirmed) {   // starting a mission would replace an unfinished, autosaved run: ask first
      G.confirmBox(t('replaceRun', {m:t(VM.mission(cur.mission).title), n:cur.turn}), t('startNewAnyway'), t('resumeInstead'),
        () => G.startMission(mid, {...opts, confirmed:true}), () => G.leaveMode(() => G.resumeRun()));
      return;
    }
    VM.init(mid, {upgrades:G.profile.upgrades, daily:opts.daily || null, couplings:window.VisionCompetitiveness ? window.VisionCompetitiveness.couplings(G.profile) : null});
    ui.runMeta = G.runMeta = {daily:opts.daily || null}; ui.whatIf = null; ui.coach = (mid === 'm1' && !(G.profile.missions.m1 || {}).attempts) ? 1 : 0;
    enterHud(); G.saveRun();
    G.toast(t('startMsg', {n:M().n, t:t(M().title)}));
  };
  G.resumeRun = () => { const r = G.loadRun(); if (!r) return; VM.load(r.s); ui.runMeta = G.runMeta = r.ui || {}; ui.whatIf = r.ui && r.ui.whatIf || null; ui.coach = 0; enterHud(); };
  function enterHud(){
    G.hideAll(); $('#mhud').classList.remove('hidden', 'ended', 'cine'); ['#results','#report','#decision','#moment','#pauseMenu'].forEach(s => $(s).classList.add('hidden'));
    W.setBeacons(false); W.setProjectLabels(false); W.setNight(0);
    const an = VM.BOARDS[VM.board].anchor;
    const pts = M().storm ? M().stormPath.map(([lo, la]) => W.place(lo, la, an)) : Object.keys(VM.NODE_DEF).filter(id => (!VM.NODE_DEF[id].energySite || M().energy) && !VM.NODE_DEF[id].far).map(id => G.nodePos(id));
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const span = Math.max(...pts.map(p => Math.hypot(p[0] - cx, p[1] - cz)));
    ui.home = [cx, cz, Math.max(2.2, span * 2.6)];
    W.cam(.3, .86, ui.home[2], cx + .12, cz, .7);
    W.onGroundClick(groundClick);
    ui.sel = ui.target = ui.fc = null; ui.busy = false;
    refresh();
  }
  G.refreshHud = () => { if (!$('#mhud').classList.contains('hidden')) refresh(); };

  /* ============================== RENDER ============================= */
  function refresh(){
    const s = S(); if (!s) return;
    G.renderNav('missions');
    G.showScene(s); W.setOverlay(G.flows(s, {lens:ui.lens}).concat(previewOverlay()));
    renderCard(); renderMeasures(); renderActions(); renderPlan(); renderMarkers(); renderStorm(); renderCoach();
    if (ui.whatIf) { $('#banner').classList.remove('hidden'); $('#banner').textContent = t('whatIfBanner', {n:ui.whatIf.turn}); } else $('#banner').classList.add('hidden');
  }
  function dateLabel(){
    const m = M(), s = S(), tt = Math.min(s.turn, s.maxTurns);
    if (m.storm) return `${t('phase')} ${tt} ${t('of')} ${s.maxTurns} · ${String(6 + (tt - 1) * 2).padStart(2, '0')}:00`;
    if (!m.turnStep) return `${t(m.turnLabel)} ${tt} ${t('of')} ${s.maxTurns} · ${m.year}`;
    return `${t('turn')} ${tt} ${t('of')} ${s.maxTurns} · ${G.month((tt - 1) * m.turnStep, m.year)}`;
  }
  function renderCard(){
    const m = M(), s = S(); let pr = m.primary(s), proj = false;
    ui.goalEnd = s.done && s.result ? s.result.goal || null : null;
    if (!s.done) { const r = VM.projectEnd(); if (r) { pr = r.primary; proj = true; ui.goalEnd = r.goal || null; } }   // forecast at the mission end with the current plan
    const ge = ui.goalEnd;
    const goalLine = ge ? `<p class="mc-goal" title="${esc(t('mapNumbers'))}">${ge.sites.map(x => `<span class="${x.met ? 'met' : x.id === ge.weakest ? 'weak' : ''}">${esc(nodeName(x.id))} ${esc(t('accessToCore'))} <b>${Math.round(x.value)}</b></span>`).join('')}<small>${esc(t('goalEvent'))} · ${esc(t('goalLower'))} · ${esc(t('goalNeed', {n:ge.target}))}</small></p>` : '';
    const pct = Math.max(0, Math.min(100, pr.value / pr.target * 100));
    const crewFree = VM.crewsTotal() - VM.crewsBusy() - s.plan.reduce((a, p) => a + p.crews, 0);
    const mods = s.daily ? s.daily.mods.map(id => t(VM.DAILY_MODS.find(x => x.id === id).name)).join(' · ') : '';
    $('#mcard').innerHTML = `<div class="mc-top"><span class="mc-n">${m.n}</span><div><small>${esc(t('mission'))} ${m.n}${s.daily ? ' · ' + esc(t(s.daily.kind)) : ''}</small><b>${esc(t(m.title))}</b></div></div>
      <p class="mc-obj">🎯 ${esc(t(m.objective))}</p>
      <div class="mc-meter ${pr.met ? 'met' : ''}" title="${esc(t('forecastEnd'))}"><i style="width:${pct}%"></i><span>${proj ? esc(t('forecastEnd')) + ': ' : ''}${esc(String(pr.fmt))} / ${pr.target}${m.storm ? '%' : ''} ${pr.met ? '✓' : ''}</span></div>
      ${goalLine}
      ${mods ? `<p class="mc-mods">⚑ ${esc(mods)}</p>` : ''}
      <div class="mc-stats"><span>🗓 ${esc(dateLabel())}</span><span title="${esc(t('creditsNote'))}">◆ ${fmt(s.budget - s.plan.reduce((a, p) => a + p.cost, 0), 1)} ${esc(t('credits'))}</span>${m.storm ? `<span>⚡ ${VM.respPoints() - s.plan.length}/${VM.respPoints()}</span>` : `<span>👷 ${crewFree}/${VM.crewsTotal()} ${esc(t('free'))}</span>`}</div>
      <details class="mc-brief"><summary>ⓘ</summary><p>${esc(t(m.brief))}</p>${m.goal ? `<p>${esc(t('mapNumbers'))}</p><p>${esc(t('mobilityNote'))}</p>` : ''}</details>`;
  }
  function measureKeys(){ const m = M(); if (m.hud) return ['trust', ...m.hud]; if (m.storm) return ['people','services','mobility','trust']; const k = ['mobility','trust','sustainability','resilience']; if (m.projects) k.splice(1, 0, 'delivery'); if (m.visitors && m.visitors.season) k.unshift('visitors'); return k; }
  function measureVal(k){ const x = S().m; return {people:x.protected, services:x.services, visitors:x.visitorsServed, freight:(x.freightShare || 0) * 100, skilled:x.skilled || 0}[k] ?? x[k]; }
  function renderMeasures(){
    const h = S().history, prev = h.length ? h[h.length - 1] : null, prev2 = h.length > 1 ? h[h.length - 2].m : null;
    $('#mmeasures').innerHTML = measureKeys().map(k => { const v = measureVal(k) ?? 0, pv = prev2 ? ({people:prev2.protected, services:prev2.services, visitors:prev2.visitorsServed}[k] ?? prev2[k]) : null, d = pv != null ? v - pv : 0;
      const bad = k !== 'visitors' && v < 45;
      return `<button class="mchip ${bad ? 'warn' : ''}" data-m="${k}"${k === 'mobility' && M().goal ? ` title="${esc(t('mobilityNote'))}"` : ''}><small>${esc(t(k))}</small><b>${fmt(v)}${k === 'visitors' ? 'k' : ''}</b>${Math.abs(d) >= .8 ? `<i class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${fmt(Math.abs(d))}</i>` : ''}</button>`; }).join('');
    $$('#mmeasures [data-m]').forEach(b => b.onclick = e => { e.stopPropagation(); showCauses(b.dataset.m, b); });
  }
  function showCauses(k, anchor){
    const pop = $('#causePop'); const map = {people:'trust', services:'resilience', visitors:'mobility'}; let list = (S().m.contrib[k] || S().m.contrib[map[k]] || []);
    const x = S().m;
    if (k === 'readiness' && x.readinessParts) list = [{label:{en:'Transit access (30%)', ar:'الوصول بالنقل العام (30٪)'}, v:x.readinessParts.infra * .3}, {label:{en:'Clear processes (30%)', ar:'وضوح الإجراءات (30٪)'}, v:x.readinessParts.process * .3}, {label:{en:'Local talent (20%)', ar:'المواهب المحلية (20٪)'}, v:x.readinessParts.talent * .2}, {label:{en:'Public confidence (20%)', ar:'ثقة الجمهور (20٪)'}, v:x.readinessParts.confidence * .2}, ...(S().invest.incentive ? [{label:{en:'Investor incentive', ar:'حافز المستثمر'}, v:8}] : [])];
    if ((k === 'freight' || k === 'reliability') && x.freight) list = Object.entries(x.freight).map(([o, f]) => ({label:{en:`${VM.NODE_DEF[o].name.en}: ${f.served.toFixed(1)}/${f.demand.toFixed(1)} by ${f.mode}`, ar:`${VM.NODE_DEF[o].name.ar}: ${f.served.toFixed(1)}/${f.demand.toFixed(1)} ${f.mode === 'rail' ? 'بالقطار' : 'بالطرق'}`}, v:f.served}));
    if (k === 'skilled') list = [{label:{en:'Skilled crews available', ar:'الأطقم الماهرة المتاحة'}, v:x.skilled || 0}, {label:{en:'Graduates in the pipeline', ar:'خريجون في المسار'}, v:S().grad || 0}];
    if (!pop.classList.contains('hidden') && pop.dataset.k === k) { pop.classList.add('hidden'); return; }
    pop.dataset.k = k; const r = anchor.getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + 'px'; pop.style.left = Math.max(8, Math.min(innerWidth - 330, r.left - 120)) + 'px';
    pop.innerHTML = `<b>${esc(t(k))}: ${fmt(measureVal(k) || 0)}</b>${k === 'mobility' && M().goal ? `<p class="hint">${esc(t('mobilityNote'))}</p>` : ''}<ul>${list.map(c => `<li class="${c.v >= 0 ? 'pos' : 'neg'}"><span>${esc(t(c.label))}</span><em>${c.v >= 0 ? '+' : ''}${fmt(c.v, 1)}</em></li>`).join('')}</ul>`;
    pop.classList.remove('hidden');
  }
  document.addEventListener('click', e => { if (!e.target.closest('#causePop') && !e.target.closest('[data-m]')) $('#causePop').classList.add('hidden'); });

  const CATS = ['transit','district','energy','project','people','policy','offer','ops','response'];
  function renderActions(){
    const m = M(), s = S();
    const html = CATS.map(cat => { const ids = m.actions.filter(id => VM.ACTIONS[id].cat === cat); if (!ids.length) return '';
      return `<div class="ab-group"><small>${esc(t(cat))}</small><div class="ab-row">${ids.map(id => { const a = VM.ACTIONS[id], c = VM.check(id, null);
        const locked = c.locked, on = a.toggle && s.ops[id], cost = VM.ACTIONS[id].target === 'none' || !['metro','brt','road','advance','fasttrack','route','freight'].includes(id) ? VM.costOf(id, null) : null;
        return `<button class="act ${ui.sel === id ? 'sel' : ''} ${locked ? 'locked' : ''} ${!c.ok && !locked ? 'dim' : ''} ${on ? 'on' : ''}" data-act="${id}" title="${esc(c.ok ? t(a.why) : t(c.why || a.why))}">
          <span class="ai">${locked ? '🔒' : a.icon}</span><span class="an">${esc(t(G.aname(id)))}</span><span class="ac">${locked ? esc(t(VM.UPGRADES[locked].name)) : on ? esc(t('on')) : cost != null ? cost + ' ◆' + (a.toggle ? '/' + (t('turn')) : '') : ''}</span></button>`; }).join('')}</div></div>`; }).join('');
    $('#actionBar').innerHTML = html;
    $$('#actionBar [data-act]').forEach(b => b.onclick = () => selectAction(b.dataset.act));
  }
  function renderPlan(){
    const s = S(), m = M(), spend = s.plan.reduce((a, p) => a + p.cost, 0);
    $('#planTray').innerHTML = `<div class="pt-head"><b>${esc(t('plan'))}</b>${spend ? `<small>−${fmt(spend, 1)} ◆</small>` : ''}</div>
      ${s.plan.length ? `<ul class="pt-list">${s.plan.map((p, i) => `<li><span>${VM.ACTIONS[p.id].icon} ${esc(t(G.aname(p.id)))}${p.target ? ` · <em>${esc(targetName(p.id, p.target))}</em>` : ''}</span><small>${p.cost} ◆${p.dur ? ' · ' + p.dur + ' ' + esc(t(p.dur === 1 ? 'turn1' : 'turns')) : ''}</small><button class="x" data-rm="${i}" aria-label="${esc(t('cancel'))}">✕</button></li>`).join('')}</ul>` : `<p class="pt-empty">${esc(t('planEmpty'))}</p>`}
      ${s.builds.length ? `<p class="pt-builds">🏗 ${s.builds.map(b => `${esc(t(G.aname(b.action)))} (${esc(t('turnsLeft', {n:b.turnsLeft}))})`).join(' · ')}</p>` : ''}
      <div class="pt-foot">${M().actions.some(a => a === 'road') && G.profile.upgrades.includes('smart') ? `<button class="secondary sm ${ui.lens ? 'on' : ''}" id="lensBtn">🚦 ${esc(t('congestion'))}</button>` : ''}<button class="primary end-turn" id="endTurnBtn" ${ui.busy || s.done ? 'disabled' : ''}>${esc(t(m.storm ? 'nextPhase' : 'endTurn'))}</button></div>`;
    $$('#planTray [data-rm]').forEach(b => b.onclick = () => { VM.removePlan(+b.dataset.rm); G.sfx('click'); refresh(); });
    $('#endTurnBtn').onclick = endTurn;
    if ($('#lensBtn')) $('#lensBtn').onclick = () => { ui.lens = !ui.lens; refresh(); };
  }
  function renderCoach(){
    const el = $('#coach'); if (!ui.coach || ui.coach > 4) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); el.textContent = t('coach' + ui.coach); el.dataset.step = ui.coach;
  }

  /* ======================= MAP MARKERS & LABELS ====================== */
  function validTargetsFor(id){ return id ? VM.validTargets(id).filter(x => x != null) : []; }
  function renderMarkers(){
    const s = S(), ents = [], labs = [], tg = ui.sel ? validTargetsFor(ui.sel) : [], a = ui.sel && VM.ACTIONS[ui.sel];
    for (const id of Object.keys(VM.NODE_DEF)) {
      const p = G.nodePos(id), mob = s.m.nodeMob[id], isT = a && ((a.target === 'route' && ui.routeChain && routeNext().includes(id)) || ((a.target === 'node' || a.target === 'project') && tg.some(x => (a.target === 'project' ? s.projects[x].node : x) === id)));
      const d = ui.fc && ui.fc.nodeDelta ? ui.fc.nodeDelta[id] || 0 : 0;
      ents.push({x:p[0], z:p[1], y:W.ground + .02, color:isT ? [1,.85,.3] : [.95,.95,.9], size:isT ? 14 : 8, ring:isT ? .085 : Math.abs(d) > 1 ? .07 : .045, ringColor:isT ? [1,.8,.25] : d > 1 ? [.35,.9,.5] : d < -1 ? [.95,.4,.3] : [.9,.9,.85], pulse:isT});
      let txt = nodeName(id);
      const gs = ui.goalEnd && ui.goalEnd.sites.find(x => x.id === id);
      if (gs) txt += ` · ${Math.round(mob)} ${t('nowLbl')} · 🎯${Math.round(gs.value)} ${t('eventLbl')}`;
      else if (!VM.NODE_DEF[id].core && !VM.NODE_DEF[id].energySite && mob != null && !M().storm) txt += ` · ${Math.round(mob)}`;
      if (Math.abs(d) > 1) txt += `  ${d > 0 ? '▲' : '▼'}${Math.round(Math.abs(d))}`;
      if (M().storm) { const n = s.nodes[id]; txt += (n.shelter ? ' 🏠' : '') + (n.medic ? '⛑' : '') + (n.power ? (n.power > 1 ? '🔋' : '🔌') : ''); }
      if (M().projects) { const pr = Object.entries(s.projects).find(([k, p]) => p.node === id); if (pr) txt += ` · ${pr[1].done ? '✦' : pr[1].stage + '/3'}`; }
      labs.push({id:'n-' + id, text:txt, x:p[0], z:p[1], cls:'node ' + (isT ? 'target' : Math.abs(d) > 1 ? (d > 0 ? 'good' : 'bad') : (gs ? !gs.met : mob != null && mob < 50) && !M().storm ? 'low' : '')});
    }
    W.setEntities(ents); W.setDynamicLabels(labs);
  }
  function previewOverlay(){
    const ov = [], s = S(); if (!ui.sel) return ov;
    const a = VM.ACTIONS[ui.sel];
    if (a.target === 'route') { const ch = ui.routeChain && ui.routeChain.length ? ui.routeChain : String(ui.target || '').split('>').filter(Boolean); for (let k = 1; k < ch.length; k++) ov.push({a:G.nodePos(ch[k - 1]), b:G.nodePos(ch[k]), color:[.4,1,.55], thick:true, flow:true, n:6, speed:1.5, size:5}); return ov; }
    if (a.target === 'corridor' || a.target === 'road') {
      const goal = M().goal && ['metro','brt','road'].includes(ui.sel);
      const impColor = code => code === 'helps' ? [.3,.85,.45] : code === 'hurts' ? [.92,.35,.28] : code === 'noCore' || code === 'late' ? [1,.7,.22] : [.5,.52,.5];
      for (const id of validTargetsFor(ui.sel)) { const l = s.links.find(x => x.id === id); const sel = ui.target === id, imp = goal && ui.impacts ? ui.impacts[`${ui.sel}|${id}`] : null;
        if (imp && imp.ok) {   // 1-px dashed lines sink under roads and buildings, so goal previews float marker dots just above rooftops: moving = raises the goal, static = does not
          const helps = imp.code === 'helps';
          ov.push({a:G.nodePos(l.a), b:G.nodePos(l.b), color:sel ? [1,.9,.35] : impColor(imp.code), noLine:true, flow:true, y:W.ground + .07, n:sel ? 16 : 12, speed:sel || helps ? 1.2 : .002, size:sel ? 7 : helps ? 6 : 4.5});
          continue; }
        const base = a.cat === 'response' ? [1,.55,.35] : [1,.78,.3];
        ov.push({a:G.nodePos(l.a), b:G.nodePos(l.b), color:sel ? [1,.9,.35] : base, thick:true, dash:!sel, flow:sel, n:8, speed:2, size:sel ? 6 : 5}); }
    }
    // A selected line that cannot carry goal trips: mark the missing link to the City Centre it depends on (static amber dots).
    const imp = ui.target != null && ui.impacts ? ui.impacts[`${ui.sel}|${ui.target}`] : null, g = M().goal;
    if (imp && imp.ok && imp.code === 'noCore' && g) for (const sid of g.sites) if (String(ui.target).split(/[:>-]/).includes(sid) && !(s.m.tPaths || {})[sid])
      ov.push({a:G.nodePos(sid), b:G.nodePos(g.to), color:[1,.62,.2], noLine:true, flow:true, y:W.ground + .07, n:12, speed:.002, size:6});
    return ov;
  }
  function renderStorm(){
    const s = S(); if (!s.storm) { W.setHazard(null); return; }
    const wpk = G.worldPerKm(), st = s.storm, ph = st.phase;
    const pos = i => { const c = VM.stormCenter(i); return W.place(c.lon, c.lat, VM.BOARDS[VM.board].anchor); };
    if (ph >= 1) { const to = pos(ph - 1); const from = ui.hazardAnim || to; animateHazard(from, to, st.sev[ph - 1], st.radius * wpk, M().hazard || 'dust'); ui.hazardAnim = to; }
    else W.setHazard(null);
    // Forecast cone: next phase (and the one after with Digital Twin)
    const ents = [];
    const fut = G.profile.upgrades.includes('twin') ? [ph, ph + 1] : [ph];
    fut.forEach((i, k) => { if (i >= st.path.length) return; const p = pos(i); ents.push({x:p[0], z:p[1], y:W.ground + .03, color:[1,.6,.3], size:10, ring:st.radius * wpk * (G.profile.upgrades.includes('twin') ? 1 : 1.35), ringColor:k ? [1,.75,.45] : [1,.5,.25], pulse:true}); });
    W.setEntities(currentEntities().concat(ents));
  }
  let lastEnts = [];
  const _setE = W.setEntities; W.setEntities = list => { lastEnts = list; _setE(list); };
  const currentEntities = () => lastEnts;
  function animateHazard(from, to, sev, r, type='dust'){
    const t0 = performance.now(), dur = 1200;
    const step = () => { const k = Math.min(1, (performance.now() - t0) / dur), e = k * k * (3 - 2 * k);
      W.setHazard({x:from[0] + (to[0] - from[0]) * e, z:from[1] + (to[1] - from[1]) * e, r, type, intensity:sev}); if (k < 1) requestAnimationFrame(step); };
    step();
  }

  /* ============================ DECISIONS ============================ */
  function selectAction(id){
    if (ui.busy) return;
    const s = S(), a = VM.ACTIONS[id], c = VM.check(id, null);
    if (c.locked) { G.sfx('warn'); G.toast(t(c.why)); return; }
    if (a.toggle && s.ops[id]) { VM.addPlan(id); G.sfx('click'); G.toast(`${t(a.name)} — ${t('offOp')}`); refresh(); return; }
    if (!c.ok) { G.sfx('warn'); G.toast(t(c.why || 'noTargets')); return; }
    G.sfx('select'); ui.sel = id; ui.target = null; ui.fc = null; ui.impacts = {};
    if (ui.coach === 1) ui.coach = 2;
    if (a.target === 'none') { openDecision(id, null); return; }
    const tg = validTargetsFor(id);
    if (a.target === 'route') { ui.routeChain = []; routePanel(); refresh(); return; }
    if (tg.length === 1 && a.target === 'build') { openDecision(id, tg[0]); return; }
    showTargetList(id, tg); refresh();
  }
  // Goal effect of one candidate (missions with a goal descriptor): computed before the player spends anything.
  function impactFor(id, tg){
    if (!M().goal) return null;
    const k = `${id}|${tg}`; ui.impacts = ui.impacts || {};
    if (!(k in ui.impacts)) ui.impacts[k] = VM.routeImpact(id, tg);
    return ui.impacts[k];
  }
  const arw = () => G.lang() === 'ar' ? '←' : '→';   // before→after reads right-to-left in Arabic
  const goalShift = imp => `🎯 ${Math.round(imp.before)} ${arw()} ${Math.round(imp.after)}${imp.met ? ' ✓' : ''} (${sgn(imp.after - imp.before)})`;
  const opensTxt = imp => imp.code === 'late' ? t('notReady') : imp.opens == null ? '' : imp.opens > imp.eventTurn ? t('opensEvent') : t('opensTurn', {n:imp.opens});
  function showTargetList(id, tg){
    const a = VM.ACTIONS[id], d = $('#decision'), goal = !!M().goal && ['metro','brt','road'].includes(id);
    const row = x => { const c = VM.check(id, x), imp = goal ? impactFor(id, x) : null;
      const facts = `${c.cost ?? VM.costOf(id, x)} ◆ · ${c.crews || VM.ACTIONS[id].crews} ${esc(t(((c.crews || VM.ACTIONS[id].crews) === 1) ? 'crew1' : 'crews').toLowerCase())} · ${VM.durOf(id, x)} ${esc(t(VM.durOf(id, x) === 1 ? 'turn1' : 'turns'))}`;
      if (!imp || !imp.ok) return `<button class="tg" data-tg="${esc(x)}">${esc(targetName(id, x))}${['metro','brt','road'].includes(id) ? ` <small>${facts}</small>` : ''}</button>`;
      return `<button class="tg imp imp-${imp.code}" data-tg="${esc(x)}"><span class="tg-top"><b>${esc(targetName(id, x))}</b><em class="imp-tag">${esc(t('imp_' + imp.code))}</em></span>
        <small class="tg-facts"><b>${esc(goalShift(imp))}</b> · ${facts}${opensTxt(imp) ? ' · ' + esc(opensTxt(imp)) : ''}</small><small class="tg-why">${esc(t(imp.reasons[0]))}</small></button>`; };
    d.innerHTML = `<div class="dc-head"><span class="dc-icon">${a.icon}</span><div><b>${esc(t(G.aname(id)))}</b><small>${esc(t('tapHint'))}</small></div><button class="icon-btn" id="dcClose">✕</button></div>
      <p class="dc-why">${esc(t(a.why))}</p><p class="hint">${esc(t('chooseTarget'))}</p>${goal ? `<p class="hint legend">${esc(t('previewLegend'))}</p>` : ''}
      <div class="tg-list">${tg.map(row).join('')}</div>`;
    d.classList.remove('hidden');
    $('#dcClose').onclick = clearSel;
    $$('#decision [data-tg]').forEach(b => b.onclick = () => openDecision(id, b.dataset.tg));
  }
  function routeNext(){ const ch = ui.routeChain || []; if (!ch.length) return Object.keys(VM.NODE_DEF).filter(n => !VM.NODE_DEF[n].energySite && !VM.NODE_DEF[n].freightOnly); return VM.roadNeighbours(ch[ch.length - 1]).filter(n => !ch.includes(n)); }
  function routePanel(){
    const ch = ui.routeChain || [], a = VM.ACTIONS.route, v = ch.length >= 2 ? VM.routeValid(ch.join('>')) : null, d = $('#decision');
    d.innerHTML = `<div class="dc-head"><span class="dc-icon">${a.icon}</span><div><b>${esc(t(G.aname('route')))}</b><small>${esc(t(ch.length ? 'routeNext' : 'routeFirst'))}</small></div><button class="icon-btn" id="dcClose">✕</button></div>
      <p class="dc-why">${esc(t(a.why))}</p><ol class="route-chain">${ch.map(n => `<li>${esc(nodeName(n))}</li>`).join('') || `<li class="hint">—</li>`}</ol>
      ${v && !v.ok ? `<p class="warnTxt">${esc(t(v.why))}</p>` : ''}${ch.length >= 2 && v && v.ok ? `<p class="hint">${esc(t('cost'))}: ◆ ${VM.costOf('route', ch.join('>'))}</p>` : ''}
      <div class="tg-list">${routeNext().map(n => `<button class="tg" data-rn="${n}">+ ${esc(nodeName(n))}</button>`).join('')}</div>
      <div class="row-btns"><button class="primary" id="rtDone" ${v && v.ok ? '' : 'disabled'}>${esc(t('routeReview'))}</button><button class="secondary" id="rtBack" ${ch.length ? '' : 'disabled'}>${esc(t('removeLastStop'))}</button></div>`;
    d.classList.remove('hidden');
    $('#dcClose').onclick = clearSel; $$('#decision [data-rn]').forEach(b => b.onclick = () => { ui.routeChain.push(b.dataset.rn); G.sfx('click'); routePanel(); refresh(); });
    $('#rtBack').onclick = () => { ui.routeChain.pop(); routePanel(); refresh(); }; $('#rtDone').onclick = () => openDecision('route', ui.routeChain.join('>'));
  }
  function clearSel(){ ui.routeChain = null; ui.sel = ui.target = ui.fc = null; ui.impacts = {}; $('#decision').classList.add('hidden'); refresh(); }
  function groundClick({x, z}){
    if (ui.busy || !ui.sel) return false;
    const a = VM.ACTIONS[ui.sel], s = S(), tg = validTargetsFor(ui.sel);
    let best = null, bd = 1e9;
    if (a.target === 'route' && ui.routeChain) { for (const n of routeNext()) { const p = G.nodePos(n), d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; best = n; } } if (best && bd < .22) { ui.routeChain.push(best); G.sfx('click'); routePanel(); refresh(); return true; } return false; }
    if (a.target === 'node' || a.target === 'project') for (const id of tg) { const p = G.nodePos(a.target === 'project' ? s.projects[id].node : id), d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; best = id; } }
    else if (a.target === 'corridor' || a.target === 'road') for (const id of tg) { const l = s.links.find(q => q.id === id), A = G.nodePos(l.a), B = G.nodePos(l.b);
      const vx = B[0] - A[0], vz = B[1] - A[1], L2 = vx * vx + vz * vz, k = Math.max(0, Math.min(1, ((x - A[0]) * vx + (z - A[1]) * vz) / L2)); const d = Math.hypot(A[0] + vx * k - x, A[1] + vz * k - z); if (d < bd) { bd = d; best = id; } }
    if (best != null && bd < .22) { openDecision(ui.sel, best); return true; }
    return false;
  }
  function openDecision(id, tg){
    const s = S(), a = VM.ACTIONS[id], c = VM.check(id, tg);
    ui.sel = id; ui.target = tg;
    if (!c.ok) { G.sfx('warn'); G.toast(t(c.why)); return; }
    if (ui.coach === 2) ui.coach = 3;
    ui.fc = VM.forecast(id, tg); const fc = ui.fc;
    const exact = fc && fc.exact, m = M();
    const keys = m.storm ? ['protected','services','mobility','trust'] : ['mobility','trust','sustainability','resilience', ...(m.visitors && m.visitors.season ? ['visitorsServed'] : [])];
    const lbl = {protected:'people', visitorsServed:'visitors'};
    const effects = fc ? keys.map(k => { const v = fc.delta[k] || 0; if (Math.abs(v) < .3) return ''; const w = Math.min(100, Math.abs(v) * 4);
      const txt = exact ? sgn(v) : `${sgn(v * .7)} … ${sgn(v * 1.3)}`;
      return `<li class="${v > 0 ? 'pos' : 'neg'}"><span>${esc(t(lbl[k] || k))}</span><i style="--w:${w}%"></i><em>${txt}</em></li>`; }).join('') : '';
    // Mission-specific objective effect
    let objLine = '';
    const imp = m.goal ? impactFor(id, tg) : null;
    if (imp && imp.ok) objLine = `<div class="dc-goal imp-${imp.code} ${imp.met ? 'met' : ''}">
        <div class="dg-head"><small>🎯 ${esc(t('goalEvent'))} · ${esc(t('goalLower'))}</small><b>${Math.round(imp.before)} ${arw()} ${Math.round(imp.after)} ${imp.met ? '✓' : ''}</b><em>${esc(t('goalNeed', {n:imp.target}))}</em></div>
        <ul class="dg-sites">${imp.sites.map(x => `<li class="${x.id === imp.weakest ? 'weak' : ''}"><span>${esc(nodeName(x.id))} ${esc(t('accessToCore'))}</span><b>${Math.round(x.before)} ${arw()} ${Math.round(x.after)}</b></li>`).join('')}</ul>
        <p class="dg-tag"><b>${esc(t('imp_' + imp.code))}</b>${opensTxt(imp) ? ' · ' + esc(opensTxt(imp)) : ''}</p>
        <ul class="dg-why">${imp.reasons.map(r => `<li>${esc(t(r))}</li>`).join('')}</ul>
        ${imp.code !== 'helps' ? `<p class="warnTxt">⚠ ${esc(t('wontHelpWarn'))}</p>` : ''}</div>`;
    else if (fc && m.id === 'm1') { const e = fc.nodeDelta.expo || 0, k = fc.nodeDelta.ksip || 0; objLine = esc(`${nodeName('expo')} ${sgn(e)} · ${nodeName('ksip')} ${sgn(k)}`); }
    const needs = [a.req ? t(VM.UPGRADES[a.req].name) : null, a.needs ? t(VM.ACTIONS[a.needs].name) : null].filter(Boolean);
    const dur = c.dur || 0;
    $('#decision').innerHTML = `<div class="dc-head"><span class="dc-icon">${a.icon}</span><div><b>${esc(t(G.aname(id)))}</b><small>${tg != null ? esc(targetName(id, tg)) : ''}</small></div><button class="icon-btn" id="dcClose">✕</button></div>
      <div class="dc-facts"><div><small>${esc(t('cost'))}</small><b>${c.cost} ◆${a.toggle ? ' / ' + esc(t('turn')) : ''}</b></div><div><small>${esc(t('time'))}</small><b>${dur ? dur + ' ' + esc(t(dur === 1 ? 'turn1' : 'turns')) : esc(t('instant'))}</b></div>${c.crews ? `<div><small>${esc(t('crews'))}</small><b>${c.crews}</b></div>` : ''}${needs.length ? `<div><small>${esc(t('needs'))}</small><b>${needs.map(esc).join(', ')}</b></div>` : ''}</div>
      <p class="dc-sub">${esc(t(exact ? 'exactTwin' : 'approx'))}</p>
      ${objLine ? (imp && imp.ok ? objLine : `<p class="dc-obj">🎯 ${objLine}</p>`) : ''}
      <ul class="dc-effects">${effects || `<li class="neu"><span>—</span></li>`}</ul>
      ${exact && fc.result ? `<p class="dc-medal">${esc(t('medalForecast', {medal:t(fc.result.medal || 'none')}))}</p>` : ''}
      <p class="dc-why"><b>${esc(t('tradeoff'))}:</b> ${esc(t(a.why))}</p>
      <p class="hint">${esc(t('predictedMap'))}</p>
      <div class="row-btns"><button class="primary" id="dcAdd">${esc(t('addPlan'))}</button><button class="secondary" id="dcCancel">${esc(t('cancel'))}</button></div>`;
    $('#decision').classList.remove('hidden');
    $('#dcClose').onclick = clearSel; $('#dcCancel').onclick = clearSel;
    $('#dcAdd').onclick = () => { const r = VM.addPlan(id, tg); if (!r.ok) { G.sfx('warn'); G.toast(t(r.why)); return; } G.sfx('commit'); if (ui.coach === 3) ui.coach = 4; clearSel(); G.saveRun(); };
    G.sfx('click'); refresh();
    // Focus camera on what the decision affects
    const focus = tg && (a.target === 'node' || a.target === 'project') ? G.nodePos(a.target === 'project' ? s.projects[tg].node : tg) : tg && tg.includes(':') ? (() => { const l = s.links.find(x => x.id === tg); const A = G.nodePos(l.a), B = G.nodePos(l.b); return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]; })() : null;
    if (focus && !G.profile.reduced) W.cam(.3, .82, Math.max(2, (ui.home || [0,0,2.6])[2] * .85), focus[0], focus[1], .8);
  }

  /* ============================== TURNS ============================== */
  async function endTurn(){
    if (ui.busy || S().done) return;
    ui.busy = true; clearSel(); if (ui.coach === 4) ui.coach = 5; renderCoach();
    const before = JSON.parse(JSON.stringify({m:S().m, nodeMob:S().m.nodeMob}));
    G.sfx(M().storm ? 'storm' : 'turn');
    const report = VM.endTurn();
    G.saveRun();
    // Transformation moments for what was completed this turn (max 2)
    const moments = report.events.filter(e => e.type === 'complete' || e.type === 'open').slice(0, 2);
    for (const e of moments) await transformation(e, before);
    refresh();
    showReport(report);
    ui.busy = false; renderPlan();
  }
  function transformation(e, before){
    return new Promise(res => {
      const s = S(); let at = null, title = '', detail = '';
      if (e.type === 'open') { at = G.nodePos(e.node); title = t('projectOpen', {p:nodeName(e.node)}); }
      else { const a = VM.ACTIONS[e.action]; title = `${a.icon} ${t(G.aname(e.action))}${e.target ? ' · ' + targetNameSafe(e.action, e.target) : ''}`;
        if (e.target && e.target.includes(':')) { const l = s.links.find(x => x.id === e.target); const A = G.nodePos(l.a), B = G.nodePos(l.b); at = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
          const nb = before.nodeMob[l.b] ?? before.nodeMob[l.a], na = s.m.nodeMob[l.b] ?? s.m.nodeMob[l.a], nid = s.m.nodeMob[l.b] != null ? l.b : l.a;
          if (nb != null) detail = `${nodeName(nid)} · ${t('mobility')}: ${Math.round(nb)} → ${Math.round(na)}`; }
        else if (e.target) at = G.nodePos(e.target); else at = G.nodePos(e.node || 'sudair');
      }
      if (!detail) { const d = ['mobility','trust','sustainability','resilience'].map(k => [k, (s.m[k] || 0) - (before.m[k] || 0)]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]; if (d && Math.abs(d[1]) >= .5) detail = `${t(d[0])}: ${Math.round(before.m[d[0]])} → ${Math.round(s.m[d[0]])}`; }
      const mo = $('#moment'), reduced = G.profile.reduced;
      mo.innerHTML = `<div class="mo-bar top"></div><div class="mo-bar bottom"></div><div class="mo-cap"><small>${esc(t('before'))} → ${esc(t('after'))}</small><b>${esc(title)}</b>${detail ? `<em>${esc(detail)}</em>` : ''}</div>`;
      mo.classList.remove('hidden'); $('#mhud').classList.add('cine');
      const nightish = ['hotel','housing','park'].includes(e.action) || e.type === 'open';
      if (!reduced && at) W.cam(.5, .62, 1.9, at[0], at[1], 1.2);
      // "Before": show the unfinished scene briefly, then reveal the finished one
      setTimeout(() => { G.showScene(s); if (nightish && !reduced) W.setNight(.62); if (at && !reduced) W.burst(at[0], at[1]); G.sfx('complete'); mo.classList.add('reveal'); }, reduced ? 100 : 1100);
      setTimeout(() => { mo.classList.add('hidden'); mo.classList.remove('reveal'); $('#mhud').classList.remove('cine'); W.setNight(0); res(); }, reduced ? 1400 : 3300);
    });
  }
  // Credits this turn, split into income, construction spending and upkeep — all in credits for this one turn.
  function creditLedger(c){
    if (!c) return '';
    const sum = xs => xs.reduce((a, x) => a + x.v, 0), f1 = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v), 1);
    const inc = sum(c.income), sp = sum(c.spend), up = sum(c.upkeep), per = M().turnStep ? t('perTurnMonths', {n:M().turnStep}) : t('perTurnLbl');
    const incLbl = {base:'incBase', visitors:'incVisitors', offer:'incOffer'};
    const row = (lbl, v, detail) => `<li><span>${esc(lbl)}</span><b>${f1(v)}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</li>`;
    return `<div class="rp-credits"><b>◆ ${esc(t('creditsTurn'))}: ${fmt(c.before, 1)} ${arw()} ${fmt(c.after, 1)}</b> <small>(${esc(per)})</small><ul>
      ${row(t('incomeLbl'), inc, c.income.map(x => `${t(incLbl[x.k] || x.k)} ${f1(x.v)}`).join(' · '))}
      ${c.spend.length ? row(t('constructionLbl'), sp, c.spend.map(x => `${t(G.aname(x.id))}${x.target ? ' · ' + targetNameSafe(x.id, x.target) : ''}${x.toggle ? ' (' + t('firstTurnFee') + ')' : ''} ${f1(x.v)}`).join(' · ')) : ''}
      ${c.upkeep.length ? row(t('upkeepLbl'), up, c.upkeep.map(x => `${t(G.aname(x.id))} ${f1(x.v)}`).join(' · ')) : ''}</ul></div>`;
  }
  function showReport(report){
    const s = S(), m = M(), el = $('#report');
    const ev = [];
    for (const e of report.events) {
      if (e.type === 'outage') ev.push(`<li class="neg">⚡ ${esc(t('outage'))}</li>`);
      if (e.type === 'materials') ev.push(`<li class="neg">📦 ${esc(t('materialsWait', {p:nodeName(s.projects[e.project].node)}))} (${Math.round(e.f * 100)}%)</li>`);
      if (e.type === 'package') ev.push(`<li class="pos">🏗 ${esc(t('packageDone', {p:nodeName(s.projects[e.project].node), k:t(VM.PKG[e.stage - 1].name)}))}</li>`);
      if (e.type === 'open') ev.push(`<li class="pos">✦ ${esc(t('projectOpen', {p:nodeName(e.node)}))}</li>`);
      if (e.type === 'complete') { const eff = (e.effect || []).map(x => `${nodeName(x.id)} ${t('accessToCore')} ${Math.round(x.from)} ${arw()} ${Math.round(x.to)}`).join(' · ');
        ev.push(`<li class="pos">✓ <b>${esc(t('openedNow'))}:</b> ${esc(t(G.aname(e.action)))}${e.target ? ' · ' + esc(targetNameSafe(e.action, e.target)) : ''}${eff ? `<small class="rp-eff">${esc(t('measuredEffect'))}: ${esc(eff)}</small>` : ''}</li>`); }
      if (e.type === 'started') { const opensSame = report.events.some(x => x.type === 'complete' && x.action === e.action && String(x.target) === String(e.target));
        if (!opensSame) ev.push(`<li class="build">🏗 <b>${esc(t('startedNow'))}:</b> ${esc(e.action === 'advance' ? `${nodeName(e.node)} · ${t(VM.PKG[e.stage].name)}` : t(G.aname(e.action)) + (e.target ? ' · ' + targetNameSafe(e.action, e.target) : ''))}<small class="rp-eff">${esc(t(e.opensTurn > s.maxTurns ? 'opensAfterEnd' : e.action === 'advance' ? 'dueTurn' : 'opensTurnCap', {n:e.opensTurn}))} · ${e.dur} ${esc(t(e.dur === 1 ? 'turn1' : 'turns'))} · ${e.crews} ${esc(t(e.crews === 1 ? 'crew1' : 'crews').toLowerCase())} · ${fmt(e.cost, 1)} ◆</small></li>`); }
      if (e.type === 'op') ev.push(`<li class="build">${VM.ACTIONS[e.id].icon} <b>${esc(t('switchedOn'))}:</b> ${esc(t(G.aname(e.id)))}<small class="rp-eff">${esc(t('upkeepPerTurn', {c:fmt(VM.costOf(e.id), 1)}))}</small></li>`);
      if (e.type === 'applied' && !VM.ACTIONS[e.action].toggle) ev.push(`<li class="pos">✓ <b>${esc(t('doneNow'))}:</b> ${esc(t(G.aname(e.action)))}${e.target ? ' · ' + esc(targetNameSafe(e.action, e.target)) : ''}</li>`);
      if (e.type === 'event') ev.push(`<li>📣 ${esc(t(e.text))}</li>`);
      if (e.type === 'hit') ev.push(`<li class="${e.protected >= .99 ? 'pos' : 'neg'}">🌪 ${esc(nodeName(e.node))}: ${e.protected >= .99 ? esc(t('protectedLbl')) + ' ✓' : `${Math.round(e.risk * (1 - e.protected) * 1000).toLocaleString()} ${esc(t('exposedLbl'))}`}</li>`);
      if (e.type === 'roadClosed') ev.push(`<li class="${e.rerouted ? 'pos' : 'neg'}">🛣 ${esc(linkName(e.link))} — ${esc(t(e.rerouted ? 'rerouted' : 'roadClosed'))}</li>`);
    }
    const deltas = report.deltas.map(d => `<li class="${d.d > 0 ? 'pos' : 'neg'}"><b>${esc(t(d.k))} ${sgn(d.d)}</b>${d.causes.length ? ` — ${d.causes.map(c => `${esc(t(c.label))} (${sgn(c.d)})`).join(', ')}` : ''}</li>`).join('');
    el.innerHTML = `<div class="rp-head"><b>${esc(t(m.storm ? 'phaseReport' : 'turnReport', {n:report.turn}))}</b><button class="icon-btn" id="rpClose">✕</button></div>
      <ul class="rp-list">${ev.join('')}${deltas || (ev.length ? '' : `<li>${esc(t('noActions'))}</li>`)}</ul>${creditLedger(report.credits)}
      <button class="primary sm" id="rpOk">${esc(t(report.result ? 'viewResult' : 'continue'))}</button>`;
    el.classList.remove('hidden');
    const close = () => { el.classList.add('hidden'); if (report.result) finishMission(report.result); };
    $('#rpOk').onclick = close; $('#rpClose').onclick = close;
    if (report.result) { $('#rpOk').focus(); }
    else setTimeout(() => { if (!el.classList.contains('hidden') && !report.result) el.classList.add('fade'); }, 100);
  }

  /* =========================== RESULTS =============================== */
  function recordResult(res){
    const p = G.profile, prev = p.missions[res.mission] || null;
    const mr = VM.mergeRecord(prev, res, new Date().toISOString()), rec = mr.rec, gained = mr.gained;   // rules: mission.js mergeRecord
    ui.lastRecord = {prev:prev ? JSON.parse(JSON.stringify(prev)) : null, rec};
    if (res.medal && (!rec.bestComposite || res.composite >= rec.bestComposite)) { rec.compDeltas = window.VisionCompetitiveness ? window.VisionCompetitiveness.deltasFor(res) : []; rec.bestComposite = res.composite; p.legacy[res.mission] = res.built; }
    p.missions[res.mission] = rec; p.points += gained;
    let bonus = 0; const d = S().daily;
    if (d && res.medal) { const book = d.kind === 'daily' ? p.daily : p.weekly; if (!book[d.key]) { bonus = d.kind === 'daily' ? 1 : 2; p.points += bonus; } if (!book[d.key] || G.MEDAL_VAL[res.medal] > G.MEDAL_VAL[book[d.key]]) book[d.key] = res.medal; }
    G.saveProfile(); G.clearRun();
    return {gained, bonus};
  }
  function finishMission(res){
    const rw = recordResult(res), m = M(), last = ['m5','w2','n2','e2','s2','k1'].includes(m.id);
    $('#mhud').classList.add('ended'); $('#banner').classList.add('hidden'); ui.coach = 0; renderCoach();
    if (ui.whatIf) { showCompare(ui.whatIf.orig, res, rw); return; }
    if (res.medal && !G.profile.reduced) victory(() => showResults(res, rw, last)); else showResults(res, rw, last);
  }
  // Victory moment: zoom out from Riyadh to the Kingdom, and show how the work connects.
  function victory(done){
    const r = G.nodePos('core'), K = W.place(45.3, 23.7);
    G.sfx('medal'); W.burst(r[0], r[1]); W.setNight(.5);
    const cities = ({west:['Riyadh','Madinah','Taif','Tabuk','Abha'], neom:['Riyadh','Madinah','Jeddah','AlUla','Hail'], east:['Riyadh','Hofuf','Jeddah','Buraydah'], south:['Riyadh','Jeddah','Najran','Taif','Jazan'], kingdom:['Jeddah','Makkah','Dammam','Madinah','Tabuk','Abha','Jazan','Hail']}[VM.board] || ['Jeddah','Makkah','Dammam','Madinah','Tabuk','Abha']).map(n => G.D.cities.find(c => c.name === n)).filter(Boolean);
    W.setOverlay(G.flows(S()).concat(cities.map(c => ({a:[r[0], r[1]], b:[c.x, c.z], color:[1,.84,.35], flow:true, n:10, speed:2.4, size:4.5, thick:true}))));
    W.cam(.1, 1.0, 13, K[0], K[1], .45);
    setTimeout(() => { W.setNight(0); done(); }, 3200);
  }
  function measureRows(ms){ return Object.entries(ms).map(([k, v]) => `<div class="rs-row ${v < 50 ? 'low' : ''}"><span>${esc(t(k === 'objective' ? 'objectiveM' : k === 'budget' ? 'budgetM' : k))}</span><i style="--v:${Math.max(2, v)}%"></i><b>${Math.round(v)}</b></div>`).join(''); }
  // What this attempt changed in the save, next to what it achieved: stars bank only with a medal (mission.js mergeRecord).
  function savedBox(res){
    const lr = ui.lastRecord; if (!lr || !lr.rec) return '';
    const r = lr.rec, n = r.stars.length, banked = r.stars.filter(Boolean).length, metNow = res.stars.filter(Boolean).length;
    const note = res.medal ? t('bankedNote', {k:metNow}) : metNow ? t('notBankedNote', {k:metNow}) : t('noMedalNote');
    return `<div class="rs-saved"><h4>💾 ${esc(t('savedRecord'))}</h4><p>${esc(t('savedLine', {medal:r.medal ? t(r.medal) : t('noMedalYet'), s:banked, n, b:r.bestScore, a:r.attempts}))}</p><p class="hint">${esc(note)}</p></div>`;
  }
  function showResults(res, rw, last){
    const m = M(), el = $('#results'), s = S(), nextIdx = VM.MISSIONS.findIndex(x => x.id === m.id) + 1, next = VM.MISSIONS[nextIdx] && G.unlocked(VM.MISSIONS[nextIdx].id) ? VM.MISSIONS[nextIdx] : null;
    W.setOverlay(G.flows(s));
    el.innerHTML = `<div class="rs-head">${res.medal ? `<div class="medal big ${res.medal}"><span>${esc(t(res.medal))}</span></div>` : '<div class="medal big none"><span>↻</span></div>'}
        <div><small>${esc(t('mission'))} ${m.n} · ${esc(t(m.title))}</small><h2>${esc(t(res.medal ? (last ? (m.chapter === 'riyadh' ? 'chapterComplete' : 'chapterCompleteX') : 'missionComplete') : 'notYet'))}</h2><p>${esc(t('objective'))}: <b>${esc(String(res.primary.fmt))}</b> / ${res.primary.target} · ${esc(t('score'))} ${res.composite}</p></div></div>
      <div class="rs-body"><div class="rs-col">${measureRows(res.measures)}${res.capped ? `<p class="hint">${esc(t('cappedNote'))}</p>` : ''}</div>
        <div class="rs-col">${res.goal ? `<h4>${esc(t('goalMainTitle'))}</h4><ul class="rs-goal">${res.goal.sites.map(x => `<li class="${x.met ? 'met' : 'miss'} ${x.id === res.goal.weakest ? 'weak' : ''}"><span>${x.met ? '✓' : '✗'} ${esc(nodeName(x.id))} ${esc(t('accessToCore'))}</span><b>${Math.round(x.value)} / ${res.goal.target}</b><small>${esc(x.transitMin != null ? t('transitMinLbl', {m:x.transitMin}) : t('noTransitLbl'))}</small></li>`).join('')}</ul><p class="hint">${esc(t('goalLower'))} ${arw()} <b>${esc(String(res.primary.fmt))}</b> / ${res.primary.target}</p>` : ''}
          <h4>${esc(t('optThisAttempt'))}</h4><ul class="rs-stars">${m.optional.map((o, i) => { const mv = (res.optMeasures || [])[i]; return `<li class="${res.stars[i] ? 'on' : ''}">${res.stars[i] ? '★' : '☆'} ${esc(t(o.label))}${mv != null && o.unit ? ` — <b>${mv} ${esc(t(o.unit))}</b>` : ''}${o.note && res.goal ? `<small class="rs-note">${esc(t(o.note))}</small>` : ''}</li>`; }).join('')}</ul>${res.goal ? `<p class="hint">${esc(t('optionalSepNote'))}</p>` : ''}${savedBox(res)}
          ${res.hints.length ? `<h4>${esc(t('whyFail'))}</h4><ul class="rs-hints">${res.hints.map(h => `<li>${esc(t(h))}</li>`).join('')}</ul>` : ''}
          ${res.medal && window.VisionCompetitiveness ? (() => { const ds = window.VisionCompetitiveness.deltasFor(res).slice(0, 5); return ds.length ? `<h4>${esc(t('compEffect'))} <span class="badge sim">${esc(t('simulated'))}</span></h4><ul class="rs-comp">${ds.map(d => `<li><b>${esc(t(window.VisionCompetitiveness.OBSERVED.FACTORS.find(f => f.id === d.factor).name))} ${d.delta > 0 ? '+' : ''}${d.delta}</b> — ${esc(t(d.why))}</li>`).join('')}</ul><button class="link" id="rsLens">📊 ${esc(t('openLens'))}</button>` : ''; })() : ''}
          ${(() => { const s0 = S(), snap = s0.snapshots && s0.snapshots[1] ? JSON.parse(s0.snapshots[1]) : null; if (!snap) return '';
            const keys = ['mobility','trust','sustainability','resilience'].filter(k => snap.m && snap.m[k] != null && s0.m[k] != null);
            const built = s0.decisions.flatMap(d => d.actions.map(a => `${VM.ACTIONS[a.id].icon} ${t(G.aname(a.id))}${a.target ? ' · ' + targetName(a.id, a.target) : ''}`));
            return `<div class="cmp-grid board">
              <section><h4>1 · ${esc(t('cmpBuilt'))}</h4><ul class="plain">${built.slice(0, 6).map(x => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}${built.length > 6 ? `<li class="hint">+${built.length - 6}</li>` : ''}</ul></section>
              <section><h4>2 · ${esc(t('cmpChanged'))}</h4><ul class="causes">${keys.map(k => `<li><span>${esc(t(k))}</span><b>${Math.round(snap.m[k])} → ${Math.round(s0.m[k])}</b></li>`).join('')}<li><span>${esc(t('budget'))}</span><b>◆${snap.budget.toFixed(1)} → ◆${s0.budget.toFixed(1)}</b></li></ul></section>
              <section><h4>3 · ${esc(t('cmpFactors'))}</h4><p class="hint">${res.medal ? esc(t('seeCompEffect')) : esc(t('noFactorChange'))}</p></section>
              <section><h4>4 · ${esc(t('cmpEarned'))}</h4><p>${res.medal ? esc(t(res.medal)) + (rw.gained ? ' · ✦ +' + rw.gained : '') : esc(t('noReward'))}</p></section>
              <section><h4>5 · ${esc(t('cmpNext'))}</h4><p>${esc(res.next ? t(res.next) : res.hints && res.hints[0] ? t(res.hints[0]) : next ? t(next.title) : t('allCityMissions'))}</p></section></div>`; })()}
          <h4>${esc(t('rewards'))}</h4><p class="rs-reward">${rw.gained ? '✦ ' + esc(t('newPoints', {n:rw.gained})) : esc(t('noNewPoints'))}${rw.bonus ? ' · ✦ +' + rw.bonus : ''}</p>
          ${res.medal ? `<p class="rs-tease">➜ ${esc(t(m.tease))}</p>` : ''}</div></div>
      <div class="row-btns">${res.medal && next ? `<button class="primary" id="rsNext">${esc(t('nextMission'))} ${G.lang() === 'ar' ? '◂' : '▸'}</button>` : ''}
        <button class="${res.medal ? 'secondary' : 'primary'}" id="rsReplay">${esc(t('replay'))}</button><button class="secondary" id="rsWhat">${esc(t('whatIf'))}</button>
        <button class="secondary" id="rsShare">${esc(t('share'))}</button><button class="secondary" id="rsUp">✦ ${esc(t('upgrades'))} (${G.profile.points})</button><button class="link" id="rsMap">${esc(t('chapterMap'))}</button></div>`;
    el.classList.remove('hidden');
    if ($('#rsNext')) $('#rsNext').onclick = () => { el.classList.add('hidden'); G.startMission(next.id); };
    $('#rsReplay').onclick = () => { el.classList.add('hidden'); G.startMission(m.id, s.daily ? {daily:s.daily} : {}); };
    $('#rsWhat').onclick = () => whatIfPicker(res);
    $('#rsShare').onclick = () => G.share(res, s);
    $('#rsUp').onclick = () => G.showUpgrades(() => showResults(res, {gained:0, bonus:0}, last));
    if ($('#rsLens')) $('#rsLens').onclick = () => G.showLens('factors');
    $('#rsMap').onclick = () => { el.classList.add('hidden'); G.showChapter(m.chapter); };
    const r = G.nodePos('core'); if (!res.medal) W.cam(.35, .8, 3.8, r[0], r[1], .7);
  }
  function whatIfPicker(res){
    const el = $('#results');
    const turns = res.decisions.filter(d => d.actions.length);
    el.innerHTML = `<div class="sheet-head"><b>${esc(t('whatIf'))}</b><button class="icon-btn" id="wiClose">✕</button></div><p class="hint">${esc(t('whatIfPick'))}</p>
      <ul class="wi-list">${turns.map(d => `<li><div><b>${esc(t(M().storm ? 'phase' : 'turn'))} ${d.turn}</b><small>${d.actions.map(a => `${VM.ACTIONS[a.id].icon} ${esc(t(G.aname(a.id)))}${a.target ? ' · ' + esc(targetNameSafe(a.id, a.target)) : ''}`).join(' · ')}</small></div><button class="secondary sm" data-rw="${d.turn}">${esc(t('rewindHere'))}</button></li>`).join('') || `<li>${esc(t('noActions'))}</li>`}</ul>`;
    $('#wiClose').onclick = () => showResults(res, {gained:0, bonus:0}, ['m5','w2','n2','e2','s2','k1'].includes(M().id));
    $$('#results [data-rw]').forEach(b => b.onclick = () => { const tn = +b.dataset.rw; if (!VM.rewind(tn)) return; ui.whatIf = {orig:res, turn:tn}; ui.runMeta.whatIf = ui.whatIf; G.runMeta = ui.runMeta; ui.hazardAnim = null; el.classList.add('hidden'); enterHud(); G.saveRun(); G.toast(t('whatIfBanner', {n:tn})); });
  }
  function targetNameSafe(id, tg){ try { return targetName(id, tg); } catch(e) { return tg; } }
  function showCompare(a, b, rw){
    const el = $('#results'), keys = Object.keys(a.measures);
    const col = (r, title) => `<div class="cmp-col"><h4>${esc(title)}</h4><div class="medal ${r.medal || 'none'}"><span>${r.medal ? esc(t(r.medal)) : '↻'}</span></div><small class="cmp-medal">${esc(t(r.medal || 'none'))}</small><p>${esc(t('score'))} <b>${r.composite}</b> · ${esc(String(r.primary.fmt))}</p>${measureRows(r.measures)}
      <p class="cmp-strat">${r.decisions.filter(d => d.actions.length).map(d => `<b>${d.turn}</b> ${d.actions.map(x => VM.ACTIONS[x.id].icon + ' ' + esc(t(G.aname(x.id)))).join(', ')}`).join('<br>')}</p></div>`;
    el.innerHTML = `<div class="sheet-head"><b>${esc(t('compare'))}</b></div><p class="hint">${esc(t('whatIfDone'))} ${esc(t('keepBest'))}</p><div class="cmp">${col(a, t('original'))}${col(b, t('alternative'))}</div>
      <div class="row-btns"><button class="primary" id="cmpOk">${esc(t('continue'))}</button><button class="secondary" id="cmpShare">${esc(t('share'))}</button></div>`;
    el.classList.remove('hidden'); ui.whatIf = null;
    $('#cmpOk').onclick = () => showResults(b, rw, ['m5','w2','n2','e2','s2','k1'].includes(M().id));
    $('#cmpShare').onclick = () => G.share(b, S());
  }

  /* ============================ PAUSE MENU =========================== */
  $('#mMenuBtn').onclick = () => {
    const pm = $('#pauseMenu'); pm.classList.toggle('hidden');
    pm.innerHTML = `<div class="sheet-card glass"><div class="sheet-head"><b>${esc(t('menu'))}</b><button class="icon-btn" id="pmClose">✕</button></div>
      <button class="secondary" id="pmRestart">${esc(t('restart'))}</button><button class="secondary" id="pmUp">✦ ${esc(t('upgrades'))}</button><button class="secondary" id="pmSet">⚙ ${esc(t('settings'))}</button><button class="secondary" id="pmQuit">${esc(t('quit'))}</button><button class="link" id="pmMain">${esc(t('backMenu'))}</button></div>`;
    $('#pmClose').onclick = () => pm.classList.add('hidden');
    $('#pmRestart').onclick = () => { pm.classList.add('hidden'); G.startMission(S().mission, S().daily ? {daily:S().daily, confirmed:true} : {confirmed:true}); };
    $('#pmUp').onclick = () => { pm.classList.add('hidden'); G.showUpgrades(() => {}); };
    $('#pmSet').onclick = () => { pm.classList.add('hidden'); G.showSettings(); };
    $('#pmQuit').onclick = () => { pm.classList.add('hidden'); W.onGroundClick(null); W.setHazard(null); G.showChapter(M().chapter); };
    $('#pmMain').onclick = () => { pm.classList.add('hidden'); W.onGroundClick(null); W.setHazard(null); G.showMenu(); };
  };
  addEventListener('keydown', e => {
    if ($('#mhud').classList.contains('hidden') || e.target.closest('input,textarea,select')) return;
    if (e.key === 'Escape') { if (ui.sel) clearSel(); else $('#report').classList.add('hidden'); }
    if (e.key === 'Enter' && !ui.busy && $('#results').classList.contains('hidden')) { if (!$('#report').classList.contains('hidden')) $('#rpOk').click(); else if (document.activeElement === document.body) endTurn(); }
  });
  addEventListener('resize', () => $('#causePop').classList.add('hidden'));

  /* =============================== BOOT ============================== */
  G.applyLang(); G.applyReduced();
  $('#skipBtn').onclick = G.skipCinematic;
  $('#langBtn').onclick = () => { G.profile.lang = G.lang() === 'ar' ? 'en' : 'ar'; G.saveProfile(); G.applyLang(); G.showMenu(); };
  $('#soundBtn').onclick = () => { G.profile.sound = !G.profile.sound; G.saveProfile(); $('#soundBtn').textContent = G.profile.sound ? '🔊' : '🔈'; };
  $('#soundBtn').textContent = G.profile.sound ? '🔊' : '🔈';
  $('#natBack').onclick = () => G.go('home');
  addEventListener('pagehide', () => { if (!$('#mhud').classList.contains('hidden')) G.saveRun(); });
  const params = new URLSearchParams(location.search);
  setTimeout(() => {
    if (params.has('national')) { G.openNational(); return; }
    G.cinematic(G.showMenu, G.profile.seenIntro || params.has('short'));
  }, 250);
})();
