// Vision Nexus 2030 — map controls help.
// A small "?" button that opens the camera and selection controls in the current language (English or Arabic). It sits
// in a free corner of the map, never over the HUD, and only while a game view is on screen. It replaces the browser
// tooltip that used to cover the map edge. Works with either renderer: it only reads the page.
(() => {
  'use strict';
  const TEXT = {
    en: {title:'Map controls', open:'Show map controls', close:'Close', rows:[
      ['Drag', 'orbit the camera'], ['Right-drag · WASD', 'pan'], ['Scroll · pinch', 'zoom'], ['Q · E', 'rotate'],
      ['Click', 'inspect a project or place'], ['Space', 'pause time (National Simulation)']]},
    ar: {title:'التحكم في الخريطة', open:'عرض أدوات التحكم في الخريطة', close:'إغلاق', rows:[
      ['اسحب', 'لتدوير الكاميرا'], ['اسحب بالزر الأيمن · WASD', 'للتحريك'], ['مرّر · قرّب بإصبعين', 'للتكبير'], ['Q · E', 'للاستدارة'],
      ['انقر', 'لفحص مشروع أو مكان'], ['المسافة', 'لإيقاف الوقت (المحاكاة الوطنية)']]}
  };
  const lang = () => document.documentElement.dir === 'rtl' || document.body.classList.contains('national-ar') ? 'ar' : 'en';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));

  const root = document.createElement('div'); root.id = 'mapHelp'; root.className = 'map-help'; root.hidden = true;
  root.innerHTML = '<button type="button" class="mh-btn" aria-expanded="false" aria-controls="mapHelpPop">?</button><div id="mapHelpPop" class="mh-pop" role="dialog" hidden></div>';
  document.body.appendChild(root);
  const btn = root.querySelector('.mh-btn'), pop = root.querySelector('.mh-pop');
  let shownLang = '';

  function render(){
    const L = TEXT[lang()]; shownLang = lang();
    btn.setAttribute('aria-label', L.open); btn.title = L.open; pop.setAttribute('aria-label', L.title);
    pop.innerHTML = `<div class="mh-head"><b>${esc(L.title)}</b><button type="button" class="mh-close" aria-label="${esc(L.close)}">✕</button></div>`
      + `<dl>${L.rows.map(([k, v]) => `<div><dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
    pop.querySelector('.mh-close').onclick = () => setOpen(false);
  }
  function setOpen(v){ if (v) render(); pop.hidden = !v; btn.setAttribute('aria-expanded', String(v)); root.classList.toggle('open', v); place(); }
  btn.addEventListener('click', () => setOpen(pop.hidden));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) setOpen(false); });
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !root.contains(e.target)) setOpen(false); }, true);   // a click on the map closes it, and still reaches the map

  // Shown only during play, and never while a menu, sheet or cinematic covers the map.
  const COVER = '#menu:not(.hidden), #intro:not(.hidden), #cine:not(.hidden), #chapter:not(.hidden), #results:not(.hidden), .sheet:not(.hidden), .modal:not(.hidden)';
  const PLAYING = '#mhud:not(.hidden), #chud:not(.hidden), #hud:not(.hidden)';
  // HUD panels the button must not overlap (the same set the map labels avoid).
  const HUD = '#modeNav, .topbar, #navigator, #dock, #bottombar, #messageRibbon, #mcard, #mmeasures, #mMenuBtn, #decision, #planTray, #actionBar, #report, .ctop, #cTools, #cPanel, #cMission, #profileChip, #langBtn, #soundBtn, #challengePanel, #challengeTop, #unitBar, #reviewCard, #coach, #banner, #toast:not(.hidden)';
  const rectsOf = sel => [...document.querySelectorAll(sel)].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => el.getBoundingClientRect()).filter(r => r.width > 2 && r.height > 2);
  const overlaps = (a, b, m = 6) => a.left < b.right + m && a.right + m > b.left && a.top < b.bottom + m && a.bottom + m > b.top;
  function place(){
    const show = !!document.querySelector(PLAYING) && !document.querySelector(COVER);
    if (root.hidden === show) root.hidden = !show;
    if (!show) { if (!pop.hidden) setOpen(false); return; }
    if (shownLang && shownLang !== lang()) render();
    const S = 34, M = 16, rtl = lang() === 'ar', hud = rectsOf(HUD);
    // Lowest free spot first, on the reading-end side: the screen corner, or just inside the side panels.
    const xs = [innerWidth - S - M, M];
    for (const h of hud) { if (h.left - S - 10 > M) xs.push(h.left - S - 10); if (h.right + 10 < innerWidth - S - M) xs.push(h.right + 10); }
    xs.sort((p, q) => rtl ? p - q : q - p);
    let at = null;
    for (let y = innerHeight - S - M; y > innerHeight * .3 && !at; y -= 8)
      for (const x of xs) { const r = {left:x, top:y, right:x + S, bottom:y + S}; if (!hud.some(h => overlaps(r, h))) { at = {x, y, side:x + S / 2 > innerWidth / 2 ? 'right' : 'left'}; break; } }
    at = at || {x:innerWidth - S - M, y:innerHeight * .5, side:'right'};
    root.style.left = at.x + 'px'; root.style.top = at.y + 'px';
    root.dataset.side = at.side; root.dataset.up = at.y > innerHeight / 2 ? '1' : '0';
  }
  setInterval(place, 400); addEventListener('resize', place);
  window.VisionHelp = {open:() => setOpen(true), close:() => setOpen(false)};
})();
