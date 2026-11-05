"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import * as THREE from "three";

/**
 * SNOW360 V90: restrained, open pastel HDR atmosphere.
 * Replaces oversized Big Air model silhouettes with tiny feathered
 * high-altitude wisps, subtle lavender-pink haze and clear blue sky.
 * No obvious standalone cloud objects or stickers on the sky sphere.
 *
 * 360-degree rotation per 300 GAMEPLAY seconds, full revolution every 5:00.
 * After 5:00, a 45-second gradual transition into night (complete 5:45).
 * The authoritative game time freezes when paused and resets on a new run.
 * Camera, gameplay physics, assets, snowfall and HUD are left untouched.
 */
export const SNOW360_SKY_ROTATION_SECONDS = 300;
export const SNOW360_NIGHT_START_SECONDS = 300;
export const SNOW360_NIGHT_FADE_SECONDS = 45;

const DAY_URL = "/sky/snow360-atmospheric-sky-day-v90.hdr";
const NIGHT_URL = "/sky/snow360-atmospheric-sky-night-v90.hdr";
const MOBILE_DAY_URL = "/sky/snow360-atmospheric-sky-day-v90-mobile.hdr";
const MOBILE_NIGHT_URL = "/sky/snow360-atmospheric-sky-night-v90-mobile.hdr";
const DAY_FOG = new THREE.Color("#bfd9e6");
const NIGHT_FOG = new THREE.Color("#2b3b5d");

const VERTEX = [
  "varying vec2 vSkyUv;",
  "void main() {",
  "  vSkyUv = uv;",
  "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
  "}",
].join("\n");

const FRAGMENT = [
  "uniform sampler2D uDaySky;",
  "uniform sampler2D uNightSky;",
  "uniform float uNightMix;",
  "varying vec2 vSkyUv;",
  "vec3 hdrDisplay(vec3 radiance, float exposure) {",
  "  vec3 light = max(vec3(0.0), radiance);",
  "  return vec3(1.0) - exp(-light * exposure);",
  "}",
  "void main() {",
  "  vec2 coord = vec2(fract(vSkyUv.x), clamp(vSkyUv.y, 0.001, 0.999));",
  // Preserve the subtle sky color nuances from the new HDRI maps.",
  "  vec3 day = hdrDisplay(texture2D(uDaySky, coord).rgb, 0.92);",
  "  vec3 night = hdrDisplay(texture2D(uNightSky, coord).rgb, 1.27);",
  "  vec3 color = mix(day, night, smoothstep(0.0, 1.0, uNightMix));",
  "  gl_FragColor = vec4(color, 1.0);",
  "  #include <colorspace_fragment>",
  "}",
].join("\n");

function fadeValue(time) {
  const t = THREE.MathUtils.clamp(
    (time - SNOW360_NIGHT_START_SECONDS) / SNOW360_NIGHT_FADE_SECONDS, 0, 1
  );
  return t * t * (3 - 2 * t);
}

export default function Snow64HDRSky({ stateRef, mobile = false }) {
  // Half-resolution mobile maps retain the same exact sky composition,
  // while lowering the pair's GPU texture memory by approximately 75%.
  const urls = useMemo(
    () => mobile ? [MOBILE_DAY_URL, MOBILE_NIGHT_URL] : [DAY_URL, NIGHT_URL],
    [mobile]
  );
  const [day, night] = useLoader(HDRLoader, urls);
  const { camera, scene } = useThree();
  const mesh = useRef(null);

  const geometry = useMemo(
    () => new THREE.SphereGeometry(172, mobile ? 36 : 64, mobile ? 20 : 32),
    [mobile]
  );

  const material = useMemo(
    () => new THREE.ShaderMaterial({
      name: "SNOW360 V90 / Soft Pastel Atmospheric HDRI",
      uniforms: {
        uDaySky: { value: day },
        uNightSky: { value: night },
        uNightMix: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      transparent: false,
      fog: false,
      toneMapped: false,
    }),
    [day, night]
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const elapsed = Math.max(0, Number(stateRef?.current?.t) || 0);
    const angle =
      ((elapsed % SNOW360_SKY_ROTATION_SECONDS) /
        SNOW360_SKY_ROTATION_SECONDS) * Math.PI * 2;

    if (mesh.current) {
      mesh.current.position.copy(camera.position);
      mesh.current.rotation.y = -angle;
    }

    const nightAmount = fadeValue(elapsed);
    material.uniforms.uNightMix.value = nightAmount;

    // Fade far-distance fog together with the equirectangular sky.
    if (scene.fog) scene.fog.color.lerpColors(DAY_FOG, NIGHT_FOG, nightAmount);
  });

  return (
    <mesh
      ref={mesh}
      name="SNOW360 V90 Rotating Pastel HDRI Sky"
      geometry={geometry}
      material={material}
      renderOrder={-1000}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}

// The original blue background stays visible while loading.
// No unconditional preload: mobile should NOT fetch desktop HDR textures.
