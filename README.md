# Solar Claude

A real-ephemeris, interactive 3D solar system in the browser. Planet positions are
computed live from JPL Keplerian elements, so the sky you see matches the actual
solar system for any date you dial in: today, the 1986 Halley flyby, or its 2061 return.

![stack](https://img.shields.io/badge/three.js-0.170-blue) ![stack](https://img.shields.io/badge/vite-6-purple)

## Run it

```bash
npm install
npm run dev     # http://localhost:5174
```

## What is simulated

**Orbital mechanics**
- All 8 planets plus Pluto and Ceres propagate from the JPL "Approximate Positions
  of the Major Planets" Keplerian elements (Standish), including secular rates,
  solved with Newton-iterated Kepler's equation. Valid 1800 to 2050, degrades
  gracefully outside.
- 21 major moons with real semi-major axes, eccentricities, inclinations and
  periods, orbiting in their parents' equatorial planes (Earth's Moon in the
  ecliptic frame, Triton retrograde).
- Comet 1P/Halley on its true retrograde e = 0.967 orbit, with perihelion dates
  matching 1986 and 2061. The coma and twin tails (blue ion, warm dust) grow and
  shrink with solar distance.
- 3,600 belt asteroids on individually propagated Keplerian orbits, with Kirkwood
  gaps at the 3:1, 5:2 and 7:3 Jupiter resonances, plus a 9,000-point Kuiper belt.
- Axial tilts and pole azimuths derived from IAU pole RA/Dec (Uranus rolls on its
  side, Venus spins backwards).
- Earth's rotation follows Greenwich Mean Sidereal Time: the day/night terminator
  and city lights match the real current time.
- Tidally locked moons keep their near face toward the parent. Saturn's ring
  opening angle is correct for the epoch (nearly edge-on through 2025 to 2026).
- Live stats via the vis-viva equation: orbital speeds and distances update as
  bodies move.

**Graphics**
- NASA-derived 8K Earth (day, night lights, clouds) and 2K planet textures,
  procedural textures for the remaining moons and dwarfs.
- Custom GLSL: animated solar photosphere with granulation and limb darkening,
  Earth day/night terminator shader with ocean specular, additive atmosphere
  shells, Saturn rings with translucent backlighting and the planet's real shadow.
- HDR pipeline: ACES tone mapping, multisampled half-float render target,
  UnrealBloom, logarithmic depth buffer (the scene spans 9 orders of magnitude).
- Deep-space black backdrop: only objects belonging to the solar system are drawn.

**Physics lab (experiment mode)**
- Switch from the real ephemeris to a live N-body integration: the Sun, planets,
  Pluto, Ceres and Halley are seeded from the ephemeris state vectors and then
  move under real mutual gravity (symplectic leapfrog, adaptive substeps that
  shrink near close approaches, momentum-conserving collision mergers).
- Change the gravitational constant (0 to 10x), scale any body's mass from 0.01x
  to 1000x, halt / reverse / kick velocities, and watch true consequences:
  halted planets free-fall into the Sun, a 1000x Jupiter reorganizes the outer
  system, half a Sun unbinds orbits. Fading trails visualize the divergence
  against the faint original orbits.
- Every body reports live physics in both modes: heliocentric position, velocity,
  net gravitational force, acceleration and its strongest attractor. Values match
  the analytic ones (Earth reads about 3.5 x 10^22 N of solar pull).
- One-click presets: Jupiter becomes a star, Sun x0.5, double G, halt Earth,
  reverse Venus, full reset. Moons and the belts stay on rails but their orbital
  rates track the parent's effective GM.

**Equation Lab (second tab)**
- Type any math equation and watch it move through space + time with the same
  cinematic pipeline: bloom, fading trails (the trail is the time axis), free
  camera, live readouts.
- Four equation classes: parametric curves x(t), y(t), z(t); velocity fields
  dx/dt = f(x, y, z, t) integrated with RK4; force fields a(x, v, t); and
  animated surfaces z = f(x, y, t) with a height colormap.
- A safe expression compiler (whitelisted tokens only) with implicit
  multiplication: write "10(y - x)" or "a sin(b x + t)". Errors show inline
  while the last good equation keeps running.
- Swarms of up to 200 particles with rainbow trails make chaos visible: nearby
  starting points diverging is the butterfly effect on screen. Parameters a, b,
  c, d are live sliders; drag them mid-flight to morph the system.
- Presets: Lorenz, Aizawa, Thomas and Rössler attractors, Lissajous and torus
  knots, Kepler orbits (the same inverse-square law as the solar tab), charged
  particle in a magnetic field, anisotropic oscillator, and three animated
  surfaces (interference ripples, standing waves, an orbiting wave packet).
- Transport controls: play/pause, reverse time (R), a timeline scrubber backed
  by up to 600 recorded state snapshots (drag back to any moment; integrated
  systems restore their exact state and re-integrate from there), reference
  labels P1 to P8 (click one to follow that particle), a particle size slider,
  and PNG snapshots (S) from any tab.
- Data fit: paste a dataset ([t,] x [, y [, z]]), see it plotted colored from
  early to late with a tracer replaying the path over time, and get a rough
  equation guess per axis (least-squares search over lines, polynomials,
  sinusoids, damped sinusoids and exponentials with R² reported). One click
  overlays the fitted equation on the data for comparison.
- Version history: a git-style Commit button snapshots the entire lab state
  (equation, parameters, superposition layers, dataset, camera) with a rendered
  thumbnail and an optional message. Commits chain to their parent with short
  hashes, show a diff against the parent (changed expressions, parameter values,
  layer counts), and Checkout restores any version exactly. Up to 40 commits
  persist in the browser via localStorage.
- Superposition: freeze any equation as a weighted layer and stack up to six.
  Same-type layers add: positions for parametric curves (epicycles, beats,
  Fourier-style composition, with faint markers tracing each component),
  vector fields for velocity / force systems (particles travel together under
  the blended field, e.g. Lorenz morphing into Thomas), and heights for
  surfaces (literal wave interference). Weights are live sliders.

**Earth Lab (third tab)**
- A true-scale cutaway of Earth: inner core, outer core, lower and upper mantle
  and crust at PREM seismic-model radii, each clickable with detailed data
  (temperature, density, pressure, composition, gravity profile), plus cards
  for the oceans, land, atmosphere layers, the geodynamo magnetic field (drawn
  as tilted dipole field lines) and gravity inside the planet.
- A real-time Single Point Mooring (SPM) simulation: a floating buoy held by
  six catenary chains 60 degrees apart, each running from a stopper on the
  buoy rim to a seabed pile. Every chain is solved each frame with quasi-static
  catenary mechanics (grounded, fully suspended and taut regimes), reporting
  touchdown point, stopper angle and stopper tension per chain. Wind, current
  and mean wave-drift forces push the dynamic buoy across an animated sea;
  upwind chains tighten and lift off the seabed exactly as they should.
  All parameters are live: buoy size, depth, span, chain length and weight,
  MBL, wind, current, waves. Chains color by utilization and the buoy traces
  its trajectory. Physics uses submerged chain weight (0.87 x air weight).

**Interaction**
- Click any body or label to fly to it; the camera then rides along with its orbit.
- Time control from real time up to a year per second, forwards or backwards,
  with date jump and curated events (Halley 1986/2061, the 2020 great conjunction).
- Body size slider from true scale to 400x. Distances are never distorted; only
  body sizes are exaggerated for visibility (moon orbit spacing scales to match).
- Keyboard: Space pause, +/- speed, 0-9 focus bodies, Esc release, O/L/G toggles,
  H help.

## Deliberate approximations

- Two-body Kepler propagation: no planet-planet perturbations, no precession
  models beyond JPL secular rates. Halley's period is fixed at the 1986 to 2061
  interval, so earlier apparitions drift by weeks.
- Moon orbital elements use fixed nodes/phases (real lunar nodes precess with an
  18.6 year cycle).
- Planet rotation phases (except Earth's GMST) have arbitrary epoch offsets:
  meridians are not aligned to IAU W0.
- In scaled mode, moon orbital distances are spread so they clear their parent's
  inflated radius; true-scale mode shows honest geometry.

## Credits

- Ephemerides: E.M. Standish, "Keplerian Elements for Approximate Positions of the
  Major Planets" (JPL/NASA).
- Textures: [Solar System Scope](https://www.solarsystemscope.com/textures/)
  (CC BY 4.0), based on NASA imagery.
- Built with [three.js](https://threejs.org/) and Vite.
