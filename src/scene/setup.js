// Renderer, camera, post-processing chain, starfield and base lighting.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export function createStage(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 8e6);
  camera.position.set(-1200, 1450, 3200);

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    logarithmicDepthBuffer: true,
    powerPreference: 'high-performance',
    // Needed so snapshot / video compositing can read the canvas after render.
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  // the placeholder size is corrected by composer.setSize below, which sizes
  // the target AND every pass at pixel-ratio-scaled resolution (hi-dpi correct)
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.75, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setSize(innerWidth, innerHeight);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(innerWidth, innerHeight);
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.2;
  controls.maxDistance = 250000;
  controls.zoomSpeed = 1.4;

  // Lighting: single point source at the sun plus a whisper of ambient fill
  const sunLight = new THREE.PointLight(0xfff4e5, 3.2, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x20242e, 0.35));

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight); // also resizes every pass at dpr scale
    labelRenderer.setSize(innerWidth, innerHeight);
  });

  return { scene, camera, renderer, composer, bloom, labelRenderer, controls };
}

export function softDotTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

// Subtle ecliptic reference grid, off by default.
export function createEclipticGrid(scene) {
  const grid = new THREE.PolarGridHelper(42000, 12, 14, 128, 0x2a3550, 0x1a2337);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.material.depthWrite = false;
  grid.visible = false;
  scene.add(grid);
  return grid;
}
