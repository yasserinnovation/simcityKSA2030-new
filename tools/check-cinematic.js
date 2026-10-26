// Matched, deterministic gameplay captures. CHROME_PATH selects an installed browser.
// Starts its own local server: node tools/check-cinematic.js before|after
const {chromium} = require('playwright-core');
const fs = require('fs'), path = require('path');
const phase = process.argv[2] || 'after';
const out = path.resolve(__dirname, '../docs/cinematic-v24', phase);
fs.mkdirSync(out, {recursive:true});
(async () => {
  const server = require('child_process').fork(path.join(__dirname,'serve.js'), ['8123'], {stdio:['ignore','pipe','pipe','ipc']});
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Server exited '+code)));});
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH,
    ...(process.env.CHROME_PATH ? {} : {channel:'chrome'}), args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1280,height:800}}), errors = [], failed = [];
  page.setDefaultTimeout(120000);
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if(m.type()==='error') errors.push(m.text()); });
  page.on('response', r => { if(r.status()>=400) failed.push(r.url()); });
  const report = {phase, browser:browser.version(), viewport:[1280,800], gpu:'SwiftShader software renderer; not device GPU performance', errors, failed};
  try {
    if(phase==='before'){
      const original='202b6871d95482e91348a94cb6fa23229c5f7f86', files=['index.html','boot.js','engine.js','premium.js','country-overview.js','play_core.js','play_mission.js','city_ui.js','styles.css'];
      for(const file of files){const body=require('child_process').execFileSync('git',['show',original+':'+file],{cwd:path.resolve(__dirname,'..'),maxBuffer:5e6});
        await page.route('**/'+file+'*',r=>r.fulfill({status:200,body,contentType:file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/javascript'}));}
    }
    await page.goto('http://127.0.0.1:8123/index.html?tutorial=off&short');
    await page.waitForFunction(() => { document.querySelector('#skipBtn')?.click(); return window.VNP?.cityRender && !document.querySelector('#menu').classList.contains('hidden'); }, null, {polling:300});
    await page.evaluate(() => {VisionWorld.debug.holdQuality(); VisionWorld.setQuality('high'); VisionWorld.debug.captureMode(true);});
    await page.addStyleTag({content:'body.capture-clean>*:not(#world):not(script):not(style){visibility:hidden!important}'});
    const shot = async name => { await page.waitForTimeout(600); await page.screenshot({path:path.join(out,name+'.jpg'),quality:90}); };
    await page.evaluate(() => VisionWorld.debug.regionView('kingdom')); await shot('kingdom-ui');
    await page.evaluate(() => {VNP.openNational(); document.querySelector('#beginBtn').click(); document.body.classList.add('capture-clean'); const c=VisionLayout.RIYADH_CORE; VisionWorld.debug.captureView(c.x,c.z,.8,.62);});
    await shot('riyadh');
    await page.evaluate(() => {document.body.classList.remove('capture-clean'); VNP.go('city'); VNP.cityUI.cutFlight=true; VisionCity.newCity({seed:77,anchors:[],budget:300});
      const C=VisionCity; C.apply('road',[7,14],[22,14]); C.apply('road',[7,10],[22,10]); C.apply('road',[22,10],[22,18]); C.apply('road',[7,18],[22,18]);
      C.apply('zoneR',[8,11],[19,13]); C.apply('zoneC',[8,15],[19,17]); C.apply('school',[7,12]); C.apply('park',[12,9]); C.apply('clinic',[21,12]);
      for(let i=0;i<16;i++)C.tick(); VNP.cityRender(); const g=VNP.cityGrid; VisionWorld.debug.captureView(g.x0+14.5*g.ts,g.z0+13*g.ts,.60,.75); });
    // Let the entry-flight caption expire; the capture cuts that flight for a matched camera.
    await page.waitForTimeout(7100);
    await shot('city-ui'); await page.evaluate(() => document.body.classList.add('capture-clean')); await shot('city');
    report.city = await page.evaluate(() => ({occupied:VisionCity.state.tiles.filter(t=>t.k==='z'&&t.st===3).length, stats:VisionWorld.debug.frameStats(), lighting:VisionWorld.debug.lighting()}));
    report.performance = {};
    for(const quality of ['high','medium','low']) {
      await page.evaluate(q => VisionWorld.setQuality(q),quality); await page.waitForTimeout(350);
      report.performance[quality] = await page.evaluate(async () => { const a=[]; let prev=performance.now(); for(let i=0;i<36;i++){await new Promise(requestAnimationFrame);const now=performance.now();if(i>5)a.push(now-prev);prev=now;} a.sort((a,b)=>a-b);return {meanMs:a.reduce((x,y)=>x+y,0)/a.length,p95Ms:a[Math.floor(a.length*.95)],...VisionWorld.debug.frameStats()};});
    }
    if(phase==='after'){
      await page.evaluate(()=>{VisionWorld.setQuality('high');VisionWorld.debug.captureMode(false);VNP.cityUI.dayT=.9;VisionWorld.setNight(1,true);});await shot('city-night');
    }
  } finally {fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();server.kill();}
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
