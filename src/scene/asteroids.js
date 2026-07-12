// Main asteroid belt (instanced rocks on real Keplerian orbits, with Kirkwood
// gaps at the 3:1, 5:2 and 7:3 Jupiter resonances) plus a Kuiper belt point cloud.

import * as THREE from 'three';
import { UNITS_PER_AU, TAU, DEG } from '../sim/constants.js';
import { solveKepler } from '../sim/kepler.js';
import { softDotTexture } from './setup.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KIRKWOOD = [2.502, 2.825, 2.958]; // AU

function sampleBeltA(rng) {
  for (let tries = 0; tries < 40; tries++) {
    const a = 2.12 + rng() * (3.32 - 2.12);
    let ok = true;
    for (const gap of KIRKWOOD) {
      const w = 0.045;
      const dist = Math.abs(a - gap);
      if (dist < w && rng() > dist / w) { ok = false; break; }
    }
    if (ok) return a;
  }
  return 2.7;
}

export class AsteroidBelt {
  constructor(scene, count = 3600) {
    this.count = count;
    const rng = mulberry32(20260711);

    this.params = new Float32Array(count * 6); // a(AU), e, i, node, argPeri+M0, n(rad/day)
    this.scales = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      const a = sampleBeltA(rng);
      const e = Math.min(0.32, -Math.log(1 - rng()) * 0.09);
      const inc = Math.min(28, -Math.log(1 - rng()) * 7.2) * DEG;
      const node = rng() * TAU;
      const m0 = rng() * TAU;
      const periodDays = Math.pow(a, 1.5) * 365.25;
      const i6 = k * 6;
      this.params[i6] = a;
      this.params[i6 + 1] = e;
      this.params[i6 + 2] = inc;
      this.params[i6 + 3] = node;
      this.params[i6 + 4] = m0;
      this.params[i6 + 5] = TAU / periodDays;
      const s = 0.5 + Math.pow(rng(), 2.8) * 2.6;
      this.scales[k * 3] = s * (0.7 + rng() * 0.6);
      this.scales[k * 3 + 1] = s * (0.55 + rng() * 0.5);
      this.scales[k * 3 + 2] = s * (0.7 + rng() * 0.6);
    }

    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const rp = rockGeo.attributes.position;
    const rv = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) {
      rv.fromBufferAttribute(rp, i);
      const n = 1 + 0.28 * Math.sin(rv.x * 5.1 + rv.y * 3.7 + rv.z * 4.3);
      rp.setXYZ(i, rv.x * n, rv.y * n, rv.z * n);
    }
    rockGeo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0.05, flatShading: true });
    this.mesh = new THREE.InstancedMesh(rockGeo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const color = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const t = rng();
      color.setRGB(0.42 + t * 0.2, 0.38 + t * 0.17, 0.33 + t * 0.14);
      this.mesh.setColorAt(k, color);
    }

    this.dummy = new THREE.Object3D();
    this.cursor = 0;
    this.chunk = Math.ceil(count / 3); // spread matrix updates across frames
    this.lastD = null;
    scene.add(this.mesh);
  }

  updateInstance(k, d) {
    const i6 = k * 6;
    const a = this.params[i6], e = this.params[i6 + 1], inc = this.params[i6 + 2];
    const node = this.params[i6 + 3], m0 = this.params[i6 + 4], n = this.params[i6 + 5];
    let M = (m0 + n * d) % TAU;
    const E = solveKepler(M > Math.PI ? M - TAU : M, e);
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    // rotate by node and inclination (argPeri folded into m0)
    const cN = Math.cos(node), sN = Math.sin(node);
    const ci = Math.cos(inc), si = Math.sin(inc);
    const x = cN * xp - sN * ci * yp;
    const y = sN * xp + cN * ci * yp;
    const z = si * yp;
    this.dummy.position.set(x * UNITS_PER_AU, z * UNITS_PER_AU, -y * UNITS_PER_AU);
    this.dummy.rotation.set(m0, m0 * 1.7, m0 * 0.6);
    this.dummy.scale.set(this.scales[k * 3], this.scales[k * 3 + 1], this.scales[k * 3 + 2]);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(k, this.dummy.matrix);
  }

  update(clock, overrideDays) {
    if (!this.mesh.visible) return;
    const d = overrideDays !== undefined ? overrideDays : clock.daysSinceJ2000;
    // full refresh on big time jumps, otherwise a third of the belt per frame
    const jump = this.lastD === null || Math.abs(d - this.lastD) > 40;
    const todo = jump ? this.count : this.chunk;
    for (let j = 0; j < todo; j++) {
      this.updateInstance(this.cursor, d);
      this.cursor = (this.cursor + 1) % this.count;
    }
    this.lastD = d;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setVisible(v) { this.mesh.visible = v; }
}

// Kuiper belt: thousands of faint points from 30 to 50 AU. Orbital periods out
// there are centuries, so the cloud rotates rigidly at the mean rate.
export class KuiperBelt {
  constructor(scene, count = 9000) {
    const rng = mulberry32(486958);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      const a = 30 + Math.pow(rng(), 1.4) * 20;
      const e = rng() * 0.15;
      const inc = (rng() - 0.5) * 2 * Math.min(24, -Math.log(1 - rng()) * 8) * DEG;
      const ang = rng() * TAU;
      const r = a * (1 - e * Math.cos(rng() * TAU));
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      const z = Math.sin(inc) * r * (rng() - 0.5) * 0.6;
      pos[k * 3] = x * UNITS_PER_AU;
      pos[k * 3 + 1] = z * UNITS_PER_AU;
      pos[k * 3 + 2] = -y * UNITS_PER_AU;
      const b = 0.35 + rng() * 0.5;
      col[k * 3] = 0.62 * b; col[k * 3 + 1] = 0.72 * b; col[k * 3 + 2] = 0.9 * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      map: softDotTexture(),
      size: 2.4,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    // mean motion at ~40 AU, radians per day
    this.meanMotion = TAU / (Math.pow(40, 1.5) * 365.25);
    scene.add(this.points);
  }

  update(clock, overrideDays) {
    const d = overrideDays !== undefined ? overrideDays : clock.daysSinceJ2000;
    if (this.points.visible) this.points.rotation.y = (d * this.meanMotion) % TAU;
  }

  setVisible(v) { this.points.visible = v; }
}
