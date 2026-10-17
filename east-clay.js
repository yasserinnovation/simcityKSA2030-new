// Original clay-style Gulf industry and civic kits; no imported assets or simulation edits.
window.VisionEastClay=function(K){
 const {G,box:B,cylinder:C,cone,dome,blob,quad:Q,palm,LY,jubail:j,dhahran:dh,khobar:kh,hofuf:hf,coast}=K;
 const silver=[.78,.84,.83],white=[.97,.95,.87],teal=[.25,.60,.63],gold=[.96,.66,.25],steel=[.39,.49,.52];
 let columns=0,tanks=0,pipes=0;
 function pipe(x1,z1,x2,z2,y,r=.0009,col=gold){
  const dx=x2-x1,dz=z2-z1,L=Math.hypot(dx,dz);B((x1+x2)/2,y,(z1+z2)/2,L,r*2,r*2,col,Math.atan2(dz,dx));
  // addBox's rotation maps local x directly onto the x/z segment.
  for(let t=.15;t<1;t+=.30)C(x1+dx*t,G+.004,z1+dz*t,.0005,y-G-.004,steel,5);
  blob(x1,y+r,z1,r*1.4,r*1.4,r*1.4,col);blob(x2,y+r,z2,r*1.4,r*1.4,r*1.4,col);pipes++;
 }
 function ring(x,z,r,y,w,col){for(let i=0;i<16;i++){const a=i*Math.PI/8,b=(i+1)*Math.PI/8;Q([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],[x+Math.cos(b)*(r-w),y,z+Math.sin(b)*(r-w)],[x+Math.cos(a)*(r-w),y,z+Math.sin(a)*(r-w)],col);}}
 // Tank farm north-west of the processing area: berms, roof caps, walkways and risers.
 for(let row=0;row<2;row++)for(let col=0;col<4;col++){
  const x=j.x-.040+col*.015,z=j.z-.046+row*.017;
  B(x,G+.003,z,.014,.002,.014,[.86,.82,.70]);C(x,G+.005,z,.0058,.012,white,16);dome(x,G+.017,z,.0057,silver);C(x,G+.020,z,.0009,.002,steel,6);
  ring(x,z,.0059,G+.013,.0004,teal);C(x+.005,G+.005,z,.00045,.013,steel,5);tanks++;
 }
 // Six distillation columns with multiple service decks and ladders.
 for(let i=0;i<6;i++){
  const x=j.x-.039+i%3*.015,z=j.z+.009+Math.floor(i/3)*.023,h=.033+i%3*.012;
  C(x,G+.004,z,.0028,h,silver,12,.0024);dome(x,G+.004+h,z,.0024,white);
  for(let level=0;level<3;level++){
   const y=G+.012+level*(h-.010)/3;ring(x,z,.005,y,.002,teal);
   for(let k=0;k<8;k++){const a=k*Math.PI/4;C(x+Math.cos(a)*.0047,y,z+Math.sin(a)*.0047,.00025,.003,steel,4);}
   ring(x,z,.0048,y+.003,.0003,silver);
  }
  B(x+.0033,G+.005,z,.0005,h,.0006,steel);for(let r=0;r<10;r++)B(x+.0033,G+.007+r*h/11,z,.001,.00035,.002,white);
  columns++;
 }
 // Three cooling towers with flared bases, narrow waists and open rims.
 for(let k=0;k<3;k++){
  const x=j.x+.014+k*.014,z=j.z+.042;
  const radii=[.0068,.0053,.0041,.0045,.0058];
  for(let level=0;level<4;level++)for(let i=0;i<16;i++){
   const a=i*Math.PI/8,b=(i+1)*Math.PI/8,y=G+.004+level*.007,r=radii[level],r2=radii[level+1];
   Q([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],[x+Math.cos(b)*r2,y+.007,z+Math.sin(b)*r2],[x+Math.cos(a)*r2,y+.007,z+Math.sin(a)*r2],silver);
  }
  ring(x,z,.0059,G+.032,.001,white);
 }
 // Shared racks carry teal, silver and amber service lines through the facility.
 for(let i=0;i<4;i++){
  pipe(j.x-.047,j.z-.013+i*.002,j.x+.047,j.z-.013+i*.002,G+.014+i*.001,.00065,i%2?teal:silver);
  pipe(j.x-.047+i*.002,j.z-.042,j.x-.047+i*.002,j.z+.044,G+.011,.00065,gold);
 }
 for(let i=0;i<3;i++)pipe(j.x-.035+i*.015,j.z+.005,j.x-.035+i*.015,j.z+.034,G+.008,.00075,silver);
 // Horizontal vessels, pump skids and a restrained striped stack.
 for(let i=0;i<4;i++){const x=j.x+.004+i*.009,z=j.z+.017;B(x,G+.004,z,.007,.004,.009,teal);blob(x,G+.010,z,.0027,.0027,.007,silver);}
 C(j.x+.052,G+.004,j.z+.005,.0023,.057,white,10);for(let i=0;i<3;i++)C(j.x+.052,G+.020+i*.012,j.z+.005,.00235,.003,gold,10);
 for(const dx of [.024,.041,.055]){
  B(j.x+dx,G+.003,j.z-.045,.012,.002,.008,steel);
  for(const dz of [-.002,.002])B(j.x+dx,G+.005,j.z-.045+dz,.002,.014,.0012,silver);
 }
 // Access markings use the existing site surface; no network or gameplay road is added.
 for(let i=0;i<10;i++)B(j.x-.045+i*.010,G+.0045,j.z+.060,.004,.0003,.0012,white);
 // Ithra's five mutually supporting stone-like forms, set in the Dhahran campus.
 const ix=dh.x-.008,iz=dh.z;
 B(ix,G+.005,iz,.054,.002,.043,[.90,.85,.70]);
 for(const [dx,dz,rx,ry,rz,y] of [[-.012,0,.011,.011,.010,.013],[.011,.008,.012,.009,.010,.013],[0,-.010,.013,.007,.009,.014],[.006,-.002,.008,.028,.007,.029],[-.005,.007,.009,.010,.008,.025]])blob(ix+dx,G+y,iz+dz,rx,ry,rz,silver);
 for(let i=0;i<11;i++)B(ix+.013,G+.008+i*.004,iz-.002,.0005,.0005,.010,white);
 // Khobar Water Tower on a compact coastal platform north of the marina.
 const tx=coast(kh.z-.030)-.006,tz=kh.z-.030;
 C(tx,G-.012,tz,.010,.015,white,18);C(tx,G+.003,tz,.003,.033,silver,12);
 C(tx,G+.036,tz,.010,.007,teal,18,.007);C(tx,G+.043,tz,.007,.004,white,18);cone(tx,G+.047,tz,.007,.004,silver,18);
 ring(tx,tz,.010,G+.041,.001,white);
 // Ibrahim Palace-inspired corner of Hofuf: enclosure, domed prayer hall and slender minaret.
 const px=hf.x+.008,pz=hf.z-.014;
 for(const dx of [-.012,.012])B(px+dx,G+.004,pz,.002,.013,.025,[.82,.70,.51]);
 for(const dz of [-.012,.012])B(px,G+.004,pz+dz,.025,.013,.002,[.82,.70,.51]);
 B(px-.004,G+.004,pz-.004,.012,.009,.013,white);dome(px-.004,G+.013,pz-.004,.006,white);
 C(px+.006,G+.004,pz-.007,.0017,.025,white,8);cone(px+.006,G+.029,pz-.007,.0018,.004,teal,8);
 // Gulf corniche furniture and planted pockets, always land-side and off project roads.
 let waterfront=0;
 for(const place of [LY.PLANS.east.places.dammam,LY.PLANS.east.places.khobar])for(let i=0;i<18;i++){
  const z=place.at[1]-.10+i*.012,x=coast(z)-.014;
  if(!LY.decorAllowed(x,z,.005,.009))continue;
  B(x,G+.003,z,.011,.002,.010,white);B(x-.003,G+.006,z,.005,.002,.002,teal);if(i%2===0)palm(x-.007,z,.22);waterfront++;
 }
 Object.assign(window.VisionScenicSites,{
  ithra:{name:'Ithra · Dhahran',ar:'إثراء · الظهران',x:ix,z:iz,r:.028,y:.065,region:'east'},
  khobarTower:{name:'Khobar Water Tower',ar:'برج مياه الخبر',x:tx,z:tz,r:.012,y:.060,region:'east'},
  ibrahim:{name:'Ibrahim Palace · Hofuf',ar:'قصر إبراهيم · الهفوف',x:px,z:pz,r:.018,y:.042,region:'east'}
 });
 window.__visionEastClay={columns,tanks,pipes,coolingTowers:3,pumpjacks:3,waterfront,landmarks:['Ithra','Khobar Water Tower','Ibrahim Palace']};
};
