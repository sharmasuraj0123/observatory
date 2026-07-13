// Gravity Lab panel: classical orbital presets + pedagogical quantum-gravity
// models, live force-law controls, and particle-by-particle orbital analysis.

import { QG_MODES } from '../gravity/quantum.js';

function fmt(x, digits = 3) {
  if (!Number.isFinite(x)) return 'n/a';
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e5 || a < 1e-2)) return x.toExponential(2);
  return x.toFixed(digits);
}

function fmtKm(km) {
  if (!Number.isFinite(km)) return 'n/a';
  if (Math.abs(km) >= 1e6) return `${(km / 1e6).toFixed(2)}M km`;
  if (Math.abs(km) >= AU_KM_LOCAL * 0.01) return `${(km / AU_KM_LOCAL).toFixed(3)} AU`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

function fmtPeriod(sec) {
  if (!Number.isFinite(sec) || sec === Infinity) return 'n/a';
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(2)} h`;
  if (sec < 86400 * 400) return `${(sec / 86400).toFixed(2)} d`;
  return `${(sec / (86400 * 365.25)).toFixed(2)} y`;
}

function fmtEnergy(e) {
  if (!Number.isFinite(e)) return 'n/a';
  return `${e.toExponential(3)} km²/s²`;
}

const AU_KM_LOCAL = 149597870.7;

const KIND_CLASS = {
  circular: 'grav-circ',
  elliptical: 'grav-ell',
  parabolic: 'grav-par',
  hyperbolic: 'grav-hyp',
};

export class GravityPanel {
  constructor(lab, hooks) {
    this.lab = lab;
    this.h = hooks;
    this.el = document.getElementById('gravity-panel');
    this.liveAcc = 0;
    this.sortKey = 'name';
    this.sortDir = 1;
    this.filter = 'tracers';
    this.build();
    lab.onSelect = () => this.renderDetail();
  }

  build() {
    this.el.innerHTML = `
      <div class="list-title">Gravity Lab</div>
      <p class="lab-note">Classical orbital mechanics and pedagogical quantum-gravity
      toys (bounce, running G, massive graviton, foam, Hawking, Schrödinger-Newton).
      Not a full theory of quantum gravity: effective models you can poke.</p>

      <div class="section-title">Classical gravity</div>
      <div class="preset-grid light-presets" id="grav-presets-classical"></div>

      <div class="section-title">Quantum gravity</div>
      <div class="preset-grid light-presets" id="grav-presets-quantum"></div>
      <div class="light-blurb" id="grav-blurb"></div>

      <div class="section-title">Parameters (live)</div>
      <div class="spm-params" id="grav-params"></div>

      <div class="kick-row eq-actions">
        <button class="btn tiny" id="grav-play">⏸ Pause</button>
        <button class="btn tiny" id="grav-reset">Reset</button>
        <button class="btn tiny" id="grav-reframe">Frame view</button>
      </div>
      <div class="setting-row" style="padding: 4px 18px 0;">
        <label class="setting" style="padding:0;"><input type="checkbox" id="grav-well" checked /> Potential well</label>
      </div>
      <div class="setting-row" style="padding: 0 18px;">
        <label class="setting" style="padding:0;"><input type="checkbox" id="grav-trails" checked /> Trails</label>
      </div>

      <div class="section-title">Ensemble</div>
      <div class="state-block" id="grav-summary"></div>
      <div id="grav-verify" class="light-verify hidden"></div>

      <div class="section-title">Particle-by-particle
        <span class="lab-hint" id="grav-count"></span>
      </div>
      <div class="light-filters">
        <button class="btn tiny" data-f="all">All</button>
        <button class="btn tiny active" data-f="tracers">Tracers</button>
        <button class="btn tiny" data-f="massive">Massive</button>
        <button class="btn tiny" data-f="selected">Selected</button>
      </div>
      <div class="light-table-wrap">
        <table class="spm-table light-table" id="grav-table">
          <thead>
            <tr>
              <th data-s="name">Body</th>
              <th data-s="r">r</th>
              <th data-s="v">v</th>
              <th data-s="e">e</th>
              <th data-s="kind">Kind</th>
              <th data-s="energy">ε</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="section-title">Selected body</div>
      <div class="light-detail" id="grav-detail">
        <p class="lab-note">Click a particle in the table or in the 3D view.</p>
      </div>
    `;

    this.fillPresetGrid('grav-presets-classical', 'classical');
    this.fillPresetGrid('grav-presets-quantum', 'quantum');

    this.playBtn = this.el.querySelector('#grav-play');
    this.playBtn.addEventListener('click', () => this.togglePause());
    this.el.querySelector('#grav-reset').addEventListener('click', () => {
      this.lab.reset();
      this.syncPlayBtn();
      this.renderAll();
    });
    this.el.querySelector('#grav-reframe').addEventListener('click', () => this.frameView());
    this.el.querySelector('#grav-well').addEventListener('change', (e) => {
      this.lab.setWellVisible(e.target.checked);
    });
    this.el.querySelector('#grav-trails').addEventListener('change', (e) => {
      this.lab.setTrailsVisible(e.target.checked);
    });

    this.el.querySelectorAll('.light-filters .btn').forEach((b) =>
      b.addEventListener('click', () => {
        this.filter = b.dataset.f;
        this.el.querySelectorAll('.light-filters .btn').forEach((x) =>
          x.classList.toggle('active', x === b));
        this.renderTable();
      }));

    this.el.querySelectorAll('#grav-table thead th').forEach((th) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const k = th.dataset.s;
        if (!k) return;
        if (this.sortKey === k) this.sortDir *= -1;
        else { this.sortKey = k; this.sortDir = 1; }
        this.renderTable();
      });
    });

    this.loadPreset(this.lab.preset.id);
  }

  fillPresetGrid(elId, family) {
    const grid = this.el.querySelector(`#${elId}`);
    for (const p of this.lab.listPresets()) {
      if ((p.family || 'classical') !== family) continue;
      const b = document.createElement('button');
      b.className = 'btn tiny';
      b.dataset.id = p.id;
      b.textContent = p.name;
      if (family === 'quantum') b.classList.add('qg-preset');
      b.addEventListener('click', () => this.loadPreset(p.id));
      grid.appendChild(b);
    }
  }

  loadPreset(id) {
    this.lab.loadPreset(id);
    this.el.querySelectorAll('#grav-presets-classical .btn, #grav-presets-quantum .btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    this.el.querySelector('#grav-blurb').textContent = this.lab.preset.blurb || '';
    // Schrödinger-Newton uses massive samples, not massless tracers
    if (id === 'qg-sn') {
      this.filter = 'massive';
      this.el.querySelectorAll('.light-filters .btn').forEach((x) =>
        x.classList.toggle('active', x.dataset.f === 'massive'));
    } else if (this.filter === 'massive' && (this.lab.preset.family || 'classical') === 'classical') {
      this.filter = 'tracers';
      this.el.querySelectorAll('.light-filters .btn').forEach((x) =>
        x.classList.toggle('active', x.dataset.f === 'tracers'));
    }
    this.buildParams();
    this.syncPlayBtn();
    this.frameView();
    this.renderAll();
  }

  buildParams() {
    const box = this.el.querySelector('#grav-params');
    box.innerHTML = '';
    const params = this.lab.preset.params || {};
    for (const [k, def] of Object.entries(params)) {
      const row = document.createElement('div');
      row.className = 'spm-param';
      const val = this.lab.paramValues[k];
      const unit = def.unit ? ` ${def.unit}` : '';
      row.innerHTML = `
        <div class="setting-row"><span>${def.label}</span><span class="spm-val">${fmtParam(val)}${unit}</span></div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" />`;
      const slider = row.querySelector('input');
      const valEl = row.querySelector('.spm-val');
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        this.lab.setParam(k, v);
        valEl.textContent = `${fmtParam(v)}${unit}`;
        requestAnimationFrame(() => {
          if (this.lab.dirty) this.lab.rebuild();
          this.syncPlayBtn();
          this.renderAll();
        });
      });
      box.appendChild(row);
    }
    if (!Object.keys(params).length) {
      box.innerHTML = '<p class="lab-note" style="padding:0;">No live parameters.</p>';
    }
  }

  frameView() {
    const cam = this.lab.preset.camera;
    if (this.h.frameView && cam) this.h.frameView(cam);
  }

  togglePause() {
    if (this.lab.sceneCfg && this.lab.sceneCfg.frozen) return;
    this.lab.sim.playing = !this.lab.sim.playing;
    this.syncPlayBtn();
  }

  syncPlayBtn() {
    const frozen = this.lab.sceneCfg && this.lab.sceneCfg.frozen;
    if (frozen) {
      this.playBtn.textContent = 'Frozen';
      this.playBtn.disabled = true;
      return;
    }
    this.playBtn.disabled = false;
    this.playBtn.textContent = this.lab.sim.playing ? '⏸ Pause' : '▶ Play';
  }

  filteredRows() {
    let rows = this.lab.analyses();
    if (this.filter === 'tracers') rows = rows.filter((r) => r.body.test);
    else if (this.filter === 'massive') rows = rows.filter((r) => !r.body.test);
    else if (this.filter === 'selected') {
      rows = rows.filter((r) => r.body.id === this.lab.selectedId);
    }
    const k = this.sortKey;
    const d = this.sortDir;
    rows.sort((a, b) => {
      const av = sortVal(a, k);
      const bv = sortVal(b, k);
      if (typeof av === 'string') return d * String(av).localeCompare(String(bv));
      return d * ((av ?? 0) - (bv ?? 0));
    });
    return rows;
  }

  renderAll() {
    if (this.lab.dirty) this.lab.rebuild();
    this.renderSummary();
    this.renderTable();
    this.renderDetail();
  }

  renderSummary() {
    const s = this.lab.summary();
    const el = this.el.querySelector('#grav-summary');
    const ver = this.el.querySelector('#grav-verify');
    const p = this.lab.sim.primary();
    const mode = s.qgMode || 'none';
    const info = QG_MODES[mode] || QG_MODES.none;
    const qgLine = mode === 'none'
      ? `Force law <b>F ∝ 1/r<sup>${s.exponent.toFixed(2)}</sup></b> · primary <b>${p ? p.name : 'n/a'}</b>`
      : `QG model <b>${info.name}</b> · ${info.short}<br>primary <b>${p ? p.name : 'n/a'}</b>${hawkingMassLine(this.lab.sim)}`;

    el.innerHTML = `
      <div>t = <b>${fmtPeriod(s.t).replace('n/a', fmt(s.t, 1) + ' s')}</b> · tracers <b>${s.tracers}</b> · bound <b>${s.bound}</b> · escaping <b>${s.escape}</b></div>
      <div>${qgLine}</div>
      <div>G = <b>6.674e-20</b> km³/(kg·s²) · leapfrog kick-drift-kick</div>`;

    const v = s.verify;
    if (v) {
      ver.classList.remove('hidden');
      ver.innerHTML = `<span class="verify-dot ${v.ok ? 'ok' : 'bad'}"></span>${v.label}: <b>${v.value}</b>`;
    } else {
      ver.classList.add('hidden');
    }
    this.el.querySelector('#grav-count').textContent = `${s.tracers} live`;
  }

  renderTable() {
    const tbody = this.el.querySelector('#grav-table tbody');
    const rows = this.filteredRows();
    const sel = this.lab.selectedId;
    tbody.innerHTML = rows.map(({ body, report }) => {
      const el = report.elements;
      const kind = report.isPrimary ? 'primary' : (el ? el.kind : 'n/a');
      const cls = [
        body.id === sel ? 'ray-sel' : '',
        KIND_CLASS[kind] || '',
      ].filter(Boolean).join(' ');
      const hex = '#' + (body.color >>> 0).toString(16).padStart(6, '0');
      return `<tr class="${cls}" data-id="${body.id}">
        <td><span class="λ-swatch" style="background:${hex}"></span>${body.name}</td>
        <td>${report.isPrimary ? 'n/a' : fmtKm(report.r)}</td>
        <td>${fmt(report.v, 2)}</td>
        <td>${el ? fmt(el.e, 3) : 'n/a'}</td>
        <td>${kind}</td>
        <td>${el ? fmt(el.energy, 2) : 'n/a'}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('tr').forEach((tr) => {
      tr.addEventListener('click', () => {
        this.lab.selectBody(tr.dataset.id);
        this.renderTable();
        this.renderDetail();
      });
    });
  }

  renderDetail() {
    const box = this.el.querySelector('#grav-detail');
    const body = this.lab.getSelected();
    if (!body) {
      box.innerHTML = '<p class="lab-note">Click a particle in the table or in the 3D view.</p>';
      return;
    }
    const report = this.lab.sim.analyze(body);
    const hex = '#' + (body.color >>> 0).toString(16).padStart(6, '0');

    if (report.destroyed) {
      box.innerHTML = `<p class="lab-note">Destroyed: absorbed by ${report.absorbedBy || 'a body'}.</p>`;
      return;
    }

    if (report.isPrimary) {
      box.innerHTML = `
        <div class="ray-hero">
          <span class="λ-swatch lg" style="background:${hex}"></span>
          <div>
            <div class="ray-hero-title">${body.name}</div>
            <div class="ray-hero-sub">Primary · mass ${fmt(body.mass, 3)} kg · radius ${fmtKm(body.radius)}</div>
          </div>
        </div>
        <div class="stat-grid" style="margin-top:8px;">
          <div class="stat-k">Role</div><div class="stat-v">Central attractor</div>
          <div class="stat-k">Fixed</div><div class="stat-v">${body.fixed ? 'yes' : 'no'}</div>
          <div class="stat-k">μ = GM</div><div class="stat-v">${fmt(this.lab.sim.muPrimary())} km³/s²</div>
          <div class="stat-k">QG mode</div><div class="stat-v">${report.qgMode || 'none'}</div>
        </div>`;
      return;
    }

    const el = report.elements;
    const newtonNote = report.newtonian
      ? 'Elements use the Newtonian two-body map (valid for n = 2).'
      : report.qgMode && report.qgMode !== 'none'
        ? `QG mode "${report.qgLabel}": classical a, e, period are indicative only.`
        : `n = ${report.exponent.toFixed(2)}: classical a, e, period are indicative only (Bertrand: closed orbits need n = 2 or Hooke).`;

    box.innerHTML = `
      <div class="ray-hero">
        <span class="λ-swatch lg" style="background:${hex}"></span>
        <div>
          <div class="ray-hero-title">${body.name}</div>
          <div class="ray-hero-sub">${body.test ? 'Massless tracer' : 'Massive body'} · ${el.kind}</div>
        </div>
      </div>
      <div class="stat-grid" style="margin: 8px 0 10px;">
        <div class="stat-k">Radius r</div><div class="stat-v">${fmtKm(el.r)}</div>
        <div class="stat-k">Speed v</div><div class="stat-v">${fmt(el.v, 3)} km/s</div>
        <div class="stat-k">Circular v</div><div class="stat-v">${fmt(el.circ, 3)} km/s</div>
        <div class="stat-k">Escape v</div><div class="stat-v">${fmt(el.escape, 3)} km/s</div>
        <div class="stat-k">Specific energy ε</div><div class="stat-v">${fmtEnergy(el.energy)}</div>
        <div class="stat-k">Specific h</div><div class="stat-v">${fmt(el.h)} km²/s</div>
        <div class="stat-k">Eccentricity e</div><div class="stat-v">${fmt(el.e, 4)}</div>
        <div class="stat-k">Semi-major a</div><div class="stat-v">${fmtKm(el.a)}</div>
        <div class="stat-k">Periapsis rp</div><div class="stat-v">${fmtKm(el.rp)}</div>
        <div class="stat-k">Apoapsis ra</div><div class="stat-v">${fmtKm(el.ra)}</div>
        <div class="stat-k">Period</div><div class="stat-v">${fmtPeriod(el.period)}</div>
        <div class="stat-k">Flight-path angle</div><div class="stat-v">${fmt(el.flightPathDeg, 2)}°</div>
        <div class="stat-k">|a| (accel)</div><div class="stat-v">${fmt(report.accelMs2)} m/s²</div>
        <div class="stat-k">Force (ref)</div><div class="stat-v">${fmt(report.forceN)} N</div>
      </div>
      <p class="lab-note">${newtonNote}</p>
    `;
  }

  tick() {
    if (this.lab.dirty) {
      this.lab.rebuild();
      this.syncPlayBtn();
    }
    this.liveAcc += 0.016;
    if (this.liveAcc > 0.25) {
      this.liveAcc = 0;
      this.renderSummary();
      this.renderTable();
      if (this.lab.selectedId) this.renderDetail();
    }
  }
}

function fmtParam(v) {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || (a < 1e-2 && a > 0))) return v.toExponential(2);
  if (Number.isInteger(v)) return String(v);
  return String(v);
}

function hawkingMassLine(sim) {
  if (!sim || sim.qg?.mode !== 'hawking' || !sim.initialMass) return '';
  const p = sim.primary();
  if (!p) return '';
  const frac = (p.mass / sim.initialMass) * 100;
  return `<br>M/M₀ = <b>${frac.toFixed(1)}%</b>`;
}

function sortVal(row, key) {
  const { body, report } = row;
  if (key === 'name') return body.name;
  if (key === 'r') return report.r || 0;
  if (key === 'v') return report.v || 0;
  if (key === 'e') return report.elements ? report.elements.e : -1;
  if (key === 'kind') return report.elements ? report.elements.kind : (report.isPrimary ? 'primary' : '');
  if (key === 'energy') return report.elements ? report.elements.energy : 0;
  return 0;
}
