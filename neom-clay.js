// Original stylized NEOM concept architecture, using the game's existing project footprints.
window.VisionNeomClay=function(K){
 const {G,box:B,cylinder:C,blob,quad:Q,palm,LY,projects}=K;
 const cream=[.96,.94,.83],aqua=[.36,.78,.81],navy=[.23,.43,.51],green=[.36,.68,.43],gold=[.98,.76,.38];
 const p=id=>projects.find(p=>p.id===id);
 function ring(x,z,r,y,w,col,n=32){for(let i=0;i<n;i++){const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n;Q([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],[x+Math.cos(b)*(r-w),y,z+Math.sin(b)*(r-w)],[x+Math.cos(a)*(r-w),y,z+Math.sin(a)*(r-w)],col);}}
 let panels=0,gardens=0;
 // Paired walls with a visible green interior. Coloured bands suggest sky, dunes and oasis reflections.
 const ln=p('neom'),pts=ln.ribbon.pts;
 for(let s=1;s<pts.length;s++){
  const a=pts[s-1],b=pts[s],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),rot=Math.atan2(dz,dx),ux=dx/L,uz=dz/L,n=Math.ceil(L/.015);
  const at=(t,v)=>[a[0]+dx*t-uz*v,a[1]+dz*t+ux*v];
  for(let i=0;i<n;i++){
   const t=(i+.5)/n,[x,z]=at(t,0),len=L/n;
   B(x,G+.002,z,len,.003,.014,green,rot);
   for(const side of [-1,1]){const [wx,wz]=at(t,side*.006);
    B(wx,G+.004,wz,len,.064,.0028,navy,rot);
    for(let h=0;h<6;h++){const tint=h<2?[.67,.72,.61]:h<4?[.46,.72,.75]:[.76,.88,.90];const f=.96+Math.sin(i*1.7+h)*.04;B(wx,G+.006+h*.010,wz,len-.0005,.0098,.003,tint.map(v=>v*f),rot);panels++;}
    B(wx,G+.068,wz,len,.001,.0034,cream,rot);
   }
   if(i%3===0){B(x,G+.034,z,len*.65,.002,.010,cream,rot);blob(x,G+.038,z,.003,.003,.0026,green);gardens++;}
   if(i%5===2){B(x,G+.069,z,.002,.002,.015,gold,rot);}
  }
 }
 // Hexagonal atrium and stacked ring gardens are playful concept details inside the corridor.
 const [cx,cz]=pts[1];
 for(let k=0;k<3;k++){ring(cx+.034,cz-.008,.008-k*.0015,G+.021+k*.012,.0022,cream,24);ring(cx+.034,cz-.008,.006-k*.0015,G+.0212+k*.012,.001,green,24);}
 C(cx+.034,G+.004,cz-.008,.0015,.052,aqua,8);
 ring(cx-.034,cz+.008,.005,G+.045,.0009,aqua,6);
 // Oxagon: perimeter promenade, stepped innovation blocks and legible open-water dock slips.
 const ox=p('oxagon');
 ring(ox.x,ox.z,.073,G+.006,.005,cream,8);ring(ox.x,ox.z,.069,G+.0063,.0013,aqua,8);
 for(let i=0;i<8;i++){const angle=i*Math.PI/4+Math.PI/8,x=ox.x+Math.cos(angle)*.057,z=ox.z+Math.sin(angle)*.057;
  if(i===3||i===4)continue;
  B(x,G+.007,z,.019,.012,.014,cream,angle);B(x,G+.019,z,.015,.011,.010,aqua,angle);B(x,G+.030,z,.011,.005,.007,cream,angle);
  for(let j=0;j<3;j++)B(x,G+.012+j*.007,z,.020,.001,.0145,navy,angle);
  blob(x,G+.036,z,.004,.001,.003,green);
 }
 for(const dz of [-.012,.013])B(ox.x-.035,G+.004,ox.z+dz,.064,.001,.014,[.20,.65,.73]);
 for(let i=0;i<3;i++){const x=ox.x-.034,z=ox.z-.024+i*.025;
  B(x,G+.003,z,.033,.003,.008,cream);B(x-.017,G+.006,z,.002,.025,.003,gold);B(x-.010,G+.029,z,.017,.002,.002,gold);C(x-.008,G+.014,z,.0004,.015,navy,5);
  for(let j=0;j<3;j++)B(x+.002+j*.007,G+.007,z,.006,.004,.005,j%2?aqua:[.94,.59,.37]);
 }
 // Hydrogen campus: colourful electrolyser stacks and connected storage, alongside existing solar rows.
 const h=p('hydrogen');
 for(let i=0;i<4;i++){const x=h.x-.025+i*.015,z=h.z+.031;C(x,G+.003,z,.005,.014,cream,14);C(x,G+.017,z,.0051,.002,aqua,14);B(x,G+.005,z-.008,.003,.008,.007,gold);}
 B(h.x-.003,G+.011,h.z+.027,.054,.0018,.0018,aqua);
 // Trojena's lake remains exposed; angular terraces sit on its northern bank.
 const tj=p('trojena');
 for(let i=0;i<5;i++){const x=tj.x-.024+i*.012,z=tj.z-.022;
  B(x,G+.006,z,.010,.016+i%2*.006,.014,cream);B(x,G+.022+i%2*.006,z,.011,.002,.015,aqua);B(x,G+.012,z+.0072,.007,.006,.0008,navy);
 }
 ring(tj.x,tj.z+.004,.023,G+.008,.002,cream);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;blob(tj.x+Math.cos(a)*.024,G+.011,tj.z+.004+Math.sin(a)*.024,.003,.004,.003,green);}
 // A lightweight cableway spans the valley rather than hiding behind the mountain ring.
 const liftA=[tj.x-.038,tj.z+.028],liftB=[tj.x+.036,tj.z-.028];
 for(const [x,z]of[liftA,liftB]){C(x,G+.003,z,.0014,.076,cream,8);B(x,G+.078,z,.008,.002,.003,navy);}
 const ld=Math.hypot(liftB[0]-liftA[0],liftB[1]-liftA[1]);B((liftA[0]+liftB[0])/2,G+.078,(liftA[1]+liftB[1])/2,ld,.0007,.0007,navy,Math.atan2(liftB[1]-liftA[1],liftB[0]-liftA[0]));
 const sd=p('sindalah');ring(sd.x-.008,sd.z,.017,G+.012,.003,cream);ring(sd.x-.008,sd.z,.014,G+.0122,.001,green);C(sd.x-.008,G+.009,sd.z,.004,.003,aqua,24);
 window.__visionNeomClay={mirrorPanels:panels,skyGardens:gardens,oxagonTerraces:6,harbourCranes:3,lakeLodges:5,conceptRingGardens:3,liftA,liftB};
};
