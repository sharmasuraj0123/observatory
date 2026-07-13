// Photo Lab constants: photoelectric effect and photosynthesis.
// Sources: NIST CODATA (h, e, c); standard metal work functions; chlorophyll
// absorption peaks from photosynthetic pigment literature (approx. in vivo).

export const H_JS = 6.62607015e-34;       // Planck constant (J·s)
export const H_EV_S = 4.135667696e-15;    // eV·s
export const E_CHARGE = 1.602176634e-19;  // C
export const C_MS = 299792458;            // m/s
export const HC_EV_NM = 1239.84193;       // E(eV) = HC_EV_NM / λ(nm)

export function photonEnergyEv(lambdaNm) {
  return HC_EV_NM / lambdaNm;
}

export function photonEnergyJ(lambdaNm) {
  return photonEnergyEv(lambdaNm) * E_CHARGE;
}

export function frequencyHz(lambdaNm) {
  return C_MS / (lambdaNm * 1e-9);
}

// Metal work functions φ (eV). Typical clean-surface values.
export const METALS = [
  { id: 'cs', name: 'Cesium', phi: 1.95, color: 0xc8b090, note: 'Lowest φ of common metals; responds into the near-IR.' },
  { id: 'k', name: 'Potassium', phi: 2.29, color: 0xb8a878, note: 'Alkali metal; threshold in the orange-red.' },
  { id: 'na', name: 'Sodium', phi: 2.36, color: 0xd0c090, note: 'Classic textbook cathode.' },
  { id: 'ca', name: 'Calcium', phi: 2.87, color: 0xa8a898, note: 'Threshold near green-yellow.' },
  { id: 'zn', name: 'Zinc', phi: 4.33, color: 0x9aa8b0, note: 'Needs near-UV; visible light does nothing.' },
  { id: 'cu', name: 'Copper', phi: 4.65, color: 0xb87333, note: 'High φ; deep UV only.' },
  { id: 'ag', name: 'Silver', phi: 4.64, color: 0xc0c8d0, note: 'Similar to copper; UV cathode.' },
  { id: 'pt', name: 'Platinum', phi: 5.65, color: 0xa8b0b8, note: 'Highest φ here; extreme UV.' },
];

export function thresholdNm(phiEv) {
  return HC_EV_NM / phiEv;
}

export function thresholdHz(phiEv) {
  return phiEv / H_EV_S;
}

// Einstein photoelectric equation: K_max = hf - φ = e V_s
export function photoResult(lambdaNm, phiEv, intensity = 1, voltage = 0) {
  const E = photonEnergyEv(lambdaNm);
  const f = frequencyHz(lambdaNm);
  const above = E > phiEv;
  const Kmax = above ? E - phiEv : 0;
  const Vs = Kmax; // stopping potential in volts (Kmax in eV)
  // Retarding voltage: current flows only while V < Vs (for V defined positive retarding)
  const currentOn = above && voltage < Vs - 1e-9;
  // Photocurrent ∝ intensity when above threshold (idealized; no saturation model beyond clamp)
  const I = currentOn ? intensity : 0;
  return {
    lambdaNm, E, f, phiEv, above, Kmax, Vs,
    voltage, intensity, current: I,
    electronsPerSec: I > 0 ? I * 1e12 : 0, // arbitrary visual scale
  };
}

// ---------------- Photosynthesis pigments ----------------
// Absorption approximated as sum of Gaussians in wavelength (nm).
// Peaks roughly match in vivo chlorophyll a/b and carotenoids.

export const PIGMENTS = [
  {
    id: 'chlA',
    name: 'Chlorophyll a',
    color: 0x2d8a4e,
    peaks: [
      { nm: 430, sigma: 18, amp: 1.0 },
      { nm: 662, sigma: 14, amp: 0.85 },
    ],
    role: 'Primary reaction-center pigment of PSI and PSII.',
  },
  {
    id: 'chlB',
    name: 'Chlorophyll b',
    color: 0x5cb85c,
    peaks: [
      { nm: 455, sigma: 18, amp: 0.9 },
      { nm: 640, sigma: 14, amp: 0.7 },
    ],
    role: 'Accessory pigment; shifts absorbed energy to Chl a.',
  },
  {
    id: 'carot',
    name: 'Carotenoids',
    color: 0xe8a838,
    peaks: [
      { nm: 450, sigma: 28, amp: 0.75 },
      { nm: 480, sigma: 22, amp: 0.65 },
    ],
    role: 'Absorb blue-green; photoprotect and funnel energy to Chl.',
  },
];

function gauss(x, mu, sigma) {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z);
}

export function pigmentAbsorb(pigment, lambdaNm) {
  let a = 0;
  for (const p of pigment.peaks) a += p.amp * gauss(lambdaNm, p.nm, p.sigma);
  return a;
}

export function leafAbsorb(lambdaNm, mix = { chlA: 1, chlB: 0.55, carot: 0.4 }) {
  let a = 0;
  for (const pig of PIGMENTS) {
    const w = mix[pig.id] ?? 0;
    a += w * pigmentAbsorb(pig, lambdaNm);
  }
  return Math.min(a, 1.35);
}

// McCree-like relative quantum yield of photosynthesis vs wavelength (land plants).
// Peaks in red and blue; green trough; drops hard below ~400 and above ~700.
export function quantumYield(lambdaNm) {
  if (lambdaNm < 380 || lambdaNm > 720) return 0;
  const blue = 0.75 * gauss(lambdaNm, 450, 35);
  const red = 1.0 * gauss(lambdaNm, 620, 45);
  const greenDip = 1 - 0.35 * gauss(lambdaNm, 550, 40);
  let y = (blue + red) * greenDip;
  if (lambdaNm > 680) y *= Math.max(0, 1 - (lambdaNm - 680) / 45);
  if (lambdaNm < 420) y *= Math.max(0, (lambdaNm - 380) / 40);
  return Math.min(Math.max(y, 0), 1);
}

export function actionSpectrum(lambdaNm, intensity = 1, mix) {
  const abs = leafAbsorb(lambdaNm, mix);
  const qy = quantumYield(lambdaNm);
  // Relative photosynthetic rate ∝ absorbed quanta × quantum yield × intensity
  const rate = abs * qy * intensity;
  const E = photonEnergyEv(lambdaNm);
  return { lambdaNm, absorb: abs, quantumYield: qy, rate, energyEv: E };
}

// Sample a spectrum array for plotting / bars
export function sampleSpectrum(fn, lo = 380, hi = 720, step = 5) {
  const out = [];
  for (let nm = lo; nm <= hi; nm += step) out.push({ nm, v: fn(nm) });
  return out;
}
