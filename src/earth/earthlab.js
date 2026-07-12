// Earth Lab scene: a true-scale cutaway of Earth's interior with magnetic
// field lines, and a real-time Single Point Mooring (SPM) simulation.
//
// Two sub-modes share the tab:
//   'planet'  : 1 scene unit = 100 km. Wedge-cut globe, layers at PREM radii.
//   'mooring' : 1 scene unit = 1 m. Buoy, six catenary chains, waves, seabed.

import * as THREE from 'three';
import { LAYERS, EARTH_RADIUS_KM } from './earthdata.js';
import { MooringSim, chainProfile } from './mooring.js';
import { TrailSystem } from '../scene/trails.js';
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

    // local lighting (only affects renders while this group is visible)
    const sunLight = new THREE.DirectionalLight(0xfff2e0, 2.2);
    sunLight.position.set(300, 260, 180);
    this.group.add(sunLight);
    this.group.add(new THREE.AmbientLight(0x2a3040, 1.6));
    this.lightDir = sunLight.position.clone().normalize();

    this.buildPlanet(getTexture);
    this.buildMooring();
    this.setSubmode('planet');
  }

  // ---------------- planet interior ----------------

  buildPlanet(getTexture) {
    const g = new THREE.Group();
    this.planetGroup = g;
    this.group.add(g);

    // wedge removed between world yaw 180 and 270 degrees
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
      shell.userData.layerId = isSurface ? 'ocean' : layer.id; // clicking the globe surface selects the oceans
      g.add(shell);
      this.layerPickables.push(shell);

      // cut faces: half-annuli at both wedge planes, colored per layer
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
        // the half-annulus is built in the XY plane facing +X; rotating about Y
        // by -yaw puts its half-plane at world yaw = atan2(z, x) = yawDeg
        face.rotation.y = -yawDeg * Math.PI / 180;
        face.userData.layerId = layer.id;
        g.add(face);
        this.layerPickables.push(face);
      }
    }

    // atmosphere halo (reuses the planet shader from the solar tab)
    this.atmoShell = new THREE.Mesh(
      new THREE.SphereGeometry(R_E * 1.05, 48, 32),
      makeAtmosphereMaterial({ color: 0x6fa8ff, power: 2.4, intensity: 1.1 })
    );
    this.atmoShell.material.uniforms.uSunDir.value.copy(this.lightDir);
    this.atmoShell.renderOrder = 2;
    g.add(this.atmoShell);

    this.buildFieldLines(g);

    // pole markers
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
    // dipole field lines: r = L cos^2(lambda), tilted ~11 degrees
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
    g.rotation.z = 11 * Math.PI / 180; // dipole tilt
    g.visible = true;
  }

  setFieldVisible(v) { this.fieldGroup.visible = v; }
  setAtmoVisible(v) { this.atmoShell.visible = v; }

  // ---------------- SPM mooring ----------------

  buildMooring() {
    const g = new THREE.Group();
    this.spmGroup = g;
    this.group.add(g);
    this.sim = new MooringSim();

    // sea surface
    const WSIZE = 760, WSEG = 72;
    const waterGeo = new THREE.PlaneGeometry(WSIZE, WSIZE, WSEG, WSEG);
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
      color: 0x175a86,
      transparent: true,
      opacity: 0.6,
      roughness: 0.35,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }));
    g.add(this.water);

    // seabed
    this.seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6a5c42, roughness: 1 })
    );
    g.add(this.seabed);
    this.seabedGrid = new THREE.GridHelper(900, 30, 0x4a4030, 0x4a4030);
    this.seabedGrid.material.transparent = true;
    this.seabedGrid.material.opacity = 0.35;
    g.add(this.seabedGrid);

    // buoy
    this.buoyGroup = new THREE.Group();
    g.add(this.buoyGroup);
    this.buildBuoyMesh();

    // piles + chains + touchdown markers
    this.pileMeshes = [];
    this.chainLines = [];
    this.tdMarkers = [];
    const CHAIN_PTS = 46;
    for (let i = 0; i < 6; i++) {
      const pile = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 4, 10),
        new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.7 })
      );
      g.add(pile);
      this.pileMeshes.push(pile);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CHAIN_PTS + 1) * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fe08a, linewidth: 2 }));
      line.frustumCulled = false;
      g.add(line);
      this.chainLines.push(line);

      const td = new THREE.Mesh(
        new THREE.TorusGeometry(1.6, 0.25, 8, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffca7a })
      );
      g.add(td);
      this.tdMarkers.push(td);
    }
    this.chainPts = CHAIN_PTS;

    // environment arrows
    this.windArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 18, 0), 30, 0xaad4ff, 8, 4);
    this.curArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -10, 0), 24, 0x6fe0c8, 7, 3.5);
    g.add(this.windArrow, this.curArrow);

    // buoy trajectory trace
    this.trace = new TrailSystem(g, 900, 0.7);

    this.layoutMooring();
  }

  buildBuoyMesh() {
    const p = this.sim.params;
    while (this.buoyGroup.children.length) {
      const c = this.buoyGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
    }
    const r = p.buoyD / 2;
    const hull = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 0.92, p.buoyH, 32),
      new THREE.MeshStandardMaterial({ color: 0xff7f2a, roughness: 0.55 })
    );
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.5, 24),
      new THREE.MeshStandardMaterial({ color: 0xcf5a14, roughness: 0.6 })
    );
    deck.position.y = p.buoyH / 2 + 0.25;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8 })
    );
    mast.position.y = p.buoyH / 2 + 2.2;
    this.buoyGroup.add(hull, deck, mast);
  }

  // static geometry that changes only when parameters change
  layoutMooring() {
    const p = this.sim.params;
    this.seabed.position.y = -p.depth;
    this.seabedGrid.position.y = -p.depth + 0.05;
    for (let i = 0; i < 6; i++) {
      const pile = this.sim.piles[i];
      this.pileMeshes[i].position.set(pile.x, -p.depth + 2, pile.z);
    }
  }

  onParamChanged(key) {
    if (key === 'buoyD' || key === 'buoyH') this.buildBuoyMesh();
    if (key === 'buoyD' || key === 'depth' || key === 'pileDist') this.layoutMooring();
  }

  // ---------------- update ----------------

  setSubmode(mode) {
    this.submode = mode;
    this.planetGroup.visible = mode === 'planet';
    this.spmGroup.visible = mode === 'mooring';
  }

  update(dt) {
    if (this.submode === 'planet') return; // static; user orbits the camera
    const sim = this.sim;
    sim.step(Math.min(dt, 0.1));
    const p = sim.params;
    const chains = sim.lastChains || sim.solveChains();
    const env = sim.lastEnv || sim.envForce();

    // water surface
    const pos = this.water.geometry.attributes.position;
    const comps = sim.waveComponents();
    const arr = pos.array;
    const t = sim.t;
    for (let i = 0; i < pos.count; i++) {
      const x = arr[i * 3], z = arr[i * 3 + 2];
      let eta = 0;
      for (const c of comps) eta += c.amp * Math.sin(c.kx * x + c.kz * z - c.w * t + c.ph);
      arr[i * 3 + 1] = eta;
    }
    pos.needsUpdate = true;
    this.water.geometry.computeVertexNormals();

    // buoy
    const draft = env.draft;
    this.buoyGroup.position.set(sim.buoy.x, sim.buoy.heave + p.buoyH / 2 - draft, sim.buoy.z);
    this.buoyGroup.rotation.z = 0.03 * Math.sin(t * 0.9);
    this.buoyGroup.rotation.x = 0.03 * Math.sin(t * 1.1 + 1);

    // chains
    const mblN = p.mbl * 1000;
    for (let i = 0; i < 6; i++) {
      const c = chains[i];
      const line = this.chainLines[i];
      const posA = line.geometry.attributes.position.array;
      const prof = chainProfile(c.sol, c.h, c.X, p.chainLen, this.chainPts);
      const ux = (c.sx - c.pile.x) / c.X;
      const uz = (c.sz - c.pile.z) / c.X;
      for (let j = 0; j < prof.length; j++) {
        const [along, up] = prof[j];
        posA[j * 3] = c.pile.x + ux * along;
        posA[j * 3 + 1] = -p.depth + up;
        posA[j * 3 + 2] = c.pile.z + uz * along;
      }
      line.geometry.setDrawRange(0, prof.length);
      line.geometry.attributes.position.needsUpdate = true;

      // color by utilization
      const util = Number.isFinite(c.sol.T) ? c.sol.T / mblN : 2;
      const col = util > 0.6 ? 0xff5a4a : util > 0.3 ? 0xffca7a : 0x9fe08a;
      line.material.color.setHex(c.sol.mode === 'taut' ? 0xff2a2a : col);

      // touchdown marker
      const td = this.tdMarkers[i];
      if (c.sol.mode === 'grounded' && c.sol.grounded > 0.5) {
        td.visible = this.spmGroup.visible;
        td.position.set(
          c.pile.x + ux * c.sol.touchdownFromPile,
          -p.depth + 0.3,
          c.pile.z + uz * c.sol.touchdownFromPile
        );
      } else {
        td.visible = false;
      }
    }

    // arrows
    const wd = p.windDir * Math.PI / 180;
    this.windArrow.setDirection(new THREE.Vector3(Math.cos(wd), 0, Math.sin(wd)));
    this.windArrow.setLength(8 + p.windU * 1.2, 6, 3);
    this.windArrow.position.set(sim.buoy.x - Math.cos(wd) * 45, 16, sim.buoy.z - Math.sin(wd) * 45);
    const cd = p.curDir * Math.PI / 180;
    this.curArrow.setDirection(new THREE.Vector3(Math.cos(cd), 0, Math.sin(cd)));
    this.curArrow.setLength(6 + p.curU * 12, 5, 2.5);
    this.curArrow.position.set(sim.buoy.x - Math.cos(cd) * 40, -p.depth * 0.45, sim.buoy.z - Math.sin(cd) * 40);

    // trajectory trace at the waterline
    this.traceTmp = this.traceTmp || new THREE.Vector3();
    this.traceTmp.set(sim.buoy.x, sim.buoy.heave + 0.3, sim.buoy.z);
    this.trace.push('buoy', this.traceTmp, 0x86b7ff);
    this.trace.update();
  }

  status() {
    if (this.submode === 'planet') {
      return 'Earth interior · true scale · click a layer';
    }
    const chains = this.sim.lastChains;
    if (!chains) return 'SPM mooring';
    let maxT = 0, maxI = 0;
    chains.forEach((c, i) => {
      const T = Number.isFinite(c.sol.T) ? c.sol.T : Infinity;
      if (T > maxT) { maxT = T; maxI = i; }
    });
    const tonnes = Number.isFinite(maxT) ? (maxT / 9806.65).toFixed(1) : 'TAUT';
    return `SPM · t = ${this.sim.t.toFixed(0)} s · max tension ${tonnes} t (chain ${maxI + 1})`;
  }
}
