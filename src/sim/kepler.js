// Keplerian orbit propagation.
// Planets use JPL's approximate elements (Standish, valid 1800 to 2050 AD):
// each element is [value at J2000, rate per Julian century], angles in degrees, a in AU.
// Moons use fixed elements relative to their parent (a in km).

import { DEG, TAU, UNITS_PER_AU, KM_TO_UNITS, GM_SUN, AU_KM } from './constants.js';

// Solve Kepler's equation M = E - e sin E for E (radians) via Newton iteration.
export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let k = 0; k < 40; k++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

export function elementsAt(el, T) {
  return {
    a: el.a[0] + el.a[1] * T,
    e: el.e[0] + el.e[1] * T,
    i: el.i[0] + el.i[1] * T,
    L: el.L[0] + el.L[1] * T,
    w: el.w[0] + el.w[1] * T, // longitude of perihelion (varpi)
    node: el.node[0] + el.node[1] * T,
  };
}

function normalizePi(rad) {
  return ((rad % TAU) + TAU * 1.5) % TAU - Math.PI;
}

// Rotate in-plane coordinates (xp toward periapsis) into the ecliptic frame,
// then map ecliptic (x, y, z-north) onto scene axes (x, y-up, z) preserving handedness.
// Output units match input units of xp / yp.
export function planeToScene(xp, yp, argPeri, inc, node, out) {
  const cw = Math.cos(argPeri), sw = Math.sin(argPeri);
  const cN = Math.cos(node), sN = Math.sin(node);
  const ci = Math.cos(inc), si = Math.sin(inc);
  const x = (cw * cN - sw * sN * ci) * xp + (-sw * cN - cw * sN * ci) * yp;
  const y = (cw * sN + sw * cN * ci) * xp + (-sw * sN + cw * cN * ci) * yp;
  const z = (sw * si) * xp + (cw * si) * yp;
  out.set(x, z, -y);
  return out;
}

// Heliocentric position in scene units from JPL-style elements at T centuries past J2000.
export function positionFromElements(cur, out) {
  const { a, e } = cur;
  const inc = cur.i * DEG;
  const node = cur.node * DEG;
  const argPeri = (cur.w - cur.node) * DEG;
  const M = normalizePi((cur.L - cur.w) * DEG);
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  planeToScene(xp, yp, argPeri, inc, node, out);
  return out.multiplyScalar(UNITS_PER_AU);
}

// Position of a moon relative to its parent, in scene units.
// mdef: { aKm, e, iDeg, nodeDeg, periDeg, M0Deg, periodDays }
export function moonLocalPosition(mdef, daysSinceJ2000, out) {
  const n = 360 / mdef.periodDays;
  const M = normalizePi((mdef.M0Deg + n * daysSinceJ2000) * DEG);
  const e = mdef.e || 0;
  const E = solveKepler(M, e);
  const aU = mdef.aKm * KM_TO_UNITS;
  const xp = aU * (Math.cos(E) - e);
  const yp = aU * Math.sqrt(1 - e * e) * Math.sin(E);
  return planeToScene(xp, yp, (mdef.periDeg || 0) * DEG, (mdef.iDeg || 0) * DEG, (mdef.nodeDeg || 0) * DEG, out);
}

// Sample a full orbit ellipse into a Float32Array of scene-space positions.
export function orbitPathPositions(cur, segments, scale) {
  const { a, e } = cur;
  const inc = cur.i * DEG;
  const node = cur.node * DEG;
  const argPeri = (cur.w - cur.node) * DEG;
  const arr = new Float32Array((segments + 1) * 3);
  const tmp = { set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
  for (let j = 0; j <= segments; j++) {
    const E = (j / segments) * TAU;
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    planeToScene(xp, yp, argPeri, inc, node, tmp);
    arr[j * 3] = tmp.x * scale;
    arr[j * 3 + 1] = tmp.y * scale;
    arr[j * 3 + 2] = tmp.z * scale;
  }
  return arr;
}

// Instantaneous heliocentric orbital speed (km/s) via the vis-viva equation.
export function orbitalSpeedKms(aAU, rAU) {
  const aKm = aAU * AU_KM;
  const rKm = rAU * AU_KM;
  return Math.sqrt(GM_SUN * (2 / rKm - 1 / aKm));
}

// Orbital speed around a parent of given GM (km^3/s^2).
export function moonSpeedKms(gm, aKm, rKm) {
  return Math.sqrt(gm * (2 / rKm - 1 / aKm));
}
