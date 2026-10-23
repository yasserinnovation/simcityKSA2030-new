// node tools/make-character.js — writes assets/models/vn_guide.glb (the original "Vision Guide" character) and
// vn_shade.glb (a solar shade canopy, static prop) by running tools/character/make-guide.js in a headless Chrome/Edge with the vendored three.js and GLTFExporter. Dev-only.
const {chromium} = require('playwright-core'), fs = require('fs'), path = require('path'), http = require('http');
const root = path.resolve(__dirname, '..'), outs = {GLB:path.join(root, 'assets/models/vn_guide.glb'), SHADE:path.join(root, 'assets/models/vn_shade.glb')};
const page = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/vendor/three/three.module.js"}}</script>
<script type="module">import {exportGuide, exportShade} from '/tools/character/make-guide.js';
const b64 = b => { const u = new Uint8Array(b); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
Promise.all([exportGuide(), exportShade()]).then(([g, sh]) => { window.SHADE = b64(sh); window.GLB = b64(g); }, e => { window.GLB_ERR = String(e); });</script>`;
const s = http.createServer((req, res) => { const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/make.html') { res.writeHead(200, {'Content-Type':'text/html'}); return res.end(page); }
  fs.readFile(path.join(root, p), (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, {'Content-Type':'text/javascript'}); res.end(d); }); });
s.listen(0, '127.0.0.1', async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}).catch(() => chromium.launch({channel:'msedge'}));
  try { const pg = await browser.newPage(); pg.on('pageerror', e => console.error(e));
    await pg.goto(`http://127.0.0.1:${s.address().port}/make.html`); await pg.waitForFunction(() => window.GLB || window.GLB_ERR, null, {timeout:30000});
    const err = await pg.evaluate(() => window.GLB_ERR); if (err) throw new Error(err);
    for (const [k, out] of Object.entries(outs)) { const buf = Buffer.from(await pg.evaluate(k => window[k], k), 'base64'); fs.mkdirSync(path.dirname(out), {recursive:true}); fs.writeFileSync(out, buf);
      console.log('wrote', path.relative(root, out), (buf.length / 1024).toFixed(1) + ' KB'); }
  } finally { await browser.close(); s.close(); }
});
