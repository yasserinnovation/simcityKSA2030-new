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
  const dir=path.resolve(__dirname,'../docs/south-landmarks/'+(process.argv[2]||'after'));fs.mkdirSync(dir,{recursive:true});
  const views=[['south',null,null,null],['abha',-1.22,2.985,.35],['rijal-almaa',-1.53,2.93,.32],['najran',-.52,3.36,.38],['jazan',null,3.60,.38],['al-jawhara',-2.70,1.025,.34],['al-jawhara-close',-2.690,1.043,.20],['jeddah-heritage',-2.70,1.375,.26]];
  for(const [name,x,z,dist]of views){
   await page.evaluate(({name,x,z,dist})=>{if(name==='south')VisionWorld.debug.regionView('south');else VisionWorld.debug.captureView(x??VisionRegions.PLANS.south.places.jazanc.at[0],z,dist);},{name,x,z,dist});
   await page.waitForTimeout(1200);await page.locator('#world').screenshot({path:path.join(dir,name+'.png')});
  }
  await page.evaluate(()=>VisionWorld.debug.previewComplete(true));await page.waitForTimeout(200);
  const final=await page.evaluate(()=>({storage:JSON.stringify(localStorage),states:JSON.stringify(VisionWorld.debug.projectStates())}));
  const picking={};for(const id of ['place:abha','place:jazanc','place:najran','soudah','jazan','jeddahcentral','lucid']){
   await page.evaluate(id=>{const p=VisionLayout.places[id]||VISION_DATA.projects.find(p=>p.id===id);VisionWorld.setSelectable(true);VisionWorld.debug.captureView(p.x,p.z,.35);},id);await page.waitForTimeout(150);
   picking[id]=await page.evaluate(id=>{const ps=VisionWorld.debug.visiblePixels(id,6).filter(p=>p.x!=null);return {pixels:ps.length,hits:ps.map(p=>VisionWorld.debug.pickAt(p.x,p.y))};},id);
  }
  const placement=await page.evaluate(()=>{const s=window.VisionScenicSites?.jawhara;if(!s)return null;return {stadiumNorthOfAirport:s.z<VisionLayout.MISSION_SITES['west:kaia'][1],stadiumInland:s.x>VisionRegions.coastW(s.z),stadiumProjectClear:Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return !VisionLayout.footprintAt(s.x+Math.cos(a)*.027,s.z+Math.sin(a)*.027);}).every(Boolean),stadiumRoadClear:VisionLayout.roadDist(s.x,s.z)>.027,alAanWestOfNajran:VisionScenicSites.aan.x<VisionRegions.PLANS.south.places.najran.at[0],rijalWestOfAbha:VisionScenicSites.rijal.x<VisionRegions.PLANS.south.places.abha.at[0]};});
  const result={errors,picking,pickingPassed:Object.entries(picking).every(([id,r])=>r.pixels>0&&r.hits.every(h=>h?.select===id)),placement,storageUnchanged:initial.storage===final.storage,projectStatesUnchanged:initial.states===final.states,cosmetics:await page.evaluate(()=>window.__visionCosmetics),sites:await page.evaluate(()=>window.VisionScenicSites||null)};
  fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  if(errors.length||!result.storageUnchanged||!result.projectStatesUnchanged||!result.pickingPassed||(placement&&!Object.values(placement).every(Boolean)))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
