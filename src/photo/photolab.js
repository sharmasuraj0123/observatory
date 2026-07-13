// Photo Lab scene: photoelectric cathode bench + photosynthesis chloroplast.
// Photons are additive sprites; ejected electrons and O2 bubbles are particles.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { softDotTexture } from '../scene/setup.js';
import { wavelengthToRGB } from '../light/optics.js';
import {
  METALS, photoResult, thresholdNm, PIGMENTS, actionSpectrum,
  leafAbsorb, sampleSpectrum,
} from './photoPhysics.js';

const DOT = softDotTexture();
const MAX_PHOTONS = 80;
const MAX_ELECTRONS = 60;
const MAX_BUBBLES = 40;

function hexOf(rgb) {
  return (Math.round(rgb.r * 255) << 16) | (Math.round(rgb.g * 255) << 8) | Math.round(rgb.b * 255);
}

export class PhotoLab {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.group.add(new THREE.AmbientLight(0x2a3048, 1.2));
    this.key = new THREE.DirectionalLight(0xfff0dd, 1.6);
    this.key.position.set(40, 60, 30);
    this.group.add(this.key);

    this.peGroup = new THREE.Group();
    this.psGroup = new THREE.Group();
    this.group.add(this.peGroup, this.psGroup);

    this.submode = 'photoelectric'; // | photosynthesis
    this.t = 0;
    this.playing = true;

    // Photoelectric params
    this.pe = {
      metalId: 'na',
      lambdaNm: 450,
      intensity: 0.7,
      voltage: 0, // retarding volts
    };

    // Photosynthesis params
    this.ps = {
      lambdaNm: 680,
      intensity: 0.8,
      mix: { chlA: 1, chlB: 0.55, carot: 0.4 },
    };

    this.photons = [];
    this.electrons = [];
    this.bubbles = [];
    this.photonMeshes = [];
    this.electronMeshes = [];
    this.bubbleMeshes = [];

    this.buildPhotoelectric();
    this.buildPhotosynthesis();
    this.setSubmode('photoelectric');
  }

  setSubmode(m) {
    this.submode = m;
    this.peGroup.visible = m === 'photoelectric';
    this.psGroup.visible = m === 'photosynthesis';
    this.clearParticles();
  }

  get metal() {
    return METALS.find((m) => m.id === this.pe.metalId) || METALS[2];
  }

  // ---------------- photoelectric bench ----------------

  buildPhotoelectric() {
    const g = this.peGroup;

    // Lab table
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(90, 1.2, 50),
      new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.85, metalness: 0.2 })
    );
    table.position.set(0, -8, 0);
    g.add(table);

    // Vacuum tube envelope (glass cylinder on its side)
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 14, 52, 48, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xa8d4ff,
        transparent: true,
        opacity: 0.12,
        roughness: 0.05,
        transmission: 0.7,
        thickness: 2,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, 6, 0);
    g.add(tube);

    // Caps
    for (const x of [-26, 26]) {
      const cap = new THREE.Mesh(
        new THREE.CircleGeometry(14, 32),
        new THREE.MeshStandardMaterial({ color: 0x3a4558, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide })
      );
      cap.rotation.y = Math.PI / 2;
      cap.position.set(x, 6, 0);
      g.add(cap);
    }

    // Cathode plate (metal)
    this.cathode = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0xd0c090, metalness: 0.85, roughness: 0.25,
        emissive: new THREE.Color(0x221800), emissiveIntensity: 0.3,
      })
    );
    this.cathode.position.set(-18, 6, 0);
    g.add(this.cathode);

    // Anode collector
    this.anode = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a9aaa, metalness: 0.7, roughness: 0.35 })
    );
    this.anode.position.set(18, 6, 0);
    g.add(this.anode);

    // Lamp housing
    const lamp = new THREE.Group();
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 5, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a303c, metalness: 0.5, roughness: 0.5 })
    );
    housing.rotation.z = Math.PI / 2;
    lamp.add(housing);
    this.lampGlow = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.55 })
    );
    this.lampGlow.position.x = 5;
    lamp.add(this.lampGlow);
    lamp.position.set(-38, 6, 0);
    g.add(lamp);
    this.lamp = lamp;

    // Beam guide (subtle)
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 1.8, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0x88aaff, transparent: true, opacity: 0.15,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.beam.rotation.z = Math.PI / 2;
    this.beam.position.set(-28, 6, 0);
    g.add(this.beam);

    this.addLabel(g, -18, 16, 0, 'Cathode', 0xffca7a);
    this.addLabel(g, 18, 16, 0, 'Anode', 0x86b7ff);
    this.addLabel(g, -38, 14, 0, 'Lamp', 0xffffff);

    // Particle pools
    for (let i = 0; i < MAX_PHOTONS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: DOT, color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      s.scale.setScalar(1.6);
      s.visible = false;
      g.add(s);
      this.photonMeshes.push(s);
    }
    for (let i = 0; i < MAX_ELECTRONS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: DOT, color: 0x7fd0ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      s.scale.setScalar(1.1);
      s.visible = false;
      g.add(s);
      this.electronMeshes.push(s);
    }
  }

  // ---------------- photosynthesis ----------------

  buildPhotosynthesis() {
    const g = this.psGroup;

    // Leaf disk backdrop
    const leaf = new THREE.Mesh(
      new THREE.CircleGeometry(28, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1a5a32, roughness: 0.9, metalness: 0,
        emissive: new THREE.Color(0x0a2814), emissiveIntensity: 0.4,
        side: THREE.DoubleSide,
      })
    );
    leaf.position.set(0, 0, -8);
    g.add(leaf);

    // Chloroplast body (ellipsoid)
    this.chloro = new THREE.Mesh(
      new THREE.SphereGeometry(10, 40, 28),
      new THREE.MeshPhysicalMaterial({
        color: 0x2d8a4e,
        transparent: true,
        opacity: 0.55,
        roughness: 0.35,
        transmission: 0.35,
        thickness: 4,
        emissive: new THREE.Color(0x143820),
        emissiveIntensity: 0.5,
      })
    );
    this.chloro.scale.set(1.4, 0.85, 1);
    this.chloro.position.set(0, 2, 0);
    g.add(this.chloro);

    // Thylakoid stacks (grana)
    this.grana = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const stack = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const disk = new THREE.Mesh(
          new THREE.CylinderGeometry(2.8, 2.8, 0.35, 24),
          new THREE.MeshStandardMaterial({
            color: 0x3cb86a,
            emissive: new THREE.Color(0x1a6030),
            emissiveIntensity: 0.55,
            roughness: 0.5,
          })
        );
        disk.position.y = k * 0.45;
        stack.add(disk);
      }
      stack.position.set((i - 2) * 3.5, -1, 2);
      this.grana.add(stack);
    }
    g.add(this.grana);

    // Incoming sun lamp
    this.psLamp = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe080 })
    );
    this.psLamp.position.set(-32, 18, 12);
    g.add(this.psLamp);
    const sunGlow = new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffcc66, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.psLamp.add(sunGlow);

    this.addLabel(g, 0, 14, 0, 'Chloroplast', 0x6fe08a);
    this.addLabel(g, -32, 24, 12, 'Incident light', 0xffca7a);

    // Spectrum bar strip (visual readout in 3D)
    this.spectrumBars = new THREE.Group();
    this.spectrumBars.position.set(0, -16, 8);
    g.add(this.spectrumBars);
    this.rebuildSpectrumBars();

    // Photon + bubble pools (shared photon meshes are in peGroup; create PS ones)
    this.psPhotonMeshes = [];
    for (let i = 0; i < MAX_PHOTONS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: DOT, color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      s.scale.setScalar(1.8);
      s.visible = false;
      g.add(s);
      this.psPhotonMeshes.push(s);
    }
    for (let i = 0; i < MAX_BUBBLES; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 10, 8),
        new THREE.MeshPhysicalMaterial({
          color: 0xc8e8ff, transparent: true, opacity: 0.45,
          roughness: 0.1, transmission: 0.8, thickness: 1, depthWrite: false,
        })
      );
      m.visible = false;
      g.add(m);
      this.bubbleMeshes.push(m);
    }
  }

  rebuildSpectrumBars() {
    while (this.spectrumBars.children.length) {
      const c = this.spectrumBars.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    const samples = sampleSpectrum((nm) => actionSpectrum(nm, 1, this.ps.mix).rate, 400, 700, 10);
    const max = Math.max(...samples.map((s) => s.v), 1e-6);
    samples.forEach((s, i) => {
      const h = 0.3 + 8 * (s.v / max);
      const rgb = wavelengthToRGB(s.nm);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, h, 0.85),
        new THREE.MeshBasicMaterial({
          color: hexOf(rgb),
          transparent: true,
          opacity: 0.75,
        })
      );
      bar.position.set((i - samples.length / 2) * 1.0, h / 2, 0);
      bar.userData.nm = s.nm;
      this.spectrumBars.add(bar);
    });
    // Marker for current λ
    this.λMarker = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.2, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.λMarker.rotation.x = Math.PI;
    this.spectrumBars.add(this.λMarker);
    this.updateLambdaMarker();
  }

  updateLambdaMarker() {
    if (!this.λMarker) return;
    const nm = this.ps.lambdaNm;
    const i = Math.round((nm - 400) / 10);
    const n = this.spectrumBars.children.length - 1;
    const x = (Math.max(0, Math.min(n - 1, i)) - (n) / 2) * 1.0;
    this.λMarker.position.set(x, 10.5, 0);
  }

  addLabel(parent, x, y, z, text, color) {
    const div = document.createElement('div');
    div.className = 'body-label small';
    const hex = '#' + (color >>> 0).toString(16).padStart(6, '0');
    div.innerHTML = `<span class="label-dot" style="background:${hex}"></span>${text}`;
    const obj = new CSS2DObject(div);
    obj.position.set(x, y, z);
    parent.add(obj);
  }

  clearParticles() {
    this.photons = [];
    this.electrons = [];
    this.bubbles = [];
    for (const m of this.photonMeshes) { m.visible = false; m.material.opacity = 0; }
    for (const m of this.electronMeshes) { m.visible = false; m.material.opacity = 0; }
    for (const m of this.psPhotonMeshes || []) { m.visible = false; m.material.opacity = 0; }
    for (const m of this.bubbleMeshes) m.visible = false;
  }

  // ---------------- analysis ----------------

  peAnalysis() {
    const metal = this.metal;
    const r = photoResult(this.pe.lambdaNm, metal.phi, this.pe.intensity, this.pe.voltage);
    return {
      ...r,
      metal,
      thresholdNm: thresholdNm(metal.phi),
      einstein: `K_max = hf - φ = ${r.Kmax.toFixed(3)} eV`,
    };
  }

  psAnalysis() {
    const a = actionSpectrum(this.ps.lambdaNm, this.ps.intensity, this.ps.mix);
    const pigments = PIGMENTS.map((p) => ({
      ...p,
      absorb: leafAbsorb(this.ps.lambdaNm, { [p.id]: 1 }),
    }));
    return {
      ...a,
      pigments,
      leafAbsorb: leafAbsorb(this.ps.lambdaNm, this.ps.mix),
      producing: a.rate > 0.05,
    };
  }

  status() {
    if (this.submode === 'photoelectric') {
      const a = this.peAnalysis();
      return `Photoelectric · ${a.metal.name} · λ=${a.lambdaNm} nm · ${a.above ? 'e⁻ flying' : 'below threshold'}`;
    }
    const a = this.psAnalysis();
    return `Photosynthesis · λ=${a.lambdaNm} nm · rate ${a.rate.toFixed(2)} · QY ${a.quantumYield.toFixed(2)}`;
  }

  // ---------------- update ----------------

  update(dt) {
    if (!this.playing) {
      this.syncMaterials();
      return;
    }
    this.t += dt;
    this.syncMaterials();

    if (this.submode === 'photoelectric') this.updatePE(dt);
    else this.updatePS(dt);
  }

  syncMaterials() {
    const rgb = wavelengthToRGB(this.submode === 'photoelectric' ? this.pe.lambdaNm : this.ps.lambdaNm);
    const hex = hexOf(rgb);
    if (this.lampGlow) {
      this.lampGlow.material.color.setHex(hex);
      this.lampGlow.material.opacity = 0.35 + 0.5 * this.pe.intensity;
    }
    if (this.beam) {
      this.beam.material.color.setHex(hex);
      this.beam.material.opacity = 0.08 + 0.2 * this.pe.intensity;
    }
    const metal = this.metal;
    if (this.cathode) {
      this.cathode.material.color.setHex(metal.color);
    }
    if (this.psLamp) {
      this.psLamp.material.color.setHex(hex);
    }
    this.updateLambdaMarker();
  }

  updatePE(dt) {
    const a = this.peAnalysis();
    const rgb = wavelengthToRGB(a.lambdaNm);
    const hex = hexOf(rgb);

    // Spawn photons toward cathode
    const spawnRate = 18 * a.intensity;
    if (Math.random() < spawnRate * dt) {
      this.photons.push({
        x: -36, y: 6 + (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 4,
        vx: 28 + Math.random() * 8, life: 0, max: 0.85,
        color: hex,
      });
    }

    // Advance photons; on cathode hit, maybe eject electron
    for (const p of this.photons) {
      p.x += p.vx * dt;
      p.life += dt;
      if (p.x > -18.5 && p.x < -17 && !p.hit) {
        p.hit = true;
        p.life = p.max;
        if (a.above && Math.random() < 0.55 * a.intensity) {
          // Electron KE visual: faster when Kmax larger
          const speed = 8 + a.Kmax * 6;
          // Retarding field slows / reverses if V > 0
          const field = -a.voltage * 4;
          this.electrons.push({
            x: -17.5, y: p.y, z: p.z,
            vx: speed + field * 0.5,
            vy: (Math.random() - 0.5) * 3,
            vz: (Math.random() - 0.5) * 2,
            life: 0, max: 1.4,
            ax: field,
          });
        }
      }
    }
    this.photons = this.photons.filter((p) => p.life < p.max && p.x < 20);

    for (const e of this.electrons) {
      e.vx += e.ax * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.z += e.vz * dt;
      e.life += dt;
      // Collected at anode if still moving right
      if (e.x > 17) e.life = e.max;
    }
    this.electrons = this.electrons.filter((e) => e.life < e.max && e.x > -20);

    // Sync meshes
    for (let i = 0; i < this.photonMeshes.length; i++) {
      const m = this.photonMeshes[i];
      const p = this.photons[i];
      if (!p) { m.visible = false; continue; }
      m.visible = true;
      m.position.set(p.x, p.y, p.z);
      m.material.color.setHex(p.color);
      m.material.opacity = 0.9 * (1 - p.life / p.max);
      m.scale.setScalar(1.4 + 0.6 * this.pe.intensity);
    }
    for (let i = 0; i < this.electronMeshes.length; i++) {
      const m = this.electronMeshes[i];
      const e = this.electrons[i];
      if (!e) { m.visible = false; continue; }
      m.visible = true;
      m.position.set(e.x, e.y, e.z);
      m.material.opacity = 0.95 * (1 - e.life / e.max);
    }
  }

  updatePS(dt) {
    const a = this.psAnalysis();
    const rgb = wavelengthToRGB(a.lambdaNm);
    const hex = hexOf(rgb);

    const spawnRate = 14 * this.ps.intensity;
    if (Math.random() < spawnRate * dt) {
      this.photons.push({
        x: -30, y: 16 + Math.random() * 4, z: 10 + Math.random() * 4,
        tx: (Math.random() - 0.5) * 8,
        ty: 2 + (Math.random() - 0.5) * 4,
        tz: (Math.random() - 0.5) * 4,
        life: 0, max: 1.2,
        color: hex,
        absorbed: false,
      });
    }

    for (const p of this.photons) {
      p.life += dt;
      const u = Math.min(p.life / 0.9, 1);
      p.x = -30 + u * (p.tx - (-30));
      p.y = 18 + u * (p.ty - 18);
      p.z = 12 + u * (p.tz - 12);
      // Absorption decision near chloroplast
      if (!p.absorbed && u > 0.85) {
        p.absorbed = true;
        const absorbProb = Math.min(0.95, a.leafAbsorb * 0.7);
        if (Math.random() < absorbProb) {
          p.life = p.max; // vanish into pigment
          if (a.producing && Math.random() < 0.45 * a.quantumYield) {
            this.bubbles.push({
              x: p.tx + (Math.random() - 0.5),
              y: p.ty,
              z: p.tz,
              vy: 2 + Math.random() * 3,
              life: 0, max: 2.5,
            });
          }
        }
      }
    }
    this.photons = this.photons.filter((p) => p.life < p.max);

    for (const b of this.bubbles) {
      b.y += b.vy * dt;
      b.life += dt;
      b.x += Math.sin(this.t * 3 + b.y) * 0.3 * dt;
    }
    this.bubbles = this.bubbles.filter((b) => b.life < b.max);

    // Chloroplast glow with activity
    if (this.chloro) {
      this.chloro.material.emissiveIntensity = 0.35 + 0.7 * Math.min(1, a.rate);
    }
    if (this.grana) {
      this.grana.rotation.y = this.t * 0.15;
    }

    for (let i = 0; i < this.psPhotonMeshes.length; i++) {
      const m = this.psPhotonMeshes[i];
      const p = this.photons[i];
      if (!p) { m.visible = false; continue; }
      m.visible = true;
      m.position.set(p.x, p.y, p.z);
      m.material.color.setHex(p.color);
      m.material.opacity = 0.9 * (1 - p.life / p.max);
    }
    for (let i = 0; i < this.bubbleMeshes.length; i++) {
      const m = this.bubbleMeshes[i];
      const b = this.bubbles[i];
      if (!b) { m.visible = false; continue; }
      m.visible = true;
      m.position.set(b.x, b.y, b.z);
      m.material.opacity = 0.5 * (1 - b.life / b.max);
      const sc = 0.6 + 0.5 * (b.life / b.max);
      m.scale.setScalar(sc);
    }
  }
}
