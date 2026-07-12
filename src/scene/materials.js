// Custom shader materials. All custom shaders include the logdepthbuf chunks
// because the renderer runs with a logarithmic depth buffer (the scene spans
// from sub-unit planet surfaces to a starfield millions of units away).

import * as THREE from 'three';

const WORLD_VERTEX = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
    #include <logdepthbuf_vertex>
  }
`;

// Earth: blends day and night textures across the real terminator, adds an
// approximate ocean specular highlight and a blue atmospheric rim.
export function makeEarthMaterial(dayMap, nightMap) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDay: { value: dayMap },
      uNight: { value: nightMap },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: WORLD_VERTEX,
    fragmentShader: /* glsl */`
      uniform sampler2D uDay;
      uniform sampler2D uNight;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vPosW);
        float ndl = dot(N, uSunDir);
        float dayAmt = smoothstep(-0.12, 0.22, ndl);

        vec3 day = texture2D(uDay, vUv).rgb;
        vec3 nightTex = texture2D(uNight, vUv).rgb;
        vec3 night = nightTex * vec3(1.0, 0.82, 0.55) * 2.2 + day * 0.015;

        // approximate ocean mask from the day texture (water is blue-dominant)
        float ocean = smoothstep(0.01, 0.12, day.b - day.r);
        // guard the half vector: at exact sun-camera anti-alignment it is zero
        vec3 Hraw = uSunDir + V;
        vec3 H = Hraw / max(length(Hraw), 1e-4);
        float spec = pow(max(dot(N, H), 0.0), 48.0) * ocean * 0.55;

        vec3 lit = day * max(ndl, 0.0) * 1.35;
        float twilight = smoothstep(0.0, 0.28, ndl) * (1.0 - smoothstep(0.28, 0.62, ndl));
        lit *= mix(vec3(1.0), vec3(1.18, 0.94, 0.78), twilight * 0.65);
        lit += vec3(spec) * max(ndl, 0.0);

        float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);
        lit += vec3(0.22, 0.45, 0.95) * fres * (0.25 + 0.75 * dayAmt) * 0.55;

        vec3 col = mix(night, lit, dayAmt);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// Soft additive atmosphere halo rendered on an inflated back-facing shell.
export function makeAtmosphereMaterial({ color, power = 2.6, intensity = 1.0 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uPower: { value: power },
      uIntensity: { value: intensity },
    },
    vertexShader: WORLD_VERTEX,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform vec3 uSunDir;
      uniform float uPower;
      uniform float uIntensity;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec2 vUv;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vPosW);
        // Back faces: dot(N, V) runs from 0 at the silhouette to -1 behind the
        // planet's center, so -dot gives a halo that peaks at the limb side.
        float glow = pow(clamp(-dot(N, V), 0.0, 1.0), uPower);
        // mirror the back-face normal through the view axis so the day/night
        // response matches the front atmosphere the halo visually represents
        vec3 Nm = normalize(N - 2.0 * dot(N, V) * V);
        float sunAmt = clamp(dot(Nm, uSunDir) * 0.6 + 0.5, 0.0, 1.0);
        float a = glow * uIntensity * (0.12 + 0.88 * sunAmt);
        gl_FragColor = vec4(uColor * a * 1.6, a);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// Planetary rings: samples a radial strip texture, lights both faces, adds
// backlit translucency, and casts the planet's real shadow across the plane.
export function makeRingMaterial({ map, inner, outer, opacity = 1 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uInner: { value: inner },
      uOuter: { value: outer },
      uOpacity: { value: opacity },
      uPlanetPos: { value: new THREE.Vector3() },
      uPlanetR: { value: 1 },
      uNormalW: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: /* glsl */`
      varying vec3 vPosW;
      varying vec2 vLocal;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vLocal = position.xz;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform float uInner;
      uniform float uOuter;
      uniform float uOpacity;
      uniform vec3 uPlanetPos;
      uniform float uPlanetR;
      uniform vec3 uNormalW;
      varying vec3 vPosW;
      varying vec2 vLocal;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vLocal);
        float u = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        vec4 tex = texture2D(uMap, vec2(u, 0.5));
        if (tex.a < 0.02) discard;

        vec3 toSun = normalize(-vPosW); // the sun sits at the scene origin
        vec3 V = normalize(cameraPosition - vPosW);
        float ndl = dot(uNormalW, toSun);
        float sameSide = sign(dot(uNormalW, V)) * sign(ndl);
        float direct = clamp(abs(ndl), 0.0, 1.0);
        // lit face gets full light, far face gets scattered translucency
        float brightness = mix(0.38, 1.05, step(0.0, sameSide)) * direct + 0.05;

        // shadow of the planet across the ring plane
        vec3 pc = uPlanetPos - vPosW;
        float t = dot(pc, toSun);
        float shadow = 1.0;
        if (t > 0.0) {
          float d = length(pc - toSun * t);
          shadow = 1.0 - (1.0 - smoothstep(uPlanetR * 0.82, uPlanetR * 1.03, d)) * 0.93;
        }
        vec3 col = tex.rgb * brightness * shadow;
        gl_FragColor = vec4(col, tex.a * uOpacity);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
}

// Animated photosphere: photographic base modulated by drifting fractal noise,
// with limb darkening and an HDR boost that feeds the bloom pass.
export function makeSunMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uTime: { value: 0 },
      uIntensity: { value: 1.15 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vNormalO;
      varying vec3 vPosW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv;
        vNormalO = normal;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vNormalO;
      varying vec3 vPosW;
      #include <common>
      #include <logdepthbuf_pars_fragment>

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise3(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise3(p);
          p *= 2.03;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 p = normalize(vNormalO);
        float n1 = fbm(p * 4.0 + vec3(0.0, 0.0, uTime * 0.03));
        float n2 = fbm(p * 16.0 - vec3(0.0, uTime * 0.06, uTime * 0.02));
        vec3 tex = texture2D(uMap, vUv + vec2(uTime * 0.0012, 0.0)).rgb;

        float heat = clamp(tex.r * 0.6 + n1 * 0.55 + n2 * 0.4 - 0.26, 0.0, 1.3);
        vec3 col = mix(vec3(0.5, 0.09, 0.003), vec3(1.0, 0.47, 0.08), clamp(heat * 1.35, 0.0, 1.0));
        col = mix(col, vec3(1.0, 0.88, 0.58), clamp(pow(heat, 3.2), 0.0, 1.0));
        col += vec3(1.0, 0.8, 0.42) * pow(max(n2 - 0.4, 0.0), 2.0) * 2.2;

        vec3 V = normalize(cameraPosition - vPosW);
        float mu = clamp(dot(normalize(vNormalW), V), 0.0, 1.0);
        col *= 0.3 + 0.7 * pow(mu, 0.62); // limb darkening
        col += vec3(1.0, 0.45, 0.12) * pow(1.0 - mu, 3.0) * 0.7; // chromosphere rim

        gl_FragColor = vec4(col * uIntensity, 1.0);
      }
    `,
  });
}
