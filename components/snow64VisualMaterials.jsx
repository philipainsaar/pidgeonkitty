"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SNOW64_TEXTURE_PATHS } from "./snow64Appearance";
import { SNOWBANK_FADE_START, SNOWBANK_FADE_END } from "./snow64SkylineFade";

const TextureContext = createContext({
  textures: {},
  material: null,
  skylineMaterial: null,
  holoMaterial: null,
  holoPileMaterial: null,
});

// Adapted from winter-catlien/components/CorePlanet.jsx,
// createShellHologram: original colors, reflection/rim equation, looped
// studio sweep, NormalBlending transparency, surface-normal offset.
// Terrain changes: projection into world-space, gentle center-lane mask.
const CORE_PLANET_HOLO = Object.freeze({
  pink: "#ff54d4",
  blue: "#49c9ff",
  intensity: 1.7,
  rimGlow: 1.75,
  reflections: 2.65,
  flowSpeed: 0.7,
  bandScale: 1.15,
  gapMeters: 0.018,
  // Effective alpha cut from V74, including glint peaks that previously
  // saturated the clamp. Keeps original CorePlanet colors and organic flow.
  groundAlpha: 0.296, // 40% of V75 0.74
  // Snow mounds inherit the very same animated CorePlanet film,
  // softened further to keep their plush silhouette readable.
  pileAlpha: 0.224,
});

const KEY_LIGHT = new THREE.Vector3(-8, 20, -30);
const FILL_LIGHT = new THREE.Vector3(13, 14, 8);

const CORE_VERTEX = [
  "uniform float uGap;",
  "varying vec3 vPosition;",
  "varying vec3 vNormalView;",
  "varying vec3 vPositionView;",
  "varying vec3 vWorldPosition;",
  "#include <fog_pars_vertex>",
  "void main() {",
  // Three.js InstancedMesh transforms: the ground has no instanceMatrix,
  // while every decorative snow pile does. Apply the instance transform
  // BEFORE world-position sampling so both surfaces share identical flow.
  "  vec3 outer = position + normalize(normal) * uGap;",
  "  vec4 localPosition = vec4(outer, 1.0);",
  "  vec3 localNormal = normal;",
  "  #ifdef USE_INSTANCING",
  "    localPosition = instanceMatrix * localPosition;",
  "    localNormal = mat3(instanceMatrix) * normal;",
  "  #endif",
  "  vWorldPosition = (modelMatrix * localPosition).xyz;",
  // CorePlanet uses position / globe radius. Map WORLD coordinates so
  // the flow remains seamless across chunks and rounded snowbanks.
  "  vPosition = vec3(vWorldPosition.x * 0.115,",
  "                   vWorldPosition.y * 0.082,",
  "                   vWorldPosition.z * 0.088);",
  "  vec4 mvPosition = modelViewMatrix * localPosition;",
  "  vPositionView = mvPosition.xyz;",
  "  vNormalView = normalize(normalMatrix * normalize(localNormal));",
  "  gl_Position = projectionMatrix * mvPosition;",
  "  #include <fog_vertex>",
  "}",
].join("\n");

const CORE_FRAGMENT = [
  "uniform float uTime;",
  "uniform float uIntensity;",
  "uniform float uRimGlow;",
  "uniform float uReflections;",
  "uniform float uFlowSpeed;",
  "uniform float uBandScale;",
  "uniform float uOpacityMultiplier;",
  "uniform float uPileMode;",
  "uniform vec3 uPink;",
  "uniform vec3 uBlue;",
  "uniform vec3 uKeyViewPosition;",
  "uniform vec3 uFillViewPosition;",
  "varying vec3 vPosition;",
  "varying vec3 vNormalView;",
  "varying vec3 vPositionView;",
  "varying vec3 vWorldPosition;",
  "#include <fog_pars_fragment>",
  "void main() {",
  "  float lane = 1.0 - smoothstep(8.5, 18.0, abs(vWorldPosition.x));",
  "  if (uPileMode > 0.5) {",
  // Puffs exist on both banks. Keep them gently holographic everywhere;
  // the center is brighter but neither side turns into a plain white blob.
  "    lane = mix(0.55, 0.88, 1.0 - smoothstep(8.5, 23.0, abs(vWorldPosition.x)));",
  "  }",
  "  if (lane < 0.001) discard;",
  "  vec3 n = normalize(vNormalView);",
  "  vec3 v = normalize(-vPositionView);",
  "  float facing = clamp(dot(n, v), 0.0, 1.0);",
  "  float fresnel = pow(1.0 - facing, 2.15);",
  "  vec3 p = vPosition;",
  "  float scale = max(0.05, uBandScale);",
  "  float t = uTime * uFlowSpeed;",
  // The CorePlanet sphere curves the two linear waves into organic bands.",
  // Snow is nearly flat: re-map those phases through two moving curl fields.",
  // This keeps the CorePlanet film and colors, without repetitive diagonal lines.",
  "  vec2 uv = p.xz;",
  "  float slow = t * 0.38;",
  "  float curlA = sin(uv.y * 1.13 + 1.33 * sin(uv.x * 1.52 + slow * 0.72) + slow * 0.45);",
  "  float curlB = cos(uv.x * 1.24 + 1.24 * cos(uv.y * 0.91 - slow * 0.57) - slow * 0.34);",
  "  vec2 bent = uv + vec2(0.83 * curlA + 0.37 * curlB, 0.78 * curlB - 0.39 * curlA);",
  "  vec2 center = vec2(0.91 * sin(slow * 0.31), 0.76 * cos(slow * 0.27));",
  "  float eddy = sin(length(bent - center) * 3.25 + 0.9 * curlA - 0.45 * curlB);",
  "  float phaseA = sin(scale * (2.3 * curlA + 1.5 * curlB + 1.15 * eddy) + slow * 0.31);",
  "  float phaseB = sin(scale * (1.60 * cos(bent.x * 0.78 + 0.81 * curlB)",
  "                 + 1.50 * sin(bent.y * 0.71 + 0.76 * curlA) + 0.95 * eddy) - slow * 0.25);",
  "  float mixFactor = clamp(0.52 + 0.34 * phaseA + 0.18 * phaseB, 0.0, 1.0);",
  "  vec3 film = mix(uBlue, uPink, mixFactor);",
  "  film = mix(film, vec3(0.95, 0.95, 1.0), 0.11);",
  "  vec3 lightKey = normalize(uKeyViewPosition - vPositionView);",
  "  vec3 lightFill = normalize(uFillViewPosition - vPositionView);",
  "  float keyGlint = pow(max(dot(n, normalize(v + lightKey)), 0.0), 112.0);",
  "  float fillGlint = pow(max(dot(n, normalize(v + lightFill)), 0.0), 76.0);",
  "  float sweepPeriod = 2.4;",
  "  float sweepCenter = mod(t * 0.75, sweepPeriod) - 0.5 * sweepPeriod;",
  "  float stripPosition = 0.54 * curlA + 0.43 * curlB + 0.26 * eddy + 0.08 * phaseB;",
  "  float stripDistance = abs(stripPosition - sweepCenter);",
  "  stripDistance = min(stripDistance, abs(stripPosition - sweepCenter + sweepPeriod));",
  "  stripDistance = min(stripDistance, abs(stripPosition - sweepCenter - sweepPeriod));",
  "  float strip = exp(-pow(stripDistance / 0.145, 2.0));",
  "  strip *= 0.35 + 0.65 * fresnel;",
  "  float shine = max(0.0, uReflections) *",
  "    (0.80 * keyGlint + 0.48 * fillGlint + 0.20 * strip);",
  "  float flowing = 0.5 + 0.5 * sin(scale * (1.95 * curlA + 1.55 * curlB + 0.88 * eddy) - slow * 0.60);",
  "  float rim = fresnel * max(0.0, uRimGlow);",
  "  float alpha = max(0.0, uIntensity) *",
  "    (0.038 + 0.075 * flowing + 0.29 * rim + 0.22 * shine);",
  "  alpha = clamp(alpha, 0.0, 0.75);",
  // The only terrain-specific change: center-only, white snowbanks.
  "  alpha *= lane * uOpacityMultiplier;",
  "  vec3 color = film * (0.88 + 0.45 * rim) + vec3(1.0) * (1.40 * shine);",
  "  gl_FragColor = vec4(color, alpha);",
  "  #include <fog_fragment>",
  "  #include <colorspace_fragment>",
  "}",
].join("\n");

export function Snow64TextureProvider({ children, mobile = false }) {
  const [textures, setTextures] = useState({});
  useEffect(() => {
    let alive = true;
    const loaded = [];
    const loader = new THREE.TextureLoader();
    for (const [kind, path] of Object.entries(SNOW64_TEXTURE_PATHS)) {
      if (!path) continue;
      loader.load(path, texture => {
        if (!alive) { texture.dispose(); return; }
        const isNormal = kind === "snowNormal" || kind === "bankNormal";
        texture.colorSpace = isNormal ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        if (["snowGround", "snowBanks", "snowNormal", "bankNormal", "snowPile"].includes(kind)) {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = mobile ? 2 : 4;
        }
        texture.needsUpdate = true;
        loaded.push(texture);
        setTextures(old => ({ ...old, [kind]: texture }));
      }, undefined, () => {});
    }
    return () => { alive = false; loaded.forEach(t => t.dispose()); };
  }, [mobile]);
  const snow = textures.snowGround || null;
  const pile = textures.snowPile || null;

  // Original pearl-white fleece base. No color-tint hologram: the
  // CorePlanet shell is its own transparent overlay mesh above it.
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      map: snow, color: "#fffefd", vertexColors: true,
      side: THREE.DoubleSide, toneMapped: false, fog: true,
    });
    if (snow && pile) {
      m.onBeforeCompile = shader => {
        shader.uniforms.uSnowPile = { value: pile };
        shader.vertexShader = "varying vec2 vSnowWorldXZ;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n vSnowWorldXZ=position.xz;"
        );
        shader.fragmentShader =
          "uniform sampler2D uSnowPile;\nvarying vec2 vSnowWorldXZ;\n" +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          "#include <map_fragment>\n" +
          "float plushBank=smoothstep(10.2,19.0,abs(vSnowWorldXZ.x));\n" +
          "float finePile=texture2D(uSnowPile,vec2(vSnowWorldXZ.x,-vSnowWorldXZ.y)/0.90).r;\n" +
          "diffuseColor.rgb *= mix(0.992,0.972+0.053*finePile,plushBank);\n"
        );
      };
      m.customProgramCacheKey = () => "snow360-v74-white-plush-base";
    }
    return m;
  }, [snow, pile]);

  // V84: the steep OUTER bank dissolves into the scene's blue sky.
  // This material is used ONLY for the upper-bank triangle groups.
  // The full middle downhill and lower banks remain unchanged and opaque.
  // Reuse the original white-plush shader injection, so the fading section
  // retains the exact same snow detail, UVs and procedural pile modulation.
  const skylineMaterial = useMemo(() => {
    const edge = material.clone();
    const baseCompile = material.onBeforeCompile;
    edge.name = "SNOW360 V84 / Snowbanks dissolve into sky";
    edge.transparent = true;
    edge.depthWrite = false;
    edge.depthTest = true;
    edge.onBeforeCompile = shader => {
      if (baseCompile) baseCompile(shader);
      shader.vertexShader = "varying vec2 vSkylineBankXZ;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vSkylineBankXZ = position.xz;"
      );
      shader.fragmentShader =
        "varying vec2 vSkylineBankXZ;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <alphamap_fragment>",
        "#include <alphamap_fragment>\n" +
        // Vary the fade boundary gently in world-space Z to avoid a straight
        // horizontal cut while never showing a repeating tiled pattern.
        "float skyMeander = 0.23*sin(vSkylineBankXZ.y*0.052)" +
        " + 0.13*sin(vSkylineBankXZ.y*0.137 + vSkylineBankXZ.x*0.17);\n" +
        "float skyFade = 1.0 - smoothstep(" +
        SNOWBANK_FADE_START.toFixed(3) + ", " +
        SNOWBANK_FADE_END.toFixed(3) +
        ", abs(vSkylineBankXZ.x) + skyMeander);\n" +
        "diffuseColor.a *= skyFade;\n"
      );
    };
    edge.customProgramCacheKey = () =>
      "snow360-v84-skyline-edge-v2-" + (pile && snow ? "plush" : "basic");
    return edge;
  }, [material, pile, snow]);

  const holoMaterial = useMemo(() => new THREE.ShaderMaterial({
    name: "SNOW360 / CorePlanet transparent outer hologram on snow",
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uKeyViewPosition: { value: new THREE.Vector3() },
      uFillViewPosition: { value: new THREE.Vector3() },
      uGap: { value: CORE_PLANET_HOLO.gapMeters },
      uIntensity: { value: CORE_PLANET_HOLO.intensity },
      uOpacityMultiplier: { value: CORE_PLANET_HOLO.groundAlpha },
      uPileMode: { value: 0 },
      uRimGlow: { value: CORE_PLANET_HOLO.rimGlow },
      uReflections: { value: CORE_PLANET_HOLO.reflections },
      uFlowSpeed: { value: CORE_PLANET_HOLO.flowSpeed },
      uBandScale: { value: CORE_PLANET_HOLO.bandScale },
      uPink: { value: new THREE.Color(CORE_PLANET_HOLO.pink) },
      uBlue: { value: new THREE.Color(CORE_PLANET_HOLO.blue) },
    },
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT,
  }), []);

  // One reusable overlay material for the pile shader variant. Each active
  // chunk clones its uniforms for an independent, soft texture-ready fade.
  const holoPileMaterial = useMemo(() => {
    const mat = holoMaterial.clone();
    mat.name = "SNOW360 V76 / CorePlanet low-opacity hologram on plush piles";
    mat.uniforms.uOpacityMultiplier.value = CORE_PLANET_HOLO.pileAlpha;
    mat.uniforms.uPileMode.value = 1;
    return mat;
  }, [holoMaterial]);

  const keyView = useMemo(() => new THREE.Vector3(), []);
  const fillView = useMemo(() => new THREE.Vector3(), []);
  useFrame(({clock,camera}) => {
    const uniforms = holoMaterial.uniforms;
    uniforms.uTime.value = clock.elapsedTime;
    keyView.copy(KEY_LIGHT).applyMatrix4(camera.matrixWorldInverse);
    fillView.copy(FILL_LIGHT).applyMatrix4(camera.matrixWorldInverse);
    uniforms.uKeyViewPosition.value.copy(keyView);
    uniforms.uFillViewPosition.value.copy(fillView);
    // The exact same time and camera lights drive both ground and mounds.
    const pileUniforms = holoPileMaterial.uniforms;
    pileUniforms.uTime.value = uniforms.uTime.value;
    pileUniforms.uKeyViewPosition.value.copy(keyView);
    pileUniforms.uFillViewPosition.value.copy(fillView);
  });
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => skylineMaterial.dispose(), [skylineMaterial]);
  useEffect(() => () => holoMaterial.dispose(), [holoMaterial]);
  useEffect(() => () => holoPileMaterial.dispose(), [holoPileMaterial]);
  const shared = useMemo(
    () => ({ textures, material, skylineMaterial, holoMaterial, holoPileMaterial }),
    [textures, material, skylineMaterial, holoMaterial, holoPileMaterial]
  );
  return <TextureContext.Provider value={shared}>{children}</TextureContext.Provider>;
}

export function useSnow64Texture(kind) {
  return useContext(TextureContext).textures[kind] ?? null;
}
export function useSnow64TerrainMaterials() {
  return useContext(TextureContext).material;
}
export function useSnow64SkylineMaterial() {
  return useContext(TextureContext).skylineMaterial;
}
export function useSnow64CorePlanetFilmMaterial() {
  return useContext(TextureContext).holoMaterial;
}
export function useSnow64CorePlanetPileFilmMaterial() {
  return useContext(TextureContext).holoPileMaterial;
}
