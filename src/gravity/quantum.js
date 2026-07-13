// Pedagogical quantum-gravity effective models for the Gravity Lab.
// Teaching toys inspired by research programs (LQG bounce, asymptotic safety,
// massive graviton, spacetime foam, Hawking evaporation, Schrödinger-Newton).
// Not solutions of a full quantum gravity theory.

export const QG_MODES = {
  none: {
    id: 'none',
    name: 'Classical',
    short: 'Newtonian / F∝1/rⁿ',
  },
  bounce: {
    id: 'bounce',
    name: 'Quantum bounce',
    short: 'LQG-inspired repulsive core',
    blurb: 'Loop-quantum-inspired polymer correction: a = −GM/r² + GM ℓ_b²/r⁴. Inside the bounce radius the effective force turns repulsive, so free-fall stops and rebounds instead of hitting a singularity.',
  },
  runningG: {
    id: 'runningG',
    name: 'Running G',
    short: 'Asymptotic-safety scale flow',
    blurb: 'Asymptotic-safety style running: G(r) = G₀ / (1 + (ℓ/r)^α). Gravity weakens toward the UV (short distance), so deep orbits feel a softer well than Newton predicts.',
  },
  yukawa: {
    id: 'yukawa',
    name: 'Massive graviton',
    short: 'Yukawa-screened gravity',
    blurb: 'If the graviton had mass m_g, gravity becomes Yukawa: Φ ∝ e^{−r/λ}/r with λ = ħ/(m_g c). Bound orbits only exist inside a few Compton lengths; far away the field is exponentially screened.',
  },
  foam: {
    id: 'foam',
    name: 'Spacetime foam',
    short: 'Planck-scale geodesic jitter',
    blurb: 'Wheeler foam toy: classical geodesics pick up stochastic kicks whose amplitude grows toward small r. Orbits diffuse in energy and angular momentum; the table shows e and ε wandering.',
  },
  hawking: {
    id: 'hawking',
    name: 'Hawking evaporation',
    short: 'Toy black-hole mass loss',
    blurb: 'Semi-classical toy: a black hole loses mass as dM/dt = −κ/M² (Stefan-Boltzmann with T_H ∝ 1/M). The horizon shrinks, orbital binding weakens, and the last stage runs away.',
  },
  schrodingerNewton: {
    id: 'schrodingerNewton',
    name: 'Schrödinger-Newton',
    short: 'Self-gravitating wave packet',
    blurb: 'Semi-classical Schrödinger-Newton: a Gaussian packet of N massive samples feels mutual soft Newtonian gravity plus a Bohm-like quantum pressure ∼ ħ_eff² outward. Balance them to see a self-bound soliton, or let quantum pressure win and watch the packet disperse.',
  },
};

const SOFT2 = 1; // km^2

function rhats(dx, dy, dz) {
  const r2 = dx * dx + dy * dy + dz * dz + SOFT2;
  const r = Math.sqrt(r2);
  return { r, r2, ux: dx / r, uy: dy / r, uz: dz / r };
}

/** Effective G at separation r for running-G mode. */
export function runningGAt(G0, r, ell, alpha) {
  const a = Math.max(alpha ?? 2, 0.1);
  const L = Math.max(ell ?? 1, 0);
  return G0 / (1 + (L / Math.max(r, 1e-9)) ** a);
}

/**
 * Radial acceleration magnitude of i toward j (positive = attractive),
 * and the unit vector from i to j.
 */
export function qgAccelFromTo(pi, pj, Mj, G, qg) {
  const dx = pj[0] - pi[0];
  const dy = pj[1] - pi[1];
  const dz = pj[2] - pi[2];
  const { r, ux, uy, uz } = rhats(dx, dy, dz);
  const mode = (qg && qg.mode) || 'none';
  let mag;

  if (mode === 'bounce') {
    const lb = Math.max(qg.bounceScale ?? 1, 0);
    // a = GM/r² − GM ℓ_b²/r⁴  (negative mag => repulsion)
    mag = (G * Mj) * (1 / (r * r) - (lb * lb) / (r ** 4));
  } else if (mode === 'runningG') {
    const Ge = runningGAt(G, r, qg.ell, qg.alpha);
    mag = (Ge * Mj) / (r * r);
  } else if (mode === 'yukawa') {
    const lam = Math.max(qg.lambda ?? 1, 1e-9);
    const x = r / lam;
    mag = (G * Mj) / (r * r) * Math.exp(-x) * (1 + x);
  } else if (mode === 'hawking' || mode === 'foam' || mode === 'schrodingerNewton' || mode === 'none') {
    const n = qg && qg.exponent != null ? qg.exponent : 2;
    mag = (G * Mj) / (r ** n);
  } else {
    mag = (G * Mj) / (r * r);
  }

  return { mag, ux, uy, uz, r };
}

export function qgAccelAt(pos, bodies, G, qg) {
  let ax = 0, ay = 0, az = 0;
  for (const b of bodies) {
    if (b.destroyed || b.test) continue;
    const { mag, ux, uy, uz } = qgAccelFromTo(pos, b.pos, b.mass, G, qg);
    ax += ux * mag;
    ay += uy * mag;
    az += uz * mag;
  }
  return [ax, ay, az];
}

export function qgPotentialAt(pos, bodies, G, qg) {
  // Approximate Φ such that a ≈ −∇Φ for the active mode (visual well only).
  let phi = 0;
  const mode = (qg && qg.mode) || 'none';
  for (const b of bodies) {
    if (b.destroyed || b.test) continue;
    const dx = pos[0] - b.pos[0];
    const dy = pos[1] - b.pos[1];
    const dz = pos[2] - b.pos[2];
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz + SOFT2);
    if (mode === 'bounce') {
      const lb = Math.max(qg.bounceScale ?? 1, 0);
      // Φ = −GM/r − GM ℓ_b²/(2 r³)  => −∇Φ has +GM ℓ²/r⁴ radial term
      phi += -G * b.mass / r - G * b.mass * (lb * lb) / (2 * r * r * r);
    } else if (mode === 'runningG') {
      // crude: use local G_eff in Newtonian potential
      const Ge = runningGAt(G, r, qg.ell, qg.alpha);
      phi += -Ge * b.mass / r;
    } else if (mode === 'yukawa') {
      const lam = Math.max(qg.lambda ?? 1, 1e-9);
      phi += -G * b.mass * Math.exp(-r / lam) / r;
    } else {
      const n = qg && qg.exponent != null ? qg.exponent : 2;
      if (Math.abs(n - 1) < 1e-9) phi += G * b.mass * Math.log(r);
      else phi += -G * b.mass / ((n - 1) * (r ** (n - 1)));
    }
  }
  return phi;
}

/** Hawking toy: dM/dt = −κ / M² (kg/s). κ scaled for demo. */
export function hawkingMassRate(mass, kappa) {
  if (!(mass > 0)) return 0;
  return -Math.max(kappa ?? 0, 0) / (mass * mass);
}

/**
 * Spacetime-foam stochastic kick on a velocity vector (km/s).
 * Amplitude grows toward small r (UV).
 */
export function foamKick(vel, r, dt, qg) {
  const strength = Math.max(qg.foamStrength ?? 0, 0);
  if (!(strength > 0) || !(dt > 0)) return;
  const ell = Math.max(qg.ell ?? 1, 1);
  const amp = strength * Math.sqrt(Math.abs(dt)) * (ell / Math.max(r, ell)) ** 1.5;
  vel[0] += (Math.random() * 2 - 1) * amp;
  vel[1] += (Math.random() * 2 - 1) * amp;
  vel[2] += (Math.random() * 2 - 1) * amp;
}

/**
 * Bohm-like quantum pressure accel for a Gaussian packet sample,
 * relative to center of mass. a = +(ħ_eff² / m²) * Δ / σ⁴  (outward).
 * ħ_eff is in km²/s demo units (not real ħ).
 */
export function quantumPressureAccel(pos, com, sigma, hbarEff) {
  const dx = pos[0] - com[0];
  const dy = pos[1] - com[1];
  const dz = pos[2] - com[2];
  const s = Math.max(sigma, 1);
  const s4 = s ** 4;
  const k = (hbarEff * hbarEff) / s4;
  return [k * dx, k * dy, k * dz];
}

export function packetCom(bodies) {
  let mx = 0, my = 0, mz = 0, m = 0;
  for (const b of bodies) {
    if (b.destroyed || !(b.mass > 0)) continue;
    mx += b.mass * b.pos[0];
    my += b.mass * b.pos[1];
    mz += b.mass * b.pos[2];
    m += b.mass;
  }
  if (!(m > 0)) return { com: [0, 0, 0], mass: 0, sigma: 1 };
  const com = [mx / m, my / m, mz / m];
  let varSum = 0;
  let n = 0;
  for (const b of bodies) {
    if (b.destroyed || !(b.mass > 0)) continue;
    const dx = b.pos[0] - com[0];
    const dy = b.pos[1] - com[1];
    const dz = b.pos[2] - com[2];
    varSum += dx * dx + dy * dy + dz * dz;
    n++;
  }
  const sigma = Math.sqrt(varSum / Math.max(n, 1)) || 1;
  return { com, mass: m, sigma };
}

export function qgLabel(qg) {
  if (!qg || !qg.mode || qg.mode === 'none') return 'Classical Newton';
  const info = QG_MODES[qg.mode];
  return info ? info.name : qg.mode;
}
