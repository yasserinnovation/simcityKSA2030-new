(() => {
  'use strict';

  const D = window.VISION_DATA;
  const canvas = document.getElementById('world');
  const gl = canvas.getContext('webgl', {antialias:true, alpha:false});
  if (!gl) {
    document.body.innerHTML = '<div style="padding:40px;color:#153f38;background:#9edee2;font-family:sans-serif">WebGL is required to run Vision Nexus 2030. Try the latest Chrome or Edge with hardware acceleration switched on.</div>';
    return;
  }

  /* ------------------------------------------------------------------ *
   * Geography: real lon/lat -> world. North is -z, east is +x, so the  *
   * default camera (south of the target, looking north) shows a map    *
   * that reads correctly: Red Sea on the left, Arabian Gulf on the right.
   * ------------------------------------------------------------------ */
  const PJ = D.projection, KX = PJ.scale * Math.cos(PJ.lat0 * Math.PI / 180), KZ = PJ.scale;
  const geo = (lon, lat) => [(lon - PJ.lon0) * KX, -(lat - PJ.lat0) * KZ];
  const ungeo = (x, z) => [x / KX + PJ.lon0, -z / KZ + PJ.lat0];

  const ANCHOR_SPREAD = 3.4;
  const cityByName = {};
  for (const c of D.cities) { [c.x, c.z] = geo(c.lon, c.lat); cityByName[c.name] = c; }
  // Positions, footprints and marker pads come from layout.js: Riyadh uses an illustrative district plan (not survey
  // geography); every project owns a clear footprint that decoration never enters.
  const LY = window.VisionLayout;
  // p.cl is the engine's own cluster key (the simulation keeps reading p.anchor unchanged): every project drawn in the
  // Riyadh plan groups under Riyadh at Kingdom zoom.
  for (const p of D.projects) { const q = LY.projects[p.id]; p.x = q.x; p.z = q.z; p.foot = q.r; p.pad = q.pad; p.ribbon = q.ribbon; p.cl = q.cl || (q.illustrative ? 'Riyadh' : p.anchor); }
  const CORE_ID = LY.RIYADH_CORE.id;   // downtown skyline: clickable place (focuses the Riyadh planning view), not a project
  const PLACE_IDS = Object.keys(LY.places || {});   // cities and districts on the regional plans (click -> place card)
  const PBYIDX = [null, ...D.projects.map(p => p.id), CORE_ID, ...PLACE_IDS], PIDX = Object.fromEntries(PBYIDX.map((id, i) => [id, i]).filter(([id]) => id));
  for (const r of Object.values(D.regions)) [r.x, r.z] = geo(r.lon, r.lat);
  // The Riyadh planning view is north-up and frames the whole district plan (presentation only; data.js is unchanged).
  { const [x, z] = LY.R(.03, -.06); Object.assign(D.regions.riyadh, {x, z, az:0, el:1.02, dist:3.35, fitWidth:true}); }
  // Every regional plan is framed north-up the same way (regions.js cameras).
  for (const [k, v] of Object.entries(LY.REGION_VIEWS || {})) if (D.regions[k]) Object.assign(D.regions[k], {x:v.camera.x, z:v.camera.z, az:0, el:1.02, dist:v.camera.dist, fitWidth:true});
  const P = id => D.projects.find(p => p.id === id);
  const C = name => cityByName[name];
  const pt = w => typeof w === 'string' ? [C(w).x, C(w).z] : geo(w[0], w[1]);

  const saudi = D.saudi.map(([lo, la]) => geo(lo, la));
  const neighbours = D.neighbours.map(poly => poly.map(([lo, la]) => geo(lo, la)));

  // Heights
  const SEA = -0.19, NEI = -0.15, G = -0.12;

  /* ----------------------------- math ------------------------------- */
  const M4 = {
    perspective(fov, aspect, near, far) {
      const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
      return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
    },
    lookAt(eye, target, up = [0,1,0]) {
      let zx=eye[0]-target[0], zy=eye[1]-target[1], zz=eye[2]-target[2];
      let l=Math.hypot(zx,zy,zz)||1; zx/=l; zy/=l; zz/=l;
      let xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
      l=Math.hypot(xx,xy,xz)||1; xx/=l; xy/=l; xz/=l;
      const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
      return new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
        -(xx*eye[0]+xy*eye[1]+xz*eye[2]), -(yx*eye[0]+yy*eye[1]+yz*eye[2]), -(zx*eye[0]+zy*eye[1]+zz*eye[2]), 1]);
    },
    multiply(a, b) {
      const o = new Float32Array(16);
      for (let c=0;c<4;c++) for (let r=0;r<4;r++) o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
      return o;
    },
    transform(m, p) {
      const [x,y,z] = p;
      return [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14], m[3]*x+m[7]*y+m[11]*z+m[15]];
    }
  };
  function mulberry32(a){return()=>{let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  const rng = mulberry32(2030);
  function pip(x, z, poly) {
    let c = false;
    for (let i=0, j=poly.length-1; i<poly.length; j=i++) {
      const [xi,zi]=poly[i], [xj,zj]=poly[j];
      if ((zi>z)!==(zj>z) && x < (xj-xi)*(z-zi)/(zj-zi)+xi) c=!c;
    }
    return c;
  }
  const inSaudi = (x, z) => pip(x, z, saudi);
  const onAnyLand = (x, z) => inSaudi(x, z) || neighbours.some(n => pip(x, z, n));
  const signedArea = poly => { let a=0; for (let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];a+=p[0]*q[1]-q[0]*p[1];} return a/2; };

  // Ear-clipping triangulation for simple (possibly concave) polygons.
  function triangulate(poly) {
    const pts = signedArea(poly) < 0 ? poly.slice().reverse() : poly.slice();
    const idx = pts.map((_, i) => i), tris = [];
    const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
    const inside = (p,a,b,c) => cross(a,b,p)>=0 && cross(b,c,p)>=0 && cross(c,a,p)>=0;
    let guard = 0;
    while (idx.length > 3 && guard++ < 10000) {
      let clipped = false;
      for (let i=0; i<idx.length; i++) {
        const ia=idx[(i+idx.length-1)%idx.length], ib=idx[i], ic=idx[(i+1)%idx.length];
        const a=pts[ia], b=pts[ib], c=pts[ic];
        if (cross(a,b,c) <= 1e-9) continue;
        let ok = true;
        for (const j of idx) { if (j===ia||j===ib||j===ic) continue; if (inside(pts[j],a,b,c)) { ok=false; break; } }
        if (!ok) continue;
        tris.push([a,b,c]); idx.splice(i,1); clipped = true; break;
      }
      if (!clipped) break;
    }
    if (idx.length >= 3) for (let i=1;i<idx.length-1;i++) tris.push([pts[idx[0]],pts[idx[i]],pts[idx[i+1]]]);
    return {tris, ccw: pts};
  }

  /* --------------------------- shaders ------------------------------ */
  function shader(type, src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  function program(vs, fs){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const PREC = hp && hp.precision > 0 ? 'precision highp float;' : 'precision mediump float;';
  const FOG = `
    uniform vec3 uTint; uniform float uNight;
    float cloudShade(vec2 p, float tm){ float n=sin(p.x*.8+tm*.035)*sin(p.y*1.05-tm*.025)+.6*sin(p.x*.43-p.y*.57+tm*.02); return 1.0-.30*smoothstep(.55,1.15,n); }
    vec3 applyAtmos(vec3 c, float w){
      float f=clamp((w-uDist*.95)/(uDist*1.7),0.,1.);
      vec3 sky=mix(mix(vec3(.64,.86,.96),vec3(.10,.14,.30),uNight),uTint,uStorm*.75);
      c=mix(c,sky,f*.6); c=mix(c,uTint*.9,uStorm*.34); return c; }`;
  // Lit, shadow-receiving mesh shader: sun + sky/ground hemisphere + soft PCF shadows + contact darkening.
  const meshProgram = program(`
    attribute vec3 aPosition; attribute vec3 aColor; attribute vec3 aNormal;
    uniform mat4 uVP; uniform mat4 uLightVP; uniform vec3 uOffset;
    varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld; varying vec4 vLight; varying float vW;
    void main(){ vec3 w=aPosition+uOffset; vWorld=w; vec4 p=uVP*vec4(w,1.0); gl_Position=p; vW=p.w; vColor=aColor; vNormal=aNormal; vLight=uLightVP*vec4(w,1.0); }
  `, PREC + `
    uniform sampler2D uShadow; uniform vec3 uSun; uniform vec3 uEye; uniform float uStorm; uniform float uDist;
    uniform float uShadowOn; uniform float uTexel; uniform float uGlow; uniform float uGround; uniform float uTime;
    varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld; varying vec4 vLight; varying float vW;
    ` + FOG + `
    float unpack(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }
    float shadowAt(float ndl){
      vec3 s=vLight.xyz/vLight.w*0.5+0.5;
      if(uShadowOn<0.5||s.x<0.0||s.x>1.0||s.y<0.0||s.y>1.0||s.z>1.0) return 1.0;
      float bias=0.0012+0.0025*(1.0-ndl), sum=0.0;
      for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++){
        float d=unpack(texture2D(uShadow, s.xy+vec2(float(i),float(j))*uTexel*1.3));
        sum += (s.z-bias>d) ? 0.0 : 1.0; }
      return sum/9.0;
    }
    void main(){
      vec3 N=normalize(vNormal); vec3 V=normalize(uEye-vWorld); if(dot(N,V)<0.0) N=-N;
      float ndl=max(dot(N,uSun),0.0); float sh=mix(1.0, shadowAt(ndl), 1.0-uStorm*.6);
      vec3 hemi=mix(vec3(.66,.52,.40), vec3(.68,.80,.98), N.y*0.5+0.5);
      float ao = N.y>0.8 ? 1.0 : mix(0.70,1.0,clamp((vWorld.y-uGround)/0.06,0.0,1.0));
      vec3 sunCol=vec3(1.0,.94,.80);
      float cl=uGlow>0.3?1.0:cloudShade(vWorld.xz,uTime);
      vec3 c=vColor*(hemi*(0.58+uGlow)*ao + sunCol*ndl*sh*0.72*cl);
      vec3 H=normalize(uSun+V); c+=sunCol*pow(max(dot(N,H),0.0),40.0)*0.10*sh;
      c+=vec3(1.0,.85,.6)*pow(1.0-max(dot(N,V),0.0),3.0)*0.08;           // warm rim light
      float l=dot(c,vec3(.299,.587,.114)); c=mix(vec3(l),c,1.18);           // toy-like saturation
      c=mix(c, c*vec3(.26,.32,.58)+vec3(.012,.018,.05)+vColor*uGlow*.6, uNight);   // dusk to night
      gl_FragColor=vec4(applyAtmos(c,vW),1.0);
    }
  `);
  // Depth-only pass for the sun shadow map (packed into RGBA for WebGL1).
  const depthProgram = program(`
    attribute vec3 aPosition; uniform mat4 uLightVP; uniform vec3 uOffset;
    void main(){ gl_Position=uLightVP*vec4(aPosition+uOffset,1.0); }
  `, PREC + `
    void main(){ vec4 e=fract(vec4(1.0,255.0,65025.0,16581375.0)*gl_FragCoord.z); e-=e.yzww*vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0); gl_FragColor=e; }
  `);
  // Animated sea: reef-to-deep colour from distance-to-shore, moving foam line and sun glints.
  const waterProgram = program(`
    attribute vec3 aPosition; attribute float aShore; uniform mat4 uVP;
    varying vec3 vWorld; varying float vShore; varying float vW;
    void main(){ vec4 p=uVP*vec4(aPosition,1.0); gl_Position=p; vW=p.w; vWorld=aPosition; vShore=aShore; }
  `, PREC + `
    uniform float uTime; uniform vec3 uSun; uniform vec3 uEye; uniform float uStorm; uniform float uDist;
    varying vec3 vWorld; varying float vShore; varying float vW;
    ` + FOG + `
    void main(){
      float s=vShore, t=uTime;
      float fade=clamp(1.6-vW/(uDist*0.9),0.0,1.0);   // fade fine ripples with distance to avoid shimmer
      float w1=sin(vWorld.x*11.0+t*1.2)*sin(vWorld.z*9.0-t*0.9);
      float w2=(sin((vWorld.x-vWorld.z)*29.0+t*2.1)*0.5+sin((vWorld.x+vWorld.z*1.3)*41.0-t*2.6)*0.35)*fade;
      vec3 N=normalize(vec3((w1+w2)*0.07,1.0,(w1-w2)*0.06));
      vec3 reef=vec3(.58,.96,.86), shallow=vec3(.22,.86,.88), mid=vec3(.08,.64,.88), deep=vec3(.05,.44,.76);
      vec3 c=mix(reef,shallow,smoothstep(0.0,0.05,s)); c=mix(c,mid,smoothstep(0.05,0.22,s)); c=mix(c,deep,smoothstep(0.22,0.75,s));
      c*=0.96+0.06*w1*fade;
      float band=0.012+0.008*sin(t*1.6+vWorld.x*14.0+vWorld.z*9.0);
      float foam=smoothstep(0.012,0.0,abs(s-band))+smoothstep(0.008,0.0,s)*0.6;
      c=mix(c,vec3(1.0),clamp(foam,0.0,1.0)*0.75);
      vec3 V=normalize(uEye-vWorld); vec3 H=normalize(uSun+V);
      float spec=pow(max(dot(N,H),0.0),90.0)*fade; c+=vec3(1.0,.97,.88)*spec*0.8*(1.0-uStorm);
      c*=mix(0.88,1.0,(cloudShade(vWorld.xz,t)-0.70)/0.30);
      float fres=pow(1.0-max(dot(N,V),0.0),4.0); c=mix(c,vec3(.75,.90,1.0),fres*0.25);
      c=mix(c, c*vec3(.22,.30,.55)+vec3(.0,.02,.06), uNight);
      gl_FragColor=vec4(applyAtmos(c,vW),1.0);
    }
  `);
  const pickProgram = program(`
    attribute vec3 aPosition; attribute vec3 aColor; uniform mat4 uVP; varying vec3 vC;
    void main(){ gl_Position=uVP*vec4(aPosition,1.0); vC=aColor; }
  `, `
    precision mediump float; varying vec3 vC; void main(){ gl_FragColor=vec4(vC,1.0); }
  `);
  const pointProgram = program(`
    attribute vec3 aPosition; attribute vec3 aColor; attribute float aSize; uniform mat4 uVP; uniform float uScale; varying vec3 vColor;
    void main(){ vec4 p=uVP*vec4(aPosition,1.0); gl_Position=p; gl_PointSize=aSize*uScale*clamp(13.0/p.w,0.55,2.4); vColor=aColor; }
  `, `
    precision mediump float; uniform float uRound; varying vec3 vColor;
    void main(){ if(uRound>.5){ vec2 q=gl_PointCoord-.5; float d=dot(q,q); if(d>.25)discard; gl_FragColor=vec4(vColor*(1.08-d*.9),smoothstep(.25,.12,d)); } else gl_FragColor=vec4(vColor,.9); }
  `);

  /* --------------------------- geometry ----------------------------- */
  const Geo = () => ({p:[], c:[], n:[]});
  const mesh = Geo(), detailMesh = Geo(), cloudGeo = Geo(), lines = {p:[], c:[]};
  const DETAIL_DIST = 7.2;   // decorative detail appears as the camera approaches a region; the Kingdom overview stays clean
  let target = mesh, lineTarget = lines;
  const norm3 = v => { const l=Math.hypot(v[0],v[1],v[2])||1; return [v[0]/l,v[1]/l,v[2]/l]; };
  function pushV(v,col,n){ target.p.push(v[0],v[1],v[2]); target.c.push(col[0],col[1],col[2]); target.n.push(n[0],n[1],n[2]); }
  function addTri(a,b,c,col){
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const n=norm3([uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx]); pushV(a,col,n); pushV(b,col,n); pushV(c,col,n);
  }
  function addTriN(a,b,c,ca,cb,cc,na,nb,nc){ pushV(a,ca,na); pushV(b,cb,nb); pushV(c,cc,nc); }
  const shade = (col, k) => [Math.min(1,col[0]*k), Math.min(1,col[1]*k), Math.min(1,col[2]*k)];
  const mix = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
  function addQuad(a,b,c,d,col){addTri(a,b,c,col);addTri(a,c,d,col);}
  function addBox(x,y,z,w,h,d,col,rot=0){
    const cs=Math.cos(rot), sn=Math.sin(rot);
    const P2=(dx,dz)=>[x+dx*cs-dz*sn, z+dx*sn+dz*cs];
    const c4=[P2(-w/2,-d/2),P2(w/2,-d/2),P2(w/2,d/2),P2(-w/2,d/2)];
    const v=[...c4.map(q=>[q[0],y,q[1]]), ...c4.map(q=>[q[0],y+h,q[1]])];
    addQuad(v[4],v[5],v[6],v[7],shade(col,1.04));
    addQuad(v[0],v[1],v[5],v[4],col); addQuad(v[1],v[2],v[6],v[5],col); addQuad(v[2],v[3],v[7],v[6],col); addQuad(v[3],v[0],v[4],v[7],col);
  }
  function addCylinder(x,y,z,r,h,col,n=10,r2=r){
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
      const p0=[x+ca*r,y,z+sa*r],p1=[x+cb*r,y,z+sb*r],p2=[x+cb*r2,y+h,z+sb*r2],p3=[x+ca*r2,y+h,z+sa*r2],na=[ca,0,sa],nb=[cb,0,sb];
      addTriN(p0,p1,p2,col,col,col,na,nb,nb); addTriN(p0,p2,p3,col,col,col,na,nb,na);
      addTri([x,y+h,z],p3,p2,shade(col,1.04));
    }
  }
  function addCone(x,y,z,r,h,col,n=9){
    const top=[x,y+h,z];
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,na=norm3([Math.cos(a)*h,r,Math.sin(a)*h]),nb=norm3([Math.cos(b)*h,r,Math.sin(b)*h]),nt=norm3([Math.cos((a+b)/2)*h,r,Math.sin((a+b)/2)*h]);
      addTriN([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],top,col,col,shade(col,1.06),na,nb,nt);}
  }
  function addOcta(x,y,z,r,col){
    const top=[x,y+r,z],bot=[x,y-r,z],v=[[x+r,y,z],[x,y,z+r],[x-r,y,z],[x,y,z-r]];
    for(let i=0;i<4;i++){addTri(top,v[i],v[(i+1)%4],col);addTri(bot,v[(i+1)%4],v[i],col);}
  }
  // Unit icosphere (1 subdivision) for rounded toy-like foliage, clouds and domes.
  const ICO = (() => {
    const t=(1+Math.sqrt(5))/2, V=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(norm3);
    const F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
    const out=[], mid=(a,b)=>norm3([(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2]);
    for(const [i,j,k] of F){const a=V[i],b=V[j],c=V[k],ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);out.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}
    return out;
  })();
  function addBlob(x,y,z,rx,ry,rz,col,flatBottom=-.45,topLight=.2){
    for(const tri of ICO){
      const P=[],Nn=[],Cc=[];
      for(const v of tri){ const vy=Math.max(v[1],flatBottom); P.push([x+v[0]*rx,y+vy*ry,z+v[2]*rz]); Nn.push(norm3([v[0]/rx,v[1]/ry,v[2]/rz])); Cc.push(shade(col,1-topLight*.5+topLight*v[1])); }
      addTriN(P[0],P[1],P[2],Cc[0],Cc[1],Cc[2],Nn[0],Nn[1],Nn[2]);
    }
  }
  function addDome(x,y,z,r,col){ addBlob(x,y,z,r,r,r,col,0,.1); }
  function addDisc(x,y,z,r,col,n=18){for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;addTriN([x,y,z],[x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],col,col,col,[0,1,0],[0,1,0],[0,1,0]);}}
  function addRidge(x,z,len,w,h,rot,col){
    const cs=Math.cos(rot),sn=Math.sin(rot),P2=(dx,dz)=>[x+dx*cs-dz*sn,z+dx*sn+dz*cs];
    const a=P2(-len/2,-w/2),b=P2(len/2,-w/2),c=P2(len/2,w/2),d=P2(-len/2,w/2),e=P2(-len/2,0),f=P2(len/2,0);
    const A=[a[0],G,a[1]],B=[b[0],G,b[1]],Cc=[c[0],G,c[1]],Dd=[d[0],G,d[1]],E=[e[0],G+h,e[1]],F=[f[0],G+h,f[1]];
    addQuad(A,B,F,E,col);addQuad(Dd,E,F,Cc,col);addTri(A,E,Dd,col);addTri(B,Cc,F,col);
  }
  function addMound(x,z,rx,rz,h,rot,col,n=9){
    const cs=Math.cos(rot),sn=Math.sin(rot);
    const q=(a,e)=>{const u=Math.cos(e)*Math.cos(a)*rx,v=Math.cos(e)*Math.sin(a)*rz;return [x+u*cs-v*sn,G+Math.sin(e)*h,z+u*sn+v*cs];};
    const nq=(a,e)=>{const u=Math.cos(e)*Math.cos(a)/rx,v=Math.cos(e)*Math.sin(a)/rz;return norm3([u*cs-v*sn,Math.sin(e)/h,u*sn+v*cs]);};
    const rings=[0,.55,1.1,Math.PI/2];
    for(let j=0;j<3;j++)for(let i=0;i<n;i++){const a0=i/n*6.283,a1=(i+1)/n*6.283,e0=rings[j],e1=rings[j+1];
      addTriN(q(a0,e0),q(a1,e0),q(a1,e1),col,col,col,nq(a0,e0),nq(a1,e0),nq(a1,e1));
      if(j<2)addTriN(q(a0,e0),q(a1,e1),q(a0,e1),col,col,col,nq(a0,e0),nq(a1,e1),nq(a0,e1));}
  }
  function addRoof(x,y,z,w,h,d,col){
    const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],d0=[x-w/2,y,z+d/2],r1=[x,y+h,z-d/2],r2=[x,y+h,z+d/2];
    addTri(a,b,r1,col);addTri(d0,r2,c,col);addQuad(a,r1,r2,d0,col);addQuad(b,c,r2,r1,col);
  }
  function addLine(a,b,col){lineTarget.p.push(...a,...b);lineTarget.c.push(...col,...col);}
  function addRing(cx,cy,cz,r,col,seg=32){for(let i=0;i<seg;i++){const a=i/seg*Math.PI*2,b=(i+1)/seg*Math.PI*2;addLine([cx+Math.cos(a)*r,cy,cz+Math.sin(a)*r],[cx+Math.cos(b)*r,cy,cz+Math.sin(b)*r],col);}}
  function addStrip(a,b,w,y,col){
    const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,nx=-dz/l*w,nz=dx/l*w,up=[0,1,0];
    const A=[a[0]+nx,y,a[1]+nz],B=[a[0]-nx,y,a[1]-nz],Cc=[b[0]-nx,y,b[1]-nz],Dd=[b[0]+nx,y,b[1]+nz];
    addTriN(A,B,Cc,col,col,col,up,up,up); addTriN(A,Cc,Dd,col,col,col,up,up,up);
  }
  // Link between two points with a beam of thin boxes (cranes, masts).
  function addBeam(a,b,t,col){ const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],L=Math.hypot(dx,dz);
    if(L<1e-4){ addBox(a[0],Math.min(a[1],b[1]),a[2],t,Math.abs(dy),t,col); return; }
    const rot=Math.atan2(dz,dx); addBox((a[0]+b[0])/2,Math.min(a[1],b[1])-t/2,(a[2]+b[2])/2,L,Math.abs(dy)+t,t,col,rot); }

  /* ------------------------------ props ------------------------------ */
  const s = .75; // global prop scale
  const TREE_GREENS=[[.36,.74,.24],[.30,.66,.22],[.48,.80,.26],[.26,.60,.28]];
  function addTree(x,z,k=1,col){ // chunky round "toy" tree
    const q=k*s, c=col||TREE_GREENS[Math.floor(rng()*TREE_GREENS.length)];
    addCylinder(x,G,z,.011*q,.05*q,[.52,.33,.18],6,.008*q);
    addBlob(x,G+.075*q,z,.045*q,.042*q,.045*q,c);
    addBlob(x+.026*q,G+.064*q,z+.012*q,.032*q,.03*q,.032*q,shade(c,1.08));
    addBlob(x-.022*q,G+.066*q,z+.016*q,.03*q,.028*q,.03*q,shade(c,.94));
    addBlob(x+.004*q,G+.105*q,z-.004*q,.028*q,.026*q,.028*q,mix(c,[.72,.90,.36],.35));
  }
  function addGhaf(x,z,k=1){ // flat-topped desert acacia
    const q=k*s, c=[.40,.62,.24]; addCylinder(x,G,z,.009*q,.05*q,[.50,.36,.22],5,.006*q);
    addBlob(x,G+.058*q,z,.048*q,.026*q,.044*q,c,-.5,.35); addBlob(x+.02*q,G+.07*q,z-.008*q,.028*q,.018*q,.026*q,shade(c,1.12),-.5,.3);
  }
  function addPalm(x,z,k=1){ // curved trunk + drooping fronds
    const q=k*s, h=.15*q, lean=rng()*6.283, lx=Math.cos(lean)*.018*q, lz=Math.sin(lean)*.018*q;
    const seg=4; let px=x,pz=z,py=G;
    for(let i=0;i<seg;i++){const t=(i+1)/seg,nx=x+lx*t*t,nz=z+lz*t*t,ny=G+h*t;addBeam([px,py,pz],[nx,ny,nz],.012*q*(1-.25*t),[.62,.44,.24]);px=nx;pz=nz;py=ny;}
    const top=[px,py,pz], greens=[[.20,.62,.24],[.28,.70,.26],[.16,.54,.22]];
    for(let i=0;i<8;i++){
      const a=i/8*6.283+rng()*.3, ca=Math.cos(a), sa=Math.sin(a), L=.085*q, w=.016*q, col=greens[i%3];
      const mid=[top[0]+ca*L*.5, top[1]+.012*q, top[2]+sa*L*.5], tip=[top[0]+ca*L, top[1]-.03*q, top[2]+sa*L];
      const side=[-sa*w, 0, ca*w];
      const m1=[mid[0]+side[0],mid[1],mid[2]+side[2]], m2=[mid[0]-side[0],mid[1],mid[2]-side[2]];
      addTri(top,m1,mid,col); addTri(top,mid,m2,shade(col,.9)); addTri(m1,tip,mid,col); addTri(mid,tip,m2,shade(col,.9));
    }
    addBlob(top[0],top[1],top[2],.012*q,.01*q,.012*q,[.45,.32,.16],-1,0);
  }
  // Saudi flat-roof house with parapet, door, windows and the classic rooftop water tank.
  function addHouse(x,z,k,col,rot=0){
    const w=.075*k, h=.055*k, d=.065*k, pt=.01*k;
    addBox(x,G,z,w,h,d,col,rot);
    const trim=shade(col,.92), cs=Math.cos(rot), sn=Math.sin(rot), off=(dx,dz)=>[x+dx*cs-dz*sn,z+dx*sn+dz*cs];
    for(const [dx,dz,ww,dd] of [[0,-d/2,w,pt*.5],[0,d/2,w,pt*.5],[-w/2,0,pt*.5,d],[w/2,0,pt*.5,d]]){const [px,pz]=off(dx,dz);addBox(px,G+h,pz,ww,pt,dd,trim,rot);}
    const [dxp,dzp]=off(0,d/2+.0015); addBox(dxp,G,dzp,w*.22,h*.55,.003,[.55,.36,.20],rot);
    for(const wx of [-.3,.3]){const [wxp,wzp]=off(w*wx,d/2+.0015);addBox(wxp,G+h*.55,wzp,w*.16,h*.2,.003,[.32,.46,.56],rot);}
    if(rng()>.55){const [tx,tz]=off(w*.22,-d*.2);addCylinder(tx,G+h,tz,.009*k,.016*k,[.97,.97,.95],8);}
  }
  function addTower(x,z,w,h,col,crown){
    addBox(x,G,z,w,h,w,col);
    const band=shade(col,1.22); for(let y=.035;y<h-.01;y+=.035) addBox(x,G+y,z,w*1.04,.004,w*1.04,band);
    addBox(x,G+h,z,w*.7,.012,w*.7,shade(col,.9));
    if(crown) addCone(x,G+h+.012,z,w*.25,w*1.2,crown,6);
  }
  function addCrane(x,z,k=1,col=[.98,.74,.16]){
    const H=.30*k, t=.006*k;
    addBox(x,G,z,.03*k,.012*k,.03*k,[.45,.45,.48]);
    addBox(x,G,z,t*1.4,H,t*1.4,col);
    addBox(x+.025*k,G+H,z,.19*k,t,t,col);
    addBox(x-.05*k,G+H-.012*k,z,.025*k,.014*k,.02*k,[.55,.55,.58]);
    addBox(x,G+H,z,.012*k,.02*k,.012*k,[.30,.52,.72]);
    addLine([x+.09*k,G+H,z],[x+.09*k,G+H*.45,z],[.3,.3,.3]);
  }
  function addSolar(x,z,cols,rows,sp=.05){for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const px=x+(i-cols/2)*sp,pz=z+(j-rows/2)*sp*.8;addBox(px,G+.002,pz,sp*.84,.006,sp*.56,[.20,.42,.78]);addBox(px,G+.008,pz,sp*.78,.0015,sp*.5,[.42,.66,.95]);}}
  const turbines=[];
  function addTurbine(x,z,k=1){const h=.2*k;addCylinder(x,G,z,.006*k,h,[.96,.96,.94],6,.003*k);addBox(x,G+h-.004*k,z,.02*k,.01*k,.01*k,[.94,.94,.92]);turbines.push([x,G+h,z+.007*k,k]);}
  function addCloud(x,y,z,k){
    const n=5+Math.floor(rng()*3);
    for(let i=0;i<n;i++){const a=i/n*6.283,r=(.12+rng()*.08)*k,ox=Math.cos(a)*.16*k*(0.6+rng()*.6),oz=Math.sin(a)*.09*k;
      addBlob(x+ox,y+rng()*.04*k,z+oz,r,r*.8,r,[1,1,1],-.35,.25);}
    addBlob(x,y+.07*k,z,.2*k,.16*k,.16*k,[1,1,1],-.3,.2);
  }
  // Keep-out zones so generic city blocks don't sit on top of landmarks.
  const keepOut = [];
  const blocked = (x,z) => keepOut.some(([kx,kz,kr]) => Math.hypot(x-kx,z-kz) < kr);
  function grove(lon,lat,n,r,kind){const [cx,cz]=geo(lon,lat),prev=target;target=detailMesh;for(let i=0;i<n;i++){const a=rng()*6.283,d=Math.sqrt(rng())*r,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;if(!inSaudi(x,z)||inAnyPlan(x,z)||!LY.decorAllowed(x,z,.055,.05,true))continue;kind==='palm'?addPalm(x,z,.7+rng()*.5):addTree(x,z,.7+rng()*.5,[.22+rng()*.08,.56+rng()*.14,.26]);}target=prev;}
  // Trees that belong to a project (parks, green belts): inside its own footprint, clear of its marker pad.
  function ownGrove(p,n,r,kind='tree'){for(let i=0,k=0;i<n*4&&k<n;i++){const a=rng()*6.283,d=Math.sqrt(rng())*r,x=p.x+Math.cos(a)*d,z=p.z+Math.sin(a)*d;if(Math.hypot(x-p.pad[0],z-p.pad[1])<.05)continue;k++;kind==='palm'?addPalm(x,z,.6+rng()*.3):addTree(x,z,.6+rng()*.4,[.22+rng()*.08,.56+rng()*.14,.26]);}}

  /* ----------------------------- terrain ---------------------------- */
  const blobs = [ // [lon, lat, rLon, rLat, color, weight]
    [44.2,25.2,3.2,3.0,[.98,.85,.60],.55],             // Najd plateau
    [51.0,20.3,4.6,2.3,[1.0,.66,.34],.9],              // Rub' al Khali
    [41.3,28.4,2.3,1.0,[.94,.60,.36],.85],             // An Nafud
    [45.8,26.0,.55,1.4,[.95,.63,.37],.7],[47.0,23.8,.55,1.3,[.95,.63,.37],.7],[47.9,21.9,.55,.9,[.95,.63,.37],.6], // Ad Dahna
    [38.1,26.3,1.1,1.5,[.72,.56,.43],.75],[39.6,23.4,1.0,1.6,[.73,.57,.44],.7],[40.6,21.0,.9,1.1,[.71,.56,.44],.7], // Hejaz
    [36.2,28.2,1.0,.9,[.74,.58,.46],.7],
    [42.6,18.7,1.0,1.3,[.46,.70,.30],.9],[42.9,17.3,.5,.6,[.66,.70,.42],.7],       // Aseer, Jazan plain
    [40.0,25.5,.6,.9,[.46,.38,.33],.55],[40.0,22.9,.35,.8,[.50,.41,.34],.5],       // Harrat lava fields
    [49.9,25.6,.55,1.4,[.93,.86,.68],.6]                                         // Eastern coastal flats
  ];
  function landColor(x, z) {
    const [lon, lat] = ungeo(x, z);
    let c = [.99,.81,.50];
    for (const [bl, bt, rl, rt, col, w] of blobs) {
      const d = ((lon-bl)/rl)**2 + ((lat-bt)/rt)**2;
      if (d < 6) c = mix(c, col, w*Math.exp(-d));
    }
    const n = Math.sin(x*7.1+z*3.3)*Math.sin(z*6.2-x*2.1)*.035 + Math.sin(x*21+z*17)*.012;
    return shade(c, 1+n);
  }

  // Layered diorama cliffs: sandy lip on top, warm rock below. Normals face outward.
  function walls(poly, top, bottom, lip, rock) {
    const ccw = signedArea(poly) < 0 ? poly.slice().reverse() : poly, mid = top-(top-bottom)*.35;
    for (let i=0;i<ccw.length;i++){
      const a=ccw[i], b=ccw[(i+1)%ccw.length], dx=b[0]-a[0], dz=b[1]-a[1], l=Math.hypot(dx,dz)||1, n=[dz/l,0,-dx/l];
      for (const [y0,y1,col] of [[mid,top,lip],[bottom-.2,mid,rock]]) {
        const A=[a[0],y0,a[1]],B=[b[0],y0,b[1]],Cc=[b[0],y1,b[1]],Dd=[a[0],y1,a[1]];
        addTriN(A,B,Cc,col,col,col,n,n,n); addTriN(A,Cc,Dd,col,col,col,n,n,n);
      }
    }
  }

  function buildTerrain(){
    // Neighbouring land — warm but muted so the Kingdom reads first
    for (const n of neighbours) {
      for (const [a,b,c] of triangulate(n).tris) addTri([a[0],NEI,a[1]],[c[0],NEI,c[1]],[b[0],NEI,b[1]],[.84,.72,.56]);
      walls(n, NEI, SEA, [.93,.84,.64], [.66,.52,.38]);
    }
    // Kingdom base
    for (const [a,b,c] of triangulate(saudi).tris) addTri([a[0],G,a[1]],[c[0],G,c[1]],[b[0],G,b[1]],[.98,.80,.50]);
    walls(saudi, G, SEA, [.99,.88,.62], [.80,.56,.34]);
    // Colour-varied surface grid over the interior
    const xs=saudi.map(p=>p[0]), zs=saudi.map(p=>p[1]), step=.09;
    const minX=Math.min(...xs), maxX=Math.max(...xs), minZ=Math.min(...zs), maxZ=Math.max(...zs);
    const cache = new Map(), col = (i,j) => { const k=i+','+j; if(!cache.has(k)) cache.set(k, landColor(minX+i*step, minZ+j*step)); return cache.get(k); };
    const Y = G + .002;
    for (let i=0; minX+i*step < maxX; i++) for (let j=0; minZ+j*step < maxZ; j++) {
      const x0=minX+i*step, z0=minZ+j*step, x1=x0+step, z1=z0+step;
      if (!(inSaudi(x0,z0)&&inSaudi(x1,z0)&&inSaudi(x1,z1)&&inSaudi(x0,z1))) continue;
      const v=[[x0,Y,z0],[x1,Y,z0],[x1,Y,z1],[x0,Y,z1]], c=[col(i,j),col(i+1,j),col(i+1,j+1),col(i,j+1)];
      for (const [a,b,d] of [[0,1,2],[0,2,3]]) for (const q of [a,b,d]) { mesh.p.push(...v[q]); mesh.c.push(...c[q]); mesh.n.push(0,1,0); }
    }
    // Golden national border
    for (let i=0;i<saudi.length;i++){const a=saudi[i],b=saudi[(i+1)%saudi.length];addStrip(a,b,.011,G+.005,[1,.78,.26]);addDisc(a[0],G+.005,a[1],.011,[1,.78,.26],8);}

    // Hejaz & Sarawat mountains along the west
    const spine=[[42.95,17.2],[42.6,18.2],[41.9,19.2],[41.1,20.3],[40.5,21.2],[40.0,22.4],[39.6,23.6],[38.9,24.8],[38.1,25.9],[37.2,27.0],[36.2,28.1],[35.4,28.8]];
    for (let i=0;i<spine.length-1;i++) for (let k=0;k<11;k++) {
      const t=rng(), lon=spine[i][0]+(spine[i+1][0]-spine[i][0])*t+(rng()-.5)*.9, lat=spine[i][1]+(spine[i+1][1]-spine[i][1])*t+(rng()-.5)*.6;
      const [x,z]=geo(lon,lat); if(!inSaudi(x,z)||inAnyPlan(x,z)) continue;   // regional plans draw their own mountains
      const green=lat<20.2, c=green?mix([.42,.60,.32],[.58,.54,.40],rng()*.5):mix([.76,.56,.40],[.68,.52,.40],rng());
      const r=.05+rng()*.06, hh=.05+rng()*.08; addBlob(x,G,z,r*1.1,hh*.55,r,c,0,.25); addCone(x+(rng()-.5)*r*.3,G+hh*.2,z,r*.62,hh*.8,shade(c,1.06),7); if(green&&rng()>.4) addTree(x+r*.6,z+r*.5,.7);
    }
    // Dune fields: Rub' al Khali, Nafud, Dahna
    const inPlan=(x,z)=>Math.abs(x-LY.RIYADH_CORE.x)<1.02&&Math.abs(z-LY.RIYADH_CORE.z+.05)<1.02||LY.inReserved(x,z,.08);   // the Riyadh plan and City Builder district stay free of dunes
    const nearCity=(x,z)=>inPlan(x,z)||inAnyPlan(x,z)||D.cities.some(c=>Math.hypot(c.x-x,c.z-z)<(c.capital?.5:.3));
    const dune=(x,z,rot)=>{if(!inSaudi(x,z)||nearCity(x,z))return;addMound(x,z,.09+rng()*.07,.05+rng()*.02,.009+rng()*.008,rot+(rng()-.5)*.3,shade(landColor(x,z),1.02+rng()*.03),8);};
    const dunes=(lon0,lon1,lat0,lat1,n,rot)=>{for(let i=0;i<n;i++){const [x,z]=geo(lon0+rng()*(lon1-lon0),lat0+rng()*(lat1-lat0));dune(x,z,rot);}};
    dunes(47.5,55.0,18.8,22.2,110,.45); dunes(39.8,43.2,27.6,29.3,45,.1);
    const dahna=[[44.8,28.0],[46.0,26.5],[47.2,24.7],[47.8,22.8],[48.4,21.0]];
    for(let i=0;i<30;i++){const k=Math.floor(rng()*(dahna.length-1)),t=rng(),[x,z]=geo(dahna[k][0]+(dahna[k+1][0]-dahna[k][0])*t+(rng()-.5)*.35,dahna[k][1]+(dahna[k+1][1]-dahna[k][1])*t+(rng()-.5)*.2);dune(x,z,1.1);}
    // Harrat lava patches
    for (const [lon,lat,r] of [[39.9,25.4,.16],[40.3,25.9,.12],[40.0,22.9,.12],[39.2,26.8,.1]]){const [x,z]=geo(lon,lat);if(inAnyPlan(x,z,r))continue;addDisc(x,G+.003,z,r,[.66,.56,.48],16);}
    // Centre-pivot farms (Qassim, Wadi ad-Dawasir, Tabuk, Al-Jawf)
    for (const [lon,lat,n] of [[43.8,26.1,10],[45.2,20.4,9],[36.9,28.6,6],[39.4,29.8,6]]) for(let i=0;i<n;i++){const [x,z]=geo(lon+(rng()-.5)*.9,lat+(rng()-.5)*.6);if(inSaudi(x,z)&&!inAnyPlan(x,z))addDisc(x,G+.004,z,.022+rng()*.012,rng()>.3?[.45,.70,.32]:[.62,.72,.36],10);}
    // Oases and greenery
    grove(49.55,25.42,26,.22,'palm'); grove(43.95,26.35,10,.14,'palm'); grove(39.65,24.5,10,.14,'palm'); grove(37.95,26.66,8,.1,'palm');
    grove(42.5,18.4,70,.36,'tree'); grove(42.3,19.3,30,.24,'tree'); grove(43.1,17.7,20,.2,'tree'); grove(40.45,21.2,10,.14,'tree');
    for (let i=0;i<160;i++){const [x,z]=geo(38+rng()*14,18+rng()*11);if(inSaudi(x,z)&&!blocked(x,z)&&!inPlan(x,z)&&!inAnyPlan(x,z)&&!D.cities.some(c=>Math.hypot(c.x-x,c.z-z)<.2))addGhaf(x,z,.7+rng()*.5);}
    for (const c of D.cities) if (c.name !== 'Riyadh' && !LY.cityPlan(c.name)) grove(...ungeo(c.x,c.z),10+Math.round(c.size*14),c.size*.42+.08,c.palette==='green'?'tree':'palm');
    // Neighbouring mountains (muted)
    const ridge=(pts,n,col)=>{for(let i=0;i<n;i++){const k=Math.floor(rng()*(pts.length-1)),t=rng(),lon=pts[k][0]+(pts[k+1][0]-pts[k][0])*t+(rng()-.5)*.5,lat=pts[k][1]+(pts[k+1][1]-pts[k][1])*t+(rng()-.5)*.5,[x,z]=geo(lon,lat);if(!onAnyLand(x,z)||inSaudi(x,z))continue;{const r=.05+rng()*.05,hh=.04+rng()*.06;addBlob(x,NEI,z,r,hh*.5,r,col,0,.2);addCone(x,NEI+hh*.2,z,r*.6,hh*.7,col,6);}}};
    ridge([[48.2,33.5],[50.5,31.0],[52.5,29.3],[55.5,28.0],[58.0,27.5]],40,[.74,.63,.50]);  // Zagros
    ridge([[56.2,26.1],[56.8,24.2],[58.3,23.3],[59.3,22.4]],16,[.72,.61,.49]);             // Hajar
    ridge([[43.6,13.4],[44.0,14.8],[44.2,16.0]],14,[.70,.62,.48]);                        // Yemen highlands
    ridge([[33.8,28.6],[34.1,28.0],[33.6,27.0],[34.8,24.8],[36.3,22.0],[37.4,19.0]],26,[.76,.64,.51]); // Sinai & Red Sea hills
    ridge([[35.5,30.2],[35.7,31.6]],8,[.75,.64,.51]);
    // Small islands
    for (const [lon,lat,r] of [[50.55,26.05,.07],[41.9,16.8,.05],[42.2,16.6,.04]]){const [x,z]=geo(lon,lat);addCylinder(x,SEA,z,r,.012,[.90,.82,.60],10);}   // Red Sea resort islands come from the NEOM / Northwest plan
  }

  function polyline(names){return names.map(pt);}
  function buildNetworks(){
    for (const r of LY.CITY_ROADS) { const pts=r.pts; for(let i=0;i<pts.length-1;i++){ addStrip(pts[i],pts[i+1],r.w/2,G+.006,r.minor?[.56,.50,.44]:[.40,.38,.37]); addLine([pts[i][0],G+.009,pts[i][1]],[pts[i+1][0],G+.009,pts[i+1][1]],[.98,.92,.62]); } }
    for (const pts of LY.intercity) { for(let i=0;i<pts.length-1;i++){addStrip(pts[i],pts[i+1],.016,G+.005,[.52,.46,.40]);addLine([pts[i][0],G+.007,pts[i][1]],[pts[i+1][0],G+.007,pts[i+1][1]],[.98,.86,.52]);} }
    for (const pts of LY.rails) { for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz),nx=-dz/l*.02,nz=dx/l*.02;
      addLine([a[0]+nx,G+.008,a[1]+nz],[b[0]+nx,G+.008,b[1]+nz],[.46,.34,.70]);addLine([a[0]-nx,G+.008,a[1]-nz],[b[0]-nx,G+.008,b[1]-nz],[.46,.34,.70]);} }
  }

  // Riyadh planning map. Every piece is placed from layout.js so models, labels, markers and click targets share one plan.
  function ownRibbonTrees(p, step, off, k){ const pts=p.ribbon.pts; for (let i=1;i<pts.length;i++){ const a=pts[i-1], b=pts[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]), nx=-(b[1]-a[1])/L, nz=(b[0]-a[0])/L;
      for (let t=step/2;t<L;t+=step) for (const s of [-1,1]) { const x=a[0]+(b[0]-a[0])*t/L+nx*off*s, z=a[1]+(b[1]-a[1])*t/L+nz*off*s;
        if (LY.cityRoadDist(x,z) < .03 || Math.hypot(x-p.pad[0],z-p.pad[1]) < .045) continue; addTree(x,z,k,[.22+rng()*.08,.56+rng()*.14,.26]); } } }
  function polyStrip(pts, w, y, col){ for (let i=1;i<pts.length;i++) addStrip(pts[i-1],pts[i],w,y,col); }
  function polyLine(pts, y, col, off=0){ for (let i=1;i<pts.length;i++){ const a=pts[i-1], b=pts[i], L=Math.hypot(b[0]-a[0],b[1]-a[1])||1, nx=-(b[1]-a[1])/L*off, nz=(b[0]-a[0])/L*off; addLine([a[0]+nx,y,a[1]+nz],[b[0]+nx,y,b[1]+nz],col); } }
  // ★ Downtown: the split-top tower just east of King Fahd Road, Al Faisaliah to the west, and glass towers stepping down
  // to the edge on a few downtown streets. King Fahd Road runs clear through the middle; both icons keep clear air around them.
  const KC = {dx:.045, dz:-.01, h:.42};                                   // split-top tower: position and height (label sits above it)
  function riyadhDowntown(ry, rn){
    keepOut.push([ry.x,ry.z,LY.RIYADH_CORE.r]);
    const kx=ry.x+KC.dx, kz=ry.z+KC.dz, H=KC.h, y0=H*.56, n=28, glass=[.50,.72,.82], edge=[.78,.90,.95];
    addBox(kx,G,kz,.074,.012,.052,[.80,.80,.78]);                                                         // podium
    for (let i=0;i<n;i++){ const ya=H*i/n, yb=H*(i+1)/n, ym=(ya+yb)/2, t=ym/H;
      const W=.027*(1-.32*t*t), D=.019*(1-.3*t);                                                            // outer half-width tapers towards the top
      if (ym<y0) { addBox(kx,G+.012+ya,kz,2*W,yb-ya,2*D,i%4===3?edge:glass); continue; }
      const g=.021*Math.sqrt((ym-y0)/(H-y0));                                                               // the parabolic opening widens upwards
      if (W-g < .0025) continue;
      for (const sg of [-1,1]) addBox(kx+sg*(W+g)/2,G+.012+ya,kz,W-g,yb-ya,2*D,i%4===3?edge:glass); }
    { const yb=y0+(H-y0)*.66, W=.027*(1-.32*((yb)/H)**2); addBox(kx,G+.012+yb,kz,2*W-.003,.008,.014,[.92,.95,.97]); }   // skybridge across the opening
    const fx=ry.x-.052, fz=ry.z+.03;                                                                        // Al Faisaliah: slim square pyramid, gold globe, spire
    addBox(fx,G,fz,.05,.01,.05,[.80,.80,.78]); addCone(fx,G+.01,fz,.03,.29,[.58,.72,.78],4); addOcta(fx,G+.215,fz,.017,[.96,.76,.26]); addCylinder(fx,G+.29,fz,.002,.035,[.85,.85,.85],4);
    // downtown streets (they explain the blocks) and towers stepping down from the centre
    lineTarget=lines; for (const o of [-.078,-.052,.052,.078]) { addStrip([ry.x+o,ry.z-.1],[ry.x+o,ry.z+.1],.003,G+.004,[.62,.60,.58]); addStrip([ry.x-.1,ry.z+o],[ry.x-.024,ry.z+o],.003,G+.004,[.62,.60,.58]); addStrip([ry.x+.024,ry.z+o],[ry.x+.1,ry.z+o],.003,G+.004,[.62,.60,.58]); }
    const pal=[[.48,.70,.86],[.40,.62,.74],[.62,.76,.84],[.70,.74,.78],[.52,.80,.82],[.80,.76,.66]];
    for (let gx=-5; gx<=5; gx++) for (let gz=-5; gz<=5; gz++) { const x=ry.x+gx*.021+(rn()-.5)*.004, z=ry.z+gz*.021+(rn()-.5)*.004, d=Math.hypot(x-ry.x,z-ry.z);
      if (d > .11 || Math.abs(x-ry.x) < .024) continue;                                   // King Fahd Road runs clear through downtown
      if (Math.abs(x-kx) < .045 && Math.abs(z-kz) < .04) continue;                          // clear air around the split-top
      if (Math.abs(x-fx) < .032 && Math.abs(z-fz) < .032) continue;                         // and around Al Faisaliah
      if ([-.078,-.052,.052,.078].some(o => Math.abs(x-ry.x-o) < .006 || Math.abs(z-ry.z-o) < .006)) continue;   // not on a street
      const k=Math.pow(1-d/.12,1.1), h=.04+.27*k*(.5+rn()*.5), w=.012+rn()*.007, col=pal[Math.floor(rn()*pal.length)];
      if (h > .12 && rn() > .5) { addBox(x,G,z,w+.004,h*.55,w+.004,col); addTower(x,z,w*.8,h,shade(col,1.08),rn()>.5?[.88,.92,.96]:null); }   // setback tower
      else addTower(x,z,w,h,col,rn()>.72?[.85,.9,.95]:null); }
  }
  // Expo 2030: its own paved, hedged parcel south of the airport — a large golden ring pavilion (lattice ribs, crown ring,
  // glass dome) on a central plaza, six exhibition pavilions around it, gardens between, and a footpath to the airport.
  function riyadhExpo(rn, ks){
    const ex=P('expo'), R0=ex.foot; keepOut.push([ex.x,ex.z,R0]);
    addDisc(ex.x,G+.003,ex.z,R0-.002,[.86,.82,.72],32); addRing(ex.x,G+.006,ex.z,R0-.004,[.34,.58,.30],40);                      // parcel paving + hedge line
    addDisc(ex.x,G+.004,ex.z,.046,[.93,.90,.82],28);                                                                           // central plaza
    const gold=[.95,.73,.24], deep=[.82,.56,.16];
    addCylinder(ex.x,G,ex.z,.036,.008,[.96,.93,.86],28);                                                                        // plinth
    for (let i=0;i<28;i++){ const a=i/28*6.283, r=.034; addBox(ex.x+Math.cos(a)*r,G+.008,ex.z+Math.sin(a)*r,.0035,.03,.0035,i%2?gold:deep,-a); }   // lattice ribs
    for (let i=0;i<36;i++){ const a=(i+.5)/36*6.283; addBox(ex.x+Math.cos(a)*.0355,G+.038,ex.z+Math.sin(a)*.0355,.0075,.006,.0065,gold,-a); }   // open crown ring
    addDome(ex.x,G+.008,ex.z,.024,[.72,.84,.86]); addCylinder(ex.x,G+.008,ex.z,.03,.002,[.93,.90,.82],24);                    // glass dome in an open court
    for (let i=0;i<6;i++){ const a=i/6*6.283+.52, x=ex.x+Math.cos(a)*.058, z=ex.z+Math.sin(a)*.058;                               // exhibition pavilions
      if (Math.hypot(x-ex.pad[0],z-ex.pad[1])<.03) continue;
      if (i%3===0) { addBox(x,G,z,.018,.012,.018,[.95,.95,.96],a); addBox(x,G+.012,z,.02,.003,.02,[.30,.62,.78],a); }
      else if (i%3===1) { addCylinder(x,G,z,.01,.01,[.94,.94,.95],12); addDome(x,G+.01,z,.01,[.55,.78,.72]); }
      else { addBox(x,G,z,.022,.009,.012,[.93,.90,.84],a+1.57); addBox(x,G+.009,z,.024,.003,.014,[.86,.52,.34],a+1.57); } }
    for (let i=0;i<6;i++){ const a=i/6*6.283; const x=ex.x+Math.cos(a)*.047, z=ex.z+Math.sin(a)*.047;                              // gardens between pavilions
      addDisc(x,G+.005,z,.008,[.46,.72,.38],10); addTree(x,z,.22,[.24,.58,.30]); }
    addStrip([ex.x-.012,ex.z-R0],[ks.x-.012,ks.z+ks.foot],.004,G+.006,[.90,.84,.66]);                                           // footpath to the airport
  }
  // King Salman International Airport: broad and low — two long runways with centre lines and thresholds, a parallel
  // taxiway with connectors, an apron, a long terminal with four piers and a slim tower, and the Metro's terminal stop.
  function riyadhAirport(ks){
    keepOut.push([ks.x,ks.z,ks.foot]);
    const asphalt=[.30,.31,.33], taxi=[.44,.45,.47], apron=[.70,.71,.72], white=[.96,.96,.94];
    addDisc(ks.x,G+.002,ks.z,ks.foot-.004,[.82,.76,.62],32);                                                    // airfield ground
    for (const [dz, L] of [[-.075,.105],[-.02,.115]]) {                                                        // runways
      addStrip([ks.x-L,ks.z+dz],[ks.x+L,ks.z+dz],.011,G+.005,asphalt);
      for (let t=-L+.02;t<L-.02;t+=.022) addBox(ks.x+t+.006,G+.0062,ks.z+dz,.011,.0008,.0015,white);          // centre-line dashes
      for (const e of [-1,1]) for (let k=-2;k<=2;k++) addBox(ks.x+e*(L-.008),G+.0062,ks.z+dz+k*.004,.01,.0008,.002,white); }   // threshold bars
    addStrip([ks.x-.1,ks.z+.012],[ks.x+.1,ks.z+.012],.0045,G+.0055,taxi);                                    // parallel taxiway
    for (const t of [-.085,-.03,.03,.085]) { addStrip([ks.x+t,ks.z-.075],[ks.x+t,ks.z+.012],.003,G+.0056,taxi); addStrip([ks.x+t,ks.z+.012],[ks.x+t,ks.z+.03],.003,G+.0056,taxi); }
    addBox(ks.x,G+.002,ks.z+.042,.17,.004,.03,apron);                                                          // apron
    addBox(ks.x,G,ks.z+.068,.13,.014,.02,[.90,.92,.94]); addBox(ks.x,G+.014,ks.z+.068,.134,.004,.024,[.55,.72,.86]);   // terminal, blue roof
    for (const t of [-.045,-.015,.015,.045]) addBox(ks.x+t,G,ks.z+.047,.008,.008,.022,[.92,.93,.95]);         // piers to the apron
    addCylinder(ks.x+.075,G,ks.z+.06,.004,.05,[.90,.90,.92],8); addCylinder(ks.x+.075,G+.05,ks.z+.06,.009,.008,[.45,.62,.74],10);   // control tower
    const plane=(x,z,rot,k=1)=>{ addBox(x,G+.006,z,.024*k,.004,.005*k,white,rot); addBox(x,G+.007,z,.006*k,.002,.03*k,white,rot); addBox(x+Math.cos(rot)*.011*k,G+.008,z+Math.sin(rot)*.011*k,.003*k,.006,.011*k,white,rot); };
    for (const t of [-.045,-.015,.015,.045]) plane(ks.x+t,ks.z+.03,Math.PI/2,.85);                              // parked at the piers
    plane(ks.x-.05,ks.z-.075,0,1.1);                                                                            // one on the runway
    const me=LY.METRO_ROUTE[LY.METRO_ROUTE.length-1]; addBox(me[0],G,me[1],.02,.012,.012,[.95,.96,.98]); addBox(me[0],G+.012,me[1],.022,.003,.014,[.20,.42,.82]);   // Metro terminal stop
  }
  // King Salman Park: a bounded, designed landscape beside downtown — hedge edge, lawns in two greens, an irregular lake
  // with a bridge, looping paths, clumps of shade trees and a white pavilion; a planted promenade links it to downtown.
  function riyadhPark(pk, ry, rn){
    const R0=pk.foot-.004; keepOut.push([pk.x,pk.z,pk.foot]);
    addDisc(pk.x,G+.003,pk.z,R0,[.47,.72,.36],36); addRing(pk.x,G+.006,pk.z,R0,[.22,.46,.24],48);
    for (const [dx,dz,r,c] of [[-.03,-.03,.045,[.58,.80,.44]],[.035,-.02,.035,[.52,.76,.40]],[-.01,.04,.04,[.56,.79,.43]]]) addDisc(pk.x+dx,G+.004,pk.z+dz,r,c,24);   // lawns
    const lake=[[.02,.015,.024],[.04,.03,.018],[.005,.035,.014]]; for (const [dx,dz,r] of lake) addDisc(pk.x+dx,G+.005,pk.z+dz,r,[.30,.62,.84],20);
    addBox(pk.x+.022,G+.007,pk.z+.035,.006,.003,.03,[.92,.88,.78]);                                                     // footbridge over the lake
    lineTarget=lines; const loop=[]; for (let i=0;i<=40;i++){ const a=i/40*6.283, r=.07+.012*Math.sin(a*3); loop.push([pk.x+Math.cos(a)*r,pk.z+Math.sin(a)*r*.9]); }
    polyStrip(loop,.0025,G+.006,[.93,.87,.70]);                                                                          // loop path
    polyStrip([[pk.x-.09,pk.z+.01],[pk.x-.04,pk.z+.005],[pk.x,pk.z-.01],[pk.x+.03,pk.z-.05],[pk.x+.05,pk.z-.075]],.002,G+.006,[.93,.87,.70]);   // cross path
    addCylinder(pk.x-.045,G,pk.z+.035,.012,.006,[.96,.95,.92],14); addDome(pk.x-.045,G+.006,pk.z+.035,.011,[.97,.97,.95]);   // pavilion
    const clumps=[[-.055,-.05],[.0,-.075],[.06,-.055],[.075,.02],[.05,.07],[-.03,.075],[-.08,.02]];
    for (const [cx,cz] of clumps) for (let i=0;i<5;i++){ const x=pk.x+cx+(rn()-.5)*.03, z=pk.z+cz+(rn()-.5)*.025;
      if (Math.hypot(x-pk.x,z-pk.z) > R0-.008 || Math.hypot(x-pk.pad[0],z-pk.pad[1]) < .035) continue; addTree(x,z,.3+rn()*.22,[.18+rn()*.1,.50+rn()*.16,.24]); }
    const x0=ry.x+LY.RIYADH_CORE.r+.004, x1=pk.x-pk.foot+.004;                                                         // promenade to downtown
    addStrip([x0,pk.z],[x1,pk.z],.008,G+.005,[.52,.74,.40]); addStrip([x0,pk.z],[x1,pk.z],.002,G+.006,[.93,.87,.70]);
    for (let x=x0+.006; x<x1-.004; x+=.014) for (const sg of [-1,1]) addTree(x,pk.z+sg*.0065,.2,[.24,.56,.28]);
  }
  // Green Riyadh: a wide, continuous ecological corridor along a meandering river — wetlands, sandy banks, native
  // flat-canopy trees and palms, trails on both banks and footbridges — running east beyond the plan. Distinct from the park.
  function riyadhGreen(rn){
    const gr=P('greenriyadh'), hw=gr.ribbon.hw, pts=gr.ribbon.pts;
    polyStrip(pts,hw,G+.003,[.62,.74,.46]); polyStrip(pts,hw*.72,G+.004,[.52,.70,.38]);                                   // outer scrub, inner meadow
    for (const q of pts.slice(1,-1)) { addDisc(q[0],G+.003,q[1],hw,[.62,.74,.46],18); addDisc(q[0],G+.004,q[1],hw*.72,[.52,.70,.38],16); }   // rounded bends
    const mw=[]; for (let i=1;i<pts.length;i++) for (let t=0;t<1;t+=.125){ const x=pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t, z=pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t; mw.push([x, z+Math.sin(x*24)*.03]); }
    mw.push(pts[pts.length-1]);
    polyStrip(mw,.022,G+.0045,[.86,.80,.62]); polyStrip(mw,.014,G+.0055,[.26,.58,.82]);                                 // sandy banks, river
    for (let i=3;i<mw.length;i+=7) addDisc(mw[i][0],G+.005,mw[i][1]+(i%2?.028:-.028),.016,[.44,.70,.62],14);             // wetlands
    lineTarget=lines; polyLine(pts,G+.007,[.93,.86,.66],hw*.82); polyLine(pts,G+.007,[.93,.86,.66],-hw*.82);             // trails
    for (const i of [5,15,26,36]) if (mw[i]) { const a=mw[i-1], b=mw[i+1]||mw[i], rot=Math.atan2(b[1]-a[1],b[0]-a[0]); addBox(mw[i][0],G+.008,mw[i][1],.036,.003,.008,[.84,.70,.50],-rot+Math.PI/2); }   // footbridges
    for (let i=1;i<pts.length;i++){ const a=pts[i-1], b=pts[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]), nx=-(b[1]-a[1])/L, nz=(b[0]-a[0])/L;
      for (let t=.012;t<L;t+=.026) for (const sg of [-1,1]) { const off=hw*(.35+rn()*.4)*sg, x=a[0]+(b[0]-a[0])*t/L+nx*off, z=a[1]+(b[1]-a[1])*t/L+nz*off;
        if (LY.polyDist(x,z,mw) < .026 || Math.hypot(x-gr.pad[0],z-gr.pad[1]) < .04 || LY.cityRoadDist(x,z) < .02) continue;
        const r=rn(); if (r<.45) addGhaf(x,z,.45+rn()*.25); else if (r<.7) addPalm(x,z,.42+rn()*.15); else addTree(x,z,.3+rn()*.2,[.30+rn()*.08,.56+rn()*.1,.28]); } }
  }
  function buildRiyadh(){
    const ry=C('Riyadh'), rn=mulberry32(2030);
    riyadhDowntown(ry, rn);
    // Riyadh Metro: a broad curved canopy over King Fahd Road; blue rails around King Salman Park and north to the airport.
    const mt=P('metro'); addDisc(mt.x,G+.003,mt.z,.056,[.86,.84,.80],22);
    for (let i=0;i<=12;i++){ const a=Math.PI*i/12, x=mt.x+Math.cos(a)*.048, z=mt.z-.004+Math.sin(a)*.012; addBox(x,G+.026+Math.sin(a)*.006,z,.011,.005,.034,[.95,.97,.99]); }
    for (const dx of [-.046,.046]) addBox(mt.x+dx,G,mt.z,.005,.026,.03,[.78,.80,.86]);
    const MR=LY.METRO_ROUTE; polyStrip(MR,.0075,G+.008,[.93,.94,.96]); polyStrip(MR,.0055,G+.009,[.14,.30,.66]);          // trackbed with white edges
    for (const q of MR.slice(1,-1)) { addDisc(q[0],G+.008,q[1],.0075,[.93,.94,.96],12); addDisc(q[0],G+.009,q[1],.0055,[.14,.30,.66],12); }   // smooth bends
    lineTarget=lines; polyLine(MR,G+.0105,[.50,.80,1],.0022); polyLine(MR,G+.0105,[.50,.80,1],-.0022);
    for (const q of [MR[2], MR[5]]) { addBox(q[0],G,q[1],.02,.011,.012,[.95,.96,.98]); addBox(q[0],G+.011,q[1],.024,.003,.016,[.20,.42,.82]); }   // intermediate stations
    const pk=P('park'); riyadhPark(pk, ry, rn);
    // New Murabba: one monumental gold cube in a landscaped square, low buildings around it, clear space on every side.
    const mu=P('newmurabba'); keepOut.push([mu.x,mu.z,mu.foot]); addBox(mu.x,G+.002,mu.z,.15,.004,.15,[.62,.78,.48]); addBox(mu.x,G+.003,mu.z,.11,.004,.11,[.90,.86,.74]);
    addBox(mu.x,G,mu.z-.006,.084,.084,.084,[.88,.62,.20]); addBox(mu.x,G+.084,mu.z-.006,.086,.004,.086,[.99,.84,.40]);
    for (let k=1;k<4;k++) addBox(mu.x,G+k*.021,mu.z-.006+.0425,.086,.002,.002,[.99,.86,.46]);                // facade bands facing the camera
    for (let i=0;i<8;i++){ const a=i/8*6.283+.39; addBox(mu.x+Math.cos(a)*.086,G,mu.z+Math.sin(a)*.086,.018,.012,.018,[.93,.88,.76]); }
    // ROSHN: orderly low cream homes on shaded streets with planted avenues — far lower than the Mukaab and downtown.
    const rs=P('roshn'); keepOut.push([rs.x,rs.z,rs.foot]);
    for (let i=-2;i<=2;i++) for (let j=-2;j<=2;j++){ const x=rs.x+i*.03, z=rs.z+j*.03; if (Math.hypot(x-rs.x,z-rs.z)>.072 || Math.hypot(x-rs.pad[0],z-rs.pad[1])<.04) continue; addHouse(x,z,.32,[.96,.90,.74]); }
    for (let i=-2;i<=2;i++){ addTree(rs.x+i*.03,rs.z-.015,.28,[.24,.60,.30]); }
    const ks=P('ksip'); riyadhAirport(ks);
    riyadhExpo(rn, ks);
    // Diriyah: compact warm-earth heritage blocks and courtyards beside the wadi, an escarpment behind King Khalid Road.
    const dr=P('diriyah'); keepOut.push([dr.x,dr.z,dr.foot]);
    for (const [dx,dz,w,h] of [[0,0,.04,.035],[-.035,.012,.028,.028],[.034,.018,.03,.04],[-.018,-.036,.034,.026],[.03,-.03,.026,.03],[-.05,-.02,.02,.022],[.01,.042,.03,.024],[.052,-.004,.018,.03]])
      addBox(dr.x+dx,G,dr.z+dz,w,h,w*.9,[.72+rn()*.06,.47,.27]);
    polyStrip(LY.WADI,.022,G+.004,[.46,.70,.38]); polyStrip(LY.WADI,.009,G+.006,[.28,.60,.80]);
    { const prev=target; target=detailMesh; const W2=LY.WADI; for (let i=1;i<W2.length;i++){ const a=W2[i-1], b=W2[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]), nx=-(b[1]-a[1])/L, nz=(b[0]-a[0])/L;
        for (let t=.02;t<L;t+=.045) for (const s2 of [-1,1]) { const x=a[0]+(b[0]-a[0])*t/L+nx*.04*s2, z=a[1]+(b[1]-a[1])*t/L+nz*.04*s2; if (LY.decorAllowed(x,z,.03,.045,true)) addPalm(x,z,.5+rn()*.2); } } target=prev; }
    for (let z=-.85; z<=.12; z+=.07) { const x=ry.x-.79+Math.sin(z*7)*.015, zz=ry.z+z; if (LY.roadDist(x,zz) < .05) continue; addMound(x,zz,.05,.04,.045+rn()*.03,rn(),[.80,.56,.36],7); }
    // Sports Boulevard: one continuous planted ribbon with walking and cycling paths, a bridge over King Fahd Road and activity areas.
    const sp=P('sports'); polyStrip(sp.ribbon.pts,.026,G+.005,[.44,.72,.36]); lineTarget=lines; polyLine(sp.ribbon.pts,G+.008,[.93,.86,.66],.008); polyLine(sp.ribbon.pts,G+.008,[.86,.62,.52],-.008);
    ownRibbonTrees(sp,.035,.02,.32); addBox(ry.x,G+.012,sp.ribbon.pts[2][1],.03,.004,.05,[.90,.88,.84]);
    for (const t of [-.32,.12,.32]) addDisc(ry.x+t,G+.007,sp.ribbon.pts[0][1],.012,[.94,.52,.34],12);
    // Renewables: ordered solar rows and slim turbines on the outer north-west, with modest service tracks.
    const re=P('renewables'); keepOut.push([re.x,re.z,re.foot]); addSolar(re.x-.018,re.z-.005,6,4,.026); for (let i=0;i<3;i++) addTurbine(re.x+.066,re.z-.045+i*.04,.55);
    addLine([re.x-.09,G+.006,re.z+.045],[re.x+.09,G+.006,re.z+.045],[.86,.78,.60]); addLine([re.x+.045,G+.006,re.z-.07],[re.x+.045,G+.006,re.z+.07],[.86,.78,.60]);
    // Qiddiya: entertainment on stepped rocky terraces beyond the Tuwaiq cliffs.
    const qd=P('qiddiya'); keepOut.push([qd.x,qd.z,qd.foot]);
    addCylinder(qd.x,G,qd.z,.09,.012,[.80,.56,.36],18); addCylinder(qd.x-.01,G+.012,qd.z-.01,.066,.016,[.84,.60,.38],16); addCylinder(qd.x-.02,G+.028,qd.z-.02,.04,.012,[.88,.64,.40],14);
    addCylinder(qd.x-.02,G+.04,qd.z-.02,.026,.018,[.91,.37,.24],16);
    for (let i=1;i<18;i++){ const f=j=>[qd.x+.035+Math.cos(j/17*6.283)*.028,G+.02+Math.sin(j/17*6.283*2)*.02+.02,qd.z+.03+Math.sin(j/17*6.283)*.02]; addLine(f(i-1),f(i),[.92,.25,.62]); }
    addBox(qd.x+.05,G+.012,qd.z-.04,.02,.016,.02,[.95,.86,.52]); addBox(qd.x-.055,G+.012,qd.z+.03,.02,.014,.02,[.62,.72,.95]);
    // Tuwaiq escarpment: stepped cliffs between the city and Qiddiya (kept off roads and footprints).
    { const RG=LY.RIDGES; for (let i=1;i<RG.length;i++){ const a=RG[i-1], b=RG[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]), rot=Math.atan2(b[1]-a[1],b[0]-a[0]);
        for (let t=0;t<L;t+=.045){ const x=a[0]+(b[0]-a[0])*t/L, z=a[1]+(b[1]-a[1])*t/L; for (const [o,h] of [[0,.05],[.04,.034],[.08,.018]]) { const xx=x+Math.sin(rot)*o, zz=z-Math.cos(rot)*o;   // stepped terraces, highest on the city side
          if (!LY.decorAllowed(xx,zz,.02,.035)) continue; const hh=h+rn()*.008; addBox(xx,G,zz,.052,hh,.042,[.74+rn()*.05,.52,.34],-rot); addBox(xx,G+hh,zz,.046,.003,.036,[.84,.64,.44],-rot); } } } }
    riyadhGreen(rn);
    // Short access spurs join each district to its road (none cross another parcel).
    for (const [p, tz] of [[mu,-.48],[rs,-.48],[re,-.48]]) addStrip([p.x,p.z+p.foot],[p.x,ry.z+tz],.005,G+.006,[.60,.54,.46]);
    addStrip([dr.x+dr.foot,dr.z],[ry.x-.40,dr.z],.005,G+.006,[.60,.54,.46]);
    // Honest framing is added as a map label ("Illustrative district plan · not to scale").
  }
  // Riyadh's residential fabric. Inside the ring of named roads: flat, low city blocks between local streets (every
  // 0.09, meeting the main roads) — they explain the city's structure without standing up against the landmarks; a few
  // blocks near the centre carry small homes. Beyond the roads: a light scatter only. Everything keeps clear of parcels,
  // routes and the wadi.
  function riyadhBlocks(){
    const ry=C('Riyadh'), rn=mulberry32(77), prev=target, c=.045, S=2*c;
    const urban = (dx,dz) => dx > -.62 && dx < .8 && dz > -.46 && dz < .38;
    const open = (x,z,m) => LY.decorAllowed(x,z,m,.03) && LY.polyDist(x,z,LY.RIDGES) >= .09 && !LY.inReserved(x,z,.03);
    for (let i=-7;i<=9;i++) for (let j=-11;j<=9;j++) for (const vert of [true,false]) {                        // local streets
      const ax=vert?i*S:j*c, az=vert?j*c:i*S, bx=vert?ax:ax+c, bz=vert?az+c:az; if (!urban(ax,az)||!urban(bx,bz)) continue;
      const mx=ry.x+(ax+bx)/2, mz=ry.z+(az+bz)/2;
      if (!open(mx,mz,.02) || LY.cityRoadDist(mx,mz) < .012) continue;
      addStrip([ry.x+ax,ry.z+az],[ry.x+bx,ry.z+bz],.003,G+.0035,[.70,.66,.60]); }
    const sand=[[.86,.78,.64],[.83,.75,.61],[.88,.81,.68]];
    for (let i=-7;i<=8;i++) for (let j=-6;j<=5;j++) {                                                          // blocks between the streets
      const dx=(i+.5)*S, dz=(j+.5)*S, x=ry.x+dx, z=ry.z+dz, d=Math.hypot(dx,dz), h=S*.38;
      if (!urban(dx,dz) || rn() > .92-.4*d || ![[-h,-h],[h,-h],[-h,h],[h,h],[0,0]].every(([ox,oz]) => open(x+ox,z+oz,.02))) continue;
      addBox(x,G+.0015,z,S*.8,.004+.004*rn(),S*.8,sand[Math.floor(rn()*3)]);
      if (d < .42 && rn() < .35) { target=detailMesh; addHouse(x-.016,z+.012,.22,[.90,.84,.72],0); addHouse(x+.016,z-.012,.22,[.90,.84,.72],0); target=prev; } }
    target=detailMesh;
    for (let dx=-.82; dx<=.84; dx+=c) for (let dz=-.9; dz<=.86; dz+=c) {                                    // light scatter outside the roads
      const x=ry.x+dx+(rn()-.5)*.01, z=ry.z+dz+(rn()-.5)*.01;
      if (urban(dx,dz) || dx < -.72 || rn() > .08 || !open(x,z,.05)) continue;
      addHouse(x,z,.22+rn()*.04,[.86,.79,.66],0); }
    target=prev;
  }
  /* ------------------------------ regional plans ---------------------------- */
  // Eastern Province, Western Corridor, NEOM / Northwest and Southwest are drawn from their plans (regions.js via
  // layout.js): every landmark sits where its footprint and click target are, on land or on its island, with the plan's
  // own roads, railways and water. The builders below are small and shared; each region then composes its landmarks.
  const RPL = LY.PLANS || {};
  const inAnyPlan = (x, z, pad = .06) => !!LY.planAt(x, z, pad);
  const PLv = id => LY.places['place:' + id];
  const onLand = (x, z) => inSaudi(x, z);
  const openAt = (x, z, m = .01, rc = .018) => onLand(x, z) && LY.decorAllowed(x, z, m, rc);
  function scatterIn(cx, cz, r, n, rn, fn, test = openAt){ for (let i = 0, k = 0; i < n * 8 && k < n; i++) { const a = rn() * 6.283, d = Math.sqrt(rn()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (!test(x, z)) continue; k++; fn(x, z, k); } }
  const inCircle = (cx, cz, r) => (x, z) => Math.hypot(x - cx, z - cz) < r;
  const factory = (x, z, w, d, h, col, rot = 0) => { addBox(x, G, z, w, h, d, col, rot); addBox(x, G + h, z, w * .96, .003, d * .96, shade(col, .82), rot); };
  const tank = (x, z, r, h, col = [.92, .91, .88]) => { addCylinder(x, G, z, r, h, col, 12); addDome(x, G + h, z, r * .92, shade(col, 1.04)); };
  const stack = (x, z, h) => { addCylinder(x, G, z, .004, h, [.86, .85, .83], 6); addCylinder(x, G + h - .008, z, .0046, .007, [.86, .32, .26], 6); };
  // A quay / breakwater from the sea bed up to land level along a → b (half-width hw).
  const quay = (a, b, hw, col = [.74, .74, .72]) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); addBox((a[0] + b[0]) / 2, SEA, (a[1] + b[1]) / 2, L, G - SEA - .003, hw * 2, col, Math.atan2(dz, dx)); };
  const containers = (x, z, n, rot, rn) => { const cs = Math.cos(rot), sn = Math.sin(rot); for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * .011; addBox(x + o * cs, G - .003, z + o * sn, .009, .006 + (i % 3) * .003, .005, [[.86,.30,.26],[.22,.48,.78],[.95,.72,.22],[.30,.62,.42]][Math.floor(rn() * 4)], rot); } };
  const gantry = (x, z, rot, col = [.86, .30, .24]) => { const cs = Math.cos(rot), sn = Math.sin(rot);
    for (const s of [-1, 1]) addBox(x + s * .006 * -sn, G - .003, z + s * .006 * cs, .003, .05, .003, col);
    addBox(x + .008 * cs, G + .044, z + .008 * sn, .04, .004, .004, col, rot); };
  const ship = (x, z, rot, L, col = [.80, .24, .22], rn = rng) => { const cs = Math.cos(rot), sn = Math.sin(rot);
    addBox(x, SEA, z, L, .016, L * .22, col, rot); addBox(x, SEA + .016, z, L * .96, .003, L * .2, [.94, .94, .92], rot);
    addBox(x - cs * L * .38, SEA + .019, z - sn * L * .38, L * .14, .016, L * .16, [.97, .97, .96], rot);
    for (let i = 0; i < 4; i++) { const o = -L * .2 + i * L * .13; addBox(x + cs * o, SEA + .019, z + sn * o, L * .11, .008, L * .15, [[.22,.48,.78],[.86,.30,.26],[.95,.72,.22],[.30,.62,.42]][i % 4], rot); } };
  const boat = (x, z, rot, k = 1) => { addBox(x, SEA, z, .014 * k, .005, .005 * k, [.97, .97, .96], rot); addBox(x, SEA + .005, z, .006 * k, .004, .004 * k, [.85, .90, .95], rot); };
  const pier = (a, b) => addStrip(a, b, .0025, SEA + .012, [.86, .76, .58]);
  const marina = (x, z, rot, n, rn) => { const cs = Math.cos(rot), sn = Math.sin(rot);
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * .016, px = x - sn * o, pz = z + cs * o; pier([px, pz], [px + cs * .04, pz + sn * .04]);
      for (const f of [.012, .028]) boat(px + cs * f - sn * .006, pz + sn * f + cs * .006, rot, .8); } };
  // Island: sandy rim from the sea bed to just above the water, green top; returns the top height.
  const island = (x, z, r, green = true) => { const top = SEA + .018; addCylinder(x, SEA, z, r, top - SEA, [.93, .84, .62], 16); if (green) addDisc(x, top + .0005, z, r * .72, [.48, .70, .38], 14); return top; };
  const islePalm = (x, z, y, k = 1) => { addCylinder(x, y, z, .003 * k, .03 * k, [.62, .44, .24], 5); addCone(x, y + .03 * k, z, .016 * k, .012 * k, [.22, .62, .26], 6); };
  const villa = (x, z, y, rot, col = [.97, .95, .90]) => { addBox(x, y, z, .016, .008, .012, col, rot); addBox(x, y + .008, z, .018, .002, .014, [.72, .56, .40], rot); };
  const palmGrove = (cx, cz, r, n, rn, test = openAt) => { const prev = target; target = detailMesh; scatterIn(cx, cz, r, n, rn, (x, z) => addPalm(x, z, .38 + rn() * .15), test); target = prev; };
  const treeGrove = (cx, cz, r, n, rn, test = openAt, col) => { const prev = target; target = detailMesh; scatterIn(cx, cz, r, n, rn, (x, z) => addTree(x, z, .28 + rn() * .18, col || [.18 + rn() * .1, .50 + rn() * .16, .24]), test); target = prev; };
  const earth = rn => [.78 + rn() * .08, .60 + rn() * .06, .40 + rn() * .05];
  const heritage = (cx, cz, r, n, rn, test) => scatterIn(cx, cz, r, n, rn, (x, z) => { const w = .012 + rn() * .012; addBox(x, G, z, w, .008 + rn() * .012, w * (.8 + rn() * .4), earth(rn), Math.round(rn()) * .0); }, test);
  const fabric = (cx, cz, r, n, rn, pal, test) => { const prev = target; target = detailMesh; scatterIn(cx, cz, r, n, rn, (x, z) => addHouse(x, z, .2 + rn() * .08, pal[Math.floor(rn() * pal.length)], 0), test); target = prev; };
  const skyline = (cx, cz, r, n, hmax, rn, test, pal = [[.52,.72,.84],[.62,.78,.86],[.70,.74,.80],[.48,.66,.78]]) =>
    scatterIn(cx, cz, r, n, rn, (x, z) => { const d = Math.hypot(x - cx, z - cz) / r, h = .03 + hmax * Math.pow(1 - d, 1.2) * (.5 + rn() * .5); addTower(x, z, .01 + rn() * .006, h, pal[Math.floor(rn() * pal.length)], rn() > .7 ? [.85, .9, .95] : null); }, test);
  const mountain = (x, z, r, h, col, rn) => { addBlob(x, G, z, r * 1.05, h * .45, r, col, 0, .25); addCone(x + (rn() - .5) * r * .3, G + h * .2, z, r * .62, h * .8, shade(col, 1.06), 7); };
  const range = (cx, cz, rx, rz, n, rn, col, hmin, hmax, test) => { for (let i = 0, k = 0; i < n * 8 && k < n; i++) { const x = cx + (rn() * 2 - 1) * rx, z = cz + (rn() * 2 - 1) * rz; if (Math.pow((x - cx) / rx, 2) + Math.pow((z - cz) / rz, 2) > 1 || !test(x, z)) continue; k++; mountain(x, z, .03 + rn() * .035, hmin + rn() * (hmax - hmin), mix(col, [.66, .52, .40], rn() * .3), rn); } };
  const hillOpen = (x, z) => onLand(x, z) && LY.decorAllowed(x, z, .05, .045);

  // Regional networks: highways (asphalt + centre line), railways (ballast, rails, sleepers), the causeway and boat routes.
  function buildPlanNetworks(){
    for (const r of LY.planRoads) { const pts = r.pts;
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i];
        if (r.kind === 'road') { addStrip(a, b, r.w / 2, G + .006, [.40, .38, .37]); addLine([a[0], G + .009, a[1]], [b[0], G + .009, b[1]], [.98, .92, .62]); if (i < pts.length - 1) addDisc(b[0], G + .006, b[1], r.w / 2, [.40, .38, .37], 10); }
        else if (r.kind === 'rail') railSegment(a, b, r.w);
        else if (r.kind === 'causeway') { addStrip(a, b, r.w / 2, SEA + .034, [.78, .76, .72]); const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t <= L; t += .016) { const x = a[0] + (b[0] - a[0]) * t / L, z = a[1] + (b[1] - a[1]) * t / L; addBox(x, SEA, z, .004, .034, .004, [.70, .68, .64]); } lineTarget = lines; addLine([a[0], SEA + .037, a[1]], [b[0], SEA + .037, b[1]], [.98, .92, .62]); }
        else if (r.kind === 'boat') { lineTarget = lines; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t < L; t += .02) { const f0 = t / L, f1 = Math.min(1, (t + .01) / L); addLine([a[0] + (b[0] - a[0]) * f0, SEA + .003, a[1] + (b[1] - a[1]) * f0], [a[0] + (b[0] - a[0]) * f1, SEA + .003, a[1] + (b[1] - a[1]) * f1], [.96, .98, 1]); } } } }
  }
  function railSegment(a, b, w){ addStrip(a, b, w * .8, G + .005, [.62, .58, .54]); lineTarget = lines;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
    for (const s of [-1, 1]) addLine([a[0] + nx * w * .3 * s, G + .008, a[1] + nz * w * .3 * s], [b[0] + nx * w * .3 * s, G + .008, b[1] + nz * w * .3 * s], [.52, .54, .60]);
    for (let t = 0; t < L; t += .01) { const x = a[0] + (b[0] - a[0]) * t / L, z = a[1] + (b[1] - a[1]) * t / L; addBox(x, G + .0055, z, w * 1.2, .001, .002, [.46, .36, .28], Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2); } }
  const station = (x, z, rot, col = [.30, .55, .85]) => { addBox(x, G, z, .03, .012, .014, [.95, .96, .97], rot); addBox(x, G + .012, z, .034, .004, .018, col, rot); };

  // ------------------------------------------------------------------ Eastern Province
  function buildEast(){
    const P = RPL.east; if (!P) return; const rn = mulberry32(501);
    // Jubail: planned industrial parcels (factories, tank farms, stacks) and its cargo port with gantry cranes and ships.
    const jb = P1('eastern'); keepOut.push([jb.x, jb.z, jb.foot]);
    addDisc(jb.x, G + .003, jb.z, jb.foot - .004, [.82, .78, .70], 28);
    for (const [dx, dz] of [[-.045, -.035], [-.045, .01], [-.015, .045], [.02, .03]]) { factory(jb.x + dx, jb.z + dz, .026, .018, .012, [.84, .84, .86]); stack(jb.x + dx + .014, jb.z + dz - .006, .05); }
    for (const [dx, dz] of [[-.01, -.05], [.012, -.052], [-.01, -.028], [.012, -.03], [-.035, -.06]]) tank(jb.x + dx, jb.z + dz, .0095, .012);
    lineTarget = lines; for (const dz of [-.012, .0]) addLine([jb.x - .06, G + .012, jb.z + dz], [jb.x + .02, G + .012, jb.z + dz], [.62, .64, .66]);   // pipe racks
    const cE = RG_coast('east', jb.z);                                    // port on the Gulf shore
    quay([cE - .012, jb.z - .015], [cE + .07, jb.z - .015], .012); quay([cE - .012, jb.z + .03], [cE + .06, jb.z + .03], .01);
    for (let i = 0; i < 3; i++) gantry(cE + .015 + i * .02, jb.z - .004, 0);
    containers(cE + .03, jb.z - .026, 5, 0, rn); ship(cE + .1, jb.z - .045, .05, .07, [.78, .22, .22], rn); ship(cE + .13, jb.z + .06, -.2, .06, [.25, .35, .55], rn);
    // Al Qatif and Tarout: dense heritage fabric, palms, a waterfront and shallow-water islands.
    const qt = PLv('qatif'); keepOut.push([qt.x, qt.z, qt.r]);
    heritage(qt.x, qt.z, qt.r - .008, 26, rn, (x, z) => onLand(x, z) && inCircle(qt.x, qt.z, qt.r - .006)(x, z));
    addCylinder(qt.x - .012, G, qt.z - .01, .004, .045, [.95, .92, .84], 8); addDome(qt.x + .006, G, qt.z - .01, .01, [.95, .95, .92]);
    palmGrove(qt.x - .02, qt.z + .05, .05, 16, rn);
    const tr = P.isles[0]; const ty = island(tr[0], tr[1], tr[2]); for (let i = 0; i < 5; i++) villa(tr[0] - .01 + (i % 3) * .01, tr[1] - .008 + Math.floor(i / 3) * .012, ty, 0, [.86, .74, .56]); islePalm(tr[0] + .014, tr[1] + .01, ty);
    for (const [x, z, r] of P.isles.slice(1, 3)) { const y = island(x, z, r); islePalm(x, z, y, .8); }
    for (let i = 0; i < 3; i++) boat(qt.x + .09 + i * .012, qt.z + .02, .4, .8);
    // Dammam: a modest skyline on a curved corniche, and King Abdulaziz Port kept apart from the centre.
    const dm = PLv('dammam'); keepOut.push([dm.x, dm.z, dm.r]);
    skyline(dm.x - .006, dm.z, dm.r - .01, 14, .12, rn, (x, z) => onLand(x, z) && inCircle(dm.x, dm.z, dm.r - .008)(x, z));
    { const pts = []; for (let i = 0; i <= 12; i++) { const z = dm.z - .03 + i * .01; pts.push([RG_coast('east', z) - .006 - Math.sin(i / 12 * Math.PI) * .012, z]); } polyStrip(pts, .003, G + .006, [.93, .86, .66]); for (const q of pts.filter((_, i) => i % 2)) addPalm(q[0] - .008, q[1], .32); }
    const dp = LY.MISSION_SITES['east:dport'], cD = RG_coast('east', dp[1]);
    quay([cD - .01, dp[1]], [cD + .09, dp[1]], .014); quay([cD + .085, dp[1] - .02], [cD + .085, dp[1] + .04], .008);
    for (let i = 0; i < 4; i++) gantry(cD + .02 + i * .018, dp[1] - .015, 0); containers(cD + .04, dp[1] + .008, 7, 0, rn);
    ship(cD + .06, dp[1] - .04, 0, .075, [.82, .26, .22], rn); ship(cD + .13, dp[1] + .075, .5, .06, [.22, .30, .50], rn);
    // Dhahran: a landscaped knowledge and energy campus — low modern buildings around plazas and a domed hall.
    const dh = PLv('dhahran'); keepOut.push([dh.x, dh.z, dh.r]);
    addDisc(dh.x, G + .003, dh.z, dh.r - .004, [.58, .76, .46], 28); addDisc(dh.x, G + .004, dh.z, .018, [.92, .90, .84], 16);
    addCylinder(dh.x, G, dh.z, .012, .008, [.95, .96, .97], 16); addDome(dh.x, G + .008, dh.z, .011, [.78, .88, .94]);
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + .3, x = dh.x + Math.cos(a) * .038, z = dh.z + Math.sin(a) * .036; addBox(x, G, z, .018, .008 + (i % 3) * .003, .011, [.93, .92, .88], a); addBox(x, G + .011 + (i % 3) * .003, z, .016, .002, .009, [.40, .58, .70], a); }
    treeGrove(dh.x, dh.z, dh.r - .006, 14, rn, (x, z) => Math.hypot(x - dh.x, z - dh.z) > .022 && Math.hypot(x - dh.x, z - dh.z) < dh.r - .008);
    // Al Khobar: waterfront skyline, promenade, marina — and the King Fahd Causeway heading out over the Gulf.
    const kh = PLv('khobar'); keepOut.push([kh.x, kh.z, kh.r]);
    skyline(kh.x - .008, kh.z, kh.r - .01, 11, .1, rn, (x, z) => onLand(x, z) && inCircle(kh.x, kh.z, kh.r - .008)(x, z) && RG_coast('east', z) - x > .012);
    { const pts = []; for (let i = 0; i <= 8; i++) { const z = kh.z - .045 + i * .012; pts.push([RG_coast('east', z) - .005, z]); } polyStrip(pts, .0028, G + .006, [.93, .86, .66]); }
    marina(RG_coast('east', kh.z + .025) + .004, kh.z + .025, 0, 3, rn);
    const bh = [LY.PLANS.east.roads.find(r => r.id === 'eCauseway').pts]; for (const q of [bh[0][1]]) { const y = island(q[0], q[1], .01, false); addBox(q[0], y, q[1], .01, .008, .008, [.95, .95, .95]); }
    // Al Ahsa / Hofuf: a broad palm oasis with irrigation channels, heritage town and the rail station.
    const gr = P1('green'); keepOut.push([gr.x, gr.z, gr.foot]);
    addDisc(gr.x, G + .003, gr.z, gr.foot - .004, [.54, .70, .38], 30);
    lineTarget = lines; for (let k = -2; k <= 2; k++) { const z = gr.z + k * .03, pts = []; for (let i = 0; i <= 10; i++) { const x = gr.x - .08 + i * .016; if (Math.hypot(x - gr.x, z - gr.z) < gr.foot - .01) pts.push([x, z + Math.sin(i * .9 + k) * .004]); } if (pts.length > 1) polyStrip(pts, .002, G + .0045, [.30, .62, .82]); }
    palmGrove(gr.x, gr.z, gr.foot - .012, 70, rn, (x, z) => Math.hypot(x - gr.x, z - gr.z) < gr.foot - .01 && Math.hypot(x - gr.pad[0], z - gr.pad[1]) > .03);
    const hf = PLv('hofuf'); keepOut.push([hf.x, hf.z, hf.r]); heritage(hf.x, hf.z, hf.r - .005, 16, rn, inCircle(hf.x, hf.z, hf.r - .004));
    addCylinder(hf.x + .01, G, hf.z - .01, .0035, .04, [.92, .84, .66], 8); station(hf.x - .012, hf.z + .028, 0);
    station(2.07, -1.125, -.6);                                                         // Dammam rail station
    // King Fahd International Airport (inland of Dammam) and inland desert hills on the west edge.
    const ap = LY.MISSION_SITES['east:kfia']; addStrip([ap[0] - .045, ap[1] - .01], [ap[0] + .045, ap[1] - .01], .006, G + .005, [.32, .33, .35]); addBox(ap[0], G, ap[1] + .012, .04, .008, .012, [.90, .92, .94]);
    for (const [x, z, r] of P.decor.hills) mountain(x, z, r, .05 + rn() * .03, [.80, .58, .40], rn);
    fabric(dm.x - .06, dm.z + .04, .05, 12, rn, [[.94,.88,.76],[.90,.82,.68]]); fabric(kh.x - .07, kh.z, .045, 10, rn, [[.94,.88,.76],[.90,.82,.68]]);
    palmGrove(1.95, -1.33, .06, 10, rn); palmGrove(2.18, -.68, .05, 8, rn);
  }

  // ------------------------------------------------------------------ Western Corridor
  function buildWest(){
    const P = RPL.west; if (!P) return; const rn = mulberry32(502);
    // Mountains first (they frame everything): the Hejaz massif east of the rail line, the buffer between Jeddah and
    // Makkah, and the uplands round Taif. Never on a road, railway or landmark.
    range(-2.40, .55, .15, .42, 40, rn, [.72, .52, .36], .05, .1, hillOpen);
    range(-2.58, 1.44, .018, .08, 6, rn, [.70, .50, .36], .04, .07, hillOpen);
    range(-2.30, 1.66, .16, .13, 18, rn, [.70, .52, .38], .05, .09, hillOpen);
    range(-2.12, 1.30, .08, .1, 12, rn, [.66, .54, .40], .05, .09, hillOpen);
    range(-2.30, -.30, .1, .08, 8, rn, [.74, .56, .40], .04, .07, hillOpen);
    // Madinah: a calm, spacious city around the Prophet's Mosque — white arcades, green dome, minarets, open courtyards.
    const md = PLv('madinah'); keepOut.push([md.x, md.z, md.r]);
    addDisc(md.x, G + .003, md.z, md.r - .002, [.95, .94, .90], 28);
    addBox(md.x, G, md.z, .06, .012, .044, [.97, .96, .92]); addBox(md.x, G + .012, md.z, .062, .002, .046, [.88, .86, .80]);
    addDisc(md.x - .008, G + .0142, md.z, .012, [.92, .90, .84], 14);
    addDome(md.x + .018, G + .014, md.z - .01, .0085, [.20, .60, .34]);
    for (const [dx, dz] of [[-.03, -.022], [.03, -.022], [-.03, .022], [.03, .022], [0, -.024], [0, .024]]) { addCylinder(md.x + dx, G, md.z + dz, .0028, .05, [.97, .96, .92], 8); addCone(md.x + dx, G + .05, md.z + dz, .0035, .01, [.86, .76, .44], 8); }
    fabric(md.x, md.z, .15, 34, rn, [[.97,.94,.88],[.94,.90,.82],[.90,.86,.78]], (x, z) => openAt(x, z, .012) && Math.hypot(x - md.x, z - md.z) > md.r + .012);
    // Rua Al Madinah: hospitality and public space immediately east of the mosque, inside the city.
    const ru = P1('madinah'); keepOut.push([ru.x, ru.z, ru.foot]);
    addDisc(ru.x, G + .003, ru.z, ru.foot - .003, [.90, .88, .82], 22);
    for (const [dx, dz, h] of [[-.018, -.016, .03], [.0, -.02, .04], [.018, -.012, .034], [-.016, .016, .026], [.016, .018, .03]]) addTower(ru.x + dx, ru.z + dz, .012, h, [.93, .90, .84], null);
    addStrip([ru.x - .034, ru.z], [ru.x + .034, ru.z], .004, G + .005, [.60, .78, .52]);
    // KAEC / Ceer: a planned economic-city parcel — port, logistics and the Ceer EV campus with its test track.
    const ce = P1('ceer'); keepOut.push([ce.x, ce.z, ce.foot]); const cK = RG_coast('west', ce.z);
    addDisc(ce.x + .006, G + .003, ce.z, ce.foot - .01, [.84, .84, .80], 24);
    quay([cK + .012, ce.z - .03], [cK - .06, ce.z - .03], .012); quay([cK - .058, ce.z - .03], [cK - .058, ce.z + .02], .006);
    for (let i = 0; i < 3; i++) gantry(cK - .015 - i * .018, ce.z - .018, Math.PI); ship(cK - .045, ce.z - .06, 0, .06, [.30, .40, .60], rn);
    factory(ce.x + .012, ce.z - .018, .04, .022, .012, [.88, .90, .92]); addSolar(ce.x + .012, ce.z - .018, 4, 2, .01);
    factory(ce.x + .02, ce.z + .012, .03, .018, .01, [.90, .90, .92]);
    { const cx = ce.x + .01, cz = ce.z + .038, pts = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * 6.283; pts.push([cx + Math.cos(a) * .022, cz + Math.sin(a) * .009]); } polyStrip(pts, .0025, G + .005, [.36, .37, .40]); }
    // Electric Vehicle Manufacturing: the neighbouring KAEC plant (long assembly halls, solar roofs).
    const lu = P1('lucid'); keepOut.push([lu.x, lu.z, lu.foot]);
    addDisc(lu.x, G + .003, lu.z, lu.foot - .004, [.84, .84, .80], 20); factory(lu.x, lu.z - .008, .05, .018, .011, [.90, .91, .93]); addSolar(lu.x, lu.z - .008, 5, 2, .009); factory(lu.x + .004, lu.z + .018, .036, .012, .008, [.86, .88, .90]);
    // Jeddah: corniche, contemporary skyline, maritime activity; Jeddah Central waterfront; Al Balad heritage; the port.
    const jd = PLv('jeddah'); keepOut.push([jd.x, jd.z, jd.r]);
    skyline(jd.x + .004, jd.z, jd.r - .008, 18, .2, rn, (x, z) => onLand(x, z) && inCircle(jd.x, jd.z, jd.r - .006)(x, z) && x - RG_coast('west', z) > .012);
    addBox(jd.x - .01, G, jd.z - .018, .012, .17, .012, [.62, .78, .86]); addCone(jd.x - .01, G + .17, jd.z - .018, .005, .04, [.80, .86, .90], 6);   // Jeddah Tower
    { const pts = []; for (let i = 0; i <= 14; i++) { const z = jd.z - .09 + i * .013; pts.push([RG_coast('west', z) + .006, z]); } polyStrip(pts, .003, G + .006, [.93, .86, .66]); for (const q of pts.filter((_, i) => i % 3 === 0)) addPalm(q[0] + .008, q[1], .3); }
    addCylinder(RG_coast('west', jd.z - .05) - .02, SEA, jd.z - .05, .003, .08, [.95, .95, .95], 6);   // King Fahd's Fountain
    const jc = P1('jeddahcentral'); keepOut.push([jc.x, jc.z, jc.foot]); const cJ = RG_coast('west', jc.z);
    addDisc(jc.x, G + .003, jc.z, jc.foot - .003, [.92, .88, .76], 20); addDisc(jc.x - .012, G + .0035, jc.z, .014, [.96, .90, .72], 14);   // beach
    addBox(jc.x + .012, G, jc.z - .01, .018, .012, .012, [.95, .94, .92]); addDome(jc.x + .012, G + .012, jc.z + .01, .008, [.88, .74, .52]);   // cultural buildings
    marina(cJ - .002, jc.z + .012, Math.PI, 3, rn);
    const bl = LY.MISSION_SITES['west:balad']; heritage(bl[0], bl[1], .025, 18, rn, (x, z) => onLand(x, z) && LY.decorAllowed(x, z, .004, .012));
    const jp = LY.MISSION_SITES['west:jport'], cP = RG_coast('west', jp[1]); quay([cP + .01, jp[1]], [cP - .07, jp[1] - .01], .012); for (let i = 0; i < 3; i++) gantry(cP - .02 - i * .018, jp[1] - .004, Math.PI); ship(cP - .05, jp[1] + .03, .1, .065, [.80, .26, .22], rn);
    const ka = LY.MISSION_SITES['west:kaia']; addStrip([ka[0] - .004, ka[1] - .04], [ka[0] - .004, ka[1] + .04], .006, G + .005, [.32, .33, .35]); addBox(ka[0] + .02, G, ka[1], .012, .008, .03, [.90, .92, .94]);   // King Abdulaziz Airport
    for (let i = 0; i < 4; i++) boat(RG_coast('west', jd.z + .02 * i) - .05 - i * .01, jd.z - .03 + .03 * i, .3 * i, 1.1);
    fabric(jd.x + .02, jd.z + .06, .07, 18, rn, [[.97,.94,.88],[.94,.86,.72],[.90,.82,.68]]);
    // Makkah: a compact city with a respectfully scaled Masjid al-Haram — white courtyard, the Kaaba, arcade and minarets.
    const mk = PLv('makkah'); keepOut.push([mk.x, mk.z, mk.r]);
    addDisc(mk.x, G + .003, mk.z, .03, [.96, .95, .92], 28); addCylinder(mk.x, G, mk.z, .03, .008, [.94, .93, .88], 28, .03);
    addDisc(mk.x, G + .0085, mk.z, .022, [.98, .97, .95], 24);
    addBox(mk.x, G + .0085, mk.z, .006, .006, .006, [.06, .06, .06]); addBox(mk.x, G + .0125, mk.z, .0062, .0008, .0062, [.84, .66, .20]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + .5; addCylinder(mk.x + Math.cos(a) * .031, G, mk.z + Math.sin(a) * .031, .0024, .045, [.96, .95, .90], 8); addCone(mk.x + Math.cos(a) * .031, G + .045, mk.z + Math.sin(a) * .031, .003, .008, [.86, .76, .44], 8); }
    skyline(mk.x, mk.z, mk.r - .004, 14, .05, rn, (x, z) => Math.hypot(x - mk.x, z - mk.z) > .038 && Math.hypot(x - mk.x, z - mk.z) < mk.r - .004, [[.94,.92,.86],[.90,.88,.84],[.86,.84,.80]]);
    addBox(mk.x + .006, G, mk.z - .046, .012, .12, .012, [.88, .86, .80]); addCone(mk.x + .006, G + .12, mk.z - .046, .006, .025, [.86, .74, .36], 6);   // clock tower (just north of the courtyard)
    // Masar Makkah: a planned boulevard district extending west from central Makkah — wholly inland.
    const ms = P1('masar'); { const pts = ms.ribbon.pts; polyStrip(pts, .006, G + .005, [.86, .80, .64]);
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; for (let t = .15; t < 1; t += .3) { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; for (const s of [-1, 1]) addTower(x, z + s * .012, .009, .025 + rn() * .02, [.92, .88, .80], null); } } }
    // Holy Sites (Mina and Arafat): the white tent city east of Makkah, with the Mashaer rail alongside.
    const hj = P1('hajj'); keepOut.push([hj.x, hj.z, hj.foot]);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const x = hj.x + i * .012, z = hj.z + j * .012; if (Math.hypot(x - hj.x, z - hj.z) > hj.foot - .01 || Math.hypot(x - hj.pad[0], z - hj.pad[1]) < .02) continue; addRoof(x, G, z, .009, .006, .009, [.98, .98, .96]); }
    // Taif: an independent upland town — terraced slopes, rose-coloured planting, a winding approach.
    const tf = PLv('taif'); keepOut.push([tf.x, tf.z, tf.r]);
    for (let k = 0; k < 3; k++) addCylinder(tf.x, G, tf.z, tf.r - .006 - k * .014, .006, shade([.62, .72, .44], 1 + k * .04), 22);
    fabric(tf.x, tf.z, tf.r - .012, 16, rn, [[.96,.90,.80],[.93,.84,.70]], inCircle(tf.x, tf.z, tf.r - .012));
    { const prev = target; target = detailMesh; scatterIn(tf.x, tf.z, tf.r + .03, 16, rn, (x, z) => addTree(x, z, .22, [.92, .52, .66]), (x, z) => onLand(x, z) && LY.decorAllowed(x, z, .004, .012)); target = prev; }
    // Haramain High-Speed Railway: Madinah → KAEC → Jeddah → Makkah with integrated stations (it does not reach Taif).
    const hr = P1('haramain'); for (let i = 1; i < hr.ribbon.pts.length; i++) railSegment(hr.ribbon.pts[i - 1], hr.ribbon.pts[i], .012);
    const hp = hr.ribbon.pts; for (const q of [hp[0], hp[3], hp[5], hp[hp.length - 1]]) station(q[0], q[1], Math.PI / 2, [.62, .40, .30]);
    palmGrove(-2.60, .18, .06, 10, rn); palmGrove(-2.56, 1.02, .05, 8, rn); palmGrove(-2.52, -.02, .05, 10, rn);
  }

  // ------------------------------------------------------------------ NEOM / Northwest
  function buildNorthwest(){
    const P = RPL.northwest; if (!P) return; const rn = mulberry32(503);
    // Midian mountains: rugged peaks round Trojena, ranges framing THE LINE's valley (never on it), hills along the coast.
    range(-4.42, -2.42, .2, .1, 26, rn, [.66, .50, .40], .07, .13, hillOpen);
    range(-4.35, -1.98, .2, .05, 14, rn, [.74, .54, .40], .04, .08, hillOpen);
    range(-3.95, -1.60, .18, .18, 16, rn, [.76, .56, .40], .04, .08, hillOpen);
    range(-3.70, -1.05, .2, .2, 14, rn, [.78, .58, .42], .04, .07, hillOpen);
    range(-4.30, -2.24, .1, .05, 6, rn, [.72, .54, .42], .05, .09, hillOpen);
    // THE LINE: one slim, reflective corridor from the NEOM coast inland through the valley.
    const ln = P1('neom'); { const pts = ln.ribbon.pts; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
      addBox((a[0] + b[0]) / 2, G, (a[1] + b[1]) / 2, L, .03, .006, [.62, .84, .90], rot); addBox((a[0] + b[0]) / 2, G + .03, (a[1] + b[1]) / 2, L, .002, .007, [.90, .98, 1], rot); } }
    // Trojena: an elevated mountain destination — snow-tipped peaks, a small lake, terraced lodges.
    const tj = P1('trojena'); keepOut.push([tj.x, tj.z, tj.foot]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + .4, x = tj.x + Math.cos(a) * .052, z = tj.z + Math.sin(a) * .046, h = .12 + rn() * .06; addCone(x, G, z, .035, h, [.60, .52, .46], 7); addCone(x, G + h * .72, z, .011, h * .28, [.97, .97, .99], 7); }
    addDisc(tj.x, G + .006, tj.z + .004, .02, [.34, .70, .86], 18);
    for (let k = 0; k < 3; k++) addBox(tj.x - .012 + k * .012, G + k * .006, tj.z - .02 - k * .004, .012, .01, .008, [.94, .94, .96]);
    // Oxagon: a near-octagonal floating industrial city — engineered perimeter, blue inner harbour, quays, cranes, factories.
    const ox = P1('oxagon'); keepOut.push([ox.x, ox.z, ox.foot]);
    const R0 = ox.foot - .006, oct = i => [ox.x + Math.cos(i / 8 * 6.283 + Math.PI / 8) * R0, ox.z + Math.sin(i / 8 * 6.283 + Math.PI / 8) * R0];
    for (let i = 0; i < 8; i++) quay(oct(i), oct(i + 1), .014, [.80, .80, .78]);
    for (let i = 0; i < 8; i++) { const [x, z] = oct(i); addCylinder(x, SEA, z, .014, G - SEA - .003, [.80, .80, .78], 8); }
    addCylinder(ox.x, SEA + .004, ox.z, R0 * .62, .004, [.24, .56, .80], 8);                                        // inner harbour
    for (let i = 0; i < 8; i++) { const a = (i + .5) / 8 * 6.283 + Math.PI / 8, x = ox.x + Math.cos(a) * R0 * .82, z = ox.z + Math.sin(a) * R0 * .82;
      if (i % 2) gantry(x, z, a); else factory(x, z, .016, .01, .008, [.86, .88, .92], a + Math.PI / 2); }
    ship(ox.x - .005, ox.z + .005, .3, .04, [.24, .34, .58], rn); addBox(ox.x + .02, SEA + .006, ox.z - .02, .012, .004, .004, [.95, .95, .95]);
    // Green Hydrogen: the compound on Oxagon's inland side — solar rows, turbines, processing halls, spherical storage.
    const h2 = P1('hydrogen'); keepOut.push([h2.x, h2.z, h2.foot]);
    addDisc(h2.x, G + .003, h2.z, h2.foot - .004, [.82, .80, .70], 22); addSolar(h2.x + .012, h2.z - .016, 5, 3, .012);
    for (let i = 0; i < 3; i++) addTurbine(h2.x + .04, h2.z - .03 + i * .022, .4);
    factory(h2.x - .025, h2.z + .015, .02, .014, .01, [.92, .94, .95]); for (const d of [-.01, .004]) { addCylinder(h2.x - .006 + d, G, h2.z + .03, .007, .006, [.94, .96, .96], 10); addDome(h2.x - .006 + d, G + .006, h2.z + .03, .007, [.96, .98, .98]); }
    // Sindalah: a small offshore island with its marina, resort buildings and yachts.
    const sd = P1('sindalah'); { const y = island(sd.x, sd.z, sd.foot - .01); addDisc(sd.x, y + .001, sd.z, .012, [.34, .72, .84], 12);
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; villa(sd.x + Math.cos(a) * .022, sd.z + Math.sin(a) * .018, y, a); }
      for (let i = 0; i < 4; i++) boat(sd.x + .038, sd.z - .015 + i * .01, 0, 1.2); pier([sd.x + .028, sd.z - .02], [sd.x + .028, sd.z + .02]); }
    // Tabuk: an established inland city east of NEOM.
    const tb = PLv('tabuk'); keepOut.push([tb.x, tb.z, tb.r]);
    fabric(tb.x, tb.z, tb.r - .004, 26, rn, [[.94,.86,.72],[.90,.80,.64],[.96,.90,.80]], (x, z) => inCircle(tb.x, tb.z, tb.r - .004)(x, z)); addCylinder(tb.x + .01, G, tb.z - .012, .003, .04, [.94, .90, .82], 8);
    fabric(tb.x + .03, tb.z + .06, .05, 10, rn, [[.94,.86,.72],[.90,.80,.64]]); palmGrove(tb.x - .02, tb.z + .08, .05, 10, rn);
    // AlUla: monumental sandstone, an oasis and a compact heritage settlement.
    const au = P1('alula'); keepOut.push([au.x, au.z, au.foot]);
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + rn() * .3, r = .05 + rn() * .035, x = au.x + Math.cos(a) * r, z = au.z + Math.sin(a) * r * .8, h = .05 + rn() * .06, w = .018 + rn() * .012;
      if (Math.hypot(x - au.pad[0], z - au.pad[1]) < .03) continue; addBox(x, G, z, w, h, w * .9, [.76 + rn() * .06, .42, .24], rn()); addBlob(x, G + h, z, w * .6, .012, w * .55, [.80, .48, .28], -.2, .2); }
    palmGrove(au.x, au.z + .01, .035, 16, rn, inCircle(au.x, au.z, .04)); heritage(au.x - .03, au.z - .01, .02, 10, rn, inCircle(au.x - .03, au.z - .01, .022));
    addBox(au.x + .045, G, au.z - .045, .03, .014, .02, [.80, .88, .92]);                                        // Maraya mirrored hall
    // AMAALA: a calm multi-bay wellness and marina destination on the coast, outside NEOM.
    const am = P1('amaala'); keepOut.push([am.x, am.z, am.foot]); const cA = RG_coast('west', am.z);
    for (const dz of [-.035, 0, .035]) { addCylinder(cA - .012, SEA, am.z + dz, .02, G - SEA - .004, [.93, .84, .62], 14); for (let i = 0; i < 3; i++) villa(cA - .018 + i * .008, am.z + dz - .006 + i * .004, G - .004, i); }
    for (let i = 0; i < 5; i++) villa(am.x + .01 + (i % 2) * .016, am.z - .03 + i * .014, G, .3); marina(cA - .03, am.z + .018, Math.PI, 2, rn);
    // The Red Sea Destination: low resort islands, coral shallows and boats — farther south and distinct from AMAALA.
    const rs = P1('redsea'); addDisc(rs.x, SEA + .002, rs.z, rs.foot, [.36, .80, .82], 28);                    // coral shallows
    for (const [dx, dz, r] of [[0, 0, .022], [-.042, .025, .016], [.035, .032, .014], [.03, -.035, .015], [-.035, -.03, .013]]) { const y = island(rs.x + dx, rs.z + dz, r); villa(rs.x + dx, rs.z + dz, y, dx * 30); islePalm(rs.x + dx + r * .5, rs.z + dz, y, .8);
      for (let i = 0; i < 3; i++) { const a = i * 2.1, x = rs.x + dx + Math.cos(a) * (r + .008), z = rs.z + dz + Math.sin(a) * (r + .008); addBox(x, SEA + .006, z, .006, .006, .006, [.92, .86, .74]); } }
    for (let i = 0; i < 3; i++) boat(rs.x + .06 + i * .012, rs.z - .01 + i * .01, .5, 1);
    palmGrove(-3.76, -.62, .03, 6, rn);
  }

  // ------------------------------------------------------------------ Southwest
  function buildSouth(){
    const P = RPL.south; if (!P) return; const rn = mulberry32(504);
    // The continuous green Aseer / Sarawat belt through the centre, drier ranges toward Najran.
    const belt = [[-1.60, 2.55], [-1.50, 2.72], [-1.44, 2.86], [-1.40, 3.00], [-1.32, 3.12], [-1.22, 3.30], [-1.12, 3.50], [-1.04, 3.72]];
    const forest = (x, z) => hillOpen(x, z) && x > RG_coast('west', z) + .1;
    for (const [x, z] of belt) for (const [ox, oz] of [[0, 0], [.07, .04], [-.05, .05], [.1, -.03]]) { const px = x + ox, pz = z + oz, r = Math.min(.11, px - RG_coast('west', pz) - .1);   // green highlands, kept on land
      let rr = r; while (rr > .02 && !Array.from({length:12}, (_, i) => i / 12 * 6.283).every(a => onLand(px + Math.cos(a) * rr, pz + Math.sin(a) * rr))) rr -= .01;   // whole rim on Saudi land
      if (rr > .02 && onLand(px, pz)) addDisc(px, G + .0025, pz, rr, [.54, .70, .40], 18); }
    for (let i = 1; i < belt.length; i++) { const a = belt[i - 1], b = belt[i]; for (let t = 0; t < 1; t += .14) { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      for (let k = 0; k < 5; k++) { const px = x + (rn() - .5) * .22, pz = z + (rn() - .5) * .1; if (!forest(px, pz)) continue; const h = .06 + rn() * .06; mountain(px, pz, .035 + rn() * .02, h, mix([.36, .56, .30], [.50, .48, .34], rn() * .4), rn);
        if (rn() > .3) { const prev = target; target = detailMesh; addTree(px + .03, pz + .02, .28, [.18, .46, .24]); target = prev; } } } }
    range(-.78, 3.05, .16, .12, 14, rn, [.76, .56, .40], .04, .07, hillOpen);
    range(-.70, 3.60, .18, .12, 12, rn, [.78, .58, .42], .03, .06, hillOpen);
    // Jazan Industrial City: orderly factories, tank farm, logistics yards and its own cargo port.
    const ji = P1('jazan'); keepOut.push([ji.x, ji.z, ji.foot]); const cJ = RG_coast('west', ji.z);
    addDisc(ji.x, G + .003, ji.z, ji.foot - .004, [.82, .80, .74], 26);
    for (const [dx, dz] of [[.02, -.04], [.04, -.012], [.035, .025], [0, .045]]) factory(ji.x + dx, ji.z + dz, .024, .016, .011, [.86, .88, .90]);
    for (const [dx, dz] of [[-.012, -.03], [.004, -.018], [-.02, -.012], [-.004, 0]]) tank(ji.x + dx, ji.z + dz, .009, .012);
    containers(ji.x + .02, ji.z + .01, 6, 0, rn);
    quay([cJ + .01, ji.z + .02], [cJ - .07, ji.z + .02], .012); for (let i = 0; i < 3; i++) gantry(cJ - .015 - i * .018, ji.z + .032, Math.PI); ship(cJ - .05, ji.z + .055, .1, .06, [.78, .24, .22], rn);
    // Jazan: a southern coastal civic city — compact buildings, palms, a waterfront marina and small boats.
    const jz = PLv('jazanc'); keepOut.push([jz.x, jz.z, jz.r]); const cZ = RG_coast('west', jz.z);
    fabric(jz.x + .006, jz.z, jz.r - .006, 24, rn, [[.98,.96,.92],[.96,.92,.84],[.94,.88,.78]], (x, z) => inCircle(jz.x, jz.z, jz.r - .006)(x, z) && onLand(x, z));
    addCylinder(jz.x - .01, G, jz.z - .02, .004, .05, [.97, .96, .92], 8); marina(cZ - .002, jz.z + .02, Math.PI, 3, rn); palmGrove(jz.x + .03, jz.z - .05, .03, 8, rn);
    for (let i = 0; i < 4; i++) boat(cZ - .06 - i * .012, jz.z - .02 + i * .015, i, 1);
    // Soudah: the highest forested ridge, west of Abha — viewpoints, terraces, small hospitality buildings.
    const so = P1('soudah'); keepOut.push([so.x, so.z, so.foot]);
    addCylinder(so.x, G, so.z, so.foot - .004, .02, [.34, .54, .30], 18); addCylinder(so.x, G + .02, so.z, so.foot - .02, .02, [.38, .58, .32], 16); addCone(so.x - .008, G + .04, so.z - .006, .02, .04, [.40, .60, .34], 10);
    for (let k = 0; k < 3; k++) addBox(so.x + .02 - k * .014, G + .02 + (k === 1 ? .02 : 0), so.z + .02, .01, .006, .008, [.96, .95, .92]);
    { const prev = target; target = detailMesh; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, r = so.foot - .012; addTree(so.x + Math.cos(a) * r, so.z + Math.sin(a) * r, .22, [.16, .44, .22]); } target = prev; }
    // Abha: a distinct highland city on a green plateau — Aseer-inspired architecture, squares and gardens.
    const ab = PLv('abha'); keepOut.push([ab.x, ab.z, ab.r]);
    addCylinder(ab.x, G, ab.z, ab.r - .002, .012, [.50, .66, .38], 22);
    for (let i = 0; i < 18; i++) { const a = rn() * 6.283, d = Math.sqrt(rn()) * (ab.r - .014), x = ab.x + Math.cos(a) * d, z = ab.z + Math.sin(a) * d; if (Math.hypot(x - ab.x, z - ab.z) < .012) continue;
      const w = .01 + rn() * .006, h = .012 + rn() * .014; addBox(x, G + .012, z, w, h, w, [.86, .78, .66]); for (let y = .004; y < h; y += .006) addBox(x, G + .012 + y, z, w * 1.04, .0015, w * 1.04, [.70, .42, .30]); }
    addDisc(ab.x, G + .0125, ab.z, .01, [.92, .88, .78], 12);
    // Najran: an independent inland oasis city — wadi greenery, palms, earth-toned architecture.
    const nj = PLv('najran'); keepOut.push([nj.x, nj.z, nj.r]);
    const wadi = [[-.80, 3.30], [-.66, 3.40], [-.52, 3.44], [-.40, 3.46], [-.30, 3.47]]; polyStrip(wadi, .012, G + .004, [.50, .70, .40]); polyStrip(wadi, .004, G + .005, [.30, .60, .80]);
    heritage(nj.x, nj.z, nj.r - .006, 24, rn, inCircle(nj.x, nj.z, nj.r - .006)); addCylinder(nj.x + .012, G, nj.z - .02, .004, .04, [.82, .66, .46], 8);
    palmGrove(-.55, 3.45, .08, 26, rn, (x, z) => LY.polyDist(x, z, wadi) < .03 && openAt(x, z, .01));
    // Khamis Mushait and Abha airport (mission sites) as small, quiet settlements; Rijal Almaa on the western slope.
    const km = LY.MISSION_SITES['south:khamis']; fabric(km[0], km[1], .03, 10, rn, [[.90,.84,.74],[.86,.78,.66]]);
    const aa = LY.MISSION_SITES['south:abhair']; addStrip([aa[0] - .03, aa[1]], [aa[0] + .03, aa[1]], .005, G + .005, [.32, .33, .35]);
    const rj = LY.MISSION_SITES['south:rijal']; heritage(rj[0], rj[1], .014, 8, rn, (x, z) => onLand(x, z) && LY.decorAllowed(x, z, .004, .012));
    palmGrove(-1.62, 2.86, .05, 10, rn); palmGrove(-1.30, 3.36, .05, 12, rn);
  }
  // ----------------------------------------------------------------- shared
  const P1 = id => P(id);
  const RG_coast = (side, z) => side === 'east' ? window.VisionRegions.coastE(z) : window.VisionRegions.coastW(z);
  function buildRegions(){ buildPlanNetworks(); buildEast(); buildWest(); buildNorthwest(); buildSouth(); }

  function buildLandmarks(){
    buildRiyadh();   // the stylized north-up Riyadh planning map (layout.js)

    buildRegions();  // Eastern Province, Western Corridor, NEOM / Northwest and Southwest (regions.js)
  }

  function buildCities(){
    const palettes={city:[[.98,.92,.80],[.96,.80,.58],[.99,.97,.92],[.93,.72,.50]],coast:[[1,.98,.94],[.96,.88,.72],[.72,.86,.94],[.98,.80,.62]],sacred:[[1,.99,.96],[.98,.94,.84],[.95,.90,.80]],desert:[[.92,.70,.46],[.97,.82,.58],[.86,.60,.40]],green:[[.96,.84,.66],[.90,.94,.86],[.98,.76,.56]]};
    riyadhBlocks();
    for (const city of D.cities) { if (city.name === 'Riyadh' || LY.cityPlan(city.name)) continue;   // plan cities are drawn by their region
      const n=Math.floor(12+city.size*48), pal=palettes[city.palette]||palettes.city, R=city.size*.34;
      for (let i=0;i<n;i++){
        const a=rng()*6.283, r=Math.pow(rng(),.75)*R, x=city.x+Math.cos(a)*r, z=city.z+Math.sin(a)*r, k=.55+rng()*.5;
        if (!inSaudi(x,z) || blocked(x,z)) continue;
        const col=pal[Math.floor(rng()*pal.length)];
        const tall=(1-r/R)*city.size, core=LY.insideCore(city.name,x,z);
        if (core) { if (TOWER_CORES.has(city.name) && rng()>.35) { target=mesh; addTower(x,z,.028+rng()*.016,.06+rng()*.12*Math.max(.4,tall),[.52+rng()*.2,.74,.88],rng()>.6?[.85,.9,.95]:null); } continue; }
        if (!LY.decorAllowed(x,z,.035,.035)) continue;
        target=detailMesh; addHouse(x,z,k,col,Math.round(rng()*3)*Math.PI/2*.0+(rng()-.5)*.3);
      }
    }
    target=mesh;
  }
  const TOWER_CORES = new Set(['Jeddah','Dammam']);   // Riyadh's downtown is built by buildRiyadh()   // Makkah and Madinah cores hold their holy-site landmarks instead

  // Each project's footprint is outlined on the ground in its colour, so its extent reads at every zoom.
  function ribbonEdges(p, off, y, col){ polyLine(p.ribbon.pts, y, col, p.ribbon.hw+off); polyLine(p.ribbon.pts, y, col, -(p.ribbon.hw+off)); }
  function buildMarkerRings(){ for (const p of D.projects) { if (p.ribbon) ribbonEdges(p, 0, G+.008, shade(p.color,.9)); else addRing(p.x,G+.008,p.z,p.foot,shade(p.color,.9),28); } }

  buildTerrain(); buildNetworks(); buildLandmarks(); buildCities(); buildMarkerRings();

  // Clouds framing the diorama (drawn lit, but they cast no shadows)
  target = cloudGeo;
  for (const [x,z,k] of [[-1.47,2.70,.09],[-1.02,2.83,.08],[-1.34,3.24,.07]]) addCloud(x,G+.2,z,k);   // light mist on the Aseer hills (clear of Abha and Soudah)
  target = mesh;

  /* ------------------------------ sea ------------------------------- */
  const WATER = (() => {
    const segs=[]; for (const poly of [saudi,...neighbours]) for (let i=0;i<poly.length;i++) segs.push([poly[i],poly[(i+1)%poly.length]]);
    const isles=[[50.55,26.05,.07],[41.9,16.8,.05],[42.2,16.6,.04]].map(([lo,la,r])=>[...geo(lo,la),r]);
    for (const P0 of Object.values(LY.PLANS || {})) for (const q of P0.isles) isles.push([...q]);                 // plan islands (Tarout...)
    { const sd=P('sindalah'); isles.push([sd.x,sd.z,sd.foot-.01]); const rs=P('redsea'); for (const [dx,dz,r] of [[0,0,.022],[-.042,.025,.016],[.035,.032,.014],[.03,-.035,.015],[-.035,-.03,.013]]) isles.push([rs.x+dx,rs.z+dz,r]);
      const am=P('amaala'), cA=window.VisionRegions.coastW(am.z); for (const dz of [-.035,0,.035]) isles.push([cA-.012,am.z+dz,.02]); }
    const segDist=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);};
    const x0=-9.5,x1=10.5,z0=-8,z1=9,step=.08, nx=Math.round((x1-x0)/step)+1, nz=Math.round((z1-z0)/step)+1;
    const pos=new Float32Array(nx*nz*3), shore=new Float32Array(nx*nz);
    for (let j=0;j<nz;j++) for (let i=0;i<nx;i++){
      const x=x0+i*step, z=z0+j*step, k=j*nx+i; pos[k*3]=x; pos[k*3+1]=SEA; pos[k*3+2]=z;
      let d=1; for (const [a,b] of segs){ if (Math.abs(a[0]-x)>d+2.5&&Math.abs(b[0]-x)>d+2.5) continue; const q=segDist(x,z,a,b); if(q<d)d=q; }
      for (const [ix,iz,r] of isles){ const q=Math.max(0,Math.hypot(x-ix,z-iz)-r); if(q<d)d=q; }
      shore[k]=d;
    }
    const idx=new Uint16Array((nx-1)*(nz-1)*6); let o=0;
    for (let j=0;j<nz-1;j++) for (let i=0;i<nx-1;i++){ const a=j*nx+i,b=a+1,c=a+nx,d=c+1; idx.set([a,c,b,b,c,d],o); o+=6; }
    return {pos, shore, idx};
  })();

  /* ------------------------------ vehicles --------------------------- */
  const vehGeo = Geo();


  /* ---------------------- per-project stage mesh -------------------- */
  const projectState = {}; for (const p of D.projects) projectState[p.id] = {stage:p.stage, done:p.stage===2?3:1, doneKeys:p.stage===2?['design','site','materials']:['design'], progress:0};
  const tierCount = st => Math.max(0, Math.min(6, st.done ?? (st.stage||1)));
  // Marker stalks: short on the Riyadh plan so they never stand in front of the landmark they label.
  const lowStalk = id => !!(id && LY.projects[id] && LY.projects[id].illustrative);
  const stalkH = (k, id) => lowStalk(id) ? .02 + k*.004 : .08 + k*.014;
  const beaconTop = (st, id) => { const k=tierCount(st); return G + k*.012 + stalkH(k, id); };
  const stageMesh = Geo(), stageLines = {p:[], c:[]};
  let stageDirty = true;
  function buildStageMesh(){
    stageMesh.p.length=stageMesh.c.length=stageMesh.n.length=stageLines.p.length=stageLines.c.length=0;
    target=stageMesh; lineTarget=stageLines;
    for (const p of D.projects) {
      const st=projectState[p.id], k=tierCount(st), d=st.doneKeys||[], [px,pz]=p.pad, f=p.foot;   // progress lives on the marker pad at the footprint's south edge
      if (d.includes('site') || st.active==='site') addDisc(px,G+.004,pz,.034,st.active==='site'?[.72,.52,.34]:[.80,.66,.48],18);   // graded site pad
      for (let i=0;i<k;i++) addCylinder(px,G+i*.012,pz,.026-i*.003,.012,shade(p.color,.8+i*.06),12);  // one tier per completed package
      addCylinder(px,G+k*.012,pz,.005,stalkH(k,p.id),[.97,.95,.88],6);
      if (d.includes('materials') && !d.includes('build')) for (let i=0;i<4;i++) addBox(px+.03+(i%2)*.014,G,pz-.01+Math.floor(i/2)*.014,.011,.01,.011,i%2?[.62,.64,.68]:[.86,.72,.46]);  // stockpiled materials
      if (st.active==='build') { const h=.04+.14*(st.progress||0); addBox(p.x+f*.45,G,p.z-f*.1,.04,h,.04,[.86,.84,.78]); addCrane(p.x+f*.6,p.z-f*.45,.4,[.98,.72,.2]);
        for (let y=.02;y<h;y+=.02) addBox(p.x+f*.45,G+y,p.z-f*.1,.046,.002,.046,[.95,.62,.2]); }                     // rising structure with scaffold bands
      if (st.active==='utility' || d.includes('utility')) for (let i=0;i<3;i++) { addCylinder(p.x-f*.75+i*.03,G,p.z+f*.35,.003,.06,[.55,.5,.45],5); }  // utility connection poles
      if (k>=6) { addCylinder(px,G+k*.012,pz,.022,.006,[1,.82,.3],16); }                                               // operational: gold cap
    }
    target=mesh; lineTarget=lines; stageDirty=true;
  }
  buildStageMesh();

  const missionMesh = Geo(), missionLines = {p:[], c:[]}; let missionDirty = false;
  const KIND_OFF = {metro:.014, brt:-.014, wide:0, power:.02};
  function addRibbon(a, b, prog, w, y, h, col){
    const dx=b[0]-a[0], dz=b[1]-a[1], L=Math.hypot(dx,dz); if (L<1e-4||prog<=0) return; const len=L*Math.min(1,prog), ux=dx/L, uz=dz/L;
    addBox(a[0]+ux*len/2, y, a[1]+uz*len/2, len, h, w, col, Math.atan2(dz,dx));
  }
  function buildMission(){
    missionMesh.p.length=missionMesh.c.length=missionMesh.n.length=missionLines.p.length=missionLines.c.length=0;
    target=missionMesh; lineTarget=missionLines;
    const sc=missionScene||{links:[],sites:[]};
    // A link follows its routed path (layout.routeBetween): straight when clear, else along the plan's roads. Each path
    // segment is drawn in turn; stations sit only at the two ends and the crane only where building has reached.
    for (const l0 of sc.links) {
      const pts=l0.pts||LY.routeBetween(l0.a,l0.b,l0.kind==='wide'||l0.kind==='brt'),   // roads and buses follow the road network
        segL=pts.slice(1).map((q,i)=>Math.hypot(q[0]-pts[i][0],q[1]-pts[i][1])), tot=segL.reduce((s,x)=>s+x,0)||1, P0=l0.progress??1;
      for (let si=0, acc=0; si<segL.length; acc+=segL[si], si++) {
      const s0=acc/tot, s1=(acc+segL[si])/tot, first=si===0, last=si===segL.length-1;
      const l={kind:l0.kind, a:pts[si], b:pts[si+1], progress:P0>=s1?1:P0<=s0?0:(P0-s0)/(s1-s0)}, tipHere=P0>=s0&&P0<s1;
      const dx=l.b[0]-l.a[0], dz=l.b[1]-l.a[1], L=Math.hypot(dx,dz)||1, nx=-dz/L, nz=dx/L, off=KIND_OFF[l.kind]||0, ea=first?.03:0, eb=last?.03:0;
      const a=[l.a[0]+nx*off+dx/L*ea, l.a[1]+nz*off+dz/L*ea], b=[l.b[0]+nx*off-dx/L*eb, l.b[1]+nz*off-dz/L*eb], p=l.progress, ends=[first&&a, last&&b].filter(Boolean);
      const tip=[a[0]+(b[0]-a[0])*p, a[1]+(b[1]-a[1])*p];
      if (p<=0) {}   // not reached yet: only the planned (dashed) line below
      else if (l.kind==='metro') { addRibbon(a,b,p,.014,G+.034,.007,[.60,.40,.86]); addRibbon(a,b,p,.018,G+.031,.003,[.9,.9,.93]);
        const n=Math.floor(L*p/.07); for(let i=0;i<=n;i++){const q=i*.07/L; addCylinder(a[0]+(b[0]-a[0])*q,G,a[1]+(b[1]-a[1])*q,.0035,.032,[.88,.88,.9],6);}
        if (P0>=1) for (const e of ends) { addCylinder(e[0],G,e[1],.022,.05,[.96,.95,.92],10); addCylinder(e[0],G+.05,e[1],.028,.006,[.60,.40,.86],10); } }
      else if (l.kind==='brt') { addRibbon(a,b,p,.02,G+.006,.004,[.98,.55,.18]); addRibbon(a,b,p,.004,G+.0105,.001,[1,1,1]);
        if (P0>=1) for (const e of ends) { addBox(e[0],G,e[1],.03,.022,.014,[.98,.97,.94]); addBox(e[0],G+.022,e[1],.036,.004,.02,[.98,.55,.18]); } }
      else if (l.kind==='freight') { addRibbon(a,b,p,.022,G+.006,.004,[.36,.33,.30]); addRibbon(a,b,p,.004,G+.0105,.002,[.25,.85,.8]);
        if (p>=1) for (const q of [.3,.7]) { const x=a[0]+(b[0]-a[0])*q, z=a[1]+(b[1]-a[1])*q; addBox(x,G+.01,z,.03,.012,.012,[[.9,.35,.3],[.25,.55,.85]][q>.5?1:0],Math.atan2(b[1]-a[1],b[0]-a[0])); } }
      else if (l.kind==='wide') { addRibbon(a,b,p,.036,G+.005,.003,[.40,.41,.44]); addRibbon(a,b,p,.003,G+.0085,.001,[1,.85,.3]); }
      else if (l.kind==='power') { const n=Math.max(2,Math.floor(L*p/.12)); let prev=null; for(let i=0;i<=n;i++){const q=i/n*p; const x=a[0]+(b[0]-a[0])*q, z=a[1]+(b[1]-a[1])*q; addBox(x,G,z,.006,.07,.006,[.7,.72,.76]); addBox(x,G+.065,z,.03,.004,.004,[.7,.72,.76]); if(prev) addLine([prev[0],G+.067,prev[1]],[x,G+.067,z],[.35,.35,.4]); prev=[x,z];} }
      if (p<1) { if (tipHere) addCrane(tip[0]+.02,tip[1]+.02,.3,[.98,.74,.16]); const segs=10; for(let i=0;i<segs;i+=2){ const q0=p+(1-p)*i/segs, q1=p+(1-p)*(i+1)/segs; addLine([a[0]+(b[0]-a[0])*q0,G+.02,a[1]+(b[1]-a[1])*q0],[a[0]+(b[0]-a[0])*q1,G+.02,a[1]+(b[1]-a[1])*q1],[1,.8,.3]); } }
    }
    }
    for (const s of sc.sites) {
      const p=s.progress??1, x=s.x, z=s.z, lv=s.level||1;
      if (p<1) { const h=.03+.12*p; addBox(x,G,z,.07,h,.07,[.86,.84,.78]); for(let y=.02;y<h;y+=.02) addBox(x,G+y,z,.076,.002,.076,[.95,.62,.2]); addCrane(x-.05,z-.05,.36,[.98,.72,.2]); addDisc(x,G+.003,z,.08,[.74,.56,.38]); continue; }
      switch (s.kind) {
        case 'hotel': for(let i=0;i<lv+1;i++) addTower(x+(i-lv/2)*.045,z+(i%2)*.03,.034,.13+.05*i,[.30,.66,.76],[.98,.80,.30]); addDisc(x,G+.002,z,.09,[.93,.88,.74]); break;
        case 'housing': for(let i=0;i<6;i++) addHouse(x+(i%3-1)*.05,z+(Math.floor(i/3)-.5)*.055,.75,[[.96,.88,.72],[.93,.80,.62],[.98,.92,.80]][i%3]); break;
        case 'park': addDisc(x,G+.003,z,.085,[.42,.74,.36],20); for(let i=0;i<7;i++){const a=i/7*6.283; addTree(x+Math.cos(a)*.055,z+Math.sin(a)*.055,.7);} addDisc(x,G+.005,z,.03,[.45,.75,.95],14); break;
        case 'solar': for(let r=0;r<3+lv*2;r++) for(let c=0;c<5;c++) addBox(x+(c-2)*.028,G+.006,z+(r-2)*.022,.024,.004,.016,[.22,.40,.86]); break;
        case 'wind': for(let i=0;i<2+lv;i++){ const wx=x+(i%3-1)*.06, wz=z+Math.floor(i/3)*.06; addCylinder(wx,G,wz,.004,.13,[.96,.96,.97],6); addBox(wx,G+.13,wz,.006,.008,.012,[.9,.9,.92]); for(let k=0;k<3;k++){ const a=k*2.094+i; addBox(wx+Math.cos(a)*.025,G+.134+Math.sin(a)*.025,wz+.008,.05,.004,.002,[.98,.98,.98],a); } } break;
        case 'academy': addBox(x,G,z,.08,.04,.05,[.96,.93,.86]); addBox(x,G+.04,z,.084,.006,.054,[.25,.62,.45]); addBox(x,G,z+.03,.02,.02,.006,[.55,.36,.2]); break;
        case 'research': addBox(x,G,z,.05,.03,.05,[.92,.94,.97]); addDome(x,G+.03,z,.024,[.55,.75,.95]); break;
        case 'warehouse': addBox(x,G,z,.12,.03,.05,[.82,.78,.70]); addBox(x,G+.03,z,.12,.006,.05,[.55,.58,.62]); for(let i=0;i<3;i++) addBox(x-.04+i*.04,G,z+.04,.025,.014,.012,[[.25,.55,.85],[.9,.35,.3],[.95,.7,.2]][i]); break;
        case 'storage': for(let i=0;i<2+lv;i++){ addBox(x+.1+i*.03,G,z,.024,.022,.04,[.95,.96,.97]); addBox(x+.1+i*.03,G+.014,z,.025,.004,.041,[.30,.75,.45]); } break;
        case 'hub': addBox(x,G,z,.11,.035,.06,[.86,.78,.62]); addBox(x,G+.035,z,.11,.008,.06,[.72,.62,.48]); for(let i=0;i<4;i++) addBox(x-.04+i*.026,G,z+.055,.022,.014,.012,[[.9,.35,.3],[.25,.55,.85],[.95,.7,.2],[.3,.7,.45]][i]); break;
        case 'peaker': addBox(x,G,z,.05,.03,.04,[.62,.62,.66]); addCylinder(x+.03,G,z,.008,.09,[.72,.72,.75],8); break;
        case 'retrofit': for(let i=0;i<5;i++) addBox(x+(i-2)*.03,G+.004,z+.06,.022,.004,.016,[.25,.45,.88]); break;
        case 'shelter': addDome(x,G,z,.032,[.97,.97,.95]); addCylinder(x,G,z,.036,.006,[.25,.72,.45],14); break;
        case 'medic': addBox(x,G,z,.03,.018,.02,[.98,.98,.98]); addBox(x,G+.018,z,.012,.002,.004,[.9,.25,.25]); addBox(x,G+.018,z,.004,.002,.012,[.9,.25,.25]); break;
        case 'generator': addBox(x,G,z,.03,.02,.018,[.98,.78,.2]); break;
        case 'microgrid': addBox(x,G,z,.03,.02,.018,[.3,.75,.45]); for(let c=0;c<3;c++) addBox(x+.04+c*.022,G+.004,z,.018,.003,.014,[.22,.40,.86]); break;
        case 'opened': addCylinder(x,G+.002,z,.10,.004,[1,.82,.3],24); break;
      }
    }
    target=mesh; lineTarget=lines; missionDirty=true;
  }

  /* ------------------------------ city builder ------------------------ */
  const cityMesh = Geo(), cityLines = {p:[], c:[]}; let cityDirty = false, cityDesc = null;
  const ZCOL = {R:[.55,.78,.45], C:[.45,.66,.92], I:[.92,.78,.38], T:[.86,.52,.78], M:[.48,.78,.72]};
  const RES = [[.96,.88,.72],[.93,.80,.62],[.98,.92,.80],[.90,.84,.74]], COM = [[.36,.62,.78],[.30,.55,.72],[.52,.72,.84]], IND = [[.78,.74,.68],[.70,.70,.72],[.82,.76,.62]];
  function buildCity(){
    cityMesh.p.length=cityMesh.c.length=cityMesh.n.length=cityLines.p.length=cityLines.c.length=0;
    target=cityMesh; lineTarget=cityLines;
    const d=cityDesc, CY=G+.011; if (d) {
      const {x0,z0,ts,n}=d, X=i=>x0+(i+.5)*ts, Z=j=>z0+(j+.5)*ts, h=ts/2;
      const quad=(i,j,y,col,s=1)=>{ const x=X(i), z=Z(j), r=h*s; addQuad([x-r,y,z-r],[x+r,y,z-r],[x+r,y,z+r],[x-r,y,z+r],col); };
      const isRoad=(i,j)=>i>=0&&j>=0&&i<n&&j<n&&d.tiles[j*n+i]&&d.tiles[j*n+i].k==='r';
      for (let j=0;j<n;j++) for (let i=0;i<n;i++) {
        const t=d.tiles[j*n+i]; if (!t) continue; const x=X(i), z=Z(j), rnd=((i*73856093)^(j*19349663))>>>0, rr=(rnd%1000)/1000;
        if (t.k==='w') { quad(i,j,CY,[.72,.60,.44]); continue; }
        if (t.k==='x') { quad(i,j,CY+.0005,t.bridge?[.55,.52,.50]:[.56,.50,.44],.9); const hz=(i>0&&d.tiles[j*n+i-1]&&(d.tiles[j*n+i-1].k==='x'||d.tiles[j*n+i-1].rail))||(i<n-1&&d.tiles[j*n+i+1]&&(d.tiles[j*n+i+1].k==='x'||d.tiles[j*n+i+1].rail));
          if (hz) { addLine([x-h,CY+.002,z-h*.25],[x+h,CY+.002,z-h*.25],[.72,.72,.76]); addLine([x-h,CY+.002,z+h*.25],[x+h,CY+.002,z+h*.25],[.72,.72,.76]); } else { addLine([x-h*.25,CY+.002,z-h],[x-h*.25,CY+.002,z+h],[.72,.72,.76]); addLine([x+h*.25,CY+.002,z-h],[x+h*.25,CY+.002,z+h],[.72,.72,.76]); }
          continue; }
        if (t.k==='r') {
          const nb=[isRoad(i,j-1),isRoad(i+1,j),isRoad(i,j+1),isRoad(i-1,j)], cnt=nb.filter(Boolean).length;
          quad(i,j,CY+.0008,t.bridge?[.55,.52,.50]:t.art?[.30,.31,.34]:t.avenue?[.33,.34,.37]:[.38,.39,.42]);
          if (t.bridge) { addBox(x,G,z,ts*.9,.004,ts*.12,[.72,.70,.66]); }
          const lc=t.art||t.avenue?[1,.86,.35]:[.95,.95,.92];
          if (cnt<=2 && (nb[1]||nb[3]) && !(nb[0]||nb[2])) addLine([x-h*.6,CY+.002,z],[x+h*.6,CY+.002,z],lc);
          else if (cnt<=2 && (nb[0]||nb[2]) && !(nb[1]||nb[3])) addLine([x,CY+.002,z-h*.6],[x,CY+.002,z+h*.6],lc);
          else if (cnt>=3) { quad(i,j,CY+.0012,[.46,.47,.50],.55); }
          if (t.stop) { addBox(x+h*.55,G,z+h*.55,ts*.22,ts*.35,ts*.1,[.98,.80,.25]); }
          if (t.rail) { addBox(x,G,z,ts*.9,CY-G+.0022,ts*.12,[.95,.95,.95]); addBox(x+h*.8,G,z+h*.8,ts*.05,ts*.5,ts*.05,[.9,.25,.25]); }
          continue;
        }
        if (t.k==='z') {
          const zc=ZCOL[t.zone];
          if (t.st===0) { quad(i,j,CY+.0004,mix(zc,[.86,.80,.66],.45),.92); continue; }
          quad(i,j,CY+.0004,t.st===4?[.55,.48,.42]:mix(zc,[.92,.88,.78],.55),.94);
          if (t.st===1) { addBox(x,G,z,ts*.5,.002,ts*.5,[.76,.64,.48]); addCylinder(x+h*.5,G,z-h*.5,.0015,ts*.35,[.6,.6,.62],4); continue; }
          if (t.st===2) { const hh=ts*(.4+.5*(t.lv||1)); addBox(x,G,z,ts*.62,hh*.7,ts*.62,[.86,.84,.78]); for(let y=.006;y<hh*.7;y+=.008) addBox(x,G+y,z,ts*.66,.0012,ts*.66,[.95,.62,.2]); if (rr<.5) addCrane(x-h*.6,z-h*.6,.12+.06*(t.lv||1),[.98,.74,.16]); continue; }
          if (t.st===4) { addBox(x,G,z,ts*.6,ts*.35,ts*.6,[.46,.40,.36]); continue; }
          const lv=t.lv||1, st=t.style||0;
          if (t.zone==='T') { if (lv===1) { addBox(x,G,z,ts*.7,ts*.5,ts*.6,[.97,.93,.86]); addBox(x+h*.35,CY+.0006,z+h*.4,ts*.3,.001,ts*.2,[.35,.75,.9]); addTree(x-h*.6,z+h*.5,.28); }
            else { addTower(x,z,ts*.6,ts*(1.4+lv*.8+rr*.5),[.96,.90,.80],[.95,.75,.4]); addBox(x+h*.45,CY+.0006,z+h*.5,ts*.35,.001,ts*.22,[.35,.75,.9]); } continue; }
          if (t.zone==='M') { const hh=ts*(.5+lv*.55); addBox(x,G,z,ts*.8,ts*.3,ts*.76,COM[st%3]); addBox(x,G+ts*.3,z,ts*.72,hh,ts*.68,RES[st%4]); for(let k=0;k<4;k++) addBox(x-ts*.3+k*ts*.2,G+ts*.3+hh,z,ts*.08,ts*.05,ts*.7,shade(RES[st%4],.88)); continue; }
          if (t.zone==='R') { if (lv===1) { addHouse(x,z,.24+.04*rr,RES[st%4],(rnd%4)*Math.PI/2); if (rr>.5) for(let k=0;k<3;k++) addBox(x-ts*.18+k*ts*.18,G+ts*.36,z-ts*.24,ts*.06,ts*.05,ts*.03,shade(RES[st%4],.85)); }
            else if (lv===2) { addBox(x,G,z,ts*.72,ts*(.9+rr*.3),ts*.72,RES[st%4]); addBox(x,G+ts*(.9+rr*.3),z,ts*.76,ts*.06,ts*.76,shade(RES[st%4],.9)); }
            else addTower(x,z,ts*.6,ts*(2.4+rr*1.4),RES[(st+1)%4],null); }
          else if (t.zone==='C') { if (lv===1) { addBox(x,G,z,ts*.78,ts*.45,ts*.7,[.94,.90,.82]); addBox(x,G+ts*.3,z+ts*.36,ts*.78,ts*.06,ts*.04,COM[st%3]); }
            else if (lv===2) addTower(x,z,ts*.68,ts*(1.3+rr*.6),COM[st%3],null);
            else addTower(x,z,ts*.62,ts*(3+rr*1.8),COM[(st+1)%3],[.98,.84,.4]); }
          else { addBox(x,G,z,ts*.86,ts*(.35+.2*lv),ts*.7,IND[st%3]); addBox(x,G+ts*(.35+.2*lv),z,ts*.86,ts*.04,ts*.7,shade(IND[st%3],.85)); if (lv>=2) addCylinder(x+h*.5,G,z-h*.4,ts*.06,ts*(.9+lv*.3),[.62,.62,.66],6); }
          continue;
        }
        if (t.k==='f') {
          quad(i,j,CY+.0004,[.86,.84,.78]);
          const f=t.fac, off=t.inactive?.55:1, c=col=>shade(col,off);
          if (f==='gas') { addBox(x,G,z,ts*.8,ts*.5,ts*.6,c([.62,.62,.66])); addCylinder(x+h*.45,G,z,ts*.1,ts*1.6,c([.7,.7,.74]),8); }
          else if (f==='solar') { for(let a=0;a<3;a++) for(let b=0;b<3;b++) addBox(x+(a-1)*ts*.3,CY+.0006,z+(b-1)*ts*.3,ts*.24,.0015,ts*.18,c([.22,.40,.86])); }
          else if (f==='battery') { for(let a=0;a<3;a++){ addBox(x+(a-1)*ts*.3,G,z,ts*.22,ts*.35,ts*.5,c([.95,.96,.97])); addBox(x+(a-1)*ts*.3,G+ts*.25,z,ts*.23,ts*.04,ts*.51,c([.3,.75,.45])); } }
          else if (f==='pump') { addCylinder(x,G,z,ts*.3,ts*.35,c([.45,.66,.9]),12); addBox(x+h*.5,G,z+h*.4,ts*.3,ts*.25,ts*.3,c([.9,.9,.92])); }
          else if (f==='tower') { addCylinder(x,G,z,ts*.05,ts*1.1,c([.8,.8,.82]),6); addCylinder(x,G+ts*1.1,z,ts*.28,ts*.3,c([.45,.66,.9]),12); }
          else if (f==='school') { addBox(x,G,z,ts*.86,ts*.45,ts*.6,c([.97,.93,.84])); addBox(x,G+ts*.45,z,ts*.9,ts*.06,ts*.64,c([.92,.52,.25])); }
          else if (f==='training') { addBox(x,G,z,ts*.8,ts*.55,ts*.6,c([.94,.94,.9])); addBox(x,G+ts*.55,z,ts*.84,ts*.06,ts*.64,c([.25,.62,.45])); }
          else if (f==='clinic') { addBox(x,G,z,ts*.8,ts*.6,ts*.7,c([.98,.98,.98])); addBox(x,G+ts*.6,z,ts*.3,ts*.03,ts*.09,c([.9,.25,.25])); addBox(x,G+ts*.6,z,ts*.09,ts*.03,ts*.3,c([.9,.25,.25])); }
          else if (f==='park') { quad(i,j,CY+.0008,[.42,.74,.36],.95); for(let a=0;a<3;a++) addTree(x+(a-1)*ts*.28,z+(a%2?.2:-.2)*ts,.35); }
          else if (f==='emergency') { addBox(x,G,z,ts*.8,ts*.45,ts*.7,c([.86,.28,.24])); addBox(x,G+ts*.45,z,ts*.3,ts*.35,ts*.3,c([.95,.95,.95])); }
          else if (f==='terminal') { addBox(x,G,z,ts*.9,ts*.12,ts*.6,c([.62,.64,.66])); for(let a=0;a<3;a++) for(let b=0;b<2;b++) addBox(x-ts*.3+a*ts*.3,G+ts*.12+b*ts*.1,z,ts*.24,ts*.1,ts*.16,c([[.85,.3,.25],[.2,.5,.85],[.95,.7,.2]][(a+b)%3])); addBox(x,G,z-ts*.3,ts*.05,ts*.6,ts*.05,c([.95,.75,.2])); addBox(x,G+ts*.6,z,ts*.9,ts*.05,ts*.05,c([.95,.75,.2])); }
          else if (f==='invest') { if (t.opened) { addTower(x,z,ts*.7,ts*3.2,[.55,.78,.9],[.98,.84,.4]); addBox(x,G,z,ts*.95,ts*.3,ts*.95,[.92,.9,.86]); } else { for (const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]) addBox(x+a*h*.9,G,z+b*h*.9,ts*.04,ts*.2,ts*.04,[.4,.62,.85]); addBox(x,G+ts*.15,z-h*.9,ts*.9,ts*.02,ts*.02,[.4,.62,.85]); addCylinder(x,G,z,ts*.03,ts*.8,[.6,.62,.66],5); addBox(x,G+ts*.8,z,ts*.4,ts*.18,ts*.03,[.25,.55,.85]); } }
          else if (f==='digital') { addBox(x,G,z,ts*.5,ts*.4,ts*.5,c([.9,.92,.96])); addCylinder(x,G+ts*.4,z,ts*.03,ts*1.3,c([.75,.75,.8]),5); }
          continue;
        }
      }
      if (d.overlay) for (let j=0;j<n;j++) for (let i=0;i<n;i++) { const c=d.overlay[j*n+i]; if (c) quad(i,j,CY+.003,c,.96); }
      for (const p of d.preview||[]) quad(p.i,p.j,CY+.004,p.ok?[.45,.95,.55]:[.98,.35,.3],.9);
      for (const r of d.routes||[]) for (let k=1;k<r.path.length;k++) { const a=r.path[k-1], b=r.path[k]; addLine([X(a%n),CY+.006,Z((a/n)|0)],[X(b%n),CY+.006,Z((b/n)|0)],r.color); }
      // district boundary
      const x1=x0+n*ts, z1=z0+n*ts; for (const [a,b] of [[[x0,z0],[x1,z0]],[[x1,z0],[x1,z1]],[[x1,z1],[x0,z1]],[[x0,z1],[x0,z0]]]) addLine([a[0],CY+.0001,a[1]],[b[0],CY+.0001,b[1]],[1,.85,.4]);
    }
    target=mesh; lineTarget=lines; cityDirty=true;
  }

  /* ------------------------------ buffers --------------------------- */
  function upload(geo, buf, usage=gl.STATIC_DRAW){
    buf = buf || {p:gl.createBuffer(), c:gl.createBuffer(), n:gl.createBuffer()};
    gl.bindBuffer(gl.ARRAY_BUFFER,buf.p); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(geo.p),usage);
    gl.bindBuffer(gl.ARRAY_BUFFER,buf.c); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(geo.c),usage);
    if (geo.n && buf.n) { gl.bindBuffer(gl.ARRAY_BUFFER,buf.n); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(geo.n),usage); }
    buf.count = geo.p.length/3; return buf;
  }
  // Picking colours: each triangle is tagged with the project whose footprint contains it (0 = not a project).
  function idColors(geo){ const P3=geo.p, n=P3.length/3, out=new Float32Array(n*3);
    for (let v=0; v+2<n; v+=3) { const i=v*3, cx=(P3[i]+P3[i+3]+P3[i+6])/3, cz=(P3[i+2]+P3[i+5]+P3[i+8])/3, id=LY.footprintAt(cx,cz), k=id?PIDX[id]:0;
      if (!k) continue; for (let j=0;j<3;j++){ out[(v+j)*3]=(k&255)/255; out[(v+j)*3+1]=((k>>8)&255)/255; out[(v+j)*3+2]=1; } }
    return out; }
  function uploadIds(geo, buf){ buf.id = buf.id || gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf.id); gl.bufferData(gl.ARRAY_BUFFER,idColors(geo),gl.STATIC_DRAW); return buf; }
  const meshBuf = uploadIds(mesh, upload(mesh)), detailBuf = upload(detailMesh), cloudBuf = upload(cloudGeo), lineBuf = upload({p:lines.p,c:lines.c}, {p:gl.createBuffer(),c:gl.createBuffer()});
  // Top of each project's model (for label placement): the highest vertex inside its footprint.
  const topY = Object.fromEntries(D.projects.map(p => [p.id, G+.1]).concat([[CORE_ID, G+.1]], PLACE_IDS.map(id => [id, G+.06])));
  for (let i=0;i<mesh.p.length;i+=3) { const id=LY.footprintAt(mesh.p[i],mesh.p[i+2]); if (id && mesh.p[i+1]>topY[id]) topY[id]=mesh.p[i+1]; }
  let stageBuf = null, stageLineBuf = null, vehBuf = null, missionBuf = null, missionLineBuf = null, cityBuf = null, cityLineBuf = null;
  const waterBuf = {p:gl.createBuffer(), s:gl.createBuffer(), i:gl.createBuffer(), count:WATER.idx.length};
  gl.bindBuffer(gl.ARRAY_BUFFER,waterBuf.p); gl.bufferData(gl.ARRAY_BUFFER,WATER.pos,gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,waterBuf.s); gl.bufferData(gl.ARRAY_BUFFER,WATER.shore,gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,waterBuf.i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,WATER.idx,gl.STATIC_DRAW);
  const dynPB=gl.createBuffer(), dynCB=gl.createBuffer(), dynSB=gl.createBuffer();
  window.__visionStats={triangles:(meshBuf.count+detailBuf.count+cloudBuf.count)/3, detailTriangles:detailBuf.count/3, water:WATER.idx.length/3, lines:lineBuf.count/2};

  const U = (prog, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(prog, n)]));
  const loc = {
    m:{pos:gl.getAttribLocation(meshProgram,'aPosition'),col:gl.getAttribLocation(meshProgram,'aColor'),nrm:gl.getAttribLocation(meshProgram,'aNormal'),
       ...U(meshProgram,['uVP','uLightVP','uOffset','uShadow','uSun','uEye','uStorm','uDist','uShadowOn','uTexel','uGlow','uGround','uTime','uTint','uNight'])},
    d:{pos:gl.getAttribLocation(depthProgram,'aPosition'), ...U(depthProgram,['uLightVP','uOffset'])},
    k:{pos:gl.getAttribLocation(pickProgram,'aPosition'),col:gl.getAttribLocation(pickProgram,'aColor'),uVP:gl.getUniformLocation(pickProgram,'uVP')},
    w:{pos:gl.getAttribLocation(waterProgram,'aPosition'),shore:gl.getAttribLocation(waterProgram,'aShore'), ...U(waterProgram,['uVP','uTime','uSun','uEye','uStorm','uDist','uTint','uNight'])},
    p:{pos:gl.getAttribLocation(pointProgram,'aPosition'),col:gl.getAttribLocation(pointProgram,'aColor'),size:gl.getAttribLocation(pointProgram,'aSize'),vp:gl.getUniformLocation(pointProgram,'uVP'),scale:gl.getUniformLocation(pointProgram,'uScale'),round:gl.getUniformLocation(pointProgram,'uRound')}
  };
  const MAXA=gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
  function resetAttribs(){ for(let i=0;i<Math.min(8,MAXA);i++) gl.disableVertexAttribArray(i); }
  function attr(l, b, size){ if(l<0) return; gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l,size,gl.FLOAT,false,0,0); }
  function bindAttr(l, pb, cb){ attr(l.pos,pb,3); attr(l.col,cb,3); }

  /* ---------------------------- shadow map -------------------------- */
  const SUN = norm3([-0.55, 1.0, 0.62]);
  let resScale = 1;
  const SHADOW_SIZE = 2048;
  const shadowTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,SHADOW_SIZE,SHADOW_SIZE,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  for (const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
  const shadowFB = gl.createFramebuffer(), shadowRB = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, shadowRB); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHADOW_SIZE, SHADOW_SIZE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shadowRB);
  let shadowsSupported = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const ortho = (h, n, f) => new Float32Array([1/h,0,0,0, 0,1/h,0,0, 0,0,-2/(f-n),0, 0,0,-(f+n)/(f-n),1]);
  let lightVP = new Float32Array(16), quality = 'high';

  /* ------------------------------ camera ---------------------------- */
  const K = D.regions.kingdom;
  const FOV = .5, EYE = Math.tan(.36)/Math.tan(FOV/2); // narrower lens = closer to an isometric miniature look
  const camera = {az:K.az-.35, el:1.42, dist:K.dist*1.5, target:[K.x,0,K.z], desired:{az:K.az, el:K.el, dist:K.dist, target:[K.x,0,K.z]}};
  let width=0, height=0, dpr=1, vp, eye=[0,0,0], storm=0, stormTarget=0, directMode=false, selectedId=null, hoverId=null, onSelect=()=>{};
  let onPlace=()=>{}, onRegion=()=>{}, hazard=null, entities=[], overlay=[], convoyList=[], groundHandler=null, tint=[.80,.58,.32], follow=null;
  const TINTS={dust:[.80,.58,.32], rain:[.50,.58,.68], heat:[1.0,.74,.50]};
  const dynLines={p:[],c:[]}; let dynLineBuf=null;
  let night=0, nightTarget=0, camSpeed=1, beaconsOn=true, bursts=[], missionScene=null, missionLights=[];
  const bounds={minX:-7,maxX:8,minZ:-6,maxZ:7};

  function resize(){dpr=Math.min(devicePixelRatio||1,quality==='low'?1:2)*resScale;const w=Math.floor(innerWidth*dpr),h=Math.floor(innerHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}width=w;height=h;gl.viewport(0,0,w,h);}
  function updateCamera(dt){
    const k=1-Math.pow(.001,dt/1000*0.9*camSpeed);
    camera.az+=(camera.desired.az-camera.az)*k; camera.el+=(camera.desired.el-camera.el)*k; camera.dist+=(camera.desired.dist-camera.dist)*k;
    for (let i=0;i<3;i++) camera.target[i]+=(camera.desired.target[i]-camera.target[i])*k;
    const ce=Math.cos(camera.el), ed=camera.dist*EYE;
    eye=[camera.target[0]+Math.sin(camera.az)*ce*ed, camera.target[1]+Math.sin(camera.el)*ed, camera.target[2]+Math.cos(camera.az)*ce*ed];
    vp=M4.multiply(M4.perspective(FOV,width/height,.1,140),M4.lookAt(eye,camera.target));
  }
  function setDesired(az,el,dist,x,z,y=0){camera.desired={az,el,dist,target:[x,y,z]};}

  /* -------------------------- dynamic points ------------------------ */
  const roadPaths = LY.intercity.concat(LY.CITY_ROADS.map(r => r.pts)), railPaths = LY.rails;
  const shipLanes = [[[43.3,12.6],[41.0,15.0],[38.6,19.5],[37.0,23.5],[35.3,26.9],[34.75,28.3]],[[56.6,26.4],[54.0,26.2],[52.0,26.8],[50.5,27.2],[49.9,27.2]],[[56.6,26.4],[57.5,24.5],[59.6,22.4],[58.0,19.0],[52.0,15.2],[45.0,12.2],[43.3,12.6]]].map(l=>l.map(([a,b])=>geo(a,b)));
  const pathLen = path => { let L=[0]; for(let i=1;i<path.length;i++)L.push(L[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1])); return L; };
  const along = (path, L, q) => { const d=q*L[L.length-1]; let i=1; while(i<L.length-1&&L[i]<d)i++; const t=(d-L[i-1])/((L[i]-L[i-1])||1); return [path[i-1][0]+(path[i][0]-path[i-1][0])*t, path[i-1][1]+(path[i][1]-path[i-1][1])*t]; };
  const roadL=roadPaths.map(pathLen), railL=railPaths.map(pathLen), shipL=shipLanes.map(pathLen);
  const dp=[], dc=[], ds=[], wakes=[];
  const CLUSTER_DIST = 8.5;
  const cityLights = []; { const rl=(s=>()=>{s=(s*16807)%2147483647;return s/2147483647;})(77); for (const c of D.cities) { const n=Math.round(20+c.size*110), R=.06+c.size*.3; for (let i=0;i<n;i++){ const a=rl()*6.283, r=Math.sqrt(rl())*R; const warm=rl(); cityLights.push([c.x+Math.cos(a)*r, c.z+Math.sin(a)*r*.85, 1, .72+warm*.2, .38+warm*.25, 2.2+rl()*2.2]); } } }
  const clusters = Object.values(D.projects.filter(p=>p.cl).reduce((m,p)=>{ const d=LY.cityDisplay[p.cl], c=d?{x:d[0],z:d[1]}:C(p.cl); (m[p.cl]=m[p.cl]||{anchor:p.cl,x:c.x,z:c.z,ids:[]}).ids.push(p.id); return m; },{}));
  const heading=(path,L,q,dir)=>{const a=along(path,L,Math.min(.9999,Math.max(0,q))),b=along(path,L,Math.min(.9999,Math.max(0,q+(dir?.002:-.002))));return [a[0],a[1],Math.atan2(b[1]-a[1],b[0]-a[0])];};
  const flights=[['Riyadh','Jeddah'],['Riyadh','Dammam'],['Jeddah','Tabuk'],['Riyadh','Abha'],['Madinah','Riyadh']].map(([a,b])=>[C(a),C(b)]);
  function buildVehicles(t){
    vehGeo.p.length=vehGeo.c.length=vehGeo.n.length=0; wakes.length=0; target=vehGeo;
    shipLanes.forEach((path,r)=>{const L=shipL[r];for(let k=0;k<4;k++){
      const dir=k%2, q=((t*.000012)/L[L.length-1]*6+k/4+r*.13)%1, [x,z,rot]=heading(path,L,dir?q:1-q,dir), cs=Math.cos(rot), sn=Math.sin(rot);
      const hull=(k+r)%3===0?[.92,.30,.24]:[.20,.36,.62];
      addBox(x,SEA-.004,z,.075,.016,.022,hull,rot); addBox(x,SEA+.012,z,.07,.004,.02,[.97,.97,.95],rot);
      addBox(x-cs*.028,SEA+.016,z-sn*.028,.014,.022,.018,[1,1,1],rot);
      for(let c=0;c<3;c++){const o=-.008+c*.016;addBox(x+cs*o,SEA+.016,z+sn*o,.013,.012,.017,[[.95,.62,.18],[.28,.66,.42],[.86,.26,.24]][(c+k)%3],rot);}
      for(let w=1;w<5;w++) wakes.push([x-cs*(.03+w*.018),z-sn*(.03+w*.018),5-w*.8]);
    }});
    railPaths.forEach((path,r)=>{const L=railL[r];for(let k=0;k<2;k++){const q0=((t*.00005)/L[L.length-1]*4+k*.5+r*.17)%1;
      for(let c=0;c<4;c++){const q=Math.max(.001,q0-c*.0065*(3/L[L.length-1])),[x,z,rot]=heading(path,L,q,true);
        addBox(x,G+.006,z,.03,.013,.013,r===0?[.98,.96,.92]:[.30,.55,.85],rot); addBox(x,G+.019,z,.03,.002,.014,r===0?[.86,.68,.30]:[.95,.95,.95],rot);}}});
    flights.forEach(([a,b],i)=>{const q=((t*.00002*(1+i*.13))+i*.21)%1, f=i%2?q:1-q, A=i%2?a:b, B=i%2?b:a;
      const x=A.x+(B.x-A.x)*f, z=A.z+(B.z-A.z)*f, y=G+.12+Math.sin(Math.PI*f)*.45, rot=Math.atan2(B.z-A.z,B.x-A.x), cs=Math.cos(rot), sn=Math.sin(rot);
      addBox(x,y,z,.07,.012,.012,[.98,.98,.98],rot); addBox(x,y+.004,z,.016,.003,.085,[.90,.92,.95],rot);
      addBox(x-cs*.03,y+.006,z-sn*.03,.012,.018,.004,[.14,.52,.34],rot); addBox(x-cs*.03,y+.006,z-sn*.03,.01,.003,.03,[.9,.92,.95],rot);});
    for (const cv of convoyList) { const cs=Math.cos(cv.rot), sn=Math.sin(cv.rot);
      addBox(cv.x,G+.003,cv.z,.034,.016,.014,cv.color||[.95,.62,.18],cv.rot); addBox(cv.x+cs*.024,G+.003,cv.z+sn*.024,.013,.018,.014,[.96,.96,.94],cv.rot); }
    const bladeCol=[.97,.97,.96];
    for (const [x,y,z,k] of turbines){ const a0=t*.003+x*7; for(let b=0;b<3;b++){const a=a0+b*2.094,L=.075*k,w=.006*k,ca=Math.cos(a),sa=Math.sin(a),px=-sa*w,py=ca*w;
      addTri([x+px,y+py,z],[x-px,y-py,z],[x+ca*L,y+sa*L,z],bladeCol);}}
    target=mesh;
  }
  function dynamicPoints(t){
    dp.length=dc.length=ds.length=0;
    const push=(x,y,z,c,sz)=>{dp.push(x,y,z);dc.push(c[0],c[1],c[2]);ds.push(sz);};
    const clustered = camera.dist > CLUSTER_DIST;
    if (beaconsOn)
    for (const pr of D.projects) {
      const st=projectState[pr.id], sel=selectedId===pr.id, hov=hoverId===pr.id, tiers=tierCount(st);
      if (!beaconsOn && !sel) continue;
      if (clustered && pr.cl && !sel && !hov) continue;
      const top=beaconTop(st,pr.id), pulse=Math.sin(t*.003+pr.x*3)*.01;
      const col = st.health==='blocked'?[.95,.35,.28]:st.health==='waiting'?[1,.72,.2]:st.done>=6?[1,.86,.3]:pr.color;
      push(pr.pad[0],top+.02+pulse+(sel?.03:0),pr.pad[1],sel?[1,.95,.55]:col,sel?15:hov?13:10);
      if (st.active) for (let i=0;i<3;i++){const a=t*.0024+i/3*6.283,r=.035;push(pr.pad[0]+Math.cos(a)*r,G+.02+i*.01,pr.pad[1]+Math.sin(a)*r,pr.color,3.5);}
    }
    if (clustered && beaconsOn) for (const cl of clusters) { const pulse=Math.sin(t*.003+cl.x)*.012; push(cl.x,G+.34+pulse,cl.z,[1,.82,.3],19); push(cl.x,G+.34+pulse,cl.z,[1,1,.9],9); }
    roadPaths.forEach((path,r)=>{const L=roadL[r],n=Math.max(4,Math.round(L[L.length-1]*6));for(let i=0;i<n;i++){const dir=i%2,q=((t*.00003*(1+r%3*.3))/L[L.length-1]*3+i/n)%1,[x,z]=along(path,L,dir?q:1-q);push(x,G+.02,z,dir?[1,.92,.45]:[1,.98,.9],3.2);}});
    for (const w of wakes) push(w[0],SEA+.004,w[1],[1,1,1],w[2]);
    const mk=C('Makkah'); for(let i=0;i<48;i++){const a=i*.82+t*.00015,r=.035+(i%5)*.008;push(mk.x+Math.cos(a)*r,G+.012,mk.z+Math.sin(a)*r,[.99,.99,.96],2.2);}
    const hj=P('hajj'); for(let i=0;i<30;i++){const q=((t*.00004)+i/30)%1;push(hj.x+(mk.x-hj.x)*q+Math.sin(i*7)*.01,G+.012,hj.z+(mk.z-hj.z)*q+Math.cos(i*5)*.01,[.99,.99,.96],2.2);}
    { const MR=LY.METRO_ROUTE, ML=pathLen(MR); for (let k=0;k<3;k++) for (let j=0;j<4;j++){ const q=((t*.00005)+k/3+j*.004)%1, [x,z]=along(MR,ML,q); push(x,G+.016,z,[.62,.90,1],4.8); } }
    const ry=C('Riyadh'); for(let i=0;i<30;i++){const a=i*2.1+t*.0004,r=.03+(i%6)*.016;push(ry.x+Math.cos(a)*r,G+.02+(i%4)*.02,ry.z+Math.sin(a)*r,[1,.76,.3],3);}
    if (hazard && hazard.plumes) {   // exposure-driven dust: a plume at each site in proportion to its simulated exposure, plus light haze
      const hz=hazard;
      for (const pl of hz.plumes) { const n=Math.round(150*pl.e); for(let i=0;i<n;i++){ const q=Math.sqrt((i*17.17+t*.0003)%1), ang=i*2.399+t*.0004, r=.05+.13*pl.e;
        const x=pl.x+Math.cos(ang)*q*r, z=pl.z+Math.sin(ang)*q*r*.85;
        if (hz.type==='rain') push(x, G+.02+(((i*.37)+t*.0012)%1)*(.2+.3*pl.e), z, [.72,.82,.95], 2.4);            // falling rain streaks
        else if (hz.type==='heat') push(x, G+.02+(((i*.21)+t*.00025)%1)*.22, z, i%2?[1,.62,.36]:[1,.82,.5], 2.2+(i%3));   // rising heat shimmer
        else push(x, G+.03+((i%11)/11)*(.18+.3*pl.e), z, i%3?[.80,.56,.30]:[.70,.46,.24], 3+(i%4)*1.4); } }
      const na=Math.round(160*hz.intensity); for(let i=0;i<na;i++){ const q=Math.sqrt((i*13.31+t*.00012)%1), ang=i*2.399+t*.0001;
        push(hz.x+Math.cos(ang)*q*hz.r, G+.05+((i%7)/7)*.4, hz.z+Math.sin(ang)*q*hz.r*.85, hz.type==='rain'?[.70,.78,.88]:hz.type==='heat'?[1,.80,.58]:[.84,.66,.44], 2.2); } }
    else if (hazard && hazard.intensity>.02) {
      const hz=hazard, n=Math.round(520*hz.intensity);
      for(let i=0;i<n;i++){ const q=Math.sqrt((i*17.17+t*.00022)%1), ang=i*2.399+t*.0003, x=hz.x+Math.cos(ang)*q*hz.r, z=hz.z+Math.sin(ang)*q*hz.r*.85;
        if (hz.type==='rain') push(x,G+.02+(((i*.37)+t*.0012)%1)*.5,z,[.72,.82,.95],2.4);
        else if (hz.type==='heat') push(x,G+.02+(((i*.21)+t*.00025)%1)*.3,z,i%2?[1,.62,.36]:[1,.82,.5],2.2+(i%3));
        else push(x,G+.03+((i%13)/13)*.45,z,i%3?[.80,.56,.30]:[.70,.46,.24],3+(i%4)*1.5); }
    }
    // Simulation entities: support units, challenge assets, site beacons
    for (const e of entities) push(e.x,(e.y??G+.06)+(e.pulse?Math.sin(t*.006)*.01:0),e.z,e.color,e.size||10);
    // Flow dots along overlay layers (logistics, grid, dependencies)
    for (const o of overlay) if (o.flow) { const P2=o._pts||[o.a,o.b], PL=o._L||pathLen(P2), L=PL[PL.length-1]; const n=o.n!=null?o.n:Math.max(1,Math.round(L*5)); const sp=(o.speed||1)*.00012, y=o.y??G+.03; for(let i=0;i<n;i++){ let q=((t*sp)/Math.max(.2,L)+i/n+(o.phase||0))%1; if(o.both&&i%2) q=1-q; const [x,z]=along(P2,PL,q); push(x,y,z,o.color,o.size||3.4); } }
    // City lights at night
    if (night>.28) { const k=Math.min(1,(night-.28)/.3); for (const c of cityLights) push(c[0],G+.012,c[1],[c[2],c[3],c[4]],c[5]*k); for (const c of missionLights) push(c[0],G+.02,c[1],[1,.86,.52],(c[2]||4)*k); }
    // Celebration bursts
    for (let bi=bursts.length-1; bi>=0; bi--) { const b=bursts[bi], age=t-b.t0; if (age>2400) { bursts.splice(bi,1); continue; }
      const pal=[[1,.84,.3],[.35,.85,.5],[1,1,1],[.98,.55,.2],[.45,.7,1]];
      for (let i=0;i<60;i++) { const a=i*2.399, sp=.00012+(i%7)*.000018, r=age*sp, vy=.00022+(i%5)*.00004; const y=G+.08+vy*age-2.2e-10*age*age; if (y<G) continue; push(b.x+Math.cos(a)*r,y,b.z+Math.sin(a)*r,pal[i%5],4.5*(1-age/2600)+1); } }
    gl.bindBuffer(gl.ARRAY_BUFFER,dynPB);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(dp),gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,dynCB);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(dc),gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,dynSB);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ds),gl.DYNAMIC_DRAW);
    return dp.length/3;
  }

  /* ------------------------------ labels ---------------------------- */
  const labelLayer = document.createElement('div'); labelLayer.id='mapLabels'; labelLayer.setAttribute('aria-hidden','true');
  canvas.insertAdjacentElement('afterend', labelLayer);
  const labels = [];
  let projLabelsOn = true;
  function makeLabel(text, cls, x, y, z, priority){ const el=document.createElement('span'); el.className='map-label '+cls; el.textContent=text; labelLayer.appendChild(el); const L={el,x,y,z,priority,w:0,h:0,dx:0,dy:0,base:text}; labels.push(L); return L; }
  for (const l of D.labels) { if (l.kind==='place' && LY.planAt(...geo(l.lon,l.lat), .1)) continue; const [x,z]=geo(l.lon,l.lat); makeLabel(l.text, l.kind, x, l.kind==='sea'?SEA:l.kind==='place'?G:NEI, z, l.kind==='place'?8:l.kind==='sea'?1:0); }
  // City labels sit where the city is drawn (its place on a regional plan); on a plan they select that place.
  const placeOfCity = name => Object.values(LY.places || {}).find(q => q.city === name);
  for (const c of D.cities) { const d=LY.cityDisplay[c.name]||[c.x,c.z], pl=placeOfCity(c.name), L=makeLabel(c.name, 'city pal-'+c.palette+(c.capital?' capital':''), d[0], G+.1, d[1], c.priority||(3+c.size*4)); L.dx=pl?0:(c.dx||0); L.dy=pl?0:(c.dy||0); if (pl) { L.el.dataset.pid=pl.id; L.place=true; } }
  // Districts that are not cities (Al Qatif, Dhahran, Al Khobar...), the subtle regional headings, and clickable region
  // names on the national view.
  for (const q of Object.values(LY.places || {})) if (!q.city) { const L=makeLabel(q.name.en, 'city pal-coast place', q.x, G+.08, q.z, 4); L.el.dataset.pid=q.id; L.place=true; L.district=true; }
  for (const [k, v] of Object.entries(LY.REGION_VIEWS || {})) { if (v.heading) { const H=makeLabel(v.heading.text.en, 'region-heading', v.heading.at[0], G+.02, v.heading.at[1], 1.4); H.heading=true; }
    const L=makeLabel(v.name.en, 'region-name', v.kingdomLabel[0], G+.05, v.kingdomLabel[1], 20); L.region=k; L.el.dataset.region=k; }
  { const L=makeLabel('Riyadh Region', 'region-name', LY.R(0,0)[0]+.05, G+.05, LY.R(0,0)[1]+1.15, 20); L.region='riyadh'; L.el.dataset.region='riyadh'; }
  for (const r of (LY.planRoads || [])) if (r.kind === 'causeway' && r.name) { const m=r.pts[1]; const L=makeLabel(r.name.en, 'road-name', m[0], SEA+.04, m[1]+.02, 1.2); L.road=true; }
  const projLabel = makeLabel('', 'project', 0, 0, 0, 10);
  // Honest framing: the Riyadh districts are an illustrative plan, not survey geography.
  const noteLabel = (() => { const r=C('Riyadh'); const L=makeLabel('Illustrative district plan · not to scale', 'map-note', r.x-.40, G, r.z+.66, 2.5); L.note=true; return L; })();
  // Corridor names, shown only in the closer planning views and dropped first when space is short.
  const ROAD_LABEL_AT = {kingFahd:[0,-.37], kingSalman:[-.46,-.48], kingKhalid:[-.70,-.62], northRing:[-.58,-.26]};
  const roadLabels = LY.CITY_ROADS.filter(r => ROAD_LABEL_AT[r.id]).map(r => { const [x,z]=LY.R(...ROAD_LABEL_AT[r.id]); const L=makeLabel(r.name.en, 'road-name', x, G+.01, z, 1.2); L.road=true; return L; });
  // ★ Riyadh sits just above the split-top tower (never over its silhouette) and selects the downtown place.
  { const L=labels.find(q => q.base==='Riyadh' && q.el.classList.contains('city')); if (L) { L.x=C('Riyadh').x+KC.dx; L.z=C('Riyadh').z+KC.dz; L.y=G+KC.h+.03; /* just above the tip: clear of the tower, not drifting over districts to the north */ L.el.dataset.pid=CORE_ID; } }
  const clusterLabels = clusters.map(cl => { const L=makeLabel(cl.anchor+' · '+cl.ids.length+' projects', 'cluster', cl.x, G+.34, cl.z, 9.5); L.cluster=true; return L; });
  // Project name labels hold a full and a short variant (each translated once by the Arabic layer); the placer picks the
  // variant that fits, anchors the label just above the model's real top, and lets the player click it.
  const ESSENTIAL_LABELS = new Set(['sports', 'newmurabba', 'ksip', 'expo', 'metro']);   // kept visible first when space is tight
  const mapName = p => (LY.MAP_NAME && LY.MAP_NAME[p.id] && LY.MAP_NAME[p.id].en) || p.name;   // e.g. 'Jubail - Energy & Industry'
  const smallProjLabels = D.projects.map(p => { const L=makeLabel('', 'proj-small', p.x, G+.16, p.z, 1.5); L.small=true; L.pid=p.id; L.el.dataset.pid=p.id;
    L.el.innerHTML='<span class="lf"></span><span class="ls"></span>'; L.el.children[0].textContent=mapName(p); L.el.children[1].textContent=LY.SHORT[p.id]||mapName(p); return L; });
  const dynLabels = new Map();
  function setDynLabels(list){
    const keep=new Set();
    for (const d of list) { keep.add(d.id); let L=dynLabels.get(d.id);
      if (!L) { L=makeLabel(d.text,'dyn '+(d.cls||''),d.x,G+.12,d.z,12); dynLabels.set(d.id,L); }
      if (L.el.textContent!==d.text) { L.el.textContent=d.text; L.w=0; }
      L.el.className='map-label dyn '+(d.cls||''); L.x=d.x; L.z=d.z; }
    for (const [id,L] of dynLabels) if (!keep.has(id)) { L.el.remove(); labels.splice(labels.indexOf(L),1); dynLabels.delete(id); }
  }
  function project(p){const v=M4.transform(vp,p);if(v[3]<=0.01)return null;const nx=v[0]/v[3],ny=v[1]/v[3];return [(nx*.5+.5)*width/dpr,(-ny*.5+.5)*height/dpr,v[2]/v[3]];}
  // HUD controls that labels must never cover (re-measured a few times a second, not every frame).
  const OBSTACLES = '#modeNav, .topbar, #navigator, #dock, #bottombar, #messageRibbon, .map-controls, #mcard, #mmeasures, #mMenuBtn, #decision, #planTray, #actionBar, #report, #results, .ctop, #cTools, #cPanel, #menuCard, #profileChip, #langBtn, #soundBtn, #pickChoices, #challengePanel, #challengeTop, #unitBar, #reviewCard, #coach, #banner, #chapter, .sheet:not(.hidden)';
  let obstacles = [], obstaclesAt = 0;
  function refreshObstacles(){ obstacles = []; for (const el of document.querySelectorAll(OBSTACLES)) { if (!el.getClientRects().length) continue; const cs=getComputedStyle(el); if (cs.visibility==='hidden' || +cs.opacity===0) continue; const r=el.getBoundingClientRect(); if (r.width>2 && r.height>2) obstacles.push({x:r.left,y:r.top,w:r.width,h:r.height}); } }
  const hits = (r, q, px=4, py=2) => r.x < q.x+q.w+px && r.x+r.w+px > q.x && r.y < q.y+q.h+py && r.y+r.h+py > q.y;
  function measure(L){ // (re)measure when the text changes, e.g. after the Arabic layer translates it
    const txt = L.small ? L.el.children[0].textContent+'|'+L.el.children[1].textContent : L.el.textContent;
    if (L.mText === txt && L.w) return; L.mText = txt;
    if (L.small) { L.el.classList.remove('use-short'); L.wF=L.el.offsetWidth||60; L.el.classList.add('use-short'); L.wS=L.el.offsetWidth||40; L.el.classList.remove('use-short'); L.h=L.el.offsetHeight||16; L.w=L.wF; }
    else { L.w=L.el.offsetWidth||60; L.h=L.el.offsetHeight||18; } }
  function updateLabels(){
    const far = camera.dist, now = performance.now(), cx = innerWidth/2, cy = innerHeight/2, diag = Math.hypot(cx, cy);
    if (now - obstaclesAt > 350) { obstaclesAt = now; refreshObstacles(); }
    labelLayer.classList.toggle('selectable', selectable && !groundHandler);   // while a dispatch/placement tool is active, clicks go to the ground
    const focus = hoverId || selectedId, cand = [];
    for (const L of labels) {
      let show = true, x=L.x, y=L.y, z=L.z, pri=L.priority;
      if (L===projLabel) { const p=focus&&P(focus); if(!p||!projLabelsOn){show=false;} else { if (L.el.textContent!==mapName(p)) { L.el.textContent=mapName(p); } L.el.dataset.pid=p.id; x=p.x; z=p.z; y=topY[p.id]+.035; } }
      else if ((L.cluster||L.small) && !projLabelsOn) show = false;
      else if (L.cluster) show = far > CLUSTER_DIST;
      else if (L.region) show = far > 9;
      else if (L.district) show = far < 7;
      else if (L.heading) show = far < 6.5;
      else if (L.note) show = projLabelsOn && far < 5.2;
      else if (L.road) show = projLabelsOn && far < 4.2;
      else if (L.small) { show = far < (innerWidth < 600 ? 6.2 : 5.2) && L.pid!==focus;   /* phones frame regions from further out */ y = topY[L.pid]+.012; }
      else if (L.el.classList.contains('country')||L.el.classList.contains('sea')) show = far > 6.5;
      else if (!L.el.classList.contains('capital')) show = far < 24;
      const s = show && project([x,y,z]);
      if (!s || s[2]>1 || s[0]<-60 || s[1]<-30 || s[0]>innerWidth+60 || s[1]>innerHeight+30) { L.el.style.opacity=0; continue; }
      if (L.small) pri = 2 + .9 * (1 - Math.min(1, Math.hypot(s[0]-cx, s[1]-cy) / diag)) + (ESSENTIAL_LABELS.has(L.pid) ? 1 : 0);   // nearer the middle = more relevant; key districts first
      cand.push({L, s, pri});
    }
    cand.sort((a,b) => b.pri - a.pri);
    const placed = [];
    for (const {L, s} of cand) {
      measure(L); if (L===projLabel) { L.w=L.el.offsetWidth; L.h=L.el.offsetHeight; }
      const lift = L.el.classList.contains('city')||L===projLabel||L.cluster ? 18 : L.small ? 8 : 0;
      const at = w => ({x:Math.max(6, Math.min(innerWidth - w - 6, s[0]-w/2+(far>7?L.dx:0))), y:s[1]-L.h/2-lift+(far>7?L.dy:0), w, h:L.h});   // every label stays fully on screen
      const free = r => !placed.some(q => hits(r, q)) && !obstacles.some(q => hits(r, q, 2, 2));
      let r = at(L.small ? L.wF : L.w), short = false;
      if (!free(r) && L.small) { r = at(L.wS); short = true; }        // shorten before giving up
      if (!free(r) && L.small) { const b = r;                           // then nudge the short label just below, beside or (last) above its marker
        for (const [dx, dy] of [[0, L.h + 5], [-(b.w / 2 + 12), 0], [b.w / 2 + 12, 0], [0, -(L.h + 5)]]) { const c = {...b, x:Math.max(6, Math.min(innerWidth - b.w - 6, b.x + dx)), y:b.y + dy}; if (free(c)) { r = c; break; } } }
      if (!free(r)) { L.el.style.opacity=0; continue; }
      if (L.small) L.el.classList.toggle('use-short', short);
      L.el.classList.toggle('hot', !!L.pid && L.pid===hoverId || L===projLabel);
      placed.push(r);
      L.el.style.opacity=1; L.el.style.transform=`translate3d(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px,0)`;
    }
  }
  // Clicking or hovering a project's label acts on that same project.
  labelLayer.addEventListener('click', e => { const rg=e.target.closest('[data-region]'); if (rg) { hideChoices(); onRegion(rg.dataset.region); return; }
    const el=e.target.closest('[data-pid]'); if (!el || !selectable) return; hideChoices(); pickSelect(el.dataset.pid); });
  function pickSelect(id){ if (id===CORE_ID) { selectedId=null; onPlace('riyadh'); } else if (String(id).startsWith('place:')) { selectedId=null; onPlace(id); } else onSelect(P(id)); }
  labelLayer.addEventListener('pointerover', e => { const el=e.target.closest('[data-pid]'); if (el && selectable) hoverId=el.dataset.pid; });
  labelLayer.addEventListener('pointerout', e => { const el=e.target.closest('[data-pid]'); if (el && selectable && hoverId===el.dataset.pid) hoverId=null; });

  /* ------------------------------ render ---------------------------- */
  let lastT=performance.now(), frames=0, slowFrames=0;
  function drawMesh(buf, glow=0, shadowOn=1){
    if(!buf||!buf.count) return;
    attr(loc.m.pos,buf.p,3); attr(loc.m.col,buf.c,3); attr(loc.m.nrm,buf.n,3);
    gl.uniform1f(loc.m.uGlow,glow); gl.uniform1f(loc.m.uShadowOn,shadowOn&&shadowsOn()?1:0);
    gl.drawArrays(gl.TRIANGLES,0,buf.count);
  }
  function drawDepth(buf){ if(!buf||!buf.count) return; attr(loc.d.pos,buf.p,3); gl.drawArrays(gl.TRIANGLES,0,buf.count); }
  const shadowsOn = () => shadowsSupported && quality==='high';
  const detailOn = () => camera.dist < DETAIL_DIST;
  function updateLight(){
    const T=camera.target, h=Math.max(.9, Math.min(11, camera.dist*.62)), texel=2*h/SHADOW_SIZE;
    const c=[Math.round(T[0]/texel)*texel, G, Math.round(T[2]/texel)*texel];
    const e=[c[0]+SUN[0]*30, c[1]+SUN[1]*30, c[2]+SUN[2]*30];
    lightVP = M4.multiply(ortho(h, 1, 60), M4.lookAt(e, c, [0,1,0]));
  }
  function render(t){
    const dt=Math.min(100,t-lastT); lastT=t;
    // Adaptive quality: drop shadows/tilt-shift automatically on slow machines.
    if (quality==='high' && ++frames>90 && frames<400) { if (dt>45) slowFrames++; if (slowFrames>60) setQuality('low', true); }
    resize(); updateCamera(dt); let st=stormTarget;
    if (hazard) { const d=Math.hypot(camera.target[0]-hazard.x,camera.target[2]-hazard.z); st=Math.max(st,(hazard.plumes?.55:1)*hazard.intensity*Math.max(0,Math.min(1,1.7-d/(hazard.r*2.2)))*(hazard.type==='heat'?.45:1)); const tt=TINTS[hazard.type]||TINTS.dust; for(let i=0;i<3;i++) tint[i]+=(tt[i]-tint[i])*.05; }
    storm+=(st*(directMode?.6:1)-storm)*Math.min(1,dt*.002);
    if (follow) { camera.desired.target[0]=follow[0]; camera.desired.target[2]=follow[1]; }
    if (stageDirty) { stageBuf=uploadIds(stageMesh, upload(stageMesh, stageBuf, gl.DYNAMIC_DRAW)); stageLineBuf=upload({p:stageLines.p,c:stageLines.c}, stageLineBuf||{p:gl.createBuffer(),c:gl.createBuffer()}, gl.DYNAMIC_DRAW); stageDirty=false; }
    if (cityDirty) { cityBuf=upload(cityMesh, cityBuf, gl.DYNAMIC_DRAW); cityLineBuf=upload({p:cityLines.p,c:cityLines.c}, cityLineBuf||{p:gl.createBuffer(),c:gl.createBuffer()}, gl.DYNAMIC_DRAW); cityDirty=false; }
    if (missionDirty) { missionBuf=uploadIds(missionMesh, upload(missionMesh, missionBuf, gl.DYNAMIC_DRAW)); missionLineBuf=upload({p:missionLines.p,c:missionLines.c}, missionLineBuf||{p:gl.createBuffer(),c:gl.createBuffer()}, gl.DYNAMIC_DRAW); missionDirty=false; }
    buildVehicles(t); vehBuf=upload(vehGeo, vehBuf, gl.DYNAMIC_DRAW);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);

    // 1) Shadow map from the sun
    if (shadowsOn()) {
      updateLight();
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB); gl.viewport(0,0,SHADOW_SIZE,SHADOW_SIZE);
      gl.clearColor(1,1,1,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(depthProgram); resetAttribs(); gl.uniformMatrix4fv(loc.d.uLightVP,false,lightVP); gl.uniform3f(loc.d.uOffset,0,0,0);
      gl.disableVertexAttribArray(loc.m.col); gl.disableVertexAttribArray(loc.m.nrm);
      drawDepth(meshBuf); if (detailOn()) drawDepth(detailBuf); drawDepth(stageBuf); drawDepth(vehBuf); drawDepth(missionBuf); drawDepth(cityBuf);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0,0,width,height);
    }

    // 2) Scene
    night+=(nightTarget-night)*Math.min(1,dt*.0015);
    const sky=[(.60+storm*.18)*(1-night)+.07*night,(.84-storm*.28)*(1-night)+.10*night,(.95-storm*.45)*(1-night)+.22*night];
    gl.clearColor(sky[0],sky[1],sky[2],1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const ed=camera.dist*EYE;
    gl.useProgram(waterProgram); resetAttribs();
    gl.uniformMatrix4fv(loc.w.uVP,false,vp); gl.uniform1f(loc.w.uTime,t*.001); gl.uniform3fv(loc.w.uSun,SUN); gl.uniform3fv(loc.w.uEye,eye); gl.uniform1f(loc.w.uStorm,storm); gl.uniform1f(loc.w.uDist,ed); gl.uniform3fv(loc.w.uTint,tint); gl.uniform1f(loc.w.uNight,night);
    attr(loc.w.pos,waterBuf.p,3); attr(loc.w.shore,waterBuf.s,1); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,waterBuf.i); gl.drawElements(gl.TRIANGLES,waterBuf.count,gl.UNSIGNED_SHORT,0);
    gl.disableVertexAttribArray(loc.w.shore);

    gl.useProgram(meshProgram); resetAttribs();
    gl.uniformMatrix4fv(loc.m.uVP,false,vp); gl.uniformMatrix4fv(loc.m.uLightVP,false,lightVP); gl.uniform3f(loc.m.uOffset,0,0,0);
    gl.uniform3fv(loc.m.uSun,SUN); gl.uniform3fv(loc.m.uEye,eye); gl.uniform1f(loc.m.uStorm,storm); gl.uniform1f(loc.m.uDist,ed);
    gl.uniform1f(loc.m.uTexel,1/SHADOW_SIZE); gl.uniform1f(loc.m.uGround,G); gl.uniform1f(loc.m.uTime,t*.001); gl.uniform3fv(loc.m.uTint,tint); gl.uniform1f(loc.m.uNight,night);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,shadowTex); gl.uniform1i(loc.m.uShadow,0);
    drawMesh(meshBuf); if (detailOn()) drawMesh(detailBuf); drawMesh(stageBuf,.05); drawMesh(vehBuf,.08); drawMesh(missionBuf,.04); drawMesh(cityBuf,.03);
    gl.uniform3f(loc.m.uOffset, Math.sin(t*.00005)*.25, 0, 0); drawMesh(cloudBuf,.42,0); gl.uniform3f(loc.m.uOffset,0,0,0);
    gl.disableVertexAttribArray(loc.m.nrm);

    gl.useProgram(pointProgram); resetAttribs(); gl.uniformMatrix4fv(loc.p.vp,false,vp);gl.uniform1f(loc.p.scale,dpr);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.disableVertexAttribArray(loc.p.size);gl.vertexAttrib1f(loc.p.size,1);gl.uniform1f(loc.p.round,0);
    bindAttr(loc.p,lineBuf.p,lineBuf.c);gl.drawArrays(gl.LINES,0,lineBuf.count);
    if (stageLineBuf) { bindAttr(loc.p,stageLineBuf.p,stageLineBuf.c);gl.drawArrays(gl.LINES,0,stageLineBuf.count); }
    if (cityLineBuf && cityLineBuf.count) { bindAttr(loc.p,cityLineBuf.p,cityLineBuf.c);gl.drawArrays(gl.LINES,0,cityLineBuf.count); }
    if (missionLineBuf && missionLineBuf.count) { bindAttr(loc.p,missionLineBuf.p,missionLineBuf.c);gl.drawArrays(gl.LINES,0,missionLineBuf.count); }
    buildDynLines(t); dynLineBuf=upload(dynLines, dynLineBuf||{p:gl.createBuffer(),c:gl.createBuffer()}, gl.DYNAMIC_DRAW);
    if (dynLineBuf.count) { bindAttr(loc.p,dynLineBuf.p,dynLineBuf.c); gl.drawArrays(gl.LINES,0,dynLineBuf.count); }
    const n=dynamicPoints(t); bindAttr(loc.p,dynPB,dynCB);gl.bindBuffer(gl.ARRAY_BUFFER,dynSB);gl.enableVertexAttribArray(loc.p.size);gl.vertexAttribPointer(loc.p.size,1,gl.FLOAT,false,0,0);
    gl.uniform1f(loc.p.round,1);gl.depthMask(false);gl.drawArrays(gl.POINTS,0,n);gl.depthMask(true);gl.disableVertexAttribArray(loc.p.size);gl.disable(gl.BLEND);
    updateLabels(); keyPan(dt);
    if (pendingHover && performance.now() - pendingHover.t > 90) { const h = pendingHover; pendingHover = null; runHover(h.x, h.y, h.touch); }   // hover picks only once the pointer rests
    requestAnimationFrame(render);
  }
  function buildDynLines(t){
    dynLines.p.length=dynLines.c.length=0; lineTarget=dynLines;
    if (selectable || selectedId) { const sp=selectedId&&P(selectedId), hp=hoverId&&hoverId!==selectedId&&P(hoverId);
      if (sp) { if (sp.ribbon) { ribbonEdges(sp,.006,G+.014,[1,.86,.3]); ribbonEdges(sp,.012,G+.016,[1,.95,.6]); } else { addRing(sp.x,G+.014,sp.z,sp.foot+.006,[1,.86,.3],40); addRing(sp.x,G+.016,sp.z,sp.foot+.012,[1,.95,.6],40); } }
      if (hp) { if (hp.ribbon) ribbonEdges(hp,.006,G+.014,[1,1,1]); else addRing(hp.x,G+.014,hp.z,hp.foot+.006,[1,1,1],40); }
      if (hoverId===CORE_ID) { const c=LY.RIYADH_CORE; addRing(c.x,G+.014,c.z,c.r+.006,[1,1,1],40); }
      if (hoverId && LY.places && LY.places[hoverId]) { const q=LY.places[hoverId]; addRing(q.x,G+.014,q.z,q.r+.006,[1,1,1],40); } }
    for (const o0 of overlay) { if (o0.noLine) continue; const y=G+.022, P2=o0._pts||[o0.a,o0.b];
      for (let si=1; si<P2.length; si++) { const o={...o0, a:P2[si-1], b:P2[si]};
      if (o.dash) { const n=14; for(let i=0;i<n;i+=2){ const a=i/n,b=(i+1)/n; addLine([o.a[0]+(o.b[0]-o.a[0])*a,y,o.a[1]+(o.b[1]-o.a[1])*a],[o.a[0]+(o.b[0]-o.a[0])*b,y,o.a[1]+(o.b[1]-o.a[1])*b],o.color); } continue; }
      addLine([o.a[0],y,o.a[1]],[o.b[0],y,o.b[1]],o.color); addLine([o.a[0],y+.002,o.a[1]+.004],[o.b[0],y+.002,o.b[1]+.004],o.color); if (o.thick) { addLine([o.a[0]+.004,y,o.a[1]],[o.b[0]+.004,y,o.b[1]],o.color); addLine([o.a[0]-.004,y+.001,o.a[1]-.002],[o.b[0]-.004,y+.001,o.b[1]-.002],o.color); } } }
    for (const e of entities) { if (e.ring) addRing(e.x,G+.012,e.z,e.ring,e.ringColor||e.color,28);
      if (e.path) { const n=10; for(let i=0;i<n;i+=2){ const a=i/n,b=(i+1)/n; addLine([e.x+(e.path[0]-e.x)*a,G+.03,e.z+(e.path[1]-e.z)*a],[e.x+(e.path[0]-e.x)*b,G+.03,e.z+(e.path[1]-e.z)*b],e.color); } } }
    if (hazard && !hazard.plumes && hazard.intensity>.02) { addRing(hazard.x,G+.015,hazard.z,hazard.r,[1,.55,.3],48); addRing(hazard.x,G+.015,hazard.z,hazard.r*(.55+.05*Math.sin(t*.004)),[1,.72,.4],40); }
    lineTarget=lines;
  }
  function setQuality(q, auto){
    quality = q==='low' ? 'low' : q==='medium' ? 'medium' : 'high';
    document.body.classList.toggle('gfx-low', quality==='low'); document.body.classList.toggle('gfx-medium', quality==='medium'); resScale = quality==='high' ? 1 : quality==='medium' ? .8 : .65; resize();
    dispatchEvent(new CustomEvent('vision-quality', {detail:{quality, auto:!!auto}}));
  }

  /* ------------------------------ input ----------------------------- */
  const pointers=new Map(); let dragMode=null, moved=0, pinchStart=0, pinchDist=0;
  function pickGround(cx, cy){
    const f=norm3([camera.target[0]-eye[0],camera.target[1]-eye[1],camera.target[2]-eye[2]]);
    const r=norm3([f[1]*0-f[2]*1, f[2]*0-f[0]*0, f[0]*1-f[1]*0]); const u=[r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0]];
    const ty=Math.tan(FOV/2), ax=(cx/innerWidth*2-1)*ty*(width/height), ay=(1-cy/innerHeight*2)*ty;
    const d=[f[0]+r[0]*ax+u[0]*ay, f[1]+r[1]*ax+u[1]*ay, f[2]+r[2]*ax+u[2]*ay];
    if (d[1] >= -1e-4) return null; const k=(G-eye[1])/d[1]; return [eye[0]+d[0]*k, eye[2]+d[2]*k];
  }
  // ---- Depth-correct picking: render project IDs (front-most wins) under the pointer, then resolve with layout.js rules.
  let selectable=false, pendingHover=null, pickFB=null, pickTex=null, pickRB=null, pickW=0, pickH=0;
  function ensurePickFB(){
    if (pickFB && pickW===width && pickH===height) return;
    pickFB=pickFB||gl.createFramebuffer(); pickTex=pickTex||gl.createTexture(); pickRB=pickRB||gl.createRenderbuffer(); pickW=width; pickH=height;
    gl.bindTexture(gl.TEXTURE_2D,pickTex); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.bindRenderbuffer(gl.RENDERBUFFER,pickRB); gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);
    gl.bindFramebuffer(gl.FRAMEBUFFER,pickFB); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,pickTex,0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,pickRB);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  function renderIds(x0, y0, w, h){
    ensurePickFB(); gl.bindFramebuffer(gl.FRAMEBUFFER,pickFB); gl.viewport(0,0,width,height);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(x0,y0,w,h); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.useProgram(pickProgram); resetAttribs(); gl.uniformMatrix4fv(loc.k.uVP,false,vp);
    const draw=(buf, withIds)=>{ if(!buf||!buf.count) return; attr(loc.k.pos,buf.p,3); if (withIds && buf.id) attr(loc.k.col,buf.id,3); else { gl.disableVertexAttribArray(loc.k.col); gl.vertexAttrib3f(loc.k.col,0,0,0); } gl.drawArrays(gl.TRIANGLES,0,buf.count); };
    draw(meshBuf,1); if (detailOn()) draw(detailBuf,0); draw(stageBuf,1); draw(missionBuf,1); draw(vehBuf,0);   // everything that can hide a project is drawn as an occluder
    const px=new Uint8Array(w*h*4); gl.readPixels(x0,y0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
    gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,width,height); resetAttribs(); return px;
  }
  function measurePick(cx, cy, tol){
    const R=Math.ceil(tol*dpr), x=Math.round(cx*dpr), y=Math.round(height-cy*dpr), x0=Math.max(0,x-R), y0=Math.max(0,y-R), w=Math.min(width,x+R+1)-x0, h=Math.min(height,y+R+1)-y0;
    if (w<=0 || h<=0 || !vp) return {center:null, around:[]};
    const px=renderIds(x0,y0,w,h); let center=null, cd=1e9; const around=[];
    for (let j=0;j<h;j++) for (let i=0;i<w;i++) { const o=(j*w+i)*4; if (!px[o+2]) continue; const id=PBYIDX[px[o]+px[o+1]*256]; if (!id) continue;
      const d=Math.hypot(x0+i-x, y0+j-y)/dpr; if (d<=.75 && d<cd) { cd=d; center=id; } if (d<=tol) around.push({id, d}); }
    return {center, around};
  }
  function markerHits(cx, cy, tol){
    const clustered=camera.dist>CLUSTER_DIST, markers=[], clusterHits=[];
    if (beaconsOn) for (const pr of D.projects) { if (clustered && pr.cl) continue; const q=project([pr.pad[0],beaconTop(projectState[pr.id],pr.id)+.02,pr.pad[1]]); if (!q || q[2]>1) continue; const d=Math.hypot(q[0]-cx,q[1]-cy); if (d<=tol) markers.push({id:pr.id, d}); }
    if (clustered && beaconsOn) for (const cl of clusters) { const q=project([cl.x,G+.34,cl.z]); if (q && Math.hypot(q[0]-cx,q[1]-cy)<=tol+6) clusterHits.push(cl); }
    return {markers, clusterHits};
  }
  function resolveAt(cx, cy, touch){
    const m=measurePick(cx, cy, touch?16:6), mk=markerHits(cx, cy, touch?24:14), clustered=camera.dist>CLUSTER_DIST;
    if (!m.center && !m.around.length && !mk.markers.length && mk.clusterHits.length) return {choose:mk.clusterHits[0].ids.slice()};
    const nearest = list => list.length ? list.reduce((a,b)=>a.d<=b.d?a:b).id : null;
    const first = m.center || nearest(m.around) || nearest(mk.markers), fp = first && P(first);
    const cluster = clustered && fp && fp.cl ? (clusters.find(c=>c.anchor===fp.cl)||{}).ids : clustered && first===CORE_ID ? (clusters.find(c=>c.anchor==='Riyadh')||{}).ids : null;
    return LY.resolvePick({center:m.center, around:m.around, markers:mk.markers, cluster});
  }
  // Cheap CPU pre-check: is the pointer anywhere near a project's on-screen box? Only then run the GPU ID pick.
  function nearAnyProject(x, y, pad){
    const extra=[{id:CORE_ID, x:LY.RIYADH_CORE.x, z:LY.RIYADH_CORE.z, foot:LY.RIYADH_CORE.r, pad:[LY.RIYADH_CORE.x,LY.RIYADH_CORE.z], core:true}, ...Object.values(LY.places || {}).map(q => ({id:q.id, x:q.x, z:q.z, foot:q.r, pad:[q.x,q.z], core:true}))];
    for (const p of D.projects.concat(extra)) { let x0=1e9, y0=1e9, x1=-1e9, y1=-1e9, any=false;
      const ring = p.ribbon ? p.ribbon.pts.flatMap(q => [[q[0],q[1]-p.ribbon.hw],[q[0],q[1]+p.ribbon.hw]]) : Array.from({length:8}, (_, i) => [p.x+Math.cos(i/8*6.283)*p.foot, p.z+Math.sin(i/8*6.283)*p.foot]);
      for (const [rx,rz] of ring) { for (const yy of [G, topY[p.id]||G+.3]) { const q=project([rx, yy, rz]); if (!q) continue; any=true; x0=Math.min(x0,q[0]); x1=Math.max(x1,q[0]); y0=Math.min(y0,q[1]); y1=Math.max(y1,q[1]); } }
      const m=p.core ? null : project([p.pad[0], beaconTop(projectState[p.id],p.id)+.02, p.pad[1]]); if (m) { x0=Math.min(x0,m[0]); x1=Math.max(x1,m[0]); y0=Math.min(y0,m[1]); y1=Math.max(y1,m[1]); }
      if (any && x>=x0-pad && x<=x1+pad && y>=y0-pad && y<=y1+pad) return true; }
    return camera.dist > CLUSTER_DIST;   // clustered overview: cluster beacons are handled by the pick itself
  }
  function runHover(x, y, touch){ if (!selectable || pointers.size) return; if (!nearAnyProject(x, y, 16)) { hoverId=null; canvas.style.cursor=''; return; }
    const r=resolveAt(x, y, touch); const id=r ? (r.select || (r.choose && r.choose[0])) : null; hoverId=id||null; canvas.style.cursor=id?'pointer':''; }
  // Accessible choice list when several projects are under the pointer (instead of silently picking one).
  const escH = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const choiceEl=document.createElement('div'); choiceEl.id='pickChoices'; choiceEl.className='pick-choices'; choiceEl.hidden=true; choiceEl.setAttribute('role','dialog'); document.body.appendChild(choiceEl);
  function hideChoices(){ if (!choiceEl.hidden) { choiceEl.hidden=true; choiceEl.innerHTML=''; } }
  function showChoices(ids, cx, cy){
    const ar=document.body.classList.contains('national-ar') || document.documentElement.dir==='rtl', tr=t=>ar&&window.VisionNationalAR?(VisionNationalAR.translateText(t)||t):t;
    choiceEl.setAttribute('aria-label', ar?'اختر مشروعًا':'Choose a project');
    choiceEl.innerHTML=`<b>${ar?'أي مشروع؟':'Which project?'}</b>`+ids.map(id=>{ const p=P(id); return `<button type="button" data-pid="${id}"><i style="background:rgb(${p.color.map(v=>Math.round(v*255)).join(',')})"></i>${escH(tr(p.name))}</button>`; }).join('')+`<button type="button" class="pc-close" aria-label="${ar?'إغلاق':'Close'}">✕</button>`;
    choiceEl.hidden=false; const w=choiceEl.offsetWidth, h=choiceEl.offsetHeight;
    choiceEl.style.left=Math.max(8,Math.min(innerWidth-w-8,cx+12))+'px'; choiceEl.style.top=Math.max(8,Math.min(innerHeight-h-8,cy-h/2))+'px';
    choiceEl.querySelectorAll('[data-pid]').forEach(b => { b.onclick=()=>{ hideChoices(); pickSelect(b.dataset.pid); }; b.onpointerenter=()=>{ hoverId=b.dataset.pid; }; });
    choiceEl.querySelector('.pc-close').onclick=hideChoices; const f=choiceEl.querySelector('[data-pid]'); if (f) f.focus();
  }
  addEventListener('keydown', e => { if (e.key==='Escape' && !choiceEl.hidden) { hideChoices(); e.stopPropagation(); } }, true);
  addEventListener('pointerdown', e => { if (!choiceEl.hidden && !e.target.closest('#pickChoices')) hideChoices(); }, true);
  function pickProject(cx, cy, radius=26){let best=null,bd=radius;for(const p of D.projects){const st=projectState[p.id],s=project([p.x,G+.1+st.stage*.03,p.z]);if(!s)continue;const d=Math.hypot(s[0]-cx,s[1]-cy);if(d<bd){best=p;bd=d;}}return best;}
  function pan(dx, dy){
    const k=camera.dist*.0011, sa=Math.sin(camera.az), ca=Math.cos(camera.az);
    const T=camera.desired.target; T[0]-= (ca*dx - sa*dy)*k; T[2]-= (-sa*dx - ca*dy)*k;
    T[0]=Math.max(bounds.minX,Math.min(bounds.maxX,T[0])); T[2]=Math.max(bounds.minZ,Math.min(bounds.maxZ,T[2]));
  }
  canvas.addEventListener('contextmenu', e=>e.preventDefault());
  let dragTool=null, hoverTool=null;
  canvas.addEventListener('pointerdown', e=>{
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); canvas.setPointerCapture(e.pointerId); moved=0;
    if (dragTool && e.button===0 && !e.shiftKey && pointers.size===1) { const g=pickGround(e.clientX,e.clientY); if (g && dragTool('down',g[0],g[1])!==false) { dragMode='tool'; return; } }
    if (pointers.size===2){const [a,b]=[...pointers.values()];pinchStart=Math.hypot(a.x-b.x,a.y-b.y);pinchDist=camera.desired.dist;dragMode='pinch';}
    else dragMode=(e.button===2||e.shiftKey)?'pan':'orbit';
  });
  canvas.addEventListener('pointermove', e=>{
    const prev=pointers.get(e.pointerId);
    if (!prev) { if (hoverTool) { const g=pickGround(e.clientX,e.clientY); if (g) hoverTool(g[0],g[1]); }
      if (groundHandler) { const h=pickProject(e.clientX,e.clientY,14); hoverId=h?h.id:null; canvas.style.cursor='crosshair'; return; }
      if (selectable) pendingHover={x:e.clientX, y:e.clientY, touch:e.pointerType==='touch', t:performance.now()}; else if (hoverId || canvas.style.cursor) { hoverId=null; canvas.style.cursor=''; }   // the menu map is not interactive: no pointer cue
      return; }
    const dx=e.clientX-prev.x, dy=e.clientY-prev.y; moved+=Math.abs(dx)+Math.abs(dy); prev.x=e.clientX; prev.y=e.clientY;
    if (dragMode==='tool') { const g=pickGround(e.clientX,e.clientY); if (g) dragTool('move',g[0],g[1]); return; }
    if (dragMode==='pinch'&&pointers.size===2){const [a,b]=[...pointers.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);camera.desired.dist=Math.max(1.6,Math.min(22,pinchDist*pinchStart/Math.max(20,d)));}
    else if (dragMode==='pan') pan(dx,dy);
    else if (dragMode==='orbit'){camera.desired.az-=dx*.006;camera.desired.el=Math.max(.35,Math.min(1.45,camera.desired.el+dy*.004));}
  });
  const endPointer=e=>{
    if (dragMode==='tool') { pointers.delete(e.pointerId); dragMode=null; const g=pickGround(e.clientX,e.clientY); dragTool(e.type==='pointerup'?'up':'cancel', g?g[0]:null, g?g[1]:null); return; }
    const wasClick = pointers.has(e.pointerId) && moved<(e.pointerType==='touch'?12:6) && dragMode!=='pinch';   // a drag orbits/pans; only a still press is a click
    pointers.delete(e.pointerId); if(!pointers.size) dragMode=null;
    if (wasClick && e.type==='pointerup' && e.button!==2) { if (groundHandler) { const g=pickGround(e.clientX,e.clientY); if (g && groundHandler({x:g[0],z:g[1],project:pickProject(e.clientX,e.clientY)})) return; }
      if (selectable) { const r=resolveAt(e.clientX,e.clientY,e.pointerType==='touch'); if (r && r.select) { hideChoices(); pickSelect(r.select); } else if (r && r.choose) showChoices(r.choose,e.clientX,e.clientY); else hideChoices(); } }
  };
  canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', ()=>{ if(!pointers.size){hoverId=null;canvas.style.cursor='';} });
  canvas.addEventListener('wheel', e=>{e.preventDefault();camera.desired.dist=Math.max(1.6,Math.min(22,camera.desired.dist*Math.exp(e.deltaY*.0012)));},{passive:false});
  const keys=new Set();
  addEventListener('keydown', e=>{ if(e.target.closest&&e.target.closest('input,textarea'))return; const k=e.key.toLowerCase(); if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','q','e','=','+','-'].includes(k)){keys.add(k); if(k.startsWith('arrow'))e.preventDefault();} });
  addEventListener('keyup', e=>keys.delete(e.key.toLowerCase()));
  addEventListener('blur', ()=>keys.clear());
  function keyPan(dt){
    if(!keys.size)return; const v=dt*.45;
    if(keys.has('w')||keys.has('arrowup'))pan(0,v); if(keys.has('s')||keys.has('arrowdown'))pan(0,-v);
    if(keys.has('a')||keys.has('arrowleft'))pan(v,0); if(keys.has('d')||keys.has('arrowright'))pan(-v,0);
    if(keys.has('q'))camera.desired.az+=dt*.0015; if(keys.has('e'))camera.desired.az-=dt*.0015;
    if(keys.has('=')||keys.has('+'))camera.desired.dist=Math.max(1.6,camera.desired.dist*(1-dt*.0015)); if(keys.has('-'))camera.desired.dist=Math.min(22,camera.desired.dist*(1+dt*.0015));
  }

  /* ------------------------------- API ------------------------------ */
  window.VisionWorld = {
    start(){ setDesired(K.az,K.el,K.dist,K.x,K.z); },
    focusProject(p){ selectedId=p.id; directMode=false; follow=null; setDesired(.3,.8,2.3,p.x,p.z,.02); },
    focusRegion(id){ const r=D.regions[id]||K; selectedId=null; directMode=false;
      const fit = r.fitWidth ? Math.min(1.5, Math.max(1, Math.sqrt(1.1/(innerWidth/innerHeight)))) : 1;   // portrait screens: keep the whole Riyadh plan in frame
      setDesired(r.az,r.el,r.dist*fit,r.x,r.z); },
    overview(){ selectedId=null; directMode=false; follow=null; stormTarget=0; setDesired(K.az,K.el,K.dist,K.x,K.z); },
    // World coordinates for simulation data (same anchor spread as projects)
    place(lon, lat, anchor){ let [x,z]=geo(lon,lat); const a=anchor&&C(anchor); if(a){x=a.x+(x-a.x)*ANCHOR_SPREAD;z=a.z+(z-a.z)*ANCHOR_SPREAD;} return [x,z]; },
    focusPoint(x, z, dist=3.4, el=.72){ directMode=false; follow=null; setDesired(.35,el,dist,x,z,.03); },
    setHazard(h){ hazard=h; },
    setEntities(list){ entities=list||[]; },
    setOverlay(list){ overlay=list||[];   // lines follow routed paths (straight when clear, else along the Riyadh plan's roads)
      for (const o of overlay) if (o.a && o.b) { o._pts=o.pts||LY.routeBetween(o.a,o.b,!!o.road); o._L=pathLen(o._pts); } },
    setConvoys(list){ convoyList=list||[]; },
    setDynamicLabels(list){ setDynLabels(list||[]); },
    onGroundClick(fn){ groundHandler=fn; canvas.style.cursor=fn?'crosshair':''; },
    setDirectMode(v, x, z){ directMode=v; follow=v&&x!=null?[x,z]:null; if(v) setDesired(1.3,.42,1.7,x,z,.1); else follow=null; },
    followPoint(x, z){ if (directMode) follow=[x,z]; },
    cam(az, el, dist, x, z, speed=1){ directMode=false; follow=null; camSpeed=speed; setDesired(az,el,dist,x,z,0); },
    snapCam(az, el, dist, x, z){ setDesired(az,el,dist,x,z,0); camera.az=az; camera.el=el; camera.dist=dist; camera.target=[x,0,z]; },
    camSpeed(k){ camSpeed=k; },
    setNight(v, instant){ nightTarget=Math.max(0,Math.min(1,v)); if(instant) night=nightTarget; },
    getNight(){ return night; },
    burst(x, z){ bursts.push({x, z, t0:performance.now()}); },
    setMissionScene(sc){ missionScene=sc; buildMission(); },
    setMissionLights(list){ missionLights=list||[]; },
    setBeacons(v){ beaconsOn=!!v; },
    setProjectLabels(v){ projLabelsOn=!!v; },
    relabel(fn){ for (const L of labels) if (L.base && !L.small && !L.cluster && !L.el.classList.contains('dyn')) { const t=fn(L.base); if (t && L.el.textContent!==t) { L.el.textContent=t; L.w=0; } } },
    project(x, z, y=G){ const s=project([x,y,z]); return s ? {x:s[0], y:s[1]} : null; },
    ground:G,
    setCity(desc){ cityDesc=desc; buildCity(); },
    onGroundDrag(fn){ dragTool=fn; }, onGroundHover(fn){ hoverTool=fn; },
    screenOf(x, z){ const s=project([x,G,z]); return s?{x:s[0],y:s[1]}:null; },
    pick(cx, cy){ return pickGround(cx, cy); },
    setProjectState(id, value){ const prev=projectState[id]||{}; const next={...prev,...value}; projectState[id]=next;
      if (prev.done!==next.done || prev.active!==next.active || Math.abs((prev.progress||0)-(next.progress||0))>.08 || prev.health!==next.health) buildStageMesh(); },
    clearSelection(){ selectedId=null; },
    setQuality(q){ setQuality(q); },
    getQuality(){ return quality; },
    onSelect(fn){ onSelect=fn; },
    onPlace(fn){ onPlace=fn; },
    onRegion(fn){ onRegion=fn; },   // a click on a region name on the national view   // a click on the downtown skyline (a place, not a project)
    // Only the National Simulation selects projects on the map; the menu map stays inert (no pointer cue, no dead clicks).
    setSelectable(v){ selectable=!!v; if (!selectable) { hoverId=null; hideChoices(); canvas.style.cursor=groundHandler?'crosshair':''; } labelLayer.classList.toggle('selectable', selectable); },
    // Test/inspection helpers (read-only): what a click would select, and where each project is actually visible.
    debug:{
      pickAt:(x, y, touch) => resolveAt(x, y, !!touch),
      visiblePixels(id, max=16){ const px=renderIds(0,0,width,height), k=PIDX[id], pts=[]; for (let j=0;j<height;j+=2) for (let i=0;i<width;i+=2) { const o=(j*width+i)*4; if (px[o+2] && px[o]+px[o+1]*256===k) pts.push([i/dpr,(height-j)/dpr]); }
        if (!pts.length) return []; const mx=pts.reduce((a,p)=>a+p[0],0)/pts.length, my=pts.reduce((a,p)=>a+p[1],0)/pts.length; return pts.sort((a,b)=>Math.hypot(a[0]-mx,a[1]-my)-Math.hypot(b[0]-mx,b[1]-my)).slice(0,max).map(([x,y])=>({x,y})).concat([{count:pts.length}]); },
      marker(id){ const pr=P(id), q=project([pr.pad[0],beaconTop(projectState[id],id)+.02,pr.pad[1]]); return q?{x:q[0],y:q[1]}:null; },
      screen(x,z,y=G){ const q=project([x,y,z]); return q?{x:q[0],y:q[1]}:null; },   // where a ground point is drawn (tests)
      state:() => ({dist:camera.dist, selectable, hoverId, selectedId, detail:detailOn()})
    }
  };
  requestAnimationFrame(render);
})();
