// Locally authored, illustrative Hejaz landmark details. Coordinates follow the game plan.
window.VisionWestClay=function(K){
 const {G,box,cylinder,cone,dome,blob,palm,quad,LY,onLand,coast,places}=K;
 const ivory=[.98,.91,.79],stone=[.87,.73,.57],teal=[.24,.62,.61],wood=[.39,.26,.18],gold=[.91,.70,.30];
 const jd=places.jeddah,md=places.madinah,mk=places.makkah,tf=places.taif;
 // Abraj Al-Bait: tiered podium, shoulder towers, four clock faces, spire and crescent.
 // South of the Haram in this north-up illustration, within Makkah's existing place footprint.
 const x=mk.x-.027,z=mk.z+.038;
 box(x,G,z,.035,.009,.016,stone);
 for(const dx of [-.013,.013]){box(x+dx,G+.009,z,.009,.037,.012,ivory);box(x+dx,G+.046,z,.007,.008,.009,teal);}
 box(x,G+.009,z,.014,.064,.013,stone);
 for(const dz of [-.0071,.0071])for(let i=0;i<6;i++)box(x,G+.018+i*.008,z+dz,.008,.003,.0007,teal);
 box(x,G+.073,z,.018,.021,.017,ivory);box(x,G+.094,z,.015,.006,.014,gold);
 for(const dz of [-.0088,.0088]){
  box(x,G+.076,z+dz,.014,.014,.0006,teal);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;box(x+Math.sin(a)*.0053,G+.083+Math.cos(a)*.0053,z+dz,.001,.001,.0008,gold);}
  box(x,G+.083,z+dz*1.04,.0009,.0048,.0006,ivory);box(x+.0018,G+.0826,z+dz*1.04,.0045,.0009,.0006,ivory);
 }
 for(const dx of [-.0093,.0093]){box(x+dx,G+.076,z,.0006,.014,.013,teal);box(x+dx*1.04,G+.082,z,.0006,.005,.0009,ivory);box(x+dx*1.04,G+.083,z+.002,.0006,.0009,.004,ivory);}
 cone(x,G+.10,z,.007,.012,gold,8);cylinder(x,G+.112,z,.0007,.021,gold,6);
 // Crescent is an open arc, rather than a solid ball.
 for(let i=0;i<11;i++){const a=.65+i/10*(Math.PI*2-1.3);blob(x+Math.cos(a)*.003,G+.137+Math.sin(a)*.003,z,.00065,.00065,.00065,gold);}
 // Madinah's courtyard parasols remain outside the mosque roof and its green dome.
 for(const dx of [-.039,.039])for(const dz of [-.028,-.014,0,.014,.028]){
  const xx=md.x+dx,zz=md.z+dz;cylinder(xx,G+.004,zz,.0006,.018,stone,6);
  const y=G+.022;
  for(let i=0;i<8;i++){const a=i*Math.PI/4,b=(i+1)*Math.PI/4;quad([xx,y+.003,zz],[xx+Math.cos(a)*.007,y,zz+Math.sin(a)*.007],[xx+Math.cos(b)*.007,y,zz+Math.sin(b)*.007],[xx,y+.003,zz],ivory);}
 }
 // Al-Balad-inspired coral-plaster houses: projecting timber roshan, screens and roof parapets.
 const bl=LY.MISSION_SITES['west:balad'];let heritage=0;
 for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++){
  const xx=bl[0]+i*.015,zz=bl[1]+j*.014;
  if(Math.hypot(i,j)>3.5||!onLand(xx,zz)||!LY.decorAllowed(xx,zz,.009,.012))continue;
  if(Object.values(window.VisionScenicSites||{}).some(s=>s.x!=null&&Math.hypot(xx-s.x,zz-s.z)<s.r+.008))continue;
  const h=.018+((i+j+12)%3)*.008,c=[ivory,[.94,.81,.66],[.91,.85,.75]][(i-j+12)%3];
  box(xx,G+.002,zz,.010,h,.010,c);
  for(const d of [-.005,.005])box(xx+d,G+.002+h,zz,.001,.003,.011,c);
  for(const d of [-.005,.005])box(xx,G+.002+h,zz+d,.010,.003,.001,c);
  for(let row=0;row<2;row++){
   const yy=G+.007+row*.011;if(yy>G+h)continue;
   box(xx,yy,zz+.006,.006,.007,.003,wood);
   for(let k=-2;k<=2;k++)box(xx+k*.001,yy+.0005,zz+.0076,.0003,.006,.0003,[.65,.46,.30]);
   box(xx,yy+.0035,zz+.0078,.006,.00035,.0003,stone);
  }
  box(xx,G+.002,zz+.0052,.002,.005,.0005,teal);heritage++;
 }
 // A modest palm-lined, coral-and-turquoise corniche, outside active project parcels.
 let promenade=0;
 for(let i=0;i<20;i++){
  const zz=jd.z-.14+i*.014,xx=coast(zz)+.016;
  if(!onLand(xx,zz)||!LY.decorAllowed(xx,zz,.004,.008))continue;
  box(xx,G+.002,zz,.011,.003,.011,ivory);
  if(i%2===0)palm(xx+.008,zz,.22);
  box(xx+.001,G+.006,zz,.005,.002,.0018,teal);
  cylinder(xx-.004,G+.004,zz,.00035,.012,stone,5);blob(xx-.004,G+.016,zz,.001,.001,.001,gold);promenade++;
 }
 // Taif's rose terraces: rose-coloured shrubs and low stone garden edging.
 let roses=0;
 for(let i=0;i<24;i++){
  const a=i*Math.PI*2/24,xx=tf.x+Math.cos(a)*.048,zz=tf.z+Math.sin(a)*.048;
  if(!onLand(xx,zz)||LY.roadDist(xx,zz)<.008)continue;
  box(xx,G+.008,zz,.006,.003,.005,stone);blob(xx,G+.014,zz,.004,.003,.003,[.61,.75,.43]);
  for(let j=0;j<3;j++)blob(xx+(j-1)*.002,G+.017,zz,.0013,.001,.0013,[.97,.48+j*.06,.64]);roses++;
 }
 window.__visionWestClay={heritage,promenade,roses,landmarks:['Abraj Al-Bait','Prophet’s Mosque courtyard','Al-Balad','Jeddah Corniche','Taif rose gardens']};
};
