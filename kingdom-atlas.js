// V27 national art pass. Original geometry, authored for this project; no external assets.
// These are illustrative existing settlements, not player-built structures. Stage meshes stay in engine.js.
window.VisionKingdomAtlas = function({T, S, stamp, G, LY, D, geo, onLand, height, clearance}) {
  let seed=2702030;
  const R=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  const stats={districts:0,buildings:0,streets:0,terraces:0,ports:0,cliffs:0}, palms=[], trees=[], waterObstacles=[];
  const sand=[0xe8c593,0xf0d4a4,0xdab57f,0xefdfbb], stone=[0x9b8066,0xc6a583,0xe9d6b5];
  const yAt=(x,z)=>G+.009+height(x,z);
  const box=(x,y,z,w,h,d,c)=>stamp(S.cube,x,y+h/2,z,w,h,d,c,.88);
  const valid=(x,z,r=.035)=>onLand(x-r,z-r)&&onLand(x+r,z+r)&&onLand(x-r,z+r)&&onLand(x+r,z-r);
  const groundFree=(x,z,r=.035)=>valid(x,z,r)&&LY.roadDist(x,z)>r+.025&&clearance(x,z)>.88;
  const poly=(p,col)=>{const pos=[],c=[];for(let i=1;i<p.length-1;i++)for(const v of[p[0],p[i],p[i+1]]){pos.push(...v);c.push((col>>16&255)/255,(col>>8&255)/255,(col&255)/255);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.computeVertexNormals();stamp(g,0,0,0,1,1,1,0xffffff);g.dispose();};
  function street(x,z,len,width,axis=0) {
    // Sample the ground so a district street climbs its terrain without hanging in the air.
    for(let d=-len/2;d<len/2;d+=.035){const e=Math.min(len/2,d+.035),a=axis?[x+d,z]:[x,z+d],b=axis?[x+e,z]:[x,z+e];
      if(!valid(a[0],a[1],width)||!valid(b[0],b[1],width))continue;
      const nx=axis?0:width/2,nz=axis?width/2:0;
      const corners=[[a[0]-nx,a[1]+nz],[b[0]-nx,b[1]+nz],[b[0]+nx,b[1]-nz],[a[0]+nx,a[1]-nz]];
      poly(corners.map(([px,pz])=>[px,yAt(px,pz)+.0005,pz]),0x9c9e8e);
    }stats.streets++;
  }
  function home(x,z,w,h,style='najdi') {
    const d=w*(.76+R()*.28),base=yAt(x,z),col=(style==='south'?stone:sand)[Math.floor(R()*(style==='south'?3:4))];
    // Stepped plinth, recessed courtyard roof and raised parapets: readable silhouettes at map scale.
    box(x,base-.006,z,w*1.08,.008,d*1.08,0xc5a572);
    box(x,base,z,w,h,d,col);
    box(x,base+h,z,w*.86,.002,d*.82,style==='south'?0x978d78:0xb89569);
    for(const s of[-1,1]){box(x+s*w*.46,base+h,z,w*.08,.008,d,col);box(x,base+h,z+s*d*.46,w,.008,d*.08,col);}
    for(const sx of[-.26,.26])for(const level of[h*.26,h*.64]){
      box(x+sx*w,base+level,z+d*.502,w*.17,h*.14,.0015,0x37565a);
      if(style==='west')box(x+sx*w,base+level-.002,z+d*.53,w*.22,h*.24,.004,0x637f76); // timber balcony screens
    }
    box(x,base,z+d*.505,w*.19,h*.42,.002,0x685443);
    if(style==='south')for(let k=1;k<4;k++)box(x,base+h*k/4,z,w*1.04,.003,d*1.04,0xf3e7cc);
    else if(R()<.45)box(x-w*.23,base+h+.003,z-d*.2,w*.23,.008,w*.23,0xc6c9b4);
    stats.buildings++;
  }
  // Small district plans around the hero skylines leave their central landmarks unobstructed.
  const districts=[['Riyadh',.34,.77,'najdi'],['Dammam',.28,.52,'west'],['Madinah',.30,.56,'west'],
    ['Hail',.16,.39,'najdi'],['Buraydah',.15,.40,'najdi'],['Sakakah',.15,.36,'najdi'],['Tabuk',.17,.40,'najdi'],
    ['Hofuf',.14,.34,'najdi'],['Najran',.14,.35,'najdi'],['Abha',.17,.43,'south'],['Jazan',.13,.29,'west']];
  for(const[name,inner,outer,style]of districts){const q=LY.cityDisplay[name];if(!q)continue;const[x,z]=q,step=name==='Riyadh'?.10:.087;let count=0;
    for(let row=-Math.floor(outer/step);row<=outer/step;row++)for(let col=-Math.floor(outer/step);col<=outer/step;col++){
      const px=x+col*step,pz=z+row*step,r=Math.hypot(px-x,(pz-z)*1.12);
      if(r<inner||r>outer||!groundFree(px,pz,.025)||R()<.13)continue;
      if((Math.abs(col)%3===0||Math.abs(row)%3===0)&&R()<.65){trees.push([px,pz,.55+R()*.3]);continue;}
      home(px,pz,.048+R()*.018,.038+R()*.055,style);count++;
      if(count%4===0)palms.push([px+.032,pz+.02,.07+R()*.035,R()*6.28,0]);
    }
    for(const dx of[-outer*.7,outer*.7])street(x+dx,z,outer*1.35,.016,0);
    for(const dz of[-outer*.65,outer*.65])street(x,z+dz,outer*1.5,.016,1);
    if(count)stats.districts++;
  }
  // Coastal urban fabric follows the shoreline, rather than a radial scatter into the sea.
  for(const name of ['Jeddah','Jazan']){const q=LY.cityDisplay[name];if(!q)continue;const [x,z]=q;
    for(let k=0;k<18;k++){const pz=z-.38+k*.044,cx=VisionRegions.coastW(pz);
      for(let row=0;row<3;row++){const px=cx+.035+row*.055;if(!groundFree(px,pz,.025))continue;home(px,pz,.035,.035+R()*.045,'west');}
      const px=cx+.025;if(valid(px,pz,.012))palms.push([px,pz,.075,0,0]);
    }
  }
  // Terraced highland gardens: retaining walls, planted ledges and stone tower villages.
  for(const[lo,la]of[[42.1,18.7],[42.5,18.2],[42.55,19.0],[41.9,19.5],[42.8,17.7],[41.5,20.0]]){
    let[x,z]=geo(lo,la);const site=[[x,z],[x+.10,z+.07],[x+.18,z],[x-.08,z+.15],[x+.22,z+.17]].find(q=>groundFree(q[0],q[1],.08));if(!site)continue;[x,z]=site;
    for(let row=0;row<5;row++){const zz=z+row*.036,w=.19-row*.016,yy=yAt(x,zz);
      box(x,yy-.014,zz,w,.015,.027,0xb18e61);box(x,yy+.001,zz,w*.97,.003,.023,[0x718f3d,0x8ca84d,0x5b823b][row%3]);
      for(let k=0;k<4;k++)box(x-w*.38+k*w*.25,yy+.004,zz,.003,.001,.022,0xabc269);stats.terraces++;
    }
    if(groundFree(x+.13,z+.08,.035))home(x+.13,z+.08,.045,.10,'south');
  }
  // Ports use real coastal anchors and checked land/water footprints. Quays are the only reclaimed surface.
  for(const[name,side]of[['Jeddah',-1],['Dammam',1],['Jazan',-1]]){
    const q=LY.cityDisplay[name];if(!q)continue;const z=q[1]+(name==='Dammam'?.22:.28),coast=side===1?VisionRegions.coastE(z):VisionRegions.coastW(z);
    if(!Number.isFinite(coast))continue;
    const x=coast-side*.035,y=G+.009;
    box(x,y-.026,z,.13,.028,.24,0xc1bda3);box(x,y+.002,z,.12,.002,.23,0xe3d5af);
    for(let k=0;k<3;k++){const zz=z-.08+k*.08;
      box(coast+side*.06,y-.02,zz,.15,.02,.024,0xabac99);
      for(let j=0;j<4;j++)box(x-side*.015,y+.005,zz-.025+j*.014,.026,.012,.011,[0xa94e40,0x346f81,0xe1bb58,0xe9ded0][j]);
      const cx=coast+side*.01;for(const sd of[-1,1])box(cx,y,zz+sd*.012,.006,.09,.006,0xe8b653);
      box(cx+side*.028,y+.085,zz,.105,.006,.006,0xf5d27b);box(cx+side*.065,y+.035,zz,.002,.051,.002,0x6a777a);
    }
    for(let k=0;k<2;k++){const wx=x-side*.07,wz=z-.055+k*.11;if(valid(wx,wz,.03)){box(wx,y,wz,.06,.03,.074,0xd7c7a7);box(wx,y+.03,wz,.067,.005,.078,0x8dabae);}}
    waterObstacles.push({x0:coast-.16,x1:coast+.16,z0:z-.14,z1:z+.14});
    stats.ports++;
  }
  // Broad, asymmetric ridge meshes give the western belt connected silhouettes, not stacks of cylinders.
  // Local art exaggeration stays on Saudi land and clear of simulation footprints.
  const ridges=[[36.0,28.45,.28,.16,.28],[36.8,27.55,.30,.18,.25],[37.5,26.65,.29,.15,.24],
    [38.25,25.55,.25,.16,.23],[39.0,24.9,.29,.17,.27],[39.6,23.8,.28,.19,.29],
    [40.15,22.8,.26,.19,.27],[40.65,21.65,.25,.19,.28],[41.35,20.6,.30,.20,.31],
    [42.0,19.7,.31,.22,.30],[42.55,18.85,.30,.22,.32],[43.0,18.05,.26,.19,.24]];
  for(const[lo,la,w,d,h]of ridges){let[x,z]=geo(lo,la);const site=[[x,z],[x+.14,z],[x+.28,z+.09],[x+.22,z-.12],[x-.1,z+.12]].find(q=>groundFree(q[0],q[1],.055));if(!site)continue;[x,z]=site;if(Math.hypot(x-LY.cityDisplay.AlUla[0],z-LY.cityDisplay.AlUla[1])<.6)continue;
    const n=24,levels=8,rings=[],base=yAt(x,z)-.02;
    const crown=Array.from({length:n},(_,j)=>.68+.15*Math.sin(j*.71+lo)+.13*Math.sin(j*1.72+la));
    for(let k=0;k<=levels;k++){const f=k/levels,ring=[];for(let j=0;j<n;j++){const a=j/n*Math.PI*2,cleft=1-.14*Math.pow(.5+.5*Math.sin(j*1.9),3),rad=(1-f*.60+Math.sin(k*2.5)*.035)*cleft,px=x+Math.cos(a)*w*rad+f*.045,pz=z+Math.sin(a)*d*rad;
      ring.push([px,k===0?yAt(px,pz)-.008:base+h*f*crown[j]*clearance(px,pz),pz]);}rings.push(ring);}
    for(let k=0;k<levels;k++)for(let j=0;j<n;j++){const i=(j+1)%n,a=rings[k][j],b=rings[k][i],c=rings[k+1][j],e=rings[k+1][i];
      if(!valid(a[0],a[2],.01)||!valid(b[0],b[2],.01))continue;
      const bands=[0xc59165,0xc99466,0xd2a174,0xc08d60];poly([a,c,b],bands[k%4]);poly([b,c,e],bands[k%4]);
    }
    poly(rings[levels].slice().reverse(),0xe4ba89);stats.cliffs++;
  }
  return {stats,palms,trees,waterObstacles};
};
