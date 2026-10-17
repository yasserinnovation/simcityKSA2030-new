// Vision Nexus 2030 — V15 Riyadh site kits (stylized, procedural; no official layouts, names or branding).
// The renderer (engine.js) calls VisionRiyadh.init(kit) with its own geometry helpers, then asks for one site at a
// time. Every site is split into parts drawn by construction stage (see engine.js buildSigMesh):
//   context (always) · prep (hoarding while prepared and built) · full (architecture, rises with construction)
//   fin (operational extras) · props (close-view life, High and Medium) · tiny (people and edge lights, High only)
// All placement is seeded (mulberry32), so a layout never changes between loads. If this file is missing, the engine
// keeps its V14 builders.
(() => {
  'use strict';
  window.VisionRiyadh = {init(K){
    const {G, LY, addBox, addCylinder, addCone, addBlob, addDome, addDisc, addStrip, polyStrip, addRod, addTri, addQuad, loft, capFan,
      addTree, addPalm, addModel, modelK, mix, shade, sig, inst, mulberry32, najdi} = K;
    const TAU = Math.PI * 2, rot2 = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
    const at = (cx, cz, a) => (u, v) => { const [x, z] = rot2(u, v, a); return [cx + x, cz + z]; };   // local (u along, v across) → world
    const paths = {};          // decorative routes for animated props (coaster trains, airside vehicles)
    // Arc-length sampling keeps car spacing constant through curves, hills and drops.
    const trackArcs = new WeakMap();
    function trackArc(pts){ if(trackArcs.has(pts))return trackArcs.get(pts);const lengths=[0];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];lengths.push(lengths[i]+Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]));}trackArcs.set(pts,lengths);return lengths; }
    function trackSample(pts,q){const lengths=trackArc(pts),distance=((q%1)+1)%1*lengths[lengths.length-1];let lo=0,hi=pts.length;while(lo+1<hi){const mid=(lo+hi)>>1;if(lengths[mid]<=distance)lo=mid;else hi=mid;}const a=pts[lo],b=pts[(lo+1)%pts.length],u=(distance-lengths[lo])/(lengths[lo+1]-lengths[lo]);return [a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u,Math.atan2(b[2]-a[2],b[0]-a[0]),Math.atan2(b[1]-a[1],Math.hypot(b[0]-a[0],b[2]-a[2]))];}
    const P = id => K.P(id);

    /* ------------------------------------------------------------------ shared shapes */
    // A plate between a root edge (a, b) and a tip edge (c, d), thickness t0 at the root and t1 at the tip (wings, fins).
    function plate(a, b, c, d, t0, t1, col, axis = 1){
      const off = (p, t) => axis === 1 ? [p[0], p[1] + t / 2, p[2]] : [p[0], p[1], p[2] + t / 2];
      const A = off(a, t0), B = off(b, t0), Cc = off(c, t1), Dd = off(d, t1), a2 = off(a, -t0), b2 = off(b, -t0), c2 = off(c, -t1), d2 = off(d, -t1);
      addQuad(A, Dd, Cc, B, col); addQuad(a2, b2, c2, d2, shade(col, .86)); addQuad(A, a2, d2, Dd, shade(col, .95)); addQuad(B, Cc, c2, b2, shade(col, .9)); addQuad(Dd, d2, c2, Cc, shade(col, .92));
    }
    // A tube along +x (engines, fuselages): stations [x, radius, centreY], n sides, colour by (station, side).
    function tubeX(st, z, n, colOf){ const rings = st.map(([x, r, y]) => Array.from({length:n}, (_, i) => { const a = i / n * TAU; return [x, y + Math.cos(a) * r, z + Math.sin(a) * r]; }));
      loft(rings, colOf); return rings; }
    // A path of points [x, y, z] drawn as a square-section rod chain.
    const rodPath = (pts, t, col, closed) => { for (let i = 1; i < pts.length + (closed ? 1 : 0); i++) addRod(pts[i - 1], pts[i % pts.length], t, col); };
    // Offset a 2D polyline sideways by o (positive = left of the direction of travel).
    const offset2 = (pts, o) => pts.map((q, i) => { const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [q[0] - (b[1] - a[1]) / L * o, q[1] + (b[0] - a[0]) / L * o]; });
    // Fence of slim posts and a top rail round a polygon (closed), with optional gaps [[i, t0, t1]] on edge i.
    function fence(poly, h, col, gaps = []){ for (let i = 0; i < poly.length; i++){ const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / .006)), rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let k = 0; k < n; k++){ const t0 = k / n, t1 = (k + 1) / n; if (gaps.some(([e, g0, g1]) => e === i && t1 > g0 && t0 < g1)) continue;
        const x = a[0] + (b[0] - a[0]) * t0, z = a[1] + (b[1] - a[1]) * t0, xm = a[0] + (b[0] - a[0]) * (t0 + t1) / 2, zm = a[1] + (b[1] - a[1]) * (t0 + t1) / 2;
        addBox(x, G, z, .0005, h, .0005, col); addBox(xm, G + h * .82, zm, L / n, .00045, .0004, col, rot); addBox(xm, G + h * .35, zm, L / n, .00035, .0003, shade(col, .92), rot); } } }
    const circlePoly = (cx, cz, r, n = 36, a0 = 0) => Array.from({length:n}, (_, i) => [cx + Math.cos(a0 + i / n * TAU) * r, cz + Math.sin(a0 + i / n * TAU) * r]);
    // Construction hoarding round a circle (with the gate facing `gate` radians), two site cabins and survey pegs.
    function hoardRing(cx, cz, r, band, gate = Math.PI / 2, cabins){ const n = Math.max(12, Math.round(TAU * r / .01));
      for (let i = 0; i < n; i++){ const a = (i + .5) / n * TAU; if (Math.abs(Math.atan2(Math.sin(a - gate), Math.cos(a - gate))) < .16) continue;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; addBox(x, G, z, TAU * r / n - .0006, .0042, .0007, [.95, .95, .93], a + Math.PI / 2); addBox(x, G + .0042, z, TAU * r / n - .0006, .0011, .0009, band, a + Math.PI / 2); }
      const [ux, uz] = cabins || [cx + Math.cos(gate + .5) * (r - .012), cz + Math.sin(gate + .5) * (r - .012)];
      for (let i = 0; i < 2; i++) { addBox(ux + i * .0085, G, uz, .0075, .0042, .0045, [.93, .94, .95]); addBox(ux + i * .0085, G + .0042, uz, .0078, .0008, .0048, [.30, .50, .72]); }
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .3; addBox(cx + Math.cos(a) * r * .55, G, cz + Math.sin(a) * r * .55, .0012, .005, .0012, [.95, .52, .18]); } }
    // Hoarding round a polygon, with the gate gap in the middle of edge `gate`, and two site cabins inside its first corner.
    function hoardPoly(poly, band, gate = 0){
      for (let e = 0; e < poly.length; e++){ const a = poly[e], b = poly[(e + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / .01)), rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
        for (let i = 0; i < n; i++){ const t = (i + .5) / n; if (e === gate && Math.abs(t - .5) < .06) continue; const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
          addBox(x, G, z, L / n - .0006, .0042, .0007, [.95, .95, .93], rot); addBox(x, G + .0042, z, L / n - .0006, .0011, .0009, band, rot); } }
      const [ux, uz] = poly[0]; for (let i = 0; i < 2; i++) { addBox(ux + .008 + i * .0085, G, uz + .007, .0075, .0042, .0045, [.93, .94, .95]); addBox(ux + .008 + i * .0085, G + .0042, uz + .007, .0078, .0008, .0048, [.30, .50, .72]); }
      for (const [x, z] of poly) addBox(x, G, z, .0014, .006, .0014, [.95, .52, .18]); }
    // Paved ground patch (polygon fan) slightly above the site ground.
    function pad(poly, y, col){ const c = poly.reduce((s, q) => [s[0] + q[0] / poly.length, s[1] + q[1] / poly.length], [0, 0]); for (let i = 0; i < poly.length; i++){ const a = poly[i], b = poly[(i + 1) % poly.length]; K.addTriN([c[0], y, c[1]], [b[0], y, b[1]], [a[0], y, a[1]], col, col, col, [0, 1, 0], [0, 1, 0], [0, 1, 0]); } }
    const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const flat = (x0, z0, x1, z1, y, col) => pad(rect(x0, z0, x1, z1), y, col);

    /* ------------------------------------------------------------------ instanced prototypes */
    // Built once at the origin by the engine (proto()); dy = the height the prototype stands on. Units are world units,
    // so instance scale 1 = the sizes below. Vehicles point along +x. Neutral colours, no liveries or branding.
    const W = [.96, .96, .95], GREY = [.62, .64, .66], GLASS = [.30, .38, .46], TYRE = [.16, .16, .17], YEL = [.96, .78, .22];
    // Passenger aircraft, 1 unit long, nose +x: fuselage with an upswept tail, low swept wings with dihedral, two
    // underwing engines on pylons, tailplane, fin, cheatline and windscreen, nose and main gear.
    function aircraftRaw(){
      const white = [.96, .96, .95], belly = [.80, .82, .85], tailC = [.66, .73, .80], cheat = [.56, .63, .71], dark = [.20, .23, .28], eng = [.86, .87, .88];
      const st = [[-.5, .008, .108], [-.46, .02, .102], [-.38, .034, .094], [-.26, .046, .086], [-.1, .052, .082], [.1, .052, .082], [.26, .052, .082], [.36, .048, .082], [.42, .040, .081], [.46, .030, .079], [.49, .016, .077], [.505, .003, .075]];
      const n = 12, rings = tubeX(st, 0, n, (r, i) => { const cy = Math.cos((i + .5) / n * TAU); if (r === 9 && cy > .25) return dark; if (r >= 2 && r <= 7 && Math.abs(cy - .26) < .1) return cheat; return cy < -.3 ? belly : white; });
      capFan(rings[0], white); capFan(rings[rings.length - 1], white);
      for (const s of [-1, 1]) {
        plate([.13, .066, 0], [-.11, .066, 0], [-.21, .082, s * .47], [-.135, .082, s * .47], .014, .004, [.88, .89, .90]);            // wing
        plate([-.355, .112, 0], [-.47, .112, 0], [-.52, .118, s * .175], [-.455, .118, s * .175], .007, .003, [.88, .89, .90]);          // tailplane
        const ez = s * .17, er = tubeX([[-.02, .018, .046], [0, .026, .046], [.04, .029, .046], [.11, .029, .046], [.14, .027, .046]], ez, 10, () => eng);
        capFan(er[0], [.55, .56, .58]); capFan(er[er.length - 1], [.24, .25, .27]);                                                         // exhaust, intake
        addBox(.04, .058, ez, .07, .012, .006, eng);                                                                                     // pylon
        addBox(-.03, 0, s * .065, .02, .06, .008, GREY); addBox(-.03, 0, s * .065, .034, .016, .018, TYRE);                          // main gear
      }
      plate([-.30, .128, 0], [-.48, .128, 0], [-.535, .31, 0], [-.455, .31, 0], .009, .004, tailC, 2);                                 // fin
      addBox(.38, 0, 0, .012, .066, .008, GREY); addBox(.38, 0, 0, .022, .014, .012, TYRE);                                            // nose gear
    }
    // Light tree for Riyadh's many small trees: a tapered trunk and three low-poly crowns (icosahedra, 20 faces each),
    // ≈ 75 triangles against ≈ 340 for the shared round tree. Tinted per instance like the shared one.
    const ICO0 = (() => { const t = (1 + Math.sqrt(5)) / 2, N = v => { const l = Math.hypot(...v); return v.map(q => q / l); };
      const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(N);
      return [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]].map(f => f.map(i => V[i])); })();
    function lowBlob(x, y, z, rx, ry, rz, col){ for (const f of ICO0) { const P = f.map(v => [x + v[0] * rx, y + Math.max(v[1], -.45) * ry, z + v[2] * rz]), Nn = f.map(v => { const n = [v[0] / rx, v[1] / ry, v[2] / rz], l = Math.hypot(...n); return n.map(q => q / l); });
      K.addTriN(P[0], P[1], P[2], shade(col, .9 + .2 * f[0][1]), shade(col, .9 + .2 * f[1][1]), shade(col, .9 + .2 * f[2][1]), Nn[0], Nn[1], Nn[2]); } }
    const smallTree = (x, z, k, col) => inst('tree2', x, G, z, 0, k * .75, col);   // same size convention as addTree (global prop scale .75)
    const protos = {
      tree2:{dy:0, tint:1, build:c => { addCylinder(0, 0, 0, .011, .05, [.52, .33, .18], 5, .007); lowBlob(0, .075, 0, .046, .044, .046, c);
        lowBlob(.024, .066, .012, .031, .029, .031, shade(c, 1.08)); lowBlob(.002, .104, -.004, .028, .026, .028, mix(c, [.72, .90, .36], .35)); }},
      jet:{dy:0, build:() => aircraftRaw()},
      tug:{dy:0, build:() => { addBox(0, .0003, 0, .0026, .0010, .0016, [.94, .62, .16]); addBox(-.0004, .0013, 0, .0012, .0009, .0014, GLASS); addBox(0, 0, 0, .0028, .0004, .0017, TYRE); }},
      bagcart:{dy:0, build:() => { addBox(0, .0003, 0, .0024, .0004, .0015, GREY); addBox(0, .0007, 0, .0022, .0011, .0013, [.86, .87, .88]); addBox(.0002, .0018, 0, .0018, .0003, .0011, [.40, .46, .62]); addBox(0, 0, 0, .0024, .0003, .0016, TYRE); }},
      belt:{dy:0, build:() => { addBox(0, .0002, 0, .0042, .0007, .0017, YEL); addBox(-.0012, .0009, 0, .0011, .0008, .0014, GLASS); addRod([-.0018, .0011, 0], [.0028, .0034, 0], .0011, [.28, .29, .31]); }},
      pushback:{dy:0, build:() => { addBox(0, .0001, 0, .0042, .0010, .0024, YEL); addBox(-.0012, .0011, 0, .0011, .0008, .0016, GLASS); addBox(.0021, .0004, 0, .0004, .0004, .0010, GREY); }},
      catering:{dy:0, build:() => { addBox(-.0016, .0002, 0, .0016, .0016, .0018, W); addBox(-.0016, .0012, 0, .0014, .0006, .0017, GLASS); addBox(.0008, .0002, 0, .0036, .0006, .0018, GREY);
        for (const e of [-1, 1]) addRod([-.0006, .0008, e * .0006], [.0024, .0026, e * .0006], .0003, GREY); addBox(.0009, .0026, 0, .0034, .0018, .0019, [.94, .95, .96]); }},
      van:{dy:0, build:() => { addBox(0, .0003, 0, .0034, .0015, .0016, W); addBox(.0011, .0012, 0, .0010, .0005, .0016, GLASS); addBox(0, 0, 0, .0034, .0004, .0017, TYRE); }},
      gpu:{dy:0, build:() => { addBox(0, .0002, 0, .0022, .0013, .0014, [.78, .80, .82]); addBox(0, .0015, 0, .0016, .0002, .0010, [.40, .42, .45]); }},
      bus:{dy:0, build:() => { addBox(0, .0004, 0, .0100, .0020, .0024, [.94, .95, .96]); addBox(0, .0013, 0, .0102, .0007, .0025, GLASS); addBox(0, .0024, 0, .0094, .0002, .0022, [.80, .82, .85]); addBox(0, 0, 0, .0098, .0005, .0025, TYRE); }},
      stairs:{dy:0, build:() => { addBox(-.0012, .0002, 0, .0030, .0010, .0016, W); addBox(-.0022, .0012, 0, .0009, .0007, .0014, GLASS); addRod([-.0008, .0013, 0], [.0024, .0034, 0], .0012, [.86, .86, .86]); }},
      fire:{dy:0, build:() => { addBox(0, .0004, 0, .0060, .0022, .0025, [.84, .18, .14]); addBox(.0021, .0012, 0, .0012, .0009, .0026, GLASS); addBox(-.0006, .0026, 0, .0028, .0003, .0016, [.90, .90, .88]); addBox(0, 0, 0, .0058, .0005, .0026, TYRE); }},
      truck:{dy:0, build:() => { addBox(.0022, .0003, 0, .0016, .0018, .0018, [.90, .90, .88]); addBox(.0024, .0013, 0, .0010, .0006, .0018, GLASS); addBox(-.0009, .0004, 0, .0044, .0022, .0020, [.84, .84, .82]); addBox(0, 0, 0, .0060, .0004, .0020, TYRE); }},
      car:{dy:0, tint:1, build:c => { addBox(0, .0003, 0, .0036, .0008, .0016, c); addBox(-.0002, .0011, 0, .0019, .0006, .0014, mix(c, GLASS, .7)); addBox(0, 0, 0, .0034, .0004, .0016, TYRE); }},
      person:{dy:0, tint:1, build:c => { addBox(0, 0, 0, .0005, .0010, .0005, c); addBox(0, .0010, 0, .00042, .00042, .00042, [.72, .55, .42]); }},
      bench:{dy:0, build:() => { addBox(0, .0004, 0, .0028, .0003, .0008, [.62, .46, .30]); addBox(0, .0007, -.0003, .0028, .0006, .0002, [.62, .46, .30]); for (const e of [-1, 1]) addBox(e * .0011, 0, 0, .0003, .0004, .0007, GREY); }},
      lamp:{dy:0, build:() => { addBox(0, 0, 0, .0003, .0042, .0003, [.40, .42, .44]); addBox(.0004, .0040, 0, .0012, .0003, .0005, [.40, .42, .44]); addBox(.0007, .0038, 0, .0006, .0002, .0004, [1, .94, .78]); }},
      parasol:{dy:0, tint:1, build:c => { addBox(0, 0, 0, .0003, .0026, .0003, [.85, .85, .83]); addCone(0, .0022, 0, .0024, .0009, c, 8); addCylinder(0, 0, 0, .0013, .0009, [.88, .86, .82], 8); }},
      kiosk:{dy:0, tint:1, build:c => { addBox(0, 0, 0, .0040, .0032, .0030, [.95, .93, .88]); addBox(0, .0012, .0017, .0040, .0005, .0006, GLASS); addBox(0, .0032, .0006, .0048, .0006, .0044, c); }},
      table:{dy:0, build:() => { addCylinder(0, 0, 0, .0009, .0008, [.90, .90, .88], 8); for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + .4; addBox(Math.cos(a) * .0016, 0, Math.sin(a) * .0016, .0005, .0005, .0005, [.55, .45, .35]); } }},
      ride:{dy:0, tint:1, build:c => { addBox(0, 0, 0, .0034, .0010, .0018, c); addBox(.0006, .0010, 0, .0020, .0003, .0016, [.20, .20, .22]); addBox(.0016, 0, 0, .0004, .0013, .0018, shade(c, .8)); }},
      edge:{dy:0, build:() => { addBox(0, 0, 0, .0004, .0007, .0004, [1, .96, .80]); }}
    };

    const slice = window.VisionSlice?.init(K, protos);
    /* ------------------------------------------------------------------ King Salman International Airport */
    // Stylized, inside the existing footprint: the existing runways and taxiways (alignment unchanged) gain an apron
    // with marked stands, an airside face of five contact gates with jet bridges, a remote stand, a terminal hall under
    // a series of flowing roof shells on tree columns, a landside canopy over a two-lane drop-off, two car parks, the
    // Metro terminus with a bridge into the hall, a hangar, cargo shed, fire station and control tower.
    function airport(ks){
      const X = d => ks.x + d, Z = d => ks.z + d, asphalt = [.30, .31, .33], taxi = [.44, .45, .47], apronC = [.75, .76, .77], white = [.96, .96, .94], yel = [.95, .80, .32];
      addDisc(ks.x, G + .002, ks.z, ks.foot - .004, [.82, .76, .62], 40);                                              // airfield ground
      for (const [dz, L] of [[-.075, .105], [-.02, .115]]) {                                                           // runways (alignment unchanged)
        addStrip([X(-L), Z(dz)], [X(L), Z(dz)], .011, G + .005, asphalt);
        for (let t = -L + .02; t < L - .02; t += .022) addBox(X(t + .006), G + .0062, Z(dz), .011, .0008, .0012, white);
        for (const e of [-1, 1]) { for (let k = -3; k <= 3; k++) if (k) addBox(X(e * (L - .007)), G + .0062, Z(dz + k * .0028), .009, .0008, .0016, white);   // threshold piano keys
          addStrip([X(-L + .003), Z(dz + e * .0094)], [X(L - .003), Z(dz + e * .0094)], .0005, G + .0056, white);
          for (const k of [-1, 1]) for (const f of [.03, .042, .054]) addBox(X(e * (L - f)), G + .0062, Z(dz + k * .005), .007, .0008, .0014, white); } }   // touchdown-zone bars
      addStrip([X(-.1), Z(.012)], [X(.1), Z(.012)], .0045, G + .0055, taxi);                                          // parallel taxiway
      for (const t of [-.085, -.03, .03, .085]) { addStrip([X(t), Z(-.075)], [X(t), Z(.012)], .003, G + .0056, taxi); addStrip([X(t), Z(.012)], [X(t), Z(.018)], .003, G + .0056, taxi); }
      addStrip([X(-.1), Z(.012)], [X(.1), Z(.012)], .0004, G + .0058, yel);
      for (const t of [-.085, -.03, .03, .085]) { addStrip([X(t), Z(-.069)], [X(t), Z(.012)], .0004, G + .0058, yel); for (const dz of [-.064, -.031]) addBox(X(t), G + .0059, Z(dz), .006, .0003, .0007, yel); }   // holding points
      // Apron: concrete from the taxiway to the airside face, a remote-stand pad east, a service road along the gates.
      flat(X(-.09), Z(.0165), X(.094), Z(.051), G + .0052, apronC);
      for (let x = -.088; x < .092; x += .006) addBox(X(x), G + .0057, Z(.0475), .0032, .0002, .0004, white);         // service-road dashes
      addStrip([X(-.09), Z(.0458)], [X(.094), Z(.0458)], .0002, G + .0057, white);
      const gates = [-.062, -.037, -.012, .013, .038], remote = .074;
      for (const sx of gates.concat([remote])) {                                                                        // stand markings
        addStrip([X(sx), Z(.0175)], [X(sx), Z(.044)], .00035, G + .0058, yel); addBox(X(sx), G + .0058, Z(.0445), .004, .0002, .0005, yel);   // lead-in, stop bar
        for (const e of [-1, 1]) for (let z = .019; z < .044; z += .003) addBox(X(sx + e * .0118), G + .0058, Z(z), .0003, .0002, .0016, [.90, .30, .26]);   // envelope (dashed red)
      }
      // Landside: forecourt road with lanes and crossings, the access road to King Salman Road, two car parks.
      flat(X(-.078), Z(.0845), X(.062), Z(.095), G + .0052, [.42, .42, .43]);
      for (let x = -.075; x < .06; x += .007) addBox(X(x), G + .0057, Z(.0898), .0034, .0002, .0004, white);
      for (const cx of [-.04, .0, .03]) for (let k = 0; k < 5; k++) addBox(X(cx), G + .0057, Z(.0855 + k * .002), .006, .0002, .0009, white);   // zebra crossings
      const ry = K.C('Riyadh'), rsZ = LY.CITY_ROADS.find(r => r.id === 'kingSalman').pts[0][1];
      addStrip([X(-.019), Z(.095)], [X(-.019), rsZ - .009], .0035, G + .0052, [.42, .42, .43]); addStrip([X(-.019), Z(.095)], [X(-.019), rsZ - .009], .0002, G + .0057, white);
      const lots = [[-.054, -.024], [.016, .054]];                                                                     // the marker pad (dx 0) stays clear
      for (const [x0, x1] of lots) { flat(X(x0), Z(.0975), X(x1), Z(.112), G + .0048, [.46, .46, .47]);
        for (let x = x0 + .002; x <= x1 - .001; x += .0035) for (const zz of [.1012, .1084]) addBox(X(x), G + .0053, Z(zz), .0002, .0002, .0036, white); }
      // Airside / landside separation fence along the apron's west and east edges.
      sig('ksip', () => {
        terminal(X, Z);
        for (const sx of gates) jetBridge(X(sx), Z(.033));
        // Metro terminus: an elevated station on the line's last segment, its platform roof, and a bridge into the hall.
        const M = LY.METRO_ROUTE, a = M[M.length - 2], b = M[M.length - 1], rot = Math.atan2(b[1] - a[1], b[0] - a[0]), deck = G + .012;
        { const ux = Math.cos(rot), uz = Math.sin(rot), cx = b[0] - ux * .006, cz = b[1] - uz * .006;
          addBox(cx, deck - .002, cz, .018, .002, .010, [.86, .86, .84], rot); for (const e of [-1, 1]) addBox(cx - uz * e * .0042, G, cz + ux * e * .0042, .0022, deck - .002 - G, .0022, [.84, .84, .82]);
          for (let k = 0; k < 5; k++) { const a0 = Math.PI * k / 5, a1 = Math.PI * (k + 1) / 5, Pp = (u, aa) => { const v = -Math.cos(aa) * .0062, y = deck + .0045 + Math.sin(aa) * .004; return [cx + ux * u - uz * v, y, cz + uz * u + ux * v]; };
            addQuad(Pp(-.009, a0), Pp(.009, a0), Pp(.009, a1), Pp(-.009, a1), shade([.97, .97, .96], .9 + .1 * Math.sin((a0 + a1) / 2))); }
          for (const e of [-1, 1]) addBox(cx - uz * e * .0063, deck + .0040, cz + ux * e * .0063, .019, .0009, .0006, [.20, .42, .82], rot);
          addBox(X(-.06), deck - .0015, (cz + Z(.077)) / 2, .004, .0025, Math.abs(cz - Z(.077)) + .002, [.80, .86, .90]); }   // bridge into the hall
        hangar(X(-.098), Z(.033)); cargoShed(X(-.092), Z(.066)); fireStation(X(.057), Z(-.048));
        addModel('RUH_Airport_ControlTower', X(.072), Z(.069), 0, {k:modelK('RUH_Airport_Terminal', .11), hk:1.8});
        landsideCanopy(X, Z);
      });
      sig('ksip', () => {                                                                                              // operational aircraft
        for (const sx of gates.slice(0, 4)) inst('jet', X(sx), G + .0052, Z(.033), Math.PI / 2, .024);
        inst('jet', X(remote), G + .0052, Z(.033), Math.PI / 2, .024);
        inst('jet', X(.05), G + .0055, Z(.012), Math.PI, .024);                                                         // taxiing
        inst('jet', X(-.07), G + .005, Z(-.075), 0, .024);                                                              // lined up on the runway
      }, 'fin');
      sig('ksip', () => {                                                                                                // ground services
        const y = G + .0052, v = (key, x, z, r, k = 1, c) => inst(key, X(x), y, Z(z), r, k, c);
        // Gate 1: a full turnaround round the aircraft (nose +z; its starboard side faces -x).
        { const sx = gates[0]; v('pushback', sx, .0472, Math.PI / 2); v('gpu', sx - .0042, .0448, 0);
          v('belt', sx - .0058, .0395, 0); for (let i = 0; i < 4; i++) v(i ? 'bagcart' : 'tug', sx - .0102, .0425 - i * .0031, -Math.PI / 2);
          v('catering', sx - .0058, .0245, 0); v('van', sx + .0085, .0215, Math.PI / 2); v('belt', sx - .0058, .0262, 0); }
        // Gates 2–4: lighter sets (belt loader with a baggage train, power unit; catering at gate 3).
        for (const [i, sx] of gates.slice(1, 4).entries()) { v('gpu', sx - .0042, .0448, 0); v('belt', sx - .0058, .0395, 0);
          for (let j = 0; j < 3; j++) v(j ? 'bagcart' : 'tug', sx - .0102, .0425 - j * .0031, -Math.PI / 2);
          if (i === 1) v('catering', sx - .0058, .0245, 0); else v('van', sx + .0085, .0215, Math.PI / 2); }
        // Gate 5 (empty): equipment staged clear of the stand; the remote stand: stair trucks and an apron bus.
        { const sx = gates[4]; v('pushback', sx - .006, .0475, 0); for (let j = 0; j < 4; j++) v('bagcart', sx + .004 + j * .0028, .0478, 0); }
        v('stairs', remote + .0052, .0390, Math.PI); v('stairs', remote + .0052, .0255, Math.PI); v('bus', remote + .0125, .0322, Math.PI / 2);
        // Equipment yard at the west end of the apron, fire tenders at the fire station, cargo trucks at the shed.
        for (let i = 0; i < 4; i++) { v('bagcart', -.084 + i * .0028, .042, Math.PI / 2); v('tug', -.084 + i * .0034, .0365, Math.PI / 2); }
        v('gpu', -.072, .0425, 0); v('gpu', -.072, .0395, 0);
        inst('fire', X(.050), y, Z(-.0418), Math.PI / 2, 1); inst('fire', X(.0565), y, Z(-.0418), Math.PI / 2, 1);
        inst('truck', X(-.083), y, Z(.0735), 0, 1); inst('truck', X(-.083), y, Z(.0775), 0, 1);
        // Landside: taxis and cars at the curb, an airport bus, and the car parks about two-thirds full.
        const rn = mulberry32(4401), carCol = () => [[.92, .92, .90], [.20, .22, .26], [.62, .64, .67], [.78, .80, .82], [.55, .20, .18], [.24, .36, .55], [.95, .82, .30]][Math.floor(rn() * 7)];
        for (let x = -.066; x < .05; x += .0062) if (rn() < .55) v('car', x, .0868, 0, 1, rn() < .35 ? [.95, .85, .35] : carCol());
        v('bus', -.022, .0928, 0); v('car', .02, .0925, Math.PI, 1, carCol());
        for (const [x0, x1] of lots) for (let x = x0 + .0037; x <= x1 - .002; x += .0035) for (const zz of [.1002, .1028, .1074, .110]) if (rn() < .66) v('car', x, zz, Math.PI / 2 + (rn() < .5 ? 0 : Math.PI), 1, carCol());
        v('car', -.0202, .109, -Math.PI / 2, 1, carCol()); v('car', -.0178, .124, Math.PI / 2, 1, carCol());
      }, 'props');
      sig('ksip', () => {                                                                                                // runway edge lights, passengers
        for (const [dz, L] of [[-.075, .105], [-.02, .115]]) for (let t = -L + .004; t <= L - .004; t += .012) for (const e of [-1, 1]) inst('edge', X(t), G + .005, Z(dz + e * .0108), 0, 1);
        for (let t = -.1; t <= .1; t += .016) for (const e of [-1, 1]) inst('edge', X(t), G + .0055, Z(.012 + e * .0049), 0, .8);
        const rn = mulberry32(4402), col = () => [[.90, .90, .88], [.25, .28, .34], [.62, .36, .30], [.34, .46, .62]][Math.floor(rn() * 4)];
        for (let i = 0; i < 26; i++) inst('person', X(-.066 + rn() * .11), G + .0052, Z(.0805 + rn() * .0032), rn() * TAU, 1, col());   // at the curb
        for (let i = 0; i < 7; i++) inst('person', X(remote + .0075 + rn() * .003), G + .0052, Z(.029 + rn() * .007), rn() * TAU, 1, col());       // walking from the apron bus
      }, 'tiny');
      sig('ksip', () => hoardPoly(rect(X(-.082), Z(.046), X(.064), Z(.098)), [.42, .74, .92], 2), 'prep');
      paths.airside = [[X(-.088), Z(.0475)], [X(.092), Z(.0475)]];                                                       // service road (animated vehicles)
      slice?.airport(ks);
    }
    // Terminal: a long glass hall; its roof a row of flowing shells (crest per module, lifting to the landside edge)
    // with skylight bands, overhanging both faces on branching "tree" columns; airside face with gate rooms.
    function terminal(X, Z){
      const x0 = -.074, x1 = .054, z0 = .0505, z1 = .0775, glass = [.50, .64, .76], frame = [.88, .88, .86], H = .0118;
      addBox(X((x0 + x1) / 2), G + .0052, Z((z0 + z1) / 2), x1 - x0 - .004, H - .0052, z1 - z0 - .004, glass);
      addBox(X((x0 + x1) / 2), G + .0052, Z((z0 + z1) / 2), x1 - x0 - .003, .0012, z1 - z0 - .003, [.86, .85, .82]);
      for (let x = x0 + .003; x <= x1 - .002; x += .004) for (const zz of [z0 + .0018, z1 - .0018]) addBox(X(x), G + .0052, Z(zz), .0005, H - .0052, .0007, frame);   // mullions
      for (const zz of [z0 + .0018, z1 - .0018]) addBox(X((x0 + x1) / 2), G + .0052 + (H - .0052) * .55, Z(zz), x1 - x0 - .004, .0004, .0008, frame);
      // Roof: a height field over the hall plus overhangs; shells per module (cosine crest), rising toward the landside.
      const rx0 = x0 - .002, rx1 = x1 + .002, rz0 = z0 - .0035, rz1 = z1 + .0045, NX = 64, NZ = 9, mod = (rx1 - rx0) / 7;
      const hgt = (u, w) => { const fx = ((u - rx0) % mod) / mod, crest = .5 - .5 * Math.cos(fx * TAU), prof = Math.pow(Math.sin(Math.PI * (w - rz0) / (rz1 - rz0)), .55);
        return H + .0006 + (.0012 + .0034 * crest) * prof + .0012 * (w - rz0) / (rz1 - rz0); };
      const Pt = (i, j) => { const u = rx0 + (rx1 - rx0) * i / NX, w = rz0 + (rz1 - rz0) * j / NZ; return [X(u), G + hgt(u, w), Z(w)]; };
      for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { const u = rx0 + (rx1 - rx0) * (i + .5) / NX, fx = ((u - rx0) % mod) / mod, sky = j === 4 && fx > .2 && fx < .8;
        addQuad(Pt(i, j), Pt(i + 1, j), Pt(i + 1, j + 1), Pt(i, j + 1), sky ? [.70, .82, .90] : shade([.97, .97, .96], .93 + .07 * Math.sin(fx * Math.PI))); }
      for (let i = 0; i < NX; i++) for (const j of [0, NZ]) { const a = Pt(i, j), b = Pt(i + 1, j); addQuad(a, b, [b[0], b[1] - .0011, b[2]], [a[0], a[1] - .0011, a[2]], [.82, .82, .80]); }   // fascia
      for (let k = 0; k <= 7; k++) for (const [zz, w] of [[rz0 + .0012, rz0 + .0012], [rz1 - .0016, rz1 - .0016]]) {          // tree columns
        const u = Math.min(rx1 - .002, Math.max(rx0 + .002, rx0 + k * mod)), top = G + hgt(u, w) - .0006, base = [X(u), G + .0052, Z(zz)], fork = [X(u), G + .0052 + (top - G - .0052) * .55, Z(zz)];
        addRod(base, fork, .0009, frame); for (const e of [-1, 1]) addRod(fork, [X(u + e * .0035), top, Z(zz)], .0006, frame); }
      for (let x = x0 + .006; x < x1 - .004; x += .025) addBox(X(x), G + .0052, Z(z0 - .0012), .006, .0028, .0016, [.80, .80, .78]);   // gate rooms on the airside face
    }
    // Jet bridge from a rotunda at the terminal face to the aircraft's forward door (port side, +x when nose is +z).
    function jetBridge(ax, az){ const r = [ax + .0095, G + .0052, az + .0145], door = [ax + .0021, G + .0052, az + .0083], h = .0026;
      addCylinder(r[0], G + .0052, r[2], .0016, h + .0006, [.84, .84, .82], 8);
      addRod([r[0], G + .0052 + h, r[2]], [door[0], G + .0052 + h - .0002, door[2]], .0017, [.86, .86, .84]);
      addRod([r[0], G + .0052 + h + .0009, r[2]], [door[0], G + .0052 + h + .0007, door[2]], .0008, [.70, .72, .74]);
      addRod([door[0] + .0012, G + .0052, door[2] + .0004], [door[0] + .0012, G + .0052 + h - .001, door[2] + .0004], .0007, GREY);
      addBox(door[0] + .0012, G + .0052, door[2] + .0004, .0016, .0005, .001, TYRE); }
    function landsideCanopy(X, Z){ const x0 = -.07, x1 = .05, z0 = .0778, z1 = .0842, y = G + .0062;
      addBox(X((x0 + x1) / 2), y, Z((z0 + z1) / 2), x1 - x0, .0006, z1 - z0, [.95, .95, .94]); addBox(X((x0 + x1) / 2), y + .0006, Z((z0 + z1) / 2), x1 - x0 - .004, .0002, .0018, [.72, .84, .92]);
      for (let x = x0 + .004; x <= x1; x += .012) addBox(X(x), G + .0052, Z(z1 - .0008), .0006, y - G - .0052, .0006, [.88, .88, .86]); }
    function hangar(x, z){ const w = .026, d = .028, h = .006, c = [.86, .87, .88];
      addBox(x, G, z, w, h, d, c); const rings = [];
      for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; rings.push([[x - w / 2, G + h + Math.sin(a) * .0045, z - Math.cos(a) * d / 2], [x + w / 2, G + h + Math.sin(a) * .0045, z - Math.cos(a) * d / 2]]); }
      for (let k = 0; k < 8; k++) addQuad(rings[k][0], rings[k][1], rings[k + 1][1], rings[k + 1][0], shade([.90, .91, .92], .9 + .1 * Math.sin(Math.PI * (k + .5) / 8)));
      for (let k = 0; k < 8; k++) addTri([x + w / 2, G + h, z], rings[k][1], rings[k + 1][1], c);
      addBox(x + w / 2 + .0004, G, z, .0008, h * .92, d * .8, [.36, .40, .45]); }                                  // open doors facing the apron
    function cargoShed(x, z){ addBox(x, G, z, .02, .0055, .013, [.84, .80, .72]); addBox(x, G + .0055, z, .021, .0008, .014, [.70, .70, .70]);
      for (let k = 0; k < 4; k++) addBox(x + .0102, G, z - .0045 + k * .003, .0008, .003, .002, [.36, .38, .40]); }
    function fireStation(x, z){ addBox(x, G, z, .018, .005, .009, [.92, .90, .86]); addBox(x, G + .005, z, .019, .0008, .0096, [.70, .70, .70]); addBox(x, G + .0042, z + .0046, .018, .0008, .0004, [.80, .22, .18]);
      for (let k = 0; k < 3; k++) addBox(x - .006 + k * .006, G, z + .0046, .0042, .0036, .0004, [.40, .40, .42]);
      addBox(x + .0075, G, z - .002, .003, .009, .003, [.92, .90, .86]); }

    /* ------------------------------------------------------------------ Qiddiya theme park */
    // A stylized theme park (not the approved layout and no ride names): entrance with ticket booths facing the road
    // (east), a central plaza with a fountain, a large looping roller coaster with lift hill, drops and station, a log
    // flume, a drop tower, a carousel, an observation wheel, queue lines under shade sails, kiosks with seating,
    // toilets, a back-of-house yard, landscaped paths and a perimeter fence. Coaster trains run on the track.
    function qiddiya(qd){
      const X = d => qd.x + d, Z = d => qd.z + d, R0 = qd.foot - .005, path = [.93, .86, .72], plaza = [.95, .91, .82], lawn = [.52, .72, .40];
      addDisc(qd.x, G + .0025, qd.z, R0, [.84, .74, .58], 40);                                                         // site ground (context)
      addDisc(qd.x, G + .003, qd.z, R0 - .006, [.88, .80, .64], 40);
      // Landscaped walks (context): the ring walk, the spine from the gate to the plaza and spurs to each attraction.
      const ring = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU, r = .062 + .006 * Math.sin(a * 3); ring.push([X(Math.cos(a) * r), Z(Math.sin(a) * r * .92)]); }
      polyStrip(ring, .0032, G + .0036, path);
      polyStrip([[X(.09), Z(-.036)], [X(.06), Z(-.028)], [X(.032), Z(-.014)], [X(.0), Z(-.004)]], .0042, G + .0037, plaza);
      for (const [a, b] of [[[0, -.004], [-.03, -.04]], [[0, -.004], [.03, .028]], [[0, -.004], [-.035, .03]], [[0, -.004], [.04, -.05]], [[0, -.004], [-.05, -.005]]]) polyStrip([[X(a[0]), Z(a[1])], [X(b[0]), Z(b[1])]], .0026, G + .0037, path);
      addDisc(X(0), G + .0039, Z(-.004), .015, plaza, 24);                                                              // central plaza
      for (const [dx, dz, r] of [[-.06, -.06, .012], [.062, .052, .01], [-.072, .028, .011], [.03, -.075, .01], [.075, .0, .008]]) addDisc(X(dx), G + .0034, Z(dz), r, lawn, 14);
      const rn = mulberry32(4501);
      K.into('detail', () => { for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + .1, x = X(Math.cos(a) * (R0 - .008)), z = Z(Math.sin(a) * (R0 - .008));   // a light palm edge, kept low beside the rides
        if (Math.hypot(x - qd.pad[0], z - qd.pad[1]) > .036 && Math.abs(Math.atan2(Math.sin(a + .38), Math.cos(a + .38))) > .3) addPalm(x, z, .15 + rn() * .04); } });
      // The coaster's route: a closed loop through the north-west, its station by the plaza; heights along the loop
      // (station, lift hill, first drop, camelback hills, a banked turn and the brake run home).
      const cx = X(-.026), cz = Z(-.035), route = [];
      const NR = 220;
      for (let i = 0; i < NR; i++) { const t = i / NR * TAU, x = cx + Math.cos(t) * .037 + Math.cos(2 * t) * .010, z = cz + Math.sin(t) * .027 - Math.sin(2 * t) * .008;
        const u = i / NR, hh = u < .12 ? .006 : u < .26 ? .006 + (u - .12) / .14 * .036 : u < .34 ? .042 - (u - .26) / .08 * .036 : u < .9 ? .006 + .016 * Math.pow(Math.abs(Math.sin((u - .34) / .56 * Math.PI * 3)), 1.5) * (1 - (u - .34) / .7) : .006;
        route.push([x, G + .0036 + hh, z]); }
      // smooth the heights a little so the crest and valley joins read as curves
      for (let pass = 0; pass < 3; pass++) for (let i = 0; i < NR; i++) { const a = route[(i + NR - 1) % NR], b = route[(i + 1) % NR]; route[i][1] = route[i][1] * .5 + (a[1] + b[1]) * .25; }
      paths.coaster = route;
      // The flume: a channel lifted on trestles, round a loop, down a splash drop into the pool.
      const fx = X(.042), fz = Z(-.046), flume = [];
      for (let i = 0; i < 90; i++) { const t = i / 90 * TAU, x = fx + Math.cos(t) * .019, z = fz + Math.sin(t) * .013 + Math.sin(2 * t) * .003, u = i / 90;
        flume.push([x, G + .0036 + (u < .55 ? .004 + u / .55 * .012 : u < .7 ? .016 - (u - .55) / .15 * .014 : .002), z]); }
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 90; i++) { const a = flume[(i + 89) % 90], b = flume[(i + 1) % 90]; flume[i][1] = flume[i][1] * .5 + (a[1] + b[1]) * .25; }
      sig('qiddiya', () => {
        // Coaster: two rails, sleepers, supports (with cross-bracing on the tall ones), station, lift chain marks.
        const L2 = offset2(route.map(p => [p[0], p[2]]), .0012), R2 = offset2(route.map(p => [p[0], p[2]]), -.0012), red = [.86, .22, .20], sup = [.92, .90, .86];
        for (let i = 0; i < NR; i++) { const j = (i + 1) % NR, y0 = route[i][1], y1 = route[j][1];
          addRod([L2[i][0], y0, L2[i][1]], [L2[j][0], y1, L2[j][1]], .0006, red); addRod([R2[i][0], y0, R2[i][1]], [R2[j][0], y1, R2[j][1]], .0006, red);
          if (i % 2 === 0) addRod([L2[i][0], y0 - .0004, L2[i][1]], [R2[i][0], y0 - .0004, R2[i][1]], .0004, [.30, .30, .32]);
          if (i % 6 === 0 && y0 > G + .0075) { const p = route[i]; addRod([p[0], G + .0036, p[2]], [p[0], y0 - .0005, p[2]], .0008, sup);
            if (y0 > G + .02) { const q = route[(i + 6) % NR]; addRod([p[0], G + .0036, p[2]], [q[0], (y0 + G) / 2, q[2]], .0004, sup); } } }
        { const p = route[10], q = route[2], rot = Math.atan2(q[2] - p[2], q[0] - p[0]), mx = (p[0] + q[0]) / 2, mz = (p[2] + q[2]) / 2;   // station
          // Platform either side of the rails; canopy clears the train envelope.
          addBox(mx, G + .0036, mz, .022, .0020, .011, [.94, .92, .86], rot);
          const stationAt=at(mx,mz,rot);
          for(const side of [-1,1]) {
            const [x,z]=stationAt(0,side*.0045);addBox(x,G+.0081,z,.022,.0005,.003,[.94,.92,.86],rot);
            for(const u of [-.010,.010]) {const [px,pz]=stationAt(u,side*.0055);addBox(px,G+.0056,pz,.0006,.0089,.0006,[.84,.84,.82],rot);}
          }
          addBox(mx,G+.0145,mz,.025,.0008,.014,[.86,.30,.24],rot); }
        // Flume: blue channel in a light trough on trestles, the splash pool and a load station.
        for (let i = 0; i < 90; i++) { const a = flume[i], b = flume[(i + 1) % 90]; addRod(a, b, .0026, [.88, .86, .80]); addRod([a[0], a[1] + .0011, a[2]], [b[0], b[1] + .0011, b[2]], .0016, [.30, .64, .86]);
          if (i % 7 === 0 && a[1] > G + .006) addRod([a[0], G + .0036, a[2]], [a[0], a[1] - .0012, a[2]], .0008, [.80, .62, .44]); }
        addDisc(flume[66][0], G + .0042, flume[66][2], .0075, [.36, .70, .88], 16); addBox(flume[84][0], G + .0036, flume[84][2] + .004, .009, .0035, .006, [.84, .62, .44]);
        // Drop tower: a lattice mast with a ring of seats part-way up, on a planted base.
        { const x = X(.034), z = Z(.024), H = .062; addCylinder(x, G + .0036, z, .006, .002, [.80, .78, .74], 12);
          for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) addRod([x + ox * .0012, G + .0056, z + oz * .0012], [x + ox * .0007, G + H, z + oz * .0007], .0006, [.92, .92, .94]);
          for (let y = .008; y < H - .002; y += .006) addBox(x, G + y, z, .0026, .0003, .0026, [.84, .84, .86]);
          addCylinder(x, G + H, z, .0016, .003, [.94, .40, .30], 8); addCone(x, G + H + .003, z, .0016, .003, [.96, .80, .30], 8);
          addCylinder(x, G + .032, z, .0042, .0022, [.28, .56, .86], 12); addCylinder(x, G + .0342, z, .0044, .0005, [.95, .95, .94], 12); }
        // Carousel: platform, striped conical canopy, a ring of horses (tinted posts) under it.
        { const x = X(-.03), z = Z(.03); addCylinder(x, G + .0036, z, .0085, .0012, [.88, .70, .40], 18); addCylinder(x, G + .0048, z, .001, .0072, [.95, .86, .55], 8);
          for (let i = 0; i < 16; i++) { const a0 = i / 16 * TAU, a1 = (i + 1) / 16 * TAU, top = [x, G + .0155, z], pa = [x + Math.cos(a0) * .0095, G + .0105, z + Math.sin(a0) * .0095], pb = [x + Math.cos(a1) * .0095, G + .0105, z + Math.sin(a1) * .0095];
            addTri(pa, pb, top, i % 2 ? [.96, .95, .92] : [.88, .30, .30]); addQuad(pa, pb, [pb[0], pb[1] - .0014, pb[2]], [pa[0], pa[1] - .0014, pa[2]], [.98, .82, .40]); }
          for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; addBox(x + Math.cos(a) * .0062, G + .0048, z + Math.sin(a) * .0062, .0004, .0058, .0004, [.92, .84, .60]);
            addBox(x + Math.cos(a) * .0062, G + .0065, z + Math.sin(a) * .0062, .0018, .0012, .0007, [[.97, .97, .95], [.40, .30, .22], [.86, .62, .40]][i % 3], a + Math.PI / 2); } }
        // Observation wheel by the south-west lawn.
        { const wx = X(-.066), wz = Z(.032), r = .015, hub = [wx, G + r + .0066, wz], rim = k => { const a = k / 16 * TAU; return [wx + Math.cos(a) * r, G + r + .0066 + Math.sin(a) * r, wz]; };
          for (let k = 0; k < 16; k++) { addRod(rim(k), rim(k + 1), .0009, [.95, .95, .94]); if (k % 2 === 0) addRod(hub, rim(k), .0004, [.86, .86, .88]); addBox(rim(k)[0], rim(k)[1] - .0016, wz, .0018, .0018, .0018, [[.92, .34, .30], [.98, .76, .24], [.30, .60, .90]][k % 3]); }
          for (const e of [-1, 1]) { addRod([wx - .007, G + .0036, wz + e * .003], hub, .0012, [.80, .80, .82]); addRod([wx + .007, G + .0036, wz + e * .003], hub, .0012, [.80, .80, .82]); }
          addBox(wx, G + .0036, wz + .006, .01, .003, .004, [.95, .93, .88]); }
        // Entrance: an arched gate of three portals, ticket booths in a row, a forecourt toward the road.
        { const g = at(X(.073), Z(-.031), -.38), col = [.95, .92, .86], acc = [.92, .38, .28];
          for (const v of [-.012, -.004, .004, .012]) { const [x, z] = g(0, v); addBox(x, G + .0036, z, .0024, .0105, .0024, col, -.38); }
          { const [x, z] = g(0, 0); addBox(x, G + .014, z, .004, .0024, .03, acc, -.38); addBox(x, G + .0164, z, .0034, .0008, .026, [.98, .82, .36], -.38); }
          for (let k = 0; k < 4; k++) { const [x, z] = g(.0085, -.0105 + k * .007); addBox(x, G + .0036, z, .0036, .0034, .0042, [.96, .94, .90], -.38); addBox(x, G + .0070, z, .0044, .0007, .005, acc, -.38); }
          const fc = [g(.003, -.017), g(.016, -.017), g(.016, .017), g(.003, .017)]; pad(fc, G + .0038, plaza); }
        // Back of house (south-west, behind the wheel): service sheds, a loading yard and its own gate.
        { const g = at(X(-.05), Z(.052), .7); for (const [u, v, w, d, h] of [[0, 0, .014, .009, .006], [.016, .001, .011, .008, .005], [.004, -.011, .018, .006, .004]]) { const [x, z] = g(u, v); addBox(x, G + .0034, z, w, h, d, [.82, .80, .76], .7); addBox(x, G + .0034 + h, z, w, .0005, d, [.66, .66, .64], .7); }
          pad([g(-.01, .006), g(.024, .006), g(.024, .014), g(-.01, .014)], G + .0035, [.66, .64, .60]); }
        // Toilets and a first-aid block, a gift shop and a food hall round the plaza.
        for (const [dx, dz, w, d, c] of [[.018, .006, .009, .006, [.40, .62, .84]], [-.016, -.016, .01, .007, [.30, .62, .44]], [.016, -.02, .012, .008, [.95, .70, .30]], [-.018, .012, .008, .006, [.86, .40, .40]]]) {
          addBox(X(dx), G + .0036, Z(dz), w, .004, d, [.96, .94, .90]); addBox(X(dx), G + .0076, Z(dz), w + .0012, .0007, d + .0012, c); }
        // Perimeter fence with gaps at the entrance and the back-of-house gate.
        const poly = circlePoly(qd.x, qd.z, R0 - .0015, 40);
        const gapAt = a => { const i = Math.floor(((a % TAU) + TAU) % TAU / TAU * 40); return [i, 0, 1]; };
        fence(poly, .0034, [.86, .86, .84], [gapAt(-.38), gapAt(-.38 + .16), gapAt(2.3), gapAt(TAU / 4)]);
        // Shade sails over the queue lines (queue rails in props).
        for (const [dx, dz, rot] of [[-.006, -.024, .9], [.03, .01, 0]]) { const g = at(X(dx), Z(dz), rot);
          for (const [u, v] of [[-.006, -.004], [.006, -.004], [.006, .004], [-.006, .004]]) { const [x, z] = g(u, v); addBox(x, G + .0036, z, .0005, .0062, .0005, [.80, .80, .78]); }
          const q = [g(-.007, -.005), g(.007, -.0045), g(.007, .005), g(-.007, .0045)]; addQuad([q[0][0], G + .0099, q[0][1]], [q[1][0], G + .0088, q[1][1]], [q[2][0], G + .0099, q[2][1]], [q[3][0], G + .0088, q[3][1]], [.97, .96, .92]); }
      });
      sig('qiddiya', () => {                                                                                             // parked trains (always present once open; moving trains in animate)
        for (let k = 0; k < 4; k++) { const [x,y,z,yaw,pitch]=trackSample(route,.02+k*.0038/trackArc(route).at(-1));inst('ride',x,y+.0005,z,yaw,1,[.95,.74,.22],pitch); }
        for (let k = 0; k < 2; k++) { const p = flume[80 + k * 3], q = flume[81 + k * 3]; inst('ride', p[0], p[1] + .0012, p[2], Math.atan2(q[2] - p[2], q[0] - p[0]), .9, [.72, .52, .36]); }
      }, 'fin');
      sig('qiddiya', () => {
        const rk = mulberry32(4502), y = G + .0038, awn = [[.92, .36, .30], [.98, .76, .26], [.30, .62, .88], [.36, .70, .44]];
        // Queue rails (switchbacks) under the sails, kiosks with parasols and tables, benches and lamps along the walks.
        for (const [dx, dz, rot] of [[-.006, -.024, .9], [.03, .01, 0]]) { const g = at(X(dx), Z(dz), rot);
          for (let r = 0; r < 4; r++) { const [x, z] = g(0, -.0036 + r * .0024); addBox(x, y + .0015, z, .012, .00022, .00025, [.70, .70, .72], rot); } }
        for (const [dx, dz, k] of [[.008, -.018, 0], [-.012, .004, 1], [.012, .016, 2], [-.044, -.002, 3], [.052, -.014, 0], [-.006, .05, 1]]) { inst('kiosk', X(dx), y, Z(dz), rk() * TAU, 1, awn[k]);
          for (let i = 0; i < 2; i++) { const a = rk() * TAU; inst('parasol', X(dx + Math.cos(a) * .006), y, Z(dz + Math.sin(a) * .006), 0, 1, awn[(k + 1 + i) % 4]); inst('table', X(dx + Math.cos(a) * .006), y, Z(dz + Math.sin(a) * .006), 0, 1); } }
        for (let i = 0; i < 48; i += 3) { const p = ring[i], q = ring[i + 1], a = Math.atan2(q[1] - p[1], q[0] - p[0]), nx = -Math.sin(a), nz = Math.cos(a);
          inst(i % 2 ? 'bench' : 'lamp', p[0] + nx * .0045, y, p[1] + nz * .0045, a, 1); }
        inst('truck', X(-.049), y, Z(.063), .7, 1); inst('van', X(-.04), y, Z(.0625), .7, 1);
      }, 'props');
      sig('qiddiya', () => { const rk = mulberry32(4503), col = () => [[.92, .36, .30], [.98, .80, .30], [.30, .56, .86], [.94, .94, .92], [.36, .66, .44]][Math.floor(rk() * 5)];
        const spot = (x, z, r, n) => { for (let i = 0; i < n; i++) { const a = rk() * TAU, d = Math.sqrt(rk()) * r; inst('person', x + Math.cos(a) * d, G + .0039, z + Math.sin(a) * d, rk() * TAU, 1, col()); } };
        spot(X(0), Z(-.004), .013, 22); spot(X(.08), Z(-.034), .008, 10); for (let i = 0; i < 48; i += 2) spot(ring[i][0], ring[i][1], .0025, 1);
        for (const [dx, dz, rot] of [[-.006, -.024, .9], [.03, .01, 0]]) { const g = at(X(dx), Z(dz), rot); for (let k = 0; k < 9; k++) { const [x, z] = g(-.005 + (k % 5) * .0025, -.0024 + Math.floor(k / 5) * .0024); inst('person', x, G + .0039, z, rot, 1, col()); } }
      }, 'tiny');
      sig('qiddiya', () => hoardRing(qd.x, qd.z, R0 - .004, [.96, .46, .36], -.38), 'prep');
      slice?.park(qd);
    }

    /* ------------------------------------------------------------------ shared site furniture */
    // Seating pocket: two benches facing each other and a lamp (instances; the calling part decides the layer).
    const seatPocket = (x, z, rot, y = G + .004) => { const c = Math.cos(rot), s = Math.sin(rot);
      inst('bench', x - s * .0016, y, z + c * .0016, rot, 1); inst('bench', x + s * .0016, y, z - c * .0016, rot + Math.PI, 1); inst('lamp', x + c * .003, y, z + s * .003, rot, 1); };
    // A pergola (shaded walk) along a → b: posts both sides and a slatted roof.
    function pergola(a, b, w, h, col = [.92, .90, .86], y = G + .004){ const L = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = Math.atan2(b[1] - a[1], b[0] - a[0]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      for (let t = 0; t <= L + 1e-6; t += .006) for (const e of [-1, 1]) addBox(a[0] + ux * t - uz * e * w / 2, y, a[1] + uz * t + ux * e * w / 2, .0005, h, .0005, col);
      for (let t = .0015; t < L; t += .0022) addBox(a[0] + ux * t, y + h, a[1] + uz * t, .0007, .0004, w + .001, shade(col, .96), rot);
      for (const e of [-1, 1]) addBox((a[0] + b[0]) / 2 - uz * e * w / 2, y + h - .0004, (a[1] + b[1]) / 2 + ux * e * w / 2, L, .0005, .0006, col, rot); }
    // Geodesic globe (icosahedron, one subdivision), every fourth face in the second tone; flattened below the plinth.
    const ICO = (() => { const t = (1 + Math.sqrt(5)) / 2, N = v => { const l = Math.hypot(...v); return v.map(q => q / l); };
      const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(N);
      const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]], out = [];
      const mid = (a, b) => N([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
      for (const [i, j, k] of F) { const a = V[i], b = V[j], c = V[k], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); out.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); } return out; })();
    function globe(x, y, z, r, c1, c2){ ICO.forEach((f, i) => { if (f.every(v => v[1] < -.35)) return; const P = f.map(v => [x + v[0] * r, y + Math.max(v[1], -.35) * r, z + v[2] * r]); addTri(P[0], P[1], P[2], i % 4 === 3 ? c2 : c1); }); }
    // Low earthen wall with small triangular merlons (heritage enclosure).
    function heritageWall(a, b, y, h, col){ const L = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
      addBox((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, L, h, .0016, col, rot); const n = Math.max(2, Math.floor(L / .0032));
      for (let i = 0; i < n; i++) { const t0 = (i + .2) / n, t1 = (i + .8) / n, tm = (i + .5) / n, Pp = t => [a[0] + (b[0] - a[0]) * t, y + h, a[1] + (b[1] - a[1]) * t];
        const A = Pp(t0), B = Pp(t1), M = Pp(tm); addTri(A, B, [M[0], M[1] + .0015, M[2]], shade(col, 1.06)); } }
    const near = (x, z, q, r) => Math.hypot(x - q[0], z - q[1]) < r;
    const PEOPLE = [[.95, .95, .93], [.25, .28, .34], [.62, .36, .30], [.34, .46, .62], [.86, .74, .40]];

    /* ------------------------------------------------------------------ ROSHN */
    // A walkable neighbourhood: a ring street with pavements and lamps, spokes to a central green with a playground,
    // a community centre and a small mosque; townhouse terraces inside the ring (back gardens toward the green), walled
    // villas with gardens outside it, and two low apartment courts to the north. Seeded variation of height, colour,
    // roof terrace and pool; parked cars on drives and kerbs, and a substation by the entrance.
    function roshn(rs){
      const X = d => rs.x + d, Z = d => rs.z + d, R0 = rs.foot - .006, rn = mulberry32(4207), road = [.46, .46, .47], walk = [.90, .88, .82];
      addDisc(rs.x, G + .0025, rs.z, R0, [.86, .82, .70], 44);
      const ell = (a, rx, rz) => [X(Math.cos(a) * rx), Z(Math.sin(a) * rz)], ring = []; for (let i = 0; i <= 64; i++) ring.push(ell(i / 64 * TAU, .052, .046));
      polyStrip(offset2(ring, .0038), .0009, G + .0035, walk); polyStrip(offset2(ring, -.0038), .0009, G + .0035, walk);
      polyStrip(ring, .0027, G + .0036, road);
      const spokes = [-Math.PI / 2, 0, Math.PI]; for (const a of spokes) addStrip(ell(a, .021, .021), ell(a, .05, .044), .0018, G + .0035, road);
      const entry = [[X(0), Z(.088)], [X(.018), Z(.08)], [X(.03), Z(.06)], ell(Math.atan2(.04 / .046, .028 / .052), .052, .046)]; polyStrip(entry, .0026, G + .0036, road);
      addDisc(X(0), G + .0036, Z(-.002), .0195, [.52, .73, .41], 28); addDisc(X(0), G + .0037, Z(-.002), .006, [.92, .89, .80], 16);
      for (const a of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) addStrip(ell(a, .006, .006), ell(a, .019, .019), .0011, G + .0038, walk);
      const cream = [[.97, .95, .90], [.95, .92, .86], [.93, .90, .84], [.97, .94, .87], [.91, .88, .82]], accent = [[.78, .60, .44], [.60, .68, .72], [.84, .76, .60], [.70, .56, .44]];
      const clearOf = (x, z) => !near(x, z, rs.pad, .026) && LY.polyDist(x, z, entry) > .008;
      const villas = [], terraces = [];
      for (let i = 0; i < 26; i++) { const a = i / 26 * TAU + .06, [x, z] = ell(a, .0705, .0645); if (Math.hypot(x - rs.x, z - rs.z) > R0 - .007 || !clearOf(x, z)) continue;
        if (Math.abs(a - 1.25 * Math.PI) < .22 || Math.abs(a - 1.75 * Math.PI) < .22) continue; villas.push([x, z, a + Math.PI]); }
      for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, [x, z] = ell(a, .036, .031); if (spokes.concat([TAU]).some(s => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) < .2) || !clearOf(x, z)) continue; terraces.push([x, z, a]); }
      sig('roshn', () => {
        villas.forEach(([x, z, face], i) => villa(x, z, face, cream[i % 5], accent[i % 4], rn));
        terraces.forEach(([x, z, face], i) => townhouse(x, z, face, cream[(i * 3) % 5], i % 7 === 0 ? accent[i % 4] : null, rn));
        for (const a of [1.25 * Math.PI, 1.75 * Math.PI]) { const [x, z] = ell(a, .07, .062); aptCourt(x, z, a + Math.PI); }
        { const x = X(.0), z = Z(-.016); addBox(x, G + .0036, z, .0085, .0055, .0075, [.97, .97, .95]); addBox(x, G + .0091, z, .009, .0005, .008, [.88, .86, .82]);   // mosque
          addCylinder(x, G + .0096, z, .0032, .0006, [.92, .90, .86], 12); addDome(x, G + .0102, z, .0031, [.95, .93, .88]);
          addCylinder(x + .0058, G + .0036, z - .0028, .0011, .0155, [.97, .96, .93], 8, .0009); addCone(x + .0058, G + .0191, z - .0028, .0011, .0026, [.88, .80, .60], 8); }
        { const x = X(-.011), z = Z(.006); addBox(x, G + .0036, z, .011, .005, .0075, [.95, .94, .90]); addBox(x, G + .0086, z, .013, .0005, .0095, [.62, .70, .72]);   // community centre
          addBox(x + .006, G + .0036, z + .0045, .004, .0035, .0003, [.40, .50, .58]); }
        { const x = X(.03), z = Z(.07); addBox(x, G + .0036, z, .005, .0035, .004, [.70, .72, .74]); for (const e of [-1, 1]) addBox(x + e * .0034, G + .0036, z, .0003, .002, .0055, [.60, .62, .64]); }   // substation
        for (const [dx, dz] of [[.012, -.004], [.008, .011], [-.006, .014], [-.014, -.008], [.014, .006], [-.004, -.013]]) smallTree(X(dx), Z(dz), .1 + rn() * .03, [.22 + rn() * .06, .54 + rn() * .1, .26]);
        { const x = X(.009), z = Z(.002), y = G + .0037;                                                               // playground
          addBox(x, y, z, .0075, .0002, .0055, [.86, .62, .40]); addRod([x - .002, y + .0026, z], [x + .0015, y, z], .0007, [.95, .40, .30]); addBox(x - .0024, y, z, .001, .0026, .001, [.30, .56, .86]);
          for (const e of [-1, 1]) addRod([x + .0024, y, z + e * .0022], [x + .0024, y + .0028, z], .0003, [.98, .80, .30]); addBox(x + .0024, y + .0026, z, .0004, .0003, .0046, [.98, .80, .30]); }
      });
      sig('roshn', () => {
        for (let i = 0; i < 64; i += 4) { const p = ring[i], q = ring[i + 1], a = Math.atan2(q[1] - p[1], q[0] - p[0]); inst('lamp', p[0] - Math.sin(a) * .0042, G + .0036, p[1] + Math.cos(a) * .0042, a, 1); }
        for (const a of [.4, 2.0, 3.6, 5.0]) { const [x, z] = ell(a, .0145, .0145); seatPocket(x, z, a, G + .0037); }
        const carCol = () => [[.92, .92, .90], [.20, .22, .26], [.62, .64, .67], [.78, .80, .82], [.55, .20, .18], [.24, .36, .55]][Math.floor(rn() * 6)];
        for (const [x, z, face] of villas) if (rn() < .55) { const c = Math.cos(face), s = Math.sin(face); inst('car', x + c * .0042 - s * .0038, G + .0036, z + s * .0042 + c * .0038, face, 1, carCol()); }
        for (let i = 2; i < 64; i += 5) if (rn() < .5) { const p = ring[i], q = ring[i + 1], a = Math.atan2(q[1] - p[1], q[0] - p[0]); inst('car', p[0] - Math.sin(a) * .0021, G + .0036, p[1] + Math.cos(a) * .0021, a, 1, carCol()); }
      }, 'props');
      sig('roshn', () => {
        for (let i = 0; i < 14; i++) { const a = rn() * TAU, d = .004 + rn() * .012; inst('person', X(Math.cos(a) * d), G + .0038, Z(-.002 + Math.sin(a) * d), rn() * TAU, 1, PEOPLE[i % 5]); }
        for (let i = 0; i < 10; i++) { const p = ring[Math.floor(rn() * 64)]; inst('person', p[0] + (rn() - .5) * .008, G + .0036, p[1] + (rn() - .5) * .008, rn() * TAU, 1, PEOPLE[i % 4]); } }, 'tiny');
      sig('roshn', () => hoardRing(rs.x, rs.z - .004, R0 - .004, [.36, .72, .46], Math.PI / 2 - .5), 'prep');
    }
    // Local frame for a lot whose front faces `face` (angle from the house toward its street).
    const lot = (x, z, face) => { const f = [Math.cos(face), Math.sin(face)], s = [-f[1], f[0]], rot = face + Math.PI / 2; return {rot, P:(u, v) => [x + s[0] * u + f[0] * v, z + s[1] * u + f[1] * v]}; };
    function villa(x, z, face, c, acc, rn){ const {rot, P} = lot(x, z, face), wallC = shade(c, .93), Y = G + .0036;
      const w = .0145, d = .0135, run = (u0, v0, u1, v1) => { const [ax, az] = P(u0, v0), [bx, bz] = P(u1, v1); addBox((ax + bx) / 2, Y, (az + bz) / 2, Math.hypot(bx - ax, bz - az) + .0005, .0014, .0005, wallC, Math.atan2(bz - az, bx - ax)); };
      run(-w / 2, -d / 2, w / 2, -d / 2); run(-w / 2, -d / 2, -w / 2, d / 2); run(w / 2, -d / 2, w / 2, d / 2); run(-w / 2, d / 2, .0015, d / 2); run(.0055, d / 2, w / 2, d / 2);   // plot wall with its gate
      { const [gx, gz] = P(0, .0035); addBox(gx, Y, gz, .012, .0002, .006, [.56, .74, .44], rot); }
      const hh = .0048 + rn() * .0016, [hx, hz] = P(-.0005, -.002); addBox(hx, Y, hz, .0098, hh, .0074, c, rot); addBox(hx, Y + hh, hz, .0102, .0006, .0078, shade(c, .9), rot);
      if (rn() < .7) { const [ux, uz] = P(-.0022, -.0035); addBox(ux, Y + hh + .0006, uz, .0058, .0034, .0048, shade(c, 1.02), rot); addBox(ux, Y + hh + .004, uz, .0061, .0005, .0051, shade(c, .9), rot); }
      else { const [ux, uz] = P(.0025, -.003); addBox(ux, Y + hh + .0028, uz, .004, .0002, .003, acc, rot); for (const e of [-1, 1]) { const [px, pz] = P(.0025 + e * .0018, -.0015); addBox(px, Y + hh + .0006, pz, .0003, .0022, .0003, acc); } }   // roof-terrace shade
      { const [dx, dz] = P(.0018, .0018); addBox(dx, Y, dz, .0016, .0028, .0003, [.44, .32, .22], rot); for (const e of [-1, 1]) { const [wx, wz] = P(-.0024 + e * .0018, .0018); addBox(wx, Y + .0018, wz, .0013, .0016, .0003, [.34, .42, .50], rot); } }
      if (rn() < .35) { const [px, pz] = P(-.004, .0043); addBox(px, Y, pz, .004, .0003, .0022, [.36, .70, .86], rot); } else { const [tx, tz] = P(-.0045, .004); smallTree(tx, tz, .08 + rn() * .03, [.24, .56 + rn() * .08, .28]); } }
    function townhouse(x, z, face, c, acc, rn){ const {rot, P} = lot(x, z, face), Y = G + .0036, h = .0058 + rn() * .0016;
      const [hx, hz] = P(0, .0008); addBox(hx, Y, hz, .0058, h, .0072, c, rot); addBox(hx, Y + h, hz, .006, .0006, .0074, shade(c, .9), rot);
      { const [dx, dz] = P(-.0012, .0045); addBox(dx, Y, dz, .0013, .0026, .0003, [.44, .32, .22], rot); const [wx, wz] = P(.0014, .0045); addBox(wx, Y + .0032, wz, .0016, .0016, .0003, [.34, .42, .50], rot); }
      if (rn() < .4) { const [ux, uz] = P(0, -.0015); addBox(ux, Y + h + .0006, uz, .0034, .0026, .0034, shade(c, 1.03), rot); }
      if (acc) { const [ax, az] = P(0, .002); addBox(ax, Y + h + .0006, az, .0052, .0003, .0026, acc, rot); }
      { const [gx, gz] = P(0, -.0058); addBox(gx, Y, gz, .0054, .0002, .0034, [.56, .74, .44], rot); } }
    function aptCourt(x, z, face){ const {rot, P} = lot(x, z, face), Y = G + .0036, c = [.95, .93, .88], h = .0105;
      for (const [u, v, w, d] of [[0, -.004, .02, .0062], [-.0075, .0035, .005, .009], [.0075, .0035, .005, .009]]) { const [bx, bz] = P(u, v); addBox(bx, Y, bz, w, h, d, c, rot); addBox(bx, Y + h, bz, w + .0004, .0006, d + .0004, shade(c, .9), rot);
        for (let y = .0032; y < h; y += .0034) addBox(bx, Y + y, bz, w + .0008, .0004, d + .0008, [.78, .74, .68], rot); }
      { const [cx, cz] = P(0, .003); addBox(cx, Y, cz, .009, .0002, .007, [.56, .74, .44], rot); smallTree(cx, cz, .09, [.24, .58, .28]); } }

    /* ------------------------------------------------------------------ Expo 2030 */
    // Stylized (not the official layout): a geodesic globe under a ring canopy at the centre of a round plaza; five
    // distinct pavilions (sails, a twisting tower, a cluster of domes, a lattice garden cube, a wave-roofed hall) between
    // six avenues; the main gate north (toward the airport), a second gate west; shade pergolas, two service buildings,
    // trees and lawns, and a limited set of neutral banners once open.
    function expo(ex, ks){
      const X = d => ex.x + d, Z = d => ex.z + d, R0 = ex.foot, pave = [.90, .87, .79], walk = [.95, .92, .84], lawn = [.52, .72, .42], deg = a => a * Math.PI / 180, rn = mulberry32(4230);
      const pol = (a, r) => [X(Math.cos(a) * r), Z(Math.sin(a) * r)];
      addDisc(ex.x, G + .003, ex.z, R0 - .002, [.86, .82, .72], 44); polyStrip(circlePoly(ex.x, ex.z, R0 - .005, 48).concat([pol(0, R0 - .005)]), .0016, G + .0034, [.40, .62, .34]);
      addDisc(X(0), G + .0036, Z(0), .031, pave, 36); addDisc(X(0), G + .0037, Z(0), .0175, walk, 28);
      const avenues = [-8, 52, 120, 180, 270, 300].map(deg);
      for (const a of avenues) addStrip(pol(a, .03), pol(a, R0 - .006), .0032, G + .0036, walk);
      const pav = [[15, 'sails'], [90, 'tower'], [150, 'domes'], [210, 'lattice'], [335, 'wave']].map(([d, k]) => [deg(d), k]);
      for (const [a] of pav) { const [x, z] = pol(a, .051); addDisc(x, G + .0035, z, .0105, lawn, 18); }
      addStrip([X(-.012), Z(-R0)], [ks.x - .012, ks.z + ks.foot], .004, G + .006, [.90, .84, .66]);                // walk to the airport
      sig('expo', () => {
        globe(X(0), G + .0037 + .011, Z(0), .0125, [.94, .95, .96], [.62, .78, .90]); addCylinder(X(0), G + .0037, Z(0), .0105, .0028, [.86, .84, .80], 24);
        { const n = 36, r0 = .0235, r1 = .0275, y = G + .0145, Q = (a, r, yy) => [X(Math.cos(a) * r), yy, Z(Math.sin(a) * r)];   // ring canopy on columns
          for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU;
            addQuad(Q(a0, r0, y), Q(a1, r0, y), Q(a1, r1, y + .0012), Q(a0, r1, y + .0012), [.97, .96, .93]); addQuad(Q(a0, r1, y + .0012), Q(a1, r1, y + .0012), Q(a1, r1, y), Q(a0, r1, y), [.88, .86, .82]);
            if (i % 3 === 0) { const q = Q(a0, (r0 + r1) / 2, 0); addBox(q[0], G + .0037, q[2], .0008, y - G - .0037, .0008, [.90, .90, .88]); } } }
        for (const [a, kind] of pav) { const [x, z] = pol(a, .051); pavilion(kind, x, z, a + Math.PI); }
        for (const a of [deg(270), deg(180)]) { const [x, z] = pol(a, R0 - .007), main = a === deg(270), w = main ? .016 : .011, rot = a + Math.PI / 2, c = Math.cos(rot), s = Math.sin(rot);   // gates
          for (const e of [-1, 1]) addBox(x + c * e * w / 2, G + .0036, z + s * e * w / 2, .0016, main ? .012 : .009, .0016, [.95, .93, .88], rot);
          addBox(x, G + .0036 + (main ? .012 : .009), z, w + .003, .0016, .0024, [.62, .74, .70], rot);
          for (let k = 0; k < (main ? 4 : 2); k++) { const o = (k - (main ? 1.5 : .5)) * .0034, bx = x + c * o - Math.cos(a) * .006, bz = z + s * o - Math.sin(a) * .006; addBox(bx, G + .0036, bz, .0024, .003, .0024, [.96, .95, .92], rot); addBox(bx, G + .0066, bz, .003, .0005, .003, [.62, .74, .70], rot); } }
        for (const a of [deg(52), deg(120)]) pergola(pol(a, .032), pol(a, .06), .0042, .0042, [.95, .94, .90], G + .0037);   // shaded avenues
        for (const [a, r] of [[deg(240), .066], [deg(25), .066]]) { const [x, z] = pol(a, r); addBox(x, G + .0036, z, .008, .004, .005, [.88, .86, .82], a); addBox(x, G + .0076, z, .0086, .0005, .0056, [.70, .70, .70], a); }   // service buildings
        for (const [a] of pav) for (let k = 0; k < 3; k++) { const [x, z] = pol(a + (k - 1) * .3, .066 + (k % 2) * .003); if (!near(x, z, ex.pad, .02)) smallTree(x, z, .1 + rn() * .04, [.22, .54 + rn() * .1, .26]); }
        for (const a of avenues) for (const r of [.038, .05, .062]) for (const e of [-1, 1]) { const [x, z] = pol(a + e * .0035 / r, r); if (!near(x, z, ex.pad, .018) && rn() < .7) smallTree(x, z, .085, [.24, .58, .28]); }
      });
      sig('expo', () => { const cols = [[.96, .96, .94], [.86, .78, .62], [.36, .64, .62], [.46, .66, .40]];   // banners: neutral colours, no logos
        for (let i = 0; i < 10; i++) { const side = i < 5 ? -1 : 1, [x, z] = pol(deg(270) + side * .1, .036 + (i % 5) * .007);
          addCylinder(x, G + .0036, z, .0004, .013, [.92, .92, .90], 4); addBox(x + .0012, G + .0105, z, .0024, .0034, .0003, cols[i % 4]); } }, 'fin');
      sig('expo', () => { const awn = [[.36, .64, .62], [.86, .78, .62], [.95, .62, .30], [.46, .66, .40]];
        for (const [a, r, k] of [[deg(0), .038, 0], [deg(100), .036, 1], [deg(200), .038, 2], [deg(320), .04, 3], [deg(160), .061, 0]]) { const [x, z] = pol(a, r); inst('kiosk', x, G + .0037, z, a, 1, awn[k]); inst('parasol', x + .004, G + .0037, z + .003, 0, 1, awn[(k + 1) % 4]); inst('table', x + .004, G + .0037, z + .003, 0, 1); }
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + .13, [x, z] = pol(a, .0205); inst('bench', x, G + .0037, z, a + Math.PI / 2, 1); }
        for (const a of avenues) { const [x, z] = pol(a + .09, .045); inst('lamp', x, G + .0036, z, a, 1); } }, 'props');
      sig('expo', () => {
        for (let i = 0; i < 40; i++) { const a = rn() * TAU, d = .019 + rn() * .012; inst('person', X(Math.cos(a) * d), G + .0037, Z(Math.sin(a) * d), rn() * TAU, 1, PEOPLE[i % 5]); }
        for (const a of avenues) for (let i = 0; i < 5; i++) { const [x, z] = pol(a, .033 + rn() * .03); inst('person', x + (rn() - .5) * .003, G + .0037, z + (rn() - .5) * .003, a, 1, PEOPLE[i % 5]); }
        for (let i = 0; i < 10; i++) { const [x, z] = pol(deg(270) + (rn() - .5) * .3, R0 - .003 + rn() * .004); inst('person', x, G + .0036, z, rn() * TAU, 1, PEOPLE[i % 5]); } }, 'tiny');
      sig('expo', () => hoardRing(ex.x, ex.z, R0 - .008, [.98, .70, .30], -Math.PI / 2), 'prep');
    }
    function pavilion(kind, x, z, face){ const Y = G + .0035, W = [.97, .97, .95];
      if (kind === 'sails') { for (let k = 0; k < 3; k++) { const a = face + (k - 1) * 1.0, c = Math.cos(a), s = Math.sin(a), rows = [];
          for (let j = 0; j <= 6; j++) { const t = j / 6, rr = .0035 + t * .0045, y = Y + .0005 + Math.sin(t * Math.PI * .5) * .013 * (1 - .25 * k), hw = .0032 * (1 - t) + .0003; rows.push([[x + c * rr - s * hw, y, z + s * rr + c * hw], [x + c * rr + s * hw, y, z + s * rr - c * hw]]); }
          for (let j = 0; j < 6; j++) addQuad(rows[j][0], rows[j][1], rows[j + 1][1], rows[j + 1][0], shade(W, .9 + .1 * j / 6)); }
        addCylinder(x, Y, z, .0045, .003, [.60, .74, .82], 12); return; }
      if (kind === 'tower') { for (let k = 0; k < 7; k++) { addBox(x, Y + k * .0028, z, .0078, .0024, .0078, k % 2 ? [.62, .76, .86] : [.56, .70, .82], face + k * .2); addBox(x, Y + k * .0028 + .0024, z, .0082, .0004, .0082, W, face + k * .2); }
        addBox(x, Y + .0196, z, .0062, .0008, .0062, W, face + 1.4); return; }
      if (kind === 'domes') { for (const [u, v, r] of [[0, 0, .0058], [.0062, .003, .004], [-.0058, .0034, .0034]]) { const c = Math.cos(face), s = Math.sin(face), px = x + c * v - s * u, pz = z + s * v + c * u; addCylinder(px, Y, pz, r, .0012, [.86, .84, .80], 14); addDome(px, Y + .0012, pz, r, [.80, .86, .90]); } return; }
      if (kind === 'lattice') { const h = .011, a2 = .0062, col = [.94, .94, .92], C = (sx, sz, y) => { const c = Math.cos(face), s = Math.sin(face); return [x + (c * sx - s * sz) * a2, Y + y, z + (s * sx + c * sz) * a2]; };
        addBlob(x, Y, z, .0052, .0075, .0052, [.30, .62, .32], -.9, .3);
        for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) { for (const y of [0, h / 2, h]) addRod(C(a[0], a[1], y), C(b[0], b[1], y), .0005, col); addRod(C(a[0], a[1], 0), C(a[0], a[1], h), .0006, col); addRod(C(a[0], a[1], 0), C(b[0], b[1], h), .0003, col); } return; }
      if (kind === 'wave') { const c = Math.cos(face + Math.PI / 2), s = Math.sin(face + Math.PI / 2), L = .019, D = .009, NX = 16, Pp = (u, v, h) => [x + c * u - s * v, Y + h, z + s * u + c * v];
        addBox(x, Y, z, L, .0042, D, [.60, .72, .80], face + Math.PI / 2);
        for (let i = 0; i < NX; i++) { const u0 = -L / 2 + L * i / NX, u1 = u0 + L / NX, h0 = .0048 + .0022 * Math.sin(i / NX * TAU * 1.5), h1 = .0048 + .0022 * Math.sin((i + 1) / NX * TAU * 1.5);
          addQuad(Pp(u0, -D / 2 - .001, h0), Pp(u1, -D / 2 - .001, h1), Pp(u1, D / 2 + .001, h1), Pp(u0, D / 2 + .001, h0), shade(W, .92 + .08 * Math.sin(i / NX * TAU * 1.5))); } }
    }

    /* ------------------------------------------------------------------ New Murabba additions */
    // Around the Mukaab (engine): shaded pergola walks on three cross walks (the south one leads to the marker), dark
    // entrance canopies over the portals, planters with small trees at the corners; café kiosks and seating; facade
    // light lines and lit portals for the night (lit part).
    function murabba(mu, S, H){
      const x = mu.x, z = mu.z - .006, h2 = S / 2, rn = mulberry32(4240);
      sig('newmurabba', () => {
        for (const [ax, az, bx, bz] of [[0, -.066, 0, -.047], [.047, 0, .066, 0], [-.066, 0, -.047, 0]]) pergola([x + ax, z + az], [x + bx, z + bz], .0055, .0048, [.94, .90, .82], G + .007);
        for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { const px = x + nx * (h2 + .0035), pz = z + nz * (h2 + .0035); addBox(px, G + .0068 + .0105, pz, nz ? .024 : .007, .0008, nz ? .007 : .024, [.30, .24, .18]); }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let k = 0; k < 3; k++) { const px = x + sx * (.054 - k * .0055), pz = z + sz * .054; addBox(px, G + .007, pz, .0034, .0016, .0034, [.80, .72, .60]); smallTree(px, pz, .075, [.24, .58, .28]); }
      });
      sig('newmurabba', () => { const lit = [.70, .52, .30];
        for (const yy of [3.5 / 9, 7.5 / 9]) for (const [ox, oz, w, d] of [[0, h2 + .0007, S, .0006], [0, -h2 - .0007, S, .0006], [h2 + .0007, 0, .0006, S], [-h2 - .0007, 0, .0006, S]]) addBox(x + ox, G + H * yy, z + oz, w, .0009, d, lit);
        for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) addBox(x + nx * (h2 + .0009), G + .0068, z + nz * (h2 + .0009), nz ? .016 : .0006, .006, nz ? .0006 : .016, [.78, .62, .38]); }, 'lit');
      sig('newmurabba', () => { const awn = [[.86, .62, .36], [.36, .62, .58]];
        for (const [dx, dz, k] of [[.03, .046, 0], [-.03, .046, 1], [.048, -.03, 1], [-.048, -.03, 0]]) { inst('kiosk', x + dx, G + .007, z + dz, 0, 1, awn[k]); inst('parasol', x + dx + .0045, G + .007, z + dz, 0, 1, awn[1 - k]); inst('table', x + dx + .0045, G + .007, z + dz, 0, 1); }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) seatPocket(x + sx * .046, z + sz * .046, Math.atan2(sz, sx), G + .007); }, 'props');
      sig('newmurabba', () => { for (let i = 0; i < 34; i++) { const a = rn() * TAU, d = h2 + .004 + rn() * .02; inst('person', x + Math.cos(a) * d, G + .007, z + Math.sin(a) * d, rn() * TAU, 1, PEOPLE[i % 4]); } }, 'tiny');
      sig('newmurabba', () => hoardRing(mu.x, mu.z - .006, .068, [.96, .58, .32], Math.PI / 2 + .6), 'prep');
    }

    /* ------------------------------------------------------------------ Diriyah heritage additions (always drawn) */
    // On the At-Turaif plateau (engine): the enclosure wall with corner towers, paved lanes between the compounds, the
    // plaza before Salwa Palace with two palms, and date palms on the slope toward the wadi.
    function diriyah(dr){
      const cx = dr.x + .012, cz = dr.z - .012, Y = G + .006, clay = [.80, .63, .45], lane = [.90, .80, .64], rn = mulberry32(1745);
      for (let i = -3; i <= 2; i++) addStrip([cx + (i + .5) * .0155, cz - .041], [cx + (i + .5) * .0155, cz + .041], .0009, Y + .0007, lane);
      for (let j = -2; j <= 1; j++) addStrip([cx - .052, cz + (j + .5) * .0165], [cx + .052, cz + (j + .5) * .0165], .0009, Y + .0007, lane);
      flat(cx - .012, cz + .012, cx + .012, cz + .02, Y + .0008, [.92, .84, .70]);
      const W0 = [[cx - .056, cz - .044], [cx + .056, cz - .044], [cx + .056, cz + .044], [cx - .056, cz + .044]];
      for (let i = 0; i < 4; i++) { const a = W0[i], b = W0[(i + 1) % 4]; if (i === 2) { heritageWall(a, [cx + .006, b[1]], Y, .003, clay); heritageWall([cx - .006, b[1]], b, Y, .003, clay); } else heritageWall(a, b, Y, .003, clay); }
      for (const [x, z] of W0) { addCylinder(x, Y, z, .0028, .0075, clay, 6, .0022); addCylinder(x, Y + .0075, z, .0025, .0008, shade(clay, 1.06), 6); }
      K.into('detail', () => { for (const [x, z] of [[cx - .006, cz + .017], [cx + .006, cz + .017]]) addPalm(x, z, .1);
        for (let i = 0; i < 16; i++) { const x = dr.x + .068 + rn() * .014, z = dr.z - .05 + rn() * .085; if (Math.hypot(x - dr.x, z - dr.z) < dr.foot - .006 && !near(x, z, dr.pad, .025)) addPalm(x, z, .12 + rn() * .04); } });
    }

    /* ------------------------------------------------------------------ Sports Boulevard furniture */
    // Shaded seating pergolas and fitness stations at intervals, benches along the promenade, lamps along the cycle
    // path, joggers and cyclists; all clear of the road crossings.
    function sports(sp){
      const pts = sp.ribbon.pts, clear = (x, z) => LY.cityRoadDist(x, z) > .016 && !near(x, z, sp.pad, .04), rn = mulberry32(4213);
      const along = (o, step, fn) => { for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        for (let t = step / 2; t < L; t += step) { const x = a[0] + (b[0] - a[0]) * t / L + nx * o, z = a[1] + (b[1] - a[1]) * t / L + nz * o; if (clear(x, z)) fn(x, z, rot); } } };
      sig('sports', () => { along(.0002, .09, (x, z) => pergola([x - .006, z], [x + .006, z], .005, .0045, [.92, .90, .86], G + .0052));
        along(-.0002, .13, (x, z) => { for (let k = 0; k < 3; k++) { addBox(x - .004 + k * .004, G + .0052, z, .0008, .003 + k * .001, .0008, [.40, .62, .84]); addBox(x - .004 + k * .004, G + .0052 + .003 + k * .001, z, .0028, .0004, .0004, [.40, .62, .84]); } }); });
      sig('sports', () => { along(.0128, .016, (x, z, rot) => inst('bench', x, G + .0055, z, rot + Math.PI, 1)); along(-.0128, .02, (x, z, rot) => inst('lamp', x, G + .0055, z, rot - Math.PI / 2, 1));
        along(.0002, .09, (x, z, rot) => { inst('bench', x - .003, G + .0052, z + .0015, rot, 1); inst('bench', x + .003, G + .0052, z - .0015, rot + Math.PI, 1); }); }, 'props');
      sig('sports', () => { along(.0095, .012, (x, z, rot) => { if (rn() < .45) inst('person', x + (rn() - .5) * .002, G + .0056, z, rot + (rn() < .5 ? 0 : Math.PI), 1, PEOPLE[Math.floor(rn() * 5)]); });
        along(-.0095, .018, (x, z, rot) => { if (rn() < .35) inst('person', x, G + .0056, z, rot, 1, PEOPLE[Math.floor(rn() * 5)]); }); }, 'tiny');
    }

    /* ------------------------------------------------------------------ King Salman Park additions */
    // Flower gardens (context), shade pergolas by the lake and a playground (built with the park), benches, lamps and
    // picnic parasols along the loop path.
    function park(pk){
      const X = d => pk.x + d, Z = d => pk.z + d, rn = mulberry32(4250), loop = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, r = .07 + .012 * Math.sin(a * 3); loop.push([X(Math.cos(a) * r), Z(Math.sin(a) * r * .9)]); }
      for (const [dx, dz, r] of [[-.02, -.05, .009], [.055, .03, .008], [-.06, .03, .007], [.03, -.058, .007]]) { addDisc(X(dx), G + .0044, Z(dz), r, [.50, .70, .40], 16);
        for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; addDisc(X(dx + Math.cos(a) * r * .55), G + .0046, Z(dz + Math.sin(a) * r * .55), r * .28, [[.92, .50, .56], [.98, .80, .36], [.78, .56, .86], [.96, .96, .90]][k % 4], 8); } }
      sig('park', () => { pergola([X(.0), Z(.05)], [X(.02), Z(.058)], .005, .0045, [.92, .90, .86], G + .0045); pergola([X(.058), Z(.0)], [X(.062), Z(.022)], .005, .0045, [.92, .90, .86], G + .0045);
        { const x = X(-.045), z = Z(-.012); addBox(x, G + .0045, z, .011, .0002, .008, [.86, .64, .42]); addRod([x - .003, G + .0072, z], [x + .001, G + .0045, z], .0008, [.95, .40, .30]); addBox(x - .0035, G + .0045, z, .0012, .0028, .0012, [.30, .56, .86]);
          for (const e of [-1, 1]) addRod([x + .003, G + .0045, z + e * .0022], [x + .003, G + .0075, z], .0003, [.98, .80, .30]); addBox(x + .003, G + .0072, z, .0004, .0003, .0046, [.98, .80, .30]); } });
      sig('park', () => { for (let i = 1; i < 40; i += 3) { const p = loop[i], q = loop[i + 1], a = Math.atan2(q[1] - p[1], q[0] - p[0]); inst('bench', p[0] - Math.sin(a) * .0035, G + .0045, p[1] + Math.cos(a) * .0035, a, 1); if (i % 2) inst('lamp', p[0] + Math.sin(a) * .0035, G + .0045, p[1] - Math.cos(a) * .0035, a, 1); }
        for (const [dx, dz, c] of [[-.03, .01, [.95, .62, .30]], [-.024, .016, [.36, .62, .86]], [.012, -.03, [.95, .95, .92]]]) inst('parasol', X(dx), G + .0045, Z(dz), 0, 1, c); }, 'props');
      sig('park', () => { for (let i = 0; i < 40; i += 2) if (rn() < .6) inst('person', loop[i][0] + (rn() - .5) * .003, G + .0062, loop[i][1] + (rn() - .5) * .003, rn() * TAU, 1, PEOPLE[i % 5]);
        for (let i = 0; i < 8; i++) inst('person', X(-.045 + (rn() - .5) * .012), G + .0045, Z(-.012 + (rn() - .5) * .01), rn() * TAU, .8, PEOPLE[i % 5]); }, 'tiny');
    }

    /* ------------------------------------------------------------------ Green Riyadh additions */
    // Reed clumps along the banks and sparse shrubs feathering the corridor's edge into the sand (context); shade
    // pavilions over seating pockets (built with the project), benches, lamps and walkers.
    function green(gr, mw){
      const pts = gr.ribbon.pts, hw = gr.ribbon.hw, rn = mulberry32(4260), clear = (x, z) => LY.cityRoadDist(x, z) > .02 && !near(x, z, gr.pad, .04);
      for (let i = 1; i < mw.length - 1; i += 2) for (const e of [-1, 1]) { const a = mw[i - 1], b = mw[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L, x = mw[i][0] + nx * e * .0185, z = mw[i][1] + nz * e * .0185;
        if (clear(x, z)) addBlob(x, G + .005, z, .003, .0018, .0022, [.42, .62, .30], -.5, .3); }
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        for (let t = .01; t < L; t += .012) for (const e of [-1, 1]) if (rn() < .45) { const o = (hw + .004 + rn() * .012) * e, x = a[0] + (b[0] - a[0]) * t / L + nx * o, z = a[1] + (b[1] - a[1]) * t / L + nz * o; if (clear(x, z)) addBlob(x, G + .0024, z, .0024 + rn() * .0016, .0016, .0022, [.56 + rn() * .08, .64, .38], -.5, .3); } }
      const spots = []; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        for (const e of [-1, 1]) { const x = (a[0] + b[0]) / 2 + nx * hw * .78 * e, z = (a[1] + b[1]) / 2 + nz * hw * .78 * e; if (clear(x, z) && LY.polyDist(x, z, mw) > .03) spots.push([x, z, Math.atan2(b[1] - a[1], b[0] - a[0])]); } }
      sig('greenriyadh', () => { for (const [x, z, r] of spots) { addBox(x, G + .0042, z, .009, .0003, .007, [.88, .80, .64], r);
          for (const e of [-1, 1]) for (const f of [-1, 1]) addBox(x + Math.cos(r) * e * .0035 - Math.sin(r) * f * .0026, G + .0042, z + Math.sin(r) * e * .0035 + Math.cos(r) * f * .0026, .0005, .0042, .0005, [.62, .46, .30]);
          addBox(x, G + .0084, z, .0094, .0006, .0072, [.72, .56, .36], r); } });
      sig('greenriyadh', () => { for (const [x, z, r] of spots) { inst('bench', x, G + .0045, z, r, 1); seatPocket(x + Math.cos(r) * .009, z + Math.sin(r) * .009, r, G + .0042); } }, 'props');
      sig('greenriyadh', () => { for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let k = 0; k < 6; k++) { const t = rn(), e = rn() < .5 ? -1 : 1, x = a[0] + (b[0] - a[0]) * t - (b[1] - a[1]) / L * hw * .82 * e, z = a[1] + (b[1] - a[1]) * t + (b[0] - a[0]) / L * hw * .82 * e; if (clear(x, z)) inst('person', x, G + .0045, z, Math.atan2(b[1] - a[1], b[0] - a[0]), 1, PEOPLE[k % 5]); } } }, 'tiny');
    }

    /* ------------------------------------------------------------------ Metro additions */
    // Station forecourts: paving (context), entrance pavilions with blue canopies (staged), a taxi and bus bay at the
    // main station, benches and lamps; trains are drawn by the engine (blue and silver, no branding).
    function metro(mt, MR){
      const fore = [[mt.x - .03, mt.z + .02], [MR[2][0], MR[2][1] + .016], [MR[5][0] - .016, MR[5][1]]];
      for (const [x, z] of fore) addDisc(x, G + .0036, z, .011, [.88, .86, .82], 18);
      sig('metro', () => { for (const [x, z] of fore) { addBox(x, G + .0036, z, .006, .0042, .005, [.94, .94, .92]); addBox(x, G + .0078, z, .0075, .0007, .0065, [.20, .42, .82]); addBox(x + .0045, G + .0036, z, .0006, .009, .0006, [.20, .42, .82]); } });
      sig('metro', () => { for (const [x, z] of fore) { inst('bench', x - .006, G + .0036, z + .004, 0, 1); inst('lamp', x + .007, G + .0036, z - .004, 0, 1); }
        inst('bus', mt.x - .046, G + .0036, mt.z + .03, 0, 1); inst('car', mt.x - .036, G + .0036, mt.z + .034, 0, 1, [.95, .85, .35]); inst('car', mt.x - .031, G + .0036, mt.z + .034, 0, 1, [.92, .92, .90]); }, 'props');
      sig('metro', () => { const rn = mulberry32(4270); for (const [x, z] of fore) for (let i = 0; i < 6; i++) inst('person', x + (rn() - .5) * .016, G + .0037, z + (rn() - .5) * .016, rn() * TAU, 1, PEOPLE[i % 4]); }, 'tiny');
    }

    /* ------------------------------------------------------------------ Renewable Energy Program */
    // Solar rows on posts with tilted panels and their frames, inverter kiosks between the blocks, a fenced substation
    // with transformers and a gantry, gravel service tracks, the perimeter fence and the existing three turbines.
    // Context (the programme already runs): the layout and every count stay the same in every game state.
    function renewables(re, addTurbine){
      const X = d => re.x + d, Z = d => re.z + d, R0 = re.foot - .006, gravel = [.80, .74, .62], panel = [.18, .30, .52], frame = [.80, .82, .84];
      addDisc(re.x, G + .0024, re.z, R0, [.84, .78, .64], 40);
      addStrip([X(-.085), Z(.03)], [X(.06), Z(.03)], .002, G + .0032, gravel); addStrip([X(.043), Z(-.07)], [X(.043), Z(.07)], .002, G + .0032, gravel); addStrip([X(-.02), Z(-.075)], [X(-.02), Z(.03)], .0016, G + .0032, gravel);
      const row = (x0, x1, z) => { if (x1 - x0 < .008) return;
        for (let t = x0 + .002; t <= x1 - .001; t += .008) addBox(X(t), G + .0028, Z(z), .0005, .0016, .0005, frame);
        const a = [X(x0), G + .0046, Z(z - .0022)], b = [X(x1), G + .0046, Z(z - .0022)], c = [X(x1), G + .0028, Z(z + .0022)], d = [X(x0), G + .0028, Z(z + .0022)];
        addQuad(a, b, c, d, panel); addQuad(d, c, [c[0], c[1] - .0004, c[2]], [d[0], d[1] - .0004, d[2]], frame);
        for (let t = x0 + .006; t < x1; t += .006) addRod([X(t), G + .00465, Z(z - .0022)], [X(t), G + .00285, Z(z + .0022)], .00025, [.40, .50, .66]); };
      const inside = (u, v) => Math.hypot(u, v) < R0 - .007;
      for (const [bx0, bx1, bz0, bz1] of [[-.084, -.026, -.068, .024], [-.014, .036, -.068, .024], [-.062, .036, .038, .07]]) for (let v = bz0; v <= bz1 + 1e-9; v += .0062) {
        let x0 = bx0, x1 = bx1; while (x0 < x1 && !inside(x0, v)) x0 += .002; while (x1 > x0 && !inside(x1, v)) x1 -= .002;
        if (near(X(0), Z(v), re.pad, .03) || Math.abs(Z(v) - re.pad[1]) < .016) { row(x0, Math.min(x1, -.026), v); row(Math.max(x0, .026), x1, v); continue; }
        row(x0, x1, v); }
      for (const [dx, dz] of [[-.02, .036], [.049, -.02], [.049, .012]]) { addBox(X(dx), G + .0028, Z(dz), .005, .0034, .0035, [.88, .88, .86]); addBox(X(dx), G + .0062, Z(dz), .0054, .0004, .0039, [.60, .62, .64]); }   // inverters
      { const x = X(.062), z = Z(.042); addBox(x, G + .0028, z, .022, .0003, .018, [.66, .64, .60]);                    // substation
        for (const [u, v] of [[-.005, -.004], [.004, -.004], [-.005, .005], [.004, .005]]) { addBox(x + u, G + .0031, z + v, .004, .0045, .003, [.62, .66, .64]); addBox(x + u, G + .0076, z + v, .0012, .0018, .0012, [.88, .86, .80]); }
        for (const e of [-1, 1]) addBox(x + e * .009, G + .0031, z, .0006, .011, .0006, [.80, .80, .82]); addBox(x, G + .0141, z, .019, .0006, .0006, [.80, .80, .82]);
        fence(rect(x - .012, z - .0095, x + .012, z + .0095), .003, [.74, .74, .76]); }
      fence(circlePoly(re.x, re.z, R0 - .002, 48), .0032, [.80, .80, .80], [[12, 0, 1], [36, 0, 1]]);
      for (let i = 0; i < 3; i++) addTurbine(re.x + .068, re.z - .045 + i * .038, .42);
    }

    /* ------------------------------------------------------------------ downtown (the skyline is a place, not a project: context) */
    // Paved forecourts round the Kingdom Centre and Al Faisaliah with entrance canopies, a planted median and street
    // trees along King Fahd Road through downtown, planted edges on the downtown streets, small plazas at the financial
    // towers. Trees go to the detail layer (they appear as the camera approaches).
    function downtown(ry, kc, fz, fin){
      const rn = mulberry32(4280), pave = [.90, .88, .83];
      flat(kc[0] - .07, kc[1] - .033, kc[0] + .07, kc[1] + .04, G + .0016, pave); flat(fz[0] - .036, fz[1] - .036, fz[0] + .036, fz[1] + .036, G + .0016, pave);
      for (const [x, z] of fin) flat(x - .02, z - .02, x + .02, z + .02, G + .0016, pave);
      addBox(kc[0], G + .012, kc[1] + .033, .03, .0012, .008, [.34, .36, .40]); addBox(fz[0], G + .008, fz[1] + .034, .016, .001, .006, [.34, .36, .40]);   // entrance canopies
      addStrip([ry.x, ry.z - .11], [ry.x, ry.z + .11], .0018, G + .0066, [.50, .70, .40]);                                 // planted median on King Fahd Road
      K.into('detail', () => {
        for (let z = ry.z - .105; z <= ry.z + .105; z += .009) { smallTree(ry.x, z, .07, [.26, .58, .30]); for (const e of [-1, 1]) if (rn() < .8 && Math.abs(z - kc[1]) > .045) smallTree(ry.x + e * .016, z, .085, [.22 + rn() * .06, .54 + rn() * .1, .26]); }
        for (const o of [-.078, -.052, .052, .078]) for (let t = -.095; t <= .095; t += .012) for (const [x, z] of [[ry.x + o + .0055, ry.z + t], [ry.x + t, ry.z + o + .0055]]) {
          if (Math.abs(x - ry.x) < .024 || Math.hypot(x - kc[0], z - kc[1]) < .06 || Math.hypot(x - fz[0], z - fz[1]) < .04 || rn() < .45 || Math.hypot(x - ry.x, z - ry.z) > .11) continue; smallTree(x, z, .065, [.24, .56 + rn() * .08, .28]); }
        for (const [x, z] of fin) for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .4; smallTree(x + Math.cos(a) * .017, z + Math.sin(a) * .017, .075, [.24, .58, .28]); }
        for (const [x, z] of [[kc[0] - .06, kc[1] + .036], [kc[0] + .06, kc[1] + .036], [fz[0] - .03, fz[1] + .032], [fz[0] + .03, fz[1] + .032]]) addPalm(x, z, .12);
      });
    }

    /* ------------------------------------------------------------------ roads */
    // Lane dashes on the named city roads (the engine draws asphalt, the centre line and white edge lines), broken at
    // junctions; the road paths are kept for the animated traffic.
    function roadMarks(){
      for (const r of LY.CITY_ROADS) { const pts = r.pts; if (r.w < .018) continue;
        for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
          for (const o of [-r.w * .25, r.w * .25]) for (let t = .004; t < L; t += .012) { const x = a[0] + (b[0] - a[0]) * t / L + nx * o, z = a[1] + (b[1] - a[1]) * t / L + nz * o; if (LY.cityRoadDist(x, z, [r.id]) < .012) continue; addStrip([x - Math.cos(rot) * .0025, z - Math.sin(rot) * .0025], [x + Math.cos(rot) * .0025, z + Math.sin(rot) * .0025], .0002, G + .0065, [.94, .94, .92]); } } }
      paths.roads = LY.CITY_ROADS.filter(r => !r.minor).map(r => ({pts:r.pts, w:r.w, L:r.pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - r.pts[i][0], q[1] - r.pts[i][1]), 0)}));
    }

    /* ------------------------------------------------------------------ animation */
    // Decorative motion, rebuilt each frame into the vehicles layer by the engine: coaster trains on their track, and a
    // baggage train and a service van along the airside service road. Quality and distance gated by the caller.
    const CAR = [[.92, .92, .90], [.20, .22, .26], [.62, .64, .67], [.78, .80, .82], [.55, .20, .18], [.24, .36, .55], [.95, .85, .35]];
    function animate(t, o){
      const along = trackSample;
      if (o.phase('qiddiya') >= 4 && paths.coaster) { const R = paths.coaster;
        for (let tr = 0; tr < 2; tr++) { const q0 = (t / 26000 + tr * .5) % 1; for (let c = 0; c < 4; c++) { const [x, y, z, r, pitch] = along(R, q0 - c * .0038/trackArc(R).at(-1)); inst('ride', x, y + .0005, z, r, 1, tr ? [.30, .62, .90] : [.95, .74, .22], pitch); } } }
      if (paths.roads) paths.roads.forEach((r, ri) => { const n = Math.max(2, Math.round(r.L / (o.quality === 'high' ? .06 : .12)));   // Medium: half the traffic                   // traffic, both directions, kerb lanes
        for (let k = 0; k < n; k++) for (const dir of [0, 1]) { const q = ((t / (9000 * r.L / .3) * (1 + (k % 3) * .12) + k / n + ri * .13 + dir * .5) % 1), f = dir ? 1 - q : q;
          let d = f * r.L, i = 1; while (i < r.pts.length - 1 && d > Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1])) { d -= Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); i++; }
          const a = r.pts[i - 1], b = r.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = Math.min(1, d / L), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L, o = r.w * (dir ? .3 : -.3), rot = Math.atan2(b[1] - a[1], b[0] - a[0]) + (dir ? Math.PI : 0);
          inst(k % 7 === 3 ? 'bus' : 'car', a[0] + (b[0] - a[0]) * u + nx * o, G + .0062, a[1] + (b[1] - a[1]) * u + nz * o, rot, 1, CAR[(k * 3 + ri + dir) % CAR.length]); } });
      if (o.quality === 'high' && o.phase('ksip') >= 4 && paths.airside) { const [[ax, az], [bx, bz]] = paths.airside;
        for (const [k, sp, key] of [[0, 52000, 'tug'], [.5, 41000, 'van']]) { const q = (t / sp + k) % 2, f = q < 1 ? q : 2 - q, x = ax + (bx - ax) * f, z = az + (bz - az) * f + (q < 1 ? -.0011 : .0011), r = q < 1 ? 0 : Math.PI;
          inst(key, x, G + .0052, z, r, 1); if (key === 'tug') for (let c = 1; c < 4; c++) inst('bagcart', x - Math.cos(r) * c * .0029, G + .0052, z, r, 1); } }
    }

    return {protos, smallTree, airport, qiddiya, downtown, roshn, expo, murabba, diriyah, sports, park, green, metro, renewables, roadMarks, animate, paths};
  }};
})();
