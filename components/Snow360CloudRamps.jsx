"use client";

import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

/**
 * SNOW360 V51: gameplay-aligned procedural wedge ramps with three cloud-fleece fabrics.
 *
 * IMPORTANT: The riding deck is EXACTLY the same LINEAR slope as rampTopAt()
 * in snow64Collision.js: near (+Z) = 0, far (-Z) = ramp.height.
 * There are NO half-pipe walls and NO GLB geometry to misalign with the rider.
 *
 * All surfaces reuse the compact exported fleecy textures, including the
 * blue/yellow/pink tones originally baked from Ramps 123.blend.
 */
const FLEECE_TEXTURES = [
  "/textures/snow360-cloud-blue.jpg",
  "/textures/snow360-cloud-yellow.jpg",
  "/textures/snow360-cloud-pink.jpg",
];

const RAMP_HALF_WIDTH = 2;
const FABRIC_TILE_METERS = 4; // Texture repeats by world-size, not by ramp height.

function createProceduralRamp(height, length) {
  const half = length * 0.5;
  const h = Math.max(0.01, height);
  const riseLength = Math.hypot(length, h);
  const tile = FABRIC_TILE_METERS;
  const pos = [];
  const uv = [];

  function tri(a, b, c, ta, tb, tc) {
    for (const [p, t] of [[a, ta], [b, tb], [c, tc]]) {
      pos.push(...p);
      uv.push(...t);
    }
  }
  function quad(a, b, c, d, ta, tb, tc, td) {
    tri(a, b, c, ta, tb, tc);
    tri(b, d, c, tb, td, tc);
  }

  const entryL = [-RAMP_HALF_WIDTH, 0, half];
  const entryR = [RAMP_HALF_WIDTH, 0, half];
  const lipL = [-RAMP_HALF_WIDTH, h, -half];
  const lipR = [RAMP_HALF_WIDTH, h, -half];
  const baseL = [-RAMP_HALF_WIDTH, 0, -half];
  const baseR = [RAMP_HALF_WIDTH, 0, -half];

  // The snowboard slides up this FLAT sloping deck, not into a half pipe.
  // UVs are proportional to physical distance so the clouds aren't stretched
  // vertically on the taller Big Air version.
  const u0 = 0;
  const u1 = 2 * RAMP_HALF_WIDTH / tile;
  const v1 = riseLength / tile;
  quad(entryL, entryR, lipL, lipR,
    [u0, 0], [u1, 0], [u0, v1], [u1, v1]);

  // Front vertical face under the lip.
  quad(lipL, lipR, baseL, baseR,
    [u0, v1], [u1, v1], [u0, v1 + h / tile], [u1, v1 + h / tile]);

  // Closed triangular side faces. Decorative only: collision is governed by
  // the same rampTopAt / sweptRampSideHit routines as the original game.
  tri(entryL, lipL, baseL,
    [0, 0], [riseLength / tile, 0], [length / tile, h / tile]);
  tri(entryR, baseR, lipR,
    [0, 0], [length / tile, h / tile], [riseLength / tile, 0]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export default function Snow360CloudRamp({
  x, z, index = 0, height = 1.12, length = 3,
  superAir = false, variant, groundHeight = 0,
}) {
  const ordinaryVariant = variant === undefined ? index % 2 : variant;
  const styleIndex = superAir ? 2 : ordinaryVariant === 1 ? 1 : 0;
  const texture = useTexture(FLEECE_TEXTURES[styleIndex]);
  const geometry = useMemo(() => createProceduralRamp(height, length), [height, length]);

  useEffect(() => {
    // useTexture caches these THREE.Texture instances across all course chunks.
    // RepeatWrapping supports proportional UVs outside 0..1 on the Big Air ramp.
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const lipColor = styleIndex === 2 ? "#ffb9e6" : styleIndex === 1 ? "#ffefba" : "#d0efff";
  return (
    <group position={[x, groundHeight, z]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial map={texture} color="#ffffff" roughness={0.98}
          metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {/* Small pastel takeoff trim, fully aligned with the collision lip. */}
      <mesh position={[0, height + 0.038, -length / 2]} castShadow>
        <boxGeometry args={[3.94, 0.075, 0.12]} />
        <meshStandardMaterial color={lipColor} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}
