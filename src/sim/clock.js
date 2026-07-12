import { jdFromUnixMs, J2000_JD, DAYS_PER_CENTURY } from './constants.js';

// JS Date only covers +-8.64e15 ms from epoch; clamp so a runaway fast-forward
// cannot turn the readout into NaN
const DATE_LIMIT_MS = 8.64e15;
function clampDateMs(ms) {
  return Math.min(Math.max(ms, -DATE_LIMIT_MS), DATE_LIMIT_MS);
}

// Simulation clock. rate = simulated seconds per real second (negative runs backward).
export class SimClock {
  constructor() {
    this.simMs = Date.now();
    this.rate = 86400; // 1 day per second by default so motion is immediately visible
    this.paused = false;
  }

  advance(dtRealSec) {
    if (!this.paused) this.simMs = clampDateMs(this.simMs + dtRealSec * this.rate * 1000);
  }

  get jd() {
    return jdFromUnixMs(this.simMs);
  }

  get daysSinceJ2000() {
    return this.jd - J2000_JD;
  }

  get centuries() {
    return (this.jd - J2000_JD) / DAYS_PER_CENTURY;
  }

  get date() {
    return new Date(this.simMs);
  }

  setNow() {
    this.simMs = Date.now();
  }

  setDate(ms) {
    this.simMs = clampDateMs(ms);
  }

  isLive() {
    return !this.paused && this.rate === 1 && Math.abs(this.simMs - Date.now()) < 5000;
  }
}
