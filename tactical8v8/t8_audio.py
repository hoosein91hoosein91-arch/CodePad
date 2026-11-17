"""Procedural sound effects (numpy synthesis, no audio files) + positional playback through pygame.mixer."""
import math
import random
import numpy as np
import pygame

SR = 22050


def _t(dur):
    return np.arange(int(SR * dur), dtype=np.float32) / SR


def _noise(dur):
    return np.random.uniform(-1, 1, int(SR * dur)).astype(np.float32)


def _lp(x, cutoff):
    """one-pole low-pass via convolution with an exponential kernel"""
    a = 1.0 - math.exp(-2 * math.pi * cutoff / SR)
    n = min(len(x), int(6 / a) + 1)
    k = a * (1 - a) ** np.arange(n, dtype=np.float32)
    return np.convolve(x, k.astype(np.float32))[:len(x)].astype(np.float32)


def _hp(x, cutoff):
    return x - _lp(x, cutoff)


def _env(n, attack=0.002, decay=0.1, power=2.0):
    t = np.arange(n, dtype=np.float32) / SR
    e = np.exp(-t / max(decay, 1e-4)) ** power if power != 1 else np.exp(-t / max(decay, 1e-4))
    a = np.minimum(1.0, t / max(attack, 1e-5))
    return (e * a).astype(np.float32)


def _sweep(dur, f0, f1, shape="exp"):
    t = _t(dur)
    if shape == "exp":
        f = f0 * (f1 / f0) ** (t / dur)
    else:
        f = f0 + (f1 - f0) * (t / dur)
    ph = 2 * math.pi * np.cumsum(f) / SR
    return np.sin(ph).astype(np.float32)


def _norm(x, peak=0.9):
    m = float(np.max(np.abs(x))) or 1.0
    return (x / m * peak).astype(np.float32)


def _pad(x, dur):
    n = int(SR * dur)
    out = np.zeros(max(n, len(x)), np.float32)
    out[:len(x)] = x
    return out


def _mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n, np.float32)
    for p in parts:
        out[:len(p)] += p
    return out


def _at(x, delay):
    return np.concatenate([np.zeros(int(SR * delay), np.float32), x])


def _gun(dur, decay, lp, boom_f0, boom_f1, boom_amp, crack=1.0, tail=0.0):
    n = _noise(dur)
    body = _lp(n, lp) * _env(len(n), 0.0008, decay, 1.0)
    crack_n = _hp(_noise(0.03), 2000) * _env(int(SR * 0.03), 0.0002, 0.006, 1.0) * crack
    boom = _sweep(dur, boom_f0, boom_f1) * _env(int(SR * dur), 0.001, decay * 0.7, 1.0) * boom_amp
    out = _mix(body * 1.4, _pad(crack_n, dur), boom)
    if tail > 0:
        tl = _lp(_noise(tail), 600) * _env(int(SR * tail), 0.02, tail * 0.45, 1.0) * 0.25
        out = _mix(out, _at(tl, 0.03))
    return _norm(out, 0.92)


def _resample(x, ratio):
    n = int(len(x) / ratio)
    return np.interp(np.arange(n) * ratio, np.arange(len(x)), x).astype(np.float32)


def build_sounds():
    S = {}
    S["ar"] = _gun(0.22, 0.045, 3200, 190, 45, 0.9, 1.0)
    S["ak"] = _gun(0.26, 0.06, 2600, 150, 40, 1.1, 1.0, 0.1)
    S["smg"] = _gun(0.14, 0.03, 4200, 240, 70, 0.6, 1.2)
    S["sniper"] = _gun(0.7, 0.14, 1700, 110, 28, 1.4, 1.2, 0.6)
    S["shotgun"] = _gun(0.5, 0.11, 2100, 95, 26, 1.5, 0.9, 0.3)
    S["minigun"] = _gun(0.1, 0.022, 3800, 210, 60, 0.7, 0.8)
    # explosion
    n = _noise(1.5)
    ex = _lp(n, 520) * _env(len(n), 0.004, 0.32, 1.0) * 2.0
    ex2 = _lp(_noise(1.5), 2500) * _env(len(n), 0.002, 0.07, 1.0) * 0.8
    sub = _sweep(1.5, 90, 24) * _env(len(n), 0.003, 0.4, 1.0) * 1.3
    S["explosion"] = _norm(_mix(ex, ex2, sub), 0.97)
    S["rpg"] = _norm(_mix(_lp(_noise(0.6), 1500) * _env(int(SR * 0.6), 0.02, 0.16, 1.0), _sweep(0.5, 240, 60) * 0.6,
                          _gun(0.25, 0.05, 2500, 130, 40, 1.0)), 0.9)
    S["hit"] = _norm(_sweep(0.07, 1950, 900) * _env(int(SR * 0.07), 0.001, 0.03, 1.0), 0.55)
    S["headshot"] = _norm(_mix(_sweep(0.09, 2800, 1300) * _env(int(SR * 0.09), 0.001, 0.04, 1.0),
                               _at(_sweep(0.09, 3400, 1700) * _env(int(SR * 0.09), 0.001, 0.04, 1.0), 0.05)), 0.65)
    S["kill"] = _norm(_mix(_sweep(0.12, 700, 1400) * _env(int(SR * 0.12), 0.001, 0.07, 1.0),
                           _at(_sweep(0.16, 1000, 2000) * _env(int(SR * 0.16), 0.001, 0.09, 1.0), 0.08)), 0.5)
    clk = lambda f: _lp(_hp(_noise(0.04), f), 6000) * _env(int(SR * 0.04), 0.0005, 0.009, 1.0)
    S["reload"] = _norm(_mix(_pad(clk(700), 0.9), _at(clk(1500), 0.28) * 1.0, _at(_sweep(0.08, 400, 700) * 0.4, 0.5),
                             _at(clk(900), 0.62)), 0.6)
    S["reload_long"] = _norm(_mix(_pad(clk(600), 2.2), _at(clk(1200), 0.5), _at(clk(1000), 1.0), _at(clk(1600), 1.6),
                                  _at(_lp(_noise(0.3), 900) * _env(int(SR * 0.3), 0.01, 0.1, 1.0) * 0.6, 1.9)), 0.6)
    S["empty"] = _norm(clk(2200), 0.5)
    S["step"] = _norm(_mix(_lp(_noise(0.09), 400) * _env(int(SR * 0.09), 0.002, 0.03, 1.0), _sweep(0.07, 90, 50) * 0.5), 0.35)
    S["land"] = _norm(_mix(_lp(_noise(0.2), 300) * _env(int(SR * 0.2), 0.002, 0.07, 1.0), _sweep(0.15, 70, 35) * 0.9), 0.6)
    S["bounce"] = _norm(_hp(_lp(_noise(0.1), 5000), 800) * _env(int(SR * 0.1), 0.001, 0.02, 1.0), 0.5)
    S["hurt"] = _norm(_mix(_lp(_noise(0.3), 700) * _env(int(SR * 0.3), 0.002, 0.08, 1.0), _sweep(0.25, 140, 60) * 0.8), 0.75)
    S["heart"] = _norm(_mix(_sweep(0.14, 70, 45) * _env(int(SR * 0.14), 0.004, 0.06, 1.0),
                            _at(_sweep(0.14, 60, 40) * _env(int(SR * 0.14), 0.004, 0.06, 1.0), 0.2)), 0.7)
    S["pickup"] = _norm(_mix(_pad(_sweep(0.08, 600, 900), 0.2), _at(_sweep(0.1, 900, 1500), 0.07)), 0.45)
    S["stim"] = _norm(_mix(_lp(_noise(0.5), 3000) * _env(int(SR * 0.5), 0.02, 0.25, 1.0) * 0.35,
                           _at(_sweep(0.4, 300, 1200, "lin") * _env(int(SR * 0.4), 0.01, 0.3, 1.0), 0.1)), 0.6)
    n = _noise(2.4)
    jet = _lp(n, 1800) * (np.minimum(1, _t(2.4) / 1.0) * np.exp(-np.maximum(0, _t(2.4) - 1.3) * 2.2))
    S["airstrike"] = _norm(_mix(jet * 1.0, _sweep(2.0, 500, 160) * 0.18 * jet[:int(SR * 2.0)] / (np.max(jet) + 1e-6)), 0.75)
    S["siren"] = _norm(_sweep(1.0, 600, 900, "lin") * 0.5, 0.4)
    S["deploy"] = _norm(_mix(_pad(clk(500), 0.5), _at(clk(900), 0.12), _at(_sweep(0.3, 200, 500) * 0.5, 0.2)), 0.6)
    S["whiz"] = _norm(_hp(_lp(_noise(0.15), 5000), 1500) * np.sin(np.linspace(0, math.pi, int(SR * 0.15))) ** 2, 0.5)
    S["bt_in"] = _norm(_mix(_sweep(0.7, 900, 90) * _env(int(SR * 0.7), 0.01, 0.4, 1.0), _lp(_noise(0.7), 800) * 0.3), 0.7)
    S["bt_out"] = _norm(_mix(_sweep(0.5, 90, 900) * _env(int(SR * 0.5), 0.01, 0.3, 1.0), _lp(_noise(0.5), 1500) * 0.2), 0.6)
    S["uav"] = _norm(_mix(_sweep(0.08, 1200, 1200) * 1.0, _at(_sweep(0.08, 1600, 1600), 0.14), _at(_sweep(0.08, 2000, 2000), 0.28))
                     * 1.0, 0.45)
    S["ui"] = _norm(_sweep(0.05, 900, 1300) * _env(int(SR * 0.05), 0.001, 0.02, 1.0), 0.4)
    S["buy"] = _norm(_mix(_sweep(0.08, 700, 1000), _at(_sweep(0.12, 1000, 1500), 0.08)) * 1.0, 0.5)
    S["deny"] = _norm(_sweep(0.18, 220, 150) * 1.0, 0.4)
    # wave horn: layered saw chord
    t = _t(1.3)
    horn = sum(((2 * ((f * t) % 1.0) - 1.0) * (1 - (np.arange(len(t)) / len(t)) ** 3)) for f in (110, 138.6, 164.8)) / 3.0
    horn = _lp(horn.astype(np.float32), 900) * np.minimum(1, t / 0.05) * np.minimum(1, (1.3 - t) / 0.25)
    S["horn"] = _norm(horn, 0.7)
    t = _t(1.1)
    chime = sum(np.sin(2 * math.pi * f * t) * np.exp(-t * d) for f, d in ((660, 3.0), (880, 3.5), (1320, 4.0)))
    S["clear"] = _norm(chime.astype(np.float32), 0.6)
    t = _t(2.0)
    over = np.sin(2 * math.pi * 110 * t) * np.exp(-t * 1.5) + np.sin(2 * math.pi * 82.4 * t) * np.exp(-t * 1.2)
    S["gameover"] = _norm(over.astype(np.float32), 0.7)
    wind = _lp(_noise(4.0), 380)
    wind *= (0.6 + 0.4 * np.sin(np.linspace(0, 2 * math.pi, len(wind))))
    S["wind"] = _norm(wind, 0.5)
    return S


def to_sound(x, gain=1.0):
    """float mono @ SR  ->  pygame Sound matching whatever the mixer really opened (rate / channels)."""
    a = np.clip(x * gain, -1, 1)
    init = pygame.mixer.get_init()
    freq, chans = (init[0], init[2]) if init else (SR, 1)
    if freq != SR:
        a = np.interp(np.arange(int(len(a) * freq / SR)) * (SR / freq), np.arange(len(a)), a)
    a = (a * 32000).astype(np.int16)
    if chans == 2:
        a = np.ascontiguousarray(np.column_stack((a, a)))
    return pygame.mixer.Sound(buffer=a.tobytes())


class Audio:
    def __init__(self):
        self.ok = False
        self.muted = False
        self.master = 0.8
        self.sounds = {}
        self.lx = self.ly = 0.0
        self.lyaw = 0.0
        try:
            pygame.mixer.pre_init(SR, -16, 1, 512)
            pygame.mixer.init(SR, -16, 1, 512)
            pygame.mixer.set_num_channels(40)
            self.ok = True
        except Exception:
            self.ok = False
            return
        raw = build_sounds()
        for k, v in raw.items():
            variants = [to_sound(v)]
            if k in ("ar", "ak", "smg", "sniper", "shotgun", "minigun", "explosion", "step", "hit", "hurt"):
                variants += [to_sound(_resample(v, r)) for r in (0.93, 1.08)]
            self.sounds[k] = variants
        self.wind = None

    def start_ambient(self):
        if not self.ok:
            return
        try:
            self.wind = self.sounds["wind"][0]
            self.wind.set_volume(0.18 * self.master)
            self.wind.play(loops=-1)
        except Exception:
            pass

    def listener(self, x, y, yaw):
        self.lx, self.ly, self.lyaw = x, y, yaw

    def play(self, name, vol=1.0, pos=None, maxdist=60.0):
        if not self.ok or self.muted:
            return
        v = self.sounds.get(name)
        if not v:
            return
        snd = random.choice(v)
        left = right = vol * self.master
        if pos is not None:
            dx, dy = pos[0] - self.lx, pos[1] - self.ly
            d = math.hypot(dx, dy)
            if d > maxdist:
                return
            att = 1.0 / (1.0 + (d / 9.0) ** 1.4)
            ang = math.atan2(dy, dx) - self.lyaw            # +: to the right (y-down map, forward = yaw)
            pan = math.sin(ang)
            left = vol * self.master * att * (0.5 - 0.5 * pan * 0.9 + 0.1)
            right = vol * self.master * att * (0.5 + 0.5 * pan * 0.9 + 0.1)
        ch = pygame.mixer.find_channel()
        if ch is None:
            return
        ch.set_volume(min(1.0, left), min(1.0, right))
        ch.play(snd)

    def toggle_mute(self):
        self.muted = not self.muted
        if self.ok:
            if self.muted:
                pygame.mixer.pause()
                if self.wind:
                    self.wind.set_volume(0)
            else:
                pygame.mixer.unpause()
                if self.wind:
                    self.wind.set_volume(0.18 * self.master)
