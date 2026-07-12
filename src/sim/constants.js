// Core physical and scene-scale constants.
// Scene convention: 1 AU = 1000 scene units, Y axis = ecliptic north, X axis = vernal equinox.

export const AU_KM = 149597870.7;
export const UNITS_PER_AU = 1000;
export const KM_TO_UNITS = UNITS_PER_AU / AU_KM;
export const J2000_JD = 2451545.0;
export const DAYS_PER_CENTURY = 36525;
export const GM_SUN = 1.32712440018e11; // km^3 / s^2
export const G_KM = 6.674e-20; // gravitational constant in km^3 / (kg s^2)
export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export function jdFromUnixMs(ms) {
  return ms / 86400000 + 2440587.5;
}

export function unixMsFromJd(jd) {
  return (jd - 2440587.5) * 86400000;
}

// Greenwich mean sidereal time in degrees for a given count of days since J2000.
export function gmstDeg(daysSinceJ2000) {
  return 280.46061837 + 360.98564736629 * daysSinceJ2000;
}
