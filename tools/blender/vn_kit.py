# VisionNexus2030 procedural asset kit for Blender (bmesh-based, one mesh object per asset)
import bpy, bmesh, math, random
from mathutils import Matrix, Vector, Euler

COMMON_BRIEF = (
    "Stylized low-poly game asset for a top-down/three-quarter Saudi Vision 2030 map. "
    "Real-world metres, Z-up, origin at the base centre, resting flat on Z=0. "
    "Clean readable silhouette at small map scale, simple flat PBR materials, "
    "no text, logos, signage or invented ornament. One self-contained object, "
    "no terrain, water, roads or rails unless stated."
)

PAL = {  # name: (linear rgb, metallic, roughness)
    'gold': ((0.80, 0.56, 0.24), 0.85, 0.35),
    'bronze': ((0.09, 0.055, 0.03), 0.6, 0.45),
    'silverblue': ((0.55, 0.64, 0.74), 0.8, 0.15),
    'blueglass': ((0.12, 0.24, 0.38), 0.5, 0.08),
    'glass': ((0.45, 0.62, 0.75), 0.3, 0.05),
    'concrete': ((0.68, 0.67, 0.64), 0.0, 0.8),
    'white': ((0.88, 0.88, 0.86), 0.0, 0.5),
    'steel': ((0.58, 0.60, 0.63), 0.85, 0.3),
    'dark': ((0.04, 0.045, 0.05), 0.2, 0.4),
    'mud': ((0.62, 0.42, 0.27), 0.0, 0.95),
    'mudlight': ((0.72, 0.54, 0.37), 0.0, 0.95),
    'sand': ((0.82, 0.70, 0.50), 0.0, 0.9),
    'rock': ((0.50, 0.33, 0.21), 0.0, 0.95),
    'leaf': ((0.10, 0.30, 0.08), 0.0, 0.8),
    'trunk': ((0.28, 0.18, 0.09), 0.0, 0.9),
    'grass': ((0.20, 0.40, 0.12), 0.0, 0.9),
    'water': ((0.06, 0.30, 0.45), 0.1, 0.05),
    'solar': ((0.02, 0.06, 0.22), 0.4, 0.15),
    'teal': ((0.00, 0.50, 0.50), 0.1, 0.4),
    'terracotta': ((0.72, 0.33, 0.18), 0.0, 0.8),
    'metroaccent': ((0.00, 0.45, 0.28), 0.2, 0.4),
    'paving': ((0.76, 0.70, 0.60), 0.0, 0.85),
    'court': ((0.12, 0.35, 0.55), 0.0, 0.7),
    'asphalt': ((0.10, 0.10, 0.10), 0.0, 0.9),
    'wood': ((0.50, 0.30, 0.15), 0.0, 0.7),
    'stone': ((0.80, 0.74, 0.64), 0.0, 0.85),
    'red': ((0.60, 0.08, 0.06), 0.1, 0.5),
    'orange': ((0.85, 0.40, 0.08), 0.1, 0.5),
    'purple': ((0.30, 0.12, 0.45), 0.1, 0.5),
    'yellow': ((0.85, 0.65, 0.10), 0.1, 0.5),
    'green': ((0.04, 0.32, 0.12), 0.1, 0.4),
    'plaster': ((0.86, 0.82, 0.74), 0.0, 0.9),
    'coral': ((0.70, 0.62, 0.50), 0.0, 0.95),
    'mirror': ((0.62, 0.70, 0.78), 0.95, 0.06),
    'marble': ((0.92, 0.92, 0.90), 0.0, 0.3),
    'black': ((0.015, 0.015, 0.015), 0.0, 0.6),
    'olive': ((0.22, 0.28, 0.10), 0.0, 0.85),
    'sandstone': ((0.60, 0.36, 0.20), 0.0, 0.95),
    'snow': ((0.93, 0.95, 0.98), 0.0, 0.6),
    'slate': ((0.16, 0.16, 0.18), 0.0, 0.8),
    'shallow': ((0.15, 0.62, 0.58), 0.1, 0.1),
    'coralpink': ((0.78, 0.42, 0.36), 0.0, 0.8),
    'blue': ((0.04, 0.16, 0.55), 0.1, 0.4),
}


def kit_turbine(A, x=0, y=0, z=0, h=80.0, blade=38.0, phase=0.0):
    """Wind turbine; rotor faces -Y."""
    A.cyl('white', 2.2, h, x, y, z, r2=1.3, seg=10)
    A.blk('white', 4, 10, 4, x, y + 1, z + h - 1)
    A.sphere('white', 1.8, (x, y - 4.5, z + h + 1), seg=10)
    for k in range(3):
        a = phase + k * 120
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        A.box('white', (2.2, 0.5, blade), (x + sa * blade / 2, y - 4.8, z + h + 1 + ca * blade / 2), (0, a, 0))


def kit_tank(A, x=0, y=0, z=0, r=10.0, h=14.0, m='white'):
    A.cyl(m, r, h, x, y, z, seg=20)
    A.dome(m, r, x, y, z + h, seg=16, sz=0.18)
    A.blk('steel', 0.3, 0.3, h, x + r, y, z)


def kit_sphere_tank(A, x=0, y=0, z=0, r=9.0):
    for k in range(6):
        a = 2 * math.pi * k / 6
        A.blk('steel', 0.6, 0.6, r, x + r * 0.7 * math.cos(a), y + r * 0.7 * math.sin(a), z)
    A.sphere('white', r, (x, y, z + r * 1.4), seg=16)


def kit_piperack(A, x0, x1, y=0, z=0, h=7.0, pipes=('steel', 'yellow', 'white')):
    L = x1 - x0
    for i in range(int(L / 8) + 1):
        px = x0 + i * 8
        for s in (-2, 2):
            A.blk('steel', 0.4, 0.4, h, px, y + s, z)
        A.blk('steel', 0.4, 4.4, 0.4, px, y, z + h)
    for k, pm in enumerate(pipes):
        A.cyl(pm, 0.45, L, x0, y - 1.4 + k * 1.4, z + h + 0.85, seg=8, rot=(0, 90, 0))


def kit_hull(A, m, L, W, Hh, x=0, y=0, z=0, bow=0.32):
    """Boat hull along +X (bow at +X). Keel at z, deck at z+Hh."""
    rings = []
    n = 8
    for i in range(n + 1):
        t = i / n
        if t <= 1 - bow:
            w, k = W / 2, 0.0
        else:
            f = (t - (1 - bow)) / bow
            w, k = max(0.08, W / 2 * (1 - f ** 1.6)), Hh * 0.55 * f ** 1.5
        rings.append(([(-k, 0), (-(Hh * 0.45 + k * 0.4), w * 0.85), (-Hh, w), (-Hh, -w), (-(Hh * 0.45 + k * 0.4), -w * 0.85)], -L / 2 + L * t))
    A.loft(m, rings, off=(x, y, z), rot=(0, 90, 0))

CONTAINER_COLS = ['red', 'teal', 'orange', 'yellow', 'steel', 'court', 'terracotta', 'white']


# ---- shared port kit builders (draw into any Asset at an offset)
def kit_crane(A, x=0, y=0, z=0, h=40.0, m='orange'):
    """Ship-to-shore gantry crane. Rails run along X; boom reaches toward +Y (sea)."""
    for lx in (-9, 9):
        for ly in (-12, 12):
            A.blk(m, 1.8, 1.8, h, x + lx, y + ly, z)
        A.blk(m, 1.6, 26, 1.6, x + lx, y, z + 6)
        A.blk('dark', 3, 26, 1.2, x + lx, y, z)
    for ly in (-12, 12):
        A.blk(m, 20, 1.6, 2.2, x, y + ly, z + h - 2.2)
    for lx in (-4.5, 4.5):
        A.blk(m, 2.0, 100, 2.4, x + lx, y + 12, z + h + 1)   # boom/back-reach girders
    A.blk('white', 10, 12, 5, x, y - 30, z + h + 3.4)          # machinery house
    A.blk('white', 4, 4, 3.5, x, y + 18, z + h - 3)            # trolley cab
    for lx in (-4.5, 4.5):
        A.blk(m, 1.4, 1.4, 30, x + lx, y, z + h)               # A-frame posts
    top = Vector((0, 0, h + 30))
    for ty in (60, -36):
        a = Vector((0, 0, z + h + 30)) + Vector((x, y, 0))
        b = Vector((x, y + ty, z + h + 3.4))
        for lx in (-4.5, 4.5):
            aa, bb = a + Vector((lx, 0, 0)), b + Vector((lx, 0, 0))
            d = bb - aa
            c = (aa + bb) / 2
            A.box('steel', (0.5, d.length, 0.5), tuple(c), (math.degrees(math.atan2(d.z, d.y)), 0, 0))


def kit_containers(A, x=0, y=0, z=0, nx=6, ny=4, tiers=3, seed=1):
    """Block of 40ft containers (12.2 x 2.44 x 2.6). Long axis along X."""
    rnd = random.Random(seed)
    for i in range(nx):
        for j in range(ny):
            t = tiers - (1 if rnd.random() < 0.25 else 0)
            for k in range(t):
                A.blk(rnd.choice(CONTAINER_COLS), 12.0, 2.38, 2.55,
                      x + (i - (nx - 1) / 2) * 12.6, y + (j - (ny - 1) / 2) * 2.6, z + k * 2.6)


def kit_warehouse(A, x=0, y=0, z=0, w=80, d=40, h=12, m='white', roof='steel'):
    A.blk(m, w, d, h, x, y, z)
    A.prism(roof, [(-d / 2 - 0.5, 0), (d / 2 + 0.5, 0), (0, 4)], w + 1, 'YZ', off=(x, y, z + h), center=True)
    n = int(w / 12)
    for i in range(n):
        A.box('dark', (7, 0.4, 7), (x - w / 2 + (i + 0.5) * w / n, y - d / 2, z + 3.5))
        A.blk('concrete', 7, 3, 1.2, x - w / 2 + (i + 0.5) * w / n, y - d / 2 - 1.5, z)


def rad(r):
    return [math.radians(a) for a in r]


def get_mat(name):
    m = bpy.data.materials.get("MAT_" + name)
    if m:
        return m
    col, met, rough = PAL[name]
    m = bpy.data.materials.new("MAT_" + name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for i in b.inputs:
        if i.identifier == 'Base Color':
            i.default_value = (*col, 1.0)
        elif i.identifier == 'Metallic':
            i.default_value = met
        elif i.identifier == 'Roughness':
            i.default_value = rough
    m.diffuse_color = (*col, 1.0)
    m.metallic = met
    m.roughness = rough
    return m


def scene_and_region(region):
    scn = bpy.data.scenes.get("VN2030_Assets")
    if scn is None:
        scn = bpy.data.scenes.new("VN2030_Assets")
    try:
        bpy.context.window_manager.windows[0].scene = scn
    except Exception:
        pass
    col = bpy.data.collections.get(region)
    if col is None:
        col = bpy.data.collections.new(region)
    if col.name not in scn.collection.children:
        scn.collection.children.link(col)
    return scn, col


def sub_collection(parent, name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
    if c.name not in parent.children:
        parent.children.link(c)
    return c


class Asset:
    def __init__(self, name, loc, brief="", region="Riyadh", group=None):
        self.name, self.loc, self.brief, self.region, self.group = name, loc, brief, region, group
        self.bm = bmesh.new()
        self.mats = []

    # ---- internals
    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _tag(self, verts, m):
        mi = self._mi(m)
        for v in verts:
            for f in v.link_faces:
                f.material_index = mi

    # ---- primitives
    def box(self, m, size, c, rot=(0, 0, 0)):
        M = Matrix.Translation(c) @ Euler(rad(rot)).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
        self._tag(bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)['verts'], m)

    def blk(self, m, w, d, h, x=0, y=0, z=0, rz=0):
        """Bottom-based box."""
        self.box(m, (w, d, h), (x, y, z + h / 2), (0, 0, rz))

    def cyl(self, m, r, h, x=0, y=0, z=0, r2=None, seg=16, rot=(0, 0, 0)):
        """Base-centred cylinder/cone along local Z, rotated about its base point."""
        r2 = r if r2 is None else max(r2, 1e-3)
        M = Matrix.Translation((x, y, z)) @ Euler(rad(rot)).to_matrix().to_4x4() @ Matrix.Translation((0, 0, h / 2))
        v = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg,
                                  radius1=r, radius2=r2, depth=h, matrix=M)['verts']
        self._tag(v, m)

    def sphere(self, m, r, c, seg=12, scale=(1, 1, 1)):
        M = Matrix.Translation(c) @ Matrix.Diagonal((*scale, 1))
        self._tag(bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=max(4, seg // 2),
                                            radius=r, matrix=M)['verts'], m)

    def ico(self, m, r, c, scale=(1, 1, 1), sub=1):
        M = Matrix.Translation(c) @ Matrix.Diagonal((*scale, 1))
        self._tag(bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=M)['verts'], m)

    def dome(self, m, r, x=0, y=0, z=0, seg=20, sz=1.0):
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=seg, v_segments=seg // 2, radius=r)
        bmesh.ops.delete(tmp, geom=[v for v in tmp.verts if v.co.z < -1e-4], context='VERTS')
        M = Matrix.Translation((x, y, z)) @ Matrix.Diagonal((1, 1, sz, 1))
        self._merge(tmp, M, m)

    def _merge(self, tmp, M, m):
        tmp.transform(M)
        me = bpy.data.meshes.new("_tmp")
        tmp.to_mesh(me)
        tmp.free()
        before = set(self.bm.verts)
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        self._tag([v for v in self.bm.verts if v not in before], m)

    def prism(self, m, pts, h, plane='XY', off=(0, 0, 0), rot=(0, 0, 0), center=False):
        """Extrude a 2D polygon. XY: extrude +Z. XZ: u->X, v->Z, extrude along Y. YZ: u->Y, v->Z, along X."""
        w0 = -h / 2 if center else 0.0

        def p3(u, v, w):
            if plane == 'XY':
                return Vector((u, v, w))
            if plane == 'XZ':
                return Vector((u, w, v))
            return Vector((w, u, v))
        R = Matrix.Translation(off) @ Euler(rad(rot)).to_matrix().to_4x4()
        bm = self.bm
        bot = [bm.verts.new(R @ p3(u, v, w0)) for u, v in pts]
        top = [bm.verts.new(R @ p3(u, v, w0 + h)) for u, v in pts]
        bm.faces.new(bot[::-1])
        bm.faces.new(top)
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((bot[i], bot[j], top[j], top[i]))
        self._tag(bot + top, m)

    def loft(self, m, rings, off=(0, 0, 0), cap=True, rot=(0, 0, 0)):
        """rings: list of (pts2d, z) with equal vertex counts; lofted bottom to top (local Z), then rotated, then offset."""
        bm = self.bm
        R = Matrix.Translation(off) @ Euler(rad(rot)).to_matrix().to_4x4()
        vr = [[bm.verts.new(R @ Vector((u, v, z))) for u, v in pts] for pts, z in rings]
        n = len(vr[0])
        for a, b in zip(vr, vr[1:]):
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((a[i], a[j], b[j], b[i]))
        if cap:
            bm.faces.new(vr[0][::-1])
            bm.faces.new(vr[-1])
        self._tag([v for r in vr for v in r], m)

    def torus(self, m, R, r, c, rot=(0, 0, 0), seg=32, rseg=8):
        bm = self.bm
        M = Matrix.Translation(c) @ Euler(rad(rot)).to_matrix().to_4x4()
        rings = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            ring = []
            for k in range(rseg):
                b = 2 * math.pi * k / rseg
                p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
                ring.append(bm.verts.new(M @ p))
            rings.append(ring)
        for i in range(seg):
            a, b = rings[i], rings[(i + 1) % seg]
            for k in range(rseg):
                l = (k + 1) % rseg
                bm.faces.new((a[k], b[k], b[l], a[l]))
        self._tag([v for r_ in rings for v in r_], m)

    def place(self, other, x=0, y=0, z=0, rz=0):
        """Merge another (unfinished) Asset's geometry into this one, rotated about Z then offset."""
        mp = [self._mi(m) for m in other.mats]
        for f in other.bm.faces:
            f.material_index = mp[f.material_index]
        other.bm.transform(Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(rz), 4, 'Z'))
        me = bpy.data.meshes.new("_tmp")
        other.bm.to_mesh(me)
        other.bm.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    # ---- composites
    def tree(self, x, y, z=0, h=7.0, r=2.6, m_leaf='leaf'):
        self.cyl('trunk', h * 0.06, h * 0.55, x, y, z, seg=6)
        self.ico(m_leaf, r, (x, y, z + h * 0.55 + r * 0.6), scale=(1, 1, 0.85))

    def palm(self, x, y, z=0, h=9.0, lean=0.0, fronds=8):
        self.cyl('trunk', 0.28, h, x, y, z, r2=0.2, seg=6, rot=(lean, 0, 0))
        tz = z + h * math.cos(math.radians(lean))
        ty = y - h * math.sin(math.radians(lean))
        for i in range(fronds):
            a = 360 * i / fronds
            ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
            self.box('leaf', (3.6, 0.9, 0.12), (x + ca * 1.7, ty + sa * 1.7, tz - 0.5), (0, 25, a))

    def crenel(self, m, w, d, x, y, z, step=1.6, s=0.55):
        """Najdi triangular merlons along a rectangle's top edge."""
        for sx in (-1, 1):
            n = max(1, int(d / step))
            for i in range(n):
                self.cyl(m, s, s * 1.4, x + sx * (w / 2 - s * 0.5), y - d / 2 + (i + 0.5) * d / n, z, r2=0, seg=4, rot=(0, 0, 45))
        for sy in (-1, 1):
            n = max(1, int(w / step))
            for i in range(n):
                self.cyl(m, s, s * 1.4, x - w / 2 + (i + 0.5) * w / n, y + sy * (d / 2 - s * 0.5), z, r2=0, seg=4, rot=(0, 0, 45))

    def windows(self, m, w, d, x, y, z0, z1, every=3.5, ww=1.6, wh=1.6, pitch=4.0, out=0.15):
        z = z0 + every * 0.5
        while z + wh / 2 < z1:
            for sy in (-1, 1):
                n = int(w / pitch)
                for i in range(n):
                    self.box(m, (ww, out * 2, wh), (x - w / 2 + (i + 0.5) * w / n, y + sy * d / 2, z))
            for sx in (-1, 1):
                n = int(d / pitch)
                for i in range(n):
                    self.box(m, (out * 2, ww, wh), (x + sx * w / 2, y - d / 2 + (i + 0.5) * d / n, z))
            z += every

    def bands(self, m, w, d, x, y, z0, z1, every=4.0, t=0.35, out=0.25):
        z = z0 + every
        while z < z1 - 0.5:
            self.blk(m, w + out * 2, d + out * 2, t, x, y, z)
            z += every

    def done(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        old = bpy.data.objects.get(self.name)
        if old:
            me_old = old.data
            bpy.data.objects.remove(old, do_unlink=True)
            if me_old and me_old.users == 0:
                bpy.data.meshes.remove(me_old)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(get_mat(m))
        ob = bpy.data.objects.new(self.name, me)
        ob.location = self.loc
        ob["vn_brief"] = COMMON_BRIEF + " " + self.brief
        ob["vn_region"] = self.region
        scn, reg = scene_and_region(self.region)
        col = sub_collection(reg, self.group) if self.group else reg
        col.objects.link(ob)
        d = ob.dimensions
        print("CREATED", self.name, "at", tuple(round(c, 1) for c in self.loc),
              "size", tuple(round(c, 1) for c in d), "faces", len(me.polygons))
        return ob
