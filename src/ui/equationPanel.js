// Equation Lab editor panel: presets, type switching, live expression editing
// with inline errors, parameter sliders that morph the system while it runs,
// motion controls and a live state readout.

import { makePanelDraggable } from './dragPanel.js';
import { MATH_PRESETS, CUSTOM_TEMPLATE } from '../math/presets.js';
import { EXPR_HELP } from '../math/expr.js';
import { parseDataset, fitDataset, SAMPLE_DATA } from '../math/datafit.js';

const TYPE_LABELS = {
  parametric: 'Parametric',
  ode: 'Velocity field',
  force: 'Force field',
  surface: 'Surface',
};

const EXPR_ROWS = {
  parametric: [['x', 'x(t) ='], ['y', 'y(t) ='], ['z', 'z(t) =']],
  ode: [['x', "x' ="], ['y', "y' ="], ['z', "z' ="]],
  force: [['x', 'ax ='], ['y', 'ay ='], ['z', 'az =']],
  surface: [['z', 'z(x, y, t) =']],
};

export class EquationPanel {
  constructor(lab, hooks) {
    this.lab = lab;
    this.h = hooks; // { frameView(cameraCfg), followParticle(), releaseFollow() }
    this.el = document.getElementById('equation-panel');
    this.cfg = null;
    this.debounce = null;
    this.liveAcc = 0;
    this.build();
    makePanelDraggable(this.el, { handleSelector: '.list-title', storageKey: 'observatory-equation-panel-pos' });
    // no camera framing at construction time: the app may still be showing
    // the solar tab, and flying its camera to math coordinates parks it
    // inside the Sun
    this.loadPreset(MATH_PRESETS[0], { frame: false });
  }

  build() {
    this.el.innerHTML = `
      <div class="list-title">Equation Lab</div>
      <p class="lab-note">Motion through space + time from any equation. Trails fade backward
      through the fourth dimension; drag the parameters while it runs.</p>
      <div class="section-title">Presets</div>
      <div class="preset-grid eq-presets"></div>

      <details class="eq-data">
        <summary class="section-title">Data fit: plot a dataset, guess its equation</summary>
        <p class="lab-note">Paste rows of numbers ([t,] x [, y [, z]], separated by spaces or
        commas; a header line is skipped). The points are plotted colored from early (blue)
        to late (amber), a tracer replays the path over time, and Fit searches small models
        (lines, polynomials, sinusoids, damped sinusoids, exponentials) per axis.
        <a href="#" id="eq-data-sample">Insert example</a></p>
        <textarea id="eq-data-text" spellcheck="false" placeholder="0.0   6.00   0.00\n0.2   5.87   1.19\n0.4   5.49   2.33\n..."></textarea>
        <div class="eq-data-row">
          <select id="eq-data-format">
            <option value="auto">Auto-detect columns</option>
            <option value="txyz">t x y z</option>
            <option value="txy">t x y</option>
            <option value="tx">t x</option>
            <option value="xyz">x y z</option>
            <option value="xy">x y</option>
          </select>
        </div>
        <div class="kick-row eq-data-actions">
          <button class="btn tiny" id="eq-data-plot">Plot data</button>
          <button class="btn tiny" id="eq-data-fit">Fit + guess</button>
          <button class="btn tiny" id="eq-data-use" disabled>Use fit</button>
          <button class="btn tiny" id="eq-data-clear">Clear</button>
        </div>
        <div class="state-block" id="eq-fit-result"></div>
      </details>

      <details class="eq-history" open>
        <summary class="section-title">Version history</summary>
        <p class="lab-note">Commit captures the whole lab state (equation, parameters, layers,
        dataset, camera) with a thumbnail, chained to its parent like git. Checkout restores a
        version exactly. History persists in this browser.</p>
        <div class="eq-commit-row">
          <input id="eq-commit-msg" spellcheck="false" placeholder="Commit message (optional)" />
          <button class="btn tiny primary" id="eq-commit">Commit</button>
        </div>
        <div class="eq-history-list"></div>
      </details>

      <div class="section-title">Equation type</div>
      <div class="seg eq-types"></div>

      <div class="eq-exprs"></div>
      <div class="eq-error hidden"></div>

      <div class="section-title">Superposition</div>
      <p class="lab-note">Freeze the current equation as a layer, then load or write another.
      Active layers of the same type add together: positions for parametric curves,
      fields for velocity / force systems, heights for surfaces. Weights scale each
      layer live; faint markers trace parametric components.</p>
      <div class="kick-row eq-stack-actions">
        <button class="btn tiny" id="eq-stack-add">+ Add current as layer</button>
        <button class="btn tiny" id="eq-stack-clear">Clear layers</button>
      </div>
      <div class="eq-stack-list"></div>

      <div class="section-title">Parameters</div>
      <div class="eq-params"></div>

      <div class="section-title">Motion</div>
      <div class="setting-slider">
        <div class="setting-row"><span>Time speed</span><span id="eq-speed-val"></span></div>
        <input type="range" id="eq-speed" min="-1.2" max="1.2" step="0.01" value="0" />
      </div>
      <div class="setting-slider eq-particle-controls">
        <div class="setting-row"><span>Particles</span><span id="eq-n-val"></span></div>
        <input type="range" id="eq-n" min="1" max="200" step="1" />
        <div class="setting-row"><span>Start spread</span><span id="eq-spread-val"></span></div>
        <input type="range" id="eq-spread" min="0" max="10" step="0.1" />
        <div class="setting-row"><span>Particle size</span><span id="eq-size-val"></span></div>
        <input type="range" id="eq-size" min="0.1" max="2.5" step="0.05" />
        <label class="setting eq-labels-toggle"><input type="checkbox" id="eq-labels" checked /> Particle labels (P1, P2, ...) - click one to follow it</label>
      </div>

      <div class="kick-row eq-actions">
        <button class="btn tiny" id="eq-play">⏸ Pause</button>
        <button class="btn tiny" id="eq-reset">Restart</button>
        <button class="btn tiny" id="eq-follow">Follow</button>
        <button class="btn tiny" id="eq-frame">Frame</button>
      </div>

      <div class="state-block" id="eq-state"></div>
      <p class="lab-note eq-desc"></p>
      <p class="lab-note eq-help">${EXPR_HELP}</p>`;

    // presets
    const grid = this.el.querySelector('.eq-presets');
    for (const p of [...MATH_PRESETS, CUSTOM_TEMPLATE]) {
      const b = document.createElement('button');
      b.className = 'btn tiny';
      b.textContent = p.name;
      b.dataset.preset = p.id;
      b.addEventListener('click', () => this.loadPreset(p));
      grid.appendChild(b);
    }

    // type switcher
    const types = this.el.querySelector('.eq-types');
    for (const [type, label] of Object.entries(TYPE_LABELS)) {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.type = type;
      b.addEventListener('click', () => this.switchType(type));
      types.appendChild(b);
    }

    // motion controls
    this.speedSlider = this.el.querySelector('#eq-speed');
    this.speedVal = this.el.querySelector('#eq-speed-val');
    this.speedSlider.addEventListener('input', () => {
      this.lab.speedMul = 10 ** parseFloat(this.speedSlider.value);
      this.speedVal.textContent = `× ${this.lab.speedMul.toFixed(2)}`;
    });
    this.nSlider = this.el.querySelector('#eq-n');
    this.nVal = this.el.querySelector('#eq-n-val');
    this.nSlider.addEventListener('input', () => {
      this.cfg.particles = parseInt(this.nSlider.value, 10);
      this.nVal.textContent = this.cfg.particles;
      this.lab.resetParticles();
    });
    this.spreadSlider = this.el.querySelector('#eq-spread');
    this.spreadVal = this.el.querySelector('#eq-spread-val');
    this.spreadSlider.addEventListener('input', () => {
      this.cfg.spread = parseFloat(this.spreadSlider.value);
      this.spreadVal.textContent = this.cfg.spread.toFixed(1);
      this.lab.resetParticles();
    });
    this.sizeSlider = this.el.querySelector('#eq-size');
    this.sizeVal = this.el.querySelector('#eq-size-val');
    this.sizeSlider.value = this.lab.particleSize;
    this.sizeVal.textContent = this.lab.particleSize.toFixed(2);
    this.sizeSlider.addEventListener('input', () => {
      const s = parseFloat(this.sizeSlider.value);
      this.lab.setParticleSize(s);
      this.sizeVal.textContent = s.toFixed(2);
    });
    this.el.querySelector('#eq-labels').addEventListener('change', (e) => {
      this.lab.setLabelsOn(e.target.checked);
    });

    this.playBtn = this.el.querySelector('#eq-play');
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.el.querySelector('#eq-reset').addEventListener('click', () => {
      this.lab.tau = 0;
      this.lab.resetParticles();
    });
    this.el.querySelector('#eq-follow').addEventListener('click', () => this.h.followParticle());
    this.el.querySelector('#eq-frame').addEventListener('click', () => {
      this.h.frameView(this.cfg.camera);
    });

    this.el.querySelector('#eq-stack-add').addEventListener('click', () => this.addCurrentLayer());
    this.el.querySelector('#eq-stack-clear').addEventListener('click', () => {
      this.lab.clearLayers();
      this.renderStack();
    });

    this.buildDataFit();
    this.buildHistory();
    this.buildTimebar();
  }

  // ---------------- version history (git-style commits) ----------------

  buildHistory() {
    this.historyList = this.el.querySelector('.eq-history-list');
    this.commitMsg = this.el.querySelector('#eq-commit-msg');
    this.el.querySelector('#eq-commit').addEventListener('click', () => this.commit());
    this.commitMsg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.commit();
      e.stopPropagation();
    });

    this.commits = [];
    this.headId = null;
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        this.commits = saved.commits || [];
        this.headId = saved.head || null;
      }
    } catch { /* corrupted or unavailable storage starts fresh */ }
    this.renderHistory();
  }

  serializeState() {
    const cfg = this.cfg;
    return {
      cfg: {
        name: cfg.name, type: cfg.type,
        exprs: { ...cfg.exprs },
        params: Object.fromEntries(Object.entries(cfg.params || {}).map(([k, p]) => [k, { ...p }])),
        particles: cfg.particles, spread: cfg.spread, velJitter: cfg.velJitter,
        speed: cfg.speed, scale: cfg.scale, offset: cfg.offset,
        chainOffset: cfg.chainOffset, range: cfg.range,
        ic: { ...(cfg.ic || {}) },
        description: cfg.description,
      },
      layers: this.lab.layers.map((L) => ({ ...L.src, weight: L.weight })),
      particleSize: this.lab.particleSize,
      speedMul: this.lab.speedMul,
      direction: this.lab.direction,
      tau: this.lab.tau,
      data: this.lastParsed
        ? { pts: this.lastParsed.pts.slice(0, 2000), mapping: this.lastParsed.mapping, axes: this.lastParsed.axes }
        : null,
      camera: this.h.getCamera ? this.h.getCamera() : null,
    };
  }

  commit() {
    if (!this.lab.compiled) return;
    const state = this.serializeState();
    const msg = this.commitMsg.value.trim() || `${this.cfg.name} · ${this.cfg.type}`;
    const id = tinyHash(JSON.stringify(state) + Date.now());
    const entry = {
      id,
      parent: this.headId,
      msg,
      time: Date.now(),
      state,
      thumb: this.h.captureThumb ? this.h.captureThumb() : null,
    };
    this.commits.unshift(entry);
    while (this.commits.length > 40) this.commits.pop();
    this.headId = id;
    this.commitMsg.value = '';
    this.saveHistory();
    this.renderHistory();
  }

  saveHistory() {
    const payload = { head: this.headId, commits: this.commits };
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(payload));
    } catch {
      // storage quota: shed oldest commits, then thumbnails, before giving up
      try {
        payload.commits = payload.commits.slice(0, 15);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(payload));
      } catch {
        payload.commits = payload.commits.map((c) => ({ ...c, thumb: null }));
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(payload)); } catch { /* offline history only */ }
      }
    }
  }

  checkout(id) {
    const c = this.commits.find((x) => x.id === id);
    if (!c) return;
    const st = c.state;

    this.lab.clearLayers();
    this.lab.clearDataset();
    this.lastParsed = null;
    this.lastFit = null;
    this.useFitBtn.disabled = true;

    clearTimeout(this.debounce);
    this.cfg = {
      ...st.cfg,
      exprs: { ...st.cfg.exprs },
      params: Object.fromEntries(Object.entries(st.cfg.params || {}).map(([k, p]) => [k, { ...p }])),
      ic: { ...(st.cfg.ic || {}) },
      id: 'custom',
    };
    try {
      this.lab.applyConfig(this.cfg);
    } catch (err) {
      this.showError(`Checkout failed: ${err.message}`);
      return;
    }
    for (const src of st.layers || []) {
      try {
        const L = this.lab.addLayer(src);
        L.weight = src.weight !== undefined ? src.weight : 1;
      } catch { /* skip a layer that no longer compiles */ }
    }
    if (st.data && st.data.pts && st.data.pts.length) {
      this.dataTransform = this.lab.setDataset(st.data.pts);
      this.lastParsed = { pts: st.data.pts, mapping: st.data.mapping, axes: st.data.axes, n: st.data.pts.length };
    }
    this.lab.setParticleSize(st.particleSize || 0.55);
    this.lab.speedMul = st.speedMul || 1;
    this.lab.direction = st.direction || 1;
    if ((st.cfg.type === 'parametric' || st.cfg.type === 'surface') && Number.isFinite(st.tau)) {
      this.lab.tau = st.tau;
    }
    this.syncAll();
    this.sizeSlider.value = this.lab.particleSize;
    this.sizeVal.textContent = this.lab.particleSize.toFixed(2);
    this.speedSlider.value = Math.log10(this.lab.speedMul || 1);
    this.speedVal.textContent = `× ${this.lab.speedMul.toFixed(2)}`;
    this.lab.direction = st.direction || 1;
    this.syncPlayButtons();
    if (this.h.setCamera && st.camera) this.h.setCamera(st.camera);
    this.el.querySelectorAll('.eq-presets .btn').forEach((b) => b.classList.remove('active'));

    this.headId = id;
    this.saveHistory();
    this.renderHistory();
  }

  deleteCommit(id) {
    const idx = this.commits.findIndex((x) => x.id === id);
    if (idx === -1) return;
    this.commits.splice(idx, 1);
    if (this.headId === id) this.headId = this.commits[0] ? this.commits[0].id : null;
    this.saveHistory();
    this.renderHistory();
  }

  commitDiff(c) {
    const parent = this.commits.find((x) => x.id === c.parent);
    if (!parent) return 'initial commit';
    const a = parent.state, b = c.state;
    const changes = [];
    if (a.cfg.type !== b.cfg.type) changes.push(`type ${a.cfg.type} → ${b.cfg.type}`);
    for (const k of ['x', 'y', 'z']) {
      if ((a.cfg.exprs[k] || '') !== (b.cfg.exprs[k] || '')) changes.push(`${k} expr`);
    }
    for (const k of Object.keys(b.cfg.params || {})) {
      const av = a.cfg.params && a.cfg.params[k] ? a.cfg.params[k].value : undefined;
      const bv = b.cfg.params[k].value;
      if (av !== undefined && Math.abs(av - bv) > 1e-9) changes.push(`${k} ${fmtParam(av)} → ${fmtParam(bv)}`);
    }
    if ((a.layers || []).length !== (b.layers || []).length) {
      changes.push(`layers ${(a.layers || []).length} → ${(b.layers || []).length}`);
    }
    if (!!a.data !== !!b.data) changes.push(b.data ? 'dataset added' : 'dataset removed');
    if (!changes.length) return 'no equation changes (view or motion state)';
    return 'changed: ' + changes.slice(0, 4).join(', ') + (changes.length > 4 ? ', …' : '');
  }

  renderHistory() {
    const box = this.historyList;
    box.innerHTML = this.commits.length ? '' : '<p class="lab-note">No commits yet. Set up an equation and press Commit.</p>';
    for (const c of this.commits) {
      const card = document.createElement('div');
      card.className = 'commit-card' + (c.id === this.headId ? ' head' : '');
      card.innerHTML = `
        ${c.thumb ? `<img class="commit-thumb" src="${c.thumb}" alt="" />` : '<div class="commit-thumb empty"></div>'}
        <div class="commit-body">
          <div class="commit-msg">${escapeHtml(c.msg)}</div>
          <div class="commit-meta">${c.id.slice(0, 7)}${c.parent ? ' ← ' + c.parent.slice(0, 7) : ''} · ${relTime(c.time)}${c.id === this.headId ? ' · <b>HEAD</b>' : ''}</div>
          <div class="commit-diff">${this.commitDiff(c)}</div>
          <div class="commit-actions">
            <button class="btn tiny" data-act="checkout">Checkout</button>
            <button class="stack-x" data-act="delete" title="Delete commit">×</button>
          </div>
        </div>`;
      card.querySelector('[data-act="checkout"]').addEventListener('click', () => this.checkout(c.id));
      card.querySelector('[data-act="delete"]').addEventListener('click', () => this.deleteCommit(c.id));
      box.appendChild(card);
    }
  }

  // ---------------- superposition stack ----------------

  addCurrentLayer() {
    if (!this.lab.compiled) return;
    const snapshot = {
      name: this.cfg.name || 'Layer',
      type: this.cfg.type,
      exprs: { ...this.cfg.exprs },
      params: Object.fromEntries(Object.entries(this.cfg.params || {}).map(([k, p]) => [k, { ...p }])),
    };
    try {
      this.lab.addLayer(snapshot);
    } catch (err) {
      this.showError(err.message);
      return;
    }
    this.hideError();
    this.renderStack();
  }

  renderStack() {
    const box = this.el.querySelector('.eq-stack-list');
    box.innerHTML = '';
    this.lab.layers.forEach((L, i) => {
      const active = L.type === this.cfg.type;
      const row = document.createElement('div');
      row.className = 'stack-row' + (active ? '' : ' inactive');
      const hex = '#' + L.color.toString(16).padStart(6, '0');
      row.innerHTML = `
        <span class="label-dot" style="background:${hex};box-shadow:0 0 6px ${hex}"></span>
        <span class="stack-name">${L.name}</span>
        <span class="stack-type">${active ? L.type : L.type + ' (inactive)'}</span>
        <input type="range" min="0" max="2" step="0.01" value="${L.weight}" title="Layer weight" />
        <span class="stack-w">×${L.weight.toFixed(2)}</span>
        <button class="stack-x" title="Remove layer">×</button>`;
      const slider = row.querySelector('input');
      const wLabel = row.querySelector('.stack-w');
      slider.addEventListener('input', () => {
        const w = parseFloat(slider.value);
        this.lab.setLayerWeight(i, w);
        wLabel.textContent = `×${w.toFixed(2)}`;
      });
      row.querySelector('.stack-x').addEventListener('click', () => {
        this.lab.removeLayer(i);
        this.renderStack();
      });
      box.appendChild(row);
    });
  }

  // ---------------- data fit ----------------

  buildDataFit() {
    const $ = (s) => this.el.querySelector(s);
    this.dataText = $('#eq-data-text');
    this.fitResult = $('#eq-fit-result');
    this.useFitBtn = $('#eq-data-use');
    this.lastParsed = null;
    this.lastFit = null;

    $('#eq-data-sample').addEventListener('click', (e) => {
      e.preventDefault();
      this.dataText.value = SAMPLE_DATA;
    });

    const parse = () => {
      const res = parseDataset(this.dataText.value, $('#eq-data-format').value);
      if (res.error) {
        this.fitResult.innerHTML = `<span class="state-destroyed">${res.error}</span>`;
        return null;
      }
      return res;
    };

    $('#eq-data-plot').addEventListener('click', () => {
      const res = parse();
      if (!res) return;
      this.lastParsed = res;
      this.lastFit = null;
      this.useFitBtn.disabled = true;
      const tf = this.lab.setDataset(res.pts);
      this.dataTransform = tf;
      const span = res.pts[res.pts.length - 1].t;
      this.fitResult.innerHTML = `
        <div><b>${res.n}</b> points · columns <b>${res.mapping.split('').join(' ')}</b> · t spans <b>${span.toFixed(2)}</b></div>
        <div>The tracer replays the path as τ advances (loops over the span; reverse works too).</div>`;
    });

    $('#eq-data-fit').addEventListener('click', () => {
      const res = this.lastParsed || parse();
      if (!res) return;
      if (!this.lastParsed) {
        this.lastParsed = res;
        this.dataTransform = this.lab.setDataset(res.pts);
      }
      const fits = fitDataset(res.pts, res.axes);
      this.lastFit = fits;
      this.useFitBtn.disabled = false;
      const lines = Object.entries(fits).map(([axis, f]) => f
        ? `<div>${axis}(t) ≈ <b>${f.expr}</b><br><span class="fit-meta">${f.kind} · R² ${f.r2.toFixed(3)}</span></div>`
        : `<div>${axis}(t): no usable fit</div>`);
      this.fitResult.innerHTML = `${lines.join('')}
        <div class="fit-meta">t measured from your first sample. "Use fit" overlays this as a parametric equation on the data.</div>`;
    });

    $('#eq-data-use').addEventListener('click', () => {
      if (!this.lastFit || !this.lastParsed) return;
      const f = this.lastFit;
      const span = this.lastParsed.pts[this.lastParsed.pts.length - 1].t;
      const cfg = {
        id: 'custom', name: 'Fitted data', type: 'parametric',
        exprs: {
          x: f.x ? f.x.expr : '0',
          y: f.y ? f.y.expr : '0',
          z: f.z ? f.z.expr : '0',
        },
        params: {},
        particles: 18,
        spread: 0,
        chainOffset: span / 18,
        speed: span / 8, // one traversal in about 8 seconds
        scale: this.dataTransform.scale,
        offset: this.dataTransform.center,
        ic: {},
        camera: null,
        description: 'Least-squares guess fitted to your dataset, overlaid on the data points. The white tracer is your data; the bead chain is the fitted equation.',
      };
      clearTimeout(this.debounce);
      this.cfg = cfg;
      try {
        this.lab.applyConfig(cfg);
      } catch (err) {
        this.showError(err.message);
        return;
      }
      this.syncAll();
      this.el.querySelectorAll('.eq-presets .btn').forEach((b) => b.classList.remove('active'));
    });

    $('#eq-data-clear').addEventListener('click', () => {
      this.lab.clearDataset();
      this.lastParsed = null;
      this.lastFit = null;
      this.useFitBtn.disabled = true;
      this.fitResult.innerHTML = '';
    });
  }

  // ---------------- timeline bar (bottom) ----------------

  buildTimebar() {
    const tb = document.getElementById('math-timebar');
    tb.innerHTML = `
      <button id="mt-rev" class="tbtn" title="Reverse time (R)">⧏</button>
      <button id="mt-play" class="tbtn big" title="Play / pause (Space)">⏸</button>
      <div class="t-mid">
        <div id="mt-label">τ = 0.00</div>
        <input id="mt-scrub" type="range" min="0" max="1000" step="1" value="1000" />
        <div class="mt-hint">drag to travel back and forth through τ</div>
      </div>
      <button id="mt-snap" class="tbtn" title="Snapshot (S)">📷</button>`;
    this.mtPlay = tb.querySelector('#mt-play');
    this.mtRev = tb.querySelector('#mt-rev');
    this.mtScrub = tb.querySelector('#mt-scrub');
    this.mtLabel = tb.querySelector('#mt-label');
    this.scrubbing = false;

    this.mtPlay.addEventListener('click', () => this.togglePlay());
    this.mtRev.addEventListener('click', () => this.toggleReverse());
    tb.querySelector('#mt-snap').addEventListener('click', () => this.h.snapshot());

    this.mtScrub.addEventListener('input', () => {
      this.scrubbing = true;
      const [r0, r1] = this.lab.scrubRange();
      const f = parseFloat(this.mtScrub.value) / 1000;
      this.lab.scrubTo(r0 + (r1 - r0) * f);
      this.syncPlayButtons();
      this.mtLabel.textContent = `τ = ${this.lab.tau.toFixed(2)}`;
    });
    this.mtScrub.addEventListener('change', () => { this.scrubbing = false; });
  }

  syncPlayButtons() {
    const playing = this.lab.playing;
    this.playBtn.textContent = playing ? '⏸ Pause' : '▶ Play';
    if (this.mtPlay) this.mtPlay.textContent = playing ? '⏸' : '▶';
    if (this.mtRev) this.mtRev.classList.toggle('active', this.lab.direction < 0);
  }

  toggleReverse() {
    this.lab.toggleDirection();
    // reversing while paused should visibly start moving backwards
    if (!this.lab.playing) this.lab.playing = true;
    this.scrubbing = false;
    this.syncPlayButtons();
  }

  togglePlay() {
    this.lab.playing = !this.lab.playing;
    // resuming from a scrubbed point plays forward from that state
    if (this.lab.playing) this.scrubbing = false;
    this.syncPlayButtons();
  }

  loadPreset(preset, opts = {}) {
    clearTimeout(this.debounce); // a stale edit-apply must not fire after this
    // deep-ish copy so live edits never mutate the preset definitions
    this.cfg = {
      ...preset,
      exprs: { ...preset.exprs },
      params: Object.fromEntries(Object.entries(preset.params || {}).map(([k, p]) => [k, { ...p }])),
      ic: { ...(preset.ic || {}) },
    };
    try {
      this.lab.applyConfig(this.cfg);
    } catch (err) {
      this.showError(err.message);
      return;
    }
    this.syncAll();
    if (opts.frame !== false) this.h.frameView(this.cfg.camera);
    this.el.querySelectorAll('.eq-presets .btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.preset === preset.id));
  }

  switchType(type) {
    if (this.cfg.type === type) return;
    clearTimeout(this.debounce);
    // re-base the whole runtime config on the new type's reference preset so
    // equations, params, initial conditions, speed and camera stay coherent
    const base = MATH_PRESETS.find((p) => p.type === type) || CUSTOM_TEMPLATE;
    this.cfg = {
      ...base,
      type,
      id: 'custom',
      name: 'Custom',
      description: CUSTOM_TEMPLATE.description,
      exprs: { ...base.exprs },
      params: Object.fromEntries(Object.entries(base.params || {}).map(([k, p]) => [k, { ...p }])),
      ic: { ...(base.ic || {}) },
    };
    try {
      this.lab.applyConfig(this.cfg);
    } catch (err) {
      this.showError(err.message);
    }
    this.syncAll();
    this.h.frameView(this.cfg.camera);
  }

  syncAll() {
    const cfg = this.cfg;
    this.el.querySelectorAll('.eq-types button').forEach((b) =>
      b.classList.toggle('active', b.dataset.type === cfg.type));

    // expression rows
    const box = this.el.querySelector('.eq-exprs');
    box.innerHTML = '';
    for (const [key, label] of EXPR_ROWS[cfg.type]) {
      const row = document.createElement('div');
      row.className = 'expr-row';
      row.innerHTML = `<span class="expr-label">${label}</span><input class="expr-input" spellcheck="false" data-k="${key}" />`;
      const input = row.querySelector('input');
      input.value = cfg.exprs[key] || '';
      input.addEventListener('input', () => {
        cfg.exprs[key] = input.value;
        cfg.id = 'custom';
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => this.tryApply(), 400);
      });
      box.appendChild(row);
    }
    this.hideError();

    // parameter sliders
    const pbox = this.el.querySelector('.eq-params');
    pbox.innerHTML = '';
    const usedParams = Object.keys(cfg.params || {});
    if (!usedParams.length) pbox.innerHTML = '<p class="lab-note">This preset has no free parameters.</p>';
    for (const name of usedParams) {
      const p = cfg.params[name];
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = `
        <span class="param-name">${name}</span>
        <input type="range" min="${p.min}" max="${p.max}" step="${(p.max - p.min) / 400}" value="${p.value}" />
        <span class="param-val">${fmtParam(p.value)}</span>`;
      const slider = row.querySelector('input');
      const val = row.querySelector('.param-val');
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        this.lab.setParam(name, v);
        val.textContent = fmtParam(v);
      });
      pbox.appendChild(row);
    }

    // motion controls
    this.lab.speedMul = 1;
    this.speedSlider.value = 0;
    this.speedVal.textContent = '× 1.00';
    const particleCtl = this.el.querySelector('.eq-particle-controls');
    particleCtl.style.display = cfg.type === 'surface' ? 'none' : '';
    this.el.querySelector('#eq-follow').style.display = cfg.type === 'surface' ? 'none' : '';
    if (cfg.type !== 'surface') {
      this.nSlider.value = cfg.particles || 30;
      this.nVal.textContent = this.nSlider.value;
      this.spreadSlider.value = cfg.spread || 0;
      this.spreadVal.textContent = (cfg.spread || 0).toFixed(1);
    }
    this.lab.playing = true;
    this.lab.direction = 1;
    this.scrubbing = false;
    this.syncPlayButtons();
    this.renderStack();

    this.el.querySelector('.eq-desc').textContent = cfg.description || '';
  }

  tryApply() {
    try {
      const tau = this.lab.tau;
      this.lab.applyConfig(this.cfg);
      this.lab.tau = tau; // keep time flowing across live edits
      this.hideError();
    } catch (err) {
      this.showError(err.message);
    }
  }

  showError(msg) {
    const e = this.el.querySelector('.eq-error');
    e.textContent = msg;
    e.classList.remove('hidden');
  }

  hideError() {
    this.el.querySelector('.eq-error').classList.add('hidden');
  }

  tick(dt) {
    // timeline follows live time unless the user is holding the scrubber
    if (this.mtLabel && !this.scrubbing) {
      this.mtLabel.textContent = `τ = ${this.lab.tau.toFixed(2)}`;
      if (this.lab.playing) this.mtScrub.value = 1000;
    }
    this.liveAcc += dt;
    if (this.liveAcc < 0.25) return;
    this.liveAcc = 0;
    const st = this.el.querySelector('#eq-state');
    if (!st) return;
    const info = this.lab.particleInfo();
    if (!info) {
      st.innerHTML = this.cfg && this.cfg.type === 'surface'
        ? `<div>τ = <b>${this.lab.tau.toFixed(2)}</b> · sheet ${this.cfg.range * 2} × ${this.cfg.range * 2} units</div>`
        : '';
      return;
    }
    const sgn = (v) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
    const nLayers = this.lab.actLayers.length;
    st.innerHTML = `
      <div>τ = <b>${this.lab.tau.toFixed(2)}</b> · ${info.n} particles${nLayers ? ` · <b>${nLayers + 1}</b> equations superposed` : ''}${info.respawns ? ` · ${info.respawns} respawned` : ''}</div>
      <div>Particle 1: <b>x ${sgn(info.pos[0])} · y ${sgn(info.pos[1])} · z ${sgn(info.pos[2])}</b></div>
      ${info.speed !== null ? `<div>Speed <b>${info.speed.toFixed(2)} units/τ</b></div>` : ''}`;
  }
}

function fmtParam(v) {
  return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

const HISTORY_KEY = 'solar-claude-eq-history-v1';

function tinyHash(s) {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (h1 ^ c) * 0x01000193 | 0;
    h2 = (h2 * 31 + c) | 0;
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).slice(0, 12);
}

function relTime(ms) {
  const d = Date.now() - ms;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
