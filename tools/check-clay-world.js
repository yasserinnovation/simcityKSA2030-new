const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:8016/index.html?debug=1');
  await page.waitForFunction(()=>window.VisionWorld&&window.VNP);
  await page.waitForFunction(()=>{document.querySelector('#skipBtn')?.click();return !document.querySelector('#menu').classList.contains('hidden');});
  await page.evaluate(()=>{VisionWorld.debug.holdQuality();VisionWorld.setNight(0,true);VisionWorld.debug.regionView('kingdom');});
  await page.waitForTimeout(2500);
  await page.addStyleTag({content:'body>*:not(#world):not(script):not(style){visibility:hidden!important}'});
  const dir=path.resolve(__dirname,'../docs/visual-slice-v16/clay-v17');fs.mkdirSync(dir,{recursive:true});
  const first=await page.locator('#world').screenshot({path:path.join(dir,'kingdom-animated.png')});
  await page.waitForTimeout(1200);const second=await page.locator('#world').screenshot();
  const stats=await page.evaluate(()=>window.__visionCosmetics);
  const result={errors,cosmetics:stats,animatedRasterChanged:!first.equals(second)};
  fs.writeFileSync(path.join(dir,'cosmetics-check.json'),JSON.stringify(result,null,2));console.log(result);
  if(errors.length||!stats?.plots||!result.animatedRasterChanged)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
