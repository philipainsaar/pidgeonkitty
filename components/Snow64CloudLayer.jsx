"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SNOW_CHUNK_LENGTH } from "./snow64Endless";
import {
  useSnow64Texture,
  useSnow64CorePlanetPileFilmMaterial
} from "./snow64VisualMaterials";

/**
 * SNOW360 V70 | Plush, rounded snowdrifts that follow the sidebank slope.
 *
 * Fixes the pancake-like V69 shelves:
 * - Full rounded 3D upper domes instead of almost-flat squashed balls.
 * - More balanced height/width and partial burial into the actual terrain.
 * - Each puff aligns to the local ground normal, including steep sidebanks.
 * - Several small overlapping lobes form irregular, cotton-soft snow clusters.
 * - White fleece is visible on the first frame; soft reveal follows loading.
 *
 * Decorative meshes only: snowboard physics remains groundY(), unchanged.
 */

const SEED = 0x69360;
const MAX_X = 32;
const STEP_X = 7.6;
const STEP_Z = 10.4;
const UP = new THREE.Vector3(0, 1, 0);
const CLOUD_COLORS = [
  "#ffffff", "#fffdfa", "#fff9fc", "#fffef6", "#faf7ff", "#f9fdff",
];

function random2(ix, iz, salt = 0) {
  let n = Math.imul(ix ^ SEED, 374761393) ^
    Math.imul(iz + 104729, 668265263) ^
    Math.imul(salt + 1729, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(a, b, value) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Organic wooly dome shape. Only the underside is slightly compressed.
 * Crucially, the upper hemisphere keeps its full height, unlike V69.
 */
function makePlushDomeGeometry(mobile) {
  const g = new THREE.SphereGeometry(1, mobile ? 12 : 18, mobile ? 9 : 12);
  const positions = g.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    // Uneven lobe outline, never a perfect round sphere or a flat disk.
    const outline = 1 + 0.037 * Math.sin(x * 5.2 + z * 3.4)
      + 0.022 * Math.sin(x * 8.3 - z * 6.1);
    const yy = y >= 0 ? y : y * 0.72;
    const crown = Math.max(0, y);
    const organic = crown * (
      0.032 * Math.sin(x * 4.0 + z * 2.8) +
      0.018 * Math.cos(z * 7.4 - x * 3.2)
    );
    positions.setXYZ(i, x * outline, yy + organic, z * outline);

    // Tiny, warm-white baked curvature shading rather than slate-gray light.
    // Unlit MeshBasicMaterial below remains consistent with V67 white fleece.
    const upper = THREE.MathUtils.clamp((yy + 0.28) / 1.28, 0, 1);
    const shade = 0.909 + 0.089 * upper;
    colors[i * 3] = Math.min(1, shade * 1.009);
    colors[i * 3 + 1] = Math.min(1, shade * 1.002);
    colors[i * 3 + 2] = Math.min(1, shade * 1.009);
  }
  positions.needsUpdate = true;
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Returns deterministic placements in *world* coordinates, stable per chunk. */
function buildPlacements(index, mobile, groundY, ramps) {
  const startZ = 32 - index * SNOW_CHUNK_LENGTH;
  const endZ = startZ - SNOW_CHUNK_LENGTH;
  const firstZ = Math.floor(endZ / STEP_Z) - 1;
  const lastZ = Math.ceil(startZ / STEP_Z) + 1;
  const firstX = Math.floor(-MAX_X / STEP_X) - 1;
  const lastX = Math.ceil(MAX_X / STEP_X) + 1;
  const placements = [];

  const nearRamp = (x, z, extra = 0) => (ramps || []).some(r =>
    Math.abs(x - r.x) < 3.1 + extra &&
    Math.abs(z - r.z) < (r.length ?? 3) * 0.5 + 2.2 + extra
  );

  for (let iz = firstZ; iz <= lastZ; iz++) {
    for (let ix = firstX; ix <= lastX; ix++) {
      const cx = (ix + 0.5) * STEP_X + (random2(ix, iz, 1) - 0.5) * 2.6;
      const cz = (iz + 0.5) * STEP_Z + (random2(ix, iz, 2) - 0.5) * 3.8;
      if (Math.abs(cx) > MAX_X || cz < endZ || cz >= startZ) continue;

      const clusterBank = smoothstep(9.6, 18.8, Math.abs(cx));
      const chance = (mobile ? 0.20 : 0.27) + clusterBank * (mobile ? 0.40 : 0.50);
      if (random2(ix, iz, 3) > chance) continue;

      // Group several smaller round lobes into a continuous fluffy formation.
      // They overlap strongly, rather than making isolated flat ledges.
      const clusterRadius = 0.95 + random2(ix, iz, 4) * (clusterBank > 0.50 ? 1.50 : 0.85);
      if (nearRamp(cx, cz, clusterRadius + 1.2)) continue;
      const count = clusterBank > 0.55
        ? (mobile ? 3 : 4) + Math.floor(random2(ix, iz, 5) * 2)
        : 2 + Math.floor(random2(ix, iz, 5) * 2);

      for (let j = 0; j < count; j++) {
        const angle = random2(ix, iz, 20 + j) * Math.PI * 2;
        const radius = Math.pow(random2(ix, iz, 40 + j), 0.72) * clusterRadius;
        const x = cx + Math.cos(angle) * radius;
        const z = cz + Math.sin(angle) * radius * 0.88;
        if (Math.abs(x) > MAX_X || z < endZ || z >= startZ) continue;
        if (nearRamp(x, z, 1.35)) continue;

        const bank = smoothstep(9.6, 19.2, Math.abs(x));
        const heightRnd = random2(ix, iz, 100 + j);
        // Heights are now substantial enough to actually read as 3D.
        // Bank: ~0.83–1.48 m above the local surface before burial.
        // Center: ~0.42–0.72 m, with more understated soft bumps.
        const sy = (0.43 + heightRnd * 0.31) * (1 - bank)
          + (0.88 + heightRnd * 0.63) * bank;
        // Maintain plump dome proportions instead of V69's width >> height.
        const sx = sy * (1.12 + random2(ix, iz, 60 + j) * 0.48);
        const sz = sy * (1.13 + random2(ix, iz, 80 + j) * 0.60);
        const bury = sy * (0.20 + random2(ix, iz, 120 + j) * 0.13);

        // Align each dome to the TRUE terrain normal so it merges smoothly
        // with angled sidewalls rather than floating as horizontal shelves.
        const e = 0.27;
        const slopeX = (groundY(x + e, z) - groundY(x - e, z)) / (2 * e);
        const slopeZ = (groundY(x, z + e) - groundY(x, z - e)) / (2 * e);
        const inv = 1 / Math.hypot(slopeX, 1, slopeZ);
        placements.push({
          x, y: groundY(x, z), z,
          sx, sy, sz, bury,
          nx: -slopeX * inv,
          ny: inv,
          nz: -slopeZ * inv,
          yaw: (random2(ix, iz, 140 + j) - 0.5) * Math.PI * 1.8,
          color: Math.floor(random2(ix, iz, 160 + j) * CLOUD_COLORS.length),
        });
      }
    }
  }
  return placements;
}

/** Same public props as the V68/V69 Snow64CloudLayer.jsx. */
export default function Snow64CloudLayer({
  index,
  mobile = false,
  groundY,
  ramps = [],
}) {
  const puffMap = useSnow64Texture("snowGround");
  const sharedPileFilm = useSnow64CorePlanetPileFilmMaterial();
  // Per chunk clone keeps the normal V68 texture-load fade smooth even for
  // the hologram. The world-space flow/time comes from the shared provider.
  const localPileFilm = useMemo(() => {
    if (!sharedPileFilm) return null;
    const mat = sharedPileFilm.clone();
    mat.uniforms.uOpacityMultiplier.value = 0;
    return mat;
  }, [sharedPileFilm]);
  const meshRef = useRef(null);
  const filmMeshRef = useRef(null);
  const materialRef = useRef(null);
  const reveal = useRef(0);

  const geometry = useMemo(() => makePlushDomeGeometry(mobile), [mobile]);
  const placements = useMemo(
    () => buildPlacements(index, mobile, groundY, ramps),
    [index, mobile, groundY, ramps]
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => localPileFilm?.dispose(), [localPileFilm]);

  useEffect(() => {
    const mesh = meshRef.current;
    const filmMesh = filmMeshRef.current;
    if (!mesh || !filmMesh || !puffMap || !localPileFilm) return;
    const m = new THREE.Matrix4();
    const surfaceQ = new THREE.Quaternion();
    const yawQ = new THREE.Quaternion();
    const rotation = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const n = new THREE.Vector3();
    const tint = new THREE.Color();

    placements.forEach((item, i) => {
      n.set(item.nx, item.ny, item.nz);
      surfaceQ.setFromUnitVectors(UP, n);
      yawQ.setFromAxisAngle(n, item.yaw);
      rotation.copy(yawQ).multiply(surfaceQ);
      p.set(item.x - item.nx * item.bury,
        item.y - item.ny * item.bury,
        item.z - item.nz * item.bury);
      s.set(item.sx, item.sy, item.sz);
      m.compose(p, rotation, s);
      mesh.setMatrixAt(i, m);
      filmMesh.setMatrixAt(i, m);
      tint.set(CLOUD_COLORS[item.color]);
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    filmMesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    filmMesh.computeBoundingSphere();
    reveal.current = 0;
    if (materialRef.current) materialRef.current.opacity = 0;
    localPileFilm.uniforms.uOpacityMultiplier.value = 0;
  }, [placements, puffMap, localPileFilm]);

  useFrame((_, dt) => {
    const material = materialRef.current;
    if (!material || !puffMap || !localPileFilm || !sharedPileFilm) return;
    if (reveal.current < 1) {
      reveal.current = Math.min(1, reveal.current + Math.min(dt, 0.08) * 1.75);
      material.opacity = reveal.current;
    }
    // Keep the same swirling CorePlanet flow and reflections on piles.
    // A separate uniform fade prevents white/blinking piles on load.
    localPileFilm.uniforms.uTime.value = sharedPileFilm.uniforms.uTime.value;
    localPileFilm.uniforms.uKeyViewPosition.value.copy(sharedPileFilm.uniforms.uKeyViewPosition.value);
    localPileFilm.uniforms.uFillViewPosition.value.copy(sharedPileFilm.uniforms.uFillViewPosition.value);
    localPileFilm.uniforms.uOpacityMultiplier.value =
      sharedPileFilm.uniforms.uOpacityMultiplier.value * reveal.current;
  });

  // V68 loading guard: never show untextured white placeholder domes.
  if (!puffMap || !localPileFilm || placements.length === 0) return null;

  return (
    <>
    <instancedMesh
      ref={meshRef}
      args={[geometry, null, placements.length]}
      castShadow={false}
      receiveShadow={false}
      renderOrder={1}
      dispose={null}
    >
      <meshBasicMaterial
        ref={materialRef}
        map={puffMap}
        vertexColors
        color="#ffffff"
        toneMapped={false}
        side={THREE.FrontSide}
        fog
        alphaHash
        opacity={0}
      />
    </instancedMesh>
    <instancedMesh
      ref={filmMeshRef}
      args={[geometry, localPileFilm, placements.length]}
      renderOrder={2}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
      dispose={null}
    />
    </>
  );
}
