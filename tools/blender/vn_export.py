# Export VN2030 Blender assets to a compact JS model library for the WebGL engine.
# Engine frame: x east, y up, z south (north = -z). Blender: x east, y north, z up  ->  (bx, bz, -by).
import bpy, bmesh, base64, array, json, math

import os
OUT = os.path.join(os.path.dirname(bpy.data.filepath), "VisionNexus2030", "models.js")   # the game folder next to VN2030_Assets.blend; edit if moved
COLS = ["Riyadh", "WesternCorridor", "NEOM_Northwest", "Southwest", "EasternProvince", "Shared"]
DEFAULT_THR = 0.012          # drop loose parts smaller than this fraction of the asset's largest dimension
THR = {}                     # per-asset overrides (filled by caller)
TRI_CAP = 9000               # decimate above this many triangles


def srgb(c):
    return [round((max(0.0, x) ** (1 / 2.2)), 3) for x in c]


def mat_color(m):
    if m is None:
        return [0.8, 0.8, 0.8]
    try:
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        return srgb(list(b.inputs['Base Color'].default_value)[:3])
    except Exception:
        return srgb(list(m.diffuse_color)[:3])


def islands(bm):
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, isl = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index); stack.append(h)
        out.append(isl)
    return out


def export_obj(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.faces.ensure_lookup_table(); bm.faces.index_update()
    xs = [v.co for v in bm.verts]
    dims = [max(c[i] for c in xs) - min(c[i] for c in xs) for i in range(3)]
    big = max(dims)
    thr = THR.get(ob.name, DEFAULT_THR) * big
    drop = []
    if thr > 0:
        for isl in islands(bm):
            vs = {v for f in isl for v in f.verts}
            ext = max(max(v.co[i] for v in vs) - min(v.co[i] for v in vs) for i in range(3))
            if ext < thr:
                drop.extend(isl)
    if drop:
        bmesh.ops.delete(bm, geom=list(set(drop)), context='FACES')
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    ntri = len(bm.faces)
    me = bpy.data.meshes.new("_exp"); bm.to_mesh(me); bm.free()
    if ntri > TRI_CAP:                         # collapse-decimate very heavy assets
        tmp = bpy.data.objects.new("_exp", me); bpy.context.scene.collection.objects.link(tmp)
        mod = tmp.modifiers.new("dec", 'DECIMATE'); mod.ratio = TRI_CAP / ntri
        dg = bpy.context.evaluated_depsgraph_get(); ev = tmp.evaluated_get(dg)
        me2 = bpy.data.meshes.new_from_object(ev)
        bpy.data.objects.remove(tmp); bpy.data.meshes.remove(me); me = me2
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    pal = [mat_color(m) for m in ob.data.materials] or [[0.8, 0.8, 0.8]]
    verts = [(v.co.x, v.co.z, -v.co.y) for v in me.vertices]
    mx = max(max(abs(c) for c in v) for v in verts) or 1.0
    q = mx / 32767.0
    va = array.array('h', [int(round(c / q)) for v in verts for c in v])
    tris = [p for p in me.polygons if len(p.vertices) == 3]
    big_idx = len(verts) > 65535
    ia = array.array('I' if big_idx else 'H', [i for p in tris for i in p.vertices])
    fa = array.array('B', [min(p.material_index, len(pal) - 1) for p in tris])
    ys = [v[1] for v in verts]; xs_ = [v[0] for v in verts]; zs = [v[2] for v in verts]
    rec = {"q": q, "w": round(max(xs_) - min(xs_), 2), "d": round(max(zs) - min(zs), 2), "h": round(max(ys), 2),
           "i32": big_idx, "pal": pal,
           "v": base64.b64encode(va.tobytes()).decode(), "i": base64.b64encode(ia.tobytes()).decode(),
           "f": base64.b64encode(fa.tobytes()).decode()}
    bpy.data.meshes.remove(me)
    return rec, len(tris)


def run(names=None):
    lib, total, report = {}, 0, []
    for cn in COLS:
        for ob in sorted(bpy.data.collections[cn].all_objects, key=lambda o: o.name):
            if ob.type != 'MESH' or (names and ob.name not in names):
                continue
            rec, n = export_obj(ob)
            lib[ob.name] = rec; total += n; report.append((ob.name, n))
    js = ("// Generated from VN2030_Assets.blend by tools/blender/vn_export.py — do not edit by hand.\n"
          "// Each model: metres, x east / y up / z south, origin at base centre. v=int16 xyz * q, i=indices, f=colour index per triangle.\n"
          "window.VN_MODELS = " + json.dumps(lib, separators=(',', ':')) + ";\n")
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(js)
    return report, total, len(js)
