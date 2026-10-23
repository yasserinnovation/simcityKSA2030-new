// node tools/check-kingdom-map.js [before|after] — V21 Kingdom map captures (Playwright + installed Chrome/Edge).
// National Simulation, Kingdom view: with UI and clean, English and Arabic, desktop (1600×900) and phone (390×844);
// also frame time and console errors. Output: docs/kingdom-map-v21/<phase>/.
const {chromium} = require('playwright-core'), fs = require('fs'), path = require('path'), http = require('http');
const phase = process.argv[2] || 'after', dir = path.resolve(__dirname, '../docs/kingdom-map-v21/' + phase); fs.mkdirSync(dir, {recursive:true});
const root = path.resolve(__dirname, '..');
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.glb':'model/gltf-binary', '.wasm':'application/wasm', '.woff2':'font/woff2'};
const serve = () => { const s = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, {'Content-Type':TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream'}); res.end(d); }); });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(s))); };
(async () => {
  const server = await serve(), url = `http://127.0.0.1:${server.address().port}/index.html?tutorial=off`;
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}).catch(() => chromium.launch({channel:'msedge'}));
  const result = {phase, errors:[], perf:{}};
  const boot = async (vp, extra = {}) => { const page = await browser.newPage(Object.assign({viewport:vp}, extra)); page.setDefaultTimeout(90000);
    page.on('console', m => { if (m.type() === 'error') result.errors.push(m.text()); }); page.on('pageerror', e => result.errors.push(String(e)));
    await page.goto(url); await page.waitForFunction(() => window.VisionWorld && window.VNP);
    await page.waitForFunction(() => { document.querySelector('#skipBtn')?.click(); const m = document.querySelector('#menu'); return m && !m.classList.contains('hidden'); }, null, {polling:300});
    await page.evaluate(() => { VNP.openNational(); document.querySelector('#beginBtn').click(); VisionWorld.debug.holdQuality(); VisionWorld.setQuality('high'); VisionWorld.debug.captureMode(true); });
    await page.waitForTimeout(1500); await page.evaluate(() => VisionWorld.debug.regionView('kingdom')); await page.waitForTimeout(2500);
    await page.addStyleTag({content:'body.cc>*:not(#world):not(#mapLabels):not(script):not(style){visibility:hidden!important}'}); return page; };
  const perf = page => page.evaluate(async () => { const iv = []; let last = performance.now(); for (let i = 0; i < 120; i++) { await new Promise(requestAnimationFrame); const n = performance.now(); if (i > 19) iv.push(n - last); last = n; }
    iv.sort((a, b) => a - b); return {meanMs:+(iv.reduce((a, b) => a + b, 0) / iv.length).toFixed(2), p95Ms:+iv[Math.floor(iv.length * .95)].toFixed(2)}; });
  try {
    const page = await boot({width:1600, height:900});
    await page.screenshot({path:path.join(dir, 'kingdom-ui.png')});
    await page.evaluate(() => document.body.classList.add('cc')); await page.waitForTimeout(300); await page.screenshot({path:path.join(dir, 'kingdom-map.png')});
    await page.evaluate(() => document.body.classList.remove('cc'));
    for (const q of ['high', 'medium', 'low']) { await page.evaluate(q => VisionWorld.setQuality(q), q); await page.waitForTimeout(600); result.perf[q] = await perf(page); if (q !== 'high') await page.screenshot({path:path.join(dir, `kingdom-${q}.png`)}); }
    await page.evaluate(() => { VisionWorld.setQuality('high'); VNP.profile.lang = 'ar'; VNP.saveProfile(); VNP.applyLang(); window.VisionNationalAR && VisionNationalAR.enable(); });
    await page.waitForTimeout(800); await page.screenshot({path:path.join(dir, 'kingdom-ar.png')});
    await page.evaluate(() => { VNP.profile.lang = 'en'; VNP.saveProfile(); VNP.applyLang(); });
    // a badge click (where present) must open its region like the region names did
    result.badgeClick = await page.evaluate(async () => { const b = document.querySelector('#mapLabels .badge[data-region="riyadh"]') || document.querySelector('#mapLabels [data-region="riyadh"]'); if (!b) return null;
      b.click(); await new Promise(r => setTimeout(r, 1500)); return VisionWorld.debug.state().dist; });
    await page.close();
    const ph = await boot({width:390, height:844}, {deviceScaleFactor:2, isMobile:true, hasTouch:true});
    await ph.screenshot({path:path.join(dir, 'phone.png')}); result.phonePerf = await perf(ph); await ph.close();
  } finally { fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(result, null, 2)); await browser.close(); server.close(); }
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
