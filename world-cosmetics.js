// Locally authored clay-diorama cosmetics. No simulation state or picking IDs.
window.VisionCosmetics = function(T, scene, D, LY, ground) {
  const root=new T.Group(); scene.add(root);
  const positions=[],colours=[];
  const sun=new T.Vector3(-.5,1,.7).normalize();
  const box=new T.BoxGeometry(1,1,1),orb=new T.SphereGeometry(1,10,7),cone=new T.ConeGeometry(1,1,10);
  function stamp(geo,x,y,z,sx,sy,sz,hex){
    const g=geo.index?geo.toNonIndexed():geo, p=g.attributes.position,n=g.attributes.normal,c=new T.Color(hex);
    for(let i=0;i<p.count;i++){
      positions.push(x+p.getX(i)*sx,y+p.getY(i)*sy,z+p.getZ(i)*sz);
      const normal=new T.Vector3(n.getX(i)/sx,n.getY(i)/sy,n.getZ(i)/sz).normalize();
      const light=.70+.29*Math.max(0,normal.dot(sun));colours.push(c.r*light,c.g*light,c.b*light);
    }
    if(g!==geo)g.dispose();
  }
  const palette=[0xf5b48a,0xe9979a,0x8bd7cf,0xa9c5ed,0xf1cc85];
  let plots=0;
  // Small garden terraces and toy buildings around the existing city plan.
  for(let iz=0;iz<23;iz++)for(let ix=0;ix<23;ix++){
    const [x,z]=LY.R(-.91+ix*.081,-.99+iz*.083);
    if(!LY.decorAllowed(x,z,.038,.045,true)||(ix*7+iz*11)%4===0)continue;
    const h=.022+((ix*13+iz*7)%5)*.008;
    stamp(orb,x+.006,ground+.001,z+.006,.030,.0007,.026,0xbfa377);
    stamp(box,x,ground+.004,z,.044,.008,.043,0xfff0d4);
    stamp(box,x,ground+.008+h/2,z,.028,h,.028,palette[(ix+iz*3)%5]);
    stamp(box,x,ground+.010+h,z,.031,.004,.031,0xfff7e7);
    stamp(box,x,ground+.014+h,z,.018,.003,.019,0x65c9c5);
    for(let row=0;row<3;row++)for(let col=0;col<2;col++){
      const yy=ground+.015+row*.009;if(yy>ground+h)continue;
      stamp(box,x-.007+col*.014,yy,z+.0144,.006,.004,.0008,0x416d85);
    }
    stamp(box,x+.018,ground+.015,z-.016,.002,.025,.002,0xc39570);
    stamp(orb,x+.018,ground+.030,z-.016,.009,.013,.009,0x8dc982);
    stamp(orb,x-.017,ground+.014,z+.016,.007,.006,.007,0xb4d67c);
    plots++;
  }
  // Hejaz neighbourhoods use warm coral plaster and projecting timber window screens.
  let westPlots=0;
  for(const [name,place] of Object.entries(LY.PLANS.west.places))for(let i=0;i<36;i++){
    const a=i*2.39996,r=.076+Math.floor(i/12)*.026,x=place.at[0]+Math.cos(a)*r,z=place.at[1]+Math.sin(a)*r;
    if(x<window.VisionRegions.coastW(z)+.015||!LY.decorAllowed(x,z,.018,.020,true))continue;
    if(Object.values(window.VisionScenicSites||{}).some(s=>s.x!=null&&Math.hypot(x-s.x,z-s.z)<s.r+.020))continue;
    const h=.018+(i%4)*.006,colour=name==='taif'?0xe9b4bb:[0xf1d0a9,0xe7c0a4,0xb5d4ca][i%3];
    stamp(orb,x+.004,ground+.001,z+.004,.015,.0005,.014,0xb6a080);
    stamp(box,x,ground+.003,z,.022,.006,.023,0xffecd3);
    stamp(box,x,ground+.006+h/2,z,.015,h,.014,colour);
    stamp(box,x,ground+.008+h,z,.017,.003,.016,0xffedcf);
    for(let row=0;row<2;row++){
      const yy=ground+.011+row*.010;if(yy>ground+h+.004)continue;
      stamp(box,x,yy,z+.008,.009,.006,.003,0x725341);
      for(let j=-2;j<=2;j++)stamp(box,x+j*.0015,yy,z+.0097,.00045,.005,.0004,0xbc946b);
    }
    stamp(box,x+.009,ground+.014,z-.007,.0015,.02,.0015,0xb38e6a);
    stamp(orb,x+.009,ground+.026,z-.007,.006,.008,.006,name==='taif'?0xd788a3:0x89ba83);westPlots++;
  }
  let southPlots=0;
  for(const [name,place] of Object.entries(LY.PLANS.south.places))for(let i=0;i<48;i++){
    const angle=i*2.39996,r=.083+Math.floor(i/16)*.030,x=place.at[0]+Math.cos(angle)*r,z=place.at[1]+Math.sin(angle)*r;
    if(x<window.VisionRegions.coastW(z)+.016||!LY.decorAllowed(x,z,.020,.022,true))continue;
    if(Object.values(window.VisionScenicSites||{}).some(s=>s.x!=null&&Math.hypot(x-s.x,z-s.z)<s.r+.020))continue;
    const h=.023+i%4*.005,colour=name==='najran'?0xcfa67f:name==='abha'?0xd7c5a2:0xe6c1a2;
    stamp(orb,x+.005,ground+.001,z+.006,.016,.0005,.016,0x9b956f);
    stamp(box,x,ground+.004,z,.026,.008,.024,0xa8bd83);
    stamp(box,x,ground+.008+h/2,z,.016,h,.015,colour);
    for(let row=0;row<3;row++){
      const yy=ground+.012+row*.008;stamp(box,x,yy,z+.0078,.017,.0009,.0005,0xfff3d5);
      for(const dx of [-.004,.004])stamp(box,x+dx,yy+.002,z+.008,.002,.003,.0005,0x386770);
    }
    for(const dx of [-.006,0,.006])stamp(box,x+dx,ground+.008+h,z+.006,.002,.003,.002,0xfff0cf);
    stamp(orb,x+.011,ground+.025,z-.008,.006,.010,.006,name==='abha'?0x6fa58a:0x96bb70);southPlots++;
  }
  let eastPlots=0;
  for(const [name,place] of Object.entries(LY.PLANS.east.places))for(let i=0;i<44;i++){
    const a=i*2.39996,r=place.r+.032+Math.floor(i/15)*.025,x=place.at[0]+Math.cos(a)*r,z=place.at[1]+Math.sin(a)*r;
    if(x>window.VisionRegions.coastE(z)-.015||!LY.decorAllowed(x,z,.020,.022,true))continue;
    if(Object.values(window.VisionScenicSites||{}).some(s=>s.x!=null&&Math.hypot(x-s.x,z-s.z)<s.r+.020))continue;
    const h=.024+i%4*.007,colour=[0x8ec8c8,0xe3b98b,0xb4c9da,0xebcb99][i%4];
    stamp(orb,x+.005,ground+.001,z+.005,.017,.0005,.016,0xb6a080);
    stamp(box,x,ground+.004,z,.023,.008,.023,0xe8dab9);stamp(box,x,ground+.008+h/2,z,.016,h,.016,colour);
    stamp(box,x,ground+.010+h,z,.018,.004,.018,0xfff1d8);stamp(box,x,ground+.013+h,z,.012,.002,.010,0x548eac);
    for(let row=0;row<3;row++)for(const dx of [-.004,.004])stamp(box,x+dx,ground+.016+row*.008,z+.0083,.003,.004,.0005,0x466879);
    stamp(orb,x+.009,ground+.023,z-.009,.006,.011,.006,0x8db56d);eastPlots++;
  }
  let northwestPlots=0;
  const tabuk=LY.PLANS.northwest.places.tabuk.at;
  for(let iz=0;iz<13;iz++)for(let ix=0;ix<13;ix++){
    const x=tabuk[0]+(ix-6)*.021,z=tabuk[1]+(iz-6)*.021;
    if(!LY.decorAllowed(x,z,.010,.014,true)||(ix+iz)%3===0)continue;
    stamp(box,x,ground+.003,z,.017,.006,.017,0xf0dfbd);
    stamp(box,x,ground+.010,z,.012,.014,.012,(ix+iz)%2?0x93cfc9:0xeab689);
    stamp(box,x,ground+.018,z,.014,.002,.014,0xfff2db);
    stamp(box,x,ground+.012,z+.0063,.008,.005,.0008,0x527d8d);
    stamp(orb,x+.006,ground+.012,z-.006,.003,.005,.003,0x8fb676);northwestPlots++;
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colours,3));geo.computeBoundingSphere();
  const architecture=new T.Mesh(geo,new T.MeshBasicMaterial({vertexColors:true}));root.add(architecture);
  // Rounded clouds: one cheap instanced draw, gently drifting across the national map.
  const cloudOrb=orb.clone(),cloudColour=[];
  for(let i=0;i<cloudOrb.attributes.normal.count;i++){const ny=cloudOrb.attributes.normal.getY(i);const shade=.67+.30*Math.max(0,ny);cloudColour.push(shade,shade*.98,Math.min(1,shade*1.04));}
  cloudOrb.setAttribute('color',new T.Float32BufferAttribute(cloudColour,3));
  const clouds=new T.InstancedMesh(cloudOrb,new T.MeshBasicMaterial({color:0xfffaf4,vertexColors:true}),72),m=new T.Matrix4(),q=new T.Quaternion(),v=new T.Vector3();
  const cloudSeeds=[];
  for(let i=0;i<12;i++){
    const x=-4.7+(i%4)*3.1+Math.sin(i*4.7)*.7,z=-4.1+Math.floor(i/4)*3.5+Math.cos(i*3.3)*.8;
    cloudSeeds.push([x,z]);
  }
  root.add(clouds);
  const mist=new T.InstancedMesh(cloudOrb,new T.MeshBasicMaterial({color:0xe7f1ee,vertexColors:true,transparent:true,opacity:.76,depthWrite:false}),18);
  root.add(mist);
  const jubail=D.projects.find(p=>p.id==='eastern'),pumpjacks=[];
  for(const dx of [.024,.041,.055]){
    const pivot=new T.Group();pivot.position.set(jubail.x+dx,ground+.020,jubail.z-.045);
    const beam=new T.Mesh(box,new T.MeshBasicMaterial({color:0x7b949b}));beam.scale.set(.015,.0018,.002);pivot.add(beam);
    const head=new T.Mesh(orb,new T.MeshBasicMaterial({color:0xe48457}));head.scale.set(.0025,.003,.002);head.position.x=.007;pivot.add(head);
    const weight=new T.Mesh(box,new T.MeshBasicMaterial({color:0x435d6a}));weight.scale.set(.004,.003,.003);weight.position.x=-.006;pivot.add(weight);
    root.add(pivot);pumpjacks.push(pivot);
  }
  const steam=new T.InstancedMesh(cloudOrb,new T.MeshBasicMaterial({color:0xf5faf4,vertexColors:true,transparent:true,opacity:.26,depthWrite:false}),12);root.add(steam);
  // King Fahd's Fountain: rising water droplets and a drifting spray crown offshore of Jeddah.
  const fountain=new T.InstancedMesh(orb,new T.MeshBasicMaterial({color:0xc7f6fb}),64);
  const jeddah=LY.PLANS.west.places.jeddah.at,fz=jeddah[1]-.05,fx=window.VisionRegions.coastW(fz)-.02;
  root.add(fountain);
  // Friendly solar-powered airships, with contrasting fins and suspended cabins.
  const ships=[];
  for(const name of ['Riyadh','Jeddah','Dammam']){
    const city=D.cities.find(c=>c.name===name);if(!city)continue;
    const ship=new T.Group(),mat=new T.MeshBasicMaterial({color:0xffecd3});
    const hull=new T.Mesh(orb,mat);hull.scale.set(.036,.016,.017);ship.add(hull);
    const cabin=new T.Mesh(box,new T.MeshBasicMaterial({color:0x319dba}));cabin.scale.set(.018,.006,.011);cabin.position.y=-.019;ship.add(cabin);
    const fin=new T.Mesh(cone,new T.MeshBasicMaterial({color:0xf2a56e}));fin.scale.set(.009,.015,.007);fin.position.set(-.023,.013,0);ship.add(fin);
    root.add(ship);ships.push({ship,x:city.x,z:city.z});
  }
  window.__visionCosmetics={plots,westPlots,southPlots,eastPlots,northwestPlots,clouds:12,highlandMist:3,pumpjacks:3,airships:ships.length,fountain:'King Fahd’s Fountain'};
  const lift=window.__visionNeomClay,cableCars=[];
  if(lift)for(let i=0;i<4;i++){
    const car=new T.Group();
    const body=new T.Mesh(box,new T.MeshBasicMaterial({color:i%2?0xf7ba72:0x78d9d7}));body.scale.set(.006,.005,.004);car.add(body);
    const glass=new T.Mesh(box,new T.MeshBasicMaterial({color:0x345e70}));glass.scale.set(.0062,.002,.0042);glass.position.y=.001;car.add(glass);
    const hanger=new T.Mesh(box,new T.MeshBasicMaterial({color:0xf9efdc}));hanger.scale.set(.0005,.005,.0005);hanger.position.y=.005;car.add(hanger);
    root.add(car);cableCars.push(car);
  }
  window.__visionCosmetics.cableCars=cableCars.length;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {pass(p){root.visible=p==='main';},update(t,dist,night){
    const time=reduced?12:t*.001;
    architecture.visible=!(window.__visionCountryOverview&&dist>6);
    // Clouds fade out before close inspection, preserving the playable surface.
    clouds.visible=dist>3.8&&!window.__visionKingdom;
    let k=0;for(let i=0;i<cloudSeeds.length;i++)for(let j=0;j<6;j++){
      const [x,z]=cloudSeeds[i];v.set(.20+(j%3)*.065,.11+(j%2)*.06,.16);
      m.compose(new T.Vector3(x+Math.sin(time*.035+i)*.45+(j%3-.8)*.18,.65+Math.sin(i)*.12+(j%2)*.065,z+(Math.floor(j/3)-.5)*.18),q,v);clouds.setMatrixAt(k++,m);
    }clouds.instanceMatrix.needsUpdate=true;
    mist.visible=dist>1.0&&!(window.__visionCountryOverview&&dist>6);
    for(let i=0;i<18;i++){
      const cluster=Math.floor(i/6),j=i%6;v.set(.037+j%3*.008,.014,.025);
      m.compose(new T.Vector3(-1.65+cluster*.19+(j%3)*.033+Math.sin(time*.05+cluster)*.025,.08+cluster*.015,2.69+cluster*.21+Math.floor(j/3)*.025),q,v);mist.setMatrixAt(i,m);
    }mist.instanceMatrix.needsUpdate=true;
    cableCars.forEach((car,i)=>{const phase=(time*.035+i/4)%1,t=phase<.5?phase*2:2-phase*2;car.position.set(lift.liftA[0]+(lift.liftB[0]-lift.liftA[0])*t,ground+.071-Math.sin(t*Math.PI)*.005,lift.liftA[1]+(lift.liftB[1]-lift.liftA[1])*t);});
    pumpjacks.forEach((pivot,i)=>{pivot.rotation.z=Math.sin(time*1.25+i*.7)*.27;});
    for(let i=0;i<12;i++){
      const phase=(i%4/4+time*.18)%1,k=Math.floor(i/4);v.set(.003+phase*.006,.0025+phase*.004,.003+phase*.005);
      m.compose(new T.Vector3(jubail.x+.014+k*.014+phase*.006,ground+.036+phase*.035,jubail.z+.042+Math.sin(time*.2+k)*phase*.003),q,v);steam.setMatrixAt(i,m);
    }steam.instanceMatrix.needsUpdate=true;
    for(let i=0;i<64;i++){
      const phase=(i/64+time*.32)%1,angle=i*2.39996,spread=.001+phase*phase*.012;
      v.set(.0011+phase*.0008,.0025+phase*.001,.0011+phase*.0008);
      m.compose(new T.Vector3(fx+Math.cos(angle)*spread+phase*phase*.008,-.19+Math.sin(phase*Math.PI)*.17,fz+Math.sin(angle)*spread),q,v);fountain.setMatrixAt(i,m);
    }fountain.instanceMatrix.needsUpdate=true;
    ships.forEach(({ship,x,z},i)=>{ship.visible=dist>.65;ship.position.set(x+Math.cos(time*.06+i*2)*.28,ground+.20+Math.sin(time*.5+i)*.01,z+Math.sin(time*.06+i*2)*.20);ship.rotation.y=-time*.06-i*2;});
    root.traverse(o=>{if(o.material?.color){o.userData.baseColour??=o.material.color.clone();o.material.color.copy(o.userData.baseColour).multiplyScalar(1-night*.45);}});
    // Vertex-coloured architecture uses white as its material multiplier.
  }};
};
