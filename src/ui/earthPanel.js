// Earth Lab panel: interior layer explorer (PREM cutaway).

import { LAYERS, EXTRAS, EARTH_FACTS } from '../earth/earthdata.js';

export class EarthPanel {
  constructor(lab) {
    this.lab = lab;
    this.el = document.getElementById('earth-panel');
    this.build();
    this.selectLayer('innerCore');
  }

  build() {
    this.el.innerHTML = `
      <div class="list-title">Earth Lab</div>
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
      </div>`;

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

  tick() {
    // static panel
  }
}
