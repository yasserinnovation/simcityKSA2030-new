const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(new URL(req.url,'http://x').pathname));fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream'});res.end(err?'':data);});});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome'}).catch(()=>chromium.launch({channel:'msedge'})),results={};
  try {
    for(const enabled of [false,true]) {
      const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1}),page=await ctx.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html?culling=${enabled?'on':'off'}`);
      await page.waitForFunction(()=>window.VisionWorld&&window.VNP);
      await page.waitForFunction(()=>{document.querySelector('#skipBtn')?.click();return !document.querySelector('#menu').classList.contains('hidden');});
      await page.evaluate(()=>{VisionWorld.debug.holdQuality();VisionWorld.debug.captureMode(true);VisionWorld.debug.previewComplete(true);VisionWorld.setQuality('high');});
      const samples={};
      await page.evaluate(()=>{const p=VISION_DATA.projects.find(p=>p.id==='ksip');VisionWorld.debug.captureView(p.x,p.z,.35);});
      await page.waitForTimeout(1800);
      for(const view of ['project-focus','kingdom','east']) {
        await page.evaluate(view=>{if(view==='project-focus'){const p=VISION_DATA.projects.find(p=>p.id==='ksip');VisionWorld.debug.captureView(p.x,p.z,2.3);}else VisionWorld.debug.regionView(view);},view);
        await page.waitForTimeout(1800);
        samples[view]=await page.evaluate(async()=>{let last;const times=[];await new Promise(resolve=>{function f(t){if(last!=null)times.push(t-last);last=t;if(times.length<120)requestAnimationFrame(f);else resolve();}requestAnimationFrame(f);});times.sort((a,b)=>a-b);return {...VisionWorld.debug.frameStats(),medianMs:times[60],p95Ms:times[114],dist:VisionWorld.debug.state().dist};});
      }
      results[enabled?'culled':'unculled']={samples,errors};await ctx.close();
    }
    fs.writeFileSync(path.join(root,'docs/visual-slice-v16/culling-wide-views.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results));if(Object.values(results).some(r=>r.errors.length))process.exitCode=1;
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
