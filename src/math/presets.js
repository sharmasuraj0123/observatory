// Curated equation presets for the Equation Lab.
//
// Types:
//   parametric : position = (x(t), y(t), z(t)); particles trail along the curve
//   ode        : velocity field dx/dt = f(x,y,z,t), integrated with RK4
//   force      : acceleration field a(x,y,z,vx,vy,vz,t), integrated with RK4
//   surface    : animated sheet z = f(x,y,t)
//
// Math axes are z-up; the scene maps (x, y, z) -> (X, -Z, Y).

export const MATH_PRESETS = [
  {
    id: 'lorenz', name: 'Lorenz attractor', type: 'ode',
    exprs: { x: 'a(y - x)', y: 'x(b - z) - y', z: 'x y - c z' },
    params: {
      a: { value: 10, min: 0.1, max: 30 },
      b: { value: 28, min: 0.1, max: 60 },
      c: { value: 2.667, min: 0.1, max: 10 },
    },
    particles: 48, spread: 3, speed: 1.6,
    ic: { x: 1, y: 1, z: 22 },
    camera: { pos: [78, 52, 96], target: [0, 26, 0] },
    description: 'The original strange attractor (Lorenz, 1963), a toy model of atmospheric convection. Watch the rainbow of nearby particles smear across both wings: that divergence is the butterfly effect. Try dragging b (the Rayleigh number) below 24 to watch chaos die into a fixed point.',
  },
  {
    id: 'aizawa', name: 'Aizawa attractor', type: 'ode',
    exprs: {
      x: '(z - b) x - d y',
      y: 'd x + (z - b) y',
      z: 'c + a z - z^3/3 - (x^2 + y^2)(1 + 0.25 z) + 0.1 z x^3',
    },
    params: {
      a: { value: 0.95, min: 0.1, max: 2 },
      b: { value: 0.7, min: 0.1, max: 2 },
      c: { value: 0.6, min: 0.1, max: 2 },
      d: { value: 3.5, min: 0.5, max: 6 },
    },
    particles: 60, spread: 0.4, speed: 1.4, scale: 18,
    ic: { x: 0.1, y: 0.5, z: 0 },
    camera: { pos: [42, 34, 58], target: [0, 8, 0] },
    description: 'A sphere-like attractor with a tunnel bored through its axis. One of the most sculptural objects in dynamical systems.',
  },
  {
    id: 'thomas', name: 'Thomas attractor', type: 'ode',
    exprs: { x: 'sin(y) - b x', y: 'sin(z) - b y', z: 'sin(x) - b z' },
    params: { b: { value: 0.208, min: 0.01, max: 0.5 } },
    particles: 70, spread: 4, speed: 6, scale: 9,
    ic: { x: 1, y: 0, z: 2 },
    camera: { pos: [55, 40, 70], target: [0, 0, 0] },
    description: 'Cyclically symmetric chaos: the same sine rule on every axis. Lower b (the damping) toward 0 and the attractor swells into a diffuse cloud.',
  },
  {
    id: 'rossler', name: 'Rössler attractor', type: 'ode',
    exprs: { x: '-y - z', y: 'x + a y', z: 'b + z(x - c)' },
    params: {
      a: { value: 0.2, min: 0, max: 0.5 },
      b: { value: 0.2, min: 0, max: 2 },
      c: { value: 5.7, min: 1, max: 14 },
    },
    particles: 36, spread: 3, speed: 3, scale: 2.2,
    ic: { x: 5, y: 5, z: 0.5 },
    camera: { pos: [60, 55, 85], target: [0, 12, 0] },
    description: 'A single spiral band that folds back on itself, the simplest recipe for chaos. Raise c to watch period-doubling unfold.',
  },
  {
    id: 'lissajous', name: 'Lissajous knot', type: 'parametric',
    exprs: { x: '22 sin(a t)', y: '22 sin(b t + pi/2)', z: '22 sin(c t) + 24' },
    params: {
      a: { value: 2, min: 1, max: 9 },
      b: { value: 3, min: 1, max: 9 },
      c: { value: 5, min: 1, max: 9 },
    },
    particles: 46, spread: 0, speed: 0.9, chainOffset: 0.09,
    ic: {},
    camera: { pos: [55, 55, 85], target: [0, 24, 0] },
    description: 'Three perpendicular oscillations woven together. Integer frequency ratios close the curve into a knot; drag a, b, c and watch it re-tie itself. The bead chain shows the same curve at 46 moments in time at once.',
  },
  {
    id: 'torusknot', name: 'Torus knot', type: 'parametric',
    exprs: {
      x: '(18 + 7 cos(a t)) cos(b t)',
      y: '(18 + 7 cos(a t)) sin(b t)',
      z: '7 sin(a t) + 22',
    },
    params: {
      a: { value: 3, min: 1, max: 9 },
      b: { value: 2, min: 1, max: 9 },
    },
    particles: 60, spread: 0, speed: 0.7, chainOffset: 0.11,
    ic: {},
    camera: { pos: [50, 48, 78], target: [0, 22, 0] },
    description: 'A (p, q) torus knot: the path winds a times around the tube while circling the hole b times. Coprime integers give a true knot.',
  },
  {
    id: 'kepler', name: 'Kepler orbits', type: 'force',
    exprs: {
      x: '-a x / (x^2 + y^2 + z^2)^1.5',
      y: '-a y / (x^2 + y^2 + z^2)^1.5',
      z: '-a z / (x^2 + y^2 + z^2)^1.5',
    },
    params: { a: { value: 900, min: 50, max: 3000 } },
    particles: 14, spread: 0.6, velJitter: 0.5, speed: 1.2,
    ic: { x: 26, y: 0, z: 4, vx: 0, vy: 5.6, vz: 0.4 },
    camera: { pos: [55, 45, 80], target: [0, 4, 0] },
    description: 'Inverse-square gravity, the same law the Solar System tab integrates. Fourteen test particles with slightly different launch velocities trace a family of conic sections. Lower the central mass a mid-flight and watch orbits widen exactly as the Sun x0.5 experiment does.',
  },
  {
    id: 'cyclotron', name: 'Charged particle in B field', type: 'force',
    exprs: { x: 'b vz', y: 'c', z: '-b vx' },
    params: {
      b: { value: 2.2, min: 0.1, max: 8 },
      c: { value: 0.6, min: -3, max: 3 },
    },
    particles: 24, spread: 2, velJitter: 0.6, speed: 2,
    ic: { x: 0, y: -30, z: 24, vx: 6, vy: 4, vz: 0 },
    camera: { pos: [60, 45, 85], target: [0, 22, 0] },
    description: 'The Lorentz force q v x B with the magnetic field along y, plus a small electric drift c. Charged particles spiral in helices: this is how cyclotrons, auroras and tokamaks confine motion.',
  },
  {
    id: 'oscillator', name: 'Anisotropic oscillator', type: 'force',
    exprs: { x: '-a x', y: '-b y', z: '-c z' },
    params: {
      a: { value: 1, min: 0.1, max: 9 },
      b: { value: 4, min: 0.1, max: 9 },
      c: { value: 9, min: 0.1, max: 9 },
    },
    particles: 30, spread: 3, velJitter: 1.5, speed: 1.5,
    ic: { x: 18, y: 14, z: 24, vx: 0, vy: 3, vz: 0 },
    camera: { pos: [55, 45, 80], target: [0, 12, 0] },
    description: 'A 3D harmonic oscillator with different spring constants per axis. Rational frequency ratios (here 1:2:3) close every path into a Lissajous figure; irrational ratios never repeat.',
  },
  {
    id: 'ripple', name: 'Interference ripples', type: 'surface',
    exprs: {
      z: 'a sin(b sqrt((x-9)^2 + y^2) - c t) exp(-0.04 sqrt((x-9)^2+y^2)) + a sin(b sqrt((x+9)^2 + y^2) - c t) exp(-0.04 sqrt((x+9)^2+y^2))',
    },
    params: {
      a: { value: 3.2, min: 0, max: 8 },
      b: { value: 1.1, min: 0.2, max: 3 },
      c: { value: 3, min: 0, max: 10 },
    },
    range: 34, speed: 1,
    camera: { pos: [40, 42, 70], target: [0, 0, 0] },
    description: 'Two point sources rippling across a sheet: the standing interference pattern between them is the same physics as the double-slit experiment. Time t is the phase; pause it to study the nodes.',
  },
  {
    id: 'sheet', name: 'Standing wave sheet', type: 'surface',
    exprs: { z: 'a sin(b x + t) cos(b y + 0.7 t) + 0.5 a sin(0.5 b x - 1.3 t)' },
    params: {
      a: { value: 4, min: 0, max: 10 },
      b: { value: 0.35, min: 0.05, max: 1.2 },
    },
    range: 34, speed: 1.4,
    camera: { pos: [44, 40, 72], target: [0, 0, 0] },
    description: 'Crossed traveling waves make a breathing lattice of peaks. Raise b to shrink the wavelength; a sets the amplitude.',
  },
  {
    id: 'pulse', name: 'Orbiting gaussian pulse', type: 'surface',
    exprs: { z: 'a exp(-((x - 14 cos(c t))^2 + (y - 14 sin(c t))^2) / b) + 1.5 sin(0.4 x) sin(0.4 y)' },
    params: {
      a: { value: 7, min: 0, max: 14 },
      b: { value: 22, min: 4, max: 80 },
      c: { value: 1, min: 0, max: 4 },
    },
    range: 34, speed: 1,
    camera: { pos: [42, 46, 70], target: [0, 0, 0] },
    description: 'A gaussian wave packet circling a gently corrugated sheet: a cartoon of a localized particle moving through a field, the way quantum wave packets are drawn.',
  },
];

export const CUSTOM_TEMPLATE = {
  id: 'custom', name: 'Custom', type: 'ode',
  exprs: { x: 'a(y - x)', y: 'x(b - z) - y', z: 'x y - c z' },
  params: {
    a: { value: 10, min: 0, max: 40 },
    b: { value: 28, min: 0, max: 60 },
    c: { value: 2.667, min: 0, max: 12 },
    d: { value: 1, min: -10, max: 10 },
  },
  particles: 40, spread: 3, speed: 1.5,
  ic: { x: 1, y: 1, z: 22, vx: 0, vy: 0, vz: 0 },
  camera: { pos: [70, 50, 95], target: [0, 24, 0] },
  description: 'Your equation. Pick a type, write expressions in x, y, z (plus vx, vy, vz for force fields and t for time), and tune a, b, c, d live while it runs.',
};
