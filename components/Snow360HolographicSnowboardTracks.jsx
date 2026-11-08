"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Snow360: world-space, fading holographic snowboard imprints for both game modes.
 *
 * One draw call, no Canvas/HTML overlays, no textures or network assets.
 * Stamps are terrain-conforming quads, stored in a capped reusable GPU ring.
 * The fragment shader keeps them planted in the snow while animating a
 * CorePlanet/crystal-style rainbow film with fine, twinkling glints.
 *
 * The snowboard's actual motion supplies the path. This is intentionally a
 * *contact* effect: no stamps during jumps, wipeouts, ramps or powered flight.
 */
const VERTICES_PER_STAMP = 6;
const QUAD_CORNERS = [
  [-1, -1, 0, 0], [1, -1, 1, 0], [-1, 1, 0, 1],
  [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1],
];

const TRACK_VERTEX = /* glsl */ `
  attribute float aBorn;
  attribute vec2 aTrailUv;
  varying float vBorn;
  varying vec2 vTrailUv;
  varying vec3 vWorldPosition;

  void main() {
    vBorn = aBorn;
    vTrailUv = aTrailUv;
    // Positions are baked in Snow360 world space; mesh transform is identity.
    vWorldPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRACK_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uLifetime;
  varying float vBorn;
  varying vec2 vTrailUv;
  varying vec3 vWorldPosition;

  float trailHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  vec3 trailRainbow(float h) {
    vec3 rgb = clamp(abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    // A soft candy pastel film rather than hard primary colors.
    return mix(vec3(1.0), rgb, 0.50);
  }

  void main() {
    if (vBorn < -1000.0) discard;
    float age = max(0.0, uTime - vBorn);
    if (age > uLifetime) discard;

    float life = 1.0 - smoothstep(0.0, uLifetime, age);
    // Each stamp overlaps its neighbors. Soften its front/rear boundaries,
    // but leave the actual rail edges visible as a compressed snow groove.
    float ends = smoothstep(0.0, 0.20, vTrailUv.y) *
                 (1.0 - smoothstep(0.80, 1.0, vTrailUv.y));
    float sides = smoothstep(0.00, 0.12, vTrailUv.x) *
                  (1.0 - smoothstep(0.88, 1.00, vTrailUv.x));
    float across = abs(vTrailUv.x - 0.5) * 2.0;
    float pressedEdge = exp(-pow((across - 0.73) * 9.0, 2.0));
    float pressedCenter = 1.0 - smoothstep(0.14, 1.05, across);

    float filmWave = sin(vWorldPosition.x * 5.1 - vWorldPosition.z * 2.7 + uTime * 1.3);
    float filmWave2 = sin(vWorldPosition.z * 4.3 + vWorldPosition.x * 2.5 - uTime * 0.85);
    float hue = fract(vWorldPosition.x * 0.072 - vWorldPosition.z * 0.045 +
                     uTime * 0.095 + 0.075 * filmWave + 0.035 * filmWave2);
    vec3 iridescence = trailRainbow(hue);

    // Crystal-like moving thin-film sweep across the stamped snow, not a
    // screen-space rainbow overlay.
    float band = sin(vWorldPosition.x * 8.2 + vWorldPosition.z * 6.5 - uTime * 2.6);
    float filmGlint = pow(max(0.0, band), 12.0);

    // Procedural glitters remain fixed in world space and pulse in time.
    // No points system, alpha-texture atlas, or second transparent draw call.
    vec2 cellUV = vWorldPosition.xz * 12.0;
    vec2 cell = floor(cellUV);
    vec2 within = fract(cellUV) - 0.5;
    float chance = trailHash(cell);
    float twinkle = pow(max(0.0, sin(uTime * (3.0 + chance * 3.0) + chance * 30.0)), 5.0);
    float mote = step(0.935, chance) *
                 exp(-dot(within, within) * 65.0) * twinkle;

    // Faint compressed track underneath, colored flowing hologram above.
    vec3 packedSnow = vec3(0.66, 0.77, 0.90);
    vec3 film = mix(packedSnow, iridescence, 0.74 + 0.16 * filmWave);
    film = mix(film, vec3(1.0, 0.99, 0.96), clamp(0.66 * mote + 0.19 * filmGlint, 0.0, 0.91));
    float trailOpacity = 0.28 * pressedCenter + 0.24 * pressedEdge +
                         0.16 * filmGlint + 0.34 * mote;
    float opacity = clamp(trailOpacity * life * sides * (0.80 + 0.20 * ends), 0.0, 0.79);
    if (opacity < 0.007) discard;
    gl_FragColor = vec4(film, opacity);
    #include <colorspace_fragment>
  }
`;

function writeStamp(positions, births, coordinates, index, x, z, dirX, dirZ,
  length, width, born, snowHeight) {
  const len = Math.hypot(dirX, dirZ) || 1;
  const tx = dirX / len;
  const tz = dirZ / len;
  // A horizontal perpendicular to the actual rider path.
  const sideX = -tz;
  const sideZ = tx;
  const halfLength = length * 0.5;
  const halfWidth = width * 0.5;
  const offset = index * VERTICES_PER_STAMP;
  for (let i = 0; i < VERTICES_PER_STAMP; i++) {
    const [across, along, u, v] = QUAD_CORNERS[i];
    const px = x + sideX * halfWidth * across + tx * halfLength * along;
    const pz = z + sideZ * halfWidth * across + tz * halfLength * along;
    const base = (offset + i) * 3;
    positions[base] = px;
    positions[base + 1] = snowHeight(px, pz) + 0.048;
    positions[base + 2] = pz;
    births[offset + i] = born;
    const tex = (offset + i) * 2;
    coordinates[tex] = u;
    // Add an integer phase along the path for continuous, seeded trail motion.
    coordinates[tex + 1] = v;
  }
}

export default function Snow360HolographicSnowboardTracks({
  stateRef,
  groundY,
  mobile = false,
  phase = "playing",
}) {
  const maximum = mobile ? 240 : 390;
  const lifespan = mobile ? 4.9 : 5.7;
  const mesh = useRef(null);
  const written = useRef(0);
  const last = useRef(null);
  const leftover = useRef(0);

  const data = useMemo(() => {
    const positions = new Float32Array(maximum * VERTICES_PER_STAMP * 3);
    const births = new Float32Array(maximum * VERTICES_PER_STAMP).fill(-100000);
    const coordinates = new Float32Array(maximum * VERTICES_PER_STAMP * 2);
    const geometry = new THREE.BufferGeometry();
    const posAttribute = new THREE.BufferAttribute(positions, 3);
    const birthAttribute = new THREE.BufferAttribute(births, 1);
    const uvAttribute = new THREE.BufferAttribute(coordinates, 2);
    uvAttribute.setUsage(THREE.DynamicDrawUsage);
    posAttribute.setUsage(THREE.DynamicDrawUsage);
    birthAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", posAttribute);
    geometry.setAttribute("aBorn", birthAttribute);
    geometry.setAttribute("aTrailUv", uvAttribute);
    geometry.setDrawRange(0, positions.length / 3);
    const material = new THREE.ShaderMaterial({
      name: "Snow360_FadingRainbowSnowboardImprints",
      uniforms: { uTime: { value: 0 }, uLifetime: { value: lifespan } },
      vertexShader: TRACK_VERTEX,
      fragmentShader: TRACK_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    return { geometry, material, positions, births, coordinates, posAttribute, birthAttribute, uvAttribute };
  }, [maximum, lifespan]);

  useEffect(() => () => {
    data.geometry.dispose();
    data.material.dispose();
  }, [data]);

  useFrame(() => {
    if (!mesh.current) return;
    const s = stateRef.current;
    if (!s) return;
    data.material.uniforms.uTime.value = Number(s.t) || 0;

    // Do not print trails while the player isn't actually riding the snow.
    // Keep existing marks fading, but stop the emission during hover/flight.
    const ride = phase === "playing" &&
      s.speed > 2.5 && !s.recovery && !s.inAir && !s.icecreamHover &&
      (s.icecreamExitLift || 0) < 0.12 && s.t > 0 &&
      Math.abs((s.worldY || 0) - groundY(s.x, s.z)) < 0.36;
    if (!ride) {
      last.current = null;
      leftover.current = 0;
      return;
    }

    const current = { x: s.x, z: s.z };
    const previous = last.current;
    last.current = current;
    if (!previous) return;
    const dx = current.x - previous.x;
    const dz = current.z - previous.z;
    const distance = Math.hypot(dx, dz);
    // Don't bridge teleports or abrupt recovery repositioning with a giant mark.
    if (distance < 0.001 || distance > 16) {
      leftover.current = 0;
      return;
    }
    // Keep roughly the same number of GPU stamps per *second* as score/speed
    // increases. This preserves a graceful fade instead of abruptly recycling
    // marks at high Token Rush speeds (especially on mobile).
    const spacing = THREE.MathUtils.clamp(
      s.speed / (mobile ? 48 : 70), 0.60, 2.7
    );
    const first = spacing - leftover.current;
    if (first > distance) {
      leftover.current += distance;
      return;
    }

    // At very high speeds sample intermediate ground points, so marks stay
    // contiguous without increasing draw calls or applying screen decals.
    let samples = 0;
    for (let traveled = first; traveled <= distance + 0.00001 && samples < 30; traveled += spacing) {
      const f = traveled / distance;
      const x = THREE.MathUtils.lerp(previous.x, current.x, f);
      const z = THREE.MathUtils.lerp(previous.z, current.z, f);
      const i = written.current++ % maximum;
      writeStamp(data.positions, data.births, data.coordinates, i,
        x, z, dx, dz, spacing * 1.35,
        THREE.MathUtils.clamp(0.71 + Math.abs(s.steer || 0) * 0.10, 0.71, 0.83),
        s.t, groundY);
      samples++;
    }
    leftover.current = (leftover.current + distance) % spacing;
    if (samples) {
      data.posAttribute.needsUpdate = true;
      data.birthAttribute.needsUpdate = true;
      // The slot UVs are updated when the ring stamp is reused.
      data.uvAttribute.needsUpdate = true;
    }
  });

  return <mesh ref={mesh} geometry={data.geometry} material={data.material}
    name="Snow360 Holographic Snowboard Snowprints"
    renderOrder={4} frustumCulled={false}
    castShadow={false} receiveShadow={false} />;
}
