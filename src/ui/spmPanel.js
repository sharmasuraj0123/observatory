// Time-Domain SPM-Tanker Mooring Simulator panel (full client spec).
// Modules: SPM · Tanker · Hawser/Tug · Master RK45. Stand-alone or coupled.
// Viz: 3D / 2D top-down. Export: CSV (Excel-readable).

import { makePanelDraggable } from './dragPanel.js';

const SPM_GROUPS = [
  {
    title: 'Buoy and sea',
    params: [
      { k: 'buoyD', label: 'Buoy diameter', unit: 'm', min: 4, max: 24, step: 0.5 },
      { k: 'buoyH', label: 'Buoy height', unit: 'm', min: 3, max: 12, step: 0.5 },
      { k: 'buoyMass', label: 'Buoy weight', unit: 'kg', min: 20000, max: 800000, step: 5000, note: 'default 180 t' },
      { k: 'depth', label: 'Sea depth', unit: 'm', min: 10, max: 100, step: 1 },
    ],
  },
  {
    title: 'Mooring chains (6 × 60°)',
    params: [
      { k: 'pileDist', label: 'Stopper to pile', unit: 'm', min: 100, max: 500, step: 5 },
      { k: 'chainLen', label: 'Chain length', unit: 'm', min: 150, max: 600, step: 1 },
      { k: 'chainW', label: 'Chain weight', unit: 'kg/m', min: 50, max: 500, step: 5 },
      { k: 'mbl', label: 'Chain MBL', unit: 'kN', min: 1000, max: 12000, step: 100 },
    ],
  },
  {
    title: 'Shared weather desk',
    params: [
      { k: 'windU', label: 'Wind speed', unit: 'm/s', min: 0, max: 40, step: 0.5 },
      { k: 'windDir', label: 'Wind + wave dir', unit: '°', min: 0, max: 360, step: 5 },
      { k: 'curU', label: 'Current speed', unit: 'm/s', min: 0, max: 3, step: 0.05 },
      { k: 'curDir', label: 'Current dir', unit: '°', min: 0, max: 360, step: 5 },
      { k: 'hs', label: 'Hs', unit: 'm', min: 0, max: 8, step: 0.1 },
      { k: 'tp', label: 'Tp', unit: 's', min: 4, max: 16, step: 0.5 },
    ],
  },
];

const TANKER_PARAMS = [
  { k: 'Lbp', label: 'LBP', unit: 'm', min: 120, max: 350, step: 5 },
  { k: 'beam', label: 'Beam', unit: 'm', min: 20, max: 60, step: 1 },
  { k: 'draftLaden', label: 'Draft laden', unit: 'm', min: 8, max: 22, step: 0.5 },
  { k: 'draftBallast', label: 'Draft ballast', unit: 'm', min: 4, max: 14, step: 0.5 },
  { k: 'loading', label: 'Loading (0 ballast → 1 laden)', unit: '', min: 0, max: 1, step: 0.05 },
  { k: 'headingDeg', label: 'Heading (stand-alone)', unit: '°', min: 0, max: 360, step: 5 },
];

const HAWSER_PARAMS = [
  { k: 'hawserLen', label: 'Hawser length', unit: 'm', min: 20, max: 120, step: 1 },
  { k: 'hawserEA', label: 'Hawser EA', unit: 'MN', min: 10, max: 200, step: 5, scale: 1e6 },
  { k: 'hawserN', label: 'Nonlinearity n', unit: '', min: 1, max: 3, step: 0.1 },
  { k: 'breakLoad', label: 'Hawser MBL', unit: 'kN', min: 500, max: 6000, step: 50 },
  { k: 'bowFromCg', label: 'CG → bow fairlead', unit: 'm', min: 40, max: 180, step: 5 },
  { k: 'sternFromCg', label: 'CG → stern bitt', unit: 'm', min: 40, max: 180, step: 5 },
  { k: 'tugForce', label: 'Tug force', unit: 'kN', min: -2000, max: 2000, step: 50, scale: 1000 },
  { k: 'tugAngleDeg', label: 'Tug angle (body)', unit: '°', min: 0, max: 360, step: 5 },
];

function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export class SpmPanel {
  constructor(lab, hooks = {}) {
    this.lab = lab;
    this.h = hooks;
    this.el = document.getElementById('spm-panel');
    this.liveAcc = 0;
    this.moduleTab = 'master';
    this.build();
  }

  get eng() { return this.lab.engine; }
  get sim() { return this.lab.sim; }
  get tanker() { return this.lab.tanker; }
  get hawser() { return this.lab.hawser; }

  build() {
    this.el.innerHTML = `
      <div class="list-title">SPM-Tanker Mooring Simulator</div>
      <div class="spm-spec">
        <h3 class="spm-spec-title">Time-domain modular ODE engine</h3>
        <p>Four modules: <b>SPM catenary</b>, <b>Tanker OCIMF</b>, <b>Tug/Hawser</b>, and
        <b>Master RK45</b> (5 DOF · 10-value state). Each module runs stand-alone or coupled.
        Chain maintenance: disconnect up to <b>2 legs</b>.</p>
      </div>

      <div class="section-title">Visualization</div>
      <div class="seg spm-viz">
        <button data-viz="3d" class="active">3D</button>
        <button data-viz="2d">2D top-down</button>
      </div>
      <canvas id="spm-plan" class="spm-plan hidden" width="640" height="360"></canvas>

      <div class="section-title">Master engine</div>
      <div class="seg spm-modes">
        <button data-mode="coupled" class="active">Coupled RK45</button>
        <button data-mode="standalone">Stand-alone modules</button>
      </div>
      <p class="lab-note" id="spm-mode-note">Coupled: adaptive Dormand-Prince RK45 integrates the 10-value state
        (SPM x,z + tanker x,z,ψ and rates). Steps shrink during hawser snap / gusts.</p>

      <div class="kick-row eq-actions">
        <button class="btn tiny" id="spm-play">⏸ Pause</button>
        <button class="btn tiny" id="spm-reset">Reset</button>
        <button class="btn tiny" id="spm-trace">Clear trace</button>
        <button class="btn tiny" id="spm-export">Export CSV</button>
        <button class="btn tiny" id="spm-export-state">Export state history</button>
      </div>

      <div class="seg spm-modtabs">
        <button data-tab="master" class="active">Master I/O</button>
        <button data-tab="spm">SPM</button>
        <button data-tab="tanker">Tanker</button>
        <button data-tab="hawser">Hawser / Tug</button>
      </div>

      <div id="tab-master" class="spm-tab">
        <div class="setting-row" style="padding: 8px 18px 0;">
          <label class="setting" style="padding:0;"><input type="checkbox" id="opt-tanker" checked /> Tanker module ON</label>
        </div>
        <div class="setting-row" style="padding: 0 18px;">
          <label class="setting" style="padding:0;"><input type="checkbox" id="opt-hawser" checked /> Hawser linkage ON</label>
        </div>
        <div class="section-title">Live system outputs</div>
        <div class="spm-out-cards" id="master-out"></div>
        <div class="state-block" id="spm-summary"></div>
      </div>

      <div id="tab-spm" class="spm-tab hidden">
        <div class="section-title">Chain status (maintenance)</div>
        <div class="spm-chain-status" id="spm-chain-status"></div>
        <p class="lab-note">Max 2 legs OFF. Offline legs contribute zero restoring force.</p>
        <div class="section-title">SPM inputs</div>
        <div class="spm-params" id="spm-params"></div>
        <div id="spm-standalone-pose" class="hidden">
          <div class="section-title">Static buoy displacement</div>
          <div class="spm-params" id="spm-pose-params"></div>
          <div class="kick-row eq-actions">
            <button class="btn tiny" id="spm-equil">Find equilibrium</button>
          </div>
        </div>
        <div class="section-title">SPM outputs</div>
        <div class="spm-out-cards" id="spm-out-cards"></div>
        <table class="spm-table" id="spm-table">
          <thead>
            <tr>
              <th>Chain</th><th>Status</th><th>TD pile</th><th>TD centre</th>
              <th>∠ stop</th><th>∠ TD</th><th>T</th><th>Mode</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div id="tab-tanker" class="spm-tab hidden">
        <p class="lab-note">OCIMF-style Cx/Cy/Cn vs relative angle. Draft scales windage and
        underwater area (ballast ↔ laden). Stand-alone: set heading + weather and read Surge/Sway/Yaw.</p>
        <div class="spm-params" id="tanker-params"></div>
        <div class="kick-row eq-actions">
          <button class="btn tiny" id="tanker-query">Query stand-alone loads</button>
        </div>
        <div class="spm-out-cards" id="tanker-out"></div>
      </div>

      <div id="tab-hawser" class="spm-tab hidden">
        <p class="lab-note">Nonlinear hawser spring (slack = 0 kN). Tug force at stern bitt.
        Stand-alone snap-load curve tests material stretch without a full time series.</p>
        <div class="setting-row" style="padding: 4px 18px;">
          <label class="setting" style="padding:0;"><input type="checkbox" id="opt-tug" checked /> Tug active</label>
        </div>
        <div class="spm-params" id="hawser-params"></div>
        <div class="kick-row eq-actions">
          <button class="btn tiny" id="hawser-curve">Snap-load curve CSV</button>
        </div>
        <div class="spm-out-cards" id="hawser-out"></div>
      </div>
    `;

    this.el.querySelectorAll('.spm-viz button').forEach((b) =>
      b.addEventListener('click', () => this.setViz(b.dataset.viz)));
    this.el.querySelectorAll('.spm-modes button').forEach((b) =>
      b.addEventListener('click', () => this.setAnalysisMode(b.dataset.mode)));
    this.el.querySelectorAll('.spm-modtabs button').forEach((b) =>
      b.addEventListener('click', () => this.setModuleTab(b.dataset.tab)));

    this.el.querySelector('#opt-tanker').addEventListener('change', (e) => {
      this.lab.setTankerEnabled(e.target.checked);
    });
    this.el.querySelector('#opt-hawser').addEventListener('change', (e) => {
      this.lab.setHawserEnabled(e.target.checked);
    });
    this.el.querySelector('#opt-tug').addEventListener('change', (e) => {
      this.hawser.params.tugActive = e.target.checked;
    });

    this.buildChainStatus();
    this.buildSpmParams();
    this.buildPoseParams();
    this.buildTankerParams();
    this.buildHawserParams();
    this.buildOutCards();

    makePanelDraggable(this.el, {
      handleSelector: '.list-title',
      storageKey: 'observatory-spm-panel-pos',
    });

    this.playBtn = this.el.querySelector('#spm-play');
    this.playBtn.addEventListener('click', () => this.togglePause());
    this.el.querySelector('#spm-reset').addEventListener('click', () => {
      this.eng.reset();
      this.lab.trace.clear();
      this.lab.buildTankerMesh();
      this.syncPoseSliders();
    });
    this.el.querySelector('#spm-trace').addEventListener('click', () => this.lab.trace.clear());
    this.el.querySelector('#spm-export').addEventListener('click', () => {
      downloadText(`spm-full-t${Math.round(this.eng.t)}.csv`, this.eng.fullExportCSV());
    });
    this.el.querySelector('#spm-export-state').addEventListener('click', () => {
      downloadText(`spm-state-t${Math.round(this.eng.t)}.csv`, this.eng.stateHistoryCSV());
    });
    this.el.querySelector('#spm-equil').addEventListener('click', () => {
      this.sim.findEquilibrium();
      this.eng.state[0] = this.sim.buoy.x;
      this.eng.state[1] = this.sim.buoy.z;
      this.eng.state[2] = 0;
      this.eng.state[3] = 0;
      this.syncPoseSliders();
      this.lab.trace.clear();
    });
    this.el.querySelector('#tanker-query').addEventListener('click', () => {
      this.eng.syncWeather();
      this.tanker.queryStatic();
      this.renderTankerOut();
    });
    this.el.querySelector('#hawser-curve').addEventListener('click', () => {
      const pts = this.hawser.snapLoadCurve();
      const lines = ['dist_m,stretch_m,tension_kN,slack,util'];
      for (const p of pts) {
        lines.push([p.dist.toFixed(3), p.stretch.toFixed(3), p.tension_kN.toFixed(2), p.slack ? 1 : 0, p.util.toFixed(3)].join(','));
      }
      downloadText('hawser-snap-load-curve.csv', lines.join('\n'));
    });
  }

  buildOutCards() {
    this.el.querySelector('#master-out').innerHTML = `
      <div class="spm-out-card"><div class="spm-out-k">Hawser tension</div><div class="spm-out-v" id="out-haw">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">SPM F_X / F_Y</div><div class="spm-out-v" id="out-spm-f">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">Tanker Surge / Sway</div><div class="spm-out-v" id="out-tank-f">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">Tanker Yaw moment</div><div class="spm-out-v" id="out-tank-n">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">State |ψ| excursion</div><div class="spm-out-v" id="out-pose">…</div></div>`;

    this.el.querySelector('#spm-out-cards').innerHTML = `
      <div class="spm-out-card"><div class="spm-out-k">Net F_X</div><div class="spm-out-v" id="spm-out-fx">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">Net F_Y</div><div class="spm-out-v" id="spm-out-fy">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">TD from pile</div><div class="spm-out-v" id="spm-out-td">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">TD from centre</div><div class="spm-out-v" id="spm-out-td-center">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">∠ stopper</div><div class="spm-out-v" id="spm-out-ang">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">∠ touchdown</div><div class="spm-out-v" id="spm-out-td-ang">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">Stopper T</div><div class="spm-out-v" id="spm-out-T">…</div></div>`;

    this.el.querySelector('#tanker-out').innerHTML = `
      <div class="spm-out-card"><div class="spm-out-k">Surge Fx</div><div class="spm-out-v" id="tk-fx">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">Sway Fy</div><div class="spm-out-v" id="tk-fy">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">Yaw N</div><div class="spm-out-v" id="tk-n">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">Draft / mass</div><div class="spm-out-v" id="tk-draft">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">Wind / current rel ∠</div><div class="spm-out-v" id="tk-rel">…</div></div>`;

    this.el.querySelector('#hawser-out').innerHTML = `
      <div class="spm-out-card"><div class="spm-out-k">Tension</div><div class="spm-out-v" id="hw-t">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">Stretch / slack</div><div class="spm-out-v" id="hw-s">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">MBL util</div><div class="spm-out-v" id="hw-u">…</div></div>
      <div class="spm-out-card"><div class="spm-out-k">Tug F / N</div><div class="spm-out-v" id="hw-tug">…</div></div>`;
  }

  setViz(mode) {
    this.el.querySelectorAll('.spm-viz button').forEach((b) =>
      b.classList.toggle('active', b.dataset.viz === mode));
    this.lab.setVizMode(mode);
    const plan = this.el.querySelector('#spm-plan');
    plan.classList.toggle('hidden', mode !== '2d');
    if (this.h.onVizMode) this.h.onVizMode(mode);
  }

  setModuleTab(tab) {
    this.moduleTab = tab;
    this.el.querySelectorAll('.spm-modtabs button').forEach((b) =>
      b.classList.toggle('active', b.dataset.tab === tab));
    for (const id of ['master', 'spm', 'tanker', 'hawser']) {
      this.el.querySelector(`#tab-${id}`).classList.toggle('hidden', id !== tab);
    }
  }

  setAnalysisMode(mode) {
    this.el.querySelectorAll('.spm-modes button').forEach((b) =>
      b.classList.toggle('active', b.dataset.mode === mode));
    const stand = mode === 'standalone';
    this.eng.mode = mode;
    // In stand-alone, freeze master integration; modules answer queries
    this.eng.playing = !stand;
    this.playBtn.classList.toggle('hidden', stand);
    this.el.querySelector('#spm-standalone-pose').classList.toggle('hidden', !stand);
    this.el.querySelector('#spm-mode-note').textContent = stand
      ? 'Stand-alone: pause the master ODE. Use SPM displacement / Find equilibrium, Tanker Query loads, and Hawser snap-load curve independently.'
      : 'Coupled: adaptive RK45 integrates SPM (2 DOF) + Tanker (3 DOF). Hawser couples equal-and-opposite tensions; tug adds stern force and yaw.';
    if (stand) {
      this.sim.setMode('standalone');
      this.sim.refreshStatic();
    } else {
      this.sim.setMode('coupled');
      this.eng.playing = true;
      this.playBtn.textContent = '⏸ Pause';
    }
  }

  buildChainStatus() {
    const box = this.el.querySelector('#spm-chain-status');
    box.innerHTML = '';
    this.chainBtns = [];
    for (let i = 0; i < 6; i++) {
      const btn = document.createElement('button');
      btn.className = 'btn tiny spm-leg-btn on';
      btn.innerHTML = `<span class="spm-leg-n">Leg ${i + 1}</span><span class="spm-leg-ang">${i * 60}°</span><span class="spm-leg-st">ON</span>`;
      btn.addEventListener('click', () => this.toggleLeg(i));
      box.appendChild(btn);
      this.chainBtns.push(btn);
    }
  }

  toggleLeg(i) {
    const next = !this.sim.chainOn[i];
    if (!this.sim.setChainOn(i, next)) {
      this.el.querySelector('#spm-mode-note').textContent =
        'At most 2 chains may be OFF for maintenance. Reconnect a leg first.';
      return;
    }
    this.refreshChainButtons();
    this.lab.onChainStatusChanged();
  }

  refreshChainButtons() {
    this.chainBtns.forEach((btn, i) => {
      const on = this.sim.chainOn[i];
      btn.classList.toggle('on', on);
      btn.classList.toggle('off', !on);
      btn.querySelector('.spm-leg-st').textContent = on ? 'ON' : 'OFF';
    });
  }

  buildParamRows(box, defs, getObj, onChange) {
    for (const def of defs) {
      const row = document.createElement('div');
      row.className = 'spm-param';
      const scale = def.scale || 1;
      const raw = getObj()[def.k];
      const val = raw / scale;
      row.innerHTML = `
        <div class="setting-row">
          <span>${def.label}</span>
          <span class="spm-val">${val} ${def.unit}</span>
        </div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" />
        ${def.note ? `<div class="spm-param-note">${def.note}</div>` : ''}`;
      const slider = row.querySelector('input');
      const valEl = row.querySelector('.spm-val');
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        onChange(def.k, v * scale, v, valEl, def);
      });
      box.appendChild(row);
    }
  }

  buildSpmParams() {
    const box = this.el.querySelector('#spm-params');
    for (const group of SPM_GROUPS) {
      const title = document.createElement('div');
      title.className = 'spm-group-title';
      title.textContent = group.title;
      box.appendChild(title);
      for (const def of group.params) {
        const row = document.createElement('div');
        row.className = 'spm-param';
        const val = this.sim.params[def.k];
        const fmt = (v) => def.k === 'buoyMass' ? `${(v / 1000).toFixed(0)} t` : `${v} ${def.unit}`;
        row.innerHTML = `
          <div class="setting-row"><span>${def.label}</span><span class="spm-val">${fmt(val)}</span></div>
          <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" />
          ${def.note ? `<div class="spm-param-note">${def.note}</div>` : ''}`;
        const slider = row.querySelector('input');
        const valEl = row.querySelector('.spm-val');
        slider.addEventListener('input', () => {
          const v = parseFloat(slider.value);
          this.sim.setParam(def.k, v);
          this.lab.onParamChanged(def.k);
          this.eng.syncWeather();
          valEl.textContent = fmt(v);
        });
        box.appendChild(row);
      }
    }
  }

  buildPoseParams() {
    const box = this.el.querySelector('#spm-pose-params');
    this.poseEls = {};
    for (const def of [
      { k: 'x', label: 'Buoy X', unit: 'm', min: -80, max: 80, step: 0.5 },
      { k: 'z', label: 'Buoy Y (plan)', unit: 'm', min: -80, max: 80, step: 0.5 },
    ]) {
      const row = document.createElement('div');
      row.className = 'spm-param';
      const val = this.sim.buoy[def.k];
      row.innerHTML = `
        <div class="setting-row"><span>${def.label}</span><span class="spm-val">${val.toFixed(1)} m</span></div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" />`;
      const slider = row.querySelector('input');
      const valEl = row.querySelector('.spm-val');
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        const x = def.k === 'x' ? v : this.sim.buoy.x;
        const z = def.k === 'z' ? v : this.sim.buoy.z;
        this.sim.setDisplacement(x, z);
        this.eng.state[0] = x;
        this.eng.state[1] = z;
        valEl.textContent = `${v.toFixed(1)} m`;
      });
      this.poseEls[def.k] = { slider, valEl };
      box.appendChild(row);
    }
  }

  syncPoseSliders() {
    if (!this.poseEls) return;
    for (const k of ['x', 'z']) {
      const v = this.sim.buoy[k];
      this.poseEls[k].slider.value = String(v);
      this.poseEls[k].valEl.textContent = `${v.toFixed(1)} m`;
    }
  }

  buildTankerParams() {
    const box = this.el.querySelector('#tanker-params');
    this.buildParamRows(box, TANKER_PARAMS, () => this.tanker.params, (k, stored, display, valEl, def) => {
      this.tanker.setParam(k, stored);
      valEl.textContent = `${display} ${def.unit}`;
      if (k === 'loading' || k === 'Lbp' || k === 'beam' || k === 'draftLaden' || k === 'draftBallast') {
        this.lab.onParamChanged(k);
      }
    });
  }

  buildHawserParams() {
    const box = this.el.querySelector('#hawser-params');
    this.buildParamRows(box, HAWSER_PARAMS, () => this.hawser.params, (k, stored, display, valEl, def) => {
      this.hawser.setParam(k, stored);
      const shown = def.scale === 1000 ? `${display} kN` : def.scale === 1e6 ? `${display} MN` : `${display} ${def.unit}`;
      valEl.textContent = shown;
    });
  }

  togglePause() {
    this.eng.playing = !this.eng.playing;
    this.playBtn.textContent = this.eng.playing ? '⏸ Pause' : '▶ Play';
  }

  renderTankerOut() {
    const t = this.tanker.last;
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('tk-fx', `<b>${t.Fx_kN.toFixed(1)} kN</b>`);
    set('tk-fy', `<b>${t.Fy_kN.toFixed(1)} kN</b>`);
    set('tk-n', `<b>${t.N_MNm.toFixed(3)} MN·m</b>`);
    set('tk-draft', `<b>${t.draft.toFixed(1)} m</b> · ${(t.mass / 1000).toFixed(0)} t`);
    set('tk-rel', `<b>wind ${t.windRelDeg.toFixed(0)}°</b> · cur ${t.curRelDeg.toFixed(0)}°`);
  }

  tick(dt) {
    this.liveAcc += dt;
    if (this.liveAcc < 0.2) return;
    this.liveAcc = 0;

    if (this.lab.vizMode === '2d') {
      this.lab.drawPlan(this.el.querySelector('#spm-plan'));
    }

    const eng = this.eng;
    const L = eng.lastLoads || eng.evaluateLoads();
    const y = eng.state;
    const snap = eng.snapshot();
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    set('out-haw', snap.hawser_slack
      ? `<b>0 kN</b> <span class="spm-out-sub">slack</span>`
      : `<b>${snap.hawser_kN.toFixed(1)} kN</b>`);
    set('out-spm-f', `<b>${(snap.Fx_spm / 1000).toFixed(1)}</b> / <b>${(snap.Fy_spm / 1000).toFixed(1)}</b> kN`);
    set('out-tank-f', `<b>${(snap.Fx_tanker / 1000).toFixed(1)}</b> / <b>${(snap.Fy_tanker / 1000).toFixed(1)}</b> kN`);
    set('out-tank-n', `<b>${(snap.N_tanker / 1e6).toFixed(3)} MN·m</b>`);
    set('out-pose', `<b>ψ ${snap.tanker.headingDeg.toFixed(1)}°</b> · SPM ${Math.hypot(y[0], y[1]).toFixed(1)} m · TK ${Math.hypot(y[4], y[5]).toFixed(1)} m`);

    // SPM table / cards
    const chains = L.chains || [];
    const force = L.rest || { Fx_kN: 0, Fy_kN: 0 };
    set('spm-out-fx', `<b>${force.Fx_kN.toFixed(1)} kN</b>`);
    set('spm-out-fy', `<b>${force.Fy_kN.toFixed(1)} kN</b>`);

    let maxT = 0, maxTi = 0, maxAng = 0, maxAngI = 0, maxTd = 0, maxTdI = 0;
    let maxTdCenter = 0, maxTdCenterI = 0, maxTdAng = -1, maxTdAngI = 0;
    const mblN = this.sim.params.mbl * 1000;
    const tbody = this.el.querySelector('#spm-table tbody');
    if (tbody) {
      tbody.innerHTML = chains.map((c, i) => {
        if (!c.enabled) {
          return `<tr class="spm-off"><td>${i + 1}</td><td>OFF</td><td>n/a</td><td>n/a</td><td>n/a</td><td>n/a</td><td>n/a</td><td>offline</td></tr>`;
        }
        const s = c.sol;
        const taut = !Number.isFinite(s.T);
        const T = taut ? Infinity : s.T;
        const tdAng = s.touchdownAngleDeg || 0;
        const tdC = c.touchdownFromCenter;
        if (T >= maxT) { maxT = T; maxTi = i; }
        if (s.angleDeg >= maxAng) { maxAng = s.angleDeg; maxAngI = i; }
        if (s.touchdownFromPile >= maxTd) { maxTd = s.touchdownFromPile; maxTdI = i; }
        if (Number.isFinite(tdC) && tdC >= maxTdCenter) { maxTdCenter = tdC; maxTdCenterI = i; }
        if (tdAng >= maxTdAng) { maxTdAng = tdAng; maxTdAngI = i; }
        const util = taut ? 2 : s.T / mblN;
        const cls = taut || util > 0.6 ? 'spm-hot' : util > 0.3 ? 'spm-warm' : '';
        return `<tr class="${cls}">
          <td>${i + 1} · ${(c.pile.ang * 180 / Math.PI).toFixed(0)}°</td>
          <td>ON</td>
          <td>${s.touchdownFromPile.toFixed(1)}</td>
          <td>${Number.isFinite(tdC) ? tdC.toFixed(1) : 'n/a'}</td>
          <td>${s.angleDeg.toFixed(1)}°</td>
          <td>${tdAng.toFixed(1)}°</td>
          <td>${taut ? 'TAUT' : (s.T / 9806.65).toFixed(1) + ' t'}</td>
          <td>${taut ? 'TAUT' : s.mode}</td>
        </tr>`;
      }).join('');
    }
    set('spm-out-td', `<b>${maxTd.toFixed(1)} m</b> <span class="spm-out-chain">ch ${maxTdI + 1}</span>`);
    set('spm-out-td-center', maxTdCenter > 0
      ? `<b>${maxTdCenter.toFixed(1)} m</b> <span class="spm-out-chain">ch ${maxTdCenterI + 1}</span>`
      : `<b>n/a</b>`);
    set('spm-out-ang', `<b>${maxAng.toFixed(1)}°</b> <span class="spm-out-chain">ch ${maxAngI + 1}</span>`);
    set('spm-out-td-ang', `<b>${Math.max(maxTdAng, 0).toFixed(1)}°</b> <span class="spm-out-chain">ch ${maxTdAngI + 1}</span>`);
    set('spm-out-T', Number.isFinite(maxT)
      ? `<b>${(maxT / 9806.65).toFixed(1)} t</b>`
      : `<b>TAUT</b>`);

    // Tanker / hawser live
    if (L.tank) {
      this.tanker.last = L.tank;
      this.renderTankerOut();
    }
    const haw = L.haw || {};
    set('hw-t', `<b>${((haw.tension || 0) / 1000).toFixed(1)} kN</b>`);
    set('hw-s', haw.slack
      ? `<b>slack</b>`
      : `<b>${(haw.stretch || 0).toFixed(2)} m</b>`);
    set('hw-u', `<b>${((haw.util || 0) * 100).toFixed(0)}%</b> MBL`);
    set('hw-tug', `<b>${((haw.tugFx || 0) / 1000).toFixed(0)} kN</b> · ${((haw.tugN || 0) / 1e6).toFixed(2)} MN·m`);

    const statusArr = this.sim.chainStatus().map((s) => `${s.leg}:${s.on ? 'ON' : 'OFF'}`).join(' ');
    const sum = this.el.querySelector('#spm-summary');
    if (sum) {
      sum.innerHTML = `
        <div>Master RK45 · t = <b>${eng.t.toFixed(1)} s</b> · hist <b>${eng.history.length}</b> samples · viz <b>${this.lab.vizMode}</b></div>
        <div>State [xb zb vxb vzb | xt zt ψ vxt vzt ω] =
          <b>${y[0].toFixed(1)}</b> <b>${y[1].toFixed(1)}</b> …
          ψ=<b>${(y[6] * 180 / Math.PI).toFixed(1)}°</b></div>
        <div>Chain status <b>${statusArr}</b> · hawser <b>${snap.hawser_kN.toFixed(0)} kN</b>${snap.hawser_slack ? ' (slack)' : ''} ·
          tanker ${eng.params.tankerEnabled ? 'ON' : 'OFF'} · linkage ${eng.params.hawserEnabled ? 'ON' : 'OFF'}</div>`;
    }
  }
}
