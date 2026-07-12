// The Sun: animated shader photosphere, layered corona sprites and a lens flare.

import * as THREE from 'three';
import { makeSunMaterial } from './materials.js';
import { radialSpriteTexture } from '../textures/procedural.js';
import { KM_TO_UNITS, DEG } from '../sim/constants.js';
import { SUN } from '../data/bodies.js';

export class Sun {
  constructor(scene, textures, makeLabel) {
    this.def = SUN;
    this.radiusUnits = SUN.radiusKm * KM_TO_UNITS;
    this.worldPos = new THREE.Vector3(0, 0, 0);
    this.visualRadius = this.radiusUnits;

    this.group = new THREE.Group();
    scene.add(this.group);

    this.material = makeSunMaterial(textures.sun);
    // the shader scrolls UVs forever; make sure even a fallback texture wraps
    const sunMap = this.material.uniforms.uMap.value;
    if (sunMap && sunMap.wrapS !== THREE.RepeatWrapping) {
      sunMap.wrapS = THREE.RepeatWrapping;
      sunMap.needsUpdate = true;
    }
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), this.material);

    // axial tilt lives on a parent group so the spin written to mesh.rotation.y
    // does not overwrite the pole orientation
    this.tiltGroup = new THREE.Group();
    const pole = poleVector(SUN.tiltDeg, SUN.poleLonDeg);
    this.tiltGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole);
    this.tiltGroup.add(this.mesh);
    this.group.add(this.tiltGroup);

    const coronaInner = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialSpriteTexture([
        [0, 'rgba(255,220,160,0.85)'],
        [0.18, 'rgba(255,180,90,0.42)'],
        [0.45, 'rgba(255,140,60,0.12)'],
        [1, 'rgba(255,120,40,0)'],
      ], 512),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    const coronaOuter = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialSpriteTexture([
        [0, 'rgba(255,200,130,0.28)'],
        [0.3, 'rgba(255,170,90,0.1)'],
        [1, 'rgba(255,140,60,0)'],
      ], 512),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.coronaInner = coronaInner;
    this.coronaOuter = coronaOuter;
    this.group.add(coronaInner, coronaOuter);

    // A wide, very soft halo sprite stands in for a lens flare. The three.js
    // Lensflare addon does an occlusion framebuffer readback that renders a
    // black square against multisampled HDR render targets, so it is not used.
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialSpriteTexture([
        [0, 'rgba(255,240,220,0.5)'],
        [0.1, 'rgba(255,220,160,0.2)'],
        [0.4, 'rgba(255,190,110,0.05)'],
        [1, 'rgba(255,170,90,0)'],
      ], 512),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.group.add(this.halo);

    this.label = makeLabel(this);
    this.group.add(this.label);

    this.setScale(1);
  }

  setScale(sunScale) {
    this.visualRadius = this.radiusUnits * sunScale;
    this.mesh.scale.setScalar(this.visualRadius);
    this.coronaInner.scale.setScalar(this.visualRadius * 6.4);
    this.coronaOuter.scale.setScalar(this.visualRadius * 15);
    this.halo.scale.setScalar(this.visualRadius * 34);
  }

  update(clock, elapsed, camera) {
    this.material.uniforms.uTime.value = elapsed;
    // differential-free simple rotation using the sidereal period
    this.mesh.rotation.y = (clock.daysSinceJ2000 * 24 / this.def.rotationHours) * Math.PI * 2 % (Math.PI * 2);
    const pulse = 1 + Math.sin(elapsed * 0.7) * 0.012;
    this.coronaInner.scale.setScalar(this.visualRadius * 6.4 * pulse);

    // fade the corona and flare as the camera approaches so the photosphere
    // granulation stays readable up close
    if (camera) {
      const dist = camera.position.length();
      const near = THREE.MathUtils.clamp((dist / this.visualRadius - 2.4) / 11, 0.04, 1);
      this.coronaInner.material.opacity = 0.95 * Math.pow(near, 1.5);
      this.coronaOuter.material.opacity = 0.6 * Math.pow(near, 1.9);
      this.halo.material.opacity = Math.pow(near, 2.2);
    }
  }
}

export function poleVector(tiltDeg, poleLonDeg) {
  const t = tiltDeg * DEG;
  const lon = (poleLonDeg || 0) * DEG;
  // ecliptic frame pole (x toward vernal equinox, z north) mapped to scene axes
  const x = Math.sin(t) * Math.cos(lon);
  const y = Math.sin(t) * Math.sin(lon);
  const z = Math.cos(t);
  return new THREE.Vector3(x, z, -y).normalize();
}
