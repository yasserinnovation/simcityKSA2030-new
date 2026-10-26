// V26: original sculpted rock and heritage kits. Geometry only; never edits game state.
window.VisionSculptedWorld=function({T,stamp,S,G,geo,LY,onLand,height,clearance,spine}){
 const owned=[],parts={rocks:0,facades:0,houses:0,palms:0};
 const rng=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296},R=rng(2602030);
 const box=(x,y,z,w,h,d,c)=>stamp(S.cube,x,y+h/2,z,w,h,d,c,.83);
 function shape(p,colors){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();owned.push(g);return g;}
 // An eroded buttress: linked rings, asymmetric crown, vertical fissures and undercut strata.
 function rock(x,z,w,d,h,seed,base=G+height(x,z)){
  const n=17,levels=10,rand=rng(seed),radii=Array.from({length:n},()=>.72+rand()*.28),crown=Array.from({length:n},(_,i)=>.91+.05*Math.sin(i*.9+seed)),p=[],cs=[],rings=[];
  for(let k=0;k<=levels;k++){const f=k/levels,ring=[];for(let i=0;i<n;i++){const a=i/n*Math.PI*2,ledge=1-(f*.30)+Math.sin(f*18+seed)*.065,cleft=i%4===0?.77:1;
   ring.push([x+Math.cos(a)*w*radii[i]*ledge*cleft+f*w*.13,base+h*f*(k===levels?crown[i]:.87),z+Math.sin(a)*d*radii[i]*ledge*cleft]);}rings.push(ring);}
  const tri=(a,b,c,k)=>{const shade=k%3===0?.94:1,col=[.77*shade,.45*shade,.25*shade];for(const q of[a,b,c]){p.push(...q);cs.push(...col);}};
  for(let k=0;k<levels;k++)for(let i=0;i<n;i++){const j=(i+1)%n;tri(rings[k][i],rings[k+1][i],rings[k][j],k);tri(rings[k][j],rings[k+1][i],rings[k+1][j],k);}
  for(let i=0;i<n;i++)tri([x,base+h*.94,z],rings[levels][(i+1)%n],rings[levels][i],2);
  const g=shape(p,cs);stamp(g,0,0,0,1,1,1,0xffffff);parts.rocks++;
 }
 // Hegra-inspired rock-cut portal, cornices and stepped crown; deliberately stylized.
 function tomb(x,z,w=.15,h=.22){const y=G+.008;rock(x,z-.025,w*.72,.075,h*1.16,parts.facades+120,y);
  box(x,y,z,w,h,.035,0xd58c50);box(x,y+.012,z+.02,w*.82,h*.77,.006,0xc57a43);
  for(const s of[-1,1]){box(x+s*w*.34,y+.012,z+.028,w*.085,h*.74,.012,0xe7a468);box(x+s*w*.34,y+h*.73,z+.032,w*.14,.012,.016,0xf1b77b);}
  box(x,y,z+.031,w*.25,h*.43,.006,0x4d2e23);box(x,y,z+.036,w*.18,h*.35,.003,0x302a29);
  for(const s of[-1,1])box(x+s*w*.15,y,z+.038,.006,h*.45,.008,0xe6a56c);
  box(x,y+h*.43,z+.036,w*.35,.012,.015,0xf1bc83);
  for(let k=0;k<3;k++)box(x,y+h*.79+k*.012,z+.01,w*(1.03+k*.04),.008,.06,0xf0b77c);
  for(let k=0;k<4;k++)for(const s of[-1,1])box(x+s*w*(.39-k*.075),y+h*.94+k*.015,z,w*.21,.016,.045,0xe8a66b);
  for(let k=0;k<5;k++)box(x,y-.004-k*.003,z+.045+k*.008,w*.75+k*.013,.003,.014,0xe9b582);
  parts.facades++;
 }
 function house(x,z,w,h,col){const y=G+.008;box(x,y,z,w,h,w*.8,col);box(x,y+h,z,w*1.06,.006,w*.86,0xefc38c);
  for(const s of[-1,1]){box(x+s*w*.47,y+h,z,.005,.012,w*.84,col);box(x,y+h,z+s*w*.38,w,.012,.005,col);}
  box(x,y,z+w*.405,w*.18,h*.52,.002,0x4e3a30);
  for(const dx of[-.29,.29])for(const f of[.34,.72]){box(x+dx*w,y+h*f,z+w*.406,w*.13,h*.15,.002,0x38494a);box(x+dx*w,y+h*f+h*.15,z+w*.409,w*.18,.003,.003,0xf6d5a0);}
  for(let k=0;k<4;k++)box(x-w*.35+k*w*.23,y+h+.01,z,w*.05,.005,w*.91,0x72503b);
  parts.houses++;
 }
 function palm(x,z,h=.1){const y=G+.01;stamp(S.cyl,x,y+h/2,z,.003,h,.003,0x906039,.8);
  for(let j=0;j<7;j++){const a=j/7*Math.PI*2,pts=[],cols=[];for(let k=0;k<5;k++){const t=k/5,u=(k+1)/5,l=h*.58,point=f=>[x+Math.cos(a)*l*f,y+h+.016*Math.sin(f*Math.PI)-.022*f*f,z+Math.sin(a)*l*f];const p=point(t),q=point(u),b=.008*(1-t);for(const v of[[p[0]-Math.sin(a)*b,p[1],p[2]+Math.cos(a)*b],q,[p[0]+Math.sin(a)*b,p[1],p[2]-Math.cos(a)*b]]){pts.push(...v);cols.push(.27,.49,.13);}}stamp(shape(pts,cols),0,0,0,1,1,1,0xffffff);}
  parts.palms++;
 }
 const [x,z]=LY.cityDisplay.AlUla;
 // A deliberate composition: heritage forecourt, oasis village, towering sandstone behind.
 box(x,G+.004,z+.28,.46,.003,.23,0xdcb07b);
 for(let row=0;row<4;row++)box(x,G+.007,z+.19+row*.058,.46,.0008,.008,0xf1ce97);
 box(x+.015,G+.006,z+.12,.055,.001,.18,0xf1ce97);
 tomb(x-.12,z+.12,.25,.35);tomb(x+.16,z+.045,.14,.21);
 // Elephant Rock's arch is open geometry, not a dark decal. An original stylized silhouette.
 {const a=new T.Shape();a.moveTo(-.065,0);a.lineTo(-.012,0);a.lineTo(.004,.062);a.bezierCurveTo(.012,.16,.080,.15,.083,.06);a.lineTo(.087,0);a.lineTo(.115,0);a.lineTo(.112,.145);a.bezierCurveTo(.14,.23,.05,.28,-.045,.25);a.bezierCurveTo(-.10,.23,-.085,.06,-.065,0);a.closePath();
  const g=new T.ExtrudeGeometry(a,{depth:.07,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:2,steps:1,curveSegments:12});stamp(g,x+.34,G+.008,z-.09,1.2,1.2,1.2,0xc98149,.84);g.dispose();parts.elephantRock=1;}

 for(let i=0;i<15;i++){const a=2.2+i*.25,px=x+Math.cos(a)*(.20+R()*.16),pz=z+Math.sin(a)*(.16+R()*.17);if(onLand(px,pz))rock(px,pz,.055+R()*.045,.045+R()*.035,.18+R()*.23,300+i,G+.006);}
 for(let row=0;row<3;row++)for(let col=0;col<6;col++){const px=x-.19+col*.065,pz=z+.22+row*.058;if(!onLand(px,pz))continue;house(px,pz,.038+R()*.012,.028+R()*.035,[0xd3a06c,0xb98553,0xe0b17e][(row+col)%3]);}
 for(let i=0;i<26;i++){const px=x-.27+R()*.58,pz=z+.18+R()*.26;if(onLand(px,pz)&&LY.roadDist(px,pz)>.035)palm(px,pz,.065+R()*.05);}
 // V28: national western terrain is continuous; these sculpted rocks belong only to AlUla.
 for(const g of owned)g.dispose();return parts;
};
