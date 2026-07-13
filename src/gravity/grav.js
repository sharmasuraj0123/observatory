// Gravity Lab physics: N-body leapfrog for massive bodies + massless tracers,
// orbital-element analysis, tunable central-force exponent, and pedagogical
// quantum-gravity effective models (see quantum.js).
//
// Units: kilometers, kilograms, seconds (same as the solar N-body lab).
// Scene conversion happens only at the render boundary.
//
// Orbital elements from the specific angular momentum and eccentricity
// vectors (Battin / Vallado style). Force law default is Newtonian
// F ∝ m1 m2 / r²; the exponent n is live so F ∝ 1 / r^n.

import {
  qgAccelAt,
  qgAccelFromTo,
  qgPotentialAt,
  hawkingMassRate,
  foamKick,
  quantumPressureAccel,
  packetCom,
  qgLabel,
} from './quantum.js';

export const G_KM = 6.674e-20; // km^3 / (kg s^2)
export const M_EARTH = 5.972e24;
export const M_SUN = 1.98847e30;
export const M_MOON = 7.342e22;
export const R_EARTH_KM = 6371;
export const R_SUN_KM = 695700;
export const AU_KM = 149597870.7;

const SOFT2 = 1; // km^2 softening

export function circularSpeed(mu, r) {
  return Math.sqrt(mu / r);
}

export function escapeSpeed(mu, r) {
  return Math.sqrt(2 * mu / r);
}

export function periodSec(mu, a) {
  if (!(a > 0) || !(mu > 0)) return Infinity;
  return 2 * Math.PI * Math.sqrt(a * a * a / mu);
}

// Specific orbital elements relative to a central mass at the origin of the
// given frame (pos/vel already relative to that mass).
export function orbitalElements(pos, vel, mu) {
  const [x, y, z] = pos;
  const [vx, vy, vz] = vel;
  const r = Math.hypot(x, y, z);
  const v2 = vx * vx + vy * vy + vz * vz;
  if (r < 1e-9 || !(mu > 0)) {
    return {
      r, v: Math.sqrt(v2), energy: 0, h: 0, e: 0, a: NaN,
      rp: NaN, ra: NaN, period: Infinity, kind: 'undefined',
      flightPathDeg: 0, escape: 0, circ: 0,
    };
  }
  // h = r × v
  const hx = y * vz - z * vy;
  const hy = z * vx - x * vz;
  const hz = x * vy - y * vx;
  const h = Math.hypot(hx, hy, hz);
  const energy = 0.5 * v2 - mu / r; // specific mechanical energy
  // e = (1/μ) ((v² - μ/r) r - (r·v) v)
  const rdotv = x * vx + y * vy + z * vz;
  const ex = ((v2 - mu / r) * x - rdotv * vx) / mu;
  const ey = ((v2 - mu / r) * y - rdotv * vy) / mu;
  const ez = ((v2 - mu / r) * z - rdotv * vz) / mu;
  const e = Math.hypot(ex, ey, ez);
  let a = NaN, rp = NaN, ra = NaN, period = Infinity, kind;
  if (energy < -1e-12) {
    a = -mu / (2 * energy);
    rp = a * (1 - e);
    ra = a * (1 + e);
    period = periodSec(mu, a);
    kind = e < 0.02 ? 'circular' : 'elliptical';
  } else if (Math.abs(energy) <= 1e-12) {
    kind = 'parabolic';
    rp = h * h / (2 * mu);
  } else {
    a = -mu / (2 * energy); // negative for hyperbola; |a| used in formulas
    rp = (-a) * (e - 1);
    kind = 'hyperbolic';
  }
  const flightPathDeg = Math.atan2(rdotv / r, h / r) * 180 / Math.PI;
  return {
    r, v: Math.sqrt(v2), energy, h, e, a, rp, ra, period, kind,
    flightPathDeg,
    escape: escapeSpeed(mu, r),
    circ: circularSpeed(mu, r),
    rdotv,
  };
}

// Acceleration on a test mass at `pos` due to massive bodies.
// exponent n: Newtonian is 2. Force magnitude ∝ 1/r^n, direction along r.
export function accelAt(pos, bodies, G, exponent = 2, qg = null) {
  if (qg && qg.mode && qg.mode !== 'none') {
    return qgAccelAt(pos, bodies, G, { ...qg, exponent });
  }
  let ax = 0, ay = 0, az = 0;
  for (const b of bodies) {
    if (b.destroyed || b.test) continue;
    const dx = b.pos[0] - pos[0];
    const dy = b.pos[1] - pos[1];
    const dz = b.pos[2] - pos[2];
    const r2 = dx * dx + dy * dy + dz * dz + SOFT2;
    const r = Math.sqrt(r2);
    const mag = (G * b.mass) / (r ** exponent);
    ax += (dx / r) * mag;
    ay += (dy / r) * mag;
    az += (dz / r) * mag;
  }
  return [ax, ay, az];
}

export function potentialAt(pos, bodies, G, exponent = 2, qg = null) {
  if (qg && qg.mode && qg.mode !== 'none') {
    return qgPotentialAt(pos, bodies, G, { ...qg, exponent });
  }
  let phi = 0;
  for (const b of bodies) {
    if (b.destroyed || b.test) continue;
    const dx = pos[0] - b.pos[0];
    const dy = pos[1] - b.pos[1];
    const dz = pos[2] - b.pos[2];
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz + SOFT2);
    if (Math.abs(exponent - 1) < 1e-9) phi += G * b.mass * Math.log(r);
    else phi += -G * b.mass / ((exponent - 1) * (r ** (exponent - 1)));
  }
  return phi;
}

export class GravitySim {
  constructor() {
    this.bodies = [];
    this.G = G_KM;
    this.exponent = 2;
    this.qg = { mode: 'none' };
    this.t = 0;
    this.playing = true;
    this.speedMul = 1;
    this.initialMass = null;
  }

  seed(entries, opts = {}) {
    this.G = opts.G ?? G_KM;
    this.exponent = opts.exponent ?? 2;
    this.qg = { mode: 'none', ...(opts.qg || {}) };
    if (this.qg.mode && this.qg.mode !== 'none') {
      this.qg.exponent = this.exponent;
    }
    this.t = 0;
    this.bodies = entries.map((e) => ({
      id: e.id,
      name: e.name,
      mass: e.mass || 0,
      radius: e.radius || 1,
      radius0: e.radius || 1,
      pos: Float64Array.from(e.pos),
      vel: Float64Array.from(e.vel || [0, 0, 0]),
      acc: new Float64Array(3),
      test: !!e.test,
      fixed: !!e.fixed,
      color: e.color ?? (e.test ? 0x86b7ff : 0xffca7a),
      destroyed: false,
      trail: [],
      isHorizon: !!e.isHorizon,
    }));
    const p = this.primary();
    this.initialMass = p ? p.mass : null;
    this.recomputeAccels();
  }

  setQg(partial) {
    this.qg = { ...this.qg, ...partial, exponent: this.exponent };
  }

  massive() {
    return this.bodies.filter((b) => !b.test && !b.destroyed);
  }

  tracers() {
    return this.bodies.filter((b) => b.test && !b.destroyed);
  }

  primary() {
    let best = null;
    for (const b of this.massive()) {
      if (!best || b.mass > best.mass) best = b;
    }
    return best;
  }

  muPrimary() {
    const p = this.primary();
    return p ? this.G * p.mass : 0;
  }

  recomputeAccels() {
    const G = this.G;
    const n = this.exponent;
    const qg = this.qg;
    const mode = (qg && qg.mode) || 'none';
    const bs = this.bodies;
    for (const b of bs) b.acc.fill(0);

    const useQg = mode !== 'none';

    for (let i = 0; i < bs.length; i++) {
      const bi = bs[i];
      if (bi.destroyed || bi.test || bi.fixed) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const bj = bs[j];
        if (bj.destroyed || bj.test) continue;
        let magI, magJ, ux, uy, uz;
        if (useQg) {
          const aij = qgAccelFromTo(bi.pos, bj.pos, bj.mass, G, { ...qg, exponent: n });
          const aji = qgAccelFromTo(bj.pos, bi.pos, bi.mass, G, { ...qg, exponent: n });
          magI = aij.mag;
          magJ = aji.mag;
          ux = aij.ux; uy = aij.uy; uz = aij.uz;
        } else {
          const dx = bj.pos[0] - bi.pos[0];
          const dy = bj.pos[1] - bi.pos[1];
          const dz = bj.pos[2] - bi.pos[2];
          const r2 = dx * dx + dy * dy + dz * dz + SOFT2;
          const r = Math.sqrt(r2);
          magI = (G * bj.mass) / (r ** n);
          magJ = (G * bi.mass) / (r ** n);
          ux = dx / r; uy = dy / r; uz = dz / r;
        }
        if (!bi.fixed) {
          bi.acc[0] += ux * magI; bi.acc[1] += uy * magI; bi.acc[2] += uz * magI;
        }
        if (!bj.fixed) {
          bj.acc[0] -= ux * magJ; bj.acc[1] -= uy * magJ; bj.acc[2] -= uz * magJ;
        }
      }
    }

    for (const t of bs) {
      if (t.destroyed || !t.test) continue;
      const [ax, ay, az] = accelAt(t.pos, bs, G, n, qg);
      t.acc[0] = ax; t.acc[1] = ay; t.acc[2] = az;
    }

    if (mode === 'schrodingerNewton') {
      const { com, sigma } = packetCom(bs);
      const hbar = qg.hbarEff ?? 0;
      if (hbar > 0) {
        for (const b of bs) {
          if (b.destroyed || b.fixed || !(b.mass > 0)) continue;
          const [qx, qy, qz] = quantumPressureAccel(b.pos, com, sigma, hbar);
          b.acc[0] += qx; b.acc[1] += qy; b.acc[2] += qz;
        }
      }
    }
  }

  step(dt) {
    if (!dt || !this.playing) return;
    const h = dt * this.speedMul;
    if (!h) return;
    const dir = Math.sign(h);
    let remaining = Math.abs(h);
    let guard = 0;
    while (remaining > 1e-12 && guard++ < 400) {
      let dtSub = remaining;
      let maxA = 0, minR = Infinity;
      for (const b of this.bodies) {
        if (b.destroyed) continue;
        const a = Math.hypot(b.acc[0], b.acc[1], b.acc[2]);
        if (a > maxA) maxA = a;
        if (!b.test) continue;
        const p = this.primary();
        if (p) {
          const r = Math.hypot(b.pos[0] - p.pos[0], b.pos[1] - p.pos[1], b.pos[2] - p.pos[2]);
          if (r < minR) minR = r;
        }
      }
      if (maxA > 0) dtSub = Math.min(dtSub, Math.sqrt(1 / maxA) * 8);
      if (minR < Infinity) dtSub = Math.min(dtSub, Math.sqrt(minR * minR * minR / (this.muPrimary() || 1)) * 0.02);
      dtSub = Math.max(dtSub, remaining / 80);
      const step = dir * Math.min(dtSub, remaining);

      for (const b of this.bodies) {
        if (b.destroyed || b.fixed) continue;
        b.vel[0] += b.acc[0] * step * 0.5;
        b.vel[1] += b.acc[1] * step * 0.5;
        b.vel[2] += b.acc[2] * step * 0.5;
      }
      for (const b of this.bodies) {
        if (b.destroyed || b.fixed) continue;
        b.pos[0] += b.vel[0] * step;
        b.pos[1] += b.vel[1] * step;
        b.pos[2] += b.vel[2] * step;
      }

      if (this.qg.mode === 'hawking') {
        this.applyHawking(Math.abs(step));
      }

      this.recomputeAccels();

      if (this.qg.mode === 'foam') {
        const p = this.primary();
        for (const b of this.bodies) {
          if (b.destroyed || b.fixed) continue;
          let r = 1;
          if (p && b !== p) {
            r = Math.hypot(b.pos[0] - p.pos[0], b.pos[1] - p.pos[1], b.pos[2] - p.pos[2]);
          }
          foamKick(b.vel, r, Math.abs(step), this.qg);
        }
      }

      for (const b of this.bodies) {
        if (b.destroyed || b.fixed) continue;
        b.vel[0] += b.acc[0] * step * 0.5;
        b.vel[1] += b.acc[1] * step * 0.5;
        b.vel[2] += b.acc[2] * step * 0.5;
      }
      this.checkCollisions();
      remaining -= Math.abs(step);
      this.t += step;
    }
  }

  applyHawking(dtSec) {
    const p = this.primary();
    if (!p || !(p.mass > 0)) return;
    const kappa = this.qg.kappa ?? 0;
    if (!(kappa > 0)) return;
    const dM = hawkingMassRate(p.mass, kappa) * dtSec;
    p.mass = Math.max(p.mass + dM, p.mass * 1e-6);
    if (p.isHorizon && this.initialMass > 0) {
      const frac = p.mass / this.initialMass;
      p.radius = Math.max(p.radius0 || 1, 1) * Math.cbrt(Math.max(frac, 1e-9));
    }
  }

  checkCollisions() {
    if (this.qg.mode === 'bounce' || this.qg.mode === 'schrodingerNewton') return;

    const massive = this.massive();
    for (const t of this.bodies) {
      if (t.destroyed) continue;
      for (const m of massive) {
        if (t === m) continue;
        const dx = t.pos[0] - m.pos[0];
        const dy = t.pos[1] - m.pos[1];
        const dz = t.pos[2] - m.pos[2];
        const lim = (t.radius || 0) + m.radius;
        if (dx * dx + dy * dy + dz * dz < lim * lim) {
          if (t.test || t.mass < m.mass) {
            t.destroyed = true;
            t.absorbedBy = m.name;
          }
        }
      }
    }
  }

  analyze(body) {
    if (!body || body.destroyed) {
      return { destroyed: true, absorbedBy: body && body.absorbedBy };
    }
    const p = this.primary();
    if (!p || body === p) {
      return {
        destroyed: false,
        isPrimary: true,
        r: 0, v: Math.hypot(body.vel[0], body.vel[1], body.vel[2]),
        forceN: 0, accelMs2: Math.hypot(body.acc[0], body.acc[1], body.acc[2]) * 1000,
        elements: null,
        qgMode: this.qg.mode,
        mass: body.mass,
      };
    }
    const pos = [
      body.pos[0] - p.pos[0],
      body.pos[1] - p.pos[1],
      body.pos[2] - p.pos[2],
    ];
    const vel = [
      body.vel[0] - p.vel[0],
      body.vel[1] - p.vel[1],
      body.vel[2] - p.vel[2],
    ];
    const mu = this.G * p.mass;
    const el = orbitalElements(pos, vel, mu);
    const r = el.r;
    const forceMag = body.mass > 0 && !body.test
      ? (this.G * p.mass * body.mass) / (r ** this.exponent) * 1000
      : (this.G * p.mass * 1) / (r ** this.exponent) * 1000;
    const accelMs2 = Math.hypot(body.acc[0], body.acc[1], body.acc[2]) * 1000;
    const classical = (!this.qg.mode || this.qg.mode === 'none') && Math.abs(this.exponent - 2) < 1e-9;
    return {
      destroyed: false,
      isPrimary: false,
      pos, vel,
      r: el.r,
      v: el.v,
      forceN: forceMag,
      accelMs2,
      elements: el,
      exponent: this.exponent,
      newtonian: classical,
      qgMode: this.qg.mode,
      qgLabel: qgLabel(this.qg),
    };
  }

  samplePotential(halfExtent, res) {
    const vals = new Float64Array(res * res);
    let min = Infinity, max = -Infinity;
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = -halfExtent + (2 * halfExtent * i) / (res - 1);
        const y = -halfExtent + (2 * halfExtent * j) / (res - 1);
        const phi = potentialAt([x, y, 0], this.bodies, this.G, this.exponent, this.qg);
        vals[j * res + i] = phi;
        if (phi < min) min = phi;
        if (phi > max) max = phi;
      }
    }
    return { vals, min, max, halfExtent, res };
  }
}
