"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

// Names are taken from SNOW64ObstaclesCollection.blend (Blender object IDs).
const NAMES = ["Crystals", "Crystals2", "Rock1", "Rock2", "Rock3", "Rock4", "Rock5", "Rock6", "Rock7", "RockCrystal1", "RockCrystal2", "RockCrystal3"];
const BASE_PATH = "/models/snow64-obstacles";
let library = null;
let promise = null;
const subscribers = new Set();
const notify = () => subscribers.forEach(callback => callback(library));

function stableHash(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const obstacleVariantName = rock => NAMES[stableHash(String(rock.id)) % NAMES.length];
export const obstacleYaw = rock => stableHash(`${rock.id}:yaw`) / 4294967296 * Math.PI * 2;

function ensureGeneratedUVs(geometry) {
  if (geometry.getAttribute('uv')) return geometry;
  geometry.computeVertexNormals();
  const pos = geometry.getAttribute('position');
  const norm = geometry.getAttribute('normal');
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const size = box.getSize(new THREE.Vector3());
  const sx = Math.max(size.x, 1e-5), sy = Math.max(size.y, 1e-5), sz = Math.max(size.z, 1e-5);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(norm.getX(i)), ny = Math.abs(norm.getY(i)), nz = Math.abs(norm.getZ(i));
    let u = 0, v = 0;
    if (ny >= nx && ny >= nz) {
      u = (x - box.min.x) / sx;
      v = (z - box.min.z) / sz;
    } else if (nx >= ny && nx >= nz) {
      u = (z - box.min.z) / sz;
      v = (y - box.min.y) / sy;
    } else {
      u = (x - box.min.x) / sx;
      v = (y - box.min.y) / sy;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function createShardMaterial(sourceMaterial, name) {
  const src = Array.isArray(sourceMaterial) ? sourceMaterial[0] : sourceMaterial;
  const material = (src?.clone?.() || new THREE.MeshStandardMaterial({ color: '#bfefff' }));
  material.name = `${src?.name || name}_Shard`;
  material.side = THREE.DoubleSide;
  material.shadowSide = THREE.DoubleSide;
  material.depthWrite = src?.transparent ? false : true;
  material.transparent = src?.transparent ?? false;
  material.opacity = src?.opacity ?? 1;
  if (src?.userData?.isCrystal) {
    // Instanced body color is white to avoid multiplying away pastel hues.
    // Fragments retain the family's original pastel instead of turning white.
    if (src.userData.crystalInitialTint) {
      material.color.copy(src.userData.crystalInitialTint);
    }
    material.transparent = true;
    material.opacity = Math.max(0.48, Math.min(material.opacity, 0.62));
    material.emissive = cloneColor(src.userData.crystalInitialTint || src.emissive, '#ffffff');
    material.emissiveIntensity = Math.max(src.emissiveIntensity || 0, 1.05);
    material.roughness = Math.min(material.roughness ?? 0.2, 0.16);
    material.metalness = Math.max(material.metalness ?? 0, 0.02);
    material.blending = THREE.NormalBlending;
    material.depthWrite = false;
  }
  material.needsUpdate = true;
  return material;
}

const grayTextureCache = new WeakMap();
const CRYSTAL_VARIANT_COLORS = {
  Crystals: ['#ff9fdc', '#ffc4ef', '#ffb2f6'],         // pastel pink
  Crystals2: ['#86c9ff', '#a8ddff', '#8fd8ff'],        // pastel blue
  RockCrystal1: ['#92ffd8', '#b6ffe9', '#8cf7d3'],     // pastel mint
  RockCrystal2: ['#c6a4ff', '#ddc7ff', '#b996ff'],     // pastel violet
  RockCrystal3: ['#93f4ff', '#bdfcff', '#9fefff'],     // pastel aqua
};
const ROCK_VARIANT_COLORS = {
  Rock1: '#f7f8fb', Rock2: '#fbfcfe', Rock3: '#f2f5f8', Rock4: '#ffffff',
  Rock5: '#eef2f6', Rock6: '#fafcff', Rock7: '#f4f7fa',
};

// V62: brighten the embedded crystal detail for legible color animation. The independent
// Core Planet holographic film below is intentionally left unchanged.
// Every crystal cycles through ALL six soft colors, not just its own family.
// V62: translucent body underneath Core Planet's holographic shell.
// The previous 39% body was almost completely covered by the brighter film.
// 0.58 still lets snowy scenery show through, while color motion stays legible.
const CRYSTAL_BODY_OPACITY = 0.82; // V75: stronger crystal silhouette against holographic snow
const CRYSTAL_CYCLE_SECONDS = 12.0; // Visible, continuous two-second pastel transitions.
const CRYSTAL_BODY_PASTELS = [
  '#ffd0e9', // baby pink
  '#c8e7ff', // sky blue
  '#c8ffe8', // mint
  '#e1cfff', // lavender
  '#ccfbff', // aqua
  '#ffe3cb', // peach
].map(hex => new THREE.Color(hex));
const CRYSTAL_FAMILY_START_INDEX = {
  Crystals: 0,      // start in baby pink
  Crystals2: 1,     // start in sky blue
  RockCrystal1: 2,  // start in mint
  RockCrystal2: 3,  // start in lavender
  RockCrystal3: 4,  // start in aqua
};
// Reuse one Color per instancing group: no per-frame object allocations.
function sampleCrystalBodyPastel(out, phase) {
  const count = CRYSTAL_BODY_PASTELS.length;
  const wrapped = ((phase % count) + count) % count;
  const index = Math.floor(wrapped);
  const local = wrapped - index;
  const smooth = local * local * (3 - 2 * local);
  return out.copy(CRYSTAL_BODY_PASTELS[index])
    .lerp(CRYSTAL_BODY_PASTELS[(index + 1) % count], smooth);
}
function isCrystalVariant(name) {
  return name.startsWith('Crystal') || name.startsWith('RockCrystal');
}
function makeGrayTexture(map) {
  if (!map?.image || typeof document === 'undefined') return null;
  if (grayTextureCache.has(map)) return grayTextureCache.get(map);
  const image = map.image;
  const width = image.width || image.videoWidth || image.naturalWidth;
  const height = image.height || image.videoHeight || image.naturalHeight;
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
    const boosted = Math.min(255, Math.max(0, (l - 128) * 0.86 + 224));
    px[i] = px[i + 1] = px[i + 2] = boosted;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = map.wrapS; tex.wrapT = map.wrapT;
  tex.repeat.copy(map.repeat); tex.offset.copy(map.offset); tex.center.copy(map.center);
  tex.rotation = map.rotation; tex.flipY = map.flipY;
  tex.colorSpace = map.colorSpace;
  tex.magFilter = map.magFilter; tex.minFilter = map.minFilter;
  tex.generateMipmaps = map.generateMipmaps;
  tex.needsUpdate = true;
  grayTextureCache.set(map, tex);
  return tex;
}
// The exported Coke/Coke.png crystal texture is grayscale but its middle
// values are dark (roughly 145/255). Multiplying pastel RGB by that map
// made the whole translucent crystal look gray-purple. Brighten the same
// embedded texture *in memory*, retaining its veins, UV set, and sampler.
// This adds NO image files and changes NO holographic shader.
const brightCrystalTextureCache = new WeakMap();
function makeBrightCrystalTexture(source) {
  if (!source?.image || typeof document === 'undefined') return source || null;
  const existing = brightCrystalTextureCache.get(source);
  if (existing) return existing;
  const image = source.image;
  const width = image.width || image.videoWidth || image.naturalWidth;
  const height = image.height || image.videoHeight || image.naturalHeight;
  if (!width || !height) return source;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return source;
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height);
    const pixels = data.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const tone = pixels[index] * 0.299 + pixels[index+1] * 0.587 + pixels[index+2] * 0.114;
      // Brightened further for V63 so the body color reads clearly under the separate holographic film.
      // 208..249 keeps the embedded cracks visible without muting the pastel cycle.
      const ivory = Math.round(208 + tone * 0.16);
      pixels[index] = pixels[index+1] = pixels[index+2] = ivory;
      // Preserve the source alpha if one exists.
    }
    context.putImageData(data, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `${source.name || 'crystal'}_pastelNeutral`;
    texture.colorSpace = source.colorSpace;
    texture.channel = source.channel; // CRITICAL: TEXCOORD_1 on some crystals.
    texture.wrapS = source.wrapS;
    texture.wrapT = source.wrapT;
    texture.repeat.copy(source.repeat);
    texture.offset.copy(source.offset);
    texture.center.copy(source.center);
    texture.rotation = source.rotation;
    texture.flipY = source.flipY;
    texture.magFilter = source.magFilter;
    texture.minFilter = source.minFilter;
    texture.generateMipmaps = source.generateMipmaps;
    texture.anisotropy = Math.min(4, source.anisotropy || 1);
    texture.needsUpdate = true;
    brightCrystalTextureCache.set(source, texture);
    return texture;
  } catch (error) {
    console.warn('SNOW360: falling back to embedded crystal texture', error);
    return source;
  }
}
function cloneColor(colorLike, fallback) {
  return colorLike?.clone?.() || new THREE.Color(fallback);
}
function paletteToColors(palette) {
  return palette.map(hex => new THREE.Color(hex));
}
function shimmerColor(palette, t, speed = 0.55) {
  if (!palette?.length) return new THREE.Color('#ffffff');
  if (palette.length === 1) return palette[0].clone();
  const n = palette.length;
  const phase = ((t * speed) % n + n) % n;
  const i0 = Math.floor(phase) % n;
  const i1 = (i0 + 1) % n;
  const f = phase - Math.floor(phase);
  return palette[i0].clone().lerp(palette[i1], 0.5 - 0.5 * Math.cos(f * Math.PI));
}
function styleObstacleMaterial(sourceMaterial, variantName, partIndex = 0) {
  const src = Array.isArray(sourceMaterial) ? sourceMaterial[0] : sourceMaterial;
  if (isCrystalVariant(variantName)) {
    const palette = paletteToColors(CRYSTAL_VARIANT_COLORS[variantName] || ['#d7f4ff']);
    const tint = palette[partIndex % palette.length].clone();
    // V62: use the GLB's original crack/vein detail, neutralized toward
    // ivory so it does not darken or bias the six animated pastel tints.
    // The original map's UV channel and sampler are retained.
    const material = new THREE.MeshBasicMaterial({
      name: `${variantName}_TEXTURED_PastelCrystalBody`,
      map: makeBrightCrystalTexture(src?.map),
      // White base allows instanceColor to determine the body hue.
      color: '#ffffff',
      transparent: true,
      opacity: CRYSTAL_BODY_OPACITY,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
      toneMapped: false,
      fog: false,
    });
    material.userData.isCrystal = true;
    material.userData.crystalInitialTint = tint;
    material.userData.crystalPalette = palette;
    material.userData.holoSpeed = 0.37;
    material.userData.holoPhase = partIndex * .59 + (stableHash(variantName) % 27) * .13;
    return material;
  }
  const color = new THREE.Color(ROCK_VARIANT_COLORS[variantName] || '#f4f7fa');
  const grayMap = makeGrayTexture(src?.map);
  const material = new THREE.MeshStandardMaterial({
    map: grayMap,
    normalMap: src?.normalMap || null,
    aoMap: src?.aoMap || null,
    roughnessMap: src?.roughnessMap || null,
    metalnessMap: src?.metalnessMap || null,
    color,
    roughness: 0.88,
    metalness: 0.0,
    emissive: new THREE.Color('#f3f6fb'),
    emissiveIntensity: 0.05,
    side: THREE.DoubleSide,
    depthWrite: true,
    transparent: false,
    opacity: 1,
  });
  material.name = `${src?.name || variantName}_RockGray`;
  if (material.map) material.map.anisotropy = 8;
  if (material.normalMap) material.normalMap.anisotropy = 8;
  material.needsUpdate = true;
  return material;
}

// V64: the exact CorePlanet thin-film GLSL still creates the moving
// interference, glints and Fresnel rim. Only its uPink/uBlue colors now follow
// the six-color crystal body cycle, rather than staying permanently pink/blue.
// Keep the film endpoints in nearly the same hue so it reads as ONE cycling
// pastel crystal with a holographic surface instead of two conflicting colors.
const CRYSTAL_HOLO_NEXT_COLOR_OFFSET = 0.65; // fractional palette step
const CRYSTAL_HOLO_SECOND_COLOR_BLEND = 0.50; // 0 = uniform; 1 = 0.65 step ahead
const CORE_PLANET_HOLO = {
  flowSpeed: 1.05,
  bandScale: 1.55,
  intensity: 2.08, // V75: clearer facets above pastel snow
  rimGlow: 2.04,
  reflections: 1.78,
  gapFraction: 0.016,
};
const crystalKeyWorld = new THREE.Vector3(-8, 20, -30);
const crystalFillWorld = new THREE.Vector3(8, 6, 10);

function makeCorePlanetCrystalFilm(geometry, variantName, partIndex) {
  geometry.computeBoundingSphere();
  const bounds = geometry.boundingSphere;
  const radius = Math.max(bounds?.radius || 0.12, 0.001);
  const startingPhase = (CRYSTAL_FAMILY_START_INDEX[variantName] ?? 0)
    + partIndex * 0.13;
  const startingPastel = sampleCrystalBodyPastel(new THREE.Color(), startingPhase);
  const startingNext = sampleCrystalBodyPastel(
    new THREE.Color(), startingPhase + CRYSTAL_HOLO_NEXT_COLOR_OFFSET
  ).lerp(startingPastel, 1 - CRYSTAL_HOLO_SECOND_COLOR_BLEND);
  const uniforms = {
    uTime: { value: 0 },
    uKeyViewPosition: { value: new THREE.Vector3() },
    uFillViewPosition: { value: new THREE.Vector3() },
    uRadius: { value: radius },
    uCenter: { value: bounds?.center?.clone() || new THREE.Vector3() },
    uGap: { value: radius * CORE_PLANET_HOLO.gapFraction },
    uIntensity: { value: CORE_PLANET_HOLO.intensity },
    uRimGlow: { value: CORE_PLANET_HOLO.rimGlow },
    uReflections: { value: CORE_PLANET_HOLO.reflections },
    uFlowSpeed: { value: CORE_PLANET_HOLO.flowSpeed },
    uBandScale: { value: CORE_PLANET_HOLO.bandScale },
    uPink: { value: startingPastel },
    uBlue: { value: startingNext },
    uPhase: { value: partIndex * 0.47 + (stableHash(variantName) % 29) * .19 },
  };
  const mat = new THREE.ShaderMaterial({
    name: `CorePlanet_ThinFilm_${variantName}_${partIndex}`,
    uniforms,
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
    fog: false,
    vertexShader: `
      uniform float uRadius;
      uniform float uGap;
      uniform vec3 uCenter;
      varying vec3 vPosition;
      varying vec3 vNormalView;
      varying vec3 vPositionView;
      void main() {
        // The source shader measures interference in normalized object space;
        // here a per-mesh center avoids odd patterns on offset Blender parts.
        vPosition = (position - uCenter) / max(0.001, uRadius);
        vec3 outer = position + normalize(normal) * uGap;
        vec4 instancedPosition = vec4(outer, 1.0);
        vec3 instancedNormal = normal;
        #ifdef USE_INSTANCING
          instancedPosition = instanceMatrix * instancedPosition;
          instancedNormal = mat3(instanceMatrix) * normal;
        #endif
        vec4 p = modelViewMatrix * instancedPosition;
        vPositionView = p.xyz;
        vNormalView = normalize(mat3(modelViewMatrix) * instancedNormal);
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uRimGlow;
      uniform float uReflections;
      uniform float uFlowSpeed;
      uniform float uBandScale;
      uniform float uPhase;
      uniform vec3 uPink;
      uniform vec3 uBlue;
      uniform vec3 uKeyViewPosition;
      uniform vec3 uFillViewPosition;
      varying vec3 vPosition;
      varying vec3 vNormalView;
      varying vec3 vPositionView;
      void main() {
        vec3 n = normalize(vNormalView);
        vec3 v = normalize(-vPositionView);
        float facing = clamp(dot(n, v), 0.0, 1.0);
        float fresnel = pow(1.0 - facing, 2.15);
        vec3 p = vPosition;
        float scale = max(0.05, uBandScale);
        float t = uTime * uFlowSpeed + uPhase;

        // Direct adaptation of CorePlanet's two looping thin-film waves.
        float phaseA = sin(scale * (p.x * 5.1 + p.y * 3.7 - p.z * 2.4) + t * 1.30);
        float phaseB = sin(scale * (p.z * 6.4 - p.x * 2.6 + p.y * 1.7) - t * 0.85);
        float mixFactor = clamp(0.52 + 0.34 * phaseA + 0.18 * phaseB, 0.0, 1.0);
        vec3 film = mix(uBlue, uPink, mixFactor);
        film = mix(film, vec3(0.95, 0.95, 1.0), 0.06);

        // Directional key + virtual fill in view coordinates. Mirrors the
        // website's studio-light highlights while respecting the game camera.
        vec3 key = normalize(uKeyViewPosition - vPositionView);
        vec3 fill = normalize(uFillViewPosition - vPositionView);
        float keyGlint = pow(max(dot(n, normalize(v + key)), 0.0), 112.0);
        float fillGlint = pow(max(dot(n, normalize(v + fill)), 0.0), 76.0);

        // Periodic strip wraps forever, same non-disappearing CorePlanet sweep.
        float sweepPeriod = 2.4;
        float sweepCenter = mod(t * 0.75, sweepPeriod) - 0.5 * sweepPeriod;
        float stripPosition = p.x * 0.72 + p.y * 0.39 + 0.08 * phaseB;
        float stripDistance = abs(stripPosition - sweepCenter);
        stripDistance = min(stripDistance, abs(stripPosition - sweepCenter + sweepPeriod));
        stripDistance = min(stripDistance, abs(stripPosition - sweepCenter - sweepPeriod));
        float strip = exp(-pow(stripDistance / 0.070, 2.0));
        strip *= 0.35 + 0.65 * fresnel;
        float shine = max(0.0, uReflections) *
          (0.80 * keyGlint + 0.48 * fillGlint + 0.20 * strip);

        float flowing = 0.5 + 0.5 * sin(scale * (p.x * 7.3 - p.y * 4.0) - t);
        float rim = fresnel * max(0.0, uRimGlow);
        // V60: make thin-film *readable against pale snow* while retaining
        // visible pastel texture under it. Broad moving colored bands cover
        // each facet, with a sharply wrapping studio-light sweep and rim.
        float movingRainbow = 0.5 + 0.5 * sin(t * 2.2 -
          p.y * 7.4 + p.x * 5.1 + p.z * 3.4);
        float coloredBand = 0.5 + 0.5 * sin(t * 3.3 +
          p.y * 11.0 - p.x * 7.3);
        float coloredGlint = pow(coloredBand, 7.0);
        vec3 pastel = mix(film, mix(uPink, uBlue, movingRainbow), 0.38);
        float alpha = max(0.0, uIntensity) *
          (0.075 + 0.105 * flowing + 0.18 * rim +
           0.18 * strip + 0.13 * coloredGlint + 0.09 * shine);
        alpha = clamp(alpha, 0.19, 0.76); // V75: more readable crystal film
        vec3 color = pastel * (0.90 + 0.30 * rim +
          0.32 * coloredGlint + 0.20 * strip);
        color += vec3(1.0) * (0.17 * shine + 0.10 * strip);
        gl_FragColor = vec4(min(color, vec3(1.0)), alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  return mat;
}

function readParts(scene, prefix) {
  scene.updateMatrixWorld(true);
  const names = new Map();
  scene.traverse(node => {
    if (!node.isMesh) return;
    const n = node.name.match(new RegExp(`^${prefix}(.+?)(?:_part\\d+)?$`));
    if (!n) return;
    const key = n[1].replace(/_part\d+$/, "");
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    if (!names.has(key)) names.set(key, []);
    const partIndex = names.get(key).length;
    names.get(key).push({
      geometry,
      material: prefix === 'Obstacle_'
        ? styleObstacleMaterial(node.material, key, partIndex)
        : node.material,
    });
  });
  return names;
}

function buildLibrary(scene, fragments) {
  const geom = readParts(scene, "Obstacle_");
  const cuts = fragments ? readParts(fragments, "Shard_") : new Map();
  const variants = new Map();
  for (const name of NAMES) {
    const parts = geom.get(name);
    if (!parts?.length) continue;
    const bounds = new THREE.Box3();
    parts.forEach(p => bounds.expandByObject(new THREE.Mesh(p.geometry)));
    const size = bounds.getSize(new THREE.Vector3());
    if (size.x < 0.0001 || size.z < 0.0001 || size.y < 0.0001) continue;
    const center = bounds.getCenter(new THREE.Vector3());
    const offset = new THREE.Vector3(-center.x, -bounds.min.y, -center.z);
    const origin = new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z);
    parts.forEach(p => {
      p.geometry.applyMatrix4(origin);
      p.geometry.computeBoundingBox();
      p.bounds = p.geometry.boundingBox.clone();
    });
    // Fracture meshes are exported in the same local coordinates as the original.
    const shards = [];
    for (const [key, pieces] of cuts) {
      if (!key.startsWith(`${name}_`)) continue;
      for (const part of pieces) {
        const fragment = part.geometry.clone();
        fragment.applyMatrix4(origin);
        const box = new THREE.Box3().setFromBufferAttribute(fragment.getAttribute("position"));
        const localCenter = box.getCenter(new THREE.Vector3());
        fragment.translate(-localCenter.x, -localCenter.y, -localCenter.z);
        ensureGeneratedUVs(fragment);
        const nearest = parts.reduce((best,piece) => {
          const bb=piece.bounds;
          const d=bb.distanceToPoint(localCenter);
          return d < best.distance ? {part:piece,distance:d} : best;
        }, {part:parts[0],distance:Infinity}).part;
        const material = createShardMaterial(nearest.material, name);
        shards.push({ geometry: fragment, material, center: localCenter });
      }
    }
    variants.set(name, { name, parts, size, shards });
  }
  return { variants };
}

async function getLibrary() {
  if (library) return library;
  if (!promise) {
    const loader = new GLTFLoader();
    promise = loader.loadAsync(`${BASE_PATH}.glb`)
      .then(async gltf => {
        const shards = await loader.loadAsync(`${BASE_PATH}-shards.glb`).catch(() => null);
        library = buildLibrary(gltf.scene, shards?.scene);
        notify();
        return library;
      })
      .catch(() => { library = null; notify(); return null; });
  }
  return promise;
}
export function useSnow64Obstacles() {
  const [data, setData] = useState(library);
  useEffect(() => {
    subscribers.add(setData);
    getLibrary();
    return () => subscribers.delete(setData);
  }, []);
  return data?.variants?.size ? data : null;
}

function parameters(rock) {
  const asset = library?.variants?.get(obstacleVariantName(rock));
  if (!asset) return null;
  const size = asset.size;
  // V50: preserve proportions but bound the *longest* axis, not only footprint.
  // rock.size varies 0.60..1.15; narrow this to avoid extreme large/small props.
  const sizeVariation = 0.91 + 0.18 * THREE.MathUtils.clamp((rock.size - 0.6) / 0.55, 0, 1);
  const crystal = isCrystalVariant(asset.name);
  const targetSpan = crystal ? 2.18 : 2.02;
  const axisLimit = Math.max(size.x, size.z, size.y / (crystal ? 1.26 : 1.15), 0.001);
  const scale = targetSpan * sizeVariation / axisLimit;
  const yaw = obstacleYaw(rock);
  // An oriented box fits tall crystals and wide rocks independently. Keep
  // a 10% safety margin for the snowboard edges, not a generic sphere.
  return { asset, scale, yaw, halfX:size.x*scale*.55, halfZ:size.z*scale*.55, height:size.y*scale };
}
export function getSnow64ObstacleParams(rock) { return parameters(rock); }

// The mesh and its collision need EXACTLY the same snow surface position.
// Sampling the four rotated footprint corners prevents one side of a sloped
// rock from disappearing under the terrain while the other is visible.
export function getSnow64ObstacleBaseY(rock, groundY, params=parameters(rock)) {
  const center = groundY(rock.x, rock.z);
  if (!params) return center;
  const c = Math.cos(params.yaw), s = Math.sin(params.yaw);
  let highest = center;
  const hx = params.halfX * .91, hz = params.halfZ * .91;
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) {
    const worldX = rock.x + x*c - z*s;
    const worldZ = rock.z + x*s + z*c;
    highest = Math.max(highest, groundY(worldX, worldZ));
  }
  return highest + .035; // only 3.5cm clearance on the high side
}

export function snow64ObstacleHit(from, to, rock, groundY, riderRadius=.37, powered=false) {
  const p=parameters(rock);
  // If the library loaded but this variant has no visible mesh, disable its
  // collision too. NEVER wipe out on an obstacle that cannot be rendered.
  if (!p) return library ? false : null;
  const baseY = getSnow64ObstacleBaseY(rock, groundY, p);
  const cs=Math.cos(p.yaw), sn=Math.sin(p.yaw);
  const sx=(from.x-rock.x)*cs+(from.z-rock.z)*sn;
  const sz=-(from.x-rock.x)*sn+(from.z-rock.z)*cs;
  const dx=(to.x-from.x)*cs+(to.z-from.z)*sn;
  const dz=-(to.x-from.x)*sn+(to.z-from.z)*cs;
  const size=p.scale;
  // Test the actual visible mesh parts instead of just the full group's box.
  // This avoids invisible collisions between separate crystal spikes.
  for (const part of p.asset.parts) {
    const bounds=part.bounds;
    if (!bounds) continue;
    const pad=powered ? Math.max(.58,riderRadius) : riderRadius;
    const lowX=bounds.min.x*size-pad, highX=bounds.max.x*size+pad;
    const lowZ=bounds.min.z*size-pad, highZ=bounds.max.z*size+pad;
    let enter=0,leave=1,overlap=true;
    for (const [origin,velocity,lo,hi] of [[sx,dx,lowX,highX],[sz,dz,lowZ,highZ]]) {
      if (Math.abs(velocity)<1e-8) {
        if (origin<lo||origin>hi) {overlap=false;break;}
      } else {
        let a=(lo-origin)/velocity,b=(hi-origin)/velocity;
        if (a>b) [a,b]=[b,a];
        enter=Math.max(enter,a);leave=Math.min(leave,b);
        if (enter>leave) {overlap=false;break;}
      }
    }
    if (!overlap) continue;
    const y=from.y+(to.y-from.y)*enter;
    const bottom=baseY+bounds.min.y*size;
    const top=baseY+bounds.max.y*size;
    const riderUpper=powered ? 0.70 : 0.41;
    const riderLower=powered ? 2.10 : 0.16;
    // Both lower AND upper bounds are checked: no underground hitboxes.
    if (y+riderUpper>=bottom && y-riderLower<=top) return true;
  }
  return false;
}

function ObstacleMeshInstances({ asset, part, items, stateRef, groundY }) {
  const ref = useRef(null);
  const filmRef = useRef(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const isCrystal = !!part.material?.userData?.isCrystal;
  const partIndex = asset.parts.indexOf(part);
  const pastelColor = useMemo(() => new THREE.Color(), []);
  const nextFilmPastel = useMemo(() => new THREE.Color(), []);
  const familyPhase = useMemo(() => {
    const familyStart = CRYSTAL_FAMILY_START_INDEX[asset.name] ?? 0;
    return familyStart + partIndex * 0.13;
  }, [asset.name, partIndex]);
  const film = useMemo(() => isCrystal
    ? makeCorePlanetCrystalFilm(part.geometry, asset.name, Math.max(0, partIndex))
    : null, [isCrystal, part.geometry, asset.name, partIndex]);
  const poses = useMemo(() => items.map(rock => {
    const p = parameters(rock);
    return { rock, scale: p?.scale || 1, yaw: p?.yaw || 0,
      y: getSnow64ObstacleBaseY(rock, groundY, p) };
  }), [items, groundY]);
  useEffect(() => () => { film?.dispose(); }, [film]);
  useLayoutEffect(() => {
    if (!isCrystal) return;
    // V63: drive the visible pastel animation directly on the material color.
    // This avoids relying on instanced color compilation paths, which made the
    // 12-second cycle hard to see or appear static on some renderer setups.
    part.material.color.copy(sampleCrystalBodyPastel(pastelColor, familyPhase));
    part.material.needsUpdate = true;
  }, [isCrystal, familyPhase, part.material, pastelColor]);
  useFrame(({ camera, clock }) => {
    if (!ref.current) return;
    poses.forEach((p, i) => {
      const hide = stateRef.current?.consumedRocks?.has(p.rock.id);
      dummy.position.set(p.rock.x, p.y, p.rock.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.setScalar(hide ? 0.000001 : p.scale);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      if (filmRef.current) filmRef.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (filmRef.current) filmRef.current.instanceMatrix.needsUpdate = true;
    if (isCrystal) {
      const phase = (clock.elapsedTime / CRYSTAL_CYCLE_SECONDS)
        * CRYSTAL_BODY_PASTELS.length + familyPhase;
      // One palette drives the textured body and the two thin-film endpoints.
      // All six colors appear in the actual HOLOGRAPHIC FILM, not only behind it.
      part.material.color.copy(sampleCrystalBodyPastel(pastelColor, phase));
      if (film) {
        film.uniforms.uPink.value.copy(part.material.color);
        film.uniforms.uBlue.value.copy(sampleCrystalBodyPastel(
          nextFilmPastel, phase + CRYSTAL_HOLO_NEXT_COLOR_OFFSET
        )).lerp(part.material.color, 1 - CRYSTAL_HOLO_SECOND_COLOR_BLEND);
      }
    }
    if (film) {
      // These CorePlanet flow/reflection controls are NOT changed in V64.
      film.uniforms.uTime.value = clock.elapsedTime;
      film.uniforms.uKeyViewPosition.value.copy(crystalKeyWorld)
        .applyMatrix4(camera.matrixWorldInverse);
      film.uniforms.uFillViewPosition.value.copy(crystalFillWorld)
        .applyMatrix4(camera.matrixWorldInverse);
    }
  });
  return <>
    <instancedMesh ref={ref} args={[part.geometry, part.material, items.length]}
      frustumCulled={false} dispose={null}/>
    {film && <instancedMesh ref={filmRef}
      args={[part.geometry, film, items.length]}
      renderOrder={3} frustumCulled={false} dispose={null}/>} 
  </>;
}
export function Snow64ObstacleField({rocks,stateRef,groundY,data}) {
  const groups=useMemo(()=>{
    const map=new Map();
    rocks.forEach(rock=>{
      const key=obstacleVariantName(rock);
      if(!data.variants.has(key))return;
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(rock);
    });
    return map;
  },[rocks,data]);
  return <group>{[...groups.entries()].flatMap(([name,items])=>{
    const asset=data.variants.get(name);
    return asset.parts.map((part,i)=><ObstacleMeshInstances key={`${name}-${i}`} asset={asset} part={part} items={items} stateRef={stateRef} groundY={groundY}/>);
  })}</group>;
}

// V64: animate thin-film colors with the crystal bodies; preserve GLB textures and
// CorePlanet-inspired holographic thin-film layer on each instanced crystal;
// 2 flowing interference waves, looping reflective strip, camera Fresnel,
// scene-linked light glints and pastel crystal family base colors.
// keep almost-white rocks, soft holographic sweep and V53 cinematic
// camera-directed fragments, GPU-friendly snow/sparkle point clouds, two
// shockwaves and additive motion streaks. No new image files or model meshes.
const V53_SHATTER_SECONDS = 1.75;
const V53_PALETTE = ["#fff9ff", "#d6f6ff", "#fcd7f9", "#cbbdff", "#bdf6ee"];
let v53GlowTexture = null;
function getV53GlowTexture() {
  if (v53GlowTexture) return v53GlowTexture;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + .5 - n / 2) / (n / 2);
    const dy = (y + .5 - n / 2) / (n / 2);
    const r2 = dx * dx + dy * dy;
    const falloff = Math.max(0, Math.exp(-r2 * 6.4) - Math.exp(-6.4));
    const alpha = Math.floor(255 * Math.min(1, falloff * 1.40));
    const offset = (y * n + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = 255;
    data[offset + 3] = alpha;
  }
  v53GlowTexture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  v53GlowTexture.magFilter = THREE.LinearFilter;
  v53GlowTexture.minFilter = THREE.LinearFilter;
  v53GlowTexture.wrapS = v53GlowTexture.wrapT = THREE.ClampToEdgeWrapping;
  v53GlowTexture.needsUpdate = true;
  return v53GlowTexture;
}

function v53Random(seed) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

function v53ParticleLayer(blast, count, isSpark, colors) {
  const rand = v53Random(stableHash(`${blast.obstacleVariant}:${blast.seed}:${isSpark ? 'spark' : 'snow'}`));
  const positions = new Float32Array(count * 3);
  const colorArray = new Float32Array(count * 3);
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const r = rand();
    const speed = isSpark ? 8.2 + rand() * 11.5 : 3.4 + rand() * 8.7;
    const birth = isSpark ? rand() * .13 : rand() * .20;
    const y = isSpark ? 3.7 + rand() * 7 : 2.6 + rand() * 5.4;
    const bias = (i % (isSpark ? 4 : 7) === 0) ? .75 : 0;
    particles.push({
      x: (rand() - .5) * .42, y: rand() * .55, z: (rand() - .5) * .42,
      vx: Math.cos(angle) * speed, vy: y, vz: Math.sin(angle) * speed,
      delay: birth, bias,
    });
    const c = colors[Math.floor(rand() * colors.length)];
    colorArray[i * 3] = c.r;
    colorArray[i * 3 + 1] = c.g;
    colorArray[i * 3 + 2] = c.b;
    positions[i * 3] = blast.x;
    positions[i * 3 + 1] = blast.baseY ?? blast.y;
    positions[i * 3 + 2] = blast.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
  const material = new THREE.PointsMaterial({
    map: getV53GlowTexture(), vertexColors: true,
    size: isSpark ? .50 : .77, sizeAttenuation: true,
    transparent: true, opacity: isSpark ? .95 : .64,
    depthTest: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  });
  return { geometry, material, particles, positions, isSpark };
}

function v53UpdateParticleLayer(layer, t, blast, toward) {
  const { particles, positions, geometry, material, isSpark } = layer;
  let alive = false;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const time = Math.max(0, t - p.delay);
    if (t >= p.delay && time < V53_SHATTER_SECONDS) alive = true;
    const horizontalBoost = isSpark ? 1.0 : .83;
    const towardPower = isSpark ? 13 : 9;
    positions[i * 3] = blast.x + p.x + (p.vx * horizontalBoost + toward.x * towardPower * p.bias) * time;
    positions[i * 3 + 1] = (blast.baseY ?? blast.y) + p.y + (p.vy + toward.y * 3 * p.bias) * time - (isSpark ? 4.6 : 3.9) * time * time;
    positions[i * 3 + 2] = blast.z + p.z + (p.vz * horizontalBoost + toward.z * towardPower * p.bias) * time;
  }
  geometry.getAttribute('position').needsUpdate = true;
  material.opacity = (isSpark ? .90 : .72) * Math.pow(Math.max(0, 1 - t / V53_SHATTER_SECONDS), isSpark ? 1.4 : 1.1);
  return alive;
}

function ShatterBurst({ blast, asset, stateRef, mobile }) {
  const fragments = useRef([]);
  const flashRef = useRef(null);
  const groundRingRef = useRef(null);
  const cameraRingRef = useRef(null);
  const streakRef = useRef(null);
  const toward = useRef(new THREE.Vector3(0, .3, 1));
  const lockedDirection = useRef(false);
  const scale = blast.scale || 1;
  const baseY = blast.baseY ?? blast.y ?? 0;
  const fragmentScale = scale * (mobile ? 1.95 : 2.4);
  const velocities = useMemo(() => {
    const rng = v53Random(stableHash(`${blast.seed}:${asset.name}:v53`));
    return asset.shards.map((_, i) => {
      const angle = i * 2.399963 + blast.seed * .53;
      const speed = 7.8 + (i % 5) * 1.5 + rng() * 2.8;
      return {
        x: Math.cos(angle) * speed,
        y: 6.4 + (i % 4) * 1.8 + rng() * 1.9,
        z: Math.sin(angle) * speed,
        // A few big shards shoot specifically TOWARD the camera.
        screen: i % 3 === 0 ? (mobile ? 10.4 : 14.5) : 2.6,
        spinX: (rng() > .5 ? 1 : -1) * (5 + rng() * 6),
        spinY: (rng() > .5 ? 1 : -1) * (6 + rng() * 7),
        spinZ: (rng() > .5 ? 1 : -1) * (5 + rng() * 7),
      };
    });
  }, [asset, blast.seed, mobile]);

  const colors = useMemo(() => {
    const palette = V53_PALETTE.map(hex => new THREE.Color(hex));
    const base = asset.parts.map(p => {
      const mat = Array.isArray(p.material) ? p.material[0] : p.material;
      return mat?.userData?.crystalInitialTint?.clone?.()
        || mat?.color?.clone?.() || new THREE.Color('#99eaff');
    });
    return base.length ? [...base, ...palette] : palette;
  }, [asset]);

  // Each burst has only two Points draw calls, rather than many individual
  // glowing meshes. Particle counts are halved on mobile devices.
  const effects = useMemo(() => ({
    snow: v53ParticleLayer(blast, mobile ? 36 : 76, false, colors),
    sparks: v53ParticleLayer(blast, mobile ? 24 : 52, true, colors),
  }), [blast, mobile, colors]);

  const trails = useMemo(() => {
    const pos = new Float32Array(asset.shards.length * 6);
    const tint = new Float32Array(asset.shards.length * 6);
    asset.shards.forEach((piece, i) => {
      const c = piece.material?.color || new THREE.Color('#bdeaff');
      const offset = i * 6;
      // Faint rear vertex, bright forward vertex.
      tint[offset] = c.r * .17; tint[offset + 1] = c.g * .17; tint[offset + 2] = c.b * .17;
      tint[offset + 3] = Math.min(1, c.r * 1.5 + .12);
      tint[offset + 4] = Math.min(1, c.g * 1.5 + .12);
      tint[offset + 5] = Math.min(1, c.b * 1.5 + .12);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: .80,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
    return { geometry, material, pos };
  }, [asset]);

  const flashMaterial = useMemo(() => new THREE.SpriteMaterial({
    map: getV53GlowTexture(), color: '#ffedff',
    transparent: true, opacity: .82, blending: THREE.AdditiveBlending,
    depthTest: false, depthWrite: false, fog: false,
  }), []);

  useEffect(() => () => {
    effects.snow.geometry.dispose(); effects.snow.material.dispose();
    effects.sparks.geometry.dispose(); effects.sparks.material.dispose();
    trails.geometry.dispose(); trails.material.dispose();
    flashMaterial.dispose();
  }, [effects, trails, flashMaterial]);

  useFrame(({ camera }) => {
    const t = Math.max(0, (stateRef.current?.t ?? blast.at) - blast.at);
    if (!lockedDirection.current) {
      const camPos = new THREE.Vector3();
      camera.getWorldPosition(camPos);
      toward.current.set(camPos.x - blast.x, camPos.y - (baseY + .8), camPos.z - blast.z);
      if (toward.current.lengthSq() < 1e-6) toward.current.set(0, .3, 1);
      toward.current.normalize();
      lockedDirection.current = true;
    }
    const direction = toward.current;
    const fade = Math.max(0, 1 - t / V53_SHATTER_SECONDS);
    const spinFade = Math.pow(fade, .7);
    const blastYaw = blast.yaw || 0;
    const cos = Math.cos(blastYaw), sin = Math.sin(blastYaw);
    const streakPos = trails.pos;

    fragments.current.forEach((node, i) => {
      if (!node) return;
      const v = velocities[i];
      const origin = asset.shards[i].center;
      const ox = origin.x * scale, oz = origin.z * scale;
      const x = blast.x + ox * cos + oz * sin + (v.x + direction.x * v.screen) * t;
      const z = blast.z - ox * sin + oz * cos + (v.z + direction.z * v.screen) * t;
      const y = baseY + origin.y * scale + (v.y + direction.y * v.screen) * t - 5.2 * t * t;
      node.position.set(x, Math.max(baseY - .6, y), z);
      node.rotation.set(t * v.spinX, blastYaw + t * v.spinY, t * v.spinZ);
      const growth = 1 + Math.min(1, t / .18) * (mobile ? .28 : .40);
      node.scale.setScalar(fragmentScale * growth * spinFade);
      node.visible = fade > .005;
      const o = i * 6;
      const tail = Math.min(.20, t * .7);
      streakPos[o] = x - (v.x + direction.x * v.screen) * tail;
      streakPos[o + 1] = y - (v.y + direction.y * v.screen) * tail;
      streakPos[o + 2] = z - (v.z + direction.z * v.screen) * tail;
      streakPos[o + 3] = x;
      streakPos[o + 4] = y;
      streakPos[o + 5] = z;
    });
    trails.geometry.getAttribute('position').needsUpdate = true;
    trails.material.opacity = Math.max(0, .95 * (1 - t / 1.05));
    if (streakRef.current) streakRef.current.visible = t < 1.05;

    v53UpdateParticleLayer(effects.snow, t, blast, direction);
    v53UpdateParticleLayer(effects.sparks, t, blast, direction);

    if (groundRingRef.current) {
      groundRingRef.current.position.set(blast.x, baseY + .08, blast.z);
      groundRingRef.current.scale.setScalar(.4 + t * 8.3);
      groundRingRef.current.material.opacity = .66 * Math.max(0, 1 - t / .90);
      groundRingRef.current.visible = t < .90;
    }
    if (cameraRingRef.current) {
      cameraRingRef.current.position.set(
        blast.x + direction.x * (1.0 + t * 3.3),
        baseY + .9 + direction.y * (1.0 + t * 3.3),
        blast.z + direction.z * (1.0 + t * 3.3)
      );
      cameraRingRef.current.quaternion.copy(camera.quaternion);
      cameraRingRef.current.scale.setScalar(.35 + t * 5.6);
      cameraRingRef.current.material.opacity = .70 * Math.max(0, 1 - t / .62);
      cameraRingRef.current.visible = t < .62;
    }
    if (flashRef.current) {
      flashRef.current.position.set(blast.x, baseY + .80, blast.z);
      flashRef.current.scale.setScalar(1.3 + t * 6.1);
      flashMaterial.opacity = .87 * Math.max(0, 1 - t / .38);
      flashRef.current.visible = t < .38;
    }
  });

  return <group>
    {asset.shards.map((piece, i) => <mesh key={i}
      ref={node => { fragments.current[i] = node; }}
      geometry={piece.geometry} material={piece.material} dispose={null} />)}
    <lineSegments ref={streakRef} geometry={trails.geometry} material={trails.material} dispose={null} frustumCulled={false}/>
    <points geometry={effects.snow.geometry} material={effects.snow.material} dispose={null} frustumCulled={false}/>
    <points geometry={effects.sparks.geometry} material={effects.sparks.material} dispose={null} frustumCulled={false}/>
    <sprite ref={flashRef} material={flashMaterial} dispose={null}/>
    <mesh ref={groundRingRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[.82, 1, 64]}/>
      <meshBasicMaterial color="#d5faff" transparent opacity={.55} depthWrite={false}
        depthTest={true} side={THREE.DoubleSide} blending={THREE.AdditiveBlending}/>
    </mesh>
    <mesh ref={cameraRingRef}>
      <ringGeometry args={[.65, .98, 56]}/>
      <meshBasicMaterial color="#ffbaf9" transparent opacity={.7} depthWrite={false}
        depthTest={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending}/>
    </mesh>
  </group>;
}

export function Snow64ObstacleShatterVFX({ stateRef, groundY, mobile }) {
  const data = useSnow64Obstacles();
  const [events, setEvents] = useState([]);
  const seen = useRef('');
  useFrame(() => {
    const s = stateRef.current;
    if (!s) return;
    const now = (s.rockExplosions || [])
      .filter(b => b.obstacleVariant && s.t - b.at < V53_SHATTER_SECONDS)
      .slice(mobile ? -2 : -4);
    const key = now.map(b => `${b.seed}:${b.at}:${b.obstacleVariant}`).join('|');
    if (key !== seen.current) { seen.current = key; setEvents(now); }
  });
  if (!data) return null;
  return <group>{events.map(blast => {
    const asset = data.variants.get(blast.obstacleVariant);
    if (!asset?.shards.length) return null;
    return <ShatterBurst key={`${blast.seed}-${blast.at}`} blast={blast} asset={asset}
      stateRef={stateRef} mobile={mobile} />;
  })}</group>;
}
