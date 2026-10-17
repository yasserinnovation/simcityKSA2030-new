// Isolated browser context: never opens or changes the player's browser storage.
const fs = require('fs'), path = require('path'), http = require('http');
const {chromium} = require('playwright-core');
const root = path.resolve(__dirname, '..'), label = process.argv[2] || 'after';
const out = path.join(root, 'docs', 'visual-slice-v16', label);
fs.mkdirSync(out, {recursive:true});
// Reconstruct the pre-pass rendering with the same capture-only helpers. Saves and
// gameplay sources are identical. Preserve the exact served sources for inspection.
const overrides={};
if(label==='before') {
  if(fs.existsSync(path.join(out,'served-engine.js'))) {
    for(const name of ['engine.js','riyadh.js'])overrides[name]=fs.readFileSync(path.join(out,'served-'+name),'utf8');
  } else {
  let engine=fs.readFileSync(path.join(root,'engine.js'),'utf8');
  engine=engine.replace(/      \/\/ Dielectric GGX response[\s\S]*?\/\/ restrained sky reflection, no extra render pass/,
    '      vec3 H=normalize(uSun+V); c+=sunCol*pow(max(dot(N,H),0.0),32.0)*0.07*sh;\n      c+=vec3(1.0,.85,.6)*pow(1.0-max(dot(N,V),0.0),3.0)*0.06;');
  engine=engine.replace("veh:{geo:vehGeo, glow:.08, cast:1, pick:null}","veh:{geo:vehGeo, glow:.08, cast:1, pick:'occ'}");
  let riyadh=fs.readFileSync(path.join(root,'riyadh.js'),'utf8');
  riyadh=riyadh.replace('const slice = window.VisionSlice?.init(K, protos);','const slice = null;');
  riyadh=riyadh.replace('addBox(x, y + .0015, z, .012, .00022','addBox(x, G + y, z, .012, .0009');
  riyadh=riyadh.replace('pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length]','pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]');
  riyadh=riyadh.replace("[.95, .74, .22], pitch)","[.95, .74, .22])");
  overrides['engine.js']=engine;overrides['riyadh.js']=riyadh;
  for(const [name,source] of Object.entries(overrides))fs.writeFileSync(path.join(out,'served-'+name),source);
  }
}
const server = http.createServer((req,res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url,'http://x').pathname));
  if(overrides[path.relative(root,file)]) {res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(overrides[path.relative(root,file)]);}
  fs.readFile(file, (err,data) => {res.writeHead(err?404:200, {'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream'});res.end(err?'':data);});
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch({channel:'chrome'}).catch(()=>chromium.launch({channel:'msedge'}));
  try {
    const context = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const page = await context.newPage(), errors = [], report = {label, viewport:[1440,900],samples:{}};
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?debug=1&culling=${label==='after'?'on':'off'}`);
    await page.waitForFunction(()=>window.VisionWorld && window.VNP);
    await page.waitForFunction(()=>{document.querySelector('#skipBtn')?.click();return !document.querySelector('#menu').classList.contains('hidden');});
    await page.addStyleTag({content:'body>*:not(#world):not(script):not(style){visibility:hidden!important}'});
    await page.evaluate(()=>{VisionWorld.debug.holdQuality();VisionWorld.debug.captureMode(true);VisionWorld.setNight(0,true);});
    const initial = await page.evaluate(()=>JSON.stringify(localStorage));
    const initialStates = await page.evaluate(()=>JSON.stringify(VisionWorld.debug.projectStates?.()));
    const views = [['overview',null,1.55],['airport','ksip',.35],['qiddiya','qiddiya',.30]];
    for(const tier of ['high','medium','low']) {
      await page.evaluate(t=>VisionWorld.setQuality(t),tier);
      for(const complete of [false,true]) for(const [name,id,dist] of views) {
        if(tier!=='high' && (!complete || name==='overview')) continue;
        await page.evaluate(({id,dist,complete})=>{VisionWorld.debug.previewComplete(complete);const p=id?VISION_DATA.projects.find(p=>p.id===id):VISION_DATA.cities.find(c=>c.name==='Riyadh');VisionWorld.debug.captureView(p.x,p.z,dist);},{id,dist,complete});
        await page.waitForTimeout(1800);
        const key=`${name}-${complete?'complete-preview':'normal'}-${tier}`;
        await page.locator('#world').screenshot({path:path.join(out,key+'.png')});
        const stats = await page.evaluate(async()=>{
          const times=[];let last;await new Promise(resolve=>{function f(t){if(last!=null)times.push(t-last);last=t;if(times.length<120)requestAnimationFrame(f);else resolve();}requestAnimationFrame(f);});
          times.sort((a,b)=>a-b);return {sourceStats:window.__visionStats,...VisionWorld.debug.frameStats(),medianMs:times[60],p95Ms:times[114]};
        });
        report.samples[key]=stats;
      }
    }
    report.previewStorageUnchanged = initial === await page.evaluate(()=>JSON.stringify(localStorage));
    report.previewProjectStatesUnchanged = initialStates === await page.evaluate(()=>JSON.stringify(VisionWorld.debug.projectStates?.()));
    report.lighting=await page.evaluate(()=>VisionWorld.debug.lighting?.());
    // Check model picking at close views with all decorative props visible.
    report.picking={};
    for(const id of ['ksip','qiddiya']) {
      await page.evaluate(id=>{const p=VISION_DATA.projects.find(p=>p.id===id);VisionWorld.setQuality('high');VisionWorld.setSelectable(true);VisionWorld.debug.previewComplete(true);VisionWorld.debug.captureView(p.x,p.z,.35);},id);
      await page.waitForTimeout(500);
      report.picking[id]=await page.evaluate(id=>{const pixels=VisionWorld.debug.visiblePixels(id,12).filter(p=>p.x!=null);return {pixels:pixels.length, hits:pixels.map(p=>VisionWorld.debug.pickAt(p.x,p.y))};},id);
    }
    report.construction={};
    for(const [name,state,phase] of [
      ['foundations',{done:2,doneKeys:['design','site'],active:null,progress:0},1],
      ['structure',{done:3,doneKeys:['design','site','materials'],active:'build',progress:.5},2],
      ['exterior',{done:4,doneKeys:['design','site','materials','build'],active:null,progress:0},3],
      ['operational',{done:6,doneKeys:['design','site','materials','build','utility','test'],active:null,progress:1},4]
    ]) for(const id of ['ksip','qiddiya']) {
      await page.evaluate(({id,state})=>{VisionWorld.debug.previewComplete(false);VisionWorld.setProjectState(id,state);const p=VISION_DATA.projects.find(p=>p.id===id);VisionWorld.debug.captureView(p.x,p.z,.35);},{id,state});
      await page.waitForTimeout(450);
      const actual=await page.evaluate(id=>VisionWorld.debug.visualPhases()[id],id);
      report.construction[id+'-'+name]={expected:phase,actual};
      await page.locator('#world').screenshot({path:path.join(out,id+'-'+name+'.png')});
    }
    await page.evaluate(()=>document.querySelector('#langBtn').click());
    report.arabic=await page.evaluate(()=>({lang:document.documentElement.lang,dir:document.documentElement.dir}));
    report.pickingPassed=Object.entries(report.picking).every(([id,r])=>r.pixels===12 && r.hits.every(h=>h.select===id));
    report.constructionPassed=Object.values(report.construction).every(r=>r.expected===r.actual);
    report.errors=errors;
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({label,errors,storageUnchanged:report.previewStorageUnchanged,samples:Object.fromEntries(Object.entries(report.samples).map(([k,v])=>[k,{medianMs:v.medianMs,p95Ms:v.p95Ms,calls:v.calls,triangles:v.triangles}]))}));
    if(errors.length || !report.previewStorageUnchanged || !report.previewProjectStatesUnchanged || !report.pickingPassed || !report.constructionPassed || report.arabic.dir!=='rtl')process.exitCode=1;
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
