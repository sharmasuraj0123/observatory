// Earth Lab panel: interior layer explorer plus the SPM mooring workbench.
// SPM layout and outputs follow the Single Point Mooring brief:
// touchdown point, catenary angle, stopper tension; all inputs live.

import { LAYERS, EXTRAS, EARTH_FACTS } from '../earth/earthdata.js';

// Grouped live inputs. Defaults live in MooringSim.params (12 m buoy, 30 m
// depth, 300 m stopper-pile, 315 m chain, 250 kg/m, six chains at 60°).
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
        <div class="spm-spec">
          <h3 class="spm-spec-title">Single Point Mooring</h3>
          <p>Floating buoy, fixed in location on <b>six mooring chains</b> leading radially
          outward, each <b>60°</b> apart from the centre SPM.</p>
          <p>Each chain: one end secured to a <b>pile at seabed</b> (equidistant from the SPM
          centre); the other end secured to the <b>SPM stopper on the surface</b>.</p>
          <p class="spm-spec-defaults">Defaults: buoy dia <b>12 m</b> · buoy weight <b>180 t</b> · sea depth <b>30 m</b> ·
          stopper-pile <b>300 m</b> · chain length <b>315 m</b> · chain weight <b>250 kg/m</b>.
          Weather: wind and sea. All inputs below are variable; the 3D scene runs in real time.</p>
        </div>

        <div class="section-title">Variable inputs</div>
        <div class="spm-params" id="spm-params"></div>

        <div class="kick-row eq-actions">
          <button class="btn tiny" id="spm-play">⏸ Pause</button>
          <button class="btn tiny" id="spm-reset">Reset buoy</button>
          <button class="btn tiny" id="spm-trace">Clear trace</button>
        </div>

        <div class="section-title">Required outputs (live)</div>
        <div class="spm-out-cards" id="spm-out-cards">
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
            <div class="spm-out-note">Angle at seabed touchpoint from horizontal (°). 0° when grounded (leaves seabed flat); pile angle when fully suspended</div>
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
        <p class="lab-note">TD pile = grounded length from the pile. TD centre = horizontal
        range from the SPM buoy centre to the lift-off. Stopper angle and tension are at the
        surface. Touchdown angle is at the seabed lift-off (0° when grounded). Buoy weight
        sets floating draft. Physics uses submerged chain weight (× 0.87 of air weight).
        <b>TAUT</b> means the span exceeds what the chain length allows.</p>
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

    this.buildSpmParams();

    this.playBtn = this.el.querySelector('#spm-play');
    this.playBtn.addEventListener('click', () => this.togglePause());
    this.el.querySelector('#spm-reset').addEventListener('click', () => {
      this.lab.sim.reset();
      this.lab.trace.clear();
    });
    this.el.querySelector('#spm-trace').addEventListener('click', () => this.lab.trace.clear());
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
          valEl.textContent = fmtVal(v);
        });
        this.paramEls[def.k] = { slider, valEl, def };
        box.appendChild(row);
      }
    }
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
    if (this.liveAcc < 0.2) return;
    this.liveAcc = 0;

    const sim = this.lab.sim;
    const chains = sim.lastChains;
    const env = sim.lastEnv;
    if (!chains || !env) return;

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

    const tbody = this.el.querySelector('#spm-table tbody');
    tbody.innerHTML = chains.map((c, i) => {
      const s = c.sol;
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
        <td>${s.touchdownFromPile.toFixed(1)} m</td>
        <td>${Number.isFinite(tdCenter) ? tdCenter.toFixed(1) + ' m' : 'n/a'}</td>
        <td>${s.angleDeg.toFixed(1)}°</td>
        <td>${tdAng.toFixed(1)}°</td>
        <td>${taut ? 'TAUT' : (s.T / 9806.65).toFixed(1) + ' t'}</td>
        <td>${mode}</td>
      </tr>`;
    }).join('');

    // Headline required outputs: report the governing (worst) chain for each
    const worst = chains[maxTi]?.sol;
    const tdEl = document.getElementById('spm-out-td');
    const tdCenterEl = document.getElementById('spm-out-td-center');
    const angEl = document.getElementById('spm-out-ang');
    const tdAngEl = document.getElementById('spm-out-td-ang');
    const tEl = document.getElementById('spm-out-T');
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

    const exc = Math.hypot(sim.buoy.x, sim.buoy.z);
    const sum = this.el.querySelector('#spm-summary');
    const modeHint = worst && !Number.isFinite(worst.T)
      ? 'TAUT (increase chain length or ease weather)'
      : (worst?.mode || 'grounded / suspended');
    const massT = (sim.params.buoyMass / 1000).toFixed(0);
    sum.innerHTML = `
      <div>Real-time sim <b>t = ${sim.t.toFixed(0)} s</b> · buoy <b>${massT} t</b> · supported <b>${((env.supportedKg || sim.params.buoyMass) / 1000).toFixed(0)} t</b> · draft <b>${env.draft.toFixed(2)} m</b> · excursion <b>${exc.toFixed(2)} m</b> · heave <b>${sim.buoy.heave.toFixed(2)} m</b></div>
      <div>Weather: wind <b>${(env.wind / 1000).toFixed(1)} kN</b> · current <b>${(env.current / 1000).toFixed(1)} kN</b> · wave drift <b>${(env.drift / 1000).toFixed(1)} kN</b></div>
      <div>Chain submerged weight <b>${(sim.submergedW() / 9.80665).toFixed(0)} kg/m</b> · governing mode <b>${modeHint}</b> · MBL use <b>${Number.isFinite(maxT) ? Math.round(maxT / mblN * 100) + '%' : 'TAUT'}</b></div>`;
  }
}
