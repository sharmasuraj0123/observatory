// Curated optical-bench presets for the Light Lab.
// Geometry is in millimeters; the scene maps 1 unit = 1 mm.
// Surfaces use Cauchy materials from optics.js.

import { MATERIALS, lensmakerF } from './optics.js';

const air = MATERIALS.air;
const bk7 = MATERIALS.bk7;
const water = MATERIALS.water;
const silica = MATERIALS.fusedSilica;
const diamond = MATERIALS.diamond;

function linspace(a, b, n) {
  if (n <= 1) return [a];
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + (b - a) * (i / (n - 1)));
  return out;
}

function spectrum(n = 9) {
  // visible band sample; denser near the eye's peak for prettier fans
  return linspace(420, 680, n);
}

function mono(nm = 550) { return [nm]; }

export const PRESETS = [
  {
    id: 'snell',
    name: 'Air → glass',
    blurb: 'Snell\'s law at a flat BK7 interface. Drag the launch angle and watch θt track n1 sin θi = n2 sin θt. Fresnel reflectance climbs toward grazing.',
    camera: { pos: [-40, 30, 220], target: [40, 0, 0] },
    source: { x: -80, y: 0 },
    angles: linspace(-35, 35, 11),
    wavelengths: mono(550),
    ambient: air,
    params: {
      angle: { label: 'Fan half-angle', unit: '°', min: 5, max: 60, step: 1, value: 35 },
      rays: { label: 'Rays per λ', unit: '', min: 3, max: 21, step: 2, value: 11 },
    },
    build(p) {
      const half = p.angle ?? 35;
      const n = p.rays ?? 11;
      return {
        angles: linspace(-half, half, n),
        wavelengths: mono(550),
        surfaces: [
          {
            kind: 'plane', label: 'BK7 face',
            px: 0, py: 0, nx: -1, ny: 0, halfH: 55,
            matA: air, matB: bk7,
          },
          {
            kind: 'stop', label: 'Far detector', absorb: true,
            px: 120, py: 0, nx: -1, ny: 0, halfH: 70,
            matA: bk7, matB: bk7,
          },
        ],
        elements: [
          { type: 'block', x: 60, y: 0, w: 120, h: 110, mat: 'bk7', label: 'BK7' },
          { type: 'detector', x: 120, y: 0, h: 140 },
        ],
        annotations: [
          { kind: 'normal', x: 0, y: 0, nx: -1, ny: 0 },
          { kind: 'note', x: 0, y: 70, text: 'n₁ sin θᵢ = n₂ sin θₜ' },
        ],
      };
    },
    verify(rays) {
      // check Snell residual on first refraction of the central ray
      const mid = rays.find((r) => Math.abs(r.angleDeg) < 0.01) || rays[Math.floor(rays.length / 2)];
      const ev = mid && mid.events.find((e) => e.kind === 'refract');
      if (!ev) return null;
      return {
        label: 'Snell residual |n₁sinθᵢ − n₂sinθₜ|',
        value: Math.abs(ev.snellCheck).toExponential(2),
        ok: Math.abs(ev.snellCheck) < 1e-10,
      };
    },
  },

  {
    id: 'tir',
    name: 'Total internal reflection',
    blurb: 'Glass → air past the critical angle. Rays steeper than θc ≈ 41.2° for BK7 reflect with R = 1; shallower ones refract out. The critical angle is marked.',
    camera: { pos: [-20, 20, 200], target: [30, 0, 0] },
    source: { x: -30, y: -35 },
    ambient: bk7,
    params: {
      angle: { label: 'Fan half-angle', unit: '°', min: 10, max: 70, step: 1, value: 55 },
      rays: { label: 'Rays', unit: '', min: 5, max: 25, step: 2, value: 15 },
    },
    build(p) {
      const half = p.angle ?? 55;
      const n = p.rays ?? 15;
      // launch from inside glass toward a vertical air interface at x=40
      return {
        angles: linspace(0, half, n), // from normal toward grazing
        wavelengths: mono(532),
        ambient: bk7,
        source: { x: -10, y: -40 },
        surfaces: [
          {
            kind: 'plane', label: 'Glass → air',
            px: 40, py: 0, nx: -1, ny: 0, halfH: 70,
            matA: bk7, matB: air,
          },
        ],
        elements: [
          { type: 'block', x: -10, y: 0, w: 100, h: 140, mat: 'bk7', label: 'BK7' },
          { type: 'critical', x: 40, y: 0, n1: 1.516, n2: 1.000 },
        ],
        annotations: [
          { kind: 'note', x: 40, y: 80, text: 'θc = arcsin(n₂/n₁) ≈ 41.2°' },
        ],
      };
    },
  },

  {
    id: 'prism',
    name: 'Prism dispersion',
    blurb: 'An equilateral BK7 prism. Cauchy dispersion n(λ) = A + B/λ² splits white light into a spectrum: violet bends more than red. Click any ray for its λ, θi, θt and OPL.',
    camera: { pos: [20, 30, 240], target: [30, 5, 0] },
    source: { x: -90, y: 8 },
    ambient: air,
    params: {
      apex: { label: 'Apex angle', unit: '°', min: 40, max: 70, step: 1, value: 60 },
      rays: { label: 'Spatial rays', unit: '', min: 1, max: 7, step: 1, value: 3 },
      bands: { label: 'Wavelengths', unit: '', min: 5, max: 15, step: 2, value: 11 },
    },
    build(p) {
      const apex = (p.apex ?? 60) * Math.PI / 180;
      const half = apex / 2;
      // equilateral-ish prism centered near origin; faces meet at apex on top
      const cx = 10, cy = 0;
      const h = 55;
      // left face normal (pointing outward / left-up)
      const nL = { nx: -Math.cos(half), ny: Math.sin(half) };
      const nR = { nx: Math.cos(half), ny: Math.sin(half) };
      // face midpoints
      const left = { px: cx - 28, py: cy };
      const right = { px: cx + 28, py: cy };
      const nBands = p.bands ?? 11;
      const nRays = p.rays ?? 3;
      return {
        angles: linspace(-2, 2, nRays),
        wavelengths: spectrum(nBands),
        surfaces: [
          {
            kind: 'plane', label: 'Prism entry',
            px: left.px, py: left.py, nx: nL.nx, ny: nL.ny, halfH: h,
            matA: air, matB: bk7,
          },
          {
            kind: 'plane', label: 'Prism exit',
            px: right.px, py: right.py, nx: nR.nx, ny: nR.ny, halfH: h,
            matA: bk7, matB: air,
          },
          {
            kind: 'stop', label: 'Screen', absorb: true,
            px: 140, py: 0, nx: -1, ny: 0, halfH: 90,
            matA: air, matB: air,
          },
        ],
        elements: [
          { type: 'prism', cx, cy, apexDeg: p.apex ?? 60, size: 70, mat: 'bk7' },
          { type: 'detector', x: 140, y: 0, h: 180, spectrum: true },
        ],
      };
    },
  },

  {
    id: 'lens',
    name: 'Biconvex lens',
    blurb: 'Parallel rays through a real BK7 biconvex lens (two spherical surfaces). They converge near the lensmaker focal point. Raise the fan angle to see spherical aberration: outer rays focus short.',
    camera: { pos: [40, 20, 260], target: [40, 0, 0] },
    source: { x: -100, y: 0 },
    ambient: air,
    params: {
      R: { label: 'Surface |R|', unit: 'mm', min: 40, max: 160, step: 2, value: 80 },
      thick: { label: 'Thickness', unit: 'mm', min: 4, max: 30, step: 1, value: 12 },
      rays: { label: 'Rays', unit: '', min: 5, max: 21, step: 2, value: 11 },
      halfH: { label: 'Aperture', unit: 'mm', min: 10, max: 40, step: 1, value: 28 },
    },
    build(p) {
      const R = p.R ?? 80;
      const d = p.thick ?? 12;
      const halfH = p.halfH ?? 28;
      const n = p.rays ?? 11;
      // Cartesian sign convention (light +x): R > 0 if center is to the right
      // of the surface. Biconvex: R1 = +R, R2 = -R.
      // Front vertex at x=0, center at +R. Back vertex at x=d, center at d-R.
      const c1 = R;
      const c2 = d - R;
      const nGlass = 1.5168; // BK7 @ 550 nm approx
      const f = lensmakerF(nGlass, R, -R, d);
      return {
        wavelengths: mono(550),
        source: { x: -120, y: 0 },
        angles: [0],
        bundle: linspace(-halfH * 0.85, halfH * 0.85, n),
        surfaces: [
          {
            kind: 'sphere', label: 'Lens front',
            // radial normal points out of the sphere; glass sits inside near the
            // vertex, so matA (normal side) = air, matB = glass
            cx: c1, cy: 0, R, halfH, matA: air, matB: bk7,
            xMin: -1, xMax: d * 0.5 + 1, // only the object-side cap
          },
          {
            kind: 'sphere', label: 'Lens back',
            // back surface: glass inside this sphere near the vertex too
            cx: c2, cy: 0, R, halfH, matA: air, matB: bk7,
            xMin: d * 0.5 - 1, xMax: d + R * 0.2,
          },
          {
            kind: 'stop', label: 'Image plane', absorb: true,
            px: f + d / 2, py: 0, nx: -1, ny: 0, halfH: 50,
            matA: air, matB: air,
          },
        ],
        elements: [
          { type: 'lens', c1, c2, R, d, halfH, mat: 'bk7' },
          { type: 'focus', x: f + d / 2, y: 0, label: `f ≈ ${f.toFixed(1)} mm` },
          { type: 'detector', x: f + d / 2, y: 0, h: 100 },
        ],
        meta: { f, d, R },
      };
    },
    verify(rays, meta) {
      if (!meta || !meta.f) return null;
      // measure where the outermost and paraxial rays cross the axis after the lens
      return {
        label: 'Lensmaker f (550 nm)',
        value: `${meta.f.toFixed(2)} mm`,
        ok: true,
      };
    },
  },

  {
    id: 'mirror',
    name: 'Concave mirror',
    blurb: 'A spherical mirror of radius R focuses a collimated bundle at R/2. Outer rays show spherical aberration. Reflectance is set to 0.95 (front-surface aluminium).',
    camera: { pos: [-40, 20, 220], target: [-20, 0, 0] },
    source: { x: -140, y: 0 },
    ambient: air,
    params: {
      R: { label: 'Radius |R|', unit: 'mm', min: 60, max: 200, step: 5, value: 120 },
      rays: { label: 'Rays', unit: '', min: 5, max: 21, step: 2, value: 11 },
      halfH: { label: 'Aperture', unit: 'mm', min: 15, max: 50, step: 1, value: 35 },
    },
    build(p) {
      const R = p.R ?? 120;
      const halfH = p.halfH ?? 35;
      const n = p.rays ?? 11;
      // Concave mirror facing the object on the left: center of curvature sits
      // IN FRONT of the vertex (cx = -R), so the rim is closer to the object
      // than the vertex. f = R/2.
      const cx = -R;
      return {
        wavelengths: mono(590),
        source: { x: -140, y: 0 },
        angles: [0],
        bundle: linspace(-halfH * 0.85, halfH * 0.85, n),
        surfaces: [
          {
            kind: 'mirrorSphere', label: 'Concave mirror',
            cx, cy: 0, R, halfH,
            reflectance: 0.95,
            // active cap near the vertex (x≈0); reject the far side at x=-2R
            xMin: -R * 0.35, xMax: R * 0.05,
            matA: air, matB: air,
          },
        ],
        elements: [
          { type: 'mirrorSphere', cx, cy: 0, R, halfH },
          { type: 'focus', x: -R / 2, y: 0, label: `f = R/2 = ${(R / 2).toFixed(0)} mm` },
        ],
        meta: { f: R / 2 },
      };
    },
  },

  {
    id: 'slab',
    name: 'Glass slab',
    blurb: 'A parallel BK7 plate. The emergent ray is parallel to the incident but laterally shifted. Analytic shift δ = d·sin(θ₁−θ₂)/cos θ₂.',
    camera: { pos: [20, 25, 230], target: [30, 0, 0] },
    source: { x: -80, y: -20 },
    ambient: air,
    params: {
      thick: { label: 'Thickness', unit: 'mm', min: 10, max: 60, step: 1, value: 30 },
      angle: { label: 'Launch angle', unit: '°', min: 5, max: 50, step: 1, value: 30 },
      rays: { label: 'Rays', unit: '', min: 1, max: 9, step: 2, value: 5 },
    },
    build(p) {
      const d = p.thick ?? 30;
      const a = p.angle ?? 30;
      const n = p.rays ?? 5;
      return {
        angles: linspace(a - 8, a + 8, n),
        wavelengths: mono(550),
        surfaces: [
          {
            kind: 'plane', label: 'Slab entry',
            px: 0, py: 0, nx: -1, ny: 0, halfH: 60,
            matA: air, matB: bk7,
          },
          {
            kind: 'plane', label: 'Slab exit',
            px: d, py: 0, nx: -1, ny: 0, halfH: 60,
            matA: bk7, matB: air,
          },
        ],
        elements: [
          { type: 'block', x: d / 2, y: 0, w: d, h: 120, mat: 'bk7', label: 'BK7 slab' },
        ],
        meta: { d, angle: a },
      };
    },
  },

  {
    id: 'diamond',
    name: 'Diamond brilliance',
    blurb: 'Air → diamond (n ≈ 2.42). Huge refraction and a tiny critical angle (~24.4°) trap light by TIR, the reason a well-cut diamond sparkles. Compare Fresnel R at normal incidence: ~17% vs ~4% for glass.',
    camera: { pos: [-30, 25, 210], target: [20, 0, 0] },
    source: { x: -70, y: 0 },
    ambient: air,
    params: {
      angle: { label: 'Fan half-angle', unit: '°', min: 5, max: 50, step: 1, value: 30 },
      rays: { label: 'Rays', unit: '', min: 5, max: 17, step: 2, value: 11 },
    },
    build(p) {
      const half = p.angle ?? 30;
      const n = p.rays ?? 11;
      return {
        angles: linspace(-half, half, n),
        wavelengths: mono(560),
        surfaces: [
          {
            kind: 'plane', label: 'Diamond face',
            px: 0, py: 0, nx: -1, ny: 0, halfH: 50,
            matA: air, matB: diamond,
          },
          {
            kind: 'plane', label: 'Diamond → air (back)',
            px: 50, py: 0, nx: -1, ny: 0, halfH: 50,
            matA: diamond, matB: air,
          },
        ],
        elements: [
          { type: 'block', x: 25, y: 0, w: 50, h: 100, mat: 'diamond', label: 'Diamond' },
        ],
      };
    },
  },

  {
    id: 'rainbow',
    name: 'Rainbow drop',
    blurb: 'Descartes\' water-drop model of the primary rainbow: refraction in, internal reflection, refraction out. Descartes rays near 42° pile up (caustic) and dispersion separates colors: red outside, violet inside.',
    camera: { pos: [40, 30, 280], target: [20, 0, 0] },
    source: { x: -120, y: 0 },
    ambient: air,
    params: {
      impact: { label: 'Impact parameter span', unit: 'mm', min: 5, max: 28, step: 1, value: 22 },
      rays: { label: 'Rays per λ', unit: '', min: 5, max: 17, step: 2, value: 11 },
      bands: { label: 'Wavelengths', unit: '', min: 5, max: 11, step: 2, value: 7 },
    },
    build(p) {
      const R = 30; // drop radius mm
      const span = p.impact ?? 22;
      const nR = p.rays ?? 11;
      const nB = p.bands ?? 7;
      return {
        wavelengths: spectrum(nB),
        source: { x: -100, y: 0 },
        angles: [0],
        bundle: linspace(-span, span, nR),
        // Descartes primary bow: refract in (1), reflect at back (2), refract out (3)
        forceReflectOn: [2],
        surfaces: [
          {
            kind: 'sphere', label: 'Water drop',
            // outward normal points out of the drop → matA = air, matB = water
            cx: 0, cy: 0, R, matA: air, matB: water,
          },
        ],
        elements: [
          { type: 'drop', cx: 0, cy: 0, R, mat: 'water' },
          { type: 'note', x: 90, y: 55, text: 'Primary bow ~42°' },
        ],
        meta: { R },
      };
    },
  },

  {
    id: 'silica',
    name: 'Fused silica vs BK7',
    blurb: 'Same geometry, two glasses. Fused silica (lower n, lower dispersion) deflects less and fans the spectrum less than BK7. Overlay both by switching the material live.',
    camera: { pos: [-20, 25, 220], target: [40, 0, 0] },
    source: { x: -80, y: 0 },
    ambient: air,
    params: {
      angle: { label: 'Incidence', unit: '°', min: 10, max: 50, step: 1, value: 35 },
      bands: { label: 'Wavelengths', unit: '', min: 5, max: 13, step: 2, value: 9 },
      glass: { label: 'Glass (0=silica 1=BK7)', unit: '', min: 0, max: 1, step: 1, value: 1 },
    },
    build(p) {
      const mat = (p.glass ?? 1) >= 0.5 ? bk7 : silica;
      const a = p.angle ?? 35;
      return {
        angles: [a],
        wavelengths: spectrum(p.bands ?? 9),
        surfaces: [
          {
            kind: 'plane', label: mat.name,
            px: 0, py: 0, nx: -1, ny: 0, halfH: 55,
            matA: air, matB: mat,
          },
          {
            kind: 'stop', label: 'Screen', absorb: true,
            px: 100, py: 0, nx: -1, ny: 0, halfH: 80,
            matA: mat, matB: mat,
          },
        ],
        elements: [
          { type: 'block', x: 50, y: 0, w: 100, h: 110, mat: (p.glass ?? 1) >= 0.5 ? 'bk7' : 'fusedSilica', label: mat.name },
          { type: 'detector', x: 100, y: 0, h: 160, spectrum: true },
        ],
      };
    },
  },

  {
    id: 'beam',
    name: 'White beam fan',
    blurb: 'A dense polychromatic fan into BK7 for inspecting many rays at once. Sort the table by intensity, OPL or wavelength. This is the stress-test for the ray-by-ray readout.',
    camera: { pos: [-10, 30, 240], target: [40, 0, 0] },
    source: { x: -90, y: 0 },
    ambient: air,
    params: {
      angle: { label: 'Fan half-angle', unit: '°', min: 5, max: 45, step: 1, value: 28 },
      rays: { label: 'Rays per λ', unit: '', min: 5, max: 15, step: 2, value: 9 },
      bands: { label: 'Wavelengths', unit: '', min: 5, max: 13, step: 2, value: 9 },
    },
    build(p) {
      const half = p.angle ?? 28;
      return {
        angles: linspace(-half, half, p.rays ?? 9),
        wavelengths: spectrum(p.bands ?? 9),
        surfaces: [
          {
            kind: 'plane', label: 'BK7',
            px: 0, py: 0, nx: -1, ny: 0, halfH: 60,
            matA: air, matB: bk7,
          },
          {
            kind: 'stop', label: 'Screen', absorb: true,
            px: 110, py: 0, nx: -1, ny: 0, halfH: 90,
            matA: bk7, matB: bk7,
          },
        ],
        elements: [
          { type: 'block', x: 55, y: 0, w: 110, h: 120, mat: 'bk7', label: 'BK7' },
          { type: 'detector', x: 110, y: 0, h: 180, spectrum: true },
        ],
      };
    },
  },
];

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}
