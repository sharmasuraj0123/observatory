// Fractals Lab panel: destinations, live explorer controls, probe, analysis.

import { fmtComplex } from '../fractal/fractals.js';

function fmt(n, d = 4) {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  if (Math.abs(n) > 0 && Math.abs(n) < 1e-3) return n.toExponential(3);
  if (Math.abs(n) >= 1e4) return n.toExponential(3);
  return n.toFixed(d);
}

const FAMILY_LABEL = { escape: 'Escape time', ray: 'Raymarch 3D', ifs: 'IFS attractor' };

export class FractalPanel {
  constructor(lab, hooks) {
    this.lab = lab;
    this.h = hooks;
    this.el = document.getElementById('fractal-panel');
    this.liveAcc = 0;
    this.build();
    lab.onProbe = () => this.renderProbe();
  }

  build() {
    this.el.innerHTML = `
      <div class="list-title fractal-hero-title">Fractals Lab</div>
      <p class="lab-note">Fullscreen GPU explorer. Scroll to zoom into infinity,
      drag to pan, double-click to dive, click to probe the complex plane.</p>

      <div class="fractal-family-row" id="fractal-families">
        <button class="btn tiny" data-fam="escape">Escape</button>
        <button class="btn tiny" data-fam="ray">3D Ray</button>
        <button class="btn tiny" data-fam="ifs">IFS</button>
      </div>

      <div class="section-title">Destinations</div>
      <div class="preset-grid fractal-presets" id="fractal-presets"></div>

      <div class="fractal-blurb" id="fractal-blurb"></div>

      <div class="section-title">Live view</div>
      <div class="state-block fractal-live" id="fractal-live"></div>

      <div class="section-title">Parameters</div>
      <div class="spm-params" id="fractal-params"></div>

      <div class="kick-row eq-actions">
        <button class="btn tiny" id="fractal-reframe">Reset camera</button>
        <button class="btn tiny" id="fractal-reset">Reset destination</button>
        <button class="btn tiny" id="fractal-clear">Clear probe</button>
        <button class="btn tiny hidden" id="fractal-grow">Grow attractor</button>
      </div>

      <div class="section-title">Complex probe</div>
      <div class="fractal-probe" id="fractal-probe">
        <p class="lab-note">Click anywhere on the fractal to sample z ∈ ℂ.</p>
      </div>

      <div class="section-title">Analysis</div>
      <div class="state-block" id="fractal-analysis"></div>

      <div class="section-title">Guide</div>
      <div class="fractal-guide">
        <div class="fg-row"><kbd>drag</kbd> pan / orbit</div>
        <div class="fg-row"><kbd>scroll</kbd> zoom / dolly</div>
        <div class="fg-row"><kbd>click</kbd> probe</div>
        <div class="fg-row"><kbd>double-click</kbd> dive ×2.2</div>
        <div class="fg-row"><kbd>IFS</kbd> Points 100→320k · Grow attractor</div>
      </div>
    `;

    this.el.querySelector('#fractal-families').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fam]');
      if (!b) return;
      const first = this.lab.listPresets().find((p) => p.family === b.dataset.fam);
      if (first) {
        this.lab.loadPreset(first.id);
        this.renderAll();
        this.h.frameView?.();
      }
    });

    this.el.querySelector('#fractal-reframe').addEventListener('click', () => this.h.frameView?.());
    this.el.querySelector('#fractal-reset').addEventListener('click', () => {
      if (this.lab.preset) {
        this.lab.loadPreset(this.lab.preset.id);
        this.renderAll();
      }
    });
    this.el.querySelector('#fractal-clear').addEventListener('click', () => {
      this.lab.clearProbe();
      this.renderProbe();
    });
    this.el.querySelector('#fractal-grow').addEventListener('click', () => {
      this.lab.toggleIFSGrowth();
      this.syncGrowButton();
      this.renderLive();
    });

    this.renderAll();
  }

  renderAll() {
    this.renderPresets();
    this.renderBlurb();
    this.renderParams();
    this.renderLive();
    this.renderProbe();
    this.renderAnalysis();
    this.syncFamilyButtons();
    this.syncGrowButton();
  }

  syncGrowButton() {
    const b = this.el.querySelector('#fractal-grow');
    if (!b) return;
    const ifs = this.lab.family === 'ifs';
    b.classList.toggle('hidden', !ifs);
    if (!ifs) return;
    const g = this.lab.ifsGrowthProgress();
    if (g.on) {
      b.textContent = 'Pause growth';
      b.classList.add('active');
    } else if (g.u >= 1 || g.visible >= g.total) {
      b.textContent = 'Replay growth';
      b.classList.remove('active');
    } else if (g.visible > 0 && g.visible < g.total) {
      b.textContent = 'Resume growth';
      b.classList.remove('active');
    } else {
      b.textContent = 'Grow attractor';
      b.classList.remove('active');
    }
  }

  syncFamilyButtons() {
    this.el.querySelectorAll('#fractal-families [data-fam]').forEach((b) => {
      b.classList.toggle('active', b.dataset.fam === this.lab.family);
    });
  }

  renderPresets() {
    const grid = this.el.querySelector('#fractal-presets');
    grid.innerHTML = '';
    for (const p of this.lab.listPresets()) {
      if (p.family !== this.lab.family) continue;
      const b = document.createElement('button');
      b.className = 'preset-chip' + (this.lab.preset?.id === p.id ? ' active' : '');
      b.innerHTML = `<span class="pc-name">${p.name}</span>`;
      b.title = p.blurb;
      b.addEventListener('click', () => {
        this.lab.loadPreset(p.id);
        this.renderAll();
        this.h.frameView?.();
      });
      grid.appendChild(b);
    }
  }

  renderBlurb() {
    const el = this.el.querySelector('#fractal-blurb');
    const p = this.lab.preset;
    if (!p) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="fb-head">
        <span class="fb-fam">${FAMILY_LABEL[p.family] || p.family}</span>
        <span class="fb-kind">${p.kind}</span>
      </div>
      <p>${p.blurb}</p>
    `;
  }

  _addRange(box, key, label, val, min, max, step) {
    const row = document.createElement('div');
    row.className = 'spm-row';
    const isLog = step === 'log';
    const isPoints = key === 'points';
    const display = isPoints
      ? Math.round(val).toLocaleString()
      : isLog
        ? Number(val).toExponential(3)
        : (Number.isInteger(step) ? Math.round(val) : fmt(val, 5));
    row.innerHTML = `
      <label>${label}</label>
      <input type="range" min="${isLog ? 0 : min}" max="${isLog ? 1000 : max}"
        step="${isLog ? 1 : step}" value="${isLog ? this._logPos(val, min, max) : val}"
        data-k="${key}" data-log="${isLog ? 1 : 0}" data-min="${min}" data-max="${max}" />
      <span class="spm-val" data-v="${key}">${display}</span>
    `;
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      let v = Number(input.value);
      if (input.dataset.log === '1') v = this._logVal(v, Number(input.dataset.min), Number(input.dataset.max));
      if (key === 'maxIter' || key === 'points') v = Math.round(v);
      this.lab.setParam(key, v);
      row.querySelector(`[data-v="${key}"]`).textContent =
        key === 'points' ? Math.round(v).toLocaleString()
          : input.dataset.log === '1' ? Number(v).toExponential(3)
            : (Number.isInteger(step) ? Math.round(v) : fmt(v, 5));
      this.renderLive();
      this.renderAnalysis();
      if (key === 'points') this.syncGrowButton();
    });
    box.appendChild(row);
  }

  renderParams() {
    const box = this.el.querySelector('#fractal-params');
    box.innerHTML = '';
    const p = this.lab.params;
    const fam = this.lab.family;

    if (fam === 'escape') {
      this._addRange(box, 'centerX', 'Re(center)', p.centerX, -2.5, 1.5, 0.000001);
      this._addRange(box, 'centerY', 'Im(center)', p.centerY, -1.5, 1.5, 0.000001);
      this._addRange(box, 'scale', 'Scale', p.scale, 1e-14, 4, 'log');
      this._addRange(box, 'maxIter', 'Max iter', p.maxIter, 64, 2048, 1);
      this._addRange(box, 'power', 'Power', p.power, 2, 8, 0.1);
      if (this.lab.kind === 'julia') {
        this._addRange(box, 'juliaX', 'Re(c)', p.juliaX, -2, 2, 0.001);
        this._addRange(box, 'juliaY', 'Im(c)', p.juliaY, -2, 2, 0.001);
      }
      this._addRange(box, 'colorScale', 'Color scale', p.colorScale ?? 1, 0.2, 3, 0.01);
      this._addRange(box, 'colorShift', 'Color shift', p.colorShift ?? 0, 0, 1, 0.01);
      this._addRange(box, 'glow', 'Glow', p.glow ?? 1.1, 0.2, 2.5, 0.01);
      this._addRange(box, 'exposure', 'Exposure', p.exposure ?? 1.15, 0.5, 2.5, 0.01);
    } else if (fam === 'ray') {
      this._addRange(box, 'power', 'Power', p.power, 2, 12, 0.5);
      this._addRange(box, 'maxIter', 'DE iters', p.maxIter, 8, 120, 1);
      this._addRange(box, 'camDist', 'Distance', p.camDist, 1.2, 9, 0.05);
      this._addRange(box, 'camTheta', 'θ', p.camTheta, 0.08, Math.PI - 0.08, 0.01);
      this._addRange(box, 'camPhi', 'φ', p.camPhi, -Math.PI, Math.PI, 0.01);
      this._addRange(box, 'glow', 'Glow', p.glow ?? 1.2, 0.2, 2.5, 0.01);
      this._addRange(box, 'exposure', 'Exposure', p.exposure ?? 1.25, 0.5, 2.5, 0.01);
      if (this.lab.kind === 'quatjulia') {
        this._addRange(box, 'juliaX', 'c.x', p.juliaX, -1, 1, 0.01);
        this._addRange(box, 'juliaY', 'c.y', p.juliaY, -1, 1, 0.01);
        this._addRange(box, 'juliaZ', 'c.z', p.juliaZ, -1, 1, 0.01);
        this._addRange(box, 'juliaW', 'c.w', p.juliaW, -1, 1, 0.01);
      }
    } else {
      // Log scale: 100 → 320k so sparse chaos-game and dense clouds both fit
      this._addRange(box, 'points', 'Points', p.points, 100, 320000, 'log');
      this._addRange(box, 'size', 'Point size', p.size, 0.5, 2.5, 0.05);
    }

    if (fam === 'escape' || fam === 'ray') {
      const pals = ['plasma', 'ember', 'aurora', 'ice', 'gold', 'neon'];
      const palRow = document.createElement('div');
      palRow.className = 'spm-row';
      palRow.innerHTML = `
        <label>Palette</label>
        <select>${pals.map((x) =>
          `<option value="${x}" ${p.palette === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
      palRow.querySelector('select').addEventListener('change', (e) => {
        this.lab.setParam('palette', e.target.value);
        this.renderLive();
      });
      box.appendChild(palRow);
    }

    if (fam === 'escape') {
      const trapRow = document.createElement('div');
      trapRow.className = 'spm-row';
      trapRow.innerHTML = `
        <label>Orbit trap</label>
        <select>${['none', 'circle', 'cross', 'dots'].map((x) =>
          `<option value="${x}" ${p.trap === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
      trapRow.querySelector('select').addEventListener('change', (e) => {
        this.lab.setParam('trap', e.target.value);
      });
      box.appendChild(trapRow);

      const smoothRow = document.createElement('div');
      smoothRow.className = 'spm-row check-row';
      smoothRow.innerHTML = `
        <label><input type="checkbox" ${p.smooth !== false ? 'checked' : ''}/> Smooth potential</label>`;
      smoothRow.querySelector('input').addEventListener('change', (e) => {
        this.lab.setParam('smooth', e.target.checked);
      });
      box.appendChild(smoothRow);
    }

    if (fam === 'ray') {
      const autoRow = document.createElement('div');
      autoRow.className = 'spm-row check-row';
      autoRow.innerHTML = `
        <label><input type="checkbox" ${p.autoOrbit ? 'checked' : ''}/> Auto-orbit</label>`;
      autoRow.querySelector('input').addEventListener('change', (e) => {
        this.lab.setParam('autoOrbit', e.target.checked);
      });
      box.appendChild(autoRow);
    }

    if (fam === 'ifs') {
      const pals = ['fern', 'ice', 'ember', 'autumn', 'aurora', 'plasma'];
      const palRow = document.createElement('div');
      palRow.className = 'spm-row';
      palRow.innerHTML = `
        <label>Palette</label>
        <select>${pals.map((x) =>
          `<option value="${x}" ${p.palette === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
      palRow.querySelector('select').addEventListener('change', (e) => {
        this.lab.setParam('palette', e.target.value);
        this.renderLive();
        this.renderAnalysis();
      });
      box.appendChild(palRow);
    }
  }

  _logPos(v, min, max) {
    const a = Math.log(Math.max(v, min));
    const lo = Math.log(min);
    const hi = Math.log(max);
    return Math.round(1000 * (a - lo) / (hi - lo));
  }

  _logVal(pos, min, max) {
    const lo = Math.log(min);
    const hi = Math.log(max);
    return Math.exp(lo + (pos / 1000) * (hi - lo));
  }

  renderLive() {
    const a = this.lab.analysis();
    const el = this.el.querySelector('#fractal-live');
    if (a.family === 'escape') {
      el.innerHTML = `
        <div class="kv"><span>Center</span><b>${a.center}</b></div>
        <div class="kv"><span>Scale</span><b>${Number(a.scale).toExponential(3)}</b></div>
        <div class="kv"><span>Iterations</span><b>${a.maxIter}</b></div>
        <div class="kv"><span>Power</span><b>${a.power}</b></div>
        ${a.julia ? `<div class="kv"><span>Julia c</span><b>${a.julia}</b></div>` : ''}
      `;
    } else if (a.family === 'ray') {
      el.innerHTML = `
        <div class="kv"><span>Power</span><b>${a.power}</b></div>
        <div class="kv"><span>DE iters</span><b>${a.maxIter}</b></div>
        <div class="kv"><span>θ / φ</span><b>${fmt(a.cam.theta, 2)} / ${fmt(a.cam.phi, 2)}</b></div>
        <div class="kv"><span>Distance</span><b>${fmt(a.cam.dist, 2)}</b></div>
      `;
    } else {
      const vis = a.visible ?? a.points ?? 0;
      const tot = a.points || 0;
      const pct = tot > 0 ? Math.round((vis / tot) * 100) : 100;
      el.innerHTML = `
        <div class="kv"><span>Points</span><b>${tot.toLocaleString()}</b></div>
        <div class="kv"><span>Visible</span><b>${vis.toLocaleString()} (${pct}%)</b></div>
        <div class="kv"><span>Growth</span><b>${a.growing ? 'playing' : (pct >= 100 ? 'complete' : 'paused')}</b></div>
        <div class="kv"><span>Hausdorff dim ≈</span><b>${fmt(a.dimension, 3)}</b></div>
        <div class="kv"><span>System</span><b>${a.kind}</b></div>
      `;
    }
  }

  renderProbe() {
    const el = this.el.querySelector('#fractal-probe');
    if (this.lab.family !== 'escape') {
      el.innerHTML = `<p class="lab-note">Probe is available on escape-time fractals.</p>`;
      return;
    }
    const pr = this.lab.probe;
    if (!pr) {
      el.innerHTML = `<p class="lab-note">Click anywhere on the fractal to sample z ∈ ℂ.</p>`;
      return;
    }
    const r = pr.result || {};
    el.innerHTML = `
      <div class="kv"><span>z</span><b>${fmtComplex(pr.re, pr.im, 8)}</b></div>
      <div class="kv"><span>Escaped</span><b>${r.escaped ? 'yes' : 'bound / interior'}</b></div>
      <div class="kv"><span>Iterations</span><b>${r.iter ?? 'n/a'}</b></div>
      ${r.smooth != null ? `<div class="kv"><span>Smooth μ</span><b>${fmt(r.smooth, 4)}</b></div>` : ''}
      ${r.mag != null ? `<div class="kv"><span>|z| final</span><b>${fmt(r.mag, 4)}</b></div>` : ''}
      ${r.root != null && r.root >= 0 ? `<div class="kv"><span>Newton root</span><b>#${r.root}</b></div>` : ''}
    `;
  }

  renderAnalysis() {
    const el = this.el.querySelector('#fractal-analysis');
    const a = this.lab.analysis();
    if (a.family === 'escape') {
      el.innerHTML = `
        <div class="kv"><span>Coloring</span><b>smooth potential + DE edge</b></div>
        <div class="kv"><span>Orbit trap</span><b>${a.params.trap || 'none'}</b></div>
        <div class="kv"><span>Palette</span><b>${a.params.palette}</b></div>
        <div class="kv"><span>Tone map</span><b>ACES + gamma</b></div>
        <p class="lab-note" style="margin-top:8px">Continuous potential removes banding.
        Distance estimate lights the set boundary; traps paint nearest approach to a locus.</p>
      `;
    } else if (a.family === 'ray') {
      el.innerHTML = `
        <div class="kv"><span>Estimator</span><b>distance estimation</b></div>
        <div class="kv"><span>Lighting</span><b>soft shadow + AO + Fresnel</b></div>
        <div class="kv"><span>Palette</span><b>${a.params.palette}</b></div>
        <p class="lab-note" style="margin-top:8px">Each pixel raymarches until DE &lt; ε.
        Trap radius drives ambient occlusion and volumetric glow.</p>
      `;
    } else {
      el.innerHTML = `
        <div class="kv"><span>Algorithm</span><b>chaos game / IFS</b></div>
        <div class="kv"><span>Points</span><b>${(a.points || 0).toLocaleString()}</b></div>
        <div class="kv"><span>Dim (theory)</span><b>${fmt(a.dimension, 3)}</b></div>
        <p class="lab-note" style="margin-top:8px">Drop Points toward 100 to watch the
        chaos game sparsely. <b>Grow attractor</b> reveals iterates in order, simulating
        the set assembling over time.</p>
      `;
    }
  }

  tick(dt) {
    this.liveAcc += dt;
    if (this.liveAcc < 0.2) return;
    this.liveAcc = 0;
    if (this.el.classList.contains('hidden')) return;
    this.renderLive();
    if (this.lab.family === 'ifs') this.syncGrowButton();
  }
}
