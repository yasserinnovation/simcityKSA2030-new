// Vision Nexus 2030 — UI controller.
// Reads VisionSim state, renders HUD panels, and forwards player commands.
// All game rules live in sim.js; all 3D drawing lives in engine.js.
(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const D = window.VISION_DATA, SIM = window.VisionSim, W = window.VisionWorld;
  if (!W || !SIM) return;
  SIM.setWorld(W);

  const MONTH_MS = 4000;                                  // one strategic month at 1×
  const SV = window.VisionSaves;   // one save per world (saves.js): campaign · sandbox · challenge-<id>
  let migration = {migrated:false}; try { migration = SV.migrate(localStorage); } catch(e) {}
  const G_UP = -0.06;
  const KPI_DEF = [
    {k:'momentum', label:'Vision momentum', unit:'%'},
    {k:'budget', label:'Investment capacity', unit:'B'},
    {k:'trust', label:'Public trust', unit:'%'},
    {k:'resilience', label:'Resilience', unit:'%'},
    {k:'expo', label:'Expo 2030 readiness', unit:'%'}
  ];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const P = id => D.projects.find(p => p.id === id);
  const fmt = (v, d=0) => (Math.round(v * 10**d) / 10**d).toFixed(d);
  const rgb = c => `rgb(${c.map(v => Math.round(v*255)).join(',')})`;

  const ui = {
    started:false, speed:1, acc:0, selected:null, filter:'all', search:'', layers:new Set(['logistics']),
    tool:null, readiness:false, drillFor:null, lastFrame:performance.now(), msgHold:0, droneFollow:false
  };
  const S = () => SIM.state;

  /* ============================== START ============================== */
  const chosenSlot = () => { const mode = $('input[name=mode]:checked').value; return mode === 'challenge' ? 'challenge-' + $('#challengePick').value : mode; };
  $('#beginBtn').onclick = () => {
    const slot = chosenSlot(), existing = savedWorld(slot);
    if (existing) {   // only this world would be replaced: say which, and require an explicit choice (a second click never bypasses it)
      if ($('#natConfirm')) { $('#natConfirm').classList.add('pulse'); setTimeout(() => $('#natConfirm') && $('#natConfirm').classList.remove('pulse'), 600); return; }
      const others = listWorlds().filter(w => w.slot !== slot);
      const box = document.createElement('div'); box.id = 'natConfirm'; box.className = 'nat-confirm'; box.setAttribute('role', 'alertdialog');
      box.innerHTML = `<p>Starting a new ${esc(slotLabel(slot))} replaces your saved ${esc(slotLabel(slot))} (${esc(existing.detail)}).${others.length ? ` Your other saved worlds are not affected: ${esc(others.map(w => w.label).join(', '))}.` : ''}</p><div><button class="primary sm" id="natYes">Replace ${esc(slotLabel(slot))}</button><button class="secondary sm" id="natKeep">Keep it — continue ${esc(slotLabel(slot))}</button><button class="link" id="natCancel">Cancel</button></div>`;
      $('.intro-actions').after(box);
      $('#natYes').onclick = () => { box.remove(); startNew(slot, true); };
      $('#natKeep').onclick = () => { box.remove(); VisionNational.loadSaved(slot); };
      $('#natCancel').onclick = () => box.remove();
      return;
    }
    startNew(slot, false);
  };
  function startNew(slot, replacing){
    if ($('#natConfirm')) $('#natConfirm').remove();
    if (replacing) try { SV.retire(localStorage, slot); } catch(e) {}   // one-step backup of the world being replaced
    const mode = $('input[name=mode]:checked').value, difficulty = $('input[name=difficulty]:checked').value;
    SIM.init({mode, difficulty, challenge: $('#challengePick').value}); S().slot = slot;
    enterGame(); autosave();
  }
  $('#challengePick').onchange = () => { $('input[name=mode][value=challenge]').checked = true; };
  function enterGame(){
    ui.started = true; ui.selected = null; ui.speed = 0; ui.acc = 0;   // planning pause: time never runs until the player chooses
    ui.tool = null; ui.readiness = false; syncSpeed();
    $('#intro').classList.add('exit'); setTimeout(() => $('#intro').classList.add('hidden'), 900);
    $('#hud').classList.remove('hidden'); $('#mandateOverlay').classList.add('hidden'); $('#reviewCard').classList.add('hidden'); if ($('#natConfirm')) $('#natConfirm').remove();
    if (window.VNP && VNP.renderNav) VNP.renderNav('national');
    W.setSelectable(true);   // projects on the map are clickable only in the National Simulation
    for (const id of ['navigator','dock']) { $('#' + id).classList.add('collapsed'); const b = $(`[data-collapse="${id}"]`); if (b) b.setAttribute('aria-expanded', 'false'); }   // national planning starts with the country visible; existing buttons reopen panels
    ['#challengePanel','#challengeTop','#unitBar'].forEach(s => $(s).classList.add('hidden')); ['#navigator','#bottombar'].forEach(s => $(s).classList.remove('hidden'));
    W.onGroundClick(null); W.setHazard(null); W.setEntities([]); W.setDynamicLabels([]);
    const st = S(); st.slot = SV.slotOf(st); $('#modeTag').textContent = `${SIM.DIFFICULTY[st.difficulty].label.toUpperCase()} · ${slotLabel(st.slot).toUpperCase()}`;
    buildKPIs(); buildTimeline(); refreshAll();
    if (st.mode === 'challenge') { const c = SIM.CHALLENGES[st.onlyChallenge]; openReadiness(); setMessage(`${c.brief} It begins around ${SIM.dateOf(c.month)} — place units now for higher readiness.`, 'EARLY SIGNAL'); }
    else { W.start(); setMessage('Planning pause — time is stopped. Select a project, assign crews and press Start, then press 1× to run time.', 'FIRST STEP'); }
  }

  /* ============================ SIM EVENTS ============================ */
  const LABELS = {success:'COMPLETE', action:'IN MOTION', cause:'CAUSE CHAIN', signal:'EARLY SIGNAL', advisory:'ADVISORY', challenge:'NATIONAL CHALLENGE', warn:'CAPACITY', start:'MANDATE', end:'MANDATE', opportunity:'OPPORTUNITY'};
  SIM.on((type, data) => {
    if (!ui.started) return;
    if (type === 'log') { if (data.kind !== 'action' || performance.now() > ui.msgHold) setMessage(data.text, LABELS[data.kind] || 'KINGDOM MOTION', data.kind !== 'action'); }
    if (type === 'change') { renderDock(); renderNavigator(); renderTimeline(); renderSignal(); pushWorld(); if (ui.readiness || S().challenge) { renderUnitBar(); renderChallengePanel(); } }
    if (type === 'month') { refreshAll(); opportunities(); autosave(); }
    if (type === 'change') autosaveSoon();
    if (type === 'advisory' || type === 'recovery') { renderSignal(); renderTimeline(); }
    if (type === 'challengeStart') startLiveUI();
    if (type === 'challengeEnd') endLiveUI(data);
    if (type === 'end') showEnd(data);
  });
  function refreshAll(){ renderKPIs(); renderNavigator(); renderDock(); renderTimeline(); renderSignal(); pushWorld(); updateDate(); }

  /* =============================== KPIs =============================== */
  function buildKPIs(){
    $('#kpis').innerHTML = KPI_DEF.map(d => `<button class="kpi" data-kpi="${d.k}" role="listitem" title="Why is this changing?"><small>${d.label}</small><span class="kpi-row"><strong>0</strong><em>${d.unit}</em><i class="trend"></i><svg class="spark" viewBox="0 0 60 18" preserveAspectRatio="none" aria-hidden="true"><polyline points="" /></svg></span></button>`).join('');
    $$('[data-kpi]').forEach(b => b.onclick = e => { e.stopPropagation(); toggleDrill(b.dataset.kpi, b); });
  }
  function renderKPIs(){
    const st = S();
    for (const d of KPI_DEF) {
      const el = $(`[data-kpi="${d.k}"]`); if (!el) continue;
      const v = st.kpi[d.k].value, h = st.hist[d.k], prev = h[Math.max(0, h.length - 4)] ?? v, delta = v - prev, hasHist = h.length >= 2;
      el.querySelector('strong').textContent = fmt(v);
      // A change indicator (and sparkline) only once there is a real earlier month to compare with.
      const tr = el.querySelector('.trend'); tr.textContent = !hasHist ? '' : Math.abs(delta) < .3 ? '▬' : delta > 0 ? '▲' : '▼'; tr.className = 'trend ' + (!hasHist ? 'none' : Math.abs(delta) < .3 ? 'flat' : delta > 0 ? 'up' : 'down');
      el.querySelector('.spark').style.visibility = hasHist ? '' : 'hidden';
      const lo = Math.min(...h), hi = Math.max(...h), span = Math.max(1, hi - lo);
      el.querySelector('polyline').setAttribute('points', h.map((y, i) => `${(i / Math.max(1, h.length - 1) * 60).toFixed(1)},${(16 - (y - lo) / span * 14).toFixed(1)}`).join(' '));
      el.classList.toggle('warn', (d.k === 'budget' && v < 5) || (d.k === 'trust' && v < 40) || (d.k === 'resilience' && v < 35) || (d.k === 'expo' && v < 40));
    }
    if (ui.drillFor) renderDrill();
  }
  function toggleDrill(k, anchor){
    if (ui.drillFor === k) { ui.drillFor = null; $('#kpiDrill').classList.add('hidden'); return; }
    ui.drillFor = k; const r = anchor.getBoundingClientRect(), dr = $('#kpiDrill');
    dr.style.left = Math.min(innerWidth - 370, Math.max(8, r.left - 40)) + 'px'; dr.style.top = (r.bottom + 8) + 'px';
    dr.classList.remove('hidden'); renderDrill();
  }
  function renderDrill(){
    const st = S(), k = ui.drillFor, def = KPI_DEF.find(d => d.k === k), K = st.kpi[k];
    const chains = st.log.filter(l => l.chain).slice(-3).reverse();
    $('#kpiDrill').innerHTML = `<div class="drill-head"><b>${def.label}</b><span>${fmt(K.value, k==='budget'?1:0)}${def.unit}${k!=='budget'?` → ${fmt(K.target)}${def.unit} target`:''}</span></div>
      <p class="drill-note">${k==='budget'?'Capacity rises with revenue from operating assets and falls as packages, operations and maintenance spend.':k==='expo'?'Each Expo-critical project’s forecast finish compared with October 2030.':'The value is the sum of these causes; it moves toward the target each month.'}</p>
      <ul class="contrib">${K.contrib.map(c => `<li class="${c.v>=0?'pos':'neg'}"><span>${esc(c.label)}</span><b>${c.v>=0?'+':''}${fmt(c.v,1)}</b></li>`).join('')}</ul>
      ${chains.length ? `<p class="drill-note"><b>Recent cause chains</b></p><ul class="chains">${chains.map(c => `<li>${c.chain.map(esc).join(' <i>→</i> ')}</li>`).join('')}</ul>` : ''}`;
  }
  document.addEventListener('click', e => { if (ui.drillFor && !e.target.closest('#kpiDrill') && !e.target.closest('[data-kpi]')) { ui.drillFor = null; $('#kpiDrill').classList.add('hidden'); } });

  /* ======================== PORTFOLIO NAVIGATOR ======================= */
  $('#navSearch').oninput = e => { ui.search = e.target.value.toLowerCase(); renderNavigator(); };
  $$('#navFilters button').forEach(b => b.onclick = () => { ui.filter = b.dataset.filter; $$('#navFilters button').forEach(x => x.classList.toggle('active', x === b)); renderNavigator(); });
  function renderNavigator(){
    if (!ui.started) return;
    const rows = D.projects.map(p => ({p, s: SIM.projectSummary(p.id)})).filter(({p, s}) => {
      if (ui.search && !(p.name + ' ' + p.region).toLowerCase().includes(ui.search)) return false;
      switch (ui.filter) {
        case 'attention': return s.health === 'waiting' || s.health === 'blocked';
        case 'ready': return s.health === 'ready'; case 'active': return s.health === 'active' || s.health === 'waiting';
        case 'operating': return s.health === 'operating'; case 'expo': return s.expoCritical; default: return true;
      }
    });
    const rank = {waiting:0, blocked:1, ready:2, active:3, idle:4, operating:5};
    if (ui.filter === 'all' && !ui.search) rows.sort((a, b) => rank[a.s.health] - rank[b.s.health] || (b.s.expoCritical - a.s.expoCritical));
    $('#navCount').textContent = rows.length;
    const list = $('#projectList'), scroll = list.scrollTop;
    const HEALTH = {waiting:'Waiting', blocked:'Blocked', ready:'Ready', active:'Active', idle:'Idle', operating:'Operating'};
    list.innerHTML = rows.map(({p, s}) => `<button class="project-item h-${s.health}${ui.selected===p.id?' active':''}" data-project="${p.id}" aria-pressed="${ui.selected===p.id}" title="${esc(s.status)}">
      <span class="pi-main"><b>${esc(p.name)}${s.expoCritical?' <em class="expo" title="Expo 2030-critical">★</em>':''}</b></span>
      <span class="pi-meta"><span class="pk" title="Stage: work packages complete">${s.done}/6</span><span class="pi-status"><span class="health"></span><span>${HEALTH[s.health] || s.health}</span></span></span></button>`).join('') || '<p class="empty">No projects match. Clear the search or pick another filter.</p>';
    list.scrollTop = scroll;
    $$('#projectList [data-project]').forEach(b => b.onclick = () => selectProject(b.dataset.project));
  }
  function selectProject(id, focus=true){
    ui.selected = id; ui.drillFor = null; $('#kpiDrill').classList.add('hidden');
    $$('[data-region]').forEach(b => b.classList.remove('active'));
    if (focus) W.focusProject(P(id));
    if (ui.speed > 0 && !S().challenge) { ui.speed = 0; syncSpeed(); setMessage('Paused while you decide — press 1× to resume time.', 'PLANNING PAUSE'); }
    $('#dock').classList.remove('collapsed'); $('[data-collapse="dock"]').setAttribute('aria-expanded', 'true');
    if (innerWidth < 900) { $('#navigator').classList.add('collapsed'); $('[data-collapse="navigator"]').setAttribute('aria-expanded', 'false'); }
    renderNavigator(); renderDock(); pushWorld();
    const it = $(`#projectList [data-project="${id}"]`); if (it) it.scrollIntoView({block:'nearest'});
  }
  W.onSelect(p => { if (ui.started && !ui.tool) selectProject(p.id); });
  // Clicking downtown Riyadh (the skyline or its label) opens the Riyadh planning view; it is a place, not a project.
  W.onPlace(id => { if (!ui.started || ui.tool) return;
    // A city or district on a regional plan: move in on it and say which projects are there (the Riyadh skyline opens its region).
    const q = window.VisionLayout && VisionLayout.places[id];
    if (q) { W.focusPoint(q.x, q.z, 1.6, .9); const reg = VisionLayout.REGION_VIEWS[q.region], names = q.projects.map(pid => P(pid) && P(pid).name).filter(Boolean);
      setMessage(`${q.name.en} — ${reg ? reg.name.en : ''}. ${names.length ? 'Projects here: ' + names.join(', ') + '.' : 'No national project here yet.'}`, q.name.en.toUpperCase()); return; }
    const b = $(`[data-region="${id}"]`); if (b) b.onclick(); else W.focusRegion(id);
    setMessage('Riyadh planning view — pick a district on the map or in the project list.', 'RIYADH'); });
  // Region names on the national view take you into that region (same as the region buttons).
  W.onRegion(id => { const b = $(`#regionBar [data-region="${id}"], [data-region="${id}"]:is(button)`); if (b && b.offsetParent) b.onclick(); else W.focusRegion(id); });

  /* ========================= OPERATIONS DOCK ========================== */
  function renderDock(){
    if (!ui.started) return;
    const body = $('#dockBody'), st = S(), scroll = body.scrollTop;
    if (!ui.selected) renderNational(body, st); else renderProjectDock(body, st);
    body.scrollTop = scroll;
  }
  function renderProjectDock(body, st){
    const p = P(ui.selected), s = SIM.projectSummary(p.id);
    $('#dockKicker').textContent = `${p.icon} · ${p.region.toUpperCase()}${s.expoCritical?' · EXPO-CRITICAL':''}`;
    $('#dockTitle').textContent = p.name;
    const views = SIM.KEYS.map(k => SIM.packageView(p.id, k));
    const done = views.filter(v => v.status === 'done'), open = views.filter(v => v.status !== 'done');
    const sug = SIM.DIFFICULTY[st.difficulty].guidance ? SIM.suggestion() : null;
    body.innerHTML = `
      <div class="proj-status h-${s.health}"><span class="health"></span><span>${esc(s.status)}</span><button class="link" id="dockBack">National view</button></div>
      <p class="proj-desc">${esc(p.challenge)}.</p>
      <ol class="ladder">${views.map(v => `<li class="st-${v.status}" title="${esc(v.name)}: ${v.status}"><span></span>${esc(v.name.split(/[ ,&]/)[0])}</li>`).join('')}</ol>
      ${done.length ? `<p class="done-line">✓ Completed: ${done.map(v => esc(v.name)).join(' · ')}</p>` : ''}
      ${open.map(v => packageCard(p, v, sug)).join('') || '<p class="empty">All six packages are complete. This project is operating — keep it maintained from the national view.</p>'}`;
    $('#dockBack').onclick = () => { ui.selected = null; W.clearSelection(); renderDock(); renderNavigator(); };
    wirePackageCards(p);
  }
  function packageCard(p, v, sug){
    const f = v.forecast, status = {ready:'Ready', locked:'Waiting on prerequisites', active:'Active', scheduled:'Scheduled'}[v.status] || v.status;
    const isSug = sug && sug.pid === p.id && sug.k === v.k;
    const prereq = v.prereqs.length ? `<div class="prereqs">${v.prereqs.map(r => `<button class="pre ${r.done?'ok':'no'}" data-goto="${r.external?r.pid:''}" ${r.external?'':'disabled'} title="${r.external?'Go to the upstream project':''}">${r.done?'✓':'○'} ${esc(r.name)}</button>`).join('')}</div>` : '';
    const crew = v.crew.map(c => `<div class="crew"><span>${esc(c.label)}</span><span class="stepper"><button data-step="${c.pool}" data-d="-1" aria-label="Fewer ${esc(c.label)}">−</button><b>${c.assigned}</b><button data-step="${c.pool}" data-d="1" aria-label="More ${esc(c.label)}">+</button></span><small>need ${c.need} · ${c.free}/${c.total} free</small></div>`).join('');
    const mat = v.materials ? `<div class="mat"><label>Gateway <select data-gateway aria-label="Material gateway">${SIM.GATEWAYS.map(g => `<option value="${g.id}" ${g.id===v.materials.gateway?'selected':''}>${esc(g.name)} · ${g.cap}/mo</option>`).join('')}</select></label>
        <div class="bar"><i style="width:${v.materials.delivered/v.materials.need*100}%"></i><i class="transit" style="width:${v.materials.inTransit/v.materials.need*100}%"></i></div>
        <small>${v.materials.delivered}/${v.materials.need} loads on site · ${v.materials.inTransit} on the road · ≈${fmt(f.travel,1)} months per trip</small></div>` : '';
    const act = v.status === 'active' ? `<div class="bar prog"><i style="width:${v.progress*100}%"></i></div>` : '';
    const buttons = v.status === 'ready' ? `<button class="primary sm" data-start>Start now</button>` :
      v.status === 'active' ? `<button class="secondary sm" data-pause>Pause &amp; release crews</button>` :
      v.status === 'scheduled' ? `<button class="secondary sm" data-unschedule>Unschedule (${SIM.dateOf(v.startAt)})</button>` : '';
    const drag = v.status !== 'active';
    return `<article class="pkg st-${v.status}${isSug?' suggested':''}" data-pkg="${v.k}" draggable="${drag}">
      <header><b>${esc(v.name)}</b><span class="pill">${status}</span>${isSug?'<span class="pill sug">Suggested</span>':''}</header>
      ${v.reason ? `<p class="reason">${esc(v.reason)}</p>` : ''}
      ${prereq}${act}${crew}${mat}
      <p class="fc">${v.materials ? '' : `≈ ${fmt(f.lo,1)}–${fmt(f.hi,1)} months · ${f.conf}% confidence · `}${v.cost}B</p>
      ${v.side.length ? `<ul class="side">${v.side.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${v.downstream.length ? `<p class="unlocks">Unlocks: ${v.downstream.map(d => `<button class="link" data-goto="${d.pid}">${esc(d.name)}</button>`).join(', ')}</p>` : ''}
      <footer>${buttons}${drag?'<span class="drag-hint">⠿ drag onto the timeline to schedule</span>':''}</footer></article>`;
  }
  function wirePackageCards(p){
    $$('#dockBody [data-pkg]').forEach(card => {
      const k = card.dataset.pkg;
      card.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const v = SIM.packageView(p.id, k).crew.find(c => c.pool === b.dataset.step); SIM.setAssign(p.id, k, b.dataset.step, v.assigned + (+b.dataset.d)); });
      const st = card.querySelector('[data-start]'); if (st) st.onclick = () => { const r = SIM.start(p.id, k); if (!r.ok) setMessage(r.why, 'CAPACITY'); };
      const pa = card.querySelector('[data-pause]'); if (pa) pa.onclick = () => SIM.pause(p.id, k);
      const un = card.querySelector('[data-unschedule]'); if (un) un.onclick = () => SIM.unschedule(p.id, k);
      const gw = card.querySelector('[data-gateway]'); if (gw) gw.onchange = () => SIM.setGateway(p.id, gw.value);
      card.querySelectorAll('[data-goto]').forEach(b => { if (b.dataset.goto) b.onclick = () => selectProject(b.dataset.goto); });
      card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', JSON.stringify({pid:p.id, k})); e.dataTransfer.effectAllowed = 'move'; $('#timeline').classList.add('drop-ready'); });
      card.addEventListener('dragend', () => $('#timeline').classList.remove('drop-ready', 'drop-over'));
    });
  }
  function renderNational(body, st){
    $('#dockKicker').textContent = 'OPERATIONS DOCK'; $('#dockTitle').textContent = 'National capacity';
    const grid = SIM.gridHeadroom(), sug = SIM.DIFFICULTY[st.difficulty].guidance ? SIM.suggestion() : null;
    const pending = st.programs.filter(p => !p.done);
    body.innerHTML = `
      ${sug ? `<button class="suggest" data-goto="${sug.pid}">Suggested next: <b>${esc(P(sug.pid).name)} · ${esc(SIM.TEMPLATE.find(t=>t.k===sug.k).name)}</b><small>High downstream value for Expo and connected projects.</small></button>` : ''}
      <h4>Shared capacity</h4>
      ${Object.entries(SIM.POOLS).map(([pool, label]) => { const t = SIM.total(pool), f = SIM.free(pool); return `<div class="pool cap-row"><span>${esc(label)}</span><b class="cap-n">${f}/${t}</b><div class="bar"><i style="width:${(t-f)/Math.max(1,t)*100}%"></i></div></div>`; }).join('')}
      ${pending.length ? `<p class="pending">In progress: ${pending.map(p => `${esc(SIM.PROGRAMS[p.id].name)} (ready ${SIM.dateOf(p.due)})`).join(' · ')}</p>` : ''}
      <details class="dock-more" data-sec="build" ${ui.open && ui.open.build ? 'open' : ''}><summary>Build capacity</summary><p class="hint">takes time — never buys progress</p>
      ${Object.entries(SIM.PROGRAMS).map(([id, pr]) => `<div class="program"><div><b>${esc(pr.name)}</b><small>${esc(pr.note)} ${pr.months?`${pr.months} months`:'Available now'} · ${pr.cost}B</small></div><button class="secondary sm" data-program="${id}" ${st.budget<pr.cost?'disabled':''}>Start</button></div>`).join('')}
      </details>
      <details class="dock-more" data-sec="ops" ${ui.open && ui.open.ops ? 'open' : ''}><summary>Maintenance, gateways and grid</summary>
      <h4>Preventive maintenance</h4>
      <div class="maint"><input type="range" min="0" max="100" value="${Math.round(st.maintenance*100)}" id="maintSlider" aria-label="Maintenance level" /><b>${Math.round(st.maintenance*100)}%</b></div>
      <small class="hint">Below about 62%, operating assets lose condition — reliability, trust and resilience fall gradually.</small>
      <h4>Material gateways</h4>
      ${SIM.GATEWAYS.map(g => { const l = st.gatewayLoad[g.id] || 0; return `<div class="pool"><span>${esc(g.name)}</span><div class="bar ${l>g.cap?'over':''}"><i style="width:${Math.min(100,l/g.cap*100)}%"></i></div><small>${l} loads requested · ${g.cap} slots/month</small></div>`; }).join('')}
      <h4>National grid headroom</h4>
      <div class="pool"><div class="bar"><i style="width:${Math.min(100,grid.use/grid.cap*100)}%"></i></div><small>${fmt(grid.free,1)} free of ${fmt(grid.cap,1)} · renewables, hydrogen and eastern energy projects add headroom once operating</small></div></details>`;
    body.querySelectorAll('details[data-sec]').forEach(d => d.ontoggle = () => { ui.open = ui.open || {}; ui.open[d.dataset.sec] = d.open; });
    body.querySelectorAll('[data-program]').forEach(b => b.onclick = () => { const r = SIM.startProgram(b.dataset.program); if (!r.ok) setMessage(r.why, 'CAPACITY'); });
    const ms = body.querySelector('#maintSlider'); if (ms) ms.onchange = () => SIM.setMaintenance(ms.value / 100);
    body.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => selectProject(b.dataset.goto));
  }
  $$('[data-collapse]').forEach(b => b.onclick = () => { const el = $('#' + b.dataset.collapse); const c = el.classList.toggle('collapsed'); b.setAttribute('aria-expanded', String(!c));
    if (!c && innerWidth < 900) for (const id of ['navigator','dock']) if (id !== b.dataset.collapse) { $('#' + id).classList.add('collapsed'); const o = $(`[data-collapse="${id}"]`); if (o) o.setAttribute('aria-expanded', 'false'); } });
  // Panels and the status line sit below the real top bar and above the real bottom bar, whatever their wrapped height.
  { const root = document.documentElement, fit = () => { const tb = $('.topbar'), bb = $('#bottombar');
      if (tb && tb.offsetHeight) root.style.setProperty('--top', tb.offsetHeight + 'px'); if (bb && bb.offsetHeight) root.style.setProperty('--bottom', bb.offsetHeight + 'px');
      // narrowed with both side panels open: keep the one in use (details when a project is selected), fold the other
      if (innerWidth < 900 && !$('#navigator').classList.contains('collapsed') && !$('#dock').classList.contains('collapsed')) { const id = ui.selected ? 'navigator' : 'dock';
        $('#' + id).classList.add('collapsed'); const b = $(`[data-collapse="${id}"]`); if (b) b.setAttribute('aria-expanded', 'false'); } };
    if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe($('.topbar')); ro.observe($('#bottombar')); } addEventListener('resize', fit); setTimeout(fit, 0); }
  // The strategic timeline folds down to its heading (remembered in this browser).
  { const bb = $('#bottombar'), tg = $('#tlToggle'), set = c => { bb.classList.toggle('tl-collapsed', c); tg.setAttribute('aria-expanded', String(!c)); };
    let c0 = false; try { c0 = localStorage.getItem('vn.timelineCollapsed') === '1'; } catch(e) {} set(c0 || innerWidth < 600);
    tg.onclick = () => { const c = !bb.classList.contains('tl-collapsed'); set(c); try { localStorage.setItem('vn.timelineCollapsed', c ? '1' : '0'); } catch(e) {} }; }

  /* ============================= TIMELINE ============================= */
  function buildTimeline(){
    const tl = $('#timeline'), N = S().mode === 'sandbox' ? 108 : SIM.CAMPAIGN_MONTHS;
    tl.dataset.months = N;
    tl.ondragover = e => { e.preventDefault(); tl.classList.add('drop-over'); $('#queueInfo').textContent = `Schedule for ${SIM.dateOf(monthAt(e.clientX))}`; };
    tl.ondragleave = () => tl.classList.remove('drop-over');
    tl.ondrop = e => { e.preventDefault(); tl.classList.remove('drop-over','drop-ready'); try { const {pid, k} = JSON.parse(e.dataTransfer.getData('text/plain')); SIM.schedule(pid, k, monthAt(e.clientX)); } catch(err) {} };
  }
  function monthAt(x){ const tl = $('#timeline'), r = tl.getBoundingClientRect(), N = +tl.dataset.months; return Math.max(S().month, Math.min(N-1, Math.round((x - r.left) / r.width * N))); }
  function renderTimeline(){
    if (!ui.started) return;
    const st = S(), tl = $('#timeline'), N = Math.max(+tl.dataset.months || 84, st.month + 12), pct = m => (m / N * 100).toFixed(2) + '%';
    tl.dataset.months = N;
    let h = '';
    for (let y = 0; y < N/12; y++) { h += `<span class="yr" style="left:${pct(y*12)}">${2024+y}</span><span class="band heat" style="left:${pct(y*12+5)};width:${pct(3)}" title="Summer heat: outdoor work −20%"></span><span class="band dust" style="left:${pct(y*12+2)};width:${pct(3)}" title="Dust season in Riyadh: outdoor work −10%"></span>`; }
    for (const m of SIM.HAJJ_MONTHS) if (m < N) h += `<span class="mk hajj" style="left:${pct(m)}" title="Hajj season ${SIM.dateOf(m)}">☾</span>`;
    h += `<span class="mk expo" style="left:${pct(SIM.EXPO_MONTH)}" title="Expo 2030 opens — October 2030">EXPO</span>`;
    for (const [id, c] of Object.entries(SIM.CHALLENGES)) { const known = st.challengesDone[id] || (st.advisory && st.advisory.id === id) || (st.challenge && st.challenge.id === id); if (known && c.month < N) h += `<span class="mk ch${st.challengesDone[id]?' done':''}" style="left:${pct(c.month)}" title="${esc(c.name)}">◆</span>`; }
    let queued = 0, active = 0;
    for (const p of D.projects) for (const k of SIM.KEYS) { const q = st.projects[p.id].pk[k]; if (q.status === 'active') active++; if (q.status === 'scheduled') { queued++; h += `<span class="mk sched" style="left:${pct(q.startAt)};background:${rgb(p.color)}" title="${esc(p.name)} · ${esc(SIM.TEMPLATE.find(t=>t.k===k).name)} — ${SIM.dateOf(q.startAt)}"></span>`; } }
    h += `<span class="fill" style="width:${pct(Math.min(st.month, N))}"></span><span class="now" style="left:${pct(Math.min(st.month, N-1))}"></span>`;
    tl.innerHTML = h;
    if (!tl.classList.contains('drop-over')) $('#queueInfo').textContent = `${active} active · ${queued} scheduled · drag a package here to schedule`;
  }
  function updateDate(){ const m = S().month; $('#dateValue').textContent = SIM.dateOf(m).toUpperCase() + (m >= SIM.CAMPAIGN_MONTHS ? ' · BEYOND 2030' : ''); document.querySelector('.clock-date small').textContent = m >= SIM.CAMPAIGN_MONTHS ? 'FUTURE CHAPTER' : 'STRATEGIC CALENDAR'; }

  /* ============================== LAYERS ============================== */
  $$('[data-layer]').forEach(b => b.onclick = () => { const l = b.dataset.layer; ui.layers.has(l) ? ui.layers.delete(l) : ui.layers.add(l); b.classList.toggle('active', ui.layers.has(l)); pushWorld(); });
  // The Riyadh Dry Port is drawn at its place on the district plan (same site as in Missions); travel times use real km.
  const gwPos = id => { const g = SIM.GATEWAYS.find(x => x.id === id), fixed = id === 'riyadh' && window.VisionLayout && VisionLayout.MISSION_SITES['riyadh:dryport']; return fixed ? [...fixed] : W.place(g.lon, g.lat, g.anchor); };
  function pushWorld(){
    if (!ui.started) return;
    const st = S(), ov = [];
    for (const p of D.projects) { const s = SIM.projectSummary(p.id); W.setProjectState(p.id, {done:s.done, doneKeys:s.doneKeys, active:s.active, progress:s.progress, health:s.health}); }
    if (ui.layers.has('logistics')) for (const p of D.projects) { const q = st.projects[p.id].pk.materials; if (q.status === 'active') ov.push({a:gwPos(q.gateway), b:[p.x, p.z], color:[1,.66,.2], flow:true}); }
    if (ui.layers.has('grid')) { const g = SIM.gridHeadroom(), col = g.free > 6 ? [.35,.85,.45] : g.free > 0 ? [1,.78,.25] : [.95,.35,.3];
      for (const src of ['renewables','eastern','hydrogen']) for (const dst of ['Riyadh','Jeddah','Dammam','Madinah','Tabuk']) { const a = P(src), c = D.cities.find(c => c.name === dst); if (Math.hypot(a.x-c.x, a.z-c.z) < 4.2) ov.push({a:[a.x,a.z], b:[c.x,c.z], color: st.projects[src].operational ? col : [.62,.62,.64], flow: st.projects[src].operational}); } }
    if (ui.layers.has('deps')) for (const p of D.projects) for (const k of SIM.KEYS) for (const r of SIM.packageView(p.id, k).prereqs) if (r.external) { const q = P(r.pid); ov.push({a:[q.x,q.z], b:[p.x,p.z], color: r.done ? [.35,.85,.45] : [.95,.4,.3], flow: !r.done}); }
    W.setOverlay(ov);
  }
  function pushConvoys(){
    const st = S(), mf = st.month + (ui.acc / MONTH_MS), list = [];
    if (ui.layers.has('logistics')) for (const c of st.convoys) { const f = (mf - c.t0) / Math.max(.05, c.t1 - c.t0); if (f < 0 || f > 1) continue; const a = gwPos(c.gw), p = P(c.pid), rot = Math.atan2(p.z - a[1], p.x - a[0]);
      for (let i = 0; i < Math.min(3, c.units); i++) { const ff = Math.max(0, f - i * .015); list.push({x:a[0] + (p.x - a[0]) * ff, z:a[1] + (p.z - a[1]) * ff, rot}); } }
    W.setConvoys(list);
  }

  /* ========================= SIGNALS & MESSAGES ======================= */
  function setMessage(text, label='KINGDOM MOTION', hold=true){ $('#positiveMessage').textContent = text; $('#ribbonLabel').textContent = label; if (hold) ui.msgHold = performance.now() + 7000; }
  function renderSignal(){
    const st = S(), chip = $('#signalChip');
    if (st.challenge) { chip.className = 'signal-chip hidden'; return; }
    if (st.advisory) { const c = SIM.CHALLENGES[st.advisory.id]; chip.className = 'signal-chip signal'; chip.innerHTML = `<b>◆ ${esc(c.short)}</b><small>expected ${SIM.dateOf(st.advisory.starts)} · ${(st.advisory.prepared||[]).length} units placed</small><span>Prepare ›</span>`; chip.onclick = openReadiness; return; }
    if (st.recovery) { chip.className = 'signal-chip recovery'; chip.innerHTML = `<b>Recovery window · until ${SIM.dateOf(st.recovery.until)}</b><small>${esc(st.recovery.fix)}</small>`; chip.onclick = null; return; }
    chip.className = 'signal-chip hidden';
  }
  let lastOpp = -10;
  function opportunities(){
    const st = S(); if (st.month - lastOpp < 4 || st.challenge || st.advisory) return;
    const ideas = [];
    const freeCivil = SIM.free('civil'), ready = D.projects.filter(p => SIM.KEYS.some(k => st.projects[p.id].pk[k].status === 'ready'));
    if (freeCivil >= 3 && ready.length) ideas.push(`${freeCivil} construction crews are free — ${ready[0].name} has a package ready to start.`);
    if (st.projects.metro.operational) ideas.push('Metro reliability is attracting more Expo visitors and lifting Expo readiness.');
    const quiet = SIM.GATEWAYS.find(g => (st.gatewayLoad[g.id] || 0) < g.cap / 3 && g.cap >= 6);
    if (quiet && D.projects.some(p => st.projects[p.id].pk.materials.status === 'active')) ideas.push(`${quiet.name} has spare slots — rerouting materials there could shorten queues.`);
    if (SIM.gridHeadroom().free < 4) ideas.push('A clean-energy project reaching operation would unlock waiting grid connections.');
    if (st.maintenance < .6) ideas.push('Raising preventive maintenance would stop operating assets losing condition.');
    if (ideas.length) { lastOpp = st.month; setMessage(ideas[st.month % ideas.length], 'OPPORTUNITY'); }
  }

  /* ========================= LIVE CHALLENGES ========================== */
  function currentChallengeDef(){ const st = S(); const id = st.challenge ? st.challenge.id : st.advisory ? st.advisory.id : null; return id ? {id, c:SIM.CHALLENGES[id]} : null; }
  // Timed-challenge assets are drawn at their place on the district plan (layout CHALLENGE_SITES). The simulation keeps
  // its own world positions for storm exposure and unit reach, so the challenge plays and scores exactly as before.
  // Units and dispatch points are drawn through a stateless sim→plan map, so a refresh redraws every unit exactly where
  // it was: the fitted piecewise map (layout planWarp: exact at each site, continuous) when it does not fold; otherwise,
  // for each unit, the similarity that carries its route (unit base → target) onto the drawn base and drawn target.
  const chSites = () => { const cd = currentChallengeDef(); return (cd && window.VisionLayout && VisionLayout.CHALLENGE_SITES[cd.id]) || {}; };
  const visAsset = a => chSites()[a.id] || a.pos;
  const maps = {};
  const simil = (a0, a1, b0, b1) => { const ax = a1[0] - a0[0], az = a1[1] - a0[1], bx = b1[0] - b0[0], bz = b1[1] - b0[1], d = ax * ax + az * az;
    if (d < 1e-12) return p => [b0[0] + p[0] - a0[0], b0[1] + p[1] - a0[1]];
    const c = (ax * bx + az * bz) / d, s = (ax * bz - az * bx) / d; return p => { const dx = p[0] - a0[0], dz = p[1] - a0[1]; return [b0[0] + c * dx - s * dz, b0[1] + s * dx + c * dz]; }; };
  function chMap(){
    const cd = currentChallengeDef(); if (!cd) return null; const sites = chSites(); if (!sites._base) return null;
    if (maps[cd.id]) return maps[cd.id];
    const as = SIM.challengeAssets(cd.id), base = [as.reduce((t, a) => t + a.pos[0], 0) / as.length + .35, as.reduce((t, a) => t + a.pos[1], 0) / as.length + .3];   // = sim baseFor()
    const pairs = [...as.map(a => ({s:a.pos, v:sites[a.id]})), {s:base, v:sites._base}], w = VisionLayout.planWarp(pairs);
    // global least-squares similarity (for open-ground points when the piecewise map would fold)
    const ms = [0, 1].map(k => pairs.reduce((t, p) => t + p.s[k], 0) / pairs.length), mv = [0, 1].map(k => pairs.reduce((t, p) => t + p.v[k], 0) / pairs.length);
    let n = 0, sc = 0, ss = 0; for (const p of pairs) { const dx = p.s[0] - ms[0], dz = p.s[1] - ms[1], vx = p.v[0] - mv[0], vz = p.v[1] - mv[1]; n += dx * dx + dz * dz; sc += dx * vx + dz * vz; ss += dx * vz - dz * vx; }
    const c = sc / n, sn = ss / n, det = c * c + sn * sn;
    const G = p => { const dx = p[0] - ms[0], dz = p[1] - ms[1]; return [mv[0] + c * dx - sn * dz, mv[1] + sn * dx + c * dz]; };
    const Gi = v => { const x = v[0] - mv[0], z = v[1] - mv[1]; return [ms[0] + (c * x + sn * z) / det, ms[1] + (-sn * x + c * z) / det]; };
    return maps[cd.id] = {w, folds:w.folds > 0, base, vbase:sites._base, G, Gi, sites, assets:as};
  }
  const drawnTarget = u => { const m = chMap(); if (!m) return u.target; if (!m.folds) return m.w.fwd(u.target);
    const a = u.assetId && m.assets.find(x => x.id === u.assetId); if (a) return [m.sites[a.id][0] + u.target[0] - a.pos[0], m.sites[a.id][1] + u.target[1] - a.pos[1]]; return m.G(u.target); };
  const unitAt = u => { const m = chMap(); if (!m) return u.pos; if (!m.folds || !u.target) return m.folds ? m.G(u.pos) : m.w.fwd(u.pos);
    return simil(m.base, u.target, m.vbase, drawnTarget(u))(u.pos); };
  const fromPlan = v => { const m = chMap(); return !m ? v : m.folds ? m.Gi(v) : m.w.inv(v); };
  const centroid = as => { const ps = as.map(visAsset); return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length]; };
  function openReadiness(){
    const cd = currentChallengeDef(); if (!cd) return;
    ui.readiness = true; const [cx, cz] = centroid(SIM.challengeAssets(cd.id));
    W.focusPoint(cx, cz, cd.c.anchor ? 3.6 : 3.0);
    $('#navigator').classList.add('hidden'); $('#challengePanel').classList.remove('hidden');
    $('#bottombar').classList.add('hidden'); $('#unitBar').classList.remove('hidden');
    renderUnitBar(); renderChallengePanel();
  }
  function closeReadiness(){
    ui.readiness = false; ui.tool = null; W.onGroundClick(null);
    if (!S().challenge) { $('#navigator').classList.remove('hidden'); $('#challengePanel').classList.add('hidden'); $('#bottombar').classList.remove('hidden'); $('#unitBar').classList.add('hidden'); W.setEntities([]); W.setDynamicLabels([]); renderSignal(); }
  }
  function startLiveUI(){
    ui.readiness = false; const cd = currentChallengeDef(), [cx, cz] = centroid(S().challenge.assets);
    W.focusPoint(cx, cz, cd.c.anchor ? 3.8 : 3.2, .78);
    $('#navigator').classList.add('hidden'); $('#challengePanel').classList.remove('hidden'); $('#challengeTop').classList.remove('hidden');
    $('#bottombar').classList.add('hidden'); $('#unitBar').classList.remove('hidden'); $('#reviewCard').classList.add('hidden');
    $('#hud').classList.add('live'); ui.dockWasOpen = !$('#dock').classList.contains('collapsed'); $('#dock').classList.add('collapsed');
    renderUnitBar(); renderChallengePanel(); renderChallengeTop(); renderSignal();
  }
  function endLiveUI(review){
    ui.tool = null; W.onGroundClick(null); W.setHazard(null); W.setEntities([]); W.setDynamicLabels([]);
    if (ui.droneFollow) { W.setDirectMode(false); ui.droneFollow = false; }
    $('#challengePanel').classList.add('hidden'); $('#challengeTop').classList.add('hidden'); $('#unitBar').classList.add('hidden');
    $('#navigator').classList.remove('hidden'); $('#bottombar').classList.remove('hidden');
    $('#hud').classList.remove('live'); if (ui.dockWasOpen) $('#dock').classList.remove('collapsed');
    const rc = $('#reviewCard'), timed = S().mode === 'challenge'; setTimeout(autosave, 0);   // save the finished result once the sim has marked it ended (it emits challengeEnd first)
    rc.innerHTML = `<header><div><small>OUTCOME &amp; LEARNING REVIEW</small><b>${esc(review.name)}</b></div><span class="score">${review.score}<small>/100</small></span></header>
      <div class="rv-grid"><div><b>${review.continuity}%</b><small>Service continuity</small></div><div><b>${review.readiness}%</b><small>Units prepared in advance</small></div>
      <div><b>${review.stabilization==null?'—':review.stabilization+'s'}</b><small>Time to stabilization</small></div><div><b>${review.supportedShare}%</b><small>Exposed people supported</small></div></div>
      <ul class="rv-assets">${review.assets.map(a => `<li><span>${esc(a.name)}</span><i style="--v:${a.minC}%"></i><b>${a.minC}%</b></li>`).join('')}</ul>
      ${review.side.length ? `<p class="rv-note"><b>Side effects:</b> ${review.side.map(esc).join(' ')}</p>` : ''}
      <p class="rv-note"><b>Learning:</b> ${review.learning.map(esc).join(' ')} <em>New capability: ${esc(review.lesson)} — adds resilience and faster unit response next time.</em></p>
      <footer>${timed ? '<button class="primary sm" id="rvRetry">Try another strategy</button><button class="secondary sm" id="rvMenu">Main menu</button>' : '<button class="secondary sm" id="rvClose">Continue the mandate</button>'}</footer>`;
    rc.classList.remove('hidden');
    const c = $('#rvClose'); if (c) c.onclick = () => { rc.classList.add('hidden'); W.overview(); };
    const r = $('#rvRetry'); if (r) r.onclick = () => {
      const st = S(), slot = st.slot, go = () => { try { SV.retire(localStorage, slot); } catch(e) {} SIM.init({mode:'challenge', difficulty:st.difficulty, challenge:review.id}); S().slot = slot; enterGame(); autosave(); };
      const msg = `Try another strategy restarts the ${slotLabel(slot)} and replaces this finished attempt (score ${review.score}/100). Your campaign and other saved worlds are not affected.`;
      if (window.VNP && VNP.confirmBox) VNP.confirmBox(msg, 'Start the challenge again', 'Keep this result', go); else go();
    };
    const m = $('#rvMenu'); if (m) m.onclick = () => { rc.classList.add('hidden'); window.VNP ? VNP.go('home') : location.reload(); };
    refreshAll();
  }
  function renderUnitBar(){
    const cd = currentChallengeDef(); if (!cd) return; const st = S(), live = !!st.challenge, counts = {};
    if (live) for (const u of st.challenge.units) { counts[u.type] = counts[u.type] || {n:0, idle:0, name:u.name, color:u.color}; counts[u.type].n++; if (!u.pos) counts[u.type].idle++; }
    else for (const u of cd.c.units) counts[u.type] = {n:u.n, idle:u.n - (st.advisory.prepared || []).filter(p => p.type === u.type).length, name:u.name, color:u.color};
    const html = `<div class="ub-title"><small>${live ? 'DISPATCH SUPPORT UNITS' : 'PRE-POSITION UNITS · READINESS'}</small><b>${ui.tool ? 'Click a place or service on the map · Esc to cancel' : live ? 'Select a unit type, then click the map' : 'Units placed now are already on site when it starts'}</b></div>
      ${Object.entries(counts).map(([t, c]) => `<button class="unit${ui.tool===t?' active':''}" data-unit="${t}"><i style="background:${rgb(c.color)}"></i><span><b>${esc(c.name)}</b><small>${live ? `${c.idle} at base · ${c.n - c.idle} deployed` : `${c.n - c.idle} of ${c.n} placed`}</small></span></button>`).join('')}
      ${live ? `<button class="unit drone-btn${ui.droneFollow?' active':''}" id="droneBtn"><span><b>Drone view</b><small>${ui.droneFollow?'Following the drone':'Fly with the survey drone'}</small></span></button>` : `<button class="unit" id="doneReady"><span><b>Done</b><small>Back to the portfolio</small></span></button>`}`;
    if (html === ui.unitHtml) return;           // avoid rebuilding buttons mid-click
    ui.unitHtml = html; $('#unitBar').innerHTML = html;
    $$('#unitBar [data-unit]').forEach(b => b.onclick = () => selectTool(b.dataset.unit));
    const db = $('#droneBtn'); if (db) db.onclick = toggleDrone;
    const dr = $('#doneReady'); if (dr) dr.onclick = closeReadiness;
  }
  function selectTool(type){
    ui.tool = ui.tool === type ? null : type;
    W.onGroundClick(ui.tool ? ({x, z}) => {
      const st = S(), cd = currentChallengeDef(); if (!cd) return false;
      const assets = st.challenge ? st.challenge.assets : SIM.challengeAssets(cd.id);
      const def = cd.c.units.find(u => u.type === ui.tool);
      let best = null, near = null, bd = .3;
      for (const a of assets) { const v = visAsset(a), d = Math.hypot(v[0] - x, v[1] - z); if (d < bd) { bd = d; near = a; if (def.supports.includes(a.kind)) best = a; } }
      if (near && !best) { setMessage(`${def.name} cannot support ${near.name} — try a ${near.kind === 'grid' ? 'grid crew' : 'matching unit'}.`, 'DISPATCH'); return true; }
      let pos = best ? [best.pos[0] + (Math.random() - .5) * .05, best.pos[1] + (Math.random() - .5) * .05] : fromPlan([x, z]);   // open ground: the simulated point drawn under the click
      // Open ground must not silently cover an asset whose simulated position lies under the click but is drawn elsewhere.
      if (!best) for (const a of assets) { const d = Math.hypot(pos[0] - a.pos[0], pos[1] - a.pos[1]); if (d < .18) { const k = .18 / Math.max(d, 1e-6); pos = d > 1e-6 ? [a.pos[0] + (pos[0] - a.pos[0]) * k, a.pos[1] + (pos[1] - a.pos[1]) * k] : [a.pos[0] + .18, a.pos[1]]; } }
      if (SIM.dispatch(ui.tool, pos, best ? best.id : null)) setMessage(best ? `${def.name} heading to ${best.name}.` : `${def.name} heading to the selected point.`, st.challenge ? 'DISPATCH' : 'READINESS');
      renderUnitBar(); renderChallengePanel(); return true;
    } : null);
    renderUnitBar();
  }
  function toggleDrone(){
    const st = S(); if (!st.challenge) return;
    const d = st.challenge.units.find(u => u.drone); if (!d) return;
    if (!d.pos) { setMessage('Dispatch the survey drone first: it is selected — click a place on the map.', 'FIELD VIEW'); if (ui.tool !== d.type) selectTool(d.type); return; }
    const dv = unitAt(d); ui.droneFollow = !ui.droneFollow; W.setDirectMode(ui.droneFollow, dv[0], dv[1]); renderUnitBar();
  }
  function renderChallengePanel(){
    const st = S(), cd = currentChallengeDef(); if (!cd) return;
    const live = st.challenge, c = cd.c, assets = live ? live.assets : SIM.challengeAssets(cd.id);
    const panel = $('#challengePanel');
    if (panel.dataset.state !== (live ? 'live' : 'ready') + cd.id || !panel.querySelector('.objectives')) {
      panel.dataset.state = (live ? 'live' : 'ready') + cd.id;
      panel.innerHTML = `<div class="panel-head"><div><small>${live ? 'LIVE NATIONAL CHALLENGE' : 'READINESS · EXPECTED ' + SIM.dateOf(st.advisory.starts).toUpperCase()}</small><b>${esc(c.name)}</b></div>${live?'':'<button class="collapse-btn" id="closeReady" title="Back to the portfolio">×</button>'}</div>
        <div class="panel-body"><p class="brief">${esc(c.brief)}</p><h4>Objectives · keep services running</h4>${live && chSites()._base ? `<p class="hint">${({dust:'Dust plumes and orange rings show where the storm reaches each service now.', rain:'Rain and orange rings show where the rain bands reach each service now.', heat:'Heat shimmer and orange rings show where the heat reaches each service now.'})[c.hazard.type] || ''}</p>` : ''}<ul class="objectives"></ul>
        ${live ? `<h4>Operations</h4>${c.toggles.map(t => `<label class="toggle"><input type="checkbox" data-toggle="${t.id}" /><span><b>${esc(t.name)}</b><small>${esc(t.note)}</small></span></label>`).join('')}` : '<p class="hint">Units placed during readiness start on site, so they skip the travel time. Strategic time keeps running.</p>'}</div>`;
      panel.querySelectorAll('[data-toggle]').forEach(i => i.onchange = () => SIM.setToggle(i.dataset.toggle, i.checked));
      const cr = $('#closeReady'); if (cr) cr.onclick = closeReadiness;
    }
    panel.querySelectorAll('[data-toggle]').forEach(i => { i.checked = !!(live && live.toggles[i.dataset.toggle]); });
    panel.querySelector('.objectives').innerHTML = assets.map(a => { const cont = live ? a.continuity : 100, cls = cont > 75 ? 'ok' : cont > 45 ? 'mid' : 'low';
      return `<li class="${cls}"><span class="o-name">${esc(a.name)}<small>${a.kind}${a.people?` · ${a.people>=1e6?(a.people/1e6).toFixed(1)+'M':(a.people/1000).toFixed(0)+'k'} people`:''}${live&&a.exposure>.1?' · <em>exposed</em>':''}${live&&a.protection>.3?' · supported':''}</small></span><span class="o-bar"><i style="width:${cont}%"></i></span><b>${Math.round(cont)}%</b></li>`; }).join('');
  }
  function renderChallengeTop(){
    const ch = S().challenge; if (!ch) return; const hz = ch.hazard || {intensity:0};
    const atRisk = ch.assets.filter(a => a.exposure > .1 && a.protection < .3).length, deployed = ch.units.filter(u => u.pos).length;
    $('#challengeTop').innerHTML = `<div><small>TIME REMAINING</small><b>${Math.max(0, Math.ceil(ch.duration - ch.t))}s</b></div><div><small>INTENSITY</small><b>${Math.round(hz.intensity*100)}%</b></div>
      <div class="${atRisk?'alert':''}"><small>SERVICES NEEDING SUPPORT</small><b>${atRisk}</b></div><div><small>UNITS DEPLOYED</small><b>${deployed}/${ch.units.length}</b></div><div><small>PREPARED IN ADVANCE</small><b>${ch.prepared}</b></div>`;
  }
  function pushChallengeWorld(){
    const st = S(), cd = currentChallengeDef();
    if (!cd || (!st.challenge && !ui.readiness)) return;
    const ents = [], labs = [], assets = st.challenge ? st.challenge.assets : SIM.challengeAssets(cd.id);
    for (const a of assets) { const cont = st.challenge ? a.continuity : 100, col = cont > 75 ? [.3,.85,.45] : cont > 45 ? [1,.75,.2] : [.95,.35,.3];
      const v = visAsset(a), dust = st.challenge && a.exposure > .08 ? a.exposure : 0;   // .08 = the simulation's own threshold for losing continuity
      ents.push({x:v[0], z:v[1], y:G_UP, color:col, size:13, ring:.16, ringColor:col, pulse:!!dust});
      if (dust) ents.push({x:v[0], z:v[1], y:G_UP - .02, color:[.86,.52,.22], size:0, ring:.04 + .1 * dust, ringColor:[.93,.55,.2]});   // exposure overlay: ring grows with simulated exposure
      labs.push({id:'a-' + a.id, text:`${a.name} · ${Math.round(cont)}%${dust ? ` · ${({rain:'rain', heat:'heat'})[cd.c.hazard.type] || 'dust'} ${Math.round(dust * 100)}%` : ''}`, x:v[0], z:v[1], cls:'asset ' + (cont > 75 ? 'ok' : cont > 45 ? 'mid' : 'low')}); }
    const units = st.challenge ? st.challenge.units.map((u, i) => ({u, key:'u' + i})).filter(x => x.u.pos) : (st.advisory.prepared || []).map((p, i) => ({key:'p' + i, u:{pos:p.pos, target:p.pos, assetId:p.assetId, color:cd.c.units.find(u => u.type === p.type).color}}));
    for (const {u} of units) { const v = unitAt(u), T = u.target ? drawnTarget(u) : null;
      ents.push({x:v[0], z:v[1], y:G_UP + .05, color:u.color, size:u.drone ? 10 : 12, path: T && Math.hypot(T[0]-v[0], T[1]-v[1]) > .01 ? T : null}); }
    // The dust is drawn from the simulation's per-site exposure (plumes where the storm reaches a service), with a light
    // ambient haze for intensity: no single drawn cloud could match the relocated sites, so none is implied.
    const hz = st.challenge && st.challenge.hazard, [hx, hz2] = centroid(assets);
    W.setEntities(ents); W.setDynamicLabels(labs);
    W.setHazard(hz ? {type:hz.type, intensity:hz.intensity, x:hx, z:hz2, r:1.05, plumes:assets.map(a => { const v = visAsset(a); return {x:v[0], z:v[1], e:a.exposure || 0}; })} : null);
    if (ui.droneFollow && st.challenge) { const d = st.challenge.units.find(u => u.drone && u.pos); if (d) { const v = unitAt(d); W.followPoint(v[0], v[1]); } }
  }

  /* ============================ OUTCOMES ============================== */
  function showEnd(end){
    if (end.type === 'challenge') return;   // timed challenges finish on the review card
    ui.speed = 0; syncSpeed();
    const o = end.outcome, term = end.type === 'term';
    $('#mandateEyebrow').textContent = term ? 'MANDATE COMPLETE · 2030' : 'MANDATE TRANSITION';
    $('#mandateTitle').innerHTML = term && o.tier !== 'Next chapter' ? `${esc(o.tier)}.<br /><span>Saudi Arabia’s transformation continues.</span>` : 'Your leadership mandate has concluded.<br /><span>Saudi Arabia’s transformation continues.</span>';
    $('#mandateText').innerHTML = term ? 'The 2030 term is complete. This is how the result was calculated, so you can see what shaped it.' : `${esc(end.reason)} stayed outside its protected range after the recovery window. The infrastructure delivered, skills developed and lessons learned carry into the next leadership chapter.`;
    $('#outcomeBreakdown').innerHTML = `<div class="oc-total"><b>${o.total}</b><small>${esc(o.tier)}</small></div>
      <div class="oc-cols"><div><h4>Balanced national outcome · 70%</h4>${Object.entries(o.comp).map(([k, v]) => `<div class="oc-row"><span>${esc(k)}</span><i style="--v:${v}%"></i><b>${Math.round(v)}</b></div>`).join('')}${o.balanceAdj?`<p class="hint">Balance adjustment ${fmt(o.balanceAdj,1)}: one pillar advanced by weakening another.</p>`:''}</div>
      <div><h4>Challenge readiness · 20%</h4><div class="oc-row"><span>Average challenge score</span><i style="--v:${o.readiness}%"></i><b>${Math.round(o.readiness)}</b></div>
      <h4>Resource stewardship · 10%</h4><div class="oc-row"><span>Budget efficiency</span><i style="--v:${o.efficiency}%"></i><b>${Math.round(o.efficiency)}</b></div>
      <h4>Protected thresholds</h4><p class="hint">${o.protectedOk ? '✓ Hajj safety, service continuity, public trust and financial sustainability are all within range.' : '○ At least one protected threshold was outside its range, so the tier is capped.'}</p></div></div>`;
    $('#mandateOverlay').classList.remove('hidden'); $('#continueBtn').focus();
  }
  $('#continueBtn').onclick = () => { SIM.continueSandbox(); $('#mandateOverlay').classList.add('hidden'); buildTimeline(); ui.speed = 1; syncSpeed(); refreshAll(); };
  $('#restartBtn').onclick = () => { $('#mandateOverlay').classList.add('hidden'); VisionNational.leave(); if (window.VNP) VNP.openNational(); };

  /* ============================ CONTROLS ============================== */
  $$('[data-region]').forEach(b => b.onclick = () => { ui.selected = null; W.focusRegion(b.dataset.region); $$('[data-region]').forEach(x => x.classList.toggle('active', x === b)); renderDock(); renderNavigator(); });
  function syncSpeed(){ $$('[data-speed]').forEach(x => x.classList.toggle('active', +x.dataset.speed === ui.speed)); }
  $$('[data-speed]').forEach(b => b.onclick = () => { ui.speed = +b.dataset.speed; syncSpeed(); });
  const syncQuality = () => { const hi = W.getQuality() === 'high'; $('#qualityBtn').textContent = hi ? 'HD' : 'LITE'; $('#qualityBtn').setAttribute('aria-pressed', String(hi)); };
  $('#qualityBtn').onclick = () => { W.setQuality(W.getQuality() === 'high' ? 'low' : 'high'); syncQuality(); };
  addEventListener('vision-quality', e => { syncQuality(); if (e.detail.auto) setMessage('Graphics switched to LITE for smoother play on this device. Press HD to restore shadows.', 'PERFORMANCE'); });
  $('#saveBtn').onclick = () => { if (autosave()) setMessage(`Mandate saved at ${SIM.dateOf(S().month)}. It also saves automatically every month and when you switch mode.`, 'SAVE'); else setMessage('Saving is not available in this browser mode.', 'SAVE'); };

  /* ============================ MODE SWITCH ============================ */
  // The national mandate saves automatically: every in-game month, shortly after each command, when you switch mode
  // and when the page closes. Leaving pauses time and restores the shared 3D world for the other modes.
  const INITIAL_PS = Object.fromEntries(D.projects.map(p => [p.id, {done:p.stage === 2 ? 3 : 1, doneKeys:p.stage === 2 ? ['design','site','materials'] : ['design'], progress:0, active:undefined, health:undefined}]));
  let saveSoon = 0;
  function slotLabel(slot){ if (slot === 'campaign') return 'Campaign'; if (slot === 'sandbox') return 'Sandbox'; const c = SIM.CHALLENGES[String(slot).replace(/^challenge-/, '')]; return 'Timed challenge: ' + (c ? c.short : slot); }
  function describe(w){ return [SIM.dateOf(w.month), w.ended ? 'finished' : '', (SIM.DIFFICULTY[w.difficulty] || {}).label || ''].filter(Boolean).join(' · '); }
  function listWorlds(){ try { return SV.list(localStorage).map(w => ({...w, label:slotLabel(w.slot), detail:describe(w)})); } catch(e) { return []; } }
  function savedWorld(slot){ return listWorlds().find(w => w.slot === slot) || null; }
  // Setup screen: one Continue button per saved world, so the player picks exactly which world to open.
  function renderSavedWorlds(){
    let box = $('#savedWorlds'); if (!box) { box = document.createElement('div'); box.id = 'savedWorlds'; box.className = 'saved-worlds'; $('.intro-actions').before(box); }
    const ws = listWorlds();
    box.innerHTML = ws.length ? `<small>Saved worlds — each has its own save</small>${ws.map((w, i) => `<button class="${i ? 'secondary' : 'primary'} sm" data-world="${esc(w.slot)}">Continue ${esc(w.label)} · ${esc(w.detail)}</button>`).join('')}` : '';
    $$('#savedWorlds [data-world]').forEach(b => b.onclick = () => { if ($('#natConfirm')) $('#natConfirm').remove(); if (!VisionNational.loadSaved(b.dataset.world)) setMessage('That save could not be loaded.', 'SAVE'); });
    $('#beginBtn').textContent = ws.length ? 'Start new…' : 'Enter the Kingdom';
    $('#beginBtn').classList.toggle('primary', !ws.length); $('#beginBtn').classList.toggle('secondary', !!ws.length);
    $('#loadBtn').classList.add('hidden');
  }
  function autosave(){
    if (!S()) return false;
    try { SV.write(localStorage, S()); ui.savedMonth = S().month; $('#saveBtn').textContent = 'Saved ✓'; if (window.VNP && VNP.renderNav && ui.started) VNP.renderNav('national'); return true; } catch(e) { return false; }
  }
  function autosaveSoon(){ clearTimeout(saveSoon); saveSoon = setTimeout(() => { if (ui.started) autosave(); }, 1200); }
  window.VisionNational = {
    get active(){ return ui.started; },
    get hasSession(){ return !!S(); },
    worlds:listWorlds, slotLabel, migration:() => migration, prepareSetup:renderSavedWorlds,
    status(){ const st = S(); return st ? {date:SIM.dateOf(st.month), saved:ui.savedMonth === st.month, mode:st.mode, slot:st.slot, label:slotLabel(st.slot || SV.slotOf(st))} : null; },
    save:autosave,
    leave(){
      if (!ui.started) { $('#intro').classList.add('hidden'); return; }
      autosave(); clearTimeout(saveSoon);
      ui.started = false; ui.speed = 0; ui.selected = null; ui.tool = null; ui.readiness = false; ui.drillFor = null; syncSpeed(); W.setSelectable(false);
      ['#hud','#intro','#mandateOverlay','#kpiDrill','#reviewCard'].forEach(sel => $(sel) && $(sel).classList.add('hidden'));
      W.clearSelection(); for (const p of D.projects) W.setProjectState(p.id, INITIAL_PS[p.id]);
      W.setOverlay([]); W.setEntities([]); W.setDynamicLabels([]); W.setHazard(null); W.onGroundClick(null);
    },
    resume(){ if (!S()) return false; enterGame(); setMessage(`${slotLabel(S().slot)} resumed at ${SIM.dateOf(S().month)} — time is paused. Press 1× to continue.`, 'SAVE'); return true; },
    loadSaved(slot){ try { const raw = localStorage.getItem(SV.keyOf(slot)); if (!raw) return false; if (S() && ui.started) autosave(); SIM.load(raw); S().slot = slot; enterGame(); ui.savedMonth = S().month; setMessage(`${slotLabel(slot)} restored at ${SIM.dateOf(S().month)}.`, 'SAVE'); return true; } catch(e) { return false; } }
  };
  addEventListener('pagehide', () => { if (ui.started) autosave(); });
  let speedBefore = 1;
  addEventListener('keydown', e => {
    if (!ui.started || e.repeat || (e.target.closest && e.target.closest('input,select,textarea'))) return;
    if (e.code === 'Space') { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); if (ui.speed === 0) ui.speed = speedBefore || 1; else { speedBefore = ui.speed; ui.speed = 0; } syncSpeed(); }
    else if (e.key === 'Escape') { if (ui.tool) selectTool(ui.tool); else if (ui.readiness) closeReadiness(); else if (ui.selected) { ui.selected = null; W.clearSelection(); renderDock(); renderNavigator(); } else W.overview(); }
    else if (e.key.toLowerCase() === 'g') $('#qualityBtn').click();
  });

  /* ============================== LOOP ================================ */
  let uiTimer = 0;
  function loop(now){
    const dt = Math.min(250, now - ui.lastFrame); ui.lastFrame = now;
    const st = S();
    if (ui.started && st && !st.ended) {
      if (st.challenge) {
        const mult = ui.speed === 0 ? 0 : ui.speed >= 5 ? 2 : 1;           // live challenges run in real time (2× fast-forward)
        SIM.challengeTick(dt / 1000 * mult);
        uiTimer += dt; if (uiTimer > 250 && S().challenge) { uiTimer = 0; renderChallengePanel(); renderChallengeTop(); renderUnitBar(); }
      } else if (ui.speed > 0) {
        ui.acc += dt * ui.speed;
        let n = 0; while (ui.acc >= MONTH_MS && n < 6 && !S().challenge && !S().ended) { ui.acc -= MONTH_MS; n++; SIM.tickMonth(); }
        if (S().challenge) ui.acc = 0;
      }
    }
    if (ui.started && st) { pushChallengeWorld(); pushConvoys(); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
