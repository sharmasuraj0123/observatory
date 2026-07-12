// Fading motion trails for experiment mode, so orbital divergence from the
// real ephemeris (spirals, escapes, captures) is visible at a glance.

import * as THREE from 'three';

const MAX = 1400;

export class TrailSystem {
  constructor(scene) {
    this.scene = scene;
    this.trails = new Map();
  }

  ensure(id, color) {
    let t = this.trails.get(id);
    if (t) return t;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    line.frustumCulled = false;
    this.scene.add(line);
    t = {
      line, geo,
      pts: new Float64Array(MAX * 3),
      count: 0,
      head: 0,
      color: new THREE.Color(color),
      last: new THREE.Vector3(1e12, 0, 0),
      dirty: false,
    };
    this.trails.set(id, t);
    return t;
  }

  push(id, pos, color) {
    const t = this.ensure(id, color);
    // sample density scales with orbit size so one buffer covers roughly a lap
    const thr = Math.max(0.35, pos.length() * 0.005);
    if (t.count && t.last.distanceTo(pos) < thr) return;
    t.pts[t.head * 3] = pos.x;
    t.pts[t.head * 3 + 1] = pos.y;
    t.pts[t.head * 3 + 2] = pos.z;
    t.head = (t.head + 1) % MAX;
    t.count = Math.min(t.count + 1, MAX);
    t.last.copy(pos);
    t.dirty = true;
  }

  update() {
    for (const t of this.trails.values()) {
      if (!t.dirty) continue;
      t.dirty = false;
      const posA = t.geo.attributes.position.array;
      const colA = t.geo.attributes.color.array;
      const { count, head, color } = t;
      for (let i = 0; i < count; i++) {
        const src = (head - count + i + MAX) % MAX;
        posA[i * 3] = t.pts[src * 3];
        posA[i * 3 + 1] = t.pts[src * 3 + 1];
        posA[i * 3 + 2] = t.pts[src * 3 + 2];
        const f = Math.pow((i + 1) / count, 1.6) * 0.85;
        colA[i * 3] = color.r * f;
        colA[i * 3 + 1] = color.g * f;
        colA[i * 3 + 2] = color.b * f;
      }
      t.geo.setDrawRange(0, count);
      t.geo.attributes.position.needsUpdate = true;
      t.geo.attributes.color.needsUpdate = true;
    }
  }

  clear() {
    for (const t of this.trails.values()) {
      t.count = 0;
      t.head = 0;
      t.last.set(1e12, 0, 0);
      t.geo.setDrawRange(0, 0);
    }
  }

  setVisible(v) {
    for (const t of this.trails.values()) t.line.visible = v;
  }
}
