// Original synthesized ambience. No downloads, tracking, or third-party recordings.
// One AudioContext and one master bus: mute/volume also silence sounds already playing.
(() => {
  'use strict';
  window.VisionSoundscape = profile => {
    let ctx, master, ambient;
    const volume=()=>{const n=Number(profile().volume ?? .55);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):.55;};
    function sync(){
      if(!ctx)return;
      const p=profile(), t=ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(p.sound&&!document.hidden?volume():0,t,.025);
      ambient.gain.setTargetAtTime(p.ambience===false?0:.035,t,.4);
    }
    function ensure(){
      if(!ctx){
        ctx=new (window.AudioContext||window.webkitAudioContext)();
        master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
        ambient=ctx.createGain();ambient.gain.value=0;ambient.connect(master);
        // Soft wind with a seamless crossfade at the loop seam.
        const length=ctx.sampleRate*6, buffer=ctx.createBuffer(1,length,ctx.sampleRate), data=buffer.getChannelData(0);
        let seed=2030, brown=0;for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;brown=(brown+(seed/4294967296*2-1)*.025)/1.025;data[i]=brown*4;}
        const seam=2048;for(let i=0;i<seam;i++){const f=i/seam;data[length-seam+i]=data[length-seam+i]*(1-f)+data[i]*f;}
        const wind=ctx.createBufferSource();wind.buffer=buffer;wind.loop=true;wind.loopStart=seam/ctx.sampleRate;
        const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;
        const pan=ctx.createStereoPanner();pan.pan.value=0;
        const drift=ctx.createOscillator(), amount=ctx.createGain();drift.frequency.value=.045;amount.gain.value=.38;drift.connect(amount);amount.connect(pan.pan);drift.start();
        wind.connect(filter);filter.connect(pan);pan.connect(ambient);wind.start();
      }
      if(ctx.state==='suspended')ctx.resume().catch(()=>{});
      sync();return ctx;
    }
    const gesture=()=>{if(profile().sound){try{ensure();}catch(e){/* Audio is optional. */}}};
    addEventListener('pointerdown',gesture,{passive:true});
    addEventListener('keydown',e=>{if(!e.repeat)gesture();});
    document.addEventListener('visibilitychange',sync);
    return {ensure,sync,get output(){return master;},info:()=>({state:ctx?.state||'idle',volume:volume(),muted:!profile().sound,ambience:profile().ambience!==false,master:master?.gain.value??0})};
  };
})();
