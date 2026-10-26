// Matched, deterministic gameplay captures. CHROME_PATH selects an installed browser.
// Starts its own local server: node tools/check-reference.js before|after
const {chromium} = require('playwright-core');
const fs = require('fs'), path = require('path');
const phase = process.argv[2] || 'after';
const out = path.resolve(__dirname, '../docs/reference-v25', phase);
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
      const original='8e4731817c69ae61349e264dce02e438220fe737', files=['index.html','boot.js','engine.js','premium.js','country-overview.js','kingdom-landmarks.js','play_core.js','play_mission.js','city_ui.js','styles.css'];
      for(const file of files){const body=require('child_process').execFileSync('git',['show',original+':'+file],{cwd:path.resolve(__dirname,'..'),maxBuffer:5e6});
        await page.route('**/'+file+'*',r=>r.fulfill({status:200,body,contentType:file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/javascript'}));}
    }
    await page.goto('http://127.0.0.1:8123/index.html?tutorial=off&short');
    await page.waitForFunction(() => { document.querySelector('#skipBtn')?.click(); return window.VNP?.cityRender && !document.querySelector('#menu').classList.contains('hidden'); }, null, {polling:300});
    await page.evaluate(() => {VisionWorld.debug.holdQuality(); VisionWorld.setQuality('high'); VisionWorld.debug.captureMode(true);});
    await page.addStyleTag({content:'body.capture-clean>*:not(#world):not(script):not(style){visibility:hidden!important}'});
    const shot = async name => { await page.waitForTimeout(600); await page.screenshot({path:path.join(out,name+'.jpg'),quality:90}); };
    await page.evaluate(() => VisionWorld.debug.regionView('kingdom')); await shot('kingdom-ui');
    await page.evaluate(()=>document.body.classList.add('capture-clean'));
    await shot('kingdom');
    await page.evaluate(()=>{const p=VISION_DATA.cities.find(c=>c.name==='AlUla');const q=VisionLayout.cityDisplay.AlUla||[p.x,p.z];VisionWorld.debug.captureView(q[0],q[1],6.3,1.0);});
    await shot('northwest');
    report.overview=await page.evaluate(()=>window.__visionCountryOverview);
    report.performance={};
    for(const quality of ['high','low']){
      await page.evaluate(q=>{VisionWorld.setQuality(q);VisionWorld.debug.regionView('kingdom');},quality);
      report.performance[quality]=await page.evaluate(async()=>{let prev=performance.now(),a=[];for(let i=0;i<24;i++){await new Promise(requestAnimationFrame);let n=performance.now();if(i>5)a.push(n-prev);prev=n;}a.sort((x,y)=>x-y);return {meanMs:a.reduce((x,y)=>x+y)/a.length,p95Ms:a[Math.floor(a.length*.95)],...VisionWorld.debug.frameStats()};});
    }
  } finally {fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();server.kill();}
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
