"""Software 3D renderer (numpy).  Multi-height raycaster: textured walls with visible tops, perspective floor,
panoramic sky, baked neon lighting, fog, depth-correct billboards, particles and tracers."""
import math
import numpy as np
import pygame

from t8_textures import FOG_COLOR, make_sky

AMBIENT = np.array([0.52, 0.60, 0.78], np.float32)
SUN_RGB = np.array([1.05, 0.78, 0.50], np.float32)
SUN_DIR = np.array([0.55, -0.45], np.float32)          # horizontal direction towards the sun
SUN_DIR /= np.linalg.norm(SUN_DIR)
FOG_DENS = 0.0125
K_LAYERS = 6


class Camera:
    __slots__ = ("x", "y", "z", "yaw", "pitch", "fov")

    def __init__(self):
        self.x = self.y = 0.0
        self.z = 1.8
        self.yaw = -math.pi / 2
        self.pitch = 0.0
        self.fov = 75.0


class Renderer:
    def __init__(self, world, atlas, W, H):
        self.world = world
        self.atlas = atlas
        self.sky = make_sky()
        self.resize(W, H)
        self.lm = world.lightmap
        self.fogcol = FOG_COLOR
        self._glow_cache = {}

    def resize(self, W, H):
        self.W, self.H = W, H
        self.cols = np.arange(W, dtype=np.float32) + 0.5
        self.rows = np.arange(H, dtype=np.float32) + 0.5
        self.cidx = np.arange(W)
        self.frame = np.zeros((H, W, 3), np.uint8)
        self.surf = pygame.Surface((W, H))
        self.layer_t = np.full((W, K_LAYERS), np.inf, np.float32)
        self.layer_cov = np.full((W, K_LAYERS), float(H), np.float32)
        self.hy = H / 2

    # ==============================================================================================
    def render(self, cam):
        W, H = self.W, self.H
        wd = self.world
        at = self.atlas
        f = (W / 2) / math.tan(math.radians(cam.fov) / 2)
        self.f = f
        hy = H / 2 + f * math.tan(cam.pitch)
        self.hy = hy
        px, py, eye = cam.x, cam.y, cam.z
        self.cam = cam
        fx, fy = math.cos(cam.yaw), math.sin(cam.yaw)
        rx, ry = -fy, fx
        self.fx, self.fy, self.rx, self.ry = fx, fy, rx, ry
        u = ((self.cols - W / 2) / f).astype(np.float32)
        self.u = u
        sec = np.sqrt(1.0 + u * u)
        dirx = (fx + rx * u).astype(np.float32)
        diry = (fy + ry * u).astype(np.float32)
        self.dirx, self.diry = dirx, diry
        frame = self.frame

        # ---------------------------------------------------------------- sky (rows above the horizon)
        hy_i = int(min(max(math.ceil(hy - 0.5), 0), H))
        if hy_i > 0:
            az = cam.yaw + np.arctan(u)
            su = (((az / (2 * math.pi)) % 1.0) * self.sky.shape[1]).astype(np.int32)
            el = np.arctan((hy - self.rows[:hy_i]) / f)
            sv = np.clip((1.0 - el / (math.pi / 2)) * (self.sky.shape[0] - 1), 0, self.sky.shape[0] - 1).astype(np.int32)
            frame[:hy_i] = self.sky[sv[:, None], su[None, :]]

        # ---------------------------------------------------------------- floor
        if hy_i < H:
            ydel = np.maximum(self.rows[hy_i:] - hy, 0.05)
            d = (eye * f / ydel).astype(np.float32)                       # perpendicular distance per row
            wx = px + fx * d[:, None] + (rx * d)[:, None] * u[None, :]
            wy = py + fy * d[:, None] + (ry * d)[:, None] * u[None, :]
            tx = (wx * 40.0).astype(np.int32) & 255
            ty = (wy * 40.0).astype(np.int32) & 255
            tex = at.floor[ty, tx]                                          # (n,W,3) uint8
            # lighting + fog at half resolution, then repeated up
            wxl, wyl = wx[::2, ::2], wy[::2, ::2]
            li = np.clip(((wxl + 56.0) * 2.0).astype(np.int32), 0, wd.LM_N - 1)
            lj = np.clip(((wyl + 56.0) * 2.0).astype(np.int32), 0, wd.LM_N - 1)
            light = self.lm[lj, li] * 1.6 + AMBIENT * 0.95
            dist = d[::2, None] * sec[None, ::2]
            fog = (1.0 - np.exp(-(FOG_DENS * dist) ** 2))[:, :, None].astype(np.float32)
            Mf = light * (1.0 - fog)
            Fa = self.fogcol * fog
            n_, W_ = tex.shape[0], tex.shape[1]
            Mf = np.repeat(np.repeat(Mf, 2, axis=0), 2, axis=1)[:n_, :W_]
            Fa = np.repeat(np.repeat(Fa, 2, axis=0), 2, axis=1)[:n_, :W_]
            frame[hy_i:] = np.minimum(tex * Mf + Fa, 255.0).astype(np.uint8)

        # ---------------------------------------------------------------- walls: slab test, K nearest layers per column
        self._walls(px, py, eye, hy, f, dirx, diry, sec)

    # ----------------------------------------------------------------------------------------------
    def _walls(self, px, py, eye, hy, f, dirx, diry, sec):
        W, H = self.W, self.H
        wd, at = self.world, self.atlas
        # --- cull boxes outside the view cone (bounding circle test)
        cam = self.cam
        rxd, ryd = px - wd.cx, py - wd.cy
        fwd_d = -(rxd * self.fx + ryd * self.fy)
        lat_d = -(rxd * self.rx + ryd * self.ry)
        br = wd.bradius
        tanh = (W / 2) / f * 1.08
        vis = (fwd_d > -br) & (np.abs(lat_d) < np.maximum(fwd_d, 0.0) * tanh + br + 1.0)
        sel = np.nonzero(vis)[0]
        if len(sel) == 0:
            self.layer_t[:] = np.inf
            self.layer_cov[:] = H
            return
        B = len(sel)
        bcx, bcy = wd.cx[sel], wd.cy[sel]
        bcs, bsn = wd.cs[sel], wd.sn[sel]
        bhw, bhd, bh = wd.hw[sel], wd.hd[sel], wd.h[sel]
        btid = wd.tid[sel]
        ox = px - bcx
        oy = py - bcy
        lox = bcs * ox + bsn * oy
        loy = -bsn * ox + bcs * oy
        ldx = dirx[:, None] * bcs[None, :] + diry[:, None] * bsn[None, :]
        ldy = -dirx[:, None] * bsn[None, :] + diry[:, None] * bcs[None, :]
        ldx = np.where(np.abs(ldx) < 1e-7, np.float32(1e-7), ldx)
        ldy = np.where(np.abs(ldy) < 1e-7, np.float32(1e-7), ldy)
        ix = 1.0 / ldx
        iy = 1.0 / ldy
        t1x = (-bhw - lox) * ix
        t2x = (bhw - lox) * ix
        t1y = (-bhd - loy) * iy
        t2y = (bhd - loy) * iy
        tminx = np.minimum(t1x, t2x)
        tmaxx = np.maximum(t1x, t2x)
        tminy = np.minimum(t1y, t2y)
        tmaxy = np.maximum(t1y, t2y)
        tn = np.maximum(tminx, tminy)
        tfar = np.minimum(tmaxx, tmaxy)
        hit = (tn < tfar) & (tfar > 0.05)
        tn = np.where(hit, np.maximum(tn, 0.05), np.inf).astype(np.float32)

        K = min(K_LAYERS, B)
        part = np.argpartition(tn, K - 1, axis=1)[:, :K]
        tk = np.take_along_axis(tn, part, 1)
        order = np.argsort(tk, axis=1)
        bidx = np.take_along_axis(part, order, 1)                 # (W,K) index into the culled set
        tk = np.take_along_axis(tk, order, 1)                      # (W,K) entry t

        cidx = self.cidx
        cover = np.full(W, H, np.int32)
        pix_y, pix_x, pix_c = [], [], []
        self.layer_t[:] = np.inf
        self.layer_cov[:] = H
        fogcol = self.fogcol
        for k in range(K):
            t = tk[:, k]
            valid = np.isfinite(t)
            if not valid.any():
                break
            bi = bidx[:, k]
            h = bh[bi]
            tsafe = np.where(valid, t, 1.0)
            # screen rows of the wall face
            ytop = hy + (eye - h) * f / tsafe
            ybot = hy + eye * f / tsafe
            y0r = np.ceil(ytop - 0.5).astype(np.int32)
            y1r = np.ceil(ybot - 0.5).astype(np.int32)
            y0 = np.clip(y0r, 0, H)
            y1 = np.minimum(np.clip(y1r, 0, H), cover)
            cnt = np.where(valid, np.maximum(y1 - y0, 0), 0)
            topvis = valid & (eye > h + 0.001)
            tf_k = tfar[cidx, bi]
            tfs = np.where(topvis, np.maximum(tf_k, tsafe + 1e-3), 1.0)
            ytf = hy + (eye - h) * f / tfs
            yt0r = np.ceil(ytf - 0.5).astype(np.int32)
            yt0 = np.clip(yt0r, 0, H)
            yt1 = np.minimum(np.clip(y0r, 0, H), cover)
            tcnt = np.where(topvis, np.maximum(yt1 - yt0, 0), 0)
            # occlusion information for billboards (rows >= cov are hidden behind this box)
            covf = np.where(topvis, ytf, ytop)
            self.layer_t[:, k] = np.where(valid, t, np.inf)
            self.layer_cov[:, k] = np.where(valid, covf, H)
            cover_new = np.minimum(cover, np.clip(np.where(topvis, yt0r, y0r), 0, H))
            cover = np.where(valid, cover_new, cover)

            # ---------------- side face pixels
            n = int(cnt.sum())
            if n > 0:
                start = np.cumsum(cnt) - cnt
                xs = np.repeat(cidx.astype(np.int32), cnt)
                ys = np.arange(n, dtype=np.int32) + np.repeat((y0 - start).astype(np.int32), cnt)
                # per-column face data
                ldx_s = ldx[cidx, bi]
                ldy_s = ldy[cidx, bi]
                facex = tminx[cidx, bi] >= tminy[cidx, bi]
                hx = lox[bi] + ldx_s * tsafe
                hyl = loy[bi] + ldy_s * tsafe
                sgx = -np.sign(ldx_s)
                sgy = -np.sign(ldy_s)
                uw_world = np.where(facex, -sgx * hyl + bhd[bi], sgy * hx + bhw[bi])
                nlx = np.where(facex, sgx, 0.0)
                nly = np.where(facex, 0.0, sgy)
                nwx = bcs[bi] * nlx - bsn[bi] * nly
                nwy = bsn[bi] * nlx + bcs[bi] * nly
                diff = np.maximum(0.0, nwx * SUN_DIR[0] + nwy * SUN_DIR[1])
                mult = AMBIENT[None, :] * 0.95 + SUN_RGB[None, :] * (0.62 * diff)[:, None]
                gx = px + dirx * tsafe
                gy = py + diry * tsafe
                li = np.clip(((gx + 56.0) * 2.0).astype(np.int32), 0, wd.LM_N - 1)
                lj = np.clip(((gy + 56.0) * 2.0).astype(np.int32), 0, wd.LM_N - 1)
                mult = (mult + self.lm[lj, li] * 1.6).astype(np.float32)
                tid = btid[bi]
                tw_c = at.tw[tid]
                th_c = at.th[tid]
                ucol = np.minimum((((uw_world / at.uw[tid]) % 1.0) * tw_c).astype(np.int64), tw_c - 1)
                fogamt = (1.0 - np.exp(-(FOG_DENS * tsafe * sec) ** 2)).astype(np.float32)
                # texel row is linear in the screen row:  z = z0 + z1*y   (float32 everywhere)
                z1 = (-(tsafe / f)).astype(np.float32)
                z0 = (eye - (0.5 - hy) * tsafe / f).astype(np.float32)
                scl = (th_c / at.vh[tid] * 0.9995).astype(np.float32)
                K0 = (at.off[tid] + ucol + (th_c - 1) * tw_c).astype(np.int64)
                Mf = mult * (1.0 - fogamt)[:, None]
                Fa = fogcol[None, :] * fogamt[:, None]
                z = np.repeat(z0, cnt) + np.repeat(z1, cnt) * ys
                row = (z * np.repeat(scl, cnt)).astype(np.int64)
                idx = np.repeat(K0, cnt) - row * np.repeat(tw_c, cnt)
                vg = 0.60 + 0.40 * np.minimum(z * 0.33, 1.0)
                rgb = at.data[idx] * (np.repeat(Mf, cnt, axis=0) * vg[:, None]) + np.repeat(Fa, cnt, axis=0)
                pix_y.append(ys)
                pix_x.append(xs)
                pix_c.append(rgb)

            # ---------------- top face pixels (only when the eye is above the box)
            n2 = int(tcnt.sum())
            if n2 > 0:
                start = np.cumsum(tcnt) - tcnt
                xs = np.repeat(cidx.astype(np.int32), tcnt)
                ys = np.arange(n2, dtype=np.int32) + np.repeat((yt0 - start).astype(np.int32), tcnt)
                hh = np.repeat(h, tcnt)
                trow = ((eye - hh) * f / (ys.astype(np.float32) + (0.5 - hy))).astype(np.float32)
                wx = px + np.repeat(dirx, tcnt) * trow
                wy = py + np.repeat(diry, tcnt) * trow
                tt = self.world.top_tid
                tw_, th_ = int(at.tw[tt]), int(at.th[tt])
                ui = ((wx / at.uw[tt]) % 1.0 * tw_).astype(np.int64)
                vi = ((wy / at.vh[tt]) % 1.0 * th_).astype(np.int64)
                rgb = at.data[at.off[tt] + np.minimum(vi, th_ - 1) * tw_ + np.minimum(ui, tw_ - 1)] \
                    * (AMBIENT[None, :] * 1.15 + SUN_RGB[None, :] * 0.45 + self.lm[
                        np.clip(((wy + 56.0) * 2.0).astype(np.int32), 0, wd.LM_N - 1),
                        np.clip(((wx + 56.0) * 2.0).astype(np.int32), 0, wd.LM_N - 1)] * 2.2)
                fg = (1.0 - np.exp(-(FOG_DENS * trow * np.repeat(sec, tcnt)) ** 2)).astype(np.float32)[:, None]
                rgb = rgb * (1.0 - fg) + fogcol * fg
                pix_y.append(ys)
                pix_x.append(xs)
                pix_c.append(rgb)
            if not cover.any():
                break
        if pix_y:
            flat = np.concatenate(pix_y).astype(np.int64) * W + np.concatenate(pix_x)
            cc = np.concatenate(pix_c, axis=0)
            self.frame.reshape(-1, 3)[flat] = np.minimum(cc, 255.0).astype(np.uint8)

    # ==============================================================================================
    # billboards
    # ==============================================================================================
    def occlusion_rows(self, x0, x1, depth):
        """Per-column first hidden row for something at perpendicular `depth`."""
        t = self.layer_t[x0:x1]
        c = self.layer_cov[x0:x1]
        return np.where(t < depth, c, float(self.H)).min(axis=1)

    def project(self, wx, wy, wz):
        """World point -> (sx, sy, depth) or None when behind the camera."""
        cam = self.cam
        rx_, ry_ = wx - cam.x, wy - cam.y
        depth = rx_ * self.fx + ry_ * self.fy
        if depth < 0.15:
            return None
        lat = rx_ * self.rx + ry_ * self.ry
        s = self.f / depth
        return self.W / 2 + lat * s, self.hy + (cam.z - wz) * s, depth

    def draw_billboard(self, img, wx, wy, z0, height, width, tint=(1.0, 1.0, 1.0), flash=0.0, emissive=False):
        """img: (h,w,4) uint8 array.  Feet at z0, world size width x height."""
        p = self.project(wx, wy, z0)
        if p is None:
            return None
        sx, sy_feet, depth = p
        s = self.f / depth
        sh = height * s
        sw = width * s
        if sw < 1.0 or sh < 1.0:
            return None
        W, H = self.W, self.H
        x0 = int(round(sx - sw / 2))
        x1 = x0 + max(1, int(round(sw)))
        y1 = int(round(sy_feet))
        y0 = y1 - max(1, int(round(sh)))
        cx0, cx1 = max(x0, 0), min(x1, W)
        cy0, cy1 = max(y0, 0), min(y1, H)
        if cx0 >= cx1 or cy0 >= cy1:
            return None
        ih, iw = img.shape[:2]
        xi = np.clip(((np.arange(cx0, cx1) - x0 + 0.5) * iw / (x1 - x0)).astype(np.int32), 0, iw - 1)
        yi = np.clip(((np.arange(cy0, cy1) - y0 + 0.5) * ih / (y1 - y0)).astype(np.int32), 0, ih - 1)
        sub = img[yi[:, None], xi[None, :]]
        mask = sub[:, :, 3] > 90
        occ = self.occlusion_rows(cx0, cx1, depth)
        rows = np.arange(cy0, cy1, dtype=np.float32)[:, None] + 0.5
        mask &= rows < occ[None, :]
        if not mask.any():
            return (sx, sy_feet - sh / 2, depth)
        rgb = sub[:, :, :3].astype(np.float32)
        if not emissive:
            li = self.world.light_at(wx, wy)
            mult = (AMBIENT * 1.0 + SUN_RGB * 0.3 + li * 1.1) * np.array(tint, np.float32)
            rgb *= mult
        if flash > 0:
            rgb = rgb * (1 - flash) + 255.0 * flash
        fg = 1.0 - math.exp(-(FOG_DENS * depth) ** 2)
        rgb = rgb * (1.0 - fg) + self.fogcol * fg
        region = self.frame[cy0:cy1, cx0:cx1]
        region[mask] = np.clip(rgb[mask], 0, 255).astype(np.uint8)
        return (sx, sy_feet - sh / 2, depth)

    # ==============================================================================================
    def to_surface(self):
        self.surf = pygame.image.frombuffer(self.frame, (self.W, self.H), "RGB")
        return self.surf

    def point_visible(self, wx, wy, wz):
        p = self.project(wx, wy, wz)
        if p is None:
            return None
        sx, sy, depth = p
        if not (0 <= sx < self.W and 0 <= sy < self.H):
            return None
        occ = self.layer_t[int(sx)]
        cov = self.layer_cov[int(sx)]
        o = np.where(occ < depth, cov, float(self.H)).min()
        if sy >= o:
            return None
        return sx, sy, depth

    def glow(self, radius, color, key=None):
        r = max(2, int(radius))
        k = (r // 2, color)
        g = self._glow_cache.get(k)
        if g is None:
            r = (r // 2) * 2 + 2
            s = pygame.Surface((r * 2, r * 2))
            yy, xx = np.mgrid[-r:r, -r:r]
            d = np.sqrt((xx + 0.5) ** 2 + (yy + 0.5) ** 2) / r
            a = np.clip(1.0 - d, 0, 1) ** 2
            arr = (a[:, :, None] * np.array(color, np.float32)[None, None, :]).astype(np.uint8)
            pygame.surfarray.blit_array(s, arr.swapaxes(0, 1))
            self._glow_cache[k] = g = s
            if len(self._glow_cache) > 200:
                self._glow_cache.clear()
        return g

    def add_glow(self, surf, wx, wy, wz, world_radius, color, intensity=1.0, check_occlusion=True):
        p = self.project(wx, wy, wz)
        if p is None:
            return
        sx, sy, depth = p
        r = world_radius * self.f / depth
        if r < 1.5 or sx < -r or sx > self.W + r or sy < -r or sy > self.H + r:
            return
        if check_occlusion and 0 <= sx < self.W and 0 <= sy < self.H:
            occ = self.layer_t[int(sx)]
            cov = self.layer_cov[int(sx)]
            if sy >= np.where(occ < depth, cov, float(self.H)).min():
                return
        col = tuple(int(min(255, c * intensity)) for c in color)
        g = self.glow(min(r, 160), col)
        surf.blit(g, (int(sx - g.get_width() / 2), int(sy - g.get_height() / 2)), special_flags=pygame.BLEND_RGB_ADD)
