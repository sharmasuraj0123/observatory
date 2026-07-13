// Light Lab scene: a geometric-optics bench with live multi-wavelength ray
// tracing. 1 scene unit = 1 mm. Working plane is XY (y up); rays are drawn
// slightly stacked in Z by wavelength so a spectrum reads as a ribbon.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { traceFan, MATERIALS, criticalAngleDeg } from './optics.js';
import { getPreset, PRESETS } from './presets.js';

const MAT_COLOR = {
  bk7: 0x7ec8e8,
  fusedSilica: 0xb8d4e8,
  water: 0x4aa8d8,
  diamond: 0xc8e8ff,
  acrylic: 0xa0d0f0,
  sapphire: 0x90b8f0,
};

export class LightLab {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // local lights
    const key = new THREE.DirectionalLight(0xfff5e8, 1.6);
    key.position.set(-80, 120, 180);
    this.group.add(key);
    this.group.add(new THREE.AmbientLight(0x304060, 1.4));

    this.bench = new THREE.Group();
    this.group.add(this.bench);
    this.elemGroup = new THREE.Group();
    this.rayGroup = new THREE.Group();
    this.annoGroup = new THREE.Group();
    this.bench.add(this.elemGroup, this.rayGroup, this.annoGroup);

    // optical table
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 260),
      new THREE.MeshStandardMaterial({
        color: 0x121820, roughness: 0.85, metalness: 0.2,
        transparent: true, opacity: 0.92,
      })
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -60;
    this.group.add(table);
    const grid = new THREE.GridHelper(420, 42, 0x2a3550, 0x1a2235);
    grid.position.y = -59.5;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    this.group.add(grid);

    this.rays = [];
    this.selectedId = null;
    this.rayLines = []; // { line, ray }
    this.paramValues = {};
    this.preset = null;
    this.sceneCfg = null;
    this.dirty = true;
    this.playing = true; // wavelength shimmer / source pulse
    this.t = 0;
    this.sourceMesh = null;
    this.labels = [];
    this.onSelect = null;

    this.loadPreset('prism');
  }

  listPresets() { return PRESETS; }

  loadPreset(id) {
    const p = getPreset(id);
    this.preset = p;
    this.paramValues = {};
    if (p.params) {
      for (const [k, def] of Object.entries(p.params)) this.paramValues[k] = def.value;
    }
    this.dirty = true;
    this.selectedId = null;
    this.rebuild();
  }

  setParam(key, value) {
    this.paramValues[key] = value;
    this.dirty = true;
  }

  rebuild() {
    // clear previous optics
    while (this.elemGroup.children.length) {
      const c = this.elemGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    }
    while (this.rayGroup.children.length) {
      const c = this.rayGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    while (this.annoGroup.children.length) {
      const c = this.annoGroup.children.pop();
      if (c.element && c.element.parentNode) c.element.parentNode.removeChild(c.element);
    }
    this.rayLines = [];
    this.labels = [];

    const built = this.preset.build(this.paramValues);
    this.sceneCfg = built;
    const src = built.source || this.preset.source || { x: -80, y: 0 };
    this.source = src;

    // source lamp
    const lamp = new THREE.Group();
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe6a0 })
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffcc66, transparent: true, opacity: 0.22,
        depthWrite: false,
      })
    );
    lamp.add(bulb, glow);
    lamp.position.set(src.x, src.y, 0);
    this.elemGroup.add(lamp);
    this.sourceMesh = bulb;

    // optical elements
    for (const el of built.elements || []) this.drawElement(el);

    // annotations
    for (const a of built.annotations || []) this.drawAnnotation(a);
    for (const el of built.elements || []) {
      if (el.type === 'note') this.drawAnnotation({ kind: 'note', x: el.x, y: el.y, text: el.text });
      if (el.type === 'focus') this.drawAnnotation({
        kind: 'focus', x: el.x, y: el.y, text: el.label,
      });
      if (el.type === 'critical') {
        const tc = criticalAngleDeg(el.n1, el.n2);
        if (tc != null) {
          this.drawAnnotation({
            kind: 'critical', x: el.x, y: el.y, angleDeg: tc,
          });
        }
      }
    }

    // trace
    const ambient = built.ambient || this.preset.ambient || MATERIALS.air;
    this.rays = traceFan({
      x0: src.x,
      y0: src.y,
      anglesDeg: built.angles || [0],
      wavelengthsNm: built.wavelengths || [550],
      surfaces: built.surfaces || [],
      ambientMat: ambient,
      bundleY: built.bundle || null,
      forceReflectOn: built.forceReflectOn || null,
    });

    this.drawRays();
    this.dirty = false;

    // verification hook
    this.verify = null;
    if (this.preset.verify) {
      this.verify = this.preset.verify(this.rays, built.meta);
    }
  }

  drawElement(el) {
    if (el.type === 'block') {
      const col = MAT_COLOR[el.mat] || 0x7ec8e8;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(el.w, el.h, 18),
        new THREE.MeshPhysicalMaterial({
          color: col,
          transparent: true,
          opacity: 0.32,
          roughness: 0.15,
          metalness: 0,
          transmission: 0.55,
          thickness: 8,
          depthWrite: false,
        })
      );
      mesh.position.set(el.x, el.y, 0);
      this.elemGroup.add(mesh);
      // edge outline
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(el.w, el.h, 18)),
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.7 })
      );
      edges.position.copy(mesh.position);
      this.elemGroup.add(edges);
      if (el.label) this.addLabel(el.x, el.y + el.h / 2 + 6, el.label, col);
    } else if (el.type === 'prism') {
      const apex = (el.apexDeg || 60) * Math.PI / 180;
      const s = el.size || 70;
      const h = s * Math.cos(apex / 2);
      const halfBase = s * Math.sin(apex / 2);
      const shape = new THREE.Shape();
      shape.moveTo(0, h * 0.55);
      shape.lineTo(-halfBase, -h * 0.45);
      shape.lineTo(halfBase, -h * 0.45);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 16, bevelEnabled: false });
      geo.translate(0, 0, -8);
      const col = MAT_COLOR[el.mat] || 0x7ec8e8;
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshPhysicalMaterial({
          color: col, transparent: true, opacity: 0.35,
          roughness: 0.12, transmission: 0.6, thickness: 10, depthWrite: false,
        })
      );
      mesh.position.set(el.cx, el.cy, 0);
      this.elemGroup.add(mesh);
      this.addLabel(el.cx, el.cy + h * 0.55 + 8, 'Prism', col);
    } else if (el.type === 'lens') {
      // approximate lens body as a lathe between the two sphere vertices
      const { c1, c2, R, d, halfH } = el;
      const col = MAT_COLOR[el.mat] || 0x7ec8e8;
      const shape = new THREE.Shape();
      const n = 24;
      // front surface (Cartesian R1>0): x = c1 - sqrt(R^2 - y^2)
      for (let i = 0; i <= n; i++) {
        const yy = -halfH + (2 * halfH * i) / n;
        const xx = c1 - Math.sqrt(Math.max(R * R - yy * yy, 0));
        if (i === 0) shape.moveTo(xx, yy);
        else shape.lineTo(xx, yy);
      }
      // back surface (R2<0): x = c2 + sqrt(R^2 - y^2)
      for (let i = n; i >= 0; i--) {
        const yy = -halfH + (2 * halfH * i) / n;
        const xx = c2 + Math.sqrt(Math.max(R * R - yy * yy, 0));
        shape.lineTo(xx, yy);
      }
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 14, bevelEnabled: false });
      geo.translate(0, 0, -7);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshPhysicalMaterial({
          color: col, transparent: true, opacity: 0.38,
          roughness: 0.1, transmission: 0.65, thickness: 8, depthWrite: false,
        })
      );
      this.elemGroup.add(mesh);
      this.addLabel(d / 2, halfH + 8, 'Biconvex', col);
    } else if (el.type === 'mirrorSphere') {
      const { cx, cy, R, halfH } = el;
      const pts = [];
      const aMax = Math.asin(Math.min(0.99, halfH / R));
      for (let i = 0; i <= 40; i++) {
        const a = -aMax + (2 * aMax * i) / 40;
        // concave facing left with center at cx=-R: x = cx + R*cos(a) near 0
        pts.push(new THREE.Vector3(
          cx + R * Math.cos(a),
          cy + R * Math.sin(a),
          0
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 40, 1.2, 6, false),
        new THREE.MeshStandardMaterial({ color: 0xc0c8d8, metalness: 0.95, roughness: 0.15 })
      );
      this.elemGroup.add(tube);
      this.addLabel(0, halfH + 6, 'Mirror', 0xc0c8d8);
    } else if (el.type === 'drop') {
      const col = MAT_COLOR[el.mat] || 0x4aa8d8;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(el.R, 48, 32),
        new THREE.MeshPhysicalMaterial({
          color: col, transparent: true, opacity: 0.28,
          roughness: 0.05, transmission: 0.85, thickness: 12, depthWrite: false,
        })
      );
      mesh.position.set(el.cx, el.cy, 0);
      this.elemGroup.add(mesh);
      this.addLabel(el.cx, el.cy + el.R + 6, 'Water drop', col);
    } else if (el.type === 'detector') {
      const h = el.h || 120;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, h, 14),
        new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.8 })
      );
      mesh.position.set(el.x, el.y, 0);
      this.elemGroup.add(mesh);
      // screen face
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(h * 0.02, h),
        new THREE.MeshBasicMaterial({ color: 0x0a0e18 })
      );
      face.position.set(el.x - 1.4, el.y, 0);
      this.elemGroup.add(face);
      this.detector = { x: el.x, h, spectrum: !!el.spectrum, hits: [] };
      this.addLabel(el.x, el.y + h / 2 + 6, el.spectrum ? 'Spectrometer' : 'Screen', 0x86b7ff);
    }
  }

  drawAnnotation(a) {
    if (a.kind === 'normal') {
      const dir = new THREE.Vector3(a.nx, a.ny, 0);
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(a.x, a.y, 2), 22, 0xffca7a, 5, 3);
      this.annoGroup.add(arrow);
      this.addLabel(a.x + a.nx * 28, a.y + a.ny * 28, 'n̂', 0xffca7a);
    } else if (a.kind === 'note' || a.kind === 'focus') {
      this.addLabel(a.x, a.y, a.text, a.kind === 'focus' ? 0x6fe08a : 0xffca7a);
      if (a.kind === 'focus') {
        const cross = new THREE.Group();
        const m = new THREE.MeshBasicMaterial({ color: 0x6fe08a });
        const hx = new THREE.Mesh(new THREE.BoxGeometry(8, 0.7, 0.7), m);
        const hy = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 0.7), m);
        cross.add(hx, hy);
        cross.position.set(a.x, a.y, 1);
        this.annoGroup.add(cross);
      }
    } else if (a.kind === 'critical') {
      const ang = a.angleDeg * Math.PI / 180;
      // mark critical rays from the interface
      for (const s of [-1, 1]) {
        const dir = new THREE.Vector3(Math.cos(ang), s * Math.sin(ang), 0);
        const arrow = new THREE.ArrowHelper(
          dir, new THREE.Vector3(a.x, a.y, 1), 35, 0xff6a5a, 4, 2.5
        );
        this.annoGroup.add(arrow);
      }
      this.addLabel(a.x + 20, a.y + 40, `θc ${a.angleDeg.toFixed(1)}°`, 0xff6a5a);
    }
  }

  addLabel(x, y, text, color) {
    const div = document.createElement('div');
    div.className = 'body-label small light-label';
    const hex = '#' + (color >>> 0).toString(16).padStart(6, '0');
    div.innerHTML = `<span class="label-dot" style="background:${hex}"></span>${text}`;
    const obj = new CSS2DObject(div);
    obj.position.set(x, y, 4);
    this.annoGroup.add(obj);
    this.labels.push(obj);
  }

  drawRays() {
    this.detectorHits = [];
    const selected = this.selectedId;
    for (const ray of this.rays) {
      const pts = ray.path.map((p, i) => {
        // stack wavelengths in Z so a spectrum fans into depth
        const zStack = ((ray.lambdaNm - 550) / 150) * 3;
        return new THREE.Vector3(p.x, p.y, zStack);
      });
      if (pts.length < 2) continue;
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const isSel = selected != null && ray.id === selected;
      const I = Math.max(0.15, Math.min(1, ray.finalI + 0.35));
      const mat = new THREE.LineBasicMaterial({
        color: ray.color.hex,
        transparent: true,
        opacity: isSel ? 1 : 0.35 + 0.45 * I,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.userData.rayId = ray.id;
      this.rayGroup.add(line);
      this.rayLines.push({ line, ray, mat });

      // thicker selected halo
      if (isSel) {
        const halo = new THREE.Line(
          geo.clone(),
          new THREE.LineBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false,
          })
        );
        halo.frustumCulled = false;
        this.rayGroup.add(halo);
      }

      // detector hits
      const last = ray.events[ray.events.length - 1];
      if (last && last.kind === 'absorb') {
        this.detectorHits.push({
          y: last.y, lambda: ray.lambdaNm, I: last.intensityIn, color: ray.color, id: ray.id,
        });
      }
    }
    this.paintDetector();
  }

  paintDetector() {
    if (!this.detector || !this.detector.spectrum) return;
    // rebuild a simple spectrum strip as colored marks on the screen
    for (const hit of this.detectorHits) {
      const mark = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 8, 6),
        new THREE.MeshBasicMaterial({ color: hit.color.hex })
      );
      mark.position.set(this.detector.x - 2, hit.y, ((hit.lambda - 550) / 150) * 3);
      this.rayGroup.add(mark);
    }
  }

  selectRay(id) {
    this.selectedId = id;
    // restyle without full rebuild
    for (const { line, ray, mat } of this.rayLines) {
      const isSel = id != null && ray.id === id;
      const I = Math.max(0.15, Math.min(1, ray.finalI + 0.35));
      mat.opacity = isSel ? 1 : 0.22 + 0.35 * I;
      line.renderOrder = isSel ? 2 : 0;
      line.scale.setScalar(isSel ? 1 : 1);
    }
    if (this.onSelect) this.onSelect(this.getSelected());
  }

  getSelected() {
    return this.rays.find((r) => r.id === this.selectedId) || null;
  }

  // summary stats across all rays
  summary() {
    const rays = this.rays;
    if (!rays.length) return null;
    let maxI = 0, sumOPL = 0, tir = 0, detected = 0;
    const lambdas = new Set();
    for (const r of rays) {
      if (r.finalI > maxI) maxI = r.finalI;
      sumOPL += r.oplMm;
      if (r.events.some((e) => e.kind === 'TIR')) tir++;
      if (r.terminated === 'detected') detected++;
      lambdas.add(r.lambdaNm);
    }
    return {
      count: rays.length,
      wavelengths: lambdas.size,
      meanOPL: sumOPL / rays.length,
      maxI,
      tir,
      detected,
      verify: this.verify,
    };
  }

  status() {
    const s = this.summary();
    if (!s) return 'Light lab';
    const name = this.preset ? this.preset.name : 'Optics';
    return `${name} · ${s.count} rays · ${s.wavelengths} λ · ⟨OPL⟩ ${s.meanOPL.toFixed(1)} mm`;
  }

  traceSnapshot() {
    const s = this.summary();
    const points = (this.rays || []).slice(0, 48).map((r, i) => {
      const actual = {
        x: r.lambdaNm,
        y: r.opl,
        z: r.intensity,
      };
      // Prefer first Snell / TIR event residual when present
      let expected = null;
      let err = null;
      const snell = (r.events || []).find((e) => e.kind === 'refract' && e.snellCheck != null);
      if (snell) {
        expected = { residual: 0 };
        err = Math.abs(snell.snellCheck);
        actual.residual = snell.snellCheck;
      }
      return {
        id: `r${i}`,
        name: `λ${Math.round(r.lambdaNm)}`,
        t: this.t,
        actual: {
          r: r.lambdaNm,
          v: r.opl,
          e: r.intensity,
          residual: actual.residual,
        },
        expected,
        err,
        extra: { terminated: r.terminated, events: (r.events || []).length },
      };
    });
    return {
      mode: 'light',
      name: this.preset?.name || 'Optics',
      t: this.t,
      status: this.status(),
      verify: s?.verify || this.verify,
      points,
    };
  }

  update(dt) {
    if (this.dirty) this.rebuild();
    if (!this.playing) return;
    this.t += dt;
    if (this.sourceMesh) {
      const pulse = 0.85 + 0.15 * Math.sin(this.t * 4);
      this.sourceMesh.scale.setScalar(pulse);
    }
  }

  // pick nearest ray to a world-space point (from a click raycast plane hit)
  pickNearest(worldX, worldY, maxDist = 8) {
    let best = null, bestD = maxDist;
    for (const ray of this.rays) {
      for (let i = 0; i < ray.path.length - 1; i++) {
        const a = ray.path[i], b = ray.path[i + 1];
        const d = distToSegment(worldX, worldY, a.x, a.y, b.x, b.y);
        if (d < bestD) { bestD = d; best = ray; }
      }
    }
    return best;
  }
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t, cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}
