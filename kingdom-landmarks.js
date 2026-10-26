// V21: Kingdom-map landmark clusters (shown only on the national overview, distance > 6), in the exaggerated scale of an
// illustrated map. Original stylized geometry built from boxes, cones, cylinders and spheres, merged into the
// overview's shared cluster mesh by country-overview.js. Positions come from the existing city/project data; nothing
// here is pickable or simulated.
window.VisionKingdomLandmarks = function(ctx){
  const {S, G, onLand, geo, D, LY, R} = ctx;
  // Illustrated-map exaggeration about each city's anchor: footprints grow by SZ, heights by SY, their spread by OFF
  // (V22: the reference draws its skylines about three times the V21 size). Sea objects keep their water level.
  const SZ = 2.5, SY = 2.55, OFF = 2.2; let ax = 0, az = 0; const at = (x, z) => { ax = x; az = z; };
  const stamp = (shape, x, y, z, sx, sy, sz, hex, bottom) => ctx.stamp(shape, ax + (x - ax) * OFF, y < G ? y : G + (y - G) * SY, az + (z - az) * OFF, sx * SZ, sy * SY, sz * SZ, hex, bottom);
  const city = n => LY.cityDisplay[n] || (c => [c.x, c.z])(D.cities.find(c => c.name === n));
  const proj = id => { const p = D.projects.find(q => q.id === id); return p ? [p.x, p.z] : null; };
  const GLASS = [0x46839e, 0x91bdcb, 0x36728b, 0xb5d2d4, 0x537d96], STONE = [0xe8d3ac, 0xdcc196, 0xf0dfbf], MUD = [0xc79a68, 0xb98a5b, 0xd1a875];
  const pick = a => a[Math.floor(R() * a.length)];
  // coast finder: step from a city toward the sea until the land ends
  const coastFrom = (x, z, dx, dz) => { for (let k = 0; k < 60; k++) { const px = x + dx * k * .01, pz = z + dz * k * .01; if (!onLand(px, pz)) return [px, pz]; } return [x + dx * .3, z + dz * .3]; };
  const out = {towers:0, ships:[]};

  // A glass tower: shaft with lit floor bands, a cap and sometimes a spire.
  function tower(x, z, w, h, col, spire){ stamp(S.cube, x, G + h / 2, z, w, h, w * .9, col, .78);
    for(const side of[-1,1])for(const dx of[-.27,0,.27])stamp(S.cube,x+dx*w,G+h*.48,z+side*w*.452,w*.035,h*.92,.0008,0xd9e5de);
    for (let k = 1; k < Math.min(12, h / .015); k++) stamp(S.cube, x, G + h * k / Math.min(12, h / .015), z, w * 1.04, .0016, w * .94, 0xe9f2f4);
    stamp(S.cube, x, G + h + .003, z, w * .8, .006, w * .7, 0xdfe8ea); if (spire) stamp(S.cone, x, G + h + .02, z, w * .18, .04, w * .18, 0xeef3f4); out.towers++; }
  function lowBlock(x, z, w, h, col){ stamp(S.cube, x, G + h / 2, z, w, h, w * (.8 + R() * .4), col, .86); stamp(S.cube, x, G + h + .0015, z, w * 1.04, .003, w * 1.04, 0xf4e9d2);
    for(const dx of [-.27,.27]){stamp(S.cube,x+dx*w,G+h*.52,z+w*.51,w*.17,h*.28,.0015,0x365b69);stamp(S.cube,x+w*.51,G+h*.52,z+dx*w,.0015,h*.28,w*.17,0x365b69);}
    stamp(S.cube,x,G+h*.25,z+w*.52,w*.18,h*.5,.002,0x75533b);
    stamp(S.cube,x-w*.22,G+h+.005,z-w*.18,w*.25,.007,w*.26,0xc6c1ad); }
  function najdi(x, z, w, h){ stamp(S.cube, x, G + h / 2, z, w, h, w, pick(MUD), .85); for (const sx of [-1, 1]) for (const sz of [-1, 1]) stamp(S.cube, x + sx * w * .42, G + h + .004, z + sz * w * .42, w * .14, .008, w * .14, 0xb07d4c); }
  function minaret(x, z, h){ stamp(S.cyl, x, G + h / 2, z, .0045, h, .0045, 0xf6f1e6); stamp(S.cyl, x, G + h * .72, z, .007, .004, .007, 0xe2d3ad); stamp(S.cone, x, G + h + .009, z, .0055, .018, .0055, 0xe0b54e); }
  function ship(x, z, rot, big){ out.ships.push([ax + (x - ax) * OFF, az + (z - az) * OFF, rot, big]); }
  const ring = (x, z, r, n, fn) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + R() * .3, d = r * (.35 + .65 * Math.sqrt(R())); fn(x + Math.cos(a) * d, z + Math.sin(a) * d * .85, i); } };

  // ---- Riyadh: Kingdom Centre (twin-shaft "arch" crown), Al Faisaliah (tapered with a golden orb), glass skyline, Najdi quarter
  { const [x, z] = city('Riyadh'), kx = x + .02, kz = z - .02, H = .36; at(x, z);
    // Kingdom Centre's continuous tapered body and curved open crown, extruded as a real concave mesh.
    {const T=ctx.T,shape=new T.Shape(),outline=[[-.026,0],[.026,0],[.022,H*.65],[.027,H*.96],[.024,H],[.017,H*.98],[.013,H*.92],[.008,H*.88],[0,H*.865],[-.008,H*.88],[-.013,H*.92],[-.017,H*.98],[-.024,H],[-.027,H*.96],[-.022,H*.65]];
     outline.forEach(([px,py],i)=>i?shape.lineTo(px,py):shape.moveTo(px,py));shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth:.027,bevelEnabled:false,steps:1,curveSegments:12});g.translate(0,0,-.0135);stamp(g,kx,G,kz,1,1,1,0x84b3c9);g.dispose();
     for(let k=1;k<18;k++)stamp(S.cube,kx,G+H*.043*k,kz+.0139,.043,.0007,.001,0xb8d7df);
     for(const sd of[-1,1])stamp(S.cube,kx+sd*.022,G+H*.39,kz+.014,.0015,H*.78,.0015,0xdbeced);
     stamp(S.cube,kx,G+H*.865,kz,.025,.005,.029,0xe1eded);
    }
    stamp(S.cube, kx, G + .012, kz, .07, .024, .05, 0xdfe7e6);
    const fx = x - .09, fz = z + .03; {const g=new ctx.T.ConeGeometry(1,1,4).rotateY(Math.PI/4);stamp(g, fx, G + .13, fz, .032, .26, .032, 0x8fb1c2, .78);g.dispose();} stamp(S.orb, fx, G + .195, fz, .012, .012, .012, 0xe6b04a); stamp(S.cone, fx, G + .27, fz, .004, .04, .004, 0xdbe3e5);
    ring(x, z, .2, 36, (px, pz, i) => { if (Math.hypot(px - kx, pz - kz) < .045 || Math.hypot(px - fx, pz - fz) < .04) return; tower(px, pz, .016 + R() * .012, .06 + R() * .2 * (1 - Math.hypot(px - x, pz - z) / .3), pick(GLASS), R() < .3); });
    const px = x + .1, pz = z - .06, PH = .3;   // V22: PIF Tower (slim shaft, notched glass crown)
    stamp(S.cube, px, G + PH * .45, pz, .02, PH * .9, .02, 0x7fa9c4, .74); stamp(S.cube, px, G + PH * .93, pz, .015, PH * .1, .02, 0xa9d2e4, .85); stamp(S.cone3, px, G + PH + .012, pz, .008, .03, .008, 0xdbe6ea);
    { const mx = x - .05, mz = z + .1; stamp(S.cube, mx, G + .012, mz, .05, .024, .04, 0xc08d5c, .82);   // V22: Al Masmak fort (mud walls, round corner towers)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { stamp(S.cyl, mx + sx * .025, G + .017, mz + sz * .02, .008, .034, .008, 0xb5814f, .8); stamp(S.cyl, mx + sx * .025, G + .035, mz + sz * .02, .0085, .003, .0085, 0xd4a774); } }
    ring(x - .12, z + .17, .09, 14, (px, pz) => najdi(px, pz, .02 + R() * .012, .012 + R() * .01));       // Diriyah-style mud quarter
    ring(x, z, .3, 22, (px, pz) => { if (Math.hypot(px - x, pz - z) > .2) lowBlock(px, pz, .016, .012 + R() * .014, pick(STONE)); }); }

  // ---- Jeddah: Jeddah Tower (tall three-sided spire), waterfront towers, port cranes and containers, ships
  { const [x0, z] = city('Jeddah'), [cx, cz] = coastFrom(x0, z, -1, 0), x = cx + .06; at(cx + .02, z);   // V23: anchored on the coast, so the city spreads along the corniche, clear of Makkah
    const tx = cx + .05, tz = z - .1; stamp(S.cone3, tx, G + .17, tz, .034, .34, .034, 0xd7e6ee, .76); stamp(S.cube, tx, G + .02, tz, .05, .04, .05, 0xe8eef0);
    for (let i = 0; i < 9; i++) { const pz = z - .14 + i * .03, px = cx + .03 + R() * .05; if (onLand(px, pz) && Math.hypot(px - tx, pz - tz) > .03) tower(px, pz, .015 + R() * .01, .07 + R() * .12, pick(GLASS), R() < .4); }
    ring(x + .04, z, .1, 14, (px, pz) => { if (onLand(px, pz)) lowBlock(px, pz, .016, .012 + R() * .016, pick(STONE)); });
    const py = cz + .07; for (let i = 0; i < 4; i++) { const qx = cx + .012, qz = py + i * .026; stamp(S.cube, qx, G + .03, qz, .004, .06, .004, 0xd8473a); stamp(S.cube, qx - .014, G + .058, qz, .03, .004, .004, 0xd8473a); }
    for (let i = 0; i < 18; i++) stamp(S.cube, cx + .03 + (i % 3) * .011, G + .005, py - .01 + Math.floor(i / 3) * .016, .009, .008, .013, [0xd64a3b, 0x2f7fc0, 0xe7b23c, 0x3e9d63, 0xf0efe8][i % 5]);
    ship(cx - .07, py + .02, .2, true); ship(cx - .1, z - .05, -.4, false); ship(cx - .16, z + .2, .1, true); ship(cx - .06, z + .3, .5, false); }

  // ---- Makkah: the Haram (white courtyard, colonnade ring, minarets), the Kaaba (black, gold band), the clock tower
  { const [x0, z] = city('Makkah'), x = x0 + .14; at(x, z);   // V23: the Haram district sits inland in its valley, apart from Jeddah
    stamp(S.cyl, x, G + .004, z, .1, .008, .085, 0xf7f4ec, .95);                                       // courtyard
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; stamp(S.cube, x + Math.cos(a) * .1, G + .012, z + Math.sin(a) * .085, .026, .022, .022, 0xf1ece0, .9); }
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + .3; minaret(x + Math.cos(a) * .115, z + Math.sin(a) * .1, .1); }
    stamp(S.cube, x, G + .019, z, .028, .03, .028, 0x16171a, .7); stamp(S.cube, x, G + .026, z, .0292, .004, .0292, 0xd8ae45);   // Kaaba + kiswa band
    const cx = x + .01, cz = z - .17; stamp(S.cube, cx, G + .09, cz, .05, .18, .05, 0xe9e2d2, .8); stamp(S.cube, cx, G + .2, cz, .035, .05, .035, 0xe2dccb);
    for (const s of [-1, 1]) stamp(S.orb, cx, G + .2, cz + s * .019, .014, .014, .003, 0x3f8f5a); stamp(S.cone, cx, G + .25, cz, .009, .05, .009, 0xe0b54e);
    for (const [dx, dz] of [[-.05, -.15], [.06, -.15], [-.09, -.09], [.09, -.08]]) lowBlock(x + dx, z + dz, .03, .05 + R() * .04, 0xe4dccb);
    ring(x, z, .2, 18, (px, pz) => { if (Math.hypot(px - x, pz - z) > .14 && Math.hypot(px - cx, pz - cz) > .05) lowBlock(px, pz, .016, .012 + R() * .02, pick(STONE)); }); }

  // ---- Madinah: the Prophet's Mosque (white hall, green dome, ten minarets, shade umbrellas)
  { const [x, z] = city('Madinah'); at(x, z);
    stamp(S.cube, x, G + .012, z, .19, .024, .12, 0xf6f2e8, .92); stamp(S.cube, x, G + .004, z + .1, .19, .008, .08, 0xefe9da);
    stamp(S.cyl, x + .03, G + .03, z - .02, .022, .02, .022, 0xf3eee3); stamp(S.orb, x + .03, G + .042, z - .02, .021, .024, .021, 0x2f9a57);   // green dome
    for (const [dx, dz] of [[-.05, 0], [-.02, .03], [.06, .03]]) stamp(S.orb, x + dx, G + .028, z + dz, .012, .01, .012, 0xe9e3d3);
    for (const dx of [-.095, -.03, .03, .095]) for (const dz of [-.06, .06]) minaret(x + dx, z + dz, .11);
    for(const dx of[-.095,.095])minaret(x+dx,z,.11);
    for (let i = 0; i < 10; i++) { const ux = x - .08 + (i % 5) * .04, uz = z + .085 + Math.floor(i / 5) * .03; stamp(S.cyl, ux, G + .012, uz, .0015, .022, .0015, 0xdcd6c8); stamp(S.cone, ux, G + .026, uz, .014, .008, .014, 0xf7f4ee); }
    ring(x, z, .24, 22, (px, pz) => { if (Math.abs(px - x) > .12 || Math.abs(pz - z) > .1) lowBlock(px, pz, .017, .012 + R() * .02, pick(STONE)); }); }

  // ---- Dammam / Eastern Province: towers, refinery (spherical and cylindrical tanks, flare stacks), harbour cranes, tankers
  { const [x, z] = city('Dammam'); at(x, z);
    ring(x - .05, z - .02, .12, 14, (px, pz) => { if (onLand(px, pz)) tower(px, pz, .016 + R() * .01, .06 + R() * .12, pick(GLASS), R() < .25); });
    const rx = x - .14, rz = z + .14;
    for (let i = 0; i < 6; i++) { const px = rx + (i % 3) * .035, pz = rz + Math.floor(i / 3) * .035; stamp(S.orb, px, G + .016, pz, .016, .016, .016, 0xf3f3ef, .82); stamp(S.cyl, px, G + .004, pz, .006, .008, .006, 0xc8c8c2); }
    for (let i = 0; i < 5; i++) stamp(S.cyl, rx + .12 + (i % 2) * .03, G + .012, rz - .02 + i * .022, .013, .024, .013, 0xe7e6df, .85);
    for (let i = 0; i < 3; i++) { const px = rx - .03 + i * .03, pz = rz + .09; stamp(S.cyl, px, G + .05, pz, .003, .1, .003, i % 2 ? 0xf2f2ee : 0xd84a3a); stamp(S.orb, px, G + .104, pz, .006, .01, .006, 0xffb03a); }
    for (let i = 0; i < 4; i++) stamp(S.cube, rx + .02 + i * .02, G + .022, rz + .05, .006, .044, .006, 0x9aa3a8);
    const [cx, cz] = coastFrom(x, z, 1, -.2); for (let i = 0; i < 4; i++) { const qx = cx - .01, qz = cz - .06 + i * .03; stamp(S.cube, qx, G + .03, qz, .004, .06, .004, 0xf0b23a); stamp(S.cube, qx + .013, G + .058, qz, .03, .004, .004, 0xf0b23a); }
    ship(cx + .08, cz - .02, -.3, true); ship(cx + .14, cz + .1, .4, true); ship(cx + .1, cz - .14, .1, false);
    const op = proj('eastern'); if (op) { const [ox, oz] = coastFrom(op[0], op[1], 1, 0); const px = ox + .12, pz = oz; stamp(S.cube, px, -.17, pz, .05, .01, .05, 0xd9d2c3); for (const s of [-1, 1]) stamp(S.cyl, px + s * .018, -.18, pz, .004, .03, .004, 0x8c8f8a); stamp(S.cube, px, -.155, pz, .016, .02, .016, 0xd8473a); } }

  // ---- NEOM: The Line (long mirrored wall inland from the coast), a marina with white and glass towers
  { const n = proj('neom') || geo(35.45, 28.25), [cx, cz] = coastFrom(n[0], n[1], -1, 0); at(cx, cz);
    const len = .62, ax = cx + .02, az = cz, dx = .93, dz = .36;
    for (let i = 0; i < 24; i++) { const f = i / 24, px = ax + dx * f * len, pz = az + dz * f * len; if (!onLand(px, pz)) continue; stamp(S.cube, px, G + .025, pz, len / 24 * 1.05, .05, .012, i % 2 ? 0xbcd9e8 : 0xa7cde0, .7); stamp(S.cube, px, G + .051, pz, len / 24 * 1.05, .002, .013, 0xf3f8fa); }
    for (let i = 0; i < 7; i++) { const px = cx + .03 + R() * .06, pz = cz - .1 + R() * .08; if (onLand(px, pz)) tower(px, pz, .014, .05 + R() * .09, i % 2 ? 0xf2f4f3 : pick(GLASS), true); }
    ship(cx - .06, cz - .06, .3, false); ship(cx - .1, cz + .05, -.2, false);
    const sd = proj('sindalah'); if (sd && !onLand(sd[0], sd[1])) { stamp(S.cyl, sd[0], -.175, sd[1], .04, .012, .03, 0xf0e2c0); for (let i = 0; i < 3; i++) tower(sd[0] - .015 + i * .015, sd[1], .01, .03, 0xf4f5f2); } }

  // ---- AlUla: sandstone outcrops (an elephant-like arch, mesas) and a carved tomb facade
  if(!window.VisionSculptedWorld){ const [x, z] = city('AlUla'); at(x, z);
    for (let i = 0; i < 9; i++) { const px = x - .12 + R() * .24, pz = z - .1 + R() * .2, w = .03 + R() * .03, h = .03 + R() * .05; stamp(S.cube, px, G + h / 2, pz, w, h, w * (.7 + R() * .5), pick([0xb8693f, 0xa95f39, 0xc9784a]), .72); stamp(S.cube, px, G + h + .003, pz, w * .85, .006, w * .7, 0xd18a57); }
    for(const dx of[-.024,.024])stamp(S.cyl,x+.05+dx,G+.018,z+.05,.009,.036,.012,0xb86a40,.7);
    for(let k=0;k<9;k++){const a=k/8*Math.PI;stamp(S.orb,x+.05+Math.cos(a)*.024,G+.034+Math.sin(a)*.018,z+.05,.011,.009,.012,0xc27a4b,.8);}   // arch with light beneath
    stamp(S.cube, x - .05, G + .025, z + .07, .05, .05, .03, 0xc27a4b, .74); stamp(S.cube, x - .05, G + .022, z + .086, .014, .022, .002, 0x6e3d22); stamp(S.cone, x - .05, G + .043, z + .086, .012, .008, .002, 0x8a5030); }

  // V25 AlUla: actual stepped sandstone geometry and carved portal details.
  if(!window.VisionSculptedWorld){const [x,z]=city('AlUla');at(x,z);
   const tx=x-.05,tz=z+.07;
   for(let k=0;k<5;k++)stamp(S.cube,tx,G+.049+k*.003,tz,.055-k*.006,.003,.034,0xe0a46b);
   for(const d of[-.019,.019]){stamp(S.cube,tx+d,G+.027,tz+.017,.004,.035,.004,0xe2ab77);stamp(S.cube,tx+d,G+.045,tz+.017,.008,.003,.006,0xf0bc86);}
   for(let i=0;i<14;i++){const a=i*2.39996,px=x+Math.cos(a)*(.13+i*.007),pz=z+Math.sin(a)*(.12+i*.004),h=.05+R()*.075;
    if(!onLand(px,pz))continue;
    for(let k=0;k<4;k++){const w=(.027+R()*.012)*(1-k*.10);stamp(S.rock,px,G+h*(k+.5)/4,pz,w,h/4,w*.72,[0x9b5736,0xbc7446,0xcc8954,0xe0a167][k],.8);}
   }
  }

  // ---- Tabuk, Sakakah, Hail, Buraydah, Hofuf, Najran: compact towns with a fort or a landmark tower
  for (const n of ['Tabuk', 'Sakakah', 'Hail', 'Buraydah', 'Hofuf', 'Najran']) { const [x, z] = city(n); at(x, z);
    ring(x, z, .1, 12, (px, pz) => { if (onLand(px, pz)) lowBlock(px, pz, .016, .01 + R() * .016, pick(STONE)); });
    najdi(x, z - .02, .04, .022); if (n !== 'Najran') tower(x + .05, z, .016, .07 + R() * .04, pick(GLASS), true); }

  // ---- Aseer (Abha, Taif, Rijal Almaa) highland villages: stone tower houses with white trim; Jazan: coastal town and port
  for (const n of ['Abha', 'Taif']) { const [x, z] = city(n); at(x, z);
    ring(x, z, .12, 14, (px, pz) => { if (!onLand(px, pz)) return; const h = .02 + R() * .025; stamp(S.cube, px, G + h / 2 + ctx.height(ax+(px-ax)*OFF,az+(pz-az)*OFF)/SY, pz, .014, h, .014, pick([0x9b7b62, 0xb59072, 0xe9e1d0]), .8); stamp(S.cube, px, G + h + .002 + ctx.height(ax+(px-ax)*OFF,az+(pz-az)*OFF)/SY, pz, .015, .003, .015, 0xf5f2ea); }); }
  { const [x, z] = city('Jazan'), [cx, cz] = coastFrom(x, z, -1, .2); at(x, z);
    ring(x + .03, z, .09, 12, (px, pz) => { if (onLand(px, pz)) lowBlock(px, pz, .016, .012 + R() * .014, pick(STONE)); });
    for (let i = 0; i < 2; i++) stamp(S.cube, cx + .01, G + .03, cz - .02 + i * .03, .004, .06, .004, 0xd8473a); ship(cx - .08, cz, .2, false); ship(cx - .13, cz + .08, -.3, true); }
  return out;
};

// V21: Kingdom-map badges (reference map): colour style, icon, English/Arabic name, where it sits (a city or a project)
// and the regional view it opens. Drawn by engine.js as map labels on the national overview only.
(() => {
  const W = '#fff', Au = '#f4c35a';
  const ICON = {
    mountain:c => `<path d="M2 20 9.5 7.5l4.2 6.4 2.6-3.6L22 20z" fill="${c}"/><path d="m9.5 7.5 2.1 3.4-1.4-.6-1.2 1.3-1-1.6z" fill="#cfe6ff"/>`,
    temple:c => `<path d="M3 9 12 3.5 21 9z M4 20h16v1.6H4z M5 10.5h14v1.4H5z" fill="${c}"/><path d="M6.2 12.4h2v6.8h-2zm4.8 0h2v6.8h-2zm4.8 0h2v6.8h-2z" fill="${c}"/>`,
    monument:c => `<path d="M10.6 3h2.8l1.1 13h-5z M7 16.5h10v2.2H7z M5 19.4h14v1.8H5z" fill="${c}"/><circle cx="12" cy="7.5" r="1.1" fill="#7a4a26"/>`,
    oasis:c => `<path d="M11.4 9.5h1.3l.9 9.5h-3z" fill="${c}"/><path d="M12 9.5C9.5 6.2 6 6.4 4 8c3-.4 5.2.3 8 1.5zm0 0c2.5-3.3 6-3.1 8-1.5-3-.4-5.2.3-8 1.5zm0 0c-.7-3.4-3.2-5.6-5.8-5.6 2.4 1.3 4.2 3.2 5.8 5.6zm0 0c.7-3.4 3.2-5.6 5.8-5.6-2.4 1.3-4.2 3.2-5.8 5.6z" fill="${c}"/><path d="M3 20.5c3-1.8 15-1.8 18 0" stroke="${c}" stroke-width="1.6" fill="none"/>`,
    mosque:c => `<path d="M6.5 13a5.5 5.5 0 0 1 11 0z M5.5 13.6h13V20h-13z" fill="${c}"/><path d="M12 5.2v2.2" stroke="${c}" stroke-width="1.2"/><path d="M2.6 8h1.8v12H2.6zm17 0h1.8v12h-1.8z" fill="${c}"/><path d="M3.5 5.5 4.6 8H2.4zm17 0L21.6 8h-2.2z" fill="${c}"/><path d="M10.5 16.2h3V20h-3z" fill="#2a7b45"/>`,
    ship:c => `<path d="M12.6 3v12.2h6.6z" fill="${c}"/><path d="M11.4 5.5v9.7H6.4z" fill="${c}" opacity=".85"/><path d="M3 16.6h18l-2.6 3.6H5.6z" fill="${c}"/>`,
    kaaba:c => `<path d="M4 7.5 12 4l8 3.5v10L12 21l-8-3.5z" fill="#4a4a52" stroke="${c}" stroke-width=".9"/><path d="M4 7.5 12 11l8-3.5L12 4z" fill="#6a6a74"/><path d="m4 10.4 8 3.4 8-3.4v1.6l-8 3.4-8-3.4z" fill="${c}"/><path d="M12 11v10" stroke="#3a3a40" stroke-width=".6"/>`,
    tower:c => `<path d="M8.6 21 9.8 6.5c.3-2 1.2-3.4 2.2-3.4s1.9 1.4 2.2 3.4L15.4 21z" fill="${c}"/><path d="M10.9 5.8c.3-1 .7-1.5 1.1-1.5s.8.5 1.1 1.5l.2 2.4h-2.6z" fill="#7a4a26"/><path d="M3 21v-5.5h4V21zm14 0v-7.5h4V21z" fill="${c}" opacity=".8"/>`,
    industry:c => `<path d="M3 21V11l4.5 3V11l4.5 3V11l4.5 3V5.5h3V21z" fill="${c}"/><path d="M16.5 4c.6-1.3 2-1.6 3-.8" stroke="${c}" stroke-width="1.2" fill="none"/><path d="M6 17h2v2H6zm4.5 0h2v2h-2z" fill="#1d4f8f"/>`,
    palm:c => `<path d="M11.3 10h1.4l1.2 11h-3.6z" fill="${c}"/><path d="M12 10C9.2 6.6 5.4 6.9 3.2 8.7c3.3-.5 5.7.2 8.8 1.3zm0 0c2.8-3.4 6.6-3.1 8.8-1.3-3.3-.5-5.7.2-8.8 1.3zm0 0c-.9-3.7-3.7-6.1-6.6-6 2.7 1.3 4.8 3.3 6.6 6zm0 0c.9-3.7 3.7-6.1 6.6-6-2.7 1.3-4.8 3.3-6.6 6z" fill="${c}"/>`
  };
  window.VisionKingdomIcon = (name, c) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name](c)}</svg>`;
  window.VisionKingdomBadges = [
    {id:'neom', en:'NEOM', ar:'نيوم', style:'blue', icon:'mountain', color:W, project:'neom', region:'northwest', dx:-.05, dz:-.12},
    {id:'alula', en:'AlUla', ar:'العُلا', style:'brown', icon:'temple', color:Au, city:'AlUla', region:'northwest', dx:.48, dz:.09},
    {id:'tabuk', en:'Tabuk', ar:'تبوك', style:'brown', icon:'monument', color:Au, city:'Tabuk', region:'northwest', dx:.75, dz:.3},
    {id:'sakakah', en:'Sakakah', ar:'سكاكا', style:'brown', icon:'oasis', color:Au, city:'Sakakah', region:null},
    {id:'madinah', en:'Madinah', ar:'المدينة المنورة', style:'green', icon:'mosque', color:W, city:'Madinah', region:'west', dx:.28, dz:.28},
    {id:'jeddah', en:'Jeddah', ar:'جدة', style:'blue', icon:'ship', color:W, city:'Jeddah', region:'west', dx:-.16, dz:-.04},
    {id:'makkah', en:'Makkah', ar:'مكة المكرمة', style:'black', icon:'kaaba', color:Au, city:'Makkah', region:'west', dx:.42, dz:.12},
    {id:'riyadh', en:'Riyadh', ar:'الرياض', style:'brown', icon:'tower', color:Au, city:'Riyadh', region:'riyadh', dx:.12, dz:.55},
    {id:'dammam', en:'Dammam', ar:'الدمام', style:'blue', icon:'industry', color:W, city:'Dammam', region:'east', dx:.18, dz:.40},
    {id:'aseer', en:'Aseer', ar:'عسير', style:'green', icon:'mountain', color:W, city:'Abha', region:'south'},
    {id:'jazan', en:'Jazan', ar:'جازان', style:'green', icon:'palm', color:W, city:'Jazan', region:'south'}
  ];
})();
