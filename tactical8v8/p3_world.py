"""The arena as real 3D geometry: tessellated textured boxes with baked neon lighting + AO, floor, sky dome, fog."""
import math
import numpy as np
from panda3d.core import (NodePath, Fog, TextureStage, TransparencyAttrib, Vec4, Vec3, CullFaceAttrib)

from p3_geom import geom_from_arrays, make_texture, modulate2_stage, mesh_to_node
from t8_textures import FOG_COLOR, make_sky
from t8_world import LIGHTS
from t8_models import Mesh

AMBIENT = np.array([0.52, 0.60, 0.78], np.float32)
SUN_RGB = np.array([1.05, 0.78, 0.50], np.float32)
_sd = np.array([0.55, -0.45, 0.0], np.float32)
_sd /= np.linalg.norm(_sd)
SUN_L = np.array([_sd[0] * 0.62, _sd[1] * 0.62, 0.78], np.float32)       # direction towards the sun (sim coords)
FOG_DENSITY = 0.0125
CELL = 1.5


def to_p(x, y, z):
    """sim (x east, y south, z up)  ->  Panda (x east, y north, z up)"""
    return (x, -y, z)


def bake_light(world, pos, nor, wall=False):
    """pos/nor in SIM coords (N,3).  Returns (N,3) light multipliers (can exceed 1)."""
    n = len(pos)
    light = np.tile(AMBIENT * 0.95, (n, 1)).astype(np.float32)
    diff = np.maximum(0.0, nor @ SUN_L)
    light += SUN_RGB[None, :] * (0.55 * diff)[:, None] * (1.0 if wall else 0.55)
    for lx, ly, lz, col, inten, rad in LIGHTS:
        d = np.stack([lx - pos[:, 0], ly - pos[:, 1], lz - pos[:, 2]], 1)
        dist = np.maximum(np.linalg.norm(d, axis=1), 0.3)
        att = np.clip(1.0 - dist / rad, 0.0, 1.0) ** 1.4
        ndl = np.maximum(0.0, (d * nor).sum(1) / dist)
        light += (inten * 1.6 * att * ndl)[:, None] * (np.array(col, np.float32) / 255.0)[None, :]
    # ambient occlusion from the baked light-map (contact shadows near walls / crates)
    ix = np.clip(((pos[:, 0] + nor[:, 0] * 0.3 + 56.0) / world.LM_RES).astype(np.int32), 0, world.LM_N - 1)
    iy = np.clip(((pos[:, 1] + nor[:, 1] * 0.3 + 56.0) / world.LM_RES).astype(np.int32), 0, world.LM_N - 1)
    ao = world.ao[iy, ix]
    height_fade = np.clip(pos[:, 2] / 2.5, 0.0, 1.0)
    ao = ao + (1.0 - ao) * height_fade
    light *= ao[:, None]
    if wall:
        light *= (0.62 + 0.38 * np.clip(pos[:, 2] * 0.33, 0, 1))[:, None]
    return light


class _Bucket:
    def __init__(self):
        self.pos, self.nor, self.uv, self.idx, self.base = [], [], [], [], 0

    def add(self, pos, nor, uv, idx):
        self.pos.append(pos)
        self.nor.append(nor)
        self.uv.append(uv)
        self.idx.append(idx + self.base)
        self.base += len(pos)

    def cat(self):
        return (np.concatenate(self.pos), np.concatenate(self.nor), np.concatenate(self.uv),
                np.concatenate(self.idx).astype(np.uint32))


def _grid_face(BL, BR, TR, TL, nu, nv, uvfun):
    """Bilinear tessellated quad.  Returns pos(N,3), idx.  uvfun(s,t)->(u,v) arrays."""
    s = np.linspace(0, 1, nu + 1, dtype=np.float32)
    t = np.linspace(0, 1, nv + 1, dtype=np.float32)
    S, T = np.meshgrid(s, t)                                  # (nv+1, nu+1)
    S = S.reshape(-1, 1)
    T = T.reshape(-1, 1)
    BL, BR, TR, TL = [np.asarray(v, np.float32) for v in (BL, BR, TR, TL)]
    pos = (1 - S) * (1 - T) * BL + S * (1 - T) * BR + S * T * TR + (1 - S) * T * TL
    u, v = uvfun(S[:, 0], T[:, 0])
    uv = np.stack([u, v], 1).astype(np.float32)
    ii = np.arange((nu + 1) * (nv + 1)).reshape(nv + 1, nu + 1)
    a = ii[:-1, :-1].reshape(-1)
    b = ii[:-1, 1:].reshape(-1)
    c = ii[1:, 1:].reshape(-1)
    d = ii[1:, :-1].reshape(-1)
    idx = np.stack([a, b, c, a, c, d], 1).reshape(-1)
    return pos, uv, idx


def build_arena(world, atlas, root):
    """Creates the static world under `root` (a NodePath).  Returns dict of useful nodes."""
    names = {v: k for k, v in atlas.names.items()}
    textures = {}
    for nm, i in atlas.names.items():
        off, tw, th = int(atlas.off[i]), int(atlas.tw[i]), int(atlas.th[i])
        arr = atlas.data[off:off + tw * th].reshape(th, tw, 3)
        textures[i] = make_texture(arr, "tex_" + nm)
    floor_tex = make_texture(atlas.floor, "floor")
    ts = modulate2_stage()
    buckets = {}

    def bucket(tid):
        b = buckets.get(tid)
        if b is None:
            b = buckets[tid] = _Bucket()
        return b

    top_tid = world.top_tid
    top_uw, top_vh = float(atlas.uw[top_tid]), float(atlas.vh[top_tid])
    for i, b in enumerate(world.boxes):
        c, s = math.cos(b["rot"]), math.sin(b["rot"])
        hw, hd, h = b["w"] / 2, b["d"] / 2, b["h"]
        tid = int(world.tid[i])
        uwu, vhu = float(atlas.uw[tid]), float(atlas.vh[tid])
        cx, cy = b["cx"], b["cy"]
        # sim-space local axes -> Panda
        ax_s = np.array([c, s]);  ay_s = np.array([-s, c])
        for n_s, half_t, half_n in ((ax_s, hd, hw), (-ax_s, hd, hw), (ay_s, hw, hd), (-ay_s, hw, hd)):
            n_p = np.array([n_s[0], -n_s[1], 0.0], np.float32)
            right_p = np.array([n_s[1], n_s[0], 0.0], np.float32)
            center_p = np.array([cx, -cy, 0.0], np.float32) + n_p * half_n
            L = 2 * half_t
            BL = center_p - right_p * half_t
            BR = center_p + right_p * half_t
            TR = BR + np.array([0, 0, h], np.float32)
            TL = BL + np.array([0, 0, h], np.float32)
            nu = max(1, int(math.ceil(L / CELL)))
            nv = max(1, int(math.ceil(h / CELL)))
            pos, uv, idx = _grid_face(BL, BR, TR, TL, nu, nv,
                                      lambda S, T, L=L, h=h, uwu=uwu, vhu=vhu: (S * L / uwu, T * h / vhu))
            nor = np.tile(n_p, (len(pos), 1))
            bucket(tid).add(pos, nor, uv, idx)
        # top face
        axp = np.array([c, -s, 0], np.float32)
        ayp = np.array([-s, -c, 0], np.float32)
        cp = np.array([cx, -cy, h], np.float32)
        BL = cp - axp * hw - ayp * hd
        BR = cp + axp * hw - ayp * hd
        TR = cp + axp * hw + ayp * hd
        TL = cp - axp * hw + ayp * hd
        if np.cross(BR - BL, TL - BL)[2] < 0:
            BR, TL = TL, BR
        nu = max(1, int(math.ceil(2 * hw / CELL)))
        nv = max(1, int(math.ceil(2 * hd / CELL)))
        pos, uv, idx = _grid_face(BL, BR, TR, TL, nu, nv, lambda S, T: (S, T))
        uv = np.stack([pos[:, 0] / top_uw, pos[:, 1] / top_vh], 1).astype(np.float32)
        nor = np.tile(np.array([0, 0, 1], np.float32), (len(pos), 1))
        bucket(top_tid).add(pos, nor, uv, idx)

    nodes = {}
    arena = root.attachNewNode("arena")
    for tid, bk in buckets.items():
        pos, nor, uv, idx = bk.cat()
        # bake lighting in SIM space
        pos_s = np.stack([pos[:, 0], -pos[:, 1], pos[:, 2]], 1)
        nor_s = np.stack([nor[:, 0], -nor[:, 1], nor[:, 2]], 1)
        is_top = (tid == top_tid)
        light = np.zeros((len(pos), 3), np.float32)
        # side faces use wall shading, tops use floor-like shading
        side = nor[:, 2] < 0.5
        if side.any():
            light[side] = bake_light(world, pos_s[side], nor_s[side], wall=True)
        if (~side).any():
            light[~side] = bake_light(world, pos_s[~side], nor_s[~side], wall=False) * 1.15
        col = np.concatenate([np.clip(light / 2.0, 0, 1), np.ones((len(pos), 1), np.float32)], 1)
        gn, geom, vdata, buf, dt = geom_from_arrays("walls_%d" % tid, pos, idx, normal=nor, color=col, uv=uv)
        np_ = arena.attachNewNode(gn)
        np_.setTexture(ts, textures[tid])
        nodes[tid] = np_
    # ---------------------------------------------------------------- floor (1 m cells, baked light)
    N = 108
    xs = np.linspace(-54, 54, N + 1, dtype=np.float32)
    X, Y = np.meshgrid(xs, xs)
    pos_s = np.stack([X.reshape(-1), Y.reshape(-1), np.zeros(X.size, np.float32)], 1)
    nor_s = np.tile(np.array([0, 0, 1], np.float32), (len(pos_s), 1))
    light = bake_light(world, pos_s, nor_s, wall=False)
    col = np.concatenate([np.clip(light / 2.0, 0, 1), np.ones((len(pos_s), 1), np.float32)], 1)
    pos_p = np.stack([pos_s[:, 0], -pos_s[:, 1], pos_s[:, 2]], 1)
    uv = np.stack([pos_p[:, 0] / 6.4, pos_p[:, 1] / 6.4], 1).astype(np.float32)
    ii = np.arange((N + 1) * (N + 1)).reshape(N + 1, N + 1)
    a, b, c_, d = ii[:-1, :-1].reshape(-1), ii[:-1, 1:].reshape(-1), ii[1:, 1:].reshape(-1), ii[1:, :-1].reshape(-1)
    # y is flipped (sim y south -> Panda y north): winding must be CCW seen from above in Panda coords
    idx = np.stack([a, c_, b, a, d, c_], 1).reshape(-1)
    gn, *_ = geom_from_arrays("floor", pos_p, idx, normal=np.tile(np.array([0, 0, 1], np.float32), (len(pos_p), 1)),
                              color=col, uv=uv)
    floor = arena.attachNewNode(gn)
    floor.setTexture(ts, floor_tex)
    nodes["floor"] = floor
    arena.setLightOff()
    arena.setShaderOff()
    # ---------------------------------------------------------------- beacons
    for (lx, ly, lz, col_, inten, rad) in LIGHTS:
        m = Mesh()
        m.sphere((0, 0, 0), 0.3, tuple(col_), 3, 8, emissive=True)
        n = mesh_to_node(m, "beacon")
        n.reparentTo(arena)
        n.setPos(*to_p(lx, ly, lz + 0.2))
        n.setLightOff()
    # ---------------------------------------------------------------- fog
    fog = Fog("fog")
    fog.setColor(*(FOG_COLOR / 255.0))
    fog.setExpDensity(FOG_DENSITY)
    root.setFog(fog)
    nodes["fog"] = fog
    nodes["arena"] = arena
    return nodes


def build_sky(parent):
    """Hemisphere with the starry panorama; follows the camera position (call node.setPos each frame)."""
    sky = make_sky()
    tex = make_texture(sky, "sky", repeat=False, mip=False, aniso=1)
    from panda3d.core import SamplerState
    tex.setWrapU(SamplerState.WM_repeat)
    R = 260.0
    nlon, nlat = 64, 28
    lat = np.linspace(math.radians(-12), math.radians(90), nlat + 1)
    lon = np.linspace(0, 2 * math.pi, nlon + 1)
    LA, LO = np.meshgrid(lat, lon, indexing="ij")
    # LO is the SIM azimuth: sim direction (cos, sin) -> Panda (cos, -sin)
    x = R * np.cos(LA) * np.cos(LO)
    y = -R * np.cos(LA) * np.sin(LO)
    z = R * np.sin(LA)
    pos = np.stack([x, y, z], -1).reshape(-1, 3).astype(np.float32)
    u = (LO / (2 * math.pi)).reshape(-1)
    v = np.clip(LA / (math.pi / 2), 0, 1).reshape(-1)
    uv = np.stack([u, v], 1).astype(np.float32)
    ii = np.arange((nlat + 1) * (nlon + 1)).reshape(nlat + 1, nlon + 1)
    a, b, c, d = ii[:-1, :-1].reshape(-1), ii[:-1, 1:].reshape(-1), ii[1:, 1:].reshape(-1), ii[1:, :-1].reshape(-1)
    # we look at the dome from the inside -> flip winding
    idx = np.stack([a, c, b, a, d, c], 1).reshape(-1)
    gn, *_ = geom_from_arrays("sky", pos, idx, normal=None, color=None, uv=uv)
    n = parent.attachNewNode(gn)
    n.setTexture(tex)
    n.setLightOff()
    n.setFogOff()
    n.setDepthWrite(False)
    n.setDepthTest(False)
    n.setBin("background", 0)
    n.setTwoSided(True)
    return n
