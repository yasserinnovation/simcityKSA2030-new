const {chromium}=require('playwright-core'),fs=require('fs'),path=require('path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  await page.goto('http://127.0.0.1:8016/index.html?debug=1');await page.waitForFunction(()=>window.VisionWorld&&window.VNP);
  await page.waitForFunction(()=>{document.querySelector('#skipBtn')?.click();return !document.querySelector('#menu').classList.contains('hidden');});
  await page.evaluate(()=>{VisionWorld.debug.holdQuality();VisionWorld.debug.captureMode(true);VisionWorld.setQuality('high');});
  const initial=await page.evaluate(()=>({storage:JSON.stringify(localStorage),states:JSON.stringify(VisionWorld.debug.projectStates())}));
  await page.addStyleTag({content:'body>*:not(#world):not(script):not(style),#menu *{visibility:hidden!important}'});
  const dir=path.resolve(__dirname,'../docs/west-clay/'+(process.argv[2]||'after'));fs.mkdirSync(dir,{recursive:true});
  const views=[['west',null,3.6],['jeddah','jeddah',.50],['al-balad','balad',.24],['makkah','makkah',.34],['madinah','madinah',.35],['taif','taif',.38]];
  for(const [name,id,dist]of views){
   await page.evaluate(({id,dist})=>{if(!id)VisionWorld.debug.regionView('west');else {const p=id==='balad'?VisionLayout.MISSION_SITES['west:balad']:VisionRegions.PLANS.west.places[id].at;VisionWorld.debug.captureView(p[0],p[1],dist);}}, {id,dist});
   await page.waitForTimeout(1500);await page.locator('#world').screenshot({path:path.join(dir,name+'.png')});
  }
  await page.evaluate(()=>VisionWorld.debug.previewComplete(true));await page.waitForTimeout(200);
  const final=await page.evaluate(()=>({storage:JSON.stringify(localStorage),states:JSON.stringify(VisionWorld.debug.projectStates())}));
  const picking={};
  for(const id of ['place:jeddah','place:makkah','place:madinah','place:taif','jeddahcentral','masar','hajj','madinah']){
   await page.evaluate(id=>{const p=VisionLayout.places[id]||VISION_DATA.projects.find(p=>p.id===id);VisionWorld.setSelectable(true);VisionWorld.debug.captureView(p.x,p.z,.35);},id);await page.waitForTimeout(200);
   picking[id]=await page.evaluate(id=>{const pixels=VisionWorld.debug.visiblePixels(id,6).filter(p=>p.x!=null);return {pixels:pixels.length,hits:pixels.map(p=>VisionWorld.debug.pickAt(p.x,p.y))};},id);
  }
  const pickingPassed=Object.entries(picking).every(([id,r])=>r.pixels>0&&r.hits.every(h=>h.select===id||h.place===id));
  const result={errors,picking,pickingPassed,storageUnchanged:initial.storage===final.storage,projectStatesUnchanged:initial.states===final.states,cosmetics:await page.evaluate(()=>window.__visionCosmetics),westLandmarks:await page.evaluate(()=>window.__visionWestClay)};
  fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(result,null,2));console.log(result);
  if(errors.length||!result.storageUnchanged||!result.projectStatesUnchanged||!pickingPassed)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
