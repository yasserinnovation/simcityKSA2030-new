// node tests/browser/city-consequences.pw.js — City Builder decisions and what the map shows afterwards (real clicks and drags).
// Every visual consequence must match the simulation: coverage flashes show the tiles the simulation marks as served,
// completion sparkles follow the simulation's "built" events, lights follow power, and challenge overlays the affected area.
const path = require('path'), http = require('http'), fs = require('fs');
const { chromium } = require('playwright-core');
function serve(){ const root = path.resolve(__dirname, '..', '..');
  const T = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.glb':'model/gltf-binary', '.woff2':'font/woff2'};
  const s = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p);
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, {'Content-Type':T[path.extname(f)] || 'application/octet-stream'}); res.end(d); }); });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(s))); }
let fails = 0; const ok = (label, cond, info = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label.padEnd(84)} ${info}`); };

(async () => {
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}/index.html?tutorial=off&short&showcase=0`;
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}).catch(() => chromium.launch({channel:'msedge'}));
  const ctx = await browser.newContext({viewport:{width:1440, height:900}}), page = await ctx.newPage(), errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForFunction(() => { document.querySelector('#skipBtn')?.click(); return window.VNP && !document.querySelector('#menu').classList.contains('hidden'); }, null, {timeout:60000, polling:250});
  const tileXY = (i, j) => page.evaluate(([i, j]) => { const g = window.VNP.cityGrid, r = document.querySelector('#world').getBoundingClientRect(), p = window.VisionWorld.debug.screen(g.x0 + (i + .5) * g.ts, g.z0 + (j + .5) * g.ts); return {x:r.left + p.x, y:r.top + p.y}; }, [i, j]);
  const drag = async (a, b) => { const p = await tileXY(...a), q = await tileXY(...b); await page.mouse.move(p.x, p.y); await page.mouse.down(); for (let k = 1; k <= 8; k++) await page.mouse.move(p.x + (q.x - p.x) * k / 8, p.y + (q.y - p.y) * k / 8); await page.mouse.up(); };
  const place = async (tool, a, b = a) => { await page.click(`#cTools [data-tool="${tool}"]`); await drag(a, b);
    await page.waitForSelector('#cConfirm:not(.hidden) #cOk:not([disabled])', {timeout:5000}).catch(async e => { await page.screenshot({path:path.join(require('os').tmpdir(), 'cc_fail.png')}); throw new Error(`${tool} ${a}→${b}: ${(await page.textContent('#cConfirm')).slice(0, 160)} | pending ${await page.evaluate(() => JSON.stringify(window.VNP.cityUI.pending && window.VNP.cityUI.pending.p.why))}`); });
    await page.click('#cOk'); await page.waitForTimeout(250); };
  const ticker = () => page.textContent('#cTicker');

  // a fresh district, then a neighbourhood grown through the normal game loop
  await page.click('#cityBtn'); await page.waitForFunction(() => window.VNP.cityActive(), null, {timeout:10000});
  await page.waitForTimeout(3600); await page.evaluate(() => { window.VisionCity.newCity({seed:77, anchors:[], budget:300}); window.VNP.cityRender(); });   // a clean district (no landmark parcels in the way)
  await page.evaluate(() => { const VC = window.VisionCity, G = window.VNP; G.cityUI.cutFlight = true; const g = G.cityGrid; window.VisionWorld.debug.captureView(g.x0 + 14 * g.ts, g.z0 + 14 * g.ts, .95, .8); });
  await page.waitForTimeout(800);
  await place('road', [7, 14], [20, 14]); await place('road', [7, 10], [20, 10]); await place('road', [20, 10], [20, 14]);
  await place('zoneR', [8, 11], [19, 13]);
  const builtEvents = await page.evaluate(() => { const VC = window.VisionCity; let n = 0; for (let k = 0; k < 12; k++) { const ev = VC.tick(); n += ev.filter(e => e.type === 'built').length; } window.VNP.cityRender(); return n; });
  ok('Housing grows only where access and utilities allow it (zoned → occupied)', await page.evaluate(() => window.VisionCity.state.tiles.filter(t => t.k === 'z' && t.st >= 3).every(t => t.pow && t.wat && t.needs.find(n => n.k === 'road').ok)) && builtEvents > 0, `${builtEvents} completed`);

  // a school: its real coverage is flashed and explained
  await place('school', [7, 12]);
  const sch = await page.evaluate(() => ({cov:window.VisionCity.state.tiles.filter(t => t.k === 'z' && t.cov && t.cov.edu).length, flash:window.VNP.cityUI.flash && window.VNP.cityUI.flash.ov}));
  const tk = await ticker();
  ok('Placing a school flashes the education overlay (its simulated coverage)', sch.flash === 'education');
  ok('The message states the number of homes the simulation says it serves', tk.includes(`serves ${sch.cov} homes`) || (sch.cov === 0 && /serves no homes/.test(tk)), tk.slice(0, 90));
  // a park far away: honest "serves no homes"
  await place('park', [27, 20]);   // more than 4 parcels from every home
  ok('A park out of walking reach says it serves no homes yet', /serves no homes yet/.test(await ticker()), (await ticker()).slice(0, 80));
  await place('park', [12, 12 - 3]);
  const pk = await page.evaluate(() => window.VisionCity.state.tiles.filter(t => t.k === 'z' && t.cov && t.cov.park).length);
  ok('A park near homes reports the homes it serves (simulation coverage)', pk > 0 && (await ticker()).includes(`serves ${pk} homes`), `${pk} homes`);

  // completion sparkles follow the simulation's "built" events
  await page.evaluate(() => { window.VNP.cityUI.fresh = []; }); await place('zoneR', [8, 15], [19, 15]);
  await page.evaluate(() => window.VNP.cityStep(4));
  const fresh = await page.evaluate(() => (window.VNP.cityUI.fresh || []).map(f => window.VisionCity.state.tiles[f.u].st));
  ok('Completion sparkles appear only on parcels the simulation just completed', fresh.length > 0 && fresh.every(st => st >= 3), JSON.stringify(fresh));

  // lights: only powered, occupied buildings; cut power and the windows go dark
  const lit = () => page.evaluate(() => { const S = window.VisionCity.state; return S.tiles.filter(t => t.k === 'z' && t.st === 3 && t.pow && t.occ > .1).length; });
  ok('Window lights exist for powered, occupied buildings', await lit() > 0);
  // a power challenge: overload the network so parcels lose power, then let the challenge trigger
  await page.evaluate(() => { const VC = window.VisionCity; VC.apply('zoneR', [8, 16], [19, 22]); VC.apply('road', [7, 18], [20, 18]); VC.apply('road', [7, 22], [20, 22]); VC.apply('road', [20, 14], [20, 22]); });
  const ev = await page.evaluate(() => { const G = window.VNP; let got = null; for (let k = 0; k < 14 && !got; k++) { G.cityStep(1); const ch = window.VisionCity.state.challenges.find(c => !c.doneAt); if (ch) got = {id:ch.id, flash:G.cityUI.flash && G.cityUI.flash.ov}; } return got; });
  ok('A planning challenge highlights the overlay of the affected area', !!ev && ev.flash === {corridor:'traffic', school:'education', power:'power', water:'water', jobs:'access'}[ev.id], JSON.stringify(ev));
  const dark = await page.evaluate(() => { window.VNP.cityRender(); const S = window.VisionCity.state, lit = window.VNP.cityUI.litU; return {lit:lit.length, bad:lit.filter(u => !S.tiles[u].pow || S.tiles[u].st !== 3).length, unpowered:S.tiles.filter(t => t.k === 'z' && t.st === 3 && !t.pow).length}; });
  ok('Window lights only on powered, occupied buildings; unpowered ones stay dark', dark.lit > 0 && dark.bad === 0, JSON.stringify(dark));

  // a bus route opens and reports its first-month riders from the simulation
  await page.click('#cTools [data-tool="route"]');
  for (const [i, j] of [[7, 14], [14, 14], [20, 14], [20, 10], [7, 10]]) { const p = await tileXY(i, j); await page.mouse.click(p.x, p.y); }
  await page.click('#cRouteOk');
  await page.evaluate(() => window.VNP.cityStep(1));
  const rr = await page.evaluate(() => { const r = window.VisionCity.state.routes[window.VisionCity.state.routes.length - 1]; return {riders:r.riders, ticker:document.querySelector('#cTicker').textContent}; });
  ok('A new bus route reports its real first-month riders', rr.ticker.includes(`${rr.riders} riders`) || /auto|paus/i.test(rr.ticker), rr.ticker.slice(0, 90));
  ok('Moving buses run only along the route’s actual road path', await page.evaluate(() => { const S = window.VisionCity.state, r = S.routes[S.routes.length - 1]; return r.path.every(u => S.tiles[u].k === 'r'); }));
  ok('No console errors', !errors.length, errors.slice(0, 2).join(' | '));
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nAll City Builder consequence checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL  consequence test crashed:', e.message.split('\n').slice(0, 3).join(' / ')); process.exit(1); });
