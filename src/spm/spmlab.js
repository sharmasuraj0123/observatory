// SPM-Tanker Mooring Lab: Master Engine + 3D / 2D top-down visualization.
// 1 scene unit = 1 m.

import * as THREE from 'three';
import { MasterEngine } from './engine.js';
import { chainProfile } from './mooring.js';
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

    this.engine = new MasterEngine();
    // Back-compat aliases used by panel / status
    this.sim = this.engine.spm;
    this.tanker = this.engine.tanker;
    this.hawser = this.engine.hawser;

    this.buildScene();
    this.vizMode = '3d';
  }

  buildScene() {
    const g = this.group;

    const WSIZE = 1200, WSEG = 80;
    const waterGeo = new THREE.PlaneGeometry(WSIZE, WSIZE, WSEG, WSEG);
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
      color: 0x175a86,
      transparent: true,
      opacity: 0.55,
      roughness: 0.35,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }));
    g.add(this.water);

    this.seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6a5c42, metalness: 1 })
    );
    g.add(this.seabed);
    this.seabedGrid = new THREE.GridHelper(1400, 40, 0x4a4030, 0x4a4030);
    this.seabedGrid.material.transparent = true;
    this.seabedGrid.material.opacity = 0.3;
    g.add(this.seabedGrid);

    // --- SPM buoy ---
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
        new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.7 })
      );
      g.add(pile);
      this.pileMeshes.push(pile);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CHAIN_PTS + 1) * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fe08a }));
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

    // --- Tanker hull (simple prism) ---
    this.tankerGroup = new THREE.Group();
    g.add(this.tankerGroup);
    this.buildTankerMesh();

    // Hawser line
    const hGeo = new THREE.BufferGeometry();
    hGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.hawserLine = new THREE.Line(hGeo, new THREE.LineBasicMaterial({ color: 0xffe08a }));
    this.hawserLine.frustumCulled = false;
    g.add(this.hawserLine);

    // Env / force / tug arrows
    this.windArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 18, 0), 30, 0xaad4ff, 8, 4);
    this.curArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -10, 0), 24, 0x6fe0c8, 7, 3.5);
    this.forceArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 12, 0), 20, 0xff8a6a, 6, 3);
    this.tugArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 8, 0), 20, 0xc9a0ff, 6, 3);
    g.add(this.windArrow, this.curArrow, this.forceArrow, this.tugArrow);

    this.trace = new TrailSystem(g, 1200, 0.7);
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

  buildTankerMesh() {
    while (this.tankerGroup.children.length) {
      const c = this.tankerGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
    }
    const tp = this.tanker.params;
    const L = tp.Lbp;
    const B = tp.beam;
    const D = this.tanker.draft();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(L, D, B),
      new THREE.MeshStandardMaterial({ color: 0xd0d6de, roughness: 0.35, roughness: 0.55 })
    );
    hull.position.y = -D * 0.15;
    // Bow wedge marker
    const bow = new THREE.Mesh(
      new THREE.ConeGeometry(B * 0.35, L * 0.12, 4),
      new THREE.MeshStandardMaterial({ color: 0x8a93a0 })
    );
    bow.rotation.z = -Math.PI / 2;
    bow.position.set(L * 0.5 + L * 0.04, 0, 0);
    // Superstructure
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.12, D * 0.9, B * 0.7),
      new THREE.MeshStandardMaterial({ color: 0xf2f4f7 })
    );
    bridge.position.set(-L * 0.28, D * 0.55, 0);
    this.tankerGroup.add(hull, bow, bridge);
    this.tankerGroup.visible = this.engine.params.tankerEnabled;
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
    if (key === 'Lbp' || key === 'beam' || key === 'loading' || key === 'draftLaden' || key === 'draftBallast') {
      this.buildTankerMesh();
    }
  }

  onChainStatusChanged() {
    for (let i = 0; i < 6; i++) {
      const on = this.sim.chainOn[i];
      this.pileMeshes[i].material.color.setHex(on ? 0x9a9a9a : 0x444444);
      this.pileMeshes[i].material.opacity = on ? 1 : 0.45;
      this.pileMeshes[i].material.transparent = !on;
    }
  }

  setVizMode(mode) {
    this.vizMode = mode === '2d' ? '2d' : '3d';
    this.engine.vizMode = this.vizMode;
    // Flatten wave mesh opacity cues for plan view
    this.water.material.opacity = this.vizMode === '2d' ? 0.25 : 0.55;
  }

  setTankerEnabled(on) {
    this.engine.params.tankerEnabled = !!on;
    this.tankerGroup.visible = !!on;
    this.hawserLine.visible = !!on && this.engine.params.hawserEnabled;
  }

  setHawserEnabled(on) {
    this.engine.params.hawserEnabled = !!on;
    this.hawserLine.visible = !!on && this.engine.params.tankerEnabled;
  }

  update(dt) {
    const eng = this.engine;
    eng.step(Math.min(dt, 0.1));
    const y = eng.state;
    const L = eng.lastLoads || eng.evaluateLoads();
    const p = this.sim.params;
    const chains = L.chains || this.sim.lastChains || this.sim.solveChains();
    const env = L.envB || this.sim.lastEnv;
    const force = L.rest || this.sim.lastForce;
    const t = eng.t;

    // Waves
    const pos = this.water.geometry.attributes.position;
    const comps = this.sim.waveComponents();
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const x = arr[i * 3], z = arr[i * 3 + 2];
      let eta = 0;
      if (this.vizMode === '3d') {
        for (const c of comps) eta += c.amp * Math.sin(c.kx * x + c.kz * z - c.w * t + c.ph);
      }
      arr[i * 3 + 1] = eta;
    }
    pos.needsUpdate = true;
    if (this.vizMode === '3d') this.water.geometry.computeVertexNormals();

    // Buoy
    const draft = env.draft;
    const heave = this.sim.buoy.heave || 0;
    this.buoyGroup.position.set(y[0], heave + p.buoyH / 2 - draft, y[1]);

    // Chains
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
      } else td.visible = false;
    }

    // Tanker
    if (eng.params.tankerEnabled) {
      this.tankerGroup.visible = true;
      const tdraft = L.tank.draft;
      this.tankerGroup.position.set(y[4], -tdraft * 0.15 + heave * 0.15, y[5]);
      this.tankerGroup.rotation.y = -y[6]; // yaw about vertical; mesh +x is bow
    } else {
      this.tankerGroup.visible = false;
    }

    // Hawser
    const haw = L.haw;
    if (eng.params.tankerEnabled && eng.params.hawserEnabled && haw?.fairlead) {
      this.hawserLine.visible = true;
      const hp = this.hawserLine.geometry.attributes.position.array;
      const by = heave + 1.5;
      hp[0] = y[0]; hp[1] = by; hp[2] = y[1];
      hp[3] = haw.fairlead.x; hp[4] = by; hp[5] = haw.fairlead.z;
      this.hawserLine.geometry.attributes.position.needsUpdate = true;
      const util = haw.util || 0;
      this.hawserLine.material.color.setHex(
        haw.slack ? 0x6a7a88 : util > 0.6 ? 0xff5a4a : util > 0.3 ? 0xffca7a : 0xffe08a
      );
    } else {
      this.hawserLine.visible = false;
    }

    // Arrows
    const wd = p.windDir * Math.PI / 180;
    this.windArrow.setDirection(new THREE.Vector3(Math.cos(wd), 0, Math.sin(wd)));
    this.windArrow.setLength(8 + p.windU * 1.2, 6, 3);
    this.windArrow.position.set(y[0] - Math.cos(wd) * 45, 16, y[1] - Math.sin(wd) * 45);
    const cd = p.curDir * Math.PI / 180;
    this.curArrow.setDirection(new THREE.Vector3(Math.cos(cd), 0, Math.sin(cd)));
    this.curArrow.setLength(6 + p.curU * 12, 5, 2.5);
    this.curArrow.position.set(y[0] - Math.cos(cd) * 40, -p.depth * 0.45, y[1] - Math.sin(cd) * 40);

    const fMag = Math.hypot(force.Fx || 0, force.Fy || 0);
    if (fMag > 10) {
      this.forceArrow.visible = true;
      this.forceArrow.setDirection(new THREE.Vector3(force.Fx / fMag, 0, force.Fy / fMag));
      this.forceArrow.setLength(Math.min(8 + fMag / 8000, 55), 6, 3);
      this.forceArrow.position.set(y[0], 14, y[1]);
    } else this.forceArrow.visible = false;

    if (haw && Math.hypot(haw.tugFx || 0, haw.tugFy || 0) > 100 && haw.bitt) {
      const tm = Math.hypot(haw.tugFx, haw.tugFy);
      this.tugArrow.visible = true;
      this.tugArrow.setDirection(new THREE.Vector3(haw.tugFx / tm, 0, haw.tugFy / tm));
      this.tugArrow.setLength(Math.min(10 + tm / 5e4, 50), 6, 3);
      this.tugArrow.position.set(haw.bitt.x, 10, haw.bitt.z);
    } else this.tugArrow.visible = false;

    this.traceTmp = this.traceTmp || new THREE.Vector3();
    this.traceTmp.set(y[0], heave + 0.3, y[1]);
    this.trace.push('buoy', this.traceTmp, 0x86b7ff);
    if (eng.params.tankerEnabled) {
      this.traceTmp2 = this.traceTmp2 || new THREE.Vector3();
      this.traceTmp2.set(y[4], 1, y[5]);
      this.trace.push('tanker', this.traceTmp2, 0xffc978);
    }
    this.trace.update();
  }

  // 2D top-down vector plot into a canvas
  drawPlan(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b1520';
    ctx.fillRect(0, 0, W, H);

    const y = this.engine.state;
    const L = this.engine.lastLoads || this.engine.evaluateLoads();
    const span = 420;
    const sx = (x) => W / 2 + (x / span) * (W * 0.45);
    const sy = (z) => H / 2 - (z / span) * (H * 0.45);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(sx(i * 100), 0); ctx.lineTo(sx(i * 100), H); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, sy(i * 100)); ctx.lineTo(W, sy(i * 100)); ctx.stroke();
    }

    // Piles + chains
    const chains = L.chains || [];
    for (let i = 0; i < chains.length; i++) {
      const c = chains[i];
      const pile = c.pile;
      ctx.fillStyle = c.enabled ? '#9a9a9a' : '#444';
      ctx.beginPath();
      ctx.arc(sx(pile.x), sy(pile.z), 3, 0, Math.PI * 2);
      ctx.fill();
      if (!c.enabled) continue;
      ctx.strokeStyle = c.sol.mode === 'taut' ? '#ff5a4a' : '#9fe08a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx(pile.x), sy(pile.z));
      ctx.lineTo(sx(c.sx), sy(c.sz));
      ctx.stroke();
    }

    // Buoy
    ctx.fillStyle = '#ff7f2a';
    ctx.beginPath();
    ctx.arc(sx(y[0]), sy(y[1]), 7, 0, Math.PI * 2);
    ctx.fill();

    // Tanker outline
    if (this.engine.params.tankerEnabled) {
      const tp = this.tanker.params;
      const ψ = y[6];
      const c = Math.cos(ψ), s = Math.sin(ψ);
      const hl = tp.Lbp / 2, hb = tp.beam / 2;
      const corners = [
        [hl, hb], [hl, -hb], [-hl, -hb], [-hl, hb],
      ].map(([lx, ly]) => [y[4] + c * lx - s * ly, y[5] + s * lx + c * ly]);
      ctx.fillStyle = 'rgba(208,214,222,0.35)';
      ctx.strokeStyle = '#d0d6de';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      corners.forEach(([px, pz], i) => {
        if (i === 0) ctx.moveTo(sx(px), sy(pz));
        else ctx.lineTo(sx(px), sy(pz));
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Bow tick
      ctx.fillStyle = '#8a93a0';
      ctx.beginPath();
      ctx.arc(sx(y[4] + c * hl), sy(y[5] + s * hl), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hawser
    const haw = L.haw;
    if (haw?.fairlead && this.engine.params.hawserEnabled) {
      ctx.strokeStyle = haw.slack ? '#6a7a88' : '#ffe08a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(y[0]), sy(y[1]));
      ctx.lineTo(sx(haw.fairlead.x), sy(haw.fairlead.z));
      ctx.stroke();
    }

    // Force vector at buoy
    const rest = L.rest || { Fx: 0, Fy: 0 };
    const fScale = 0.004;
    ctx.strokeStyle = '#ff8a6a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx(y[0]), sy(y[1]));
    ctx.lineTo(sx(y[0] + rest.Fx * fScale), sy(y[1] + rest.Fy * fScale));
    ctx.stroke();

    // Wind vector
    const wd = this.sim.params.windDir * Math.PI / 180;
    const wu = this.sim.params.windU * 3;
    ctx.strokeStyle = '#aad4ff';
    ctx.beginPath();
    ctx.moveTo(sx(-300), sy(300));
    ctx.lineTo(sx(-300 + Math.cos(wd) * wu), sy(300 + Math.sin(wd) * wu));
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.fillText('N↑  plan view (m)', 10, 16);
    ctx.fillText(`t=${this.engine.t.toFixed(0)}s  hawser=${((haw?.tension || 0) / 1000).toFixed(0)} kN`, 10, H - 10);
  }

  status() {
    const snap = this.engine.snapshot();
    const off = this.sim.offCount();
    const maint = off ? ` · ${off} OFF` : '';
    return `Master · t=${snap.t.toFixed(0)}s · hawser ${snap.hawser_kN.toFixed(0)}kN${snap.hawser_slack ? ' slack' : ''} · SPM F=(${(snap.Fx_spm / 1000).toFixed(0)},${(snap.Fy_spm / 1000).toFixed(0)}) kN${maint}`;
  }

  traceSnapshot() {
    const snap = this.engine.snapshot();
    const L = this.engine.lastLoads;
    const chains = L?.chains || [];
    const points = chains.map((c, i) => ({
      id: `c${i}`,
      name: `Chain ${i + 1}${c.enabled ? '' : ' (OFF)'}`,
      t: snap.t,
      actual: {
        r: c.sol?.touchdownFromPile ?? NaN,
        v: Number.isFinite(c.sol?.T) ? c.sol.T / 9806.65 : NaN,
        e: c.sol?.angleDeg ?? NaN,
      },
      expected: null,
      err: null,
      extra: { status: c.enabled ? 'ON' : 'OFF' },
    }));
    points.unshift({
      id: 'buoy',
      name: 'SPM buoy',
      t: snap.t,
      actual: { x: snap.spm.x, y: 0, z: snap.spm.z },
      expected: null,
      err: null,
    });
    points.push({
      id: 'tanker',
      name: 'Tanker',
      t: snap.t,
      actual: { x: snap.tanker.x, y: snap.tanker.headingDeg, z: snap.tanker.z },
      expected: null,
      err: null,
      extra: { hawser_kN: snap.hawser_kN },
    });
    return {
      mode: 'spm',
      name: 'SPM-Tanker mooring',
      t: snap.t,
      status: this.status(),
      points,
    };
  }
}
