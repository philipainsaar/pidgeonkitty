"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * SNOW360 / Candy-Cloud Sky V1
 * Drop-in replacement for the V90 HDR-texture sky.
 *
 * - One lightweight procedural sky dome; NO .hdr downloads or external images.
 * - Same sky on the welcome screen and in the game.
 * - Large but distant whipped-cream clouds, candy-pink horizon, soft blue zenith.
 * - 360 degree revolution every 300 seconds of GAME time.
 * - Gentle pastel twilight starts at 5:00, completes at 5:45.
 * - Does not touch character, camera controls, snow, gameplay, or audio.
 */
export const SNOW360_SKY_ROTATION_SECONDS = 300;
export const SNOW360_NIGHT_START_SECONDS = 300;
export const SNOW360_NIGHT_FADE_SECONDS = 45;

const DAY_FOG = new THREE.Color("#d9e3f1");
const NIGHT_FOG = new THREE.Color("#a59dc7");

const SKY_VERTEX = /* glsl */ `
  varying vec2 vSkyUv;
  void main() {
    vSkyUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vSkyUv;
  uniform float uTime;
  uniform float uNightMix;

  #define PI 3.141592653589793
  #define TWO_PI 6.283185307179586

  float wrapDiff(float a, float b) {
    return fract(a - b + 0.5) - 0.5;
  }

  float puff(vec2 uv, vec2 center, vec2 size) {
    vec2 d = vec2(wrapDiff(uv.x, center.x), uv.y - center.y) / size;
    return 1.0 - smoothstep(0.78, 1.04, length(d));
  }

  // A single fluffy cloud has an irregular scalloped top and an almost flat base.
  // Soft union of overlapping rounded puffs; no sharp rectangles or texture seams.
  float whippedCloud(vec2 uv, float id, float drift, out float cloudHeight) {
    float cx = fract(0.074 + id * 0.173 + drift * (0.60 + 0.12 * sin(id * 3.1)));
    float cy = 0.585 + 0.075 * sin(id * 2.34 + 0.4);
    float w = 0.77 + 0.17 * sin(id * 4.3);
    float h = 0.82 + 0.15 * cos(id * 1.8);
    float a = puff(uv, vec2(cx - 0.047*w, cy - 0.009*h), vec2(0.031*w, 0.032*h));
    float b = puff(uv, vec2(cx - 0.025*w, cy + 0.013*h), vec2(0.039*w, 0.052*h));
    float c = puff(uv, vec2(cx + 0.007*w, cy + 0.023*h), vec2(0.044*w, 0.057*h));
    float d = puff(uv, vec2(cx + 0.038*w, cy + 0.008*h), vec2(0.042*w, 0.046*h));
    float e = puff(uv, vec2(cx + 0.058*w, cy - 0.010*h), vec2(0.028*w, 0.030*h));
    float coverage = max(max(max(a,b),max(c,d)),e);
    coverage *= smoothstep(cy - 0.036*h, cy - 0.024*h, uv.y);
    cloudHeight = smoothstep(cy - 0.020*h, cy + 0.063*h, uv.y);
    return coverage;
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }

  float candyStars(vec2 uv, float time) {
    // Sparse tiny 4-point pearly star glints, not large stickers.
    vec2 cells = uv * vec2(94.0, 27.0);
    vec2 id = floor(cells);
    vec2 f = fract(cells) - 0.5;
    float seed = hash21(id);
    vec2 center = vec2(hash21(id + 2.9),hash21(id + 8.2)) * 0.60 - 0.30;
    f -= center;
    float cross = exp(-abs(f.x)*65.0) * exp(-abs(f.y)*9.0)
                + exp(-abs(f.y)*65.0) * exp(-abs(f.x)*9.0);
    float twinkle = 0.40 + 0.60 * pow(0.5 + 0.5*sin(time * 1.7 + seed * 24.0), 2.0);
    float shown = step(0.956, seed);
    return min(1.0, cross) * twinkle * shown;
  }

  void main() {
    // SphereGeometry's repeating U keeps clouds seamless while the sphere spins.
    vec2 uv = vec2(fract(vSkyUv.x), clamp(vSkyUv.y, 0.0, 1.0));
    float h = uv.y;
    float twilight = smoothstep(0.0, 1.0, uNightMix);

    // Deliberately more colorful than V90: the difference is visible immediately.
    vec3 horizon = vec3(1.000, 0.820, 0.875);  // strawberry milk
    vec3 peach   = vec3(1.000, 0.898, 0.828);  // peach ice cream
    vec3 lilac   = vec3(0.840, 0.807, 0.972);  // lilac sorbet
    vec3 blue    = vec3(0.610, 0.826, 0.988);  // cotton-candy blue
    vec3 zenith  = vec3(0.515, 0.748, 0.965);  // soft sky blue

    vec3 color = mix(horizon, lilac, smoothstep(0.37, 0.69, h));
    color = mix(color, blue, smoothstep(0.57, 0.86, h));
    color = mix(color, zenith, smoothstep(0.77, 1.0, h) * 0.65);
    color = mix(color, peach, 0.28 * (1.0 - smoothstep(0.36, 0.57, h)));

    // Layers of distant fluffy pink/cream cloud-haze around the horizon.
    float bankWave = sin(uv.x * TWO_PI * 7.0 + uTime * 0.011) * 0.013
                   + sin(uv.x * TWO_PI * 13.0 - uTime * 0.006) * 0.005;
    float bank = 1.0 - smoothstep(0.454 + bankWave, 0.545 + bankWave, h);
    vec3 bankColor = mix(vec3(1.0, 0.865, 0.922), vec3(1.0, 0.958, 0.977),
                         smoothstep(0.41, 0.535, h));
    color = mix(color, bankColor, bank * 0.47);

    // Small distinct whipped-cream clouds with pastel lavender undersides.
    float drift = uTime * 0.000013;
    for (int i = 0; i < 8; i++) {
      float cloudHeight;
      float mask = whippedCloud(uv, float(i), drift, cloudHeight);
      vec3 shadow = vec3(0.902, 0.836, 0.967);
      vec3 cream = vec3(1.000, 0.990, 0.997);
      vec3 cloudColor = mix(shadow, cream, cloudHeight);
      cloudColor = mix(cloudColor, vec3(1.0, 0.936, 0.960), 0.17 * sin(float(i)*3.2)*sin(float(i)*3.2));
      color = mix(color, cloudColor, mask * 0.94);
    }

    // Large soft warm pearl glow, without a hard-edged flat sun graphic.
    vec2 sun = vec2(wrapDiff(uv.x, 0.73) / 0.12, (uv.y - 0.74) / 0.18);
    float glow = exp(-dot(sun,sun) * 1.12);
    color += vec3(0.085,0.058,0.062) * glow;

    // After five minutes it becomes an equally cute lavender twilight.
    vec3 dusk = mix(vec3(0.652,0.535,0.781), vec3(0.316,0.407,0.666),
                    smoothstep(0.45,0.94,h));
    color = mix(color, dusk, twilight * 0.84);
    float stars = candyStars(uv, uTime);
    color += vec3(0.89,0.96,1.0) * stars * (0.18 + 0.82 * twilight);
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color,1.0);
    #include <colorspace_fragment>
  }
`;

function fadeValue(seconds) {
  const t = THREE.MathUtils.clamp(
    (seconds - SNOW360_NIGHT_START_SECONDS) / SNOW360_NIGHT_FADE_SECONDS,
    0, 1
  );
  return t * t * (3 - 2 * t);
}

export default function Snow64HDRSky({ stateRef, mobile = false }) {
  const { camera, scene } = useThree();
  const dome = useRef(null);

  const geometry = useMemo(
    () => new THREE.SphereGeometry(171, mobile ? 32 : 48, mobile ? 20 : 28),
    [mobile]
  );

  const material = useMemo(() => new THREE.ShaderMaterial({
    name: "SNOW360 / Candy-Cloud Sky V1",
    uniforms: {
      uTime: { value: 0 },
      uNightMix: { value: 0 },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    transparent: false,
    toneMapped: false,
  }), []);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    // Game time pauses with the game and resets on a new run. Welcome uses its
    // own intro time ref, so the SAME sky also shows behind the start castle.
    const seconds = Math.max(0, Number(stateRef?.current?.t) || 0);
    if (dome.current) {
      dome.current.position.copy(camera.position);
      dome.current.rotation.y = -TWO_PI * ((seconds % SNOW360_SKY_ROTATION_SECONDS) / SNOW360_SKY_ROTATION_SECONDS);
    }
    material.uniforms.uTime.value = seconds;
    const nightMix = fadeValue(seconds);
    material.uniforms.uNightMix.value = nightMix;
    if (scene.fog) scene.fog.color.lerpColors(DAY_FOG, NIGHT_FOG, nightMix);
  });

  return (
    <mesh
      ref={dome}
      name="SNOW360 Candy-Cloud Pastel Sky V1"
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-1000}
      castShadow={false}
      receiveShadow={false}
    />
  );
}

const TWO_PI = Math.PI * 2;
