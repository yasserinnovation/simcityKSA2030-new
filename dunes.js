// Vision Nexus 2030 — decorative sand dunes (three.js renderer).
// Replaces the old flat oval mounds with flowing dune groups: crescent (barchan) chains with horns trailing downwind,
// long sinuous transverse ridges, and low rolling sand. Every dune has an asymmetric profile — a long, gentle windward
// slope up to a readable crest and a shorter, steeper leeward (slip) face — and a whole field is one smooth height field
// on a world-aligned lattice, so neighbouring dunes join along their toes instead of intersecting, and there are no
// seams between pieces. The surface is sunk a hair below the ground and reaches it with zero slope, so each base meets
// the terrain along a clean contour: no rim, no pedestal, no z-fighting. Colour runs from the ground's own tone at the
// foot to warm slopes, sunlit crests and shaded lee faces.
//
// Everything is deterministic (seeded per field), and the full and reduced levels of detail share the same shape.
//   plan(field)               → groups: [{x, z, r, th, elems:[…]}] (no geometry); field opts below
//   build(groups, opts, emit) → emits triangles through emit(a, b, c, ca, cb, cc, na, nb, nc), counter-clockwise from above
(() => {
  'use strict';
  const rngOf = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const clamp = (t, a, b) => t < a ? a : t > b ? b : t;
  const sstep = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const hex = h => [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  // Sand palette: base #DCC398, sunlit crests #EFD6A5, warm slopes #D6AF76, shaded slopes #BC9564.
  const PAL = {base:hex('DCC398'), crest:hex('EFD6A5'), warm:hex('D6AF76'), shade:hex('BC9564')};
  const MAX_LEE = .62;   // steepest slip face (rise/run): keeps every dune face under the shader's contact-darkening angle
  const STEP = .018;     // clear-ground sampling step inside a dune (below the smallest keep-out radius)

  // One dune in its group's wind frame: u downwind, v across the wind. Returns null outside its footprint, else
  // [height, q (fraction of the dune's own height), side (-1 windward, 0 rolling, 1 leeward), t (0 crest → 1 foot)].
  // Profiles across the crest, 1 at the crest → 0 at the foot, always with zero slope at the foot (the base blends into
  // the ground). Windward: a full, convex back rising to the brink. Leeward: (1-t)²(1+a·t) leaves a slope at the brink,
  // so the slip face breaks away along a readable crest line.
  const wind = t => { const q = 1 - Math.pow(t, 1.8); return q * q; };
  const prof = (t, a) => (1 - t) * (1 - t) * (1 + a * t);
  function evalElem(E, u, v){
    u -= E.u; v -= E.v;
    const sv = v / E.hw; if (sv <= -1 || sv >= 1) return null;
    const env = 1 - sv * sv, roll = E.kind === 'roll', cres = E.kind === 'crescent';
    const e = cres ? Math.pow(env, .95) : Math.pow(env, roll ? .9 : .7);                    // crescents taper into horns, ridges into soft tips
    const w = cres ? .5 + .5 * Math.sqrt(env) : .45 + .55 * Math.sqrt(env);                 // slopes shorten toward the tips
    const uc = E.curv * E.hw * sv * sv + E.amp * E.hw * Math.sin(sv * E.freq + E.ph);       // crest line: horns trail downwind, ridges meander
    const d = u - uc, H = E.H * e;
    if (d < 0) { const t = -d / (E.lw * w); if (t >= 1) return null; const p = wind(t); return [H * p, e * p, roll ? 0 : -1, t]; }   // windward: long and gentle
    const a = .6, L = Math.max(E.ll * w, H * (2 - a) / MAX_LEE), t = d / L; if (t >= 1) return null;
    const p = roll ? wind(t) : lee(d, L, a); return [H * p, e * p, roll ? 0 : 1, t];   // leeward: short and steeper; rolling sand: rounded
  }
  // The brink is rounded over a small fixed width (a parabola that turns the flat windward top into the slip face), so the
  // crest reads as one clean line on the lattice instead of a sawtooth; beyond it the slip-face profile carries on.
  const BRINK = .012;
  function lee(d, L, a){
    const r = Math.min(BRINK, L * .2), s0 = (2 - a) / (L - r);
    if (d < 2 * r) return 1 - s0 * d * d / (4 * r);
    const p = prof((d - r) / (L - r), a);
    return d < 4 * r ? p + (1 - s0 * r - prof(r / (L - r), a)) * (1 - sstep(2 * r, 4 * r, d)) : p;
  }
  // Smooth union, so overlapping dunes merge along a soft saddle instead of a crease. The blend radius shrinks to zero
  // as either dune does, so the surface stays continuous where one dune's footprint begins.
  const smax = (a, b, k) => { const kk = k * Math.min(1, Math.min(a, b) / k), m = Math.max(a, b), d = kk - Math.abs(a - b); return kk > 0 && d > 0 ? m + d * d / (4 * kk) : m; };
  // Extent of one dune in the wind frame (for footprints, tests and the grid).
  function extent(E){
    const bend = (Math.abs(E.curv) + E.amp) * E.hw;
    return [E.u - E.lw - bend, E.u + Math.max(E.ll, E.H * 1.4 / MAX_LEE) + bend, E.v - E.hw, E.v + E.hw];
  }

  // field: {seed, groups, sample(R) → [x, z], wind(x, z) → angle (0 = +x, downwind), kinds:[[kind, weight]…],
  //   H:[min, max], len:[min, max] (crest half-length), gap (flat sand between groups), test(x, z) → clear ground}
  function plan(f){
    const R = rngOf(f.seed), out = [], total = f.kinds.reduce((s, k) => s + k[1], 0);
    const pick = () => { let w = R() * total; for (const [k, p] of f.kinds) if ((w -= p) <= 0) return k; return f.kinds[0][0]; };
    const between = ([a, b]) => a + R() * (b - a);
    for (let tries = 0; tries < f.groups * 40 && out.length < f.groups; tries++) {
      const [cx, cz] = f.sample(R); if (!f.test(cx, cz)) continue;
      if (out.some(g => g.circles.some(a => Math.hypot(a[0] - cx, a[1] - cz) < a[2] + f.gap))) continue;   // inside a placed group: skip early
      const th = f.wind(cx, cz) + (R() - .5) * .14, kind = pick(), cs = Math.cos(th), sn = Math.sin(th), elems = [];
      const toWorld = (u, v) => [cx + u * cs - v * sn, cz + u * sn + v * cs];
      const H0 = between(f.H), len0 = between(f.len);
      const make = (k, u, v, hk, lk) => {
        const H = H0 * hk * (.85 + R() * .3), hw = len0 * lk * (.85 + R() * .3);
        if (k === 'crescent') return {kind:k, u, v, H, hw, lw:hw * (1.05 + R() * .3), ll:hw * (.32 + R() * .1), curv:.3 + R() * .2, amp:.03 * R(), freq:2, ph:R() * 6.283};
        if (k === 'ridge') return {kind:k, u, v, H, hw, lw:hw * (.62 + R() * .22), ll:hw * (.2 + R() * .06), curv:(R() - .5) * .22, amp:.04 + R() * .05, freq:1.5 + R() * 1.2, ph:R() * 6.283};
        return {kind:'roll', u, v, H:H * .38, hw:hw * 1.3, lw:hw * (.75 + R() * .25), ll:hw * (.55 + R() * .2), curv:(R() - .5) * .5, amp:.08 + R() * .08, freq:1.6 + R() * 1.4, ph:R() * 6.283};
      };
      if (kind === 'crescent') {          // a chain of barchans, staggered across the wind so horns reach toward the next toe
        const n = 2 + Math.floor(R() * 2.6), step = len0 * 1.5;
        for (let i = 0; i < n; i++) { const mid = i === Math.floor(n / 2);
          elems.push(make('crescent', (R() - .5) * len0 * .7 + (i % 2) * len0 * .45, (i - (n - 1) / 2) * step + (R() - .5) * len0 * .3, mid ? 1 : .7 + R() * .25, mid ? 1 : .75 + R() * .2)); }
        if (R() < .5) elems.push(make('roll', -len0 * (1.2 + R() * .3), (R() - .5) * len0, .9, 1.2));
      } else if (kind === 'ridge') {      // a train of long sinuous ridges, each downwind of the last so their slopes join
        const n = 1 + Math.floor(R() * (f.train || 3.2)); let u = 0;
        for (let i = 0; i < n; i++) { const a = make('ridge', u, (R() - .5) * len0 * .45, i ? .65 + R() * .35 : 1, i ? .7 + R() * .35 : 1); elems.push(a);
          // the crest carries on along the wind-normal through low saddles (each a little up- or downwind of the last), so
          // ridges run on as long sinuous lines that fade out toward their ends
          for (const sgn of [-1, 1]) for (let p = a, k = 0; k < (f.chain || 1) && R() < .6; k++) {
            const b = make('ridge', p.u + (R() - .5) * p.lw * .45, 0, .55 + R() * .3, .6 + R() * .35); b.H = Math.min(b.H, p.H * .92);
            b.v = p.v + sgn * (p.hw + b.hw) * (.58 + R() * .08); elems.push(b); p = b; }
          u += (a.ll + a.lw) * (.78 + R() * .2); }
        if (R() < .6) elems.push(make('roll', -elems[0].lw * (1 + R() * .3), (R() - .5) * len0, .9, .9));
      } else {                            // low rolling sand: soft swells with rounded crests
        const n = 1 + Math.floor(R() * 2.5);
        for (let i = 0; i < n; i++) elems.push(make('roll', i * len0 * (.8 + R() * .3), (R() - .5) * len0 * .9, 1, .9 + R() * .4));
      }
      // Every dune must sit on clear ground (land, off roads, parcels, mountains, props): shorten it, else drop it.
      // (sampled wherever the dune has sand, on a grid finer than the smallest keep-out radius, so no prop or road edge
      // hides inside it; f.test already carries each keep-out's clearance)
      const ok = E => { const [u0, u1, v0, v1] = extent(E), nu = clamp(Math.ceil((u1 - u0) / STEP), 4, 48), nv = clamp(Math.ceil((v1 - v0) / STEP), 4, 64);
        for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const u = u0 + (u1 - u0) * i / nu, v = v0 + (v1 - v0) * j / nv;
          if (evalElem(E, u, v) && !f.test(...toWorld(u, v))) return false; }
        return true; };
      const kept = [];
      for (const E of elems) { let good = ok(E);
        for (let i = 0; i < 3 && !good; i++) { E.hw *= .75; E.lw *= .85; E.ll *= .85; E.H *= .9; good = ok(E); }
        if (good) kept.push(E); }
      if (!kept.length) continue;
      // Footprint: a row of circles along each dune's crest (world space). Groups keep a band of flat sand between their
      // bodies; their faint outer toes may meet and merge (the field is one height field).
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; const circles = [];
      for (const E of kept) { const e = extent(E); u0 = Math.min(u0, e[0]); u1 = Math.max(u1, e[1]); v0 = Math.min(v0, e[2]); v1 = Math.max(v1, e[3]);
        const uw = (e[1] - e[0]) / 2, n = clamp(Math.ceil((e[3] - e[2]) / (2 * uw)), 1, 5), hv = (e[3] - e[2]) / (2 * n);
        for (let k = 0; k < n; k++) circles.push([...toWorld((e[0] + e[1]) / 2, e[2] + (2 * k + 1) * hv), Math.hypot(uw, hv) * (f.core || .75)]); }
      if (out.some(g => g.circles.some(a => circles.some(b => Math.hypot(a[0] - b[0], a[1] - b[1]) < a[2] + b[2] + f.gap)))) continue;
      const [gx, gz] = toWorld((u0 + u1) / 2, (v0 + v1) / 2);
      for (const E of kept) Object.assign(E, {cx, cz, cs, sn, box:boxOf(E, toWorld)});
      out.push({x:gx, z:gz, r:Math.hypot(u1 - u0, v1 - v0) / 2, th, elems:kept, circles});
    }
    return out;
  }

  // World-space bounding box of one dune.
  function boxOf(E, toWorld){ const [u0, u1, v0, v1] = extent(E), P = [toWorld(u0, v0), toWorld(u1, v0), toWorld(u1, v1), toWorld(u0, v1)];
    return [Math.min(...P.map(p => p[0])), Math.max(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[1]))]; }
  // Height of the whole field at a world point, with each contributing dune's shading inputs.
  function evalAt(list, x, z){
    let h = 0; const parts = [];
    for (const E of list) { const b = E.box; if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
      const dx = x - E.cx, dz = z - E.cz, r = evalElem(E, dx * E.cs + dz * E.sn, -dx * E.sn + dz * E.cs); if (!r) continue;
      h = parts.length ? smax(h, r[0], E.H * .35) : r[0]; parts.push(r); }
    return [h, parts];
  }

  // groups: from plan(); o: {cell, y (ground surface), sink, ground(x, z) → colour}. One sparse lattice for all of them,
  // aligned to world x/z, so the full and reduced meshes and every group share one continuous surface.
  function build(groups, o, emit){
    const c = o.cell, sink = o.sink, elems = groups.flatMap(g => g.elems), BIN = .25, bins = new Map(), cells = new Set();
    for (const E of elems) { const b = E.box;   // spatial bins of dunes, and the lattice cells each dune may touch
      for (let i = Math.floor(b[0] / BIN); i <= Math.floor(b[1] / BIN); i++) for (let j = Math.floor(b[2] / BIN); j <= Math.floor(b[3] / BIN); j++) { const k = i + ',' + j; if (!bins.has(k)) bins.set(k, []); bins.get(k).push(E); }
      for (let i = Math.floor(b[0] / c); i <= Math.ceil(b[1] / c); i++) for (let j = Math.floor(b[2] / c); j <= Math.ceil(b[3] / c); j++) cells.add(i + ',' + j); }
    const near = (x, z) => bins.get(Math.floor(x / BIN) + ',' + Math.floor(z / BIN)) || [];
    const hs = new Map(), H = (i, j) => { const k = i + ',' + j; let v = hs.get(k); if (!v) { const x = i * c, z = j * c; v = evalAt(near(x, z), x, z); hs.set(k, v); } return v; };
    const verts = new Map(), vert = (i, j) => {
      const k = i + ',' + j; let V = verts.get(k); if (V) return V;
      const x = i * c, z = j * c, [h, parts] = H(i, j);
      // smooth normal from the height field, eased to straight up at the foot so the base lights exactly like the ground
      const hx = (H(i + 1, j)[0] - H(i - 1, j)[0]) / (2 * c), hz = (H(i, j + 1)[0] - H(i, j - 1)[0]) / (2 * c), f = sstep(sink, sink + .004, h);
      let n = [-hx * f, 1, -hz * f]; const l = Math.hypot(n[0], n[1], n[2]); n = [n[0] / l, n[1] / l, n[2] / l];
      verts.set(k, V = {p:[x, o.y + h - sink, z], c:colourAt(x, z, parts, o), n, h}); return V;
    };
    let tris = 0;
    for (const key of cells) {
      const [i, j] = key.split(',').map(Number), h00 = H(i, j)[0], h10 = H(i + 1, j)[0], h11 = H(i + 1, j + 1)[0], h01 = H(i, j + 1)[0];
      if (h00 < sink && h10 < sink && h11 < sink && h01 < sink) continue;   // fully under the ground
      const a = vert(i, j), b = vert(i + 1, j), cc = vert(i + 1, j + 1), d = vert(i, j + 1);
      // split each cell along the diagonal whose midpoint best matches the true surface at the cell centre, so crests stay
      // continuous lines and the shading carries no dotted, cell-by-cell pattern along them
      const hc = evalAt(near((i + .5) * c, (j + .5) * c), (i + .5) * c, (j + .5) * c)[0];
      const quad = Math.abs((a.h + cc.h) / 2 - hc) <= Math.abs((b.h + d.h) / 2 - hc) ? [[a, d, cc], [a, cc, b]] : [[a, d, b], [b, d, cc]];   // counter-clockwise from above (+y)
      for (const [p, q, r] of quad) { if (p.h < sink && q.h < sink && r.h < sink) continue; emit(p.p, q.p, r.p, p.c, q.c, r.c, p.n, q.n, r.n); tris++; }
    }
    return tris;
  }

  // Colour: the ground's own tone at the foot, then warm slopes, a light sunlit crest and a softly shaded lee.
  // The palette is tinted halfway toward the local ground, so dunes sit in their region's light instead of on top of it.
  function colourAt(x, z, parts, o){
    const g = o.ground(x, z); if (!parts || !parts.length) return g;
    const tint = [0, 1, 2].map(i => 1 + (clamp(g[i] / PAL.base[i], .86, 1.14) - 1) * .55), T = c => [c[0] * tint[0], c[1] * tint[1], c[2] * tint[2]];
    const base = T(PAL.base), warm = T(PAL.warm), crest = T(PAL.crest), lee = mix(base, T(PAL.shade), .42);
    // where dunes overlap, each one's colour is weighted by its height, so the merge has no seam
    let sum = [0, 0, 0], wsum = 0, qmax = 0;
    for (const [h, q, side, t] of parts) {
      let d;
      if (side === 0) d = mix(base, crest, q * .25);                                                                  // rolling sand
      // windward: a soft warm mid-slope (never a band at the foot), then base sand and a light band below the brink
      else { d = mix(mix(base, warm, .45 * sstep(.15, .45, q) * (1 - sstep(.5, .85, q))), crest, sstep(.7, 1, q) * (1 - sstep(0, .3, t)) * .9);
        if (side > 0) d = mix(mix(crest, lee, sstep(0, .45, t)), base, sstep(.5, 1, t) * .7); }                      // leeward: crest light → shaded slip face → base at the foot
      const w = h * h * h + 1e-12; sum = [sum[0] + d[0] * w, sum[1] + d[1] * w, sum[2] + d[2] * w]; wsum += w; qmax = Math.max(qmax, q);
    }
    return mix(g, [sum[0] / wsum, sum[1] / wsum, sum[2] / wsum], sstep(0, .45, qmax));
  }

  window.VisionDunes = {plan, build, PAL};
})();
