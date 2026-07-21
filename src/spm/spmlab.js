// SPM Mooring Lab: real-time / stand-alone Single Point Mooring scene.
// 1 scene unit = 1 m. Buoy, six catenary chains, waves, seabed.
// Physics: src/spm/mooring.js (modular SPM module per client §4.1).

import * as THREE from 'three';
import { MooringSim, chainProfile } from './mooring.js';
import { TrailSystem } from '../scene/trails.js';

export class SpmLab {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    const sunLight = new THREE.DirectionalLight(0xfff2e0, 2.2);
    sunLight.position.set(300, 260, 180);
    this.group.add(sunLight);
    this.group.add(new THREE.AmbientLight(0x2a3040, 1.6));

    this.buildMooring();
  }

  buildMooring() {
    const g = this.group;
    this.sim = new MooringSim();

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

    this.seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6a5c42, roughness: 1 })
    );
    g.add(this.seabed);
    this.seabedGrid = new THREE.GridHelper(900, 30, 0x4a4030, 0x4a4030);
    this.seabedGrid.material.transparent = true;
    this.seabedGrid.material.opacity = 0.35;
    g.add(this.seabedGrid);

    this.buoyGroup = new THREE.Group();
    g.add(this.buoyGroup);
    this.buildBuoyMesh();

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

    this.windArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 18, 0), 30, 0xaad4ff, 8, 4);
    this.curArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -10, 0), 24, 0x6fe0c8, 7, 3.5);
    g.add(this.windArrow, this.curArrow);

    // Restoring force vector at buoy centre (F_X, F_Y)
    this.forceArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 12, 0), 20, 0xff8a6a, 6, 3);
    g.add(this.forceArrow);

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
      new THREE.MeshStandardMaterial({ color: 0xcf5a14, metalness: 0.6 })
    );
    deck.position.y = p.buoyH / 2 + 0.25;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8 })
    );
    mast.position.y = p.buoyH / 2 + 2.2;
    this.buoyGroup.add(hull, deck, mast);
  }

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

  onChainStatusChanged() {
    // Dim piles for OFF legs
    for (let i = 0; i < 6; i++) {
      const on = this.sim.chainOn[i];
      this.pileMeshes[i].material.color.setHex(on ? 0x9a9a9a : 0x444444);
      this.pileMeshes[i].material.opacity = on ? 1 : 0.45;
      this.pileMeshes[i].material.transparent = !on;
    }
  }

  update(dt) {
    const sim = this.sim;
    sim.step(Math.min(dt, 0.1));
    const p = sim.params;
    const chains = sim.lastChains || sim.solveChains();
    const env = sim.lastEnv || sim.envForce(chains);
    const force = sim.lastForce || sim.restoringForce(chains);

    const pos = this.water.geometry.attributes.position;
    const comps = sim.waveComponents();
    const arr = pos.array;
    const t = sim.t;
    for (let i = 0; i < pos.count; i++) {
      const x = arr[i * 3], z = arr[i * 3 + 2];
      let eta = 0;
      if (sim.mode === 'coupled') {
        for (const c of comps) eta += c.amp * Math.sin(c.kx * x + c.kz * z - c.w * t + c.ph);
      }
      arr[i * 3 + 1] = eta;
    }
    pos.needsUpdate = true;
    this.water.geometry.computeVertexNormals();

    const draft = env.draft;
    this.buoyGroup.position.set(sim.buoy.x, sim.buoy.heave + p.buoyH / 2 - draft, sim.buoy.z);
    if (sim.mode === 'coupled') {
      this.buoyGroup.rotation.z = 0.03 * Math.sin(t * 0.9);
      this.buoyGroup.rotation.x = 0.03 * Math.sin(t * 1.1 + 1);
    } else {
      this.buoyGroup.rotation.z = 0;
      this.buoyGroup.rotation.x = 0;
    }

    const mblN = p.mbl * 1000;
    for (let i = 0; i < 6; i++) {
      const c = chains[i];
      const line = this.chainLines[i];
      const posA = line.geometry.attributes.position.array;
      const td = this.tdMarkers[i];

      if (!c.enabled) {
        line.visible = false;
        td.visible = false;
        continue;
      }
      line.visible = true;

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

      const util = Number.isFinite(c.sol.T) ? c.sol.T / mblN : 2;
      const col = util > 0.6 ? 0xff5a4a : util > 0.3 ? 0xffca7a : 0x9fe08a;
      line.material.color.setHex(c.sol.mode === 'taut' ? 0xff2a2a : col);

      if (c.sol.mode === 'grounded' && c.sol.grounded > 0.5) {
        td.visible = true;
        td.position.set(
          c.pile.x + ux * c.sol.touchdownFromPile,
          -p.depth + 0.3,
          c.pile.z + uz * c.sol.touchdownFromPile
        );
      } else {
        td.visible = false;
      }
    }

    const wd = p.windDir * Math.PI / 180;
    this.windArrow.setDirection(new THREE.Vector3(Math.cos(wd), 0, Math.sin(wd)));
    this.windArrow.setLength(8 + p.windU * 1.2, 6, 3);
    this.windArrow.position.set(sim.buoy.x - Math.cos(wd) * 45, 16, sim.buoy.z - Math.sin(wd) * 45);
    const cd = p.curDir * Math.PI / 180;
    this.curArrow.setDirection(new THREE.Vector3(Math.cos(cd), 0, Math.sin(cd)));
    this.curArrow.setLength(6 + p.curU * 12, 5, 2.5);
    this.curArrow.position.set(sim.buoy.x - Math.cos(cd) * 40, -p.depth * 0.45, sim.buoy.z - Math.sin(cd) * 40);

    const fMag = Math.hypot(force.Fx, force.Fy);
    if (fMag > 10) {
      this.forceArrow.visible = true;
      this.forceArrow.setDirection(new THREE.Vector3(force.Fx / fMag, 0, force.Fy / fMag));
      this.forceArrow.setLength(Math.min(8 + fMag / 8000, 55), 6, 3);
      this.forceArrow.position.set(sim.buoy.x, 14, sim.buoy.z);
    } else {
      this.forceArrow.visible = false;
    }

    this.traceTmp = this.traceTmp || new THREE.Vector3();
    this.traceTmp.set(sim.buoy.x, sim.buoy.heave + 0.3, sim.buoy.z);
    this.trace.push('buoy', this.traceTmp, 0x86b7ff);
    this.trace.update();
  }

  status() {
    const chains = this.sim.lastChains;
    if (!chains) return 'SPM mooring';
    const off = this.sim.offCount();
    const force = this.sim.lastForce || { Fx_kN: 0, Fy_kN: 0 };
    let maxT = 0, maxI = 0;
    chains.forEach((c, i) => {
      if (!c.enabled) return;
      const T = Number.isFinite(c.sol.T) ? c.sol.T : Infinity;
      if (T > maxT) { maxT = T; maxI = i; }
    });
    const tonnes = Number.isFinite(maxT) ? (maxT / 9806.65).toFixed(1) : 'TAUT';
    const maint = off ? ` · ${off} leg${off > 1 ? 's' : ''} OFF` : '';
    return `SPM · ${this.sim.mode} · T=${tonnes}t (ch ${maxI + 1}) · F=(${force.Fx_kN.toFixed(0)}, ${force.Fy_kN.toFixed(0)}) kN${maint}`;
  }

  traceSnapshot() {
    const sim = this.sim;
    const chains = sim.lastChains || [];
    const force = sim.lastForce || { Fx: 0, Fy: 0 };
    const points = chains.map((c, i) => {
      const T = Number.isFinite(c.sol?.T) ? c.sol.T : NaN;
      return {
        id: `c${i}`,
        name: `Chain ${i + 1}${c.enabled ? '' : ' (OFF)'}`,
        t: sim.t,
        actual: { r: c.sol?.touchdownFromPile ?? NaN, v: T / 9806.65, e: c.sol?.angleDeg ?? NaN },
        expected: null,
        err: null,
        extra: { status: c.enabled ? 'ON' : 'OFF', mode: c.sol?.mode },
      };
    });
    points.unshift({
      id: 'buoy',
      name: 'Buoy',
      t: sim.t,
      actual: { x: sim.buoy.x, y: sim.buoy.heave, z: sim.buoy.z },
      expected: null,
      err: null,
      extra: { Fx: force.Fx, Fy: force.Fy },
    });
    return {
      mode: 'spm',
      name: 'SPM mooring',
      t: sim.t,
      status: this.status(),
      points,
    };
  }
}
