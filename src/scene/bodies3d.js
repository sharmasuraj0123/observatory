// Builds and animates every planet, dwarf planet and moon.
//
// Scene graph per planet:
//   anchor (heliocentric position)
//     tiltGroup (axial pole orientation)
//       mesh (spins about local Y)
//       clouds / atmosphere shell / rings
//       equatorial-frame moons (anchor + orbit line each)
//     ecliptic-frame moons (Earth's Moon)
//     label, pick sphere

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ALL_TOP_LEVEL } from '../data/bodies.js';
import { elementsAt, positionFromElements, moonLocalPosition, orbitPathPositions } from '../sim/kepler.js';
import { KM_TO_UNITS, UNITS_PER_AU, DEG, TAU, G_KM, gmstDeg } from '../sim/constants.js';
import { makeEarthMaterial, makeAtmosphereMaterial, makeRingMaterial } from './materials.js';
import { poleVector } from './sun.js';

const Y_UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

const SPHERE_HI = new THREE.SphereGeometry(1, 96, 64);
const SPHERE_MID = new THREE.SphereGeometry(1, 48, 32);

function displacedSphere(seed, amp = 0.22) {
  const geo = new THREE.SphereGeometry(1, 40, 28);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = (Math.sin(v.x * 3.1 + seed) + Math.sin(v.y * 4.3 + seed * 2.7) + Math.sin(v.z * 5.2 + seed * 1.3)
      + 0.5 * Math.sin(v.x * 9.7 + v.y * 7.1 + seed)) / 3.5;
    const r = 1 + n * amp;
    v.multiplyScalar(r);
    v.y *= 0.86;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export class PlanetSystem {
  constructor(scene, getTexture, onSelect) {
    this.scene = scene;
    this.getTexture = getTexture;
    this.onSelect = onSelect;
    this.recs = [];
    this.byId = new Map();
    this.pickables = [];
    this.orbitsVisible = true;
    this.labelsVisible = true;
    this.planetScale = 1;
    this.moonSpread = 1;
    this.lastOrbitT = null;

    for (const def of ALL_TOP_LEVEL) this.buildPlanet(def);
  }

  makeLabel(rec, small = false) {
    const el = document.createElement('div');
    el.className = 'body-label' + (small ? ' small' : '');
    const hex = '#' + new THREE.Color(rec.def.color).getHexString();
    el.innerHTML = `<span class="label-dot" style="background:${hex};box-shadow:0 0 6px ${hex}"></span><span class="label-name">${rec.def.name}</span>`;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onSelect(rec.def.id);
    });
    const obj = new CSS2DObject(el);
    rec.labelEl = el;
    return obj;
  }

  buildPlanet(def) {
    const rec = {
      def,
      isMoon: false,
      radiusUnits: def.radiusKm * KM_TO_UNITS,
      visualRadius: def.radiusKm * KM_TO_UNITS,
      worldPos: new THREE.Vector3(),
      moons: [],
      rAU: 1, aAU: def.elements.a[0],
    };
    rec.anchor = new THREE.Group();
    this.scene.add(rec.anchor);

    rec.tiltQuat = new THREE.Quaternion().setFromUnitVectors(Y_UP, poleVector(def.tiltDeg, def.poleLonDeg));
    rec.tiltGroup = new THREE.Group();
    rec.tiltGroup.quaternion.copy(rec.tiltQuat);
    rec.anchor.add(rec.tiltGroup);

    // surface
    if (def.shader === 'earth') {
      rec.material = makeEarthMaterial(this.getTexture('earthDay'), this.getTexture('earthNight'));
    } else {
      rec.material = new THREE.MeshStandardMaterial({
        map: this.getTexture(def.texture),
        roughness: 1,
        metalness: 0,
      });
    }
    rec.mesh = new THREE.Mesh(SPHERE_HI, rec.material);
    rec.tiltGroup.add(rec.mesh);

    // cloud layer
    if (def.clouds) {
      const tex = this.getTexture(def.clouds.texture);
      const matOpts = def.clouds.isAlpha
        ? { color: 0xffffff, alphaMap: tex, transparent: true, depthWrite: false, opacity: def.clouds.opacity }
        : { map: tex, transparent: true, depthWrite: false, opacity: def.clouds.opacity };
      rec.clouds = new THREE.Mesh(SPHERE_MID, new THREE.MeshLambertMaterial(matOpts));
      rec.clouds.renderOrder = 1;
      rec.tiltGroup.add(rec.clouds);
    }

    // atmosphere halo: same renderOrder as rings so three.js falls back to
    // per-object distance sorting between them (moon halos vs ring planes)
    if (def.atmosphereGlow) {
      rec.atmo = new THREE.Mesh(SPHERE_MID, makeAtmosphereMaterial(def.atmosphereGlow));
      rec.atmo.renderOrder = 2;
      rec.tiltGroup.add(rec.atmo);
    }

    // rings
    if (def.rings) {
      const innerR = def.rings.innerKm / def.radiusKm;
      const outerR = def.rings.outerKm / def.radiusKm;
      const geo = new THREE.RingGeometry(innerR, outerR, 256, 2);
      geo.rotateX(-Math.PI / 2);
      const map = this.getTexture(def.rings.texture);
      rec.ringMat = makeRingMaterial({ map, inner: innerR, outer: outerR, opacity: def.rings.opacity });
      // rings draw before the additive halos: normal blending laid down after
      // additive light visibly erases it, the reverse merely over-glows
      rec.rings = new THREE.Mesh(geo, rec.ringMat);
      rec.rings.renderOrder = 1.9;
      rec.tiltGroup.add(rec.rings);
    }

    // pick sphere on layer 1 (never rendered, only raycast)
    rec.pick = new THREE.Mesh(SPHERE_MID, new THREE.MeshBasicMaterial());
    rec.pick.layers.set(1);
    rec.pick.userData.rec = rec;
    rec.anchor.add(rec.pick);
    this.pickables.push(rec.pick);

    rec.label = this.makeLabel(rec);
    rec.anchor.add(rec.label);

    // orbit line
    rec.orbitGeo = new THREE.BufferGeometry();
    const T0 = 0.26; // regenerated on first update
    rec.orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPathPositions(elementsAt(def.elements, T0), 720, UNITS_PER_AU), 3));
    rec.orbitLine = new THREE.Line(rec.orbitGeo, new THREE.LineBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    this.scene.add(rec.orbitLine);

    if (def.moons) {
      rec.farthestMoonAKm = 0;
      for (const mdef of def.moons) {
        rec.moons.push(this.buildMoon(mdef, rec));
        rec.farthestMoonAKm = Math.max(rec.farthestMoonAKm, mdef.aKm);
      }
    }

    this.recs.push(rec);
    this.byId.set(def.id, rec);
    return rec;
  }

  buildMoon(mdef, parent) {
    const rec = {
      def: mdef,
      isMoon: true,
      parent,
      radiusUnits: mdef.radiusKm * KM_TO_UNITS,
      visualRadius: mdef.radiusKm * KM_TO_UNITS,
      worldPos: new THREE.Vector3(),
      localPos: new THREE.Vector3(),
      gmParent: G_KM * (parent.def.info.massKg || 1e24),
    };
    const frameGroup = mdef.frame === 'ecliptic' ? parent.anchor : parent.tiltGroup;
    rec.inTiltFrame = frameGroup === parent.tiltGroup;

    rec.anchor = new THREE.Group();
    frameGroup.add(rec.anchor);

    const geo = mdef.irregular ? displacedSphere(mdef.aKm % 97, 0.24) : SPHERE_MID;
    rec.material = new THREE.MeshStandardMaterial({
      map: this.getTexture(mdef.texture),
      roughness: 1,
      metalness: 0,
    });
    rec.mesh = new THREE.Mesh(geo, rec.material);
    rec.anchor.add(rec.mesh);

    if (mdef.atmosphereGlow) {
      rec.atmo = new THREE.Mesh(SPHERE_MID, makeAtmosphereMaterial(mdef.atmosphereGlow));
      rec.atmo.renderOrder = 2;
      rec.anchor.add(rec.atmo);
    }

    rec.pick = new THREE.Mesh(SPHERE_MID, new THREE.MeshBasicMaterial());
    rec.pick.layers.set(1);
    rec.pick.userData.rec = rec;
    rec.anchor.add(rec.pick);
    this.pickables.push(rec.pick);

    rec.label = this.makeLabel(rec, true);
    rec.anchor.add(rec.label);

    // orbit ellipse around the parent (scaled by moonSpread at runtime)
    const cur = {
      a: mdef.aKm * KM_TO_UNITS,
      e: mdef.e || 0,
      i: mdef.iDeg || 0,
      node: mdef.nodeDeg || 0,
      w: (mdef.periDeg || 0) + (mdef.nodeDeg || 0),
    };
    const geoLine = new THREE.BufferGeometry();
    geoLine.setAttribute('position', new THREE.BufferAttribute(orbitPathPositions(cur, 256, 1), 3));
    rec.orbitLine = new THREE.Line(geoLine, new THREE.LineBasicMaterial({
      color: mdef.color,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    frameGroup.add(rec.orbitLine);

    this.recs.push(rec);
    this.byId.set(mdef.id, rec);
    return rec;
  }

  setScale(planetScale) {
    this.planetScale = planetScale;
    this.moonSpread = 1 + (planetScale - 1) * 0.85;
    for (const rec of this.recs) {
      const vr = rec.radiusUnits * planetScale;
      rec.visualRadius = vr;
      rec.mesh.scale.setScalar(vr);
      rec.pick.scale.setScalar(Math.max(vr * 2.6, rec.isMoon ? 0.5 : 1.6));
      if (rec.clouds) rec.clouds.scale.setScalar(vr * rec.def.clouds.heightScale);
      if (rec.atmo) {
        const s = (rec.def.atmosphereGlow.scale || 1.05) * 1.18;
        rec.atmo.scale.setScalar(vr * s);
      }
      if (rec.rings) rec.rings.scale.setScalar(vr);
      if (rec.isMoon) rec.orbitLine.scale.setScalar(this.moonSpread);
    }
  }

  spinAngle(def, d) {
    if (def.id === 'earth') return (gmstDeg(d) * DEG) % TAU;
    return (d * 24 / def.rotationHours) * TAU % TAU;
  }

  // Ghost mode fades the Kepler ellipses to faint reference curves while the
  // N-body experiment drives the actual positions.
  setOrbitGhost(g) {
    this.orbitGhost = g;
  }

  clearMoonPhases() {
    for (const rec of this.recs) {
      if (rec.isMoon) rec.phaseDays = 0;
    }
  }

  // phys (optional): { positions: Map<id, Vector3 scene units, heliocentric>,
  //                    moonFactor: (parentId) => orbital-rate multiplier }
  update(clock, camera, focusedRec, phys = null) {
    const T = clock.centuries;
    const d = clock.daysSinceJ2000;
    const dtDays = this.lastD === undefined ? 0 : d - this.lastD;
    this.lastD = d;

    // regenerate orbit ellipses if the epoch drifted far from the sampled one
    if (this.lastOrbitT === null || Math.abs(T - this.lastOrbitT) > 0.02) {
      this.lastOrbitT = T;
      for (const rec of this.recs) {
        if (rec.isMoon) continue;
        rec.orbitGeo.attributes.position.array.set(orbitPathPositions(elementsAt(rec.def.elements, T), 720, UNITS_PER_AU));
        rec.orbitGeo.attributes.position.needsUpdate = true;
      }
    }

    const focusedSystem = focusedRec ? (focusedRec.isMoon ? focusedRec.parent : focusedRec) : null;

    for (const rec of this.recs) {
      if (rec.isMoon) continue;
      const def = rec.def;

      if (rec.destroyed) {
        rec.anchor.visible = false;
        rec.orbitLine.visible = false;
        for (const m of rec.moons) {
          m.label.visible = false;
          m.orbitLine.visible = false;
        }
        continue;
      }
      rec.anchor.visible = true;

      const cur = elementsAt(def.elements, T);
      if (phys && phys.positions && phys.positions.has(def.id)) {
        rec.anchor.position.copy(phys.positions.get(def.id));
      } else {
        positionFromElements(cur, rec.anchor.position);
      }
      rec.worldPos.copy(rec.anchor.position);
      rec.rAU = rec.worldPos.length() / UNITS_PER_AU;
      rec.aAU = cur.a;

      rec.mesh.rotation.y = this.spinAngle(def, d);
      if (rec.clouds) rec.clouds.rotation.y = (d * 24 / def.clouds.periodHours) * TAU % TAU;

      tmpV.copy(rec.worldPos).multiplyScalar(-1).normalize(); // direction to the sun
      if (def.shader === 'earth') rec.material.uniforms.uSunDir.value.copy(tmpV);
      if (rec.atmo) rec.atmo.material.uniforms.uSunDir.value.copy(tmpV);
      if (rec.rings) {
        rec.ringMat.uniforms.uPlanetPos.value.copy(rec.worldPos);
        rec.ringMat.uniforms.uPlanetR.value = rec.visualRadius;
        rec.ringMat.uniforms.uNormalW.value.copy(Y_UP).applyQuaternion(rec.tiltQuat);
      }

      // moon system visibility: shown when focused on this system or camera is near
      const camDist = camera.position.distanceTo(rec.worldPos);
      const moonReach = (rec.farthestMoonAKm || 0) * KM_TO_UNITS * this.moonSpread;
      const showMoons = rec.moons.length > 0 && (
        (focusedSystem && focusedSystem === rec) || camDist < Math.max(moonReach * 3, rec.visualRadius * 60)
      );

      // in experiment mode moon orbital rates track the parent's effective GM
      const moonFactor = phys && phys.moonFactor ? phys.moonFactor(def.id) : 1;

      for (const m of rec.moons) {
        if (moonFactor !== 1) m.phaseDays = (m.phaseDays || 0) + (moonFactor - 1) * dtDays;
        moonLocalPosition(m.def, d + (m.phaseDays || 0), m.localPos);
        m.anchor.position.copy(m.localPos).multiplyScalar(this.moonSpread);

        // tidally locked rotation: keep the same face toward the parent
        const phi = Math.atan2(m.anchor.position.z, m.anchor.position.x);
        m.mesh.rotation.y = -phi - Math.PI;

        tmpV2.copy(m.anchor.position);
        if (m.inTiltFrame) tmpV2.applyQuaternion(rec.tiltQuat);
        m.worldPos.copy(rec.worldPos).add(tmpV2);
        m.rKm = m.localPos.length() / KM_TO_UNITS;

        if (m.atmo) {
          tmpV2.copy(m.worldPos).multiplyScalar(-1).normalize();
          m.atmo.material.uniforms.uSunDir.value.copy(tmpV2);
        }

        const showThis = showMoons && this.labelsVisible;
        m.label.visible = showThis;
        m.orbitLine.visible = showMoons && this.orbitsVisible;
      }

      rec.label.visible = this.labelsVisible && camDist > rec.visualRadius * 4;
      rec.orbitLine.visible = this.orbitsVisible;
      rec.orbitLine.material.opacity = this.orbitGhost ? 0.1 : (focusedSystem === rec ? 0.75 : 0.34);
    }
  }

  setOrbitsVisible(v) { this.orbitsVisible = v; }
  setLabelsVisible(v) { this.labelsVisible = v; }
}
