// Vision Nexus 2030 — "Your first thriving neighbourhood": an optional guided introduction to the City Builder.
// It is the real City Builder (same tools, previews, rules, time and KPIs) running in an isolated tutorial world:
//   • its own save key (KEY below) — it never reads or writes the City Builder world, campaign, national worlds, mission runs
//     or challenge attempts, and never changes the profile's city record or the competitiveness events;
//   • a scenario setting, not a rule change: the regional grid has no spare power for this new district (gridPower 0), so the
//     homes need local generation on their own road network — the same rule as everywhere in the City Builder;
//   • each step advances only when the simulation state shows the real action was done (a connected road, zoned plots with
//     access, powered plots, residents who actually moved in, homes inside a park's walking reach).
// Completion is stored in the existing profile (profile.tutorial). A refresh mid-tutorial offers Resume / Restart / Skip.
(() => {
  'use strict';
  const G = window.VNP, VC = window.VisionCity; if (!G || !VC) return;
  const W = G.W, $ = s => document.querySelector(s), esc = G.esc, N = VC.N;
  const KEY = 'visionNexus2030.tutorial.v1', STEPS = ['camera', 'road', 'homes', 'power', 'time', 'park'];

  /* ================================ TEXT ================================ */
  const TX = {
    en:{
      title:'Your first thriving neighbourhood', step:'Step {n} of {t}', skip:'Skip tutorial', next:'Next', resume:'Resume', restart:'Start again',
      intro:'Let’s bring your first neighbourhood to life.',
      camera:'Look around: drag the map to orbit, scroll or pinch to zoom (right-drag or WASD pans). Move the camera once to continue.',
      road:'Choose the highlighted Road tool, then drag a short street east from the main road along the gold guide. Confirm with Build.',
      roadWhy:'A plot can only develop if its road joins the city network — the main road is that network.',
      roadIsolated:'This street does not touch the main road yet, so nothing on it can develop. Start or end it on the main road.',
      roadDone:'Connected: your street now joins the city network.',
      homes:'Choose Homes and drag along one side of your new street (the gold plots). Confirm with Build.',
      homesNoRoad:'Some of those plots have no road beside them and will never develop. Zone the plots that touch your street.',
      homesDone:'Homes zoned on {n} plots — but nothing is being built. The ⚡ markers show why: this new district has no electricity yet.',
      power:'Choose the Solar farm and place it on an empty plot that touches your street. Power travels along the road to the homes.',
      powerNoRoad:'That solar farm does not touch a road, so its power cannot reach the homes. Place it beside your street.',
      powerOther:'This power source is on a different road network from your homes. Place it beside your street.',
      powerShort:'The solar farm is supplying power, but not enough for every plot. Add a grid battery or another solar farm beside the street.',
      powerDone:'The ⚡ markers are gone: all {n} plots have power ({u} of {s} units in use).',
      time:'Start the clock: press 3× (or Space). Builders arrive on powered plots, and residents move in when homes are finished.',
      timeWait:'Month {m}: {b} plots under construction, {o} homes finished, {p} residents.',
      timeStuck:'Nothing is growing. Inspect a plot to see what it still needs: {why}',
      timeDone:'Residents: {p0} → {p}. Monthly balance: {n0} → {n} credits/month. {why} Lights are on in powered homes.',
      whyPos:'Residential tax from {p} residents now covers the upkeep of your street and solar farm.',
      whyNeg:'Residential tax from {p} residents covers part of the upkeep of your street and solar farm; the balance keeps improving as more homes fill.',
      park:'Make it a place people want to live: choose the Neighbourhood park and place it on an empty plot close to the homes. Parks serve homes within about 4 plots on foot.',
      parkFar:'That park is too far away: no home is within its walking reach. Place it closer to the homes.',
      parkDone:'Park opened. Land value of nearby homes: {l0} → {l}. Neighbourhood environment: {e0} → {e}. Shade trees now grow in the gardens it serves.',
      doneTitle:'Your first neighbourhood is thriving!',
      doneBody:'You connected a street, zoned homes, powered them with solar, watched residents arrive and opened a park — the same tools and rules you will use everywhere in the City Builder.',
      kpiNote:'Simulated in-game results with fictional credits — not official Vision 2030 or competitiveness statistics.',
      kRes:'Residents', kNet:'Monthly balance', kLand:'Land value near the park', kEnv:'Environment',
      contBuild:'Continue building', exploreMissions:'Explore missions',
      resumeAsk:'You have an unfinished tutorial (step {n} of {t}).', menuStart:'🎓 First neighbourhood — tutorial', menuResume:'🎓 Resume the tutorial (step {n} of {t})',
      pickTool:'Choose the highlighted tool first.', paused:'Time is paused for this step.', keyNote:'Placing on the map uses a mouse or touch; tools and buttons also work with the keyboard.'
    },
    ar:{
      title:'حيّك الأول المزدهر', step:'الخطوة {n} من {t}', skip:'تخطَّ الدرس', next:'التالي', resume:'استئناف', restart:'ابدأ من جديد',
      intro:'لنُحيِ حيّك الأول.',
      camera:'تجوّل في الخريطة: اسحب لتدوير الكاميرا، ومرّر أو قرّب بإصبعين للتكبير (السحب بالزر الأيمن أو WASD للتحريك). حرّك الكاميرا مرة واحدة للمتابعة.',
      road:'اختر أداة الطريق المميزة، ثم اسحب شارعًا قصيرًا شرقًا من الطريق الرئيسي على طول الدليل الذهبي. أكّد بالضغط على «ابنِ».',
      roadWhy:'لا تتطور القطعة إلا إذا اتصل طريقها بشبكة المدينة — والطريق الرئيسي هو هذه الشبكة.',
      roadIsolated:'هذا الشارع لا يلامس الطريق الرئيسي بعد، فلن يتطور عليه شيء. ابدأه أو أنهِه على الطريق الرئيسي.',
      roadDone:'تم الربط: شارعك متصل الآن بشبكة المدينة.',
      homes:'اختر «مساكن» واسحب على جانب واحد من شارعك الجديد (القطع الذهبية). أكّد بالضغط على «ابنِ».',
      homesNoRoad:'بعض هذه القطع لا يجاورها طريق ولن تتطور أبدًا. خصّص القطع الملاصقة لشارعك.',
      homesDone:'خُصّصت المساكن على {n} قطعة — لكن لا يُبنى شيء. علامات ⚡ تبيّن السبب: لا كهرباء في هذا الحي الجديد بعد.',
      power:'اختر «مزرعة شمسية» وضعها على قطعة فارغة ملاصقة لشارعك. تنتقل الكهرباء على طول الطريق إلى المساكن.',
      powerNoRoad:'هذه المزرعة الشمسية لا تلامس طريقًا، فلن تصل كهرباؤها إلى المساكن. ضعها بجوار شارعك.',
      powerOther:'مصدر الكهرباء هذا على شبكة طرق مختلفة عن مساكنك. ضعه بجوار شارعك.',
      powerShort:'المزرعة الشمسية تزوّد الكهرباء، لكنها لا تكفي كل القطع. أضف بطارية شبكة أو مزرعة شمسية أخرى بجوار الشارع.',
      powerDone:'اختفت علامات ⚡: جميع القطع الـ{n} لديها كهرباء ({u} من {s} وحدة مستخدمة).',
      time:'شغّل الزمن: اضغط 3× (أو المسافة). يصل البنّاؤون إلى القطع المزوّدة بالكهرباء، وينتقل السكان عند اكتمال المساكن.',
      timeWait:'الشهر {m}: {b} قطعة قيد البناء، و{o} مسكنًا مكتملًا، و{p} ساكنًا.',
      timeStuck:'لا شيء ينمو. افحص قطعة لترى ما ينقصها: {why}',
      timeDone:'السكان: {p0} ← {p}. الرصيد الشهري: {n0} ← {n} رصيد/شهر. {why} الأضواء مضاءة في المساكن الموصولة بالكهرباء.',
      whyPos:'ضريبة السكن من {p} ساكنًا تغطي الآن صيانة شارعك ومزرعتك الشمسية.',
      whyNeg:'ضريبة السكن من {p} ساكنًا تغطي جزءًا من صيانة شارعك ومزرعتك الشمسية؛ ويستمر الرصيد في التحسن مع امتلاء المزيد من المساكن.',
      park:'اجعله مكانًا يحب الناس العيش فيه: اختر «حديقة حي» وضعها على قطعة فارغة قريبة من المساكن. تخدم الحدائق المساكن ضمن نحو 4 قطع سيرًا على الأقدام.',
      parkFar:'هذه الحديقة بعيدة جدًا: لا يوجد مسكن ضمن مسافة المشي إليها. ضعها أقرب إلى المساكن.',
      parkDone:'افتُتحت الحديقة. قيمة أرض المساكن القريبة: {l0} ← {l}. بيئة الحي: {e0} ← {e}. تنمو الآن أشجار ظل في الحدائق المنزلية التي تخدمها.',
      doneTitle:'حيّك الأول مزدهر!',
      doneBody:'ربطت شارعًا، وخصّصت مساكن، وزوّدتها بالطاقة الشمسية، وشاهدت السكان يصلون، وافتتحت حديقة — بالأدوات والقواعد نفسها التي ستستخدمها في كل مكان في بناء المدينة.',
      kpiNote:'نتائج محاكاة داخل اللعبة بأرصدة خيالية — وليست إحصاءات رسمية لرؤية 2030 أو للتنافسية.',
      kRes:'السكان', kNet:'الرصيد الشهري', kLand:'قيمة الأرض قرب الحديقة', kEnv:'البيئة',
      contBuild:'تابع البناء', exploreMissions:'استكشف المهام',
      resumeAsk:'لديك درس تعليمي غير مكتمل (الخطوة {n} من {t}).', menuStart:'🎓 الحي الأول — درس تعليمي', menuResume:'🎓 استأنف الدرس (الخطوة {n} من {t})',
      pickTool:'اختر الأداة المميزة أولًا.', paused:'الزمن متوقف في هذه الخطوة.', keyNote:'الوضع على الخريطة يتم بالفأرة أو باللمس؛ وتعمل الأدوات والأزرار أيضًا بلوحة المفاتيح.'
    }
  };
  const tx = (k, v) => { let s = (TX[G.lang()] || TX.en)[k] ?? TX.en[k] ?? k; if (v) for (const [a, b] of Object.entries(v)) s = s.split('{' + a + '}').join(b); return s; };
  const num = v => (v >= 0 ? '+' : '') + (+v).toFixed(2);

  /* ============================== STATE ============================= */
  const tut = {active:false, step:0, from:'home', base:{}, result:null, msg:null, msgKind:'', timer:null, moved:false, focusDone:-1, waitFrom:null};
  const readSave = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && d.v === 1 ? d : null; } catch(e) { return null; } };
  const clearSave = () => { try { localStorage.removeItem(KEY); } catch(e) {} };
  const S = () => VC.state, m = () => VC.state.m;
  const ui = () => G.cityUI;

  // ---- reading the real simulation state
  const connected = u => { const M = m(); return M.comp[u] >= 0 && M.compGate[M.comp[u]]; };
  const myRoads = () => { const T = S().tiles, out = []; for (let u = 0; u < N * N; u++) if (T[u].k === 'r' && !T[u].art && connected(u)) out.push(u); return out; };
  const homes = () => { const T = S().tiles, out = []; for (let u = 0; u < N * N; u++) if (T[u].k === 'z' && T[u].zone === 'R') out.push(u); return out; };
  const hasRoad = u => (S().tiles[u].needs || []).some(n => n.k === 'road' && n.ok);
  const homesWithRoad = () => homes().filter(hasRoad);
  const facs = kind => { const T = S().tiles, out = []; for (let u = 0; u < N * N; u++) if (T[u].k === 'f' && (!kind || kind.includes(T[u].fac))) out.push(u); return out; };
  const occupied = () => homes().filter(u => S().tiles[u].st >= 3);
  const avgLand = list => list.length ? Math.round(list.reduce((a, u) => a + (S().tiles[u].lv0 || 0), 0) / list.length) : 0;
  const ij = u => [u % N, (u / N) | 0], at = (i, j) => i >= 0 && j >= 0 && i < N && j < N ? S().tiles[j * N + i] : null;

  // ---- gold guides: where a sensible next placement is, computed from the player's own layout
  function hintTiles(step){
    const T = S().tiles;
    if (step === 'road') { const p = []; for (let i = 7; i <= 16; i++) if (at(i, 14) && at(i, 14).k === 'e') p.push([i, 14]); return p.length >= 6 ? p : null; }
    if (step === 'homes') { const out = [], seen = new Set();
      for (const side of [-1, 1]) { for (const r of myRoads()) { const [i, j] = ij(r), q = at(i, j + side); if (q && q.k === 'e' && !seen.has(i + ',' + (j + side)) && !(at(i - 1, j + side) || {}).art) { seen.add(i + ',' + (j + side)); out.push([i, j + side]); } } if (out.length >= 4) break; }
      return out.slice(0, 8); }
    if (step === 'power') { const hs = new Set(homes()); let best = null, bs = -1;
      for (const r of myRoads()) { const [i, j] = ij(r); for (const [di, dj] of [[0,-1],[0,1],[1,0],[-1,0]]) { const q = at(i + di, j + dj); if (!q || q.k !== 'e' || hs.has((j + dj) * N + i + di)) continue; const sc = i; if (sc > bs) { bs = sc; best = [i + di, j + dj]; } } }
      return best ? [best] : null; }
    if (step === 'park') { const hs = homes(); let best = null, bs = 0;
      for (let u = 0; u < N * N; u++) { if (T[u].k !== 'e') continue; const [i, j] = ij(u); let c = 0; for (const h of hs) { const [a, b] = ij(h); if (Math.hypot(a - i, b - j) <= 4) c++; } if (c > bs) { bs = c; best = [i, j]; } }
      return best ? [best] : null; }
    return null;
  }

  /* ============================= STEPS ============================= */
  // Each step: tool to highlight (selector), what counts as done (from simulation state), live feedback for a wrong attempt.
  const STEP = {
    camera:{sel:null, done:() => tut.moved},
    road:{sel:'#cTools [data-tool="road"]', tool:'road',
      done:() => myRoads().length >= 3,
      why:() => { const P = ui().pending; if (P && P.tool === 'road' && P.p && P.p.newTiles && !P.p.connects) return tx('roadIsolated');
        const T = S().tiles; for (let u = 0; u < N * N; u++) if (T[u].k === 'r' && !T[u].art && !connected(u)) return tx('roadIsolated'); return null; }},
    homes:{sel:'#cTools [data-tool="zoneR"]', tool:'zoneR',
      done:() => homesWithRoad().length >= 3,
      why:() => { const P = ui().pending;
        if (P && P.tool === 'zoneR' && P.p && /no road access/i.test((P.p.info || {}).en || '')) return tx('homesNoRoad');
        return homes().length > homesWithRoad().length ? tx('homesNoRoad') : null; }},
    power:{sel:'#cTools [data-tool="solar"]', tool:'solar',
      done:() => { const h = homesWithRoad(); return h.length > 0 && h.every(u => S().tiles[u].pow); },
      why:() => { const P = ui().pending, M = m();
        if (P && ['solar','gas','battery'].includes(P.tool) && P.p && /No road access/.test((P.p.info || {}).en || '')) return tx('powerNoRoad');
        const gens = facs(['solar','gas']); if (!gens.length) return null;
        if (gens.every(u => M.access[u] < 0)) return tx('powerNoRoad');
        const hc = new Set(homesWithRoad().map(u => M.comp[M.access[u]])); if (gens.every(u => M.access[u] < 0 || !hc.has(M.comp[M.access[u]]))) return tx('powerOther');
        if (homesWithRoad().some(u => S().tiles[u].pow)) return tx('powerShort'); return null; }},
    time:{sel:'#cTop [data-speed="3"]', time:true,
      done:() => { const o = occupied().length, h = homesWithRoad().length; return m().pop > 0 && o >= 3 && (o >= Math.ceil(h * .75) || S().month - tut.base.month >= 12); },
      why:() => null},
    park:{sel:'#cTools [data-tool="park"]', tool:'park',
      done:() => occupied().some(u => S().tiles[u].cov && S().tiles[u].cov.park),
      why:() => { const parks = facs(['park']); return parks.length && !homes().some(u => S().tiles[u].cov && S().tiles[u].cov.park) && occupied().length ? tx('parkFar') : null; }}
  };

  /* ============================== CARD ============================== */
  function card(){ let el = $('#tutCard'); if (!el) { el = document.createElement('section'); el.id = 'tutCard'; el.className = 'tut-card glass'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); } return el; }
  function renderCard(){
    const el = card(), id = STEPS[tut.step], n = tut.step + 1, t = STEPS.length;
    const dots = STEPS.map((_, k) => `<i class="${k < tut.step ? 'done' : k === tut.step ? 'on' : ''}"></i>`).join('');
    const body = id === 'camera' ? `<p class="tut-lead">${esc(tx('intro'))}</p><p>${esc(tx('camera'))}</p>` : `<p>${esc(tx(id))}</p>${id === 'road' ? `<p class="tut-why">${esc(tx('roadWhy'))}</p>` : ''}`;
    el.innerHTML = `<div class="tut-head"><b>🎓 ${esc(tx('title'))}</b><span class="tut-step" aria-label="${esc(tx('step', {n, t}))}">${esc(tx('step', {n, t}))}</span></div>
      <div class="tut-dots" aria-hidden="true">${dots}</div>
      ${tut.result ? `<p class="tut-result">✓ ${esc(tut.result)}</p>` : ''}${body}
      ${tut.msg ? `<p class="tut-msg ${tut.msgKind}">${esc(tut.msg)}</p>` : ''}
      <div class="tut-btns">${id === 'camera' ? `<button class="primary sm" id="tutNext">${esc(tx('next'))}</button>` : ''}<button class="link" id="tutSkip">${esc(tx('skip'))}</button></div>`;
    el.dataset.step = id; el.classList.remove('hidden', 'finale');
    $('#tutSkip').onclick = skip; const nx = $('#tutNext'); if (nx) nx.onclick = () => { tut.moved = true; };
  }
  function setMsg(text, kind = 'warn'){ if (text === tut.msg) return; tut.msg = text; tut.msgKind = kind; renderCard(); }

  // one highlighted control at a time; other tools are dimmed (still usable)
  function highlight(){
    document.querySelectorAll('.tut-target').forEach(e => e.classList.remove('tut-target'));
    const tools = $('#cTools'); if (tools) tools.classList.toggle('tut-focus', tut.active && !!STEP[STEPS[tut.step]].tool);
    const sel = tut.active && STEP[STEPS[tut.step]].sel, el = sel && $(sel); if (!el) return;
    el.classList.add('tut-target');
    if (tut.focusDone !== tut.step) { tut.focusDone = tut.step; try { el.scrollIntoView({inline:'center', block:'nearest', behavior:'smooth'}); } catch(e) {} }
  }

  /* ============================== FLOW ============================== */
  const sessionOf = state => ({key:KEY, state,
    create:() => VC.newCity({seed:2030, anchors:[], gridPower:0, budget:40}),
    snapshot:() => ({v:1, step:tut.step, from:tut.from, base:tut.base, result:tut.result}),
    // hold back unrelated challenges, weather and warnings during the tutorial (they still exist in the full City Builder)
    events:ev => ev.filter(e => e.type === 'milestone' || e.type === 'built').map(e => ({...e, pause:false}))});

  function start(opts = {}){
    const saved = opts.resume ? readSave() : null;
    if (!saved) clearSave();
    tut.from = saved ? saved.from || 'home' : opts.from || (G.mode && G.mode !== 'city' ? G.mode : G.mode === 'city' ? 'city' : 'home');
    tut.step = saved ? Math.max(0, Math.min(STEPS.length - 1, saved.step | 0)) : 0; tut.base = saved ? saved.base || {} : {}; tut.result = saved ? saved.result || null : null;
    tut.msg = null; tut.moved = false; tut.focusDone = -1;
    G.leaveMode(() => {
      G.openCity(true, sessionOf(saved ? saved.city : null));
      tut.active = true; G.mode = 'city'; G.renderNav && G.renderNav('city');
      enterStep(true); clearInterval(tut.timer); tut.timer = setInterval(poll, 300);
    });
  }
  function enterStep(first){
    const id = STEPS[tut.step], U = ui();
    if (!STEP[id].time) U.speed = 0;                               // time runs only in the "advance time" step
    U.hint = hintTiles(id); tut.msg = null;
    if (id === 'homes') tut.base.homes = homesWithRoad().length;
    if (id === 'time') { tut.base.pop = m().pop; tut.base.net = m().budget.net; tut.base.month = S().month; }
    if (id === 'park') { tut.base.land = avgLand(occupied()); tut.base.env = m().env; }
    U.savedRev = -1; U.cutFlight = true;                            // write the new step soon; stop the opening flight from re-aiming the camera
    G.cityRender(); renderCard(); highlight();
    const g = G.cityGrid; if (g && id !== 'camera' && !(first && id === 'road')) { const c = focusFor(id); W.cam(.35, .78, id === 'time' ? 1.05 : .9, g.x0 + (c[0] + .5) * g.ts, g.z0 + (c[1] + .5) * g.ts, .55); }
    G.sfx && !first && G.sfx('complete');
  }
  function focusFor(id){ const hs = homes(); if (hs.length && id !== 'road') { const a = hs.map(ij), i = a.reduce((s, p) => s + p[0], 0) / a.length, j = a.reduce((s, p) => s + p[1], 0) / a.length; return [i, j]; } return [11, 14]; }

  function poll(){
    if (!tut.active) return;
    if (!G.cityActive() || !ui().session || ui().session.key !== KEY) { stop(); return; }   // the player left (mode switch): the tutorial save stays for Resume
    const id = STEPS[tut.step], st = STEP[id];
    highlight();
    if (st.done()) { complete(id); return; }
    // live feedback: a wrong tool, an invalid placement or a missing connection
    let w = st.why ? st.why() : null;
    if (!w && st.tool && ui().pending && ui().pending.tool !== st.tool && !(id === 'power' && ['gas','battery'].includes(ui().pending.tool))) w = tx('pickTool');
    if (id === 'time') { const M = m(), T = S().tiles, hs = homes(), b = hs.filter(u => T[u].st === 2).length, o = hs.filter(u => T[u].st >= 3).length;
      if (ui().speed === 0 && S().month === tut.base.month) w = null;
      else if (S().month - tut.base.month >= 14 && !o) { const t0 = hs.map(u => T[u]).find(t => (t.needs || []).some(n => !n.ok && n.k !== 'upgrade')); const n = t0 && t0.needs.find(n => !n.ok && n.k !== 'upgrade'); w = tx('timeStuck', {why:n ? G.t(n.why) : '—'}); }
      else { setMsg(tx('timeWait', {m:G.month(S().month, S().startYear), b, o, p:M.pop}), 'info'); return; } }
    if (w !== tut.msg) setMsg(w, 'warn');
  }
  function complete(id){
    const M = m();
    if (id === 'road') tut.result = tx('roadDone');
    if (id === 'homes') tut.result = tx('homesDone', {n:homesWithRoad().length});
    if (id === 'power') tut.result = tx('powerDone', {n:homesWithRoad().length, u:M.power.used.toFixed(1), s:M.power.supply.toFixed(1)});
    if (id === 'time') { ui().speed = 0; G.cityRender();
      tut.result = tx('timeDone', {p0:tut.base.pop, p:M.pop, n0:num(tut.base.net), n:num(M.budget.net), why:tx(M.budget.net >= 0 ? 'whyPos' : 'whyNeg', {p:M.pop})});
      ui().dayT = .9;                                              // a moment at dusk so the lit, powered homes are visible
      const c = focusFor('time'), g = G.cityGrid; if (!G.profile.reduced) W.burst(g.x0 + (c[0] + .5) * g.ts, g.z0 + (c[1] + .5) * g.ts); }
    if (id === 'park') { const l = avgLand(occupied().filter(u => S().tiles[u].cov.park)), l0 = tut.base.land;
      tut.final = {pop:M.pop, net:M.budget.net, land0:l0, land:l, env0:tut.base.env, env:M.env};
      tut.result = tx('parkDone', {l0, l, e0:tut.base.env, e:M.env}); finale(); return; }
    if (id === 'camera') tut.result = null;
    tut.step++; enterStep(false);
  }
  function finale(){
    tut.step = STEPS.length - 1; ui().hint = null; ui().dayT = .5; G.cityRender();
    G.profile.tutorial = {done:true, at:new Date().toISOString()}; G.saveProfile();
    const f = tut.final, el = card(); el.classList.add('finale'); el.dataset.step = 'done';
    document.querySelectorAll('.tut-target').forEach(e => e.classList.remove('tut-target')); const tools = $('#cTools'); if (tools) tools.classList.remove('tut-focus');
    el.innerHTML = `<div class="tut-head"><b>🎉 ${esc(tx('doneTitle'))}</b></div>
      <p class="tut-result">✓ ${esc(tut.result)}</p><p>${esc(tx('doneBody'))}</p>
      <dl class="tut-kpis"><div><dt>${esc(tx('kRes'))}</dt><dd>${f.pop}</dd></div><div><dt>${esc(tx('kNet'))}</dt><dd dir="ltr">${num(f.net)}</dd></div><div><dt>${esc(tx('kLand'))}</dt><dd dir="ltr">${f.land0} → ${f.land}</dd></div><div><dt>${esc(tx('kEnv'))}</dt><dd dir="ltr">${f.env0} → ${f.env}</dd></div></dl>
      <p class="tut-note">${esc(tx('kpiNote'))}</p>
      <div class="tut-btns"><button class="primary" id="tutCont">${esc(tx('contBuild'))}</button><button class="secondary" id="tutMis">${esc(tx('exploreMissions'))}</button></div>`;
    G.sfx && G.sfx('medal');
    const g = G.cityGrid, c = focusFor('park'); if (!G.profile.reduced) { const x = g.x0 + (c[0] + .5) * g.ts, z = g.z0 + (c[1] + .5) * g.ts; W.burst(x, z); setTimeout(() => W.burst(x + g.ts * 3, z), 450); setTimeout(() => W.burst(x - g.ts * 3, z), 900); W.cam(.6, .7, 1.25, x, z, .35); }
    tut.active = false; clearInterval(tut.timer);
    $('#tutCont').onclick = () => finish(() => G.openCity(false));
    $('#tutMis').onclick = () => finish(() => G.openMissions());
    setTimeout(() => $('#tutCont') && $('#tutCont').focus(), 60);
  }
  // Leave the tutorial world (its save is written once more by the City Builder, then removed) and open the next place.
  function finish(next){ hide(); G.leaveMode(() => { clearSave(); if (next) next(); else G.showMenu(); }); }
  function skip(){
    const done = G.profile.tutorial && G.profile.tutorial.done; G.profile.tutorial = {done:!!done, skipped:!done, at:new Date().toISOString()}; G.saveProfile();
    tut.active = false; clearInterval(tut.timer);
    const back = {home:() => G.showMenu(), missions:() => G.openMissions(), city:() => G.openCity(false), national:() => G.openNational()}[tut.from] || G.showMenu;
    finish(back);
  }
  function stop(){ tut.active = false; clearInterval(tut.timer); hide(); }
  function hide(){ const el = $('#tutCard'); if (el) el.classList.add('hidden'); document.querySelectorAll('.tut-target').forEach(e => e.classList.remove('tut-target')); const tools = $('#cTools'); if (tools) tools.classList.remove('tut-focus'); if (G.cityUI) G.cityUI.hint = null; }

  // camera movement by the player (not the scripted flight): drag, wheel, pinch or the keyboard camera keys
  const cv = $('#world'); let down = null;
  if (cv) { cv.addEventListener('wheel', () => { tut.moved = true; }, {passive:true});
    cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    cv.addEventListener('pointermove', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 24) tut.moved = true; });
    addEventListener('pointerup', () => { down = null; }); }
  addEventListener('keydown', e => { if (tut.active && /^(w|a|s|d|q|e|\+|-|=|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/i.test(e.key) && !(e.target.closest && e.target.closest('input,select,textarea'))) tut.moved = true; });

  /* ======================= ENTRY POINTS ======================= */
  const progressOf = () => { const d = readSave(); return d && !(G.profile.tutorial && G.profile.tutorial.done && !d.replay) ? d : null; };
  // A new player has no progress anywhere: no medals or attempts, no City Builder world, no mission run, no national world.
  function isNewPlayer(){
    const q = new URLSearchParams(location.search); if (q.get('tutorial') === 'off' || q.get('debug') === '1') return false;   // developer captures and automated checks
    if (G.profile.tutorial) return false;
    if (Object.keys(G.profile.missions || {}).length || G.profile.city || (G.profile.points || 0) > 0) return false;
    try { if (G.citySummary && G.citySummary()) return false; if (G.loadRun && G.loadRun()) return false; if (window.VisionSaves && window.VisionSaves.list(localStorage).length) return false; } catch(e) {}
    return true;
  }
  function offerResume(d){
    const el = card(); el.classList.remove('hidden', 'finale'); el.dataset.step = 'resume';
    el.innerHTML = `<div class="tut-head"><b>🎓 ${esc(tx('title'))}</b></div><p>${esc(tx('resumeAsk', {n:(d.step | 0) + 1, t:STEPS.length}))}</p>
      <div class="tut-btns"><button class="primary sm" id="tutRes">${esc(tx('resume'))}</button><button class="secondary sm" id="tutRe">${esc(tx('restart'))}</button><button class="link" id="tutSk">${esc(tx('skip'))}</button></div>`;
    $('#tutRes').onclick = () => start({resume:true}); $('#tutRe').onclick = () => start({from:d.from || 'home'});
    $('#tutSk').onclick = () => { hide(); clearSave(); const done = G.profile.tutorial && G.profile.tutorial.done; G.profile.tutorial = {done:!!done, skipped:!done, at:new Date().toISOString()}; G.saveProfile(); G.showMenu(); };
    setTimeout(() => $('#tutRes') && $('#tutRes').focus(), 60);
  }
  // after the opening flight: resume an unfinished tutorial, start it for a brand-new player, or show the menu
  G.afterIntro = () => { const d = progressOf(); if (d) { G.showMenu(); offerResume(d); return; } if (isNewPlayer()) { start({from:'home'}); return; } G.showMenu(); };
  G.startTutorial = opts => { hide(); start(opts || {}); };
  G.tutorialLink = () => { const d = progressOf(); return `<button class="link" id="tutBtn">${esc(d ? tx('menuResume', {n:(d.step | 0) + 1, t:STEPS.length}) : tx('menuStart'))}</button>`; };
  G.bindTutorialLink = () => { const b = $('#tutBtn'); if (b) b.onclick = () => { const d = progressOf(); start(d ? {resume:true} : {from:'home'}); }; };
  G.afterCityHUD = () => { if (tut.active) highlight(); };   // the City Builder re-renders its tools and top bar often (every month): keep the highlight
  G.tutorial = tut;   // read-only inspection for tests
  window.VisionTutorial = {KEY, STEPS, start:G.startTutorial, isNewPlayer, state:() => ({active:tut.active, step:STEPS[tut.step], stepIndex:tut.step, msg:tut.msg, result:tut.result, final:tut.final || null, hint:G.cityUI && G.cityUI.hint})};
})();
