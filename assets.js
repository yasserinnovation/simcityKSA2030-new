// Vision Nexus 2030 — GLB model pipeline (build V20). Loaded by boot.js; used by the three.js renderer only.
//
// Brings authored or AI-generated models (Meshy exports included) into the procedural world without touching gameplay:
//   • assets/models/manifest.json lists models and where they appear; nothing loads until the camera first comes close
//     enough to show one, and nothing at all on Reduced;
//   • GLTFLoader with Draco, Meshopt and KTX2 (Basis) decoders, all vendored (no network);
//   • any source scale (Meshy exports in metres at arbitrary size): each model is normalised to the height or footprint the
//     manifest gives, its base centred on the ground;
//   • PBR materials lit to match the world: a sun and sky that follow day, dusk and night, a soft environment for
//     reflections, and the engine's own sun shadow map sampled by every model (props also cast into it);
//   • static props are instanced per mesh, with optional LOD files per distance band;
//   • rigged characters (SkinnedMesh + clips) are cloned per agent, walk promenades round a landmark and blend between
//     idle, walk and cheer with cross-fades; a completion burst nearby makes them cheer;
//   • textures above the tier's budget are downscaled on load (phones keep memory in check).
// Models are decorative: never in the pick pass, never written to saves, never read by the simulation.
(() => {
  'use strict';
  const BASE = './vendor/three/addons/';
  window.VisionAssets = (T, scene, env) => {
    const {SU, G, D, LY, SUN, camera} = env;
    const root = new T.Group(); root.name = 'vn-assets'; root.visible = false; scene.add(root);
    const info = {manifest:null, loaded:[], failed:[], agents:0, props:0, visibleAgents:0, state:'idle', textureLimit:0};

    // ---- lights for PBR materials (the world's own shaders ignore three.js lights)
    const sunCol = new T.Color(1, .86, .65), skyCol = new T.Color(.80, .88, 1), groundCol = new T.Color(.80, .68, .54);
    const sun = new T.DirectionalLight(sunCol.clone(), 2.4); sun.position.set(SUN[0], SUN[1], SUN[2]); root.add(sun, sun.target);
    const hemi = new T.HemisphereLight(skyCol.clone(), groundCol.clone(), 1.55); root.add(hemi);
    let envMap = null; const envMats = new Set();

    // ---- shadow receive: sample the engine's sun shadow map (same packing and bias as engine.js MESH_FS)
    const own = {uVNShadowOn:{value:0}};
    function patch(m){
      if (!m || m.userData.vnPatched || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return m;
      m.userData.vnPatched = true; if (envMap && 'envMap' in m && !m.envMap) { m.envMap = envMap; m.envMapIntensity = .45; envMats.add(m); }
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, {uShadow:SU.uShadow, uLightVP:SU.uLightVP, uTexel:SU.uTexel, uVNShadowOn:own.uVNShadowOn});
        sh.vertexShader = 'uniform mat4 uLightVP; varying vec4 vVNLight;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
          #ifdef USE_INSTANCING
            vVNLight = uLightVP * modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          #else
            vVNLight = uLightVP * modelMatrix * vec4(transformed, 1.0);
          #endif`);
        sh.fragmentShader = `uniform sampler2D uShadow; uniform float uTexel; uniform float uVNShadowOn; varying vec4 vVNLight;
          float vnUnpack(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }
          float vnShadow(){ vec3 s = vVNLight.xyz / vVNLight.w * .5 + .5;
            if (uVNShadowOn < .5 || s.x < 0. || s.x > 1. || s.y < 0. || s.y > 1. || s.z > 1.) return 1.;
            float sum = 0., b = .0016;
            #define VNTAP(i, j) sum += (s.z - b > vnUnpack(texture2D(uShadow, s.xy + vec2(i, j) * uTexel * 1.3))) ? 0. : 1.;
            VNTAP(-1.,-1.) VNTAP(-1.,0.) VNTAP(-1.,1.) VNTAP(0.,-1.) VNTAP(0.,0.) VNTAP(0.,1.) VNTAP(1.,-1.) VNTAP(1.,0.) VNTAP(1.,1.)   // unrolled, as in engine.js
            return mix(.36, 1., sum / 9.); }\n` + sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          float vnSh = vnShadow(); reflectedLight.directDiffuse *= vnSh; reflectedLight.directSpecular *= vnSh;`);
      };
      m.customProgramCacheKey = () => 'vn-glb-shadow';
      m.needsUpdate = true; return m;
    }
    // Props cast into the engine's shadow map with its depth shader (plus the object transform).
    const depthMat = inst => new T.RawShaderMaterial({uniforms:{uLightVP:SU.uLightVP, uOffset:{value:[0, 0, 0]}}, side:T.DoubleSide,
      vertexShader:`precision highp float; attribute vec3 position; ${inst ? 'attribute mat4 instanceMatrix;' : ''} uniform mat4 modelMatrix; uniform mat4 uLightVP;
        void main(){ gl_Position = uLightVP * modelMatrix * ${inst ? 'instanceMatrix * ' : ''}vec4(position, 1.0); }`, fragmentShader:env.depthFS});
    const DEPTH = [depthMat(false), depthMat(true)];

    // ---- soft contact shadow under characters (and props when sun shadows are off)
    const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(40,34,52,.55)'); r.addColorStop(.6, 'rgba(40,34,52,.22)'); r.addColorStop(1, 'rgba(40,34,52,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
    const blobMat = new T.MeshBasicMaterial({map:blobTex, transparent:true, depthWrite:false, toneMapped:false});
    const blobGeo = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

    // ---- loaders (imported on first use)
    let L = null;
    function loaders(){
      return L || (L = Promise.all([import(BASE + 'loaders/GLTFLoader.js'), import(BASE + 'loaders/DRACOLoader.js'), import(BASE + 'loaders/KTX2Loader.js'),
        import(BASE + 'libs/meshopt_decoder.module.js'), import(BASE + 'utils/SkeletonUtils.js'), import(BASE + 'environments/RoomEnvironment.js')])
        .then(([{GLTFLoader}, {DRACOLoader}, {KTX2Loader}, {MeshoptDecoder}, SkeletonUtils, {RoomEnvironment}]) => {
          const gltf = new GLTFLoader(), draco = new DRACOLoader().setDecoderPath(BASE + 'libs/draco/gltf/'), ktx2 = new KTX2Loader().setTranscoderPath(BASE + 'libs/basis/');
          if (env.renderer) { ktx2.detectSupport(env.renderer);
            const pm = new T.PMREMGenerator(env.renderer), room = new RoomEnvironment(); envMap = pm.fromScene(room, .04).texture; room.dispose?.(); pm.dispose(); }
          gltf.setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
          return {gltf, SkeletonUtils};
        }));
    }
    const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
    function limitTexture(t, max){
      const im = t && t.image; if (!im || !im.width || Math.max(im.width, im.height) <= max || t.isCompressedTexture) return;
      const k = max / Math.max(im.width, im.height), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); im.close?.(); t.image = c; t.needsUpdate = true;
    }
    const models = {}, loading = {};
    function loadModel(key){
      if (models[key]) return Promise.resolve(models[key]); if (loading[key]) return loading[key];
      const def = info.manifest.models[key]; if (!def) return Promise.reject(new Error('unknown model ' + key));
      return loading[key] = loaders().then(async ({gltf, SkeletonUtils}) => {
        const levels = [{url:def.url, from:0}].concat(def.lods || []).sort((a, b) => a.from - b.from);
        const loaded = await Promise.all(levels.map(l => gltf.loadAsync(l.url)));
        // Extra animation files (Meshy exports one GLB per animation from the same rig): their clips join the main model.
        const extra = await Promise.all((def.animations || []).map(u => gltf.loadAsync(u).then(g => g.animations).catch(() => [])));
        const maxTex = env.quality() === 'high' && innerWidth > 900 ? (def.maxTexture || 2048) : Math.min(1024, def.maxTexture || 1024); info.textureLimit = maxTex;
        const lv = loaded.map((g, i) => { const tpl = normalise(g.scene, def);
          tpl.traverse(o => { if (!o.isMesh) return; o.castShadow = o.receiveShadow = false; o.frustumCulled = !o.isSkinnedMesh;
            for (const m of [].concat(o.material)) { for (const k of TEX_KEYS) if (m[k]) { limitTexture(m[k], maxTex); m[k].anisotropy = 4; } patch(m); } });
          return {tpl, from:levels[i].from}; });
        const clips = loaded[0].animations.concat(...extra);
        return models[key] = {key, def, levels:lv, clips, SkeletonUtils, rigged:lv[0].tpl.getObjectByProperty('isSkinnedMesh', true) != null};
      }).then(m => { info.loaded.push(key); return m; }, e => { info.failed.push({key, error:String(e && e.message || e)}); console.warn('Vision Nexus assets: could not load', key, e); throw e; });
    }
    // Scale to the manifest's height (characters) or footprint (props); base centred on the origin; optional yaw fix.
    function normalise(src, def){
      src.updateMatrixWorld(true); const box = new T.Box3().setFromObject(src), size = box.getSize(new T.Vector3()), ctr = box.getCenter(new T.Vector3());
      const k = def.height ? def.height / (size.y || 1) : def.footprint ? def.footprint / (Math.max(size.x, size.z) || 1) : (def.scale || 1);
      const inner = new T.Group(); inner.add(src); src.position.sub(new T.Vector3(ctr.x, box.min.y, ctr.z)); inner.scale.setScalar(k); inner.rotation.y = (def.yaw || 0) * Math.PI / 180;
      const tpl = new T.Group(); tpl.add(inner); tpl.updateMatrixWorld(true); tpl.userData.size = size.multiplyScalar(k); return tpl;
    }

    // ---- placement helpers
    const where = at => { if (Array.isArray(at)) return {x:at[0], z:at[1], r:.02};
      const p = D.projects.find(q => q.id === at) || (LY.places || {})[at]; return p ? {x:p.x, z:p.z, r:p.foot || p.r || .03} : null; };
    const rnd = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const QRANK = {low:0, medium:1, high:2};
    const agents = [], props = [];

    function spawnCharacters(m, pl, idx){
      const c = where(pl.at); if (!c) return; const r = rnd(1009 + idx * 7919), tier = env.quality();
      const n = tier === 'high' ? pl.count || 4 : Math.ceil((pl.count || 4) / 2), h = m.def.height || .004;
      const pick = name => m.clips.find(a => a.name === name) || m.clips.find(a => new RegExp(name, 'i').test(a.name));
      const mine = [];
      for (let i = 0; i < n; i++) {
        const body = m.SkeletonUtils.clone(m.levels[0].tpl), mixer = new T.AnimationMixer(body), acts = {};
        for (const [state, name] of Object.entries(Object.assign({idle:'idle', walk:'walk', cheer:'cheer'}, m.def.clips || {}))) { const clip = pick(name); if (clip) acts[state] = mixer.clipAction(clip); }
        const blob = new T.Mesh(blobGeo, blobMat); blob.scale.setScalar(h * .9); blob.position.y = .0002; blob.renderOrder = 2;
        const g = new T.Group(); g.add(body, blob); root.add(g);
        const a = {key:m.key, g, body, blob, mixer, acts, state:null, cx:c.x, cz:c.z, rad:c.r * (pl.radius || 1) * (.85 + r() * .3), ang:r() * Math.PI * 2, dir:r() < .5 ? 1 : -1,
          speed:h * (pl.speed || .55) * (.85 + r() * .3), timer:1 + r() * 4, rng:r, cheerUntil:0, minQ:QRANK[pl.minQuality || 'medium'], showBelow:pl.showBelow || info.manifest.showBelow || 1.6};
        a.y = G + (pl.y || 0);
        a.g.position.set(a.cx + Math.cos(a.ang) * a.rad, yAt(a), a.cz + Math.sin(a.ang) * a.rad);
        setState(a, pl.behavior === 'idle' || r() < .3 ? 'idle' : 'walk', 0); agents.push(a); mine.push(a);
      }
      // Floor under each promenade: the engine's walking surfaces at 72 points round every ring of this placement, in one
      // query (a manifest y overrides it).
      if (pl.y == null && env.floorAt && mine.length) { const RING = 72, pts = [];
        for (const a of mine) for (let k = 0; k < RING; k++) { const t = k / RING * Math.PI * 2; pts.push([a.cx + Math.cos(t) * a.rad, a.cz + Math.sin(t) * a.rad]); }
        const t0 = performance.now(), ys = env.floorAt(pts); info.floorMs = +((info.floorMs || 0) + performance.now() - t0).toFixed(1);
        mine.forEach((a, i) => { a.floor = ys.slice(i * RING, (i + 1) * RING); a.g.position.y = yAt(a); }); }
    }
    // Height on the ring at the agent's angle, blended between the two nearest samples (steps of a kerb stay smooth).
    function yAt(a){ if (!a.floor) return a.y; const n = a.floor.length, f = ((a.ang / (Math.PI * 2)) % 1 + 1) % 1 * n, i = Math.floor(f) % n, k = f - Math.floor(f);
      return a.floor[i] * (1 - k) + a.floor[(i + 1) % n] * k; }
    function setState(a, s, fade = .35){
      if (!a.acts[s]) s = a.acts.idle ? 'idle' : Object.keys(a.acts)[0]; if (!s || a.state === s) return;
      const next = a.acts[s], prev = a.state && a.acts[a.state];
      next.reset().setEffectiveTimeScale(s === 'walk' ? (a.speed / ((info.manifest.models[a.key]?.height || .004) * .55)) : 1).setEffectiveWeight(1);
      if (s === 'cheer') next.setLoop(T.LoopRepeat, Infinity);
      if (prev && fade) { next.fadeIn(fade).play(); prev.fadeOut(fade); } else { if (prev) prev.stop(); next.play(); }
      a.state = s;
    }
    function spawnProps(m, pl){
      const list = (pl.instances || [{at:pl.at, yaw:pl.yaw || 0, scale:pl.scale || 1}]).map(q => ({c:where(q.at || pl.at), yaw:(q.yaw || 0) * Math.PI / 180, s:q.scale || 1, dx:q.dx || 0, dz:q.dz || 0})).filter(q => q.c);
      if (!list.length) return;
      const mats = list.map(q => new T.Matrix4().compose(new T.Vector3(q.c.x + q.dx, G + (pl.y || 0), q.c.z + q.dz), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), q.yaw), new T.Vector3(q.s, q.s, q.s)));
      const set = {levels:[], minQ:QRANK[pl.minQuality || 'medium'], showBelow:pl.showBelow || info.manifest.showBelow || 3.2, blobs:[]};
      for (const lvl of m.levels) { const group = new T.Group(); root.add(group); const ims = [];
        lvl.tpl.traverse(o => { if (!o.isMesh || o.isSkinnedMesh) return;
          // A mesh the file already instances (EXT_mesh_gpu_instancing, e.g. from gltf-transform optimize) expands into
          // one instance per placement × per file instance.
          const locals = o.isInstancedMesh ? Array.from({length:o.count}, (_, k) => { const m = new T.Matrix4(); o.getMatrixAt(k, m); return o.matrixWorld.clone().multiply(m); }) : [o.matrixWorld.clone()];
          const im = new T.InstancedMesh(o.geometry, o.material, list.length * locals.length); let n = 0;
          for (const M of mats) for (const Lm of locals) im.setMatrixAt(n++, M.clone().multiply(Lm));
          im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.userData.vnMain = o.material; group.add(im); ims.push(im); });
        set.levels.push({group, ims, from:lvl.from}); }
      const fp = Math.max(m.levels[0].tpl.userData.size.x, m.levels[0].tpl.userData.size.z);
      for (const M of mats) { const b = new T.Mesh(blobGeo, blobMat); b.applyMatrix4(M); b.scale.multiplyScalar(fp * 1.25); b.position.y = G + .0004; root.add(b); set.blobs.push(b); }
      props.push(set);
    }

    let wanted = false, started = false, base = 0; const manifests = new Map();
    // Load a manifest (the game's own once; tests and mods may add more): models merge by key, placements append.
    function loadManifest(url){
      if (manifests.has(url)) return manifests.get(url);
      const job = (async () => {
        const res = await fetch(url); if (!res.ok) { if (!info.manifest) info.state = 'no-manifest'; return; }
        const man = await res.json(), pls = man.placements || [];
        if (!info.manifest) info.manifest = {models:{}, placements:[], showBelow:man.showBelow};
        Object.assign(info.manifest.models, man.models || {}); info.manifest.placements.push(...pls);
        const first = base; base += pls.length;
        await Promise.all(pls.map((pl, i) => loadModel(pl.model).then(m => { (m.rigged && m.def.kind !== 'prop' ? spawnCharacters : spawnProps)(m, pl, first + i); }).catch(() => {})));
        info.agents = agents.length; info.props = props.reduce((n, s) => n + s.blobs.length, 0); info.state = 'ready';
      })().catch(e => { info.state = 'error'; info.failed.push({key:url, error:String(e.message || e)}); console.warn('Vision Nexus assets:', e); });
      manifests.set(url, job); return job;
    }
    function start(){ if (!started) { started = true; info.state = 'loading'; } return loadManifest(env.manifestUrl || 'assets/models/manifest.json'); }

    let pass = 'main', frame = 0;
    const api = {
      load:url => (start(), url ? loadManifest(url) : start()).then(() => api.info()), ready:() => start().then(() => api.info()),
      celebrate(x, z, r = .25){ const now = performance.now(); for (const a of agents) if (Math.hypot(a.g.position.x - x, a.g.position.z - z) < r) a.cheerUntil = now + 2600 + a.rng() * 800; },
      info:() => JSON.parse(JSON.stringify(info)),
      setManifest(url){ env.manifestUrl = url; },
      props(){ return props.map(s => ({instances:s.blobs.length, on:!!s.on, level:s.levels.findIndex(l => l.group.visible), levels:s.levels.length})); },
      // Tests: where the first agents stand, how big they are drawn and which clip leads the blend.
      agents(n = 3){ return agents.slice(0, n).map(a => { const b = new T.Box3().setFromObject(a.body), sz = b.getSize(new T.Vector3());
        return {at:[a.g.position.x, a.g.position.y, a.g.position.z], size:[sz.x, sz.y, sz.z], min:b.min.y, state:a.state, visible:a.g.visible && root.visible,
          weights:Object.fromEntries(Object.entries(a.acts).map(([k, x]) => [k, x.isRunning() ? +x.getEffectiveWeight().toFixed(2) : 0]))}; }); }
    };
    window.__visionAssets = api.info;
    return {
      api,
      celebrate:api.celebrate,
      pass(p){
        pass = p; root.visible = p !== 'pick' && wanted;
        for (const a of agents) { a.blob.visible = p === 'main'; a.body.visible = p === 'main' && a.g.visible; }
        for (const s of props) { for (const b of s.blobs) b.visible = p === 'main' && !own.uVNShadowOn.value && s.on;
          for (const lv of s.levels) for (const im of lv.ims) im.material = p === 'depth' ? DEPTH[1] : im.userData.vnMain; }
      },
      update(t, dt, o){
        const q = QRANK[env.quality()], dist = camera.dist, still = o.still;
        own.uVNShadowOn.value = o.shadows ? 1 : 0;
        const night = o.night, storm = o.storm, dusk = Math.min(1, night * 2);
        sun.intensity = 2.4 * (1 - night * .88) * (1 - storm * .5); sun.color.copy(sunCol).lerp(new T.Color(.95, .62, .55), dusk * (1 - night));
        hemi.intensity = 1.55 * (1 - night * .55); hemi.color.copy(skyCol).lerp(new T.Color(.30, .38, .70), night);
        for (const m of envMats) m.envMapIntensity = .45 * (1 - night * .7);
        wanted = q > 0 && (agents.length || props.length || !started) && dist < 3.4;
        if (q > 0 && !started && dist < 3.4) start();   // first close view on Medium/High: load on demand
        let vis = 0, stepK = dist > .9 ? 2 : 1; frame++;
        const now = performance.now(), sec = still ? 0 : dt / 1000;
        for (const a of agents) {
          const on = q >= a.minQ && dist < a.showBelow; a.g.visible = on; if (!on) continue; vis++;
          if (!still) {
            if (a.cheerUntil > now) setState(a, 'cheer'); else if (a.state === 'cheer') setState(a, 'walk');
            a.timer -= sec; if (a.timer <= 0 && a.state !== 'cheer') { const s = a.state === 'walk' ? (a.rng() < .35 ? 'idle' : 'walk') : 'walk'; setState(a, s); a.timer = s === 'idle' ? 1.5 + a.rng() * 3 : 4 + a.rng() * 7; }
            if (a.state === 'walk') { a.ang += a.dir * a.speed * sec / a.rad; a.g.position.set(a.cx + Math.cos(a.ang) * a.rad, yAt(a), a.cz + Math.sin(a.ang) * a.rad); a.body.rotation.y = Math.atan2(-Math.sin(a.ang) * a.dir, Math.cos(a.ang) * a.dir); }
            if (frame % stepK === 0) a.mixer.update(sec * stepK);   // distant agents animate at half rate
          } else if (!a.posed) { a.mixer.update(0); a.posed = true; }
        }
        info.visibleAgents = vis;
        for (const s of props) { s.on = q >= s.minQ && dist < s.showBelow; let pick = 0; s.levels.forEach((lv, i) => { if (dist >= lv.from) pick = i; });
          s.levels.forEach((lv, i) => { lv.group.visible = s.on && i === pick; }); }
      }
    };
  };
})();
