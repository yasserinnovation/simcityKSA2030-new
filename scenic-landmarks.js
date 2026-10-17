// Original procedural landmark kits. Regional-plan locations preserve compass relationships,
// with exaggerated miniature scale; they are not surveyed building footprints.
window.VisionScenicSites={
 jawhara:{name:'Al-Jawhara · King Abdullah Sports City',ar:'الجوهرة · مدينة الملك عبدالله الرياضية',x:-2.690,z:1.043,r:.024,y:.033,region:'west',location:'North of the Jeddah airport site, inland',reference:'https://www.arup.com/en-us/projects/king-abdullah-sports-city/'},
 nassif:{name:'Nassif House',ar:'بيت نصيف',x:-2.700,z:1.366,r:.011,y:.046,region:'west',location:'Al-Balad, historic Jeddah',reference:'https://saudipedia.com/en/nassif-house'},
 matbouli:{name:'Beit Al-Matbouli',ar:'بيت المتبولي',x:-2.683,z:1.395,r:.009,y:.040,region:'west',location:'Al-Yaman quarter, Al-Balad',reference:'https://www.visitalbalad.com/en/explore/1615'},
 shada:{name:'Shada Palace',ar:'قصر شدا',x:-1.22,z:2.985,r:.016,y:.060,region:'south'},
 rijal:{name:'Rijal Almaa',ar:'رجال ألمع',x:-1.53,z:2.93,r:.031,y:.068,region:'south'},
 aan:{name:'Al-Aan Palace',ar:'قصر العان',x:-.563,z:3.335,r:.017,y:.055,region:'south'},
 dosariyah:{name:'Dosariyah Castle',ar:'قلعة الدوسرية',x:null,z:3.580,r:.020,y:.048,region:'south'}
};
window.VisionScenicBuild=function(K,region){
 const {G,box:B,cylinder:C,cone,blob,quad:Q,tri,palm,LY}=K,S=window.VisionScenicSites;
 const cream=[.96,.88,.72],sand=[.80,.61,.42],wood=[.38,.25,.17],teal=[.21,.56,.57],white=[.98,.96,.88];
 function line(a,b,w,c){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],l=Math.hypot(dx,dz)||1;const nx=-dz/l*w,nz=dx/l*w;Q([a[0]+nx,a[1],a[2]+nz],[a[0]-nx,a[1],a[2]-nz],[b[0]-nx,b[1],b[2]-nz],[b[0]+nx,b[1],b[2]+nz],c);}
 function windows(x,z,w,h,depth,y,col=wood){for(let row=0;row<Math.floor(h/.008);row++)for(let k=-1;k<=1;k++)B(x+k*w*.27,y+.003+row*.008,z+depth/2+.0003,.002,.003,.0006,col);}
 function heritage(site,nassif){
  const {x,z}=site,w=nassif?.017:.013,d=nassif?.016:.013,h=nassif?.035:.029;
  B(x,G+.002,z,w+.006,.002,d+.007,cream);B(x,G+.004,z,w,h,d,nassif?sand:cream);
  for(const dz of [-d/2,d/2])B(x,G+.004+h,z+dz,w,.003,.001,cream);
  for(const dx of [-w/2,w/2])B(x+dx,G+.004+h,z,.001,.003,d,cream);
  for(let row=0;row<3;row++)for(const dx of [-w*.28,0,w*.28]){
   const y=G+.008+row*.009;B(x+dx,y,z+d/2+.001,.0035,.006,.0025,wood);
   for(let j=-1;j<=1;j++)B(x+dx+j*.0008,y+.0004,z+d/2+.0024,.00025,.005,.0003,sand);
  }
  B(x,G+.004,z+d/2+.0005,.003,.005,.001,wood);
  if(nassif){B(x,G+.004+h,z,.009,.007,.009,cream);windows(x,z,.008,.007,.009,G+.004+h);C(x-.014,G+.002,z+.006,.0007,.014,wood,6);blob(x-.014,G+.019,z+.006,.008,.009,.008,[.42,.65,.34]);}
 }
 if(region==='west'){
  const {x,z}=S.jawhara,N=40;
  // Roof opening, tiered bowl and diamond-like outer envelope from the supplied stadium reference.
  C(x,G+.001,z,.0235,.002,[.86,.83,.72],40);
  B(x,G+.003,z,.022,.0008,.013,[.25,.60,.33]);
  for(let k=0;k<7;k++)B(x-.009+k*.003,G+.0039,z,.003,.0002,.012,k%2?[.30,.66,.38]:[.24,.56,.30]);
  for(const dz of [-.006,.006])B(x,G+.0042,z+dz,.022,.0002,.00025,white);
  for(const dx of [-.011,.011])B(x+dx,G+.0042,z,.00025,.0002,.012,white);
  B(x,G+.0042,z,.00025,.0002,.012,white);
  for(let i=0;i<24;i++){const a=i*Math.PI/12,b=(i+1)*Math.PI/12;line([x+Math.cos(a)*.0022,G+.0043,z+Math.sin(a)*.0022],[x+Math.cos(b)*.0022,G+.0043,z+Math.sin(b)*.0022],.00012,white);}
  const at=(a,r,y)=>[x+Math.cos(a)*r,G+y,z+Math.sin(a)*r*.78];
  for(let i=0;i<N;i++){
   const a=i*Math.PI*2/N,b=(i+1)*Math.PI*2/N;
   for(let tier=0;tier<4;tier++)Q(at(a,.014+tier*.0018,.004+tier*.003),at(b,.014+tier*.0018,.004+tier*.003),at(b,.0158+tier*.0018,.005+tier*.003),at(a,.0158+tier*.0018,.005+tier*.003),tier%2?teal:[.44,.67,.66]);
   Q(at(a,.022,.004),at(b,.022,.004),at(b,.023,.021),at(a,.023,.021),i%2?cream:[.79,.73,.60]);
   Q(at(a,.023,.021),at(b,.023,.021),at(b,.013,.023),at(a,.013,.023),i%2?[.89,.85,.70]:[.96,.93,.80]);
   line(at(a,.0222,.005),at(b,.0232,.021),.00028,sand);line(at(b,.0222,.005),at(a,.0232,.021),.00028,sand);
   line(at(a,.0231,.0213),at((a+b)/2,.013,.0233),.00025,cream);
  }
  // Training fields on the south side, scaled to stay clear of the airport runway.
  for(const dx of [-.008,.008]){B(x+dx,G+.002,z+.022,.012,.001,.009,[.28,.60,.35]);B(x+dx,G+.0031,z+.022,.0002,.0002,.009,white);}
  for(let i=0;i<8;i++)C(x-.023+i*.006,G+.003,z-.022,.0004,.010,cream,5);
  heritage(S.nassif,true);heritage(S.matbouli,false);
 }
 if(region==='south'){
  // Rijal Almaa's compact stone towers, contrasting white quartz bands and small windows.
  const r=S.rijal;
  for(let i=0;i<9;i++){
   const x=r.x+(i%3-1)*.015,z=r.z+(Math.floor(i/3)-1)*.012,h=.030+(i%4)*.009;
   B(x,G+.003,z,.011,h,.010,[.38+i%3*.035,.37,.32]);
   for(let y=.009;y<h;y+=.009){B(x,G+y,z+.0052,.011,.001,.0005,white);B(x+.0056,G+y,z,.0005,.001,.010,white);}
   windows(x,z,.010,h,.010,G+.003,[.18,.31,.35]);
   for(let j=-1;j<=1;j++)B(x+j*.0035,G+.003+h,z+.0045,.0017,.003,.0017,white);
   B(x,G+.003,z+.0052,.0023,.005,.001,wood);
  }
  // Shada Palace: pale mud massing, corner turrets and patterned Aseer bands.
  const a=S.shada;
  B(a.x,G+.012,a.z,.035,.002,.030,[.78,.75,.55]);B(a.x,G+.014,a.z,.018,.030,.015,cream);
  for(const dx of [-.009,.009])for(const dz of [-.007,.007]){C(a.x+dx,G+.014,a.z+dz,.0028,.035,cream,7,.0018);C(a.x+dx,G+.049,a.z+dz,.0022,.002,sand,7);}
  windows(a.x,a.z,.018,.028,.015,G+.016);B(a.x,G+.042,a.z+.0078,.018,.001,.0008,teal);
  for(let i=0;i<8;i++)B(a.x-.007+i*.002,G+.039,a.z+.0078,.001,.001,.0008,[.87,.46,.36]);
  B(a.x,G+.014,a.z+.008,.0035,.006,.001,wood);
  // Al-Aan: four stepped mud floors on a stone knoll west of the Najran centre.
  const n=S.aan;C(n.x,G,n.z,.018,.008,[.62,.55,.43],12);
  for(let tier=0;tier<4;tier++){const w=.022-tier*.003,y=G+.008+tier*.010;B(n.x,y,n.z,w,.010,w*.8,sand);windows(n.x,n.z,w,.010,w*.8,y);B(n.x,y+.009,n.z+w*.4+.0003,w,.001,.0006,white);}
  // Dosariyah: square open courtyard and four corner towers on Jazan's waterfront hill.
  const d=S.dosariyah;d.x=LY.PLANS.south.places.jazanc.at[0]+.025;
  C(d.x,G,d.z,.018,.012,[.67,.60,.44],12);
  for(const dx of [-.010,.010])B(d.x+dx,G+.012,d.z,.002,.018,.022,cream);
  for(const dz of [-.010,.010])B(d.x,G+.012,d.z+dz,.022,.018,.002,cream);
  for(const dx of [-.010,.010])for(const dz of [-.010,.010]){C(d.x+dx,G+.012,d.z+dz,.004,.025,cream,10);for(let k=0;k<4;k++)B(d.x+dx+Math.cos(k*Math.PI/2)*.003,G+.037,d.z+dz+Math.sin(k*Math.PI/2)*.003,.0015,.002,.0015,cream);}
 }
};
