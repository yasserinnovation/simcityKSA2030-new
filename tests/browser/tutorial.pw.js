// node tests/browser/tutorial.pw.js [shotsDir] — plays "Your first thriving neighbourhood" end to end in a real browser with
// real clicks and drags on the map, and checks isolation, resume, skip, replay, invalid placements, Arabic RTL and phone width.
// Uses playwright-core with the installed Chrome (or Edge) and its own static server, like tests/render.smoke.js.
const path = require('path'), http = require('http'), fs = require('fs');
const { chromium } = require('playwright-core');
const shots = process.argv[2] ? path.resolve(process.argv[2]) : null; if (shots) fs.mkdirSync(shots, {recursive:true});

function serve(){ const root = path.resolve(__dirname, '..', '..');
  const T = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.glb':'model/gltf-binary', '.woff2':'font/woff2'};
  const s = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p);
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, {'Content-Type':T[path.extname(f)] || 'application/octet-stream'}); res.end(d); }); });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(s))); }

let fails = 0; const ok = (label, cond, info = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label.padEnd(78)} ${info}`); };
const TKEY = 'visionNexus2030.tutorial.v1', PKEY = 'visionNexus2030.profile.v4';

(async () => {
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}).catch(() => chromium.launch({channel:'msedge'}));
  const open = async (size = {width:1440, height:900}, init) => { const ctx = await browser.newContext({viewport:size, hasTouch:size.width < 500}), page = await ctx.newPage(), errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(String(e)));
    if (init) await page.addInitScript(init, null);
    return {ctx, page, errors}; };
  const boot = async page => { await page.goto(base + '?short'); await page.waitForFunction(() => window.VNP && window.VisionTutorial, null, {timeout:60000}); };
  const stepIs = (page, id, timeout = 20000) => page.waitForFunction(id => window.VisionTutorial.state().step === id && window.VisionTutorial.state().active, id, {timeout, polling:200})
    .catch(async e => { const st = await page.evaluate(() => ({t:window.VisionTutorial.state(), conf:document.querySelector('#cConfirm').textContent.slice(0, 160), month:window.VisionCity.state.month})).catch(() => null); throw new Error(`waiting for step ${id}: ${JSON.stringify(st)}`); });
  const settle = page => page.waitForTimeout(2600);   // camera flights between steps
  // screen point of a parcel centre (CSS pixels), from the renderer's own projection
  const tileXY = (page, i, j) => page.evaluate(([i, j]) => { const g = window.VNP.cityGrid, r = document.querySelector('#world').getBoundingClientRect(), p = window.VisionWorld.debug.screen(g.x0 + (i + .5) * g.ts, g.z0 + (j + .5) * g.ts); return {x:r.left + p.x, y:r.top + p.y}; }, [i, j]);   // CSS pixels
  const drag = async (page, a, b) => { const p = await tileXY(page, ...a), q = await tileXY(page, ...b); await page.mouse.move(p.x, p.y); await page.mouse.down(); for (let k = 1; k <= 8; k++) await page.mouse.move(p.x + (q.x - p.x) * k / 8, p.y + (q.y - p.y) * k / 8); await page.mouse.up(); };
  const tool = (page, id) => page.click(`#cTools [data-tool="${id}"]`);
  const build = async page => { await page.waitForSelector('#cConfirm:not(.hidden) #cOk:not([disabled])', {timeout:5000}); await page.click('#cOk'); };
  const shot = async (page, name) => { if (shots) await page.screenshot({path:path.join(shots, name + '.png')}); };
  const msg = page => page.evaluate(() => window.VisionTutorial.state().msg || '');

  /* ---------- 1. a brand-new player: the tutorial starts by itself and is played with real input ---------- */
  { const {ctx, page, errors} = await open();
    await boot(page);
    await stepIs(page, 'camera', 30000); ok('New player: the tutorial starts automatically after the opening', true);
    const card = await page.textContent('#tutCard'); ok('Step indicator shown ("Step 1 of 6") with one instruction', /Step 1 of 6/.test(card) && /bring your first neighbourhood to life/.test(card));
    await settle(page); await shot(page, '01_camera');
    const box = await page.locator('#world').boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -240);
    await stepIs(page, 'road'); ok('Camera step completes when the player zooms the map', true);
    { const tg = await page.evaluate(() => [...document.querySelectorAll('.tut-target')].map(e => e.dataset.tool || e.id || e.className)); ok('Road step highlights exactly one control: the Road tool', tg.join() === 'road', JSON.stringify(tg)); }
    ok('A gold guide shows a valid road placement', await page.evaluate(() => (window.VisionTutorial.state().hint || []).length >= 6));
    await settle(page); await shot(page, '02_road');
    await tool(page, 'road');
    await drag(page, [20, 5], [25, 5]);   // invalid: an isolated street
    await page.waitForTimeout(500);
    ok('Invalid placement: an isolated street is explained and does not advance', /does not touch the main road/.test(await msg(page)) && (await page.textContent('#cConfirm')).includes('Not connected'));
    await shot(page, '03_road_invalid');
    await page.click('#cNo');
    await drag(page, [7, 14], [16, 14]); await build(page);
    await stepIs(page, 'homes'); ok('Road step completes only with a street connected to the network', await page.evaluate(() => { const S = window.VisionCity.state; return S.tiles.filter((t, u) => t.k === 'r' && !t.art && S.m.compGate[S.m.comp[u]]).length >= 3; }));
    await settle(page);
    await tool(page, 'zoneR'); await drag(page, [8, 13], [15, 13]); await build(page);
    await stepIs(page, 'power');
    const zoned = await page.evaluate(() => window.VisionCity.state.tiles.filter(t => t.k === 'z' && t.zone === 'R').map(t => ({st:t.st, pow:t.pow})));
    ok('Homes zoned with the real tool; plots stay undeveloped without power', zoned.length >= 6 && zoned.every(z => z.st === 0 && !z.pow), JSON.stringify(zoned.length));
    await page.waitForTimeout(1800);
    ok('Power-needed markers (⚡) are shown on plots that only lack power', await page.locator('.city-lab.nopow').count() > 0);
    await settle(page); await shot(page, '04_power_needed');
    await tool(page, 'solar');
    await drag(page, [22, 4], [22, 4]); await page.waitForTimeout(500);
    ok('Invalid placement: a solar farm away from the road is explained', /does not touch a road/.test(await msg(page)), await msg(page));
    await page.click('#cNo');
    const ph = await page.evaluate(() => window.VisionTutorial.state().hint[0]);
    await drag(page, ph, ph); await build(page);
    await stepIs(page, 'time');
    ok('Power step completes from real supply: every zoned plot has power', await page.evaluate(() => window.VisionCity.state.tiles.filter(t => t.k === 'z').every(t => t.pow)));
    await page.waitForTimeout(1800);
    ok('Power-needed markers clear once power arrives', await page.locator('.city-lab.nopow').count() === 0);
    // refresh during a step: Resume continues from the same step with the same world
    await page.waitForTimeout(900); const before = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), TKEY);
    ok('The tutorial is saved under its own key while it runs (current step included)', before && before.step === 4 && !!before.city, before ? 'step ' + before.step : 'none');
    await page.reload(); await page.waitForFunction(() => window.VisionTutorial, null, {timeout:60000});
    await page.waitForSelector('#tutRes', {timeout:30000}); ok('After a refresh the game offers Resume / Start again / Skip', await page.isVisible('#tutRe') && await page.isVisible('#tutSk'));
    await page.click('#tutRes'); await stepIs(page, 'time');
    ok('Resume returns to the same step and the same tutorial world', await page.evaluate(() => window.VisionCity.state.tiles.filter(t => t.k === 'z').length) === zoned.length);
    await settle(page);
    const pop0 = await page.evaluate(() => window.VisionCity.state.m.pop);
    ok('Time step highlights the 3× speed control', await page.evaluate(() => !!document.querySelector('#cTop [data-speed="3"].tut-target')));
    await page.click('#cTop [data-speed="3"]');
    await stepIs(page, 'park', 60000);
    const t = await page.evaluate(() => ({pop:window.VisionCity.state.m.pop, res:window.VisionTutorial.state().result, occ:window.VisionCity.state.tiles.filter(t => t.k === 'z' && t.st >= 3).length}));
    ok('Residents arrive through the real simulation (population from the simulation, not a counter)', pop0 === 0 && t.pop > 0 && t.occ >= 3, `pop ${pop0} → ${t.pop}`);
    ok('The change is explained with real numbers (residents and monthly balance)', t.res.includes(`→ ${t.pop}`) && /Monthly balance/.test(t.res), t.res.slice(0, 90));
    ok('Time is paused again after residents arrive', await page.evaluate(() => window.VNP.cityUI.speed === 0));
    await page.waitForTimeout(2500); await shot(page, '05_residents_dusk');
    ok('Powered, occupied homes light up (window lights come from powered parcels only)', await page.evaluate(() => { const S = window.VisionCity.state; return S.tiles.some(t => t.k === 'z' && t.st >= 3 && t.pow); }));
    await settle(page);
    await tool(page, 'park'); const pk = await page.evaluate(() => window.VisionTutorial.state().hint[0]);
    await drag(page, pk, pk); await build(page);
    await page.waitForSelector('#tutCont', {timeout:15000});
    const fin = await page.evaluate(() => window.VisionTutorial.state().final);
    ok('Park effect is measured from the simulation (land value and environment both rise)', fin && fin.land > fin.land0 && fin.env > fin.env0, JSON.stringify(fin));
    ok('Finale offers "Continue building" and "Explore missions"', (await page.textContent('#tutCard')).includes('Continue building') && (await page.textContent('#tutCard')).includes('Explore missions'));
    ok('KPIs are labelled as simulated, fictional results', /not official Vision 2030/.test(await page.textContent('#tutCard')));
    await page.waitForTimeout(1500); await shot(page, '06_finale');
    const prof = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), PKEY);
    ok('Completion is stored in the existing profile', prof.tutorial && prof.tutorial.done === true);
    await page.click('#tutCont');
    await page.waitForFunction(() => window.VNP.cityActive() && !window.VNP.cityUI.session, null, {timeout:15000});
    ok('"Continue building" opens the regular City Builder (not the tutorial world)', await page.evaluate(k => !localStorage.getItem(k) && window.VisionCity.state.gridPower == null, TKEY));
    ok('No console errors during the full tutorial', !errors.length, errors.slice(0, 2).join(' | '));
    await ctx.close(); }

  /* ---------- 2. an existing player: no automatic tutorial; Replay from Help; saves are never touched ---------- */
  { const seed = () => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
      localStorage.setItem('visionNexus2030.profile.v4', JSON.stringify({v:4, lang:'en', sound:false, seenIntro:true, points:5, upgrades:[], missions:{m1:{medal:'gold', attempts:1}}, legacy:{}, daily:{}, weekly:{}, build6:true}));
};
    const {ctx, page, errors} = await open({width:1440, height:900}, seed);
    // a real City Builder save to protect: build one in the page, then reload
    await boot(page); await page.waitForFunction(() => !document.querySelector('#menu').classList.contains('hidden'), null, {timeout:30000});
    await page.evaluate(() => { const G = window.VNP, VC = window.VisionCity; G.openCity(true); VC.apply('road', [7,14], [12,14]); VC.apply('zoneR', [8,13], [12,13]); G.cityStep(4); G.closeCity(); });
    await page.waitForTimeout(500);
    const keys = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().filter(k => !/profile|tutorial/.test(k)).map(k => [k, localStorage.getItem(k)])));
    ok('Existing player: the tutorial does not start by itself', await page.evaluate(() => !window.VisionTutorial.state().active && !window.VisionTutorial.isNewPlayer()));
    ok('Main menu offers the tutorial', await page.isVisible('#tutBtn'));
    await page.click('#cityBtn'); await page.waitForFunction(() => window.VNP.cityActive(), null, {timeout:10000}); await page.waitForTimeout(3500);
    await page.click('#mapHelp .mh-btn'); await page.click('.mh-tut');
    await stepIs(page, 'camera'); ok('Replay Tutorial from the Help panel starts the tutorial from the City Builder', true);
    const world = c => { const d = JSON.parse(c); return JSON.stringify({tiles:d.tiles.map(t => [t.k, t.zone, t.st]), month:d.month, budget:d.budget, routes:d.routes}); };
    const kept = await page.evaluate(() => localStorage.getItem('visionNexus2030.city.v1'));
    ok('The player’s City Builder world is unchanged when the tutorial opens (tiles, month, budget)', world(kept) === world(keys['visionNexus2030.city.v1']));
    const keys0 = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().filter(k => !/profile|tutorial/.test(k)).map(k => [k, localStorage.getItem(k)])));
    await page.click('#tutNext'); await stepIs(page, 'road'); await settle(page);
    await tool(page, 'road'); await drag(page, [7, 14], [16, 14]); await build(page); await stepIs(page, 'homes');
    const during = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().filter(k => !/profile|tutorial/.test(k)).map(k => [k, localStorage.getItem(k)])));
    ok('During the tutorial every other save is byte-identical (City Builder world and its backup)', JSON.stringify(during) === JSON.stringify(keys0), Object.keys(keys0).join(','));
    await page.click('#tutSkip');
    await page.waitForFunction(() => window.VNP.cityActive() && !window.VNP.cityUI.session, null, {timeout:15000});
    const after = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().filter(k => !/profile|tutorial|city\.v1/.test(k)).map(k => [k, localStorage.getItem(k)])));
    ok('Skip returns to where the player was (their City Builder world) and removes the tutorial save', await page.evaluate(k => !localStorage.getItem(k) && window.VisionCity.state.gridPower == null && window.VisionCity.state.tiles.some(t => t.k === 'z'), TKEY));
    ok('Skip leaves the other saves untouched', JSON.stringify(after) === JSON.stringify(Object.fromEntries(Object.entries(keys0).filter(([k]) => !/city\.v1/.test(k)))));
    ok('After Skip the player’s City Builder world is the same world (tiles, month, budget)', world(await page.evaluate(() => window.VisionCity.serialize())) === world(keys['visionNexus2030.city.v1']));
    ok('Skip keeps profile progress (medals, points)', await page.evaluate(k => { const p = JSON.parse(localStorage.getItem(k)); return p.missions.m1.medal === 'gold' && p.points === 5 && p.tutorial.skipped; }, PKEY));
    // existing modes still open and resume
    await page.evaluate(() => window.VNP.go('missions')); await page.waitForTimeout(1500);
    ok('Missions mode still opens', await page.evaluate(() => !document.querySelector('#chapter').classList.contains('hidden') || !document.querySelector('#mhud').classList.contains('hidden')));
    await page.evaluate(() => window.VNP.go('home')); await page.waitForTimeout(800);
    await page.click('#playBtn'); await page.waitForFunction(() => !document.querySelector('#mhud').classList.contains('hidden'), null, {timeout:15000});
    ok('An existing mission still starts', true);
    await page.evaluate(() => window.VNP.go('national')); await page.waitForTimeout(2500);
    ok('National Simulation still opens', await page.evaluate(() => !document.querySelector('#hud').classList.contains('hidden') || !!document.querySelector('#setup:not(.hidden), .setup:not(.hidden), #natSetup:not(.hidden)')));
    await page.evaluate(() => window.VNP.go('city')); await page.waitForFunction(() => window.VNP.cityActive(), null, {timeout:10000});
    ok('The City Builder resumes the player’s own world', await page.evaluate(() => window.VisionCity.state.gridPower == null && window.VisionCity.state.month >= 4));
    ok('No console errors for the existing player', !errors.length, errors.slice(0, 2).join(' | '));
    await ctx.close(); }

  /* ---------- 3. Arabic RTL at phone width ---------- */
  { const {ctx, page, errors} = await open({width:390, height:844}, () => { if (!localStorage.getItem('visionNexus2030.profile.v4')) localStorage.setItem('visionNexus2030.profile.v4', JSON.stringify({v:4, lang:'ar', sound:false, seenIntro:true, points:0, upgrades:[], missions:{}, legacy:{}, daily:{}, weekly:{}, build6:true})); });
    await boot(page); await stepIs(page, 'camera', 30000);
    ok('Arabic: the page is right-to-left and the tutorial text is Arabic', await page.evaluate(() => document.documentElement.dir === 'rtl' && /لنُحيِ حيّك الأول/.test(document.querySelector('#tutCard').textContent)));
    await settle(page); await shot(page, '07_ar_phone_camera');
    await page.click('#tutNext'); await stepIs(page, 'road'); await settle(page);
    const r = await page.evaluate(() => { const c = document.querySelector('#tutCard').getBoundingClientRect(), t = document.querySelector('#cTools').getBoundingClientRect(), top = document.querySelector('#cTop').getBoundingClientRect(); return {c:[c.top, c.bottom, c.left, c.right], t:[t.top, t.bottom], top:top.bottom, w:innerWidth}; });
    ok('Phone: the tutorial card fits the screen and does not cover the tools or the top bar', r.c[1] <= r.t[0] && r.c[0] >= r.top && r.c[2] >= 0 && r.c[3] <= r.w, JSON.stringify(r));
    ok('Phone: the highlighted Road tool is visible on screen', await page.evaluate(() => { const b = document.querySelector('.tut-target').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; }));
    await shot(page, '08_ar_phone_road');
    // touch: tap the tool, then place the street with the same drag on the map
    await page.tap('#cTools [data-tool="road"]'); await drag(page, [7, 14], [16, 14]); await build(page); await stepIs(page, 'homes');
    ok('Phone: the road step works with touch-sized controls', true);
    ok('No console errors in Arabic at phone width', !errors.length, errors.slice(0, 2).join(' | '));
    await ctx.close(); }

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nAll tutorial browser checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL  tutorial test crashed:', e.message.split('\n').slice(0, 3).join(' / '), (e.stack || '').split('\n').find(l => /tutorial\.pw\.js/.test(l))); process.exit(1); });
