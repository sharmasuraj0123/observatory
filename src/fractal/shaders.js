// Museum-grade fractal shaders: fullscreen NDC quads, IQ-style palettes,
// smooth potential + exterior distance, and lit DE raymarching.

export const VERT_FULLSCREEN = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMMON = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uGamma;

vec3 tonemap(vec3 c) {
  c *= uExposure;
  // Keep deep blacks; compress only the highlights
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = c * (1.0 + luma * 0.35) / (1.0 + luma);
  return pow(max(c, 0.0), vec3(1.0 / uGamma));
}

vec3 palIQ(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.2831853 * (c * t + d));
}

vec3 palette(float t, int mode) {
  t = fract(t);
  if (mode == 1) {
    // ember / magma
    return palIQ(t, vec3(0.5, 0.2, 0.05), vec3(0.5, 0.35, 0.15), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.15, 0.3));
  }
  if (mode == 2) {
    // aurora
    return palIQ(t, vec3(0.2, 0.45, 0.55), vec3(0.45, 0.4, 0.35), vec3(1.0, 1.2, 0.9), vec3(0.0, 0.25, 0.45));
  }
  if (mode == 3) {
    // ice / electric
    return palIQ(t, vec3(0.15, 0.25, 0.55), vec3(0.4, 0.45, 0.45), vec3(1.0, 0.9, 0.7), vec3(0.1, 0.3, 0.5));
  }
  if (mode == 4) {
    // gold / royal
    return palIQ(t, vec3(0.55, 0.4, 0.2), vec3(0.45, 0.35, 0.25), vec3(1.0, 0.85, 0.6), vec3(0.0, 0.2, 0.4));
  }
  if (mode == 5) {
    // neon night
    return palIQ(t, vec3(0.35, 0.15, 0.55), vec3(0.5, 0.4, 0.4), vec3(1.2, 0.9, 1.0), vec3(0.0, 0.33, 0.67));
  }
  // plasma default (Inigo classic)
  return palIQ(t, vec3(0.5), vec3(0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
`;

export const FRAG_ESCAPE = /* glsl */ `
${COMMON}
uniform vec2 uCenter;
uniform float uScale;
uniform int uMaxIter;
uniform float uPower;
uniform float uBailout;
uniform int uKind;       // 0 mandel 1 julia 2 burning 3 newton
uniform vec2 uJulia;
uniform int uPalette;
uniform int uTrap;       // 0 none 1 circle 2 cross 3 dots
uniform float uColorScale;
uniform float uColorShift;
uniform bool uSmooth;
uniform vec2 uProbe;
uniform bool uShowProbe;
uniform float uGlow;

vec2 cMul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 cPowN(vec2 z, float n) {
  float r = length(z);
  if (r < 1e-14) return vec2(0.0);
  float a = atan(z.y, z.x);
  float rn = pow(r, n);
  return rn * vec2(cos(a * n), sin(a * n));
}

vec3 sampleFractal(vec2 frag) {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 uv = (frag / uResolution - 0.5) * vec2(aspect, 1.0);

  vec2 c = uCenter + uv * (uScale * 2.0);
  vec2 z = (uKind == 1) ? c : vec2(0.0);
  vec2 seed = (uKind == 1) ? uJulia : c;

  float trapMin = 1e9;
  float iterF = 0.0;
  int escaped = 0;
  int rootId = 0;
  float dzMag = 1.0;

  if (uKind == 3) {
    z = c;
    for (int i = 0; i < 96; i++) {
      if (i >= uMaxIter) break;
      vec2 z2 = cMul(z, z);
      vec2 z3 = cMul(z2, z);
      vec2 num = z3 - vec2(1.0, 0.0);
      vec2 den = 3.0 * z2;
      float d2 = dot(den, den);
      if (d2 < 1e-20) break;
      z -= vec2(dot(num, den), num.y * den.x - num.x * den.y) / d2;
      if (length(num) < 1e-6) {
        float a0 = length(z - vec2(1.0, 0.0));
        float a1 = length(z - vec2(-0.5, 0.8660254));
        float a2 = length(z - vec2(-0.5, -0.8660254));
        rootId = (a0 <= a1 && a0 <= a2) ? 0 : (a1 <= a2 ? 1 : 2);
        iterF = float(i);
        escaped = 1;
        break;
      }
      iterF = float(i);
    }
  } else {
    // track dz for distance estimate (power 2 analytic; approx for others)
    vec2 dz = vec2(1.0, 0.0);
    for (int i = 0; i < 2048; i++) {
      if (i >= uMaxIter) break;
      if (uKind == 2) {
        z = vec2(abs(z.x), abs(z.y));
      }
      if (uPower < 2.5) {
        // z^2 + c with derivative: dz <- 2 z dz
        dz = 2.0 * cMul(z, dz);
        if (uKind != 1) dz += vec2(1.0, 0.0); // d/dc for Mandelbrot
        z = cMul(z, z) + seed;
      } else {
        z = cPowN(z, uPower) + seed;
        dzMag *= uPower * max(length(z - seed), 1e-6);
      }
      float r2 = dot(z, z);

      if (uTrap == 1) trapMin = min(trapMin, abs(length(z) - 0.5));
      else if (uTrap == 2) trapMin = min(trapMin, min(abs(z.x), abs(z.y)));
      else if (uTrap == 3) {
        vec2 g = abs(fract(z * 0.5) - 0.5);
        trapMin = min(trapMin, length(g));
      }

      if (r2 > uBailout) {
        float r = sqrt(r2);
        if (uSmooth) {
          float nu = log(log(r) / log(2.0)) / log(2.0);
          iterF = float(i) + 1.0 - nu;
        } else {
          iterF = float(i);
        }
        if (uPower < 2.5) dzMag = length(dz);
        escaped = 1;
        break;
      }
      iterF = float(i);
    }
  }

  vec3 col = vec3(0.0);

  if (uKind == 3) {
    vec3 roots[3];
    roots[0] = vec3(0.95, 0.32, 0.38);
    roots[1] = vec3(0.25, 0.85, 0.55);
    roots[2] = vec3(0.35, 0.45, 0.98);
    float shade = escaped == 1
      ? 0.25 + 0.75 * pow(1.0 - iterF / float(max(uMaxIter, 1)), 0.55)
      : 0.06;
    col = roots[rootId] * shade;
    col += roots[rootId] * 0.15 * uGlow;
  } else if (escaped == 0) {
    // deep interior
    col = vec3(0.0);
  } else {
    // Dual mapping: raw smooth iter for band density + normalized for depth cues
    float tn = clamp(iterF / float(max(uMaxIter, 1)), 0.0, 1.0);
    float t = (0.045 * iterF + 0.55 * pow(tn, 0.5)) * uColorScale + uColorShift;
    t += uTime * 0.01;
    col = palette(t, uPalette);

    float r = max(length(z), 1e-6);
    float de = 0.5 * r * log(r) / max(dzMag, 1e-8);
    float edge = exp(-1600.0 * de / max(uScale, 1e-9));
    col += vec3(0.85, 0.9, 1.0) * edge * 0.45 * uGlow;

    if (uTrap > 0 && trapMin < 1e8) {
      float trap = exp(-14.0 * trapMin);
      col = mix(col, vec3(1.0, 0.94, 0.75), trap * 0.55);
    }

    // Keep far field slightly dimmer so the set reads as the subject
    float near = smoothstep(0.0, 0.08, tn);
    col *= 0.55 + 0.45 * near;
  }

  float vig = smoothstep(1.35, 0.2, length(uv));
  col *= 0.35 + 0.65 * vig;

  // probe
  if (uShowProbe) {
    vec2 pc = (uProbe - uCenter) / max(uScale * 2.0, 1e-12);
    pc.x /= aspect;
    float d = length(uv - pc);
    float cross = max(
      step(abs(uv.x - pc.x), 0.0012) * step(abs(uv.y - pc.y), 0.028),
      step(abs(uv.y - pc.y), 0.0012) * step(abs(uv.x - pc.x), 0.028)
    );
    float ring = smoothstep(0.016, 0.011, d) - smoothstep(0.011, 0.007, d);
    col = mix(col, vec3(1.0, 0.92, 0.55), clamp(cross + ring * 0.9, 0.0, 1.0));
  }

  return col;
}

void main() {
  vec3 col = sampleFractal(gl_FragCoord.xy);
  gl_FragColor = vec4(tonemap(col), 1.0);
}
`;

export const FRAG_RAY = /* glsl */ `
${COMMON}
uniform int uMaxIter;
uniform float uPower;
uniform float uBailout;
uniform int uKind; // 0 mandelbulb 1 quat julia
uniform vec4 uJuliaQ;
uniform int uPalette;
uniform float uCamTheta;
uniform float uCamPhi;
uniform float uCamDist;
uniform float uGlow;

float mandelbulbDE(vec3 pos, out float trap) {
  vec3 z = pos;
  float dr = 1.0;
  float r = 0.0;
  trap = 1e9;
  float power = max(uPower, 2.0);
  for (int i = 0; i < 96; i++) {
    if (i >= uMaxIter) break;
    r = length(z);
    if (r > uBailout) break;
    trap = min(trap, r);
    float theta = acos(clamp(z.z / max(r, 1e-8), -1.0, 1.0));
    float phi = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    float zr = pow(r, power);
    theta *= power;
    phi *= power;
    z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta));
    z += pos;
  }
  return 0.5 * log(max(r, 1e-8)) * r / max(dr, 1e-8);
}

vec4 qMul(vec4 a, vec4 b) {
  return vec4(
    a.x*b.x - a.y*b.y - a.z*b.z - a.w*b.w,
    a.x*b.y + a.y*b.x + a.z*b.w - a.w*b.z,
    a.x*b.z - a.y*b.w + a.z*b.x + a.w*b.y,
    a.x*b.w + a.y*b.z - a.z*b.y + a.w*b.x
  );
}

float quatJuliaDE(vec3 pos, out float trap) {
  vec4 z = vec4(pos, 0.0);
  float dr = 1.0;
  float r = 0.0;
  trap = 1e9;
  for (int i = 0; i < 48; i++) {
    if (i >= uMaxIter) break;
    r = length(z);
    if (r > uBailout) break;
    trap = min(trap, r);
    dr = 2.0 * r * dr + 1.0;
    z = qMul(z, z) + uJuliaQ;
  }
  return 0.5 * log(max(r, 1e-8)) * r / max(dr, 1e-8);
}

float mapScene(vec3 p, out float trap) {
  if (uKind == 1) return quatJuliaDE(p, trap);
  return mandelbulbDE(p, trap);
}

vec3 calcNormal(vec3 p) {
  float e = 0.0008;
  float t;
  float d = mapScene(p, t);
  return normalize(vec3(
    mapScene(p + vec3(e, 0.0, 0.0), t) - d,
    mapScene(p + vec3(0.0, e, 0.0), t) - d,
    mapScene(p + vec3(0.0, 0.0, e), t) - d
  ));
}

float softShadow(vec3 ro, vec3 rd, float mint, float maxt) {
  float res = 1.0;
  float t = mint;
  float trap;
  for (int i = 0; i < 48; i++) {
    float h = mapScene(ro + rd * t, trap);
    res = min(res, 12.0 * h / t);
    t += clamp(h, 0.01, 0.2);
    if (res < 0.05 || t > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 uv = (gl_FragCoord.xy / uResolution - 0.5) * vec2(aspect, 1.0);

  float ct = cos(uCamTheta), st = sin(uCamTheta);
  float cp = cos(uCamPhi), sp = sin(uCamPhi);
  vec3 ro = vec3(uCamDist * st * cp, uCamDist * ct, uCamDist * st * sp);
  vec3 ta = vec3(0.0, 0.0, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  float fov = 1.55;
  vec3 rd = normalize(uu * uv.x + vv * uv.y + ww * fov);

  float t = 0.0;
  float trap = 1e9;
  float hit = 0.0;
  vec3 p = ro;
  float minTrap = 1e9;
  for (int i = 0; i < 160; i++) {
    p = ro + rd * t;
    float d = mapScene(p, trap);
    minTrap = min(minTrap, trap);
    if (d < 0.001 * t * 0.5 + 0.0008) { hit = 1.0; break; }
    t += clamp(d, 0.0015, 0.28);
    if (t > 14.0) break;
  }

  // rich void backdrop
  float neb = 0.5 + 0.5 * sin(uv.x * 2.2 + uTime * 0.07) * cos(uv.y * 1.7 - uTime * 0.05);
  vec3 col = vec3(0.02, 0.015, 0.04);
  col += palette(neb * 0.2 + 0.08 + uTime * 0.01, uPalette) * 0.07;
  col += palette(0.35 + uTime * 0.02, uPalette) * exp(-minTrap * 2.2) * 0.18 * uGlow;

  if (hit > 0.5) {
    vec3 n = calcNormal(p);
    vec3 l1 = normalize(vec3(0.55, 0.85, 0.25));
    vec3 l2 = normalize(vec3(-0.65, 0.15, -0.55));
    float sh = softShadow(p + n * 0.01, l1, 0.02, 4.0);
    float diff1 = max(dot(n, l1), 0.0);
    float diff2 = max(dot(n, l2), 0.0) * 0.45;
    float fre = pow(1.0 - max(dot(n, -rd), 0.0), 2.8);
    float ao = clamp(minTrap * 0.95, 0.15, 1.0);
    float orbit = clamp(1.0 - minTrap * 0.55, 0.0, 1.0);
    float hue = orbit * 1.45 + p.y * 0.4 + length(p.xy) * 0.22 + uTime * 0.02;
    vec3 base = palette(hue, uPalette);
    vec3 base2 = palette(hue + 0.35, uPalette);
    base = mix(base, base2, 0.4 * (1.0 - ao));
    col = base * (0.1 + 0.9 * (diff1 * sh + diff2)) * ao;
    col += fre * mix(vec3(0.55, 0.75, 1.15), base, 0.35) * 0.75 * uGlow;
    float wrap = max(dot(n, l1) * 0.5 + 0.5, 0.0);
    col += base * wrap * 0.18 * (1.0 - ao);
    vec3 h = normalize(l1 - rd);
    col += pow(max(dot(n, h), 0.0), 56.0) * vec3(1.0, 0.96, 0.88) * 0.42 * sh;
  }

  float vig = smoothstep(1.3, 0.2, length(uv));
  col *= 0.45 + 0.55 * vig;
  gl_FragColor = vec4(tonemap(col), 1.0);
}
`;

export const FRAG_IFS = /* glsl */ `
${COMMON}
uniform sampler2D uPoints;
uniform float uPointCount;
uniform float uPointSize;
uniform int uPalette;
uniform float uGlow;
uniform mat3 uView;

// IFS rendered as soft density splat from a point texture is heavy;
// instead we use a chaos-game in the fragment for a few classic systems.
uniform int uKind; // 0 fern 1 sierpinski 2 dragon 3 maple
uniform float uQuality; // iterations per pixel budget hint

vec2 affine(vec2 p, float a, float b, float c, float d, float e, float f) {
  return vec2(a * p.x + b * p.y + c, d * p.x + e * p.y + f);
}

vec2 ifsStep(vec2 p, float rnd, int kind) {
  if (kind == 1) {
    // sierpinski
    if (rnd < 0.333) return 0.5 * p;
    if (rnd < 0.666) return 0.5 * p + vec2(0.5, 0.0);
    return 0.5 * p + vec2(0.25, 0.433);
  }
  if (kind == 2) {
    if (rnd < 0.5) return affine(p, 0.5, -0.5, 0.0, 0.5, 0.5, 0.0);
    return affine(p, -0.5, -0.5, 1.0, 0.5, -0.5, 0.0);
  }
  if (kind == 3) {
    if (rnd < 0.1) return affine(p, 0.14, 0.01, -0.08, 0.0, 0.51, -1.31);
    if (rnd < 0.45) return affine(p, 0.43, 0.52, 1.49, -0.45, 0.5, -0.75);
    if (rnd < 0.8) return affine(p, 0.45, -0.49, -1.62, 0.47, 0.47, -0.74);
    return affine(p, 0.49, 0.0, 0.02, 0.0, 0.51, 1.62);
  }
  // barnsley fern
  if (rnd < 0.01) return affine(p, 0.0, 0.0, 0.0, 0.0, 0.16, 0.0);
  if (rnd < 0.86) return affine(p, 0.85, 0.04, 0.0, -0.04, 0.85, 1.6);
  if (rnd < 0.93) return affine(p, 0.2, -0.26, 0.0, 0.23, 0.22, 1.6);
  return affine(p, -0.15, 0.28, 0.0, 0.26, 0.24, 0.44);
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 uv = (gl_FragCoord.xy / uResolution - 0.5) * vec2(aspect, 1.0);

  // map screen to IFS domain
  vec2 domain;
  float zoom = 1.0;
  if (uKind == 0) { domain = uv * vec2(6.5, 11.0) + vec2(0.0, 5.0); zoom = 1.0; }
  else if (uKind == 1) { domain = uv * 1.35 + vec2(0.5, 0.35); }
  else if (uKind == 2) { domain = uv * 2.2 + vec2(0.5, 0.0); }
  else { domain = uv * 4.2; }

  // accumulate density via reverse: for each pixel, run chaos game and
  // measure visits near domain — forward splat approximation with many walks
  float dens = 0.0;
  float seed = hash21(gl_FragCoord.xy + uTime * 0.01);
  const int WALKS = 28;
  for (int w = 0; w < WALKS; w++) {
    vec2 p = vec2(0.0);
    float rnd = fract(seed + float(w) * 0.6180339);
    // warm-up
    for (int i = 0; i < 12; i++) {
      rnd = fract(rnd * 97.13 + 0.13);
      p = ifsStep(p, rnd, uKind);
    }
    for (int i = 0; i < 80; i++) {
      rnd = fract(rnd * 97.13 + 0.13);
      p = ifsStep(p, rnd, uKind);
      float d = length(p - domain);
      dens += exp(-d * d * 900.0);
    }
  }
  dens /= float(WALKS);

  vec3 base = palette(0.15 + dens * 0.8 + uTime * 0.01, uPalette);
  if (uKind == 0) base = mix(vec3(0.05, 0.12, 0.04), vec3(0.35, 0.95, 0.4), clamp(dens * 4.0, 0.0, 1.0));
  vec3 col = base * dens * 14.0 * uGlow;
  col += base * dens * dens * 8.0;

  // void + vignette
  col += vec3(0.008, 0.01, 0.02);
  float vig = smoothstep(1.25, 0.2, length(uv));
  col *= 0.4 + 0.6 * vig;

  gl_FragColor = vec4(tonemap(col), 1.0);
}
`;

export function paletteIndex(name) {
  const map = {
    plasma: 0, ember: 1, aurora: 2, ice: 3, gold: 4, neon: 5,
    triad: 0, fern: 2, autumn: 1,
  };
  return map[name] ?? 0;
}
