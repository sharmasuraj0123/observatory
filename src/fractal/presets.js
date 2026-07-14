// Curated fractal destinations: each is a shareable, tuned view.

export const PRESETS = [
  {
    id: 'mandel-classic',
    name: 'Mandelbrot · seahorse valley',
    family: 'escape',
    kind: 'mandelbrot',
    blurb:
      'The Mandelbrot set z ← z² + c. This view sits in the seahorse valley on the ' +
      'main cardioid: filaments, mini-bulbs, and infinite self-similarity.',
    params: {
      centerX: -0.743643887037151, centerY: 0.13182590420533,
      scale: 0.0025, maxIter: 420, power: 2, bailout: 256,
      palette: 'plasma', trap: 'none', smooth: true,
      colorScale: 1.8, glow: 1.05, exposure: 0.95,
    },
  },
  {
    id: 'mandel-overview',
    name: 'Mandelbrot · full set',
    family: 'escape',
    kind: 'mandelbrot',
    blurb:
      'The classic cardioid and period-2 bulb. Black is the connected interior; ' +
      'color encodes continuous escape potential.',
    params: {
      centerX: -0.5, centerY: 0,
      scale: 1.15, maxIter: 280, power: 2, bailout: 256,
      palette: 'neon', trap: 'none', smooth: true,
      colorScale: 2.2, glow: 1.1, exposure: 0.95,
    },
  },
  {
    id: 'mandel-mini',
    name: 'Mandelbrot · mini-copy',
    family: 'escape',
    kind: 'mandelbrot',
    blurb:
      'A miniature Mandelbrot nestled in a filament. Raise iterations as you zoom; ' +
      'structure persists at every scale.',
    params: {
      centerX: -1.768778833, centerY: 0.001738913,
      scale: 2.5e-5, maxIter: 900, power: 2, bailout: 256,
      palette: 'ember', trap: 'none', smooth: true,
      colorScale: 1.4, glow: 1.055, exposure: 0.92,
    },
  },
  {
    id: 'mandel-spiral',
    name: 'Mandelbrot · double spiral',
    family: 'escape',
    kind: 'mandelbrot',
    blurb:
      'A famous double-spiral region where filaments wind into each other. Orbit ' +
      'traps turn geometric loci into luminous ribbons.',
    params: {
      centerX: -0.747, centerY: 0.1,
      scale: 0.0012, maxIter: 500, power: 2, bailout: 256,
      palette: 'aurora', trap: 'circle', smooth: true,
      colorScale: 1.3, glow: 1.05, exposure: 0.92,
    },
  },
  {
    id: 'julia-dragon',
    name: 'Julia · dragon',
    family: 'escape',
    kind: 'julia',
    blurb:
      'Julia sets fix c and vary z₀. Connected Julias live for c inside Mandelbrot; ' +
      'this c yields a classic dragon silhouette.',
    params: {
      centerX: 0, centerY: 0, scale: 1.35,
      maxIter: 380, power: 2, bailout: 256,
      juliaX: -0.8, juliaY: 0.156,
      palette: 'aurora', trap: 'circle', smooth: true,
      colorScale: 1.1, glow: 1.055, exposure: 0.92,
    },
  },
  {
    id: 'julia-rabbit',
    name: 'Julia · Douady rabbit',
    family: 'escape',
    kind: 'julia',
    blurb:
      'The Douady rabbit: a period-2 Julia whose components form three “ears.”',
    params: {
      centerX: 0, centerY: 0, scale: 1.25,
      maxIter: 420, power: 2, bailout: 256,
      juliaX: -0.123, juliaY: 0.745,
      palette: 'ice', trap: 'none', smooth: true,
      colorScale: 1.2, glow: 1.15, exposure: 0.92,
    },
  },
  {
    id: 'julia-sanmarco',
    name: 'Julia · San Marco',
    family: 'escape',
    kind: 'julia',
    blurb:
      'Near the cusp of the main cardioid: a Julia that looks like the Basilica of San Marco.',
    params: {
      centerX: 0, centerY: 0, scale: 1.4,
      maxIter: 360, power: 2, bailout: 256,
      juliaX: -0.75, juliaY: 0.0,
      palette: 'gold', trap: 'cross', smooth: true,
      colorScale: 1.0, glow: 1.05, exposure: 0.92,
    },
  },
  {
    id: 'burning-ship',
    name: 'Burning Ship',
    family: 'escape',
    kind: 'burning',
    blurb:
      'Burning Ship folds with absolute values before squaring, producing ship-like ' +
      'silhouettes and a different bulb hierarchy.',
    params: {
      centerX: -1.76, centerY: -0.03,
      scale: 0.045, maxIter: 320, power: 2, bailout: 256,
      palette: 'ember', trap: 'none', smooth: true,
      colorScale: 1.25, glow: 1.05, exposure: 0.92,
    },
  },
  {
    id: 'newton-cubic',
    name: 'Newton · z^3 - 1',
    family: 'escape',
    kind: 'newton',
    blurb:
      'Newton basins for p(z) = z^3 - 1. Three colored basins meet on a fractal Julia set.',
    params: {
      centerX: 0, centerY: 0, scale: 1.55,
      maxIter: 64, power: 3, bailout: 1e-6,
      palette: 'neon', trap: 'none', smooth: true,
      colorScale: 1, glow: 1.1, exposure: 0.92,
    },
  },
  {
    id: 'mandelbulb',
    name: 'Mandelbulb · power 8',
    family: 'ray',
    kind: 'mandelbulb',
    blurb:
      'The Mandelbulb: spherical power folds in 3D. Distance-estimated raymarch with ' +
      'soft shadows, AO, and Fresnel rims.',
    params: {
      maxIter: 80, power: 8, bailout: 4,
      palette: 'plasma', glow: 1.2, exposure: 1.15,
      camTheta: 0.62, camPhi: 0.95, camDist: 2.85, autoOrbit: true,
    },
  },
  {
    id: 'mandelbulb-detail',
    name: 'Mandelbulb · close',
    family: 'ray',
    kind: 'mandelbulb',
    blurb:
      'A closer orbit of the power-8 bulb. Drag to revolve; scroll to dolly.',
    params: {
      maxIter: 90, power: 8, bailout: 4,
      palette: 'neon', glow: 1.25, exposure: 1.18,
      camTheta: 1.05, camPhi: 0.4, camDist: 2.15, autoOrbit: false,
    },
  },
  {
    id: 'quat-julia',
    name: 'Quaternion Julia',
    family: 'ray',
    kind: 'quatjulia',
    blurb:
      'A 3D slice of a 4D quaternion Julia. Glassy coral surfaces from DE raymarching.',
    params: {
      maxIter: 22, power: 2, bailout: 4,
      juliaX: -0.2, juliaY: 0.6, juliaZ: 0.2, juliaW: 0.2,
      palette: 'aurora', glow: 1.2, exposure: 1.15,
      camTheta: 0.45, camPhi: 1.15, camDist: 3.2, autoOrbit: true,
    },
  },
  {
    id: 'ifs-fern',
    name: 'IFS · Barnsley fern',
    family: 'ifs',
    kind: 'fern',
    blurb:
      'Four affine maps with probabilities converge to a fern attractor (dim ≈ 1.71).',
    params: { points: 240000, size: 1.1, palette: 'fern' },
  },
  {
    id: 'ifs-sierpinski',
    name: 'IFS · Sierpiński',
    family: 'ifs',
    kind: 'sierpinski',
    blurb:
      'Chaos-game gasket. Dimension log(3)/log(2) ≈ 1.585.',
    params: { points: 200000, size: 1.2, palette: 'ice' },
  },
  {
    id: 'ifs-dragon',
    name: 'IFS · dragon curve',
    family: 'ifs',
    kind: 'dragon',
    blurb:
      'Heighway dragon as two contractions. A curve of infinite length filling area.',
    params: { points: 220000, size: 1.15, palette: 'ember' },
  },
  {
    id: 'ifs-maple',
    name: 'IFS · maple leaf',
    family: 'ifs',
    kind: 'maple',
    blurb:
      'Botanical IFS leaf: skewed contractions compose a maple silhouette.',
    params: { points: 230000, size: 1.05, palette: 'autumn' },
  },
];

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}
