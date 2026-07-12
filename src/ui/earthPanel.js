// Earth Lab panel: interior layer explorer plus the SPM mooring workbench
// with live parameter sliders and a per-chain results table.

import { LAYERS, EXTRAS, EARTH_FACTS } from '../earth/earthdata.js';

const SPM_PARAMS = [
  { k: 'buoyD', label: 'Buoy diameter', unit: 'm', min: 4, max: 24, step: 0.5 },
  { k: 'buoyH', label: 'Buoy height', unit: 'm', min: 3, max: 12, step: 0.5 },
  { k: 'depth', label: 'Sea depth', unit: 'm', min: 10, max: 100, step: 1 },
  { k: 'pileDist', label: 'Stopper to pile (horizontal)', unit: 'm', min: 100, max: 500, step: 5 },
  { k: 'chainLen', label: 'Chain length', unit: 'm', min: 150, max: 600, step: 1 },
  { k: 'chainW', label: 'Chain weight in air', unit: 'kg/m', min: 50, max: 500, step: 5 },
  { k: 'mbl', label: 'Chain break load (MBL)', unit: 'kN', min: 1000, max: 12000, step: 100 },
  { k: 'windU', label: 'Wind speed', unit: 'm/s', min: 0, max: 40, step: 0.5 },
  { k: 'windDir', label: 'Wind + wave direction', unit: '°', min: 0, max: 360, step: 5 },
  { k: 'curU', label: 'Current speed', unit: 'm/s', min: 0, max: 3, step: 0.05 },
  { k: 'curDir', label: 'Current direction', unit: '°', min: 0, max: 360, step: 5 },
  { k: 'hs', label: 'Wave height Hs', unit: 'm', min: 0, max: 8, step: 0.1 },
  { k: 'tp', label: 'Wave period Tp', unit: 's', min: 4, max: 16, step: 0.5 },
];

export class EarthPanel {
  constructor(lab, hooks) {
    this.lab = lab; // EarthLab
    this.h = hooks; // { frameView(mode), setSubmode(mode) }
    this.el = document.getElementById('earth-panel');
    this.liveAcc = 0;
    this.build();
    this.selectLayer('innerCore');
  }

  build() {
    this.el.innerHTML = `
      <div class="list-title">Earth Lab</div>
      <div class="seg earth-modes">
        <button data-m="planet" class="active">Interior</button>
        <button data-m="mooring">SPM mooring</button>
      </div>
      <div id="earth-planet-ui">
        <p class="lab-note">A true-scale cutaway. Layer radii follow the PREM seismic model;
        click a layer in the 3D view or below.</p>
        <div class="section-title">Layers and systems</div>
        <div class="preset-grid earth-layers"></div>
        <div class="setting-row" style="padding: 8px 18px 0;">
          <label class="setting" style="padding:0;"><input type="checkbox" id="earth-field" checked /> Magnetic field lines</label>
        </div>
        <div class="setting-row" style="padding: 0 18px;">
          <label class="setting" style="padding:0;"><input type="checkbox" id="earth-atmo" checked /> Atmosphere glow</label>
        </div>
        <div class="earth-info" id="earth-info"></div>
      </div>
      <div id="earth-spm-ui" class="hidden">
        <p class="lab-note">Single Point Mooring: a floating buoy held by six catenary chains
        60° apart, each from a stopper on the buoy rim to a seabed pile. Solved live with
        quasi-static catenary mechanics; wind, current and wave drift push the buoy.</p>
        <div class="section-title">Parameters (all live)</div>
        <div class="spm-params"></div>
        <div class="kick-row eq-actions">
          <button class="btn tiny" id="spm-play">⏸ Pause</button>
          <button class="btn tiny" id="spm-reset">Reset buoy</button>
          <button class="btn tiny" id="spm-trace">Clear trace</button>
        </div>
        <div class="section-title">Live results</div>
        <div class="state-block" id="spm-summary"></div>
        <table class="spm-table" id="spm-table">
          <thead><tr><th>#</th><th>Tension</th><th>Angle</th><th>Touchdown</th><th>Susp.</th></tr></thead>
          <tbody></tbody>
        </table>
        <p class="lab-note">Tension and angle are at the stopper. Angle is from horizontal.
        Touchdown is the grounded chain length, measured from the pile. Physics uses the
        submerged chain weight (× 0.87 of the air weight). A red TAUT chain means the
        span exceeds what the chain length allows: lengthen the chain or reduce loads.</p>
      </div>`;

    // sub-mode switch
    this.el.querySelectorAll('.earth-modes button').forEach((b) =>
      b.addEventListener('click', () => {
        const m = b.dataset.m;
        this.el.querySelectorAll('.earth-modes button').forEach((x) =>
          x.classList.toggle('active', x === b));
        document.getElementById('earth-planet-ui').classList.toggle('hidden', m !== 'planet');
        document.getElementById('earth-spm-ui').classList.toggle('hidden', m !== 'mooring');
        this.h.setSubmode(m);
      }));

    // layer chips
    const grid = this.el.querySelector('.earth-layers');
    for (const item of [...LAYERS, ...EXTRAS]) {
      const b = document.createElement('button');
      b.className = 'btn tiny';
      b.dataset.layer = item.id;
      b.textContent = item.name;
      b.addEventListener('click', () => this.selectLayer(item.id));
      grid.appendChild(b);
    }

    this.el.querySelector('#earth-field').addEventListener('change', (e) =>
      this.lab.setFieldVisible(e.target.checked));
    this.el.querySelector('#earth-atmo').addEventListener('change', (e) =>
      this.lab.setAtmoVisible(e.target.checked));

    // SPM parameter sliders
    const box = this.el.querySelector('.spm-params');
    this.paramEls = {};
    for (const def of SPM_PARAMS) {
      const row = document.createElement('div');
      row.className = 'spm-param';
      const val = this.lab.sim.params[def.k];
      row.innerHTML = `
        <div class="setting-row"><span>${def.label}</span><span class="spm-val">${val} ${def.unit}</span></div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" />`;
      const slider = row.querySelector('input');
      const valEl = row.querySelector('.spm-val');
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        this.lab.sim.setParam(def.k, v);
        this.lab.onParamChanged(def.k);
        valEl.textContent = `${v} ${def.unit}`;
      });
      this.paramEls[def.k] = { slider, valEl, def };
      box.appendChild(row);
    }

    this.playBtn = this.el.querySelector('#spm-play');
    this.playBtn.addEventListener('click', () => this.togglePause());
    this.el.querySelector('#spm-reset').addEventListener('click', () => {
      this.lab.sim.reset();
      this.lab.trace.clear();
    });
    this.el.querySelector('#spm-trace').addEventListener('click', () => this.lab.trace.clear());
  }

  togglePause() {
    const sim = this.lab.sim;
    sim.playing = !sim.playing;
    this.playBtn.textContent = sim.playing ? '⏸ Pause' : '▶ Play';
  }

  selectLayer(id) {
    const item = [...LAYERS, ...EXTRAS].find((l) => l.id === id);
    if (!item) return;
    this.el.querySelectorAll('.earth-layers .btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.layer === id));
    const info = this.el.querySelector('#earth-info');
    const rows = Object.entries(item.stats)
      .map(([k, v]) => `<div class="stat-k">${k}</div><div class="stat-v">${v}</div>`)
      .join('');
    const facts = id === 'innerCore'
      ? `<div class="section-title" style="padding-left:0;">Whole Earth</div>
         <div class="stat-grid">${Object.entries(EARTH_FACTS).map(([k, v]) =>
           `<div class="stat-k">${k}</div><div class="stat-v">${v}</div>`).join('')}</div>`
      : '';
    info.innerHTML = `
      <h3 class="earth-layer-name">${item.name}</h3>
      <p class="info-desc">${item.description}</p>
      <div class="stat-grid">${rows}</div>
      ${facts}`;
  }

  tick(dt) {
    if (this.lab.submode !== 'mooring') return;
    this.liveAcc += dt;
    if (this.liveAcc < 0.25) return;
    this.liveAcc = 0;

    const sim = this.lab.sim;
    const chains = sim.lastChains;
    const env = sim.lastEnv;
    if (!chains || !env) return;

    const tbody = this.el.querySelector('#spm-table tbody');
    const mblN = sim.params.mbl * 1000;
    let maxT = 0;
    tbody.innerHTML = chains.map((c, i) => {
      const s = c.sol;
      const taut = !Number.isFinite(s.T);
      const T = taut ? Infinity : s.T;
      if (T > maxT) maxT = T;
      const util = taut ? 2 : s.T / mblN;
      const cls = taut || util > 0.6 ? 'spm-hot' : util > 0.3 ? 'spm-warm' : '';
      return `<tr class="${cls}">
        <td>${i + 1}</td>
        <td>${taut ? 'TAUT' : (s.T / 9806.65).toFixed(1) + ' t'}</td>
        <td>${s.angleDeg.toFixed(1)}°</td>
        <td>${s.touchdownFromPile.toFixed(1)} m</td>
        <td>${s.suspended.toFixed(1)} m</td>
      </tr>`;
    }).join('');

    const exc = Math.hypot(sim.buoy.x, sim.buoy.z);
    const sum = this.el.querySelector('#spm-summary');
    sum.innerHTML = `
      <div>Buoy excursion <b>${exc.toFixed(2)} m</b> · heave <b>${sim.buoy.heave.toFixed(2)} m</b> · t = <b>${sim.t.toFixed(0)} s</b></div>
      <div>Wind <b>${(env.wind / 1000).toFixed(1)} kN</b> · current <b>${(env.current / 1000).toFixed(1)} kN</b> · wave drift <b>${(env.drift / 1000).toFixed(1)} kN</b></div>
      <div>Chain submerged weight <b>${(sim.submergedW() / 9.80665).toFixed(0)} kg/m</b> · worst utilization <b>${Number.isFinite(maxT) ? Math.round(maxT / mblN * 100) + '%' : 'TAUT'}</b> of MBL</div>`;
  }
}
