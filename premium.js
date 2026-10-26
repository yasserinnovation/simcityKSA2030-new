// Vision Nexus 2030 — premium post-processing (build V20). Loaded by boot.js before engine.js; used by the three.js
// renderer only (the classic renderer never calls it).
//
// The world shaders already output display-ready colour that never exceeds 1.0 (their soft exposure shoulder). This pass
// keeps that look and adds, per graphics tier:
//   • a multisampled scene target like the canvas it replaces (8-bit on Medium and High, half float on Ultra);
//   • selective bloom: by night only lights cross the threshold (every surface is graded dark); on Ultra the HDR target
//     lets light sources pushed above 1.0 (night facades, beacons, city lights, sun glints on water) bloom by day too,
//     while pale roofs and sand, which never exceed 1.0, never haze over;
//   • aerial perspective from the depth buffer (High and Ultra), a filmic highlight shoulder, a restrained colour grade
//     (cool shadows, warm highlights), a vignette and a dither that removes 8-bit banding in the sky and sea.
// Reduced draws straight to the canvas exactly as before (no target, no extra passes).
(() => {
  'use strict';
  window.VisionPremium = (T, renderer) => {
    const gl = renderer.getContext(), webgl2 = renderer.capabilities.isWebGL2;
    const hdr = webgl2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
        const maxSamples = webgl2 ? Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0) : 0;
    // Bloom levels, bloom resolution, depth haze and grade strength per tier. Medium keeps a light bloom and the grade.
    // Only Ultra uses the half-float target: multisampling a half-float target costs ~9 ms a frame on integrated GPUs
    // (measured, 1440×900), while an 8-bit multisampled one is nearly free. The 8-bit tiers bloom by night, when every
    // surface is graded dark and only lights cross the threshold; Ultra's HDR emitters also bloom by day (sun glints).
    const TIERS = {
      low:{on:false},
      medium:{on:true, hdr:false, levels:3, div:4, haze:0, grade:.75, bloom:.55},
      high:{on:true, hdr:false, levels:5, div:2, haze:1, grade:1, bloom:.8},
      ultra:{on:true, hdr:true, levels:6, div:2, haze:1, grade:1, bloom:.9}
    };
    let cfg = TIERS.high, tier = 'high', W = 0, H = 0, sceneRT = null, down = [], up = [];
    const isHdr = () => !!(cfg.on && cfg.hdr && hdr), type = () => isHdr() ? T.HalfFloatType : T.UnsignedByteType;

    const tri = new T.BufferGeometry();   // one full-screen triangle
    tri.setAttribute('position', new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const VS = 'varying vec2 vUv; void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }';
    const mat = (fs, uniforms, o = {}) => new T.ShaderMaterial(Object.assign({vertexShader:VS, fragmentShader:fs, uniforms, depthTest:false, depthWrite:false, toneMapped:false}, o));
    const quad = new T.Mesh(tri, null); quad.frustumCulled = false;
    const postScene = new T.Scene(); postScene.add(quad); const postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const draw = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(postScene, postCam); };

    // Soft-knee threshold at 1.0: everything the world shaders draw stays under it, only boosted emitters pass.
    const PREFILTER = mat(`uniform sampler2D tMap; uniform vec2 uPx; uniform float uThreshold, uKnee; varying vec2 vUv;
      vec3 q(vec2 o){ return texture2D(tMap, vUv + o * uPx).rgb; }
      void main(){ vec3 c = (q(vec2(-1.,-1.)) + q(vec2(1.,-1.)) + q(vec2(-1.,1.)) + q(vec2(1.,1.))) * .25;
        float br = max(c.r, max(c.g, c.b)), soft = clamp(br - uThreshold + uKnee, 0., 2. * uKnee); soft = soft * soft / (4. * uKnee + 1e-4);
        float k = max(soft, br - uThreshold) / max(br, 1e-4); gl_FragColor = vec4(min(c * k, vec3(8.)), 1.); }`,
      {tMap:{value:null}, uPx:{value:new T.Vector2()}, uThreshold:{value:1}, uKnee:{value:.25}});
    // Dual-filter blur: 5-tap down, 8-tap tent up (cheap and stable on phones).
    const DOWN = mat(`uniform sampler2D tMap; uniform vec2 uPx; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tMap, vUv).rgb * 4.; c += texture2D(tMap, vUv + uPx * vec2(-1.,-1.)).rgb + texture2D(tMap, vUv + uPx * vec2(1.,-1.)).rgb
        + texture2D(tMap, vUv + uPx * vec2(-1.,1.)).rgb + texture2D(tMap, vUv + uPx * vec2(1.,1.)).rgb; gl_FragColor = vec4(c / 8., 1.); }`,
      {tMap:{value:null}, uPx:{value:new T.Vector2()}});
    const UP = mat(`uniform sampler2D tMap, tBase; uniform vec2 uPx; varying vec2 vUv;
      void main(){ vec2 p = uPx; vec3 c = texture2D(tMap, vUv + vec2(-2.*p.x, 0.)).rgb + texture2D(tMap, vUv + vec2(2.*p.x, 0.)).rgb
        + texture2D(tMap, vUv + vec2(0., -2.*p.y)).rgb + texture2D(tMap, vUv + vec2(0., 2.*p.y)).rgb
        + (texture2D(tMap, vUv + vec2(-p.x, p.y)).rgb + texture2D(tMap, vUv + vec2(p.x, p.y)).rgb + texture2D(tMap, vUv + vec2(-p.x, -p.y)).rgb + texture2D(tMap, vUv + vec2(p.x, -p.y)).rgb) * 2.;
        gl_FragColor = vec4(c / 12. + texture2D(tBase, vUv).rgb, 1.); }`,
      {tMap:{value:null}, tBase:{value:null}, uPx:{value:new T.Vector2()}});
    const COMPOSITE = mat(`uniform sampler2D tScene, tBloom, tDepth; uniform float uBloom, uHaze, uGrade, uNight, uStorm, uNear, uFar, uFocus, uUseDepth, uTime;
      uniform vec3 uSky; uniform vec2 uRes; varying vec2 vUv;
      float lin(float d){ float z = d * 2. - 1.; return 2. * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
      vec3 viewPos(vec2 uv,float z){return vec3((uv*2.-1.)*vec2(uRes.x/uRes.y,1.)*z*.2553419,-z);}
      // V24: eight fixed view-space samples ground buildings without a noisy temporal filter.
      // Radius is limited in pixels, rejected at depth discontinuities, and absent on Medium/Reduced.
      float contactAO(float depth){
        vec3 p=viewPos(vUv,lin(depth));
        vec3 n=normalize(cross(dFdx(p),dFdy(p)));if(n.z<0.)n=-n;
        float radius=clamp(uFocus*.025,.008,.12),sum=0.;
        vec2 px=vec2(clamp(radius/max(-p.z,.1)/.5106838*uRes.y,2.,8.))/uRes;
        for(int i=0;i<8;i++){
          float a=float(i)*2.3999632;vec2 uv=vUv+vec2(cos(a),sin(a))*px*(.35+.65*float(i+1)/8.);
          float d=texture2D(tDepth,clamp(uv,vec2(.001),vec2(.999))).r;
          vec3 delta=viewPos(uv,lin(d))-p;float l=length(delta);
          float horizon=max(0.,dot(n,delta/max(l,.00001))-.12);
          sum+=horizon*(1.-smoothstep(radius*.25,radius*2.,l))*step(d,.99999);
        }
        return 1.-min(.18,sum*.11);
      }
      void main(){
        vec3 c = texture2D(tScene, vUv).rgb;
        if (uUseDepth > .5) { float d = texture2D(tDepth, vUv).r;   // aerial perspective: distance past the focus blends toward the sky
          // absolute distance past the focus, so close miniature views stay crisp and the national view gains depth
          if (d < .99999) { c*=contactAO(d); float z = lin(d), z0 = uFocus * 1.05 + .35, f = smoothstep(z0, z0 + max(3., uFocus * 2.2), z) * uHaze * (.2 + .1 * uStorm); c = mix(c, uSky, f); } }
        c += texture2D(tBloom, vUv).rgb * uBloom;
        vec3 x = max(c - .86, 0.); c = min(c, .86) + .14 * x / (x + .14);   // filmic shoulder for HDR emitters only (base colours stay put)
        float l = dot(c, vec3(.2126, .7152, .0722));
        vec3 g = c * mix(vec3(.985, .995, 1.035), vec3(1.025, 1.0, .965), smoothstep(.18, .78, l));   // cool shadows, warm highlights
        g = mix(vec3(l), g, 1.05); g = mix(g, g * g * (3. - 2. * g), .10);                             // gentle saturation and S-curve
        c = mix(c, clamp(g, 0., 1.), uGrade * (1. - uNight * .35));
        vec2 v = vUv - .5; v.x *= uRes.x / uRes.y; c *= 1. - .16 * uGrade * smoothstep(.42, 1.05, length(v));
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uTime * 7.31, vec2(.06711056, .00583715))));
        gl_FragColor = vec4(c + (n - .5) / 255., 1.); }`,
      {tScene:{value:null}, tBloom:{value:null}, tDepth:{value:null}, uBloom:{value:.8}, uHaze:{value:1}, uGrade:{value:1}, uNight:{value:0}, uStorm:{value:0},
        uNear:{value:.1}, uFar:{value:140}, uFocus:{value:3}, uUseDepth:{value:0}, uTime:{value:0}, uSky:{value:new T.Color()}, uRes:{value:new T.Vector2(1, 1)}});
    const BLACK = new T.DataTexture(new Uint8Array(4), 1, 1); BLACK.needsUpdate = true;

    function disposeTargets(){ sceneRT?.dispose(); sceneRT = null; for (const t of down.concat(up)) t.dispose(); down = []; up = []; W = H = 0; }
    function build(w, h){
      disposeTargets(); W = w; H = h;
      sceneRT = new T.WebGLRenderTarget(w, h, {type:type(), samples:maxSamples, depthBuffer:true, minFilter:T.LinearFilter, magFilter:T.LinearFilter, generateMipmaps:false});
      // Rendering into this target must look exactly like rendering to the canvas: materials that convert to the output
      // colour space (MeshBasic/MeshStandard: cosmetics, GLB models) keep their sRGB encode. three.js applies the output
      // encode only to the canvas or to a target flagged like this one (see WebGLRenderer: outputColorSpace per target).
      sceneRT.isXRRenderTarget = true; sceneRT.texture.colorSpace = T.SRGBColorSpace;
      // ... but stored linearly: an sRGB-flagged 8-bit texture would otherwise allocate SRGB8_ALPHA8, which no longer
      // matches its multisampled renderbuffer, and the resolve blit silently fails (a black frame).
      sceneRT.texture.internalFormat = isHdr() ? 'RGBA16F' : 'RGBA8';
      if (cfg.haze) { sceneRT.depthTexture = new T.DepthTexture(w, h); sceneRT.depthTexture.type = T.UnsignedIntType; }
      let bw = Math.max(1, Math.round(w / cfg.div)), bh = Math.max(1, Math.round(h / cfg.div));
      for (let i = 0; i < cfg.levels; i++) {
        const o = {type:type(), depthBuffer:false, minFilter:T.LinearFilter, magFilter:T.LinearFilter, generateMipmaps:false};
        down.push(new T.WebGLRenderTarget(bw, bh, o)); up.push(new T.WebGLRenderTarget(bw, bh, o));
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      }
    }

    return {
      get hdr(){ return isHdr(); }, samples:maxSamples,
      tiers:Object.keys(TIERS),
      setTier(t){ if (!TIERS[t]) t = 'high'; if (t !== tier) { tier = t; cfg = TIERS[t]; disposeTargets(); } },
      get active(){ return !!cfg.on; },
      // Start of the frame: the target the scene renders into (null on Reduced).
      begin(w, h){ if (!cfg.on) return null; if (w !== W || h !== H || !sceneRT) build(w, h); return sceneRT; },
      get target(){ return cfg.on ? sceneRT : null; },
      // End of the frame: bloom, then the composite to the canvas.
      end(o){
        if (!cfg.on || !sceneRT) return;
        const night = o.night || 0, bloomK = isHdr() ? .55 + .75 * night : 1.3 * Math.min(1, Math.max(0, (night - .3) / .45)), bloomOn = cfg.bloom > 0 && bloomK > .01;
        if (bloomOn) {
          PREFILTER.uniforms.tMap.value = sceneRT.texture; PREFILTER.uniforms.uPx.value.set(1 / W, 1 / H);
          PREFILTER.uniforms.uThreshold.value = isHdr() ? 1.0 : .5; PREFILTER.uniforms.uKnee.value = isHdr() ? .3 : .12;
          draw(PREFILTER, down[0]);
          for (let i = 1; i < down.length; i++) { DOWN.uniforms.tMap.value = down[i - 1].texture; DOWN.uniforms.uPx.value.set(1 / down[i - 1].width, 1 / down[i - 1].height); draw(DOWN, down[i]); }
          let src = down[down.length - 1];
          for (let i = down.length - 2; i >= 0; i--) { UP.uniforms.tMap.value = src.texture; UP.uniforms.tBase.value = down[i].texture; UP.uniforms.uPx.value.set(1 / src.width, 1 / src.height); draw(UP, up[i]); src = up[i]; }
          COMPOSITE.uniforms.tBloom.value = src.texture;
        } else COMPOSITE.uniforms.tBloom.value = BLACK;
        const U = COMPOSITE.uniforms;
        U.tScene.value = sceneRT.texture; U.tDepth.value = sceneRT.depthTexture || BLACK; U.uUseDepth.value = sceneRT.depthTexture && cfg.haze ? 1 : 0;
        U.uBloom.value = cfg.bloom * bloomK / Math.max(1, down.length * .5); U.uHaze.value = cfg.haze * (1 - night * .6);
        U.uGrade.value = cfg.grade; U.uNight.value = night; U.uStorm.value = o.storm || 0; U.uFocus.value = o.focus || 3; U.uTime.value = o.still ? 0 : (o.time || 0) % 97;
        U.uSky.value.setRGB(o.sky[0], o.sky[1], o.sky[2]); U.uRes.value.set(W, H);
        draw(COMPOSITE, null);
      },
      info(){ return {tier, active:!!cfg.on, hdr:isHdr(), hdrCapable:hdr, samples:maxSamples, size:[W, H], bloomLevels:cfg.on ? cfg.levels : 0, haze:!!(cfg.on && cfg.haze), contactAO:!!(cfg.on && cfg.haze)}; }
    };
  };
})();
