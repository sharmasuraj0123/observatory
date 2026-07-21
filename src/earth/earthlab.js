// Earth Lab scene: a true-scale cutaway of Earth's interior with magnetic
// field lines. 1 scene unit = 100 km. Wedge-cut globe, layers at PREM radii.

import * as THREE from 'three';
import { LAYERS, EARTH_RADIUS_KM } from './earthdata.js';
import { makeAtmosphereMaterial } from '../scene/materials.js';

const KM_UNIT = 100; // planet mode: km per scene unit
const R_E = EARTH_RADIUS_KM / KM_UNIT; // 63.71 units

export class EarthLab {
  constructor(scene, getTexture) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.submode = 'planet';
    this.layerPickables = [];

    const sunLight = new THREE.DirectionalLight(0xfff2e0, 2.2);
    sunLight.position.set(300, 260, 180);
    this.group.add(sunLight);
    this.group.add(new THREE.AmbientLight(0x2a3040, 1.6));
    this.lightDir = sunLight.position.clone().normalize();

    this.buildPlanet(getTexture);
  }

  buildPlanet(getTexture) {
    const g = new THREE.Group();
    this.planetGroup = g;
    this.group.add(g);

    const PHI_START = 0;
    const PHI_LEN = Math.PI * 1.5;

    for (const layer of LAYERS) {
      const rOut = layer.rOuter / KM_UNIT;
      const isSurface = layer.id === 'crust';
      let mat;
      if (isSurface) {
        mat = new THREE.MeshStandardMaterial({
          map: getTexture('earthDay'),
          roughness: 0.9,
          metalness: 0,
        });
      } else {
        const col = new THREE.Color(layer.color);
        mat = new THREE.MeshStandardMaterial({
          color: col,
          emissive: col.clone().multiplyScalar(layer.emissive * 0.55),
          roughness: 0.85,
          metalness: 0,
        });
      }
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(rOut, 96, 64, PHI_START, PHI_LEN),
        mat
      );
      shell.userData.layerId = isSurface ? 'ocean' : layer.id;
      g.add(shell);
      this.layerPickables.push(shell);

      const rIn = layer.rInner / KM_UNIT;
      for (const yawDeg of [180, 270]) {
        const face = new THREE.Mesh(
          new THREE.RingGeometry(Math.max(rIn, 0.01), rOut, 64, 1, -Math.PI / 2, Math.PI),
          new THREE.MeshStandardMaterial({
            color: layer.color,
            emissive: new THREE.Color(layer.color).multiplyScalar(layer.emissive * 0.4),
            roughness: 0.9,
            side: THREE.DoubleSide,
          })
        );
        face.rotation.y = -yawDeg * Math.PI / 180;
        face.userData.layerId = layer.id;
        g.add(face);
        this.layerPickables.push(face);
      }
    }

    this.atmoShell = new THREE.Mesh(
      new THREE.SphereGeometry(R_E * 1.05, 48, 32),
      makeAtmosphereMaterial({ color: 0x6fa8ff, power: 2.4, intensity: 1.1 })
    );
    this.atmoShell.material.uniforms.uSunDir.value.copy(this.lightDir);
    this.atmoShell.renderOrder = 2;
    g.add(this.atmoShell);

    this.buildFieldLines(g);

    const poleMat = new THREE.MeshBasicMaterial({ color: 0x86b7ff });
    for (const s of [1, -1]) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), poleMat);
      pin.position.set(0, s * (R_E + 2.6), 0);
      g.add(pin);
    }
  }

  buildFieldLines(parent) {
    const g = new THREE.Group();
    this.fieldGroup = g;
    parent.add(g);
    const mat = new THREE.LineBasicMaterial({
      color: 0x7fd0ff,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const L of [1.7, 2.4, 3.4, 4.8]) {
      const lamMax = Math.acos(Math.sqrt(1 / L));
      for (let m = 0; m < 8; m++) {
        const lon = (m / 8) * Math.PI * 2;
        const pts = [];
        for (let i = 0; i <= 60; i++) {
          const lam = -lamMax + (i / 60) * 2 * lamMax;
          const r = L * Math.cos(lam) ** 2 * R_E;
          const xy = r * Math.cos(lam);
          pts.push(new THREE.Vector3(
            xy * Math.cos(lon),
            r * Math.sin(lam),
            xy * Math.sin(lon)
          ));
        }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
        g.add(line);
      }
    }
    g.rotation.z = 11 * Math.PI / 180;
    g.visible = true;
  }

  setFieldVisible(v) { this.fieldGroup.visible = v; }
  setAtmoVisible(v) { this.atmoShell.visible = v; }

  update() {
    // static cutaway; user orbits the camera
  }

  status() {
    return 'Earth interior · true scale · click a layer';
  }

  traceSnapshot() {
    return {
      mode: 'earth',
      name: 'Earth interior',
      t: 0,
      status: this.status(),
      points: [],
    };
  }
}
