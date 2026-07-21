// SPM Mooring Module panel (client spec §4.1).
// Stand-alone / coupled modes, chain maintenance toggles (1 to 2 OFF),
// live catenary outputs, net restoring F_X / F_Y, CSV export.

const SPM_GROUPS = [
  {
    title: 'Buoy and sea',
    params: [
      { k: 'buoyD', label: 'Buoy diameter', unit: 'm', min: 4, max: 24, step: 0.5, note: 'default 12 m · floating' },
      { k: 'buoyH', label: 'Buoy height', unit: 'm', min: 3, max: 12, step: 0.5 },
      {
        k: 'buoyMass',
        label: 'Weight of SPM buoy',
        unit: 'kg',
        min: 20000,
        max: 800000,
        step: 5000,
        note: 'default 180000 kg (180 t) · sets floating draft',
      },
      { k: 'depth', label: 'Sea depth', unit: 'm', min: 10, max: 100, step: 1, note: 'default 30 m' },
    ],
  },
  {
    title: 'Mooring chains (6 × 60°)',
    params: [
      {
        k: 'pileDist',
        label: 'Horizontal stopper to pile',
        unit: 'm',
        min: 100,
        max: 500,
        step: 5,
        note: 'default 300 m · piles equidistant from SPM centre',
      },
      {
        k: 'chainLen',
        label: 'Total chain length',
        unit: 'm',
        min: 150,
        max: 600,
        step: 1,
        note: 'default 315 m · pile end on seabed, stopper end on buoy',
      },
      {
        k: 'chainW',
        label: 'Chain weight per metre',
        unit: 'kg/m',
        min: 50,
        max: 500,
        step: 5,
        note: 'default 250 kg/m (in air)',
      },
      { k: 'mbl', label: 'Chain break load (MBL)', unit: 'kN', min: 1000, max: 12000, step: 100 },
    ],
  },
  {
    title: 'Weather force (wind and sea)',
    params: [
      { k: 'windU', label: 'Wind speed', unit: 'm/s', min: 0, max: 40, step: 0.5 },
      { k: 'windDir', label: 'Wind + wave direction', unit: '°', min: 0, max: 360, step: 5 },
      { k: 'curU', label: 'Current speed', unit: 'm/s', min: 0, max: 3, step: 0.05 },
      { k: 'curDir', label: 'Current direction', unit: '°', min: 0, max: 360, step: 5 },
      { k: 'hs', label: 'Significant wave height Hs', unit: 'm', min: 0, max: 8, step: 0.1 },
      { k: 'tp', label: 'Wave period Tp', unit: 's', min: 4, max: 16, step: 0.5 },
    ],
  },
];

export class SpmPanel {
  constructor(lab, hooks = {}) {
    this.lab = lab;
    this.h = hooks;
    this.el = document.getElementById('spm-panel');
    this.liveAcc = 0;
    this.build();
  }

  build() {
    this.el.innerHTML = `
      <div class="list-title">SPM Mooring Module</div>
      <div class="spm-spec">
        <h3 class="spm-spec-title">Subsea catenary array</h3>
        <p>Modular stand-alone / coupled SPM engine. Six radial legs at <b>60°</b>.
        Toggle up to <b>2 chains OFF</b> for disconnect, inspection, and reconnect;
        the module recalculates asymmetric equilibrium and elevated load on remaining legs.</p>
        <p class="spm-spec-defaults">Defaults: buoy dia <b>12 m</b> · buoy weight <b>180 t</b> · sea depth <b>30 m</b> ·
        stopper-pile <b>300 m</b> · chain length <b>315 m</b> · chain weight <b>250 kg/m</b>.
        Output: net restoring <b>F_X, F_Y</b> on the buoy centre.</p>
      </div>

      <div class="section-title">Analysis mode</div>
      <div class="seg spm-modes">
        <button data-mode="coupled" class="active">Coupled (time-domain)</button>
        <button data-mode="standalone">Stand-alone (static)</button>
      </div>
      <p class="lab-note" id="spm-mode-note">Coupled: weather drives the buoy; chains answer each frame.
        Stand-alone: fix a displacement (or find equilibrium) and query tensions without integrating.</p>

      <div class="section-title">Chain status (maintenance)</div>
      <div class="spm-chain-status" id="spm-chain-status"></div>
      <p class="lab-note">Max 2 legs OFF. OFF legs contribute zero restoring force; remaining legs take the asymmetric load.</p>

      <div class="section-title">Variable inputs</div>
      <div class="spm-params" id="spm-params"></div>

      <div id="spm-standalone-pose" class="hidden">
        <div class="section-title">Static displacement</div>
        <div class="spm-params" id="spm-pose-params"></div>
        <div class="kick-row eq-actions">
          <button class="btn tiny" id="spm-equil">Find equilibrium</button>
        </div>
      </div>

      <div class="kick-row eq-actions">
        <button class="btn tiny" id="spm-play">⏸ Pause</button>
        <button class="btn tiny" id="spm-reset">Reset buoy</button>
        <button class="btn tiny" id="spm-trace">Clear trace</button>
        <button class="btn tiny" id="spm-export">Export CSV</button>
      </div>

      <div class="section-title">Module outputs (live)</div>
      <div class="spm-out-cards" id="spm-out-cards">
        <div class="spm-out-card">
          <div class="spm-out-k">Net restoring F_X</div>
          <div class="spm-out-v" id="spm-out-fx">…</div>
          <div class="spm-out-note">Horizontal force on buoy centre, +x (kN)</div>
        </div>
        <div class="spm-out-card">
          <div class="spm-out-k">Net restoring F_Y</div>
          <div class="spm-out-v" id="spm-out-fy">…</div>
          <div class="spm-out-note">Horizontal force on buoy centre, +z scene / +y plan (kN)</div>
        </div>
        <div class="spm-out-card">
          <div class="spm-out-k">1. Touchdown from pile</div>
          <div class="spm-out-v" id="spm-out-td">…</div>
          <div class="spm-out-note">Grounded length from pile to lift-off (m)</div>
        </div>
        <div class="spm-out-card">
          <div class="spm-out-k">2. Touchdown from SPM centre</div>
          <div class="spm-out-v" id="spm-out-td-center">…</div>
          <div class="spm-out-note">Horizontal range from buoy centre to seabed lift-off (m)</div>
        </div>
        <div class="spm-out-card">
          <div class="spm-out-k">3. Catenary angle at stopper</div>
          <div class="spm-out-v" id="spm-out-ang">…</div>
          <div class="spm-out-note">Angle at the SPM stopper from horizontal (°)</div>
        </div>
        <div class="spm-out-card">
          <div class="spm-out-k">4. Catenary angle at touchdown</div>
          <div class="spm-out-v" id="spm-out-td-ang">…</div>
          <div class="spm-out-note">0° when grounded; pile angle when fully suspended</div>
        </div>
        <div class="spm-out-card">
          <div class="spm-out-k">5. Stopper tension</div>
          <div class="spm-out-v" id="spm-out-T">…</div>
          <div class="spm-out-note">Tension on chain locked at the stopper</div>
        </div>
      </div>

      <div class="state-block" id="spm-summary"></div>

      <div class="section-title">Per-chain catenary</div>
      <table class="spm-table" id="spm-table">
        <thead>
          <tr>
            <th>Chain</th>
            <th>Status</th>
            <th>TD pile</th>
            <th>TD centre</th>
            <th>∠ stopper</th>
            <th>∠ touchdown</th>
            <th>Stopper T</th>
            <th>Mode</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <p class="lab-note">Status ON/OFF is the maintenance array. Offline legs show zero load.
        Physics uses submerged chain weight (× 0.87 of air weight). <b>TAUT</b> means the span
        exceeds what the chain length allows.</p>`;

    this.el.querySelectorAll('.spm-modes button').forEach((b) =>
      b.addEventListener('click', () => this.setAnalysisMode(b.dataset.mode)));

    this.buildChainStatus();
    this.buildSpmParams();
    this.buildPoseParams();

    this.playBtn = this.el.querySelector('#spm-play');
    this.playBtn.addEventListener('click', () => this.togglePause());
    this.el.querySelector('#spm-reset').addEventListener('click', () => {
      this.lab.sim.reset();
      this.lab.trace.clear();
      this.syncPoseSliders();
    });
    this.el.querySelector('#spm-trace').addEventListener('click', () => this.lab.trace.clear());
    this.el.querySelector('#spm-export').addEventListener('click', () => this.exportCsv());
    this.el.querySelector('#spm-equil').addEventListener('click', () => {
      this.lab.sim.findEquilibrium();
      this.syncPoseSliders();
      this.lab.trace.clear();
    });
  }

  buildChainStatus() {
    const box = this.el.querySelector('#spm-chain-status');
    box.innerHTML = '';
    this.chainBtns = [];
    for (let i = 0; i < 6; i++) {
      const ang = i * 60;
      const btn = document.createElement('button');
      btn.className = 'btn tiny spm-leg-btn on';
      btn.dataset.leg = String(i);
      btn.innerHTML = `<span class="spm-leg-n">Leg ${i + 1}</span><span class="spm-leg-ang">${ang}°</span><span class="spm-leg-st">ON</span>`;
      btn.addEventListener('click', () => this.toggleLeg(i));
      box.appendChild(btn);
      this.chainBtns.push(btn);
    }
  }

  toggleLeg(i) {
    const sim = this.lab.sim;
    const next = !sim.chainOn[i];
    const ok = sim.setChainOn(i, next);
    if (!ok) {
      const note = this.el.querySelector('#spm-mode-note');
      note.textContent = 'At most 2 chains may be OFF for maintenance. Reconnect a leg first.';
      return;
    }
    this.refreshChainButtons();
    this.lab.onChainStatusChanged();
    if (sim.mode === 'standalone') {
      sim.findEquilibrium();
      this.syncPoseSliders();
    }
  }

  refreshChainButtons() {
    const sim = this.lab.sim;
    this.chainBtns.forEach((btn, i) => {
      const on = sim.chainOn[i];
      btn.classList.toggle('on', on);
      btn.classList.toggle('off', !on);
      btn.querySelector('.spm-leg-st').textContent = on ? 'ON' : 'OFF';
    });
  }

  setAnalysisMode(mode) {
    this.el.querySelectorAll('.spm-modes button').forEach((b) =>
      b.classList.toggle('active', b.dataset.mode === mode));
    this.lab.sim.setMode(mode);
    const stand = mode === 'standalone';
    this.el.querySelector('#spm-standalone-pose').classList.toggle('hidden', !stand);
    this.playBtn.classList.toggle('hidden', stand);
    const note = this.el.querySelector('#spm-mode-note');
    note.textContent = stand
      ? 'Stand-alone: set buoy displacement below, or Find equilibrium for the asymmetric offset under weather + chain status.'
      : 'Coupled: weather drives the buoy; chains answer each frame. Master ODE wiring (RK45 multi-body) lands with Tanker / Tug modules.';
    this.syncPoseSliders();
  }

  buildSpmParams() {
    const box = this.el.querySelector('#spm-params');
    this.paramEls = {};
    for (const group of SPM_GROUPS) {
      const title = document.createElement('div');
      title.className = 'spm-group-title';
      title.textContent = group.title;
      box.appendChild(title);
      for (const def of group.params) {
        const row = document.createElement('div');
        row.className = 'spm-param';
        const val = this.lab.sim.params[def.k];
        row.innerHTML = `
          <div class="setting-row">
            <span>${def.label}</span>
            <span class="spm-val">${val} ${def.unit}</span>
          </div>
          <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" />
          ${def.note ? `<div class="spm-param-note">${def.note}</div>` : ''}`;
        const slider = row.querySelector('input');
        const valEl = row.querySelector('.spm-val');
        const fmtVal = (v) => def.k === 'buoyMass'
          ? `${(v / 1000).toFixed(0)} t`
          : `${v} ${def.unit}`;
        valEl.textContent = fmtVal(val);
        slider.addEventListener('input', () => {
          const v = parseFloat(slider.value);
          this.lab.sim.setParam(def.k, v);
          this.lab.onParamChanged(def.k);
          if (this.lab.sim.mode === 'standalone') this.lab.sim.refreshStatic();
          valEl.textContent = fmtVal(v);
        });
        this.paramEls[def.k] = { slider, valEl, def };
        box.appendChild(row);
      }
    }
  }

  buildPoseParams() {
    const box = this.el.querySelector('#spm-pose-params');
    this.poseEls = {};
    const defs = [
      { k: 'x', label: 'Buoy displacement X', unit: 'm', min: -80, max: 80, step: 0.5 },
      { k: 'z', label: 'Buoy displacement Y (plan)', unit: 'm', min: -80, max: 80, step: 0.5 },
    ];
    for (const def of defs) {
      const row = document.createElement('div');
      row.className = 'spm-param';
      const val = this.lab.sim.buoy[def.k];
      row.innerHTML = `
        <div class="setting-row">
          <span>${def.label}</span>
          <span class="spm-val">${val.toFixed(1)} ${def.unit}</span>
        </div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" />`;
      const slider = row.querySelector('input');
      const valEl = row.querySelector('.spm-val');
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        const x = def.k === 'x' ? v : this.lab.sim.buoy.x;
        const z = def.k === 'z' ? v : this.lab.sim.buoy.z;
        this.lab.sim.setDisplacement(x, z);
        valEl.textContent = `${v.toFixed(1)} ${def.unit}`;
      });
      this.poseEls[def.k] = { slider, valEl, def };
      box.appendChild(row);
    }
  }

  syncPoseSliders() {
    if (!this.poseEls) return;
    for (const k of ['x', 'z']) {
      const el = this.poseEls[k];
      const v = this.lab.sim.buoy[k];
      el.slider.value = String(v);
      el.valEl.textContent = `${v.toFixed(1)} ${el.def.unit}`;
    }
  }

  togglePause() {
    const sim = this.lab.sim;
    sim.playing = !sim.playing;
    this.playBtn.textContent = sim.playing ? '⏸ Pause' : '▶ Play';
  }

  exportCsv() {
    const csv = this.lab.sim.toCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `spm-mooring-t${Math.round(this.lab.sim.t)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  tick(dt) {
    this.liveAcc += dt;
    if (this.liveAcc < 0.2) return;
    this.liveAcc = 0;

    const sim = this.lab.sim;
    const chains = sim.lastChains;
    const env = sim.lastEnv;
    if (!chains || !env) return;
    const force = sim.lastForce || sim.restoringForce(chains);

    const mblN = sim.params.mbl * 1000;
    let maxT = 0;
    let maxTi = 0;
    let maxAng = 0;
    let maxAngI = 0;
    let maxTd = 0;
    let maxTdI = 0;
    let maxTdCenter = 0;
    let maxTdCenterI = 0;
    let maxTdAng = -1;
    let maxTdAngI = 0;
    let anyActive = false;

    const tbody = this.el.querySelector('#spm-table tbody');
    tbody.innerHTML = chains.map((c, i) => {
      const s = c.sol;
      if (!c.enabled) {
        return `<tr class="spm-off">
          <td>${i + 1} · ${(c.pile.ang * 180 / Math.PI).toFixed(0)}°</td>
          <td>OFF</td>
          <td>n/a</td><td>n/a</td><td>n/a</td><td>n/a</td><td>n/a</td>
          <td>offline</td>
        </tr>`;
      }
      anyActive = true;
      const taut = !Number.isFinite(s.T);
      const T = taut ? Infinity : s.T;
      const tdAng = Number.isFinite(s.touchdownAngleDeg) ? s.touchdownAngleDeg : 0;
      const tdCenter = Number.isFinite(c.touchdownFromCenter) ? c.touchdownFromCenter : NaN;
      if (T >= maxT) { maxT = T; maxTi = i; }
      if (s.angleDeg >= maxAng) { maxAng = s.angleDeg; maxAngI = i; }
      if (s.touchdownFromPile >= maxTd) { maxTd = s.touchdownFromPile; maxTdI = i; }
      if (Number.isFinite(tdCenter) && tdCenter >= maxTdCenter) {
        maxTdCenter = tdCenter;
        maxTdCenterI = i;
      }
      if (tdAng >= maxTdAng) { maxTdAng = tdAng; maxTdAngI = i; }
      const util = taut ? 2 : s.T / mblN;
      const cls = taut || util > 0.6 ? 'spm-hot' : util > 0.3 ? 'spm-warm' : '';
      const mode = taut ? 'TAUT' : (s.mode || (s.grounded > 0.5 ? 'grounded' : 'suspended'));
      return `<tr class="${cls}">
        <td>${i + 1} · ${(c.pile.ang * 180 / Math.PI).toFixed(0)}°</td>
        <td>ON</td>
        <td>${s.touchdownFromPile.toFixed(1)} m</td>
        <td>${Number.isFinite(tdCenter) ? tdCenter.toFixed(1) + ' m' : 'n/a'}</td>
        <td>${s.angleDeg.toFixed(1)}°</td>
        <td>${tdAng.toFixed(1)}°</td>
        <td>${taut ? 'TAUT' : (s.T / 9806.65).toFixed(1) + ' t'}</td>
        <td>${mode}</td>
      </tr>`;
    }).join('');

    const fxEl = document.getElementById('spm-out-fx');
    const fyEl = document.getElementById('spm-out-fy');
    if (fxEl) fxEl.innerHTML = `<b>${force.Fx_kN.toFixed(1)} kN</b>`;
    if (fyEl) fyEl.innerHTML = `<b>${force.Fy_kN.toFixed(1)} kN</b>`;

    const tdEl = document.getElementById('spm-out-td');
    const tdCenterEl = document.getElementById('spm-out-td-center');
    const angEl = document.getElementById('spm-out-ang');
    const tdAngEl = document.getElementById('spm-out-td-ang');
    const tEl = document.getElementById('spm-out-T');
    if (!anyActive) {
      if (tdEl) tdEl.innerHTML = `<b>n/a</b>`;
      if (tdCenterEl) tdCenterEl.innerHTML = `<b>n/a</b>`;
      if (angEl) angEl.innerHTML = `<b>n/a</b>`;
      if (tdAngEl) tdAngEl.innerHTML = `<b>n/a</b>`;
      if (tEl) tEl.innerHTML = `<b>n/a</b>`;
    } else {
      if (tdEl) {
        tdEl.innerHTML = `<b>${maxTd.toFixed(1)} m</b> <span class="spm-out-chain">chain ${maxTdI + 1}</span>`;
      }
      if (tdCenterEl) {
        tdCenterEl.innerHTML = maxTdCenter > 0
          ? `<b>${maxTdCenter.toFixed(1)} m</b> <span class="spm-out-chain">chain ${maxTdCenterI + 1}</span>`
          : `<b>n/a</b> <span class="spm-out-sub">no seabed lift-off</span>`;
      }
      if (angEl) {
        angEl.innerHTML = `<b>${maxAng.toFixed(1)}°</b> <span class="spm-out-chain">chain ${maxAngI + 1}</span>`;
      }
      if (tdAngEl) {
        const tdMode = chains[maxTdAngI]?.sol?.mode;
        const tdNote = tdMode === 'grounded'
          ? 'lift-off (grounded)'
          : tdMode === 'suspended'
            ? 'at pile (suspended)'
            : 'taut chord';
        tdAngEl.innerHTML = `<b>${Math.max(maxTdAng, 0).toFixed(1)}°</b>
          <span class="spm-out-chain">chain ${maxTdAngI + 1}</span>
          <span class="spm-out-sub">${tdNote}</span>`;
      }
      if (tEl) {
        tEl.innerHTML = Number.isFinite(maxT)
          ? `<b>${(maxT / 9806.65).toFixed(1)} t</b> <span class="spm-out-chain">chain ${maxTi + 1}</span>
             <span class="spm-out-sub">${(maxT / 1000).toFixed(0)} kN</span>`
          : `<b>TAUT</b> <span class="spm-out-chain">chain ${maxTi + 1}</span>`;
      }
    }

    const exc = Math.hypot(sim.buoy.x, sim.buoy.z);
    const sum = this.el.querySelector('#spm-summary');
    const worst = chains[maxTi]?.sol;
    const modeHint = !anyActive
      ? 'all legs offline'
      : worst && !Number.isFinite(worst.T)
        ? 'TAUT (increase chain length or ease weather)'
        : (worst?.mode || 'grounded / suspended');
    const massT = (sim.params.buoyMass / 1000).toFixed(0);
    const offN = sim.offCount();
    const statusArr = sim.chainStatus().map((s) => `${s.leg}:${s.on ? 'ON' : 'OFF'}`).join(' ');
    sum.innerHTML = `
      <div>Mode <b>${sim.mode}</b> · t = <b>${sim.t.toFixed(0)} s</b> · buoy <b>${massT} t</b> · draft <b>${env.draft.toFixed(2)} m</b> · excursion <b>${exc.toFixed(2)} m</b></div>
      <div>Restoring <b>F_X = ${force.Fx_kN.toFixed(1)} kN</b> · <b>F_Y = ${force.Fy_kN.toFixed(1)} kN</b> · |F| <b>${(Math.hypot(force.Fx, force.Fy) / 1000).toFixed(1)} kN</b></div>
      <div>Weather: wind <b>${(env.wind / 1000).toFixed(1)} kN</b> · current <b>${(env.current / 1000).toFixed(1)} kN</b> · wave drift <b>${(env.drift / 1000).toFixed(1)} kN</b></div>
      <div>Status array <b>${statusArr}</b>${offN ? ` · <b>${offN} in maintenance</b>` : ''} · governing <b>${modeHint}</b> · MBL use <b>${anyActive && Number.isFinite(maxT) ? Math.round(maxT / mblN * 100) + '%' : 'n/a'}</b></div>`;
  }
}
