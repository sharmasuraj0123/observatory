// Master Physics Engine (client spec §4.4).
// Couples SPM + Tanker + Hawser/Tug into a time-domain 5-DOF simulation:
//   SPM buoy: x, z (2) + Tanker: x, z, ψ (3) = 5 DOF
// State vector (10 values):
//   [xb, zb, vxb, vzb, xt, zt, ψ, vxt, vzt, ω]
// Integrator: adaptive Dormand-Prince RK45 (JS stand-in for scipy solve_ivp).

import { MooringSim } from './mooring.js';
import { TankerModule } from './tanker.js';
import { HawserTugModule } from './hawser.js';

const RHO_WATER = 1025;

// Dormand-Prince 5(4) coefficients
const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];

function axpy(a, x, y) {
  const out = new Float64Array(y.length);
  for (let i = 0; i < y.length; i++) out[i] = a * x[i] + y[i];
  return out;
}

function addScaled(y, scales, ks) {
  const out = new Float64Array(y.length);
  for (let i = 0; i < y.length; i++) {
    let s = y[i];
    for (let j = 0; j < scales.length; j++) s += scales[j] * ks[j][i];
    out[i] = s;
  }
  return out;
}

function errNorm(y5, y4, atol, rtol) {
  let max = 0;
  for (let i = 0; i < y5.length; i++) {
    const sc = atol + rtol * Math.max(Math.abs(y5[i]), Math.abs(y4[i]));
    const e = Math.abs(y5[i] - y4[i]) / Math.max(sc, 1e-15);
    if (e > max) max = e;
  }
  return max;
}

/**
 * Adaptive RK45 step from t → tEnd (or single step if maxStep only).
 * f(t, y) → dydt Float64Array
 */
export function solveIvp(f, t0, y0, tEnd, {
  rtol = 1e-4,
  atol = 1e-6,
  h0 = 0.05,
  hMin = 1e-5,
  hMax = 0.5,
  maxSteps = 20000,
  recordEvery = 0.1,
} = {}) {
  let t = t0;
  let y = Float64Array.from(y0);
  let h = Math.min(h0, Math.abs(tEnd - t0));
  const dir = Math.sign(tEnd - t0) || 1;
  const hist = [{ t, y: Float64Array.from(y) }];
  let lastRecord = t;
  let steps = 0;
  let rejects = 0;

  while (dir * (tEnd - t) > 1e-12 && steps < maxSteps) {
    if (dir * (t + h - tEnd) > 0) h = tEnd - t;
    h = Math.max(hMin, Math.min(hMax, Math.abs(h))) * dir;

    const k = new Array(7);
    k[0] = f(t, y);
    for (let i = 1; i < 7; i++) {
      const yi = Float64Array.from(y);
      for (let j = 0; j < i; j++) {
        const a = A[i][j];
        if (!a) continue;
        for (let m = 0; m < y.length; m++) yi[m] += h * a * k[j][m];
      }
      k[i] = f(t + C[i] * h, yi);
    }

    const y5 = Float64Array.from(y);
    const y4 = Float64Array.from(y);
    for (let j = 0; j < 7; j++) {
      for (let m = 0; m < y.length; m++) {
        y5[m] += h * B5[j] * k[j][m];
        y4[m] += h * B4[j] * k[j][m];
      }
    }

    const err = errNorm(y5, y4, atol, rtol);
    if (err > 1 && Math.abs(h) > hMin * 1.01) {
      // reject: shrink toward violent events (hawser snap / gust)
      h *= Math.max(0.2, 0.9 * Math.pow(1 / err, 0.2));
      rejects++;
      continue;
    }

    t += h;
    y = y5;
    steps++;

    // expand during steady weathervaning
    const factor = err < 1e-12 ? 2 : 0.9 * Math.pow(1 / Math.max(err, 1e-12), 0.2);
    h = Math.min(hMax, Math.abs(h) * Math.min(2, Math.max(0.5, factor))) * dir;

    if (recordEvery > 0 && Math.abs(t - lastRecord) >= recordEvery - 1e-12) {
      hist.push({ t, y: Float64Array.from(y) });
      lastRecord = t;
    }
  }
  if (!hist.length || hist[hist.length - 1].t !== t) {
    hist.push({ t, y: Float64Array.from(y) });
  }
  return { t, y, hist, steps, rejects };
}

export class MasterEngine {
  constructor() {
    this.spm = new MooringSim();
    this.tanker = new TankerModule();
    this.hawser = new HawserTugModule();

    // Disable buoy-local weather when full-coupled (tanker carries env load via hawser)
    // Keep small buoy env for realism
    this.params = {
      enabled: true,       // master coupling on
      tankerEnabled: true,
      hawserEnabled: true,
      buoyDamping: 2e4,
      tankerLinDamp: 5e5,
      tankerYawDamp: 2e9,
    };

    this.t = 0;
    this.playing = true;
    this.mode = 'coupled'; // 'coupled' | modules run via engine; standalone handled per-module
    this.vizMode = '3d';   // '3d' | '2d'

    // Initial tanker pose: bow toward SPM, stern out, ~hawserLen + margin from buoy
    this.state = this.defaultState();
    this.history = [];
    this.lastDeriv = null;
    this.lastLoads = null;
    this._rkScratch = null;
  }

  defaultState() {
    const Lh = this.hawser.params.hawserLen;
    const bow = this.hawser.params.bowFromCg;
    // Bow faces the SPM (heading π): fairlead sits ~hawserLen down-range of the buoy
    const psi = Math.PI;
    const xt = Lh + bow + 2; // fairlead ≈ Lh+2 m from buoy → slight pretension
    this.tanker.params.headingDeg = 180;
    return new Float64Array([
      0, 0, 0, 0,             // SPM xb zb vxb vzb
      xt, 0, psi, 0, 0, 0,    // tanker xt zt ψ vxt vzt ω
    ]);
  }

  reset() {
    this.spm.reset();
    this.state = this.defaultState();
    this.t = 0;
    this.history = [];
    this.syncSpmFromState();
  }

  syncSpmFromState() {
    const y = this.state;
    this.spm.buoy.x = y[0];
    this.spm.buoy.z = y[1];
    this.spm.buoy.vx = y[2];
    this.spm.buoy.vz = y[3];
    this.spm.t = this.t;
  }

  // Apply shared environment from SPM params into tanker (single weather desk)
  syncWeather() {
    const p = this.spm.params;
    this.tanker.params.windU = p.windU;
    this.tanker.params.windDir = p.windDir;
    this.tanker.params.curU = p.curU;
    this.tanker.params.curDir = p.curDir;
  }

  // Instantaneous loads for diagnostics / rendering
  evaluateLoads(y = this.state, t = this.t) {
    this.syncWeather();
    const xb = y[0], zb = y[1];
    const xt = y[4], zt = y[5], ψ = y[6];

    this.spm.buoy.x = xb;
    this.spm.buoy.z = zb;
    this.spm.t = t;
    const chains = this.spm.solveChains();
    const rest = this.spm.restoringForce(chains);
    const envB = this.spm.envForce(chains);

    const tank = this.tanker.loads(ψ);
    let haw = {
      tension: 0, slack: true, stretch: 0,
      Fx_spm: 0, Fy_spm: 0, Fx_tanker: 0, Fy_tanker: 0, N_tanker: 0,
      tugFx: 0, tugFy: 0, tugN: 0,
    };
    if (this.params.hawserEnabled && this.params.tankerEnabled) {
      haw = this.hawser.loads(xb, zb, xt, zt, ψ);
    } else if (this.params.tankerEnabled) {
      const tug = this.hawser.tugLoads(xt, zt, ψ);
      haw = { ...haw, ...tug, Fx_tanker: tug.tugFx, Fy_tanker: tug.tugFy, N_tanker: tug.tugN };
    }

    const loads = {
      chains, rest, envB, tank, haw,
      Fx_spm: envB.x + rest.Fx + (haw.Fx_spm || 0),
      Fy_spm: envB.z + rest.Fy + (haw.Fy_spm || 0),
      Fx_tanker: tank.Fx + (haw.Fx_tanker || 0),
      Fy_tanker: tank.Fy + (haw.Fy_tanker || 0),
      N_tanker: tank.N + (haw.N_tanker || 0),
    };
    this.lastLoads = loads;
    this.spm.lastChains = chains;
    this.spm.lastEnv = envB;
    return loads;
  }

  // dydt for the 10-vector
  deriv(t, y) {
    const loads = this.evaluateLoads(y, t);
    const p = this.params;
    const sp = this.spm.params;

    // SPM mass + added mass
    const draft = loads.envB.draft;
    const disp = RHO_WATER * Math.PI * (sp.buoyD / 2) ** 2 * draft;
    const mB = Math.max(sp.buoyMass, 1e3) + disp;
    const dampB = 0.35 * Math.sqrt(mB * 2e3) + p.buoyDamping;

    const mT = this.tanker.mass();
    const Izz = this.tanker.yawInertia();
    // Surge/sway added mass ~ 0.1 to 0.2 of displacement
    const mTx = mT * 1.15;
    const mTy = mT * 1.5;

    const vxb = y[2], vzb = y[3];
    const vxt = y[7], vzt = y[8], ω = y[9];

    const axb = (loads.Fx_spm - dampB * vxb) / mB;
    const azb = (loads.Fy_spm - dampB * vzb) / mB;

    let axt = 0, azt = 0, α = 0;
    if (p.tankerEnabled) {
      axt = (loads.Fx_tanker - p.tankerLinDamp * vxt) / mTx;
      azt = (loads.Fy_tanker - p.tankerLinDamp * vzt) / mTy;
      α = (loads.N_tanker - p.tankerYawDamp * ω) / Izz;
    }

    const out = new Float64Array(10);
    out[0] = vxb;
    out[1] = vzb;
    out[2] = axb;
    out[3] = azb;
    out[4] = p.tankerEnabled ? vxt : 0;
    out[5] = p.tankerEnabled ? vzt : 0;
    out[6] = p.tankerEnabled ? ω : 0;
    out[7] = axt;
    out[8] = azt;
    out[9] = α;
    this.lastDeriv = out;
    return out;
  }

  // Advance simulation by dt wall-seconds of simulated time (adaptive substeps)
  step(dt) {
    if (!this.playing) {
      this.evaluateLoads(this.state, this.t);
      this.syncSpmFromState();
      return this.state;
    }
    const dtClamped = Math.min(Math.max(dt, 0), 0.25);
    if (dtClamped < 1e-6) return this.state;

    const f = (t, y) => this.deriv(t, y);
    const res = solveIvp(f, this.t, this.state, this.t + dtClamped, {
      rtol: 1e-3,
      atol: 1e-4,
      h0: Math.min(0.05, dtClamped),
      hMin: 1e-4,
      hMax: 0.2,
      maxSteps: 400,
      recordEvery: 0, // don't flood; we push one sample below
    });
    this.t = res.t;
    this.state = res.y;
    this.syncSpmFromState();
    this.spm.buoy.heave = this.spm.surface(this.state[0], this.state[1], this.t);
    this.evaluateLoads(this.state, this.t);

    // Keep a rolling history of the 10-vector for export
    const L = this.lastLoads;
    this.history.push({
      t: this.t,
      y: Float64Array.from(this.state),
      Fx_spm: L?.Fx_spm ?? 0,
      Fy_spm: L?.Fy_spm ?? 0,
      Fx_tanker: L?.Fx_tanker ?? 0,
      Fy_tanker: L?.Fy_tanker ?? 0,
      N_tanker: L?.N_tanker ?? 0,
      hawser: L?.haw?.tension ?? 0,
      slack: L?.haw?.slack ? 1 : 0,
    });
    if (this.history.length > 6000) this.history.splice(0, this.history.length - 5000);
    return this.state;
  }

  // Run a batch to tEnd (for engineering export)
  integrateTo(tEnd, opts = {}) {
    const f = (t, y) => this.deriv(t, y);
    const res = solveIvp(f, this.t, this.state, tEnd, {
      rtol: opts.rtol ?? 1e-4,
      atol: opts.atol ?? 1e-5,
      h0: opts.h0 ?? 0.05,
      hMin: 1e-5,
      hMax: 0.5,
      recordEvery: opts.recordEvery ?? 0.5,
      maxSteps: opts.maxSteps ?? 50000,
    });
    this.t = res.t;
    this.state = res.y;
    this.history = res.hist;
    this.syncSpmFromState();
    this.evaluateLoads(this.state, this.t);
    return res;
  }

  snapshot() {
    const y = this.state;
    const L = this.lastLoads || this.evaluateLoads();
    return {
      t: this.t,
      state: Array.from(y),
      spm: { x: y[0], z: y[1], vx: y[2], vz: y[3] },
      tanker: {
        x: y[4], z: y[5], headingDeg: y[6] * 180 / Math.PI,
        vx: y[7], vz: y[8], omega: y[9],
      },
      Fx_spm: L.Fx_spm, Fy_spm: L.Fy_spm,
      Fx_tanker: L.Fx_tanker, Fy_tanker: L.Fy_tanker, N_tanker: L.N_tanker,
      hawser_kN: (L.haw?.tension || 0) / 1000,
      hawser_slack: !!L.haw?.slack,
    };
  }

  // Flat CSV: time history of the 10-value state vector (+ key loads)
  stateHistoryCSV() {
    const lines = [];
    lines.push('# Master Physics Engine state export (10-vector + loads)');
    lines.push('# state: xb,zb,vxb,vzb, xt,zt,psi,vxt,vzt,omega');
    lines.push('t_s,xb_m,zb_m,vxb_mps,vzb_mps,xt_m,zt_m,psi_rad,vxt_mps,vzt_mps,omega_rps,Fx_spm_kN,Fy_spm_kN,Fx_tanker_kN,Fy_tanker_kN,N_tanker_MNm,hawser_kN,slack');
    const rows = this.history.length ? this.history : [{ t: this.t, y: this.state }];
    for (const row of rows) {
      const y = row.y;
      const Fx_s = row.Fx_spm != null ? (row.Fx_spm / 1000).toFixed(2) : '';
      const Fy_s = row.Fy_spm != null ? (row.Fy_spm / 1000).toFixed(2) : '';
      const Fx_t = row.Fx_tanker != null ? (row.Fx_tanker / 1000).toFixed(2) : '';
      const Fy_t = row.Fy_tanker != null ? (row.Fy_tanker / 1000).toFixed(2) : '';
      const N = row.N_tanker != null ? (row.N_tanker / 1e6).toFixed(4) : '';
      const haw = row.hawser != null ? (row.hawser / 1000).toFixed(2) : '';
      const slack = row.slack != null ? String(row.slack) : '';
      lines.push([
        row.t.toFixed(3),
        y[0].toFixed(4), y[1].toFixed(4), y[2].toFixed(4), y[3].toFixed(4),
        y[4].toFixed(4), y[5].toFixed(4), y[6].toFixed(6), y[7].toFixed(4), y[8].toFixed(4), y[9].toFixed(6),
        Fx_s, Fy_s, Fx_t, Fy_t, N, haw, slack,
      ].join(','));
    }
    return lines.join('\n');
  }

  // Full engineering workbook-style CSV (modules + status)
  fullExportCSV() {
    const snap = this.snapshot();
    const L = this.lastLoads || this.evaluateLoads();
    const parts = [];
    parts.push(this.spm.toCSV());
    parts.push('');
    parts.push('# Tanker module');
    parts.push(`heading_deg,${(snap.tanker.headingDeg).toFixed(3)}`);
    parts.push(`draft_m,${L.tank.draft.toFixed(3)}`);
    parts.push(`mass_kg,${L.tank.mass.toFixed(0)}`);
    parts.push(`Fx_kN,${L.tank.Fx_kN.toFixed(2)}`);
    parts.push(`Fy_kN,${L.tank.Fy_kN.toFixed(2)}`);
    parts.push(`N_MNm,${L.tank.N_MNm.toFixed(4)}`);
    parts.push(`wind_rel_deg,${L.tank.windRelDeg.toFixed(1)}`);
    parts.push(`cur_rel_deg,${L.tank.curRelDeg.toFixed(1)}`);
    parts.push('');
    parts.push('# Hawser / Tug module');
    parts.push(`tension_kN,${((L.haw?.tension || 0) / 1000).toFixed(2)}`);
    parts.push(`stretch_m,${(L.haw?.stretch || 0).toFixed(3)}`);
    parts.push(`slack,${L.haw?.slack ? 1 : 0}`);
    parts.push(`dist_m,${(L.haw?.dist || 0).toFixed(3)}`);
    parts.push(`tug_Fx_kN,${((L.haw?.tugFx || 0) / 1000).toFixed(2)}`);
    parts.push(`tug_Fy_kN,${((L.haw?.tugFy || 0) / 1000).toFixed(2)}`);
    parts.push(`tug_N_MNm,${((L.haw?.tugN || 0) / 1e6).toFixed(4)}`);
    parts.push('');
    parts.push(this.stateHistoryCSV());
    return parts.join('\n');
  }
}
