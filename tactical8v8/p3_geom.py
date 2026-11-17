"""Panda3D geometry helpers: fast numpy -> Geom conversion, textures, and my little Mesh -> real 3D model converter."""
import math
import numpy as np
from panda3d.core import (Geom, GeomNode, GeomTriangles, GeomVertexData, GeomVertexFormat, GeomVertexArrayFormat,
                          InternalName, NodePath, Texture, SamplerState, TextureStage, TransparencyAttrib,
                          ColorBlendAttrib, DepthWriteAttrib, ColorAttrib, TextureAttrib, OmniBoundingVolume)

_FMT_CACHE = {}


def make_format(normal=True, color=True, uv=True):
    key = (normal, color, uv)
    f = _FMT_CACHE.get(key)
    if f is not None:
        return f
    arr = GeomVertexArrayFormat()
    arr.addColumn(InternalName.getVertex(), 3, Geom.NT_float32, Geom.C_point)
    if normal:
        arr.addColumn(InternalName.getNormal(), 3, Geom.NT_float32, Geom.C_normal)
    if color:
        arr.addColumn(InternalName.getColor(), 4, Geom.NT_uint8, Geom.C_color)
    if uv:
        arr.addColumn(InternalName.getTexcoord(), 2, Geom.NT_float32, Geom.C_texcoord)
    fmt = GeomVertexFormat()
    fmt.addArray(arr)
    f = GeomVertexFormat.registerFormat(fmt)
    dt = [("p", "<f4", 3)]
    if normal:
        dt.append(("n", "<f4", 3))
    if color:
        dt.append(("c", "u1", 4))
    if uv:
        dt.append(("t", "<f4", 2))
    dtype = np.dtype(dt)
    assert arr.getStride() == dtype.itemsize, (arr.getStride(), dtype.itemsize)
    _FMT_CACHE[key] = (f, dtype)
    return _FMT_CACHE[key]


def geom_from_arrays(name, pos, idx, normal=None, color=None, uv=None, dynamic=False):
    """pos (N,3) float, idx (M,) ints (triangle list), optional normal (N,3), color (N,4 uint8 or float 0..1), uv (N,2)."""
    fmt, dtype = make_format(normal is not None, color is not None, uv is not None)
    n = len(pos)
    vdata = GeomVertexData(name, fmt, Geom.UHDynamic if dynamic else Geom.UHStatic)
    vdata.uncleanSetNumRows(n)
    buf = np.zeros(n, dtype)
    buf["p"] = pos
    if normal is not None:
        buf["n"] = normal
    if color is not None:
        c = np.asarray(color)
        if c.dtype != np.uint8:
            c = np.clip(c * 255.0 + 0.5, 0, 255).astype(np.uint8)
        buf["c"] = c
    if uv is not None:
        buf["t"] = uv
    vdata.modifyArray(0).modifyHandle().copyDataFrom(buf.tobytes())
    prim = GeomTriangles(Geom.UHDynamic if dynamic else Geom.UHStatic)
    prim.setIndexType(Geom.NT_uint32 if n > 65000 else Geom.NT_uint16)
    ia = np.asarray(idx, np.uint32 if n > 65000 else np.uint16)
    prim.modifyVertices(len(ia)).modifyHandle().copyDataFrom(ia.tobytes())
    geom = Geom(vdata)
    geom.addPrimitive(prim)
    gn = GeomNode(name)
    gn.addGeom(geom)
    return gn, geom, vdata, buf, dtype


def make_texture(arr, name="tex", repeat=True, mip=True, aniso=4, alpha=False, nearest=False, flip=True):
    """arr: (H,W,3|4) uint8 numpy (top row first).  Returns a Panda Texture."""
    a = np.asarray(arr, np.uint8)
    if flip:
        a = a[::-1]
    h, w = a.shape[:2]
    ch = a.shape[2]
    tex = Texture(name)
    tex.setup2dTexture(w, h, Texture.T_unsigned_byte, Texture.F_rgba8 if ch == 4 else Texture.F_rgb8)
    tex.setRamImageAs(np.ascontiguousarray(a).tobytes(), "RGBA" if ch == 4 else "RGB")
    if repeat:
        tex.setWrapU(SamplerState.WM_repeat)
        tex.setWrapV(SamplerState.WM_repeat)
    else:
        tex.setWrapU(SamplerState.WM_clamp)
        tex.setWrapV(SamplerState.WM_clamp)
    if mip:
        tex.setMinfilter(SamplerState.FT_linear_mipmap_linear)
        tex.setAnisotropicDegree(aniso)
    else:
        tex.setMinfilter(SamplerState.FT_linear)
    tex.setMagfilter(SamplerState.FT_nearest if nearest else SamplerState.FT_linear)
    return tex


def modulate2_stage():
    """Texture stage computing  texture * vertex_colour * 2  (lets baked light go over 1.0)."""
    ts = TextureStage("m2")
    ts.setMode(TextureStage.MModulate)
    ts.setCombineRgb(TextureStage.CMModulate, TextureStage.CSTexture, TextureStage.COSrcColor,
                     TextureStage.CSPrimaryColor, TextureStage.COSrcColor)
    ts.setCombineAlpha(TextureStage.CMReplace, TextureStage.CSTexture, TextureStage.COSrcAlpha)
    ts.setRgbScale(2)
    return ts


# ------------------------------------------------------------------------------------------------------
# my tiny Mesh (t8_models) -> Panda model.  Model frame: x forward, y right, z up   ->  Panda: X right, Y forward, Z up
# ------------------------------------------------------------------------------------------------------
def mesh_to_node(mesh, name="mesh", color_mult=1.0, emissive_flat=True):
    """Triangulates every face of a t8_models.Mesh into one Geom with flat colours + proper outward normals."""
    V = np.array(mesh.verts, np.float32)
    if len(V) == 0:
        return NodePath(name)
    Vp = np.stack([V[:, 1], V[:, 0], V[:, 2]], 1)            # (x,y,z) -> (right, forward, up)
    pos, nor, col, idx = [], [], [], []
    base = 0
    for ix, color, emis, ctr in mesh.faces:
        pts = Vp[ix]
        cp = np.array([ctr[1], ctr[0], ctr[2]], np.float32)
        n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
        ln = float(np.linalg.norm(n))
        if ln < 1e-9:
            continue
        n /= ln
        if np.dot(n, pts.mean(0) - cp) < 0:
            n = -n
        k = len(ix)
        pos.extend(pts.tolist())
        nor.extend([n.tolist()] * k)
        c = [min(255, int(v * color_mult)) for v in color]
        col.extend([c + [255]] * k)
        for j in range(1, k - 1):
            idx.extend([base, base + j, base + j + 1])
        base += k
    # make sure all triangles are CCW about the outward normal
    pos = np.array(pos, np.float32)
    nor = np.array(nor, np.float32)
    idx = np.array(idx, np.uint32).reshape(-1, 3)
    p0, p1, p2 = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    cr = np.cross(p1 - p0, p2 - p0)
    flip = (cr * nor[idx[:, 0]]).sum(1) < 0
    idx[flip] = idx[flip][:, [0, 2, 1]]
    gn, geom, vdata, buf, dtype = geom_from_arrays(name, pos, idx.reshape(-1), normal=nor, color=np.array(col, np.uint8))
    np_ = NodePath(gn)
    return np_
