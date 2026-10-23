// Builds the "Vision Guide": an original stylized explorer character, rigged (8 bones, rigid skinning, one draw call)
// with Idle, Walk and Cheer clips, and exports it as a binary glTF. Run by tools/make-character.js in a headless browser.
// Facing +Z, about 1 unit tall (the game rescales it from the manifest height), vertex-coloured PBR material.
import * as T from 'three';
import {GLTFExporter} from './GLTFExporter.js';
import {mergeVertices} from '/vendor/three/addons/utils/BufferGeometryUtils.js';

const PAL = {suit:[.94, .93, .89], jacket:[.07, .50, .36], trim:[.93, .72, .30], skin:[.80, .58, .43], visor:[.08, .24, .32], boot:[.13, .29, .31], glow:[.55, .95, .88]};

export function buildGuide(){
  // ---- skeleton (rest pose, model space)
  const bone = (name, x, y, z, parent) => { const b = new T.Bone(); b.name = name; b.position.set(x, y, z); if (parent) parent.add(b); return b; };
  const root = bone('root', 0, 0, 0), hips = bone('hips', 0, .40, 0, root), spine = bone('spine', 0, .10, 0, hips), head = bone('head', 0, .25, 0, spine);
  const armL = bone('armL', .15, .20, 0, spine), armR = bone('armR', -.15, .20, 0, spine), legL = bone('legL', .075, -.02, 0, hips), legR = bone('legR', -.075, -.02, 0, hips);
  const bones = [root, hips, spine, head, armL, armR, legL, legR], BI = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  root.updateMatrixWorld(true);
  const at = name => new T.Vector3().setFromMatrixPosition(bones[BI[name]].matrixWorld);

  // ---- geometry: every part is welded to one bone
  const P = [], N = [], C = [], SI = [], SW = [], IX = [];
  function part(geo, col, boneName, pos, scale = [1, 1, 1], rot = [0, 0, 0]){   // primitives keep their smooth normals and index
    const m = new T.Matrix4().compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(...rot)), new T.Vector3(...scale)); geo.applyMatrix4(m);
    const p = geo.attributes.position.array, n = geo.attributes.normal.array, b = BI[boneName], base = P.length / 3;
    for (let i = 0; i < p.length; i += 3) { P.push(p[i], p[i + 1], p[i + 2]); N.push(n[i], n[i + 1], n[i + 2]); C.push(...col); SI.push(b, 0, 0, 0); SW.push(1, 0, 0, 0); }
    const ix = geo.index ? geo.index.array : [...Array(p.length / 3).keys()]; for (const i of ix) IX.push(base + i);
  }
  const H = at('hips'), S = at('spine'), Hd = at('head'), AL = at('armL'), AR = at('armR'), LL = at('legL'), LR = at('legR');
  for (const [L, nm] of [[LL, 'legL'], [LR, 'legR']]) {
    part(new T.CapsuleGeometry(.058, .17, 4, 10), PAL.suit, nm, [L.x, L.y - .14, L.z]);
    part(new T.SphereGeometry(.075, 12, 8), PAL.boot, nm, [L.x, L.y - .315, L.z + .02], [1, .62, 1.35]);
    part(new T.CylinderGeometry(.062, .062, .025, 12), PAL.trim, nm, [L.x, L.y - .245, L.z]);
  }
  part(new T.CapsuleGeometry(.15, .13, 6, 14), PAL.jacket, 'spine', [S.x, S.y + .07, S.z], [1, 1, .86]);               // torso
  part(new T.CylinderGeometry(.152, .152, .035, 16), PAL.trim, 'hips', [H.x, H.y + .03, H.z], [1, 1, .87]);             // belt
  part(new T.SphereGeometry(.03, 10, 8), PAL.glow, 'spine', [S.x, S.y + .12, S.z + .13]);                               // chest light
  part(new T.BoxGeometry(.17, .19, .08), PAL.suit, 'spine', [S.x, S.y + .09, S.z - .14]);                               // backpack
  part(new T.BoxGeometry(.13, .025, .085), PAL.trim, 'spine', [S.x, S.y + .15, S.z - .14]);
  for (const [A, nm, sx] of [[AL, 'armL', 1], [AR, 'armR', -1]]) {
    part(new T.CapsuleGeometry(.045, .15, 4, 10), PAL.jacket, nm, [A.x + sx * .025, A.y - .11, A.z]);
    part(new T.SphereGeometry(.05, 10, 8), PAL.suit, nm, [A.x + sx * .03, A.y - .24, A.z]);                              // glove
    part(new T.CylinderGeometry(.048, .048, .02, 10), PAL.trim, nm, [A.x + sx * .027, A.y - .19, A.z]);
  }
  part(new T.SphereGeometry(.2, 20, 14), PAL.skin, 'head', [Hd.x, Hd.y + .16, Hd.z]);                                   // head
  part(new T.SphereGeometry(.212, 20, 10, 0, Math.PI * 2, 0, Math.PI * .5), PAL.suit, 'head', [Hd.x, Hd.y + .175, Hd.z - .01]);   // helmet shell
  part(new T.TorusGeometry(.205, .018, 6, 28), PAL.trim, 'head', [Hd.x, Hd.y + .18, Hd.z - .01], [1, 1, 1], [Math.PI / 2, 0, 0]);  // helmet rim
  part(new T.SphereGeometry(.1, 16, 10), PAL.visor, 'head', [Hd.x, Hd.y + .15, Hd.z + .135], [1.45, .55, .55]);         // visor
  part(new T.CylinderGeometry(.008, .008, .12, 6), PAL.suit, 'head', [Hd.x + .1, Hd.y + .38, Hd.z - .04]);              // antenna
  part(new T.SphereGeometry(.022, 10, 8), PAL.glow, 'head', [Hd.x + .1, Hd.y + .45, Hd.z - .04]);

  let g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); g.setAttribute('color', new T.Float32BufferAttribute(C, 3));
  g.setAttribute('skinIndex', new T.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(SW, 4));
  g.setIndex(IX); g = mergeVertices(g, 1e-5);   // weld seams inside each part
  const mat = new T.MeshStandardMaterial({vertexColors:true, roughness:.55, metalness:.05, name:'VisionGuide'});
  const mesh = new T.SkinnedMesh(g, mat); mesh.name = 'VisionGuide';
  const skeleton = new T.Skeleton(bones); mesh.add(root); mesh.bind(skeleton);
  const scene = new T.Scene(); scene.add(mesh);

  // ---- clips
  const q = (x, y, z) => new T.Quaternion().setFromEuler(new T.Euler(x, y, z)).toArray();
  const rotTrack = (name, times, eulers) => new T.QuaternionKeyframeTrack(name + '.quaternion', times, eulers.flatMap(e => q(...e)));
  const posTrack = (name, times, ys, base) => new T.VectorKeyframeTrack(name + '.position', times, ys.flatMap(y => [base.x, base.y + y, base.z]));
  const hp = hips.position.clone();
  const walkT = [0, .2, .4, .6, .8], S5 = a => [a, 0, -a, 0, a];
  const walk = new T.AnimationClip('Walk', .8, [
    rotTrack('legL', walkT, S5(-.55).map(v => [v, 0, 0])), rotTrack('legR', walkT, S5(.55).map(v => [v, 0, 0])),
    rotTrack('armL', walkT, S5(.5).map(v => [v, 0, .08])), rotTrack('armR', walkT, S5(-.5).map(v => [v, 0, -.08])),
    rotTrack('spine', walkT, S5(.07).map(v => [.05, v, 0])), rotTrack('head', walkT, S5(-.05).map(v => [-.03, v, 0])),
    posTrack('hips', walkT, [0, .022, 0, .022, 0], hp)]);
  const idleT = [0, .6, 1.2, 1.8, 2.4];
  const idle = new T.AnimationClip('Idle', 2.4, [
    posTrack('hips', idleT, [0, -.006, 0, -.006, 0], hp), rotTrack('spine', idleT, [[0, 0, 0], [.03, 0, 0], [0, 0, 0], [.03, 0, 0], [0, 0, 0]]),
    rotTrack('armL', idleT, [[0, 0, .08], [0, 0, .12], [0, 0, .08], [0, 0, .12], [0, 0, .08]]), rotTrack('armR', idleT, [[0, 0, -.08], [0, 0, -.12], [0, 0, -.08], [0, 0, -.12], [0, 0, -.08]]),
    rotTrack('head', idleT, [[0, 0, 0], [0, .22, 0], [0, 0, 0], [0, -.22, 0], [0, 0, 0]]),
    rotTrack('legL', [0, 2.4], [[0, 0, 0], [0, 0, 0]]), rotTrack('legR', [0, 2.4], [[0, 0, 0], [0, 0, 0]])]);
  const chT = [0, .25, .5, .75, 1];
  const cheer = new T.AnimationClip('Cheer', 1, [
    rotTrack('armL', chT, [[0, 0, 2.5], [0, 0, 2.85], [0, 0, 2.5], [0, 0, 2.85], [0, 0, 2.5]]), rotTrack('armR', chT, [[0, 0, -2.5], [0, 0, -2.85], [0, 0, -2.5], [0, 0, -2.85], [0, 0, -2.5]]),
    posTrack('hips', chT, [0, .07, 0, .07, 0], hp), rotTrack('head', chT, [[-.15, 0, 0], [-.25, 0, 0], [-.15, 0, 0], [-.25, 0, 0], [-.15, 0, 0]]),
    rotTrack('legL', chT, [[0, 0, 0], [-.25, 0, 0], [0, 0, 0], [-.25, 0, 0], [0, 0, 0]]), rotTrack('legR', chT, [[0, 0, 0], [-.25, 0, 0], [0, 0, 0], [-.25, 0, 0], [0, 0, 0]]),
    rotTrack('spine', chT, [[0, 0, 0], [-.06, 0, 0], [0, 0, 0], [-.06, 0, 0], [0, 0, 0]])]);
  return {scene, mesh, clips:[idle, walk, cheer]};
}

export function exportGuide(){
  const {scene, clips} = buildGuide();
  return new Promise((res, rej) => new GLTFExporter().parse(scene, buf => res(buf), rej, {binary:true, animations:clips}));
}

// A static prop for the instancing/LOD path: a solar "palm" shade canopy (original design), about 1 unit tall.
export function buildShade(){
  const g = new T.Group(), M = (geo, col, pos, rot = [0, 0, 0], sc = [1, 1, 1], rough = .6, metal = 0) => {
    const m = new T.Mesh(geo, new T.MeshStandardMaterial({color:new T.Color(...col), roughness:rough, metalness:metal})); m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...sc); g.add(m); return m; };
  M(new T.CylinderGeometry(.42, .46, .12, 24), [.86, .80, .70], [0, .06, 0]);                       // planter
  M(new T.CylinderGeometry(.38, .38, .03, 24), [.30, .52, .30], [0, .125, 0], [0, 0, 0], [1, 1, 1], .9);
  M(new T.CylinderGeometry(.045, .07, .86, 12), [.95, .94, .90], [0, .55, 0], [0, 0, 0], [1, 1, 1], .4);   // trunk
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2;
    const leaf = M(new T.BoxGeometry(.52, .025, .2), [.10, .30, .42], [Math.cos(a) * .27, .98 - .05, Math.sin(a) * .27], [0, -a, -.28], [1, 1, 1], .22, .35);   // solar glass petal
    leaf.material.emissive = new T.Color(.02, .06, .08);
    M(new T.BoxGeometry(.54, .012, .025), [.93, .72, .30], [Math.cos(a) * .27, .99 - .05 + .01, Math.sin(a) * .27], [0, -a, -.28], [1, 1, 1], .35, .8);   // gold spine
  }
  M(new T.SphereGeometry(.07, 16, 10), [.93, .72, .30], [0, 1.0, 0], [0, 0, 0], [1, .7, 1], .3, .8);
  const scene = new T.Scene(); scene.add(g); return scene;
}
export function exportShade(){ return new Promise((res, rej) => new GLTFExporter().parse(buildShade(), buf => res(buf), rej, {binary:true})); }
