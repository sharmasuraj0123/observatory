// Geometric optics: Snell's law, Fresnel reflectance, Cauchy dispersion,
// and a multi-bounce ray tracer over plane / spherical surfaces.
//
// Units: millimeters for bench geometry (1 scene unit = 1 mm), nanometers for
// wavelength, dimensionless refractive index. Speed of light kept in mm/ns so
// optical path length converts cleanly to time of flight.
//
// Sources: Hecht, Optics; Fresnel equations (unpolarized average of Rs, Rp);
// Cauchy dispersion n(λ) = A + B/λ² with λ in micrometers.

export const C_MM_PER_NS = 299.792458; // speed of light in mm/ns
export const C_M_PER_S = 299792458;

// Common materials: Cauchy coefficients (A, B) with B in μm².
// BK7 / fused silica / water / acrylic from standard optical glass catalogs.
export const MATERIALS = {
  vacuum: { name: 'Vacuum', A: 1, B: 0 },
  air: { name: 'Air', A: 1.000273, B: 0 },
  water: { name: 'Water', A: 1.324, B: 0.00349 }, // approx visible
  bk7: { name: 'BK7 glass', A: 1.5046, B: 0.00420 },
  fusedSilica: { name: 'Fused silica', A: 1.4580, B: 0.00354 },
  acrylic: { name: 'Acrylic (PMMA)', A: 1.491, B: 0.00343 },
  diamond: { name: 'Diamond', A: 2.407, B: 0.0116 },
  sapphire: { name: 'Sapphire', A: 1.768, B: 0.0084 },
};

export function indexOf(mat, lambdaNm) {
  if (!mat) return 1;
  if (typeof mat === 'number') return mat;
  const um = lambdaNm / 1000;
  return mat.A + mat.B / (um * um);
}

// Wavelength (nm) → sRGB approximate spectral color (CIE-like piecewise).
export function wavelengthToRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / (440 - 380); b = 1;
  } else if (nm >= 440 && nm < 490) {
    g = (nm - 440) / (490 - 440); b = 1;
  } else if (nm >= 490 && nm < 510) {
    g = 1; b = -(nm - 510) / (510 - 490);
  } else if (nm >= 510 && nm < 580) {
    r = (nm - 510) / (580 - 510); g = 1;
  } else if (nm >= 580 && nm < 645) {
    r = 1; g = -(nm - 645) / (645 - 580);
  } else if (nm >= 645 && nm <= 780) {
    r = 1;
  }
  // intensity falloff at spectrum edges (eye sensitivity)
  let f = 1;
  if (nm > 700) f = 0.3 + 0.7 * (780 - nm) / 80;
  else if (nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
  r = Math.pow(Math.max(r * f, 0), 0.8);
  g = Math.pow(Math.max(g * f, 0), 0.8);
  b = Math.pow(Math.max(b * f, 0), 0.8);
  return { r, g, b, hex: (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255) };
}

export function criticalAngleDeg(n1, n2) {
  if (n2 >= n1) return null; // no TIR possible
  return Math.asin(n2 / n1) * 180 / Math.PI;
}

// Unpolarized Fresnel reflectance at a dielectric interface.
// θi in radians, from the normal. Returns { R, T } with T = 1 - R (no absorption).
export function fresnelRT(n1, n2, thetaI) {
  const s = Math.sin(thetaI);
  const c = Math.cos(thetaI);
  const k = (n1 / n2) * s;
  if (k >= 1) return { R: 1, T: 0, tir: true }; // TIR
  const cosT = Math.sqrt(Math.max(0, 1 - k * k));
  const rsNum = n1 * c - n2 * cosT;
  const rsDen = n1 * c + n2 * cosT;
  const rpNum = n1 * cosT - n2 * c;
  const rpDen = n1 * cosT + n2 * c;
  const Rs = (rsNum / rsDen) ** 2;
  const Rp = (rpNum / rpDen) ** 2;
  const R = 0.5 * (Rs + Rp);
  return { R, T: 1 - R, tir: false, cosT, thetaT: Math.acos(cosT) };
}

// Reflect direction about a unit normal. I points toward the surface.
export function reflectDir(ix, iy, nx, ny) {
  const dot = ix * nx + iy * ny;
  return { x: ix - 2 * dot * nx, y: iy - 2 * dot * ny };
}

// Refract: I is incident unit direction (toward surface), N is outward normal
// of the incident medium (pointing into the side the ray is coming from).
// Returns null on TIR.
export function refractDir(ix, iy, nx, ny, n1, n2) {
  // ensure N faces the incoming ray
  let nnx = nx, nny = ny;
  let cosi = -(ix * nnx + iy * nny);
  if (cosi < 0) {
    nnx = -nx; nny = -ny;
    cosi = -cosi;
  }
  const eta = n1 / n2;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  const a = eta;
  const b = eta * cosi - Math.sqrt(k);
  return { x: a * ix + b * nnx, y: a * iy + b * nny, cosi, cosT: Math.sqrt(k) };
}

// ---------------- surface geometry ----------------

// Plane: infinite line through (px, py) with unit normal (nx, ny).
// The "front" side (n pointing into) has material matFront; back has matBack.
export function hitPlane(ox, oy, dx, dy, surf, tMin = 1e-4) {
  const denom = dx * surf.nx + dy * surf.ny;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((surf.px - ox) * surf.nx + (surf.py - oy) * surf.ny) / denom;
  if (t < tMin) return null;
  // optional finite aperture: half-height along tangent
  if (surf.halfH != null) {
    const tx = -surf.ny, ty = surf.nx;
    const hx = ox + dx * t - surf.px;
    const hy = oy + dy * t - surf.py;
    const along = hx * tx + hy * ty;
    if (Math.abs(along) > surf.halfH) return null;
  }
  return { t, x: ox + dx * t, y: oy + dy * t, nx: surf.nx, ny: surf.ny, surf };
}

// Sphere (circle in 2D): center (cx, cy), radius R. Outward normal = radial.
// Convex toward +x when center is to the left of the vertex.
export function hitSphere(ox, oy, dx, dy, surf, tMin = 1e-4) {
  const ocx = ox - surf.cx, ocy = oy - surf.cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (ocx * dx + ocy * dy);
  const c = ocx * ocx + ocy * ocy - surf.R * surf.R;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  // try nearer root first, then farther (needed when starting inside)
  const candidates = [(-b - s) / (2 * a), (-b + s) / (2 * a)];
  for (const t of candidates) {
    if (t < tMin) continue;
    const x = ox + dx * t, y = oy + dy * t;
    if (surf.halfH != null && Math.abs(y - surf.cy) > surf.halfH) continue;
    if (surf.xMin != null && x < surf.xMin) continue;
    if (surf.xMax != null && x > surf.xMax) continue;
    let nx = (x - surf.cx) / surf.R;
    let ny = (y - surf.cy) / surf.R;
    if (surf.flipNormal) { nx = -nx; ny = -ny; }
    return { t, x, y, nx, ny, surf };
  }
  return null;
}

function hitSurface(ox, oy, dx, dy, surf, tMin) {
  if (surf.kind === 'plane' || surf.kind === 'mirror' || surf.kind === 'stop') {
    return hitPlane(ox, oy, dx, dy, surf, tMin);
  }
  if (surf.kind === 'sphere' || surf.kind === 'mirrorSphere') {
    return hitSphere(ox, oy, dx, dy, surf, tMin);
  }
  return null;
}

// ---------------- ray tracer ----------------

const MAX_BOUNCES = 24;
const MIN_I = 1e-4;
const MAX_PATH = 4000; // mm

/**
 * Trace one ray through an ordered (or unordered) list of surfaces.
 * Surfaces are tested every bounce for the nearest hit ahead.
 *
 * @param {object} opts
 * @param {number} opts.x0, opts.y0  origin (mm)
 * @param {number} opts.angleDeg     launch angle from +x axis (degrees)
 * @param {number} opts.lambdaNm     wavelength
 * @param {object[]} opts.surfaces
 * @param {number} [opts.nAmbient=1]
 * @param {number} [opts.intensity=1]
 */
export function traceRay(opts) {
  const lambda = opts.lambdaNm;
  const color = wavelengthToRGB(lambda);
  let x = opts.x0, y = opts.y0;
  const ang = opts.angleDeg * Math.PI / 180;
  let dx = Math.cos(ang), dy = Math.sin(ang);
  let nCur = opts.nAmbient ?? 1;
  // if starting inside a named ambient material
  if (opts.ambientMat) nCur = indexOf(opts.ambientMat, lambda);
  let I = opts.intensity ?? 1;
  let opl = 0; // optical path length (mm of vacuum-equivalent)
  const path = [{ x, y, I }];
  const events = [];
  let bounced = 0;
  let terminated = 'escaped';

  while (bounced < MAX_BOUNCES && I > MIN_I) {
    let best = null;
    for (const surf of opts.surfaces) {
      const h = hitSurface(x, y, dx, dy, surf, 1e-4);
      if (h && (!best || h.t < best.t)) best = h;
    }
    if (!best || best.t > MAX_PATH) {
      // extend a bit so the ray is visible leaving the bench
      const ext = Math.min(180, MAX_PATH);
      path.push({ x: x + dx * ext, y: y + dy * ext, I });
      terminated = 'escaped';
      break;
    }

    const dist = best.t;
    opl += nCur * dist;
    x = best.x; y = best.y;
    path.push({ x, y, I });

    const surf = best.surf;
    // orient normal against the incoming ray
    let nx = best.nx, ny = best.ny;
    let cosi = -(dx * nx + dy * ny);
    if (cosi < 0) { nx = -nx; ny = -ny; cosi = -cosi; }
    const thetaI = Math.acos(Math.min(1, Math.max(0, cosi)));

    // resolve materials on either side of the geometric normal (best.nx)
    // Side A = where best.nx points; side B = opposite.
    const matA = surf.matA;
    const matB = surf.matB;
    const fromA = (dx * best.nx + dy * best.ny) < 0; // coming from side A
    const n1 = nCur;
    let n2;
    if (surf.kind === 'mirror' || surf.kind === 'mirrorSphere') {
      // perfect (or metal) mirror: reflect only
      const rd = reflectDir(dx, dy, nx, ny);
      const R = surf.reflectance != null ? surf.reflectance : 0.95;
      events.push({
        kind: 'reflect',
        label: surf.label || 'Mirror',
        x, y,
        thetaIDeg: thetaI * 180 / Math.PI,
        thetaTDeg: null,
        n1, n2: n1,
        R, T: 0,
        intensityIn: I,
        intensityOut: I * R,
        oplMm: opl,
        tofNs: opl / C_MM_PER_NS,
        lambdaNm: lambda,
      });
      I *= R;
      dx = rd.x; dy = rd.y;
      bounced++;
      if (I < MIN_I) { terminated = 'absorbed'; break; }
      continue;
    }

    // dielectric: determine exit index
    if (fromA) n2 = indexOf(matB, lambda);
    else n2 = indexOf(matA, lambda);

    // absorb / stop surface
    if (surf.kind === 'stop' || surf.absorb) {
      events.push({
        kind: 'absorb',
        label: surf.label || 'Detector',
        x, y,
        thetaIDeg: thetaI * 180 / Math.PI,
        thetaTDeg: null,
        n1, n2: n1,
        R: 0, T: 0,
        intensityIn: I, intensityOut: 0,
        oplMm: opl, tofNs: opl / C_MM_PER_NS,
        lambdaNm: lambda,
      });
      terminated = 'detected';
      break;
    }

    const fr = fresnelRT(n1, n2, thetaI);
    if (fr.tir) {
      const rd = reflectDir(dx, dy, nx, ny);
      events.push({
        kind: 'TIR',
        label: surf.label || 'Interface',
        x, y,
        thetaIDeg: thetaI * 180 / Math.PI,
        thetaTDeg: null,
        criticalDeg: criticalAngleDeg(n1, n2),
        n1, n2,
        R: 1, T: 0,
        intensityIn: I, intensityOut: I,
        oplMm: opl, tofNs: opl / C_MM_PER_NS,
        lambdaNm: lambda,
      });
      dx = rd.x; dy = rd.y;
      bounced++;
      continue;
    }

    // Prefer refraction for the primary traced path. Optional forceReflectOn
    // (1-based interaction index) follows the Fresnel-reflected branch instead
    // (used by the rainbow Descartes path: enter, reflect, exit).
    const bounceIdx = bounced + 1;
    const forceRefl = opts.forceReflectOn && opts.forceReflectOn.includes(bounceIdx);

    if (forceRefl) {
      const rd = reflectDir(dx, dy, nx, ny);
      const Iout = I * Math.max(fr.R, 0.04); // floor so the path stays visible
      events.push({
        kind: 'reflect',
        label: (surf.label || 'Interface') + ' (forced)',
        x, y,
        thetaIDeg: thetaI * 180 / Math.PI,
        thetaTDeg: null,
        n1, n2,
        R: fr.R, T: fr.T,
        intensityIn: I, intensityOut: Iout,
        oplMm: opl, tofNs: opl / C_MM_PER_NS,
        lambdaNm: lambda,
      });
      I = Iout;
      dx = rd.x; dy = rd.y;
      bounced++;
      continue;
    }

    const td = refractDir(dx, dy, nx, ny, n1, n2);
    if (!td) {
      const rd = reflectDir(dx, dy, nx, ny);
      dx = rd.x; dy = rd.y;
      bounced++;
      continue;
    }

    const Iout = I * fr.T;
    events.push({
      kind: 'refract',
      label: surf.label || 'Interface',
      x, y,
      thetaIDeg: thetaI * 180 / Math.PI,
      thetaTDeg: fr.thetaT * 180 / Math.PI,
      n1, n2,
      R: fr.R, T: fr.T,
      intensityIn: I, intensityOut: Iout,
      oplMm: opl, tofNs: opl / C_MM_PER_NS,
      lambdaNm: lambda,
      snellCheck: n1 * Math.sin(thetaI) - n2 * Math.sin(fr.thetaT),
    });
    I = Iout;
    dx = td.x; dy = td.y;
    nCur = n2;
    bounced++;
    if (I < MIN_I) { terminated = 'absorbed'; break; }
  }

  return {
    lambdaNm: lambda,
    color,
    angleDeg: opts.angleDeg,
    path,
    events,
    oplMm: opl,
    tofNs: opl / C_MM_PER_NS,
    finalI: I,
    terminated,
    bounces: events.length,
  };
}

/**
 * Trace a fan of rays across angles and wavelengths.
 * @returns {object[]} ray results
 */
export function traceFan({
  x0, y0, anglesDeg, wavelengthsNm, surfaces, ambientMat, intensity = 1,
  bundleY = null, forceReflectOn = null,
}) {
  const rays = [];
  let id = 0;
  const ys = bundleY && bundleY.length ? bundleY : [y0];
  const angs = anglesDeg && anglesDeg.length ? anglesDeg : [0];
  for (const lam of wavelengthsNm) {
    for (const yLaunch of ys) {
      for (const a of angs) {
        const r = traceRay({
          x0, y0: yLaunch, angleDeg: a, lambdaNm: lam,
          surfaces, ambientMat, intensity, forceReflectOn,
        });
        r.id = id++;
        r.launchY = yLaunch;
        rays.push(r);
      }
    }
  }
  return rays;
}

// Analytic thin-lens focal length from lensmaker (two surfaces, same medium).
// R1, R2 signed (positive if center is to the right of the surface).
export function lensmakerF(n, R1, R2, thickness = 0) {
  // 1/f = (n-1)[1/R1 - 1/R2 + (n-1)d/(n R1 R2)]
  const term = 1 / R1 - 1 / R2 + (n - 1) * thickness / (n * R1 * R2);
  return 1 / ((n - 1) * term);
}

// Lateral shift through a parallel plate of thickness d at incidence θ1.
export function plateShift(n, d, theta1Rad) {
  const theta2 = Math.asin((1 / n) * Math.sin(theta1Rad));
  return d * Math.sin(theta1Rad - theta2) / Math.cos(theta2);
}
