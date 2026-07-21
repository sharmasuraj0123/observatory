// Light Lab panel: preset picker, live optical parameters, and a detailed
// ray-by-ray analysis table with a per-ray event inspector.

import { makePanelDraggable } from './dragPanel.js';
import { criticalAngleDeg, indexOf, MATERIALS } from '../light/optics.js';

function fmtAngle(a) {
  if (a == null || !Number.isFinite(a)) return 'n/a';
  return `${a.toFixed(2)}°`;
}

function fmtI(i) {
  if (!Number.isFinite(i)) return 'n/a';
  if (i >= 0.01) return i.toFixed(3);
  return i.toExponential(2);
}

function kindBadge(kind) {
  const map = {
    refract: ['n', 'Refract'],
    reflect: ['r', 'Reflect'],
    TIR: ['T', 'TIR'],
    absorb: ['d', 'Detect'],
  };
  const [sym, label] = map[kind] || ['·', kind];
  return `<span class="ray-kind ray-kind-${kind}" title="${label}">${sym}</span>`;
}

export class LightPanel {
  constructor(lab, hooks) {
    this.lab = lab;
    this.h = hooks; // { frameView(cam) }
    this.el = document.getElementById('light-panel');
    this.liveAcc = 0;
    this.sortKey = 'id';
    this.sortDir = 1;
    this.filter = 'all'; // all | detected | tir | selected
    this.build();
    makePanelDraggable(this.el, { handleSelector: '.list-title', storageKey: 'observatory-light-panel-pos' });
    lab.onSelect = () => this.renderDetail();
  }

  build() {
    this.el.innerHTML = `
      <div class="list-title">Light Lab</div>
      <p class="lab-note">Geometric optics with Cauchy dispersion and Fresnel
      intensities. Every ray is traced bounce-by-bounce; click a row or a ray in
      the scene for the full event log.</p>

      <div class="section-title">Presets</div>
      <div class="preset-grid light-presets" id="light-presets"></div>

      <div class="light-blurb" id="light-blurb"></div>

      <div class="section-title">Parameters (live)</div>
      <div class="spm-params" id="light-params"></div>

      <div class="kick-row eq-actions">
        <button class="btn tiny" id="light-reframe">Frame view</button>
        <button class="btn tiny" id="light-clear">Clear selection</button>
      </div>

      <div class="section-title">Ensemble</div>
      <div class="state-block" id="light-summary"></div>
      <div id="light-verify" class="light-verify hidden"></div>

      <div class="section-title">Ray-by-ray
        <span class="lab-hint" id="light-ray-count"></span>
      </div>
      <div class="light-filters">
        <button class="btn tiny active" data-f="all">All</button>
        <button class="btn tiny" data-f="detected">Detected</button>
        <button class="btn tiny" data-f="tir">TIR</button>
        <button class="btn tiny" data-f="selected">Selected</button>
      </div>
      <div class="light-table-wrap">
        <table class="spm-table light-table" id="light-table">
          <thead>
            <tr>
              <th data-s="id">#</th>
              <th data-s="lambdaNm">λ</th>
              <th data-s="angleDeg">θ₀</th>
              <th data-s="bounces">Hits</th>
              <th data-s="finalI">I</th>
              <th data-s="oplMm">OPL</th>
              <th data-s="terminated">End</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="section-title">Selected ray</div>
      <div class="light-detail" id="light-detail">
        <p class="lab-note">Click a ray in the table or in the 3D view.</p>
      </div>
    `;

    // presets
    const grid = this.el.querySelector('#light-presets');
    for (const p of this.lab.listPresets()) {
      const b = document.createElement('button');
      b.className = 'btn tiny';
      b.dataset.id = p.id;
      b.textContent = p.name;
      b.addEventListener('click', () => this.loadPreset(p.id));
      grid.appendChild(b);
    }

    this.el.querySelector('#light-reframe').addEventListener('click', () => this.frameView());
    this.el.querySelector('#light-clear').addEventListener('click', () => {
      this.lab.selectRay(null);
      this.renderTable();
      this.renderDetail();
    });

    this.el.querySelectorAll('.light-filters .btn').forEach((b) =>
      b.addEventListener('click', () => {
        this.filter = b.dataset.f;
        this.el.querySelectorAll('.light-filters .btn').forEach((x) =>
          x.classList.toggle('active', x === b));
        this.renderTable();
      }));

    this.el.querySelectorAll('#light-table thead th').forEach((th) => {
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

  loadPreset(id) {
    this.lab.loadPreset(id);
    this.el.querySelectorAll('#light-presets .btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.id === id));
    const p = this.lab.preset;
    this.el.querySelector('#light-blurb').textContent = p.blurb || '';
    this.buildParams();
    this.frameView();
    this.renderAll();
  }

  buildParams() {
    const box = this.el.querySelector('#light-params');
    box.innerHTML = '';
    const params = this.lab.preset.params || {};
    this.paramEls = {};
    for (const [k, def] of Object.entries(params)) {
      const row = document.createElement('div');
      row.className = 'spm-param';
      const val = this.lab.paramValues[k];
      row.innerHTML = `
        <div class="setting-row"><span>${def.label}</span><span class="spm-val">${val}${def.unit ? ' ' + def.unit : ''}</span></div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" />`;
      const slider = row.querySelector('input');
      const valEl = row.querySelector('.spm-val');
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        this.lab.setParam(k, v);
        valEl.textContent = `${v}${def.unit ? ' ' + def.unit : ''}`;
        // rebuild happens on next update; refresh UI after a tick
        requestAnimationFrame(() => this.renderAll());
      });
      this.paramEls[k] = { slider, valEl, def };
      box.appendChild(row);
    }
    if (!Object.keys(params).length) {
      box.innerHTML = '<p class="lab-note" style="padding:0;">No live parameters for this preset.</p>';
    }
  }

  frameView() {
    const cam = this.lab.preset.camera;
    if (this.h.frameView && cam) this.h.frameView(cam);
  }

  filteredRays() {
    let rays = this.lab.rays.slice();
    if (this.filter === 'detected') rays = rays.filter((r) => r.terminated === 'detected');
    else if (this.filter === 'tir') rays = rays.filter((r) => r.events.some((e) => e.kind === 'TIR'));
    else if (this.filter === 'selected') {
      rays = rays.filter((r) => r.id === this.lab.selectedId);
    }
    const k = this.sortKey;
    const d = this.sortDir;
    rays.sort((a, b) => {
      const av = a[k], bv = b[k];
      if (typeof av === 'string') return d * String(av).localeCompare(String(bv));
      return d * ((av ?? 0) - (bv ?? 0));
    });
    return rays;
  }

  renderAll() {
    if (this.lab.dirty) this.lab.rebuild();
    this.renderSummary();
    this.renderTable();
    this.renderDetail();
  }

  renderSummary() {
    const s = this.lab.summary();
    const el = this.el.querySelector('#light-summary');
    const ver = this.el.querySelector('#light-verify');
    if (!s) { el.innerHTML = ''; return; }

    // material index at 550 nm for context
    const ambient = this.lab.sceneCfg?.ambient || this.lab.preset.ambient || MATERIALS.air;
    const nAir = indexOf(MATERIALS.air, 550);
    const nBk7 = indexOf(MATERIALS.bk7, 550);
    const tc = criticalAngleDeg(nBk7, nAir);

    el.innerHTML = `
      <div>Rays <b>${s.count}</b> · wavelengths <b>${s.wavelengths}</b> · detected <b>${s.detected}</b> · TIR <b>${s.tir}</b></div>
      <div>Mean OPL <b>${s.meanOPL.toFixed(2)} mm</b> · mean ToF <b>${(s.meanOPL / 299.792458).toFixed(3)} ns</b></div>
      <div>BK7 n(550) <b>${nBk7.toFixed(4)}</b> · θc(BK7→air) <b>${tc.toFixed(2)}°</b> · max residual I <b>${fmtI(s.maxI)}</b></div>`;

    if (s.verify) {
      ver.classList.remove('hidden');
      ver.innerHTML = `<span class="verify-dot ${s.verify.ok ? 'ok' : 'bad'}"></span>
        ${s.verify.label}: <b>${s.verify.value}</b>`;
    } else {
      ver.classList.add('hidden');
    }
    this.el.querySelector('#light-ray-count').textContent = `${s.count} traced`;
  }

  renderTable() {
    const tbody = this.el.querySelector('#light-table tbody');
    const rays = this.filteredRays();
    const sel = this.lab.selectedId;
    tbody.innerHTML = rays.map((r) => {
      const hex = '#' + r.color.hex.toString(16).padStart(6, '0');
      const end = r.terminated === 'detected' ? 'hit'
        : r.terminated === 'absorbed' ? 'abs' : 'out';
      const cls = [
        r.id === sel ? 'ray-sel' : '',
        r.events.some((e) => e.kind === 'TIR') ? 'spm-warm' : '',
        r.finalI < 0.05 ? 'ray-dim' : '',
      ].filter(Boolean).join(' ');
      return `<tr class="${cls}" data-id="${r.id}">
        <td>${r.id}</td>
        <td><span class="λ-swatch" style="background:${hex}"></span>${r.lambdaNm.toFixed(0)}</td>
        <td>${r.angleDeg.toFixed(1)}°</td>
        <td>${r.bounces}</td>
        <td>${fmtI(r.finalI)}</td>
        <td>${r.oplMm.toFixed(1)}</td>
        <td>${end}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('tr').forEach((tr) => {
      tr.addEventListener('click', () => {
        const id = parseInt(tr.dataset.id, 10);
        this.lab.selectRay(id);
        this.renderTable();
        this.renderDetail();
      });
    });
  }

  renderDetail() {
    const box = this.el.querySelector('#light-detail');
    const r = this.lab.getSelected();
    if (!r) {
      box.innerHTML = '<p class="lab-note">Click a ray in the table or in the 3D view.</p>';
      return;
    }
    const hex = '#' + r.color.hex.toString(16).padStart(6, '0');
    const eventsHtml = r.events.map((e, i) => {
      const rows = [];
      rows.push(`<div class="stat-k">Interface</div><div class="stat-v">${e.label}</div>`);
      rows.push(`<div class="stat-k">θᵢ</div><div class="stat-v">${fmtAngle(e.thetaIDeg)}</div>`);
      if (e.thetaTDeg != null) {
        rows.push(`<div class="stat-k">θₜ</div><div class="stat-v">${fmtAngle(e.thetaTDeg)}</div>`);
      }
      if (e.criticalDeg != null) {
        rows.push(`<div class="stat-k">θc</div><div class="stat-v">${fmtAngle(e.criticalDeg)}</div>`);
      }
      rows.push(`<div class="stat-k">n₁ → n₂</div><div class="stat-v">${e.n1.toFixed(4)} → ${e.n2.toFixed(4)}</div>`);
      rows.push(`<div class="stat-k">Fresnel R / T</div><div class="stat-v">${fmtI(e.R)} / ${fmtI(e.T)}</div>`);
      rows.push(`<div class="stat-k">Intensity</div><div class="stat-v">${fmtI(e.intensityIn)} → ${fmtI(e.intensityOut)}</div>`);
      rows.push(`<div class="stat-k">OPL · ToF</div><div class="stat-v">${e.oplMm.toFixed(2)} mm · ${e.tofNs.toFixed(4)} ns</div>`);
      if (e.snellCheck != null) {
        rows.push(`<div class="stat-k">Snell residual</div><div class="stat-v">${Math.abs(e.snellCheck).toExponential(2)}</div>`);
      }
      rows.push(`<div class="stat-k">Hit at</div><div class="stat-v">(${e.x.toFixed(2)}, ${e.y.toFixed(2)}) mm</div>`);
      return `<div class="ray-event">
        <div class="ray-event-head">${kindBadge(e.kind)} <b>#${i + 1} ${e.kind}</b></div>
        <div class="stat-grid ray-event-grid">${rows.join('')}</div>
      </div>`;
    }).join('');

    box.innerHTML = `
      <div class="ray-hero">
        <span class="λ-swatch lg" style="background:${hex}"></span>
        <div>
          <div class="ray-hero-title">Ray ${r.id} · ${r.lambdaNm.toFixed(0)} nm</div>
          <div class="ray-hero-sub">launch ${r.angleDeg.toFixed(2)}° · y₀ ${(r.launchY ?? 0).toFixed(2)} mm · ${r.bounces} interactions · ${r.terminated}</div>
        </div>
      </div>
      <div class="stat-grid" style="margin: 8px 0 12px;">
        <div class="stat-k">Final intensity</div><div class="stat-v">${fmtI(r.finalI)}</div>
        <div class="stat-k">Optical path</div><div class="stat-v">${r.oplMm.toFixed(3)} mm</div>
        <div class="stat-k">Time of flight</div><div class="stat-v">${r.tofNs.toFixed(4)} ns</div>
        <div class="stat-k">Vacuum ToF equiv.</div><div class="stat-v">${(r.oplMm / 299.792458).toFixed(4)} ns</div>
      </div>
      <div class="section-title" style="padding-left:0;">Event log</div>
      ${eventsHtml || '<p class="lab-note">No interactions (ray escaped).</p>'}
    `;
  }

  tick() {
    // rebuild can happen from sliders; keep summary fresh cheaply
    if (this.lab.dirty) {
      this.lab.rebuild();
      this.renderAll();
    }
  }
}
