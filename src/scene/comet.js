// Comet 1P/Halley: real orbit (e = 0.967, retrograde), a coma and a two-part
// tail (straight blue ion tail, curved warm dust tail) that grow near perihelion.

import * as THREE from 'three';
import { COMET_HALLEY } from '../data/bodies.js';
import { solveKepler, planeToScene } from '../sim/kepler.js';
import { UNITS_PER_AU, KM_TO_UNITS, DEG, TAU, GM_SUN, AU_KM } from '../sim/constants.js';
import { radialSpriteTexture, proceduralTexture } from '../textures/procedural.js';

const ION_COUNT = 700;
const DUST_COUNT = 500;

export class Comet {
  constructor(scene, makeLabel) {
    this.def = COMET_HALLEY;
    this.isComet = true;
    this.worldPos = new THREE.Vector3();
    this.radiusUnits = this.def.radiusKm * KM_TO_UNITS;
    this.visualRadius = this.radiusUnits;
    this.rAU = 35;
    this.aAU = this.def.a;
    this.moons = [];

    this.group = new THREE.Group();
    scene.add(this.group);

    const geo = new THREE.IcosahedronGeometry(1, 2);
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 1 + 0.3 * Math.sin(v.x * 4.2 + 1.7) * Math.sin(v.y * 3.1) + 0.15 * Math.sin(v.z * 7.3);
      p.setXYZ(i, v.x * n * 1.5, v.y * n * 0.8, v.z * n * 0.85); // peanut-ish
    }
    geo.computeVertexNormals();
    this.nucleus = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: proceduralTexture('halley'), roughness: 1, metalness: 0,
    }));
    this.group.add(this.nucleus);

    this.coma = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialSpriteTexture([
        [0, 'rgba(210,235,255,0.9)'],
        [0.25, 'rgba(170,210,250,0.35)'],
        [1, 'rgba(140,190,240,0)'],
      ], 256),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.group.add(this.coma);

    const soft = radialSpriteTexture([
      [0, 'rgba(255,255,255,0.9)'],
      [0.4, 'rgba(255,255,255,0.25)'],
      [1, 'rgba(255,255,255,0)'],
    ], 64);
    this.ion = this.makeTail(ION_COUNT, soft, 26);
    this.dust = this.makeTail(DUST_COUNT, soft, 34);
    scene.add(this.ion.points, this.dust.points);

    // orbit path
    const N = 1024;
    const arr = new Float32Array((N + 1) * 3);
    const tv = new THREE.Vector3();
    const { a, e } = this.def;
    for (let j = 0; j <= N; j++) {
      const E = (j / N) * TAU;
      const xp = a * (Math.cos(E) - e);
      const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
      planeToScene(xp, yp, this.def.periDeg * DEG, this.def.iDeg * DEG, this.def.nodeDeg * DEG, tv);
      arr[j * 3] = tv.x * UNITS_PER_AU;
      arr[j * 3 + 1] = tv.y * UNITS_PER_AU;
      arr[j * 3 + 2] = tv.z * UNITS_PER_AU;
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.orbitLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
      color: this.def.color, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(this.orbitLine);

    this.label = makeLabel(this);
    this.group.add(this.label);

    this.pick = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial());
    this.pick.layers.set(1);
    this.pick.userData.rec = this;
    this.group.add(this.pick);

    this.rng = [];
    for (let i = 0; i < Math.max(ION_COUNT, DUST_COUNT) * 3; i++) this.rng.push(Math.random());
  }

  makeTail(count, map, size) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      map, size, sizeAttenuation: true, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    points.frustumCulled = false;
    return { points, geo, count };
  }

  position(daysSinceJ2000, out) {
    const { a, e } = this.def;
    const dSincePeri = daysSinceJ2000 - (this.def.perihelionJD - 2451545.0);
    let M = ((dSincePeri / this.def.periodDays) * TAU) % TAU;
    if (M > Math.PI) M -= TAU;
    const E = solveKepler(M, e);
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    planeToScene(xp, yp, this.def.periDeg * DEG, this.def.iDeg * DEG, this.def.nodeDeg * DEG, out);
    return out.multiplyScalar(UNITS_PER_AU);
  }

  update(clock, planetScale, camera, overridePos = null, destroyed = false) {
    if (destroyed) {
      this.group.visible = false;
      this.ion.points.visible = false;
      this.dust.points.visible = false;
      return;
    }
    this.group.visible = true;

    const d = clock.daysSinceJ2000;
    if (this.prevPos === undefined) this.prevPos = new THREE.Vector3();
    this.prevPos.copy(this.worldPos);
    if (overridePos) this.worldPos.copy(overridePos);
    else this.position(d, this.worldPos);
    this.group.position.copy(this.worldPos);
    this.rAU = this.worldPos.length() / UNITS_PER_AU;

    const nucleusR = Math.max(this.radiusUnits * planetScale, this.radiusUnits * 40);
    this.nucleus.scale.setScalar(nucleusR);
    this.nucleus.rotation.y = (d * 24 / 52.8) * TAU % TAU;

    // activity ramps up inside ~4.5 AU
    const act = Math.pow(Math.max(0, (4.5 - this.rAU) / 4.5), 1.6);
    const comaR = Math.max(nucleusR * 3, act * 42);
    this.coma.scale.setScalar(comaR);

    // fade the additive coma when the camera dives inside it
    let comaFade = 1;
    if (camera) {
      const dCam = camera.position.distanceTo(this.worldPos);
      comaFade = Math.min(Math.max((dCam / comaR - 0.7) / 1.4, 0.05), 1);
    }
    this.coma.material.opacity = Math.min(0.72, act * 1.9) * comaFade;
    this.ion.points.material.opacity = comaFade;
    this.dust.points.material.opacity = comaFade;

    // focusing the comet frames the whole coma when it is active
    this.visualRadius = Math.max(nucleusR, comaR * 0.5);
    this.pick.scale.setScalar(Math.max(this.visualRadius, 2));

    const show = act > 0.004;
    this.ion.points.visible = show;
    this.dust.points.visible = show;
    if (show) {
      const antiSun = this.worldPos.clone().normalize();
      // orbital velocity direction: actual motion when driven externally,
      // otherwise a small finite difference along the Kepler orbit
      let vel;
      if (overridePos && this.prevPos.distanceTo(this.worldPos) > 1e-6) {
        vel = this.worldPos.clone().sub(this.prevPos).normalize();
      } else {
        vel = this.position(d + 0.5, new THREE.Vector3()).sub(this.worldPos).normalize();
      }
      const ionLen = act * 1100;
      const dustLen = act * 800;
      this.fillTail(this.ion, antiSun, vel, ionLen, 0.02, [0.55, 0.75, 1.0], 0);
      this.fillTail(this.dust, antiSun, vel, dustLen, 0.1, [1.0, 0.9, 0.75], 0.35);
    }

    this.speedKms = Math.sqrt(GM_SUN * (2 / (this.rAU * AU_KM) - 1 / (this.aAU * AU_KM)));
  }

  fillTail(tail, antiSun, vel, len, spread, rgb, curve) {
    const pos = tail.geo.attributes.position.array;
    const col = tail.geo.attributes.color.array;
    const base = this.worldPos;
    for (let i = 0; i < tail.count; i++) {
      const u = this.rng[i] ** 1.4;
      const j1 = this.rng[(i * 3 + 1) % this.rng.length] - 0.5;
      const j2 = this.rng[(i * 3 + 2) % this.rng.length] - 0.5;
      const along = u * len;
      const off = spread * along;
      const x = base.x + antiSun.x * along - vel.x * curve * along * u + j1 * off;
      const y = base.y + antiSun.y * along - vel.y * curve * along * u + j2 * off;
      const z = base.z + antiSun.z * along - vel.z * curve * along * u + (j1 - j2) * off * 0.5;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const fade = (1 - u) * 0.85;
      col[i * 3] = rgb[0] * fade; col[i * 3 + 1] = rgb[1] * fade; col[i * 3 + 2] = rgb[2] * fade;
    }
    tail.geo.attributes.position.needsUpdate = true;
    tail.geo.attributes.color.needsUpdate = true;
  }
}
