// Browser check — every regional landmark is selectable from its region's default view, by its model and by its label.
// A Playwright page function (no npm dependency in this project): run it with any runner that passes a `page`, e.g. the
// Playwright MCP tool `browser_run_code_unsafe` with filename "tests/browser/regional-selection.pw.js", against the game
// served at http://127.0.0.1:8000 (Launch_Prototype.bat). It returns {pass, fail, failures, summary}.
//
// For English and Arabic at 1440×900 and 390×844, and each of the four regional plans:
//   • the region button opens the same default view the check uses (regionView = focusRegion without the camera flight);
//   • MODEL: some pixel of the landmark's model is visible and not covered by any label or panel, and a real mouse
//     click there selects that landmark (or that city/district place);
//   • LABEL: the landmark's label is shown on screen, and a real mouse click on it selects the same landmark;
//   • AGREE: a click at the centre of the model as drawn (where a player aims) selects that same landmark, whatever is
//     on top there — its own label may overlap its model, but no other label or panel may.
// It runs in a separate browser context (fresh storage), so the player's saves are never touched.
async (page) => {
  const URL = 'http://127.0.0.1:8000/index.html';
  const TARGETS = {
    east:['eastern', 'green', 'place:qatif', 'place:dammam', 'place:dhahran', 'place:khobar', 'place:hofuf'],
    west:['madinah', 'ceer', 'lucid', 'jeddahcentral', 'masar', 'hajj', 'haramain', 'place:madinah', 'place:jeddah', 'place:makkah', 'place:taif'],
    northwest:['neom', 'trojena', 'sindalah', 'oxagon', 'hydrogen', 'amaala', 'redsea', 'alula', 'place:tabuk'],
    south:['jazan', 'soudah', 'place:abha', 'place:jazanc', 'place:najran']
  };
  const ctx = await page.context().browser().newContext();
  const p = await ctx.newPage();
  const results = [], failures = [];
  const record = (combo, region, id, check, ok, info = '') => { results.push({combo, region, id, check, ok}); if (!ok) failures.push(`${combo} ${region} ${id} ${check}${info ? ': ' + info : ''}`); };
  const btn = async re => { await p.waitForFunction(r => [...document.querySelectorAll('button')].some(b => b.offsetParent && new RegExp(r).test(b.textContent)), re, {timeout:15000});
    await p.evaluate(r => [...document.querySelectorAll('button')].find(b => b.offsetParent && new RegExp(r).test(b.textContent)).click(), re); };
  const settle = () => p.waitForTimeout(450);
  const view = async r => { await p.evaluate(r => { document.querySelector('#dock')?.classList.add('collapsed'); document.querySelector('#navigator')?.classList.add('collapsed');
    document.querySelector('#pickChoices .pc-close')?.click(); VisionWorld.debug.regionView(r); VisionWorld.debug.clearPick(); }, r);
    const vp = p.viewportSize(); await p.mouse.move(vp.width / 2, vp.height - 4);   // pointer off the map: no hover label from the previous click
    await settle(); };
  try {
    await p.goto(URL); await p.waitForTimeout(2500); await p.click('#skipBtn', {timeout:4000}).catch(() => {});
    await btn('National Simulation'); await p.waitForTimeout(1200);
    await p.check('input[name="mode"][value="campaign"]').catch(() => {}); await p.click('#beginBtn'); await p.waitForTimeout(4000);
    for (const [ar, w, h] of [[false, 1440, 900], [true, 1440, 900], [false, 390, 844], [true, 390, 844]]) {
      const combo = `${ar ? 'ar' : 'en'}${w}`;
      await p.setViewportSize({width:w, height:h}); await p.waitForTimeout(600);
      if (await p.evaluate(() => document.documentElement.lang === 'ar') !== ar) {
        // the language toggle lives on the home screen; switch there and re-enter the saved campaign
        await p.evaluate(() => VNP.showMenu ? VNP.showMenu() : null).catch(() => {}); await p.waitForTimeout(800);
        await p.evaluate(() => document.querySelector('#langBtn').click()); await p.waitForTimeout(700);
        await btn('National Simulation|المحاكاة الوطنية'); await p.waitForTimeout(1500);
        await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.offsetParent && /Continue Campaign|متابعة الحملة/.test(b.textContent))?.click()); await p.waitForTimeout(3500);
      }
      for (const [region, ids] of Object.entries(TARGETS)) {
        // the region button's flight ends at the same camera the check uses
        await p.evaluate(r => document.querySelector(`button[data-region="${r}"]`).click(), region); await p.waitForTimeout(3200);
        const flown = await p.evaluate(() => VisionWorld.debug.state().dist);
        await view(region); const snapped = await p.evaluate(() => VisionWorld.debug.state().dist);
        record(combo, region, '-', 'default view', Math.abs(flown - snapped) < .02, `${flown.toFixed(2)} vs ${snapped.toFixed(2)}`);
        for (const id of ids) {
          // MODEL: an uncovered pixel of the model, then a real click on it
          await view(region);
          const m = await p.evaluate(id => { const px = VisionWorld.debug.visiblePixels(id, 2000).filter(q => q.x != null);
            const free = px.filter(q => { const e = document.elementFromPoint(q.x, q.y); return e && e.tagName === 'CANVAS'; });
            const c = px.length ? {x:px.reduce((a, q) => a + q.x, 0) / px.length, y:px.reduce((a, q) => a + q.y, 0) / px.length} : null;
            const centre = c && px.reduce((b, q) => Math.hypot(q.x - c.x, q.y - c.y) < Math.hypot(b.x - c.x, b.y - c.y) ? q : b, px[0]);   // nearest model pixel to the centroid
            return {total:px.length, free:free.length, at:free[Math.floor(free.length / 2)] || null, centre}; }, id);
          if (!m.at) record(combo, region, id, 'model', false, `${m.total} model pixels, none uncovered`);
          else { await p.mouse.click(m.at.x, m.at.y); await p.waitForTimeout(350);
            const got = await p.evaluate(() => ({pick:VisionWorld.debug.lastPick(), choose:[...document.querySelectorAll('#pickChoices:not([hidden]) [data-pid]')].map(b => b.dataset.pid)}));
            record(combo, region, id, 'model', got.pick === id, `picked ${got.pick}${got.choose.length ? ' / offered ' + got.choose.join(',') : ''}`); }
          // LABEL: shown on screen, then a real click on it
          await view(region);
          const l = await p.evaluate(id => { const e = [...document.querySelectorAll('#mapLabels .map-label')].find(e => e.dataset.pid === id && +getComputedStyle(e).opacity > .5);
            if (!e) return null; const b = e.getBoundingClientRect(); if (b.left < 0 || b.right > innerWidth || b.top < 0 || b.bottom > innerHeight) return {off:true};
            const x = b.left + b.width / 2, y = b.top + b.height / 2, top = document.elementFromPoint(x, y);
            return {x, y, onTop:!!top && top.closest('[data-pid]') === e}; }, id);
          if (!l) record(combo, region, id, 'label', false, 'label not shown');
          else if (l.off || !l.onTop) record(combo, region, id, 'label', false, l.off ? 'off screen' : 'covered');
          else { await p.mouse.click(l.x, l.y); await p.waitForTimeout(350);
            const got = await p.evaluate(() => VisionWorld.debug.lastPick()); record(combo, region, id, 'label', got === id, `picked ${got}`); }
          // AGREE: a click at the model's centre selects the same landmark
          if (!m.centre) record(combo, region, id, 'agree', false, 'no model on screen');
          else { await view(region); await p.mouse.click(m.centre.x, m.centre.y); await p.waitForTimeout(350);
            const got = await p.evaluate(() => VisionWorld.debug.lastPick()); record(combo, region, id, 'agree', got === id, `centre click picked ${got} (${m.free}/${m.total} model pixels uncovered)`); }
        }
      }
    }
  } finally { await ctx.close(); }
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  const summary = {}; for (const r of results) { const k = r.combo; summary[k] = summary[k] || {pass:0, fail:0}; summary[k][r.ok ? 'pass' : 'fail']++; }
  return {pass, fail, failures, summary};
}
