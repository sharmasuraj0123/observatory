// Gravity Lab presets. Positions/velocities in km and km/s; masses in kg.
// Each preset returns { bodies, G, exponent, sceneScale, speedMul, camera, well, params }.

import {
  G_KM, M_EARTH, M_SUN, M_MOON, R_EARTH_KM, R_SUN_KM, AU_KM,
  circularSpeed, escapeSpeed,
} from './grav.js';
import { packetCom } from './quantum.js';

function linspace(a, b, n) {
  if (n <= 1) return [a];
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + (b - a) * (i / (n - 1)));
  return out;
}

const COLORS = [0x86b7ff, 0x6fe08a, 0xffca7a, 0xff8a6a, 0xc8a0ff, 0x7fd0ff, 0xffb0d0, 0xe8e080];

function tracerRing(n, r, mu, colorBase = 0) {
  const v = circularSpeed(mu, r);
  const out = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    out.push({
      id: `t${i}`,
      name: `Tracer ${i + 1}`,
      mass: 0,
      radius: 10,
      test: true,
      color: COLORS[(i + colorBase) % COLORS.length],
      pos: [r * Math.cos(th), r * Math.sin(th), 0],
      vel: [-v * Math.sin(th), v * Math.cos(th), 0],
    });
  }
  return out;
}

export const PRESETS = [
  {
    id: 'leo',
    family: 'classical',
    name: 'LEO circular',
    blurb: 'Low Earth orbit at 400 km. Tracers start on a circular ring; the table should read e ≈ 0, a ≈ 6771 km, period ≈ 92.6 min. Drag the force-law exponent away from 2 and watch circular orbits fail.',
    camera: { pos: [16, 22, 26], target: [0, -2, 0] },
    params: {
      alt: { label: 'Altitude', unit: 'km', min: 200, max: 2000, step: 10, value: 400 },
      tracers: { label: 'Tracers', unit: '', min: 4, max: 24, step: 1, value: 12 },
      exponent: { label: 'Force exponent n (F∝1/rⁿ)', unit: '', min: 1, max: 3, step: 0.01, value: 2 },
      speed: { label: 'Time rate', unit: '×', min: 1, max: 120, step: 1, value: 30 },
    },
    build(p) {
      const alt = p.alt ?? 400;
      const r = R_EARTH_KM + alt;
      const mu = G_KM * M_EARTH;
      const n = p.tracers ?? 12;
      return {
        G: G_KM,
        exponent: p.exponent ?? 2,
        speedMul: p.speed ?? 30,
        sceneScale: 0.001, // 1 scene unit = 1000 km
        well: { half: r * 2.4, res: 80, depth: 0.012 },
        bodies: [
          {
            id: 'earth', name: 'Earth', mass: M_EARTH, radius: R_EARTH_KM,
            pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0x4a8fd8,
          },
          ...tracerRing(n, r, mu),
        ],
        meta: {
          expectPeriodMin: (2 * Math.PI * Math.sqrt(r * r * r / mu)) / 60,
          expectA: r,
        },
        verify: (sim) => {
          const t = sim.tracers()[0];
          if (!t) return null;
          const a = sim.analyze(t);
          const Tmin = a.elements.period / 60;
          const expect = (2 * Math.PI * Math.sqrt(r * r * r / mu)) / 60;
          return {
            label: 'Period vs analytic LEO',
            value: `${Tmin.toFixed(2)} min (expect ${expect.toFixed(2)})`,
            ok: Math.abs(Tmin - expect) / expect < 0.02,
          };
        },
      };
    },
  },

  {
    id: 'ellipse',
    name: 'Elliptical orbit',
    blurb: 'A family of ellipses sharing periapsis. Specific energy and angular momentum set a and e; the table reports both live. Raise eccentricity toward 1 and watch ra run away.',
    camera: { pos: [18, 24, 30], target: [0, -3, 0] },
    params: {
      rp: { label: 'Periapsis altitude', unit: 'km', min: 200, max: 2000, step: 50, value: 400 },
      e: { label: 'Eccentricity', unit: '', min: 0.05, max: 0.85, step: 0.01, value: 0.4 },
      tracers: { label: 'Tracers', unit: '', min: 1, max: 12, step: 1, value: 6 },
      speed: { label: 'Time rate', unit: '×', min: 1, max: 200, step: 1, value: 40 },
    },
    build(p) {
      const rp = R_EARTH_KM + (p.rp ?? 400);
      const e = p.e ?? 0.4;
      const a = rp / (1 - e);
      const mu = G_KM * M_EARTH;
      const n = p.tracers ?? 6;
      const bodies = [{
        id: 'earth', name: 'Earth', mass: M_EARTH, radius: R_EARTH_KM,
        pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0x4a8fd8,
      }];
      for (let i = 0; i < n; i++) {
        const ee = e * (0.4 + 0.6 * (i + 1) / n);
        const aa = rp / (1 - ee);
        // start at periapsis on +x; v = sqrt(μ(2/r - 1/a)) along +y
        const v = Math.sqrt(mu * (2 / rp - 1 / aa));
        bodies.push({
          id: `t${i}`, name: `e=${ee.toFixed(2)}`, mass: 0, radius: 10, test: true,
          color: COLORS[i % COLORS.length],
          pos: [rp, 0, 0], vel: [0, v, 0],
        });
      }
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 40,
        sceneScale: 0.0007,
        well: { half: a * 2.4, res: 64, depth: 0.01 },
        bodies,
        meta: { a, e, rp },
      };
    },
  },

  {
    id: 'escape',
    name: 'Escape trajectories',
    blurb: 'Tracers launched from LEO with v from 0.9 vesc to 1.2 vesc. Bound orbits stay elliptical; at vesc the energy crosses zero and the path goes parabolic, then hyperbolic. Watch kind flip in the table.',
    camera: { pos: [22, 28, 36], target: [0, -4, 0] },
    params: {
      alt: { label: 'Altitude', unit: 'km', min: 200, max: 1000, step: 50, value: 400 },
      tracers: { label: 'Tracers', unit: '', min: 5, max: 15, step: 2, value: 9 },
      speed: { label: 'Time rate', unit: '×', min: 1, max: 200, step: 1, value: 50 },
    },
    build(p) {
      const r = R_EARTH_KM + (p.alt ?? 400);
      const mu = G_KM * M_EARTH;
      const vesc = escapeSpeed(mu, r);
      const n = p.tracers ?? 9;
      const fracs = linspace(0.85, 1.25, n);
      const bodies = [{
        id: 'earth', name: 'Earth', mass: M_EARTH, radius: R_EARTH_KM,
        pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0x4a8fd8,
      }];
      fracs.forEach((f, i) => {
        bodies.push({
          id: `t${i}`, name: `${f.toFixed(2)} vesc`, mass: 0, radius: 10, test: true,
          color: f < 1 ? COLORS[0] : f < 1.02 ? 0xffca7a : 0xff8a6a,
          pos: [r, 0, 0], vel: [0, f * vesc, 0],
        });
      });
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 50,
        sceneScale: 0.0005,
        well: { half: r * 8, res: 56, depth: 0.008 },
        bodies,
        meta: { vesc, r },
      };
    },
  },

  {
    id: 'inverse',
    name: 'Inverse-square check',
    blurb: 'Stationary probes at increasing r measure |a|. For Newtonian gravity the log-log slope of a vs r is -2. Change n and the slope tracks it. This is the lab\'s quantitative force-law test.',
    camera: { pos: [8, 28, 42], target: [8, 0, 0] },
    params: {
      exponent: { label: 'Force exponent n', unit: '', min: 1, max: 3, step: 0.01, value: 2 },
      probes: { label: 'Probes', unit: '', min: 5, max: 16, step: 1, value: 10 },
    },
    build(p) {
      const nP = p.probes ?? 10;
      const rs = linspace(R_EARTH_KM * 1.5, R_EARTH_KM * 6, nP);
      const bodies = [{
        id: 'earth', name: 'Earth', mass: M_EARTH, radius: R_EARTH_KM,
        pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0x4a8fd8,
      }];
      rs.forEach((r, i) => {
        bodies.push({
          id: `t${i}`, name: `r=${(r / R_EARTH_KM).toFixed(2)} R⊕`,
          mass: 0, radius: 20, test: true, color: COLORS[i % COLORS.length],
          pos: [r, 0, 0], vel: [0, 0, 0],
        });
      });
      const exp = p.exponent ?? 2;
      return {
        G: G_KM, exponent: exp, speedMul: 0, // frozen: measure field, do not integrate
        sceneScale: 0.0008,
        well: { half: R_EARTH_KM * 7, res: 64, depth: 0.012 },
        bodies,
        frozen: true,
        verify: (sim) => {
          const rows = sim.tracers().map((t) => {
            const a = sim.analyze(t);
            return { r: a.r, accel: a.accelMs2 };
          }).filter((row) => row.r > 0 && row.accel > 0);
          if (rows.length < 3) return null;
          // log-log slope via two-point average of consecutive pairs
          let sum = 0, count = 0;
          for (let i = 1; i < rows.length; i++) {
            const s = Math.log(rows[i].accel / rows[i - 1].accel) / Math.log(rows[i].r / rows[i - 1].r);
            sum += s; count++;
          }
          const slope = sum / count;
          return {
            label: 'log-log slope d(ln a)/d(ln r)',
            value: `${slope.toFixed(3)} (expect -${exp.toFixed(2)})`,
            ok: Math.abs(slope + exp) < 0.05,
          };
        },
      };
    },
  },

  {
    id: 'moon',
    name: 'Earth-Moon',
    blurb: 'Restricted three-body toy: Earth fixed, Moon on a circular orbit, tracers near Earth. The Moon\'s tug slowly perturbs what would be Keplerian ellipses. Live force column shows Earth still dominates (>95%).',
    camera: { pos: [20, 55, 85], target: [20, 0, 0] },
    params: {
      tracers: { label: 'Tracers', unit: '', min: 4, max: 16, step: 1, value: 8 },
      speed: { label: 'Time rate', unit: '×', min: 100, max: 5000, step: 50, value: 1200 },
    },
    build(p) {
      const aMoon = 384400;
      const muE = G_KM * M_EARTH;
      // Moon period ~27.3 d; place Moon on +x with circular vel
      // Use Earth+Moon mu for slightly better circular approx about Earth
      const vMoon = circularSpeed(muE, aMoon);
      const n = p.tracers ?? 8;
      const bodies = [
        {
          id: 'earth', name: 'Earth', mass: M_EARTH, radius: R_EARTH_KM,
          pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0x4a8fd8,
        },
        {
          id: 'moon', name: 'Moon', mass: M_MOON, radius: 1737,
          pos: [aMoon, 0, 0], vel: [0, vMoon, 0], color: 0xc8c0b0,
        },
        ...tracerRing(n, R_EARTH_KM + 2000, muE),
      ];
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 1200,
        sceneScale: 0.00012,
        well: { half: aMoon * 1.15, res: 72, depth: 0.006 },
        bodies,
      };
    },
  },

  {
    id: 'binary',
    name: 'Binary stars',
    blurb: 'Two equal solar masses orbit their common barycenter. Tracers in the rotating plane feel a time-varying field; some stay bound to one star, some get ejected. Both stars are free (not fixed).',
    camera: { pos: [0, 160, 260], target: [0, 0, 0] },
    params: {
      sep: { label: 'Separation', unit: 'AU', min: 0.4, max: 3, step: 0.1, value: 1 },
      tracers: { label: 'Tracers', unit: '', min: 6, max: 20, step: 1, value: 12 },
      speed: { label: 'Time rate', unit: '×', min: 1e5, max: 5e6, step: 1e4, value: 8e5 },
    },
    build(p) {
      const sep = (p.sep ?? 1) * AU_KM;
      const m = M_SUN;
      const mu = G_KM * (m + m);
      const rEach = sep / 2;
      const vEach = circularSpeed(mu, sep) / 2; // each orbits barycenter at sep/2
      const n = p.tracers ?? 12;
      const bodies = [
        {
          id: 'a', name: 'Star A', mass: m, radius: R_SUN_KM,
          pos: [-rEach, 0, 0], vel: [0, -vEach, 0], color: 0xffcc66,
        },
        {
          id: 'b', name: 'Star B', mass: m, radius: R_SUN_KM,
          pos: [rEach, 0, 0], vel: [0, vEach, 0], color: 0xff8866,
        },
      ];
      // tracers on a larger circle around barycenter
      const R = sep * 1.6;
      const v = circularSpeed(G_KM * 2 * m, R);
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2;
        bodies.push({
          id: `t${i}`, name: `Tracer ${i + 1}`, mass: 0, radius: 5e4, test: true,
          color: COLORS[i % COLORS.length],
          pos: [R * Math.cos(th), R * Math.sin(th), 0],
          vel: [-v * Math.sin(th), v * Math.cos(th), 0],
        });
      }
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 8e5,
        sceneScale: 1 / AU_KM * 80, // ~80 units per AU
        well: { half: sep * 2.5, res: 64, depth: 0.004 },
        bodies,
      };
    },
  },

  {
    id: 'assist',
    name: 'Gravity assist',
    blurb: 'A fast hyperbolic flyby of a Jupiter-mass body. Compare incoming and outgoing speed relative to the Sun-frame (here: fixed background). The planet steals or grants momentum; watch v∞ and turning angle in the event sense of the table.',
    camera: { pos: [0, 100, 160], target: [0, 0, 0] },
    params: {
      vinf: { label: 'Approach speed', unit: 'km/s', min: 5, max: 40, step: 0.5, value: 18 },
      b: { label: 'Impact parameter', unit: '×R', min: 1.5, max: 12, step: 0.1, value: 4 },
      tracers: { label: 'Tracers', unit: '', min: 1, max: 9, step: 1, value: 5 },
      speed: { label: 'Time rate', unit: '×', min: 10, max: 2000, step: 10, value: 400 },
    },
    build(p) {
      // Jupiter-ish
      const mJ = 1.898e27;
      const rJ = 69911;
      const vinf = p.vinf ?? 18;
      const bMul = p.b ?? 4;
      const n = p.tracers ?? 5;
      const bodies = [{
        id: 'planet', name: 'Planet', mass: mJ, radius: rJ,
        pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0xd4a574,
      }];
      const bs = linspace(bMul * 0.6, bMul * 1.4, n);
      bs.forEach((bm, i) => {
        const b = bm * rJ;
        // start far on the left, velocity +x with impact parameter y=b
        const x0 = -40 * rJ;
        bodies.push({
          id: `t${i}`, name: `b=${bm.toFixed(1)} R`, mass: 0, radius: 200, test: true,
          color: COLORS[i % COLORS.length],
          pos: [x0, b, 0], vel: [vinf, 0, 0],
        });
      });
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 400,
        sceneScale: 0.00004,
        well: { half: 50 * rJ, res: 56, depth: 0.005 },
        bodies,
        meta: { vinf, rJ },
      };
    },
  },

  {
    id: 'roche',
    name: 'Roche limit',
    blurb: 'A rubble pile of tracers on a circular orbit inside / outside the fluid Roche limit d ≈ 2.44 R (ρM/ρm)^{1/3}. Inside, tidal forces dominate self-gravity (here: zero self-gravity), so the formation shears apart. Outside, it holds a ring.',
    camera: { pos: [10, 28, 42], target: [12, 0, 0] },
    params: {
      orbitR: { label: 'Orbital radius', unit: '×R⊕', min: 1.5, max: 5, step: 0.05, value: 2.2 },
      clump: { label: 'Clump size', unit: 'km', min: 50, max: 800, step: 10, value: 300 },
      tracers: { label: 'Fragments', unit: '', min: 8, max: 40, step: 1, value: 20 },
      speed: { label: 'Time rate', unit: '×', min: 1, max: 200, step: 1, value: 40 },
    },
    build(p) {
      const R = R_EARTH_KM * (p.orbitR ?? 2.2);
      const clump = p.clump ?? 300;
      const n = p.tracers ?? 20;
      const mu = G_KM * M_EARTH;
      const v = circularSpeed(mu, R);
      // fluid Roche approx for equal density: 2.44 R_earth
      const roche = 2.44 * R_EARTH_KM;
      const bodies = [{
        id: 'earth', name: 'Earth', mass: M_EARTH, radius: R_EARTH_KM,
        pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0x4a8fd8,
      }];
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const dr = (clump / 2) * Math.cos(ang);
        const dt = (clump / 2) * Math.sin(ang);
        // place along radial / tangential offsets around (R,0)
        const x = R + dr;
        const y = dt;
        // solid-body orbital velocity field around Earth
        const rr = Math.hypot(x, y);
        const vv = circularSpeed(mu, rr);
        const vx = -vv * y / rr;
        const vy = vv * x / rr;
        bodies.push({
          id: `t${i}`, name: `Frag ${i + 1}`, mass: 0, radius: 5, test: true,
          color: R < roche ? 0xff8a6a : 0x6fe08a,
          pos: [x, y, 0], vel: [vx, vy, 0],
        });
      }
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 40,
        sceneScale: 0.0009,
        well: { half: R * 2, res: 56, depth: 0.01 },
        bodies,
        meta: { roche, R },
        annotations: [
          { kind: 'roche', r: roche, label: `Roche ≈ ${roche.toFixed(0)} km` },
        ],
      };
    },
  },

  {
    id: 'solar',
    name: 'Kepler fans',
    blurb: 'Heliocentric circular orbits from Mercury to Mars distances. Same inverse-square law as the Solar System tab. Periods should match P² ∝ a³; the verify chip checks the outer tracer.',
    camera: { pos: [40, 140, 220], target: [40, 0, 0] },
    params: {
      tracers: { label: 'Orbits', unit: '', min: 4, max: 12, step: 1, value: 8 },
      speed: { label: 'Time rate', unit: '×', min: 1e5, max: 1e7, step: 1e4, value: 2e6 },
    },
    build(p) {
      const n = p.tracers ?? 8;
      const mu = G_KM * M_SUN;
      const bodies = [{
        id: 'sun', name: 'Sun', mass: M_SUN, radius: R_SUN_KM,
        pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0xffcc55,
      }];
      const aus = linspace(0.4, 1.6, n);
      aus.forEach((au, i) => {
        const r = au * AU_KM;
        const v = circularSpeed(mu, r);
        bodies.push({
          id: `t${i}`, name: `${au.toFixed(2)} AU`, mass: 0, radius: 2000, test: true,
          color: COLORS[i % COLORS.length],
          pos: [r, 0, 0], vel: [0, v, 0],
        });
      });
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 2e6,
        sceneScale: 80 / AU_KM,
        well: { half: 2 * AU_KM, res: 64, depth: 0.003 },
        bodies,
        verify: (sim) => {
          const ts = sim.tracers();
          if (ts.length < 2) return null;
          const a0 = sim.analyze(ts[0]);
          const a1 = sim.analyze(ts[ts.length - 1]);
          if (!a0.elements || !a1.elements) return null;
          // Kepler: T² / a³ should match
          const k0 = (a0.elements.period ** 2) / (a0.elements.a ** 3);
          const k1 = (a1.elements.period ** 2) / (a1.elements.a ** 3);
          const ratio = k0 / k1;
          return {
            label: 'Kepler T²/a³ ratio (inner/outer)',
            value: ratio.toFixed(4),
            ok: Math.abs(ratio - 1) < 0.02,
          };
        },
      };
    },
  },

  {
    id: 'exponent',
    name: 'Broken force law',
    blurb: 'Same LEO ring as the first preset, but n starts at 2.5. Closed ellipses are special to 1/r^2 (Bertrand\'s theorem: only n=2 and Hooke\'s n=-1 give stable closed orbits). Watch the periapsis precess.',
    camera: { pos: [16, 22, 26], target: [0, -2, 0] },
    params: {
      exponent: { label: 'Force exponent n', unit: '', min: 1.2, max: 2.8, step: 0.01, value: 2.5 },
      alt: { label: 'Altitude', unit: 'km', min: 300, max: 1500, step: 50, value: 500 },
      tracers: { label: 'Tracers', unit: '', min: 4, max: 16, step: 1, value: 8 },
      speed: { label: 'Time rate', unit: '×', min: 1, max: 120, step: 1, value: 25 },
    },
    build(p) {
      const r = R_EARTH_KM + (p.alt ?? 500);
      const mu = G_KM * M_EARTH;
      // For non-Newtonian n, circular speed satisfies v²/r = G M / r^n
      // so v = sqrt(G M / r^{n-1})
      const exp = p.exponent ?? 2.5;
      const n = p.tracers ?? 8;
      const bodies = [{
        id: 'earth', name: 'Earth', mass: M_EARTH, radius: R_EARTH_KM,
        pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0x4a8fd8,
      }];
      const v = Math.sqrt((G_KM * M_EARTH) / (r ** (exp - 1)));
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2;
        // slight radial spread so precession is visible as a ribbon
        const rr = r * (1 + 0.04 * Math.sin(th * 2));
        const vv = Math.sqrt((G_KM * M_EARTH) / (rr ** (exp - 1)));
        bodies.push({
          id: `t${i}`, name: `Tracer ${i + 1}`, mass: 0, radius: 10, test: true,
          color: COLORS[i % COLORS.length],
          pos: [rr * Math.cos(th), rr * Math.sin(th), 0],
          vel: [-vv * Math.sin(th), vv * Math.cos(th), 0],
        });
      }
      return {
        G: G_KM, exponent: exp, speedMul: p.speed ?? 25,
        sceneScale: 0.001,
        well: { half: r * 2.5, res: 64, depth: 0.012 },
        bodies,
        meta: { note: 'Bertrand: closed orbits only for n=2 and Hooke' },
      };
    },
  },

  // ---------- Quantum gravity (pedagogical effective models) ----------

  {
    id: 'qg-bounce',
    family: 'quantum',
    name: 'Quantum bounce',
    blurb: 'LQG-inspired polymer correction a = −GM/r² + GM ℓ_b²/r⁴. Drop tracers from rest: classically they would hit the mass; here they rebound at the bounce radius. Raise ℓ_b to push the bounce outward.',
    camera: { pos: [14, 18, 22], target: [0, -1, 0] },
    params: {
      bounce: { label: 'Bounce length ℓ_b', unit: 'km', min: 200, max: 4000, step: 50, value: 1200 },
      tracers: { label: 'Tracers', unit: '', min: 4, max: 16, step: 1, value: 8 },
      speed: { label: 'Time rate', unit: '×', min: 1, max: 80, step: 1, value: 20 },
    },
    build(p) {
      const lb = p.bounce ?? 1200;
      const n = p.tracers ?? 8;
      const bodies = [{
        id: 'core', name: 'Core', mass: M_EARTH, radius: Math.max(R_EARTH_KM * 0.15, 50),
        pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0xc8a0ff,
      }];
      // drop from rest at several altitudes (radial free-fall)
      for (let i = 0; i < n; i++) {
        const r = lb * (1.8 + 1.8 * (i / Math.max(n - 1, 1)));
        bodies.push({
          id: `t${i}`, name: `Fall ${i + 1}`, mass: 0, radius: 10, test: true,
          color: COLORS[i % COLORS.length],
          pos: [r, 0, 0], vel: [0, 0, 0],
        });
      }
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 20,
        sceneScale: 0.0012,
        well: { half: lb * 5, res: 72, depth: 0.014 },
        qg: { mode: 'bounce', bounceScale: lb },
        bodies,
        annotations: [
          { kind: 'roche', r: lb, label: `Bounce ℓ_b ≈ ${Math.round(lb)} km` },
        ],
        verify: (sim) => {
          const alive = sim.tracers().filter((t) => !t.destroyed);
          const bounced = alive.filter((t) => t.vel[0] > 0).length;
          return {
            label: 'Outbound after bounce',
            value: `${bounced}/${alive.length} tracers`,
            ok: alive.length > 0,
          };
        },
      };
    },
  },

  {
    id: 'qg-running',
    family: 'quantum',
    name: 'Running G',
    blurb: 'Asymptotic-safety style: G(r) = G₀/(1+(ℓ/r)^α). Circular orbits that are Newtonian at large r feel a weaker pull near the core. Compare binding energy as you raise the UV scale ℓ.',
    camera: { pos: [16, 22, 26], target: [0, -2, 0] },
    params: {
      ell: { label: 'UV scale ℓ', unit: 'km', min: 100, max: 5000, step: 50, value: 1500 },
      alpha: { label: 'Running α', unit: '', min: 1, max: 4, step: 0.1, value: 2 },
      tracers: { label: 'Tracers', unit: '', min: 4, max: 16, step: 1, value: 10 },
      speed: { label: 'Time rate', unit: '×', min: 1, max: 120, step: 1, value: 30 },
    },
    build(p) {
      const ell = p.ell ?? 1500;
      const alpha = p.alpha ?? 2;
      const n = p.tracers ?? 10;
      const mu = G_KM * M_EARTH;
      const bodies = [{
        id: 'earth', name: 'Earth', mass: M_EARTH, radius: R_EARTH_KM,
        pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0x4a8fd8,
      }];
      const rs = linspace(R_EARTH_KM + 400, R_EARTH_KM + 400 + ell * 2.5, n);
      rs.forEach((r, i) => {
        // seed with Newtonian circular speed; running G will detune inner orbits
        const v = circularSpeed(mu, r);
        bodies.push({
          id: `t${i}`, name: `r=${Math.round(r - R_EARTH_KM)}`, mass: 0, radius: 10, test: true,
          color: COLORS[i % COLORS.length],
          pos: [r, 0, 0], vel: [0, v, 0],
        });
      });
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 30,
        sceneScale: 0.001,
        well: { half: rs[rs.length - 1] * 1.8, res: 72, depth: 0.012 },
        qg: { mode: 'runningG', ell, alpha },
        bodies,
        annotations: [
          { kind: 'roche', r: ell + R_EARTH_KM, label: `ℓ + R⊕` },
        ],
      };
    },
  },

  {
    id: 'qg-yukawa',
    family: 'quantum',
    name: 'Massive graviton',
    blurb: 'Yukawa gravity Φ ∝ e^{−r/λ}/r. Orbits near the source still look Keplerian; beyond a few λ the field is screened and tracers peel off onto nearly straight escape paths. Shrink λ to tighten the well.',
    camera: { pos: [20, 28, 36], target: [0, -2, 0] },
    params: {
      lambda: { label: 'Compton λ', unit: 'km', min: 500, max: 12000, step: 100, value: 4000 },
      tracers: { label: 'Tracers', unit: '', min: 4, max: 16, step: 1, value: 10 },
      speed: { label: 'Time rate', unit: '×', min: 1, max: 150, step: 1, value: 40 },
    },
    build(p) {
      const lam = p.lambda ?? 4000;
      const n = p.tracers ?? 10;
      const mu = G_KM * M_EARTH;
      const bodies = [{
        id: 'earth', name: 'Earth', mass: M_EARTH, radius: R_EARTH_KM,
        pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0x4a8fd8,
      }];
      const rs = linspace(R_EARTH_KM + 300, R_EARTH_KM + lam * 2.2, n);
      rs.forEach((r, i) => {
        const v = circularSpeed(mu, r);
        bodies.push({
          id: `t${i}`, name: `r/λ=${(r / lam).toFixed(2)}`, mass: 0, radius: 10, test: true,
          color: COLORS[i % COLORS.length],
          pos: [r, 0, 0], vel: [0, v, 0],
        });
      });
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 40,
        sceneScale: 0.0008,
        well: { half: rs[rs.length - 1] * 1.6, res: 64, depth: 0.01 },
        qg: { mode: 'yukawa', lambda: lam },
        bodies,
        annotations: [
          { kind: 'roche', r: lam, label: `λ ≈ ${Math.round(lam)} km` },
        ],
        verify: (sim) => {
          const rows = sim.tracers().map((t) => sim.analyze(t));
          const escape = rows.filter((a) => a.elements && a.elements.kind === 'hyperbolic').length;
          return {
            label: 'Screened escapes',
            value: `${escape}/${rows.length} hyperbolic`,
            ok: true,
          };
        },
      };
    },
  },

  {
    id: 'qg-foam',
    family: 'quantum',
    name: 'Spacetime foam',
    blurb: 'Wheeler foam toy: classical LEO plus stochastic kicks that grow toward small r. Watch eccentricity and energy diffuse. Raise foam strength until the ring blurs into a toroidal cloud.',
    camera: { pos: [16, 22, 26], target: [0, -2, 0] },
    params: {
      foam: { label: 'Foam strength', unit: '', min: 0, max: 0.08, step: 0.002, value: 0.02 },
      ell: { label: 'Foam scale ℓ', unit: 'km', min: 100, max: 3000, step: 50, value: 800 },
      tracers: { label: 'Tracers', unit: '', min: 6, max: 24, step: 1, value: 14 },
      speed: { label: 'Time rate', unit: '×', min: 1, max: 80, step: 1, value: 25 },
    },
    build(p) {
      const r = R_EARTH_KM + 500;
      const mu = G_KM * M_EARTH;
      const n = p.tracers ?? 14;
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 25,
        sceneScale: 0.001,
        well: { half: r * 2.4, res: 64, depth: 0.012 },
        qg: {
          mode: 'foam',
          foamStrength: p.foam ?? 0.02,
          ell: p.ell ?? 800,
        },
        bodies: [
          {
            id: 'earth', name: 'Earth', mass: M_EARTH, radius: R_EARTH_KM,
            pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0x4a8fd8,
          },
          ...tracerRing(n, r, mu),
        ],
      };
    },
  },

  {
    id: 'qg-hawking',
    family: 'quantum',
    name: 'Hawking evaporation',
    blurb: 'Semi-classical toy black hole: dM/dt = −κ/M². Tracers start on circular orbits; as M drops the well shallows, periods lengthen, and outer tracers unbind. Raise κ to evaporate faster.',
    camera: { pos: [12, 16, 20], target: [0, -1, 0] },
    params: {
      kappa: { label: 'Evaporation κ', unit: '', min: 1e20, max: 5e24, step: 1e20, value: 8e23 },
      tracers: { label: 'Tracers', unit: '', min: 4, max: 14, step: 1, value: 8 },
      speed: { label: 'Time rate', unit: '×', min: 1, max: 200, step: 1, value: 40 },
    },
    build(p) {
      // Compact demo "micro" hole: Earth mass in a small radius for visibility
      const mBH = M_EARTH;
      const rH = 800; // visual horizon scale (not real r_s)
      const mu = G_KM * mBH;
      const n = p.tracers ?? 8;
      const bodies = [{
        id: 'bh', name: 'Black hole', mass: mBH, radius: rH,
        pos: [0, 0, 0], vel: [0, 0, 0], fixed: true, color: 0x1a1028,
        isHorizon: true,
      }];
      const rs = linspace(rH * 2.2, rH * 6, n);
      rs.forEach((r, i) => {
        const v = circularSpeed(mu, r);
        bodies.push({
          id: `t${i}`, name: `Orbit ${i + 1}`, mass: 0, radius: 8, test: true,
          color: COLORS[i % COLORS.length],
          pos: [r, 0, 0], vel: [0, v, 0],
        });
      });
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 40,
        sceneScale: 0.004,
        well: { half: rH * 8, res: 64, depth: 0.016 },
        qg: { mode: 'hawking', kappa: p.kappa ?? 8e23 },
        bodies,
        verify: (sim) => {
          const p0 = sim.primary();
          const frac = (p0 && sim.initialMass) ? p0.mass / sim.initialMass : 1;
          return {
            label: 'Mass remaining',
            value: `${(frac * 100).toFixed(1)}%`,
            ok: frac < 0.999,
          };
        },
      };
    },
  },

  {
    id: 'qg-sn',
    family: 'quantum',
    name: 'Schrödinger-Newton',
    blurb: 'Self-gravitating Gaussian packet: N massive samples with soft mutual Newton gravity plus Bohm-like quantum pressure ∼ ħ_eff². Low ħ_eff collapses toward a soliton; high ħ_eff disperses. No central fixed mass.',
    camera: { pos: [0, 40, 55], target: [0, 0, 0] },
    params: {
      hbar: { label: 'ħ_eff', unit: '', min: 0, max: 40, step: 0.5, value: 12 },
      samples: { label: 'Samples N', unit: '', min: 8, max: 36, step: 1, value: 20 },
      sigma: { label: 'Initial σ', unit: 'km', min: 200, max: 3000, step: 50, value: 900 },
      speed: { label: 'Time rate', unit: '×', min: 1, max: 80, step: 1, value: 15 },
    },
    build(p) {
      const n = p.samples ?? 20;
      const sigma = p.sigma ?? 900;
      const totalM = M_EARTH * 0.02;
      const m = totalM / n;
      const bodies = [];
      // Box-Muller Gaussian samples in the plane, near-zero initial velocity
      for (let i = 0; i < n; i++) {
        const u1 = Math.max(1e-9, (i + 0.5) / n);
        const u2 = ((i * 17) % n + 0.5) / n;
        // deterministic quasi-random ring+jitter so rebuilds are stable
        const rad = sigma * Math.sqrt(-2 * Math.log(u1)) * 0.75;
        const th = u2 * Math.PI * 2;
        const x = rad * Math.cos(th);
        const y = rad * Math.sin(th);
        bodies.push({
          id: `p${i}`, name: `ψ ${i + 1}`, mass: m, radius: 40,
          pos: [x, y, 0], vel: [0, 0, 0],
          color: COLORS[i % COLORS.length],
        });
      }
      return {
        G: G_KM, exponent: 2, speedMul: p.speed ?? 15,
        sceneScale: 0.008,
        well: { half: sigma * 4, res: 56, depth: 0.01 },
        qg: { mode: 'schrodingerNewton', hbarEff: p.hbar ?? 12 },
        bodies,
        verify: (sim) => {
          const { sigma: s } = packetCom(sim.bodies);
          return {
            label: 'Packet σ',
            value: `${s.toFixed(0)} km`,
            ok: true,
          };
        },
      };
    },
  },
];

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}

export function presetsByFamily(family) {
  return PRESETS.filter((p) => (p.family || 'classical') === family);
}
