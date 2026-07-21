// Tanker Hull & Environment Module (client spec §4.2).
// Stand-alone weather-loading calculator or force provider for the Master Engine.
// OCIMF-style nondimensional coefficients vs relative angle; draft (ballast/laden)
// scales windage and underwater lateral area.
//
// Outputs: Surge Fx, Sway Fy, Yaw moment N about the vessel CG (N, N·m).
// World frame: +x east, +z north (plan +y). Heading ψ from +x toward +z (rad).

const RHO_AIR = 1.225;
const RHO_WATER = 1025;
const G = 9.80665;

// OCIMF-like wind coefficients (Cx surge, Cy sway, Cn yaw) vs relative angle deg.
// Relative angle 0° = head wind (bow into wind), 90° = beam, 180° = stern.
// Peak yaw near quartering (~45 to 135 deg) matches the non-intuitive OCIMF behaviour.
const WIND_TABLE = [
  { a: 0, Cx: -0.90, Cy: 0.00, Cn: 0.00 },
  { a: 15, Cx: -0.85, Cy: 0.25, Cn: 0.08 },
  { a: 30, Cx: -0.70, Cy: 0.55, Cn: 0.14 },
  { a: 45, Cx: -0.45, Cy: 0.85, Cn: 0.18 },
  { a: 60, Cx: -0.20, Cy: 1.00, Cn: 0.16 },
  { a: 75, Cx: 0.05, Cy: 1.05, Cn: 0.10 },
  { a: 90, Cx: 0.15, Cy: 1.00, Cn: 0.00 },
  { a: 105, Cx: 0.20, Cy: 0.95, Cn: -0.10 },
  { a: 120, Cx: 0.30, Cy: 0.85, Cn: -0.16 },
  { a: 135, Cx: 0.45, Cy: 0.65, Cn: -0.18 },
  { a: 150, Cx: 0.60, Cy: 0.40, Cn: -0.12 },
  { a: 165, Cx: 0.70, Cy: 0.18, Cn: -0.05 },
  { a: 180, Cx: 0.75, Cy: 0.00, Cn: 0.00 },
];

// Current coefficients (similar shape, slightly lower yaw authority)
const CUR_TABLE = [
  { a: 0, Cx: -0.70, Cy: 0.00, Cn: 0.00 },
  { a: 30, Cx: -0.50, Cy: 0.50, Cn: 0.10 },
  { a: 60, Cx: -0.15, Cy: 0.95, Cn: 0.12 },
  { a: 90, Cx: 0.10, Cy: 1.05, Cn: 0.00 },
  { a: 120, Cx: 0.25, Cy: 0.90, Cn: -0.12 },
  { a: 150, Cx: 0.45, Cy: 0.45, Cn: -0.08 },
  { a: 180, Cx: 0.55, Cy: 0.00, Cn: 0.00 },
];

function lerpCoeff(table, angleDeg) {
  let a = ((angleDeg % 360) + 360) % 360;
  // fold to 0..180 with Cy/Cn sign flip for port/starboard
  let sign = 1;
  if (a > 180) {
    a = 360 - a;
    sign = -1;
  }
  for (let i = 0; i < table.length - 1; i++) {
    const a0 = table[i], a1 = table[i + 1];
    if (a >= a0.a && a <= a1.a) {
      const t = (a - a0.a) / Math.max(a1.a - a0.a, 1e-9);
      return {
        Cx: a0.Cx + (a1.Cx - a0.Cx) * t,
        Cy: sign * (a0.Cy + (a1.Cy - a0.Cy) * t),
        Cn: sign * (a0.Cn + (a1.Cn - a0.Cn) * t),
      };
    }
  }
  const last = table[table.length - 1];
  return { Cx: last.Cx, Cy: sign * last.Cy, Cn: sign * last.Cn };
}

function relAngleDeg(headingRad, envDirDeg) {
  // angle of environment FROM vessel bow, clockwise in plan (x→z)
  const env = envDirDeg * Math.PI / 180;
  // velocity of env relative to vessel: env comes FROM envDir
  // relative attack: env direction minus heading
  let d = (env - headingRad) * 180 / Math.PI;
  d = ((d % 360) + 360) % 360;
  return d;
}

export class TankerModule {
  constructor() {
    this.params = {
      // Vessel (Aframax-class SPM tanker defaults)
      Lbp: 250,          // m
      beam: 44,          // m
      draftLaden: 14,    // m
      draftBallast: 7,   // m
      displacementLaden: 1.2e8,   // kg
      displacementBallast: 6.5e7, // kg
      // Loading: 0 = ballast, 1 = laden
      loading: 1,
      // Overridable areas (m²); 0 = auto from dims + draft
      AFw: 0, // frontal windage
      ALw: 0, // lateral windage
      AFc: 0, // frontal underwater
      ALc: 0, // lateral underwater
      // Environment
      windU: 12,
      windDir: 0,
      curU: 0.8,
      curDir: 30,
      // Pose for stand-alone queries
      headingDeg: 0,
    };
    this.last = {
      Fx: 0, Fy: 0, N: 0,
      Fx_kN: 0, Fy_kN: 0, N_MNm: 0,
      draft: 14, mass: 1.2e8,
      windRelDeg: 0, curRelDeg: 0,
    };
  }

  setParam(k, v) { this.params[k] = v; }

  draft() {
    const p = this.params;
    const t = Math.min(1, Math.max(0, p.loading));
    return p.draftBallast + (p.draftLaden - p.draftBallast) * t;
  }

  mass() {
    const p = this.params;
    const t = Math.min(1, Math.max(0, p.loading));
    return p.displacementBallast + (p.displacementLaden - p.displacementBallast) * t;
  }

  areas() {
    const p = this.params;
    const d = this.draft();
    const freeboard = Math.max(p.draftLaden * 0.55, 4); // rough exposed side height
    const AFw = p.AFw > 0 ? p.AFw : p.beam * freeboard * 0.85;
    const ALw = p.ALw > 0 ? p.ALw : p.Lbp * freeboard * 0.9;
    const AFc = p.AFc > 0 ? p.AFc : p.beam * d;
    const ALc = p.ALc > 0 ? p.ALc : p.Lbp * d;
    return { AFw, ALw, AFc, ALc, draft: d, freeboard };
  }

  // Body-frame forces from wind + current at a heading (rad).
  // Returns world-frame Fx, Fy and yaw moment N (about vertical).
  loads(headingRad = null, overrides = {}) {
    const p = { ...this.params, ...overrides };
    const ψ = headingRad != null ? headingRad : p.headingDeg * Math.PI / 180;
    const ar = this.areas();
    const m = this.mass();

    const wRel = relAngleDeg(ψ, p.windDir);
    const cRel = relAngleDeg(ψ, p.curDir);
    const Cw = lerpCoeff(WIND_TABLE, wRel);
    const Cc = lerpCoeff(CUR_TABLE, cRel);

    // Body-frame: +x surge (bow), +y sway (starboard)
    const qAir = 0.5 * RHO_AIR * p.windU * p.windU;
    const qWat = 0.5 * RHO_WATER * p.curU * p.curU;
    const Xs_w = qAir * ar.AFw * Cw.Cx;
    const Ys_w = qAir * ar.ALw * Cw.Cy;
    const Ns_w = qAir * ar.ALw * p.Lbp * Cw.Cn;
    const Xs_c = qWat * ar.AFc * Cc.Cx;
    const Ys_c = qWat * ar.ALc * Cc.Cy;
    const Ns_c = qWat * ar.ALc * p.Lbp * Cc.Cn;

    const Xs = Xs_w + Xs_c;
    const Ys = Ys_w + Ys_c;
    const N = Ns_w + Ns_c;

    // Rotate body → world (x, z)
    const c = Math.cos(ψ), s = Math.sin(ψ);
    const Fx = c * Xs - s * Ys;
    const Fy = s * Xs + c * Ys;

    this.last = {
      Fx, Fy, N,
      Fx_kN: Fx / 1000, Fy_kN: Fy / 1000, N_MNm: N / 1e6,
      draft: ar.draft, mass: m,
      windRelDeg: wRel, curRelDeg: cRel,
      Xs, Ys, Xs_w, Ys_w, Ns_w, Xs_c, Ys_c, Ns_c,
      areas: ar,
    };
    return this.last;
  }

  // Stand-alone: query aerodynamic/hydrodynamic loads for given wind without a time series
  queryStatic(opts = {}) {
    if (opts.windU != null) this.params.windU = opts.windU;
    if (opts.windDir != null) this.params.windDir = opts.windDir;
    if (opts.curU != null) this.params.curU = opts.curU;
    if (opts.curDir != null) this.params.curDir = opts.curDir;
    if (opts.headingDeg != null) this.params.headingDeg = opts.headingDeg;
    if (opts.loading != null) this.params.loading = opts.loading;
    return this.loads();
  }

  yawInertia() {
    // Approximate Izz ≈ 0.25 m Lbp² for a tanker
    const m = this.mass();
    const L = this.params.Lbp;
    return 0.25 * m * L * L;
  }
}

export { RHO_AIR, RHO_WATER, G, lerpCoeff, WIND_TABLE };
