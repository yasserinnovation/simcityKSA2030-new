(() => {
  'use strict';

  const D = window.VISION_DATA;
  const canvas = document.getElementById('world');
  // three.js renderer (vendor/three, loaded by boot.js). It owns the GL context, buffers, render targets and draw calls;
  // the scene below reproduces the original renderer exactly (same geometry, same shaders as RawShaderMaterials).
  const THREE = window.THREE;
  let renderer = null;
  try { THREE.ColorManagement.enabled = false; renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'}); } catch (e) { renderer = null; }
  const gl = renderer && renderer.getContext();
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
  for (const [k, v] of Object.entries(LY.REGION_VIEWS || {})) if (D.regions[k]) Object.assign(D.regions[k], {x:v.camera.x, z:v.camera.z, az:0, el:1.02, dist:v.camera.dist, fitWidth:true, phoneFit:v.camera.phoneFit || 1.5});
  Object.assign(D.regions.kingdom,{el:.82,az:.02,dist:9.0,nationalFit:true}); D.regions.kingdom.x+=.1; D.regions.kingdom.z+=.15;   // V22: the reference's tilted diorama framing (V21: el 1.02, dist 11.2; V19: dist 14.4)
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
  let rngNow = mulberry32(2030); const rng = () => rngNow();   // the shared scenery stream
  // V14: run fn on a stream of its own, leaving the shared scenery stream exactly where it was.
  const withRng = (seed, fn) => { const keep = rngNow; rngNow = mulberry32(seed); try { fn(); } finally { rngNow = keep; } };
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
  // The original shaders, unchanged in what they compute. Attributes use three.js names; the *_I variants read the
  // per-instance matrix/colour of InstancedMesh (instance colour tints only the vertices whose aTintK > 0, e.g. foliage).
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const PREC = hp && hp.precision > 0 ? 'precision highp float;' : 'precision mediump float;';
  const FOG = `
    uniform vec3 uTint; uniform float uNight;
    float cloudShade(vec2 p, float tm){ float n=sin(p.x*.8+tm*.035)*sin(p.y*1.05-tm*.025)+.6*sin(p.x*.43-p.y*.57+tm*.02); return 1.0-.14*smoothstep(.55,1.15,n); }
    vec3 applyAtmos(vec3 c, float w){
      float f=clamp((w-uDist*.95)/(uDist*1.7),0.,1.);
      vec3 sky=mix(mix(vec3(.66,.84,.95),mix(vec3(.80,.52,.44),vec3(.10,.14,.30),smoothstep(.35,1.0,uNight)),smoothstep(0.0,.5,uNight)),uTint,uStorm*.75);
      c=mix(c,sky,f*.5); c=mix(c,uTint*.9,uStorm*.34); return c; }`;
  const INST_ATTR = 'attribute mat4 instanceMatrix; attribute vec3 instanceColor; attribute float aTintK;';
  const WPOS = inst => inst ? '(instanceMatrix*vec4(position,1.0)).xyz' : 'position';
  // Lit, shadow-receiving mesh shader: sun + sky/ground hemisphere + soft PCF shadows + contact darkening.
  const MESH_VS = inst => `precision highp float;
    attribute vec3 position; attribute vec3 color; attribute vec3 normal; attribute float aRoughness; ${inst ? INST_ATTR : ''}
    uniform mat4 uVP; uniform mat4 uLightVP; uniform vec3 uOffset;
    varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld; varying vec4 vLight; varying float vW; varying float vRoughness;
    void main(){ vec3 w=${WPOS(inst)}+uOffset; vWorld=w; vec4 p=uVP*vec4(w,1.0); gl_Position=p; vW=p.w;
      vColor=${inst ? 'color+aTintK*instanceColor' : 'color'}; vRoughness=aRoughness; vNormal=${inst ? 'mat3(instanceMatrix)*normal' : 'normal'}; vLight=uLightVP*vec4(w,1.0); }`;
  const MESH_FS = PREC + `
    uniform sampler2D uShadow; uniform vec3 uSun; uniform vec3 uEye; uniform float uStorm; uniform float uDist;
    uniform float uShadowOn; uniform float uTexel; uniform float uGlow; uniform float uGround; uniform float uTime;
    uniform float uFx; uniform float uSoft; uniform float uHdr;   // V20 premium tier: stylized lighting, soft shadows, HDR emitters
    varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld; varying vec4 vLight; varying float vW; varying float vRoughness;
    ` + FOG + `
    float unpack(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }
    float shadowAt(float ndl){
      vec3 s=vLight.xyz/vLight.w*0.5+0.5;
      if(uShadowOn<0.5||s.x<0.0||s.x>1.0||s.y<0.0||s.y>1.0||s.z>1.0) return 1.0;
      float bias=0.0012+0.0025*(1.0-ndl), sum=0.0;
      if(uSoft>0.5){
        // V20: rotated Poisson disc (12 taps, 16 on Ultra): wider, noise-free penumbrae instead of the 3×3 grid's stair steps
        float a=6.2832*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))), ca=cos(a), sa=sin(a), rad=uTexel*(uSoft>1.5?3.4:2.4);
        #define PTAP(x,y) { vec2 o=vec2(x*ca-y*sa, x*sa+y*ca)*rad; sum += (s.z-bias>unpack(texture2D(uShadow, s.xy+o))) ? 0.0 : 1.0; }
        PTAP(-.94,-.40) PTAP(.95,-.77) PTAP(-.09,-.93) PTAP(.34,.29) PTAP(-.92,.46) PTAP(-.82,-.15) PTAP(-.38,.28) PTAP(-.20,.98) PTAP(.81,.50) PTAP(.16,-.25) PTAP(.48,-.58) PTAP(.55,.88)
        if(uSoft>1.5){ PTAP(-.62,-.78) PTAP(.98,.02) PTAP(-.50,.78) PTAP(.07,.58) return sum/16.0; }
        return sum/12.0;
      }
      // 3×3 PCF, unrolled (a texture fetch inside a loop warns on Direct3D/ANGLE)
      #define TAP(i,j) sum += (s.z-bias>unpack(texture2D(uShadow, s.xy+vec2(i,j)*uTexel*1.3))) ? 0.0 : 1.0;
      TAP(-1.,-1.) TAP(-1.,0.) TAP(-1.,1.) TAP(0.,-1.) TAP(0.,0.) TAP(0.,1.) TAP(1.,-1.) TAP(1.,0.) TAP(1.,1.)
      return sum/9.0;
    }
    void main(){
      vec3 N=normalize(vNormal); vec3 V=normalize(uEye-vWorld); if(dot(N,V)<0.0) N=-N;
      float ndl=max(dot(N,uSun),0.0); float sh=mix(1.0, shadowAt(ndl), 1.0-uStorm*.6);
      vec3 hemi=mix(vec3(.80,.68,.54), vec3(.80,.88,1.0), N.y*0.5+0.5);   // V10: warm ground bounce, cool sky fill
      float ao = N.y>0.8 ? 1.0 : mix(0.66,1.0,clamp((vWorld.y-uGround)/0.06,0.0,1.0));   // contact darkening grounds buildings
      vec3 sunCol=vec3(1.0,.86,.65);                                       // warm golden-hour palette
      float cl=uGlow>0.3?1.0:cloudShade(vWorld.xz,uTime);
      // V20 (Medium and up): a little wrap on the sun term softens the terminator on rounded clay forms
      float ndlS=mix(ndl, clamp((dot(N,uSun)+.12)/1.12,0.0,1.0), uFx);
      vec3 c=vColor*(hemi*(0.57+uGlow)*ao + sunCol*ndlS*mix(0.36,1.0,sh)*0.83*cl);   // V11: warm light, softer readable shadows
      // V20: shadowed sunlit faces take the cool sky colour (stylized coloured shadows) and walls catch a soft sky rim
      c*=mix(vec3(1.0), vec3(.90,.95,1.07), uFx*(1.0-sh)*smoothstep(.05,.5,ndl));
      c+=vColor*vec3(.80,.88,1.0)*pow(1.0-max(dot(N,V),0.0),3.0)*.16*uFx*(1.0-smoothstep(.55,.9,N.y))*(1.0-uNight*.7)*(1.0-uStorm);
      // Dielectric GGX response replaces the same shiny highlight on every surface.
      // Authored palette materials define roughness; unnamed terrain/foliage defaults to matte.
      c*=.96;
      if(vRoughness<.70){ // matte terrain and foliage avoid expensive glossy lighting work
      vec3 H=normalize(uSun+V); float nv=max(dot(N,V),.001), nh=max(dot(N,H),0.0), vh=max(dot(V,H),0.0);
      float rough=clamp(vRoughness,.22,.95), a2=pow(rough,4.0);
      float denom=nh*nh*(a2-1.0)+1.0, D=a2/(3.14159*denom*denom);
      float k=(rough+1.0)*(rough+1.0)/8.0;
      float geom=(nv/(nv*(1.0-k)+k))*(ndl/(ndl*(1.0-k)+k));
      float fres=.04+.96*pow(1.0-vh,5.0);
      c+=sunCol*min(.20,D*geom*fres/(4.0*nv*max(ndl,.001)))*ndl*sh;
      c+=hemi*.04*pow(1.0-nv,5.0)*(1.0-rough); // restrained sky reflection, no extra render pass
      }
      // Warm clay terrain and pastel miniature surfaces on every quality tier.
      if(abs(vWorld.y-uGround)<.003 && N.y>.8){c=mix(c,vec3(.96,.73,.43),.30);}
      if(abs(vWorld.y-(uGround-.03))<.002 && N.y>.8){c=mix(c,vec3(.45,.46,.48),.58);}
      if(vWorld.y>uGround+.003 && N.y>.6 && vColor.r>vColor.b*1.30 && vColor.g>vColor.b*1.12){float rip=sin(vWorld.x*430.0+vWorld.z*210.0+sin(vWorld.z*17.0)*3.0);c*=1.0+.035*rip*clamp(2.0-uDist*.12,0.0,1.0);}
      float l=dot(c,vec3(.299,.587,.114)); c=mix(vec3(l),c,1.16);
      vec3 highlight=max(c-vec3(.78),vec3(0.0));
      c=min(c,vec3(.78))+highlight/(vec3(1.0)+highlight/.22); // soft exposure shoulder preserves pale roof detail
      // dusk to night in two stages: a warm golden-violet desert dusk first, then the cool night (lights read against both)
      vec3 duskC=c*vec3(.78,.60,.60)+vec3(.03,.012,.004), nightC=c*vec3(.26,.32,.58)+vec3(.012,.018,.05);
      // V20: with the HDR target, lit facades (glow layers above .5) shine past 1.0, so only they feed the bloom at night
      c=mix(c, mix(duskC,nightC,smoothstep(.35,1.0,uNight)), smoothstep(0.0,.5,uNight)) + vColor*uGlow*.6*uNight*(uGlow>.5?1.0+uHdr*1.6:1.0);
      gl_FragColor=vec4(applyAtmos(c,vW),1.0);
    }`;
  // Depth-only pass for the sun shadow map (packed into RGBA).
  const DEPTH_VS = inst => `precision highp float; attribute vec3 position; ${inst ? INST_ATTR : ''} uniform mat4 uLightVP; uniform vec3 uOffset;
    void main(){ gl_Position=uLightVP*vec4(${WPOS(inst)}+uOffset,1.0); }`;
  const DEPTH_FS = PREC + `
    void main(){ vec4 e=fract(vec4(1.0,255.0,65025.0,16581375.0)*gl_FragCoord.z); e-=e.yzww*vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0); gl_FragColor=e; }`;
  // Animated sea: reef-to-deep colour from distance-to-shore, moving foam line and sun glints.
  const WATER_VS = `precision highp float; attribute vec3 position; attribute float aShore; uniform mat4 uVP;
    varying vec3 vWorld; varying float vShore; varying float vW;
    void main(){ vec4 p=uVP*vec4(position,1.0); gl_Position=p; vW=p.w; vWorld=position; vShore=aShore; }`;
  const WATER_FS = PREC + `
    uniform float uTime; uniform vec3 uSun; uniform vec3 uEye; uniform float uStorm; uniform float uDist; uniform float uHdr;
    varying vec3 vWorld; varying float vShore; varying float vW;
    ` + FOG + `
    void main(){
      float s=vShore, t=uTime;
      float fade=clamp(1.6-vW/(uDist*0.9),0.0,1.0);   // fade fine ripples with distance to avoid shimmer
      float w1=sin(vWorld.x*11.0+t*1.2)*sin(vWorld.z*9.0-t*0.9);
      float w2=(sin((vWorld.x-vWorld.z)*29.0+t*2.1)*0.5+sin((vWorld.x+vWorld.z*1.3)*41.0-t*2.6)*0.35)*fade;
      vec3 N=normalize(vec3((w1+w2)*0.07,1.0,(w1-w2)*0.06));
      vec3 reef=vec3(.51,.88,.79), shallow=vec3(.12,.72,.73), mid=vec3(.035,.39,.56), deep=vec3(.015,.16,.30);
      vec3 c=mix(reef,shallow,smoothstep(0.0,0.12,s)); c=mix(c,mid,smoothstep(0.08,0.34,s)); c=mix(c,deep,smoothstep(0.30,0.95,s));   // V11: smooth shallows
      c*=0.96+0.06*w1*fade;
      float coral=sin(vWorld.x*87.0+sin(vWorld.z*43.0)*2.8)*sin(vWorld.z*91.0+sin(vWorld.x*37.0)*2.4);
      float patch=smoothstep(.1,.65,coral)*(1.0-smoothstep(.05,.22,s))*smoothstep(.015,.04,s);
      c=mix(c,vec3(.40,.64,.43),patch*.36);
      float band=0.012+0.008*sin(t*1.6+vWorld.x*14.0+vWorld.z*9.0);
      float foam=smoothstep(0.014,0.0,abs(s-band))*0.6+smoothstep(0.02,0.0,s)*0.5;
      float national=smoothstep(6.0,7.0,uDist);
      float exposure=.25+.75*smoothstep(-.2,.5,sin(vWorld.z*2.7+vWorld.x*1.5));
      c=mix(c,vec3(.97,.98,.96),clamp(foam,0.0,1.0)*mix(.58,.20*exposure,national));
      // V21 national palette (reference map): bright turquoise shallows, vivid cyan-blue mid water, saturated deep blue
      vec3 calmReef=vec3(.48,.90,.86),calmShallow=vec3(.10,.72,.80),calmMid=vec3(.07,.47,.76),calmDeep=vec3(.05,.29,.60);
      float sn=s*(.75+.5*(.5+.5*sin(vWorld.x*5.3+sin(vWorld.z*3.1)*2.0)*sin(vWorld.z*4.7+vWorld.x*1.3)));   // V22: broken, narrower shallows
      vec3 calm=mix(calmReef,calmShallow,smoothstep(0.0,.045,sn));calm=mix(calm,calmMid,smoothstep(.05,.15,sn));calm=mix(calm,calmDeep,smoothstep(.15,.5,sn));
      calm=mix(calm,vec3(.20,.60,.60),smoothstep(.35,.8,coral)*(1.0-smoothstep(.03,.11,sn))*smoothstep(.008,.025,sn)*.5);   // reef patches
      c=mix(c,calm*(.97+.05*w1*fade),national*.9); c=mix(c,vec3(.93,.99,.98),national*smoothstep(.022,.0,s)*.55);   // V21: soft white surf on every coast
      vec3 V=normalize(uEye-vWorld); vec3 H=normalize(uSun+V);
      float spec=pow(max(dot(N,H),0.0),90.0)*fade; c+=vec3(1.0,.95,.82)*spec*0.5*(1.0+uHdr*1.4)*(1.0-uStorm);   // V20: sun glints are HDR emitters
      c*=mix(0.88,1.0,(cloudShade(vWorld.xz,t)-0.70)/0.30);
      float fres=pow(1.0-max(dot(N,V),0.0),4.0); c=mix(c,vec3(.74,.90,.96),fres*0.22);
      c=mix(c, c*vec3(.22,.30,.55)+vec3(.0,.02,.06), uNight);
      gl_FragColor=vec4(applyAtmos(c,vW),1.0);
    }`;
  // Picking: project id colour per triangle (aPick) or per instance; occluders render black (uOcc).
  const PICK_VS = inst => `precision highp float; attribute vec3 position; attribute vec3 aPick; ${inst ? 'attribute mat4 instanceMatrix;' : ''} uniform mat4 uVP; varying vec3 vC;
    void main(){ gl_Position=uVP*vec4(${inst ? '(instanceMatrix*vec4(position,1.0)).xyz' : 'position'},1.0); vC=aPick; }`;
  const PICK_FS = `precision mediump float; uniform float uOcc; varying vec3 vC; void main(){ gl_FragColor=vec4(uOcc>0.5?vec3(0.0):vC,1.0); }`;
  const POINT_VS = `precision highp float; attribute vec3 position; attribute vec3 color; attribute float aSize; uniform mat4 uVP; uniform float uScale; varying vec3 vColor;
    void main(){ vec4 p=uVP*vec4(position,1.0); gl_Position=p; gl_PointSize=aSize*uScale*clamp(13.0/p.w,0.55,2.4); vColor=color; }`;
  // uBoost (V20): beacons, city lights and flow dots become HDR emitters when the premium target is on (1.0 otherwise).
  const POINT_FS = `precision mediump float; uniform float uBoost; varying vec3 vColor;
    void main(){ vec2 q=gl_PointCoord-.5; float d=dot(q,q); if(d>.25)discard; gl_FragColor=vec4(vColor*(1.08-d*.9)*mix(1.0,uBoost,smoothstep(.2,.0,d)),smoothstep(.25,.12,d)); }`;
  const LINE_VS = `precision highp float; attribute vec3 position; attribute vec3 color; uniform mat4 uVP; varying vec3 vColor;
    void main(){ gl_Position=uVP*vec4(position,1.0); vColor=color; }`;
  const LINE_FS = `precision mediump float; varying vec3 vColor; void main(){ gl_FragColor=vec4(vColor,.9); }`;

  /* --------------------------- geometry ----------------------------- */
  // inst: repeated props (trees, palms, ghaf, houses, turbines, vehicles) recorded as instances → InstancedMesh.
  const Geo = (inst) => ({p:[], c:[], n:[], inst:inst ? {} : null});
  const mesh = Geo(1), detailMesh = Geo(1), cloudGeo = Geo(), lines = {p:[], c:[]};
  // V12: decorative mountains live in their own layers: full detail (High, Medium) and a light version (Reduced).
  const rockHi = Geo(), rockLo = Geo();
  // V13: decorative sand dunes (dunes.js), same two levels of detail; sceneryKeep = [x, z, r] spots dunes keep clear of.
  const duneHi = Geo(), duneLo = Geo(), sceneryKeep = [];
  // V14: Riyadh's new-build architecture, recorded per project and drawn by stage (see buildSigMesh).
  const SIG = {}, sigMesh = Geo(1), sigIds = [];
  // V15 parts: full (architecture, staged), fin (operational extras: aircraft, flags, ride cars), prep (hoarding and site
  // cabins while the site is prepared and built), props (close-view life: ground services, kiosks, benches; High and
  // Medium) and tiny (people, edge lights; High only). props/tiny are drawn in their own layers, near the camera only.
  const propMesh = Geo(1), propIds = [], tinyMesh = Geo(1), tinyIds = [], litMesh = Geo(1), litIds = [];   // lit: facade light lines (glow at night)
  function sig(id, fn, part = 'full'){ const s = SIG[id] = SIG[id] || {full:Geo(1), fin:Geo(1)}, prev = target; target = s[part] = s[part] || Geo(1); fn(); target = prev; }
  // Formation mix per landscape (rocks.js kinds with weights), sandstone layering, greenery and snow.
  const ROCK_STYLE = {
    neom:   {kinds:[['ridge', .72], ['outcrop', .14], ['mesa', .14]], strata:.45, aspect:[1.5, 2.1]},   // NEOM / Tabuk: rugged sandstone ridges
    alula:  {kinds:[['mesa', .42], ['butte', .22], ['ridge', .36]], strata:1, aspect:[1.2, 1.8]},       // AlUla corridor: terracotta cliffs, mesas
    hejaz:  {kinds:[['ridge', .88], ['mesa', .12]], strata:.3, aspect:[1.5, 2.2]},                      // Makkah-Taif: irregular rocky ridges
    aseer:  {kinds:[['ridge', 1]], strata:.15, veg:1, aspect:[1.4, 2], wk:1.35, hk:.85},                                 // Aseer: darker groups, green lower slopes
    rock:   {kinds:[['ridge', .8], ['outcrop', .2]], strata:.35, aspect:[1.4, 2]},
    desert: {kinds:[['outcrop', .5], ['mesa', .3], ['butte', .2]], strata:.7, aspect:[1.1, 1.5], hk:.8}, // interior: small, low outcrops
    peak:   {kinds:[['peak', 1]], strata:.2, snow:1, aspect:[1.1, 1.3], wk:1.3, hk:.85},                                // Trojena: snow-tipped peaks
    far:    {kinds:[['ridge', 1]], strata:.2, aspect:[1.6, 2.3], lod:'lo'}                                        // neighbouring countries
  };
  const DETAIL_DIST = 7.2;   // decorative detail appears as the camera approaches a region; the Kingdom overview stays clean
  const PROPS_DIST = 3.2;    // V15: small props round the Riyadh landmarks appear from the project focus view (2.3) inward
  const MIN_DIST = .25;      // V15: closest zoom (was 1.6), so the Riyadh sites can be inspected up close
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
  // V9 palette for world-space cues (mirrors styles.css: --gold selection, white hover).
  const PALETTE = {sel:[.91,.72,.35], selHi:[1,.88,.60], hover:[1,1,1], key:[.08,.18,.27]};   // key: navy keyline (#142D46)   // gold #E8B75A (styles.css --gold)
  function addArc(cx,cy,cz,r,a0,a1,col,seg=8){for(let i=0;i<seg;i++){const a=a0+(a1-a0)*i/seg,b=a0+(a1-a0)*(i+1)/seg;addLine([cx+Math.cos(a)*r,cy,cz+Math.sin(a)*r],[cx+Math.cos(b)*r,cy,cz+Math.sin(b)*r],col);}}
  function addBrackets(cx,cy,cz,r,col){for(let k=0;k<4;k++){const m=Math.PI/4+k*Math.PI/2;addArc(cx,cy,cz,r,m-.26,m+.26,col);addArc(cx,cy+.001,cz,r+.003,m-.26,m+.26,col);}}
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
  // Instances: [x, y, z, yaw, scale, r, g, b, pitch] per prototype key, in the current target layer.
  function inst(key, x, y, z, rot, k, col, pitch=0){ (target.inst[key] = target.inst[key] || []).push(x, y, z, rot, k, col ? col[0] : 0, col ? col[1] : 0, col ? col[2] : 0, pitch); }
  function addTree(x,z,k=1,col){ // chunky round "toy" tree
    const q=k*s, c=col||TREE_GREENS[Math.floor(rng()*TREE_GREENS.length)];
    if (target.inst) return inst('tree', x, G, z, 0, q, c);
    treeRaw(x,z,q,c);
  }
  function treeRaw(x,z,q,c){
    addCylinder(x,G,z,.011*q,.05*q,[.52,.33,.18],6,.008*q);
    addBlob(x,G+.075*q,z,.045*q,.042*q,.045*q,c);
    addBlob(x+.026*q,G+.064*q,z+.012*q,.032*q,.03*q,.032*q,shade(c,1.08));
    addBlob(x-.022*q,G+.066*q,z+.016*q,.03*q,.028*q,.03*q,shade(c,.94));
    addBlob(x+.004*q,G+.105*q,z-.004*q,.028*q,.026*q,.028*q,mix(c,[.72,.90,.36],.35));
  }
  function addGhaf(x,z,k=1){ // flat-topped desert acacia
    if (target.inst) return inst('ghaf', x, G, z, 0, k*s); ghafRaw(x,z,k*s); }
  function ghafRaw(x,z,q){
    const c=[.40,.62,.24]; addCylinder(x,G,z,.009*q,.05*q,[.50,.36,.22],5,.006*q);
    addBlob(x,G+.058*q,z,.048*q,.026*q,.044*q,c,-.5,.35); addBlob(x+.02*q,G+.07*q,z-.008*q,.028*q,.018*q,.026*q,shade(c,1.12),-.5,.3);
  }
  function addPalm(x,z,k=1){ // curved trunk + drooping fronds
    const q=k*s, lean=rng()*6.283, jit=[]; for(let i=0;i<8;i++) jit.push(rng()*.3);
    if (target.inst) return inst('palm', x, G, z, lean, q);   // the lean becomes the instance's yaw
    palmRaw(x,z,q,lean,jit);
  }
  function palmRaw(x,z,q,lean,jit){
    const h=.15*q, lx=Math.cos(lean)*.018*q, lz=Math.sin(lean)*.018*q;
    const seg=4; let px=x,pz=z,py=G;
    for(let i=0;i<seg;i++){const t=(i+1)/seg,nx=x+lx*t*t,nz=z+lz*t*t,ny=G+h*t;addBeam([px,py,pz],[nx,ny,nz],.012*q*(1-.25*t),[.62,.44,.24]);px=nx;pz=nz;py=ny;}
    const top=[px,py,pz], greens=[[.20,.62,.24],[.28,.70,.26],[.16,.54,.22]];
    for(let i=0;i<8;i++){
      const a=i/8*6.283+jit[i], ca=Math.cos(a), sa=Math.sin(a), L=.085*q, w=.016*q, col=greens[i%3];
      const mid=[top[0]+ca*L*.5, top[1]+.012*q, top[2]+sa*L*.5], tip=[top[0]+ca*L, top[1]-.03*q, top[2]+sa*L];
      const side=[-sa*w, 0, ca*w];
      const m1=[mid[0]+side[0],mid[1],mid[2]+side[2]], m2=[mid[0]-side[0],mid[1],mid[2]-side[2]];
      addTri(top,m1,mid,col); addTri(top,mid,m2,shade(col,.9)); addTri(m1,tip,mid,col); addTri(mid,tip,m2,shade(col,.9));
    }
    addBlob(top[0],top[1],top[2],.012*q,.01*q,.012*q,[.45,.32,.16],-1,0);
  }
  // Saudi flat-roof house with parapet, door, windows and the classic rooftop water tank.
  function addHouse(x,z,k,col,rot=0){
    if (target.inst) { const tank=rng()>.55; return inst(tank ? 'houseT' : 'house', x, G, z, rot, k, col); }
    houseRaw(x,z,k,col,rot,rng()>.55);
  }
  function houseRaw(x,z,k,col,rot,tank){
    const w=.075*k, h=.055*k, d=.065*k, pt=.01*k;
    addBox(x,G,z,w,h,d,col,rot);
    const trim=shade(col,.92), cs=Math.cos(rot), sn=Math.sin(rot), off=(dx,dz)=>[x+dx*cs-dz*sn,z+dx*sn+dz*cs];
    for(const [dx,dz,ww,dd] of [[0,-d/2,w,pt*.5],[0,d/2,w,pt*.5],[-w/2,0,pt*.5,d],[w/2,0,pt*.5,d]]){const [px,pz]=off(dx,dz);addBox(px,G+h,pz,ww,pt,dd,trim,rot);}
    const [dxp,dzp]=off(0,d/2+.0015); addBox(dxp,G,dzp,w*.22,h*.55,.003,[.55,.36,.20],rot);
    for(const wx of [-.3,.3]){const [wxp,wzp]=off(w*wx,d/2+.0015);addBox(wxp,G+h*.55,wzp,w*.16,h*.2,.003,[.32,.46,.56],rot);}
    if(tank){const [tx,tz]=off(w*.22,-d*.2);addCylinder(tx,G+h,tz,.009*k,.016*k,[.97,.97,.95],8);}
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
  /* --------------------------- V14 architecture kit --------------------------- */
  // Rings of points (equal counts, counter-clockwise from above) lofted into flat-shaded side faces; colOf(ring, seg).
  function loft(rings, colOf){ for (let r=0;r<rings.length-1;r++){ const A=rings[r], B=rings[r+1], n=A.length; for (let i=0;i<n;i++){ const j=(i+1)%n; addQuad(A[i],A[j],B[j],B[i],colOf(r,i)); } } }
  function capFan(ring, col){ const n=ring.length, c=ring.reduce((a,p)=>[a[0]+p[0]/n,a[1]+p[1]/n,a[2]+p[2]/n],[0,0,0]); for (let i=0;i<n;i++) addTri(c,ring[(i+1)%n],ring[i],col); }
  const ellRing = (x,y,z,a,b,n,rot=0) => Array.from({length:n}, (_, i) => { const t=i/n*6.283, u=Math.cos(t)*a, v=Math.sin(t)*b; return [x+u*Math.cos(rot)-v*Math.sin(rot), y, z+u*Math.sin(rot)+v*Math.cos(rot)]; });
  // A slanted square rod between two 3D points (structural members, fins, masts).
  function addRod(a,b,t,col){ const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], L=Math.hypot(...d)||1, u=d.map(v=>v/L), r=Math.abs(u[1])<.9?[0,1,0]:[1,0,0];
    let p=norm3([u[1]*r[2]-u[2]*r[1],u[2]*r[0]-u[0]*r[2],u[0]*r[1]-u[1]*r[0]]); const q=[u[1]*p[2]-u[2]*p[1],u[2]*p[0]-u[0]*p[2],u[0]*p[1]-u[1]*p[0]];
    const off=(P,s1,s2)=>[P[0]+(p[0]*s1+q[0]*s2)*t/2,P[1]+(p[1]*s1+q[1]*s2)*t/2,P[2]+(p[2]*s1+q[2]*s2)*t/2], sq=[[1,1],[-1,1],[-1,-1],[1,-1]];
    for (let i=0;i<4;i++){ const [s1,s2]=sq[i], [t1,t2]=sq[(i+1)%4]; addQuad(off(a,s1,s2),off(a,t1,t2),off(b,t1,t2),off(b,s1,s2),col); } }
  // Najdi earthen building: matte clay walls, a parapet of small triangular merlons, narrow window slots on the two
  // camera-facing sides (south, east) and an optional stepped upper storey.
  function najdi(x,z,w,d,h,col,o={}){
    const rot=o.rot||0, cs=Math.cos(rot), sn=Math.sin(rot), at=(dx,dz)=>[x+dx*cs-dz*sn, z+dx*sn+dz*cs], trim=shade(col,1.07), slot=[.30,.22,.16], Y=o.y??G;
    addBox(x,Y,z,w,h,d,col,rot);
    if (o.upper) { const [ux,uz]=at(-w*.18,-d*.18); addBox(ux,Y+h,uz,w*.5,h*.45,d*.5,shade(col,1.03),rot); }
    const m=o.merlon||.0026, top=Y+h;
    for (const [ax,az,bx,bz] of [[-w/2,-d/2,w/2,-d/2],[w/2,-d/2,w/2,d/2],[w/2,d/2,-w/2,d/2],[-w/2,d/2,-w/2,-d/2]]) {
      const L=Math.hypot(bx-ax,bz-az), n=Math.max(2,Math.floor(L/(m*1.6)));
      for (let i=0;i<n;i++){ const t0=(i+.15)/n, t1=(i+.85)/n, tm=(i+.5)/n, P=t=>at(ax+(bx-ax)*t, az+(bz-az)*t), A=P(t0), B=P(t1), Cm=P(tm);
        addTri([A[0],top,A[1]],[B[0],top,B[1]],[Cm[0],top+m,Cm[1]],trim); } }
    if (!o.noDoor) { const [dx2,dz2]=at(w*.18, d/2+.0004); addBox(dx2,Y,dz2,Math.min(.0022,w*.16),Math.min(.0046,h*.42),.0008,[.42,.30,.20],rot); }   // V15: a timber door on the south face
    if (!o.noSlots) for (const [fx,fz,len] of [[0,1,w],[1,0,d]]) { const n=Math.max(1,Math.floor(len/.0075));   // south (+z) and east (+x) faces
      for (let i=0;i<n;i++){ const t=(i+.5)/n-.5, [sx,sz]=fz ? at(t*len, d/2+.0004) : at(w/2+.0004, t*len); addBox(sx,Y+h*.45,sz,fz?.0011:.0008,h*.3,fz?.0008:.0011,slot,rot); } }
  }
  // A facade panel with shallow triangular relief (Najdi-inspired): a grid of cells, each folded into four triangles
  // around a slightly recessed centre, so the pattern reads by light and shade rather than by thousands of pieces.
  // o: origin [x,y,z], u (along the face), v (up), nrm (outward), nu × nv cells, depth, colours {base, lit, dark, band}.
  function reliefPanel(o){ const {org,u,v,nrm,nu,nv,depth,col}=o, P=(a,b,dn=0)=>[org[0]+u[0]*a+v[0]*b+nrm[0]*dn, org[1]+u[1]*a+v[1]*b+nrm[1]*dn, org[2]+u[2]*a+v[2]*b+nrm[2]*dn];
    for (let i=0;i<nu;i++) for (let j=0;j<nv;j++){ const a0=i/nu, a1=(i+1)/nu, b0=j/nv, b1=(j+1)/nv, c=P((a0+a1)/2,(b0+b1)/2,-depth), band=(j%4===3), alt=(i+j)%2;
      const base=band?col.band:col.base, q=[P(a0,b0),P(a1,b0),P(a1,b1),P(a0,b1)];
      addTri(q[3],q[2],c,band?col.band:col.lit); addTri(q[0],c,q[1],shade(base,alt?.86:.92)); addTri(q[0],q[3],c,shade(base,alt?1:.95)); addTri(q[1],c,q[2],shade(base,alt?.95:1)); } }
  function addSolar(x,z,cols,rows,sp=.05){for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const px=x+(i-cols/2)*sp,pz=z+(j-rows/2)*sp*.8;addBox(px,G+.002,pz,sp*.84,.006,sp*.56,[.20,.42,.78]);addBox(px,G+.008,pz,sp*.78,.0015,sp*.5,[.42,.66,.95]);}}
  // Authored low-poly models (models.js, exported from VN2030_Assets.blend): metres, origin at the base centre,
  // x east / y up / z south. Decoded once, then stamped into the current target like any other primitive.
  const MODELS = window.VN_MODELS || {}, modelCache = {}, missingModels = new Set();   // V15: names asked for but not in models.js (fallbacks drawn)
  const b64buf = s => { const bin=atob(s), u=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u.buffer; };
  function modelData(name){
    if (modelCache[name]) return modelCache[name]; const m=MODELS[name]; if (!m) return null;
    return modelCache[name] = {m, v:new Int16Array(b64buf(m.v)), i:m.i32?new Uint32Array(b64buf(m.i)):new Uint16Array(b64buf(m.i)), f:new Uint8Array(b64buf(m.f))};
  }
  // `size` = world width of the model's larger horizontal side (or pass `k`, world units per metre, to share one scale
  // between models); `hk` = extra vertical scale (the map exaggerates height, as the hand-built landmarks do); `sx` =
  // stretch along the model's own x (linear pieces); `rot` = yaw as in addBox; `y` = base height. Returns false if missing.
  function addModel(name, x, z, size, {rot=0, hk=1, y=G, k=null, sx=1}={}){
    const d=modelData(name); if (!d) { missingModels.add(name); return false; } const {m,v,i,f}=d;
    const s=(k ?? size/Math.max(m.w,m.d))*m.q, cs=Math.cos(rot), sn=Math.sin(rot);
    const V=j=>{ const a=v[j*3]*s*sx, b=v[j*3+1]*s*hk, c=v[j*3+2]*s; return [x+a*cs-c*sn, y+b, z+a*sn+c*cs]; };
    for (let t=0;t<f.length;t++) addTri(V(i[t*3]),V(i[t*3+1]),V(i[t*3+2]),m.pal[f[t]]);
    return true;
  }
  // A decorative rock formation (rocks.js) in both levels of detail. Its own seed (position + salt), so the shared
  // scenery random streams are untouched. o: style, rot (main axis), salt, y (base), ground (base colour), test (clear
  // ground for the tips and for greenery), treeK.
  function rockAt(x, z, r, h, col, o = {}){
    const RK = window.VisionRocks; if (!RK) return;
    const st = ROCK_STYLE[o.style || 'rock'], y = o.y ?? G, ground = o.ground || landColor(x, z);
    const spec = RK.plan({x, z, r, h:h * (st.hk || 1), rot:o.rot ?? null, salt:o.salt || 0, kinds:st.kinds, aspect:st.aspect, wk:st.wk || 1, test:o.test || null});
    sceneryKeep.push([x, z, Math.max(spec.len, spec.wid) + .02]);
    const prev = target, opt = {y, col, ground, strata:st.strata, veg:st.veg || 0, snow:st.snow || 0}, tri = (a, b, c, k) => addTri(a, b, c, k);
    target = rockHi; RK.build(spec, Object.assign({lod:st.lod || 'hi'}, opt), tri);   // distant neighbours keep the broad faces
    target = rockLo; RK.build(spec, Object.assign({lod:'lo'}, opt), tri);
    if (st.veg && o.test) { target = detailMesh; for (const [tx, tz] of spec.spots.slice(0, 1)) if (o.test(tx, tz)) addTree(tx, tz, o.treeK || .26, [.18, .46, .24]); }
    target = prev;
  }
  const modelK = (name, size) => { const m=MODELS[name]; return m ? size/Math.max(m.w,m.d) : 0; };
  // Largest model width that sits inside a project's footprint and keeps its marker pad clear.
  const fitFoot = (p, k=1) => Math.min(2*p.foot-.016, 2*(Math.hypot(p.pad[0]-p.x,p.pad[1]-p.z)-.014))*k;
  const turbines=[];
  function addTurbine(x,z,k=1){ if (target.inst) { inst('turbine', x, G, z, 0, k); turbines.push([x,G+.2*k,z+.007*k,k]); return; } turbineRaw(x,z,k); }
  function turbineRaw(x,z,k){const h=.2*k;addCylinder(x,G,z,.006*k,h,[.96,.96,.94],6,.003*k);addBox(x,G+h-.004*k,z,.02*k,.01*k,.01*k,[.94,.94,.92]);turbines.push([x,G+h,z+.007*k,k]);}
  function addCloud(x,y,z,k){
    const n=5+Math.floor(rng()*3);
    for(let i=0;i<n;i++){const a=i/n*6.283,r=(.12+rng()*.08)*k,ox=Math.cos(a)*.16*k*(0.6+rng()*.6),oz=Math.sin(a)*.09*k;
      addBlob(x+ox,y+rng()*.04*k,z+oz,r,r*.8,r,[1,1,1],-.35,.25);}
    addBlob(x,y+.07*k,z,.2*k,.16*k,.16*k,[1,1,1],-.3,.2);
  }
  // Keep-out zones so generic city blocks don't sit on top of landmarks.
  const keepOut = [];
  const blocked = (x,z) => keepOut.some(([kx,kz,kr]) => Math.hypot(x-kx,z-kz) < kr);
  function grove(lon,lat,n,r,kind){const [cx,cz]=geo(lon,lat),prev=target;sceneryKeep.push([cx,cz,r+.04]);target=detailMesh;for(let i=0;i<n;i++){const a=rng()*6.283,d=Math.sqrt(rng())*r,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;if(!inSaudi(x,z)||inAnyPlan(x,z)||!LY.decorAllowed(x,z,.055,.05,true))continue;kind==='palm'?addPalm(x,z,.7+rng()*.5):addTree(x,z,.7+rng()*.5,[.22+rng()*.08,.56+rng()*.14,.26]);}target=prev;}
  // Trees that belong to a project (parks, green belts): inside its own footprint, clear of its marker pad.
  function ownGrove(p,n,r,kind='tree'){for(let i=0,k=0;i<n*4&&k<n;i++){const a=rng()*6.283,d=Math.sqrt(rng())*r,x=p.x+Math.cos(a)*d,z=p.z+Math.sin(a)*d;if(Math.hypot(x-p.pad[0],z-p.pad[1])<.05)continue;k++;kind==='palm'?addPalm(x,z,.6+rng()*.3):addTree(x,z,.6+rng()*.4,[.22+rng()*.08,.56+rng()*.14,.26]);}}

  /* ----------------------------- terrain ---------------------------- */
  const blobs = [ // [lon, lat, rLon, rLat, color, weight]
    [44.2,25.2,3.2,3.0,[.91,.83,.68],.55],             // Najd plateau
    [51.0,20.3,4.6,2.3,[.93,.73,.52],.85],              // Rub' al Khali
    [41.3,28.4,2.3,1.0,[.88,.68,.50],.8],             // An Nafud
    [45.8,26.0,.55,1.4,[.89,.71,.53],.7],[47.0,23.8,.55,1.3,[.89,.71,.53],.7],[47.9,21.9,.55,.9,[.89,.71,.53],.6], // Ad Dahna
    [38.1,26.3,1.1,1.5,[.78,.55,.40],.75],[39.6,23.4,1.0,1.6,[.79,.56,.41],.7],[40.6,21.0,.9,1.1,[.77,.55,.41],.7], // Hejaz: terracotta (#B97852 family)
    [36.2,28.2,1.0,.9,[.86,.81,.72],.75],                                        // Northwest: pale stone
    [42.6,18.7,1.0,1.3,[.40,.57,.34],.9],[42.9,17.3,.5,.6,[.58,.66,.40],.7],       // Aseer: rich greens (#62865A), Jazan plain
    [40.0,25.5,.6,.9,[.46,.38,.33],.55],[40.0,22.9,.35,.8,[.50,.41,.34],.5],       // Harrat lava fields
    [49.9,25.6,.55,1.4,[.88,.86,.77],.65],                                       // Eastern coastal flats: cooler, paler
    [46.7,24.7,.9,.8,[.91,.74,.52],.35]                                          // Riyadh: warm desert
  ];
  function landColor(x, z) {
    const [lon, lat] = ungeo(x, z);
    let c = [.863,.765,.596];   // V10: sand #DCC398 (styles.css --sand)
    for (const [bl, bt, rl, rt, col, w] of blobs) {
      const d = ((lon-bl)/rl)**2 + ((lat-bt)/rt)**2;
      if (d < 6) c = mix(c, col, w*Math.exp(-d));
    }
    const n = Math.sin(x*7.1+z*3.3)*Math.sin(z*6.2-x*2.1)*.045 + Math.sin(x*21+z*17)*.018 + Math.sin(x*3.1-z*4.3)*.02;   // subtle tonal variation
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

  const inPlan=(x,z)=>Math.abs(x-LY.RIYADH_CORE.x)<1.02&&Math.abs(z-LY.RIYADH_CORE.z+.05)<1.02||LY.inReserved(x,z,.08);   // the Riyadh plan and City Builder district stay free of dunes
  const nearCity=(x,z)=>inPlan(x,z)||inAnyPlan(x,z)||D.cities.some(c=>Math.hypot(c.x-x,c.z-z)<(c.capital?.5:.3));
  function buildTerrain(){
    // Neighbouring land — warm but muted so the Kingdom reads first
    for (const n of neighbours) {
      for (const [a,b,c] of triangulate(n).tris) addTri([a[0],NEI,a[1]],[c[0],NEI,c[1]],[b[0],NEI,b[1]],[.85,.78,.66]);   // neighbours paler, so the Kingdom reads first
      walls(n, NEI, SEA, [.88,.81,.68], [.64,.53,.43]);
    }
    // Kingdom base
    for (const [a,b,c] of triangulate(saudi).tris) addTri([a[0],G,a[1]],[c[0],G,c[1]],[b[0],G,b[1]],[.86,.76,.60]);   // V11: sand, so the border cells don't step in yellow
    walls(saudi, G, SEA, [.90,.80,.62], [.72,.55,.42]);
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
    for (let i=0;i<saudi.length;i++){const a=saudi[i],b=saudi[(i+1)%saudi.length];addStrip(a,b,.0034,G+.005,[.86,.70,.44]);addDisc(a[0],G+.005,a[1],.0034,[.86,.70,.44],8);}   // V11: thin gold outline (#E8B75A family)

    // Hejaz & Sarawat mountains along the west
    const spine=[[42.95,17.2],[42.6,18.2],[41.9,19.2],[41.1,20.3],[40.5,21.2],[40.0,22.4],[39.6,23.6],[38.9,24.8],[38.1,25.9],[37.2,27.0],[36.2,28.1],[35.4,28.8]];
    for (let i=0;i<spine.length-1;i++) { const [sx0,sz0]=geo(...spine[i]), [sx1,sz1]=geo(...spine[i+1]), segRot=Math.atan2(sz1-sz0,sx1-sx0); for (let k=0;k<11;k++) {
      const t=rng(), lon=spine[i][0]+(spine[i+1][0]-spine[i][0])*t+(rng()-.5)*.9, lat=spine[i][1]+(spine[i+1][1]-spine[i][1])*t+(rng()-.5)*.6;
      const [x,z]=geo(lon,lat); if(!inSaudi(x,z)||inAnyPlan(x,z)) continue;   // regional plans draw their own mountains
      const green=lat<20.2, c=green?mix([.50,.42,.35],[.58,.49,.39],rng()*.5):mix(lat>26.5?[.80,.66,.52]:[.72,.50,.38],[.66,.52,.42],rng()*.6);   // V12: dark Aseer rock, sandstone north, terracotta Hejaz
      const r=.05+rng()*.06, hh=.05+rng()*.08; rockAt(x,z,r,hh,c,{style:green?'aseer':lat>26.5?'neom':'hejaz', rot:segRot, salt:rng(), test:(px,pz)=>inSaudi(px,pz)&&!inAnyPlan(px,pz), treeK:.6}); if(green&&rng()>.4) addTree(x+r*.6,z+r*.5,.7);
    } }
    // An independent scenery stream adds larger national-scale ridges without moving earlier regional assets.
    withRng(203018,()=>{for(let i=0;i<spine.length-1;i++)for(let k=0;k<12;k++){
      const t=(k+.5)/12,lon=spine[i][0]+(spine[i+1][0]-spine[i][0])*t+(rng()-.5)*.6,lat=spine[i][1]+(spine[i+1][1]-spine[i][1])*t+(rng()-.5)*.30;
      const [x,z]=geo(lon,lat),r=.065+rng()*.035;
      if(!inSaudi(x,z)||inAnyPlan(x,z,r+.08)||nearCity(x,z)||!LY.decorAllowed(x,z,r,.07,true))continue;
      sceneryKeep.push([x,z,r+.05]);rockAt(x,z,r,.11+rng()*.12,lat<20?[.49,.49,.35]:[.77,.54,.36],{style:lat<20?'aseer':'hejaz',rot:-.4,salt:i*20+k,test:(px,pz)=>inSaudi(px,pz)&&!inAnyPlan(px,pz)&&LY.decorAllowed(px,pz,.02,.035),treeK:.8});
    }});
    // Dune fields: Rub' al Khali, Nafud, Dahna. V13: the dunes themselves are built by buildDunes() (dunes.js) from their
    // own seeds; these loops still draw from the shared scenery stream exactly as the old oval mounds did, so every
    // later prop (ghaf, farms, groves, ridges, clouds) stays where it was.
    const dune=(x,z)=>{if(!inSaudi(x,z)||nearCity(x,z))return;for(let k=0;k<5;k++)rng();};
    const dunes=(lon0,lon1,lat0,lat1,n,rot)=>{for(let i=0;i<n;i++){const [x,z]=geo(lon0+rng()*(lon1-lon0),lat0+rng()*(lat1-lat0));dune(x,z,rot);}};
    dunes(47.5,55.0,18.8,22.2,110,.45); dunes(39.8,43.2,27.6,29.3,45,.1);
    const dahna=[[44.8,28.0],[46.0,26.5],[47.2,24.7],[47.8,22.8],[48.4,21.0]];
    for(let i=0;i<30;i++){const k=Math.floor(rng()*(dahna.length-1)),t=rng(),[x,z]=geo(dahna[k][0]+(dahna[k+1][0]-dahna[k][0])*t+(rng()-.5)*.35,dahna[k][1]+(dahna[k+1][1]-dahna[k][1])*t+(rng()-.5)*.2);dune(x,z,1.1);}
    // Harrat lava patches
    for (const [lon,lat,r] of [[39.9,25.4,.16],[40.3,25.9,.12],[40.0,22.9,.12],[39.2,26.8,.1]]){const [x,z]=geo(lon,lat);if(inAnyPlan(x,z,r))continue;sceneryKeep.push([x,z,r+.02]);addDisc(x,G+.003,z,r,[.66,.56,.48],16);}
    // Centre-pivot farms (Qassim, Wadi ad-Dawasir, Tabuk, Al-Jawf)
    for (const [lon,lat,n] of [[43.8,26.1,10],[45.2,20.4,9],[36.9,28.6,6],[39.4,29.8,6]]) for(let i=0;i<n;i++){const [x,z]=geo(lon+(rng()-.5)*.9,lat+(rng()-.5)*.6);if(inSaudi(x,z)&&!inAnyPlan(x,z)){sceneryKeep.push([x,z,.05]);addDisc(x,G+.004,z,.022+rng()*.012,rng()>.3?[.45,.70,.32]:[.62,.72,.36],10);}}
    // Oases and greenery
    grove(49.55,25.42,26,.22,'palm'); grove(43.95,26.35,10,.14,'palm'); grove(39.65,24.5,10,.14,'palm'); grove(37.95,26.66,8,.1,'palm');
    grove(42.5,18.4,70,.36,'tree'); grove(42.3,19.3,30,.24,'tree'); grove(43.1,17.7,20,.2,'tree'); grove(40.45,21.2,10,.14,'tree');
    for (let i=0;i<160;i++){const [x,z]=geo(38+rng()*14,18+rng()*11);if(inSaudi(x,z)&&!blocked(x,z)&&!inPlan(x,z)&&!inAnyPlan(x,z)&&!D.cities.some(c=>Math.hypot(c.x-x,c.z-z)<.2))addGhaf(x,z,.7+rng()*.5);}
    for (const c of D.cities) if (c.name !== 'Riyadh' && !LY.cityPlan(c.name)) grove(...ungeo(c.x,c.z),10+Math.round(c.size*14),c.size*.42+.08,c.palette==='green'?'tree':'palm');
    // Neighbouring mountains (muted)
    const ridge=(pts,n,col)=>{for(let i=0;i<n;i++){const k=Math.floor(rng()*(pts.length-1)),t=rng(),lon=pts[k][0]+(pts[k+1][0]-pts[k][0])*t+(rng()-.5)*.5,lat=pts[k][1]+(pts[k+1][1]-pts[k][1])*t+(rng()-.5)*.5,[x,z]=geo(lon,lat);if(!onAnyLand(x,z)||inSaudi(x,z))continue;{const r=.05+rng()*.05,hh=.04+rng()*.06,[ax,az]=geo(...pts[k]),[bx,bz]=geo(...pts[k+1]);rockAt(x,z,r,hh*.9,col,{style:'far',y:NEI,ground:[.85,.78,.66],rot:Math.atan2(bz-az,bx-ax),test:(px,pz)=>onAnyLand(px,pz)&&!inSaudi(px,pz)});}}};   // V12
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
    for (const r of LY.CITY_ROADS) { const pts=r.pts; for(let i=0;i<pts.length-1;i++){ addStrip(pts[i],pts[i+1],r.w/2,G+.006,r.minor?[.56,.50,.44]:[.38,.37,.37]); addLine([pts[i][0],G+.009,pts[i][1]],[pts[i+1][0],G+.009,pts[i+1][1]],[.98,.92,.62]); }
      // V14: white edge lines inset from each kerb, broken wherever another road crosses (markings never run across a junction)
      if (!r.minor && r.w > .012) for (let i=0;i<pts.length-1;i++){ const a=pts[i], b=pts[i+1], L=Math.hypot(b[0]-a[0],b[1]-a[1]), nx=-(b[1]-a[1])/L, nz=(b[0]-a[0])/L, st=.008;
        for (let t=0;t<L-1e-6;t+=st){ const t1=Math.min(L,t+st), m=(t+t1)/2, mx=a[0]+(b[0]-a[0])*m/L, mz=a[1]+(b[1]-a[1])*m/L; if (LY.cityRoadDist(mx,mz,[r.id]) < .006) continue;
          for (const e of [-1,1]) { const o=e*(r.w/2-.0016); addStrip([a[0]+(b[0]-a[0])*t/L+nx*o,a[1]+(b[1]-a[1])*t/L+nz*o],[a[0]+(b[0]-a[0])*t1/L+nx*o,a[1]+(b[1]-a[1])*t1/L+nz*o],.00035,G+.0064,[.93,.92,.88]); } } } }
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
  const KC = {dx:.045, dz:-.01, h:.25};   // V15: .42 → .25, in proportion with the districts (and a shorter shadow)                                   // split-top tower: position and height (label sits above it)
  function riyadhDowntown(ry, rn){
    keepOut.push([ry.x,ry.z,LY.RIYADH_CORE.r]);
    const kx=ry.x+KC.dx, kz=ry.z+KC.dz, H=KC.h;
    kingdomCentre(kx,kz,H);                                                                                 // V14: split-top tower, as tall as the label expects
    // King Abdullah Financial District: three coordinated towers north-west of the core, clear of King Fahd Road.
    const FIN=[['RUH_FinTower_Faceted',-.062,-.07,.024,.86],['RUH_FinTower_Stepped',-.036,-.088,.022,.9],['RUH_FinTower_Slim',-.086,-.05,.016,1.0]];   // V15: lower
    for (const [nm,dx,dz,s,hk] of FIN) { addBox(ry.x+dx,G,ry.z+dz,s*1.5,.01,s*1.5,[.86,.84,.80]); addModel(nm,ry.x+dx,ry.z+dz,s,{hk}); }   // on stone podiums
    const fx=ry.x-.052, fz=ry.z+.03;
    faisaliah(fx,fz,.21);                                                                                   // V14: tapered tower, corner fins, golden sphere, spire
    // downtown streets (they explain the blocks) and towers stepping down from the centre
    lineTarget=lines; for (const o of [-.078,-.052,.052,.078]) { addStrip([ry.x+o,ry.z-.1],[ry.x+o,ry.z+.1],.003,G+.004,[.62,.60,.58]); addStrip([ry.x-.1,ry.z+o],[ry.x-.024,ry.z+o],.003,G+.004,[.62,.60,.58]); addStrip([ry.x+.024,ry.z+o],[ry.x+.1,ry.z+o],.003,G+.004,[.62,.60,.58]); }
    const pal=[[.50,.64,.76],[.44,.58,.70],[.60,.70,.78],[.66,.70,.74],[.54,.67,.74],[.80,.77,.70]];   // V14: balanced blue-grey glass, one stone
    pal.push([.84,.80,.72],[.76,.72,.66],[.88,.86,.80]);                                                  // V15: warm stone and pale mid-rises break up the glass
    for (let gx=-5; gx<=5; gx++) for (let gz=-5; gz<=5; gz++) { const x=ry.x+gx*.021+(rn()-.5)*.004, z=ry.z+gz*.021+(rn()-.5)*.004, d=Math.hypot(x-ry.x,z-ry.z);
      if (d > .11 || Math.abs(x-ry.x) < .024) continue;                                   // King Fahd Road runs clear through downtown
      if (Math.abs(x-kx) < .045 && Math.abs(z-kz) < .04) continue;                          // clear air around the split-top
      if (Math.abs(x-fx) < .032 && Math.abs(z-fz) < .032) continue;                         // and around Al Faisaliah
      if (FIN.some(([,dx,dz]) => Math.hypot(x-ry.x-dx, z-ry.z-dz) < .022)) continue;            // and around the financial towers
      if ([-.078,-.052,.052,.078].some(o => Math.abs(x-ry.x-o) < .006 || Math.abs(z-ry.z-o) < .006)) continue;   // not on a street
      const k=Math.pow(1-d/.12,1.1), h=.03+.15*k*(.5+rn()*.5), w=.012+rn()*.007, col=pal[Math.floor(rn()*pal.length)];
      if (h > .1 && rn() > .6) { addBox(x,G,z,w+.006,.012,w+.006,[.86,.84,.80]); addBox(x,G+.012,z,w+.004,h*.5,w+.004,shade(col,.96)); glassTower(x,z,w*.8,h,shade(col,1.06),rn,rn()>.85?[.88,.92,.96]:null); }   // podium + setback tower
      else glassTower(x,z,w,h,col,rn,rn()>.9?[.85,.9,.95]:null); }
    if (RX) RX.downtown(ry, [kx,kz], [fx,fz], FIN.map(([,dx,dz]) => [ry.x+dx, ry.z+dz]));   // V15: plazas, planted edges, entrances
  }
  // V15: Riyadh's park, boulevard and green-corridor trees use riyadh.js's light tree when it is loaded (same sizes).
  const rTree = (x,z,k,col) => RX ? RX.smallTree(x,z,k,col) : addTree(x,z,k,col);
  // V14: a glass tower read as floors: glass bands, light spandrels, a parapet and rooftop plant (optional crown).
  function glassTower(x,z,w,h,col,rn,crown){
    const floors=Math.max(3,Math.round(h/.018)), fh=h/floors, spand=mix(col,[.90,.89,.86],.55);
    for (let i=0;i<floors;i++){ const y=G+i*fh; addBox(x,y,z,w,fh*.76,w,i%5===4?shade(col,1.07):col); addBox(x,y+fh*.76,z,w*1.03,fh*.24,w*1.03,spand); }
    addBox(x,G+h,z,w*1.05,.003,w*1.05,shade(spand,.95));
    addBox(x+(rn()-.5)*w*.3,G+h+.003,z+(rn()-.5)*w*.3,w*.45,.006,w*.4,[.74,.74,.72]);
    if (crown) addCone(x,G+h+.009,z,w*.22,w*1.1,crown,6);
  }
  // V14 ★ Kingdom Centre: an elliptical glass-and-steel shaft whose sides curve in as it rises, a parabolic opening
  // through the top third with the skybridge across it, on a low stone podium. Glass alternates in vertical bays with
  // light floor bands; the opening's inner faces are a darker glass.
  function kingdomCentre(x,z,H){
    const n=24, a0=.036, b0=.0175, yo=.64*H, glass=[.70,.76,.82], glass2=[.64,.71,.78], band=[.76,.80,.84], inner=[.46,.54,.64];
    const A=y=>a0*(1-.30*Math.pow(y/H,1.6)), B=y=>b0*(1-.40*Math.pow(y/H,1.3)), NS=14, NH=10, m=5;
    addBox(x,G,z+.004,.13,.012,.052,[.86,.84,.80]); addBox(x,G+.012,z+.004,.12,.002,.046,[.93,.91,.87]);   // the mall podium
    const fac=(r,i)=> r%3===2 ? band : (i%2 ? glass : glass2), rings=[];
    for (let k=0;k<=NS;k++){ const y=yo*k/NS; rings.push(ellRing(x,G+y,z,A(y),B(y),n)); }
    loft(rings, fac);
    for (const s of [-1,1]) { const hr=[];
      for (let k=0;k<=NH;k++){ const y=yo+(H-yo)*k/NH, a=A(y), b=B(y), w=a*.80*Math.sqrt(k/NH), ring=[], zz=xx=>b*Math.sqrt(Math.max(0,1-(xx/a)**2));
        for (let i=0;i<=m;i++){ const xx=w+(a-w)*i/m; ring.push([x+s*xx,G+y,z+zz(xx)]); }
        for (let i=m;i>=0;i--){ const xx=w+(a-w)*i/m; ring.push([x+s*xx,G+y,z-zz(xx)]); }
        hr.push(ring); }
      loft(hr,(r,i)=> i===2*m+1 ? inner : fac(r+NS+1,i)); capFan(hr[NH],band); }
    const yb=.84*H, wb=A(yb)*.80*Math.sqrt((yb-yo)/(H-yo));                                                  // the skybridge
    addBox(x,G+yb,z,2*wb+.004,.007,B(yb)*.9,[.72,.77,.83]); addBox(x,G+yb+.007,z,2*wb+.004,.0015,B(yb)*.9,band);
  }
  // V14 Al Faisaliah: a slim square tower tapering to a point, four light corner fins running to the apex, the golden
  // sphere held between them, and the spire.
  function faisaliah(x,z,H){
    const s0=.044, ys=.64*H, half=y=>s0/2*(1-y/H), glass=[.46,.59,.69], glass2=[.52,.65,.74], fin=[.90,.89,.86], NS=12, rings=[];
    addBox(x,G,z,.062,.008,.062,[.86,.84,.80]);
    for (let k=0;k<=NS;k++){ const y=ys*k/NS, h=half(y)*.94; rings.push([[x-h,G+y,z-h],[x+h,G+y,z-h],[x+h,G+y,z+h],[x-h,G+y,z+h]]); }
    loft(rings,(r,i)=> r<2 ? [.34,.40,.48] : (r%2 ? glass : glass2)); capFan(rings[NS],[.70,.72,.74]);
    for (const [sx,sz] of [[-1,-1],[1,-1],[1,1],[-1,1]]) addRod([x+sx*s0/2,G,z+sz*s0/2],[x+sx*.0012,G+H,z+sz*.0012],.0034,fin);
    const ysph=.735*H; addBlob(x,G+ysph,z,.0135,.0135,.0135,[.96,.79,.38],-1,.15); addCylinder(x,G+ysph-.001,z,.0139,.002,[.42,.36,.26],14);
    addCylinder(x,G+H-.004,z,.0022,.04,[.88,.88,.86],6,.0008);
  }
  // V14 the Mukaab: a warm bronze cube whose four faces carry a shallow Najdi triangular relief with darker horizontal
  // bands, deep entrance portals at the foot of each face, a crenellated parapet and, on the roof, an eight-point star
  // crown with radiating lines (an artistic reading of the reference, not a documented design).
  function mukaab(x,z,S,H){
    const col={base:[.87,.66,.44], lit:[.97,.81,.58], band:[.76,.56,.38]}, h2=S/2;
    for (const [org,u,nrm] of [[[x-h2,G,z+h2],[S,0,0],[0,0,1]],[[x+h2,G,z+h2],[0,0,-S],[1,0,0]],[[x+h2,G,z-h2],[-S,0,0],[0,0,-1]],[[x-h2,G,z-h2],[0,0,S],[-1,0,0]]]) {
      reliefPanel({org, u, v:[0,H,0], nrm, nu:9, nv:9, depth:.0022, col});
      const c=[org[0]+u[0]/2+nrm[0]*.0006, z, org[2]+u[2]/2+nrm[2]*.0006]; addBox(c[0],G,c[2],nrm[0]?.0012:.018,.014,nrm[0]?.018:.0012,[.30,.22,.16]); }   // portal
    const top=G+H, c4=[[x-h2,top,z-h2],[x+h2,top,z-h2],[x+h2,top,z+h2],[x-h2,top,z+h2]], gold=[.97,.84,.52];
    addQuad(c4[0],c4[1],c4[2],c4[3],[.86,.70,.50]);
    for (let e=0;e<4;e++){ const a=c4[e], b=c4[(e+1)%4], n=18; for (let i=0;i<n;i++){ const t0=(i+.15)/n, t1=(i+.85)/n, tm=(i+.5)/n, L=t=>[a[0]+(b[0]-a[0])*t,top,a[2]+(b[2]-a[2])*t];
      const m=L(tm); addTri(L(t0),L(t1),[m[0],top+.0045,m[2]],[.90,.72,.50]); } }
    const star=k=>Array.from({length:16},(_,i)=>{ const a=i/16*6.283+.196, r=i%2?.012:.026; return [x+Math.cos(a)*r,top+k,z+Math.sin(a)*r]; });
    loft([star(0),star(.004)],()=>gold); capFan(star(.004),shade(gold,1.04));
    for (let i=0;i<8;i++){ const a=i/8*6.283+.196; addBox(x+Math.cos(a)*.034,top+.0004,z+Math.sin(a)*.034,.012,.001,.0016,[.94,.80,.52],a); }
    addCylinder(x,top+.004,z,.007,.006,[.95,.90,.78],12); addDome(x,top+.01,z,.0068,[.98,.88,.60]);
  }
  // V14 New Murabba square (context, always drawn): lawn, a paved court round the cube, cross walks and a perimeter
  // walk, four reflecting pools in the garden quarters, and palms lining the cross walks.
  function murabbaPlaza(mu){
    const x=mu.x, z=mu.z-.006, pave=[.91,.87,.76], walk=[.95,.91,.80];
    addBox(x,G+.002,z+.006,.15,.004,.15,[.58,.76,.44]); addBox(x,G+.003,z,.104,.004,.104,pave);
    for (const [ax,az,bx,bz] of [[0,-.075,0,.075],[-.075,0,.075,0],[-.068,-.068,.068,-.068],[.068,-.068,.068,.068],[.068,.068,-.068,.068],[-.068,.068,-.068,-.068]]) addStrip([x+ax,z+az],[x+bx,z+bz],.0028,G+.0062,walk);
    for (const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) { const px=x+sx*.062, pz=z+sz*.062; addBox(px,G+.006,pz,.017,.001,.017,[.82,.86,.86]); addBox(px,G+.0066,pz,.0135,.0006,.0135,[.30,.60,.80]); }
    const prev=target; target=detailMesh;
    const palm=(px,pz)=>{ if (Math.hypot(px-mu.pad[0],pz-mu.pad[1]) > .04) addPalm(px,pz,.17); };   // V15: in scale with the square   // the marker pad stays clear
    for (const t of [-1,1]) for (const o of [.058,.07]) { palm(x+.007,z+t*o); palm(x-.007,z+t*o); palm(x+t*o,z+.007); palm(x+t*o,z-.007); }
    target=prev;
  }
  // V14 Diriyah. The At-Turaif heritage core (context, always drawn): a low plateau above the wadi carrying courtyard
  // compounds of matte clay with stepped rooflines, parapet merlons and slot windows, Salwa Palace at its heart and a
  // few tapering watchtowers. diriyahGate: the new low Najdi-style cultural buildings round its west and north edge
  // (signature, staged with the project).
  function diriyahCore(dr, rn){
    const cx=dr.x+.012, cz=dr.z-.012, Y=G+.006, clay=[[.80,.62,.44],[.76,.57,.40],[.84,.67,.49],[.78,.60,.42]];
    addBox(cx,G,cz,.118,.006,.094,[.78,.63,.47]); addBox(cx,G+.006,cz,.112,.0006,.088,[.84,.71,.55]);   // plateau, its rim facing the wadi
    for (let i=-3;i<=3;i++) for (let j=-2;j<=2;j++) { const x=cx+i*.0155+(rn()-.5)*.003, z=cz+j*.0165+(rn()-.5)*.003, k=rn();
      if (Math.pow((x-cx)/.054,2)+Math.pow((z-cz)/.042,2) > 1 || (Math.abs(i)<=1 && Math.abs(j)<=0)) continue;   // the palace keeps the centre
      if (k < .22) continue;                                                                                      // courtyards and lanes stay open
      najdi(x,z,.011+rn()*.003,.010+rn()*.004,.007+rn()*.009,clay[Math.floor(rn()*4)],{y:Y,upper:rn()<.3,merlon:.0017}); }
    najdi(cx,cz,.036,.022,.016,[.82,.64,.45],{y:Y,upper:true,merlon:.0022});                                     // Salwa Palace
    for (const [dx,dz,h] of [[-.048,-.028,.03],[.046,-.03,.026],[-.044,.03,.024],[.05,.024,.028],[.014,-.01,.036]]) {
      addCylinder(cx+dx,Y,cz+dz,.0042,h,[.80,.62,.44],4,.0028); for (let k=0;k<4;k++) addBox(cx+dx+(k%2?.0022:-.0022),Y+h,cz+dz+(k<2?.0022:-.0022),.0012,.002,.0012,[.86,.70,.52]); }
  }
  // V14 ROSHN: a walkable neighbourhood of low, light homes. Context: the site ground, a street grid and a central green
  // spine. Signature: perimeter blocks of terraced homes (cream and white, varied parapets and roof terraces) round
  // planted courtyards, and a community centre on the central green. Seeded, so the layout never changes between loads.
  function roshn(rs){
    const rn=mulberry32(4207), cx=rs.x, cz=rs.z-.012, sp=.034, blocks=[], R0=rs.foot-.006;
    addDisc(rs.x,G+.0025,rs.z,R0,[.86,.82,.70],36);
    for (let i=-2;i<=2;i++) for (let j=-2;j<=2;j++) { const x=cx+i*sp, z=cz+j*sp;
      if (Math.hypot(x-rs.x,z-rs.z)+.021 > R0 || Math.hypot(x-rs.pad[0],z-rs.pad[1]) < .04) continue; blocks.push([x,z,i,j]); }
    for (const t of [-2.5,-1.5,-.5,.5,1.5,2.5]) for (const vert of [0,1]) {                                     // streets between the blocks
      const pts=[]; for (let k=-2.5;k<=2.5;k+=.25) { const x=cx+(vert?t:k)*sp, z=cz+(vert?k:t)*sp; if (Math.hypot(x-rs.x,z-rs.z) < R0-.004) pts.push([x,z]); }
      for (let k=1;k<pts.length;k++) addStrip(pts[k-1],pts[k],.0022,G+.0034,[.74,.71,.66]); }
    for (const [x,z,i,j] of blocks) if (i===0 && j===0) { addBox(x,G+.0035,z,.028,.001,.028,[.52,.74,.42]); }   // the central green
    const cream=[[.97,.95,.90],[.94,.91,.85],[.92,.89,.84],[.96,.93,.86]], accent=[[.80,.62,.46],[.62,.70,.74],[.86,.78,.62]];
    sig('roshn', () => {
      for (const [x,z,i,j] of blocks) {
        if (i===0 && j===0) { addBox(x,G,z-.004,.014,.008,.01,[.95,.93,.88]); addDome(x,G+.008,z-.004,.004,[.86,.80,.66]);   // community centre
          for (const [dx,dz] of [[-.009,.009],[.009,.009],[-.01,-.011],[.01,-.011]]) addTree(x+dx,z+dz,.2,[.24,.56,.28]); continue; }
        addBox(x,G+.0036,z,.012,.0008,.012,[.52,.73,.42]);                                                         // planted courtyard
        addTree(x+(rn()-.5)*.004,z+(rn()-.5)*.004,.17+rn()*.05,[.22+rn()*.06,.54+rn()*.1,.26]);
        for (let s=0;s<4;s++) { const n=3, a=s*Math.PI/2, cs=Math.cos(a), sn=Math.sin(a);                         // one terrace of homes per side
          for (let k=0;k<n;k++) { const u=(k-(n-1)/2)*.0085, v=.0095, hx=x+u*cs-v*sn, hz=z+u*sn+v*cs, h=.0055+rn()*.0035, c=cream[Math.floor(rn()*4)];
            addBox(hx,G,hz,.0078,h,.0062,c,a); addBox(hx,G+h,hz,.0078,.0011,.0062,shade(c,.93),a);
            if (rn()<.35) { addBox(hx-.0015*cs,G+h,hz-.0015*sn,.0034,.0028,.0034,shade(c,1.02),a); }                // roof terrace room
            else if (rn()<.3) addBox(hx,G+h+.0011,hz,.004,.0006,.003,accent[Math.floor(rn()*3)],a); } } } });   // shade sail / solar
  }
  // V14 Sports Boulevard. Context: one continuous planted verge with a pale pedestrian promenade on its north side and
  // a red cycle path with a dashed centre line on its south side, laid just under the road surface so every crossing
  // stays a clean road. Signature: clustered trees, palms and shrubs with open gaps, the cycle bridge over King Fahd
  // Road, exercise pavilions and courts.
  function sportsBoulevard(sp, ry){
    const pts=sp.ribbon.pts, off=(o)=>pts.map((q,i)=>{ const a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)], L=Math.hypot(b[0]-a[0],b[1]-a[1])||1; return [q[0]-(b[1]-a[1])/L*o, q[1]+(b[0]-a[0])/L*o]; });
    polyStrip(pts,.027,G+.0048,[.48,.74,.38]);
    polyStrip(off(.0095),.0034,G+.0055,[.94,.89,.78]);                                                            // promenade (north)
    polyStrip(off(-.0095),.0029,G+.0055,[.80,.50,.42]);                                                           // cycle path (south)
    for (let i=1;i<pts.length;i++){ const a=off(-.0095)[i-1], b=off(-.0095)[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]);
      for (let t=.006;t<L;t+=.016){ const x=a[0]+(b[0]-a[0])*t/L, z=a[1]+(b[1]-a[1])*t/L; if (LY.cityRoadDist(x,z) > .012) addBox(x,G+.0058,z,.006,.0003,.0007,[.98,.96,.92],Math.atan2(b[1]-a[1],b[0]-a[0])); } }
    const rn=mulberry32(4212), clear=(x,z)=>LY.cityRoadDist(x,z) > .03 && Math.hypot(x-sp.pad[0],z-sp.pad[1]) > .045 && Math.abs(x-ry.x) > .05;
    sig('sports', () => {
      for (let i=1;i<pts.length;i++){ const a=pts[i-1], b=pts[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]);
        for (let t=.012;t<L;t+=.03+rn()*.03){ if (rn()<.22) continue;                                              // open gaps between clusters
          const n=2+Math.floor(rn()*3);
          for (let k=0;k<n;k++){ const tt=t+(rn()-.5)*.016, o=(rn()-.5)*.012, x=a[0]+(b[0]-a[0])*tt/L, z=a[1]+(b[1]-a[1])*tt/L+o; if (!clear(x,z)) continue;
            const r=rn(); if (r<.55) rTree(x,z,.13+rn()*.06,[.22+rn()*.08,.54+rn()*.14,.25]); else if (r<.8) addPalm(x,z,.17+rn()*.04); else addBox(x,G+.0048,z,.006,.003,.004,[.40,.62,.30]); } } }   // V15: smaller
      addModel('RUH_Sports_CycleBridge',ry.x,pts[2][1],.06,{hk:1.6});                                             // cycle bridge over King Fahd Road
      addModel('RUH_Sports_ExercisePavilion',ry.x-.32,pts[0][1],.016,{hk:1.8});
      addModel('RUH_Sports_Court',ry.x+.12,pts[0][1],.022,{hk:1.8});
      addModel('RUH_Sports_Court',ry.x-.2,pts[0][1],.02,{hk:1.8});
      addModel('RUH_Sports_ExercisePavilion',ry.x+.32,pts[0][1],.016,{hk:1.8,rot:Math.PI}); });
  }
  // V14 airport terminal: glass hall, light mullions on both facades, one barrel vault per module (small gaps between
  // modules, so the roof reads as a modular series), and slim raking supports under the overhangs.
  function airTerminal(x,z,len,dep){
    const glass=[.56,.68,.78], roof=[.96,.96,.94], frame=[.86,.86,.84], h=.009, n=7, mod=len/n, ov=.004, rise=.007;
    addBox(x,G,z,len,h,dep,glass); addBox(x,G,z,len*1.01,.0018,dep*1.02,[.84,.83,.80]);
    for (let i=0;i<=n*2;i++) for (const e of [-1,1]) addBox(x-len/2+i*mod/2,G,z+e*(dep/2+.0006),.0009,h,.0009,frame);
    for (let i=0;i<n;i++){ const cx=x-len/2+(i+.5)*mod, arc=k=>{ const a=Math.PI*k/8; return [-(dep/2+ov)*Math.cos(a), h+.0006+Math.sin(a)*rise]; };
      for (let k=0;k<8;k++){ const [z0,y0]=arc(k), [z1,y1]=arc(k+1), c=shade(roof,.9+.1*Math.sin(Math.PI*(k+.5)/8));
        addQuad([cx-mod/2+.0006,G+y0,z+z0],[cx+mod/2-.0006,G+y0,z+z0],[cx+mod/2-.0006,G+y1,z+z1],[cx-mod/2+.0006,G+y1,z+z1],c); }
      for (const e of [-1,1]) addRod([cx,G,z+e*(dep/2+.0015)],[cx,G+h+.0006,z+e*(dep/2+ov*.9)],.0011,frame); }
  }
  // V14 Metro stop on the elevated line, aligned with the track (rot): platform deck, a white vaulted canopy with blue
  // fascias, and a stair core down to the street.
  function metroStop(x,z,deck,rot){
    const cs=Math.cos(rot), sn=Math.sin(rot), W=(u,y,v)=>[x+u*cs-v*sn, y, z+u*sn+v*cs];
    { const [sx,,sz]=W(0,0,.008); addBox(sx,G,sz,.006,deck-G,.005,[.92,.92,.90],rot); }
    addBox(x,deck-.001,z,.03,.0016,.02,[.90,.90,.88],rot);
    for (let k=0;k<6;k++){ const a0=Math.PI*k/6, a1=Math.PI*(k+1)/6, P=(a,e)=>W(e*.016,deck+.0055+Math.sin(a)*.005,-Math.cos(a)*.011);
      addQuad(P(a0,-1),P(a0,1),P(a1,1),P(a1,-1),shade([.97,.97,.96],.92+.08*Math.sin((a0+a1)/2))); }
    for (const e of [-1,1]) { const [fx,,fz]=W(0,0,e*.0108); addBox(fx,deck+.0045,fz,.032,.0012,.0006,[.20,.42,.82],rot); }
  }
  function diriyahGate(dr){
    for (const [dx,dz,w,d,h,rot] of [[-.07,-.03,.026,.016,.015,1.4],[-.058,.024,.022,.018,.013,1.1],[-.018,-.072,.03,.016,.016,0],[.038,-.066,.024,.016,.014,-.35]]) {
      const x=dr.x+dx, z=dr.z+dz; najdi(x,z,w,d,h,[.88,.76,.58],{rot,upper:true,merlon:.0022});
      const cs=Math.cos(rot), sn=Math.sin(rot); for (let k=-2;k<=2;k++) addBox(x+k*w*.18*cs-(d/2+.0005)*sn,G,z+k*w*.18*sn+(d/2+.0005)*cs,.0035,h*.45,.001,[.36,.27,.19],rot); }   // arcade
  }
  // Expo 2030: its own paved, hedged parcel south of the airport — a large golden ring pavilion (lattice ribs, crown ring,
  // glass dome) on a central plaza, six exhibition pavilions around it, gardens between, and a footpath to the airport.
  function riyadhExpo(rn, ks){
    const ex=P('expo'), R0=ex.foot; keepOut.push([ex.x,ex.z,R0]);
    addDisc(ex.x,G+.003,ex.z,R0-.002,[.86,.82,.72],32); addRing(ex.x,G+.006,ex.z,R0-.004,[.34,.58,.30],40);                      // parcel paving + hedge line
    addDisc(ex.x,G+.004,ex.z,.046,[.93,.90,.82],28);                                                                           // central plaza
    // Six distinct pavilions round the plaza, ring canopy, spire, shaded walks and planting. Pavilions sit at 30° + 60°k,
    // so the marker pad (south-east, 45°) falls in the gap between two of them.
    for (let i=0;i<6;i++){ const a=i/6*6.283; addStrip([ex.x+Math.cos(a)*.046,ex.z+Math.sin(a)*.046],[ex.x+Math.cos(a)*(R0-.006),ex.z+Math.sin(a)*(R0-.006)],.0026,G+.0045,[.95,.91,.80]); }   // V14: radiating walks
    // V14: the pavilions (signature, staged with the project — an unfinished Expo never looks finished), gardens of trees
    // and palms between the pavilions, and a ring of flags round the plaza once it is open.
    sig('expo', () => {
      addModel('RUH_Expo2030',ex.x,ex.z,2*(R0-.012),{hk:1.6});
      const rg=mulberry32(4230);
      for (let i=0;i<6;i++) for (const sg of [-1,1]) { const a=i/6*6.283+sg*.2, r=.058+rg()*.006, x=ex.x+Math.cos(a)*r, z=ex.z+Math.sin(a)*r;
        if (Math.hypot(x-ex.pad[0],z-ex.pad[1]) < .03) continue; rg()<.4 ? addPalm(x,z,.28) : rTree(x,z,.2+rg()*.06,[.22,.56+rg()*.1,.26]); } });
    sig('expo', () => { for (let i=0;i<12;i++){ const a=i/12*6.283+.26, x=ex.x+Math.cos(a)*.049, z=ex.z+Math.sin(a)*.049;
      addCylinder(x,G,z,.0006,.016,[.92,.92,.90],4); addBox(x+.0025,G+.0125,z,.005,.0032,.0005,[[.20,.62,.40],[.95,.62,.20],[.25,.50,.85],[.90,.30,.30]][i%4]); } }, 'fin');
    addStrip([ex.x-.012,ex.z-R0],[ks.x-.012,ks.z+ks.foot],.004,G+.006,[.90,.84,.66]);                                           // footpath to the airport
  }
  // King Salman International Airport: broad and low — two long runways with centre lines and thresholds, a parallel
  // taxiway with connectors, an apron, a long terminal with four piers and a slim tower, and the Metro's terminal stop.
  function riyadhAirport(ks){
    keepOut.push([ks.x,ks.z,ks.foot]);
    const asphalt=[.30,.31,.33], taxi=[.44,.45,.47], apron=[.72,.73,.74], white=[.96,.96,.94], yel=[.95,.80,.32];
    addDisc(ks.x,G+.002,ks.z,ks.foot-.004,[.82,.76,.62],32);                                                    // airfield ground
    for (const [dz, L] of [[-.075,.105],[-.02,.115]]) {                                                        // runways (alignment unchanged)
      addStrip([ks.x-L,ks.z+dz],[ks.x+L,ks.z+dz],.011,G+.005,asphalt);
      for (let t=-L+.02;t<L-.02;t+=.022) addBox(ks.x+t+.006,G+.0062,ks.z+dz,.011,.0008,.0015,white);          // centre-line dashes
      for (const e of [-1,1]) for (let k=-2;k<=2;k++) addBox(ks.x+e*(L-.008),G+.0062,ks.z+dz+k*.004,.01,.0008,.002,white);   // threshold bars
      for (const e of [-1,1]) { addStrip([ks.x-L+.003,ks.z+dz+e*.0094],[ks.x+L-.003,ks.z+dz+e*.0094],.0005,G+.0056,white);   // V14: edge lines
        for (const k of [-1,1]) addBox(ks.x+e*(L-.03),G+.0062,ks.z+dz+k*.005,.012,.0008,.0016,white); } }               // V14: touchdown-zone bars
    addStrip([ks.x-.1,ks.z+.012],[ks.x+.1,ks.z+.012],.0045,G+.0055,taxi);                                    // parallel taxiway
    for (const t of [-.085,-.03,.03,.085]) { addStrip([ks.x+t,ks.z-.075],[ks.x+t,ks.z+.012],.003,G+.0056,taxi); addStrip([ks.x+t,ks.z+.012],[ks.x+t,ks.z+.03],.003,G+.0056,taxi); }
    addStrip([ks.x-.1,ks.z+.012],[ks.x+.1,ks.z+.012],.0005,G+.0058,yel);                                     // V14: taxiway centre lines
    for (const t of [-.085,-.03,.03,.085]) addStrip([ks.x+t,ks.z-.069],[ks.x+t,ks.z+.012],.0005,G+.0058,yel);
    addStrip([ks.x-.08,ks.z+.029],[ks.x+.07,ks.z+.029],.0105,G+.0052,apron);                                // V14: apron
    const stands=[-.06,-.035,-.01,.015,.04];
    for (const t of stands) addStrip([ks.x+t,ks.z+.021],[ks.x+t,ks.z+.039],.0005,G+.0057,yel);               // stand lead-in lines
    addStrip([ks.x-.075,ks.z+.068],[ks.x+.06,ks.z+.068],.0035,G+.0052,[.52,.50,.48]);                       // landside forecourt road
    // V14: the new terminal (signature, staged): a long glass hall under a modular barrel-vault roof on slim supports,
    // jet bridges to the stands, the control tower and landside parking. Parked aircraft once it is operational.
    const kT=modelK('RUH_Airport_Terminal',.11);
    sig('ksip', () => {
      airTerminal(ks.x-.01,ks.z+.052,.11,.018);
      for (const t of stands) addBox(ks.x+t,G+.0035,ks.z+.0385,.0028,.0028,.008,[.90,.90,.88]);
      addModel('RUH_Airport_ControlTower',ks.x+.078,ks.z+.05,0,{k:kT,hk:1.8});
      for (const [dx,dz] of [[.03,.08],[.052,.08]]) { addBox(ks.x+dx,G+.0032,ks.z+dz,.018,.0006,.014,[.56,.56,.58]);
        for (let i=0;i<4;i++) for (let j=0;j<2;j++) addBox(ks.x+dx-.006+i*.004,G+.0038,ks.z+dz-.003+j*.006,.0026,.0018,.0016,[[.92,.92,.92],[.30,.44,.66],[.70,.20,.18],[.86,.86,.82]][(i+j)%4]); } });
    const jet=(x,z,rot)=>addModel('RUH_Aircraft_Parked',x,z,0,{k:kT*1.8,rot,hk:1.4,y:G+.0052});
    sig('ksip', () => { for (const t of stands.slice(0,4)) jet(ks.x+t,ks.z+.028,-Math.PI/2); }, 'fin');   // at the stands (operational)
    jet(ks.x-.05,ks.z-.075,0);                                                                                  // one on the runway
    const me=LY.METRO_ROUTE[LY.METRO_ROUTE.length-1]; addBox(me[0],G,me[1],.02,.012,.012,[.95,.96,.98]); addBox(me[0],G+.012,me[1],.022,.003,.014,[.20,.42,.82]);   // Metro terminal stop
  }
  // King Salman Park: a bounded, designed landscape beside downtown — hedge edge, lawns in two greens, an irregular lake
  // with a bridge, looping paths, clumps of shade trees and a white pavilion; a planted promenade links it to downtown.
  function riyadhPark(pk, ry, rn){
    const R0=pk.foot-.004; keepOut.push([pk.x,pk.z,pk.foot]);
    addDisc(pk.x,G+.003,pk.z,R0,[.47,.72,.36],36); addRing(pk.x,G+.006,pk.z,R0,[.22,.46,.24],48);
    for (const [dx,dz,r,c] of [[-.03,-.03,.045,[.58,.80,.44]],[.035,-.02,.035,[.52,.76,.40]],[-.01,.04,.04,[.56,.79,.43]]]) addDisc(pk.x+dx,G+.004,pk.z+dz,r,c,24);   // lawns
    for (const [dx,dz,r,c] of [[.05,-.05,.022,[.62,.82,.48]],[-.06,.0,.02,[.50,.74,.40]]]) addDisc(pk.x+dx,G+.0042,pk.z+dz,r,c,20);   // V14: lawn variation
    // V14: the lake with a soft edge — a stone rim, then shallow teal, then open water (opaque, stylized).
    const lake=[[.02,.015,.024],[.04,.03,.018],[.005,.035,.014]];
    for (const [dx,dz,r] of lake) addDisc(pk.x+dx,G+.0046,pk.z+dz,r+.0035,[.86,.84,.76],22);
    for (const [dx,dz,r] of lake) addDisc(pk.x+dx,G+.005,pk.z+dz,r+.0012,[.44,.74,.78],22);
    for (const [dx,dz,r] of lake) addDisc(pk.x+dx,G+.0054,pk.z+dz,r-.002,[.28,.58,.80],22);
    addBox(pk.x+.022,G+.0062,pk.z+.035,.006,.003,.03,[.92,.88,.78]);                                                    // footbridge over the lake
    lineTarget=lines; const loop=[]; for (let i=0;i<=40;i++){ const a=i/40*6.283, r=.07+.012*Math.sin(a*3); loop.push([pk.x+Math.cos(a)*r,pk.z+Math.sin(a)*r*.9]); }
    polyStrip(loop,.0025,G+.006,[.93,.87,.70]);                                                                          // loop path
    polyStrip([[pk.x-.09,pk.z+.01],[pk.x-.04,pk.z+.005],[pk.x,pk.z-.01],[pk.x+.03,pk.z-.05],[pk.x+.05,pk.z-.075]],.002,G+.006,[.93,.87,.70]);   // cross path
    sig('park', () => {                                                                                                  // V14: built venues (staged)
      addModel('RUH_Park_CulturalPavilion',pk.x-.045,pk.z+.032,.026,{hk:1.5});                                       // cultural pavilion
      addModel('RUH_Park_GardenPavilion',pk.x+.045,pk.z-.035,.024,{hk:1.4});                                          // garden pavilion
      addModel('RUH_Park_WaterFeature',pk.x-.035,pk.z-.035,.014,{hk:1.5}); });                                        // water feature
    // V14: balanced clumps of varied shade trees and a few palms, sizes graded from the centre of each clump; the
    // middle of the park stays open lawn so the skyline and the lake read across it.
    const clumps=[[-.055,-.055,11],[.0,-.078,7],[.062,-.06,9],[.078,.018,7],[.05,.072,10],[-.035,.078,7],[-.082,.03,9]];   // V15: more, smaller trees
    for (const [cx,cz,n] of clumps) for (let i=0;i<n;i++){ const a=rn()*6.283, d=Math.sqrt(rn())*.016, x=pk.x+cx+Math.cos(a)*d, z=pk.z+cz+Math.sin(a)*d;
      if (Math.hypot(x-pk.x,z-pk.z) > R0-.008 || Math.hypot(x-pk.pad[0],z-pk.pad[1]) < .035) continue;
      if (rn()<.18) addPalm(x,z,.19); else rTree(x,z,(.2-d*4)+rn()*.06,[.18+rn()*.1,.50+rn()*.16,.24]); }   // V15: smaller, in scale
    const x0=ry.x+LY.RIYADH_CORE.r+.004, x1=pk.x-pk.foot+.004;                                                         // promenade to downtown
    addStrip([x0,pk.z],[x1,pk.z],.008,G+.005,[.52,.74,.40]); addStrip([x0,pk.z],[x1,pk.z],.002,G+.006,[.93,.87,.70]);
    for (let x=x0+.006; x<x1-.004; x+=.01) for (const sg of [-1,1]) rTree(x,pk.z+sg*.0065,.12,[.24,.56,.28]);
    if (RX) RX.park(pk);                                                                                         // V15: gardens, pergolas, playground, seating
  }
  // Green Riyadh: a wide, continuous ecological corridor along a meandering river — wetlands, sandy banks, native
  // flat-canopy trees and palms, trails on both banks and footbridges — running east beyond the plan. Distinct from the park.
  function riyadhGreen(rn){
    const gr=P('greenriyadh'), hw=gr.ribbon.hw, pts=gr.ribbon.pts;
    polyStrip(pts,hw,G+.003,[.62,.74,.46]); polyStrip(pts,hw*.72,G+.004,[.52,.70,.38]);                                   // outer scrub, inner meadow
    for (const q of pts.slice(1,-1)) { addDisc(q[0],G+.003,q[1],hw,[.62,.74,.46],18); addDisc(q[0],G+.004,q[1],hw*.72,[.52,.70,.38],16); }   // rounded bends
    const mw=[]; for (let i=1;i<pts.length;i++) for (let t=0;t<1;t+=.125){ const x=pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t, z=pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t; mw.push([x, z+Math.sin(x*24)*.03]); }
    mw.push(pts[pts.length-1]);
    polyStrip(mw,.022,G+.0045,[.86,.80,.62]); polyStrip(mw,.0175,G+.005,[.46,.74,.76]); polyStrip(mw,.0125,G+.0055,[.27,.58,.81]);   // V14: sandy banks, shallows, river
    for (const q of mw.slice(1,-1)) { addDisc(q[0],G+.0045,q[1],.022,[.86,.80,.62],12); addDisc(q[0],G+.005,q[1],.0175,[.46,.74,.76],12); addDisc(q[0],G+.0055,q[1],.0125,[.27,.58,.81],12); }   // smooth bends
    for (let i=3;i<mw.length;i+=7) addDisc(mw[i][0],G+.0047,mw[i][1]+(i%2?.028:-.028),.016,[.44,.70,.62],14);             // wetlands
    lineTarget=lines; polyLine(pts,G+.007,[.93,.86,.66],hw*.82); polyLine(pts,G+.007,[.93,.86,.66],-hw*.82);             // trails
    for (const i of [5,15,26,36]) if (mw[i]) { const a=mw[i-1], b=mw[i+1]||mw[i], rot=Math.atan2(b[1]-a[1],b[0]-a[0]); addBox(mw[i][0],G+.008,mw[i][1],.036,.003,.008,[.84,.70,.50],-rot+Math.PI/2); }   // footbridges
    for (let i=1;i<pts.length;i++){ const a=pts[i-1], b=pts[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]), nx=-(b[1]-a[1])/L, nz=(b[0]-a[0])/L;
      for (let t=.008;t<L;t+=.014) for (const sg of [-1,1]) { const off=hw*(.3+rn()*.5)*sg, x=a[0]+(b[0]-a[0])*t/L+nx*off, z=a[1]+(b[1]-a[1])*t/L+nz*off;
        if (LY.polyDist(x,z,mw) < .026 || Math.hypot(x-gr.pad[0],z-gr.pad[1]) < .04 || LY.cityRoadDist(x,z) < .02) continue;
        const r=rn(); if (r<.45) addGhaf(x,z,.2+rn()*.12); else if (r<.7) addPalm(x,z,.16+rn()*.05); else rTree(x,z,.13+rn()*.1,[.30+rn()*.08,.56+rn()*.1,.28]); } }   // V15: varied, in scale
    if (RX) RX.green(gr, mw);                                                                                    // V15: reeds, feathered edge, shade pockets
  }
  function buildRiyadh(){
    const ry=C('Riyadh'), rn=mulberry32(2030);
    riyadhDowntown(ry, rn);
    // Riyadh Metro: a broad curved canopy over King Fahd Road; blue rails around King Salman Park and north to the airport.
    const mt=P('metro'); addDisc(mt.x,G+.003,mt.z,.056,[.86,.84,.80],22);
    // V14: an elevated guideway on the exact route: concrete deck with side beams, two dark rails, the blue guideway
    // lines, and slim piers (none in a roadway). Stations and the main terminus are staged with the project; trains run
    // along the two tracks in opposite directions once it is built (buildVehicles).
    const MR=LY.METRO_ROUTE, DECK=G+.012;
    for (let i=1;i<MR.length;i++){ const a=MR[i-1], b=MR[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]), rot=Math.atan2(b[1]-a[1],b[0]-a[0]);
      addBox((a[0]+b[0])/2,DECK-.003,(a[1]+b[1])/2,L,.003,.0115,[.80,.80,.79],rot);
      for (let t=.014;t<L-.006;t+=.028){ const x=a[0]+(b[0]-a[0])*t/L, z=a[1]+(b[1]-a[1])*t/L; if (LY.cityRoadDist(x,z) > .012) addBox(x,G,z,.0036,DECK-.003-G,.0036,[.84,.84,.82],rot); } }
    for (const q of MR.slice(1,-1)) addCylinder(q[0],DECK-.003,q[1],.00575,.003,[.80,.80,.79],12);
    polyStrip(MR,.0058,DECK+.0001,[.88,.88,.86]); for (const q of MR.slice(1,-1)) addDisc(q[0],DECK+.0001,q[1],.0058,[.88,.88,.86],12);
    for (const o of [-.0022,.0022]) { const off=MR.map((q,i)=>{ const a=MR[Math.max(0,i-1)], b=MR[Math.min(MR.length-1,i+1)], L=Math.hypot(b[0]-a[0],b[1]-a[1]); return [q[0]-(b[1]-a[1])/L*o, q[1]+(b[0]-a[0])/L*o]; });
      polyStrip(off,.0011,DECK+.0003,[.36,.38,.42]); }
    lineTarget=lines; polyLine(MR,DECK+.0005,[.50,.80,1],.0035); polyLine(MR,DECK+.0005,[.50,.80,1],-.0035);
    sig('metro', () => {
      addModel('RUH_MetroStation',mt.x,mt.z-.004,fitFoot(mt,1.6),{hk:1.6});                                       // vaulted elevated station
      for (const i of [2, 5]) { const a=MR[i-1], b=MR[i+1]; metroStop(MR[i][0],MR[i][1],DECK,Math.atan2(b[1]-a[1],b[0]-a[0])); } });
    if (RX) RX.metro(mt, MR);                                                                                    // V15: forecourts, entrances, bus and taxi bay
    const pk=P('park'); riyadhPark(pk, ry, rn);
    // New Murabba: one monumental gold cube in a landscaped square, low buildings around it, clear space on every side.
    const mu=P('newmurabba'); keepOut.push([mu.x,mu.z,mu.foot]);
    murabbaPlaza(mu);                                                                                     // V14: square, gardens, pools (always)
    if (RX) RX.murabba(mu, .084, .086);                                                                          // V15: shaded walks, canopies, lights, life
    sig('newmurabba', () => {                                                                                   // V14: staged architecture
      mukaab(mu.x,mu.z-.006,.084,.086);
      for (let i=0;i<8;i++){ const a=i/8*6.283+.39; najdi(mu.x+Math.cos(a)*.086,mu.z+Math.sin(a)*.086,.02,.016,.012+(i%3)*.003,[.90,.82,.68],{rot:-a,upper:i%2===0,merlon:.002}); } });
    // ROSHN: orderly low cream homes on shaded streets with planted avenues — far lower than the Mukaab and downtown.
    const rs=P('roshn'); keepOut.push([rs.x,rs.z,rs.foot]);
    if (RX) RX.roshn(rs); else roshn(rs);                                                                      // V15: housing family (riyadh.js); V14 fallback
    const ks=P('ksip'); if (RX) { keepOut.push([ks.x,ks.z,ks.foot]); RX.airport(ks); } else riyadhAirport(ks);   // V15: riyadh.js
    if (RX) { const ex=P('expo'); keepOut.push([ex.x,ex.z,ex.foot]); RX.expo(ex, ks); } else riyadhExpo(rn, ks);   // V15
    // Diriyah: compact warm-earth heritage blocks and courtyards beside the wadi, an escarpment behind King Khalid Road.
    const dr=P('diriyah'); keepOut.push([dr.x,dr.z,dr.foot]);
    diriyahCore(dr, mulberry32(1744));                                                                          // V14: At-Turaif on its plateau (heritage, always)
    sig('diriyah', () => diriyahGate(dr));                                                                       // V14: new cultural buildings (staged)
    if (RX) RX.diriyah(dr);                                                                                     // V15: enclosure wall, lanes, plaza, palms
    polyStrip(LY.WADI,.022,G+.004,[.46,.70,.38]); polyStrip(LY.WADI,.009,G+.006,[.28,.60,.80]);
    { const prev=target; target=detailMesh; const W2=LY.WADI; for (let i=1;i<W2.length;i++){ const a=W2[i-1], b=W2[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]), nx=-(b[1]-a[1])/L, nz=(b[0]-a[0])/L;
        for (let t=.02;t<L;t+=.045) for (const s2 of [-1,1]) { const x=a[0]+(b[0]-a[0])*t/L+nx*.04*s2, z=a[1]+(b[1]-a[1])*t/L+nz*.04*s2; if (LY.decorAllowed(x,z,.03,.045,true)) addPalm(x,z,.17+rn()*.05); } } target=prev; }
    for (let z=-.85; z<=.12; z+=.07) { const x=ry.x-.79+Math.sin(z*7)*.015, zz=ry.z+z; if (LY.roadDist(x,zz) < .05) continue; addMound(x,zz,.05,.04,.045+rn()*.03,rn(),[.79,.64,.49],7); }   // V11: muted escarpment
    // Sports Boulevard: one continuous planted ribbon with walking and cycling paths, a bridge over King Fahd Road and activity areas.
    const sp=P('sports'); sportsBoulevard(sp, ry); if (RX) RX.sports(sp);                                       // V14 paths, planting, venues; V15 furniture
    // Renewables: ordered solar rows and slim turbines on the outer north-west, with modest service tracks.
    const re=P('renewables'); keepOut.push([re.x,re.z,re.foot]);
    if (RX) RX.renewables(re, addTurbine); else {                                                                 // V15: rows on posts, inverters, substation, fence
    for (let i=0;i<5;i++) for (let j=0;j<4;j++) addModel('RUH_SolarUnit',re.x-.068+i*.025,re.z-.05+j*.022,.024,{hk:2});   // repeated solar units
    for (let i=0;i<3;i++) addTurbine(re.x+.066,re.z-.045+i*.04,.55);
    addLine([re.x-.09,G+.006,re.z+.045],[re.x+.09,G+.006,re.z+.045],[.86,.78,.60]); addLine([re.x+.045,G+.006,re.z-.07],[re.x+.045,G+.006,re.z+.07],[.86,.78,.60]); }
    // Qiddiya: entertainment on stepped rocky terraces beyond the Tuwaiq cliffs.
    const qd=P('qiddiya'); keepOut.push([qd.x,qd.z,qd.foot]);
    if (RX) RX.qiddiya(qd); else { { const R0=qd.foot-.005, prev=target; addDisc(qd.x,G+.0025,qd.z,R0,[.84,.74,.58],32);                         // V14: landscaped site ring, walks, palms
      lineTarget=lines; const ring=[]; for (let i=0;i<=36;i++){ const a=i/36*6.283; ring.push([qd.x+Math.cos(a)*(R0-.006),qd.z+Math.sin(a)*(R0-.006)]); } polyStrip(ring,.0022,G+.0035,[.94,.88,.74]);
      target=detailMesh; for (let i=0;i<14;i++){ const a=i/14*6.283+.1, x=qd.x+Math.cos(a)*(R0-.012), z=qd.z+Math.sin(a)*(R0-.012); if (Math.hypot(x-qd.pad[0],z-qd.pad[1]) > .04) addPalm(x,z,.3); } target=prev; }
    sig('qiddiya', () => {                                                                                      // V14: attractions (staged)
      addModel('RUH_Qiddiya',qd.x,qd.z-.012,fitFoot(qd,1.25),{hk:1.3});                                          // stepped rock base, coaster, loop, venues
      { const wx=qd.x-.07, wz=qd.z+.035, r=.017, hub=[wx,G+r+.006,wz], rim=k=>{ const a=k/14*6.283; return [wx+Math.cos(a)*r,G+r+.006+Math.sin(a)*r,wz]; };   // observation wheel
        for (let k=0;k<14;k++){ addRod(rim(k),rim(k+1),.0012,[.95,.95,.94]); if (k%2===0) addRod(hub,rim(k),.0006,[.86,.86,.88]); addBox(rim(k)[0],rim(k)[1]-.0016,wz,.0024,.0022,.0024,[[.92,.34,.30],[.98,.76,.24],[.30,.60,.90]][k%3]); }
        for (const e of [-1,1]) { addRod([wx-.008,G,wz+e*.004],hub,.0016,[.80,.80,.82]); addRod([wx+.008,G,wz+e*.004],hub,.0016,[.80,.80,.82]); } }
      { const px=qd.x+.06, pz=qd.z+.058; addDisc(px,G+.003,pz,.016,[.90,.86,.78],18); addDisc(px-.004,G+.0036,pz,.009,[.30,.70,.88],16); addDisc(px+.008,G+.0036,pz-.004,.005,[.36,.76,.90],12);   // water park
        addRod([px-.012,G+.014,pz-.01],[px-.006,G+.004,pz-.002],.002,[.98,.70,.22]); addRod([px-.016,G+.012,pz-.004],[px-.008,G+.004,pz+.003],.002,[.30,.70,.40]); addBox(px-.014,G,pz-.008,.004,.014,.004,[.86,.84,.80]); } }); }
    // Tuwaiq escarpment: stepped cliffs between the city and Qiddiya (kept off roads and footprints).
    { const RG=LY.RIDGES; for (let i=1;i<RG.length;i++){ const a=RG[i-1], b=RG[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]), rot=Math.atan2(b[1]-a[1],b[0]-a[0]);
        for (let t=0;t<L;t+=.045){ const x=a[0]+(b[0]-a[0])*t/L, z=a[1]+(b[1]-a[1])*t/L; for (const [o,h] of [[0,.05],[.04,.034],[.08,.018]]) { const xx=x+Math.sin(rot)*o, zz=z-Math.cos(rot)*o;   // stepped terraces, highest on the city side
          if (!LY.decorAllowed(xx,zz,.02,.035)) continue; const hh=h+rn()*.008; addBox(xx,G,zz,.052,hh,.042,[.75+rn()*.04,.61,.47],-rot); addBox(xx,G+hh,zz,.046,.003,.036,[.86,.74,.58],-rot); } } } }   // V11: muted Tuwaiq terraces
    riyadhGreen(rn);
    // Short access spurs join each district to its road (none cross another parcel).
    for (const [p, tz] of [[mu,-.48],[rs,-.48],[re,-.48]]) addStrip([p.x,p.z+p.foot],[p.x,ry.z+tz],.005,G+.006,[.60,.54,.46]);
    addStrip([dr.x+dr.foot,dr.z],[ry.x-.40,dr.z],.005,G+.006,[.60,.54,.46]);
    if (RX) RX.roadMarks();                                                                                      // V15: lane dashes (traffic in buildVehicles)
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
      if (d < .42 && rn() < .35) { target=detailMesh; addHouse(x-.016,z+.012,.15,[.90,.84,.72],0); addHouse(x+.016,z-.012,.15,[.90,.84,.72],0); target=prev; } }
    target=detailMesh;
    for (let dx=-.82; dx<=.84; dx+=c) for (let dz=-.9; dz<=.86; dz+=c) {                                    // light scatter outside the roads
      const x=ry.x+dx+(rn()-.5)*.01, z=ry.z+dz+(rn()-.5)*.01;
      if (urban(dx,dz) || dx < -.72 || rn() > .08 || !open(x,z,.05)) continue;
      addHouse(x,z,.15+rn()*.03,[.86,.79,.66],0); }   // V15: in scale with the districts
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
  // Marina craft: the shared yacht and workboat models (alternating by position), hull down to the waterline.
  const boat = (x, z, rot, k = 1) => { const yacht = ((x * 997 + z * 613) % 1 + 1) % 1 < .7;
    if (!addModel(yacht ? 'SHR_Yacht' : 'SHR_Workboat', x, z, (yacht ? .014 : .01) * k, {rot, y:SEA + .002, hk:1.6})) { addBox(x, SEA, z, .014 * k, .005, .005 * k, [.97, .97, .96], rot); addBox(x, SEA + .005, z, .006 * k, .004, .004 * k, [.85, .90, .95], rot); } };
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
  // V12: one rock formation (rocks.js); consumes one value of the plan's random stream, as the old blob + cone did.
  const mountain = (x, z, r, h, col, rn, o = {}) => rockAt(x, z, r, h, col, Object.assign({}, o, {salt:rn()}));
  // A range's formations line up with its long axis, so neighbours join into ridges; their tips stay off roads and parcels.
  const range = (cx, cz, rx, rz, n, rn, col, hmin, hmax, test, style = 'rock') => { const rot = rx > rz * 1.3 ? 0 : rz > rx * 1.3 ? Math.PI / 2 : null;
    for (let i = 0, k = 0; i < n * 8 && k < n; i++) { const x = cx + (rn() * 2 - 1) * rx, z = cz + (rn() * 2 - 1) * rz; if (Math.pow((x - cx) / rx, 2) + Math.pow((z - cz) / rz, 2) > 1 || !test(x, z)) continue; k++; mountain(x, z, .03 + rn() * .035, hmin + rn() * (hmax - hmin), mix(col, [.66, .52, .40], rn() * .3), rn, {style, rot, test:tipOpen}); } };
  const tipOpen = (x, z) => onLand(x, z) && LY.decorAllowed(x, z, .03, .03);
  const hillOpen = (x, z) => onLand(x, z) && LY.decorAllowed(x, z, .05, .045) && !Object.values(window.VisionScenicSites||{}).some(s=>s.x!=null&&Math.hypot(x-s.x,z-s.z)<s.r+.065);

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
    // Three smaller industrial modules (tank farm, processing unit, factory halls) instead of one enormous complex.
    const kJ = modelK('EP_Jubail_Processing', .052);
    // Tank farm and process units are supplied by the detailed eastern clay kit below.
    addModel('EP_Jubail_Factories', jb.x + .03, jb.z - .005, 0, {k:kJ, hk:1.8});
    const cE = RG_coast('east', jb.z);                                    // port on the Gulf shore: quay deck out over the water, sea side east
    quay([cE - .012, jb.z - .015], [cE + .05, jb.z - .015], .022);
    addModel('EP_Jubail_Port', cE + .02, jb.z - .015, .06, {rot:Math.PI / 2, hk:1.6, y:G - .003});
    ship(cE + .1, jb.z - .045, .05, .07, [.78, .22, .22], rn); ship(cE + .13, jb.z + .06, -.2, .06, [.25, .35, .55], rn);
    // Al Qatif and Tarout: dense heritage fabric, palms, a waterfront and shallow-water islands.
    const qt = PLv('qatif'); keepOut.push([qt.x, qt.z, qt.r]);
    addModel('EP_Qatif_Waterfront', qt.x - .006, qt.z, 2 * qt.r - .02, {rot:Math.PI / 2, hk:2});   // low warm facades, souq stalls, palm promenade facing the Gulf
    palmGrove(qt.x - .02, qt.z + .05, .05, 16, rn);
    const tr = P.isles[0]; const ty = island(tr[0], tr[1], tr[2]); addModel('EP_TaroutCastle', tr[0], tr[1], 1.3 * tr[2], {y:ty, hk:1.4}); islePalm(tr[0] + .014, tr[1] + .012, ty);
    for (const [x, z, r] of P.isles.slice(1, 3)) { const y = island(x, z, r); islePalm(x, z, y, .8); }
    for (let i = 0; i < 3; i++) boat(qt.x + .09 + i * .012, qt.z + .02, .4, .8);
    // Dammam: a modest skyline on a curved corniche, and King Abdulaziz Port kept apart from the centre.
    const dm = PLv('dammam'); keepOut.push([dm.x, dm.z, dm.r]);
    { const kit = ['EP_Dammam_GlassOffice', 'EP_Dammam_Civic', 'EP_Dammam_Commercial', 'EP_Dammam_MidriseBlock'], kD = modelK('EP_Dammam_Civic', .018);   // reusable city kit, varied
      scatterIn(dm.x - .006, dm.z, dm.r - .016, 12, rn, (x, z, n) => { const nm = kit[n % 4], d = Math.hypot(x - dm.x, z - dm.z) / dm.r;
        addModel(nm, x, z, 0, {k:kD, rot:Math.round(rn() * 3) * Math.PI / 2, hk:nm === 'EP_Dammam_GlassOffice' ? 1.4 + (1 - d) : 1.6}); },
        (x, z) => onLand(x, z) && inCircle(dm.x, dm.z, dm.r - .012)(x, z) && RG_coast('east', z) - x > .012); }
    { const pts = []; for (let i = 0; i <= 12; i++) { const z = dm.z - .03 + i * .01; pts.push([RG_coast('east', z) - .006 - Math.sin(i / 12 * Math.PI) * .012, z]); } polyStrip(pts, .003, G + .006, [.93, .86, .66]); for (const q of pts.filter((_, i) => i % 2)) addPalm(q[0] - .008, q[1], .32); }
    const dp = LY.MISSION_SITES['east:dport'], cD = RG_coast('east', dp[1]);
    quay([cD - .01, dp[1]], [cD + .05, dp[1]], .02);                                     // cargo terminal on the shared crane/container kit
    addModel('EP_Dammam_CargoPort', cD + .02, dp[1], .05, {rot:Math.PI / 2, hk:1.6, y:G - .003});
    ship(cD + .06, dp[1] - .04, 0, .075, [.82, .26, .22], rn); ship(cD + .13, dp[1] + .075, .5, .06, [.22, .30, .50], rn);
    // Dhahran: a landscaped knowledge and energy campus — low modern buildings around plazas and a domed hall.
    const dh = PLv('dhahran'); keepOut.push([dh.x, dh.z, dh.r]);
    addDisc(dh.x, G + .003, dh.z, dh.r - .004, [.58, .76, .46], 28); addDisc(dh.x, G + .004, dh.z, .018, [.92, .90, .84], 16);
    // The Ithra-inspired stone forms occupy the landscaped campus below.
    // Al Khobar: waterfront skyline, promenade, marina — and the King Fahd Causeway heading out over the Gulf.
    const kh = PLv('khobar'); keepOut.push([kh.x, kh.z, kh.r]);
    // Towers behind a curved marina edge (the model's basin opens to +y, turned to face the Gulf).
    { const cK = RG_coast('east', kh.z); addModel('EP_Khobar_Waterfront', Math.min(kh.x, cK - .046), kh.z - .006, 2 * kh.r - .018, {rot:Math.PI / 2, hk:1.3}); }
    // King Fahd Causeway: the route itself is drawn by buildPlanNetworks(); the mid-way island carries the checkpoint group,
    // and the repeatable low span model is laid along each causeway segment over the water.
    const cw = LY.PLANS.east.roads.find(r => r.id === 'eCauseway').pts;
    { const q = cw[1]; const y = island(q[0], q[1], .014, false); addModel('EP_Causeway_Checkpoint', q[0], q[1], .026, {y, hk:1.4}); }
    for (let i = 1; i < cw.length; i++) { const a = cw[i - 1], b = cw[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = Math.atan2(b[1] - a[1], b[0] - a[0]), n = Math.max(1, Math.round(L / .012));
      for (let k = 0; k < n; k++) { const t = (k + .5) / n; addModel('EP_Causeway_Span', a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, L / n, {rot, hk:2.2, y:SEA + .034 - 8.5 * (L / n / 100) * 2.2}); } }
    // Al Ahsa / Hofuf: a broad palm oasis with irrigation channels, heritage town and the rail station.
    const gr = P1('green'); keepOut.push([gr.x, gr.z, gr.foot]);
    addDisc(gr.x, G + .003, gr.z, gr.foot - .004, [.54, .70, .38], 30);
    addModel('EP_AlAhsa_Oasis', gr.x, gr.z - .012, fitFoot(gr, 1.2), {hk:1.4});            // dense date-palm grove, irrigation channels, spring, mud houses
    { const prev = target; target = detailMesh; scatterIn(gr.x, gr.z, gr.foot - .008, 14, rn, (x, z, n) => addModel(n % 3 ? 'EP_DatePalm_Tall' : 'EP_DatePalm_Young', x, z, .006, {hk:1.3}),   // stand-alone palms at the grove edge
        (x, z) => { const d = Math.hypot(x - gr.x, z - gr.z); return d > fitFoot(gr, 1.2) * .72 && d < gr.foot - .006 && Math.hypot(x - gr.pad[0], z - gr.pad[1]) > .03; }); target = prev; }
    const hf = PLv('hofuf'); keepOut.push([hf.x, hf.z, hf.r]);
    station(hf.x - .012, hf.z + .028, 0);
    station(2.07, -1.125, -.6);                                                         // Dammam rail station
    // King Fahd International Airport (inland of Dammam) and inland desert hills on the west edge.
    const ap = LY.MISSION_SITES['east:kfia']; addStrip([ap[0] - .045, ap[1] - .01], [ap[0] + .045, ap[1] - .01], .006, G + .005, [.32, .33, .35]); addBox(ap[0], G, ap[1] + .012, .04, .008, .012, [.90, .92, .94]);
    for (const [x, z, r] of P.decor.hills) mountain(x, z, r, .05 + rn() * .03, [.82, .70, .56], rn, {style:'desert', test:tipOpen});   // V12: low desert outcrops
    fabric(dm.x - .06, dm.z + .04, .05, 12, rn, [[.94,.88,.76],[.90,.82,.68]]); fabric(kh.x - .07, kh.z, .045, 10, rn, [[.94,.88,.76],[.90,.82,.68]]);
    palmGrove(1.95, -1.33, .06, 10, rn); palmGrove(2.18, -.68, .05, 8, rn);
    window.VisionEastClay?.({G,box:addBox,cylinder:addCylinder,cone:addCone,dome:addDome,blob:addBlob,quad:addQuad,palm:addPalm,LY,jubail:jb,dhahran:dh,khobar:kh,hofuf:hf,coast:z=>RG_coast('east',z)});
  }

  // ------------------------------------------------------------------ Western Corridor
  function buildWest(){
    const P = RPL.west; if (!P) return; const rn = mulberry32(502);
    // Mountains first (they frame everything): the Hejaz massif east of the rail line, the buffer between Jeddah and
    // Makkah, and the uplands round Taif. Never on a road, railway or landmark.
    range(-2.40, .55, .15, .42, 40, rn, [.71, .48, .36], .05, .1, hillOpen, 'hejaz');   // V12: Hejaz terracotta ridges
    range(-2.58, 1.44, .018, .08, 6, rn, [.69, .47, .36], .04, .07, hillOpen, 'hejaz');
    range(-2.30, 1.66, .16, .13, 18, rn, [.68, .48, .37], .05, .09, hillOpen, 'hejaz');    // Taif uplands
    range(-2.12, 1.30, .08, .1, 12, rn, [.66, .50, .40], .05, .09, hillOpen, 'hejaz');
    range(-2.30, -.30, .1, .08, 8, rn, [.74, .50, .37], .04, .07, hillOpen, 'alula');     // north: layered sandstone
    // Madinah: a calm, spacious city around the Prophet's Mosque — white arcades, green dome, minarets, open courtyards.
    const md = PLv('madinah'); keepOut.push([md.x, md.z, md.r]);
    addDisc(md.x, G + .003, md.z, md.r - .002, [.95, .94, .90], 28);
    // The Prophet's Mosque (simplified massing: courtyards, minarets, green dome; qibla to the south) on an uncluttered plaza,
    // with quiet light-stone city blocks around it that never compete with it.
    addModel('WC_ProphetsMosque', md.x, md.z, 2 * md.r - .01, {hk:1.25});
    { const prev = target; target = detailMesh; scatterIn(md.x, md.z, .15, 16, rn, (x, z) => addModel('WC_Madinah_Block', x, z, .022, {hk:1.5}),
        (x, z) => openAt(x, z, .016) && Math.hypot(x - md.x, z - md.z) > md.r + .016); target = prev; }
    // Rua Al Madinah: hospitality and public space immediately east of the mosque, inside the city.
    const ru = P1('madinah'); keepOut.push([ru.x, ru.z, ru.foot]);
    addDisc(ru.x, G + .003, ru.z, ru.foot - .003, [.90, .88, .82], 22);
    addModel('WC_RuaAlMadinah', ru.x, ru.z - .006, 2 * ru.foot - .022, {hk:1.6});          // warm-stone hospitality blocks, planted courtyards, passages
    // KAEC / Ceer: a planned economic-city parcel — port, logistics and the Ceer EV campus with its test track.
    const ce = P1('ceer'); keepOut.push([ce.x, ce.z, ce.foot]); const cK = RG_coast('west', ce.z);
    addDisc(ce.x + .006, G + .003, ce.z, ce.foot - .01, [.84, .84, .80], 24);
    // KAEC: its compact port on the Red Sea (sea side west), the planned waterfront district north of it, and the Ceer campus.
    quay([cK + .012, ce.z - .03], [cK - .05, ce.z - .03], .02);
    addModel('WC_KAEC_Port', cK - .015, ce.z - .03, .042, {rot:-Math.PI / 2, hk:1.6, y:G - .003}); ship(cK - .06, ce.z - .06, 0, .06, [.30, .40, .60], rn);
    { const zW = ce.z - ce.foot - .03, xW = RG_coast('west', zW) + .03; if (!LY.footprintAt(xW, zW)) addModel('WC_KAEC_Waterfront', xW, zW, .045, {rot:-Math.PI / 2, hk:1.6}); }
    addModel('WC_Ceer_Facility', ce.x + .016, ce.z - .006, .056, {hk:1.6});
    // Electric Vehicle Manufacturing: the neighbouring KAEC plant (long assembly halls, solar roofs).
    const lu = P1('lucid'); keepOut.push([lu.x, lu.z, lu.foot]);
    addDisc(lu.x, G + .003, lu.z, lu.foot - .004, [.84, .84, .80], 20); factory(lu.x, lu.z - .008, .05, .018, .011, [.90, .91, .93]); addSolar(lu.x, lu.z - .008, 5, 2, .009); factory(lu.x + .004, lu.z + .018, .036, .012, .008, [.86, .88, .90]);
    // Jeddah: corniche, contemporary skyline, maritime activity; Jeddah Central waterfront; Al Balad heritage; the port.
    const jd = PLv('jeddah'); keepOut.push([jd.x, jd.z, jd.r]);
    skyline(jd.x + .004, jd.z, jd.r - .008, 18, .2, rn, (x, z) => onLand(x, z) && inCircle(jd.x, jd.z, jd.r - .006)(x, z) && x - RG_coast('west', z) > .012);
    addModel('WC_JeddahTower', jd.x - .01, jd.z - .018, .02, {hk:1.3});                    // three-winged tapering tower, ~1 km
    // Corniche: promenade with its separate modules (landscaped plaza, sculptural canopy, seaside pavilion), facing the sea.
    { const pts = []; for (let i = 0; i <= 14; i++) { const z = jd.z - .09 + i * .013; pts.push([RG_coast('west', z) + .006, z]); } polyStrip(pts, .003, G + .006, [.93, .86, .66]);
      const mods = [['WC_Corniche_Plaza', .012], ['WC_Corniche_Canopy', .009], ['WC_Corniche_Pavilion', .006]];
      pts.forEach((q, i) => { if (i % 3) return; const [nm, s] = mods[(i / 3) % 3]; addModel(nm, q[0] + .009, q[1], s, {rot:-Math.PI / 2, hk:1.8}); }); }
    // King Fahd's Fountain is animated by world-cosmetics.js rather than a solid white cylinder.
    const jc = P1('jeddahcentral'); keepOut.push([jc.x, jc.z, jc.foot]); const cJ = RG_coast('west', jc.z);
    addDisc(jc.x, G + .003, jc.z, jc.foot - .003, [.92, .88, .76], 20);
    addModel('WC_JeddahCentral', jc.x - .002, jc.z - .006, fitFoot(jc, 1.15), {rot:-Math.PI / 2, hk:1.6});   // compact parcel: venue shell, terraces, marina edge to the sea
    marina(cJ - .002, jc.z + .012, Math.PI, 3, rn);
    // Al Balad: individual historic houses (pale plaster, coral stone, wooden roshan) set along narrow lanes.
    // The local west-clay kit below provides roshan-fronted coral-plaster houses.
    // Jeddah Islamic Port: gate/terminal building plus the shared gantry cranes, container blocks and warehouse, south of the waterfront.
    { const jp = LY.MISSION_SITES['west:jport'], cP = RG_coast('west', jp[1]), kP = modelK('SHR_GantryCrane', .016);
      quay([cP + .01, jp[1]], [cP - .07, jp[1] - .01], .016);
      for (let i = 0; i < 3; i++) addModel('SHR_GantryCrane', cP - .02 - i * .018, jp[1] - .006, 0, {k:kP, rot:-Math.PI / 2, hk:1.4, y:G - .003});
      for (let i = 0; i < 2; i++) addModel('SHR_ContainerStack', cP - .03 - i * .022, jp[1] + .006, 0, {k:kP, hk:1.6, y:G - .003});
      addModel('SHR_Warehouse', cP + .012, jp[1] + .014, 0, {k:kP, hk:1.6}); addModel('WC_JeddahPort_Terminal', cP + .03, jp[1] - .004, 0, {k:kP, hk:1.6});
      ship(cP - .05, jp[1] + .03, .1, .065, [.80, .26, .22], rn); }
    const ka = LY.MISSION_SITES['west:kaia']; addStrip([ka[0] - .004, ka[1] - .04], [ka[0] - .004, ka[1] + .04], .006, G + .005, [.32, .33, .35]); addBox(ka[0] + .02, G, ka[1], .012, .008, .03, [.90, .92, .94]);   // King Abdulaziz Airport
    for (let i = 0; i < 4; i++) boat(RG_coast('west', jd.z + .02 * i) - .05 - i * .01, jd.z - .03 + .03 * i, .3 * i, 1.1);
    fabric(jd.x + .02, jd.z + .06, .07, 18, rn, [[.97,.94,.88],[.94,.86,.72],[.90,.82,.68]]);
    // Makkah: a compact city with a respectfully scaled Masjid al-Haram — white courtyard, the Kaaba, arcade and minarets.
    const mk = PLv('makkah'); keepOut.push([mk.x, mk.z, mk.r]);
    // Masjid al-Haram (simplified: white courtyards, mataf arcade, main arcades, minarets) with the Kaaba as its own,
    // separately placed asset in the clear centre. The Kaaba is drawn a little larger than true scale so it stays legible.
    addModel('WC_Haram', mk.x, mk.z, .072, {hk:1.2});
    addModel('WC_Kaaba', mk.x, mk.z, .0062, {hk:1.1});
    skyline(mk.x, mk.z, mk.r - .004, 14, .05, rn, (x, z) => Math.hypot(x - mk.x, z - mk.z) > .038 && Math.hypot(x - mk.x, z - mk.z) < mk.r - .004, [[.94,.92,.86],[.90,.88,.84],[.86,.84,.80]]);
    // Abraj Al-Bait's detailed clock-tower kit is placed south of the Haram below.
    // Masar Makkah: a planned boulevard district extending west from central Makkah — wholly inland.
    // Masar Makkah: repeatable hotel and commercial modules framing the pedestrian boulevard toward the Haram
    // (module fronts face the route: north side turned to face south, south side faces north).
    const ms = P1('masar'); { const pts = ms.ribbon.pts, kM = modelK('WC_Masar_HotelSlab', .011), mods = ['WC_Masar_HotelTower', 'WC_Masar_HotelSlab', 'WC_Masar_Commercial'];
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), th = Math.atan2(b[1] - a[1], b[0] - a[0]);
        addModel('WC_Masar_Boulevard', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0, {k:kM * .9, rot:th - Math.PI / 2, sx:1, hk:1.4}); polyStrip([a, b], .006, G + .004, [.86, .80, .64]);
        for (let t = .15, n = 0; t < 1; t += .3, n++) { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
          for (const s of [-1, 1]) addModel(mods[(n + i + (s > 0 ? 1 : 0)) % 3], x, z + s * .012, 0, {k:kM, rot:s < 0 ? Math.PI : 0, hk:1.5}); } } }
    // Holy Sites (Mina and Arafat): the white tent city east of Makkah, with the Mashaer rail alongside.
    const hj = P1('hajj'); keepOut.push([hj.x, hj.z, hj.foot]);
    // Holy Sites as separate modules: repeated Mina tent blocks, a simple Arafat facility and a transport/service facility.
    const kH = modelK('WC_Mina_TentModule', .0115), fac = [[-.026, -.02, 'WC_Arafat_Facility'], [.026, -.02, 'WC_HolySites_Transport']];
    for (const [dx, dz, nm] of fac) addModel(nm, hj.x + dx, hj.z + dz, 0, {k:kH, hk:1.6});
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const x = hj.x + i * .012, z = hj.z + j * .012; if (Math.hypot(x - hj.x, z - hj.z) > hj.foot - .01 || Math.hypot(x - hj.pad[0], z - hj.pad[1]) < .02) continue;
      if (fac.some(([dx, dz]) => Math.abs(x - hj.x - dx) < .016 && Math.abs(z - hj.z - dz) < .013)) continue; addModel('WC_Mina_TentModule', x, z, 0, {k:kH, hk:1.6}); }
    // Taif: an independent upland town — terraced slopes, rose-coloured planting, a winding approach.
    const tf = PLv('taif'); keepOut.push([tf.x, tf.z, tf.r]);
    for (let k = 0; k < 3; k++) addCylinder(tf.x, G, tf.z, tf.r - .006 - k * .014, .006, shade([.62, .72, .44], 1 + k * .04), 22);
    addModel('WC_Taif_Cluster', tf.x, tf.z, 2 * tf.r - .03, {hk:1.5, y:G + .006});          // light hillside buildings on terraces climbing north
    { const prev = target; target = detailMesh; scatterIn(tf.x, tf.z, tf.r + .03, 16, rn, (x, z) => addTree(x, z, .22, [.92, .52, .66]), (x, z) => onLand(x, z) && LY.decorAllowed(x, z, .004, .012)); target = prev; }
    // Haramain High-Speed Railway: Madinah → KAEC → Jeddah → Makkah with integrated stations (it does not reach Taif).
    const hr = P1('haramain'); for (let i = 1; i < hr.ribbon.pts.length; i++) railSegment(hr.ribbon.pts[i - 1], hr.ribbon.pts[i], .012);
    const hp = hr.ribbon.pts; for (const s of [0, 3, 5, hp.length - 1]) {                     // station buildings, turned along the line
      const a = hp[Math.max(0, s - 1)], b = hp[Math.min(hp.length - 1, s + 1)]; addModel('WC_HaramainStation', hp[s][0], hp[s][1], .03, {rot:Math.atan2(b[1] - a[1], b[0] - a[0]), hk:1.6}); }
    { const a = hp[1], b = hp[2]; addModel('WC_HaramainTrain', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, .045, {rot:Math.atan2(b[1] - a[1], b[0] - a[0]), hk:1.5, y:G + .006}); }   // a train on the line
    palmGrove(-2.60, .18, .06, 10, rn); palmGrove(-2.56, 1.02, .05, 8, rn); palmGrove(-2.52, -.02, .05, 10, rn);
    window.VisionWestClay?.({G,box:addBox,cylinder:addCylinder,cone:addCone,dome:addDome,blob:addBlob,palm:addPalm,quad:addQuad,LY,onLand,coast:z=>RG_coast('west',z),places:{jeddah:jd,madinah:md,makkah:mk,taif:tf}});
    window.VisionScenicBuild?.({G,box:addBox,cylinder:addCylinder,cone:addCone,blob:addBlob,quad:addQuad,LY},'west');
  }

  // ------------------------------------------------------------------ NEOM / Northwest
  function buildNorthwest(){
    const P = RPL.northwest; if (!P) return; const rn = mulberry32(503);
    // Midian mountains: rugged peaks round Trojena, ranges framing THE LINE's valley (never on it), hills along the coast.
    range(-4.42, -2.42, .2, .1, 26, rn, [.76, .62, .50], .07, .13, hillOpen, 'neom');   // V12: rugged sandstone ridges and peaks
    range(-4.35, -1.98, .2, .05, 14, rn, [.80, .66, .53], .04, .08, hillOpen, 'neom');
    range(-3.95, -1.60, .18, .18, 16, rn, [.80, .64, .50], .04, .08, hillOpen, 'neom');
    range(-3.70, -1.05, .2, .2, 14, rn, [.77, .52, .38], .04, .07, hillOpen, 'alula');  // towards AlUla: terracotta cliffs and mesas
    range(-4.30, -2.24, .1, .05, 6, rn, [.78, .64, .51], .05, .09, hillOpen, 'neom');
    // THE LINE: one slim, reflective corridor from the NEOM coast inland through the valley.
    // THE LINE: one mirrored segment model (two reflective walls, flat top, gardens between) repeated along the route,
    // each copy stretched slightly so whole segments tile each straight run exactly.
    // Trojena: an elevated mountain destination — snow-tipped peaks, a small lake, terraced lodges.
    const tj = P1('trojena'); keepOut.push([tj.x, tj.z, tj.foot]);
    for (let i = 0; i < 5; i++) { const a = Math.PI + i / 4 * Math.PI, x = tj.x + Math.cos(a) * .062, z = tj.z + Math.sin(a) * .061, h = .085 + rn() * .035; rockAt(x, z, .03, h, [.70, .60, .52], {style:'peak', rot:a + Math.PI / 2, salt:i}); }   // V12: a ring of snow-tipped peaks
    addDisc(tj.x, G + .006, tj.z + .004, .02, [.34, .70, .86], 18);
    addModel('NW_Trojena_Resort', tj.x - .006, tj.z - .022, .03, {hk:1.6});                   // angular lodges above the lake
    addModel('NW_Trojena_Lakeside', tj.x, tj.z + .004, .032, {hk:1.5, y:G + .004});             // the long mirrored structure spanning the lake
    addModel('NW_Trojena_SkiFacility', tj.x + .03, tj.z - .012, .024, {hk:1.2, rot:-Math.PI / 4});   // lodge and lift line climbing toward a peak
    // Oxagon: a near-octagonal floating industrial city — engineered perimeter, blue inner harbour, quays, cranes, factories.
    const ox = P1('oxagon'); keepOut.push([ox.x, ox.z, ox.foot]);
    const R0 = ox.foot - .006, oct = i => [ox.x + Math.cos(i / 8 * 6.283 + Math.PI / 8) * R0, ox.z + Math.sin(i / 8 * 6.283 + Math.PI / 8) * R0];
    for (let i = 0; i < 8; i++) quay(oct(i), oct(i + 1), .014, [.80, .80, .78]);
    for (let i = 0; i < 8; i++) { const [x, z] = oct(i); addCylinder(x, SEA, z, .014, G - SEA - .003, [.80, .80, .78], 8); }
    // The octagonal deck (rim, perimeter buildings, dock cranes, central industry) sits on the engineered sea wall above.
    // Its octagon matches the wall (vertices at 22.5° + 45°k); the crane sides face the open sea to the west.
    addModel('NW_Oxagon', ox.x, ox.z, 2 * R0 * Math.cos(Math.PI / 8) * 1.04, {rot:-Math.PI / 2, hk:1.4, y:G - .004});
    // Green Hydrogen: the compound on Oxagon's inland side — solar rows, turbines, processing halls, spherical storage.
    const h2 = P1('hydrogen'); keepOut.push([h2.x, h2.z, h2.foot]);
    addDisc(h2.x, G + .003, h2.z, h2.foot - .004, [.82, .80, .70], 22);
    addModel('NW_GreenHydrogen', h2.x, h2.z - .006, fitFoot(h2, 1.3), {hk:1.3});             // electrolyser halls, tanks, pipe racks, turbines, solar field
    // Sindalah: a small offshore island with its marina, resort buildings and yachts.
    // Sindalah: the island outline stays the map's; its sculptural resort buildings and the marina piers are separate models.
    const sd = P1('sindalah'); { const y = island(sd.x, sd.z, sd.foot - .01);
      addModel('NW_Sindalah_Buildings', sd.x - .004, sd.z - .004, 1.55 * (sd.foot - .01), {y, hk:1.6});
      addModel('NW_Sindalah_Piers', sd.x + .036, sd.z, .03, {rot:Math.PI / 2, y:SEA + .004, hk:3});
      for (let i = 0; i < 4; i++) boat(sd.x + .044, sd.z - .012 + i * .008, 0, 1.1);
      addModel('NW_PassengerShuttle', sd.x + .07, sd.z + .02, .008, {rot:Math.PI * .9, y:SEA, hk:1.3}); }   // island shuttle
    // Tabuk: an established inland city east of NEOM.
    const tb = PLv('tabuk'); keepOut.push([tb.x, tb.z, tb.r]);
    addModel('NW_Tabuk_Set', tb.x, tb.z, 2 * tb.r - .016, {hk:1.6});                        // light-stone blocks, domed civic building, palm streets
    fabric(tb.x + .03, tb.z + .06, .05, 10, rn, [[.94,.86,.72],[.90,.80,.64]]); palmGrove(tb.x - .02, tb.z + .08, .05, 10, rn);
    // AlUla: monumental sandstone, an oasis and a compact heritage settlement.
    const au = P1('alula'); keepOut.push([au.x, au.z, au.foot]);
    // AlUla cues (stylised, not specific monuments): weathered sandstone formations, the old oasis town, a carved facade.
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + rn() * .3, r = .058 + rn() * .025, x = au.x + Math.cos(a) * r, z = au.z + Math.sin(a) * r * .8;
      if (Math.hypot(x - au.pad[0], z - au.pad[1]) < .035) continue; addModel('NW_AlUla_RockFormation', x, z, .03 + rn() * .015, {rot:rn() * 6.283, hk:1.5 + rn() * .5}); }
    palmGrove(au.x + .012, au.z + .012, .03, 14, rn, inCircle(au.x + .012, au.z + .012, .034));
    addModel('NW_AlUla_OasisCluster', au.x - .028, au.z - .012, .04, {hk:1.8});
    addModel('NW_AlUla_Facade', au.x + .03, au.z - .03, .02, {hk:1.5, rot:Math.PI / 6});
    addBox(au.x + .045, G, au.z - .045, .03, .014, .02, [.80, .88, .92]);                                        // Maraya mirrored hall
    // AMAALA: a calm multi-bay wellness and marina destination on the coast, outside NEOM.
    const am = P1('amaala'); keepOut.push([am.x, am.z, am.foot]); const cA = RG_coast('west', am.z);
    for (const dz of [-.035, 0, .035]) { addCylinder(cA - .012, SEA, am.z + dz, .02, G - SEA - .004, [.93, .84, .62], 14); for (let i = 0; i < 3; i++) villa(cA - .018 + i * .008, am.z + dz - .006 + i * .004, G - .004, i); }
    addModel('NW_AMAALA_Resort', am.x + .008, am.z - .004, fitFoot(am, 1.1), {rot:-Math.PI / 2, hk:1.8});   // low terraces stepping down to the beach (west)
    marina(cA - .03, am.z + .018, Math.PI, 2, rn);
    // The Red Sea Destination: low resort islands, coral shallows and boats — farther south and distinct from AMAALA.
    const rs = P1('redsea'); addDisc(rs.x, SEA + .002, rs.z, rs.foot, [.36, .80, .82], 28);                    // coral shallows
    // Resort islands: island villas, a jetty and a hospitality pavilion on the main island; low islets and reef accents
    // between them, used sparingly so the water routes stay readable.
    for (const [dx, dz, r] of [[0, 0, .022], [-.042, .025, .016], [.035, .032, .014], [.03, -.035, .015], [-.035, -.03, .013]]) { const y = island(rs.x + dx, rs.z + dz, r);
      if (!dx) { addModel('NW_RedSea_Pavilion', rs.x - .006, rs.z - .004, .012, {y, hk:1.6}); addModel('NW_RedSea_Villa', rs.x + .008, rs.z + .006, .01, {y, hk:1.6}); addModel('NW_RedSea_Jetty', rs.x + r * .9, rs.z - .004, .022, {y:SEA + .006, rot:Math.PI / 2, hk:2}); }
      else addModel('NW_RedSea_Villa', rs.x + dx, rs.z + dz, r * 1.1, {y, hk:1.6, rot:dx * 30});
      islePalm(rs.x + dx + r * .5, rs.z + dz + r * .3, y, .8); }
    for (const [dx, dz, nm, s] of [[.068, .01, 'NW_Islet_Rocky', .014], [-.07, -.005, 'NW_Islet_Sandy', .02], [.0, -.068, 'NW_Islet_Palms', .016], [-.062, .05, 'NW_Reef_Accent', .03], [.065, -.05, 'NW_Reef_Accent', .024]])
      addModel(nm, rs.x + dx, rs.z + dz, s, {y:SEA + .002, hk:2.5, rot:dx * 40});
    for (let i = 0; i < 3; i++) boat(rs.x + .06 + i * .012, rs.z - .01 + i * .01, .5, 1);
    palmGrove(-3.76, -.62, .03, 6, rn);
    window.VisionNeomClay?.({G,box:addBox,cylinder:addCylinder,blob:addBlob,quad:addQuad,palm:addPalm,LY,projects:D.projects.map(p=>P1(p.id))});
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
      for (let k = 0; k < 5; k++) { const px = x + (rn() - .5) * .22, pz = z + (rn() - .5) * .1; if (!forest(px, pz)) continue; const h = .06 + rn() * .06; mountain(px, pz, .035 + rn() * .02, h, mix([.50, .42, .35], [.60, .50, .40], rn()), rn, {style:'aseer', rot:Math.atan2(b[1] - a[1], b[0] - a[0]), test:forest, ground:[.54, .70, .40]});   // V12: darker rock, green lower slopes
        if (rn() > .3) { const prev = target; target = detailMesh; addTree(px + .03, pz + .02, .28, [.18, .46, .24]); target = prev; } } } }
    range(-.78, 3.05, .16, .12, 14, rn, [.62, .49, .40], .04, .07, hillOpen, 'rock');   // V12: deeper southern rock
    range(-.70, 3.60, .18, .12, 12, rn, [.67, .53, .42], .03, .06, hillOpen, 'desert');
    // Jazan Industrial City: orderly factories, tank farm, logistics yards and its own cargo port.
    const ji = P1('jazan'); keepOut.push([ji.x, ji.z, ji.foot]); const cJ = RG_coast('west', ji.z);
    addDisc(ji.x, G + .003, ji.z, ji.foot - .004, [.82, .80, .74], 26);
    addModel('SW_JazanIndustrial', ji.x + .006, ji.z - .01, fitFoot(ji, 1.2), {rot:-Math.PI / 2, hk:1.5});   // halls, tanks, pipe racks; its service quay faces the sea (west)
    quay([cJ + .01, ji.z + .02], [cJ - .07, ji.z + .02], .012);
    { const kP = modelK('SHR_GantryCrane', .014); for (let i = 0; i < 2; i++) addModel('SHR_GantryCrane', cJ - .02 - i * .02, ji.z + .02, 0, {k:kP, rot:Math.PI, hk:1.4, y:G - .003}); }
    ship(cJ - .05, ji.z + .055, .1, .06, [.78, .24, .22], rn);
    // Jazan: a southern coastal civic city — compact buildings, palms, a waterfront marina and small boats.
    const jz = PLv('jazanc'); keepOut.push([jz.x, jz.z, jz.r]); const cZ = RG_coast('west', jz.z);
    addModel('SW_JazanCity', Math.max(jz.x-.006,cZ+.03), jz.z+.015, .065, {rot:-Math.PI / 2, hk:1.6}); // room for Dosariyah's waterfront hill to the north-east
    marina(cZ - .002, jz.z + .02, Math.PI, 3, rn); palmGrove(jz.x + .03, jz.z - .05, .03, 8, rn);
    for (let i = 0; i < 4; i++) boat(cZ - .06 - i * .012, jz.z - .02 + i * .015, i, 1);
    // Soudah: the highest forested ridge, west of Abha — viewpoints, terraces, small hospitality buildings.
    const so = P1('soudah'); keepOut.push([so.x, so.z, so.foot]);
    addCylinder(so.x, G, so.z, so.foot - .004, .02, [.34, .54, .30], 18); addCylinder(so.x, G + .02, so.z, so.foot - .02, .02, [.38, .58, .32], 16); addCone(so.x - .008, G + .04, so.z - .006, .02, .04, [.40, .60, .34], 10);
    addModel('SW_Soudah', so.x + .004, so.z + .004, .05, {y:G + .02, hk:1.6});                // viewing platform (facing south), chalets, juniper stands on the ridge
    { const prev = target; target = detailMesh; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, r = so.foot - .012; addTree(so.x + Math.cos(a) * r, so.z + Math.sin(a) * r, .22, [.16, .44, .22]); } target = prev; }
    // Abha: a distinct highland city on a green plateau — Aseer-inspired architecture, squares and gardens.
    const ab = PLv('abha'); keepOut.push([ab.x, ab.z, ab.r]);
    addCylinder(ab.x, G, ab.z, ab.r - .002, .012, [.50, .66, .38], 22);
    // Shada Palace occupies the city centre; Aseer neighbourhoods are added outside its courtyard.
    { const kA = modelK('SW_AseerHouse', .007); for (const [dx, dz] of [[-.07, .02], [-.066, .035], [.07, -.03], [.062, .05]]) if (openAt(ab.x + dx, ab.z + dz, .004)) addModel('SW_AseerHouse', ab.x + dx, ab.z + dz, 0, {k:kA, hk:1.6, rot:dx * 20}); }   // outlying Aseer houses
    // Najran: an independent inland oasis city — wadi greenery, palms, earth-toned architecture.
    const nj = PLv('najran'); keepOut.push([nj.x, nj.z, nj.r]);
    const wadi = [[-.80, 3.30], [-.66, 3.40], [-.52, 3.44], [-.40, 3.46], [-.30, 3.47]]; polyStrip(wadi, .012, G + .004, [.50, .70, .40]); polyStrip(wadi, .004, G + .005, [.30, .60, .80]);
    addModel('SW_Najran_Buildings', nj.x - .014, nj.z + .01, .056, {hk:1.8});                 // earth-toned mud tower houses
    // Al-Aan Palace's mud-tower kit sits west of the city centre below.
    // Wadi vegetation along the channel: mature palms, young palm clusters and dryland shrubs (separate reusable models).
    { const prev = target; target = detailMesh; const veg = [['SW_Palm_Mature', .008], ['SW_Palm_Cluster', .009], ['SW_Shrub_Cluster', .007]];
      scatterIn(-.55, 3.45, .08, 30, rn, (x, z, n) => { const [nm, s] = veg[n % 3]; addModel(nm, x, z, s * (.8 + rn() * .4), {hk:1.4, rot:rn() * 6.283}); }, (x, z) => LY.polyDist(x, z, wadi) < .03 && openAt(x, z, .01)); target = prev; }
    // Khamis Mushait and Abha airport (mission sites) as small, quiet settlements; Rijal Almaa on the western slope.
    const km = LY.MISSION_SITES['south:khamis']; fabric(km[0], km[1], .03, 10, rn, [[.90,.84,.74],[.86,.78,.66]]);
    const aa = LY.MISSION_SITES['south:abhair']; addStrip([aa[0] - .03, aa[1]], [aa[0] + .03, aa[1]], .005, G + .005, [.32, .33, .35]);
    // Rijal Almaa's stone towers and white quartz bands are supplied by the scenic kit.
    palmGrove(-1.62, 2.86, .05, 10, rn); palmGrove(-1.30, 3.36, .05, 12, rn);
    window.VisionScenicBuild?.({G,box:addBox,cylinder:addCylinder,cone:addCone,blob:addBlob,quad:addQuad,LY},'south');
  }
  // ----------------------------------------------------------------- shared
  const P1 = id => P(id);
  const RG_coast = (side, z) => side === 'east' ? window.VisionRegions.coastE(z) : window.VisionRegions.coastW(z);
  function buildRegions(){ buildPlanNetworks(); buildEast(); buildWest(); buildNorthwest(); buildSouth(); }

  function buildLandmarks(){
    // V14: Riyadh draws its decoration from its own stream; the shared stream then advances exactly as the V13 Riyadh
    // build advanced it (301 draws), so every scene built after it (regions, cities) is unchanged.
    withRng(2031, buildRiyadh); for (let i=0;i<301;i++) rng();   // the stylized north-up Riyadh planning map (layout.js)

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
  function buildMarkerRings(){ for (const p of D.projects) { const c=mix(shade(p.color,.9),[.96,.92,.84],.4); if (p.ribbon) ribbonEdges(p, 0, G+.008, c); else addRing(p.x,G+.008,p.z,p.foot,c,40); } }   // V11: softened footprint outlines

  // V13: decorative dune fields (dunes.js), built last so they can keep clear of everything already placed. Each field
  // keeps one prevailing wind (gently curving across it): broad groups and long ridges in the Rub' al Khali (east and
  // south-east), low, sparse dunes along Ad Dahna (central, outside the Riyadh plan), small spaced dunes in An Nafud (north).
  function buildDunes(){
    const DN = window.VisionDunes; if (!DN) return;
    // Ground colour exactly as the terrain grid draws it (same lattice and diagonal), so each dune's foot matches it.
    const xs=saudi.map(p=>p[0]), zs=saudi.map(p=>p[1]), minX=Math.min(...xs), minZ=Math.min(...zs), step=.09, cc=new Map();
    const lc=(i,j)=>{const k=i+','+j; if(!cc.has(k)) cc.set(k, landColor(minX+i*step, minZ+j*step)); return cc.get(k);};
    const ground=(x,z)=>{ const fi=(x-minX)/step, fj=(z-minZ)/step, i=Math.floor(fi), j=Math.floor(fj), fx=fi-i, fz=fj-j, c0=lc(i,j), c1=lc(i+1,j), c2=lc(i+1,j+1), c3=lc(i,j+1);
      return fx>=fz ? [0,1,2].map(k=>c0[k]+fx*(c1[k]-c0[k])+fz*(c2[k]-c1[k])) : [0,1,2].map(k=>c0[k]+fz*(c3[k]-c0[k])+fx*(c2[k]-c3[k])); };
    // Everything dunes keep clear of: props, rock formations, farms, lava, groves, mission and challenge sites.
    // (small ones in a spatial hash scanned 3×3; the few large ones — groves, lava, sites — in a short list)
    const HC=.25, hash=new Map(), big=[], keep=(x,z,r)=>{ if(r>HC){ big.push([x,z,r]); return; } const k=Math.floor(x/HC)+','+Math.floor(z/HC); if(!hash.has(k)) hash.set(k,[]); hash.get(k).push([x,z,r]); };
    for (const geo3 of [mesh, detailMesh]) for (const arr of Object.values(geo3.inst||{})) for (let i=0;i<arr.length;i+=9) keep(arr[i], arr[i+2], .035);
    for (const [x,z,r] of sceneryKeep) keep(x,z,r);
    const sites=v=>Array.isArray(v)&&typeof v[0]==='number'?[v]:v&&typeof v==='object'?Object.values(v).flatMap(sites):[];
    for (const [x,z] of sites(LY.MISSION_SITES).concat(sites(LY.CHALLENGE_SITES))) keep(x,z,.12);
    const kept=(x,z)=>{ for (const [kx,kz,r] of big) if (Math.hypot(x-kx,z-kz)<r) return true;
      const i0=Math.floor(x/HC), j0=Math.floor(z/HC); for (let i=i0-1;i<=i0+1;i++) for (let j=j0-1;j<=j0+1;j++) { const b=hash.get(i+','+j); if (b) for (const [kx,kz,r] of b) if (Math.hypot(x-kx,z-kz)<r) return true; } return false; };
    const pad=.1, open=(x,z)=>inSaudi(x,z)&&inSaudi(x+pad,z)&&inSaudi(x-pad,z)&&inSaudi(x,z+pad)&&inSaudi(x,z-pad)&&!nearCity(x,z)&&!kept(x,z)
      &&LY.rails.every(r=>LY.polyDist(x,z,r)>=.07)&&LY.decorAllowed(x,z,.04,.07);
    // The planner asks this hundreds of thousands of times, so it is memoised on a fine lattice (filled lazily, so the
    // result never depends on the order of the questions): a point is clear when all four lattice corners round it are.
    const QC=.0125, QX=minX-1, QZ=minZ-1, QW=Math.ceil((Math.max(...xs)-minX+2)/QC)+2, QH=Math.ceil((Math.max(...zs)-minZ+2)/QC)+2, qm=new Int8Array(QW*QH);
    const corner=(i,j)=>{ if(i<0||j<0||i>=QW||j>=QH) return false; const k=j*QW+i; if(!qm[k]) qm[k]=open(QX+i*QC,QZ+j*QC)?1:2; return qm[k]===1; };
    const clear=(x,z)=>{ const i=Math.floor((x-QX)/QC), j=Math.floor((z-QZ)/QC); return corner(i,j)&&corner(i+1,j)&&corner(i,j+1)&&corner(i+1,j+1); };
    const box=(lon0,lon1,lat0,lat1)=>R=>geo(lon0+R()*(lon1-lon0),lat0+R()*(lat1-lat0));
    const dahna=[[44.8,28.0],[46.0,26.5],[47.2,24.7],[47.8,22.8],[48.4,21.0]];
    const belt=R=>{const k=Math.floor(R()*(dahna.length-1)),t=R();return geo(dahna[k][0]+(dahna[k+1][0]-dahna[k][0])*t+(R()-.5)*.45,dahna[k][1]+(dahna[k+1][1]-dahna[k][1])*t+(R()-.5)*.3);};
    const FIELDS=[
      {seed:13031, groups:44, gap:.045, sample:box(47.5,55.0,18.8,22.2), wind:(x,z)=>-.85+.2*Math.sin(x*.9+z*.7), kinds:[['ridge',.6],['crescent',.25],['roll',.15]], H:[.028,.046], len:[.17,.3], train:3.6, chain:2, core:.62},   // Rub' al Khali
      {seed:13032, groups:22, gap:.08, sample:belt, wind:(x,z)=>-2.0+.12*Math.sin(z*1.3), kinds:[['crescent',.45],['roll',.3],['ridge',.25]], H:[.012,.02], len:[.07,.12], train:2},                   // Ad Dahna
      {seed:13033, groups:30, gap:.07, sample:box(39.8,43.2,27.6,29.3), wind:(x,z)=>-1.0+.15*Math.sin(x*1.1-z*.8), kinds:[['crescent',.5],['ridge',.3],['roll',.2]], H:[.015,.025], len:[.07,.12], train:2.2} // An Nafud
    ];
    const groups=[];
    const emit=(a,b,c,ca,cb,cc2,na,nb,nc)=>addTriN(a,b,c,ca,cb,cc2,na,nb,nc), prev=target, y=G+.002;   // y: the terrain grid's surface
    for (const f of FIELDS) { const gs=DN.plan(Object.assign({test:clear}, f)); groups.push(...gs);
      target=duneHi; DN.build(gs, {cell:.0065, y, sink:.0015, ground}, emit);   // one continuous surface per field
      target=duneLo; DN.build(gs, {cell:.018, y, sink:.0015, ground}, emit);    // Reduced: same shape, coarser lattice
    }
    target=prev;
    window.__visionDunes = groups.map(g => ({x:g.x, z:g.z, r:g.r, n:g.elems.length, kinds:g.elems.map(e => e.kind)}));   // read-only, for tests
    window.__visionDuneSand = () => { const p=duneHi.p, out=[]; for (let i=0;i<p.length;i+=3) if (p[i+1]>y+.0005) out.push([p[i],p[i+2],p[i+1]-y]); return out; };   // raised sand (x, z, height), for tests
  }

  // V15: Riyadh site kits (riyadh.js) get the renderer's own geometry helpers; without that file the V14 builders run.
  const KIT = {G, LY, D, P, C, addBox, addCylinder, addCone, addBlob, addDome, addDisc, addStrip, polyStrip, polyLine, addRod, addTri, addTriN, addQuad, loft, capFan, ellRing,
    addTree, addPalm, addGhaf, addModel, modelK, mix, shade, sig, inst, mulberry32, najdi, reliefPanel, glassTower, addLine,
    target:() => target, into:(w, fn) => { const prev = target; target = w === 'detail' ? detailMesh : w === 'mesh' ? mesh : w; try { fn(); } finally { target = prev; } }};
  const RX = window.VisionRiyadh ? window.VisionRiyadh.init(KIT) : null;
  buildTerrain(); buildNetworks(); buildLandmarks(); buildCities(); buildMarkerRings(); buildDunes();

  // Clouds framing the diorama (drawn lit, but they cast no shadows)
  target = cloudGeo;
  { const prev = target; target = detailMesh; for (const [x,z,k] of [[-1.47,2.70,.09],[-1.02,2.83,.08],[-1.34,3.24,.07]]) addCloud(x,G+.2,z,k); target = prev; }   // light mist on the Aseer hills (clear of Abha and Soudah); V22: detail layer, so the Kingdom map's taller Aseer doesn't cut through it
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
  const vehGeo = Geo(1);


  /* ---------------------- per-project stage mesh -------------------- */
  const projectState = {}; for (const p of D.projects) projectState[p.id] = {stage:p.stage, done:p.stage===2?3:1, doneKeys:p.stage===2?['design','site','materials']:['design'], progress:0};
  const tierCount = st => Math.max(0, Math.min(6, st.done ?? (st.stage||1)));
  // Marker stalks: short on the Riyadh plan so they never stand in front of the landmark they label.
  const lowStalk = id => !!(id && LY.projects[id] && LY.projects[id].illustrative);
  const stalkH = (k, id) => lowStalk(id) ? .016 + k*.003 : .05 + k*.008;   // V11: shorter stalks, so markers sit below the skyline
  const TIER = .008;                                                              // V11: thinner progress tiers
  const beaconTop = (st, id) => { const k=tierCount(st); return G + k*TIER + stalkH(k, id); };
  const stageMesh = Geo(1), stageLines = {p:[], c:[]};
  let stageDirty = true;
  function buildStageMesh(){
    stageMesh.p.length=stageMesh.c.length=stageMesh.n.length=stageLines.p.length=stageLines.c.length=0; stageMesh.inst={};
    target=stageMesh; lineTarget=stageLines;
    for (const p of D.projects) {
      const st=projectState[p.id], k=tierCount(st), d=st.doneKeys||[], [px,pz]=p.pad, f=p.foot;   // progress lives on the marker pad at the footprint's south edge
      if (d.includes('site') || st.active==='site') addDisc(px,G+.004,pz,.034,st.active==='site'?[.72,.52,.34]:[.80,.66,.48],18);   // graded site pad
      for (let i=0;i<k;i++) addCylinder(px,G+i*TIER,pz,.0125-i*.0012,TIER,shade(p.color,.8+i*.06),12);  // one tier per completed package (V14: slimmer, so buildings lead)
      addCylinder(px,G+k*TIER,pz,.0032,stalkH(k,p.id),[.97,.95,.88],6);
      if (d.includes('materials') && !d.includes('build')) for (let i=0;i<4;i++) addBox(px+.03+(i%2)*.014,G,pz-.01+Math.floor(i/2)*.014,.011,.01,.011,i%2?[.62,.64,.68]:[.86,.72,.46]);  // stockpiled materials
      if (st.active==='build' && SIG[p.id]) addCrane(p.x+f*.62,p.z-f*.5,.4,[.98,.72,.2]);                           // V14: the real frame rises in the landmark layer
      else if (st.active==='build') { const h=.04+.14*(st.progress||0); addBox(p.x+f*.45,G,p.z-f*.1,.04,h,.04,[.86,.84,.78]); addCrane(p.x+f*.6,p.z-f*.45,.4,[.98,.72,.2]);
        for (let y=.02;y<h;y+=.02) addBox(p.x+f*.45,G+y,p.z-f*.1,.046,.002,.046,[.95,.62,.2]); }                     // rising structure with scaffold bands
      if (st.active==='utility') for (let i=0;i<3;i++) { addCylinder(p.x-f*.75+i*.03,G,p.z+f*.35,.0019,.045,[.80,.78,.74],5); }  // utility connection poles (V14: while the connection is being made)
      if (k>=6) { addCylinder(px,G+k*TIER,pz,.014,.004,[1,.82,.3],16); }                                               // operational: gold cap
    }
    target=mesh; lineTarget=lines; stageDirty=true;
    buildSigMesh();
  }
  // V14: landmark architecture by real project state (packages from sim.js: design, site, materials, build, utility, test).
  //   0 before site preparation: nothing (the marker pad shows the graded site)
  //   1 site prepared: foundations — the building's own footprint as low concrete slabs
  //   2 main construction: an open concrete frame, cut at a height that follows construction progress
  //   3 built: the finished exterior (connection and testing still to come)
  //   4 operational (all six packages): finished, plus finishing details (aircraft at the gates and similar)
  // Each triangle carries its project's pick id, so selection behaves as it always has: a click on the site selects it.
  const FRAME=[.84,.82,.78];
  const sigPhase = st => { const d=st.doneKeys||[]; return (st.done??0)>=6 ? 4 : d.includes('build') ? 3 : st.active==='build' ? 2 : d.includes('site') ? 1 : 0; };
  // V15: a separate, temporary completed-state preview (?preview=complete, or VisionWorld.debug.previewComplete(true)):
  // every Riyadh landmark is drawn as operational. Visual only — project state, markers, sim and saves are untouched.
  let previewDone = new URLSearchParams(location.search).get('preview') === 'complete', previewBadge = null;
  const visPhase = id => previewDone ? 4 : projectState[id] ? sigPhase(projectState[id]) : 0;
  function showPreviewBadge(){
    if (!previewDone) { if (previewBadge) previewBadge.remove(); previewBadge = null; return; }
    if (previewBadge || !document.body) return; previewBadge = document.createElement('div'); previewBadge.className = 'vn-preview-badge';
    previewBadge.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:60;padding:4px 10px;border-radius:8px;background:rgba(20,45,70,.82);color:#fff;font:12px/1.4 sans-serif;pointer-events:none';
    previewBadge.textContent = 'Completed-state preview · visual only · game progress unchanged'; document.body.appendChild(previewBadge);
  }
  // Copies a part into a layer (instances included) and gives its vertices the project's pick id.
  function copyPart(T, ids, g, pc){ if (!g) return; const n0=T.p.length;
    for (let i=0;i<g.p.length;i++){ T.p.push(g.p[i]); T.c.push(g.c[i]); T.n.push(g.n[i]); }
    for (const [key, arr] of Object.entries(g.inst||{})) (T.inst[key]=T.inst[key]||[]).push(...arr);
    for (let i=n0;i<T.p.length;i+=3) ids.push(...pc); }
  // Construction hoarding round a building's footprint (projects without their own 'prep' part): white panels with a
  // band in the project colour, a gate on the south side, survey pegs at the corners and a pair of site cabins.
  function autoPrep(id, s){
    if (s.box === undefined) { const P=s.full.p; let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9; for (let i=0;i<P.length;i+=3) if (P[i+1]>G+.006) { x0=Math.min(x0,P[i]); x1=Math.max(x1,P[i]); z0=Math.min(z0,P[i+2]); z1=Math.max(z1,P[i+2]); }
      s.box = x1>x0 && x1-x0<.3 && z1-z0<.3 ? [x0-.006,x1+.006,z0-.006,z1+.006] : null; }
    if (!s.box) return null; const g=Geo(1), prev=target; target=g; const [x0,x1,z0,z1]=s.box, pr=D.projects.find(p=>p.id===id), band=pr?mix(pr.color,[1,1,1],.25):[.9,.6,.3];
    const run=(ax,az,bx,bz,gate)=>{ const L=Math.hypot(bx-ax,bz-az), n=Math.max(1,Math.round(L/.01)), rot=Math.atan2(bz-az,bx-ax);
      for (let i=0;i<n;i++){ const t=(i+.5)/n; if (gate && Math.abs(t-.5)<.09) continue; const x=ax+(bx-ax)*t, z=az+(bz-az)*t;
        addBox(x,G,z,L/n-.0006,.0042,.0007,[.95,.95,.93],rot); addBox(x,G+.0042,z,L/n-.0006,.0011,.0009,band,rot); } };
    run(x0,z0,x1,z0); run(x1,z0,x1,z1); run(x1,z1,x0,z1,true); run(x0,z1,x0,z0);
    for (const [x,z] of [[x0,z0],[x1,z0],[x1,z1],[x0,z1]]) addBox(x,G,z,.0014,.006,.0014,[.95,.52,.18]);
    for (let i=0;i<2;i++) { addBox(x0+.008+i*.0085,G,z1-.007,.0075,.0042,.0045,[.93,.94,.95]); addBox(x0+.008+i*.0085,G+.0042,z1-.007,.0078,.0008,.0048,[.30,.50,.72]); }
    target=prev; return g;
  }
  function buildSigMesh(){
    const T=sigMesh; T.p.length=T.c.length=T.n.length=sigIds.length=0; T.inst={};
    for (const M of [propMesh, tinyMesh, litMesh]) { M.p.length=M.c.length=M.n.length=0; M.inst={}; } propIds.length=tinyIds.length=litIds.length=0;
    for (const [id, s] of Object.entries(SIG)) {
      const st=projectState[id]; if (!st) continue; const ph=visPhase(id);
      const k=PIDX[id]||0, pc=[(k&255)/255,((k>>8)&255)/255,k?1:0];
      if (ph<=2) copyPart(T, sigIds, s.prep || (s.prep = autoPrep(id, s)), pc);   // V15: hoarding while the site is prepared and built
      if (!ph) continue;
      const n0=T.p.length;
      if (s.top == null) { let t=G; for (let i=1;i<s.full.p.length;i+=3) t=Math.max(t,s.full.p[i]); s.top=t; }
      if (ph>=3) { copyPart(T, sigIds, s.full, pc); if (ph===4) { copyPart(T, sigIds, s.fin, pc); copyPart(propMesh, propIds, s.props, pc); copyPart(tinyMesh, tinyIds, s.tiny, pc); copyPart(litMesh, litIds, s.lit, pc); } continue; }
      { const yc = ph===1 ? G+.0035 : G+.008+(s.top-G-.008)*Math.max(.04,Math.min(1,st.progress||0)), P=s.full.p, Cc=s.full.c, N=s.full.n;
        for (let t=0;t<P.length;t+=9) { const hi=(P[t+1]>yc)+(P[t+4]>yc)+(P[t+7]>yc);
          if (hi===3) { if (N[t+1]+N[t+4]+N[t+7] < 1.5) continue;                                     // above the cut only floors remain, at the working level
            for (let j=0;j<9;j+=3) { T.p.push(P[t+j],yc,P[t+j+2]); T.c.push(...shade(FRAME,ph===1?.96:1.04)); T.n.push(0,1,0); } }
          else for (let j=0;j<9;j+=3) { T.p.push(P[t+j],Math.min(P[t+j+1],yc),P[t+j+2]); const c=[Cc[t+j],Cc[t+j+1],Cc[t+j+2]]; T.c.push(...(ph===1?FRAME:mix(c,FRAME,.72))); T.n.push(N[t+j],N[t+j+1],N[t+j+2]); } } }
      for (let i=n0;i<T.p.length;i+=3) sigIds.push(...pc);
    }
  }
  buildStageMesh();

  const missionMesh = Geo(1), missionLines = {p:[], c:[]}; let missionDirty = false;
  const KIND_OFF = {metro:.014, brt:-.014, wide:0, power:.02};
  function addRibbon(a, b, prog, w, y, h, col){
    const dx=b[0]-a[0], dz=b[1]-a[1], L=Math.hypot(dx,dz); if (L<1e-4||prog<=0) return; const len=L*Math.min(1,prog), ux=dx/L, uz=dz/L;
    addBox(a[0]+ux*len/2, y, a[1]+uz*len/2, len, h, w, col, Math.atan2(dz,dx));
  }
  function buildMission(){
    missionMesh.p.length=missionMesh.c.length=missionMesh.n.length=missionLines.p.length=missionLines.c.length=0; missionMesh.inst={};
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
  const cityMesh = Geo(1), cityLines = {p:[], c:[]}; let cityDirty = false, cityDesc = null;
  const ZCOL = {R:[.55,.78,.45], C:[.45,.66,.92], I:[.92,.78,.38], T:[.86,.52,.78], M:[.48,.78,.72]};
  const RES = [[.96,.88,.72],[.93,.80,.62],[.98,.92,.80],[.90,.84,.74]], COM = [[.36,.62,.78],[.30,.55,.72],[.52,.72,.84]], IND = [[.78,.74,.68],[.70,.70,.72],[.82,.76,.62]];
  function buildCity(){
    cityMesh.p.length=cityMesh.c.length=cityMesh.n.length=cityLines.p.length=cityLines.c.length=0; cityMesh.inst={};
    target=cityMesh; lineTarget=cityLines; const rngKeep=rngNow;   // per-parcel seeds: a parcel's trees and palms look the same on every rebuild
    const d=cityDesc, CY=G+.011, rich=quality!=='low'; if (d) {   // rich: parcel dressing (kerbs, courtyards, yard planting) above the Reduced tier
      const {x0,z0,ts,n}=d, X=i=>x0+(i+.5)*ts, Z=j=>z0+(j+.5)*ts, h=ts/2;
      const quad=(i,j,y,col,s=1)=>{ const x=X(i), z=Z(j), r=h*s; addQuad([x-r,y,z-r],[x+r,y,z-r],[x+r,y,z+r],[x-r,y,z+r],col); };
      const isRoad=(i,j)=>i>=0&&j>=0&&i<n&&j<n&&d.tiles[j*n+i]&&d.tiles[j*n+i].k==='r';
      for (let j=0;j<n;j++) for (let i=0;i<n;i++) {
        const t=d.tiles[j*n+i]; if (!t) continue; const x=X(i), z=Z(j), rnd=((i*73856093)^(j*19349663))>>>0, rr=(rnd%1000)/1000; rngNow=mulberry32(rnd||1);
        if (t.k==='w') { quad(i,j,CY,[.72,.60,.44]); continue; }
        if (t.k==='x') { quad(i,j,CY+.0005,t.bridge?[.55,.52,.50]:[.56,.50,.44],.9); const hz=(i>0&&d.tiles[j*n+i-1]&&(d.tiles[j*n+i-1].k==='x'||d.tiles[j*n+i-1].rail))||(i<n-1&&d.tiles[j*n+i+1]&&(d.tiles[j*n+i+1].k==='x'||d.tiles[j*n+i+1].rail));
          if (hz) { addLine([x-h,CY+.002,z-h*.25],[x+h,CY+.002,z-h*.25],[.72,.72,.76]); addLine([x-h,CY+.002,z+h*.25],[x+h,CY+.002,z+h*.25],[.72,.72,.76]); } else { addLine([x-h*.25,CY+.002,z-h],[x-h*.25,CY+.002,z+h],[.72,.72,.76]); addLine([x+h*.25,CY+.002,z-h],[x+h*.25,CY+.002,z+h],[.72,.72,.76]); }
          continue; }
        if (t.k==='r') {
          const nb=[isRoad(i,j-1),isRoad(i+1,j),isRoad(i,j+1),isRoad(i-1,j)], cnt=nb.filter(Boolean).length;
          quad(i,j,CY+.0008,t.bridge?[.55,.52,.50]:t.art?[.30,.31,.34]:t.avenue?[.33,.34,.37]:[.38,.39,.42]);
          if (t.bridge) { addBox(x,G,z,ts*.9,.004,ts*.12,[.72,.70,.66]); }
          else if (!t.art && rich) { // pale kerbs and pavement on the sides that face a parcel (not another road)
            const side=[[0,-1],[1,0],[0,1],[-1,0]], pv=[.84,.80,.72];
            for (let k=0;k<4;k++) if (!nb[k]) { const [di,dj]=side[k], cx=x+di*h*.86, cz=z+dj*h*.86, w=di?ts*.14:ts, dd=dj?ts*.14:ts; addBox(cx,CY,cz,w,.0009,dd,pv); } }
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
          if (t.st===1) { addBox(x,G,z,ts*.56,.0015,ts*.56,[.74,.62,.46]);   // serviced plot: levelled pad, site hoarding in the zone colour, survey pegs
            const hc=mix(zc,[.98,.96,.9],.25); for (const [a,b,w,dd] of [[0,-.36,.74,.03],[0,.36,.74,.03],[-.36,0,.03,.74],[.36,0,.03,.74]]) if (!(b>0&&rr<.5)) addBox(x+a*ts,G,z+b*ts,w*ts,ts*.12,dd*ts,hc);
            for (const [a,b] of [[-.22,-.22],[.22,.22]]) addCylinder(x+a*ts,G,z+b*ts,.0012,ts*.2,[.95,.45,.2],4); continue; }
          if (t.st===2) { const hh=ts*(.4+.5*(t.lv||1)); addBox(x,G,z,ts*.62,hh*.7,ts*.62,[.86,.84,.78]); for(let y=.006;y<hh*.7;y+=.008) addBox(x,G+y,z,ts*.66,.0012,ts*.66,[.95,.62,.2]); if (rr<.5) addCrane(x-h*.6,z-h*.6,.12+.06*(t.lv||1),[.98,.74,.16]); continue; }
          if (t.st===4) { addBox(x,G,z,ts*.6,ts*.35,ts*.6,[.46,.40,.36]); continue; }
          const lv=t.lv||1, st=t.style||0;
          if (t.zone==='T') { if (lv===1) { addBox(x,G,z,ts*.7,ts*.5,ts*.6,[.97,.93,.86]); addBox(x+h*.35,CY+.0006,z+h*.4,ts*.3,.001,ts*.2,[.35,.75,.9]); addTree(x-h*.6,z+h*.5,.28); }
            else { addTower(x,z,ts*.6,ts*(1.4+lv*.8+rr*.5),[.96,.90,.80],[.95,.75,.4]); addBox(x+h*.45,CY+.0006,z+h*.5,ts*.35,.001,ts*.22,[.35,.75,.9]); } continue; }
          if (t.zone==='M') { const hh=ts*(.5+lv*.55); addBox(x,G,z,ts*.8,ts*.3,ts*.76,COM[st%3]); addBox(x,G+ts*.3,z,ts*.72,hh,ts*.68,RES[st%4]); for(let k=0;k<4;k++) addBox(x-ts*.3+k*ts*.2,G+ts*.3+hh,z,ts*.08,ts*.05,ts*.7,shade(RES[st%4],.88)); continue; }
          if (t.zone==='R' && lv===1 && rich) {   // villa plot: courtyard wall with a gate, yard planting, and garden trees when a park serves the home
            const wc=shade(RES[(st+1)%4],.94); for (const [a,b,w,dd] of [[0,-.42,.86,.035],[-.42,0,.035,.86],[.42,0,.035,.86]]) addBox(x+a*ts,G,z+b*ts,w*ts,ts*.13,dd*ts,wc);
            for (const a of [-.27,.27]) addBox(x+a*ts,G,z+.42*ts,.3*ts,ts*.13,.035*ts,wc);
            if (rr>.35) addPalm(x+ts*.26,z+ts*.24,.12+rr*.03); else addTree(x+ts*.26,z+ts*.26,.11);
            if (t.park) { addTree(x-ts*.27,z+ts*.27,.1); addBox(x,CY+.0007,z+ts*.3,ts*.5,.0006,ts*.14,[.50,.76,.40]); } }
          if (t.zone==='R') { if (lv===1) { addHouse(x,z-ts*.04,.24+.04*rr,RES[st%4],(rnd%4)*Math.PI/2); if (rr>.5) for(let k=0;k<3;k++) addBox(x-ts*.18+k*ts*.18,G+ts*.36,z-ts*.28,ts*.06,ts*.05,ts*.03,shade(RES[st%4],.85)); }
            else if (lv===2) { addBox(x,G,z,ts*.72,ts*(.9+rr*.3),ts*.72,RES[st%4]); addBox(x,G+ts*(.9+rr*.3),z,ts*.76,ts*.06,ts*.76,shade(RES[st%4],.9)); }
            else addTower(x,z,ts*.6,ts*(2.4+rr*1.4),RES[(st+1)%4],null); }
          else if (t.zone==='C') { if (lv===1) {   // neighbourhood shops: glazed frontage, coloured awning, sign band, rooftop plant, a shade tree on some corners
              const aw=[[.86,.42,.30],[.22,.52,.62],[.88,.66,.26]][st%3];
              addBox(x,G,z-ts*.04,ts*.78,ts*.42,ts*.62,[.95,.91,.83]); addBox(x,G+ts*.02,z+ts*.275,ts*.7,ts*.2,ts*.012,[.30,.44,.54]);
              addBox(x,G+ts*.24,z+ts*.32,ts*.78,ts*.025,ts*.12,aw); addBox(x,G+ts*.3,z+ts*.275,ts*.5,ts*.06,ts*.012,shade(aw,1.15));
              addBox(x+ts*.18,G+ts*.42,z-ts*.12,ts*.14,ts*.06,ts*.12,[.82,.82,.84]);
              if (rr>.6 && rich) addTree(x-ts*.32,z+ts*.36,.1); }
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
          else if (f==='park') { quad(i,j,CY+.0008,[.44,.72,.36],.98);
            addBox(x,CY+.0002,z,ts*.94,.0009,ts*.12,[.90,.84,.70]); addBox(x,CY+.0002,z,ts*.12,.0009,ts*.94,[.90,.84,.70]);   // crossing paths
            addCylinder(x,CY,z,ts*.1,.0014,[.42,.66,.86],10);                                                        // small fountain
            for (const [a,b] of [[-.27,-.27],[.27,.27]]) addTree(x+a*ts,z+b*ts,.13); for (const [a,b] of [[.27,-.27],[-.27,.27]]) addPalm(x+a*ts,z+b*ts,.14);
            addBox(x+ts*.3,G+ts*.16,z-ts*.06,ts*.18,ts*.015,ts*.12,[.96,.94,.88]); for (const a of [-.07,.07]) addBox(x+ts*.3+a*ts,G,z-ts*.06,ts*.01,ts*.16,ts*.01,[.6,.58,.55]); }
          else if (f==='emergency') { addBox(x,G,z,ts*.8,ts*.45,ts*.7,c([.86,.28,.24])); addBox(x,G+ts*.45,z,ts*.3,ts*.35,ts*.3,c([.95,.95,.95])); }
          else if (f==='terminal') { addBox(x,G,z,ts*.9,ts*.12,ts*.6,c([.62,.64,.66])); for(let a=0;a<3;a++) for(let b=0;b<2;b++) addBox(x-ts*.3+a*ts*.3,G+ts*.12+b*ts*.1,z,ts*.24,ts*.1,ts*.16,c([[.85,.3,.25],[.2,.5,.85],[.95,.7,.2]][(a+b)%3])); addBox(x,G,z-ts*.3,ts*.05,ts*.6,ts*.05,c([.95,.75,.2])); addBox(x,G+ts*.6,z,ts*.9,ts*.05,ts*.05,c([.95,.75,.2])); }
          else if (f==='invest') { if (t.opened) { addTower(x,z,ts*.7,ts*3.2,[.55,.78,.9],[.98,.84,.4]); addBox(x,G,z,ts*.95,ts*.3,ts*.95,[.92,.9,.86]); } else { for (const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]) addBox(x+a*h*.9,G,z+b*h*.9,ts*.04,ts*.2,ts*.04,[.4,.62,.85]); addBox(x,G+ts*.15,z-h*.9,ts*.9,ts*.02,ts*.02,[.4,.62,.85]); addCylinder(x,G,z,ts*.03,ts*.8,[.6,.62,.66],5); addBox(x,G+ts*.8,z,ts*.4,ts*.18,ts*.03,[.25,.55,.85]); } }
          else if (f==='digital') { addBox(x,G,z,ts*.5,ts*.4,ts*.5,c([.9,.92,.96])); addCylinder(x,G+ts*.4,z,ts*.03,ts*1.3,c([.75,.75,.8]),5); }
          continue;
        }
      }
      if (d.overlay) for (let j=0;j<n;j++) for (let i=0;i<n;i++) { const c=d.overlay[j*n+i]; if (c) quad(i,j,CY+.003,c,.96); }
      for (const p of d.preview||[]) quad(p.i,p.j,CY+.004,p.hint?[1,.80,.28]:p.ok?[.45,.95,.55]:[.98,.35,.3],p.hint?.7:.9);
      for (const r of d.routes||[]) for (let k=1;k<r.path.length;k++) { const a=r.path[k-1], b=r.path[k]; addLine([X(a%n),CY+.006,Z((a/n)|0)],[X(b%n),CY+.006,Z((b/n)|0)],r.color); }
      // district boundary
      const x1=x0+n*ts, z1=z0+n*ts; for (const [a,b] of [[[x0,z0],[x1,z0]],[[x1,z0],[x1,z1]],[[x1,z1],[x0,z1]],[[x0,z1],[x0,z0]]]) addLine([a[0],CY+.0001,a[1]],[b[0],CY+.0001,b[1]],[1,.85,.4]);
    }
    rngNow=rngKeep; target=mesh; lineTarget=lines; cityDirty=true;
  }

  /* ------------------------------ three.js scene -------------------- */
  // Picking colours: each triangle is tagged with the project whose footprint contains it (0 = not a project).
  function idColors(geo){ const P3=geo.p, n=P3.length/3, out=new Float32Array(n*3);
    for (let v=0; v+2<n; v+=3) { const i=v*3, cx=(P3[i]+P3[i+3]+P3[i+6])/3, cz=(P3[i+2]+P3[i+5]+P3[i+8])/3, id=LY.footprintAt(cx,cz), k=id?PIDX[id]:0;
      if (!k) continue; for (let j=0;j<3;j++){ out[(v+j)*3]=(k&255)/255; out[(v+j)*3+1]=((k>>8)&255)/255; out[(v+j)*3+2]=1; } }
    return out; }
  const idOf = (x, z) => { const id=LY.footprintAt(x,z); return id ? PIDX[id] : 0; };

  /* ---------------------------- shadow map -------------------------- */
  const SUN = norm3([-0.55, 1.0, 0.62]);
  let resScale = 1;
  const SHADOW_SIZE = 2048;   // Ultra (V20) doubles it at run time (shadowSize)
  const shadowsSupported = true;
  const ortho = (h, n, f) => new Float32Array([1/h,0,0,0, 0,1/h,0,0, 0,0,-2/(f-n),0, 0,0,-(f+n)/(f-n),1]);
  // quality drives every existing tier check (high / medium / low); fxTier is the preset the player picked, where Ultra
  // (V20) is High plus the larger shadow map, 16-tap shadows and the full bloom chain.
  let lightVP = new Float32Array(16), quality = 'high', fxTier = 'high', shadowSize = SHADOW_SIZE;

  renderer.setPixelRatio(1); renderer.autoClear = false;
  const scene3 = new THREE.Scene(), cam3 = new THREE.PerspectiveCamera(.5 * 180 / Math.PI, 1, .1, 140), clearCol = new THREE.Color();
  const cosmetics=window.VisionCosmetics?.(THREE,scene3,D,LY,G);
  const kingdomDiorama=window.VisionKingdomDiorama?.(THREE,scene3,D,LY,geo,saudi,inSaudi);
  const countryOverview=window.VisionCountryOverview?.(THREE,scene3,D,LY,geo,saudi,inSaudi,rockLo,triangulate(saudi).tris);
  const frameRenderStats={calls:0,triangles:0};
  const nearest = {minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter, generateMipmaps:false, depthBuffer:true};
  const shadowRT = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, nearest);
  // Uniforms shared by every material (the same values the original renderer set once per frame).
  const SU = {uVP:{value:new Float32Array(16)}, uLightVP:{value:lightVP}, uSun:{value:SUN}, uEye:{value:[0,0,0]}, uStorm:{value:0}, uDist:{value:1}, uTexel:{value:1/SHADOW_SIZE},
    uGround:{value:G}, uTime:{value:0}, uTint:{value:[.80,.58,.32]}, uNight:{value:0}, uShadow:{value:shadowRT.texture},
    uFx:{value:0}, uSoft:{value:0}, uHdr:{value:0}};   // V20 premium tier switches (0 on Reduced: the original shading)
  // V20: post-processing (premium.js) and the GLB model pipeline (assets.js); both are optional.
  const post = window.VisionPremium ? window.VisionPremium(THREE, renderer) : null;
  const RAW = (vs, fsrc, uniforms, o = {}) => new THREE.RawShaderMaterial(Object.assign({vertexShader:vs, fragmentShader:fsrc, uniforms, side:THREE.DoubleSide, blending:THREE.NoBlending, depthTest:true, depthWrite:true}, o));
  const depthU = {uLightVP:SU.uLightVP, uOffset:{value:[0,0,0]}};
  const DEPTH = [RAW(DEPTH_VS(0), DEPTH_FS, depthU), RAW(DEPTH_VS(1), DEPTH_FS, depthU)];
  const pickU = o => ({uVP:SU.uVP, uOcc:{value:o}});
  const PICK = {ids:[RAW(PICK_VS(0), PICK_FS, pickU(0)), RAW(PICK_VS(1), PICK_FS, pickU(0))], occ:[RAW(PICK_VS(0), PICK_FS, pickU(1)), RAW(PICK_VS(1), PICK_FS, pickU(1))]};
  const OBJS = [];   // every drawable; userData: {L (layer), mats:{main, depth, pick}, inst}
  const addObj = (o, ud) => { o.frustumCulled = false; o.userData = ud; scene3.add(o); OBJS.push(o); return o; };

  // Grow-only dynamic attributes; the draw range follows the live vertex count.
  // Explicit authored palette assignments; default stone/soil/foliage is rough.
  const surfaceKey=(r,g,b)=>Math.round(r*1000)+','+Math.round(g*1000)+','+Math.round(b*1000);
  const surfaces=new Map([
    [[.50,.64,.76],.26], [[.42,.57,.63],.30], [[.70,.82,.90],.25],
    [[.30,.38,.46],.28], [[.96,.96,.95],.44], [[.86,.87,.88],.48],
    [[.68,.70,.71],.52], [[.83,.79,.70],.88], [[.29,.48,.30],.92]
  ].map(([c,r])=>[surfaceKey(...c),r]));
  function roughnessArray(colors){const a=new Float32Array(colors.length/3);for(let i=0;i<a.length;i++)a[i]=surfaces.get(surfaceKey(colors[i*3],colors[i*3+1],colors[i*3+2]))??.84;return a;}
  function fillDyn(g, n, attrs){
    for (const name in attrs) { const [arr, size] = attrs[name]; let a = g.getAttribute(name);
      if (!a || a.count < n) { a = new THREE.BufferAttribute(new Float32Array(Math.max(n, a ? a.count * 2 : 0, 4) * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); }
      if (n) { a.array.set(arr.length > n * size ? arr.slice(0, n * size) : arr); a.clearUpdateRanges(); a.addUpdateRange(0, n * size); a.needsUpdate = true; } }
    g.setDrawRange(0, n);
  }

  // Layers in the original draw order and with the original flags: glow, shadow casting, picking role, visibility.
  const LAYERS = {
    mesh:{geo:mesh, glow:0, cast:1, pick:'ids'},
    detail:{geo:detailMesh, glow:0, cast:1, pick:'occ', when:() => detailOn()},
    rock:{geo:rockHi, glow:0, cast:1, pick:'occ', when:() => quality !== 'low'},     // V12: rock formations, full detail
    rockLo:{geo:rockLo, glow:0, cast:1, pick:'occ', when:() => quality === 'low'},   // ... and the light version on Reduced
    // V13: sand dunes. Never in the pick pass (selection and placement ignore them), and no shadow casting: their slip
    // faces are flatter than the sun is high, so they would only add shadow-map acne along the crests.
    dune:{geo:duneHi, glow:0, cast:0, pick:null, when:() => quality !== 'low'},
    duneLo:{geo:duneLo, glow:0, cast:0, pick:null, when:() => quality === 'low'},
    stage:{geo:stageMesh, glow:.05, cast:1, pick:'ids'},
    // V14: Riyadh landmark architecture by construction stage; pick ids come with the geometry (one per project).
    landmark:{geo:sigMesh, glow:0, cast:1, pick:'ids', ids:() => new Float32Array(sigIds)},
    // V15: close-view life round the landmarks (ground services, kiosks, benches, queues), High and Medium; people and
    // edge lights on High only. Both appear only as the camera approaches, and select their project like its buildings.
    landmarkProps:{geo:propMesh, glow:0, cast:1, pick:'ids', ids:() => new Float32Array(propIds), when:() => quality !== 'low' && camera.dist < PROPS_DIST},
    landmarkLit:{geo:litMesh, glow:.7, cast:0, pick:'ids', ids:() => new Float32Array(litIds)},
    landmarkTiny:{geo:tinyMesh, glow:.05, cast:0, pick:'ids', ids:() => new Float32Array(tinyIds), when:() => quality === 'high' && camera.dist < PROPS_DIST},
    veh:{geo:vehGeo, glow:.08, cast:1, pick:null},
    mission:{geo:missionMesh, glow:.04, cast:1, pick:'ids'},
    city:{geo:cityMesh, glow:.03, cast:1, pick:null},
    cloud:{geo:cloudGeo, glow:.42, cast:0, pick:null}
  };
  for (const L of Object.values(LAYERS)) {
    L.own = {uGlow:{value:L.glow}, uShadowOn:{value:0}, uOffset:{value:[0,0,0]}};
    const u = Object.assign({}, SU, L.own);
    L.main = RAW(MESH_VS(0), MESH_FS, u); L.mainI = RAW(MESH_VS(1), MESH_FS, u); L.insts = {};
    L.obj = addObj(new THREE.Mesh(new THREE.BufferGeometry(), L.main), {L, mats:{main:L.main, depth:DEPTH[0], pick:L.pick ? PICK[L.pick][0] : null}});
  }

  // ---- Instanced props: one prototype geometry per kind, built once by the original builder at the origin.
  // Colour = color + aTintK × instanceColor, so a tinted prop (tree foliage, house walls, convoy body) keeps its fixed
  // parts (trunk, door, windows) exactly as before. aTintK is recovered by building the prototype at two tints.
  const PROTOS = {};
  const PROTO_DEF = key => {
    if (RX && RX.protos[key]) return RX.protos[key];   // V15: riyadh.js props (aircraft, ground services, rides, people, furniture)
    const ship = /^ship(\d)(\d)$/.exec(key);
    if (ship) { const hull = ship[1] === '1' ? [.92,.30,.24] : [.20,.36,.62], kk = +ship[2];
      return {dy:0, build:() => { addBox(0,SEA-.004,0,.075,.016,.022,hull); addBox(0,SEA+.012,0,.07,.004,.02,[.97,.97,.95]); addBox(-.028,SEA+.016,0,.014,.022,.018,[1,1,1]);
        for(let c=0;c<3;c++){const o=-.008+c*.016; addBox(o,SEA+.016,0,.013,.012,.017,[[.95,.62,.18],[.28,.66,.42],[.86,.26,.24]][(c+kk)%3]);} }}; }
    return {
      tree:{dy:G, tint:1, build:c => treeRaw(0,0,1,c)},
      ghaf:{dy:G, build:() => ghafRaw(0,0,1)},
      palm:{dy:G, build:() => palmRaw(0,0,1,0,[.15,.15,.15,.15,.15,.15,.15,.15])},
      house:{dy:G, tint:1, build:c => houseRaw(0,0,1,c,0,false)},
      houseT:{dy:G, tint:1, build:c => houseRaw(0,0,1,c,0,true)},
      turbine:{dy:G, build:() => { const n = turbines.length; turbineRaw(0,0,1); turbines.length = n; }},
      car0:{dy:0, build:() => { addBox(0,G+.006,0,.03,.013,.013,[.98,.96,.92]); addBox(0,G+.019,0,.03,.002,.014,[.86,.68,.30]); }},
      car1:{dy:0, build:() => { addBox(0,G+.006,0,.03,.013,.013,[.30,.55,.85]); addBox(0,G+.019,0,.03,.002,.014,[.95,.95,.95]); }},
      plane:{dy:0, build:() => { addBox(0,0,0,.07,.012,.012,[.98,.98,.98]); addBox(0,.004,0,.016,.003,.085,[.90,.92,.95]); addBox(-.03,.006,0,.012,.018,.004,[.14,.52,.34]); addBox(-.03,.006,0,.01,.003,.03,[.9,.92,.95]); }},
      metroCar:{dy:0, build:() => { addBox(0,0,0,.0165,.0052,.0046,[.95,.96,.98]); addBox(0,.0024,0,.0167,.0015,.0047,[.24,.32,.46]); addBox(0,.0006,0,.0167,.0007,.0047,[.20,.45,.85]); }},   // V14
      convoy:{dy:0, tint:1, build:c => { addBox(0,G+.003,0,.034,.016,.014,c); addBox(.024,G+.003,0,.013,.018,.014,[.96,.96,.94]); }}
    }[key];
  };
  function protoBuild(fn){ const prev = target, tmp = Geo(); target = tmp; fn(); target = prev; return tmp; }
  function proto(key){
    if (PROTOS[key]) return PROTOS[key];
    const def = PROTO_DEF(key), A = protoBuild(() => def.build(def.tint ? [0,0,0] : null)), B = def.tint ? protoBuild(() => def.build([.5,.5,.5])) : null;
    const n = A.p.length / 3, pos = new Float32Array(A.p), tk = new Float32Array(n); let top = 0;
    for (let i = 0; i < n; i++) { pos[i*3+1] -= def.dy; top = Math.max(top, pos[i*3+1]); if (B) tk[i] = (B.c[i*3] - A.c[i*3]) / .5; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(A.c), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(A.n), 3)); g.setAttribute('aTintK', new THREE.BufferAttribute(tk, 1));
    g.setAttribute('aRoughness',new THREE.BufferAttribute(roughnessArray(A.c),1));
    return PROTOS[key] = {g, top, tris:n / 3};
  }
  function makeInstanced(L, key, cap, old){
    const P = proto(key), g = new THREE.BufferGeometry();
    for (const nm of ['position', 'color', 'normal', 'aTintK', 'aRoughness']) g.setAttribute(nm, P.g.getAttribute(nm));
    g.setAttribute('aPick', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
    const im = new THREE.InstancedMesh(g, L.mainI, cap); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); im.count = 0;
    if (old) { scene3.remove(old); OBJS.splice(OBJS.indexOf(old), 1); old.dispose();
      for(const nm of ['position','color','normal','aTintK','aRoughness']) old.geometry.deleteAttribute(nm);
      old.geometry.dispose(); } // Dispose owned instance buffers; retain shared prototype attributes/materials.
    addObj(im, {L, inst:true, kind:key, cap, mats:{main:L.mainI, depth:DEPTH[1], pick:L.pick ? PICK[L.pick][1] : null}});
    return L.insts[key] = im;
  }
  // Instance record: [x, y, z, yaw, scale, r, g, b, pitch]. Yaw follows addBox: local +x → (cos, sin) in x/z.
  function syncInstances(L){
    const data = L.geo.inst || {};
    for (const key of new Set([...Object.keys(L.insts), ...Object.keys(data)])) {
      const arr = data[key] || [], n = arr.length / 9; let im = L.insts[key];
      if (!im && !n) continue;
      if (!im || im.userData.cap < n) im = makeInstanced(L, key, Math.max(16, n * 2), im);
      const M = im.instanceMatrix.array, Cc = im.instanceColor.array, Pk = im.geometry.getAttribute('aPick').array;
      for (let i = 0; i < n; i++) { const o = i * 9, x = arr[o], y = arr[o+1], z = arr[o+2], k = arr[o+4], cs = Math.cos(arr[o+3]) * k, sn = Math.sin(arr[o+3]) * k, m = i * 16;
        const cp=Math.cos(arr[o+8]), sp=Math.sin(arr[o+8]); M[m]=cs*cp; M[m+1]=k*sp; M[m+2]=sn*cp; M[m+3]=0; M[m+4]=-cs*sp; M[m+5]=k*cp; M[m+6]=-sn*sp; M[m+7]=0; M[m+8]=-sn; M[m+9]=0; M[m+10]=cs; M[m+11]=0; M[m+12]=x; M[m+13]=y; M[m+14]=z; M[m+15]=1;
        Cc[i*3] = arr[o+5]; Cc[i*3+1] = arr[o+6]; Cc[i*3+2] = arr[o+7];
        if (L.pick === 'ids') { const id = idOf(x, z); Pk[i*3] = (id & 255) / 255; Pk[i*3+1] = ((id >> 8) & 255) / 255; Pk[i*3+2] = id ? 1 : 0; } }
      im.count = n; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.geometry.getAttribute('aPick').needsUpdate = true;
    }
  }
  function syncLayer(name){
    const L = LAYERS[name], geo = L.geo, n = geo.p.length / 3, at = {position:[geo.p, 3], color:[geo.c, 3], normal:[geo.n, 3]};
    at.aRoughness=[roughnessArray(geo.c),1];
    if (L.pick === 'ids') at.aPick = [L.ids ? L.ids() : idColors(geo), 3];
    fillDyn(L.obj.geometry, n, at); syncInstances(L);
  }

  // Sea, line layers and dynamic points (main pass only).
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(WATER.pos, 3)); g.setAttribute('aShore', new THREE.BufferAttribute(WATER.shore, 1)); g.setIndex(new THREE.BufferAttribute(WATER.idx, 1));
    const w = addObj(new THREE.Mesh(g, RAW(WATER_VS, WATER_FS, Object.assign({}, SU))), {}); w.userData.mats = {main:w.material}; w.renderOrder = -1; }
  const LINE_MAT = RAW(LINE_VS, LINE_FS, {uVP:SU.uVP}, {transparent:true, blending:THREE.NormalBlending});
  const lineObj = (order) => { const o = addObj(new THREE.LineSegments(new THREE.BufferGeometry(), LINE_MAT), {}); o.userData.mats = {main:LINE_MAT}; o.renderOrder = order; return o; };
  const linesObj = lineObj(10), stageLinesObj = lineObj(11), cityLinesObj = lineObj(12), missionLinesObj = lineObj(13), dynLinesObj = lineObj(14);
  const POINT_MAT = RAW(POINT_VS, POINT_FS, {uVP:SU.uVP, uScale:{value:1}, uBoost:{value:1}}, {transparent:true, blending:THREE.NormalBlending, depthWrite:false});
  const pointsObj = addObj(new THREE.Points(new THREE.BufferGeometry(), POINT_MAT), {}); pointsObj.userData.mats = {main:POINT_MAT}; pointsObj.renderOrder = 20;
  const syncLines = (o, L) => fillDyn(o.geometry, L.p.length / 3, {position:[L.p, 3], color:[L.c, 3]});

  // Static layers: uploaded once.
  syncLayer('mesh'); syncLayer('detail'); syncLayer('rock'); syncLayer('rockLo'); syncLayer('dune'); syncLayer('duneLo'); syncLayer('cloud'); syncLines(linesObj, lines);

  // Static geometry is also uploaded in local cells for close-view culling. Keep
  // original batches for the national overview and the complete sun-shadow pass.
  // Triangles are copied intact (including normals, colours and picking IDs).
  const spatialEnabled = new URLSearchParams(location.search).get('culling') === 'on';
  const CELL_SIZE = .30, SPATIAL_DIST = 1.8;
  const spatialRoot=new THREE.Group();scene3.add(spatialRoot);
  let spatialBuilt=false;
  const cellOf = (x,z) => Math.floor(x/CELL_SIZE)+','+Math.floor(z/CELL_SIZE);
  function makeSpatialLayer(L){
    const src=L.obj.geometry, count=L.geo.p.length/3, cells=new Map();
    const position=src.getAttribute('position').array;
    for(let v=0;v<count;v+=3){const j=v*3,key=cellOf((position[j]+position[j+3]+position[j+6])/3,(position[j+2]+position[j+5]+position[j+8])/3);
      if(!cells.has(key))cells.set(key,[]);cells.get(key).push(v,v+1,v+2);}
    for(const indices of cells.values()){
      const g=new THREE.BufferGeometry();
      for(const [name,attribute] of Object.entries(src.attributes)){
        const size=attribute.itemSize, values=new Float32Array(indices.length*size);
        for(let i=0;i<indices.length;i++)for(let c=0;c<size;c++)values[i*size+c]=attribute.array[indices[i]*size+c];
        g.setAttribute(name,new THREE.BufferAttribute(values,size));
      }
      g.computeBoundingSphere();
      spatialRoot.add(addObj(new THREE.Mesh(g,L.main),{L,spatial:true,mats:L.obj.userData.mats}));
    }
    for(const [key,original] of Object.entries(L.insts)){
      const records=L.geo.inst[key], groups=new Map();
      for(let i=0;i<original.count;i++){const o=i*9,cell=cellOf(records[o],records[o+2]);if(!groups.has(cell))groups.set(cell,[]);groups.get(cell).push(i);}
      for(const indices of groups.values()){
        const g=new THREE.BufferGeometry(),n=indices.length;
        for(const name of ['position','color','normal','aTintK','aRoughness'])g.setAttribute(name,original.geometry.getAttribute(name));
        const pick=new Float32Array(n*3),color=new Float32Array(n*3),im=new THREE.InstancedMesh(g,L.mainI,n);
        const sourcePick=original.geometry.getAttribute('aPick').array;
        for(let i=0;i<n;i++){
          const j=indices[i];im.instanceMatrix.array.set(original.instanceMatrix.array.subarray(j*16,j*16+16),i*16);
          color.set(original.instanceColor.array.subarray(j*3,j*3+3),i*3);pick.set(sourcePick.subarray(j*3,j*3+3),i*3);
        }
        g.setAttribute('aPick',new THREE.InstancedBufferAttribute(pick,3));
        im.instanceColor=new THREE.InstancedBufferAttribute(color,3);im.instanceMatrix.needsUpdate=true;
        im.computeBoundingSphere();
        spatialRoot.add(addObj(im,{L,spatial:true,inst:true,mats:original.userData.mats}));
      }
    }
    L.spatialReady=true;
  }
  function ensureSpatial(){if(!spatialEnabled||spatialBuilt)return;for(const name of ['mesh','detail','rock','rockLo','dune','duneLo'])makeSpatialLayer(LAYERS[name]);spatialBuilt=true;}
  // Top of each project's model (for label placement): the highest vertex (or instance) inside its footprint.
  const topY = Object.fromEntries(D.projects.map(p => [p.id, G+.1]).concat([[CORE_ID, G+.1]], PLACE_IDS.map(id => [id, G+.06])));
  for (let i=0;i<mesh.p.length;i+=3) { const id=LY.footprintAt(mesh.p[i],mesh.p[i+2]); if (id && mesh.p[i+1]>topY[id]) topY[id]=mesh.p[i+1]; }
  for (const [id, sg] of Object.entries(SIG)) for (let i=1;i<sg.full.p.length;i+=3) if (sg.full.p[i]>topY[id]) topY[id]=sg.full.p[i];   // V14: labels sit above the finished building
  for (const [key, arr] of Object.entries(mesh.inst)) { const P = proto(key); for (let i = 0; i < arr.length; i += 9) { const id = LY.footprintAt(arr[i], arr[i+2]), y = arr[i+1] + P.top * arr[i+4]; if (id && y > topY[id]) topY[id] = y; } }
  const instTris = geo => Object.entries(geo.inst || {}).reduce((t, [k, a]) => t + proto(k).tris * a.length / 9, 0);
  window.__visionStats = {triangles:(mesh.p.length + detailMesh.p.length + rockHi.p.length + duneHi.p.length + cloudGeo.p.length) / 9 + instTris(mesh) + instTris(detailMesh), detailTriangles:detailMesh.p.length / 9 + instTris(detailMesh),
    rockTriangles:rockHi.p.length / 9, rockTrianglesReduced:rockLo.p.length / 9, duneTriangles:duneHi.p.length / 9, duneTrianglesReduced:duneLo.p.length / 9, landmarkTriangles:() => sigMesh.p.length / 9, landmarkTrianglesFull:Object.values(SIG).reduce((n, s2) => n + (s2.full.p.length + s2.fin.p.length) / 9, 0),
    landmarkProps:() => ({props:propMesh.p.length / 9 + instTris(propMesh), tiny:tinyMesh.p.length / 9 + instTris(tinyMesh), landmarkInst:instTris(sigMesh)}), missingModels:[...missingModels],
    water:WATER.idx.length / 3, lines:lines.p.length / 6, instances:Object.values(mesh.inst).concat(Object.values(detailMesh.inst)).reduce((n, a) => n + a.length / 9, 0), renderer:'three'};
  // Each pass picks every object's material and visibility, mirroring what the original renderer drew in that pass.
  function renderPass(pass){
    assets?.pass(pass);
    cosmetics?.pass(pass);
    kingdomDiorama?.pass(pass);
    countryOverview?.pass(pass);
    spatialRoot.visible=pass!=='depth' && spatialBuilt && camera.dist<SPATIAL_DIST;
    for (const o of OBJS) { const u = o.userData, L = u.L; let v = !L || !L.when || L.when();
      if(L && L.spatialReady){const useCells=pass!=='depth' && camera.dist<SPATIAL_DIST;v=v && !!u.spatial===useCells;}
      o.frustumCulled=!!u.spatial && pass!=='depth';
      if (pass === 'depth') v = v && !!(L && L.cast); else if (pass === 'pick') v = v && !!(L && L.pick);
      if (u.inst) v = v && o.count > 0; if(countryOverview&&camera.dist>6&&(u.kind==='tree'||u.kind==='ghaf'))v=false;   /* V21: the overview's palms and oases replace them */
      if(countryOverview&&camera.dist>6&&[LAYERS.rock,LAYERS.rockLo,LAYERS.dune,LAYERS.duneLo,LAYERS.cloud].includes(u.L))v=false;
      o.visible = v; if (v) o.material = u.mats[pass]; }
  }

  /* ------------------------------ camera ---------------------------- */
  const K = D.regions.kingdom;
  const FOV = .5, EYE = Math.tan(.36)/Math.tan(FOV/2); // narrower lens = closer to an isometric miniature look
  const camera = {az:K.az-.35, el:1.42, dist:K.dist*regionFit(K)*1.5, target:[K.x,0,K.z], desired:{az:K.az, el:K.el, dist:K.dist*regionFit(K), target:[K.x,0,K.z]}};
  let countryAutoFrame=true,viewAspect=innerWidth/innerHeight;
  let width=0, height=0, dpr=1, vp, eye=[0,0,0], storm=0, stormTarget=0, directMode=false, selectedId=null, hoverId=null, onSelect=()=>{};
  let onPlace=()=>{}, onRegion=()=>{}, hazard=null, entities=[], overlay=[], convoyList=[], groundHandler=null, tint=[.80,.58,.32], follow=null;
  const TINTS={dust:[.80,.58,.32], rain:[.50,.58,.68], heat:[1.0,.74,.50]};
  const dynLines={p:[],c:[]}; let dynLineBuf=null;
  let night=0, nightTarget=0, camSpeed=1, beaconsOn=true, bursts=[], missionScene=null, missionLights=[], captureTime=null;
  const bounds={minX:-7,maxX:8,minZ:-6,maxZ:7};

  function resize(){const aspect=innerWidth/innerHeight;if(countryAutoFrame&&Math.abs(aspect-viewAspect)>.01){camera.desired.dist=K.dist*regionFit(K);camera.desired.target[2]=regionZ(K);}viewAspect=aspect;dpr=Math.min(devicePixelRatio||1,quality==='low'?1:2)*resScale;const w=Math.floor(innerWidth*dpr),h=Math.floor(innerHeight*dpr);if(canvas.width!==w||canvas.height!==h)renderer.setSize(w,h,false);width=w;height=h;}
  function updateCamera(dt){
    const k=1-Math.pow(.001,dt/1000*0.9*camSpeed);
    camera.az+=(camera.desired.az-camera.az)*k; camera.el+=(camera.desired.el-camera.el)*k; camera.dist+=(camera.desired.dist-camera.dist)*k;
    for (let i=0;i<3;i++) camera.target[i]+=(camera.desired.target[i]-camera.target[i])*k;
    // V20 cinematic move: a long region-to-region flight rises in a gentle arc (off on Reduced and with reduced motion).
    // Only the drawn eye lifts; camera.dist and every saved or tested camera value are unchanged.
    let lift=0; if (arc.d0) { const sep=Math.hypot(camera.desired.target[0]-camera.target[0], camera.desired.target[2]-camera.target[2]);
      if (sep<.004) arc.d0=0; else if (quality!=='low' && !reducedMotion) lift=Math.sin(Math.PI*Math.min(1,Math.max(0,1-sep/arc.d0)))*Math.min(.22,arc.d0*.035); }
    const ce=Math.cos(camera.el), ed=camera.dist*EYE*(1+lift);
    eye=[camera.target[0]+Math.sin(camera.az)*ce*ed, camera.target[1]+Math.sin(camera.el)*ed, camera.target[2]+Math.cos(camera.az)*ce*ed];
    vp=M4.multiply(M4.perspective(FOV,width/height,.1,140),M4.lookAt(eye,camera.target)); SU.uVP.value=vp; SU.uEye.value=eye;
    cam3.aspect=width/height; cam3.position.set(eye[0],eye[1],eye[2]); cam3.lookAt(camera.target[0],camera.target[1],camera.target[2]); cam3.updateProjectionMatrix(); cam3.updateMatrixWorld();
  }
  function setDesired(az,el,dist,x,z,y=0){const d=Math.hypot(x-camera.target[0],z-camera.target[2]); arc.d0=d>.6?d:0; camera.desired={az,el,dist,target:[x,y,z]};}
  let softOverride=null;   // debug.softShadows (perf checks)
  const arc={d0:0}, reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // V20: walking-surface heights for GLB characters. For each query point, the highest upward-facing triangle of the
  // world and landmark geometry below cap (plazas, paths, lawns; roofs and canopies sit higher). One pass over the
  // triangles for the whole batch, with the queries bucketed on a grid. Falls back to the ground plane.
  const floorCache=new Map();
  function floorAt(pts, cap=G+.0105){
    const CELL=.01, key=(i,j)=>i*100003+j, grid=new Map(), out=pts.map(()=>G);
    pts.forEach(([x,z],k)=>{ const g=key(Math.floor(x/CELL),Math.floor(z/CELL)); (grid.get(g)||grid.set(g,[]).get(g)).push(k); });
    // Candidate triangles (upward, below the cap) are filtered once per geometry state and cached: later queries scan
    // only those (a few percent of the world).
    const cands=geo=>{ const c=floorCache.get(geo); if (c && c.n===geo.p.length && c.cap===cap) return c.t;
      const P=geo.p, N=geo.n, t=[]; for (let i=0;i<P.length;i+=9) if (N[i+1]>=.9 && Math.max(P[i+1],P[i+4],P[i+7])<=cap) t.push(i);
      floorCache.set(geo,{n:P.length,cap,t}); return t; };
    const scan=geo=>{ const P=geo.p;
      for (const t of cands(geo)) { const y0=P[t+1], y1=P[t+4], y2=P[t+7];
        const ax=P[t],az=P[t+2],bx=P[t+3],bz=P[t+5],cx=P[t+6],cz=P[t+8];
        const i0=Math.floor(Math.min(ax,bx,cx)/CELL), i1=Math.floor(Math.max(ax,bx,cx)/CELL), j0=Math.floor(Math.min(az,bz,cz)/CELL), j1=Math.floor(Math.max(az,bz,cz)/CELL);
        if ((i1-i0+1)*(j1-j0+1)>400) continue;   // huge ground tiles: the plane fallback covers them
        for (let i=i0;i<=i1;i++) for (let j=j0;j<=j1;j++) { const ks=grid.get(key(i,j)); if (!ks) continue;
          const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz); if (Math.abs(d)<1e-14) continue;
          for (const k of ks) { const [x,z]=pts[k], l1=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d, l2=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d, l3=1-l1-l2;
            if (l1<-1e-6||l2<-1e-6||l3<-1e-6) continue; const y=l1*y0+l2*y1+l3*y2; if (y>out[k]) out[k]=y; } } } };
    scan(mesh); scan(sigMesh); for (const sg of Object.values(SIG)) { if (sg.full) scan(sg.full); }
    return out;
  }
  const assets = window.VisionAssets ? window.VisionAssets(THREE, scene3, {SU, G, D, LY, SUN, camera, renderer, floorAt:(pts, cap) => floorAt(pts, cap), quality:() => quality, depthFS:DEPTH_FS}) : null;

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
  // V14: Riyadh Metro trains — two three-car trains, one per track, running end to end in opposite directions (each
  // re-enters at its terminus), once the line is built. Decorative only: not connected to the simulation.
  const metroPaths=[.0022,-.0022].map(o=>{ const M=LY.METRO_ROUTE; return M.map((q,i)=>{ const a=M[Math.max(0,i-1)], b=M[Math.min(M.length-1,i+1)], L=Math.hypot(b[0]-a[0],b[1]-a[1]); return [q[0]-(b[1]-a[1])/L*o, q[1]+(b[0]-a[0])/L*o]; }); }), metroL=metroPaths.map(pathLen);
  const heading=(path,L,q,dir)=>{const a=along(path,L,Math.min(.9999,Math.max(0,q))),b=along(path,L,Math.min(.9999,Math.max(0,q+(dir?.002:-.002))));return [a[0],a[1],Math.atan2(b[1]-a[1],b[0]-a[0])];};
  const flights=[['Riyadh','Jeddah'],['Riyadh','Dammam'],['Jeddah','Tabuk'],['Riyadh','Abha'],['Madinah','Riyadh']].map(([a,b])=>[C(a),C(b)]);
  function buildVehicles(t){
    vehGeo.p.length=vehGeo.c.length=vehGeo.n.length=0; vehGeo.inst={}; wakes.length=0; target=vehGeo;
    shipLanes.forEach((path,r)=>{const L=shipL[r];for(let k=0;k<4;k++){
      const dir=k%2, q=((t*.000012)/L[L.length-1]*6+k/4+r*.13)%1, [x,z,rot]=heading(path,L,dir?q:1-q,dir), cs=Math.cos(rot), sn=Math.sin(rot);
      inst('ship'+((k+r)%3===0?1:0)+(k%3), x, 0, z, rot, 1);
      for(let w=1;w<5;w++) wakes.push([x-cs*(.03+w*.018),z-sn*(.03+w*.018),5-w*.8]);
    }});
    railPaths.forEach((path,r)=>{const L=railL[r];for(let k=0;k<2;k++){const q0=((t*.00005)/L[L.length-1]*4+k*.5+r*.17)%1;
      for(let c=0;c<4;c++){const q=Math.max(.001,q0-c*.0065*(3/L[L.length-1])),[x,z,rot]=heading(path,L,q,true); inst(r===0?'car0':'car1', x, 0, z, rot, 1);}}});
    if (camera.dist < DETAIL_DIST && projectState.metro && visPhase('metro') >= 3) metroPaths.forEach((path,r)=>{ const L=metroL[r], Lt=L[L.length-1], q0=(t/36000+r*.5)%1;
      for (let c=0;c<3;c++){ const q=q0-c*.0175/Lt; if (q<0) continue; const [x,z,rot]=heading(path,L,r?1-q:q,!r); inst('metroCar',x,G+.0123,z,rot,1); } });
    if (camera.dist >= DETAIL_DIST) flights.forEach(([a,b],i)=>{   // V9: decorative flights only in the overview — in close views they crossed downtown towers and labels
      const q=((t*.00002*(1+i*.13))+i*.21)%1, f=i%2?q:1-q, A=i%2?a:b, B=i%2?b:a;
      const x=A.x+(B.x-A.x)*f, z=A.z+(B.z-A.z)*f, y=G+.12+Math.sin(Math.PI*f)*.45, rot=Math.atan2(B.z-A.z,B.x-A.x); inst('plane', x, y, z, rot, 1);});
    if (RX && camera.dist < PROPS_DIST && quality !== 'low') RX.animate(t, {phase:visPhase, quality});   // V15: coaster trains, airside service traffic
    for (const cv of convoyList) inst('convoy', cv.x, 0, cv.z, cv.rot, 1, cv.color||[.95,.62,.18]);
    const bladeCol=[.97,.97,.96];
    for (const [x,y,z,k] of turbines){ const a0=(quality==='low'?0:t*.003)+x*7; /* V15: blades rest on Reduced */ for(let b=0;b<3;b++){const a=a0+b*2.094,L=.075*k,w=.006*k,ca=Math.cos(a),sa=Math.sin(a),px=-sa*w,py=ca*w;
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
      // V11 hierarchy: warnings, active work and the selection keep a prominent head; other projects a compact one.
      const warn=st.health==='blocked'||st.health==='waiting', key=sel||hov||warn||!!st.active;
      const top=beaconTop(st,pr.id), pulse=key?Math.sin(t*.003+pr.x*3)*.006:0;
      const col = st.health==='blocked'?[.95,.35,.28]:st.health==='waiting'?[1,.72,.2]:st.done>=6?[1,.86,.3]:pr.color;
      push(pr.pad[0],top+.016+pulse+(sel?.02:0),pr.pad[1],sel?[1,.92,.62]:col,sel?13:hov?11.5:key?9:6);
      if (st.active) for (let i=0;i<3;i++){const a=t*.0024+i/3*6.283,r=.026;push(pr.pad[0]+Math.cos(a)*r,G+.016+i*.008,pr.pad[1]+Math.sin(a)*r,pr.color,2.6);}
    }
    if (clustered && beaconsOn) for (const cl of clusters) { const pulse=Math.sin(t*.003+cl.x)*.012; push(cl.x,G+.34+pulse,cl.z,[.91,.72,.35],14); push(cl.x,G+.34+pulse,cl.z,[1,.97,.88],6); }   // V11: compact cluster beacons
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
      const pal=[[1,.84,.4],[.91,.72,.35],[1,1,1],[1,.93,.7],[.29,.75,.77]];
      for (let i=0;i<60;i++) { const a=i*2.399, sp=.00012+(i%7)*.000018, r=age*sp, vy=.00022+(i%5)*.00004; const y=G+.08+vy*age-2.2e-10*age*age; if (y<G) continue; push(b.x+Math.cos(a)*r,y,b.z+Math.sin(a)*r,pal[i%5],4.5*(1-age/2600)+1); } }
    fillDyn(pointsObj.geometry, dp.length/3, {position:[dp,3], color:[dc,3], aSize:[ds,1]});
    return dp.length/3;
  }

  /* ------------------------------ labels ---------------------------- */
  const labelLayer = document.createElement('div'); labelLayer.id='mapLabels'; labelLayer.setAttribute('aria-hidden','true');
  canvas.insertAdjacentElement('afterend', labelLayer);
  const labels = [];
  let projLabelsOn = true;
  function makeLabel(text, cls, x, y, z, priority){ const el=document.createElement('span'); el.className='map-label '+cls; el.textContent=text; labelLayer.appendChild(el); const L={el,x,y,z,priority,w:0,h:0,dx:0,dy:0,base:text}; labels.push(L); return L; }
  for(const site of Object.values(window.VisionScenicSites||{})){if(site.x==null)continue;const L=makeLabel(site.name,'road-name scenic-label',site.x,G+site.y+.012,site.z,3);L.scenic=site;L.el.style.pointerEvents='none';}
  for (const l of D.labels) { if (l.kind==='place' && LY.planAt(...geo(l.lon,l.lat), .1)) continue; const [x,z]=geo(l.lon,l.lat); makeLabel(l.text, l.kind, x, l.kind==='sea'?SEA:l.kind==='place'?G:NEI, z, l.kind==='place'?8:l.kind==='sea'?1:0); }
  // City labels sit where the city is drawn (its place on a regional plan); on a plan they select that place.
  const placeOfCity = name => Object.values(LY.places || {}).find(q => q.city === name);
  for (const c of D.cities) { const d=LY.cityDisplay[c.name]||[c.x,c.z], pl=placeOfCity(c.name), L=makeLabel(c.name, 'city pal-'+c.palette+(c.capital?' capital':''), d[0], G+.1, d[1], c.priority||(3+c.size*4)); L.dx=pl?0:(c.dx||0); L.dy=pl?0:(c.dy||0); L.minor=!c.capital&&c.size<.4; if (pl) { L.el.dataset.pid=pl.id; L.place=true; } }
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
  // V21: Kingdom-map badges (kingdom-landmarks.js), national overview only; a click opens the badge's regional view.
  for (const b of window.VisionKingdomBadges || []) { const c = b.city && (LY.cityDisplay[b.city] || (q => q && [q.x, q.z])(C(b.city))), p = b.project && P(b.project), at = c || (p && [p.x, p.z]); if (!at) continue;
    const L = makeLabel('', 'badge badge-' + b.style, at[0] + (b.dx || 0), G + .16, at[1] + (b.dz || 0), 26); L.base = null; L.badge = b; L.el.innerHTML = window.VisionKingdomIcon(b.icon, b.color) + '<span></span>';
    if (b.region) L.el.dataset.region = b.region; else L.el.classList.add('static'); }
  const clusterLabels = clusters.map(cl => { const L=makeLabel(cl.anchor+' · '+cl.ids.length+' projects', 'cluster', cl.x, G+.34, cl.z, 9.5); L.cluster=true; return L; });
  // Project name labels hold a full and a short variant (each translated once by the Arabic layer); the placer picks the
  // variant that fits, anchors the label just above the model's real top, and lets the player click it.
  const ESSENTIAL_LABELS = new Set(['sports', 'newmurabba', 'ksip', 'expo', 'metro', 'masar', 'redsea']);   // kept visible first when space is tight
  // A hidden label must not catch clicks: at opacity 0 it would still sit where it was last drawn and swallow clicks meant
  // for the map (or for another region's landmark). It fades out, then leaves hit-testing entirely.
  // Screen-anchor points of every landmark (project footprints and city/district places) — see updateLabels().
  const LANDMARK_POINTS = [
    ...D.projects.map(p => [p.id, p.ribbon ? p.ribbon.pts.flatMap((q, i, a) => i ? [[(a[i-1][0] + q[0]) / 2, (a[i-1][1] + q[1]) / 2], q] : [q]).concat([p.pad]) : [[p.x, p.z], p.pad]]),
    ...Object.values(LY.places || {}).map(q => [q.id, [[q.x, q.z]]]),
    [CORE_ID, [[LY.RIYADH_CORE.x, LY.RIYADH_CORE.z]]]];
  const hideLabel = L => { L.el.style.opacity=0; L.el.style.pointerEvents='none'; };
  const mapName = p => (LY.MAP_NAME && LY.MAP_NAME[p.id] && LY.MAP_NAME[p.id].en) || p.name;   // e.g. 'Jubail - Energy & Industry'
  const smallProjLabels = D.projects.map(p => { const L=makeLabel('', 'proj-small', p.x, G+.16, p.z, 1.5); L.small=true; L.pid=p.id; L.el.dataset.pid=p.id;
    L.el.innerHTML='<span class="lf"></span><span class="ls"></span>'; L.el.children[0].textContent=mapName(p); L.el.children[1].textContent=LY.SHORT[p.id]||mapName(p); return L; });
  const dynLabels = new Map();
  function setDynLabels(list){
    const keep=new Set();
    for (const d of list) { keep.add(d.id); let L=dynLabels.get(d.id);
      if (!L) { L=makeLabel(d.text,'dyn '+(d.cls||''),d.x,d.y??G+.12,d.z,12); dynLabels.set(d.id,L); }
      if (L.el.textContent!==d.text) { L.el.textContent=d.text; L.w=0; }
      L.el.className='map-label dyn '+(d.cls||''); L.x=d.x; L.z=d.z; if (d.y!=null) L.y=d.y; }
    for (const [id,L] of dynLabels) if (!keep.has(id)) { L.el.remove(); labels.splice(labels.indexOf(L),1); dynLabels.delete(id); }
  }
  function project(p){const v=M4.transform(vp,p);if(v[3]<=0.01)return null;const nx=v[0]/v[3],ny=v[1]/v[3];return [(nx*.5+.5)*width/dpr,(-ny*.5+.5)*height/dpr,v[2]/v[3]];}
  // HUD controls that labels must never cover (re-measured a few times a second, not every frame).
  const OBSTACLES = '#modeNav, #mapHelp, .topbar, #navigator, #dock, #bottombar, #messageRibbon, .map-controls, #mcard, #mmeasures, #mMenuBtn, #decision, #planTray, #actionBar, #report, #results, .ctop, #cTools, #cPanel, #menuCard, #profileChip, #langBtn, #soundBtn, #pickChoices, #challengePanel, #challengeTop, #unitBar, #reviewCard, #coach, #banner, #chapter, .sheet:not(.hidden)';
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
    const focus = (hoverViaLabel ? null : hoverId) || selectedId, cand = [];
    for (const L of labels) {
      let show = true, x=L.x, y=L.y, z=L.z, pri=L.priority;
      if(L.scenic){const text=document.documentElement.dir==='rtl'?L.scenic.ar:L.scenic.name;if(L.el.textContent!==text){L.el.textContent=text;L.w=0;}}
      const overview = !!countryOverview && far > 6;
      if (L.badge) { show = overview; const t=document.documentElement.dir==='rtl'?L.badge.ar:L.badge.en, sp=L.el.lastChild; if (sp.textContent!==t) { sp.textContent=t; L.w=0; } }
      else if (overview && (L.region || L.cluster || L.district || L.el.classList.contains('city') || L.el.classList.contains('place'))) show = false;   // V21: the badges replace them
      else if (L===projLabel) { const p=focus&&P(focus); if(!p||!projLabelsOn){show=false;} else { const k=Math.min(6,(projectState[p.id]||{}).done||0), key=p.id+':'+k; if (L.key!==key) { L.key=key; L.el.innerHTML=''; const b=document.createElement('b'); b.textContent=mapName(p); const m=document.createElement('small'); m.className='pl-metric'; m.textContent=k+'/6'; L.el.append(b, m); L.w=0; } L.el.dataset.pid=p.id; x=p.x; z=p.z; y=topY[p.id]+.035; } }
      else if ((L.cluster||L.small) && !projLabelsOn) show = false;
      else if (L.cluster) show = far > CLUSTER_DIST && !(countryOverview&&far>6);
      else if (L.region) show = far > 9;
      else if (L.district) show = far < 7;
      else if (L.heading) show = far < 6.5;
      else if (L.scenic) show = projLabelsOn && far<4.4;
      else if (L.note) show = projLabelsOn && far < 5.2;
      else if (L.road) show = projLabelsOn && far < 4.2;
      else if (L.small) { show = far < (innerWidth < 600 ? 6.2 : 5.2) && L.pid!==focus;   /* phones frame regions from further out */ y = topY[L.pid]+.012; }
      else if (L.el.classList.contains('country')||L.el.classList.contains('sea')) show = far > 6.5;
      else if (!L.el.classList.contains('capital')) show = L.minor ? far < 11 : far < 24;   // distant view: major cities only
      if(countryOverview&&far>6&&L.el.classList.contains('city'))y=G+.29;
      const s = show && project([x,y,z]);
      if (!s || s[2]>1 || s[0]<-60 || s[1]<-30 || s[0]>innerWidth+60 || s[1]>innerHeight+30) { hideLabel(L); continue; }
      if (L.small) pri = 2 + .9 * (1 - Math.min(1, Math.hypot(s[0]-cx, s[1]-cy) / diag)) + (ESSENTIAL_LABELS.has(L.pid) ? 1 : 0);   // nearer the middle = more relevant; key districts first
      if (L===projLabel) pri = 30;   // the selected (or hovered) object is placed before everything else
      cand.push({L, s, pri});
    }
    cand.sort((a,b) => b.pri - a.pri);
    const placed = [];
    // Where each landmark is drawn on screen (its centre, marker and, for corridors, points along it). A clickable label
    // may cover its own landmark but never another one, so a click where a landmark is drawn always selects that landmark.
    const anchors = [];
    for (const [id, pts] of LANDMARK_POINTS) for (const q of pts) { const a = project([q[0], G + .01, q[1]]); if (a && a[2] <= 1 && a[0] > -20 && a[0] < innerWidth + 20 && a[1] > -20 && a[1] < innerHeight + 20) anchors.push([id, a[0], a[1]]); }
    const coversOther = (r, pid) => anchors.some(([id, x, y]) => id !== pid && x > r.x - 4 && x < r.x + r.w + 4 && y > r.y - 4 && y < r.y + r.h + 4);
    for (const {L, s} of cand) {
      if(countryOverview&&far>6)L.w=0; measure(L); if (L===projLabel) { L.w=L.el.offsetWidth; L.h=L.el.offsetHeight; }
      const lift = L.badge ? 26 : L.el.classList.contains('city')||L===projLabel||L.cluster ? 18 : L.small ? 8 : 0;
      const at = w => ({x:Math.max(6, Math.min(innerWidth - w - 6, s[0]-w/2+(far>7?L.dx:0))), y:s[1]-L.h/2-lift+(far>7?L.dy:0), w, h:L.h});   // every label stays fully on screen
      // Decorative names (seas, countries, headings, corridors, the plan note) never sit over any landmark: they give way first.
      const deco = L.decor ?? (L.decor = !!(L.heading || L.note || L.road || L.el.classList.contains('sea') || L.el.classList.contains('country')));
      const free = r => !placed.some(q => hits(r, q)) && !obstacles.some(q => hits(r, q, 2, 2)) && !(L.pid && coversOther(r, L.pid)) && !(deco && coversOther(r, null));
      let r = at(L.small ? L.wF : L.w), short = false;
      if (!free(r) && L.small) { r = at(L.wS); short = true; }        // shorten before giving up
      if (!free(r) && L.pid) { const b = r, H = L.h + 5, Wd = b.w / 2 + 12;   // then nudge it round its marker: above and beside first, below (over its own model) last
        for (const [dx, dy] of [[0, -H], [-Wd, 0], [Wd, 0], [-Wd, -H], [Wd, -H], [0, -2 * H], [-2 * Wd, 0], [2 * Wd, 0], [-Wd, -2 * H], [Wd, -2 * H], [-Wd, H], [Wd, H], [0, H], [0, 2 * H]]) { const c = {...b, x:Math.max(6, Math.min(innerWidth - b.w - 6, b.x + dx)), y:b.y + dy}; if (free(c)) { r = c; break; } } }
      if (!free(r)) { hideLabel(L); continue; }
      if (L.small) L.el.classList.toggle('use-short', short);
      L.el.classList.toggle('hot', !!L.pid && L.pid===hoverId || L===projLabel);
      placed.push(r);
      L.el.style.opacity=1; L.el.style.visibility=''; L.el.style.pointerEvents=''; L.el.style.transform=`translate3d(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px,0)`;
    }
  }
  // Clicking or hovering a project's label acts on that same project.
  labelLayer.addEventListener('click', e => { const rg=e.target.closest('[data-region]'); if (rg) { hideChoices(); onRegion(rg.dataset.region); return; }
    const el=e.target.closest('[data-pid]'); if (!el || !selectable) return; hideChoices(); pickSelect(el.dataset.pid); });
  let lastPick=null;   // last map selection (tests)
  function regionZ(r){return r.z-(r.nationalFit?(regionFit(r)-1)*2.2:0);}   // V22: portrait screens centre the tilted Kingdom map lower, clear of the top bar
  function regionFit(r){return r.nationalFit ? Math.min(2.8,Math.max(1,Math.pow(1.75/(innerWidth/innerHeight),.66))) : r.fitWidth ? Math.min(r.phoneFit || 1.5, Math.max(1, Math.sqrt(1.1/(innerWidth/innerHeight)))) : 1;}
  function pickSelect(id){ lastPick=id; if (id===CORE_ID) { selectedId=null; onPlace('riyadh'); } else if (String(id).startsWith('place:')) { selectedId=null; onPlace(id); } else onSelect(P(id)); }
  let hoverViaLabel=false;   // hovering a label keeps that label in place, so a click lands where the pointer is
  labelLayer.addEventListener('pointerover', e => { const el=e.target.closest('[data-pid]'); if (el && selectable) { hoverId=el.dataset.pid; hoverViaLabel=true; } });
  labelLayer.addEventListener('pointerout', e => { const el=e.target.closest('[data-pid]'); if (el && selectable && hoverId===el.dataset.pid) { hoverId=null; hoverViaLabel=false; } });

  /* ------------------------------ render ---------------------------- */
  let lastT=performance.now(), frames=0, slowFrames=0;
  const shadowsOn = () => shadowsSupported && quality==='high';
  const detailOn = () => camera.dist < DETAIL_DIST;
  function updateLight(){
    const T=camera.target, h=Math.max(.9, Math.min(11, camera.dist*.62)), texel=2*h/shadowSize;
    const c=[Math.round(T[0]/texel)*texel, G, Math.round(T[2]/texel)*texel];
    const e=[c[0]+SUN[0]*30, c[1]+SUN[1]*30, c[2]+SUN[2]*30];
    lightVP = M4.multiply(ortho(h, 1, 60), M4.lookAt(e, c, [0,1,0]));
  }
  // ?debug=1: frame-time overlay (fps, ms, draw calls, triangles) — also readable through VisionWorld.debug.frameStats().
  const fpsStat = {fps:0, ms:0, n:0, acc:0, at:performance.now()};
  const fpsEl = window.VN_DEBUG ? (() => { const d=document.createElement('div'); d.id='fpsDebug';
    d.style.cssText='position:fixed;left:8px;bottom:8px;z-index:60;padding:4px 8px;border-radius:6px;background:rgba(21,63,54,.85);color:#fff;font:600 11px/1.4 ui-monospace,Consolas,monospace;pointer-events:none;white-space:pre';
    document.body.appendChild(d); return d; })() : null;
  function render(t){
    const raw=t-lastT, dt=Math.min(100,raw); lastT=t;
    fpsStat.acc+=raw; fpsStat.n++;
    if (t-fpsStat.at>500 && fpsStat.n) { fpsStat.ms=fpsStat.acc/fpsStat.n; fpsStat.fps=1000/fpsStat.ms; fpsStat.acc=fpsStat.n=0; fpsStat.at=t;
      if (fpsEl) fpsEl.textContent=`three.js · ${quality}\n${fpsStat.fps.toFixed(0)} fps · ${fpsStat.ms.toFixed(1)} ms\n${frameRenderStats.calls} calls · ${(frameRenderStats.triangles/1000).toFixed(0)}k tris`; }
    // Adaptive quality: drop shadows/tilt-shift automatically on slow machines.
    // V20: Ultra steps down to High first (and may still drop to Reduced after a fresh window).
    if (quality==='high' && ++frames>90 && frames<400) { if (dt>(fxTier==='ultra'?28:45)) slowFrames++; /* Ultra keeps ~35 fps or steps down */ if (slowFrames>60) { if (fxTier==='ultra') { frames=slowFrames=0; setQuality('high', true); } else setQuality('low', true); } }
    if(captureTime!==null) t=captureTime; // isolated visual check freezes decorative motion and weather lighting
    resize(); updateCamera(dt); if(camera.dist<SPATIAL_DIST)ensureSpatial(); let st=stormTarget;
    if (hazard) { const d=Math.hypot(camera.target[0]-hazard.x,camera.target[2]-hazard.z); st=Math.max(st,(hazard.plumes?.55:1)*hazard.intensity*Math.max(0,Math.min(1,1.7-d/(hazard.r*2.2)))*(hazard.type==='heat'?.45:1)); const tt=TINTS[hazard.type]||TINTS.dust; for(let i=0;i<3;i++) tint[i]+=(tt[i]-tint[i])*.05; }
    storm+=(st*(directMode?.6:1)-storm)*Math.min(1,dt*.002);
    if (follow) { camera.desired.target[0]=follow[0]; camera.desired.target[2]=follow[1]; }
    if (stageDirty) { syncLayer('stage'); syncLayer('landmark'); syncLayer('landmarkProps'); syncLayer('landmarkTiny'); syncLayer('landmarkLit'); showPreviewBadge(); syncLines(stageLinesObj, stageLines); stageDirty=false; }
    if (cityDirty) { syncLayer('city'); syncLines(cityLinesObj, cityLines); cityDirty=false; }
    if (missionDirty) { syncLayer('mission'); syncLines(missionLinesObj, missionLines); missionDirty=false; }
    buildVehicles(t); syncLayer('veh');

    night=captureTime!==null?0:night+(nightTarget-night)*Math.min(1,dt*.0015);
    cosmetics?.update(t,camera.dist,night);
    kingdomDiorama?.update(t,camera.dist,night);
    countryOverview?.update(t,camera.dist,night,quality);
    document.body.classList.toggle('country-overview',!!countryOverview&&camera.dist>6);
    SU.uStorm.value=storm; SU.uDist.value=camera.dist*EYE; SU.uTime.value=t*.001; SU.uTint.value=tint; SU.uNight.value=night; SU.uEye.value=eye; SU.uVP.value=vp;
    for (const L of Object.values(LAYERS)) L.own.uShadowOn.value = L.cast && shadowsOn() ? 1 : 0;
    LAYERS.cloud.own.uOffset.value=[Math.sin(t*.00005)*.25,0,0];
    const postOn=!!(post && post.active), hdrOn=postOn && post.hdr;
    SU.uFx.value=quality==='low'?0:1; SU.uSoft.value=softOverride!=null?softOverride:fxTier==='ultra'?2:quality==='high'?1:0; SU.uHdr.value=hdrOn?1:0;
    POINT_MAT.uniforms.uBoost.value=hdrOn?1.15+night*1.5:1;
    assets?.update(t,dt,{night,storm,shadows:shadowsOn(),still:captureTime!==null});

    // 1) Shadow map from the sun
    if (shadowsOn()) {
      updateLight(); SU.uLightVP.value=lightVP;
      renderer.setRenderTarget(shadowRT); renderer.setClearColor(0xffffff, 1); renderer.clear();
      renderPass('depth'); renderer.render(scene3, cam3);
    }
    // 2) Scene: sky clear, sea, meshes, lines, points
    const sky=[(.60+storm*.18)*(1-night)+.07*night,(.82-storm*.26)*(1-night)+.10*night,(.94-storm*.44)*(1-night)+.22*night];
    const out = postOn ? post.begin(width,height) : null;   // V20: the premium tiers draw the frame into an HDR target
    // V21: on the Kingdom map, beyond the world's edge reads as open ocean (the haze keeps the sky colour)
    const edge=countryOverview&&camera.dist>6?[.05*(1-night)+.03*night,.30*(1-night)+.07*night,.60*(1-night)+.18*night]:sky;
    renderer.setRenderTarget(out); renderer.setClearColor(clearCol.setRGB(edge[0],edge[1],edge[2]), 1); renderer.clear();
    POINT_MAT.uniforms.uScale.value=dpr;
    buildDynLines(t); syncLines(dynLinesObj, dynLines);
    dynamicPoints(t);
    kingdomDiorama?.begin(renderer,width,height,dpr,camera.dist);
    renderPass('main'); renderer.render(scene3, cam3);
    frameRenderStats.calls=renderer.info.render.calls;frameRenderStats.triangles=renderer.info.render.triangles;
    kingdomDiorama?.finish(renderer, out);
    if(kingdomDiorama&&!countryOverview&&camera.dist>6){frameRenderStats.calls+=renderer.info.render.calls;frameRenderStats.triangles+=renderer.info.render.triangles;}
    if (postOn) post.end({night, storm, sky, focus:camera.dist*EYE, time:t*.001, still:captureTime!==null});
    updateLabels(); keyPan(dt);
    if (pendingHover && performance.now() - pendingHover.t > 90) { const h = pendingHover; pendingHover = null; runHover(h.x, h.y, h.touch); }   // hover picks only once the pointer rests
    requestAnimationFrame(render);
  }
  function buildDynLines(t){
    dynLines.p.length=dynLines.c.length=0; lineTarget=dynLines;
    for (const b of bursts) { const age=t-b.t0; if (age<1300) { const q=age/1300, e=1-(1-q)*(1-q); addRing(b.x,G+.02,b.z,.04+e*.32,PALETTE.sel,56); if (q<.6) addRing(b.x,G+.021,b.z,.03+e*.2,PALETTE.selHi,48); } }   // V10: one brief gold ripple per completion
    if (selectable || selectedId) { const sp=selectedId&&P(selectedId), hp=hoverId&&hoverId!==selectedId&&P(hoverId);
      if (sp) { if (sp.ribbon) { ribbonEdges(sp,.006,G+.014,PALETTE.sel); ribbonEdges(sp,.009,G+.015,PALETTE.sel); } else { addRing(sp.x,G+.014,sp.z,sp.foot+.006,PALETTE.sel,48); addRing(sp.x,G+.0135,sp.z,sp.foot+.0095,PALETTE.key,48); addBrackets(sp.x,G+.016,sp.z,sp.foot+.018,PALETTE.selHi); } }
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
    fxTier = ['ultra','high','medium','low'].includes(q) ? q : 'high';
    quality = fxTier==='ultra' ? 'high' : fxTier;
    post?.setTier(fxTier);
    const ss = fxTier==='ultra' ? SHADOW_SIZE*2 : SHADOW_SIZE;   // V20: Ultra's 4096 sun shadow map
    if (ss!==shadowSize) { shadowSize=ss; shadowRT.setSize(ss,ss); SU.uTexel.value=1/ss; }
    document.body.classList.toggle('gfx-low', quality==='low'); document.body.classList.toggle('gfx-medium', quality==='medium'); resScale = quality==='high' ? 1 : quality==='medium' ? .8 : .65; resize();
    dispatchEvent(new CustomEvent('vision-quality', {detail:{quality:fxTier, auto:!!auto}}));
    if (cityDesc) buildCity();   // parcel dressing depends on the tier
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
  let selectable=false, pendingHover=null, pickRT=null;
  // Render project ids (front-most wins) into an offscreen target, only inside the scissor box under the pointer.
  function renderIds(x0, y0, w, h){
    if (!pickRT) pickRT=new THREE.WebGLRenderTarget(width, height, {minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter, generateMipmaps:false, depthBuffer:true});
    if (pickRT.width!==width || pickRT.height!==height) pickRT.setSize(width, height);
    pickRT.viewport.set(0,0,width,height); pickRT.scissor.set(x0,y0,w,h); pickRT.scissorTest=true;
    renderer.setRenderTarget(pickRT); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
    renderPass('pick'); renderer.render(scene3, cam3);
    const px=new Uint8Array(w*h*4); renderer.readRenderTargetPixels(pickRT, x0, y0, w, h, px);
    pickRT.scissorTest=false; renderer.setRenderTarget(null); return px;
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
  function runHover(x, y, touch){ if (!selectable || pointers.size) return; hoverViaLabel=false; if (!nearAnyProject(x, y, 16)) { hoverId=null; canvas.style.cursor=''; return; }
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
    countryAutoFrame=false;
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
    if (dragMode==='pinch'&&pointers.size===2){const [a,b]=[...pointers.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);camera.desired.dist=Math.max(MIN_DIST,Math.min(22,pinchDist*pinchStart/Math.max(20,d)));}
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
  canvas.addEventListener('wheel', e=>{e.preventDefault();countryAutoFrame=false;camera.desired.dist=Math.max(MIN_DIST,Math.min(Math.max(22,K.dist*regionFit(K)),camera.desired.dist*Math.exp(e.deltaY*.0012)));},{passive:false});
  const keys=new Set();
  addEventListener('keydown', e=>{ if(e.target.closest&&e.target.closest('input,textarea'))return; const k=e.key.toLowerCase(); if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','q','e','=','+','-'].includes(k)){keys.add(k); if(k.startsWith('arrow'))e.preventDefault();} });
  addEventListener('keyup', e=>keys.delete(e.key.toLowerCase()));
  addEventListener('blur', ()=>keys.clear());
  function keyPan(dt){
    if(!keys.size)return;countryAutoFrame=false; const v=dt*.45;
    if(keys.has('w')||keys.has('arrowup'))pan(0,v); if(keys.has('s')||keys.has('arrowdown'))pan(0,-v);
    if(keys.has('a')||keys.has('arrowleft'))pan(v,0); if(keys.has('d')||keys.has('arrowright'))pan(-v,0);
    if(keys.has('q'))camera.desired.az+=dt*.0015; if(keys.has('e'))camera.desired.az-=dt*.0015;
    if(keys.has('=')||keys.has('+'))camera.desired.dist=Math.max(MIN_DIST,camera.desired.dist*(1-dt*.0015)); if(keys.has('-'))camera.desired.dist=Math.min(Math.max(22,K.dist*regionFit(K)),camera.desired.dist*(1+dt*.0015));
  }

  /* ------------------------------- API ------------------------------ */
  window.VisionWorld = {
    start(){countryAutoFrame=true;setDesired(K.az,K.el,K.dist*regionFit(K),K.x,regionZ(K)); },
    focusProject(p){countryAutoFrame=false; selectedId=p.id; directMode=false; follow=null; setDesired(.3,.8,2.3,p.x,p.z,.02); },
    focusRegion(id){ const r=D.regions[id]||K; selectedId=null; directMode=false;countryAutoFrame=r===K;
      setDesired(r.az,r.el,r.dist*regionFit(r),r.x,regionZ(r)); },
    overview(){ selectedId=null; directMode=false; follow=null; stormTarget=0;countryAutoFrame=true; setDesired(K.az,K.el,K.dist*regionFit(K),K.x,regionZ(K)); },
    // World coordinates for simulation data (same anchor spread as projects)
    place(lon, lat, anchor){ let [x,z]=geo(lon,lat); const a=anchor&&C(anchor); if(a){x=a.x+(x-a.x)*ANCHOR_SPREAD;z=a.z+(z-a.z)*ANCHOR_SPREAD;} return [x,z]; },
    focusPoint(x, z, dist=3.4, el=.72){countryAutoFrame=false; directMode=false; follow=null; setDesired(.35,el,dist,x,z,.03); },
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
    kingdomCam(speed=1, dx=0, zoom=1, dz=0){ directMode=false; follow=null; camSpeed=speed; countryAutoFrame=!dx&&!dz&&zoom===1; setDesired(K.az,K.el,K.dist*regionFit(K)*zoom,K.x+dx,regionZ(K)+dz,0); },   // V22: the one Kingdom-map framing, for every caller
    snapCam(az, el, dist, x, z){ setDesired(az,el,dist,x,z,0); camera.az=az; camera.el=el; camera.dist=dist; camera.target=[x,0,z]; },
    camSpeed(k){ camSpeed=k; },
    setNight(v, instant){ nightTarget=Math.max(0,Math.min(1,v)); if(instant) night=nightTarget; },
    getNight(){ return night; },
    burst(x, z){ bursts.push({x, z, t0:performance.now()}); assets?.celebrate(x, z); },   // V20: nearby GLB characters cheer
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
    getQuality(){ return fxTier; },   // 'ultra' | 'high' | 'medium' | 'low'
    qualityTiers(){ return ['ultra','high','medium','low']; },
    assets:assets?.api || null,   // V20 GLB pipeline (assets.js)
    onSelect(fn){ onSelect=fn; },
    onPlace(fn){ onPlace=fn; },
    onRegion(fn){ onRegion=fn; },   // a click on a region name on the national view   // a click on the downtown skyline (a place, not a project)
    // Only the National Simulation selects projects on the map; the menu map stays inert (no pointer cue, no dead clicks).
    setSelectable(v){ selectable=!!v; if (!selectable) { hoverId=null; hideChoices(); canvas.style.cursor=groundHandler?'crosshair':''; } labelLayer.classList.toggle('selectable', selectable); },
    // Test/inspection helpers (read-only): what a click would select, and where each project is actually visible.
    debug:{
      captureView(x,z,dist,el=.88){countryAutoFrame=false; directMode=false; follow=null; setDesired(.3,el,dist,x,z,G+.012); camera.az=.3; camera.el=el; camera.dist=dist; camera.target=[x,G+.012,z]; },
      captureMode(v){captureTime=v?12000:null;},
      projectStates:()=>JSON.parse(JSON.stringify(projectState)),
      visualPhases:()=>Object.fromEntries(['ksip','qiddiya'].map(id=>[id,visPhase(id)])),
      lighting:()=>({night,storm,sun:SUN,renderer:gl.getParameter(gl.RENDERER),vendor:gl.getParameter(gl.VENDOR)}),
      pickAt:(x, y, touch) => resolveAt(x, y, !!touch),
      visiblePixels(id, max=16){ const px=renderIds(0,0,width,height), k=PIDX[id], pts=[]; for (let j=0;j<height;j+=2) for (let i=0;i<width;i+=2) { const o=(j*width+i)*4; if (px[o+2] && px[o]+px[o+1]*256===k) pts.push([i/dpr,(height-j)/dpr]); }
        if (!pts.length) return []; const mx=pts.reduce((a,p)=>a+p[0],0)/pts.length, my=pts.reduce((a,p)=>a+p[1],0)/pts.length; return pts.sort((a,b)=>Math.hypot(a[0]-mx,a[1]-my)-Math.hypot(b[0]-mx,b[1]-my)).slice(0,max).map(([x,y])=>({x,y})).concat([{count:pts.length}]); },
      marker(id){ const pr=P(id), q=project([pr.pad[0],beaconTop(projectState[id],id)+.02,pr.pad[1]]); return q?{x:q[0],y:q[1]}:null; },
      screen(x,z,y=G){ const q=project([x,y,z]); return q?{x:q[0],y:q[1]}:null; },   // where a ground point is drawn (tests)
      lastPick(){ return lastPick; }, clearPick(){ lastPick=null; },
      regionView(id){ const r=D.regions[id];countryAutoFrame=r===K; selectedId=null; directMode=false; follow=null; const d=r.dist*regionFit(r), z=regionZ(r); setDesired(r.az,r.el,d,r.x,z,0); camera.az=r.az; camera.el=r.el; camera.dist=d; camera.target=[r.x,0,z]; },   // a region's default view, instantly
      // V15: temporary completed-state preview of the Riyadh landmarks (visual only; see visPhase).
      previewComplete(v){ previewDone=!!v; buildStageMesh(); return previewDone; },
      holdQuality(){ frames=400; },   // V15 (tests): ends the adaptive-quality window, so captures keep the quality they set
      state:() => ({dist:camera.dist,az:camera.az,el:camera.el,target:[...camera.target], selectable, hoverId, selectedId, detail:detailOn()}),
      postInfo:() => post ? post.info() : null,
      postTier(t){ post?.setTier(t); return post?.info(); },   // V20 (perf checks): post-processing tier independent of the shading tier
      softShadows(v){ softOverride=v; },
      frameStats:() => ({fps:fpsStat.fps, ms:fpsStat.ms, quality:fxTier, renderer:'three', calls:frameRenderStats.calls, triangles:frameRenderStats.triangles})
    }
  };
  requestAnimationFrame(render);
})();
