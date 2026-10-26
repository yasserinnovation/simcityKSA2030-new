// V28: original coastal scenery, architectural detail, moving fountain and dimensional clouds.
// One merged static draw, one point system and shared cloud geometry; no external asset requests.
window.VisionKingdomLife=function({T,root,G,geo,LY,D,border,onLand,anyLand,height,mesh,owned,existingIslands=[]}){
  let seed=2802030;const R=()=>{let n=seed+=0x6D2B79F5;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return((n^n>>>14)>>>0)/4294967296;};
  const p=[],c=[],islets=[],stats={reefs:0,islets:0,pylons:0,arcades:0,clouds:0,fountainParticles:160};
  const rgb=h=>[(h>>16&255)/255,(h>>8&255)/255,(h&255)/255];
  const tri=(a,b,d,col)=>{for(const q of[a,b,d]){p.push(...q);c.push(...rgb(col));}};
  const cache=new Map();
  function stamp(g,x,y,z,sx,sy,sz,col,rot=0){
    if(!cache.has(g))cache.set(g,g.index?g.toNonIndexed():g.clone());const a=cache.get(g).attributes.position,ca=Math.cos(rot),sa=Math.sin(rot),cl=rgb(col);
    for(let i=0;i<a.count;i++){const xx=a.getX(i)*sx,zz=a.getZ(i)*sz;p.push(x+xx*ca-zz*sa,y+a.getY(i)*sy,z+xx*sa+zz*ca);c.push(...cl);}
  }
  const cube=new T.BoxGeometry(1,1,1),sphere=new T.IcosahedronGeometry(1,0),cylinder=new T.CylinderGeometry(1,1,1,10);
  const box=(x,y,z,w,h,d,col,rot=0)=>stamp(cube,x,y+h/2,z,w,h,d,col,rot);
  const ribbon=(a,b,w,col)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,nx=-dz/l*w,nz=dx/l*w;
    const q=[[a[0]+nx,G+.010+height(...a),a[1]+nz],[b[0]+nx,G+.010+height(...b),b[1]+nz],[b[0]-nx,G+.010+height(...b),b[1]-nz],[a[0]-nx,G+.010+height(...a),a[1]-nz]];tri(q[0],q[1],q[2],col);tri(q[0],q[2],q[3],col);};
  // Irregular, multi-ring reef shelves break up the coarse source coastline without changing gameplay boundaries.
  function reef(x,z,rx,rz,islet){
    const n=28,ring=(s,y)=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2,r=.84+.12*Math.sin(a*3+x*20)+.06*Math.sin(a*5+z*13);return[x+Math.cos(a)*rx*r*s,y,z+Math.sin(a)*rz*r*s];});
    const rings=[ring(1.6,-.188),ring(1.25,-.1865),ring(1,-.1845),ring(.78,-.182)];
    const cols=[0x229da8,0x4bc9bd,0x9bdfc6];
    for(let k=0;k<3;k++)for(let i=0;i<n;i++){const j=(i+1)%n;tri(rings[k][i],rings[k+1][i],rings[k][j],cols[k]);tri(rings[k][j],rings[k+1][i],rings[k+1][j],cols[k]);}
    for(let k=0;k<8;k++){const a=R()*6.283,d=R()*.7,px=x+Math.cos(a)*rx*d,pz=z+Math.sin(a)*rz*d;stamp(sphere,px,-.183,pz,rx*.12,.003,rz*.13,[0x419c82,0x69b59a,0xd3dca7][k%3]);}
    if(islet){const a=ring(.63,-.176),b=ring(.48,-.164);for(let i=0;i<n;i++){const j=(i+1)%n;tri(a[i],b[i],a[j],0xf6df9f);tri(a[j],b[i],b[j],0xe9c580);tri([x,-.157,z],b[j],b[i],0xf8e2a5);}
      for(let k=0;k<6;k++){const a=R()*6.28;stamp(sphere,x+Math.cos(a)*rx*.3,-.151,z+Math.sin(a)*rz*.3,rx*.12,.009,rz*.12,0x579446);}islets.push([x,z,Math.max(rx,rz)*.7]);stats.islets++;
    }stats.reefs++;
  }
  for(let i=0;i<border.length;i++){const a=border[i],b=border[(i+1)%border.length],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<.02)continue;
    for(let t=.10;t<l;t+=.18+R()*.15){const f=t/l,xx=a[0]+dx*f,zz=a[1]+dz*f;let side=0;
      for(const s of[-1,1])if(!anyLand(xx-dz/l*.11*s,zz+dx/l*.11*s))side=s;if(!side)continue;
      const off=.09+R()*.08,x=xx-dz/l*off*side,z=zz+dx/l*off*side,rx=.025+R()*.028,rz=.04+R()*.045;
      if([[0,0],[rx*1.7,0],[-rx*1.7,0],[0,rz*1.7],[0,-rz*1.7]].some(([a,b])=>anyLand(x+a,z+b)))continue;
      reef(x,z,rx,rz,R()<.46);
    }
  }
  for(const[x,z,r]of existingIslands)reef(x,z,r,r*.83,true);
  // Riyadh boulevard loops and planted medians sit on the national terrain and connect its built districts.
  const riy=LY.cityDisplay.Riyadh;
  for(const rad of [.56,.78])for(let k=0;k<96;k++){const a=k/96*6.283,b=(k+1)/96*6.283,at=t=>[riy[0]+Math.cos(t)*rad,riy[1]+Math.sin(t)*rad*.72],u=at(a),v=at(b);
    if(!onLand(...u)||!onLand(...v)||height(...u)>.018||height(...v)>.018||Math.hypot(u[0]-riy[0],u[1]-riy[1])<.38)continue;
    ribbon(u,v,.014,0xdec99b);ribbon(u,v,.010,0x596970);ribbon(u,v,.0012,0xefc677);
  }
  // Architectural rhythm: fine colonnades at the Haram and shade-court columns at the Prophet's Mosque.
  {const q=LY.cityDisplay.Makkah,x=q[0]+.14,z=q[1];for(let k=0;k<64;k++){const a=k/64*6.283,px=x+Math.cos(a)*.231,pz=z+Math.sin(a)*.195;
    stamp(cylinder,px,G+.032,pz,.0024,.058,.0024,0xfaf3db);stamp(sphere,px,G+.065,pz,.007,.006,.006,0xf4e4c1);stats.arcades++;}}
  {const[x,z]=LY.cityDisplay.Madinah;for(let k=0;k<20;k++){const px=x-.21+(k%5)*.105,pz=z+.18+Math.floor(k/5)*.034;stamp(cylinder,px,G+.026,pz,.0016,.048,.0016,0xe0ceaa);}}
  // Power pylons and catenary cables follow an existing intercity route; they are scenery, not resource producers.
  const wirePts=[];
  for(const[lo,la]of[[45.8,23.8],[45.4,24.2],[45.0,24.6],[44.6,25.0],[44.2,25.4]]){const[x,z]=geo(lo,la);if(!onLand(x,z)||LY.roadDist(x,z)<.08||LY.footprintAt(x,z))continue;const y=G+height(x,z);
    for(const side of[-1,1]){box(x+side*.011,y,z,.002,.10,.002,0x75827d);box(x,y+.075,z,.045,.003,.005,0xb5b6a2);}
    for(let k=0;k<4;k++){box(x,y+.016+k*.020,z,.025-k*.004,.002,.002,0xadb4a4);}
    wirePts.push([x,y+.09,z]);stats.pylons++;
  }
  for(let k=1;k<wirePts.length;k++){const a=wirePts[k-1],b=wirePts[k];for(let j=0;j<12;j++){const q=j/12,r=(j+1)/12,f=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t-Math.sin(t*Math.PI)*.028,a[2]+(b[2]-a[2])*t],u=f(q),v=f(r);tri([u[0]-.0006,u[1],u[2]],[v[0]-.0006,v[1],v[2]],[v[0]+.0006,v[1],v[2]],0x75827d);}}
  if(p.length)root.add(mesh(p,c));for(const g of cache.values())g.dispose();cube.dispose();sphere.dispose();cylinder.dispose();

  // A shared truly three-dimensional cloud sculpt: smooth, nested puffs with lit tops and cool undersides.
  // No opaque screen-space blur cards; depth testing preserves the landscape beneath.
  // A single implicit surface avoids visible sphere intersections and behaves correctly under AO.
  const cp=[],cn=[],puffs=[[-.38,.12,0,.27],[-.13,.23,0,.32],[.13,.22,0,.30],[.36,.13,0,.25],[0,.12,.19,.22]];
  for(let k=0;k<24;k++)puffs.push([(R()-.5)*1.12,.15+R()*.25,(R()-.5)*.48,.09+R()*.07]);
  const density=(x,y,z)=>{let d=-.64;for(const[a,b,c,r]of puffs){const q=((x-a)**2+(y-b)**2*1.8+(z-c)**2)/(r*r);if(q<6)d+=Math.exp(-q*1.4);}return d;};
  const step=.06,nx=37,ny=18,nz=23,verts=[],values=new Float32Array(nx*ny*nz);
  const index=(x,y,z)=>(z*ny+y)*nx+x;
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const p=[x*step-1.1,y*step-.25,z*step-.65],i=index(x,y,z);verts[i]=p;values[i]=density(...p);}
  const norm=p=>{const e=.002,x=density(p[0]-e,p[1],p[2])-density(p[0]+e,p[1],p[2]),y=density(p[0],p[1]-e,p[2])-density(p[0],p[1]+e,p[2]),z=density(p[0],p[1],p[2]-e)-density(p[0],p[1],p[2]+e),l=Math.hypot(x,y,z)||1;return[x/l,y/l,z/l];};
  const emit=(a,b,c)=>{const n=norm(a),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(cross.reduce((s,v,i)=>s+v*n[i],0)<0)[b,c]=[c,b];for(const p of[a,b,c]){cp.push(...p);cn.push(...norm(p));}};
  const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
    const ids=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(([a,b,c])=>index(x+a,y+b,z+c));
    if(ids.every(i=>values[i]<0)||ids.every(i=>values[i]>=0))continue;
    for(const tet of tets){const inside=tet.map(k=>ids[k]).filter(i=>values[i]>=0),outside=tet.map(k=>ids[k]).filter(i=>values[i]<0);if(!inside.length||!outside.length)continue;
      const cut=(i,j)=>{const f=values[i]/(values[i]-values[j]);return verts[i].map((v,k)=>v+(verts[j][k]-v)*f);};
      if(inside.length===1)emit(...outside.map(j=>cut(inside[0],j)));
      else if(outside.length===1)emit(...inside.map(i=>cut(i,outside[0])));
      else{const a=cut(inside[0],outside[0]),b=cut(inside[0],outside[1]),c=cut(inside[1],outside[0]),d=cut(inside[1],outside[1]);emit(a,b,c);emit(b,d,c);}
    }
  }
  const cg=new T.BufferGeometry();cg.setAttribute('position',new T.Float32BufferAttribute(cp,3));cg.setAttribute('normal',new T.Float32BufferAttribute(cn,3));cg.computeBoundingSphere();owned.add(cg);stats.cloudTriangles=cp.length/9;
  const cm=new T.ShaderMaterial({uniforms:{night:{value:0}},transparent:false,depthWrite:true,
    vertexShader:'varying vec3 n; varying vec3 v; void main(){n=mat3(modelMatrix)*normal;vec4 p=modelViewMatrix*vec4(position,1.);v=-p.xyz;gl_Position=projectionMatrix*p;}',
    fragmentShader:'uniform float night;varying vec3 n,v;void main(){vec3 N=normalize(n);float l=.55+.45*max(0.,dot(N,normalize(vec3(.65,1.,-.42))));vec3 col=mix(vec3(.48,.61,.73),vec3(1.,.99,.95),clamp(.25+max(N.y,0.)*.52+l*.23,0.,1.));float alpha=.88*smoothstep(.03,.45,abs(dot(N,normalize(v))));gl_FragColor=vec4(mix(col,col*vec3(.32,.38,.53),night),1.);}'
  });owned.add(cm);const clouds=[];
  for(const[lo,la,size]of[[32.0,31.0,1.45],[33.1,22.0,1.2],[34.2,17.1,1.4],[39.5,14.8,1.2],[49.0,15.1,1.35],[57.9,18.3,1.2],[56.8,29.8,1.5],[44.0,34.0,1.1]]){
    const[x,z]=geo(lo,la),m=new T.Mesh(cg,cm);m.position.set(x,.25,z);m.rotation.y=-.2+R()*.5;m.scale.setScalar(size*.66);m.renderOrder=7;root.add(m);clouds.push({m,x,z});stats.clouds++;
  }
  // Animated fountain with a parabolic spray and return arc, anchored in Jeddah's water.
  const j=LY.cityDisplay.Jeddah,fz=j[1]-.19,fx=VisionRegions.coastW(fz)-.14,fp=new Float32Array(stats.fountainParticles*3),phase=new Float32Array(stats.fountainParticles);
  for(let i=0;i<phase.length;i++){fp[i*3]=(R()-.5)*.014;fp[i*3+1]=R();fp[i*3+2]=(R()-.5)*.018;phase[i]=R();}
  const fg=new T.BufferGeometry();fg.setAttribute('position',new T.BufferAttribute(fp,3));fg.setAttribute('phase',new T.BufferAttribute(phase,1));owned.add(fg);
  const fm=new T.ShaderMaterial({uniforms:{time:{value:0},night:{value:0}},transparent:true,depthWrite:false,
    vertexShader:'attribute float phase;uniform float time;varying float a;void main(){float f=fract(phase+time*.31);vec3 p=position;p.x+=f*f*.035;p.z+=f*f*.008;p.y=sin(f*3.14159265)*(.25+position.y*.06);vec4 q=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*q;gl_PointSize=clamp(21./-q.z,1.,4.);a=(1.-f*.7)*.8;}',
    fragmentShader:'uniform float night;varying float a;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(mix(vec3(.88,.99,1.),vec3(.45,.75,1.),night),a*(1.-smoothstep(.1,.5,d)));}'
  });owned.add(fm);const fountain=new T.Points(fg,fm);fountain.position.set(fx,-.176,fz);fountain.frustumCulled=false;root.add(fountain);
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {stats,islets,update(time,night,quality){cm.uniforms.night.value=night;fm.uniforms.time.value=still?4:time;fm.uniforms.night.value=night;
    clouds.forEach(({m,x,z},i)=>{m.position.x=x+(still?0:Math.sin(time*.018+i)*.10);m.position.z=z+(still?0:Math.cos(time*.012+i)*.035);m.visible=quality!=='low'||i%2===0;});
  }};
};
