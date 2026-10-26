// Actual browser checks for V24 controls, audio persistence, close-up picking and mobile settings.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core'),root=path.resolve(__dirname,'..');
(async()=>{
  const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm','.woff2':'font/woff2'};
  const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);fs.readFile(path.join(root,p==='/'?'index.html':p),(e,d)=>{res.writeHead(e?404:200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});res.end(e?'Missing file':d);});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
    const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],missing=[];
    page.setDefaultTimeout(90000);
    page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
    const boot=async()=>{await page.goto(`http://127.0.0.1:${server.address().port}/index.html?tutorial=off&short`);await page.waitForFunction(()=>{document.querySelector('#skipBtn')?.click();return window.VNP&&!document.querySelector('#menu').classList.contains('hidden');},null,{polling:250});};
    await boot();await page.waitForSelector('#bootStatus',{state:'detached'});console.log('PASS loading screen completes');
    await page.evaluate(()=>{VisionWorld.debug.holdQuality();VisionWorld.setQuality('low');VNP.showSettings();});
    await page.locator('#setVolume').evaluate(e=>{e.value='31';e.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.uncheck('#setAmbience');await page.uncheck('#setSound');await page.waitForTimeout(400);
    let audio=await page.evaluate(()=>VNP.audio.info());
    assert.equal(audio.volume,.31);assert.equal(audio.ambience,false);assert.equal(audio.muted,true);assert.ok(audio.master<.001,JSON.stringify(audio));
    await page.check('#setSound');await page.waitForTimeout(400);audio=await page.evaluate(()=>VNP.audio.info());
    assert.equal(audio.state,'running');assert.ok(Math.abs(audio.master-.31)<.015,JSON.stringify(audio));
    console.log('PASS volume and mute control the live master bus');
    await boot();await page.evaluate(()=>{VisionWorld.debug.holdQuality();VisionWorld.setQuality('low');VNP.showSettings();});
    assert.equal(await page.inputValue('#setVolume'),'31');assert.equal(await page.isChecked('#setAmbience'),false);
    console.log('PASS audio preferences survive reload');
    await page.click('#setClose');
    await page.evaluate(()=>{VNP.openNational();document.querySelector('#beginBtn').click();const p=VISION_DATA.projects.find(p=>p.id==='expo');VisionWorld.debug.captureView(p.x,p.z,.65,.75);});
    await page.waitForTimeout(600);
    const st=()=>page.evaluate(()=>VisionWorld.debug.state());let a=await st();
    await page.mouse.move(850,450);await page.mouse.wheel(0,-160);await page.waitForTimeout(1300);let b=await st();assert.ok(b.dist<a.dist);
    await page.mouse.down();await page.mouse.move(920,480,{steps:5});await page.mouse.up();await page.waitForTimeout(1200);a=await st();assert.ok(Math.abs(a.az-b.az)>.1);
    await page.keyboard.down('q');await page.waitForTimeout(700);await page.keyboard.up('q');await page.waitForTimeout(900);b=await st();assert.ok(b.az>a.az);
    console.log('PASS wheel zoom, pointer orbit and keyboard rotation');
    // At close zoom, spatial batches must retain the IDs of the original models.
    await page.evaluate(()=>{const p=VISION_DATA.projects.find(p=>p.id==='expo');VisionWorld.debug.captureView(p.x,p.z,.65,.75);});await page.waitForTimeout(600);
    const picks=await page.evaluate(()=>{const pts=VisionWorld.debug.visiblePixels('expo',5).filter(p=>p.x!=null);return pts.map(p=>VisionWorld.debug.pickAt(p.x,p.y));});
    assert.ok(picks.some(p=>p?.select==='expo'||p?.choose?.includes('expo')),JSON.stringify(picks));
    console.log('PASS close-up culling preserves project selection');
    for(const quality of ['high','medium','low']){
      const post=await page.evaluate(q=>{VisionWorld.setQuality(q);return VisionWorld.debug.postInfo();},quality);
      assert.equal(post.contactAO,quality==='high');
    }
    console.log('PASS contact shading is disabled on Medium and Reduced');
    await page.evaluate(()=>{VNP.go('home');VNP.showSettings();});await page.setViewportSize({width:390,height:844});await page.click('#settingsPanel [data-lang="ar"]');
    assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
    const boxes=await page.evaluate(()=>['setSound','setVolume','setAmbience','setQuality','setClose'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
    assert.ok(boxes.every(r=>r.x>=0&&r.y>=0&&r.right<=390&&r.bottom<=844),JSON.stringify(boxes));
    await page.evaluate(()=>{const c=VisionLayout.RIYADH_CORE;VisionWorld.debug.captureView(c.x,c.z,.8,.7);});
    await page.locator('#setName').focus();const prior=await st();await page.keyboard.type('wasd');await page.waitForTimeout(400);const after=await st();assert.ok(Math.abs(after.az-prior.az)<.001);
    const out=path.join(root,'docs/cinematic-v24/after');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'mobile-settings.jpg'),quality:90});
    console.log('PASS phone RTL settings fit, typing does not move the camera');
    assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);console.log('PASS no missing files or browser errors');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
