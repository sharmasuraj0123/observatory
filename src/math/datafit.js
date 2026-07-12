// Dataset parsing and rough equation guessing for the Equation Lab.
//
// Fitting strategy: per axis, least-squares fit a family of small models
// (constant, linear, quadratic, cubic, sinusoid, sinusoid + drift, damped
// sinusoid, exponential) and keep the best adjusted R^2 with a mild
// complexity penalty. Nonlinear frequencies / decay rates are handled with a
// coarse grid search wrapped around a linear solve. Times are measured from
// the first sample, so expressions use t starting at 0.

// ---------------- parsing ----------------

function isMonotonic(rows, col) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][col] <= rows[i - 1][col]) return false;
  }
  return true;
}

const MAPPINGS = {
  txyz: ['t', 'x', 'y', 'z'],
  txy: ['t', 'x', 'y'],
  tx: ['t', 'x'],
  xyz: ['x', 'y', 'z'],
  xy: ['x', 'y'],
  x: ['x'],
};

export function parseDataset(text, fmt = 'auto') {
  const rows = [];
  for (const line of (text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const parts = trimmed.split(/[,;\t ]+/).map(Number);
    if (parts.some(Number.isNaN)) {
      if (!rows.length) continue; // header row
      return { error: `Row "${trimmed.slice(0, 40)}" is not numeric` };
    }
    rows.push(parts);
  }
  if (rows.length < 3) return { error: 'Need at least 3 numeric rows' };
  const w = rows[0].length;
  if (rows.some((r) => r.length !== w)) return { error: 'Rows have different column counts' };
  if (w > 4) return { error: 'Use at most 4 columns: [t,] x [, y [, z]]' };

  let mapping = fmt;
  if (fmt === 'auto') {
    if (w === 4) mapping = 'txyz';
    else if (w === 3) mapping = isMonotonic(rows, 0) ? 'txy' : 'xyz';
    else if (w === 2) mapping = isMonotonic(rows, 0) ? 'tx' : 'xy';
    else mapping = 'x';
  }
  const cols = MAPPINGS[mapping];
  if (!cols || cols.length !== w) {
    return { error: `Format "${mapping}" expects ${cols ? cols.length : '?'} columns, data has ${w}` };
  }
  if (cols[0] === 't' && !isMonotonic(rows, 0)) {
    return { error: 'The time column must be strictly increasing' };
  }

  const pts = rows.map((r, i) => {
    const p = { t: i, x: 0, y: 0, z: 0 };
    cols.forEach((name, c) => { p[name] = r[c]; });
    return p;
  });
  const t0 = pts[0].t;
  for (const p of pts) p.t -= t0; // expressions use t from 0
  return { pts, mapping, n: pts.length, axes: cols.filter((c) => c !== 't') };
}

// ---------------- linear algebra ----------------

// solve (X^T X) beta = X^T y for small systems via Gaussian elimination
function lsqSolve(X, y) {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Float64Array(p + 1));
  for (let i = 0; i < X.length; i++) {
    const xi = X[i];
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) A[a][b] += xi[a] * xi[b];
      A[a][p] += xi[a] * y[i];
    }
  }
  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c <= p; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row, i) => row[p] / row[i]);
}

function rSquared(ys, preds) {
  let mean = 0;
  for (const v of ys) mean += v;
  mean /= ys.length;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < ys.length; i++) {
    ssTot += (ys[i] - mean) ** 2;
    ssRes += (ys[i] - preds[i]) ** 2;
  }
  if (ssTot < 1e-12) return ssRes < 1e-9 ? 1 : 0;
  return 1 - ssRes / ssTot;
}

// ---------------- expression assembly ----------------

function sig(v) {
  if (!Number.isFinite(v)) return '0';
  if (Math.abs(v) < 1e-10) return '0';
  const s = Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3
    ? v.toExponential(2)
    : parseFloat(v.toPrecision(4)).toString();
  return s;
}

function joinTerms(terms) {
  const kept = terms.filter((t) => t && t !== '0');
  if (!kept.length) return '0';
  let out = kept[0];
  for (let i = 1; i < kept.length; i++) {
    out += kept[i].startsWith('-') ? ` - ${kept[i].slice(1)}` : ` + ${kept[i]}`;
  }
  return out;
}

function term(coef, sym) {
  if (Math.abs(coef) < 1e-10) return '0';
  if (!sym) return sig(coef);
  const c = sig(coef);
  if (c === '1') return sym;
  if (c === '-1') return `-${sym}`;
  return `${c} ${sym}`;
}

// amplitude-phase form from a sin + b cos
function sinPhase(a, b, w) {
  const A = Math.hypot(a, b);
  const phi = Math.atan2(b, a);
  const inner = joinTerms([term(w, 't'), Math.abs(phi) < 1e-9 ? '0' : sig(phi)]);
  return { A, str: `${sig(A)} sin(${inner})` };
}

// ---------------- per-axis model search ----------------

function evalPoly(beta, t) {
  let v = 0;
  for (let k = beta.length - 1; k >= 0; k--) v = v * t + beta[k];
  return v;
}

export function fitAxis(ts, ys) {
  const n = ts.length;
  const span = ts[n - 1] - ts[0] || 1;
  const candidates = [];

  // polynomials, degree 0 to 3
  for (let deg = 0; deg <= 3; deg++) {
    if (n < deg + 3 && deg > 0) continue;
    const X = ts.map((t) => Array.from({ length: deg + 1 }, (_, k) => t ** k));
    const beta = lsqSolve(X, ys);
    if (!beta) continue;
    const preds = ts.map((t) => evalPoly(beta, t));
    const names = ['', 't', 't^2', 't^3'];
    const expr = joinTerms(beta.map((b, k) => term(b, names[k])).reverse());
    candidates.push({ kind: deg === 0 ? 'constant' : deg === 1 ? 'linear' : `poly${deg}`, params: deg + 1, expr, r2: rSquared(ys, preds) });
  }

  // sinusoid family: grid the angular frequency, solve the rest linearly
  const wMin = (2 * Math.PI) / (span * 4);
  const wMax = (2 * Math.PI * Math.min(40, n / 3)) / span;
  const steps = 160;
  const trySin = (withDrift) => {
    let best = null;
    for (let i = 0; i <= steps; i++) {
      const w = wMin * (wMax / wMin) ** (i / steps);
      const X = ts.map((t) => withDrift
        ? [Math.sin(w * t), Math.cos(w * t), t, 1]
        : [Math.sin(w * t), Math.cos(w * t), 1]);
      const beta = lsqSolve(X, ys);
      if (!beta) continue;
      const preds = ts.map((t, j) => X[j].reduce((s, v, k) => s + v * beta[k], 0));
      const r2 = rSquared(ys, preds);
      if (!best || r2 > best.r2) best = { w, beta, r2 };
    }
    if (!best) return;
    const { str } = sinPhase(best.beta[0], best.beta[1], best.w);
    const rest = withDrift
      ? [term(best.beta[2], 't'), term(best.beta[3], '')]
      : [term(best.beta[2], '')];
    candidates.push({
      kind: withDrift ? 'sinusoid + drift' : 'sinusoid',
      params: withDrift ? 4 : 3,
      expr: joinTerms([str, ...rest]),
      r2: best.r2,
    });
  };
  if (n >= 6) { trySin(false); trySin(true); }

  // damped sinusoid: A e^(k t) sin(w t + p) + C over a (k, w) grid
  if (n >= 8) {
    let best = null;
    for (let ki = 0; ki <= 12; ki++) {
      const k = -3 * (ki / 12) / span * 4; // 0 .. -12/span
      for (let i = 0; i <= 60; i++) {
        const w = wMin * (wMax / wMin) ** (i / 60);
        const X = ts.map((t) => {
          const e = Math.exp(k * t);
          return [e * Math.sin(w * t), e * Math.cos(w * t), 1];
        });
        const beta = lsqSolve(X, ys);
        if (!beta) continue;
        const preds = ts.map((t, j) => X[j].reduce((s, v, kk) => s + v * beta[kk], 0));
        const r2 = rSquared(ys, preds);
        if (!best || r2 > best.r2) best = { k, w, beta, r2 };
      }
    }
    if (best && best.k < -1e-9) {
      const { str } = sinPhase(best.beta[0], best.beta[1], best.w);
      candidates.push({
        kind: 'damped sinusoid',
        params: 5,
        expr: joinTerms([`exp(${sig(best.k)} t) (${str})`, term(best.beta[2], '')]),
        r2: best.r2,
      });
    }
  }

  // exponential: A e^(k t) + C over a k grid
  if (n >= 5) {
    let best = null;
    for (let i = -30; i <= 30; i++) {
      if (i === 0) continue;
      const k = (i / 30) * (6 / span);
      const X = ts.map((t) => [Math.exp(k * t), 1]);
      const beta = lsqSolve(X, ys);
      if (!beta) continue;
      const preds = ts.map((t, j) => beta[0] * X[j][0] + beta[1]);
      const r2 = rSquared(ys, preds);
      if (!best || r2 > best.r2) best = { k, beta, r2 };
    }
    if (best) {
      candidates.push({
        kind: 'exponential',
        params: 3,
        expr: joinTerms([`${sig(best.beta[0])} exp(${sig(best.k)} t)`, term(best.beta[1], '')]),
        r2: best.r2,
      });
    }
  }

  // adjusted score with a mild complexity penalty
  let winner = null;
  for (const c of candidates) {
    const dof = Math.max(1, n - c.params - 1);
    const adj = 1 - (1 - c.r2) * (n - 1) / dof;
    c.score = adj - c.params * 0.004;
    if (!winner || c.score > winner.score) winner = c;
  }
  return winner;
}

export function fitDataset(pts, axes) {
  const ts = pts.map((p) => p.t);
  const out = {};
  for (const axis of axes) {
    out[axis] = fitAxis(ts, pts.map((p) => p[axis]));
  }
  return out;
}

export const SAMPLE_DATA = (() => {
  const lines = ['# t  x  y  z  (a rising helix, try Fit)'];
  for (let i = 0; i <= 60; i++) {
    const t = i * 0.2;
    lines.push([
      t.toFixed(2),
      (6 * Math.sin(1.5 * t)).toFixed(3),
      (6 * Math.cos(1.5 * t)).toFixed(3),
      (0.9 * t).toFixed(3),
    ].join('  '));
  }
  return lines.join('\n');
})();
