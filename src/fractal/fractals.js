// CPU probe + analysis helpers for escape-time and IFS fractals.

export function escapeProbe({ kind, cRe, cIm, juliaX, juliaY, maxIter, power, bailout }) {
  const bail = bailout ?? 4;
  const n = maxIter ?? 256;
  const p = power ?? 2;

  if (kind === 'newton') {
    let zx = cRe, zy = cIm;
    for (let i = 0; i < n; i++) {
      const z2x = zx * zx - zy * zy;
      const z2y = 2 * zx * zy;
      const z3x = z2x * zx - z2y * zy;
      const z3y = z2x * zy + z2y * zx;
      const numx = z3x - 1, numy = z3y;
      const denx = 3 * z2x, deny = 3 * z2y;
      const d2 = denx * denx + deny * deny;
      if (d2 < 1e-20) return { escaped: false, iter: i, zx, zy, root: -1 };
      const sx = (numx * denx + numy * deny) / d2;
      const sy = (numy * denx - numx * deny) / d2;
      zx -= sx;
      zy -= sy;
      if (Math.hypot(numx, numy) < (bailout ?? 1e-6)) {
        const roots = [[1, 0], [-0.5, 0.8660254], [-0.5, -0.8660254]];
        let best = 0, bestD = Infinity;
        for (let r = 0; r < 3; r++) {
          const d = Math.hypot(zx - roots[r][0], zy - roots[r][1]);
          if (d < bestD) { bestD = d; best = r; }
        }
        return { escaped: true, iter: i, zx, zy, root: best, smooth: i };
      }
    }
    return { escaped: false, iter: n, zx, zy, root: -1 };
  }

  let zx = kind === 'julia' ? cRe : 0;
  let zy = kind === 'julia' ? cIm : 0;
  const sx = kind === 'julia' ? (juliaX ?? 0) : cRe;
  const sy = kind === 'julia' ? (juliaY ?? 0) : cIm;

  for (let i = 0; i < n; i++) {
    if (kind === 'burning') {
      zx = Math.abs(zx);
      zy = Math.abs(zy);
    }
    // z^p via polar
    const r = Math.hypot(zx, zy);
    if (r < 1e-14) {
      zx = sx;
      zy = sy;
      continue;
    }
    const a = Math.atan2(zy, zx);
    const rn = r ** p;
    zx = Math.cos(a * p) * rn + sx;
    zy = Math.sin(a * p) * rn + sy;
    const r2 = zx * zx + zy * zy;
    if (r2 > bail) {
      const nu = Math.log(Math.log(Math.sqrt(r2)) / Math.LN2) / Math.LN2;
      return { escaped: true, iter: i, smooth: i + 1 - nu, zx, zy, mag: Math.sqrt(r2) };
    }
  }
  return { escaped: false, iter: n, zx, zy, mag: Math.hypot(zx, zy) };
}

export function fmtComplex(re, im, digits = 6) {
  const a = re.toFixed(digits);
  const b = Math.abs(im).toFixed(digits);
  const sign = im >= 0 ? '+' : '-';
  return `${a} ${sign} ${b}i`;
}
