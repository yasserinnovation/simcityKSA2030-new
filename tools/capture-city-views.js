// node tools/capture-city-views.js <outDir> — comparable City Builder / Kingdom screenshots and performance numbers.
// Builds the same deterministic district every run (same seed, same roads, zones and facilities, same number of months),
// then captures fixed cameras at day and dusk, on a desktop (1440×900) and a phone-sized (390×844) viewport.
// Records: boot time to the menu, average frame time / FPS over 4 s in the City Builder, JS heap, and console errors.
// Uses playwright-core with the installed Chrome (or Edge), like tests/render.smoke.js.
const path = require('path'), http = require('http'), fs = require('fs');
const { chromium } = require('playwright-core');
const out = path.resolve(process.argv[2] || 'docs/capture'); fs.mkdirSync(out, {recursive:true});

function serve(){ const root = path.resolve(__dirname, '..');
  const T = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.glb':'model/gltf-binary', '.woff2':'font/woff2'};
  const s = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p);
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, {'Content-Type':T[path.extname(f)] || 'application/octet-stream'}); res.end(d); }); });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(s))); }

// The same district every run: a connected street grid with homes, shops, a park, a school, a clinic, solar + battery,
// water and a bus route, grown for 30 months with a fixed seed.
const BUILD = () => {
  const G = window.VNP, VC = window.VisionCity; G.openCity(true); const S = VC.state; S.seed = 4242; S.budget = 400;
  const A = (t, a, b) => VC.apply(t, a, b || a, {density:1});
  A('road', [7,14], [24,14]); A('road', [7,10], [24,10]); A('road', [24,10], [24,20]); A('road', [14,10], [14,20]); A('road', [7,18], [24,18]);
  A('zoneR', [8,11], [13,13]); A('zoneR', [15,11], [23,13]); A('zoneC', [8,15], [13,15]); A('zoneR', [15,15], [23,17]); A('zoneC', [8,17], [13,17]);
  A('park', [8,16]); A('school', [9,16]); A('clinic', [10,16]); A('solar', [25,12]); A('battery', [25,13]); A('pump', [25,15]);
  VC.addRoute([VC.idx(7,14), VC.idx(14,14), VC.idx(24,14)], 6);
  G.cityStep(30); G.cityUI.speed = 0; G.cityRender();
  return {pop:S.m.pop, jobs:S.m.jobs, month:S.month};
};

(async () => {
  const server = await serve(), port = server.address().port, results = {date:new Date().toISOString(), views:{}};
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}).catch(() => chromium.launch({channel:'msedge'}));
  for (const [vp, size] of [['desktop', {width:1440, height:900}], ['phone', {width:390, height:844}]]) {
    const ctx = await browser.newContext({viewport:size, deviceScaleFactor:1, isMobile:vp === 'phone', hasTouch:vp === 'phone'}), page = await ctx.newPage(), errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('visionNexus2030.profile.v4', JSON.stringify({v:4, lang:'en', sound:false, seenIntro:true, tutorial:{done:true}, points:0, upgrades:[], missions:{}, legacy:{}, daily:{}, weekly:{}, build6:true})); } catch(e) {} });
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/index.html?short`);
    await page.waitForFunction(() => { document.querySelector('#skipBtn')?.click(); const m = document.querySelector('#menu'); return m && !m.classList.contains('hidden'); }, null, {timeout:60000, polling:200});
    const boot = Date.now() - t0;
    await page.waitForTimeout(2500);
    const R = results.views[vp] = {boot_ms:boot};
    const shot = async (name, worldOnly) => {
      if (worldOnly) await page.addStyleTag({content:'body>*:not(#world):not(#labels){visibility:hidden!important}'});
      await page.screenshot({path:path.join(out, `${vp}_${name}.png`)});
      if (worldOnly) await page.evaluate(() => document.querySelectorAll('style').forEach(s => { if (s.textContent.includes('body>*:not(#world)')) s.remove(); }));
    };
    await page.evaluate(() => window.VisionWorld.setNight(0, true)); await page.waitForTimeout(1200);
    await shot('kingdom_menu', false);
    R.city = await page.evaluate(BUILD);
    await page.waitForTimeout(4500);
    const cam = async (dist, el) => { await page.evaluate(([d, e]) => { const g = window.VNP.cityGrid, n = window.VisionCity.N; window.VisionWorld.debug.captureView(g.x0 + 16 * g.ts, g.z0 + 15 * g.ts, d, e); }, [dist, el]); await page.waitForTimeout(1500); };
    // The City Builder drives day/night from its own clock (cityUI.dayT), so set that clock, not setNight directly.
    for (const [nm, dayT] of [['day', .5], ['dusk', .95]]) {
      await page.evaluate(d => { window.VNP.cityUI.dayT = d; }, dayT); await page.waitForTimeout(2500);
      await cam(.95, .78); await shot(`city_${nm}_district`, true);
      await cam(.42, .62); await shot(`city_${nm}_street`, true);
    }
    await page.evaluate(() => { window.VNP.cityUI.dayT = .5; }); await page.waitForTimeout(2500); await cam(.95, .78); await shot('city_day_ui', false);
    // performance: frame times in the City Builder district view
    R.perf = await page.evaluate(() => new Promise(res => { const ts = []; let last = performance.now(); const f = now => { ts.push(now - last); last = now; if (ts.length < 400 && ts.reduce((a, b) => a + b, 0) < 4000) requestAnimationFrame(f); else { ts.shift(); const avg = ts.reduce((a, b) => a + b, 0) / ts.length, s = [...ts].sort((a, b) => a - b);
      res({frames:ts.length, avg_ms:+avg.toFixed(2), fps:+(1000 / avg).toFixed(1), p95_ms:+s[Math.floor(s.length * .95)].toFixed(2), heap_mb:performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, quality:window.VisionWorld.getQuality()}); } }; requestAnimationFrame(f); }));
    R.errors = errors.slice(0, 5);
    console.log(vp, JSON.stringify(R));
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close(); server.close();
})().catch(e => { console.error('capture failed:', e); process.exit(1); });
