// Equation Lab editor panel: presets, type switching, live expression editing
// with inline errors, parameter sliders that morph the system while it runs,
// motion controls and a live state readout.

import { MATH_PRESETS, CUSTOM_TEMPLATE } from '../math/presets.js';
import { EXPR_HELP } from '../math/expr.js';

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

      <div class="section-title">Equation type</div>
      <div class="seg eq-types"></div>

      <div class="eq-exprs"></div>
      <div class="eq-error hidden"></div>

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
  }

  togglePlay() {
    this.lab.playing = !this.lab.playing;
    this.playBtn.textContent = this.lab.playing ? '⏸ Pause' : '▶ Play';
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
    if (!this.lab.playing) this.togglePlay();
    this.playBtn.textContent = '⏸ Pause';

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
    st.innerHTML = `
      <div>τ = <b>${this.lab.tau.toFixed(2)}</b> · ${info.n} particles${info.respawns ? ` · ${info.respawns} respawned` : ''}</div>
      <div>Particle 1: <b>x ${sgn(info.pos[0])} · y ${sgn(info.pos[1])} · z ${sgn(info.pos[2])}</b></div>
      ${info.speed !== null ? `<div>Speed <b>${info.speed.toFixed(2)} units/τ</b></div>` : ''}`;
  }
}

function fmtParam(v) {
  return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
