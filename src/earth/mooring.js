// Single Point Mooring (SPM) catenary mechanics.
//
// Quasi-static catenary analysis, the standard first-pass method for mooring
// design: at each instant every chain is solved as a catenary in the vertical
// plane through its stopper and pile, given the current horizontal span. The
// buoy itself is dynamic: wind, current and mean wave-drift forces move it,
// the chains answer with their horizontal tensions.
//
// Units: meters, kilograms, Newtons, seconds. w = submerged chain weight (N/m).

const G = 9.80665;
const RHO_WATER = 1025;
const RHO_AIR = 1.225;
const STEEL_BUOYANCY = 1 - RHO_WATER / 7850; // submerged weight factor ~0.869

// Solve one mooring line.
//   h : vertical distance stopper to seabed (m)
//   X : horizontal distance stopper to pile (m)
//   L : total chain length (m)
//   w : submerged weight per meter (N/m)
// Returns geometry and loads at the stopper.
export function solveCatenary(h, X, L, w) {
  const chord = Math.hypot(X, h);

  if (L <= chord) {
    // chain physically cannot go taut-straight without stretch: report taut
    const angle = Math.atan2(h, X);
    const angleDeg = angle * 180 / Math.PI;
    return {
      mode: 'taut', a: null,
      H: Infinity, V: Infinity, T: Infinity,
      angleDeg,
      // No grounded lift-off: report pile-end angle (same as chord for taut)
      touchdownAngleDeg: angleDeg,
      suspended: L, grounded: 0,
      touchdownFromPile: 0, touchdownFromStopper: X,
    };
  }

  // Case A: partially grounded. Suspended span xs = a*acosh(1 + h/a),
  // suspended length s = sqrt(h(h+2a)), and X = xs + (L - s).
  const fGround = (a) => a * Math.acosh(1 + h / a) + (L - Math.sqrt(h * (h + 2 * a))) - X;
  // grounded solutions exist while the anchor-side length stays on the seabed
  let lo = 1e-6, hi = 1e8, grounded = null;
  if (fGround(lo) <= 0 && fGround(hi) >= 0) {
    for (let i = 0; i < 90; i++) {
      const mid = 0.5 * (lo + hi);
      if (fGround(mid) >= 0) hi = mid; else lo = mid;
    }
    const a = 0.5 * (lo + hi);
    const s = Math.sqrt(h * (h + 2 * a));
    if (s <= L + 1e-9) {
      const xs = a * Math.acosh(1 + h / a);
      const H = w * a;
      const V = w * s;
      grounded = {
        mode: 'grounded', a,
        H, V, T: Math.hypot(H, V),
        angleDeg: Math.atan2(V, H) * 180 / Math.PI,
        // Ideal catenary leaves the seabed horizontally at the touchdown
        touchdownAngleDeg: 0,
        suspended: s, grounded: L - s,
        touchdownFromPile: L - s,
        touchdownFromStopper: xs,
      };
    }
  }
  if (grounded) return grounded;

  // Case B: fully suspended between pile and stopper.
  // sqrt(L^2 - h^2) = 2a sinh(X / 2a), solved for a.
  const k = Math.sqrt(Math.max(L * L - h * h, 1e-9));
  const fSusp = (a) => 2 * a * Math.sinh(X / (2 * a)) - k;
  // fSusp decreases with a; large a -> 2a*(X/2a) = X - k (< 0 since k > X here)
  lo = 1e-6; hi = 1e8;
  for (let i = 0; i < 90; i++) {
    const mid = 0.5 * (lo + hi);
    if (fSusp(mid) >= 0) lo = mid; else hi = mid;
  }
  const a = 0.5 * (lo + hi);
  const xOff = a * Math.atanh(Math.min(h / L, 0.999999)); // catenary midpoint offset
  const x2 = X / 2 + xOff;  // stopper side, relative to the vertex
  const x1 = x2 - X;        // pile side
  const H = w * a;
  const V = w * a * Math.sinh(x2 / a);
  const anchorAngleDeg = Math.atan(Math.sinh(x1 / a)) * 180 / Math.PI;
  return {
    mode: 'suspended', a,
    H, V, T: Math.hypot(H, V),
    angleDeg: Math.atan2(V, H) * 180 / Math.PI,
    // No seabed rest: report angle at the pile (seabed connection)
    touchdownAngleDeg: Math.abs(anchorAngleDeg),
    suspended: L, grounded: 0,
    touchdownFromPile: 0, touchdownFromStopper: X,
    x1, x2,
    anchorAngleDeg,
  };
}

// Sample the chain shape in its vertical plane for rendering.
// Returns points as [along, up] pairs: along measured from the pile (0)
// toward the stopper (X), up measured from the seabed (0) to the stopper (h).
export function chainProfile(sol, h, X, L, segments = 44) {
  const pts = [];
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
      const x = xs * i / suspSegs; // from touchdown toward stopper
      pts.push([gLen + x, a * (Math.cosh(x / a) - 1)]);
    }
    return pts;
  }
  // fully suspended: y(x) relative to the pile end
  const { a, x1 } = sol;
  const y1 = a * Math.cosh(x1 / a);
  for (let i = 0; i <= segments; i++) {
    const x = x1 + X * i / segments;
    pts.push([X * i / segments, a * Math.cosh(x / a) - y1]);
  }
  return pts;
}

// linear wave dispersion: solve k from omega^2 = g k tanh(k d)
function waveNumber(omega, depth) {
  let k = omega * omega / G; // deep-water start
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
    this.t = 0;
    this.playing = true;
    this.buoy = { x: 0, z: 0, vx: 0, vz: 0, heave: 0 };
    this.chains = [];
    this.rebuild();
  }

  setParam(key, value) {
    this.params[key] = value;
    if (key === 'pileDist' || key === 'buoyD' || key === 'depth') this.rebuild();
  }

  rebuild() {
    const p = this.params;
    // piles sit so the span equals pileDist when the buoy is centered
    // (stoppers are mounted on the buoy rim)
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
  }

  // three directional components of the design sea, memoized on the relevant
  // params so the per-vertex water mesh loop stays cheap
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

  // sea surface elevation at a point
  surface(x, z, t) {
    let eta = 0;
    for (const c of this.waveComponents()) {
      eta += c.amp * Math.sin(c.kx * x + c.kz * z - c.w * t + c.ph);
    }
    return eta;
  }

  submergedW() {
    return this.params.chainW * G * STEEL_BUOYANCY; // N/m
  }

  envForce() {
    const p = this.params;
    // Floating draft from buoy weight vs waterplane buoyancy (clamped to hull)
    const area = Math.PI * (p.buoyD / 2) ** 2;
    const draftIdeal = p.buoyMass / (RHO_WATER * Math.max(area, 1e-6));
    const draft = Math.min(Math.max(draftIdeal, 0.4), p.buoyH - 0.4);
    const freeboard = p.buoyH - draft;
    const wd = p.windDir * Math.PI / 180;
    const cd = p.curDir * Math.PI / 180;
    const Fwind = 0.5 * RHO_AIR * 1.0 * (p.buoyD * freeboard) * p.windU * p.windU;
    const Fcur = 0.5 * RHO_WATER * 0.9 * (p.buoyD * draft) * p.curU * p.curU;
    // mean wave drift on a vertical cylinder, reflection coefficient ~0.5
    const Fdrift = 0.125 * RHO_WATER * G * p.hs * p.hs * p.buoyD * 0.5;
    return {
      x: Fwind * Math.cos(wd) + Fdrift * Math.cos(wd) + Fcur * Math.cos(cd),
      z: Fwind * Math.sin(wd) + Fdrift * Math.sin(wd) + Fcur * Math.sin(cd),
      wind: Fwind, current: Fcur, drift: Fdrift,
      draft, freeboard,
    };
  }

  // solve all chains for the current buoy position; returns per-chain results
  solveChains() {
    const p = this.params;
    const w = this.submergedW();
    const rBuoy = p.buoyD / 2;
    const out = [];
    for (const pile of this.piles) {
      // stopper on the buoy rim, on the side facing this pile
      const dx = pile.x - this.buoy.x;
      const dz = pile.z - this.buoy.z;
      const dist = Math.hypot(dx, dz);
      const ux = dx / dist, uz = dz / dist;
      const sx = this.buoy.x + ux * rBuoy;
      const sz = this.buoy.z + uz * rBuoy;
      const X = Math.max(1, Math.hypot(pile.x - sx, pile.z - sz));
      const h = p.depth + this.surface(sx, sz, this.t);
      const sol = solveCatenary(h, X, p.chainLen, w);
      out.push({ sol, X, h, sx, sz, ux, uz, pile });
    }
    return out;
  }

  step(dt) {
    if (!this.playing) return;
    const p = this.params;
    const sub = Math.max(1, Math.ceil(dt / 0.05));
    const hdt = dt / sub;
    const env = this.envForce();
    // Structural mass + hydrodynamic added mass (~1× displaced water)
    const disp = RHO_WATER * Math.PI * (p.buoyD / 2) ** 2 * env.draft;
    const mEff = Math.max(p.buoyMass, 1e3) + disp;
    const damp = 0.35 * Math.sqrt(mEff * 2e3) + 2e4; // broad, stable damping

    for (let s = 0; s < sub; s++) {
      const chains = this.solveChains();
      let fx = env.x, fz = env.z;
      for (const c of chains) {
        const H = Number.isFinite(c.sol.H) ? Math.min(c.sol.H, p.mbl * 1000 * 2) : p.mbl * 1000 * 2;
        fx += c.ux * H;
        fz += c.uz * H;
      }
      // semi-implicit Euler with linear damping
      this.buoy.vx += (fx - damp * this.buoy.vx) / mEff * hdt;
      this.buoy.vz += (fz - damp * this.buoy.vz) / mEff * hdt;
      this.buoy.x += this.buoy.vx * hdt;
      this.buoy.z += this.buoy.vz * hdt;
      this.t += hdt;
    }
    this.buoy.heave = this.surface(this.buoy.x, this.buoy.z, this.t);
    this.lastEnv = env;
    this.lastChains = this.solveChains();
    return this.lastChains;
  }
}
