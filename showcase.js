// Country presentation mode. It hides UI only: rendering, camera and simulation remain live.
// Escape/H or the bottom-edge controls restore the exact game interface. Nothing is saved into a game slot.
(() => {
  'use strict';
  if(window.VN_RENDERER!=='three')return;
  const B=document.body,params=new URLSearchParams(location.search);
  let active=false,timer=0,first=true,returnFocus=null;
  const bar=document.createElement('div');bar.id='showcaseControls';bar.setAttribute('role','toolbar');
  const ar=()=>document.documentElement.dir==='rtl';
  const shown=id=>{const e=document.getElementById(id);return e&&!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none';};
  const eligible=()=>window.VisionWorld&&['home','national'].includes(window.VNP?.mode)&&VisionWorld.debug.state().dist>6&&(shown('menu')||shown('hud'))&&!['intro','settingsPanel','chapter','upgradesPanel','shareModal','lensPanel','tutCard'].some(shown);
  function text(){bar.innerHTML=`<button type="button" data-showcase="exit">${ar()?'العودة إلى اللعب':'Return to game'} <kbd>Esc</kbd></button><button type="button" data-showcase="kingdom">${ar()?'المملكة':'Kingdom'}</button><button type="button" data-showcase="alula">${ar()?'استكشف العُلا':'Explore AlUla'}</button>`;bar.setAttribute('aria-label',ar()?'عرض سينمائي':'Cinematic view controls');}
  text();B.appendChild(bar);
  const entry=document.createElement('button');entry.type='button';entry.id='showcaseEntry';entry.title='Cinematic view · H';entry.setAttribute('aria-label','Cinematic view');entry.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h5l2-3h4l2 3h5v13H3z"/><circle cx="12" cy="13" r="4"/></svg>';B.appendChild(entry);
  function wake(){if(!active)return;B.classList.add('showcase-awake');clearTimeout(timer);timer=setTimeout(()=>{if(!bar.contains(document.activeElement))B.classList.remove('showcase-awake');},2600);}
  function exit(){if(!active)return;active=false;B.classList.remove('country-showcase','showcase-awake');clearTimeout(timer);bar.inert=true;entry.setAttribute('aria-pressed','false');if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});}
  function enter(){if(!eligible())return false;returnFocus=document.activeElement;active=true;text();B.classList.add('country-showcase');bar.inert=false;entry.setAttribute('aria-pressed','true');wake();return true;}
  entry.onclick=enter;
  bar.addEventListener('click',e=>{const action=e.target.closest('[data-showcase]')?.dataset.showcase;if(!action)return;
    if(action==='kingdom'){VisionWorld.focusRegion('kingdom');wake();return;}
    exit();if(action==='alula'){document.querySelector('[data-scenic="alula"]')?.click();}
  });
  addEventListener('keydown',e=>{if(e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    if(active&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();exit();}
    else if(e.key.toLowerCase()==='h'&&(active||eligible())){e.preventDefault();active?exit():enter();}
    else if(active&&e.key==='Tab')wake();
  },true);
  // Reveal controls only at the edge. Ordinary pan/zoom leaves the composition uninterrupted.
  addEventListener('pointermove',e=>{if(e.clientY>innerHeight-100)wake();},{passive:true});
  document.getElementById('world').addEventListener('pointerup',e=>{if(e.pointerType==='touch')wake();},{passive:true});
  bar.addEventListener('focusin',wake);bar.addEventListener('focusout',wake);bar.inert=true;
  const check=()=>{
    entry.hidden=!eligible()||active;entry.title=ar()?"عرض سينمائي · H":"Cinematic view · H";entry.setAttribute("aria-label",ar()?"عرض سينمائي":"Cinematic view");
    // A mode change or zoom into a regional plan must never leave its controls hidden.
    if(active&&!eligible())exit();
    if(first&&window.VNP?.mode==='home'&&!document.getElementById('menu')?.classList.contains('hidden')&&eligible()){
      first=false;if(params.get('showcase')!=='0'){VisionWorld.focusRegion('kingdom');enter();}
    }
  };
  setInterval(check,350);
  window.VisionShowcase={enter,exit,get active(){return active;},wake};
})();
