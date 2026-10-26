// National world regression: missing dunes, real region navigation, and phone/RTL layout.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
(async()=>{
 const server=require('node:child_process').fork(path.join(__dirname,'../tools/serve.js'),['8123'],{stdio:['ignore','pipe','pipe','ipc']});
 await new Promise((r,j)=>{server.stdout.once('data',r);server.once('error',j);});
 let browser;const errors=[],missing=[];
 try{
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,...(process.env.CHROME_PATH?{}:{channel:'chrome'})});
  const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
  await page.goto('http://127.0.0.1:8123/index.html?tutorial=off&short');
  await page.waitForFunction(()=>{document.querySelector('#skipBtn')?.click();return window.VNP?.cityRender&&!document.querySelector('#menu').classList.contains('hidden');},null,{polling:300});
  await page.evaluate(()=>{VisionWorld.debug.holdQuality();VisionWorld.setQuality('low');});
  const info=await page.evaluate(()=>window.__visionCountryOverview);
  assert.ok(info.duneGroups>0&&info.buttresses>30&&info.terraces>0&&info.waterRoutes>0,JSON.stringify(info));
  console.log('PASS dunes, western rocks, terraces and navigable water routes are populated');
  assert.equal(info.version,26);assert.ok(info.sculpted.facades===2&&info.sculpted.houses>=15&&info.sculpted.rocks>30);
  await page.locator('[data-scenic="alula"]').click();
  await page.waitForFunction(()=>VisionWorld.debug.state().dist<1.9,null,{polling:300});
  assert.ok(await page.evaluate(()=>Math.hypot(VisionWorld.debug.state().target[0]-VisionLayout.cityDisplay.AlUla[0],VisionWorld.debug.state().target[2]-VisionLayout.cityDisplay.AlUla[1])<.3));
  await page.evaluate(()=>VisionWorld.setQuality('high'));await page.waitForTimeout(500);
  await page.evaluate(()=>VisionWorld.setQuality('low'));
  console.log('PASS the AlUla badge opens the real close-up scene and quality can change there');

  for(const id of (process.argv.includes('--phone')?[]:['riyadh','west','northwest','east','south','kingdom'])){
   await page.click(`#menuRegions [data-mregion="${id}"]`);
   await page.waitForFunction(id=>{const r=VISION_DATA.regions[id],s=VisionWorld.debug.state();return Math.hypot(s.target[0]-r.x,s.target[2]-r.z)<.2;},id,{polling:300});
   assert.ok(await page.locator(`#menuRegions [data-mregion="${id}"]`).evaluate(e=>e.classList.contains('active')));
  }
  if(!process.argv.includes('--phone'))console.log('PASS all six region buttons move the camera to the correct region');
  await page.click('#menuExpand');assert.equal(await page.getAttribute('#menuExpand','aria-expanded'),'true');
  for(const id of ['chapterBtn','upBtn','dailyBtn','cityBtn','weeklyBtn','settingsBtn','nationalBtn'])assert.ok(await page.locator('#'+id).isVisible(),id);
  await page.click('#menuExpand');console.log('PASS compact launcher expands to all existing game modes');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>VNP.showSettings());await page.click('#settingsPanel [data-lang="ar"]');await page.click('#setClose');
  assert.equal(await page.getAttribute('html','dir'),'rtl');
  await page.waitForFunction(()=>{const d=VISION_DATA.regions.kingdom.dist*Math.min(2.8,Math.max(1,Math.pow(1.75/(innerWidth/innerHeight),.66)))*1.3;return Math.abs(VisionWorld.debug.state().dist-d)<.15;},null,{polling:300});
  const boxes=await page.locator('#menuRegions [data-mregion]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,text:e.innerText};}));
  assert.equal(boxes.length,6);assert.ok(boxes.every(r=>r.x>=0&&r.right<=390&&r.y>=0&&r.bottom<=844&&r.text.trim()),JSON.stringify(boxes));
  const out=path.join(__dirname,'../docs/sculpted-v26/after');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'phone-ar.jpg'),quality:90});
  console.log('PASS all six labelled navigation controls fit on an Arabic phone screen');
  const startDist=await page.evaluate(()=>VisionWorld.debug.state().dist),cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:100,y:500},{x:280,y:500}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:95,y:500},{x:285,y:500}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(d=>VisionWorld.debug.state().dist<d-.1,startDist,{polling:300});assert.ok(await page.evaluate(()=>VisionWorld.debug.state().dist>24),'portrait pinch must not snap to the old 22-unit zoom limit');
  console.log('PASS portrait pinch keeps a continuous national camera range');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('PASS no browser errors or missing assets');
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
