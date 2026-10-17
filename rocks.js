// Vision Nexus 2030 — decorative rock formations (shared by both renderers).
// Replaces the old "round blob + cone" mountains with stylised low-poly formations: connected ridges with several peaks
// and saddles, flat-topped sandstone mesas and buttes with layered cliffs, and low desert outcrops. Each formation is a
// small radial height field whose outer ring sits at ground level, so the base fades into the terrain instead of
// standing on a round pedestal. Faces are flat-shaded (angular rock) and coloured per face: deeper cliffs, lighter
// sunlit ledges, sandstone strata, optional greenery on lower slopes and snow on high peaks.
//
// Everything is deterministic: the shape comes from a seed derived from the position (plus an optional salt), so the
// scenery is identical between reloads, and the full and reduced levels of detail share the same shape.
//   plan(opts)            → spec: footprint, orientation, kind and shape parameters (no geometry)
//   build(spec, opts, tri) → emits triangles through tri(a, b, c, colour), a, b, c = [x, y, z], counter-clockwise from above
(() => {
  'use strict';
  const rngOf = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const seedAt = (x, z, salt) => (Math.imul(Math.round(x * 8192), 73856093) ^ Math.imul(Math.round(z * 8192), 19349663) ^ Math.imul(Math.round(salt * 1e6) + 7, 83492791)) | 0;
  const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
  const sstep = (a, b, t) => { t = clamp01((t - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shade = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  const SAND = [.92, .83, .67], DEEP = [.52, .33, .24], GREEN = [.33, .52, .28], SNOW = [.95, .95, .97];
  const TAU = Math.PI * 2;

  // Level of detail: sectors around the formation and ring radii (fraction of the footprint; the last ring is the base).
  const LOD = {
    ridge:   {hi:{n:14, rings:[.17, .36, .54, .70, .85, 1]}, lo:{n:8, rings:[.42, .76, 1]}},
    peak:    {hi:{n:12, rings:[.16, .34, .54, .74, .89, 1]}, lo:{n:7, rings:[.4, .75, 1]}},
    outcrop: {hi:{n:10, rings:[.3, .58, .82, 1]},             lo:{n:6, rings:[.5, 1]}}
  };

  function plan({x, z, r, h, rot = null, salt = 0, kinds = [['ridge', 1]], aspect = [1.4, 2], wk = 1, test = null}){
    const R = rngOf(seedAt(x, z, salt));
    let w = R() * kinds.reduce((s, k) => s + k[1], 0), kind = kinds[0][0];
    for (const [k, p] of kinds) { if ((w -= p) <= 0) { kind = k; break; } }
    const a = aspect[0] + R() * (aspect[1] - aspect[0]), ang = rot == null ? R() * Math.PI : rot + (R() - .5) * .8;
    let len = r * a * wk * (kind === 'butte' ? .8 : 1.1), wid = r * wk * (.88 + R() * .2) * (kind === 'butte' ? .85 : 1);
    if (len < wid) len = wid;
    // Keep the tips of long formations off roads, parcels and the coast: shorten until both ends are clear.
    const cs = Math.cos(ang), sn = Math.sin(ang);
    if (test) for (let i = 0; i < 5 && len > wid * 1.02; i++) { const e = len * .8;
      if (test(x + cs * e, z + sn * e) && test(x - cs * e, z - sn * e)) break; len = Math.max(wid, len * .82); }
    const S = {x, z, h, len, wid, rot:ang, kind, seed:seedAt(x, z, salt + .5)};
    // Footprint irregularity (no round bases): a few low-frequency bumps around the rim.
    S.rim = [R() * TAU, R() * TAU, .1 + R() * .08, .05 + R() * .06];
    if (kind === 'ridge' || kind === 'peak' || kind === 'outcrop') {
      const np = kind === 'peak' ? 1 + (R() < .5 ? 1 : 0) : kind === 'outcrop' ? 1 + (R() < .5 ? 1 : 0) : 2 + Math.floor(R() * 2.6), main = Math.floor(R() * np);
      S.peaks = Array.from({length:np}, (_, i) => {
        const p = np === 1 ? (R() - .5) * .2 : -.58 + 1.16 * (i + .5) / np + (R() - .5) * .28 / np;
        const s = kind === 'peak' ? .34 + R() * .1 : (.5 / np + .16) * (.8 + R() * .4);
        return [p, i === main ? 1 : .48 + R() * .38, s]; });
      S.wander = (kind === 'ridge' ? .2 : .1) * R(); S.ph = R() * TAU;
      S.latK = kind === 'peak' ? 1.35 + R() * .3 : 1.1 + R() * .45;   // >1: sharp crests, concave flanks
      S.gk = 3 + Math.floor(R() * 3); S.gp = R() * TAU; S.gul = kind === 'outcrop' ? .1 : .2 + R() * .12;
      S.shoulder = kind === 'outcrop' ? .5 : .26 + R() * .14;
    } else {   // mesa / butte: flat top, cliff, optional ledge, talus apron
      S.rt = kind === 'butte' ? .3 + R() * .12 : .4 + R() * .18;
      S.tier = R() < .5;
    }
    S.bands = 5 + Math.floor(R() * 3); S.bandPh = R() * TAU;
    S.spots = [];
    for (let i = 0; i < 3; i++) { const t = R() * TAU, k = .78 + R() * .12, u = Math.cos(t) * len * k, v = Math.sin(t) * wid * k; S.spots.push([x + u * cs - v * sn, z + u * sn + v * cs]); }
    return S;
  }

  // Normalised height (0..1) of a ridge-like formation at local (u, v) = rho·(cos phi, sin phi).
  function ridgeH(S, u, v, rho, phi){
    let crest = S.shoulder * (1 - u * u);
    for (const [p, hh, s] of S.peaks) crest = Math.max(crest, hh * Math.exp(-(((u - p) / s) ** 2)));
    const vc = S.wander * Math.sin(u * 2.3 + S.ph) * (1 - u * u), d = Math.abs(v - vc) / (1 - Math.abs(vc));
    const lat = Math.pow(Math.max(0, 1 - d), S.latK), edge = sstep(1, .55, rho);
    const gully = 1 - S.gul * Math.max(0, Math.sin(phi * S.gk + S.gp)) ** 2 * sstep(.2, .7, rho);
    return crest * lat * edge * gully;
  }
  // Mesa profile: ring radii and their heights (flat top, cliff, optional ledge, concave talus to the ground).
  function mesaRings(S, lod){
    const rt = S.rt;
    if (lod === 'lo') return {n:7, rings:[rt, rt + .1, 1], hs:[1, .36, 0]};
    return S.tier ? {n:12, rings:[rt * .55, rt, rt + .06, rt + .12, rt + .19, rt + .19 + (.81 - rt) * .45, 1], hs:[1, 1, .66, .6, .3, .1, 0]}
                  : {n:12, rings:[rt * .55, rt, rt + .07, rt + .07 + (.93 - rt) * .38, 1], hs:[1, 1, .42, .13, 0]};
  }

  function build(S, {lod = 'hi', y = 0, col, ground = col, strata = .3, veg = 0, snow = 0}, tri){
    const R = rngOf(S.seed ^ (lod === 'hi' ? 0x51ed : 0x2b79)), flat = S.kind === 'mesa' || S.kind === 'butte';
    const L = flat ? mesaRings(S, lod) : LOD[S.kind === 'peak' ? 'peak' : S.kind === 'outcrop' ? 'outcrop' : 'ridge'][lod];
    const n = L.n, rings = L.rings, cs = Math.cos(S.rot), sn = Math.sin(S.rot), [ra, rb, rk1, rk2] = S.rim;
    const jit = flat ? .05 : .12, P = [], H = [];
    const put = (rho, phi, last) => {
      const k = 1 + rk1 * Math.sin(2 * phi + ra) + rk2 * Math.sin(3 * phi + rb);
      const u = Math.cos(phi) * rho, v = Math.sin(phi) * rho, lu = u * S.len * k, lv = v * S.wid * k;
      let hN = last ? 0 : flat ? null : ridgeH(S, u, v, rho, phi);
      P.push([S.x + lu * cs - lv * sn, 0, S.z + lu * sn + lv * cs]); H.push(hN);
    };
    // Centre, then rings × sectors (interior vertices jittered so faces read as broken rock, not a lathe).
    const dphi = TAU / n;
    put(0, 0, false); if (flat) H[0] = 1;
    rings.forEach((rho, i) => { const last = i === rings.length - 1;
      for (let j = 0; j < n; j++) {
        const phi = j * dphi + (last ? (R() - .5) * .3 : (R() - .5) * .5) * dphi, rr = last ? rho : rho + (R() - .5) * .04;
        put(rr, phi, last);
        if (flat && !last) H[H.length - 1] = L.hs[i] * (i < 2 ? 1 - R() * .035 : 1 + (R() - .5) * .14);
      } });
    if (!flat) { const top = Math.max(...H) || 1; for (let i = 1; i < H.length; i++) if (H[i] > 0) H[i] = Math.min(1, H[i] / top * (1 + (R() - .5) * jit)); H[0] = Math.min(1, H[0] / top); }
    const hMul = flat ? S.h * .78 : S.h;
    for (let i = 0; i < P.length; i++) P[i][1] = y + H[i] * hMul - (H[i] === 0 ? .0015 : 0);   // base ring tucked just under the ground

    const cliff = shade(mix(col, DEEP, .25), .93), top = mix(col, SAND, .45);
    const face = (a, b, c) => {
      let A = P[a], B = P[b], C = P[c];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
      if (ny < 0) { [B, C] = [C, B]; ny = -ny; }
      ny /= l;
      const t = ((A[1] + B[1] + C[1]) / 3 - y) / hMul, steep = sstep(.92, .5, ny);
      const mx = (A[0] + B[0] + C[0]) / 3 - S.x, mz = (A[2] + B[2] + C[2]) / 3 - S.z;
      let c0 = shade(col, .97 + R() * .06);
      c0 = mix(c0, cliff, steep * .42);
      c0 = mix(c0, top, sstep(.8, .97, ny) * sstep(.12, .4, t) * .5);
      if (strata) { const b = Math.floor(t * S.bands + .35 * Math.sin((mx * cs + mz * sn) / S.len * 2.5 + S.bandPh));
        c0 = shade(c0, 1 + (b % 2 ? -.075 : .045) * strata * (.35 + .65 * steep)); if (b % 3 === 2) c0 = mix(c0, SAND, .14 * strata * steep); }
      if (veg) { const g = sstep(.6, .36, t + (R() - .5) * .16) * sstep(.22, .6, ny); c0 = mix(c0, shade(GREEN, .88 + R() * .22), g * veg * .95); }
      if (snow && t > .66 + R() * .08 && ny > .12) c0 = mix(c0, SNOW, .9);
      c0 = mix(c0, ground, sstep(.24, 0, t) * .75);   // the lowest faces take on the ground colour: no visible pedestal
      tri(A, B, C, c0);
    };
    for (let j = 0; j < n; j++) face(0, 1 + j, 1 + (j + 1) % n);
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
      const a = 1 + i * n + j, b = 1 + i * n + (j + 1) % n, c = 1 + (i + 1) * n + (j + 1) % n, d = 1 + (i + 1) * n + j;
      if ((i + j) % 2) { face(a, d, c); face(a, c, b); } else { face(a, d, b); face(b, d, c); }
    }
  }

  window.VisionRocks = {plan, build};
})();
