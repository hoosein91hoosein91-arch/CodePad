"""Real 3D models (Panda3D) built from boxes / prisms / spheres: articulated soldiers, props and first-person weapons."""
import math
import numpy as np
from panda3d.core import NodePath, Vec3

from t8_models import Mesh, PAL, KINDS, _add_gun, weapon_mesh, rot_x
from p3_geom import mesh_to_node


def split_node(mesh, name):
    """Lit faces and emissive faces become two children (emissive one has lighting off)."""
    lit, emi = Mesh(), Mesh()
    lit.verts = mesh.verts
    emi.verts = mesh.verts
    lit.faces = [f for f in mesh.faces if not f[2]]
    emi.faces = [f for f in mesh.faces if f[2]]
    root = NodePath(name)
    if lit.faces:
        mesh_to_node(lit, name + "_lit").reparentTo(root)
    if emi.faces:
        e = mesh_to_node(emi, name + "_emi")
        e.reparentTo(root)
        e.setLightOff()
    return root


def _p(mx, my, mz):
    """model coords (x fwd, y right, z up) -> Panda (X right, Y fwd, Z up)"""
    return (my, mx, mz)


# ---------------------------------------------------------------------------------------------- soldiers
def build_soldier(kind):
    pal_name, gun = KINDS[kind]
    p = PAL[pal_name]
    uni, vest, helm, visor, skin, glove, trim = (p[k] for k in ("uni", "vest", "helm", "visor", "skin", "glove", "trim"))
    width = 1.25 if kind == "heavy" else (1.12 if kind == "boss" else 1.0)
    root = NodePath("soldier_" + kind)
    # --- legs (pivot at the hip, geometry hangs below it)
    for side, nm in ((-1, "legL"), (1, "legR")):
        m = Mesh()
        m.seg((0, 0, 0), (0, 0, -0.78), 0.25, uni, thick2=0.27)
        m.box((0.07, 0, -0.80), (0.36, 0.27, 0.13), (22, 22, 24))
        pivot = root.attachNewNode(nm)
        split_node(m, nm + "_g").reparentTo(pivot)
        pivot.setPos(*_p(0, side * 0.16 * width, 0.84))
    # --- upper body: everything above the hips in one mesh
    m = Mesh()
    m.box((0, 0, 1.13), (0.40, 0.66 * width, 0.74), uni)
    m.box((0.01, 0, 1.17), (0.46, 0.72 * width, 0.56), vest)
    m.box((0.235, 0, 1.28), (0.02, 0.4 * width, 0.05), trim, emissive=True)
    m.box((-0.30, 0, 1.2), (0.24, 0.48 * width, 0.5), helm)
    if kind == "grenadier":
        for k in range(4):
            m.sphere((0.25, -0.24 + k * 0.16, 0.96), 0.06, (60, 70, 40), 3, 6)
    if kind == "heavy":
        m.box((0.0, 0, 1.55), (0.46, 0.92, 0.18), helm)
        m.box((-0.36, 0, 1.0), (0.3, 0.5, 0.45), (60, 52, 40))
    if kind == "boss":
        m.box((0.0, 0, 1.58), (0.5, 1.0, 0.2), (40, 14, 14))
        m.box((0.26, 0, 1.2), (0.02, 0.2, 0.2), trim, emissive=True)
        m.box((-0.33, 0, 1.3), (0.2, 0.3, 0.5), (50, 20, 20))
    hz = 1.74
    m.sphere((0.02, 0, hz), 0.22, skin, 5, 10)
    m.sphere((0.0, 0, hz + 0.06), 0.27, helm, 5, 10, squash=(1.0, 1.0, 0.85))
    m.box((0.2, 0, hz - 0.01), (0.1, 0.34, 0.1), visor, emissive=True)
    if kind == "rusher":
        m.box((0.05, 0, hz - 0.17), (0.22, 0.3, 0.07), (230, 110, 20))
    if kind == "marksman":
        m.box((0.0, 0, hz + 0.2), (0.4, 0.46, 0.08), (30, 44, 30))
    hand_r = np.array([0.5, 0.10, 1.3])
    hand_l = np.array([0.95 if gun != "smg" else 0.7, -0.03, 1.28])
    if gun == "minigun":
        hand_r = np.array([0.42, 0.12, 1.12])
        hand_l = np.array([0.8, 0.0, 1.14])
    sh_r = np.array([0, 0.40 * width, 1.46])
    sh_l = np.array([0, -0.40 * width, 1.46])
    for sh, hd, side in ((sh_r, hand_r, 1), (sh_l, hand_l, -1)):
        el = (sh + hd) / 2 + np.array([-0.05, side * 0.12, -0.2])
        m.seg(sh, el, 0.2, uni)
        m.seg(el, hd, 0.17, uni)
        m.box(hd + np.array([0.02, 0, 0]), (0.14, 0.13, 0.13), glove)
    _add_gun(m, gun, hand_r, hand_l, p, flash=False)
    upper = split_node(m, "upper")
    upper.reparentTo(root)
    upper.setName("upper")
    return root


class SoldierView:
    """One soldier instance in the scene (copy of the template, animated every frame)."""

    def __init__(self, template, scale):
        self.root = template.copyTo(NodePath("inst"))
        self.legL = self.root.find("legL")
        self.legR = self.root.find("legR")
        self.upper = self.root.find("upper")
        self.root.setScale(scale)
        self.scale = scale
        self.fall = 0.0
        self.base_z = 0.0


# ---------------------------------------------------------------------------------------------- props
def build_barrel():
    m = Mesh()
    m.prism((0, 0, 0.83), 0.55, 1.65, "z", (211, 47, 47), 16)
    m.prism((0, 0, 0.85), 0.565, 0.26, "z", (255, 235, 59), 16)
    m.prism((0, 0, 1.2), 0.575, 0.06, "z", (150, 30, 30), 16)
    m.prism((0, 0, 0.45), 0.575, 0.06, "z", (150, 30, 30), 16)
    m.prism((0, 0, 1.66), 0.5, 0.04, "z", (110, 24, 24), 16)
    m.box((0.56, 0, 0.85), (0.02, 0.24, 0.2), (30, 30, 30))
    return split_node(m, "barrel")


def build_turret():
    root = NodePath("turret")
    base = Mesh()
    base.prism((0, 0, 0.35), 0.5, 0.7, "z", (38, 42, 46), 12, r2=0.4)
    for a in range(3):
        ang = a * 2.094
        base.seg((0, 0, 0.35), (math.cos(ang) * 0.9, math.sin(ang) * 0.9, 0.04), 0.1, (30, 34, 38))
    split_node(base, "base").reparentTo(root)
    head = root.attachNewNode("head")
    h = Mesh()
    h.box((0, 0, 0.9), (0.4, 0.34, 0.3), (0, 150, 230))
    h.box((0.5, 0, 0.92), (0.7, 0.1, 0.12), (30, 34, 38))
    h.box((0.08, 0, 1.1), (0.24, 0.2, 0.1), (20, 24, 28))
    h.sphere((0, 0, 1.18), 0.07, (255, 220, 60), 3, 6, emissive=True)
    split_node(h, "head_g").reparentTo(head)
    return root


def build_pickup(kind):
    m = Mesh()
    if kind == "ammo":
        m.box((0, 0, 0.2), (0.7, 0.45, 0.36), (59, 83, 50))
        m.box((0, 0, 0.2), (0.72, 0.1, 0.38), (255, 152, 0))
        m.box((0, 0, 0.4), (0.74, 0.47, 0.05), (40, 56, 34))
    elif kind == "med":
        m.box((0, 0, 0.22), (0.62, 0.5, 0.42), (235, 235, 238))
        m.box((0.32, 0, 0.22), (0.03, 0.34, 0.1), (220, 30, 40))
        m.box((0.32, 0, 0.22), (0.03, 0.1, 0.34), (220, 30, 40))
        m.box((0, 0.26, 0.22), (0.5, 0.03, 0.1), (220, 30, 40))
        m.box((0, 0.26, 0.22), (0.1, 0.03, 0.34), (220, 30, 40))
    elif kind == "armor":
        m.box((0, 0, 0.24), (0.55, 0.5, 0.4), (30, 80, 140))
        m.box((0, 0, 0.24), (0.57, 0.3, 0.2), (0, 200, 255), emissive=True)
        m.box((0, 0, 0.46), (0.5, 0.45, 0.06), (20, 50, 90))
    else:   # airdrop crate
        m.box((0, 0, 0.6), (1.1, 1.1, 1.0), (52, 73, 52))
        m.box((0, 0, 0.6), (1.14, 0.16, 1.04), (230, 230, 230))
        m.box((0, 0, 0.6), (0.16, 1.14, 1.04), (230, 230, 230))
        m.box((0, 0, 1.12), (1.2, 1.2, 0.08), (32, 46, 32))
        m.sphere((0, 0, 1.24), 0.14, (255, 60, 40), 3, 6, emissive=True)
    return split_node(m, "pickup_" + kind)


def build_grenade():
    m = Mesh()
    m.sphere((0, 0, 0), 0.13, (46, 59, 40), 5, 10)
    m.sphere((0, 0, 0.13), 0.05, (255, 30, 60), 3, 6, emissive=True)
    return split_node(m, "grenade")


def build_rocket():
    m = Mesh()
    m.prism((0, 0, 0), 0.07, 0.8, "x", (60, 70, 52), 10)
    m.prism((0.5, 0, 0), 0.07, 0.2, "x", (200, 60, 30), 10, r2=0.01)
    for a in range(4):
        ang = a * math.pi / 2
        m.box((-0.3, math.cos(ang) * 0.09, math.sin(ang) * 0.09), (0.18, 0.02 if a % 2 == 0 else 0.15, 0.15 if a % 2 == 0 else 0.02), (80, 86, 90))
    return split_node(m, "rocket")


def build_parachute():
    m = Mesh()
    m.sphere((0, 0, 3.6), 1.7, (240, 90, 40), 6, 12, squash=(1, 1, 0.8))
    m.sphere((0, 0, 3.7), 1.55, (240, 240, 240), 6, 12, squash=(1, 1, 0.8))
    m.sphere((0, 0, 3.85), 1.3, (240, 90, 40), 6, 12, squash=(1, 1, 0.8))
    for a in range(0, 360, 60):
        m.seg((math.cos(math.radians(a)) * 1.4, math.sin(math.radians(a)) * 1.4, 3.4), (0, 0, 1.2), 0.03, (200, 200, 200))
    return split_node(m, "chute")


# ---------------------------------------------------------------------------------------------- weapons (first person)
def build_weapon(wid):
    """Returns (NodePath, muzzle_pos_in_node) - model frame mapped to Panda (X right, Y forward, Z up)."""
    m, muz = weapon_mesh(wid)
    np_ = split_node(m, "weapon%d" % wid)
    # recentre so that the node's origin sits at the gun's rear/centre; x_model = 0.55 is where the receiver starts
    np_.setPos(0, -0.55, 0)
    holder = NodePath("wholder")
    np_.reparentTo(holder)
    return holder, (0.0, muz - 0.55, 0.012)
