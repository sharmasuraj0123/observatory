// Physics lab panel: switches between the real ephemeris and the N-body
// experiment, exposes the gravitational constant, trails, presets and a log.

export class LabPanel {
  constructor(hooks) {
    // hooks: { isPhysics, enterPhysics, exitPhysics, reseed, resetExperiment,
    //          setG, getG, setTrails, preset(name) }
    this.h = hooks;
    this.el = document.getElementById('lab-panel');
    this.build();
  }

  build() {
    this.el.innerHTML = `
      <div class="list-title">Physics lab</div>
      <div class="seg">
        <button id="lab-rails">Real ephemeris</button>
        <button id="lab-nbody">N-body physics</button>
      </div>
      <p class="lab-note" id="lab-status">On rails: positions come from JPL elements.</p>

      <div class="setting-slider">
        <div class="setting-row"><span>Gravitational constant</span><span id="lab-g-val">G × 1.00</span></div>
        <input type="range" id="lab-g" min="-1" max="1" step="0.01" value="0" />
        <div class="scale-btns">
          <button class="btn tiny" id="lab-g-zero">G = 0</button>
          <button class="btn tiny" id="lab-g-one">G × 1</button>
        </div>
      </div>

      <label class="setting"><input type="checkbox" id="lab-trails" checked /> Motion trails</label>

      <div class="section-title">Experiments</div>
      <div class="preset-grid">
        <button class="btn tiny" data-preset="jupiterStar">Jupiter → star</button>
        <button class="btn tiny" data-preset="halfSun">Sun ×0.5 mass</button>
        <button class="btn tiny" data-preset="doubleG">Double gravity</button>
        <button class="btn tiny" data-preset="haltEarth">Halt Earth</button>
        <button class="btn tiny" data-preset="reverseVenus">Reverse Venus</button>
        <button class="btn tiny" data-preset="reset">Reset experiment</button>
      </div>

      <div class="scale-btns" style="padding: 4px 16px 0;">
        <button class="btn tiny" id="lab-reseed">Re-seed from current date</button>
      </div>

      <div class="lab-log" id="lab-log"></div>

      <p class="lab-note">N-body: Sun, planets, Pluto, Ceres and Halley feel real mutual
      gravity (leapfrog integrator, adaptive substeps, momentum-conserving mergers).
      Moons and the belts stay on rails but their orbital rates track the parent's
      effective GM. Select any body to edit its mass or kick its velocity.</p>`;

    const $ = (s) => this.el.querySelector(s);
    this.railsBtn = $('#lab-rails');
    this.nbodyBtn = $('#lab-nbody');
    this.gSlider = $('#lab-g');
    this.gVal = $('#lab-g-val');
    this.status = $('#lab-status');
    this.logEl = $('#lab-log');
    this.logLines = [];

    this.railsBtn.addEventListener('click', () => { this.h.exitPhysics(); this.sync(); });
    this.nbodyBtn.addEventListener('click', () => { this.h.enterPhysics(); this.sync(); });
    this.gSlider.addEventListener('input', () => {
      // the far-left slider position means gravity fully off
      const v = parseFloat(this.gSlider.value);
      const g = v <= -0.995 ? 0 : 10 ** v;
      this.h.setG(g);
      this.gVal.textContent = `G × ${g.toFixed(2)}`;
    });
    $('#lab-g-zero').addEventListener('click', () => this.applyG(0));
    $('#lab-g-one').addEventListener('click', () => this.applyG(1));
    $('#lab-trails').addEventListener('change', (e) => this.h.setTrails(e.target.checked));
    this.el.querySelectorAll('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => { this.h.preset(b.dataset.preset); this.sync(); }));
    $('#lab-reseed').addEventListener('click', () => { this.h.reseed(); this.log('Re-seeded from the current date.'); });
  }

  applyG(g) {
    this.h.setG(g);
    this.gSlider.value = g > 0 ? Math.log10(g) : -1;
    this.gVal.textContent = `G × ${g.toFixed(2)}`;
  }

  sync() {
    const physics = this.h.isPhysics();
    this.railsBtn.classList.toggle('active', !physics);
    this.nbodyBtn.classList.toggle('active', physics);
    this.status.textContent = physics
      ? 'N-body physics: bodies move under real mutual gravity. Edit masses from any body\'s info panel.'
      : 'On rails: positions come from JPL elements. Any experiment control switches to N-body.';
    const g = this.h.getG();
    this.gSlider.value = g > 0 ? Math.log10(g) : -1;
    this.gVal.textContent = `G × ${g.toFixed(2)}`;
  }

  log(msg) {
    this.logLines.unshift(msg);
    this.logLines = this.logLines.slice(0, 4);
    this.logEl.innerHTML = this.logLines.map((l) => `<div>${l}</div>`).join('');
  }

  toggle() {
    this.el.classList.toggle('hidden');
    if (!this.el.classList.contains('hidden')) this.sync();
  }
}
