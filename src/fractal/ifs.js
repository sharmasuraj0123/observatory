// Dense IFS attractors with richer color ramps for additive point clouds.

function mulAffine(a, x, y) {
  return [a[0] * x + a[1] * y + a[2], a[3] * x + a[4] * y + a[5]];
}

function pick(maps) {
  let r = Math.random();
  for (const m of maps) {
    r -= m.p;
    if (r <= 0) return m.a;
  }
  return maps[maps.length - 1].a;
}

const SYSTEMS = {
  fern: [
    { p: 0.01, a: [0, 0, 0, 0, 0.16, 0] },
    { p: 0.85, a: [0.85, 0.04, 0, -0.04, 0.85, 1.6] },
    { p: 0.07, a: [0.2, -0.26, 0, 0.23, 0.22, 1.6] },
    { p: 0.07, a: [-0.15, 0.28, 0, 0.26, 0.24, 0.44] },
  ],
  sierpinski: [
    { p: 1 / 3, a: [0.5, 0, 0, 0, 0.5, 0] },
    { p: 1 / 3, a: [0.5, 0, 0.5, 0, 0.5, 0] },
    { p: 1 / 3, a: [0.5, 0, 0.25, 0, 0.5, 0.433] },
  ],
  dragon: [
    { p: 0.5, a: [0.5, -0.5, 0, 0.5, 0.5, 0] },
    { p: 0.5, a: [-0.5, -0.5, 1, 0.5, -0.5, 0] },
  ],
  maple: [
    { p: 0.1, a: [0.14, 0.01, -0.08, 0, 0.51, -1.31] },
    { p: 0.35, a: [0.43, 0.52, 1.49, -0.45, 0.5, -0.75] },
    { p: 0.35, a: [0.45, -0.49, -1.62, 0.47, 0.47, -0.74] },
    { p: 0.2, a: [0.49, 0, 0.02, 0, 0.51, 1.62] },
  ],
};

const PALETTE_RGB = {
  fern: [0.2, 0.95, 0.4],
  ice: [0.45, 0.8, 1.0],
  ember: [1.0, 0.4, 0.15],
  autumn: [1.0, 0.55, 0.12],
  aurora: [0.3, 1.0, 0.75],
  plasma: [0.9, 0.35, 1.0],
};

export function generateIFS(kind, count = 160000, palette = 'fern') {
  count = Math.max(1, Math.floor(count));
  const maps = SYSTEMS[kind] || SYSTEMS.fern;
  const base = PALETTE_RGB[palette] || PALETTE_RGB.fern;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let x = 0, y = 0;
  const warm = Math.min(40, Math.max(5, Math.floor(count * 0.08)));
  for (let i = 0; i < warm; i++) [x, y] = mulAffine(pick(maps), x, y);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const raw = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    [x, y] = mulAffine(pick(maps), x, y);
    raw[i * 2] = x;
    raw[i * 2 + 1] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  // For tiny samples, expand bounds so framing still looks right
  if (count < 20) {
    minX = Math.min(minX, -1); maxX = Math.max(maxX, 1);
    minY = Math.min(minY, -1); maxY = Math.max(maxY, 1);
  }
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const span = Math.max(maxX - minX, maxY - minY, 1e-9);
  const s = 22 / span;
  for (let i = 0; i < count; i++) {
    const px = (raw[i * 2] - cx) * s;
    const py = (raw[i * 2 + 1] - cy) * s;
    const t = count > 1 ? i / (count - 1) : 0;
    const radial = Math.hypot(px, py) / 22;
    pos[i * 3] = px;
    pos[i * 3 + 1] = py;
    pos[i * 3 + 2] = 0;
    const pulse = 0.55 + 0.45 * Math.pow(1.0 - radial, 0.55);
    col[i * 3] = Math.min(1.35, base[0] * pulse * (0.9 + 0.25 * t));
    col[i * 3 + 1] = Math.min(1.35, base[1] * pulse * (0.95 + 0.15 * (1 - t)));
    col[i * 3 + 2] = Math.min(1.35, base[2] * pulse * (1.05 - 0.15 * radial));
  }
  return { positions: pos, colors: col, count, bounds: { span, cx, cy } };
}

export const IFS_DIM = {
  fern: 1.71,
  sierpinski: Math.log(3) / Math.log(2),
  dragon: 2.0,
  maple: 1.65,
};
