// HUD: body navigator, info panel with live orbital stats, time controls,
// display settings and keyboard shortcuts.

import { AU_KM, GM_SUN } from '../sim/constants.js';
import { moonSpeedKms, orbitalSpeedKms } from '../sim/kepler.js';

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };

function supNum(n) {
  return String(n).split('').map((c) => SUP[c] || c).join('');
}

export function fmtMass(kg) {
  if (!kg) return null;
  const exp = Math.floor(Math.log10(kg));
  const mant = kg / 10 ** exp;
  return `${mant.toFixed(2)} × 10${supNum(exp)} kg`;
}

export function fmtExp(x, unit) {
  if (!Number.isFinite(x)) return `? ${unit}`;
  if (x === 0) return `0 ${unit}`;
  const exp = Math.floor(Math.log10(Math.abs(x)));
  if (exp >= -2 && exp <= 3) return `${x.toPrecision(3)} ${unit}`;
  const mant = x / 10 ** exp;
  return `${mant.toFixed(2)} × 10${supNum(exp)} ${unit}`;
}

export function fmtKm(km) {
  if (km >= 1e9) return `${(km / 1e9).toFixed(2)}B km`;
  if (km >= 1e6) return `${(km / 1e6).toFixed(1)}M km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

export function fmtAU(au) {
  if (au < 0.005) return fmtKm(au * AU_KM);
  return `${au.toFixed(3)} AU`;
}

// below this multiplier every rate control snaps to exactly 1x, so the display,
// the snap logic and the LIVE badge all agree on what "real time" means
const REALTIME_SNAP = 1.5;

export function fmtRate(rate) {
  if (rate === 0) return 'Paused';
  const sign = rate < 0 ? '−' : '';
  const r = Math.abs(rate);
  if (r < REALTIME_SNAP) return `${sign}Real time`;
  if (r < 59.5) return `${sign}${Math.round(r)} sec/s`;
  if (r < 3570) return `${sign}${(r / 60).toFixed(r < 600 ? 1 : 0)} min/s`;
  if (r < 86220) return `${sign}${(r / 3600).toFixed(1)} hr/s`;
  if (r < 86400 * 30) return `${sign}${(r / 86400).toFixed(1)} days/s`;
  if (r < 86400 * 365) return `${sign}${(r / (86400 * 30.44)).toFixed(1)} months/s`;
  return `${sign}${(r / (86400 * 365.25)).toFixed(1)} years/s`;
}

function fmtDate(date) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ` +
    `${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())} UTC`;
}

const sliderToRate = (v) => Math.sign(v) * (10 ** (Math.abs(v) * 0.075) - 1);
const rateToSlider = (r) => Math.sign(r) * (Math.log10(Math.abs(r) + 1) / 0.075);

const TYPE_LABEL = { star: 'Star', planet: 'Planet', dwarf: 'Dwarf planet', comet: 'Periodic comet' };

export class UI {
  constructor(hooks) {
    this.h = hooks; // { clock, byId, sections, select, focus, release, overview, toggles, setPlanetScale, defaultScaleSlider }
    this.selected = null;
    this.liveAcc = 0;

    this.el = {
      dateText: document.getElementById('date-text'),
      liveBadge: document.getElementById('live-badge'),
      bodyList: document.getElementById('body-list'),
      info: document.getElementById('info-panel'),
      settings: document.getElementById('settings-panel'),
      timebar: document.getElementById('timebar'),
      help: document.getElementById('help-overlay'),
    };

    this.buildBodyList();
    this.buildTimebar();
    this.buildSettings();
    this.buildHelp();
    this.bindKeys();

    document.getElementById('btn-help').addEventListener('click', () => this.toggleHelp());
    document.getElementById('btn-settings').addEventListener('click', () => {
      this.el.settings.classList.toggle('hidden');
    });
  }

  // ---------------- body navigator ----------------

  buildBodyList() {
    const root = this.el.bodyList;
    root.innerHTML = '<div class="list-title">Bodies</div>';
    for (const section of this.h.sections) {
      const sec = document.createElement('div');
      sec.className = 'list-section';
      sec.innerHTML = `<div class="section-title">${section.title}</div>`;
      for (const rec of section.items) {
        sec.appendChild(this.bodyRow(rec));
        if (rec.moons && rec.moons.length) {
          const moonBox = document.createElement('div');
          moonBox.className = 'moon-rows';
          for (const m of rec.moons) moonBox.appendChild(this.bodyRow(m, true));
          sec.appendChild(moonBox);
        }
      }
      root.appendChild(sec);
    }
  }

  bodyRow(rec, isMoon = false) {
    const hex = '#' + rec.def.color.toString(16).padStart(6, '0');
    const row = document.createElement('div');
    row.className = 'body-row' + (isMoon ? ' moon' : '');
    row.dataset.id = rec.def.id;
    const expand = !isMoon && rec.moons && rec.moons.length
      ? `<span class="expand" title="Show moons">${rec.moons.length} ▾</span>` : '';
    row.innerHTML = `<span class="dot" style="background:${hex}"></span><span class="row-name">${rec.def.name}</span>${expand}`;
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('expand')) {
        row.nextElementSibling?.classList.toggle('open');
        return;
      }
      this.h.select(rec.def.id, { focus: true });
    });
    return row;
  }

  markSelected(id) {
    this.el.bodyList.querySelectorAll('.body-row').forEach((r) => {
      r.classList.toggle('selected', r.dataset.id === id);
      if (r.dataset.id === id && r.parentElement.classList.contains('moon-rows')) {
        r.parentElement.classList.add('open');
      }
    });
  }

  // ---------------- info panel ----------------

  showInfo(rec) {
    this.selected = rec;
    this.markSelected(rec.def.id);
    const info = rec.def.info || {};
    const typeLabel = rec.isMoon
      ? `Moon of ${rec.parent.def.name}`
      : (TYPE_LABEL[rec.def.type] || 'Body');

    const rows = [];
    const add = (k, v) => { if (v) rows.push(`<div class="stat-k">${k}</div><div class="stat-v">${v}</div>`); };
    add('Radius', `${fmtKm(rec.def.radiusKm)}`);
    add('Mass', fmtMass(info.massKg));
    if (info.gravity) add('Gravity', `${info.gravity} m/s²`);
    if (info.density) add('Density', `${info.density} g/cm³`);
    add('Day length', info.dayLength);
    add('Year length', info.yearLength || (rec.def.periodDays ? `${rec.def.periodDays.toFixed(2)} days` : null));
    if (!rec.isMoon && rec.def.tiltDeg !== undefined && rec.def.type !== 'comet') {
      add('Axial tilt', `${rec.def.tiltDeg.toFixed(1)}° (to ecliptic)`);
    }
    if (rec.def.elements) add('Eccentricity', rec.def.elements.e[0].toFixed(4));
    add('Temperature', info.temp);
    add('Atmosphere', info.atmosphere);

    const experiment = !rec.isMoon ? `
      <div class="lab-block">
        <div class="lab-block-title">Experiment
          <span class="lab-hint" id="exp-hint"></span>
        </div>
        <div class="setting-row"><span>Mass</span><span id="exp-mass-val"></span></div>
        <input type="range" id="exp-mass" min="-2" max="3" step="0.01" />
        <div class="kick-row">
          <button class="btn tiny" data-kick="halt">Halt</button>
          <button class="btn tiny" data-kick="reverse">Reverse</button>
          <button class="btn tiny" data-kick="0.5">v ×½</button>
          <button class="btn tiny" data-kick="1.5">v ×1.5</button>
        </div>
      </div>` : '';

    const moonChips = rec.moons && rec.moons.length
      ? `<div class="chip-row"><span class="chip-label">Moons</span>${rec.moons.map((m) =>
        `<button class="chip" data-id="${m.def.id}">${m.def.name}</button>`).join('')}</div>`
      : '';
    const parentChip = rec.isMoon
      ? `<div class="chip-row"><span class="chip-label">Orbits</span><button class="chip" data-id="${rec.parent.def.id}">${rec.parent.def.name}</button></div>`
      : '';

    this.el.info.innerHTML = `
      <button class="panel-close" title="Close">×</button>
      <div class="info-type">${typeLabel}</div>
      <h2 class="info-name">${rec.def.name}</h2>
      <p class="info-desc">${info.description || ''}</p>
      <div class="live-grid">
        <div class="live-tile"><div class="live-k" id="live-k1"></div><div class="live-v" id="live-v1"></div></div>
        <div class="live-tile"><div class="live-k" id="live-k2"></div><div class="live-v" id="live-v2"></div></div>
        <div class="live-tile"><div class="live-k" id="live-k3"></div><div class="live-v" id="live-v3"></div></div>
      </div>
      <div class="state-block" id="state-block"></div>
      <div class="stat-grid">${rows.join('')}</div>
      ${moonChips}${parentChip}
      ${experiment}
      <div class="btn-row">
        <button class="btn primary" id="btn-refocus">Focus camera</button>
        <button class="btn" id="btn-overview">Overview</button>
        ${rec.def.id === 'earth' ? '<button class="btn earth-lab-btn" id="btn-earthlab">🌍 Earth Lab</button>' : ''}
      </div>`;

    this.el.info.classList.remove('hidden');
    this.el.info.querySelector('.panel-close').addEventListener('click', () => this.closeInfo());
    this.el.info.querySelector('#btn-refocus').addEventListener('click', () => this.h.focus(rec.def.id));
    this.el.info.querySelector('#btn-overview').addEventListener('click', () => this.h.overview());
    const earthBtn = this.el.info.querySelector('#btn-earthlab');
    if (earthBtn && this.h.openEarthLab) {
      earthBtn.addEventListener('click', () => this.h.openEarthLab());
    }
    this.el.info.querySelectorAll('.chip').forEach((c) =>
      c.addEventListener('click', () => this.h.select(c.dataset.id, { focus: true })));

    if (!rec.isMoon && this.h.experiment) {
      const slider = this.el.info.querySelector('#exp-mass');
      const val = this.el.info.querySelector('#exp-mass-val');
      const showMul = () => {
        const mul = 10 ** parseFloat(slider.value);
        const kg = (rec.def.info.massKg || 0) * mul;
        val.textContent = `× ${mul >= 10 ? mul.toFixed(0) : mul.toFixed(2)}${kg ? ` (${fmtMass(kg)})` : ''}`;
      };
      slider.value = Math.log10(this.h.experiment.getMassMul(rec.def.id) || 1);
      showMul();
      slider.addEventListener('input', () => {
        this.h.experiment.setMassMul(rec.def.id, 10 ** parseFloat(slider.value));
        showMul();
        this.syncExpHint();
      });
      this.el.info.querySelectorAll('[data-kick]').forEach((b) =>
        b.addEventListener('click', () => {
          const k = b.dataset.kick;
          this.h.experiment.kick(rec.def.id, k === 'halt' || k === 'reverse' ? k : parseFloat(k));
          this.syncExpHint();
        }));
      this.syncExpHint();
    }
    this.updateLiveStats();
  }

  syncExpHint() {
    const hint = this.el.info.querySelector('#exp-hint');
    if (hint) {
      hint.textContent = this.h.isPhysics && this.h.isPhysics()
        ? 'N-body live'
        : 'first use starts N-body mode';
    }
  }

  closeInfo() {
    this.el.info.classList.add('hidden');
    this.selected = null;
    this.markSelected(null);
  }

  updateLiveStats() {
    const rec = this.selected;
    if (!rec || this.el.info.classList.contains('hidden')) return;
    const set = (n, k, v) => {
      const ke = document.getElementById(`live-k${n}`);
      const ve = document.getElementById(`live-v${n}`);
      if (ke) { ke.textContent = k; ve.textContent = v; }
    };
    if (this.h.isDead && this.h.isDead(rec)) {
      set(1, 'Status', 'Destroyed');
      set(2, '', '');
      set(3, '', '');
      this.updateStateBlock(rec);
      return;
    }
    const earth = this.h.byId.get('earth');
    const earthGone = earth.destroyed;
    const dEarth = rec.def.id === 'earth' || earthGone ? null : rec.worldPos.distanceTo(earth.worldPos) / 1000;

    if (rec.def.type === 'star') {
      set(1, 'Distance from Earth', dEarth ? fmtAU(dEarth) : 'n/a');
      set(2, 'Light travel to Earth', dEarth ? `${(dEarth * AU_KM / 299792.458 / 60).toFixed(1)} min` : 'n/a');
      set(3, 'Spectral class', 'G2V');
    } else if (rec.isMoon) {
      // the gravity report already applies the experiment's effective GM
      const pi = this.h.physicsInfo ? this.h.physicsInfo(rec.def.id) : null;
      const speed = pi ? pi.speedKms : moonSpeedKms(rec.gmParent, rec.def.aKm, rec.rKm || rec.def.aKm);
      set(1, `Distance from ${rec.parent.def.name}`, fmtKm(rec.rKm || 0));
      set(2, 'Orbital speed', `${speed.toFixed(2)} km/s`);
      // parent world positions are real (only moon offsets are visually spread),
      // so report the parent system's true distance from Earth / the Sun
      if (rec.parent.def.id === 'earth') {
        set(3, 'Distance from Sun', fmtAU(rec.parent.rAU));
      } else {
        const dE = rec.parent.worldPos.distanceTo(earth.worldPos) / 1000;
        set(3, 'Distance from Earth', fmtAU(dE));
      }
    } else {
      const speed = rec.speedKms !== undefined ? rec.speedKms : orbitalSpeedKms(rec.aAU, rec.rAU);
      set(1, 'Distance from Sun', fmtAU(rec.rAU));
      set(2, 'Orbital speed', `${speed.toFixed(2)} km/s`);
      if (rec.def.id === 'earth') {
        const moon = this.h.byId.get('moon');
        set(3, 'Distance from Moon', fmtKm(moon.rKm || 384400));
      } else {
        set(3, 'Distance from Earth', fmtAU(dEarth));
      }
    }
    this.updateStateBlock(rec);
  }

  updateStateBlock(rec) {
    const el = document.getElementById('state-block');
    if (!el || !this.h.physicsInfo) return;
    const pi = this.h.physicsInfo(rec.def.id);
    if (!pi) { el.innerHTML = ''; return; }
    if (pi.destroyed) {
      el.innerHTML = `<span class="state-destroyed">Destroyed: absorbed by ${pi.absorbedBy}</span>`;
      return;
    }
    const p = pi.posAU;
    const sgn = (v) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(3)}`;
    el.innerHTML = `
      <div>Position <b>x ${sgn(p[0])} · y ${sgn(p[1])} · z ${sgn(p[2])} AU</b> (heliocentric, ecliptic)</div>
      <div>Velocity <b>${pi.speedKms.toFixed(2)} km/s</b> · Net gravity <b>${fmtExp(pi.forceN, 'N')}</b></div>
      <div>Acceleration <b>${fmtExp(pi.accelMs2, 'm/s²')}</b> · Strongest pull: <b>${pi.strongest.name} (${pi.strongest.pct.toFixed(1)}%)</b></div>`;
  }

  // ---------------- time bar ----------------

  buildTimebar() {
    const tb = this.el.timebar;
    tb.innerHTML = `
      <button id="t-reverse" class="tbtn" title="Reverse time">⧏</button>
      <button id="t-pause" class="tbtn big" title="Pause / resume (Space)">⏸</button>
      <div class="t-mid">
        <div id="t-rate">1 day/s</div>
        <input id="t-slider" type="range" min="-100" max="100" step="0.5" value="0" />
        <div class="t-presets">
          <button data-rate="1">Real</button>
          <button data-rate="3600">1 hr/s</button>
          <button data-rate="86400">1 day/s</button>
          <button data-rate="604800">1 wk/s</button>
          <button data-rate="2629800">1 mo/s</button>
          <button data-rate="31557600">1 yr/s</button>
        </div>
      </div>
      <div class="t-right">
        <button id="t-now" class="tbtn" title="Jump to the present">Now</button>
        <input id="t-date" type="datetime-local" title="Jump to date (UTC)" />
        <select id="t-events" title="Jump to event">
          <option value="">Events…</option>
          <option value="2061-07-28T00:00">Halley perihelion · 2061</option>
          <option value="2020-12-21T18:00">Great conjunction · 2020</option>
          <option value="1986-02-09T00:00">Halley perihelion · 1986</option>
          <option value="1969-07-20T20:17">Apollo 11 landing · 1969</option>
        </select>
      </div>`;

    const clock = this.h.clock;
    this.slider = tb.querySelector('#t-slider');
    this.rateLabel = tb.querySelector('#t-rate');
    this.pauseBtn = tb.querySelector('#t-pause');

    this.slider.value = rateToSlider(clock.rate);
    this.rateLabel.textContent = fmtRate(clock.rate);

    this.slider.addEventListener('input', () => {
      clock.rate = sliderToRate(parseFloat(this.slider.value));
      if (Math.abs(clock.rate) < REALTIME_SNAP) clock.rate = Math.sign(clock.rate) || 1;
      // touching the rate resumes time, like every other rate control
      clock.paused = false;
      this.pauseBtn.textContent = '⏸';
      this.rateLabel.textContent = fmtRate(clock.rate);
    });
    tb.querySelectorAll('.t-presets button').forEach((b) =>
      b.addEventListener('click', () => this.setRate(parseFloat(b.dataset.rate))));
    tb.querySelector('#t-reverse').addEventListener('click', () => this.setRate(-clock.rate));
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    tb.querySelector('#t-now').addEventListener('click', () => { clock.setNow(); });
    tb.querySelector('#t-date').addEventListener('change', (e) => {
      if (!e.target.value) return;
      const ms = Date.parse(e.target.value + ':00Z');
      if (!Number.isNaN(ms)) clock.setDate(ms);
      e.target.blur(); // return keyboard shortcuts to the scene
    });
    tb.querySelector('#t-events').addEventListener('change', (e) => {
      if (!e.target.value) return;
      const ms = Date.parse(e.target.value + ':00Z');
      if (!Number.isNaN(ms)) clock.setDate(ms);
      if (e.target.value.startsWith('2061') || e.target.value.startsWith('1986')) {
        this.h.select('halley', { focus: true });
      }
      e.target.value = '';
      e.target.blur();
    });
  }

  setRate(rate) {
    const clock = this.h.clock;
    if (Math.abs(rate) < REALTIME_SNAP) rate = Math.sign(rate) || 1;
    clock.rate = rate;
    clock.paused = false;
    this.slider.value = rateToSlider(rate);
    this.rateLabel.textContent = fmtRate(rate);
    this.pauseBtn.textContent = '⏸';
  }

  togglePause() {
    const clock = this.h.clock;
    clock.paused = !clock.paused;
    this.pauseBtn.textContent = clock.paused ? '▶' : '⏸';
    this.rateLabel.textContent = clock.paused ? 'Paused' : fmtRate(clock.rate);
  }

  // ---------------- settings ----------------

  buildSettings() {
    const s = this.el.settings;
    const t = this.h.toggles;
    s.innerHTML = `
      <div class="list-title">Display</div>
      <label class="setting"><input type="checkbox" id="s-orbits" checked /> Orbit lines</label>
      <label class="setting"><input type="checkbox" id="s-labels" checked /> Labels</label>
      <label class="setting"><input type="checkbox" id="s-belt" checked /> Asteroid belt</label>
      <label class="setting"><input type="checkbox" id="s-kuiper" checked /> Kuiper belt</label>
      <label class="setting"><input type="checkbox" id="s-grid" /> Ecliptic grid</label>
      <label class="setting"><input type="checkbox" id="s-bloom" checked /> Bloom glow</label>
      <div class="setting-slider">
        <div class="setting-row"><span>Body size</span><span id="s-scale-val"></span></div>
        <input type="range" id="s-scale" min="0" max="100" step="0.5" />
        <div class="scale-btns">
          <button id="s-true" class="btn tiny">True scale</button>
          <button id="s-cine" class="btn tiny">Cinematic</button>
        </div>
        <p class="setting-note">Distances are always real. This only exaggerates body sizes so planets are visible at solar-system zoom.</p>
      </div>`;

    const scale = s.querySelector('#s-scale');
    const scaleVal = s.querySelector('#s-scale-val');
    const applyFromSlider = () => {
      const factor = Math.pow(400, scale.value / 100);
      scaleVal.textContent = factor < 1.05 ? 'true scale' : `${factor.toFixed(0)}×`;
      this.h.setPlanetScale(factor);
    };
    scale.value = this.h.defaultScaleSlider;
    applyFromSlider();
    scale.addEventListener('input', applyFromSlider);
    s.querySelector('#s-true').addEventListener('click', () => { scale.value = 0; applyFromSlider(); });
    s.querySelector('#s-cine').addEventListener('click', () => { scale.value = this.h.defaultScaleSlider; applyFromSlider(); });

    const bind = (id, fn) => s.querySelector(id).addEventListener('change', (e) => fn(e.target.checked));
    bind('#s-orbits', t.orbits);
    bind('#s-labels', t.labels);
    bind('#s-belt', t.belt);
    bind('#s-kuiper', t.kuiper);
    bind('#s-grid', t.grid);
    bind('#s-bloom', t.bloom);
  }

  // ---------------- help + keys ----------------

  buildHelp() {
    this.el.help.addEventListener('click', (e) => { if (e.target === this.el.help) this.toggleHelp(); });
    this.renderHelp();
  }

  // rendered at open time so the shortcuts match the active tab
  renderHelp() {
    const math = this.h.isMath && this.h.isMath();
    const earth = this.h.isEarth && this.h.isEarth();
    const solarGrid = `
      <span>Click body / label</span><span>select and fly to it</span>
      <span>Drag / scroll</span><span>orbit and zoom</span>
      <span>Space</span><span>pause time</span>
      <span>+ / −</span><span>speed up / slow down time</span>
      <span>0 - 9</span><span>focus Sun, Mercury through Pluto</span>
      <span>Esc</span><span>release focus, then overview</span>
      <span>O / L / G</span><span>toggle orbits / labels / grid</span>
      <span>E</span><span>physics lab (N-body experiments)</span>
      <span>Tabs</span><span>Equation Lab: type any equation, watch it move</span>
      <span>H</span><span>this help</span>`;
    const mathGrid = `
      <span>Drag / scroll</span><span>orbit and zoom</span>
      <span>Space</span><span>pause / resume equation time τ</span>
      <span>Esc</span><span>release follow, then reframe the view</span>
      <span>Type anywhere</span><span>edit expressions; errors show inline</span>
      <span>Sliders a b c d</span><span>morph parameters while it runs</span>
      <span>H</span><span>this help</span>`;
    const earthGrid = `
      <span>Drag / scroll</span><span>orbit and zoom</span>
      <span>Click a layer</span><span>inspect core, mantle, crust, fields</span>
      <span>Space</span><span>pause / resume the mooring simulation</span>
      <span>Esc</span><span>reframe the view</span>
      <span>Sliders</span><span>every mooring parameter is live</span>
      <span>H</span><span>this help</span>`;
    const sub = math
      ? 'The Equation Lab moves particles through space + time under your equations: parametric curves, velocity fields, force fields and animated surfaces, integrated with RK4. Trails fade backward along the time axis.'
      : earth
        ? 'Earth Lab: a true-scale cutaway of the planet (PREM layer radii, dipole field lines) and a live Single Point Mooring simulation solved with quasi-static catenary mechanics.'
        : 'A real-ephemeris solar system. Planet positions are computed from JPL Keplerian elements, so what you see matches the actual sky for any date between 1800 and 2050 (and stays close well beyond).';
    const tip = math
      ? 'Try it: load the Lorenz attractor and drag b below 24 to watch chaos collapse into a fixed point. Or load Kepler orbits: the same inverse-square law as the solar tab.'
      : earth
        ? 'Try it: in SPM mooring, raise the wind to 30 m/s and watch the upwind chains lift off the seabed, the touchdown points race toward the piles and the tension table go amber.'
        : 'Try it: open the physics lab (E), switch to N-body and press "Halt Earth" to watch it fall into the Sun. Or make Jupiter a star and see the outer system reorganize.';
    this.el.help.innerHTML = `
      <div class="help-card">
        <button class="panel-close" title="Close">×</button>
        <h2>${math ? 'Equation Lab' : earth ? 'Earth Lab' : 'Solar Claude'}</h2>
        <p class="help-sub">${sub}</p>
        <div class="help-grid">${math ? mathGrid : earth ? earthGrid : solarGrid}</div>
        <p class="help-tip">${tip}</p>
      </div>`;
    this.el.help.querySelector('.panel-close').addEventListener('click', () => this.toggleHelp());
  }

  toggleHelp() {
    if (this.el.help.classList.contains('hidden')) this.renderHelp();
    this.el.help.classList.toggle('hidden');
  }

  bindKeys() {
    const order = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (this.h.isMath && this.h.isMath()) {
        // equation-lab keys only; solar shortcuts stay out of the way
        switch (e.key) {
          case ' ': e.preventDefault(); if (this.h.mathPlayPause) this.h.mathPlayPause(); break;
          case 's': case 'S': if (this.h.snapshot) this.h.snapshot(); break;
          case 'h': case 'H': case '?': this.toggleHelp(); break;
          case 'Escape':
            if (!this.el.help.classList.contains('hidden')) this.toggleHelp();
            else if (this.h.mathEscape) this.h.mathEscape();
            break;
        }
        return;
      }
      if (this.h.isEarth && this.h.isEarth()) {
        switch (e.key) {
          case ' ': e.preventDefault(); if (this.h.earthPlayPause) this.h.earthPlayPause(); break;
          case 's': case 'S': if (this.h.snapshot) this.h.snapshot(); break;
          case 'h': case 'H': case '?': this.toggleHelp(); break;
          case 'Escape':
            if (!this.el.help.classList.contains('hidden')) this.toggleHelp();
            else if (this.h.earthEscape) this.h.earthEscape();
            break;
        }
        return;
      }
      const clock = this.h.clock;
      switch (e.key) {
        case ' ': e.preventDefault(); this.togglePause(); break;
        case '+': case '=': this.setRate(clamp(clock.rate * 2 || 2, -31557600, 31557600)); break;
        case '-': case '_': this.setRate(clamp(clock.rate / 2, -31557600, 31557600)); break;
        case 'Escape':
          if (!this.el.help.classList.contains('hidden')) { this.toggleHelp(); break; }
          this.h.escape();
          break;
        case 'o': case 'O': this.clickCheckbox('#s-orbits'); break;
        case 'l': case 'L': this.clickCheckbox('#s-labels'); break;
        case 'g': case 'G': this.clickCheckbox('#s-grid'); break;
        case 'e': case 'E': if (this.h.toggleLab) this.h.toggleLab(); break;
        case 's': case 'S': if (this.h.snapshot) this.h.snapshot(); break;
        case 'h': case 'H': case '?': this.toggleHelp(); break;
        default: {
          const idx = parseInt(e.key, 10);
          if (!Number.isNaN(idx) && order[idx]) this.h.select(order[idx], { focus: true });
        }
      }
    });
  }

  clickCheckbox(sel) {
    const cb = this.el.settings.querySelector(sel);
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
  }

  // ---------------- per-frame ----------------

  tick(dt) {
    const clock = this.h.clock;
    const math = this.h.isMath && this.h.isMath();
    const earth = this.h.isEarth && this.h.isEarth();
    if (math || earth) {
      this.el.dateText.textContent = math
        ? (this.h.mathStatus ? this.h.mathStatus() : '')
        : (this.h.earthStatus ? this.h.earthStatus() : '');
      this.el.liveBadge.classList.remove('on');
      const expBadge = document.getElementById('exp-badge');
      if (expBadge) expBadge.classList.remove('on');
      return;
    }
    this.el.dateText.textContent = fmtDate(clock.date);
    const physics = this.h.isPhysics && this.h.isPhysics();
    this.el.liveBadge.classList.toggle('on', !physics && clock.isLive());
    const expBadge = document.getElementById('exp-badge');
    if (expBadge) expBadge.classList.toggle('on', !!physics);
    if (clock.paused) this.rateLabel.textContent = 'Paused';

    this.liveAcc += dt;
    if (this.liveAcc > 0.25) {
      this.liveAcc = 0;
      this.updateLiveStats();
    }
  }
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}
