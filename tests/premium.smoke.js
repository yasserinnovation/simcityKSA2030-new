// node tests/premium.smoke.js — V20 premium render pass (Playwright + installed Chrome/Edge, like render.smoke.js).
// Desktop: every graphics preset boots, draws a non-blank frame, keeps its post-processing state, and raises no console
// errors; the GLB pipeline loads the Vision Guide, places it on the plaza, and cross-fades between animation states;
// Reduced loads no model. Phone (390×844, touch, DPR 3): the menu, National Simulation and City Builder still play by tap.
const path = require('path'), zlib = require('zlib'), http = require('http'), fs = require('fs');
const {chromium} = require('playwright-core');
const root = path.resolve(__dirname, '..');
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.glb':'model/gltf-binary', '.wasm':'application/wasm', '.woff2':'font/woff2'};
const serve = () => { const s = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, {'Content-Type':TYPES[path.extname(p)] || 'application/octet-stream'}); res.end(d); }); });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(s))); };
function decodePNG(buf){ let o = 8, w, h, ct, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; o += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  return {w, h, bpp, px}; }
function frameStats(png){ const {w, h, bpp, px} = decodePNG(png), seen = new Set(); let n = 0, s = 0, s2 = 0;
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const i = (y * w + x) * bpp, r = px[i], g = px[i + 1], b = px[i + 2], l = .3 * r + .59 * g + .11 * b;
    seen.add((r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)); n++; s += l; s2 += l * l; }
  return {colours:seen.size, std:+Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)).toFixed(1)}; }

(async () => {
  let fails = 0; const ok = (label, cond, info = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label.padEnd(72)} ${info}`); };
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}/index.html?tutorial=off`;
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}).catch(() => chromium.launch({channel:'msedge'}));
  const open = async (opts) => { const ctx = await browser.newContext(opts), page = await ctx.newPage(), errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base); await page.waitForFunction(() => window.VisionWorld && window.VNP, null, {timeout:30000});
    await page.waitForFunction(() => { document.querySelector('#skipBtn')?.click(); const m = document.querySelector('#menu'); return m && !m.classList.contains('hidden'); }, null, {timeout:30000, polling:300});
    return {ctx, page, errors}; };
  const canvasShot = async page => { await page.addStyleTag({content:'body.vn-shot>*:not(#world){visibility:hidden!important}'}); await page.evaluate(() => document.body.classList.add('vn-shot'));
    const b = await page.locator('#world').screenshot(); await page.evaluate(() => document.body.classList.remove('vn-shot')); return frameStats(b); };
  try {
    // ---------------- desktop: every preset
    const {ctx, page, errors} = await open({viewport:{width:1280, height:800}});
    await page.evaluate(() => { VNP.openNational(); document.querySelector('#beginBtn').click(); VisionWorld.debug.holdQuality(); });
    await page.waitForTimeout(1500);
    const tiers = await page.evaluate(() => VisionWorld.qualityTiers());
    ok('four graphics presets (ultra, high, medium, low)', JSON.stringify(tiers) === '["ultra","high","medium","low"]', tiers.join(','));
    for (const q of tiers) {
      await page.evaluate(q => { VisionWorld.setQuality(q); VisionWorld.debug.regionView('riyadh'); }, q); await page.waitForTimeout(1200);
      const st = await canvasShot(page), info = await page.evaluate(() => ({q:VisionWorld.getQuality(), post:VisionWorld.debug.postInfo()}));
      ok(`[${q}] frame is not blank`, st.colours > 150 && st.std > 8, JSON.stringify(st));
      ok(`[${q}] preset sticks and post-processing matches it`, info.q === q && info.post.active === (q !== 'low') && info.post.haze === (q === 'high' || q === 'ultra'), JSON.stringify(info.post));
    }
    await page.evaluate(() => { VisionWorld.setQuality('high'); VisionWorld.setNight(1, true); }); await page.waitForTimeout(600);
    let st = await canvasShot(page); ok('[high] night frame is not blank (bloom pass)', st.colours > 80 && st.std > 4, JSON.stringify(st));
    await page.evaluate(() => VisionWorld.setNight(0, true));
    // the HD/LITE toggle keeps its meaning with Ultra
    await page.evaluate(() => VisionWorld.setQuality('ultra'));
    const hd = await page.evaluate(() => { const b = document.querySelector('#qualityBtn'); const t0 = b.textContent; b.click(); const t1 = b.textContent, q1 = VisionWorld.getQuality(); b.click(); return {t0, t1, q1, q2:VisionWorld.getQuality()}; });
    ok('HD button: Ultra shows HD, toggles to LITE (low) and back to High', hd.t0 === 'HD' && hd.t1 === 'LITE' && hd.q1 === 'low' && hd.q2 === 'high', JSON.stringify(hd));

    // ---------------- GLB pipeline
    const loaded = await page.evaluate(async () => { const p = VISION_DATA.projects.find(p => p.id === 'expo'); VisionWorld.debug.captureView(p.x, p.z, .3, .62); return VisionWorld.assets.ready(); });
    ok('GLB manifest loads the Vision Guide (Meshopt-compressed, rigged)', loaded.state === 'ready' && loaded.loaded.includes('guide') && !loaded.failed.length, JSON.stringify({state:loaded.state, failed:loaded.failed}));
    await page.waitForTimeout(800);
    const ag = await page.evaluate(() => VisionWorld.assets.agents(30));
    ok('characters spawn, are visible close up, at the authored height', ag.length >= 10 && ag.every(a => a.visible) && ag.every(a => Math.abs(a.size[1] - .0036) < 4e-4), `${ag.length} agents, h=${ag[0] && ag[0].size[1].toFixed(4)}`);
    ok('characters find their floor automatically (paths and plazas, not the ground plane)', ag.every(a => a.at[1] > -.12 + .0015 && a.at[1] < -.12 + .0105), `y-G=${ag[0] && (ag[0].at[1] + .12).toFixed(4)}`);
    const before = ag.map(a => a.at.join(','));
    await page.waitForTimeout(1500);
    const ag2 = await page.evaluate(() => VisionWorld.assets.agents(30));
    ok('walking characters move along their promenade', ag2.filter((a, i) => a.state === 'walk' && a.at.join(',') !== before[i]).length > 0);
    // a completion burst at the Expo makes nearby characters cheer, with a cross-fade (two clips weighted mid-blend)
    const blend = await page.evaluate(async () => { const p = VISION_DATA.projects.find(p => p.id === 'expo'); VisionWorld.burst(p.x, p.z);
      await new Promise(r => setTimeout(r, 120)); const mid = VisionWorld.assets.agents(30); await new Promise(r => setTimeout(r, 900)); return {mid, end:VisionWorld.assets.agents(30)}; });
    const cheering = blend.end.filter(a => a.state === 'cheer'), mixing = blend.mid.filter(a => Object.values(a.weights).filter(w => w > .02 && w < .98).length >= 2);
    ok('a completion burst nearby makes characters cheer', cheering.length > 0, `${cheering.length} cheering`);
    ok('animation states cross-fade (two clips partly weighted mid-blend)', mixing.length > 0, `${mixing.length} blending`);
    // static props: instanced per mesh, LOD file by distance, hidden beyond their range
    const pr = await page.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)), p = VISION_DATA.projects.find(p => p.id === 'expo');
      await VisionWorld.assets.load('tests/fixtures/props.manifest.json'); const at = async d => { VisionWorld.debug.captureView(p.x, p.z, d, .62); await wait(250); return VisionWorld.assets.props()[0]; };
      return {near:await at(.3), mid:await at(1.0), far:await at(3.0), info:VisionWorld.assets.info()}; });
    ok('instanced props load from a second manifest (4 instances, 2 LOD levels)', pr.near && pr.near.instances === 4 && pr.near.levels === 2 && !pr.info.failed.length, JSON.stringify(pr.near));
    ok('props switch LOD by distance and hide beyond their range', pr.near.level === 0 && pr.mid.level === 1 && pr.far.on === false, `near ${pr.near.level} · mid ${pr.mid.level} · far ${pr.far.on ? 'shown' : 'hidden'}`);
    await page.evaluate(() => VisionWorld.setQuality('low')); await page.waitForTimeout(300);
    ok('[low] no character is drawn on Reduced', (await page.evaluate(() => VisionWorld.assets.info().visibleAgents)) === 0);
    await page.evaluate(() => VisionWorld.setQuality('high'));
    ok('no console errors on desktop (all presets, GLB, night)', !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();

    // ---------------- phone: touch play through the menu, the national map and the City Builder
    const ph = await open({viewport:{width:390, height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true});
    st = await canvasShot(ph.page); ok('[phone] home view is not blank', st.colours > 150 && st.std > 8, JSON.stringify(st));
    const tq = await ph.page.evaluate(() => VisionWorld.getQuality()); ok('[phone] boots on a valid preset', ['ultra', 'high', 'medium', 'low'].includes(tq), tq);
    await ph.page.tap('[data-go=city]'); await ph.page.waitForFunction(() => !document.querySelector('#chud').classList.contains('hidden'), null, {timeout:20000});
    await ph.page.waitForTimeout(3000);
    st = await canvasShot(ph.page); ok('[phone] City Builder opens by tap and draws', st.colours > 150 && st.std > 8, JSON.stringify(st));
    const tool = await ph.page.$('#cTools button'); if (tool) await tool.tap();
    const box = await ph.page.locator('#world').boundingBox(); await ph.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await ph.page.waitForTimeout(500);
    ok('[phone] taps on tools and the map raise no errors', !ph.errors.length, ph.errors.slice(0, 3).join(' | '));
    const pf = await ph.page.evaluate(async () => { const iv = []; let last = performance.now(); for (let i = 0; i < 90; i++) { await new Promise(requestAnimationFrame); const n = performance.now(); if (i > 9) iv.push(n - last); last = n; } return iv.reduce((a, b) => a + b, 0) / iv.length; });
    ok('[phone] City Builder keeps an interactive frame rate', pf < 50, pf.toFixed(1) + ' ms');
    await ph.ctx.close();
  } finally { await browser.close(); server.close(); }
  console.log(fails ? `\n${fails} FAILED` : '\nAll premium smoke checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL  premium smoke test crashed:', e.message); process.exit(1); });
