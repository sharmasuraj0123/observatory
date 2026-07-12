// Procedural equirectangular textures for bodies without photographic maps
// (moons of the outer planets, Pluto, Ceres, comet nuclei).

import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoiseGrid(rng, gw, gh) {
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return g;
}

function sampleGrid(g, gw, gh, x, y) {
  // wraps horizontally so the texture seam is continuous
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % gw) + gw) % gw, x1 = (x0 + 1) % gw;
  const y0 = Math.min(Math.max(yi, 0), gh - 1), y1 = Math.min(y0 + 1, gh - 1);
  const a = g[y0 * gw + x0], b = g[y0 * gw + x1];
  const c = g[y1 * gw + x0], d = g[y1 * gw + x1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbmFactory(rng, octaves = 5) {
  const grids = [];
  for (let o = 0; o < octaves; o++) {
    const gw = 8 << o, gh = 4 << o;
    grids.push({ g: makeNoiseGrid(rng, gw, gh), gw, gh });
  }
  return (u, v, scale = 1) => {
    let val = 0, amp = 0.5, tot = 0;
    for (const { g, gw, gh } of grids) {
      val += amp * sampleGrid(g, gw, gh, u * gw * scale, v * gh * scale);
      tot += amp;
      amp *= 0.5;
    }
    return val / tot;
  };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function mixColor(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Style recipes. base/high are RGB triplets 0-255.
const RECIPES = {
  io:        { seed: 11, base: [212, 178, 66],  high: [246, 236, 170], contrast: 1.3, spots: { n: 34, color: [60, 30, 12], rMax: 0.05 }, spots2: { n: 14, color: [235, 245, 240], rMax: 0.02 } },
  europa:    { seed: 21, base: [196, 172, 142], high: [235, 228, 214], contrast: 0.5, cracks: { n: 42, color: [148, 84, 48], alpha: 0.5 } },
  ganymede:  { seed: 31, base: [122, 108, 96],  high: [186, 176, 164], contrast: 1.0, craters: 26 },
  callisto:  { seed: 41, base: [80, 70, 60],    high: [150, 138, 122], contrast: 1.2, craters: 60 },
  titan:     { seed: 51, base: [193, 125, 42],  high: [226, 178, 96],  contrast: 0.35 },
  enceladus: { seed: 61, base: [225, 232, 238], high: [250, 252, 255], contrast: 0.3, cracks: { n: 12, color: [140, 175, 200], alpha: 0.4 } },
  mimas:     { seed: 71, base: [140, 138, 134], high: [190, 188, 184], contrast: 0.8, craters: 34, bigCrater: true },
  tethys:    { seed: 81, base: [176, 174, 170], high: [222, 220, 216], contrast: 0.7, craters: 24 },
  dione:     { seed: 91, base: [168, 164, 158], high: [216, 212, 206], contrast: 0.8, craters: 22, cracks: { n: 16, color: [230, 232, 235], alpha: 0.35 } },
  rhea:      { seed: 101, base: [150, 146, 140], high: [200, 196, 190], contrast: 0.9, craters: 30 },
  iapetus:   { seed: 111, base: [180, 172, 160], high: [222, 216, 206], contrast: 0.9, craters: 22, twoTone: true },
  miranda:   { seed: 121, base: [138, 138, 142], high: [190, 190, 196], contrast: 1.2, cracks: { n: 22, color: [90, 90, 96], alpha: 0.5 } },
  ariel:     { seed: 131, base: [160, 160, 164], high: [210, 210, 214], contrast: 0.8, craters: 16 },
  umbriel:   { seed: 141, base: [92, 92, 96],   high: [136, 136, 142], contrast: 0.7, craters: 22 },
  titania:   { seed: 151, base: [150, 142, 136], high: [198, 190, 184], contrast: 0.8, craters: 18 },
  oberon:    { seed: 161, base: [134, 124, 116], high: [182, 172, 164], contrast: 0.9, craters: 24 },
  triton:    { seed: 171, base: [210, 198, 190], high: [240, 234, 226], contrast: 0.5, spots: { n: 20, color: [150, 120, 105], rMax: 0.035 }, polarCap: [255, 240, 235] },
  pluto:     { seed: 181, base: [186, 148, 108], high: [232, 212, 186], contrast: 1.1, spots: { n: 10, color: [70, 45, 30], rMax: 0.09 }, heart: true },
  charon:    { seed: 191, base: [140, 132, 126], high: [186, 178, 172], contrast: 0.8, craters: 14, polarSpot: [110, 70, 55] },
  ceres:     { seed: 201, base: [110, 104, 98],  high: [156, 150, 144], contrast: 0.9, craters: 40, spots2: { n: 4, color: [250, 250, 245], rMax: 0.012 } },
  phobos:    { seed: 211, base: [96, 86, 78],   high: [140, 128, 118], contrast: 1.2, craters: 30 },
  deimos:    { seed: 221, base: [118, 108, 98], high: [160, 148, 138], contrast: 0.9, craters: 16 },
  halley:    { seed: 231, base: [46, 42, 40],   high: [80, 74, 70],   contrast: 1.3, craters: 12 },
};

export function proceduralTexture(kind) {
  const r = RECIPES[kind] || RECIPES.callisto;
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(r.seed);
  const fbm = fbmFactory(rng);
  const img = ctx.createImageData(W, H);
  const px = img.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      let n = fbm(u, v);
      n = 0.5 + (n - 0.5) * r.contrast;
      n = Math.min(Math.max(n, 0), 1);
      let c = mixColor(r.base, r.high, n);
      if (r.twoTone) {
        // Iapetus-style dark leading hemisphere
        const dark = 0.5 + 0.5 * Math.cos((u - 0.25) * Math.PI * 2);
        const t = Math.min(Math.max((dark - 0.35) * 3, 0), 1);
        c = mixColor(c, [52, 38, 28], t * 0.85);
      }
      if (r.polarCap) {
        const t = Math.min(Math.max((Math.abs(v - 0.5) - 0.28) * 6, 0), 1);
        c = mixColor(c, r.polarCap, t);
      }
      const idx = (y * W + x) * 4;
      px[idx] = c[0]; px[idx + 1] = c[1]; px[idx + 2] = c[2]; px[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  if (r.craters) drawCraters(ctx, rng, W, H, r.craters, r.bigCrater);
  if (r.spots) drawSpots(ctx, rng, W, H, r.spots);
  if (r.spots2) drawSpots(ctx, rng, W, H, r.spots2);
  if (r.cracks) drawCracks(ctx, rng, W, H, r.cracks);
  if (r.heart) drawHeart(ctx, W, H);
  if (r.polarSpot) {
    ctx.fillStyle = `rgba(${r.polarSpot.join(',')},0.75)`;
    ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.06, W * 0.5, H * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function drawCraters(ctx, rng, W, H, n, big) {
  for (let i = 0; i < n; i++) {
    const x = rng() * W, y = H * (0.08 + rng() * 0.84);
    const rad = (0.006 + rng() * rng() * 0.035) * W;
    const g = ctx.createRadialGradient(x, y, rad * 0.15, x, y, rad);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(0.72, 'rgba(0,0,0,0.12)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  if (big) {
    // Herschel-style single large crater
    const x = W * 0.3, y = H * 0.52, rad = W * 0.07;
    const g = ctx.createRadialGradient(x, y, rad * 0.1, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.25)');
    g.addColorStop(0.35, 'rgba(0,0,0,0.3)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
}

function drawSpots(ctx, rng, W, H, spec) {
  for (let i = 0; i < spec.n; i++) {
    const x = rng() * W, y = H * (0.1 + rng() * 0.8);
    const rad = (0.15 + rng() * 0.85) * spec.rMax * W;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${spec.color.join(',')},0.55)`);
    g.addColorStop(1, `rgba(${spec.color.join(',')},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
}

function drawCracks(ctx, rng, W, H, spec) {
  ctx.strokeStyle = `rgba(${spec.color.join(',')},${spec.alpha})`;
  for (let i = 0; i < spec.n; i++) {
    ctx.lineWidth = 0.6 + rng() * 1.6;
    let x = rng() * W, y = rng() * H;
    let ang = rng() * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x, y);
    const steps = 14 + Math.floor(rng() * 26);
    for (let s = 0; s < steps; s++) {
      ang += (rng() - 0.5) * 0.7;
      x += Math.cos(ang) * 9;
      y += Math.sin(ang) * 4;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawHeart(ctx, W, H) {
  // Sputnik Planitia style bright region
  const x = W * 0.62, y = H * 0.6;
  const g = ctx.createRadialGradient(x, y, 0, x, y, W * 0.09);
  g.addColorStop(0, 'rgba(245,235,220,0.85)');
  g.addColorStop(0.7, 'rgba(240,228,210,0.5)');
  g.addColorStop(1, 'rgba(240,228,210,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, W * 0.09, H * 0.14, 0.3, 0, Math.PI * 2); ctx.fill();
}

// Soft radial sprite used for coronas, comet comas and star glows.
export function radialSpriteTexture(stops, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Thin ring texture for lens flare ghosts.
export function flareRingTexture(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.72, 'rgba(255,235,210,0)');
  g.addColorStop(0.82, 'rgba(255,235,210,0.55)');
  g.addColorStop(0.92, 'rgba(255,235,210,0)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Faint dusty ring strip for Uranus (radial gradient sampled along u).
export function uranusRingTexture() {
  const W = 256, H = 4;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let x = 0; x < W; x++) {
    const u = x / W;
    // epsilon ring bright near outer edge, faint inner ringlets
    let a = 0.05;
    for (const [c, w, s] of [[0.18, 0.01, 0.25], [0.32, 0.012, 0.2], [0.5, 0.014, 0.3], [0.68, 0.012, 0.25], [0.95, 0.028, 0.9]]) {
      a += s * Math.exp(-((u - c) * (u - c)) / (w * w));
    }
    a = Math.min(a, 1);
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      img.data[i] = 168; img.data[i + 1] = 172; img.data[i + 2] = 178;
      img.data[i + 3] = Math.floor(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
