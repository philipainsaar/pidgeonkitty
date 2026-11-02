"use client";

import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

/**
 * SNOW360 V58: fluffy, softly rounded PROCEDURAL wedge ramps.
 *
 * - Straight planar riding surface matching the game's ramp collision slope.
 * - Rounded silhouette and bevels, not half-pipe sidewalls.
 * - Horizontal cloud patterns on the triangular side panels.
 * - Blue/yellow regular variants; pink reserved for Super Big Air.
 * - UV size stays proportional in world units across all ramp sizes.
 */
const FLEECE_TEXTURES = [
  "/textures/snow360-cloud-blue.jpg",
  "/textures/snow360-cloud-yellow.jpg",
  "/textures/snow360-cloud-pink.jpg",
];

const RAMP_WIDTH = 4;
const FABRIC_TILE_METERS = 4;
const BEVEL_SEGMENTS = 6;

/** The profile runs from entry (0, 0) to the high lip (length, height).
 * Its upper edge remains a linear incline, with small rounded corners.
 */
function roundedWedgeShape(length, height, cornerCut) {
  const vertices = [[0, 0], [length, 0], [length, height]];
  const corners = vertices.map((v, i) => {
    const prev = vertices[(i + 2) % 3];
    const next = vertices[(i + 1) % 3];
    const along = p => {
      const dx = p[0] - v[0], dy = p[1] - v[1];
      const factor = cornerCut / Math.max(0.0001, Math.hypot(dx, dy));
      return [v[0] + dx * factor, v[1] + dy * factor];
    };
    return {before: along(prev), after: along(next)};
  });

  const shape = new THREE.Shape();
  shape.moveTo(...corners[0].after);
  for (let i = 1; i < 3; i++) {
    shape.lineTo(...corners[i].before);
    shape.quadraticCurveTo(...vertices[i], ...corners[i].after);
  }
  shape.lineTo(...corners[0].before);
  shape.quadraticCurveTo(...vertices[0], ...corners[0].after);
  shape.closePath();
  return shape;
}

function makeRoundedRampGeometry(rawHeight, rawLength, superAir) {
  const h = Math.max(0.1, rawHeight);
  const length = Math.max(0.5, rawLength);
  const round = Math.min(superAir ? 0.19 : 0.13, h * 0.17, length * 0.055);
  const bevelThickness = round;
  const bevelSize = round * 0.35;
  const cornerCut = Math.min(round * 1.4, h * 0.17, length * 0.05);
  const shape = roundedWedgeShape(length, h, cornerCut);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: RAMP_WIDTH - 2 * bevelThickness,
    steps: 1,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: BEVEL_SEGMENTS,
    curveSegments: 7,
  });

  // Remap (forward, up, width) to world (X, Y, Z).
  // This keeps the deck flat in X and linear from +Z entry to -Z lip.
  const positions = geometry.getAttribute("position");
  const original = new Float32Array(positions.array);
  for (let i = 0; i < positions.count; i++) {
    positions.setXYZ(i,
      original[i * 3 + 2] - RAMP_WIDTH * 0.5 + bevelThickness,
      original[i * 3 + 1],
      length * 0.5 - original[i * 3]);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  // ExtrudeGeometry groups with materialIndex 0 are the triangular side caps.
  const isCap = new Uint8Array(positions.count);
  for (const group of geometry.groups) {
    if (group.materialIndex === 0) {
      for (let i = group.start; i < group.start + group.count; i++) isCap[i] = 1;
    }
  }
  const normals = geometry.getAttribute("normal");
  const uv = new Float32Array(positions.count * 2);
  const tile = FABRIC_TILE_METERS;
  const slopeScale = Math.hypot(length, h) / length;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const forward = length * 0.5 - z;
    const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
    let u, v;
    if (isCap[i] || Math.abs(nx) > 0.75) {
      // Side triangles: clouds align along horizontal travel, not vertically.
      u = forward / tile;
      v = y / tile;
    } else if (ny > 0.20) {
      // Riding deck: true physical lengths prevent stretching on Big Air.
      u = (x + RAMP_WIDTH / 2) / tile;
      v = forward * slopeScale / tile;
    } else if (nz < -0.20) {
      // Back face beneath the lip: clouds remain horizontal.
      u = (x + RAMP_WIDTH / 2) / tile;
      v = y / tile;
    } else {
      u = (x + RAMP_WIDTH / 2) / tile;
      v = forward / tile;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.computeBoundingBox();
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
  const geometry = useMemo(
    () => makeRoundedRampGeometry(height, length, superAir),
    [height, length, superAir],
  );

  useEffect(() => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // A low, rounded pastel takeoff trim; not a raised sidewall.
  const trimColor = styleIndex === 2 ? "#ffd4ee" : styleIndex === 1 ? "#fff3ce" : "#daf1ff";
  return (
    <group position={[x, groundHeight, z]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial map={texture} color="#ffffff" roughness={0.98}
          metalness={0} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, height + 0.012, -length * 0.5 + 0.035]}
        rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.038, RAMP_WIDTH - 0.24, 4, 8]} />
        <meshStandardMaterial color={trimColor} roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

