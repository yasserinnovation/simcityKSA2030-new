// V28 country relief. Original analytic terrain, no image backdrop or downloaded assets.
// Heights are presentation-only. Simulation coordinates and the national polygon never change.
window.VisionKingdomRelief = function(D) {
  const clamp=v=>Math.max(0,Math.min(1,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
  const hash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
  function noise(x,z){const i=Math.floor(x),j=Math.floor(z),u=smooth(0,1,x-i),v=smooth(0,1,z-j);
    return (hash(i,j)*(1-u)+hash(i+1,j)*u)*(1-v)+(hash(i,j+1)*(1-u)+hash(i+1,j+1)*u)*v;}
  function ridge(x,z){let sum=0,amp=.55;for(let k=0;k<4;k++){const n=1-Math.abs(noise(x,z)*2-1);sum+=n*n*amp;x=x*2.07+3.2;z=z*2.07-7.1;amp*=.48;}return sum;}
  const lon=x=>D.projection.lon0+x/(D.projection.scale*Math.cos(D.projection.lat0*Math.PI/180));
  const lat=z=>D.projection.lat0-z/D.projection.scale;
  // Continuous asymmetric sand waves: long gentle windward slopes and short leeward slip faces.
  // Domain warping bends/join ridges across the entire field instead of stamping isolated oval dunes.
  function dune(x,z){
    const lo=lon(x),la=lat(z);
    const empty=smooth(44.6,47.4,lo)*(1-smooth(54.5,56,lo))*smooth(17.2,18.5,la)*(1-smooth(22.6,24.1,la));
    const nafud=smooth(38.4,40.1,lo)*(1-smooth(43.3,44.6,lo))*smooth(26.6,27.5,la)*(1-smooth(29.8,30.8,la));
    const dahna=smooth(43.9,45,lo)*(1-smooth(48.5,49.7,lo))*smooth(23.8,25,la)*(1-smooth(28.5,30,la))*.45;
    const mask=Math.max(empty,nafud,dahna);if(mask<.001)return 0;
    const u=x*.77-z*.64,v=x*.64+z*.77;
    const warp=.24*Math.sin(v*2.3)+.09*Math.sin(v*6.1)+.23*(noise(x*1.3+8,z*1.3)-.5);
    const wave=(u+warp)/(.28+.05*noise(v*.8,2.7))+.23*Math.sin(v*6.1)+.32*noise(v*4,u*2.5);
    const f=wave-Math.floor(wave),crest=.73;
    const profile=f<crest?Math.pow(Math.sin(f/crest*Math.PI*.5),1.8):Math.pow(Math.cos((f-crest)/(1-crest)*Math.PI*.5),1.35);
    const amplitude=(.045+.110*noise(v*3.8+3,u*1.6))*(.34+.66*smooth(.20,.65,noise(v*2.8,u*1.8+4)));
    return mask*(.006+profile*amplitude);
  }
  function neighbour(x,z,coast){
    const lo=lon(x),la=lat(z);
    // Elevated coastal shields, Zagros, Sinai, Yemen and Hajar; the Iraqi plain stays quieter.
    let belt=.30;
    if(lo<35.5)belt=1.10;
    else if(lo>50&&la>25.8)belt=1.35;
    else if(la<17.8&&lo<48)belt=1.05;
    else if(lo>55&&la>20)belt=1.05;
    else if(la>30.5&&lo<39.5)belt=.68;
    const warpedX=x+noise(x*.7,z*.7)*.34;
    const relief=Math.pow(Math.max(0,ridge(warpedX*2.7,z*2.0)-.20),1.35);
    return (.010+relief*.43*belt)*coast;
  }
  return {dune,neighbour,noise,ridge,lon,lat};
};
