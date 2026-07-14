// Fractals Lab: immersive fullscreen explorer.
// Escape + ray families are NDC-filling GPU shaders; IFS is a dense additive
// particle cloud in a void stage. No billboards, no floor props.

import * as THREE from 'three';
import { getPreset, PRESETS } from './presets.js';
import { VERT_FULLSCREEN, FRAG_ESCAPE, FRAG_RAY, paletteIndex } from './shaders.js';
import { generateIFS, IFS_DIM } from './ifs.js';
import { escapeProbe, fmtComplex } from './fractals.js';

const KIND_CODE = { mandelbrot: 0, julia: 1, burning: 2, newton: 3 };
const RAY_KIND = { mandelbulb: 0, quatjulia: 1 };
const TRAP_CODE = { none: 0, circle: 1, cross: 2, dots: 3 };

// Crisp disc for IFS: hard core, thin edge. Soft glow maps look blurry.
function sharpDotTexture() {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,1)');
  g.addColorStop(0.78, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.15)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

const SHARP_DOT = sharpDotTexture();

const IFS_VERT = /* glsl */ `
attribute vec3 color;
uniform float uSize;
uniform float uScale;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // Pixel-locked size: sharp at every camera distance
  gl_PointSize = clamp(uSize * uScale * (300.0 / max(-mv.z, 1.0)), 1.0, 6.0);
  gl_Position = projectionMatrix * mv;
}
`;

const IFS_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
varying vec3 vColor;
void main() {
  vec4 m = texture2D(uMap, gl_PointCoord);
  float a = m.a;
  // Hard discard keeps the attractor in focus instead of a soft haze
  if (a < 0.18) discard;
  a = smoothstep(0.18, 0.55, a);
  gl_FragColor = vec4(vColor * a, a);
}
`;

function makeFullscreenQuad(material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return mesh;
}

export class FractalLab {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.escapeUniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uExposure: { value: 0.95 },
      uGamma: { value: 2.0 },
      uCenter: { value: new THREE.Vector2(-0.5, 0) },
      uScale: { value: 1.25 },
      uMaxIter: { value: 360 },
      uPower: { value: 2 },
      uBailout: { value: 256 },
      uKind: { value: 0 },
      uJulia: { value: new THREE.Vector2(-0.8, 0.156) },
      uPalette: { value: 0 },
      uTrap: { value: 0 },
      uColorScale: { value: 1 },
      uColorShift: { value: 0 },
      uSmooth: { value: true },
      uProbe: { value: new THREE.Vector2(0, 0) },
      uShowProbe: { value: false },
      uGlow: { value: 1.1 },
    };
    this.escapeMat = new THREE.ShaderMaterial({
      uniforms: this.escapeUniforms,
      vertexShader: VERT_FULLSCREEN,
      fragmentShader: FRAG_ESCAPE,
      depthTest: false,
      depthWrite: false,
    });
    this.escapeQuad = makeFullscreenQuad(this.escapeMat);
    this.group.add(this.escapeQuad);

    this.rayUniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uExposure: { value: 1.1 },
      uGamma: { value: 1.85 },
      uMaxIter: { value: 72 },
      uPower: { value: 8 },
      uBailout: { value: 4 },
      uKind: { value: 0 },
      uJuliaQ: { value: new THREE.Vector4(-0.2, 0.6, 0.2, 0.2) },
      uPalette: { value: 0 },
      uCamTheta: { value: 0.55 },
      uCamPhi: { value: 0.85 },
      uCamDist: { value: 3.0 },
      uGlow: { value: 1.2 },
    };
    this.rayMat = new THREE.ShaderMaterial({
      uniforms: this.rayUniforms,
      vertexShader: VERT_FULLSCREEN,
      fragmentShader: FRAG_RAY,
      depthTest: false,
      depthWrite: false,
    });
    this.rayQuad = makeFullscreenQuad(this.rayMat);
    this.rayQuad.visible = false;
    this.group.add(this.rayQuad);

    // IFS void stage
    this.ifsGroup = new THREE.Group();
    this.ifsGroup.visible = false;
    this.group.add(this.ifsGroup);
    this.ifsGroup.add(new THREE.AmbientLight(0x304060, 0.35));
    const rim = new THREE.PointLight(0x88aaff, 1.4, 120, 1.6);
    rim.position.set(12, 18, 20);
    this.ifsGroup.add(rim);
    this.ifsPoints = null;
    this._ifsMeta = null;

    // Compatibility alias used by older main.js hit tests
    this.plane = this.escapeQuad;

    this.preset = null;
    this.family = 'escape';
    this.kind = 'mandelbrot';
    this.params = {};
    this.probe = null;
    this.onProbe = null;
    this.t = 0;
    this._zoomAnim = null;
    this.ifsGrowth = { on: false, u: 1, duration: 12, visible: 0 };

    this.loadPreset('mandel-classic');
  }

  listPresets() {
    return PRESETS;
  }

  loadPreset(id) {
    const p = getPreset(id);
    this.preset = p;
    this.family = p.family;
    this.kind = p.kind;
    this.params = {
      colorScale: 1,
      colorShift: 0,
      glow: 1.1,
      exposure: 0.95,
      autoOrbit: false,
      ...p.params,
    };
    this.probe = null;
    this.escapeUniforms.uShowProbe.value = false;
    this._zoomAnim = null;
    this.stopIFSGrowth({ showAll: true });
    this.applyParams();
    this.rebuildFamily();
  }

  setParam(key, value) {
    this.params[key] = value;
    this.applyParams();
    if (this.family === 'ifs' && (key === 'points' || key === 'palette' || key === 'size')) {
      if (key === 'size' && this.ifsPoints?.material?.uniforms?.uSize) {
        const count = this._ifsMeta?.count || this.params.points || 1000;
        const sizeBoost = count < 2000 ? 1 + (2000 - count) / 2000 * 2.2 : 1;
        this.ifsPoints.material.uniforms.uSize.value = value * sizeBoost;
      } else {
        this.rebuildIFS();
      }
    }
  }

  applyParams() {
    const p = this.params;
    if (this.family === 'escape') {
      this.escapeUniforms.uCenter.value.set(p.centerX ?? -0.5, p.centerY ?? 0);
      this.escapeUniforms.uScale.value = p.scale ?? 1.25;
      this.escapeUniforms.uMaxIter.value = Math.round(p.maxIter ?? 360);
      this.escapeUniforms.uPower.value = p.power ?? 2;
      this.escapeUniforms.uBailout.value = p.bailout ?? 256;
      this.escapeUniforms.uKind.value = KIND_CODE[this.kind] ?? 0;
      this.escapeUniforms.uJulia.value.set(p.juliaX ?? 0, p.juliaY ?? 0);
      this.escapeUniforms.uPalette.value = paletteIndex(p.palette);
      this.escapeUniforms.uTrap.value = TRAP_CODE[p.trap] ?? 0;
      this.escapeUniforms.uSmooth.value = p.smooth !== false;
      this.escapeUniforms.uColorScale.value = p.colorScale ?? 1;
      this.escapeUniforms.uColorShift.value = p.colorShift ?? 0;
      this.escapeUniforms.uGlow.value = p.glow ?? 1.1;
      this.escapeUniforms.uExposure.value = p.exposure ?? 0.95;
    } else if (this.family === 'ray') {
      this.rayUniforms.uMaxIter.value = Math.round(p.maxIter ?? 72);
      this.rayUniforms.uPower.value = p.power ?? 8;
      this.rayUniforms.uBailout.value = p.bailout ?? 4;
      this.rayUniforms.uKind.value = RAY_KIND[this.kind] ?? 0;
      this.rayUniforms.uJuliaQ.value.set(
        p.juliaX ?? -0.2, p.juliaY ?? 0.6, p.juliaZ ?? 0.2, p.juliaW ?? 0.2
      );
      this.rayUniforms.uPalette.value = paletteIndex(p.palette);
      this.rayUniforms.uCamTheta.value = p.camTheta ?? 0.55;
      this.rayUniforms.uCamPhi.value = p.camPhi ?? 0.85;
      this.rayUniforms.uCamDist.value = p.camDist ?? 3.0;
      this.rayUniforms.uGlow.value = p.glow ?? 1.15;
      this.rayUniforms.uExposure.value = p.exposure ?? 1.1;
    }
  }

  rebuildFamily() {
    this.escapeQuad.visible = this.family === 'escape';
    this.rayQuad.visible = this.family === 'ray';
    this.ifsGroup.visible = this.family === 'ifs';
    if (this.family === 'ifs') this.rebuildIFS();
  }

  rebuildIFS() {
    while (this.ifsGroup.children.length) {
      const c = this.ifsGroup.children[0];
      this.ifsGroup.remove(c);
      if (c.isLight) continue;
      c.geometry?.dispose?.();
      c.material?.dispose?.();
    }
    this.ifsGroup.add(new THREE.AmbientLight(0x203040, 0.25));

    const count = Math.min(Math.max(Math.round(this.params.points ?? 220000), 100), 320000);
    this.params.points = count;
    const data = generateIFS(this.kind, count, this.params.palette || 'fern');
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));

    // Sparse clouds need larger discs so 100 points still read clearly
    const sizeBoost = count < 2000 ? 1 + (2000 - count) / 2000 * 2.2 : 1;
    const pointSize = (this.params.size ?? 1.15) * sizeBoost;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: SHARP_DOT },
        uSize: { value: pointSize },
        uScale: { value: 1 },
      },
      vertexShader: IFS_VERT,
      fragmentShader: IFS_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    this.ifsPoints = new THREE.Points(geo, mat);
    this.ifsPoints.frustumCulled = false;
    this.ifsGroup.add(this.ifsPoints);
    this._ifsMeta = { count: data.count, dim: IFS_DIM[this.kind] ?? 1.5 };

    // Preserve growth mode across rebuilds when already animating
    if (this.ifsGrowth.on) {
      this.ifsGrowth.u = 0;
      this.ifsGrowth.visible = 0;
      geo.setDrawRange(0, 0);
    } else {
      this.ifsGrowth.u = 1;
      this.ifsGrowth.visible = data.count;
      geo.setDrawRange(0, data.count);
    }
  }

  setIFSVisibleCount(n) {
    const total = this._ifsMeta?.count || 0;
    const v = Math.max(0, Math.min(total, Math.floor(n)));
    this.ifsGrowth.visible = v;
    if (this.ifsPoints?.geometry) this.ifsPoints.geometry.setDrawRange(0, v);
  }

  startIFSGrowth({ replay = true } = {}) {
    if (this.family !== 'ifs' || !this.ifsPoints) return;
    if (replay) this.ifsGrowth.u = 0;
    this.ifsGrowth.on = true;
    // Duration scales gently with point count (sparse = short, dense = longer)
    const n = this._ifsMeta?.count || 1000;
    this.ifsGrowth.duration = Math.min(22, Math.max(6, 4 + Math.log10(n) * 4));
    this.setIFSVisibleCount(0);
  }

  stopIFSGrowth({ showAll = false } = {}) {
    this.ifsGrowth.on = false;
    if (showAll && this._ifsMeta) {
      this.ifsGrowth.u = 1;
      this.setIFSVisibleCount(this._ifsMeta.count);
    }
  }

  toggleIFSGrowth() {
    if (this.family !== 'ifs') return false;
    if (this.ifsGrowth.on) {
      this.stopIFSGrowth({ showAll: false });
      return false;
    }
    const done = (this.ifsGrowth.u >= 1) ||
      (this.ifsGrowth.visible >= (this._ifsMeta?.count || 0));
    this.startIFSGrowth({ replay: done || this.ifsGrowth.visible === 0 });
    return true;
  }

  isIFSGrowing() {
    return !!(this.ifsGrowth && this.ifsGrowth.on);
  }

  ifsGrowthProgress() {
    return {
      on: this.ifsGrowth.on,
      visible: this.ifsGrowth.visible,
      total: this._ifsMeta?.count || 0,
      u: this.ifsGrowth.u,
    };
  }

  setIFSPixelScale(dpr) {
    if (this.ifsPoints?.material?.uniforms?.uScale) {
      this.ifsPoints.material.uniforms.uScale.value = Math.min(Math.max(dpr || 1, 1), 2);
    }
  }

  setResolution(w, h) {
    this.escapeUniforms.uResolution.value.set(w, h);
    this.rayUniforms.uResolution.value.set(w, h);
  }

  // Screen pixel → complex plane (escape family)
  screenToComplex(clientX, clientY, viewW, viewH) {
    const aspect = viewW / Math.max(viewH, 1);
    const nx = (clientX / viewW - 0.5) * 2; // -1..1
    const ny = -(clientY / viewH - 0.5) * 2;
    const scale = this.params.scale ?? 1.25;
    const cx = this.params.centerX ?? 0;
    const cy = this.params.centerY ?? 0;
    return {
      re: cx + nx * 0.5 * aspect * scale * 2,
      im: cy + ny * 0.5 * scale * 2,
      nx,
      ny,
    };
  }

  // Legacy helper used by older hit-test path
  pointerToComplex(nx, ny) {
    const aspect = this.escapeUniforms.uResolution.value.x /
      Math.max(this.escapeUniforms.uResolution.value.y, 1);
    const scale = this.params.scale ?? 1.25;
    return {
      re: (this.params.centerX ?? 0) + nx * aspect * scale,
      im: (this.params.centerY ?? 0) + ny * scale,
    };
  }

  setProbe(re, im) {
    this.probe = { re, im };
    this.escapeUniforms.uProbe.value.set(re, im);
    this.escapeUniforms.uShowProbe.value = true;
    this.probe.result = escapeProbe({
      kind: this.kind,
      cRe: re,
      cIm: im,
      juliaX: this.params.juliaX,
      juliaY: this.params.juliaY,
      maxIter: this.params.maxIter,
      power: this.params.power,
      bailout: this.params.bailout,
    });
    if (this.onProbe) this.onProbe(this.probe);
    return this.probe;
  }

  clearProbe() {
    this.probe = null;
    this.escapeUniforms.uShowProbe.value = false;
    if (this.onProbe) this.onProbe(null);
  }

  pan(dRe, dIm) {
    if (this.family !== 'escape') return;
    this.params.centerX = (this.params.centerX ?? 0) - dRe;
    this.params.centerY = (this.params.centerY ?? 0) - dIm;
    this.applyParams();
  }

  zoomAt(factor, re, im, animate = false) {
    if (this.family !== 'escape') return;
    const ox = this.params.centerX ?? 0;
    const oy = this.params.centerY ?? 0;
    const s0 = this.params.scale ?? 1.25;
    const s1 = Math.min(Math.max(s0 * factor, 1e-14), 6);
    const cx = re + (ox - re) * (s1 / s0);
    const cy = im + (oy - im) * (s1 / s0);
    if (animate) {
      this._zoomAnim = {
        t: 0,
        dur: 0.35,
        s0, s1, ox, oy,
        cx0: ox, cy0: oy, cx1: cx, cy1: cy,
      };
    } else {
      this.params.centerX = cx;
      this.params.centerY = cy;
      this.params.scale = s1;
      // raise iterations slightly when deep
      if (s1 < 1e-4) this.params.maxIter = Math.max(this.params.maxIter ?? 360, 600);
      if (s1 < 1e-7) this.params.maxIter = Math.max(this.params.maxIter ?? 360, 900);
      this.applyParams();
    }
  }

  orbitRay(dTheta, dPhi) {
    if (this.family !== 'ray') return;
    this.params.camTheta = Math.min(Math.max((this.params.camTheta ?? 0.55) + dTheta, 0.08), Math.PI - 0.08);
    this.params.camPhi = (this.params.camPhi ?? 0.85) + dPhi;
    this.applyParams();
  }

  dollyRay(factor) {
    if (this.family !== 'ray') return;
    this.params.camDist = Math.min(Math.max((this.params.camDist ?? 3) * factor, 1.2), 9);
    this.applyParams();
  }

  update(dt) {
    this.t += dt;
    this.escapeUniforms.uTime.value = this.t;
    this.rayUniforms.uTime.value = this.t;

    if (this._zoomAnim) {
      const a = this._zoomAnim;
      a.t += dt;
      const u = Math.min(1, a.t / a.dur);
      const e = 1 - Math.pow(1 - u, 3);
      this.params.scale = a.s0 + (a.s1 - a.s0) * e;
      this.params.centerX = a.cx0 + (a.cx1 - a.cx0) * e;
      this.params.centerY = a.cy0 + (a.cy1 - a.cy0) * e;
      this.applyParams();
      if (u >= 1) this._zoomAnim = null;
    }

    if (this.family === 'ray' && this.params.autoOrbit) {
      this.params.camPhi = (this.params.camPhi ?? 0) + dt * 0.22;
      this.applyParams();
    }
    if (this.family === 'ifs' && this.ifsGrowth.on && this._ifsMeta) {
      this.ifsGrowth.u = Math.min(1, this.ifsGrowth.u + dt / this.ifsGrowth.duration);
      // Ease-in: sparse chaos-game early, density fills later (reads as growth)
      const e = this.ifsGrowth.u * this.ifsGrowth.u;
      this.setIFSVisibleCount(this._ifsMeta.count * e);
      if (this.ifsGrowth.u >= 1) this.ifsGrowth.on = false;
    }

    if (this.family === 'ifs' && this.ifsPoints) {
      // Slow yaw only; no pitch wobble (that reads as soft focus)
      this.ifsPoints.rotation.y = Math.sin(this.t * 0.08) * 0.04;
      this.ifsPoints.rotation.x = 0;
      this.ifsPoints.rotation.z = 0;
    }
  }

  status() {
    const p = this.params;
    if (this.family === 'escape') {
      return `${this.preset?.name || this.kind} · ${Number(p.scale).toExponential(2)} · ${p.maxIter} iter · ${fmtComplex(p.centerX ?? 0, p.centerY ?? 0, 4)}`;
    }
    if (this.family === 'ray') {
      return `${this.preset?.name || this.kind} · p=${p.power} · d=${Number(p.camDist).toFixed(2)}`;
    }
    return `${this.preset?.name || this.kind} · ${this.ifsGrowth.visible.toLocaleString()}/${(this._ifsMeta?.count || 0).toLocaleString()} pts${this.ifsGrowth.on ? ' · growing' : ''} · dim≈${(this._ifsMeta?.dim || 0).toFixed(2)}`;
  }

  analysis() {
    const p = this.params;
    const base = {
      family: this.family,
      kind: this.kind,
      name: this.preset?.name,
      blurb: this.preset?.blurb,
      params: { ...p },
    };
    if (this.family === 'escape') {
      return {
        ...base,
        center: fmtComplex(p.centerX ?? 0, p.centerY ?? 0),
        scale: p.scale,
        maxIter: p.maxIter,
        power: p.power,
        bailout: p.bailout,
        julia: this.kind === 'julia' ? fmtComplex(p.juliaX ?? 0, p.juliaY ?? 0) : null,
        probe: this.probe ? { z: fmtComplex(this.probe.re, this.probe.im), ...this.probe.result } : null,
      };
    }
    if (this.family === 'ray') {
      return {
        ...base,
        power: p.power,
        maxIter: p.maxIter,
        cam: { theta: p.camTheta, phi: p.camPhi, dist: p.camDist },
      };
    }
    return {
      ...base,
      points: this._ifsMeta?.count,
      visible: this.ifsGrowth?.visible ?? this._ifsMeta?.count,
      growing: this.ifsGrowth?.on ?? false,
      growthU: this.ifsGrowth?.u ?? 1,
      dimension: this._ifsMeta?.dim,
    };
  }

  // no-op kept for main.js compatibility
  setAspect() {}
}
