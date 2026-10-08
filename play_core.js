// Vision Nexus 2030 — mission-mode shell: profile, language, audio, world scene, opening flight and menus.
(() => {
  'use strict';
  const W = window.VisionWorld, VM = window.VisionMissions, D = window.VISION_DATA, I = window.VISION_I18N;
  if (!W || !VM) return;
  VM.setWorld(W);
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const G = window.VNP = {W, VM, D, $, $$};
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  G.esc = esc;

  /* ============================ PROFILE ============================== */
  const STORE = 'visionNexus2030.profile.v4', RUN = 'visionNexus2030.run.v4';
  const blank = () => ({v:4, name:'', lang:'en', sound:true, reduced:false, seenIntro:false, points:0, upgrades:[], missions:{}, legacy:{}, daily:{}, weekly:{}});
  function loadProfile(){
    try { const raw = localStorage.getItem(STORE); const p = JSON.parse(raw);
      if (p && p.v === 4) { if (!p.build6) { try { localStorage.setItem(STORE + '.backup-v5', raw); } catch(e) {} p.build6 = true; p.city = p.city || null; } return Object.assign(blank(), p); } } catch(e) { try { const b = JSON.parse(localStorage.getItem(STORE + '.backup-v5')); if (b && b.v === 4) return Object.assign(blank(), b); } catch(e2) {} }
    return blank(); }
  G.profile = loadProfile();
  G.saveProfile = () => { try { localStorage.setItem(STORE, JSON.stringify(G.profile)); } catch(e) {} };
  G.saveRun = () => { try { const S = VM.state; if (S && !S.done) localStorage.setItem(RUN, JSON.stringify({ui:G.runMeta || {}, s:VM.serialize()})); else localStorage.removeItem(RUN); } catch(e) {} };
  G.loadRun = () => { try { return JSON.parse(localStorage.getItem(RUN)); } catch(e) { return null; } };
  G.clearRun = () => { try { localStorage.removeItem(RUN); } catch(e) {} };
  G.chapterOf = mid => VM.CHAPTERS.find(c => (c.missions || []).includes(mid));
  G.chapterUnlocked = ch => { if (ch.unlockAny) return ch.unlockAny.filter(id => (G.profile.missions[id] || {}).medal).length >= (ch.unlockCount || 1); return !ch.unlock || !!(G.profile.missions[ch.unlock] || {}).medal; };
  G.unlocked = mid => { const ch = G.chapterOf(mid); if (!ch || !G.chapterUnlocked(ch)) return false; const i = ch.missions.indexOf(mid); if (i <= 0) return true; const prev = G.profile.missions[ch.missions[i - 1]]; return !!(prev && prev.medal); };
  G.nextMission = () => VM.MISSIONS.find(m => G.unlocked(m.id) && !(G.profile.missions[m.id] || {}).medal) || VM.MISSIONS.filter(m => G.unlocked(m.id)).pop();
  const MEDAL_VAL = {bronze:1, silver:2, gold:3};
  G.MEDAL_VAL = MEDAL_VAL;
  // One-line summary of a saved mission record (best score, last attempt, stars banked vs only met) for mission selection.
  G.recordLine = pr => {
    if (!pr || !pr.attempts) return '';
    const parts = [];
    if (pr.bestScore != null) parts.push(G.t('bestScoreLbl', {b:pr.bestScore}));
    if (pr.last) { const k = (pr.last.stars || []).filter(Boolean).length;
      parts.push(G.t('lastAttemptLbl', {r:pr.last.medal ? G.t(pr.last.medal) : '✗', g:pr.last.goal != null ? `${pr.last.goal}/${pr.last.target}` : '—'}));
      if (k && !pr.last.medal) parts.push(G.t('metNotBanked', {k})); }
    else parts.push(G.t('attemptsLbl', {a:pr.attempts}));
    return parts.join(' · ');
  };

  /* ============================ LANGUAGE ============================= */
  G.lang = () => G.profile.lang || 'en';
  G.t = (k, vars) => { let s = typeof k === 'string' ? (I[G.lang()][k] ?? I.en[k] ?? k) : (k[G.lang()] || k.en); if (vars) for (const [a, b] of Object.entries(vars)) s = s.split('{' + a + '}').join(b); return s; };
  // Arabic names that live with the layout data (districts such as Dhahran or Al Khobar, region names, corridor names).
  let layoutArMap = null;
  const layoutAr = () => { if (layoutArMap) return layoutArMap; layoutArMap = {}; const LY = window.VisionLayout, add = n => { if (n && n.en && n.ar) layoutArMap[n.en] = n.ar; };
    if (LY) { Object.values(LY.places || {}).forEach(q => add(q.name)); Object.values(LY.REGION_VIEWS || {}).forEach(v => { add(v.name); add(v.heading && v.heading.text); }); (LY.planRoads || []).forEach(r => add(r.name)); (LY.CITY_ROADS || []).forEach(r => add(r.name)); }
    return layoutArMap; };
  G.applyLang = () => {
    const ar = G.lang() === 'ar';
    document.documentElement.lang = ar ? 'ar' : 'en'; document.documentElement.dir = ar ? 'rtl' : 'ltr'; document.body.classList.toggle('rtl', ar);
    W.relabel(base => ar ? (I.places[base] || I.places[base.toUpperCase()] || layoutAr()[base] || base) : base);
    $$('[data-i18n]').forEach(el => { el.textContent = G.t(el.dataset.i18n); });
  };
  G.month = (m, y) => `${I.months[G.lang()][((m % 12) + 12) % 12]} ${y + Math.floor(m / 12)}`;

  /* ============================== AUDIO ============================== */
  const AudioFx = { ctx:null,
    play(type){
      if (!G.profile.sound) return;
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); const c = this.ctx; if (c.state === 'suspended') c.resume();
        const seq = {click:[[660,.04]], select:[[520,.05],[780,.07]], commit:[[392,.08],[523,.12]], complete:[[523,.09],[659,.09],[784,.18]],
          medal:[[523,.11],[659,.11],[784,.11],[1047,.35]], warn:[[294,.12],[247,.18]], turn:[[440,.05],[554,.08]], storm:[[110,.6]]}[type] || [[600,.05]];
        let t0 = c.currentTime + .01;
        for (const [f, d] of seq) {
          const o = c.createOscillator(), g = c.createGain(); o.type = type === 'storm' ? 'sawtooth' : 'triangle'; o.frequency.value = f;
          g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(type === 'storm' ? .04 : .12, t0 + .01); g.gain.exponentialRampToValueAtTime(.001, t0 + d);
          if (type === 'storm') { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 400; o.connect(fl); fl.connect(g); } else o.connect(g);
          g.connect(c.destination); o.start(t0); o.stop(t0 + d + .02); t0 += d * .8;
        }
      } catch(e) {}
    }
  };
  G.sfx = t => AudioFx.play(t);
  G.aname = id => { const S = VM.state, m = S && VM.mission(S.mission); return (m && m.names && m.names[id]) || VM.ACTIONS[id].name; };

  /* ============================== TOAST ============================== */
  let toastT = 0;
  G.toast = (msg, kind='') => { const el = $('#toast'); el.textContent = msg; el.className = 'toast ' + kind; clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), 3800); };

  /* =========================== WORLD SCENE =========================== */
  const NP = {};
  G.nodePos = (id, board = VM.board) => { const key = board + ':' + id; if (NP[key]) return NP[key]; const n = VM.BOARDS[board].nodes[id]; if (!n) return [0, 0];
    if (n.project) { const p = D.projects.find(p => p.id === n.project); NP[key] = [p.x, p.z]; }
    else { const LY = window.VisionLayout, fixed = LY && LY.MISSION_SITES[key], q = W.place(n.lon, n.lat, n.anchor);   // mission-only sites: a set place on the plan, else nudged off footprints
      NP[key] = fixed ? [...fixed] : n.core || !LY ? q : LY.clearOf(q[0], q[1]); }
    return NP[key]; };
  const SITE_OFF = {academy:[-.1,-.11], research:[.11,-.12], warehouse:[.12,.04], wind:[-.12,-.1], hotel:[.1,.07], housing:[-.11,.08], park:[.09,-.1], retrofit:[-.08,-.07], hub:[.13,-.02], shelter:[-.06,.11], medic:[.03,.13], generator:[.12,.11], microgrid:[.12,.11],
    solar:[0,0], storage:[.02,.1], peaker:[-.14,.06], opened:[0,0]};
  const site = (kind, node, extra={}, board) => { const p = G.nodePos(node, board), o = SITE_OFF[kind] || [0,0]; return {kind, x:p[0] + o[0], z:p[1] + o[1], ...extra}; };
  G.worldPerKm = () => { const an = VM.BOARDS[VM.board].anchor, c = VM.NODE_DEF.core; const a = W.place(c.lon, c.lat, an), b = W.place(c.lon, c.lat + .1, an); return Math.hypot(a[0]-b[0], a[1]-b[1]) / 11.1; };

  // Everything the player built becomes part of the 3D world.
  G.sceneFrom = S => {
    const links = [], sites = [], lights = [];
    const L = (kind, a, b, progress=1) => links.push({kind, a:G.nodePos(a), b:G.nodePos(b), progress});
    const lightAt = (node, n) => { const p = G.nodePos(node); for (let i = 0; i < n; i++) { const a = i * 2.4, r = .03 + (i % 5) * .025; lights.push([p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, 3.6]); } };
    if (S) {
      for (const l of S.links) {
        if (l.kind === 'road') { if (l.widen) L('wide', l.a, l.b); continue; }
        const b = S.builds.find(b => b.target === l.id);
        if (l.built) L(l.kind, l.a, l.b); else if (b) L(l.kind, l.a, l.b, Math.max(.08, 1 - b.turnsLeft / b.dur));
      }
      for (const b of S.builds) {
        if (b.action === 'road') { const l = S.links.find(x => x.id === b.target); L('wide', l.a, l.b, Math.max(.1, 1 - b.turnsLeft / b.dur)); }
        const EN = VM.BOARDS[VM.board].energy || {site:'core', link:'core'};
        if (b.action === 'gridlink') L('power', EN.site, EN.link, Math.max(.1, 1 - b.turnsLeft / b.dur));
        const nodeKinds = {hotel:1, housing:1, park:1, retrofit:1, hub:1, academy:1, research:1, warehouse:1};
        if (nodeKinds[b.action]) sites.push(site(b.action, b.target, {progress:Math.max(.1, 1 - b.turnsLeft / b.dur)}));
        if (['solar','wind','storage','peaker'].includes(b.action)) sites.push(site(b.action, EN.site, {progress:Math.max(.1, 1 - b.turnsLeft / b.dur)}));
        if (b.project) { const pr = S.projects[b.target]; sites.push(site('hub', pr.node, {progress:Math.max(.1, (pr.stage + (1 - b.turnsLeft / b.dur)) / 3)})); }
      }
      const ENs = VM.BOARDS[VM.board].energy || {site:'core', link:'core'};
      if (S.gridlink) L('power', ENs.site, ENs.link);
      for (const [id, n] of Object.entries(S.nodes)) {
        if (n.hotelLv) { sites.push(site('hotel', id, {level:n.hotelLv})); lightAt(id, 14 * n.hotelLv); }
        if (n.shelter) sites.push(site('shelter', id)); if (n.medic) sites.push(site('medic', id));
        if (n.power) sites.push(site(n.power >= 2 ? 'microgrid' : 'generator', id));
      }
      for (const id of Object.keys(S.parks)) { sites.push(site('park', id)); lightAt(id, 6); }
      for (const id of Object.keys(S.housing)) { sites.push(site('housing', id)); lightAt(id, 12); }
      for (const id of Object.keys(S.retrofits)) sites.push(site('retrofit', id));
      for (const id of S.hubs) sites.push(site('hub', id));
      for (const id of (S.academies || [])) { sites.push(site('academy', id)); lightAt(id, 8); }
      if (S.research) sites.push(site('research', S.researchAt));
      for (const id of (S.warehouses || [])) sites.push(site('warehouse', id));
      if (S.invest && S.invest.opened) { const nd = VM.mission(S.mission).invest.node; sites.push(site('opened', nd)); lightAt(nd, 16); }
      if (S.solar) sites.push(site('solar', ENs.site, {level:S.solar})); if (S.wind) sites.push(site('wind', ENs.site, {level:S.wind})); if (S.storage) sites.push(site('storage', ENs.site, {level:S.storage})); if (S.peakers) sites.push(site('peaker', ENs.site));
      for (const p of Object.values(S.projects)) if (p.done) { sites.push(site('opened', p.node)); lightAt(p.node, 16); }
    } else {
      // Chapter legacy: the best result of every mission, together
      for (const [mid, lg] of Object.entries(G.profile.legacy)) {
        const bd = VM.boardOf(mid), NPb = id => G.nodePos(id, bd);
        for (const [kind, a, b] of lg.links) links.push({kind, a:NPb(a), b:NPb(b), progress:1});
        for (const [kind, node, lv] of lg.sites) { sites.push(site(kind, node, {level:lv || 1}, bd)); if (['hotel','housing','opened'].includes(kind)) { const p = NPb(node); for (let i = 0; i < 12; i++) lights.push([p[0] + Math.cos(i * 2.4) * (.03 + (i % 5) * .025), p[1] + Math.sin(i * 2.4) * (.03 + (i % 5) * .025), 3.6]); } }
        const ENl = VM.BOARDS[bd].energy; if (ENl && lg.sites.some(s => s[0] === 'solar' || s[0] === 'wind')) links.push({kind:'power', a:NPb(ENl.site), b:NPb(ENl.link), progress:1});
      }
    }
    return {links, sites, lights};
  };
  G.showScene = S => { const sc = G.sceneFrom(S); W.setMissionScene(sc); W.setMissionLights(sc.lights); };

  // Base Riyadh board: local roads with flowing traffic; transit with trains and buses.
  G.flows = (S, opts={}) => {
    const ov = [];
    if (!S) { // legacy / menu: gentle flows on built lines of every chapter
      for (const [mid, lg] of Object.entries(G.profile.legacy)) { const bd = VM.boardOf(mid);
        for (const [kind, a, b] of lg.links) if (kind !== 'wide') ov.push({a:G.nodePos(a, bd), b:G.nodePos(b, bd), road:kind === 'brt', color:kind === 'metro' ? [.8,.6,1] : [1,.7,.3], flow:true, n:6, speed:kind === 'metro' ? 2 : 1.2, both:true, noLine:true, size:4}); }
      for (const [a, b] of VM.BOARDS.riyadh.roads) ov.push({a:G.nodePos(a, 'riyadh'), b:G.nodePos(b, 'riyadh'), road:true, color:[.93,.88,.78], flow:true, n:4, speed:.9, both:true, size:2.6, y:W.ground + .012});
      return ov;
    }
    const lens = opts.lens;
    if (S.m.freight) for (const [o, f] of Object.entries(S.m.freight)) { if (!f.served) continue;
      const fl = S.links.find(l => l.kind === 'freight' && l.built && (l.a === o || l.b === o));
      const a = G.nodePos(o), b = G.nodePos(fl ? (fl.a === o ? fl.b : fl.a) : 'dryport');
      ov.push({a, b, color:f.mode === 'rail' ? [.25,.85,.8] : [1,.55,.25], flow:true, noLine:!fl, thick:!!fl, n:Math.min(14, 3 + Math.round(f.served * 2)), speed:f.mode === 'rail' ? 1.6 : .8, size:f.mode === 'rail' ? 5 : 4, y:W.ground + .03}); }
    // People moving around landmarks: more visitors, more walkers
    for (const [id, n] of Object.entries(S.nodes)) { const crowd = (n.visitors || 0) + (n.hotelLv || 0) * 8 + (S.parks[id] ? 10 : 0); if (crowd < 4) continue; const p = G.nodePos(id);
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + id.length, r = .05 + k * .02; ov.push({a:[p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r], b:[p[0] + Math.cos(a + 1.4) * r, p[1] + Math.sin(a + 1.4) * r], color:[[1,.95,.85],[.98,.8,.55],[.8,.9,1]][k], flow:true, noLine:true, n:Math.min(10, Math.round(crowd / 8) + 2), speed:.35, both:true, size:2.2, y:W.ground + .01}); } }
    for (const l of S.links) {
      const a = G.nodePos(l.a), b = G.nodePos(l.b);
      if (l.kind === 'road') {
        const vc = l.load / Math.max(.1, VM.linkCap(l));
        const col = l.closed ? [.95,.3,.25] : lens ? (vc < .6 ? [.35,.85,.45] : vc < .95 ? [1,.78,.25] : [.95,.35,.3]) : [.78,.72,.62];
        ov.push({a, b, road:true, color:col, dash:!!l.closed, thick:lens && !l.closed && vc >= .95, flow:!l.closed, n:Math.min(16, Math.round(l.load * 1.6)), speed:Math.max(.25, 1.2 - vc * .6), both:true, size:2.6, y:W.ground + .012});
      } else if (l.built && !l.closed && l.load > .05) {
        ov.push({a, b, road:l.kind === 'brt', color:l.kind === 'metro' ? [.85,.65,1] : [1,.72,.3], flow:true, noLine:true, n:Math.min(12, 2 + Math.round(l.load * 1.5)), speed:l.kind === 'metro' ? 2.2 : 1.3, both:true, size:l.kind === 'metro' ? 5 : 4.2, y:l.kind === 'metro' ? W.ground + .045 : W.ground + .012});
      }
    }
    return ov;
  };

  /* ========================= OPENING FLIGHT ========================== */
  let cineTimers = [], cineDone = null;
  G.cinematic = (onDone, short) => {
    const reduced = G.profile.reduced;
    $('#cine').classList.remove('hidden'); cineDone = onDone;
    const P = (lon, lat, a) => W.place(lon, lat, a), r = P(46.68, 24.71, 'Riyadh');
    W.setBeacons(false); W.setProjectLabels(false); G.showScene(null); W.setOverlay(G.flows(null));
    const cap = (k, cls='') => { const c = $('#cineCaption'); c.textContent = G.t(k); c.className = 'cine-caption show ' + cls; };
    const at = (ms, f) => cineTimers.push(setTimeout(f, reduced ? Math.min(ms, 300) : ms));
    if (short || reduced) {
      const s = P(44.5, 23.2); W.snapCam(-.2, .95, 9, s[0], s[1]); W.setNight(.15, true); cap('cineComp', 'comp');
      at(1400, () => { W.cam(.45, .72, 3.4, r[0], r[1], .5); cap('cine3'); W.setNight(.45); });
      at(3000, finish);
    } else {
      const j = P(38.4, 21.2); W.snapCam(-1.1, .5, 7.5, j[0], j[1]); W.setNight(0, true);
      at(80, () => { const c = P(39.4, 21.8); W.cam(-.75, .58, 4.2, c[0], c[1], .32); cap('cine1'); });
      at(3900, () => { const c = P(43.6, 23.9); W.cam(-.15, .95, 10.5, c[0], c[1], .3); cap('cineComp', 'comp'); W.setNight(.2); });
      at(7800, () => { W.cam(.45, .7, 3.2, r[0], r[1], .38); cap('cine3', 'gold'); W.setNight(.55); G.sfx('turn'); });
      at(12200, finish);
    }
  };
  function finish(){
    cineTimers.forEach(clearTimeout); cineTimers = [];
    $('#cine').classList.add('hidden'); G.profile.seenIntro = true; G.saveProfile();
    W.camSpeed(1); const f = cineDone; cineDone = null; if (f) f();
  }
  G.skipCinematic = finish;

  /* =============================== MENU ============================== */
  G.hideAll = () => ['#menu','#chapter','#upgradesPanel','#settingsPanel','#mhud','#shareModal','#chud'].forEach(s => $(s).classList.add('hidden'));
  G.medalCount = () => Object.values(G.profile.missions).filter(m => m.medal).length;
  G.profileChip = () => `<span class="pc-name">${esc(G.profile.name || (G.lang() === 'ar' ? 'مخطط' : 'Planner'))}</span><span class="pc-stat">🏅 ${G.medalCount()}/5</span><span class="pc-stat">✦ ${G.profile.points}</span>`;
  G.dailyInfo = () => {
    const d = new Date(), key = d.toISOString().slice(0, 10), wk = `${d.getFullYear()}-W${Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 864e5 + new Date(d.getFullYear(), 0, 1).getDay() + 1) / 7)}`;
    const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const pool = VM.MISSIONS.filter(m => G.unlocked(m.id) && !m.storm);
    const mk = (k, nMods) => { const h = hash(k); const m = pool[h % pool.length]; const mods = []; for (let i = 0; mods.length < nMods; i++) { const md = VM.DAILY_MODS[((h >>> (i * 3)) + i) % VM.DAILY_MODS.length]; if (!mods.includes(md.id) && !(md.id === 'surge' && !m.visitors) && !(md.id === 'noroads' && !m.actions.includes('road'))) mods.push(md.id); if (i > 20) break; } return {key:k, mission:m.id, mods}; };
    return {daily:mk(key, 1), weekly:mk(wk, 2)};
  };
  G.showMenu = () => {
    VM.setBoard('riyadh'); G.hideAll(); $('#play').classList.remove('hidden'); $('#menu').classList.remove('hidden'); G.renderNav('home'); W.setBeacons(false); W.setProjectLabels(false); W.setHazard(null); W.setEntities([]); W.setDynamicLabels([]); W.onGroundClick(null);
    G.showScene(null); W.setOverlay(G.flows(null));
    const nm = G.nextMission(), run = G.loadRun(), di = G.dailyInfo(), best = G.profile.missions[nm.id] || {};
    $('#profileChip').innerHTML = G.profileChip();
    const runM = run && run.s ? (() => { try { const s = JSON.parse(run.s); return s.done ? null : {m:VM.mission(s.mission), t:s.turn}; } catch(e) { return null; } })() : null;
    const dd = G.profile.daily[di.daily.key], wd = G.profile.weekly[di.weekly.key];
    $('#menuCard').innerHTML = `
      <p class="eyebrow">${esc(G.t(VM.CHAPTERS[0].name))}</p>
      <h1 class="menu-title">VISION <span>NEXUS</span> 2030</h1>
      <p class="menu-tag">${esc(G.t('tagline'))}</p>
      <div class="next-card">
        <div class="nc-num">${nm.n}</div>
        <div class="nc-body"><small>${esc(G.t('mission'))} ${nm.n} · ${esc(G.t(nm.date))}</small><b>${esc(G.t(nm.title))}</b><p>${esc(G.t(nm.objective))}</p>${G.recordLine(best) ? `<small class="mc-rec">${esc(G.recordLine(best))}</small>` : ''}</div>
        ${best.medal ? `<span class="medal-dot ${best.medal}" title="${esc(G.t(best.medal))}"></span>` : ''}
      </div>
      <button class="primary big" id="playBtn">${esc(G.t('play'))} ${G.lang() === 'ar' ? '◂' : '▸'}</button>
      ${runM ? `<button class="secondary" id="resumeBtn">${esc(G.t('resumeRun', {m:G.t(runM.m.title), t:runM.t}))}</button>` : ''}
      <div class="menu-grid">
        <button class="tile" id="chapterBtn"><b>🗺 ${esc(G.t('chapterMap'))}</b><small>${G.medalCount()}/5 ${esc(G.t('medals'))}</small></button>
        <button class="tile" id="upBtn"><b>✦ ${esc(G.t('upgrades'))}</b><small>${G.profile.points} ${esc(G.t('points'))}</small></button>
        <button class="tile" id="dailyBtn"><b>☀ ${esc(G.t('daily'))}</b><small>${dd ? esc(G.t('dailyDone', {medal:G.t(dd)})) : esc(G.t(VM.mission(di.daily.mission).title))}</small></button>
        <button class="tile wide city" id="cityBtn"><b>🏗 ${esc(G.t('cityTitle'))}</b><small>${(() => { const cs = G.citySummary && G.citySummary(); return cs ? esc(G.t('cityContinue', {p:cs.pop, y:cs.year})) : esc(G.t('cityNew')); })()}</small></button>
        <button class="tile wide" id="compBtn"><b>📊 ${esc(G.t('lensTitle'))}</b><small>${esc(G.t('menuCompSub'))}</small></button>
        <button class="tile" id="weeklyBtn"><b>★ ${esc(G.t('weekly'))}</b><small>${wd ? esc(G.t('dailyDone', {medal:G.t(wd)})) : esc(G.t(VM.mission(di.weekly.mission).title))}</small></button>
      </div>
      <div class="menu-foot"><button class="link" id="settingsBtn">⚙ ${esc(G.t('settings'))}</button><button class="link" id="nationalBtn" title="${esc(G.t('nationalNote'))}">🧭 ${esc(G.t('national'))}</button></div>`;
    $('#playBtn').onclick = () => { G.sfx('select'); G.startMission(nm.id); };
    if ($('#resumeBtn')) $('#resumeBtn').onclick = () => G.resumeRun();
    $('#chapterBtn').onclick = G.showChapter; $('#upBtn').onclick = G.showUpgrades; $('#settingsBtn').onclick = G.showSettings;
    $('#dailyBtn').onclick = () => G.startMission(di.daily.mission, {daily:{key:di.daily.key, kind:'daily', mods:di.daily.mods}});
    $('#weeklyBtn').onclick = () => G.startMission(di.weekly.mission, {daily:{key:di.weekly.key, kind:'weekly', mods:di.weekly.mods}});
    $('#nationalBtn').onclick = G.openNational;
    $('#compBtn').onclick = () => G.showLens && G.showLens('overview');
    $('#cityBtn').onclick = () => G.openCity && G.openCity(false);
    const r = W.place(46.68, 24.71, 'Riyadh'); W.cam(.45, .7, 3.4, r[0] - .25, r[1], .6);
    clearInterval(G.menuCycle); if (!G.profile.reduced) { let ph = 0; G.menuCycle = setInterval(() => { if ($('#menu').classList.contains('hidden')) { clearInterval(G.menuCycle); W.setNight(0); return; } ph += .05; W.setNight(Math.max(0, Math.sin(ph) * .62)); }, 1000); }
    setTimeout(() => $('#playBtn') && $('#playBtn').focus(), 50);
  };
  // National Simulation: return to the session in memory, else restore the autosaved mandate, else show the setup screen.
  G.openNational = () => {
    G.hideAll(); $('#play').classList.add('hidden'); W.setMissionScene({links:[], sites:[]}); W.setMissionLights([]); W.setOverlay([]); W.setNight(0); W.setBeacons(true); W.setProjectLabels(true);
    const N = window.VisionNational;
    if (N && N.hasSession && N.resume()) return;
    G.openNationalSetup();
  };
  G.openNationalSetup = () => {
    G.hideAll(); $('#play').classList.add('hidden'); W.setBeacons(true); W.setProjectLabels(true);
    $('#intro').classList.remove('hidden', 'exit'); G.renderNav('national');
    if (window.VisionNational) VisionNational.prepareSetup();   // one Continue button per saved world
  };

  /* ============================ MODE SWITCHER ========================= */
  // One bar, visible in every mode, to move between the Kingdom (home), Campaign Missions, City Builder and the National
  // Simulation without reloading. Every mode saves automatically before you leave it, so switching never discards progress.
  G.mode = 'home';
  const MODES = [['home','🗺','navKingdom'], ['missions','🎯','navMissions'], ['city','🏗','navCity'], ['national','🧭','navNational']];
  function saveStatus(mode){
    if (mode === 'missions') { const S = VM.state; if (S && !S.done && !$('#mhud').classList.contains('hidden')) return G.t('savedMission', {m:G.t(VM.mission(S.mission).title), n:Math.min(S.turn, S.maxTurns)});
      if (S && S.done && !$('#mhud').classList.contains('hidden')) return G.t('savedResults'); }
    if (mode === 'city') { const c = G.cityStatus && G.cityStatus(); return c ? G.t(c.dirty ? 'savingCity' : 'savedCity', {d:c.date}) : G.t('savedAuto'); }
    if (mode === 'national') { const N = window.VisionNational, st = N && N.active ? N.status() : null, ws = N ? N.worlds() : [];
      return st ? G.t('savedWorld', {w:st.label, d:st.date}) : ws.length ? G.t('savedWorlds', {list:ws.map(w => w.label).join(' · ')}) : G.t('nationalNone'); }
    const r = G.loadRun(); let run = null; try { run = r && r.s ? JSON.parse(r.s) : null; } catch(e) {}
    return run && !run.done ? G.t('savedHomeRun', {m:G.t(VM.mission(run.mission).title), n:run.turn}) : G.t('savedAuto');
  }
  G.renderNav = mode => {
    if (mode) G.mode = mode;
    const nav = $('#modeNav'); if (!nav) return;
    nav.className = 'mode-nav glass mode-' + G.mode + (G.mode === 'national' && !$('#hud').classList.contains('hidden') ? ' in-hud' : '') + (G.mode === 'city' ? ' in-city' : '');
    const slot = G.mode === 'national' && !$('#hud').classList.contains('hidden') ? $('#hudNavSlot') : G.mode === 'city' && G.cityActive && G.cityActive() ? $('#cNavSlot') : null;
    if (slot && nav.parentNode !== slot) slot.appendChild(nav); else if (!slot && nav.parentNode !== document.body) document.body.appendChild(nav);
    nav.classList.toggle('docked', !!slot);
    nav.innerHTML = `<div class="mn-row" role="tablist">${MODES.map(([id, ic, k]) => `<button role="tab" data-go="${id}" class="${G.mode === id ? 'on' : ''}" aria-selected="${G.mode === id}" aria-label="${esc(G.t(k))}" title="${esc(G.t(k))}">${ic} <span class="mn-t">${esc(G.t(k))}</span></button>`).join('')}</div>
      <small class="mn-save" title="${esc(G.t('savePolicy'))}" aria-label="${esc(saveStatus(G.mode))}"><span class="mn-save-ic" aria-hidden="true">💾</span><span class="mn-save-t">${esc(saveStatus(G.mode))}</span></small>`;
    $$('#modeNav [data-go]').forEach(b => b.onclick = () => G.go(b.dataset.go));
  };
  // Leave whatever is on screen, saving it first. `next` runs once the current mode has been put away.
  G.leaveMode = next => {
    $$('.sheet:not(.hidden), #pauseMenu, #report, #decision, #causePop').forEach(e => e.classList.add('hidden'));
    if ($('#confirmBox')) $('#confirmBox').remove();
    if (!$('#mhud').classList.contains('hidden')) { G.saveRun(); W.onGroundClick(null); W.setHazard(null); }
    const N = window.VisionNational; if (N) N.leave();
    $('#play').classList.remove('hidden');
    if (G.cityActive && G.cityActive()) { G.closeCity(next); return; }
    next();
  };
  G.go = mode => {
    if (G.mode === mode && mode !== 'home' && mode !== 'missions') return;
    G.sfx && G.sfx('click');
    const open = {home:() => G.showMenu(), missions:() => G.openMissions(), city:() => G.openCity(false), national:() => G.openNational()}[mode];
    G.leaveMode(open);
  };
  G.openMissions = () => { const r = G.loadRun(); let s = null; try { s = r && r.s ? JSON.parse(r.s) : null; } catch(e) {} if (s && !s.done) G.resumeRun(); else G.showChapter(); };
  // In-page confirmation (no browser dialog): used before anything that would replace unfinished progress.
  G.confirmBox = (msg, yes, no, onYes, onNo) => {
    if ($('#confirmBox')) $('#confirmBox').remove();
    const d = document.createElement('div'); d.id = 'confirmBox'; d.className = 'confirm-box glass'; d.setAttribute('role', 'alertdialog');
    d.innerHTML = `<p>${esc(msg)}</p><div class="row-btns"><button class="secondary" id="cbNo">${esc(no)}</button><button class="primary" id="cbYes">${esc(yes)}</button></div>`;
    document.body.appendChild(d);
    $('#cbYes').onclick = () => { d.remove(); onYes(); }; $('#cbNo').onclick = () => { d.remove(); onNo && onNo(); };
    setTimeout(() => $('#cbNo') && $('#cbNo').focus(), 30);
  };

  /* ============================= CHAPTER ============================= */
  G.chapterSel = 'riyadh';
  G.showChapter = (chId) => {
    if (typeof chId === 'string') G.chapterSel = chId;
    G.hideAll(); $('#play').classList.remove('hidden'); $('#chapter').classList.remove('hidden'); G.renderNav('missions');
    const di = G.dailyInfo(), chap = VM.CHAPTERS.find(c => c.id === G.chapterSel) || VM.CHAPTERS[0];
    $('#chapter').innerHTML = `<div class="sheet-head"><b>${esc(G.t('chapterMap'))}</b><button class="icon-btn" id="chClose" aria-label="${esc(G.t('close'))}">✕</button></div>
      <div class="ch-tabs">${VM.CHAPTERS.map(c => { const open = c.status === 'play' && G.chapterUnlocked(c);
        return `<button class="ch-tab st-${c.status} ${c.id === chap.id ? 'sel' : ''} ${open ? '' : 'locked'}" data-chap="${c.id}" ${c.status === 'play' ? '' : 'disabled'}><b>${esc(G.t(c.name))}</b><small>${c.status !== 'play' ? esc(G.t('planned')) : c.tier === 'free' ? esc(G.t('freeCh')) : open ? esc(G.t('chapterOpen')) : '🔒 ' + esc(G.t('chapterLocked'))}</small>${c.blurb ? `<p>${esc(G.t(c.blurb))}</p>` : ''}</button>`; }).join('')}</div>
      <p class="hint">${esc(G.t('legacyNote'))}</p>
      <div class="mission-cards">${VM.MISSIONS.filter(m => chap.missions.includes(m.id)).map(m => { const pr = G.profile.missions[m.id] || {}, un = G.unlocked(m.id);
        return `<button class="mission-card ${un ? '' : 'locked'}" data-mid="${m.id}" ${un ? '' : 'disabled'}>
          <span class="mc-num">${m.n}</span><span class="mc-body"><small>${m.arc ? `<span class="arc-tag sm">${m.arc}</span> ` : ''}${esc(G.t(m.date))}${m.storm ? ' · ⚠' : ''}</small><b>${esc(G.t(m.title))}</b><em>${un ? esc(G.t(m.objective)) : '🔒 ' + esc(G.t('unlockedBy'))}</em>${G.recordLine(pr) ? `<small class="mc-rec">${esc(G.recordLine(pr))}</small>` : ''}</span>
          <span class="mc-medal">${pr.medal ? `<span class="medal-dot ${pr.medal}"></span>` : ''}<span class="stars" title="${esc(G.t('bankedStarsTip'))}">${[0,1,2].map(i => `<i class="${pr.stars && pr.stars[i] ? 'on' : ''}">★</i>`).join('')}</span></span></button>`; }).join('')}</div>
      <div class="challenge-row">
        ${['daily','weekly'].map(k => { const d = di[k], m = VM.mission(d.mission), done = (k === 'daily' ? G.profile.daily : G.profile.weekly)[d.key];
          return `<button class="challenge-card" data-ch="${k}"><small>${esc(G.t(k))} · ${esc(d.key)}</small><b>${esc(G.t(m.title))}</b><em>${d.mods.map(id => esc(G.t(VM.DAILY_MODS.find(x => x.id === id).name))).join(' · ')}</em><span>${done ? esc(G.t('dailyDone', {medal:G.t(done)})) : esc(G.t(k === 'daily' ? 'dailyReward' : 'weeklyReward'))}</span></button>`; }).join('')}
      </div>`;
    $('#chClose').onclick = G.showMenu;
    $$('#chapter [data-chap]').forEach(b => b.onclick = () => G.showChapter(b.dataset.chap));
    $$('#chapter [data-mid]').forEach(b => b.onclick = () => G.startMission(b.dataset.mid));
    $$('#chapter [data-ch]').forEach(b => b.onclick = () => { const d = di[b.dataset.ch]; G.startMission(d.mission, {daily:{key:d.key, kind:b.dataset.ch, mods:d.mods}}); });
  };

  /* ============================= UPGRADES ============================ */
  G.showUpgrades = (back) => {
    $('#upgradesPanel').classList.remove('hidden');
    const own = G.profile.upgrades, U = VM.UPGRADES;
    const tier = ids => ids.map(id => { const u = U[id], has = own.includes(id), avail = VM.upgradeAvailable(id, own), afford = G.profile.points >= u.cost;
      const req = u.req.includes('any2') ? G.t('any2') : u.req.length ? G.t('needsUp', {x:u.req.map(r => G.t(U[r].name)).join(', ')}) : '';
      return `<div class="up-node ${has ? 'owned' : avail ? 'avail' : 'locked'}"><span class="up-icon">${u.icon}</span><b>${esc(G.t(u.name))}</b><p>${esc(G.t(u.does))}</p>
        ${has ? `<span class="up-state">✓ ${esc(G.t('owned'))}</span>` : `<button class="primary sm" data-up="${id}" ${avail && afford ? '' : 'disabled'}>${esc(G.t('buy'))} · ✦ ${u.cost}</button>${!avail && req ? `<small>${esc(req)}</small>` : ''}`}</div>`; }).join('');
    $('#upgradesPanel').innerHTML = `<div class="sheet-card glass"><div class="sheet-head"><b>✦ ${esc(G.t('upgrades'))} · ${G.profile.points} ${esc(G.t('points'))}</b><button class="icon-btn" id="upClose">✕</button></div>
      <p class="hint">${esc(G.t('upIntro'))}</p>
      <div class="up-tree"><div class="up-tier">${tier(['smart','energy','talent'])}</div><div class="up-arrow">↓</div><div class="up-tier">${tier(['logistics','twin'])}</div></div></div>`;
    $('#upClose').onclick = () => { $('#upgradesPanel').classList.add('hidden'); if (typeof back === 'function') back(); else if (!$('#menu').classList.contains('hidden')) G.showMenu(); };
    $$('#upgradesPanel [data-up]').forEach(b => b.onclick = () => { const id = b.dataset.up, u = U[id]; if (G.profile.points < u.cost) return; G.profile.points -= u.cost; G.profile.upgrades.push(id); G.saveProfile(); G.sfx('medal'); G.toast('✦ ' + G.t(u.name)); G.showUpgrades(back); });
  };

  /* ============================= SETTINGS ============================ */
  G.showSettings = () => {
    $('#settingsPanel').classList.remove('hidden');
    const p = G.profile;
    $('#settingsPanel').innerHTML = `<div class="sheet-card glass"><div class="sheet-head"><b>⚙ ${esc(G.t('settings'))}</b><button class="icon-btn" id="setClose">✕</button></div>
      <label class="set-row"><span>${esc(G.t('name'))}</span><input id="setName" maxlength="24" value="${esc(p.name)}" /></label>
      <div class="set-row"><span>${esc(G.t('language'))}</span><div class="seg"><button data-lang="en" class="${G.lang() === 'en' ? 'on' : ''}">English</button><button data-lang="ar" class="${G.lang() === 'ar' ? 'on' : ''}">العربية</button></div></div>
      <label class="set-row"><span>${esc(G.t('sound'))}</span><input type="checkbox" id="setSound" ${p.sound ? 'checked' : ''} /></label>
      <label class="set-row"><span>${esc(G.t('graphics'))}</span><select id="setQuality">${['high','medium','low'].map(q => `<option value="${q}" ${(p.reduced ? 'low' : p.quality || 'high') === q ? 'selected' : ''}>${esc(G.t('gfx_' + q))}</option>`).join('')}</select></label>
      <div class="set-row"><button class="secondary sm" id="setIntro">${esc(G.t('replayIntro'))}</button><button class="link danger" id="setReset">${esc(G.t('resetProgress'))}</button></div></div>`;
    $('#setClose').onclick = () => { $('#settingsPanel').classList.add('hidden'); if (!$('#menu').classList.contains('hidden')) G.showMenu(); };
    $('#setName').onchange = e => { p.name = e.target.value.trim(); G.saveProfile(); $('#profileChip').innerHTML = G.profileChip(); };
    $$('#settingsPanel [data-lang]').forEach(b => b.onclick = () => { p.lang = b.dataset.lang; G.saveProfile(); G.applyLang(); G.showSettings(); if (!$('#menu').classList.contains('hidden')) G.showMenu(), G.showSettings(); if (G.refreshHud) G.refreshHud(); });
    $('#setSound').onchange = e => { p.sound = e.target.checked; G.saveProfile(); G.sfx('click'); };
    $('#setQuality').onchange = e => { p.quality = e.target.value; p.reduced = e.target.value === 'low'; G.saveProfile(); G.applyReduced(); };
    $('#setIntro').onclick = () => { $('#settingsPanel').classList.add('hidden'); G.hideAll(); G.cinematic(G.showMenu, false); };
    $('#setReset').onclick = () => { if (confirm(G.t('confirmReset'))) { const lang = p.lang; G.profile = blank(); G.profile.lang = lang; G.profile.seenIntro = true; G.saveProfile(); G.clearRun(); G.showMenu(); $('#settingsPanel').classList.add('hidden'); } };
  };
  G.applyReduced = () => { W.setQuality(G.profile.reduced ? 'low' : (G.profile.quality || 'high')); document.body.classList.toggle('reduced', !!G.profile.reduced); };

  /* ============================ SHARE CARD =========================== */
  G.share = (res, S) => {
    const m = VM.mission(res.mission), c = document.createElement('canvas'); c.width = 1200; c.height = 630; const x = c.getContext('2d');
    const ar = G.lang() === 'ar', font = '"Tajawal", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';   // the interface font, in both languages
    const g = x.createLinearGradient(0, 0, 1200, 630); g.addColorStop(0, '#fff6dc'); g.addColorStop(1, '#d9f0e4'); x.fillStyle = g; x.fillRect(0, 0, 1200, 630);
    x.fillStyle = '#1f3f63'; x.fillRect(0, 0, 1200, 84); x.fillStyle = '#ffe08a'; x.font = `bold 30px ${font}`; x.textAlign = ar ? 'right' : 'left';
    const X = v => ar ? 1200 - v : v;
    x.fillText('VISION NEXUS 2030', X(40), 54); x.fillStyle = '#fff'; x.font = `20px ${font}`; x.fillText(G.t(VM.CHAPTERS[0].name), X(420), 54);
    x.fillStyle = '#16362f'; x.font = `bold 44px ${font}`; x.fillText(`${m.n}. ${G.t(m.title)}`, X(40), 150);
    const medalCol = {gold:'#e8b422', silver:'#aeb8c2', bronze:'#c7803f'}[res.medal] || '#9aa';
    x.beginPath(); x.arc(ar ? 120 : 1080, 170, 62, 0, 7); x.fillStyle = medalCol; x.fill(); x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = `bold 26px ${font}`; x.fillText(G.t(res.medal || 'none'), ar ? 120 : 1080, 180);
    x.textAlign = ar ? 'right' : 'left'; x.font = `22px ${font}`; x.fillStyle = '#35594c';
    x.fillText(`${G.t('objective')}: ${res.primary.fmt}   ·   ${G.t('score')}: ${res.composite}`, X(40), 200);
    let y = 250; for (const [k, v] of Object.entries(res.measures)) { x.fillStyle = '#35594c'; x.fillText(G.t(k === 'objective' ? 'objectiveM' : k), X(40), y); x.fillStyle = '#e3ead3'; x.fillRect(ar ? 1200 - 540 : 300, y - 16, 240, 16); x.fillStyle = '#3cae68'; x.fillRect(ar ? 1200 - 300 - Math.min(240, v * 2.4) : 300, y - 16, Math.min(240, v * 2.4), 16); y += 38; }
    // mini strategy map (right side)
    const pts = Object.keys(VM.NODE_DEF).map(id => G.nodePos(id)), minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0])), minZ = Math.min(...pts.map(p => p[1])), maxZ = Math.max(...pts.map(p => p[1]));
    const ox = ar ? 60 : 640, oy = 250, sw = 500, sh = 320, P = id => { const p = G.nodePos(id); return [ox + (p[0] - minX) / (maxX - minX) * sw, oy + (p[1] - minZ) / (maxZ - minZ) * sh]; };
    x.lineWidth = 2; x.strokeStyle = '#c9bca0'; for (const [a, b] of VM.ROADS) { const A = P(a), B = P(b); x.beginPath(); x.moveTo(...A); x.lineTo(...B); x.stroke(); }
    for (const [kind, a, b] of res.built.links) { const A = P(a), B = P(b); x.strokeStyle = kind === 'metro' ? '#8b5cf6' : kind === 'brt' ? '#f39a2f' : '#666'; x.lineWidth = kind === 'metro' ? 8 : 6; x.beginPath(); x.moveTo(...A); x.lineTo(...B); x.stroke(); }
    for (const id of Object.keys(VM.NODE_DEF)) { const p = P(id); x.fillStyle = '#1f3f63'; x.beginPath(); x.arc(p[0], p[1], 7, 0, 7); x.fill(); }
    for (const [kind, node] of res.built.sites) { const p = P(node); x.font = `22px ${font}`; x.fillText({hotel:'🏨', park:'🌳', housing:'🏘', solar:'☀', wind:'🌬', storage:'🔋', hub:'📦', opened:'✦'}[kind] || '•', p[0] + 8, p[1] - 8); }
    x.fillStyle = '#35594c'; x.font = `18px ${font}`; x.textAlign = ar ? 'right' : 'left';
    const strat = res.decisions.flatMap(d => d.actions.map(a => G.t(G.aname(a.id)))).slice(0, 7).join(' · ');
    x.fillText(`${G.t('strategy')}: ${strat}`.slice(0, 120), X(40), 610);
    const url = c.toDataURL('image/png');
    const text = `Vision Nexus 2030 — ${G.t(m.title)}: ${G.t(res.medal || 'none')} (${res.composite}). ${G.t('strategy')}: ${strat}`;
    $('#shareModal').classList.remove('hidden');
    $('#shareModal').innerHTML = `<div class="sheet-card glass wide"><div class="sheet-head"><b>${esc(G.t('share'))}</b><button class="icon-btn" id="shClose">✕</button></div>
      <img class="share-img" src="${url}" alt="${esc(text)}" /><div class="row-btns"><a class="primary sm" download="vision-nexus-${m.id}.png" href="${url}">${esc(G.t('download'))}</a><button class="secondary sm" id="shCopy">${esc(G.t('copy'))}</button></div></div>`;
    $('#shClose').onclick = () => $('#shareModal').classList.add('hidden');
    $('#shCopy').onclick = async () => { try { await navigator.clipboard.writeText(text); G.toast(G.t('copied')); } catch(e) { G.toast(text); } };
  };
})();
