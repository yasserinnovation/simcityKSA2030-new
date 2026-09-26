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
  for (const p of D.projects) { const q = LY.projects[p.id]; p.x = q.x; p.z = q.z; p.foot = q.r; p.pad = q.pad; }
  const PIDX = Object.fromEntries(D.projects.map((p, i) => [p.id, i + 1])), PBYIDX = [null, ...D.projects.map(p => p.id)];
  for (const r of Object.values(D.regions)) [r.x, r.z] = geo(r.lon, r.lat);
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
  function grove(lon,lat,n,r,kind){const [cx,cz]=geo(lon,lat),prev=target;target=detailMesh;for(let i=0;i<n;i++){const a=rng()*6.283,d=Math.sqrt(rng())*r,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;if(!inSaudi(x,z)||!LY.decorAllowed(x,z,.055,.05,true))continue;kind==='palm'?addPalm(x,z,.7+rng()*.5):addTree(x,z,.7+rng()*.5,[.22+rng()*.08,.56+rng()*.14,.26]);}target=prev;}
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
      const [x,z]=geo(lon,lat); if(!inSaudi(x,z)) continue;
      const green=lat<20.2, c=green?mix([.42,.60,.32],[.58,.54,.40],rng()*.5):mix([.76,.56,.40],[.68,.52,.40],rng());
      const r=.05+rng()*.06, hh=.05+rng()*.08; addBlob(x,G,z,r*1.1,hh*.55,r,c,0,.25); addCone(x+(rng()-.5)*r*.3,G+hh*.2,z,r*.62,hh*.8,shade(c,1.06),7); if(green&&rng()>.4) addTree(x+r*.6,z+r*.5,.7);
    }
    // Dune fields: Rub' al Khali, Nafud, Dahna
    const nearCity=(x,z)=>D.cities.some(c=>Math.hypot(c.x-x,c.z-z)<(c.capital?.5:.3));
    const dune=(x,z,rot)=>{if(!inSaudi(x,z)||nearCity(x,z))return;addMound(x,z,.09+rng()*.07,.05+rng()*.02,.009+rng()*.008,rot+(rng()-.5)*.3,shade(landColor(x,z),1.02+rng()*.03),8);};
    const dunes=(lon0,lon1,lat0,lat1,n,rot)=>{for(let i=0;i<n;i++){const [x,z]=geo(lon0+rng()*(lon1-lon0),lat0+rng()*(lat1-lat0));dune(x,z,rot);}};
    dunes(47.5,55.0,18.8,22.2,110,.45); dunes(39.8,43.2,27.6,29.3,45,.1);
    const dahna=[[44.8,28.0],[46.0,26.5],[47.2,24.7],[47.8,22.8],[48.4,21.0]];
    for(let i=0;i<30;i++){const k=Math.floor(rng()*(dahna.length-1)),t=rng(),[x,z]=geo(dahna[k][0]+(dahna[k+1][0]-dahna[k][0])*t+(rng()-.5)*.35,dahna[k][1]+(dahna[k+1][1]-dahna[k][1])*t+(rng()-.5)*.2);dune(x,z,1.1);}
    // Harrat lava patches
    for (const [lon,lat,r] of [[39.9,25.4,.16],[40.3,25.9,.12],[40.0,22.9,.12],[39.2,26.8,.1]]){const [x,z]=geo(lon,lat);addDisc(x,G+.003,z,r,[.66,.56,.48],16);}
    // Centre-pivot farms (Qassim, Wadi ad-Dawasir, Tabuk, Al-Jawf)
    for (const [lon,lat,n] of [[43.8,26.1,10],[45.2,20.4,9],[36.9,28.6,6],[39.4,29.8,6]]) for(let i=0;i<n;i++){const [x,z]=geo(lon+(rng()-.5)*.9,lat+(rng()-.5)*.6);if(inSaudi(x,z))addDisc(x,G+.004,z,.022+rng()*.012,rng()>.3?[.45,.70,.32]:[.62,.72,.36],10);}
    // Oases and greenery
    grove(49.55,25.42,26,.22,'palm'); grove(43.95,26.35,10,.14,'palm'); grove(39.65,24.5,10,.14,'palm'); grove(37.95,26.66,8,.1,'palm');
    grove(42.5,18.4,70,.36,'tree'); grove(42.3,19.3,30,.24,'tree'); grove(43.1,17.7,20,.2,'tree'); grove(40.45,21.2,10,.14,'tree');
    for (let i=0;i<160;i++){const [x,z]=geo(38+rng()*14,18+rng()*11);if(inSaudi(x,z)&&!blocked(x,z)&&!D.cities.some(c=>Math.hypot(c.x-x,c.z-z)<.2))addGhaf(x,z,.7+rng()*.5);}
    for (const c of D.cities) grove(...ungeo(c.x,c.z),10+Math.round(c.size*14),c.size*.42+.08,c.palette==='green'?'tree':'palm');
    // Neighbouring mountains (muted)
    const ridge=(pts,n,col)=>{for(let i=0;i<n;i++){const k=Math.floor(rng()*(pts.length-1)),t=rng(),lon=pts[k][0]+(pts[k+1][0]-pts[k][0])*t+(rng()-.5)*.5,lat=pts[k][1]+(pts[k+1][1]-pts[k][1])*t+(rng()-.5)*.5,[x,z]=geo(lon,lat);if(!onAnyLand(x,z)||inSaudi(x,z))continue;{const r=.05+rng()*.05,hh=.04+rng()*.06;addBlob(x,NEI,z,r,hh*.5,r,col,0,.2);addCone(x,NEI+hh*.2,z,r*.6,hh*.7,col,6);}}};
    ridge([[48.2,33.5],[50.5,31.0],[52.5,29.3],[55.5,28.0],[58.0,27.5]],40,[.74,.63,.50]);  // Zagros
    ridge([[56.2,26.1],[56.8,24.2],[58.3,23.3],[59.3,22.4]],16,[.72,.61,.49]);             // Hajar
    ridge([[43.6,13.4],[44.0,14.8],[44.2,16.0]],14,[.70,.62,.48]);                        // Yemen highlands
    ridge([[33.8,28.6],[34.1,28.0],[33.6,27.0],[34.8,24.8],[36.3,22.0],[37.4,19.0]],26,[.76,.64,.51]); // Sinai & Red Sea hills
    ridge([[35.5,30.2],[35.7,31.6]],8,[.75,.64,.51]);
    // Small islands
    for (const [lon,lat,r] of [[50.55,26.05,.07],[41.9,16.8,.05],[42.2,16.6,.04],[36.7,25.4,.03],[36.9,25.7,.03],[36.5,25.9,.025]]){const [x,z]=geo(lon,lat);addCylinder(x,SEA,z,r,.012,[.90,.82,.60],10);}
  }

  function polyline(names){return names.map(pt);}
  function buildNetworks(){
    for (const r of D.roads) { const pts=polyline(r); for(let i=0;i<pts.length-1;i++){addStrip(pts[i],pts[i+1],.016,G+.005,[.52,.46,.40]);addLine([pts[i][0],G+.007,pts[i][1]],[pts[i+1][0],G+.007,pts[i+1][1]],[.98,.86,.52]);} }
    for (const r of D.rails) { const pts=polyline(r); for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz),nx=-dz/l*.02,nz=dx/l*.02;
      addLine([a[0]+nx,G+.008,a[1]+nz],[b[0]+nx,G+.008,b[1]+nz],[.46,.34,.70]);addLine([a[0]-nx,G+.008,a[1]-nz],[b[0]-nx,G+.008,b[1]-nz],[.46,.34,.70]);} }
  }

  function buildLandmarks(){
    const ry=C('Riyadh'), mk=C('Makkah'), md=C('Madinah'), jd=C('Jeddah'), dm=C('Dammam');
    // Riyadh — Kingdom Centre and Al Faisaliah
    keepOut.push([ry.x,ry.z,.1]);
    // Kept compact (≈ .24 high) so the core never hides the districts behind it from the planning cameras.
    addBox(ry.x-.03,G,ry.z,.035,.24,.05,[.43,.70,.77]);addBox(ry.x+.03,G,ry.z,.035,.24,.05,[.43,.70,.77]);addBox(ry.x,G+.19,ry.z,.095,.025,.05,[.55,.80,.86]);
    addBox(ry.x+.08,G,ry.z+.04,.04,.19,.04,[.51,.66,.73]);addCone(ry.x+.08,G+.19,ry.z+.04,.026,.06,[.66,.60,.42],8);addOcta(ry.x+.08,G+.165,ry.z+.04,.026,[.89,.69,.23]);
    for(let i=0;i<9;i++){const a=i/9*6.283,r=.055+rng()*.03;addBox(ry.x+Math.cos(a)*r,G,ry.z+Math.sin(a)*r,.032,.06+rng()*.09,.032,[.62+rng()*.2,.70,.74]);}
    // New Murabba — the Mukaab
    const mu=P('newmurabba'); keepOut.push([mu.x,mu.z,.12]); addBox(mu.x,G,mu.z-.01,.09,.11,.09,[.86,.58,.22]);addBox(mu.x,G+.11,mu.z-.01,.095,.006,.095,[.98,.82,.40]);
    // Diriyah — At-Turaif mud brick
    const dr=P('diriyah'); keepOut.push([dr.x,dr.z,.12]);
    for(const [dx,dz,w,h] of [[0,0,.08,.06],[-.06,.01,.05,.045],[.06,.02,.05,.07],[-.03,-.05,.06,.04],[.05,-.05,.06,.035]])addBox(dr.x+dx,G,dr.z+dz,w,h,w,[.68,.45,.26]);
    addPalm(dr.x-.07,dr.z-.05,.6);addPalm(dr.x+.07,dr.z-.06,.6);addPalm(dr.x,dr.z-.08,.5);
    // Qiddiya — stadium on the Tuwaiq cliffs + coaster
    const qd=P('qiddiya'); keepOut.push([qd.x,qd.z,.14]); addCylinder(qd.x,G,qd.z,.08,.04,[.91,.37,.24],16);addRing(qd.x,G+.041,qd.z,.055,[1,.83,.30],24);
    for(let i=1;i<16;i++){const f=j=>[qd.x-.09+j*.012,G+.03+Math.sin(j/15*Math.PI*1.8)*.07,qd.z-.08-Math.cos(j/15*Math.PI*1.8)*.03];addLine(f(i-1),f(i),[.92,.25,.22]);}
    // KSIA runways
    const ks=P('ksip'); keepOut.push([ks.x,ks.z,.16]); for(const o of [-.05,0,.05])addStrip([ks.x-.14,ks.z+o],[ks.x+.14,ks.z+o-.04],.009,G+.006,[.30,.32,.34]); addBox(ks.x,G,ks.z+.08,.1,.025,.03,[.85,.88,.9]);
    // Expo — globe pavilion
    const ex=P('expo'); keepOut.push([ex.x,ex.z,.12]); addDisc(ex.x,G+.004,ex.z,.1,[.62,.78,.45]); addDome(ex.x,G,ex.z-.01,.045,[.99,.72,.30]); addRing(ex.x,G+.02,ex.z,.085,[1,.9,.5],28);
    // King Salman Park and Green Riyadh
    const pk=P('park'); keepOut.push([pk.x,pk.z,.1]); addDisc(pk.x,G+.004,pk.z,.105,[.46,.72,.36],16); ownGrove(pk,12,.075);
    const gr=P('greenriyadh'); addDisc(gr.x,G+.004,gr.z,.095,[.52,.74,.40],16); ownGrove(gr,12,.07);
    // Sports Boulevard: a green spine with a running track
    const sp=P('sports'); addStrip([sp.x-.06,sp.z-.02],[sp.x+.06,sp.z-.02],.014,G+.009,[.42,.72,.36]); addRing(sp.x,G+.011,sp.z-.02,.035,[.95,.45,.35],20); addRing(sp.x,G+.011,sp.z-.02,.028,[.98,.98,.95],20);
    // Riyadh Metro: depot and interchange, with lines running from the core to the depot, the park and New Murabba
    const mt=P('metro'); addBox(mt.x,G,mt.z-.01,.07,.025,.04,[.62,.55,.86]); addRoof(mt.x,G+.025,mt.z-.01,.07,.012,.04,[.49,.35,.86]);
    for (const [to,c] of [[mt,[.49,.35,.86]],[pk,[.95,.40,.30]],[mu,[.25,.62,.85]]]) { const dx=to.x-ry.x, dz=to.z-ry.z, L=Math.hypot(dx,dz); addStrip([ry.x+dx/L*.12,ry.z+dz/L*.12],[to.x-dx/L*(to.foot-.01),to.z-dz/L*(to.foot-.01)],.006,G+.01,c); }
    // ROSHN neighbourhood
    const rs=P('roshn'); keepOut.push([rs.x,rs.z,.1]); for(let i=0;i<9;i++)addHouse(rs.x+(i%3-1)*.034,rs.z-.012+(Math.floor(i/3)-1)*.032,.45,[.95,.88,.70]);
    // District paths: each Riyadh district is joined to the core by a paved path that stops at its footprint edge.
    for (const p of D.projects.filter(q => q.anchor === 'Riyadh')) { const dx=p.x-ry.x, dz=p.z-ry.z, L=Math.hypot(dx,dz), a=[ry.x+dx/L*.13,ry.z+dz/L*.13], b=[p.x-dx/L*p.foot,p.z-dz/L*p.foot];
      const clear = D.projects.every(q => q===p || (() => { const t=Math.max(0,Math.min(1,((q.x-a[0])*(b[0]-a[0])+(q.z-a[1])*(b[1]-a[1]))/((b[0]-a[0])**2+(b[1]-a[1])**2))); return Math.hypot(q.x-a[0]-(b[0]-a[0])*t,q.z-a[1]-(b[1]-a[1])*t) > q.foot; })());
      if (clear) addStrip(a,b,.008,G+.006,[.84,.76,.60]); }

    // Makkah — Masjid al-Haram courtyard and the Kaaba
    keepOut.push([mk.x,mk.z,.11]);
    addDisc(mk.x,G+.004,mk.z,.085,[.95,.93,.86],24); addBox(mk.x,G,mk.z,.022,.024,.022,[.07,.07,.07]); addBox(mk.x,G+.016,mk.z,.0225,.003,.0225,[.84,.65,.18]);
    for(let i=0;i<8;i++){const a=i/8*6.283;addCylinder(mk.x+Math.cos(a)*.09,G,mk.z+Math.sin(a)*.09,.006,.1,[.93,.90,.80],6);addCone(mk.x+Math.cos(a)*.09,G+.1,mk.z+Math.sin(a)*.09,.009,.025,[.82,.70,.36],6);}
    addBox(mk.x+.02,G,mk.z-.13,.035,.3,.035,[.82,.80,.72]);addCone(mk.x+.02,G+.3,mk.z-.13,.02,.06,[.85,.72,.30],6); // clock tower
    // Hajj — Mina tent city
    const hj=P('hajj'); keepOut.push([hj.x,hj.z,.12]); for(let i=0;i<30;i++)addRoof(hj.x+(i%6-2.5)*.03,G,hj.z+(Math.floor(i/6)-2)*.03,.022,.014,.022,[.97,.97,.94]);
    // Masar — boulevard towards the Haram
    const ms=P('masar'); addStrip([ms.x,ms.z],[mk.x,mk.z],.012,G+.008,[.86,.80,.62]); for(let i=0;i<6;i++)addBox(ms.x+(mk.x-ms.x)*i/6+.02,G,ms.z+(mk.z-ms.z)*i/6+.02,.025,.05+i*.01,.025,[.90,.82,.62]);
    // Madinah — the Prophet's Mosque: green dome and minarets
    keepOut.push([md.x,md.z,.1]); addBox(md.x,G,md.z,.12,.03,.09,[.95,.92,.84]); addDome(md.x+.02,G+.03,md.z,.022,[.20,.62,.34]);
    for(const [dx,dz] of [[-.06,-.045],[.06,-.045],[-.06,.045],[.06,.045]]){addCylinder(md.x+dx,G,md.z+dz,.006,.1,[.95,.93,.86],6);addCone(md.x+dx,G+.1,md.z+dz,.009,.02,[.85,.74,.40],6);}
    // Jeddah — tower, corniche and Central waterfront
    const jc=P('jeddahcentral'); keepOut.push([jd.x,jd.z,.1]);
    addBox(jd.x,G,jd.z+.04,.03,.34,.03,[.60,.78,.86]); addCone(jd.x,G+.34,jd.z+.04,.02,.1,[.55,.72,.82],6);
    addBox(jc.x+.02,G,jc.z,.06,.05,.1,[.94,.74,.48]); addDisc(jc.x-.03,G+.004,jc.z,.04,[.35,.75,.82]);
    // KAEC — Ceer and EV factories
    for(const id of ['ceer','lucid']){const f=P(id);keepOut.push([f.x,f.z,.08]);addBox(f.x,G,f.z,.1,.035,.06,[.80,.82,.86]);addRoof(f.x,G+.035,f.z,.1,.015,.06,[.52,.56,.72]);addSolar(f.x,f.z+.07,5,2,.03);}
    // AlUla — Elephant Rock, Hegra tombs and Maraya
    const au=P('alula'); keepOut.push([au.x,au.z,.12]);
    addBox(au.x-.05,G,au.z,.05,.11,.08,[.78,.42,.23]);addBox(au.x+.02,G,au.z,.05,.12,.08,[.82,.46,.25]);addBox(au.x-.015,G+.07,au.z,.1,.05,.08,[.85,.49,.26]);
    addBox(au.x+.09,G,au.z-.05,.07,.035,.05,[.80,.86,.90]); // Maraya mirror hall
    for(let i=0;i<5;i++)addCone(au.x-.1+rng()*.2,G,au.z+.06+rng()*.06,.03,.07+rng()*.05,[.80,.45,.26],6);
    // NEOM — THE LINE, Oxagon, Trojena, Sindalah, green hydrogen
    const nm=P('neom'); keepOut.push([nm.x,nm.z,.2]); addBox(nm.x,G,nm.z,.85,.12,.02,[.40,.84,.88],-.55); addBox(nm.x,G+.12,nm.z,.85,.006,.022,[.85,.98,.96],-.55);
    const ox=P('oxagon'); keepOut.push([ox.x,ox.z,.1]); addCylinder(ox.x,G-.05,ox.z,.075,.055,[.30,.70,.78],8); addRing(ox.x,G+.008,ox.z,.075,[.92,.92,.70],8); addBox(ox.x,G,ox.z,.05,.04,.05,[.40,.78,.80]); addCrane(ox.x+.05,ox.z-.03,.5);
    const tj=P('trojena'); keepOut.push([tj.x,tj.z,.12]); addDisc(tj.x,G+.005,tj.z,.05,[.32,.72,.86]); for(let i=0;i<5;i++)addCone(tj.x+Math.cos(i*1.4)*.09,G,tj.z+Math.sin(i*1.4)*.08,.06,.14+rng()*.06,[.62,.56,.50],7); addCone(tj.x+.08,G+.1,tj.z-.02,.03,.06,[.96,.96,.98],7);
    const sd=P('sindalah'); addCylinder(sd.x,SEA,sd.z,.05,G-SEA,[.93,.82,.58],12); addHouse(sd.x,sd.z,.4,[.97,.95,.88]); addPalm(sd.x+.03,sd.z+.02,.5);
    const h2=P('hydrogen'); keepOut.push([h2.x,h2.z,.12]); addSolar(h2.x-.05,h2.z,5,4,.03); for(let i=0;i<3;i++){addTurbine(h2.x+.06+i*.04,h2.z-.04+i*.03,.6);} addCylinder(h2.x+.02,G,h2.z+.07,.02,.04,[.85,.95,.9],10);
    // Red Sea & AMAALA — islands and resorts
    const rsx=P('redsea'); for(let i=0;i<6;i++){const a=i/6*6.283,x=rsx.x+Math.cos(a)*.07,z=rsx.z+Math.sin(a)*.05;addCylinder(x,SEA,z,.024,G-SEA,[.94,.83,.58],10);addHouse(x,z,.3,[.97,.94,.86]);}
    const am=P('amaala'); keepOut.push([am.x,am.z,.08]); for(let i=0;i<5;i++)addHouse(am.x-.04+i*.02,am.z+(i%2)*.02,.35,[.96,.90,.80]);
    // Eastern Province — Jubail industry and Dammam port
    const ep=P('eastern'); keepOut.push([ep.x,ep.z,.12]); for(let i=0;i<6;i++){addCylinder(ep.x-.06+(i%3)*.05,G,ep.z-.03+Math.floor(i/3)*.06,.018,.05+rng()*.04,[.84,.80,.72],9);} addLine([ep.x+.08,G,ep.z],[ep.x+.08,G+.14,ep.z],[.7,.7,.7]);
    addBox(dm.x+.06,G,dm.z-.02,.05,.02,.12,[.55,.55,.58]); addCrane(dm.x+.07,dm.z-.05,.45,[.3,.6,.85]); addCrane(dm.x+.07,dm.z+.03,.45,[.9,.4,.3]);
    // Renewables — Sudair solar and wind
    const re=P('renewables'); keepOut.push([re.x,re.z,.12]); addSolar(re.x-.02,re.z-.03,6,4,.03); for(let i=0;i<3;i++)addTurbine(re.x+.085,re.z-.07+i*.04,.6);
    // Saudi Green Initiative — Al-Ahsa oasis
    const gi=P('green'); ownGrove(gi,10,.06);
    // Aseer — Soudah peaks, Jazan port & industry
    const so=P('soudah'); for(let i=0;i<5;i++)addCone(so.x+Math.cos(i*1.3)*.06,G,so.z+Math.sin(i*1.3)*.05,.05,.1+rng()*.06,[.32,.52,.30],7);
    const jz=P('jazan'); keepOut.push([jz.x,jz.z,.08]); for(let i=0;i<4;i++)addCylinder(jz.x-.03+i*.025,G,jz.z,.012,.05,[.82,.82,.78],8); addCrane(jz.x-.04,jz.z+.04,.45);
    // Visible construction activity across the map
    { const prev=target; target=detailMesh; for (const id of ['expo','newmurabba','neom','qiddiya','masar','jeddahcentral']) { const p=P(id); addCrane(p.x-p.foot*.6,p.z-p.foot*.45,.5); } target=prev; }
  }

  function buildCities(){
    const palettes={city:[[.98,.92,.80],[.96,.80,.58],[.99,.97,.92],[.93,.72,.50]],coast:[[1,.98,.94],[.96,.88,.72],[.72,.86,.94],[.98,.80,.62]],sacred:[[1,.99,.96],[.98,.94,.84],[.95,.90,.80]],desert:[[.92,.70,.46],[.97,.82,.58],[.86,.60,.40]],green:[[.96,.84,.66],[.90,.94,.86],[.98,.76,.56]]};
    for (const city of D.cities) {
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
  const TOWER_CORES = new Set(['Riyadh','Jeddah','Dammam']);   // Makkah and Madinah cores hold their holy-site landmarks instead

  // Each project's footprint is outlined on the ground in its colour, so its extent reads at every zoom.
  function buildMarkerRings(){ for (const p of D.projects) addRing(p.x,G+.008,p.z,p.foot,shade(p.color,.9),28); }

  buildTerrain(); buildNetworks(); buildLandmarks(); buildCities(); buildMarkerRings();

  // Clouds framing the diorama (drawn lit, but they cast no shadows)
  target = cloudGeo;
  { const [x,z]=geo(42.3,18.6); addCloud(x,.18,z,.35); addCloud(x+.3,.2,z+.25,.3); } // mist on the Aseer peaks
  target = mesh;

  /* ------------------------------ sea ------------------------------- */
  const WATER = (() => {
    const segs=[]; for (const poly of [saudi,...neighbours]) for (let i=0;i<poly.length;i++) segs.push([poly[i],poly[(i+1)%poly.length]]);
    const isles=[[50.55,26.05,.07],[41.9,16.8,.05],[42.2,16.6,.04],[36.7,25.4,.03],[36.9,25.7,.03],[36.5,25.9,.025]].map(([lo,la,r])=>[...geo(lo,la),r]);
    const rsx=P('redsea'); for(let i=0;i<6;i++){const a=i/6*6.283;isles.push([rsx.x+Math.cos(a)*.07,rsx.z+Math.sin(a)*.05,.024]);}
    const sd=P('sindalah'); isles.push([sd.x,sd.z,.05]);
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
  const beaconTop = st => { const k=tierCount(st); return G + k*.012 + .08 + k*.014; };
  const stageMesh = Geo(), stageLines = {p:[], c:[]};
  let stageDirty = true;
  function buildStageMesh(){
    stageMesh.p.length=stageMesh.c.length=stageMesh.n.length=stageLines.p.length=stageLines.c.length=0;
    target=stageMesh; lineTarget=stageLines;
    for (const p of D.projects) {
      const st=projectState[p.id], k=tierCount(st), d=st.doneKeys||[], [px,pz]=p.pad, f=p.foot;   // progress lives on the marker pad at the footprint's south edge
      if (d.includes('site') || st.active==='site') addDisc(px,G+.004,pz,.034,st.active==='site'?[.72,.52,.34]:[.80,.66,.48],18);   // graded site pad
      for (let i=0;i<k;i++) addCylinder(px,G+i*.012,pz,.026-i*.003,.012,shade(p.color,.8+i*.06),12);  // one tier per completed package
      addCylinder(px,G+k*.012,pz,.005,.08+k*.014,[.97,.95,.88],6);
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
    for (const l of sc.links) {
      const dx=l.b[0]-l.a[0], dz=l.b[1]-l.a[1], L=Math.hypot(dx,dz)||1, nx=-dz/L, nz=dx/L, off=KIND_OFF[l.kind]||0;
      const a=[l.a[0]+nx*off+dx/L*.03, l.a[1]+nz*off+dz/L*.03], b=[l.b[0]+nx*off-dx/L*.03, l.b[1]+nz*off-dz/L*.03], p=l.progress??1;
      const tip=[a[0]+(b[0]-a[0])*p, a[1]+(b[1]-a[1])*p];
      if (l.kind==='metro') { addRibbon(a,b,p,.014,G+.034,.007,[.60,.40,.86]); addRibbon(a,b,p,.018,G+.031,.003,[.9,.9,.93]);
        const n=Math.floor(L*p/.07); for(let i=0;i<=n;i++){const q=i*.07/L; addCylinder(a[0]+(b[0]-a[0])*q,G,a[1]+(b[1]-a[1])*q,.0035,.032,[.88,.88,.9],6);}
        if (p>=1) for (const e of [a,b]) { addCylinder(e[0],G,e[1],.022,.05,[.96,.95,.92],10); addCylinder(e[0],G+.05,e[1],.028,.006,[.60,.40,.86],10); } }
      else if (l.kind==='brt') { addRibbon(a,b,p,.02,G+.006,.004,[.98,.55,.18]); addRibbon(a,b,p,.004,G+.0105,.001,[1,1,1]);
        if (p>=1) for (const e of [a,b]) { addBox(e[0],G,e[1],.03,.022,.014,[.98,.97,.94]); addBox(e[0],G+.022,e[1],.036,.004,.02,[.98,.55,.18]); } }
      else if (l.kind==='freight') { addRibbon(a,b,p,.022,G+.006,.004,[.36,.33,.30]); addRibbon(a,b,p,.004,G+.0105,.002,[.25,.85,.8]);
        if (p>=1) for (const q of [.3,.7]) { const x=a[0]+(b[0]-a[0])*q, z=a[1]+(b[1]-a[1])*q; addBox(x,G+.01,z,.03,.012,.012,[[.9,.35,.3],[.25,.55,.85]][q>.5?1:0],Math.atan2(b[1]-a[1],b[0]-a[0])); } }
      else if (l.kind==='wide') { addRibbon(a,b,p,.036,G+.005,.003,[.40,.41,.44]); addRibbon(a,b,p,.003,G+.0085,.001,[1,.85,.3]); }
      else if (l.kind==='power') { const n=Math.max(2,Math.floor(L*p/.12)); let prev=null; for(let i=0;i<=n;i++){const q=i/n*p; const x=a[0]+(b[0]-a[0])*q, z=a[1]+(b[1]-a[1])*q; addBox(x,G,z,.006,.07,.006,[.7,.72,.76]); addBox(x,G+.065,z,.03,.004,.004,[.7,.72,.76]); if(prev) addLine([prev[0],G+.067,prev[1]],[x,G+.067,z],[.35,.35,.4]); prev=[x,z];} }
      if (p<1) { addCrane(tip[0]+.02,tip[1]+.02,.3,[.98,.74,.16]); const segs=10; for(let i=0;i<segs;i+=2){ const q0=p+(1-p)*i/segs, q1=p+(1-p)*(i+1)/segs; addLine([a[0]+(b[0]-a[0])*q0,G+.02,a[1]+(b[1]-a[1])*q0],[a[0]+(b[0]-a[0])*q1,G+.02,a[1]+(b[1]-a[1])*q1],[1,.8,.3]); } }
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
  const topY = Object.fromEntries(D.projects.map(p => [p.id, G+.1]));
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
  let hazard=null, entities=[], overlay=[], convoyList=[], groundHandler=null, tint=[.80,.58,.32], follow=null;
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
  const roadPaths = D.roads.map(polyline), railPaths = D.rails.map(polyline);
  const shipLanes = [[[43.3,12.6],[41.0,15.0],[38.6,19.5],[37.0,23.5],[35.3,26.9],[34.75,28.3]],[[56.6,26.4],[54.0,26.2],[52.0,26.8],[50.5,27.2],[49.9,27.2]],[[56.6,26.4],[57.5,24.5],[59.6,22.4],[58.0,19.0],[52.0,15.2],[45.0,12.2],[43.3,12.6]]].map(l=>l.map(([a,b])=>geo(a,b)));
  const pathLen = path => { let L=[0]; for(let i=1;i<path.length;i++)L.push(L[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1])); return L; };
  const along = (path, L, q) => { const d=q*L[L.length-1]; let i=1; while(i<L.length-1&&L[i]<d)i++; const t=(d-L[i-1])/((L[i]-L[i-1])||1); return [path[i-1][0]+(path[i][0]-path[i-1][0])*t, path[i-1][1]+(path[i][1]-path[i-1][1])*t]; };
  const roadL=roadPaths.map(pathLen), railL=railPaths.map(pathLen), shipL=shipLanes.map(pathLen);
  const dp=[], dc=[], ds=[], wakes=[];
  const CLUSTER_DIST = 8.5;
  const cityLights = []; { const rl=(s=>()=>{s=(s*16807)%2147483647;return s/2147483647;})(77); for (const c of D.cities) { const n=Math.round(20+c.size*110), R=.06+c.size*.3; for (let i=0;i<n;i++){ const a=rl()*6.283, r=Math.sqrt(rl())*R; const warm=rl(); cityLights.push([c.x+Math.cos(a)*r, c.z+Math.sin(a)*r*.85, 1, .72+warm*.2, .38+warm*.25, 2.2+rl()*2.2]); } } }
  const clusters = Object.values(D.projects.filter(p=>p.anchor).reduce((m,p)=>{ const c=C(p.anchor); (m[p.anchor]=m[p.anchor]||{anchor:p.anchor,x:c.x,z:c.z,ids:[]}).ids.push(p.id); return m; },{}));
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
      if (clustered && pr.anchor && !sel && !hov) continue;
      const top=beaconTop(st), pulse=Math.sin(t*.003+pr.x*3)*.01;
      const col = st.health==='blocked'?[.95,.35,.28]:st.health==='waiting'?[1,.72,.2]:st.done>=6?[1,.86,.3]:pr.color;
      push(pr.pad[0],top+.02+pulse+(sel?.03:0),pr.pad[1],sel?[1,.95,.55]:col,sel?15:hov?13:10);
      if (st.active) for (let i=0;i<3;i++){const a=t*.0024+i/3*6.283,r=.035;push(pr.pad[0]+Math.cos(a)*r,G+.02+i*.01,pr.pad[1]+Math.sin(a)*r,pr.color,3.5);}
    }
    if (clustered && beaconsOn) for (const cl of clusters) { const pulse=Math.sin(t*.003+cl.x)*.012; push(cl.x,G+.34+pulse,cl.z,[1,.82,.3],19); push(cl.x,G+.34+pulse,cl.z,[1,1,.9],9); }
    roadPaths.forEach((path,r)=>{const L=roadL[r],n=Math.max(4,Math.round(L[L.length-1]*6));for(let i=0;i<n;i++){const dir=i%2,q=((t*.00003*(1+r%3*.3))/L[L.length-1]*3+i/n)%1,[x,z]=along(path,L,dir?q:1-q);push(x,G+.02,z,dir?[1,.92,.45]:[1,.98,.9],3.2);}});
    for (const w of wakes) push(w[0],SEA+.004,w[1],[1,1,1],w[2]);
    const mk=C('Makkah'); for(let i=0;i<48;i++){const a=i*.82+t*.00015,r=.035+(i%5)*.008;push(mk.x+Math.cos(a)*r,G+.012,mk.z+Math.sin(a)*r,[.99,.99,.96],2.2);}
    const hj=P('hajj'); for(let i=0;i<30;i++){const q=((t*.00004)+i/30)%1;push(hj.x+(mk.x-hj.x)*q+Math.sin(i*7)*.01,G+.012,hj.z+(mk.z-hj.z)*q+Math.cos(i*5)*.01,[.99,.99,.96],2.2);}
    const ry=C('Riyadh'); for(let i=0;i<30;i++){const a=i*2.1+t*.0004,r=.03+(i%6)*.016;push(ry.x+Math.cos(a)*r,G+.02+(i%4)*.02,ry.z+Math.sin(a)*r,[1,.76,.3],3);}
    if (hazard && hazard.intensity>.02) {
      const hz=hazard, n=Math.round(520*hz.intensity);
      for(let i=0;i<n;i++){ const q=Math.sqrt((i*17.17+t*.00022)%1), ang=i*2.399+t*.0003, x=hz.x+Math.cos(ang)*q*hz.r, z=hz.z+Math.sin(ang)*q*hz.r*.85;
        if (hz.type==='rain') push(x,G+.02+(((i*.37)+t*.0012)%1)*.5,z,[.72,.82,.95],2.4);
        else if (hz.type==='heat') push(x,G+.02+(((i*.21)+t*.00025)%1)*.3,z,i%2?[1,.62,.36]:[1,.82,.5],2.2+(i%3));
        else push(x,G+.03+((i%13)/13)*.45,z,i%3?[.80,.56,.30]:[.70,.46,.24],3+(i%4)*1.5); }
    }
    // Simulation entities: support units, challenge assets, site beacons
    for (const e of entities) push(e.x,(e.y??G+.06)+(e.pulse?Math.sin(t*.006)*.01:0),e.z,e.color,e.size||10);
    // Flow dots along overlay layers (logistics, grid, dependencies)
    for (const o of overlay) if (o.flow) { const L=Math.hypot(o.b[0]-o.a[0],o.b[1]-o.a[1]); const n=o.n!=null?o.n:Math.max(1,Math.round(L*5)); const sp=(o.speed||1)*.00012, y=o.y??G+.03; for(let i=0;i<n;i++){ let q=((t*sp)/Math.max(.2,L)+i/n+(o.phase||0))%1; if(o.both&&i%2) q=1-q; push(o.a[0]+(o.b[0]-o.a[0])*q,y,o.a[1]+(o.b[1]-o.a[1])*q,o.color,o.size||3.4); } }
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
  for (const l of D.labels) { const [x,z]=geo(l.lon,l.lat); makeLabel(l.text, l.kind, x, l.kind==='sea'?SEA:l.kind==='place'?G:NEI, z, l.kind==='place'?8:l.kind==='sea'?1:0); }
  for (const c of D.cities) { const L=makeLabel(c.name, 'city pal-'+c.palette+(c.capital?' capital':''), c.x, G+.1, c.z, c.priority||(3+c.size*4)); L.dx=c.dx||0; L.dy=c.dy||0; }
  const projLabel = makeLabel('', 'project', 0, 0, 0, 10);
  // Honest framing: the Riyadh districts are an illustrative plan, not survey geography.
  const noteLabel = (() => { const r=C('Riyadh'); const L=makeLabel('Illustrative district plan · not to scale', 'map-note', r.x, G, r.z+.72, 2.5); L.note=true; return L; })();
  const clusterLabels = clusters.map(cl => { const L=makeLabel(cl.anchor+' · '+cl.ids.length+' projects', 'cluster', cl.x, G+.34, cl.z, 9.5); L.cluster=true; return L; });
  // Project name labels hold a full and a short variant (each translated once by the Arabic layer); the placer picks the
  // variant that fits, anchors the label just above the model's real top, and lets the player click it.
  const smallProjLabels = D.projects.map(p => { const L=makeLabel('', 'proj-small', p.x, G+.16, p.z, 1.5); L.small=true; L.pid=p.id; L.el.dataset.pid=p.id;
    L.el.innerHTML='<span class="lf"></span><span class="ls"></span>'; L.el.children[0].textContent=p.name; L.el.children[1].textContent=LY.SHORT[p.id]||p.name; return L; });
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
    labelLayer.classList.toggle('selectable', selectable);
    const focus = hoverId || selectedId, cand = [];
    for (const L of labels) {
      let show = true, x=L.x, y=L.y, z=L.z, pri=L.priority;
      if (L===projLabel) { const p=focus&&P(focus); if(!p||!projLabelsOn){show=false;} else { if (L.el.textContent!==p.name) { L.el.textContent=p.name; } L.el.dataset.pid=p.id; x=p.x; z=p.z; y=topY[p.id]+.035; } }
      else if ((L.cluster||L.small) && !projLabelsOn) show = false;
      else if (L.cluster) show = far > CLUSTER_DIST;
      else if (L.note) show = projLabelsOn && far < 5.2;
      else if (L.small) { show = far < 5.2 && L.pid!==focus; y = topY[L.pid]+.03; }
      else if (L.el.classList.contains('country')||L.el.classList.contains('sea')) show = far > 6.5;
      else if (!L.el.classList.contains('capital')) show = far < 24;
      const s = show && project([x,y,z]);
      if (!s || s[2]>1 || s[0]<-60 || s[1]<-30 || s[0]>innerWidth+60 || s[1]>innerHeight+30) { L.el.style.opacity=0; continue; }
      if (L.small) pri = 2 + .9 * (1 - Math.min(1, Math.hypot(s[0]-cx, s[1]-cy) / diag));   // nearer the middle of the view = more relevant
      cand.push({L, s, pri});
    }
    cand.sort((a,b) => b.pri - a.pri);
    const placed = [];
    for (const {L, s} of cand) {
      measure(L); if (L===projLabel) { L.w=L.el.offsetWidth; L.h=L.el.offsetHeight; }
      const lift = L.el.classList.contains('city')||L===projLabel||L.cluster ? 18 : L.small ? 8 : 0;
      const at = w => ({x:s[0]-w/2+(far>7?L.dx:0), y:s[1]-L.h/2-lift+(far>7?L.dy:0), w, h:L.h});
      const free = r => !placed.some(q => hits(r, q)) && !obstacles.some(q => hits(r, q, 2, 2));
      let r = at(L.small ? L.wF : L.w), short = false;
      if (!free(r) && L.small) { r = at(L.wS); short = true; }        // shorten before giving up
      if (!free(r)) { L.el.style.opacity=0; continue; }
      if (L.small) L.el.classList.toggle('use-short', short);
      L.el.classList.toggle('hot', !!L.pid && L.pid===hoverId || L===projLabel);
      placed.push(r);
      L.el.style.opacity=1; L.el.style.transform=`translate3d(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px,0)`;
    }
  }
  // Clicking or hovering a project's label acts on that same project.
  labelLayer.addEventListener('click', e => { const el=e.target.closest('[data-pid]'); if (!el || !selectable) return; hideChoices(); onSelect(P(el.dataset.pid)); });
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
    if (hazard) { const d=Math.hypot(camera.target[0]-hazard.x,camera.target[2]-hazard.z); st=Math.max(st,hazard.intensity*Math.max(0,Math.min(1,1.7-d/(hazard.r*2.2)))*(hazard.type==='heat'?.45:1)); const tt=TINTS[hazard.type]||TINTS.dust; for(let i=0;i<3;i++) tint[i]+=(tt[i]-tint[i])*.05; }
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
      if (sp) { addRing(sp.x,G+.014,sp.z,sp.foot+.006,[1,.86,.3],40); addRing(sp.x,G+.016,sp.z,sp.foot+.012,[1,.95,.6],40); }
      if (hp) addRing(hp.x,G+.014,hp.z,hp.foot+.006,[1,1,1],40); }
    for (const o of overlay) { if (o.noLine) continue; const y=G+.022;
      if (o.dash) { const n=14; for(let i=0;i<n;i+=2){ const a=i/n,b=(i+1)/n; addLine([o.a[0]+(o.b[0]-o.a[0])*a,y,o.a[1]+(o.b[1]-o.a[1])*a],[o.a[0]+(o.b[0]-o.a[0])*b,y,o.a[1]+(o.b[1]-o.a[1])*b],o.color); } continue; }
      addLine([o.a[0],y,o.a[1]],[o.b[0],y,o.b[1]],o.color); addLine([o.a[0],y+.002,o.a[1]+.004],[o.b[0],y+.002,o.b[1]+.004],o.color); if (o.thick) { addLine([o.a[0]+.004,y,o.a[1]],[o.b[0]+.004,y,o.b[1]],o.color); addLine([o.a[0]-.004,y+.001,o.a[1]-.002],[o.b[0]-.004,y+.001,o.b[1]-.002],o.color); } }
    for (const e of entities) { if (e.ring) addRing(e.x,G+.012,e.z,e.ring,e.ringColor||e.color,28);
      if (e.path) { const n=10; for(let i=0;i<n;i+=2){ const a=i/n,b=(i+1)/n; addLine([e.x+(e.path[0]-e.x)*a,G+.03,e.z+(e.path[1]-e.z)*a],[e.x+(e.path[0]-e.x)*b,G+.03,e.z+(e.path[1]-e.z)*b],e.color); } } }
    if (hazard && hazard.intensity>.02) { addRing(hazard.x,G+.015,hazard.z,hazard.r,[1,.55,.3],48); addRing(hazard.x,G+.015,hazard.z,hazard.r*(.55+.05*Math.sin(t*.004)),[1,.72,.4],40); }
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
    if (beaconsOn) for (const pr of D.projects) { if (clustered && pr.anchor) continue; const q=project([pr.pad[0],beaconTop(projectState[pr.id])+.02,pr.pad[1]]); if (!q || q[2]>1) continue; const d=Math.hypot(q[0]-cx,q[1]-cy); if (d<=tol) markers.push({id:pr.id, d}); }
    if (clustered && beaconsOn) for (const cl of clusters) { const q=project([cl.x,G+.34,cl.z]); if (q && Math.hypot(q[0]-cx,q[1]-cy)<=tol+6) clusterHits.push(cl); }
    return {markers, clusterHits};
  }
  function resolveAt(cx, cy, touch){
    const m=measurePick(cx, cy, touch?16:6), mk=markerHits(cx, cy, touch?24:14), clustered=camera.dist>CLUSTER_DIST;
    if (!m.center && !m.around.length && !mk.markers.length && mk.clusterHits.length) return {choose:mk.clusterHits[0].ids.slice()};
    const nearest = list => list.length ? list.reduce((a,b)=>a.d<=b.d?a:b).id : null;
    const first = m.center || nearest(m.around) || nearest(mk.markers), fp = first && P(first);
    const cluster = clustered && fp && fp.anchor ? (clusters.find(c=>c.anchor===fp.anchor)||{}).ids : null;
    return LY.resolvePick({center:m.center, around:m.around, markers:mk.markers, cluster});
  }
  // Cheap CPU pre-check: is the pointer anywhere near a project's on-screen box? Only then run the GPU ID pick.
  function nearAnyProject(x, y, pad){
    for (const p of D.projects) { let x0=1e9, y0=1e9, x1=-1e9, y1=-1e9, any=false;
      for (let i=0;i<8;i++) { const a=i/8*6.283; for (const yy of [G, topY[p.id]]) { const q=project([p.x+Math.cos(a)*p.foot, yy, p.z+Math.sin(a)*p.foot]); if (!q) continue; any=true; x0=Math.min(x0,q[0]); x1=Math.max(x1,q[0]); y0=Math.min(y0,q[1]); y1=Math.max(y1,q[1]); } }
      const m=project([p.pad[0], beaconTop(projectState[p.id])+.02, p.pad[1]]); if (m) { x0=Math.min(x0,m[0]); x1=Math.max(x1,m[0]); y0=Math.min(y0,m[1]); y1=Math.max(y1,m[1]); }
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
    choiceEl.querySelectorAll('[data-pid]').forEach(b => { b.onclick=()=>{ hideChoices(); onSelect(P(b.dataset.pid)); }; b.onpointerenter=()=>{ hoverId=b.dataset.pid; }; });
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
      if (selectable) { const r=resolveAt(e.clientX,e.clientY,e.pointerType==='touch'); if (r && r.select) { hideChoices(); onSelect(P(r.select)); } else if (r && r.choose) showChoices(r.choose,e.clientX,e.clientY); else hideChoices(); } }
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
    focusRegion(id){ const r=D.regions[id]||K; selectedId=null; directMode=false; setDesired(r.az,r.el,r.dist,r.x,r.z); },
    overview(){ selectedId=null; directMode=false; follow=null; stormTarget=0; setDesired(K.az,K.el,K.dist,K.x,K.z); },
    // World coordinates for simulation data (same anchor spread as projects)
    place(lon, lat, anchor){ let [x,z]=geo(lon,lat); const a=anchor&&C(anchor); if(a){x=a.x+(x-a.x)*ANCHOR_SPREAD;z=a.z+(z-a.z)*ANCHOR_SPREAD;} return [x,z]; },
    focusPoint(x, z, dist=3.4, el=.72){ directMode=false; follow=null; setDesired(.35,el,dist,x,z,.03); },
    setHazard(h){ hazard=h; },
    setEntities(list){ entities=list||[]; },
    setOverlay(list){ overlay=list||[]; },
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
    // Only the National Simulation selects projects on the map; the menu map stays inert (no pointer cue, no dead clicks).
    setSelectable(v){ selectable=!!v; if (!selectable) { hoverId=null; hideChoices(); canvas.style.cursor=groundHandler?'crosshair':''; } labelLayer.classList.toggle('selectable', selectable); },
    // Test/inspection helpers (read-only): what a click would select, and where each project is actually visible.
    debug:{
      pickAt:(x, y, touch) => resolveAt(x, y, !!touch),
      visiblePixels(id, max=16){ const px=renderIds(0,0,width,height), k=PIDX[id], pts=[]; for (let j=0;j<height;j+=2) for (let i=0;i<width;i+=2) { const o=(j*width+i)*4; if (px[o+2] && px[o]+px[o+1]*256===k) pts.push([i/dpr,(height-j)/dpr]); }
        if (!pts.length) return []; const mx=pts.reduce((a,p)=>a+p[0],0)/pts.length, my=pts.reduce((a,p)=>a+p[1],0)/pts.length; return pts.sort((a,b)=>Math.hypot(a[0]-mx,a[1]-my)-Math.hypot(b[0]-mx,b[1]-my)).slice(0,max).map(([x,y])=>({x,y})).concat([{count:pts.length}]); },
      marker(id){ const pr=P(id), q=project([pr.pad[0],beaconTop(projectState[id])+.02,pr.pad[1]]); return q?{x:q[0],y:q[1]}:null; },
      state:() => ({dist:camera.dist, selectable, hoverId, selectedId, detail:detailOn()})
    }
  };
  requestAnimationFrame(render);
})();
