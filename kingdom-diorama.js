// National-scale miniature scenery. Original procedural assets; no campaign-state changes.
window.VisionKingdomDiorama=function(T,scene,D,LY,geo,border,onLand){
 const root=new T.Group();scene.add(root);const G=-.12,SEA=-.19;
 const box=new T.BoxGeometry(1,1,1),orb=new T.SphereGeometry(1,12,8),cone=new T.ConeGeometry(1,1,12),disc=new T.CylinderGeometry(1,1,1,24);
 const positions=[],colours=[],sun=new T.Vector3(-.65,.85,.55).normalize();
 function stamp(g,x,y,z,sx,sy,sz,col,rot=0){const q=g.index?g.toNonIndexed():g,c=new T.Color(col),p=q.attributes.position,n=q.attributes.normal,cs=Math.cos(rot),sn=Math.sin(rot);
  for(let i=0;i<p.count;i++){const px=p.getX(i)*sx,pz=p.getZ(i)*sz;positions.push(x+px*cs-pz*sn,y+p.getY(i)*sy,z+px*sn+pz*cs);const v=new T.Vector3(n.getX(i)/sx,n.getY(i)/sy,n.getZ(i)/sz);v.set(v.x*cs-v.z*sn,v.y,v.x*sn+v.z*cs).normalize();const light=.62+.36*Math.max(0,v.dot(sun));colours.push(c.r*light,c.g*light,c.b*light);}if(q!==g)q.dispose();}
 const clear=(x,z,r)=>!LY.insideCore(x,z,r)&&LY.decorAllowed(x,z,r,.035,true)&&onLand(x,z)&&onLand(x-r,z)&&onLand(x+r,z)&&onLand(x,z-r)&&onLand(x,z+r);
 function palm(x,z,k=1){stamp(box,x,G+.012*k,z,.0015*k,.024*k,.0015*k,0xb68c55);for(let j=0;j<5;j++){const a=j*Math.PI*.4;stamp(orb,x+Math.cos(a)*.005*k,G+.027*k,z+Math.sin(a)*.005*k,.008*k,.0025*k,.0028*k,0x4a985b,a);}stamp(orb,x,G+.027*k,z,.004*k,.003*k,.004*k,0x6ead68);}
 let farms=0,palms=0,reefs=0;
 // Sparse plantation parcels outside gameplay footprints, strongest along the southwest spine.
 for(let i=0;i<82;i++){const [x,z]=geo(42.15+(i%9)*.11+Math.sin(i*2.3)*.12,17.6+Math.floor(i/9)*.29);if(!clear(x,z,.043))continue;
  for(let k=0;k<3;k++){stamp(box,x,G+.002+k*.002,z+(k-1)*.022,.078,.002,.017,k%2?0x799b4c:0x93b65b);for(let j=0;j<4;j++){palm(x-.028+j*.018,z+(k-1)*.022,.7);palms++;}}farms++;
 }
 // Central pivot irrigation motifs are decorative, geospatially approximate.
 for(let i=0;i<50;i++){const [x,z]=geo(43.1+(i%10)*.19,25.1+Math.floor(i/10)*.25);if(!clear(x,z,.037))continue;stamp(disc,x,G+.004,z,.033,.002,.033,i%2?0x669748:0x89aa53);stamp(disc,x,G+.0052,z,.025,.0005,.025,0x96ba62);stamp(box,x+.010,G+.006,z,.024,.001,.001,0xe2d4ae,i*.5);farms++;}
 // Reef gardens and sandbars hug each coast; land tests keep reefs out of the national base.
 for(const side of ['west','east'])for(let i=0;i<65;i++){
  const z=side==='west'?-2.0+i*.087:-1.0+i*.040,cx=side==='west'?VisionRegions.coastW(z):VisionRegions.coastE(z),sgn=side==='west'?-1:1;
  for(let j=0;j<3;j++){const x=cx+sgn*(.045+j*.032),zz=z+Math.sin(i*2+j)*.018;if(onLand(x,zz))continue;
   stamp(orb,x,SEA+.0008,zz,.028+j*.004,.0008,.018,j===0?0xc8d9aa:j===1?0x59bca9:0x318f97);reefs++;
   for(let k=0;k<4;k++)stamp(orb,x+Math.sin(k*2.3+i)*.015,SEA+.002,zz+Math.cos(k*2.3+i)*.009,.003,.001,.003,k%2?0x9ecaa7:0xdec396);
  }
 }
 let viaducts=0;
 for(const route of LY.intercity)for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz);if(L<.15)continue;const rot=Math.atan2(dz,dx),mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
  stamp(box,mx,G+.009,mz,L,.004,.014,0x667a7b,rot);stamp(box,mx,G+.0112,mz,L,.0004,.0007,0xf9df9e,rot);
  for(let t=.08;t<L;t+=.15){const x=a[0]+dx*t/L,z=a[1]+dz*t/L;if(!onLand(x,z))continue;stamp(box,x,G+.003,z,.005,.013,.007,0xd4c8ab);}viaducts++;
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colours,3));g.computeBoundingSphere();root.add(new T.Mesh(g,new T.MeshBasicMaterial({vertexColors:true})));
 // Additive border ribbons follow every vertex of the existing game border, with nested glow widths.
 for(const [w,opacity]of[[.035,.08],[.016,.19],[.0045,.95]]){const pos=[];for(let i=0;i<border.length;i++){const a=border[i],b=border[(i+1)%border.length],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),nx=-dz/L*w,nz=dx/L*w;const v=[[a[0]+nx,G+.008,a[1]+nz],[b[0]+nx,G+.008,b[1]+nz],[b[0]-nx,G+.008,b[1]-nz],[a[0]-nx,G+.008,a[1]-nz]];for(const j of[0,2,1,0,3,2])pos.push(...v[j]);}const bg=new T.BufferGeometry();bg.setAttribute('position',new T.Float32BufferAttribute(pos,3));root.add(new T.Mesh(bg,new T.MeshBasicMaterial({color:0xffbf51,transparent:true,opacity,blending:w<.005?T.NormalBlending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide})));}
 // Ships carry layered decks, container stacks, cabins and occasional sails.
 const ships=[];
 function part(group,shape,pos,scale,col){const m=new T.Mesh(shape,new T.MeshBasicMaterial({color:col}));m.position.set(...pos);m.scale.set(...scale);group.add(m);return m;}
 for(let i=0;i<22;i++){const gulf=i>15,z=gulf?-.70+(i-16)*.11:-1.85+i*.31,x=(gulf?VisionRegions.coastE(z):VisionRegions.coastW(z))+(gulf?.19:-.19);if(onLand(x,z))continue;
  const ship=new T.Group(),cargo=i%3===0,sail=i%3===2,k=cargo?1.5:1;
  part(ship,orb,[0,0,0],[.018*k,.004*k,.005*k],cargo?0x365b71:0xffefd8);part(ship,box,[0,.004*k,0],[.022*k,.002*k,.008*k],0xeadac2);
  part(ship,box,[-.010*k,.008*k,0],[.006*k,.007*k,.007*k],0xf8f1d8);part(ship,box,[-.009*k,.010*k,.0036*k],[.003*k,.002*k,.0004],0x5db9cb);
  if(cargo)for(let j=0;j<5;j++)for(let row=0;row<2;row++)part(ship,box,[-.003+j*.005,.009+row*.004,0],[.004,.0035,.006],[0xe6995b,0x69bdb7,0xd3cba7][(j+row)%3]);
  if(sail){part(ship,box,[0,.017,0],[.0006,.028,.0006],0xeee5d5);part(ship,cone,[.003,.019,0],[.007,.022,.0008],0xfff6e1);}
  root.add(ship);ships.push({ship,x,z,i});
 }
 // Soft cloud shadows use the same centers and sun direction as their moving puff clusters.
 const cv=document.createElement('canvas');cv.width=cv.height=64;const ctx=cv.getContext('2d'),grad=ctx.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(43,49,57,.30)');grad.addColorStop(.5,'rgba(43,49,57,.15)');grad.addColorStop(1,'rgba(43,49,57,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);const tex=new T.CanvasTexture(cv),clouds=[];
 const cloudOrb=orb.clone(),cloudColors=[];for(let i=0;i<cloudOrb.attributes.normal.count;i++){const n=cloudOrb.attributes.normal;const light=.65+.34*Math.max(0,new T.Vector3(n.getX(i),n.getY(i),n.getZ(i)).dot(sun));cloudColors.push(light,light*.98,light*.95);}cloudOrb.setAttribute('color',new T.Float32BufferAttribute(cloudColors,3));
 for(let i=0;i<10;i++){const cluster=new T.Group(),[x,z]=geo(35.8+(i%5)*3.5,18.2+Math.floor(i/5)*8.3),alt=.45+(i%3)*.17;
  for(let j=0;j<7;j++){const m=part(cluster,cloudOrb,[(j%3-1)*.105,(j%2)*.055,(Math.floor(j/3)-1)*.08],[.13,.085,.10],0xfffcf4);m.material.vertexColors=true;}
  root.add(cluster);const shadow=new T.Mesh(new T.PlaneGeometry(.70,.50),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;root.add(shadow);clouds.push({cluster,shadow,x,z,alt});
 }
 // Merge each animated prop into one vertex-coloured draw instead of drawing every deck/puff separately.
 function batch(group){const p=[],c=[];for(const child of [...group.children]){if(!child.isMesh)continue;child.updateMatrix();const q=(child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone()).applyMatrix4(child.matrix),pos=q.attributes.position,n=q.attributes.normal,vc=q.attributes.color,col=child.material.color;
  for(let i=0;i<pos.count;i++){p.push(pos.getX(i),pos.getY(i),pos.getZ(i));const light=vc?1:.66+.32*Math.max(0,new T.Vector3(n.getX(i),n.getY(i),n.getZ(i)).dot(sun));c.push(col.r*(vc?vc.getX(i):light),col.g*(vc?vc.getY(i):light),col.b*(vc?vc.getZ(i):light));}q.dispose();child.material.dispose();group.remove(child);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.computeBoundingSphere();group.add(new T.Mesh(g,new T.MeshBasicMaterial({vertexColors:true})));
 }
 ships.forEach(s=>batch(s.ship));clouds.forEach(c=>batch(c.cluster));
 // One restrained tilt-shift pass at Kingdom zoom; labels/UI and regional close views stay sharp.
 const rt=new T.WebGLRenderTarget(1,1),postScene=new T.Scene(),postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 const postMat=new T.ShaderMaterial({uniforms:{map:{value:rt.texture},px:{value:new T.Vector2(1,1)}},depthTest:false,depthWrite:false,vertexShader:'varying vec2 uvv;void main(){uvv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D map;uniform vec2 px;varying vec2 uvv;void main(){float b=smoothstep(.25,.49,abs(uvv.y-.49))*2.2;vec2 d=px*b;vec3 c=texture2D(map,uvv).rgb*.40;c+=(texture2D(map,uvv+d).rgb+texture2D(map,uvv-d).rgb)*.15;c+=(texture2D(map,uvv+vec2(d.x,-d.y)).rgb+texture2D(map,uvv+vec2(-d.x,d.y)).rgb)*.15;float v=1.-.12*smoothstep(.3,.72,length(uvv-.5));gl_FragColor=vec4(c*v,1.);}'});
 postScene.add(new T.Mesh(new T.PlaneGeometry(2,2),postMat));let postOn=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;let countryHidden=false;
 const traffic=[];
 for(let i=0;i<30;i++){const route=(i<24?LY.intercity:LY.rails)[i%(i<24?LY.intercity.length:LY.rails.length)];if(!route||route.length<2)continue;const car=new T.Group(),train=i>=24;
  part(car,box,[0,.003,0],[train?.026:.006,.004,.0035],train?0xd8ece6:[0xefb357,0x83ccc6,0xf6eee0][i%3]);part(car,box,[0,.006,0],[train?.022:.0025,.0015,.003],0x4c7387);root.add(car);
  const lengths=route.slice(1).map((b,k)=>Math.hypot(b[0]-route[k][0],b[1]-route[k][1]));traffic.push({car,route,lengths,total:lengths.reduce((a,b)=>a+b,0),i,train});
 }
 traffic.forEach(c=>batch(c.car));
 window.__visionKingdom={farms,palms,reefs,viaducts,traffic:traffic.length,ships:ships.length,cloudClusters:clouds.length,border:'existing illustrative polygon',tiltShift:'Kingdom zoom only'};
 return {pass(p){root.visible=p==='main'&&!countryHidden;},update(t,dist,night){countryHidden=!!window.__visionCountryOverview&&dist>6;if(countryHidden)return;const time=reduced?12:t*.001;
  traffic.forEach(({car,route,lengths,total,i,train})=>{let d=(time*.013+i*.137)%total,k=0;while(k<lengths.length-1&&d>lengths[k])d-=lengths[k++];const a=route[k],b=route[k+1],f=d/(lengths[k]||1);car.position.set(a[0]+(b[0]-a[0])*f,G+(train?.006:.013),a[1]+(b[1]-a[1])*f);car.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);});
  ships.forEach(({ship,x,z,i})=>{ship.position.set(x+Math.sin(time*.035+i)*.035,SEA+.006,z+Math.cos(time*.035+i)*.045);ship.rotation.y=Math.sin(time*.035+i)*.3;});
  clouds.forEach(({cluster,shadow,x,z,alt},i)=>{const xx=x+Math.sin(time*.025+i)*.15,zz=z+Math.cos(time*.025+i)*.09;cluster.position.set(xx,alt,zz);cluster.visible=dist>6;const sx=xx+.65*(alt-G)/.85,sz=zz-.55*(alt-G)/.85;shadow.position.set(sx,G+.007,sz);shadow.visible=dist>6&&onLand(sx,sz)&&onLand(sx-.35,sz)&&onLand(sx+.35,sz)&&onLand(sx,sz-.25)&&onLand(sx,sz+.25);});
  root.traverse(o=>{if(o.material?.color){o.userData.base??=o.material.color.clone();o.material.color.copy(o.userData.base).multiplyScalar(1-night*.42);}});
 },begin(renderer,w,h,dpr,dist){postOn=dist>6&&!window.__visionCountryOverview; if(postOn){const rw=Math.round(w*dpr),rh=Math.round(h*dpr);if(rt.width!==rw||rt.height!==rh)rt.setSize(rw,rh);postMat.uniforms.px.value.set(1/rw,1/rh);renderer.setRenderTarget(rt);renderer.clear();}},finish(renderer){if(postOn){renderer.setRenderTarget(null);renderer.render(postScene,postCamera);}}};
};
