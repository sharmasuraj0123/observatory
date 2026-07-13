// Photo Lab panel: photoelectric effect workbench + photosynthesis explorer.

import {
  METALS, PIGMENTS, sampleSpectrum, actionSpectrum, leafAbsorb,
} from '../photo/photoPhysics.js';

function fmt(x, d = 3) {
  if (!Number.isFinite(x)) return 'n/a';
  return x.toFixed(d);
}

export class PhotoPanel {
  constructor(lab, hooks) {
    this.lab = lab;
    this.h = hooks;
    this.el = document.getElementById('photo-panel');
    this.liveAcc = 0;
    this.build();
  }

  build() {
    this.el.innerHTML = `
      <div class="list-title">Photo Lab</div>
      <div class="seg earth-modes photo-modes">
        <button data-m="photoelectric" class="active">Photoelectric</button>
        <button data-m="photosynthesis">Photosynthesis</button>
      </div>

      <div id="photo-pe-ui">
        <p class="lab-note">Einstein's photoelectric effect: a photon ejects an electron only
        if hf &gt; φ. Intensity sets how many electrons; frequency sets their kinetic energy.
        Raise retarding voltage past V<sub>s</sub> = K<sub>max</sub>/e to stop the current.</p>

        <div class="section-title">Cathode metal</div>
        <div class="preset-grid light-presets" id="pe-metals"></div>
        <p class="lab-note" id="pe-metal-note" style="padding-top:4px;"></p>

        <div class="section-title">Beam (live)</div>
        <div class="spm-params" id="pe-params"></div>

        <div class="section-title">Einstein readout</div>
        <div class="state-block" id="pe-summary"></div>
        <div id="pe-verify" class="light-verify"></div>

        <div class="section-title">I-V scan</div>
        <canvas id="pe-iv" width="300" height="120" class="photo-canvas"></canvas>
        <p class="lab-note">Photocurrent vs retarding voltage at the current λ and intensity.
        Current drops to zero at the stopping potential V<sub>s</sub>.</p>
      </div>

      <div id="photo-ps-ui" class="hidden">
        <p class="lab-note">Light-dependent photosynthesis: pigments absorb quanta; relative
        rate ≈ absorbance × quantum yield × intensity. Green light is poorly used (green
        trough). O<sub>2</sub> bubbles mark productive absorption events.</p>

        <div class="section-title">Incident light</div>
        <div class="spm-params" id="ps-params"></div>

        <div class="section-title">Pigment mix</div>
        <div class="spm-params" id="ps-mix"></div>

        <div class="section-title">Live rates</div>
        <div class="state-block" id="ps-summary"></div>

        <div class="section-title">Action spectrum</div>
        <canvas id="ps-action" width="300" height="130" class="photo-canvas"></canvas>
        <p class="lab-note">White line: relative photosynthetic rate. Colored fill: leaf
        absorbance. Marker: current λ.</p>

        <div class="section-title">Pigments at λ</div>
        <div id="ps-pigments"></div>
      </div>

      <div class="kick-row eq-actions">
        <button class="btn tiny" id="photo-play">⏸ Pause</button>
        <button class="btn tiny" id="photo-reframe">Frame view</button>
      </div>
    `;

    this.el.querySelectorAll('.photo-modes button').forEach((b) =>
      b.addEventListener('click', () => {
        const m = b.dataset.m;
        this.el.querySelectorAll('.photo-modes button').forEach((x) =>
          x.classList.toggle('active', x === b));
        document.getElementById('photo-pe-ui').classList.toggle('hidden', m !== 'photoelectric');
        document.getElementById('photo-ps-ui').classList.toggle('hidden', m !== 'photosynthesis');
        this.h.setSubmode(m);
        this.frameView();
        this.render();
      }));

    // Metals
    const grid = this.el.querySelector('#pe-metals');
    for (const m of METALS) {
      const b = document.createElement('button');
      b.className = 'btn tiny';
      b.dataset.id = m.id;
      b.textContent = m.name;
      b.addEventListener('click', () => {
        this.lab.pe.metalId = m.id;
        grid.querySelectorAll('.btn').forEach((x) => x.classList.toggle('active', x === b));
        this.render();
      });
      grid.appendChild(b);
    }
    grid.querySelector(`[data-id="${this.lab.pe.metalId}"]`)?.classList.add('active');

    this.buildPeParams();
    this.buildPsParams();

    this.playBtn = this.el.querySelector('#photo-play');
    this.playBtn.addEventListener('click', () => this.togglePause());
    this.el.querySelector('#photo-reframe').addEventListener('click', () => this.frameView());

    this.frameView();
    this.render();
  }

  buildPeParams() {
    const box = this.el.querySelector('#pe-params');
    const defs = [
      { k: 'lambdaNm', label: 'Wavelength', unit: 'nm', min: 200, max: 700, step: 5 },
      { k: 'intensity', label: 'Intensity', unit: '', min: 0, max: 1, step: 0.01 },
      { k: 'voltage', label: 'Retarding voltage', unit: 'V', min: -1, max: 5, step: 0.05 },
    ];
    box.innerHTML = '';
    for (const def of defs) {
      const val = this.lab.pe[def.k];
      const row = document.createElement('div');
      row.className = 'spm-param';
      row.innerHTML = `
        <div class="setting-row"><span>${def.label}</span><span class="spm-val">${val} ${def.unit}</span></div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" />`;
      const slider = row.querySelector('input');
      const valEl = row.querySelector('.spm-val');
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        this.lab.pe[def.k] = v;
        valEl.textContent = `${v} ${def.unit}`;
        this.render();
      });
      box.appendChild(row);
    }
  }

  buildPsParams() {
    const box = this.el.querySelector('#ps-params');
    box.innerHTML = '';
    for (const def of [
      { k: 'lambdaNm', label: 'Wavelength', unit: 'nm', min: 400, max: 720, step: 5 },
      { k: 'intensity', label: 'Intensity', unit: '', min: 0, max: 1.5, step: 0.01 },
    ]) {
      const val = this.lab.ps[def.k];
      const row = document.createElement('div');
      row.className = 'spm-param';
      row.innerHTML = `
        <div class="setting-row"><span>${def.label}</span><span class="spm-val">${val} ${def.unit}</span></div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" />`;
      const slider = row.querySelector('input');
      const valEl = row.querySelector('.spm-val');
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        this.lab.ps[def.k] = v;
        valEl.textContent = `${v} ${def.unit}`;
        if (def.k === 'lambdaNm') this.lab.updateLambdaMarker();
        this.render();
      });
      box.appendChild(row);
    }

    const mixBox = this.el.querySelector('#ps-mix');
    mixBox.innerHTML = '';
    for (const p of PIGMENTS) {
      const val = this.lab.ps.mix[p.id] ?? 0;
      const row = document.createElement('div');
      row.className = 'spm-param';
      row.innerHTML = `
        <div class="setting-row"><span>${p.name}</span><span class="spm-val">${val.toFixed(2)}</span></div>
        <input type="range" min="0" max="1.5" step="0.05" value="${val}" />`;
      const slider = row.querySelector('input');
      const valEl = row.querySelector('.spm-val');
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        this.lab.ps.mix[p.id] = v;
        valEl.textContent = v.toFixed(2);
        this.lab.rebuildSpectrumBars();
        this.render();
      });
      mixBox.appendChild(row);
    }
  }

  togglePause() {
    this.lab.playing = !this.lab.playing;
    this.playBtn.textContent = this.lab.playing ? '⏸ Pause' : '▶ Play';
  }

  frameView() {
    if (!this.h.frameView) return;
    if (this.lab.submode === 'photoelectric') {
      this.h.frameView({ pos: [0, 28, 55], target: [0, 6, 0] });
    } else {
      this.h.frameView({ pos: [8, 22, 48], target: [0, 2, 0] });
    }
  }

  render() {
    if (this.lab.submode === 'photoelectric') this.renderPE();
    else this.renderPS();
  }

  renderPE() {
    const a = this.lab.peAnalysis();
    document.getElementById('pe-metal-note').textContent =
      `${a.metal.name}: φ = ${a.metal.phi.toFixed(2)} eV · λ₀ = ${a.thresholdNm.toFixed(0)} nm · ${a.metal.note}`;

    const sum = document.getElementById('pe-summary');
    sum.innerHTML = `
      <div>Photon <b>E = ${fmt(a.E, 3)} eV</b> · f = <b>${(a.f / 1e14).toFixed(2)}×10¹⁴ Hz</b></div>
      <div>Work function φ = <b>${fmt(a.phiEv, 2)} eV</b> · threshold λ₀ = <b>${fmt(a.thresholdNm, 0)} nm</b></div>
      <div>K<sub>max</sub> = <b>${a.above ? fmt(a.Kmax, 3) + ' eV' : '0 (below threshold)'}</b></div>
      <div>Stopping potential V<sub>s</sub> = <b>${a.above ? fmt(a.Vs, 3) + ' V' : 'n/a'}</b> · photocurrent <b>${a.current > 0 ? 'ON' : 'OFF'}</b></div>`;

    const ver = document.getElementById('pe-verify');
    const ok = a.above
      ? Math.abs((a.E - a.phiEv) - a.Kmax) < 1e-9
      : a.Kmax === 0;
    ver.innerHTML = `<span class="verify-dot ${ok ? 'ok' : 'bad'}"></span>${a.einstein}`;

    this.drawIV(a);
  }

  drawIV(a) {
    const cv = document.getElementById('pe-iv');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(16,24,42,0.6)';
    ctx.fillRect(0, 0, W, H);

    // axes
    ctx.strokeStyle = 'rgba(140,170,255,0.25)';
    ctx.beginPath();
    ctx.moveTo(36, 10); ctx.lineTo(36, H - 22); ctx.lineTo(W - 10, H - 22);
    ctx.stroke();
    ctx.fillStyle = '#8b96ad';
    ctx.font = '10px sans-serif';
    ctx.fillText('I', 12, 20);
    ctx.fillText('V', W - 18, H - 8);

    if (!a.above) {
      ctx.fillStyle = '#ff8a6a';
      ctx.fillText('Below threshold: I = 0 for all V', 50, H / 2);
      return;
    }

    const Vmax = Math.max(a.Vs * 1.3, 1);
    const Imax = Math.max(a.intensity, 0.05);
    const xOf = (V) => 36 + ((V + 0.2) / (Vmax + 0.2)) * (W - 50);
    const yOf = (I) => (H - 22) - (I / Imax) * (H - 40);

    // Idealized soft-knee I-V: current while V < Vs
    ctx.strokeStyle = '#6fe08a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;
    for (let V = -0.2; V <= Vmax; V += 0.02) {
      let I = 0;
      if (V < a.Vs) {
        const u = Math.max(0, V / a.Vs);
        I = a.intensity * (1 - Math.pow(u, 4) * 0.2);
      }
      const x = xOf(V), y = yOf(I);
      if (first) { ctx.moveTo(x, y); first = false; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Vs marker
    ctx.strokeStyle = '#ffca7a';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xOf(a.Vs), 10);
    ctx.lineTo(xOf(a.Vs), H - 22);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffca7a';
    ctx.fillText(`Vs ${a.Vs.toFixed(2)} V`, xOf(a.Vs) - 20, 18);

    // Current operating point
    const Iop = a.current;
    ctx.fillStyle = '#86b7ff';
    ctx.beginPath();
    ctx.arc(xOf(a.voltage), yOf(Iop), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  renderPS() {
    const a = this.lab.psAnalysis();
    const sum = document.getElementById('ps-summary');
    sum.innerHTML = `
      <div>λ = <b>${a.lambdaNm} nm</b> · E = <b>${fmt(a.energyEv, 3)} eV</b></div>
      <div>Leaf absorbance <b>${fmt(a.leafAbsorb, 2)}</b> · quantum yield <b>${fmt(a.quantumYield, 2)}</b></div>
      <div>Relative rate <b>${fmt(a.rate, 2)}</b> · O₂ evolution <b>${a.producing ? 'active' : 'idle'}</b></div>`;

    const pig = document.getElementById('ps-pigments');
    pig.innerHTML = a.pigments.map((p) => `
      <div class="ray-event" style="margin:6px 16px;">
        <div class="ray-event-head">
          <span class="λ-swatch" style="background:#${p.color.toString(16).padStart(6, '0')}"></span>
          <b>${p.name}</b>
        </div>
        <div class="stat-grid ray-event-grid">
          <div class="stat-k">Absorbance at λ</div><div class="stat-v">${fmt(p.absorb, 2)}</div>
          <div class="stat-k">Role</div><div class="stat-v" style="text-align:left;font-size:11px;">${p.role}</div>
        </div>
      </div>`).join('');

    this.drawAction();
  }

  drawAction() {
    const cv = document.getElementById('ps-action');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(16,24,42,0.6)';
    ctx.fillRect(0, 0, W, H);

    const abs = sampleSpectrum((nm) => leafAbsorb(nm, this.lab.ps.mix), 400, 720, 4);
    const act = sampleSpectrum((nm) => actionSpectrum(nm, this.lab.ps.intensity, this.lab.ps.mix).rate, 400, 720, 4);
    const maxA = Math.max(...abs.map((s) => s.v), 1e-6);
    const maxR = Math.max(...act.map((s) => s.v), 1e-6);
    const xOf = (nm) => ((nm - 400) / 320) * (W - 20) + 10;
    const yA = (v) => H - 16 - (v / maxA) * (H - 28);
    const yR = (v) => H - 16 - (v / maxR) * (H - 28);

    // Absorbance fill
    ctx.beginPath();
    abs.forEach((s, i) => {
      const x = xOf(s.nm), y = yA(s.v);
      if (i === 0) ctx.moveTo(x, H - 16);
      ctx.lineTo(x, y);
    });
    ctx.lineTo(xOf(720), H - 16);
    ctx.closePath();
    ctx.fillStyle = 'rgba(45,138,78,0.35)';
    ctx.fill();

    // Action line
    ctx.strokeStyle = '#e8eef8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    act.forEach((s, i) => {
      const x = xOf(s.nm), y = yR(s.v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Current λ
    const nm = this.lab.ps.lambdaNm;
    ctx.strokeStyle = '#ffca7a';
    ctx.beginPath();
    ctx.moveTo(xOf(nm), 8);
    ctx.lineTo(xOf(nm), H - 16);
    ctx.stroke();
    ctx.fillStyle = '#ffca7a';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${nm} nm`, xOf(nm) + 4, 16);
  }

  tick() {
    this.liveAcc += 0.016;
    if (this.liveAcc < 0.3) return;
    this.liveAcc = 0;
    this.render();
  }
}
