import * as THREE from 'three';
import { createStage, createEclipticGrid } from './scene/setup.js';
import { PlanetSystem } from './scene/bodies3d.js';
import { Sun } from './scene/sun.js';
import { AsteroidBelt, KuiperBelt } from './scene/asteroids.js';
import { Comet } from './scene/comet.js';
import { TrailSystem } from './scene/trails.js';
import { FocusController } from './camera/focus.js';
import { SimClock } from './sim/clock.js';
import { NBodySim } from './sim/nbody.js';
import { elementsAt, positionFromElements, orbitalSpeedKms, moonSpeedKms } from './sim/kepler.js';
import { KM_TO_UNITS, AU_KM, G_KM, DAYS_PER_CENTURY } from './sim/constants.js';
import { UI } from './ui/ui.js';
import { LabPanel } from './ui/lab.js';
import { proceduralTexture, uranusRingTexture } from './textures/procedural.js';
import { PLANETS, DWARFS, SUN, COMET_HALLEY } from './data/bodies.js';

const FILES = {
  sun: '2k_sun.jpg',
  mercury: '2k_mercury.jpg',
  venusSurface: '2k_venus_surface.jpg',
  venusClouds: '2k_venus_atmosphere.jpg',
  earthDay: '8k_earth_daymap.jpg',
  earthNight: '8k_earth_nightmap.jpg',
  earthClouds: '8k_earth_clouds.jpg',
  moon: '2k_moon.jpg',
  mars: '2k_mars.jpg',
  jupiter: '2k_jupiter.jpg',
  saturn: '2k_saturn.jpg',
  saturnRing: '2k_saturn_ring_alpha.png',
  uranus: '2k_uranus.jpg',
  neptune: '2k_neptune.jpg',
};

// clouds alpha map must stay linear; everything else is color data
const LINEAR_KEYS = new Set(['earthClouds']);

const loadFill = document.getElementById('load-fill');
const setProgress = (f) => { if (loadFill) loadFill.style.width = `${Math.round(f * 100)}%`; };

function loadTextures() {
  const loader = new THREE.TextureLoader();
  const keys = Object.keys(FILES);
  const out = {};
  let done = 0;
  return Promise.all(keys.map((key) => new Promise((resolve) => {
    loader.load(
      `/textures/${FILES[key]}`,
      (tex) => {
        if (!LINEAR_KEYS.has(key)) tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        // the sun shader scrolls UVs indefinitely, so it must wrap
        if (key === 'sun') tex.wrapS = THREE.RepeatWrapping;
        out[key] = tex;
        done++; setProgress(done / keys.length); resolve();
      },
      undefined,
      () => {
        console.warn(`Texture missing, falling back to procedural: ${FILES[key]}`);
        out[key] = null;
        done++; setProgress(done / keys.length); resolve();
      }
    );
  }))).then(() => out);
}

async function init() {
  const textures = await loadTextures();

  const procCache = new Map();
  const getTexture = (key) => {
    if (key && key.startsWith('proc:')) {
      const kind = key.slice(5);
      if (!procCache.has(kind)) {
        procCache.set(kind, kind === 'uranusRing' ? uranusRingTexture() : proceduralTexture(kind));
      }
      return procCache.get(kind);
    }
    if (textures[key]) return textures[key];
    if (!procCache.has('generic')) procCache.set('generic', proceduralTexture('callisto'));
    return procCache.get('generic');
  };

  const container = document.getElementById('app');
  const stage = createStage(container);
  const { scene, camera, renderer, composer, labelRenderer, controls } = stage;

  const grid = createEclipticGrid(scene);

  const clock = new SimClock();

  const byId = new Map();
  const isDead = (rec) => !!(rec.destroyed || (rec.isComet && physics.halleyDestroyed));
  const select = (id, opts = {}) => {
    const rec = byId.get(id);
    if (!rec) return;
    ui.showInfo(rec);
    if (opts.focus && !isDead(rec)) focusCtl.focus(rec);
  };

  const system = new PlanetSystem(scene, getTexture, (id) => select(id, { focus: true }));
  const sun = new Sun(scene, { sun: getTexture('sun') }, (rec) => system.makeLabel(rec));
  const comet = new Comet(scene, (rec) => system.makeLabel(rec));
  const belt = new AsteroidBelt(scene);
  const kuiper = new KuiperBelt(scene);

  for (const [id, rec] of system.byId) byId.set(id, rec);
  byId.set('sun', sun);
  byId.set('halley', comet);

  // sun needs a pick target like everything else
  const sunPick = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial());
  sunPick.layers.set(1);
  sunPick.userData.rec = sun;
  sun.group.add(sunPick);

  const focusCtl = new FocusController(camera, controls);

  // body size scaling (animated toward target)
  let scaleTarget = 80;
  let scaleCur = 80;
  const applyScale = (s) => {
    system.setScale(s);
    sun.setScale(1 + (s - 1) * 0.16);
    sunPick.scale.setScalar(sun.visualRadius * 1.4);
  };
  applyScale(scaleCur);

  // ---------------- physics lab: N-body experiment mode ----------------

  const nbody = new NBodySim();
  const trails = new TrailSystem(scene);
  const physics = { on: false, trailsOn: true, halleyDestroyed: false, beltExtraDays: 0 };
  const physPositions = new Map(); // id -> heliocentric position, scene units
  const physVecs = new Map();
  const physVec = (id) => {
    if (!physVecs.has(id)) physVecs.set(id, new THREE.Vector3());
    return physVecs.get(id);
  };
  const topLevelRecs = [...PLANETS, ...DWARFS].map((p) => system.byId.get(p.id));

  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpP = new THREE.Vector3();

  // ephemeris state vector (km, km/s) via central difference over 0.02 days
  function keplerStateKm(def, d) {
    const h = 0.02;
    positionFromElements(elementsAt(def.elements, (d - h) / DAYS_PER_CENTURY), tmpA);
    positionFromElements(elementsAt(def.elements, (d + h) / DAYS_PER_CENTURY), tmpB);
    positionFromElements(elementsAt(def.elements, d / DAYS_PER_CENTURY), tmpP);
    const k = 1 / KM_TO_UNITS;
    const vs = k / (2 * h * 86400);
    return {
      posKm: [tmpP.x * k, tmpP.y * k, tmpP.z * k],
      velKmS: [(tmpB.x - tmpA.x) * vs, (tmpB.y - tmpA.y) * vs, (tmpB.z - tmpA.z) * vs],
    };
  }

  function cometStateKm(d) {
    const h = 0.02;
    comet.position(d - h, tmpA);
    comet.position(d + h, tmpB);
    comet.position(d, tmpP);
    const k = 1 / KM_TO_UNITS;
    const vs = k / (2 * h * 86400);
    return {
      posKm: [tmpP.x * k, tmpP.y * k, tmpP.z * k],
      velKmS: [(tmpB.x - tmpA.x) * vs, (tmpB.y - tmpA.y) * vs, (tmpB.z - tmpA.z) * vs],
    };
  }

  // raycasting ignores object.visible, so destroyed bodies must leave the pick layer
  function setBodyPickable(rec, on) {
    if (rec.pick) rec.pick.layers.set(on ? 1 : 2);
    if (rec.moons) for (const m of rec.moons) m.pick.layers.set(on ? 1 : 2);
  }

  function seedPhysics(preserveMuls = true) {
    const d = clock.daysSinceJ2000;
    const entries = [{
      id: 'sun', name: 'Sun', massKg: SUN.info.massKg, radiusKm: SUN.radiusKm,
      posKm: [0, 0, 0], velKmS: [0, 0, 0],
    }];
    for (const rec of topLevelRecs) {
      entries.push({
        id: rec.def.id, name: rec.def.name,
        massKg: rec.def.info.massKg, radiusKm: rec.def.radiusKm,
        ...keplerStateKm(rec.def, d),
      });
    }
    entries.push({
      id: 'halley', name: '1P/Halley',
      massKg: COMET_HALLEY.info.massKg, radiusKm: COMET_HALLEY.radiusKm,
      ...cometStateKm(d),
    });
    nbody.seed(entries, preserveMuls);
    for (const rec of topLevelRecs) { rec.destroyed = false; setBodyPickable(rec, true); }
    physics.halleyDestroyed = false;
    physics.beltExtraDays = 0;
    comet.pick.layers.set(1);
    trails.clear();
  }

  function enterPhysics() {
    if (physics.on) return;
    seedPhysics(true);
    physics.on = true;
    system.setOrbitGhost(true);
    comet.orbitLine.material.opacity = 0.07;
    trails.setVisible(physics.trailsOn);
    if (labPanel) { labPanel.sync(); labPanel.log('N-body physics started from the current ephemeris state.'); }
    if (ui && ui.selected) ui.syncExpHint();
  }

  function exitPhysics() {
    if (!physics.on) return;
    physics.on = false;
    system.setOrbitGhost(false);
    system.clearMoonPhases();
    comet.orbitLine.material.opacity = 0.22;
    physics.beltExtraDays = 0;
    physics.halleyDestroyed = false;
    comet.pick.layers.set(1);
    trails.clear();
    trails.setVisible(false);
    // rails means reality: leaving the lab fully discards the experiment state
    nbody.gMul = 1;
    for (const b of nbody.bodies) { b.massMul = 1; b.bonusKg = 0; }
    for (const rec of topLevelRecs) {
      rec.destroyed = false;
      setBodyPickable(rec, true);
      delete rec.speedKms;
    }
    if (labPanel) labPanel.sync();
    if (ui && ui.selected) { ui.syncExpHint(); ui.showInfo(ui.selected); }
  }

  function resetExperiment() {
    nbody.gMul = 1;
    seedPhysics(false);
    if (!physics.on) enterPhysics();
    if (labPanel) { labPanel.sync(); labPanel.log('Experiment reset: masses, G and orbits restored.'); }
    if (ui && ui.selected) ui.showInfo(ui.selected);
  }

  function applyPreset(name) {
    if (name === 'reset') { resetExperiment(); return; }
    enterPhysics();
    switch (name) {
      case 'jupiterStar':
        nbody.setMassMul('jupiter', 1000);
        labPanel.log('Jupiter mass ×1000: now a stellar companion.');
        break;
      case 'halfSun':
        nbody.setMassMul('sun', 0.5);
        labPanel.log('Sun mass halved: watch orbits widen or unbind.');
        break;
      case 'doubleG':
        nbody.gMul = 2;
        labPanel.log('Gravitational constant doubled.');
        break;
      case 'haltEarth':
        nbody.kick('earth', 'halt');
        labPanel.log('Earth halted: free-fall into the Sun takes about 64 days.');
        break;
      case 'reverseVenus':
        nbody.kick('venus', 'reverse');
        labPanel.log('Venus now orbits retrograde.');
        break;
    }
    if (ui.selected) ui.showInfo(ui.selected);
  }

  // gravity / state readout for the info panel, in either mode
  function gravityReport(id) {
    const target = byId.get(id);
    if (!target) return null;
    let tPos, tMass, speedKms;
    const sources = [];
    let G = G_KM;

    if (physics.on && nbody.byId.has(id)) {
      const b = nbody.state(id);
      if (b.destroyed) {
        const w = nbody.state(b.absorbedBy);
        return { destroyed: true, absorbedBy: w ? w.name : 'another body' };
      }
      const s0 = nbody.state('sun');
      tPos = [b.pos[0] - s0.pos[0], b.pos[1] - s0.pos[1], b.pos[2] - s0.pos[2]];
      tMass = nbody.effMass(b);
      speedKms = Math.hypot(b.vel[0] - s0.vel[0], b.vel[1] - s0.vel[1], b.vel[2] - s0.vel[2]);
      G = G_KM * nbody.gMul;
      for (const o of nbody.bodies) {
        if (o === b || o.destroyed) continue;
        sources.push({
          name: o.name, massKg: nbody.effMass(o),
          posKm: [o.pos[0] - s0.pos[0], o.pos[1] - s0.pos[1], o.pos[2] - s0.pos[2]],
        });
      }
    } else {
      // rails geometry; in physics mode moons land here, so apply the
      // experiment's effective masses and G to keep their reports consistent
      const mulOf = (bid) => (physics.on ? nbody.effMassRatio(bid) : 1);
      if (physics.on) G = G_KM * nbody.gMul;
      const k = 1 / KM_TO_UNITS;
      if (id === 'sun') {
        tPos = [0, 0, 0]; tMass = SUN.info.massKg * mulOf('sun'); speedKms = 0;
      } else if (target.isMoon) {
        // real (unspread) geometry for force math
        tmpA.copy(target.localPos);
        if (target.inTiltFrame) tmpA.applyQuaternion(target.parent.tiltQuat);
        tPos = [
          (target.parent.worldPos.x + tmpA.x) * k,
          (target.parent.worldPos.y + tmpA.y) * k,
          (target.parent.worldPos.z + tmpA.z) * k,
        ];
        tMass = target.def.info.massKg || 1;
        const gmEff = target.gmParent * (physics.on ? nbody.gMul * mulOf(target.parent.def.id) : 1);
        speedKms = moonSpeedKms(gmEff, target.def.aKm, target.rKm || target.def.aKm);
      } else {
        tPos = [target.worldPos.x * k, target.worldPos.y * k, target.worldPos.z * k];
        tMass = (target.def.info.massKg || 1) * mulOf(id);
        speedKms = target.speedKms !== undefined ? target.speedKms : orbitalSpeedKms(target.aAU, target.rAU);
      }
      sources.push({ name: 'Sun', massKg: SUN.info.massKg * mulOf('sun'), posKm: [0, 0, 0] });
      for (const rec of topLevelRecs) {
        if (rec === target || rec.destroyed) continue;
        sources.push({
          name: rec.def.name, massKg: rec.def.info.massKg * mulOf(rec.def.id),
          posKm: [rec.worldPos.x * k, rec.worldPos.y * k, rec.worldPos.z * k],
        });
      }
    }

    let fx = 0, fy = 0, fz = 0, scalarSum = 0;
    let strongest = { name: 'Sun', f: 0 };
    for (const s of sources) {
      const dx = s.posKm[0] - tPos[0];
      const dy = s.posKm[1] - tPos[1];
      const dz = s.posKm[2] - tPos[2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < 1) continue;
      const r = Math.sqrt(r2);
      const F = G * tMass * s.massKg / r2; // kg km / s^2
      fx += (dx / r) * F; fy += (dy / r) * F; fz += (dz / r) * F;
      scalarSum += F;
      if (F > strongest.f) strongest = { name: s.name, f: F };
    }
    const netKgKmS2 = Math.hypot(fx, fy, fz);
    return {
      posAU: [tPos[0] / AU_KM, tPos[1] / AU_KM, tPos[2] / AU_KM],
      speedKms,
      forceN: netKgKmS2 * 1000,
      accelMs2: tMass ? (netKgKmS2 / tMass) * 1000 : 0,
      strongest: { name: strongest.name, pct: scalarSum ? (strongest.f / scalarSum) * 100 : 0 },
    };
  }

  // ---------------- UI ----------------

  const ui = new UI({
    clock,
    byId,
    sections: [
      { title: 'Star', items: [sun] },
      { title: 'Planets', items: PLANETS.map((p) => system.byId.get(p.id)) },
      { title: 'Dwarf planets', items: DWARFS.map((p) => system.byId.get(p.id)) },
      { title: 'Comets', items: [comet] },
    ],
    select,
    focus: (id) => focusCtl.focus(byId.get(id)),
    overview: () => focusCtl.overview(),
    escape: () => {
      if (focusCtl.target) focusCtl.release();
      else { focusCtl.overview(); ui.closeInfo(); }
    },
    setPlanetScale: (s) => { scaleTarget = s; },
    defaultScaleSlider: (100 * Math.log(80) / Math.log(400)).toFixed(1),
    toggles: {
      orbits: (v) => { system.setOrbitsVisible(v); comet.orbitLine.visible = v; },
      labels: (v) => { system.setLabelsVisible(v); sun.label.visible = v; comet.label.visible = v; },
      belt: (v) => belt.setVisible(v),
      kuiper: (v) => kuiper.setVisible(v),
      grid: (v) => { grid.visible = v; },
      bloom: (v) => { stage.bloom.enabled = v; },
    },
    experiment: {
      getMassMul: (id) => nbody.getMassMul(id),
      setMassMul: (id, mul) => { enterPhysics(); nbody.setMassMul(id, mul); },
      kick: (id, mode) => { enterPhysics(); nbody.kick(id, mode); },
    },
    physicsInfo: gravityReport,
    isDead: (rec) => isDead(rec),
    isPhysics: () => physics.on,
    toggleLab: () => {
      document.getElementById('settings-panel').classList.add('hidden');
      labPanel.toggle();
    },
  });

  const labPanel = new LabPanel({
    isPhysics: () => physics.on,
    enterPhysics,
    exitPhysics,
    reseed: () => seedPhysics(true),
    resetExperiment,
    setG: (g) => { enterPhysics(); nbody.gMul = g; },
    getG: () => nbody.gMul,
    setTrails: (v) => { physics.trailsOn = v; trails.setVisible(v && physics.on); },
    preset: applyPreset,
  });

  document.getElementById('btn-lab').addEventListener('click', () => {
    document.getElementById('settings-panel').classList.add('hidden');
    labPanel.toggle();
  });
  document.getElementById('btn-settings').addEventListener('click', () => {
    labPanel.el.classList.add('hidden');
  });

  // ---------------- picking ----------------

  const pickables = [...system.pickables, sunPick, comet.pick];
  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(1);
  const ndc = new THREE.Vector2();
  let downAt = null;

  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
    downAt = null;
    if (dx * dx + dy * dy > 36) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (hits.length) select(hits[0].object.userData.rec.def.id, { focus: true });
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    renderer.domElement.style.cursor = raycaster.intersectObjects(pickables, false).length ? 'pointer' : 'default';
  });

  // ---------------- main loop ----------------

  let last = performance.now();
  let elapsed = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    elapsed += dt;

    const prevD = clock.daysSinceJ2000;
    clock.advance(dt);
    const dNow = clock.daysSinceJ2000;

    if (Math.abs(scaleCur - scaleTarget) > Math.max(scaleTarget, 1) * 0.002) {
      scaleCur += (scaleTarget - scaleCur) * Math.min(1, dt * 5);
      applyScale(scaleCur);
    }

    let physState = null;
    if (physics.on) {
      // one frame at max rate advances ~36.6 days; anything bigger is a date jump
      let stepSec = (dNow - prevD) * 86400;
      if (Math.abs(dNow - prevD) > 60) {
        // a date jump teleports the rails; restart the experiment there
        seedPhysics(true);
        labPanel.log('Date jump: experiment re-seeded from the ephemeris.');
        stepSec = 0;
      }
      const { events, consumedSec } = nbody.step(stepSec);
      // if the substep budget saturated (extreme close approaches), rewind the
      // clock by the shortfall so displayed time matches integrated time
      if (Math.abs(stepSec - consumedSec) > 1e-3) {
        clock.simMs -= (stepSec - consumedSec) * 1000;
      }
      for (const ev of events) {
        labPanel.log(`${ev.lostName} was absorbed by ${ev.intoName}.`);
        if (ev.lost === 'halley') {
          physics.halleyDestroyed = true;
          comet.pick.layers.set(2);
          if (focusCtl.target === comet) focusCtl.release();
        } else {
          const r = byId.get(ev.lost);
          if (r) {
            r.destroyed = true;
            setBodyPickable(r, false);
            if (focusCtl.target === r) focusCtl.release();
          }
        }
      }

      const s0 = nbody.state('sun');
      physPositions.clear();
      for (const b of nbody.bodies) {
        if (b.destroyed || b.id === 'sun') continue;
        const v = physVec(b.id).set(
          (b.pos[0] - s0.pos[0]) * KM_TO_UNITS,
          (b.pos[1] - s0.pos[1]) * KM_TO_UNITS,
          (b.pos[2] - s0.pos[2]) * KM_TO_UNITS
        );
        physPositions.set(b.id, v);
        const rec = byId.get(b.id);
        if (rec && rec !== comet) {
          rec.speedKms = Math.hypot(b.vel[0] - s0.vel[0], b.vel[1] - s0.vel[1], b.vel[2] - s0.vel[2]);
        }
      }

      // effMassRatio includes mass gained through mergers, not just the slider
      const dConsumed = clock.daysSinceJ2000 - prevD;
      const sunFactor = Math.sqrt(Math.max(0, nbody.gMul * nbody.effMassRatio('sun')));
      physics.beltExtraDays += (sunFactor - 1) * dConsumed;

      physState = {
        positions: physPositions,
        moonFactor: (pid) => Math.sqrt(Math.max(0, nbody.gMul * nbody.effMassRatio(pid))),
      };

      if (physics.trailsOn) {
        for (const [id, v] of physPositions) {
          if (id === 'halley' && physics.halleyDestroyed) continue;
          const rc = byId.get(id);
          trails.push(id, v, rc ? rc.def.color : 0x9fd8ff);
        }
        trails.update();
      }
    }

    system.update(clock, camera, focusCtl.target, physState);
    sun.update(clock, elapsed, camera);
    // read the clock again: the physics block may have rewound it
    const beltD = clock.daysSinceJ2000 + physics.beltExtraDays;
    belt.update(clock, physics.on ? beltD : undefined);
    kuiper.update(clock, physics.on ? beltD : undefined);
    comet.update(clock, scaleCur, camera, physState ? physPositions.get('halley') : null, physics.halleyDestroyed);
    if (physState && !physics.halleyDestroyed) {
      const hb = nbody.state('halley');
      const s0 = nbody.state('sun');
      if (hb) comet.speedKms = Math.hypot(hb.vel[0] - s0.vel[0], hb.vel[1] - s0.vel[1], hb.vel[2] - s0.vel[2]);
    }

    focusCtl.update(dt);
    controls.update();
    ui.tick(dt);

    composer.render();
    labelRenderer.render(scene, camera);
  });

  const loading = document.getElementById('loading');
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 900);

  // debugging handle for automated checks
  window.__solar = { clock, byId, system, focusCtl, camera, sun, comet, nbody, physics, enterPhysics, exitPhysics };
}

init();
