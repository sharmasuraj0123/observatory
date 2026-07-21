// Tug & Hawser (Connection) Module (client spec §4.3).
// Mechanical linkage + active tug control. Stand-alone snap-load tester or
// coupled force provider for the Master Engine.
//
// Hawser: nonlinear spring. Slack → 0 kN; stretch produces taut tension and
// can spike (snap-load) when a line jerks from slack to taut.
// Tug: static pull-back / push at the stern, resolved into force + yaw moment.
// Kinematics: tanker CG → bow fairlead and stern bitt.

const G = 9.80665;

export class HawserTugModule {
  constructor() {
    this.params = {
      // Hawser (nylon/polyester SPM hawser)
      hawserLen: 60,       // m nominal unstretched
      hawserEA: 8e7,       // N  (axial stiffness EA); effective k = EA/L
      hawserN: 1.8,        // nonlinear exponent on strain (nylon-like)
      breakLoad: 2500,     // kN MBL
      // Connection geometry relative to tanker CG
      bowFromCg: 120,      // m forward to bow fairlead
      sternFromCg: 120,    // m aft to stern bitt
      // Tug
      tugForce: 0,         // N (positive = pull-back aft along -surge)
      tugAngleDeg: 180,    // body-frame: 180 = dead astern pull-back
      tugActive: true,
    };
    this.last = {
      tension: 0, stretch: 0, slack: true,
      Fx_spm: 0, Fy_spm: 0,
      Fx_tanker: 0, Fy_tanker: 0, N_tanker: 0,
      tugFx: 0, tugFy: 0, tugN: 0,
      snapped: false,
    };
  }

  setParam(k, v) { this.params[k] = v; }

  // Fairlead / bitt world positions from tanker pose
  fairlead(tx, tz, headingRad) {
    const p = this.params;
    const c = Math.cos(headingRad), s = Math.sin(headingRad);
    return {
      x: tx + c * p.bowFromCg,
      z: tz + s * p.bowFromCg,
    };
  }

  sternBitt(tx, tz, headingRad) {
    const p = this.params;
    const c = Math.cos(headingRad), s = Math.sin(headingRad);
    return {
      x: tx - c * p.sternFromCg,
      z: tz - s * p.sternFromCg,
    };
  }

  // Nonlinear hawser tension from end-to-end distance.
  // Stand-alone: pass distance directly to test snap-load thresholds.
  tensionFromLength(dist) {
    const p = this.params;
    const L0 = p.hawserLen;
    const stretch = dist - L0;
    if (stretch <= 0) {
      return { tension: 0, stretch, slack: true, strain: 0, util: 0 };
    }
    const strain = stretch / L0;
    // T = (EA) * strain^n  (nylon-like stiffening)
    const T = p.hawserEA * Math.pow(strain, p.hawserN);
    const mblN = p.breakLoad * 1000;
    return {
      tension: Math.min(T, mblN * 1.5),
      stretch,
      slack: false,
      strain,
      util: T / mblN,
      broken: T > mblN,
    };
  }

  // Coupled: hawser between SPM attachment (bx,bz) and tanker bow fairlead.
  // Equal-and-opposite tension on SPM and tanker; yaw moment on tanker about CG.
  hawserLoads(bx, bz, tx, tz, headingRad) {
    const fl = this.fairlead(tx, tz, headingRad);
    const dx = fl.x - bx;
    const dz = fl.z - bz;
    const dist = Math.hypot(dx, dz) || 1e-9;
    const ux = dx / dist, uz = dz / dist;
    const ht = this.tensionFromLength(dist);
    const T = ht.tension;
    // Tension pulls tanker toward SPM and SPM toward tanker
    const Fx_t = -ux * T;
    const Fy_t = -uz * T;
    const Fx_s = ux * T;
    const Fy_s = uz * T;
    // Moment arm from CG to fairlead × force
    const rx = fl.x - tx, rz = fl.z - tz;
    const N_t = rx * Fy_t - rz * Fx_t;
    return {
      ...ht,
      dist,
      fairlead: fl,
      Fx_spm: Fx_s, Fy_spm: Fy_s,
      Fx_tanker: Fx_t, Fy_tanker: Fy_t, N_tanker: N_t,
      ux, uz,
    };
  }

  // Tug force at stern bitt → world force + yaw on tanker
  tugLoads(tx, tz, headingRad) {
    const p = this.params;
    if (!p.tugActive || Math.abs(p.tugForce) < 1) {
      return { tugFx: 0, tugFy: 0, tugN: 0, bitt: this.sternBitt(tx, tz, headingRad) };
    }
    const ang = headingRad + p.tugAngleDeg * Math.PI / 180;
    // Body 180° = pull aft (−surge). Force applied at stern bitt.
    const Fx = Math.cos(ang) * p.tugForce;
    const Fy = Math.sin(ang) * p.tugForce;
    const bitt = this.sternBitt(tx, tz, headingRad);
    const rx = bitt.x - tx, rz = bitt.z - tz;
    const N = rx * Fy - rz * Fx;
    return { tugFx: Fx, tugFy: Fy, tugN: N, bitt };
  }

  // Full connection loads at an instant
  loads(bx, bz, tx, tz, headingRad) {
    const h = this.hawserLoads(bx, bz, tx, tz, headingRad);
    const t = this.tugLoads(tx, tz, headingRad);
    this.last = {
      tension: h.tension,
      stretch: h.stretch,
      slack: h.slack,
      strain: h.strain,
      util: h.util || 0,
      broken: !!h.broken,
      dist: h.dist,
      fairlead: h.fairlead,
      Fx_spm: h.Fx_spm,
      Fy_spm: h.Fy_spm,
      Fx_tanker: h.Fx_tanker + t.tugFx,
      Fy_tanker: h.Fy_tanker + t.tugFy,
      N_tanker: h.N_tanker + t.tugN,
      tugFx: t.tugFx,
      tugFy: t.tugFy,
      tugN: t.tugN,
      bitt: t.bitt,
      snapped: !h.slack && h.stretch > 0 && (h.util || 0) > 0.5,
    };
    return this.last;
  }

  // Stand-alone snap-load test: sweep stretch and return tension curve samples
  snapLoadCurve({ maxStretchFrac = 0.25, n = 40 } = {}) {
    const L0 = this.params.hawserLen;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const stretch = (i / n) * maxStretchFrac * L0;
      // include a little slack side
      const dist = L0 + stretch - 0.02 * L0;
      const r = this.tensionFromLength(Math.max(0, dist));
      pts.push({
        dist: Math.max(0, dist),
        stretch: r.stretch,
        tension_kN: r.tension / 1000,
        slack: r.slack,
        util: r.util || 0,
      });
    }
    return pts;
  }
}

export { G };
