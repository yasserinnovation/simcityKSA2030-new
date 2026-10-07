// node tests/render.smoke.js — render smoke test (Playwright, through the local server).
// For each renderer (three.js, then ?renderer=classic): load the game over http, fail on ANY console error or page error,
// and check that the 3D canvas is not blank in the Kingdom view (home) and in the City Builder.
// Uses playwright-core with an installed Chrome/Edge (no browser download): npm install, then npm run test:render.
// Set CHROME_PATH to use a specific browser binary.
const path = require('path'), zlib = require('zlib'), http = require('http'), fs = require('fs');
const { chromium } = require('playwright-core');

// --- tiny static server (same as tools/serve.js, on a free port)
function serve(){ const root = path.resolve(__dirname, '..');
  const T = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.glb':'model/gltf-binary', '.hdr':'application/octet-stream', '.wasm':'application/wasm'};
  const s = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p);
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, {'Content-Type':T[path.extname(f)] || 'application/octet-stream'}); res.end(d); }); });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(s))); }

// --- minimal PNG decoder (8-bit RGB/RGBA, non-interlaced: what Chrome screenshots produce)
function decodePNG(buf){ let o = 8, w, h, ct, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; o += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  return {w, h, bpp, px}; }
// "Not blank": many distinct colours and real contrast across the frame (a blank or single-colour canvas has neither).
function frameStats(png){ const {w, h, bpp, px} = decodePNG(png), seen = new Set(); let n = 0, s = 0, s2 = 0;
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const i = (y * w + x) * bpp, r = px[i], g = px[i + 1], b = px[i + 2], l = .3 * r + .59 * g + .11 * b;
    seen.add((r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)); n++; s += l; s2 += l * l; }
  return {colours:seen.size, std:Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2))}; }

(async () => {
  let fails = 0; const ok = (label, cond, info = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label.padEnd(70)} ${info}`); };
  const server = await serve(), port = server.address().port;
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}).catch(() => chromium.launch({channel:'msedge'}));
  for (const renderer of ['three', 'classic']) {
    const ctx = await browser.newContext({viewport:{width:1280, height:800}}), page = await ctx.newPage(), errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/index.html${renderer === 'classic' ? '?renderer=classic' : ''}`);
    await page.waitForFunction(() => window.VisionWorld && window.VNP, null, {timeout:30000});
    ok(`[${renderer}] renderer booted`, await page.evaluate(() => window.VN_RENDERER) === renderer);
    // reach the home (Kingdom) view: skip the opening flight
    await page.waitForFunction(() => { document.querySelector('#skipBtn')?.click(); const m = document.querySelector('#menu'); return m && !m.classList.contains('hidden'); }, null, {timeout:30000, polling:300});
    await page.waitForTimeout(2500);
    const shot = async () => { await page.addStyleTag({content:'body>*:not(#world){visibility:hidden!important}'}).catch(() => {}); const b = await page.locator('#world').screenshot(); await page.evaluate(() => document.querySelectorAll('style').forEach(s => { if (s.textContent.includes('body>*:not(#world)')) s.remove(); })); return frameStats(b); };
    let st = await shot(); ok(`[${renderer}] Kingdom view canvas is not blank`, st.colours > 150 && st.std > 8, JSON.stringify(st));
    await page.evaluate(() => document.querySelector('[data-go=city]').click());
    await page.waitForFunction(() => !document.querySelector('#chud').classList.contains('hidden'), null, {timeout:20000});
    await page.waitForTimeout(5000);
    st = await shot(); ok(`[${renderer}] City Builder canvas is not blank`, st.colours > 150 && st.std > 8, JSON.stringify(st));
    ok(`[${renderer}] no console errors`, !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nAll render smoke checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL  smoke test crashed:', e.message); process.exit(1); });
