// Gravity Lab scene: cinematic potential well, glowing tracers, atmospheric
// primaries, polar guides and additive trails. Physics stays in km; sceneScale
// maps to units. Orbits live in the horizontal XZ plane.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GravitySim } from './grav.js';
import { getPreset, PRESETS } from './presets.js';
import { TrailSystem } from '../scene/trails.js';
import { softDotTexture } from '../scene/setup.js';

const DOT = softDotTexture();

// Warm→cool well colormap (rim amber → deep indigo)
function wellColor(t, out) {
  // t: 0 = deepest, 1 = rim
  const stops = [
    [0.00, 0.02, 0.01, 0.08],
    [0.25, 0.08, 0.05, 0.28],
    [0.50, 0.12, 0.22, 0.55],
    [0.75, 0.25, 0.45, 0.70],
    [1.00, 0.85, 0.55, 0.28],
  ];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const a = stops[i], b = stops[i + 1];
  const u = (t - a[0]) / Math.max(b[0] - a[0], 1e-9);
  out.setRGB(
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
    a[3] + (b[3] - a[3]) * u
  );
  return out;
}

export class GravityLab {
  constructor(scene, getTexture = null) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.getTexture = getTexture;

    // Stage lighting: cool fill + warm key that tracks the primary
    this.keyLight = new THREE.PointLight(0xffe6c0, 2.8, 0, 1.4);
    this.keyLight.position.set(0, 12, 0);
    this.group.add(this.keyLight);
    this.group.add(new THREE.AmbientLight(0x1a2238, 0.55));
    this.rimLight = new THREE.DirectionalLight(0x6a8cff, 0.55);
    this.rimLight.position.set(-40, 30, -50);
    this.group.add(this.rimLight);

    this.sim = new GravitySim();
    this.world = new THREE.Group();
    this.group.add(this.world);

    this.wellGroup = new THREE.Group();
    this.bodyMeshes = new Map();
    this.pickables = [];
    this.tracerSprites = new Map();
    this.trails = null;
    this.annoGroup = new THREE.Group();
    this.guidesGroup = new THREE.Group();
    this.selRing = null;

    this.preset = null;
    this.sceneCfg = null;
    this.paramValues = {};
    this.sceneScale = 0.001;
    this.selectedId = null;
    this.onSelect = null;
    this.dirty = true;
    this.showWell = true;
    this.showTrails = true;
    this.tmp = new THREE.Vector3();
    this.tmpC = new THREE.Color();
    this.wellAcc = 0;
    this.t = 0;

    this.loadPreset('leo');
  }

  listPresets() { return PRESETS; }

  loadPreset(id) {
    const p = getPreset(id);
    this.preset = p;
    this.paramValues = {};
    if (p.params) {
      for (const [k, def] of Object.entries(p.params)) this.paramValues[k] = def.value;
    }
    this.selectedId = null;
    this.dirty = true;
    this.rebuild();
  }

  setParam(key, value) {
    this.paramValues[key] = value;
    this.dirty = true;
  }

  clearWorld() {
    while (this.world.children.length) {
      const c = this.world.children.pop();
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
        if (o.element && o.element.parentNode) o.element.parentNode.removeChild(o.element);
      });
    }
    this.bodyMeshes.clear();
    this.tracerSprites.clear();
    this.pickables = [];
  }

  rebuild() {
    this.clearWorld();
    this.wellGroup = new THREE.Group();
    this.annoGroup = new THREE.Group();
    this.guidesGroup = new THREE.Group();
    this.world.add(this.wellGroup, this.guidesGroup, this.annoGroup);
    this.trails = new TrailSystem(this.world, 720, 0.72);

    const built = this.preset.build(this.paramValues);
    this.sceneCfg = built;
    this.sceneScale = built.sceneScale || 0.001;

    this.sim.seed(built.bodies, { G: built.G, exponent: built.exponent ?? 2, qg: built.qg });
    this.sim.speedMul = built.speedMul ?? 1;
    this.sim.playing = !built.frozen;
    if (built.exponent != null) this.sim.exponent = built.exponent;
    if (built.qg) this.sim.setQg(built.qg);

    const half = (built.well?.half || 2e4) * this.sceneScale;

    // Soft polar floor (concentric rings, not a harsh cartesian grid)
    const polar = new THREE.PolarGridHelper(half * 1.35, 16, 10, 128, 0x3a4a6a, 0x1a2238);
    polar.material.transparent = true;
    polar.material.opacity = 0.28;
    polar.material.depthWrite = false;
    polar.position.y = -0.02;
    this.world.add(polar);

    // Dark vignette disk under the well
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(half * 1.5, 64),
      new THREE.MeshBasicMaterial({
        color: 0x05070e,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    this.world.add(floor);

    this.buildWell(built.well);
    this.buildOrbitGuides();
    for (const b of this.sim.bodies) this.spawnBodyMesh(b);
    for (const a of built.annotations || []) this.drawAnnotation(a);
    this.buildSelectRing();

    // Aim key light at primary
    const p = this.sim.primary();
    if (p) {
      this.toScene(p.pos, this.keyLight.position);
      this.keyLight.position.y += Math.max(half * 0.15, 4);
      this.keyLight.intensity = p.id === 'sun' || p.id === 'a' || p.id === 'b' ? 4.2 : 2.6;
      this.keyLight.color.setHex(p.id === 'sun' || p.name?.includes('Star') ? 0xffd090 : 0xc8dcff);
    }

    this.verify = built.verify ? built.verify(this.sim) : null;
    this.dirty = false;
  }

  buildWell(cfg) {
    this.wellGroup.clear();
    if (!cfg || !this.showWell) return;

    const res = Math.max(cfg.res || 72, 64);
    const sample = this.sim.samplePotential(cfg.half, res);
    const { vals, min, max, halfExtent } = sample;
    const span = Math.max(max - min, 1e-20);
    const s = this.sceneScale;
    const extent = halfExtent * s;

    // Exaggerated cinematic depth (independent of physics)
    const depthAmp = extent * 0.55;

    const geo = new THREE.PlaneGeometry(extent * 2, extent * 2, res - 1, res - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = this.tmpC;

    for (let i = 0; i < pos.count; i++) {
      const phi = vals[i];
      // deepest (most negative / lowest phi relative to rim) sinks down
      const tDeep = (max - phi) / span; // 0 rim, 1 deep
      const h = -Math.pow(tDeep, 0.85) * depthAmp;
      pos.setY(i, h);
      wellColor(1 - tDeep, col);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // Filled translucent well
    const fill = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        roughness: 0.35,
        metalness: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
        emissive: new THREE.Color(0x0a1030),
        emissiveIntensity: 0.35,
      })
    );
    fill.renderOrder = 0;
    this.wellGroup.add(fill);

    // Soft equipotential rings (sample a few levels)
    for (const frac of [0.15, 0.35, 0.55, 0.75, 0.9]) {
      const ring = this.makeEquipotentialRing(vals, res, halfExtent, min, max, frac, depthAmp);
      if (ring) this.wellGroup.add(ring);
    }

    this.wellMesh = fill;
  }

  makeEquipotentialRing(vals, res, halfExtent, min, max, frac, depthAmp) {
    // Find approximate radius where mean phi matches level (radial average)
    const target = min + (max - min) * frac;
    const span = Math.max(max - min, 1e-20);
    // Walk mid-row outward from center
    const mid = Math.floor(res / 2);
    let bestI = mid;
    let bestD = Infinity;
    for (let i = mid; i < res; i++) {
      const phi = vals[mid * res + i];
      const d = Math.abs(phi - target);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    const u = bestI / (res - 1);
    const r = halfExtent * this.sceneScale * (2 * u - 1);
    if (r < 0.5) return null;
    const tDeep = (max - target) / span;
    const y = -Math.pow(Math.max(tDeep, 0), 0.85) * depthAmp + 0.05;
    const curve = new THREE.EllipseCurve(0, 0, Math.abs(r), Math.abs(r), 0, Math.PI * 2, false, 0);
    const pts = curve.getPoints(96).map((p) => new THREE.Vector3(p.x, y, p.y));
    return new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: 0xffc878,
        transparent: true,
        opacity: 0.22 + 0.15 * frac,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
  }

  buildOrbitGuides() {
    // Faint rings at each tracer's initial radius (visual Kepler reference)
    const p = this.sim.primary();
    if (!p) return;
    const s = this.sceneScale;
    const seen = new Set();
    for (const t of this.sim.tracers()) {
      const r = Math.hypot(t.pos[0] - p.pos[0], t.pos[1] - p.pos[1], t.pos[2] - p.pos[2]);
      const key = Math.round(r / 50) * 50;
      if (seen.has(key) || r * s < 0.8) continue;
      seen.add(key);
      const rad = r * s;
      const curve = new THREE.EllipseCurve(0, 0, rad, rad, 0, Math.PI * 2, false, 0);
      const pts = curve.getPoints(128).map((pt) => new THREE.Vector3(pt.x, 0.04, pt.y));
      const loop = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: t.color,
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.guidesGroup.add(loop);
    }
  }

  spawnBodyMesh(b) {
    const s = this.sceneScale;
    if (b.test) {
      this.spawnTracer(b);
      return;
    }

    const r = Math.max(b.radius * s, 2.2);
    const group = new THREE.Group();
    group.userData.bodyId = b.id;

    const isStar = /sun|star/i.test(b.name) || b.id === 'sun' || b.id === 'a' || b.id === 'b';
    const isEarth = b.id === 'earth' || /earth/i.test(b.name);

    let mat;
    if (isEarth && this.getTexture && this.getTexture('earthDay')) {
      mat = new THREE.MeshStandardMaterial({
        map: this.getTexture('earthDay'),
        roughness: 0.7,
        metalness: 0.05,
        emissive: new THREE.Color(0x102040),
        emissiveIntensity: 0.25,
      });
    } else if (isStar) {
      mat = new THREE.MeshBasicMaterial({
        color: b.color,
        toneMapped: true,
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: b.color,
        emissive: new THREE.Color(b.color).multiplyScalar(0.45),
        roughness: 0.45,
        metalness: 0.1,
      });
    }

    const core = new THREE.Mesh(new THREE.SphereGeometry(r, isStar ? 48 : 40, 32), mat);
    group.add(core);

    // Atmosphere / corona
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(r * (isStar ? 1.55 : 1.18), 32, 24),
      new THREE.MeshBasicMaterial({
        color: isStar ? 0xffcc77 : isEarth ? 0x6fa8ff : b.color,
        transparent: true,
        opacity: isStar ? 0.22 : 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      })
    );
    group.add(atmo);

    if (isStar) {
      const corona = new THREE.Mesh(
        new THREE.SphereGeometry(r * 2.1, 24, 16),
        new THREE.MeshBasicMaterial({
          color: 0xffaa44,
          transparent: true,
          opacity: 0.08,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
        })
      );
      group.add(corona);
    }

    // Invisible pick sphere (slightly larger)
    const pick = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.3, 12, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pick.userData.bodyId = b.id;
    group.add(pick);

    this.toScene(b.pos, group.position);
    this.world.add(group);
    this.bodyMeshes.set(b.id, group);
    this.pickables.push(pick);

    const div = document.createElement('div');
    div.className = 'body-label small';
    const hex = '#' + (b.color >>> 0).toString(16).padStart(6, '0');
    div.innerHTML = `<span class="label-dot" style="background:${hex}"></span>${b.name}`;
    const label = new CSS2DObject(div);
    label.position.set(0, r * 1.8, 0);
    group.add(label);
  }

  spawnTracer(b) {
    const s = this.sceneScale;
    // Soft additive sprite: blooms beautifully
    const size = Math.max(1.1, Math.min(2.8, 18000 * s));
    const mat = new THREE.SpriteMaterial({
      map: DOT,
      color: b.color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(size);
    sprite.userData.bodyId = b.id;
    this.toScene(b.pos, sprite.position);
    sprite.position.y += 0.15;
    this.world.add(sprite);
    this.bodyMeshes.set(b.id, sprite);
    this.tracerSprites.set(b.id, sprite);

    // Small invisible pick target
    const pick = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.55, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pick.userData.bodyId = b.id;
    sprite.add(pick);
    this.pickables.push(pick);
  }

  buildSelectRing() {
    const geo = new THREE.RingGeometry(1.15, 1.4, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffca7a,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.selRing = new THREE.Mesh(geo, mat);
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.world.add(this.selRing);
  }

  drawAnnotation(a) {
    if (a.kind === 'roche') {
      const s = this.sceneScale;
      const rad = a.r * s;
      const curve = new THREE.EllipseCurve(0, 0, rad, rad, 0, Math.PI * 2, false, 0);
      const pts = curve.getPoints(128).map((p) => new THREE.Vector3(p.x, 0.12, p.y));
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: 0xff6a5a,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.annoGroup.add(line);
      // dashed feel via second dimmer ring
      const pts2 = curve.getPoints(128).map((p) => new THREE.Vector3(p.x * 1.01, 0.1, p.y * 1.01));
      this.annoGroup.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts2),
        new THREE.LineBasicMaterial({ color: 0xff8a6a, transparent: true, opacity: 0.25, depthWrite: false })
      ));
      const div = document.createElement('div');
      div.className = 'body-label small';
      div.style.color = '#ff8a6a';
      div.textContent = a.label;
      const obj = new CSS2DObject(div);
      obj.position.set(rad, 2.2, 0);
      this.annoGroup.add(obj);
    }
  }

  toScene(pos, out = this.tmp) {
    const s = this.sceneScale;
    // Physics XY → scene XZ (horizontal orbits); physics Z → scene Y
    return out.set(pos[0] * s, pos[2] * s, -pos[1] * s);
  }

  selectBody(id) {
    this.selectedId = id;
    for (const [bid, mesh] of this.tracerSprites) {
      const on = id != null && bid === id;
      const base = Math.max(1.1, Math.min(2.8, 18000 * this.sceneScale));
      mesh.scale.setScalar(on ? base * 1.7 : base);
      mesh.material.opacity = on ? 1 : 0.9;
    }
    if (this.selRing) {
      const body = this.getSelected();
      if (body && !body.destroyed) {
        this.selRing.visible = true;
        this.toScene(body.pos, this.selRing.position);
        this.selRing.position.y += 0.2;
        const sc = body.test
          ? Math.max(1.4, Math.min(3.2, 20000 * this.sceneScale))
          : Math.max(body.radius * this.sceneScale * 1.6, 3);
        this.selRing.scale.setScalar(sc);
      } else {
        this.selRing.visible = false;
      }
    }
    if (this.onSelect) this.onSelect(this.getSelected());
  }

  getSelected() {
    return this.sim.bodies.find((b) => b.id === this.selectedId) || null;
  }

  analyses() {
    return this.sim.bodies
      .filter((b) => !b.destroyed)
      .map((b) => ({ body: b, report: this.sim.analyze(b) }));
  }

  summary() {
    const tracers = this.sim.tracers();
    const alive = tracers.filter((t) => !t.destroyed);
    const massive = this.sim.massive();
    let bound = 0, escape = 0;
    const rows = alive.length ? alive : massive.filter((b) => b !== this.sim.primary());
    for (const t of rows) {
      const a = this.sim.analyze(t);
      if (!a.elements) continue;
      if (a.elements.kind === 'elliptical' || a.elements.kind === 'circular') bound++;
      else escape++;
    }
    return {
      t: this.sim.t,
      tracers: alive.length || rows.length,
      bound,
      escape,
      exponent: this.sim.exponent,
      qgMode: this.sim.qg?.mode || 'none',
      qg: this.sim.qg,
      verify: this.preset && this.sceneCfg && this.sceneCfg.verify
        ? this.sceneCfg.verify(this.sim)
        : this.verify,
    };
  }

  status() {
    const s = this.summary();
    const name = this.preset ? this.preset.name : 'Gravity';
    const qg = s.qgMode && s.qgMode !== 'none' ? ` · QG ${s.qgMode}` : '';
    return `${name} · t = ${formatSimTime(s.t)} · ${s.tracers} tracers · n = ${s.exponent.toFixed(2)}${qg}`;
  }

  traceSnapshot() {
    const s = this.summary();
    const points = [];
    for (const { body, report } of this.analyses()) {
      if (report.destroyed || report.isPrimary) continue;
      const el = report.elements;
      if (!el) continue;
      const actual = {
        r: el.r, v: el.v, e: el.e, energy: el.energy,
        period: el.period, a: el.a, kind: el.kind,
      };
      let expected = null;
      let err = null;
      // Circular-orbit analytic: T = 2π√(a³/μ) when e is small
      if (el.kind === 'circular' || (el.kind === 'elliptical' && el.e < 0.05 && Number.isFinite(el.a))) {
        const mu = this.sim.muPrimary();
        const a = el.a > 0 ? el.a : el.r;
        const T = 2 * Math.PI * Math.sqrt((a * a * a) / mu);
        expected = { period: T, a, r: a };
        if (Number.isFinite(el.period) && el.period > 0) {
          err = Math.abs(el.period - T) / T;
        }
      } else if (Number.isFinite(el.circ) && el.circ > 0) {
        expected = { v: el.circ, escape: el.escape };
        err = Math.abs(el.v - el.circ) / el.circ;
      }
      points.push({
        id: body.id,
        name: body.name,
        t: this.sim.t,
        actual,
        expected,
        err,
      });
    }
    const qg = this.sim.qg;
    return {
      mode: 'gravity',
      name: this.preset?.name || 'Gravity',
      t: this.sim.t,
      status: this.status(),
      forceLaw: `F ∝ 1/r^${this.sim.exponent.toFixed(2)}`,
      qgLabel: qg && qg.mode !== 'none' ? qg.mode : null,
      verify: s.verify,
      points,
    };
  }

  setWellVisible(v) {
    this.showWell = v;
    this.wellGroup.visible = v;
  }

  setTrailsVisible(v) {
    this.showTrails = v;
    if (this.trails) this.trails.setVisible(v);
  }

  reset() {
    this.dirty = true;
    this.rebuild();
  }

  update(dt) {
    if (this.dirty) this.rebuild();
    this.t += dt;

    if (this.paramValues.exponent != null && !this.dirty) {
      this.sim.exponent = this.paramValues.exponent;
    }
    // Live-sync QG knobs without full reseed when only strength-like params change
    if (this.sceneCfg && this.sceneCfg.qg && !this.dirty) {
      const q = { ...this.sceneCfg.qg };
      if (this.paramValues.bounce != null) q.bounceScale = this.paramValues.bounce;
      if (this.paramValues.ell != null) q.ell = this.paramValues.ell;
      if (this.paramValues.alpha != null) q.alpha = this.paramValues.alpha;
      if (this.paramValues.lambda != null) q.lambda = this.paramValues.lambda;
      if (this.paramValues.foam != null) q.foamStrength = this.paramValues.foam;
      if (this.paramValues.kappa != null) q.kappa = this.paramValues.kappa;
      if (this.paramValues.hbar != null) q.hbarEff = this.paramValues.hbar;
      this.sim.setQg(q);
    }

    if (!(this.sceneCfg && this.sceneCfg.frozen)) {
      this.sim.step(Math.min(dt, 0.05));
    } else {
      this.sim.recomputeAccels();
    }

    // Pulse star coronas / tracer shimmer
    const pulse = 0.92 + 0.08 * Math.sin(this.t * 2.4);

    for (const b of this.sim.bodies) {
      const mesh = this.bodyMeshes.get(b.id);
      if (!mesh) continue;
      if (b.destroyed) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      this.toScene(b.pos, mesh.position);

      if (b.test) {
        mesh.position.y += 0.15;
        if (this.showTrails) this.trails.push(b.id, mesh.position, b.color);
      } else {
        if (this.showTrails && !b.fixed) this.trails.push(b.id, mesh.position, b.color);
        // gentle corona pulse on stars
        if (mesh.children) {
          for (const c of mesh.children) {
            if (c.material && c.material.opacity != null && c.material.blending === THREE.AdditiveBlending) {
              if (c !== mesh.children[0]) c.scale.setScalar(pulse);
            }
          }
        }
      }
    }

    if (this.selRing && this.selRing.visible && this.selectedId) {
      const body = this.getSelected();
      if (body && !body.destroyed) {
        this.toScene(body.pos, this.selRing.position);
        this.selRing.position.y += 0.2;
        this.selRing.rotation.z = this.t * 0.6;
      }
    }

    if (this.showTrails) this.trails.update();

    // Rebuild well when force law / QG potential drifts (throttled)
    this.wellAcc += dt;
    const wellDirty = this.paramValues.exponent != null
      || (this.sim.qg && this.sim.qg.mode && this.sim.qg.mode !== 'none');
    if (this.wellAcc > 1.0 && wellDirty && this.showWell) {
      this.wellAcc = 0;
      this.buildWell(this.sceneCfg.well);
    }
  }
}

function formatSimTime(tSec) {
  const a = Math.abs(tSec);
  if (a < 60) return `${tSec.toFixed(1)} s`;
  if (a < 3600) return `${(tSec / 60).toFixed(1)} min`;
  if (a < 86400) return `${(tSec / 3600).toFixed(2)} h`;
  if (a < 86400 * 365) return `${(tSec / 86400).toFixed(2)} d`;
  return `${(tSec / (86400 * 365.25)).toFixed(2)} y`;
}
