// Direct N-body gravity integrator for experiment mode.
//
// Works in km, km/s and kg on ecliptic scene axes. Integrates the Sun, the
// planets, Pluto, Ceres and Halley with a symplectic leapfrog (kick-drift-kick)
// scheme, which conserves orbital energy well over long spans. Substeps adapt
// down when the user cranks G or a body's mass so tight fast orbits stay stable.
// Collisions merge the smaller body into the larger one, conserving momentum.

import { G_KM } from './constants.js';

const MAX_SUBSTEPS_PER_CALL = 6000;

export class NBodySim {
  constructor() {
    this.bodies = [];
    this.byId = new Map();
    this.gMul = 1;
  }

  // entries: [{ id, name, massKg, radiusKm, posKm: [x,y,z], velKmS: [x,y,z] }]
  seed(entries, preserveMuls = true) {
    const oldMuls = new Map();
    if (preserveMuls) for (const b of this.bodies) oldMuls.set(b.id, b.massMul);
    this.bodies = entries.map((e) => ({
      id: e.id,
      name: e.name,
      baseMassKg: e.massKg || 1,
      massMul: oldMuls.get(e.id) ?? 1,
      bonusKg: 0,
      radiusKm: e.radiusKm || 1,
      pos: Float64Array.from(e.posKm),
      prev: Float64Array.from(e.posKm),
      vel: Float64Array.from(e.velKmS),
      acc: new Float64Array(3),
      destroyed: false,
      absorbedBy: null,
    }));
    this.byId = new Map(this.bodies.map((b) => [b.id, b]));
    this.zeroMomentum();
  }

  effMass(b) {
    return b.baseMassKg * b.massMul + b.bonusKg;
  }

  zeroMomentum() {
    let m = 0;
    const p = [0, 0, 0];
    for (const b of this.bodies) {
      if (b.destroyed) continue;
      const mb = this.effMass(b);
      m += mb;
      for (let k = 0; k < 3; k++) p[k] += mb * b.vel[k];
    }
    if (!m) return;
    for (const b of this.bodies) {
      for (let k = 0; k < 3; k++) b.vel[k] -= p[k] / m;
    }
  }

  setMassMul(id, mul) {
    const b = this.byId.get(id);
    if (b) b.massMul = mul;
  }

  getMassMul(id) {
    const b = this.byId.get(id);
    return b ? b.massMul : 1;
  }

  // mode: 'halt' | 'reverse' | numeric velocity factor, relative to the Sun
  kick(id, mode) {
    const b = this.byId.get(id);
    if (!b || b.destroyed) return;
    const sun = this.byId.get('sun');
    const ref = sun && !sun.destroyed ? sun.vel : [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const vr = b.vel[k] - ref[k];
      if (mode === 'halt') b.vel[k] = ref[k];
      else if (mode === 'reverse') b.vel[k] = ref[k] - vr;
      else b.vel[k] = ref[k] + vr * mode;
    }
  }

  computeAccels() {
    const bs = this.bodies;
    const G = G_KM * this.gMul;
    for (const b of bs) b.acc.fill(0);
    if (!G) return;
    for (let i = 0; i < bs.length; i++) {
      const bi = bs[i];
      if (bi.destroyed) continue;
      const mi = this.effMass(bi);
      for (let j = i + 1; j < bs.length; j++) {
        const bj = bs[j];
        if (bj.destroyed) continue;
        const dx = bj.pos[0] - bi.pos[0];
        const dy = bj.pos[1] - bi.pos[1];
        const dz = bj.pos[2] - bi.pos[2];
        const r2 = dx * dx + dy * dy + dz * dz + 1; // 1 km^2 softening
        const inv = 1 / (r2 * Math.sqrt(r2));
        const mj = this.effMass(bj);
        const si = G * mj * inv;
        const sj = G * mi * inv;
        bi.acc[0] += dx * si; bi.acc[1] += dy * si; bi.acc[2] += dz * si;
        bj.acc[0] -= dx * sj; bj.acc[1] -= dy * sj; bj.acc[2] -= dz * sj;
      }
    }
  }

  // Advance by dtSec (negative runs time backwards).
  // Returns { events, consumedSec }: consumedSec can fall short of dtSec when
  // the per-call substep budget saturates; the caller rewinds the clock by the
  // shortfall so displayed time never outruns the integration.
  step(dtSec) {
    const events = [];
    if (!dtSec || !this.bodies.length) return { events, consumedSec: 0 };
    const dir = Math.sign(dtSec);
    let remaining = Math.abs(dtSec);
    let consumed = 0;

    // shrink the base substep when heavy multipliers make orbits tight and fast
    let peak = this.gMul;
    for (const b of this.bodies) {
      if (!b.destroyed) peak = Math.max(peak, this.gMul * b.massMul);
    }
    const base = Math.min(10800, Math.max(450, 10800 / Math.sqrt(Math.max(1, peak / 20))));

    let guard = 0;
    while (remaining > 1e-6 && guard++ < MAX_SUBSTEPS_PER_CALL) {
      // shrink the step near genuinely approaching close pairs; the swept
      // collision test below still catches anything that slips through
      let minTime = Infinity;
      const bs = this.bodies;
      for (let i = 0; i < bs.length; i++) {
        const bi = bs[i];
        if (bi.destroyed) continue;
        for (let j = i + 1; j < bs.length; j++) {
          const bj = bs[j];
          if (bj.destroyed) continue;
          const dx = bj.pos[0] - bi.pos[0];
          const dy = bj.pos[1] - bi.pos[1];
          const dz = bj.pos[2] - bi.pos[2];
          const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const gap = r - (bi.radiusKm + bj.radiusKm);
          if (gap <= 0 || r === 0) continue;
          // relative speed magnitude: the gap cannot shrink faster than this,
          // co-moving pairs contribute nothing, and a flyby at periapsis
          // (radial speed zero, tangential speed peaked) still forces small
          // steps, which the leapfrog needs there for accuracy
          const closing = Math.hypot(
            bj.vel[0] - bi.vel[0],
            bj.vel[1] - bi.vel[1],
            bj.vel[2] - bi.vel[2]
          ) + 1e-9;
          const t = gap / closing;
          if (t < minTime) minTime = t;
        }
      }
      const h = Math.min(remaining, Math.max(60, Math.min(base, minTime * 0.2))) * dir;

      this.computeAccels();
      for (const b of this.bodies) {
        if (b.destroyed) continue;
        for (let k = 0; k < 3; k++) {
          b.prev[k] = b.pos[k];
          b.vel[k] += b.acc[k] * h * 0.5;
          b.pos[k] += b.vel[k] * h;
        }
      }
      this.computeAccels();
      for (const b of this.bodies) {
        if (b.destroyed) continue;
        for (let k = 0; k < 3; k++) b.vel[k] += b.acc[k] * h * 0.5;
      }
      remaining -= Math.abs(h);
      consumed += Math.abs(h);
      this.checkCollisions(events);
    }
    return { events, consumedSec: consumed * dir };
  }

  // Swept collision test: checks the closest approach of the straight relative
  // path traveled during the last substep, so fast bodies cannot tunnel through
  // a target between endpoint samples.
  checkCollisions(events) {
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const bi = bs[i];
      if (bi.destroyed) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const bj = bs[j];
        if (bj.destroyed) continue;
        const r0x = bi.prev[0] - bj.prev[0];
        const r0y = bi.prev[1] - bj.prev[1];
        const r0z = bi.prev[2] - bj.prev[2];
        const dx = (bi.pos[0] - bj.pos[0]) - r0x;
        const dy = (bi.pos[1] - bj.pos[1]) - r0y;
        const dz = (bi.pos[2] - bj.pos[2]) - r0z;
        const len2 = dx * dx + dy * dy + dz * dz;
        let t = 0;
        if (len2 > 0) t = Math.min(Math.max(-(r0x * dx + r0y * dy + r0z * dz) / len2, 0), 1);
        const cx = r0x + t * dx, cy = r0y + t * dy, cz = r0z + t * dz;
        const closest = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (closest >= bi.radiusKm + bj.radiusKm) continue;
        // the sun always survives; otherwise the heavier body wins
        let win = bi, lose = bj;
        if (bj.id === 'sun' || (bi.id !== 'sun' && this.effMass(bj) > this.effMass(bi))) {
          win = bj; lose = bi;
        }
        const mw = this.effMass(win);
        const ml = this.effMass(lose);
        for (let k = 0; k < 3; k++) {
          win.vel[k] = (mw * win.vel[k] + ml * lose.vel[k]) / (mw + ml);
        }
        win.bonusKg += ml;
        lose.destroyed = true;
        lose.absorbedBy = win.id;
        events.push({ lost: lose.id, lostName: lose.name, into: win.id, intoName: win.name });
        // a destroyed bi must not merge into anything else this pass
        if (lose === bi) break;
      }
    }
  }

  // effective-to-base mass ratio, including mass gained through mergers
  effMassRatio(id) {
    const b = this.byId.get(id);
    return b ? this.effMass(b) / b.baseMassKg : 1;
  }

  state(id) {
    return this.byId.get(id) || null;
  }
}
