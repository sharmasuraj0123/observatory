// Equation Lab scene: particles moving through space-time under user equations.
//
// Reuses the app's TrailSystem, bloom pipeline and camera controls. Math
// coordinates are z-up and map to the scene as (x, y, z) -> (X, -Z, Y), the
// same handedness-preserving convention the solar ephemeris uses.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { TrailSystem } from '../scene/trails.js';
import { softDotTexture } from '../scene/setup.js';
import { compileExpr } from './expr.js';

const MAX_PARTICLES = 200;
const DIVERGE_LIMIT = 2e4;
const MAX_SUBSTEPS = 48;
const SUBSTEP_H = 0.02; // integration quality: RK4 step in equation-time units
const LABEL_MAX = 8; // reference labels on the first few particles
const HISTORY_CAP = 600; // timeline snapshots kept for scrubbing
const HISTORY_INTERVAL = 0.15; // tau between recorded snapshots
const PARAM_SCRUB_SPAN = 120; // scrub window for pure functions of tau

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MathLab {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // reference grid and axes
    const grid = new THREE.GridHelper(140, 28, 0x2a3550, 0x151d30);
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    grid.material.depthWrite = false;
    this.group.add(grid);
    this.buildAxes();

    this.trails = new TrailSystem(this.group, 700, 0.34);

    const geo = new THREE.SphereGeometry(1, 12, 10);
    this.particlesMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: true }), MAX_PARTICLES);
    this.particlesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particlesMesh.count = 0;
    this.group.add(this.particlesMesh);

    this.dummy = new THREE.Object3D();
    this.tmpColor = new THREE.Color();

    this.tau = 0;
    this.playing = true;
    this.speedMul = 1;
    this.direction = 1; // +1 forward, -1 reverse
    this.respawns = 0;
    this.effRate = null;
    this.p0Respawned = false;
    this.onP0Respawn = null;
    this.error = null;
    this.cfg = null;
    this.compiled = null;
    this.scope = { t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    this.states = new Float64Array(MAX_PARTICLES * 6);
    this.alive = new Uint8Array(MAX_PARTICLES);
    this.colors = [];

    this.surface = null;
    this.data = null; // plotted dataset overlay
    this.layers = []; // frozen superposition layers
    this.actLayers = []; // layers matching the current type, cached per frame

    this.particleSize = 0.55;
    this.labelsOn = true;
    this.labelObjs = [];
    this.followIndex = 0;
    this.onFollowRequest = null;

    // timeline history for scrubbing back through tau
    this.history = [];

    // camera-follow target compatible with FocusController
    this.focusRec = {
      def: { id: 'particle0', name: 'Particle 1', color: 0x86b7ff },
      worldPos: new THREE.Vector3(),
      visualRadius: 1.4,
    };
  }

  setParticleSize(s) {
    this.particleSize = s;
  }

  setLabelsOn(v) {
    this.labelsOn = v;
  }

  setFollowIndex(i) {
    this.followIndex = Math.min(Math.max(0, i), Math.max(0, (this.n || 1) - 1));
    this.focusRec.def.name = `Particle ${this.followIndex + 1}`;
  }

  ensureLabels(count) {
    while (this.labelObjs.length < count) {
      const i = this.labelObjs.length;
      const el = document.createElement('div');
      el.className = 'body-label small';
      el.innerHTML = `<span class="label-dot"></span><span class="label-name">P${i + 1}</span>`;
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.setFollowIndex(i);
        if (this.onFollowRequest) this.onFollowRequest();
      });
      const obj = new CSS2DObject(el);
      obj.visible = false;
      this.group.add(obj);
      this.labelObjs.push({ obj, dot: el.querySelector('.label-dot') });
    }
  }

  buildAxes() {
    const L = 42;
    const axes = [
      { dir: new THREE.Vector3(1, 0, 0), color: 0xd97a6a, label: 'x' },
      { dir: new THREE.Vector3(0, 0, -1), color: 0x7ac48f, label: 'y' },
      { dir: new THREE.Vector3(0, 1, 0), color: 0x86b7ff, label: 'z' },
    ];
    for (const ax of axes) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        ax.dir.clone().multiplyScalar(-L * 0.55), ax.dir.clone().multiplyScalar(L),
      ]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: ax.color, transparent: true, opacity: 0.5, depthWrite: false,
      }));
      this.group.add(line);
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 2.4, 10),
        new THREE.MeshBasicMaterial({ color: ax.color, transparent: true, opacity: 0.7 })
      );
      tip.position.copy(ax.dir).multiplyScalar(L);
      tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax.dir);
      this.group.add(tip);
    }
  }

  varsForType(type) {
    if (type === 'parametric') return ['t'];
    if (type === 'ode') return ['x', 'y', 'z', 't'];
    if (type === 'force') return ['x', 'y', 'z', 'vx', 'vy', 'vz', 't'];
    return ['x', 'y', 't']; // surface
  }

  // Compile and adopt a config. Throws (leaving the previous config running)
  // if any expression fails to compile. Only parameters the config actually
  // defines are compilable, so a typo like an undefined "d" fails here with a
  // friendly message instead of NaN-poisoning the integration.
  applyConfig(cfg) {
    const paramNames = Object.keys(cfg.params || {});
    const vars = [...this.varsForType(cfg.type), ...paramNames];
    const compiled = {};
    if (cfg.type === 'surface') {
      compiled.z = compileExpr(cfg.exprs.z, vars);
    } else {
      compiled.x = compileExpr(cfg.exprs.x, vars);
      compiled.y = compileExpr(cfg.exprs.y, vars);
      compiled.z = compileExpr(cfg.exprs.z, vars);
    }
    this.cfg = cfg;
    this.compiled = compiled;
    this.error = null;
    // drop stale params from earlier configs so nothing evaluates against them
    for (const k of ['a', 'b', 'c', 'd']) {
      if (!paramNames.includes(k)) delete this.scope[k];
    }
    for (const [k, p] of Object.entries(cfg.params || {})) this.scope[k] = p.value;
    this.tau = 0;
    this.respawns = 0;
    this.effRate = null;
    this.rebuildSurface();
    this.resetParticles();
  }

  setParam(name, value) {
    this.scope[name] = value;
    if (this.cfg && this.cfg.params && this.cfg.params[name]) this.cfg.params[name].value = value;
  }

  resetParticles() {
    const cfg = this.cfg;
    this.trails.clear();
    this.respawns = 0;
    this.history.length = 0;
    if (!cfg || cfg.type === 'surface') {
      this.particlesMesh.count = 0;
      for (const L of this.labelObjs) L.obj.visible = false;
      return;
    }
    const n = Math.min(MAX_PARTICLES, Math.max(1, cfg.particles || 30));
    this.n = n;
    this.particlesMesh.count = n;
    this.colors.length = 0;
    const rng = mulberry32(1234567 + n);
    for (let i = 0; i < n; i++) {
      this.seedParticle(i, rng);
      this.alive[i] = 1;
      // rainbow spread so neighboring particles have neighboring hues
      const c = new THREE.Color().setHSL((0.53 + 0.62 * (n === 1 ? 0 : i / (n - 1))) % 1, 0.85, 0.6);
      this.colors.push(c);
      this.particlesMesh.setColorAt(i, this.tmpColor.copy(c).multiplyScalar(1.7));
    }
    if (this.particlesMesh.instanceColor) this.particlesMesh.instanceColor.needsUpdate = true;

    this.ensureLabels(Math.min(n, LABEL_MAX));
    for (let i = 0; i < this.labelObjs.length; i++) {
      const L = this.labelObjs[i];
      const active = i < Math.min(n, LABEL_MAX);
      L.obj.visible = false; // shown by projectParticles once positioned
      L.active = active;
      if (active) {
        const hex = '#' + this.colors[i].getHexString();
        L.dot.style.background = hex;
        L.dot.style.boxShadow = `0 0 6px ${hex}`;
      }
    }
    if (this.followIndex >= n) this.setFollowIndex(0);
  }

  seedParticle(i, rng = Math.random) {
    const cfg = this.cfg;
    const s = this.states;
    const ic = cfg.ic || {};
    const spread = cfg.spread || 0;
    const vj = cfg.velJitter || 0;
    const j = i * 6;
    s[j] = (ic.x || 0) + (rng() - 0.5) * 2 * spread;
    s[j + 1] = (ic.y || 0) + (rng() - 0.5) * 2 * spread;
    s[j + 2] = (ic.z || 0) + (rng() - 0.5) * 2 * spread;
    s[j + 3] = (ic.vx || 0) + (rng() - 0.5) * 2 * vj;
    s[j + 4] = (ic.vy || 0) + (rng() - 0.5) * 2 * vj;
    s[j + 5] = (ic.vz || 0) + (rng() - 0.5) * 2 * vj;
  }

  rebuildSurface() {
    if (this.surface) {
      this.group.remove(this.surface.mesh, this.surface.wire);
      this.surface.geo.dispose();
      this.surface = null;
    }
    if (!this.cfg || this.cfg.type !== 'surface') return;
    const R = this.cfg.range || 30;
    const SEG = 110;
    const geo = new THREE.PlaneGeometry(R * 2, R * 2, SEG, SEG);
    geo.rotateX(-Math.PI / 2); // plane in XZ, height on Y
    const colors = new Float32Array(geo.attributes.position.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide,
    }));
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      wireframe: true, color: 0x86b7ff, transparent: true, opacity: 0.07, depthWrite: false,
    }));
    wire.renderOrder = 1;
    this.group.add(mesh, wire);
    this.surface = { mesh, wire, geo, R, SEG };
  }

  // dtReal: wall-clock seconds elapsed this frame
  toggleDirection() {
    this.direction *= -1;
  }

  update(dtReal) {
    if (!this.cfg || !this.compiled) return;
    this.refreshActiveLayers();
    let dtEq = this.playing ? dtReal * (this.cfg.speed || 1) * this.speedMul * this.direction : 0;

    if (this.cfg.type === 'surface') {
      this.tau += dtEq;
      this.updateSurface();
      this.updateTracer();
      return;
    }

    if (dtEq !== 0) {
      if (this.cfg.type === 'parametric') {
        this.tau += dtEq;
      } else {
        // RK4 with fixed-quality substeps; cap work per frame and advance tau
        // only by what was actually integrated
        const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(Math.abs(dtEq) / SUBSTEP_H)));
        const h = Math.sign(dtEq) * Math.min(Math.abs(dtEq) / steps, SUBSTEP_H * 2.5);
        for (let k = 0; k < steps; k++) {
          this.integrateAll(h);
          this.tau += h;
        }
        // effective rate for the HUD: the cap can throttle below nominal speed
        if (dtReal > 0) {
          const inst = Math.abs(h * steps) / dtReal;
          this.effRate = this.effRate === null ? inst : this.effRate * 0.85 + inst * 0.15;
        }
      }
    }
    this.projectParticles();
    this.updateTracer();
    if (dtEq !== 0) this.recordHistory();
    if (this.p0Respawned) {
      this.p0Respawned = false;
      if (this.onP0Respawn) this.onP0Respawn();
    }
  }

  integrateAll(h) {
    const ode = this.cfg.type === 'ode';
    for (let i = 0; i < this.n; i++) {
      if (ode) this.rk4Ode(i, h);
      else this.rk4Force(i, h);
      const j = i * 6;
      const s = this.states;
      if (!Number.isFinite(s[j]) || !Number.isFinite(s[j + 1]) || !Number.isFinite(s[j + 2]) ||
          Math.abs(s[j]) > DIVERGE_LIMIT || Math.abs(s[j + 1]) > DIVERGE_LIMIT || Math.abs(s[j + 2]) > DIVERGE_LIMIT) {
        this.seedParticle(i);
        this.trails.clearOne('p' + i);
        this.respawns++;
        if (i === this.followIndex) this.p0Respawned = true; // camera follow must re-anchor
      }
    }
  }

  evalOde(x, y, z, t, out) {
    const v = this.scope;
    v.x = x; v.y = y; v.z = z; v.t = t;
    out[0] = this.compiled.x(v);
    out[1] = this.compiled.y(v);
    out[2] = this.compiled.z(v);
    for (const L of this.actLayers) {
      const lv = L.v;
      lv.x = x; lv.y = y; lv.z = z; lv.t = t;
      out[0] += L.weight * L.fns.x(lv);
      out[1] += L.weight * L.fns.y(lv);
      out[2] += L.weight * L.fns.z(lv);
    }
  }

  rk4Ode(i, h) {
    const s = this.states, j = i * 6, t = this.tau;
    const x = s[j], y = s[j + 1], z = s[j + 2];
    const k1 = this.k1 || (this.k1 = [0, 0, 0]);
    const k2 = this.k2 || (this.k2 = [0, 0, 0]);
    const k3 = this.k3 || (this.k3 = [0, 0, 0]);
    const k4 = this.k4 || (this.k4 = [0, 0, 0]);
    this.evalOde(x, y, z, t, k1);
    this.evalOde(x + k1[0] * h / 2, y + k1[1] * h / 2, z + k1[2] * h / 2, t + h / 2, k2);
    this.evalOde(x + k2[0] * h / 2, y + k2[1] * h / 2, z + k2[2] * h / 2, t + h / 2, k3);
    this.evalOde(x + k3[0] * h, y + k3[1] * h, z + k3[2] * h, t + h, k4);
    s[j] = x + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    s[j + 1] = y + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    s[j + 2] = z + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  }

  evalForce(st, t, out) {
    const v = this.scope;
    v.x = st[0]; v.y = st[1]; v.z = st[2];
    v.vx = st[3]; v.vy = st[4]; v.vz = st[5];
    v.t = t;
    out[0] = st[3]; out[1] = st[4]; out[2] = st[5];
    out[3] = this.compiled.x(v);
    out[4] = this.compiled.y(v);
    out[5] = this.compiled.z(v);
    for (const L of this.actLayers) {
      const lv = L.v;
      lv.x = st[0]; lv.y = st[1]; lv.z = st[2];
      lv.vx = st[3]; lv.vy = st[4]; lv.vz = st[5];
      lv.t = t;
      out[3] += L.weight * L.fns.x(lv);
      out[4] += L.weight * L.fns.y(lv);
      out[5] += L.weight * L.fns.z(lv);
    }
  }

  rk4Force(i, h) {
    const s = this.states, j = i * 6, t = this.tau;
    const y0 = this.y0 || (this.y0 = new Float64Array(6));
    const yt = this.yt || (this.yt = new Float64Array(6));
    const K = this.K || (this.K = [new Float64Array(6), new Float64Array(6), new Float64Array(6), new Float64Array(6)]);
    for (let k = 0; k < 6; k++) y0[k] = s[j + k];
    this.evalForce(y0, t, K[0]);
    for (let k = 0; k < 6; k++) yt[k] = y0[k] + K[0][k] * h / 2;
    this.evalForce(yt, t + h / 2, K[1]);
    for (let k = 0; k < 6; k++) yt[k] = y0[k] + K[1][k] * h / 2;
    this.evalForce(yt, t + h / 2, K[2]);
    for (let k = 0; k < 6; k++) yt[k] = y0[k] + K[2][k] * h;
    this.evalForce(yt, t + h, K[3]);
    for (let k = 0; k < 6; k++) {
      s[j + k] = y0[k] + (h / 6) * (K[0][k] + 2 * K[1][k] + 2 * K[2][k] + K[3][k]);
    }
  }

  projectParticles() {
    const cfg = this.cfg;
    const scale = cfg.scale || 1;
    const off = cfg.offset || null; // math-space center, e.g. from a data fit
    const chain = cfg.chainOffset || 0.1;
    const size = this.particleSize;
    for (let i = 0; i < this.n; i++) {
      let mx, my, mz;
      if (cfg.type === 'parametric') {
        const v = this.scope;
        v.t = this.tau - i * chain;
        mx = this.compiled.x(v);
        my = this.compiled.y(v);
        mz = this.compiled.z(v);
        // superposition: positions add across active layers
        for (const L of this.actLayers) {
          const lv = L.v;
          lv.t = v.t;
          mx += L.weight * L.fns.x(lv);
          my += L.weight * L.fns.y(lv);
          mz += L.weight * L.fns.z(lv);
        }
        if (!Number.isFinite(mx + my + mz)) { mx = 0; my = 0; mz = 0; }
      } else {
        const j = i * 6;
        mx = this.states[j]; my = this.states[j + 1]; mz = this.states[j + 2];
      }
      if (off) { mx -= off[0]; my -= off[1]; mz -= off[2]; }
      // math z-up -> scene: (x, y, z) -> (X, -Z, Y)
      const sx = mx * scale, sy = mz * scale, sz = -my * scale;
      this.dummy.position.set(sx, sy, sz);
      this.dummy.scale.setScalar(size);
      this.dummy.updateMatrix();
      this.particlesMesh.setMatrixAt(i, this.dummy.matrix);
      this.trails.push('p' + i, this.dummy.position, this.colors[i]);
      if (i === this.followIndex) this.focusRec.worldPos.copy(this.dummy.position);
      if (i < this.labelObjs.length) {
        const L = this.labelObjs[i];
        L.obj.visible = !!L.active && this.labelsOn;
        L.obj.position.copy(this.dummy.position);
      }
    }
    this.particlesMesh.instanceMatrix.needsUpdate = true;

    // faint markers trace each parametric component so the ingredients of the
    // superposition stay visible next to the combined path
    if (cfg.type === 'parametric' && this.actLayers.length) {
      for (let li = 0; li < this.layers.length; li++) {
        const L = this.layers[li];
        if (!L.marker || !this.actLayers.includes(L)) continue;
        const lv = L.v;
        lv.t = this.tau;
        let cx = L.weight * L.fns.x(lv);
        let cy = L.weight * L.fns.y(lv);
        let cz = L.weight * L.fns.z(lv);
        if (off) { cx -= off[0]; cy -= off[1]; cz -= off[2]; }
        if (!Number.isFinite(cx + cy + cz)) { cx = 0; cy = 0; cz = 0; }
        L.marker.position.set(cx * scale, cz * scale, -cy * scale);
        L.marker.scale.setScalar(this.particleSize * 0.8);
        this.trails.push('layer' + li, L.marker.position, L.color);
      }
    }
    this.trails.update();
  }

  // ---------------- timeline scrubbing ----------------

  recordHistory() {
    if (!this.cfg) return;
    const integrated = this.cfg.type === 'ode' || this.cfg.type === 'force';
    if (!integrated) return; // pure functions of tau need no stored state
    const last = this.history[this.history.length - 1];
    if (last && Math.abs(this.tau - last.tau) < HISTORY_INTERVAL) return;
    this.history.push({ tau: this.tau, states: this.states.slice(0, this.n * 6) });
    if (this.history.length > HISTORY_CAP) this.history.shift();
  }

  scrubRange() {
    if (!this.cfg) return [0, 0];
    const integrated = this.cfg.type === 'ode' || this.cfg.type === 'force';
    if (integrated) {
      if (!this.history.length) return [this.tau, this.tau];
      // reverse play makes history non-monotonic; scan for the true extent
      let lo = this.tau, hi = this.tau;
      for (const e of this.history) {
        if (e.tau < lo) lo = e.tau;
        if (e.tau > hi) hi = e.tau;
      }
      return [lo, hi];
    }
    return [this.tau - PARAM_SCRUB_SPAN, this.tau];
  }

  // Jump to a recorded moment. Integrated systems restore the nearest stored
  // state and drop the now-invalid future; playing again re-integrates from
  // there. Parametric and surface types evaluate tau directly.
  scrubTo(tauTarget) {
    if (!this.cfg) return;
    this.playing = false;
    const integrated = this.cfg.type === 'ode' || this.cfg.type === 'force';
    if (!integrated) {
      this.tau = tauTarget;
      if (this.cfg.type === 'surface') this.updateSurface();
      else { this.trails.clear(); this.projectParticles(); }
      return;
    }
    if (!this.history.length) return;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.history.length; i++) {
      const d = Math.abs(this.history[i].tau - tauTarget);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    const entry = this.history[best];
    this.states.set(entry.states, 0);
    this.tau = entry.tau;
    this.history.length = best + 1; // scrubbing back invalidates the future
    this.trails.clear();
    this.projectParticles();
    if (this.p0Respawned) this.p0Respawned = false;
  }

  updateSurface() {
    if (!this.surface) return;
    const { geo, R, SEG } = this.surface;
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const v = this.scope;
    v.t = this.tau;
    const zfn = this.compiled.z;
    const act = this.actLayers;
    let zMin = Infinity, zMax = -Infinity;
    const count = pos.count;
    const arr = pos.array;
    for (let i = 0; i < count; i++) {
      v.x = arr[i * 3];
      v.y = -arr[i * 3 + 2];
      let z = zfn(v);
      // wave superposition: heights add across active layers
      for (const L of act) {
        const lv = L.v;
        lv.x = v.x; lv.y = v.y; lv.t = v.t;
        z += L.weight * L.fns.z(lv);
      }
      if (!Number.isFinite(z)) z = 0;
      arr[i * 3 + 1] = z;
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
    }
    const span = Math.max(zMax - zMin, 1e-6);
    const cArr = col.array;
    for (let i = 0; i < count; i++) {
      const f = (arr[i * 3 + 1] - zMin) / span;
      // deep blue -> teal -> amber -> near white
      let r, g, b;
      if (f < 0.45) { const u = f / 0.45; r = 0.07 + 0.1 * u; g = 0.12 + 0.45 * u; b = 0.35 + 0.5 * u; }
      else if (f < 0.8) { const u = (f - 0.45) / 0.35; r = 0.17 + 0.8 * u; g = 0.57 + 0.2 * u; b = 0.85 - 0.5 * u; }
      else { const u = (f - 0.8) / 0.2; r = 0.97; g = 0.77 + 0.2 * u; b = 0.35 + 0.55 * u; }
      cArr[i * 3] = r; cArr[i * 3 + 1] = g; cArr[i * 3 + 2] = b;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  // ---------------- superposition layers ----------------

  // Freeze a config snapshot as an additive layer. Parameter values are baked
  // into a layer-local scope, so later slider moves on the live equation do
  // not disturb frozen layers. Throws if the expressions fail to compile.
  addLayer(cfg) {
    if (this.layers.length >= 6) throw new Error('Layer stack is full (6 max)');
    const paramNames = Object.keys(cfg.params || {});
    const vars = [...this.varsForType(cfg.type), ...paramNames];
    const fns = {};
    if (cfg.type === 'surface') {
      fns.z = compileExpr(cfg.exprs.z, vars);
    } else {
      fns.x = compileExpr(cfg.exprs.x, vars);
      fns.y = compileExpr(cfg.exprs.y, vars);
      fns.z = compileExpr(cfg.exprs.z, vars);
    }
    const v = { t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    for (const [k, p] of Object.entries(cfg.params || {})) v[k] = p.value;

    const LAYER_COLORS = [0xffca7a, 0x6fe08a, 0xff8d6a, 0x86b7ff, 0xd78cff, 0x7ae8d8];
    const layer = {
      name: cfg.name || 'Layer',
      type: cfg.type,
      weight: 1,
      fns,
      v,
      color: LAYER_COLORS[this.layers.length % LAYER_COLORS.length],
      marker: null,
      // source snapshot so version-control commits can rebuild this layer
      src: {
        name: cfg.name || 'Layer',
        type: cfg.type,
        exprs: { ...cfg.exprs },
        params: Object.fromEntries(Object.entries(cfg.params || {}).map(([k, p]) => [k, { value: p.value }])),
      },
    };
    if (cfg.type === 'parametric') {
      layer.marker = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 8),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(layer.color).multiplyScalar(1.5),
          transparent: true,
          opacity: 0.8,
        })
      );
      this.group.add(layer.marker);
    }
    this.layers.push(layer);
    return layer;
  }

  removeLayer(index) {
    const L = this.layers[index];
    if (!L) return;
    if (L.marker) this.group.remove(L.marker);
    this.trails.clearOne('layer' + index);
    this.layers.splice(index, 1);
    // trail ids shift with indices; drop them all and let them rebuild
    for (let i = 0; i < 8; i++) this.trails.clearOne('layer' + i);
  }

  clearLayers() {
    for (const L of this.layers) if (L.marker) this.group.remove(L.marker);
    for (let i = 0; i < 8; i++) this.trails.clearOne('layer' + i);
    this.layers.length = 0;
  }

  setLayerWeight(index, w) {
    if (this.layers[index]) this.layers[index].weight = w;
  }

  refreshActiveLayers() {
    this.actLayers = this.cfg
      ? this.layers.filter((L) => L.type === this.cfg.type)
      : [];
    for (const L of this.layers) {
      if (L.marker) L.marker.visible = this.actLayers.includes(L);
    }
  }

  // ---------------- dataset overlay ----------------

  // pts: [{t, x, y, z}] in original data units, t measured from 0.
  // Displays scaled + centered markers, a time-gradient path, and a tracer
  // that replays the path as tau advances. Returns the display transform so
  // fitted equations can be overlaid with the same scale and offset.
  setDataset(pts) {
    this.clearDataset();

    // display transform: center the cloud, fit it into ~44 units
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) {
      const v = [p.x, p.y, p.z];
      for (let k = 0; k < 3; k++) {
        if (v[k] < min[k]) min[k] = v[k];
        if (v[k] > max[k]) max[k] = v[k];
      }
    }
    const center = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
    const extent = Math.max(...[0, 1, 2].map((k) => max[k] - min[k]), 1e-9);
    const scale = 44 / extent;
    const span = Math.max(pts[pts.length - 1].t - pts[0].t, 1e-9);

    const group = new THREE.Group();
    const toScene = (p, out) => out.set(
      (p.x - center[0]) * scale,
      (p.z - center[2]) * scale,
      -(p.y - center[1]) * scale
    );

    // markers colored early (blue) to late (amber)
    const pos = new Float32Array(pts.length * 3);
    const col = new Float32Array(pts.length * 3);
    const c0 = new THREE.Color(0x3a6bd8);
    const c1 = new THREE.Color(0xffca7a);
    const tmp = new THREE.Vector3();
    const cc = new THREE.Color();
    for (let i = 0; i < pts.length; i++) {
      toScene(pts[i], tmp);
      pos.set([tmp.x, tmp.y, tmp.z], i * 3);
      cc.copy(c0).lerp(c1, pts[i].t / span);
      col.set([cc.r, cc.g, cc.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const markers = new THREE.Points(geo, new THREE.PointsMaterial({
      map: softDotTexture(),
      size: 2.2,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    group.add(markers);

    const path = new THREE.Line(geo, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    group.add(path);

    const tracer = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.6) })
    );
    group.add(tracer);

    const label = document.createElement('div');
    label.className = 'body-label small';
    label.innerHTML = '<span class="label-dot" style="background:#cfe0ff;box-shadow:0 0 6px #cfe0ff"></span><span class="label-name">data</span>';
    const labelObj = new CSS2DObject(label);
    tracer.add(labelObj);

    this.group.add(group);
    this.data = { pts, span, center, scale, group, tracer, toScene };
    this.updateTracer();
    return { center, scale, span };
  }

  clearDataset() {
    if (!this.data) return;
    this.group.remove(this.data.group);
    this.trails.clearOne('tracer');
    this.data = null;
  }

  updateTracer() {
    const d = this.data;
    if (!d) return;
    // replay loops over the recorded time span, in either direction
    const local = ((this.tau % d.span) + d.span) % d.span;
    const pts = d.pts;
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].t <= local) lo = mid;
      else hi = mid;
    }
    const a = pts[lo], b = pts[hi];
    const f = (local - a.t) / Math.max(b.t - a.t, 1e-9);
    const pa = d.toScene(a, this._trA || (this._trA = new THREE.Vector3()));
    const pb = d.toScene(b, this._trB || (this._trB = new THREE.Vector3()));
    d.tracer.position.copy(pa).lerp(pb, Math.min(Math.max(f, 0), 1));
    d.tracer.scale.setScalar(this.particleSize * 1.3);
    this.trails.push('tracer', d.tracer.position, 0xcfe0ff);
    this.trails.update();
  }

  status() {
    if (!this.cfg) return '';
    const nominal = (this.cfg.speed || 1) * this.speedMul;
    const isIntegrated = this.cfg.type === 'ode' || this.cfg.type === 'force';
    const rate = (isIntegrated && this.effRate !== null ? this.effRate : nominal) * this.direction;
    const rateStr = `${rate < 0 ? '−' : ''}${Math.abs(rate).toFixed(2)} τ/s`;
    return `τ = ${this.tau.toFixed(2)} · ${this.playing ? rateStr : 'paused'}`;
  }

  particleInfo() {
    if (!this.cfg || this.cfg.type === 'surface' || !this.n) return null;
    const s = this.states;
    if (this.cfg.type === 'parametric') {
      const p = this.focusRec.worldPos;
      return { pos: [p.x, -p.z, p.y], speed: null, respawns: 0, n: this.n };
    }
    const speed = Math.hypot(s[3], s[4], s[5]);
    return {
      pos: [s[0], s[1], s[2]],
      speed: this.cfg.type === 'force' ? speed : null,
      respawns: this.respawns,
      n: this.n,
    };
  }
}
