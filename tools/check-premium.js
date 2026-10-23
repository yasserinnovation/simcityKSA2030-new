// node tools/check-premium.js [before|after] — premium render pass captures (Playwright + installed Chrome/Edge).
// Serves the game on a free port, then for each graphics tier captures fixed views (Kingdom, Riyadh plan, close landmark,
// night, City Builder, phone), measures frame time, and records console errors. Output: docs/premium-v20/<phase>/.
const {chromium} = require('playwright-core'), fs = require('fs'), path = require('path'), http = require('http');
const phase = process.argv[2] || 'after', dir = path.resolve(__dirname, '../docs/premium-v20/' + phase); fs.mkdirSync(dir, {recursive:true});
const root = path.resolve(__dirname, '..');
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.glb':'model/gltf-binary', '.wasm':'application/wasm', '.ktx2':'image/ktx2', '.woff2':'font/woff2'};
const serve = () => { const s = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, {'Content-Type':TYPES[path.extname(f)] || 'application/octet-stream'}); res.end(d); }); });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(s))); };

(async () => {
  const server = await serve(), url = `http://127.0.0.1:${server.address().port}/index.html?tutorial=off&debug=1` + (process.env.VN_EXTRA || '');
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}).catch(() => chromium.launch({channel:'msedge'}));
  const result = {phase, errors:[], perf:{}, tiers:[]};
  try {
    const page = await browser.newPage({viewport:{width:1440, height:900}}); page.setDefaultTimeout(90000);
    page.on('console', m => { if (m.type() === 'error') result.errors.push(m.text()); });
    page.on('pageerror', e => result.errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => window.VisionWorld && window.VNP);
    await page.waitForFunction(() => { document.querySelector('#skipBtn')?.click(); const m = document.querySelector('#menu'); return m && !m.classList.contains('hidden'); }, null, {polling:300});
    await page.evaluate(() => { VNP.openNational(); document.querySelector('#beginBtn').click(); VisionWorld.debug.holdQuality(); VisionWorld.debug.captureMode(true); });
    await page.waitForTimeout(2000);
    await page.addStyleTag({content:'body.capture-clean>*:not(#world):not(script):not(style){visibility:hidden!important}'});
    const shot = async name => { await page.waitForTimeout(600); await page.screenshot({path:path.join(dir, name + '.png')}); };
    const perf = () => page.evaluate(async () => { const iv = []; let last = performance.now();
      for (let i = 0; i < 140; i++) { await new Promise(requestAnimationFrame); const now = performance.now(); if (i > 19) iv.push(now - last); last = now; }
      iv.sort((a, b) => a - b); const mean = iv.reduce((a, b) => a + b, 0) / iv.length; const fs = VisionWorld.debug.frameStats();
      return {meanMs:+mean.toFixed(2), p95Ms:+iv[Math.floor(iv.length * .95)].toFixed(2), calls:fs.calls, triangles:fs.triangles}; });
    const tiers = await page.evaluate(() => VisionWorld.qualityTiers ? VisionWorld.qualityTiers() : ['high', 'medium', 'low']); result.tiers = tiers;
    const views = [
      ['kingdom', () => { const r = VISION_DATA.regions.kingdom; VisionWorld.debug.captureView(r.x, r.z, 15.2, 1.18); }],
      ['riyadh', () => VisionWorld.debug.regionView('riyadh')],
      ['expo-close', () => { const p = VISION_DATA.projects.find(p => p.id === 'expo'); VisionWorld.debug.previewComplete(true); VisionWorld.debug.captureView(p.x, p.z, .55, .72); }],
      ['skyline-close', () => { const c = VisionLayout.RIYADH_CORE; VisionWorld.debug.captureView(c.x, c.z, .8, .62); }],
      ['west', () => VisionWorld.debug.regionView('west')],
    ];
    for (const q of tiers) {
      await page.evaluate(q => { VisionWorld.setQuality(q); document.body.classList.add('capture-clean'); }, q);
      for (const [name, fn] of views) { await page.evaluate(fn); await shot(`${name}-${q}`); }
      await page.evaluate(() => { const c = VisionLayout.RIYADH_CORE; VisionWorld.debug.captureView(c.x, c.z, 1.4, .8); VisionWorld.debug.captureMode(false); VisionWorld.setNight(1, true); });
      await page.waitForTimeout(400); await shot(`night-${q}`);
      await page.evaluate(() => { VisionWorld.setNight(0, true); VisionWorld.debug.captureMode(true); VisionWorld.debug.regionView('riyadh'); });
      result.perf[q] = await perf();
    }
    await page.evaluate(() => { VisionWorld.setQuality('high'); VisionWorld.debug.previewComplete(false); document.body.classList.remove('capture-clean'); VisionWorld.debug.regionView('kingdom'); });
    await shot('ui-desktop');
    await page.setViewportSize({width:390, height:844}); await page.evaluate(() => VisionWorld.debug.regionView('kingdom')); await shot('phone-kingdom');
    await page.evaluate(() => VisionWorld.debug.regionView('riyadh')); await shot('phone-riyadh');
    result.phonePerf = await perf();
    result.assets = await page.evaluate(() => window.__visionAssets ? window.__visionAssets() : null);
  } finally { fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(result, null, 2)); await browser.close(); server.close(); }
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
