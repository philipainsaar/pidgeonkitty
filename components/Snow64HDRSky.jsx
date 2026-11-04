"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import * as THREE from "three";

/**
 * SNOW360 V87: clearly visible HDR cotton clouds at snowboard camera angles.
 * New 1536x768 RGBE panoramas with distinct horizon cloud formations.
 *
 * 360-degree rotation per 300 GAMEPLAY seconds, full revolution every 5:00.
 * After 5:00, a 45-second gradual transition into night (complete 5:45).
 * The authoritative game time freezes when paused and resets on a new run.
 * Camera, gameplay physics, assets, snowfall and HUD are left untouched.
 */
export const SNOW360_SKY_ROTATION_SECONDS = 300;
export const SNOW360_NIGHT_START_SECONDS = 300;
export const SNOW360_NIGHT_FADE_SECONDS = 45;

const DAY_URL = "/sky/snow360-cotton-sky-day-v87.hdr";
const NIGHT_URL = "/sky/snow360-cotton-sky-night-v87.hdr";
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
  "  vec3 dayHdr = texture2D(uDaySky, coord).rgb;",
  "  vec3 day = hdrDisplay(dayHdr, 0.92);",
  "  // Bright cumulus clouds remain defined against the blue HDR sky.",
  "  float cloudShape = smoothstep(1.6, 3.8, max(dayHdr.r, max(dayHdr.g, dayHdr.b)));",
  "  day = mix(day, vec3(.995, .993, 1.0), cloudShape * .095);",
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
  const [day, night] = useLoader(HDRLoader, [DAY_URL, NIGHT_URL]);
  const { camera, scene } = useThree();
  const mesh = useRef(null);

  const geometry = useMemo(
    () => new THREE.SphereGeometry(172, mobile ? 36 : 64, mobile ? 20 : 32),
    [mobile]
  );

  const material = useMemo(
    () => new THREE.ShaderMaterial({
      name: "SNOW360 V87 / High-Contrast Cotton HDR Sky",
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
      name="SNOW360 V87 Rotating HDRI Sky"
      geometry={geometry}
      material={material}
      renderOrder={-1000}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}

// The original blue background stays visible while these load.
useLoader.preload(HDRLoader, [DAY_URL, NIGHT_URL]);
