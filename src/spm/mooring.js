// Single Point Mooring (SPM) catenary mechanics.
//
// Modular SPM Mooring Module (client spec §4.1): quasi-static catenary analysis
// of the subsea array. Runs stand-alone (static displacement / equilibrium) or
// coupled into a time-domain buoy integrator. Supports asymmetric maintenance
// states: up to 2 chains OFF for disconnect / inspection / reconnect.
//
// Units: meters, kilograms, Newtons, seconds. w = submerged chain weight (N/m).
// Horizontal plane: F_X along +x, F_Y along +z (scene Y is vertical).

const G = 9.80665;
const RHO_WATER = 1025;
const RHO_AIR = 1.225;
const STEEL_BUOYANCY = 1 - RHO_WATER / 7850; // submerged weight factor ~0.869
const MAX_OFF_CHAINS = 2;

// Solve one mooring line.
//   h : vertical distance stopper to seabed (m)
//   X : horizontal distance stopper to pile (m)
//   L : total chain length (m)
//   w : submerged weight per meter (N/m)
// Returns geometry and loads at the stopper.
export function solveCatenary(h, X, L, w) {
  const chord = Math.hypot(X, h);

  if (L <= chord) {
    const angle = Math.atan2(h, X);
    const angleDeg = angle * 180 / Math.PI;
    return {
      mode: 'taut', a: null,
      H: Infinity, V: Infinity, T: Infinity,
      angleDeg,
      touchdownAngleDeg: angleDeg,
      suspended: L, grounded: 0,
      touchdownFromPile: 0, touchdownFromStopper: X,
    };
  }

  // Excess chain on seabed: X <= L - h
  if (X <= L - h + 1e-9) {
    const a = 1e-4;
    const xs = a * Math.acosh(1 + h / a);
    const s = Math.sqrt(h * (h + 2 * a));
    const H = w * a;
    const V = w * s;
    return {
      mode: 'grounded', a,
      H, V, T: Math.hypot(H, V),
      angleDeg: Math.atan2(V, H) * 180 / Math.PI,
      touchdownAngleDeg: 0,
      suspended: s,
      grounded: L - s,
      touchdownFromPile: Math.max(0, X - xs),
      touchdownFromStopper: xs,
    };
  }

  // Case A: partially grounded
  const aMax = (L * L / h - h) / 2;
  let grounded = null;
  if (aMax > 1e-6 && L > h) {
    const fGround = (a) => {
      const s = Math.sqrt(h * (h + 2 * a));
      return a * Math.acosh(1 + h / a) + (L - s) - X;
    };
    let lo = Math.min(1e-3, aMax * 0.25);
    let hi = aMax;
    let flo = fGround(lo);
    let fhi = fGround(hi);
    if (Number.isFinite(flo) && Number.isFinite(fhi) && flo <= 0 && fhi >= -1e-9) {
      for (let i = 0; i < 90; i++) {
        const mid = 0.5 * (lo + hi);
        if (fGround(mid) >= 0) hi = mid; else lo = mid;
      }
      const a = 0.5 * (lo + hi);
      const s = Math.sqrt(h * (h + 2 * a));
      const xs = a * Math.acosh(1 + h / a);
      const groundedLen = L - s;
      if (groundedLen >= -1e-6 && Math.abs(xs + Math.max(0, groundedLen) - X) < 1e-3) {
        const H = w * a;
        const V = w * s;
        grounded = {
          mode: 'grounded', a,
          H, V, T: Math.hypot(H, V),
          angleDeg: Math.atan2(V, H) * 180 / Math.PI,
          touchdownAngleDeg: 0,
          suspended: s, grounded: Math.max(0, groundedLen),
          touchdownFromPile: Math.max(0, groundedLen),
          touchdownFromStopper: xs,
        };
      }
    }
  }
  if (grounded) return grounded;

  // Case B: fully suspended
  const k = Math.sqrt(Math.max(L * L - h * h, 1e-9));
  const fSusp = (a) => 2 * a * Math.sinh(X / (2 * a)) - k;
  let lo = 1e-6, hi = 1e8;
  for (let i = 0; i < 90; i++) {
    const mid = 0.5 * (lo + hi);
    if (fSusp(mid) >= 0) lo = mid; else hi = mid;
  }
  const a = 0.5 * (lo + hi);
  const xOff = a * Math.atanh(Math.min(h / L, 0.999999));
  const x2 = X / 2 + xOff;
  const x1 = x2 - X;
  const H = w * a;
  const V = w * a * Math.sinh(x2 / a);
  const anchorAngleDeg = Math.atan(Math.sinh(x1 / a)) * 180 / Math.PI;
  return {
    mode: 'suspended', a,
    H, V, T: Math.hypot(H, V),
    angleDeg: Math.atan2(V, H) * 180 / Math.PI,
    touchdownAngleDeg: Math.abs(anchorAngleDeg),
    suspended: L, grounded: 0,
    touchdownFromPile: 0, touchdownFromStopper: X,
    x1, x2,
    anchorAngleDeg,
  };
}

const OFFLINE_SOL = {
  mode: 'offline', a: null,
  H: 0, V: 0, T: 0,
  angleDeg: 0, touchdownAngleDeg: 0,
  suspended: 0, grounded: 0,
  touchdownFromPile: 0, touchdownFromStopper: 0,
};

export function chainProfile(sol, h, X, L, segments = 44) {
  const pts = [];
  if (!sol || sol.mode === 'offline') {
    for (let i = 0; i <= segments; i++) pts.push([0, 0]);
    return pts;
  }
  if (sol.mode === 'taut') {
    for (let i = 0; i <= segments; i++) {
      pts.push([X * i / segments, h * i / segments]);
    }
    return pts;
  }
  if (sol.mode === 'grounded') {
    const gLen = sol.grounded;
    const xs = sol.touchdownFromStopper;
    const a = sol.a;
    const groundSegs = Math.max(2, Math.round(segments * gLen / L));
    for (let i = 0; i <= groundSegs; i++) {
      pts.push([gLen * i / groundSegs, 0]);
    }
    const suspSegs = segments - groundSegs;
    for (let i = 1; i <= suspSegs; i++) {
      const x = xs * i / suspSegs;
      pts.push([gLen + x, a * (Math.cosh(x / a) - 1)]);
    }
    return pts;
  }
  const { a, x1 } = sol;
  const y1 = a * Math.cosh(x1 / a);
  for (let i = 0; i <= segments; i++) {
    const x = x1 + X * i / segments;
    pts.push([X * i / segments, a * Math.cosh(x / a) - y1]);
  }
  return pts;
}

function waveNumber(omega, depth) {
  let k = omega * omega / G;
  for (let i = 0; i < 6; i++) {
    k = omega * omega / (G * Math.tanh(k * depth));
  }
  return k;
}

export class MooringSim {
  constructor() {
    this.params = {
      buoyD: 12, buoyH: 6, buoyMass: 180000, depth: 30,
      pileDist: 300, chainLen: 315, chainW: 250, mbl: 5000,
      windU: 12, windDir: 0, curU: 0.8, curDir: 30, hs: 2, tp: 9,
    };
    this.nChains = 6;
    // Status array: true = ON (in service), false = OFF (maintenance)
    this.chainOn = Array(this.nChains).fill(true);
    // 'coupled' = time-domain buoy ODE; 'standalone' = static analysis at fixed buoy pose
    this.mode = 'coupled';
    this.t = 0;
    this.playing = true;
    this.buoy = { x: 0, z: 0, vx: 0, vz: 0, heave: 0 };
    this.chains = [];
    this.lastForce = { Fx: 0, Fy: 0, Fx_kN: 0, Fy_kN: 0 };
    this.rebuild();
  }

  setParam(key, value) {
    this.params[key] = value;
    if (key === 'pileDist' || key === 'buoyD' || key === 'depth') this.rebuild();
  }

  setMode(mode) {
    this.mode = mode === 'standalone' ? 'standalone' : 'coupled';
    if (this.mode === 'standalone') {
      this.buoy.vx = 0;
      this.buoy.vz = 0;
      this.refreshStatic();
    }
  }

  // Toggle leg i. At most MAX_OFF_CHAINS may be OFF at once.
  setChainOn(i, on) {
    if (i < 0 || i >= this.nChains) return false;
    if (on) {
      this.chainOn[i] = true;
    } else {
      const offCount = this.chainOn.filter((v) => !v).length;
      if (this.chainOn[i] && offCount >= MAX_OFF_CHAINS) return false;
      this.chainOn[i] = false;
    }
    if (this.mode === 'standalone') this.refreshStatic();
    return true;
  }

  chainStatus() {
    return this.chainOn.map((on, i) => ({
      leg: i + 1,
      status: on ? 'ON' : 'OFF (Maintenance)',
      on,
    }));
  }

  offCount() {
    return this.chainOn.filter((v) => !v).length;
  }

  rebuild() {
    const p = this.params;
    this.pileR = p.pileDist + p.buoyD / 2;
    this.piles = [];
    for (let i = 0; i < this.nChains; i++) {
      const ang = (i * 60) * Math.PI / 180;
      this.piles.push({ x: Math.cos(ang) * this.pileR, z: Math.sin(ang) * this.pileR, ang });
    }
  }

  reset() {
    this.buoy = { x: 0, z: 0, vx: 0, vz: 0, heave: 0 };
    this.t = 0;
    if (this.mode === 'standalone') this.refreshStatic();
  }

  waveComponents() {
    const p = this.params;
    const key = `${p.hs}|${p.tp}|${p.windDir}|${p.depth}`;
    if (this._compKey === key) return this._comps;
    this._compKey = key;
    if (p.hs <= 0) { this._comps = []; return this._comps; }
    const dir = p.windDir * Math.PI / 180;
    const cx = Math.cos(dir), cz = Math.sin(dir);
    const w1 = 2 * Math.PI / p.tp;
    const k1 = waveNumber(w1, p.depth);
    const w2 = w1 * 1.35, k2 = waveNumber(w2, p.depth);
    const w3 = w1 * 0.75, k3 = waveNumber(w3, p.depth);
    const A = p.hs / 2;
    this._comps = [
      { kx: k1 * cx, kz: k1 * cz, w: w1, amp: A * 0.75, ph: 0 },
      { kx: k2 * (cx - 0.3 * cz), kz: k2 * (cz + 0.3 * cx), w: w2, amp: A * 0.30, ph: 1.7 },
      { kx: k3 * (cx + 0.4 * cz), kz: k3 * (cz - 0.4 * cx), w: w3, amp: A * 0.22, ph: 4.0 },
    ];
    return this._comps;
  }

  surface(x, z, t) {
    let eta = 0;
    for (const c of this.waveComponents()) {
      eta += c.amp * Math.sin(c.kx * x + c.kz * z - c.w * t + c.ph);
    }
    return eta;
  }

  submergedW() {
    return this.params.chainW * G * STEEL_BUOYANCY;
  }

  envForce(chains = null) {
    const p = this.params;
    let supportedKg = p.buoyMass;
    if (chains) {
      for (const c of chains) {
        if (!c.enabled) continue;
        if (Number.isFinite(c.sol?.V) && c.sol.V > 0) supportedKg += c.sol.V / G;
      }
    }
    const area = Math.PI * (p.buoyD / 2) ** 2;
    const draftIdeal = supportedKg / (RHO_WATER * Math.max(area, 1e-6));
    const draft = Math.min(Math.max(draftIdeal, 0.4), p.buoyH - 0.4);
    const freeboard = Math.max(p.buoyH - draft, 0.2);
    const wd = p.windDir * Math.PI / 180;
    const cd = p.curDir * Math.PI / 180;
    const Fwind = 0.5 * RHO_AIR * 1.0 * (p.buoyD * freeboard) * p.windU * p.windU;
    const Fcur = 0.5 * RHO_WATER * 0.9 * (p.buoyD * draft) * p.curU * p.curU;
    const Fdrift = 0.125 * RHO_WATER * G * p.hs * p.hs * p.buoyD * 0.5;
    return {
      x: Fwind * Math.cos(wd) + Fdrift * Math.cos(wd) + Fcur * Math.cos(cd),
      z: Fwind * Math.sin(wd) + Fdrift * Math.sin(wd) + Fcur * Math.sin(cd),
      wind: Fwind, current: Fcur, drift: Fdrift,
      draft, freeboard, supportedKg,
    };
  }

  // Net global restoring force (F_X, F_Y) from active chains on the buoy centre.
  // Positive components pull the buoy toward +x / +z (toward piles in those dirs).
  restoringForce(chains = null) {
    const list = chains || this.lastChains || this.solveChains();
    const p = this.params;
    let Fx = 0, Fy = 0;
    for (const c of list) {
      if (!c.enabled) continue;
      const H = Number.isFinite(c.sol.H)
        ? Math.min(c.sol.H, p.mbl * 1000 * 2)
        : p.mbl * 1000 * 2;
      Fx += c.ux * H;
      Fy += c.uz * H;
    }
    this.lastForce = { Fx, Fy, Fx_kN: Fx / 1000, Fy_kN: Fy / 1000 };
    return this.lastForce;
  }

  solveChains() {
    const p = this.params;
    const w = this.submergedW();
    const rBuoy = p.buoyD / 2;
    const out = [];
    for (let i = 0; i < this.piles.length; i++) {
      const pile = this.piles[i];
      const enabled = this.chainOn[i];
      const dx = pile.x - this.buoy.x;
      const dz = pile.z - this.buoy.z;
      const dist = Math.hypot(dx, dz) || 1e-9;
      const ux = dx / dist, uz = dz / dist;
      const sx = this.buoy.x + ux * rBuoy;
      const sz = this.buoy.z + uz * rBuoy;
      const X = Math.max(1, Math.hypot(pile.x - sx, pile.z - sz));
      const h = Math.max(1, p.depth + (this.mode === 'standalone' ? 0 : this.surface(sx, sz, this.t)));

      if (!enabled) {
        out.push({
          sol: { ...OFFLINE_SOL },
          X, h, sx, sz, ux, uz, pile,
          touchdownFromCenter: NaN,
          enabled: false,
          index: i,
        });
        continue;
      }

      const sol = solveCatenary(h, X, p.chainLen, w);
      // TD on the pile→stopper line, touchdownFromPile from the pile
      let touchdownFromCenter = NaN;
      if (sol.mode === 'grounded' && sol.touchdownFromPile > 1e-6) {
        const px = (sx - pile.x) / X;
        const pz = (sz - pile.z) / X;
        const tdx = pile.x + px * sol.touchdownFromPile;
        const tdz = pile.z + pz * sol.touchdownFromPile;
        touchdownFromCenter = Math.hypot(tdx - this.buoy.x, tdz - this.buoy.z);
      }
      out.push({
        sol, X, h, sx, sz, ux, uz, pile,
        touchdownFromCenter,
        enabled: true,
        index: i,
      });
    }
    return out;
  }

  // Stand-alone: recompute tensions / restoring force at the current buoy pose
  refreshStatic() {
    this.buoy.heave = 0;
    this.lastChains = this.solveChains();
    this.lastEnv = this.envForce(this.lastChains);
    this.restoringForce(this.lastChains);
    return this.lastChains;
  }

  // Set buoy position for stand-alone queries (static displacement)
  setDisplacement(x, z) {
    this.buoy.x = x;
    this.buoy.z = z;
    this.buoy.vx = 0;
    this.buoy.vz = 0;
    return this.refreshStatic();
  }

  // Relax buoy under env + chain restoring until net force is near zero.
  // Used after disconnecting legs to find the new asymmetric equilibrium offset.
  findEquilibrium({ maxIter = 200, tolN = 80 } = {}) {
    const p = this.params;
    const nOn = Math.max(1, this.chainOn.filter(Boolean).length);
    // Softer steps when fewer legs are active (asymmetric maintenance)
    const k = 8e3 * nOn;
    const lim = p.pileDist * 0.28;
    for (let iter = 0; iter < maxIter; iter++) {
      const chains = this.solveChains();
      const env = this.envForce(chains);
      const rest = this.restoringForce(chains);
      const fx = env.x + rest.Fx;
      const fz = env.z + rest.Fy;
      const net = Math.hypot(fx, fz);
      if (net < tolN) {
        this.lastChains = chains;
        this.lastEnv = env;
        return { x: this.buoy.x, z: this.buoy.z, Fx: rest.Fx, Fy: rest.Fy, iters: iter, converged: true };
      }
      // Cap step so we do not overshoot into taut geometry
      let dx = fx / k;
      let dz = fz / k;
      const step = Math.hypot(dx, dz);
      const maxStep = 1.5;
      if (step > maxStep) {
        dx *= maxStep / step;
        dz *= maxStep / step;
      }
      this.buoy.x += dx;
      this.buoy.z += dz;
      const r = Math.hypot(this.buoy.x, this.buoy.z);
      if (r > lim) {
        this.buoy.x *= lim / r;
        this.buoy.z *= lim / r;
      }
    }
    this.refreshStatic();
    return {
      x: this.buoy.x, z: this.buoy.z,
      Fx: this.lastForce.Fx, Fy: this.lastForce.Fy,
      iters: maxIter, converged: false,
    };
  }

  step(dt) {
    if (this.mode === 'standalone') {
      this.refreshStatic();
      return this.lastChains;
    }
    if (!this.playing) {
      this.refreshStatic();
      return this.lastChains;
    }
    const p = this.params;
    const sub = Math.max(1, Math.ceil(dt / 0.05));
    const hdt = dt / sub;
    let env = null;

    for (let s = 0; s < sub; s++) {
      const chains = this.solveChains();
      env = this.envForce(chains);
      const disp = RHO_WATER * Math.PI * (p.buoyD / 2) ** 2 * env.draft;
      const mEff = Math.max(p.buoyMass, 1e3) + disp;
      const damp = 0.35 * Math.sqrt(mEff * 2e3) + 2e4;

      const rest = this.restoringForce(chains);
      let fx = env.x + rest.Fx;
      let fz = env.z + rest.Fy;

      this.buoy.vx += (fx - damp * this.buoy.vx) / mEff * hdt;
      this.buoy.vz += (fz - damp * this.buoy.vz) / mEff * hdt;
      this.buoy.x += this.buoy.vx * hdt;
      this.buoy.z += this.buoy.vz * hdt;
      this.t += hdt;
    }
    this.buoy.heave = this.surface(this.buoy.x, this.buoy.z, this.t);
    this.lastChains = this.solveChains();
    this.lastEnv = this.envForce(this.lastChains);
    this.restoringForce(this.lastChains);
    return this.lastChains;
  }

  // Flat CSV for structural engineering export (client §2)
  toCSV() {
    const chains = this.lastChains || this.solveChains();
    const force = this.restoringForce(chains);
    const env = this.lastEnv || this.envForce(chains);
    const lines = [];
    lines.push('# SPM Mooring Module export');
    lines.push(`# t_s,${this.t.toFixed(3)}`);
    lines.push(`# mode,${this.mode}`);
    lines.push(`# buoy_x_m,${this.buoy.x.toFixed(4)}`);
    lines.push(`# buoy_z_m,${this.buoy.z.toFixed(4)}`);
    lines.push(`# F_X_N,${force.Fx.toFixed(1)}`);
    lines.push(`# F_Y_N,${force.Fy.toFixed(1)}`);
    lines.push(`# F_X_kN,${force.Fx_kN.toFixed(3)}`);
    lines.push(`# F_Y_kN,${force.Fy_kN.toFixed(3)}`);
    lines.push(`# env_wind_N,${env.wind.toFixed(1)}`);
    lines.push(`# env_current_N,${env.current.toFixed(1)}`);
    lines.push(`# env_drift_N,${env.drift.toFixed(1)}`);
    lines.push(`# draft_m,${env.draft.toFixed(3)}`);
    lines.push('leg,status,angle_deg,span_m,depth_m,mode,H_kN,V_kN,T_kN,T_t,angle_stopper_deg,angle_td_deg,td_from_pile_m,td_from_center_m,grounded_m');
    for (const c of chains) {
      const s = c.sol;
      const taut = !Number.isFinite(s.T);
      const T_kN = taut ? '' : (s.T / 1000).toFixed(2);
      const T_t = taut ? 'TAUT' : (s.T / 9806.65).toFixed(2);
      const H_kN = Number.isFinite(s.H) ? (s.H / 1000).toFixed(2) : '';
      const V_kN = Number.isFinite(s.V) ? (s.V / 1000).toFixed(2) : '';
      const tdC = Number.isFinite(c.touchdownFromCenter) ? c.touchdownFromCenter.toFixed(2) : '';
      lines.push([
        c.index + 1,
        c.enabled ? 'ON' : 'OFF',
        (c.pile.ang * 180 / Math.PI).toFixed(0),
        c.X.toFixed(2),
        c.h.toFixed(2),
        s.mode,
        H_kN,
        V_kN,
        taut ? 'Inf' : T_kN,
        T_t,
        Number.isFinite(s.angleDeg) ? s.angleDeg.toFixed(2) : '',
        Number.isFinite(s.touchdownAngleDeg) ? s.touchdownAngleDeg.toFixed(2) : '',
        Number.isFinite(s.touchdownFromPile) ? s.touchdownFromPile.toFixed(2) : '',
        tdC,
        Number.isFinite(s.grounded) ? s.grounded.toFixed(2) : '',
      ].join(','));
    }
    return lines.join('\n');
  }
}
