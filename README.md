<div align="center">
  <img src="public/xo-logo.svg" width="72" alt="XO" />

  # Observatory

  **An instrument for scientific curiosity.** Pose a question, run it in real physics, and keep the trace.

  ![three.js](https://img.shields.io/badge/three.js-0.170-1f6feb)
  ![vite](https://img.shields.io/badge/vite-6-8957e5)
  ![no framework](https://img.shields.io/badge/UI-vanilla%20ES%20modules-3fb950)
  ![license](https://img.shields.io/badge/license-see%20credits-8b949e)
</div>

---

## What Observatory is

Observatory is a browser-based workbench for exploring how things move. It began as a
real-ephemeris solar system and grew into a general tool for turning a "what if" into a
running experiment you can watch, measure, and record.

The idea is simple: **curiosity, experiment, trace.**

1. **Curiosity.** You have a question. What does the sky look like on the day Halley
   returns in 2061? What happens to Earth's orbit if the Sun loses half its mass? How
   does a Lorenz attractor fall apart as you turn down the forcing? What tension does a
   mooring chain carry when a 30 m/s wind hits the buoy?
2. **Experiment.** You set it up with real physics and drive it in real time. Every
   input is a live control, so you can perturb the system while it runs and see the
   consequence immediately.
3. **Trace.** Observatory records what happened: motion trails, a scrubbable timeline,
   git-style version commits of the whole experiment, fitted equations for data you
   paste in, live numeric readouts, and PNG snapshots. A trace is evidence you can go
   back to, compare against, and share.

It is not a game and not a screensaver. It is closer to a telescope and a lab notebook
in the same window: an accurate model you can point at a question, plus the machinery to
capture what you see.

Three **instruments** share one engine (renderer, camera, trails, HUD):

| Instrument | Domain | The question it answers |
| --- | --- | --- |
| **Solar System** | Celestial mechanics | Where is everything, really, on any date? What if gravity were different? |
| **Equation Lab** | Dynamical systems, general math | How does an arbitrary equation move through space and time? |
| **Earth Lab** | Geophysics and offshore engineering | What is Earth made of, and how does a real mooring behave under weather? |
| **Light Lab** | Geometric optics | Where does each ray go, and what does Snell / Fresnel / dispersion do to it? |
| **Gravity Lab** | Orbital mechanics + QG toys | What orbit is this particle on, and what if gravity were quantum-corrected? |

---

## Quick start

Requires Node.js 18 or newer.

```bash
npm install
npm run dev       # dev server on http://localhost:5174
npm run build     # production build to dist/
npm run preview   # serve the production build
```

Open the app, then switch instruments with the tabs in the top-left. Press **H** at any
time for a context-aware help card, **S** for a PNG snapshot, and **V** to record up to
10 seconds of the current view as a WebM.

---

## The five instruments

### 1. Solar System

A real-ephemeris model of the solar system. Positions are computed live, so what you see
matches the actual sky.

- **All 8 planets, Pluto and Ceres** propagate from the JPL "Approximate Positions of the
  Major Planets" Keplerian elements (Standish), including secular rates, solved with a
  Newton-iterated Kepler equation. Valid 1800 to 2050, and degrades gracefully outside.
- **21 major moons** with real semi-major axes, eccentricities, inclinations and periods,
  in their parents' equatorial frames (Earth's Moon in the ecliptic frame, Triton
  retrograde). Tidally locked moons keep their near face to the parent.
- **Comet 1P/Halley** on its true retrograde e = 0.967 orbit, perihelion dates matching
  1986 and 2061, with a coma and twin tails (blue ion, warm dust) that grow near the Sun.
- **A 3,600-body asteroid belt** on individually propagated Keplerian orbits with Kirkwood
  gaps at the 3:1, 5:2 and 7:3 Jupiter resonances, plus a 9,000-point Kuiper belt.
- **Earth's rotation follows Greenwich Mean Sidereal Time**, so the day/night terminator
  and the city-light night side match the real current time.
- **Live readouts** via the vis-viva equation: heliocentric distance, orbital speed, and
  distance to Earth update as bodies move.
- **Graphics:** NASA-derived 8K Earth (day, night, clouds) and 2K planet maps, custom GLSL
  (animated solar photosphere with granulation and limb darkening, Earth day/night
  terminator with ocean specular, additive atmospheres, backlit Saturn rings with the
  planet's real shadow), an HDR pipeline (ACES tone mapping, half-float MSAA target,
  UnrealBloom, logarithmic depth buffer spanning nine orders of magnitude).

**Physics lab (the "what if").** Switch from the ephemeris to a live N-body integration:
the Sun, planets, Pluto, Ceres and Halley are seeded from their exact ephemeris state
vectors and then move under real mutual gravity (symplectic leapfrog, adaptive substeps
that shrink near close approaches, swept collision detection, momentum-conserving merges).
Change the gravitational constant (0 to 10x), scale any body's mass (0.01x to 1000x), halt
/ reverse / kick velocities, and watch the true consequence. One-click presets: Jupiter
becomes a star, Sun x0.5, double G, halt Earth, reverse Venus. Every body reports live
heliocentric position, velocity, net gravitational force, acceleration and its strongest
attractor, and the numbers match analytic values (Earth reads about 3.5 x 10^22 N of solar
pull).

### 2. Equation Lab

Type any equation and watch it move through space and time under the same cinematic
pipeline (bloom, trails, free camera, live readouts). The trail is the time axis.

- **Four equation classes:** parametric curves x(t), y(t), z(t); velocity fields
  dx/dt = f(x, y, z, t) integrated with RK4; force fields a(x, v, t); and animated surfaces
  z = f(x, y, t) with a height colormap.
- **A safe expression compiler** (recursive-descent, whitelisted tokens only, null-prototype
  lookup tables, arity checking) with implicit multiplication, so `10(y - x)` and
  `a sin(b x + t)` both work. Errors show inline while the last good equation keeps running.
- **Swarms of up to 200 particles** with rainbow trails make chaos visible: nearby starting
  points diverging is the butterfly effect on screen. Parameters a, b, c, d are live sliders.
- **Presets:** Lorenz, Aizawa, Thomas and Rossler attractors, Lissajous and torus knots,
  Kepler orbits (the same inverse-square law as the solar tab), a charged particle in a
  magnetic field, an anisotropic oscillator, and three animated surfaces.
- **Superposition:** freeze any equation as a weighted layer and stack up to six. Same-type
  layers combine: positions add for parametric curves (epicycles, beats, Fourier-style
  composition), vector fields blend for velocity/force systems (Lorenz morphing into
  Thomas), and heights add for surfaces (literal wave interference). Weights are live.

### 3. Earth Lab

- **A true-scale cutaway of Earth:** inner core, outer core, lower and upper mantle and
  crust at PREM seismic-model radii, each clickable with detailed data (temperature,
  density, pressure, composition, gravity profile), plus cards for the oceans, land,
  atmosphere layers, the geodynamo magnetic field (drawn as tilted dipole field lines),
  and the gravity profile inside the planet (it peaks at the core-mantle boundary).
- **A real-time Single Point Mooring (SPM) simulation:** a floating buoy held by six
  catenary chains 60 degrees apart, each from a stopper on the buoy rim to a seabed pile.
  Every chain is solved each frame with quasi-static catenary mechanics across the
  grounded, fully suspended and taut regimes, reporting **touchdown point, stopper angle
  and stopper tension** per chain. Wind, current and mean wave-drift forces push the
  dynamic buoy across an animated sea; upwind chains tighten and lift off the seabed.
  Every parameter is live (buoy size, depth, span, chain length and weight, MBL, wind,
  current, wave height and period). Chains color by utilization; the buoy traces its
  drift. The solver uses submerged chain weight (0.87x the in-air weight).

### 4. Light Lab

A geometric-optics workbench that traces every ray bounce-by-bounce and reports the full
event log. The point is not a pretty rainbow; it is the numbers behind each interaction.

- **Ray tracer:** plane and spherical surfaces, mirrors, dielectrics and detectors. At every
  hit: incidence and transmission angles, Fresnel R/T (unpolarized average of Rs, Rp),
  total internal reflection when past the critical angle, optical path length and time of
  flight (mm and ns).
- **Cauchy dispersion:** n(λ) = A + B/λ² for BK7, fused silica, water, acrylic, sapphire and
  diamond, so a prism or rainbow actually splits by wavelength with spectral colors.
- **Ray-by-ray analysis:** a sortable table of every ray (λ, launch angle, hit count, residual
  intensity, OPL, fate). Click a row or a ray in the 3D view to open the event inspector:
  each bounce shows θi, θt, n1 to n2, Fresnel coefficients, intensity in/out, OPL, ToF and the
  Snell residual `|n1 sin θi - n2 sin θt|`.
- **Presets:** air to glass Snell demo (with live verification of the residual), total internal
  reflection past θc, equilateral prism dispersion, biconvex BK7 lens (lensmaker focal mark,
  spherical aberration visible on outer rays), concave spherical mirror (f = R/2), parallel
  plate shift, diamond brilliance, Descartes water-drop rainbow (~42° primary bow), silica vs
  BK7 comparison, and a dense white-beam stress test.
- **Live controls:** fan angle, ray count, wavelength bands, lens radius and thickness, prism
  apex, impact parameter, material. Everything rebuilds the fan immediately.

### 5. Gravity Lab

An orbital-mechanics sandbox with particle-by-particle analysis, plus pedagogical
quantum-gravity toys. Leapfrog N-body for massive bodies and massless tracers; a live
force-law exponent so you can break 1/r² on purpose; and six effective QG models.

- **Integrator:** symplectic kick-drift-kick leapfrog in km, kg, s, with adaptive substeps.
  Massive bodies feel each other; tracers feel the massive field only.
- **Particle-by-particle analysis:** for every tracer, live r, v, specific energy ε, specific
  angular momentum h, eccentricity e, semi-major a, periapsis / apoapsis, period, flight-path
  angle, escape and circular speeds, and orbit kind (circular / elliptical / parabolic /
  hyperbolic). Click a row or a mesh to open the inspector.
- **Force-law exponent:** F ∝ 1/rⁿ with n live. The Inverse-square check preset reports the
  log-log slope of acceleration vs radius; Broken force law shows Bertrand precession when
  n ≠ 2.
- **Classical presets:** LEO circular (period verify), elliptical family, escape fan,
  inverse-square check, Earth-Moon, binary stars, gravity assist flyby, Roche limit rubble
  pile, Kepler fans (T² ∝ a³ verify), and broken force law.
- **Quantum gravity (pedagogical):** not a full theory; effective models you can poke:
  - **Quantum bounce** (LQG-inspired): a = −GM/r² + GM ℓ_b²/r⁴; free-fall rebounds
  - **Running G** (asymptotic safety): G(r) = G₀/(1+(ℓ/r)^α); UV softening
  - **Massive graviton** (Yukawa): Φ ∝ e^{−r/λ}/r; screened far-field
  - **Spacetime foam:** stochastic geodesic kicks that grow at small r
  - **Hawking evaporation:** toy dM/dt = −κ/M²; orbits unbind as the hole shrinks
  - **Schrödinger-Newton:** self-gravitating packet + Bohm-like quantum pressure
- **Potential well:** a live mesh of Φ colored by depth; trails on tracers; Roche / scale rings.

---

## Traces and information

The point of an observatory is not just to look, but to record. Every instrument feeds a
shared set of capture mechanisms so an experiment leaves evidence behind.

- **Motion trails.** Fading, per-object rainbow trails show where everything has been.
  In the physics lab they reveal divergence from the original orbits; in the Equation Lab
  they are the fourth (time) axis; in the mooring they trace the buoy's watch circle.
- **Timeline.** The Equation Lab records up to 600 state snapshots as it runs. Drag the
  scrubber back to any moment; integrated systems restore their exact state and
  re-integrate forward from there, so the timeline is a real rewind, not a replay.
- **Version history (git-style commits).** A Commit button snapshots the entire lab state
  (equation, parameters, superposition layers, pasted dataset, camera) with a rendered
  thumbnail and an optional message. Commits chain to their parent with short hashes, show
  a diff against the parent (changed expressions, parameter values, layer counts), and
  Checkout restores any version exactly. Up to 40 commits persist in the browser via
  localStorage. This is the lab-notebook layer: branch an idea, compare two runs, come
  back tomorrow.
- **Data fit.** Paste a dataset (`[t,] x [, y [, z]]`) and Observatory plots it colored
  from early to late with a tracer replaying the path, then runs a least-squares search
  over model families (lines, polynomials, sinusoids, damped sinusoids, exponentials) and
  reports a candidate equation per axis with its R-squared. One click overlays the fit on
  the data for comparison. Curiosity in, a hypothesis out.
  - **Live numeric readouts.** Position, velocity, force, acceleration, orbital speed, chain
  tension, catenary angle, ray θi/θt/Fresnel/OPL, and more, updated every frame in real units.
  The visualization is never a substitute for the number.
- **PNG snapshots.** Press S in any tab to download a clean render (the HUD is DOM and
  stays out of the frame), named for what it captured.
- **Trace video.** Press V (or the record button) to capture up to 10 seconds of the live
  view with the XO logo and live equation / lab readouts burned into the frame. While
  recording, every particle / ray / body is sampled into a data trace. On stop the app
  downloads the video plus JSON/CSV traces and opens an expected-vs-actual results table.

---

## Scientific accuracy and methods

Observatory is meant to be trustworthy enough to reason with, so the methods are explicit.

| Subsystem | Method | Source / basis |
| --- | --- | --- |
| Planet positions | Keplerian elements with secular rates, Newton-iterated Kepler equation | JPL / Standish, "Approximate Positions of the Major Planets" |
| Axial tilts and poles | Derived from IAU pole RA/Dec (angular-momentum pole for retrograde rotators) | IAU WGCCRE |
| Earth rotation | Greenwich Mean Sidereal Time | IAU sidereal-time formula |
| N-body gravity | Symplectic leapfrog (kick-drift-kick), adaptive substeps, swept collisions, momentum-conserving merges | Standard geometric integrator |
| Orbital speeds | Vis-viva equation | Two-body energy |
| ODE / force fields | Fixed-quality RK4 with per-frame substep cap | Classical fourth-order Runge-Kutta |
| Data fit | Least-squares over model families, R-squared reported | Standard regression |
| Mooring chains | Quasi-static catenary (grounded / suspended / taut), submerged weight | Standard catenary mooring analysis |
| Waves | Linear (Airy) dispersion, three directional components; mean wave-drift force | Linear wave theory |
| Earth interior | Layer radii and densities | PREM (Preliminary Reference Earth Model), IUGG values |
| Ray optics | Snell's law, Fresnel R/T (unpolarized), TIR, Cauchy n(λ) = A + B/λ² | Hecht, Optics; Schott / standard glass catalogs |
| Gravity sandbox | Symplectic leapfrog; orbital elements from h and e vectors; F ∝ 1/rⁿ | Vallado / Battin; Bertrand's theorem |

Numbers are checked against known values where possible. For example, the default mooring
case (30 m depth, 300 m span, 315 m chain at 250 kg/m) reproduces the analytic catenary
solution to within rounding: about 10.5 t stopper tension at about 68 degrees, touchdown
about 270 m from the pile.

## Deliberate approximations

Being honest about the model is part of being useful for analysis.

- **Two-body Kepler propagation** in the solar tab: no planet-planet perturbations, no
  precession beyond JPL secular rates. Halley's period is fixed at the 1986-to-2061
  interval, so earlier apparitions drift by weeks.
- **Fixed lunar nodes and phases** (real lunar nodes precess on an 18.6-year cycle).
- **Planet rotation phases** (except Earth's GMST) carry arbitrary epoch offsets; meridians
  are not aligned to IAU W0.
- **Scaled view mode** exaggerates body sizes for visibility and spreads moon orbits to
  clear the inflated parent radius; distances are never distorted, and true-scale mode
  shows honest geometry.
- **Equation Lab and mooring** run in their own scaled scenes; the mooring is quasi-static
  (per-frame catenary equilibrium), not a full dynamic cable model.

---

## Architecture

Vanilla ES modules, no UI framework. `main.js` wires the modules together and owns the
single render loop; each tab hides the others and runs its own update.

```
src/
  main.js            Orchestrator: tabs, render loop, picking, snapshots, physics-lab glue
  capture/
    recorder.js        Composite MediaRecorder, 10s cap, WebM/MP4 + data exports
    overlay.js         XO logo + live equation/lab HUD painter
    datatrace.js       Per-point expected vs actual sampling
  sim/               Time and celestial mechanics
    constants.js       Units, scene scale, unit conversions
    clock.js           Simulation clock (rate, pause, date jump)
    kepler.js          Kepler solver, element propagation, vis-viva
    nbody.js           Symplectic-leapfrog N-body integrator, collisions
  data/
    bodies.js          Astronomical dataset: elements, physical data, moons, poles
  scene/               three.js scene and rendering
    setup.js           Renderer, camera, composer (bloom), starfield
    sun.js             Animated photosphere, corona, lens flare
    bodies3d.js        Planet/moon meshes, orbits, labels, per-frame update
    comet.js           Halley nucleus, coma, ion + dust tails
    asteroids.js       Instanced belt + Kuiper point cloud
    materials.js       Custom GLSL (earth, atmosphere, rings, sun)
    trails.js          Reusable fading trail system (shared by all tabs)
  math/                Equation Lab engine
    expr.js            Safe expression compiler (tokenize, parse, codegen)
    presets.js         Curated equation presets
    mathlab.js         Particle integration, surfaces, timeline, superposition
    datafit.js         Least-squares curve fitting
  earth/               Earth Lab
    earthdata.js       PREM layers, oceans, atmosphere, field, gravity data
    earthlab.js        Cutaway planet + SPM scene
    mooring.js         Catenary solver + buoy dynamics + wave field
  light/               Light Lab
    optics.js          Snell, Fresnel, Cauchy dispersion, multi-bounce ray tracer
    presets.js         Optical-bench presets (prism, lens, TIR, rainbow, ...)
    lightlab.js        Bench scene, colored rays, detector, picking
  gravity/             Gravity Lab
    grav.js            Leapfrog N-body, orbital elements, tunable F ∝ 1/r^n
    quantum.js         Pedagogical QG effective models (bounce, running G, ...)
    presets.js         Classical + quantum-gravity presets
    gravitylab.js      Potential well, tracers, trails, picking
  camera/
    focus.js           Fly-to and follow-along camera controller
  textures/
    procedural.js      Canvas-generated textures for unmapped bodies
  ui/                  HUD panels (DOM, not WebGL)
    ui.js              Top bar, body list, info panel, time controls, help, keys
    lab.js             Physics-lab (N-body experiment) panel
    equationPanel.js   Equation editor, presets, timeline, commits, data fit
    earthPanel.js      Interior explorer + mooring workbench
    lightPanel.js      Optics presets, live params, ray-by-ray table + event log
    gravityPanel.js    Classical + QG presets, live params, particle table
```

**Scene conventions (important when adding anything):**

- Solar tab: 1 AU = 1000 scene units; ecliptic frame maps to scene axes as
  (x_ecl, z_ecl, -y_ecl) to preserve handedness.
- Equation Lab: math coordinates are z-up and map to the scene as (x, y, z) -> (X, -Z, Y).
- Earth Lab planet: 1 scene unit = 100 km. Earth Lab mooring: 1 scene unit = 1 m.
- Light Lab: 1 scene unit = 1 mm on the optical bench (XY working plane).
- Gravity Lab: physics in km; each preset sets `sceneScale` (km to scene units).
- Keep all physics in real units (km, kg, s, N, m, mm, nm) and convert to scene units only at the
  render boundary.

---

## Contributing

Contributions are welcome, whether that is a new equation preset, another celestial body,
a mooring improvement, a bug fix, or a correction to a physical constant. This is a science
tool first, so accuracy and honesty about the model matter as much as clean code.

### Getting set up

```bash
git clone https://github.com/sharmasuraj0123/solar-claude.git
cd solar-claude
npm install
npm run dev
```

There is no test runner or linter wired up yet. The bar for a change is: **`npm run build`
passes, the app runs with a clean console, and you have driven the affected feature in the
browser to confirm it behaves.**

### Ways to extend

- **Add a celestial body:** add an entry to `src/data/bodies.js` following the documented
  shape (Keplerian elements as `[value at J2000, rate per century]`, physical data, poles
  from IAU RA/Dec, optional moons). The scene, orbit line, label and picking are generated
  automatically.
- **Add an equation preset:** add to `src/math/presets.js` with a `type`
  (`parametric` | `ode` | `force` | `surface`), the expressions, parameter ranges, initial
  conditions and a camera framing. The editor, sliders and integrator pick it up.
- **Add a mooring scenario or Earth data:** parameters live in `src/earth/mooring.js`
  (`MooringSim.params`) and the interior/field/atmosphere dataset in
  `src/earth/earthdata.js`.
- **Add an optics preset:** add to `src/light/presets.js` with a `build(params)` that
  returns surfaces, elements, angles/wavelengths (and optional `bundle` y-offsets or
  `forceReflectOn` bounce list). The panel, tracer and detector pick it up.
- **Add a gravity preset:** add to `src/gravity/presets.js` with bodies in km/kg/s and a
  `sceneScale`. Optional `verify(sim)` chip runs against analytic Kepler / force-law checks.

### Accuracy bar

- **Cite the source for any physical number** you add or change, in a comment or the PR.
  If it is a measured or standard value (a radius, a mass, an orbital element, a material
  property), say where it came from.
- **Verify quantitatively** when you touch a solver. Compare against an analytic result, a
  published value, or a known limiting case, and note the comparison in the PR. "It looks
  right" is not enough for a tool people reason with.
- **If you find a wrong number, that is a valid and valuable contribution.** Open an issue
  or PR with the correct value and its source.

### Code style

- Vanilla ES modules and three.js 0.170. No framework, no build magic beyond Vite.
- Match the surrounding code: small focused modules, real units in the physics layer,
  scene-unit conversion only at the edges, and comments that explain the *why* (especially
  the coordinate frames and any non-obvious physics or numerical choice).
- Keep the render loop lean. Heavy work should be throttled, cached, or spread across
  frames the way the asteroid belt and water mesh already are.

### Pull requests

1. Branch off `main`.
2. Keep the change focused; unrelated cleanups belong in their own PR.
3. In the description, say what you changed, how you verified it (build, console, the
   in-browser behavior you drove), and cite sources for any new physical constants.
4. Screenshots or a short clip help a lot for anything visual.

### Reporting issues

Useful reports include what you expected, what happened, the instrument and any parameter
values, and console output if there was an error. For scientific corrections, include the
authoritative source.

---

## Credits

- **Ephemerides:** E.M. Standish, "Keplerian Elements for Approximate Positions of the
  Major Planets" (JPL / NASA).
- **Interior model:** PREM (Dziewonski and Anderson, 1981) and IUGG reference values.
- **Textures:** [Solar System Scope](https://www.solarsystemscope.com/textures/)
  (CC BY 4.0), based on NASA imagery.
- **Engine:** [three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).
- **Brand:** the XO mark.

Texture assets are CC BY 4.0 (see Solar System Scope). Application code has no license
declared yet; if you intend to reuse it, open an issue to confirm terms.
