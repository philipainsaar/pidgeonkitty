"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSnowModel, SnowGLBInstances } from "./snow64VisualModels";
import { useSnow64Texture } from "./snow64VisualMaterials";
import { hasSolidSnowUnderDecoration } from "./snow64SkylineFade";

/**
 * SNOW360 V85 | Rooted forest below open sky with a soft near-to-far transition.
 *
 * Full replacement for components/Snow64SundaeTrees.jsx.
 *
 * Same four textured GLBs, same downhill shape, existing terrain groundY,
 * original gameplay and physics. No model, UV or PBR material changes.
 *
 * The nearest row sits on the lower snowbanks, while middle and upper rows
 * become progressively less populated. The game's existing atmospheric fog
 * then softens trees toward the distant horizon.
 */

const TREE_KEYS = Object.freeze([
  "treeLavender",
  "treeMint",
  "treePeach",
  "treePink",
]);

// Pink's authored front faces the opposite direction to the other GLBs.
const FRONT_CORRECTION = [0, 0, 0, Math.PI];

const RIDE_LANE_EDGE = 12.0;
const NEAR_BANK_MIN_X = 14.6;
const SNOWBANK_OUTER_X = 21.65; // V85: forest roots stay below sky fade
const TREE_HEIGHT_BASE = 9.4;
const TREE_HEIGHT_PER_SIZE = 1.85;

// Full near-bank tree coverage. Each deeper row becomes less dense and a bit
// smaller, giving a layered forest rather than overlapping tree-top clusters.
const ROWS = Object.freeze([
  {
    name: "lower-bank",
    xMin: 14.6, xMax: 17.5,
    zShift: 0.0, zJitter: 3.6,
    desktopChance: 1.00, mobileChance: 0.86,
    minHeightFactor: 0.96, maxHeightFactor: 1.06,
  },
  {
    name: "middle-bank",
    xMin: 17.2, xMax: 19.7,
    zShift: -4.7, zJitter: 5.2,
    desktopChance: 0.90, mobileChance: 0.55,
    minHeightFactor: 0.83, maxHeightFactor: 0.98,
  },
  {
    name: "upper-bank",
    xMin: 19.1, xMax: 21.15,
    zShift: 3.9, zJitter: 6.5,
    desktopChance: 0.34, mobileChance: 0.17,
    minHeightFactor: 0.73, maxHeightFactor: 0.90,
  },
  {
    name: "back-bank",
    xMin: 20.0, xMax: 21.55,
    zShift: -6.5, zJitter: 7.3,
    desktopChance: 0.16, mobileChance: 0.065,
    minHeightFactor: 0.66, maxHeightFactor: 0.82,
  },
]);

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function hashTree(tree, salt = 0) {
  let h = Math.imul(Math.round(tree.x * 113) | 0, 374761393);
  h ^= Math.imul(Math.round(tree.z * 107) | 0, 668265263);
  h ^= Math.imul((salt + 7129) | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function between(a, b, t) {
  return a + (b - a) * t;
}

function faceCorridor(x, variation) {
  // The four models are generally aimed toward the rider rather than spun
  // randomly. The pink tree's separate 180° correction is kept below.
  const side = Math.sign(x) || 1;
  return -side * 0.16 + (variation - 0.5) * 0.11;
}

function separationDistance(a, b) {
  // Leave a little natural canopy overlap, but not huge merged tops.
  // Nearest row receives slightly more breathing room.
  return (a.height + b.height) * 0.23 +
    (a.rowIndex === 0 && b.rowIndex === 0 ? 1.0 : 0.25);
}

function clearOfOtherTrees(tree, existing) {
  for (const t of existing) {
    const dx = tree.x - t.x;
    const dz = tree.z - t.z;
    if (dx * dx + dz * dz < separationDistance(tree, t) ** 2) {
      return false;
    }
  }
  return true;
}

function createForest(anchors, mobile) {
  const variants = [[], [], [], []];
  const snowPiles = [];
  const seen = [-1, 1].map(() => []);
  const sorted = [...anchors]
    .filter((t) => t && Number.isFinite(t.x) && Number.isFinite(t.z))
    .sort((a, b) => a.z - b.z || a.x - b.x);

  for (const anchor of sorted) {
    const side = Math.sign(anchor.x) || 1;
    const sideTrees = seen[side === -1 ? 0 : 1];
    const baseHeight = TREE_HEIGHT_BASE + anchor.size * TREE_HEIGHT_PER_SIZE;

    ROWS.forEach((row, rowIndex) => {
      const chance = mobile ? row.mobileChance : row.desktopChance;
      if (hashTree(anchor, 70 + rowIndex) >= chance) return;

      // Try a few different deterministic positions to fit each additional
      // tree between its neighbors without excessive overlapping tops.
      const attempts = rowIndex === 0 ? 6 : 4;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const salt = rowIndex * 67 + attempt * 9;
        const x = side * between(
          row.xMin, row.xMax, hashTree(anchor, 101 + salt)
        );
        const z = anchor.z + row.zShift +
          (hashTree(anchor, 102 + salt) - 0.5) * row.zJitter;
        const height = baseHeight *
          between(row.minHeightFactor, row.maxHeightFactor,
            hashTree(anchor, 103 + salt)) *
          (mobile ? 0.97 : 1);

        const candidate = {
          id: `${anchor.id || `${anchor.x}/${anchor.z}`}-r${rowIndex}-a${attempt}`,
          x,
          z,
          height,
          rowIndex,
          yaw: faceCorridor(x, hashTree(anchor, 104 + salt)),
        };

        if (Math.abs(candidate.x) <= RIDE_LANE_EDGE + 2.3 ||
            Math.abs(candidate.x) > SNOWBANK_OUTER_X) {
          continue;
        }
        // Match the V84 terrain's fade, including its Z-dependent waviness.
        // Check the ENTIRE snow-root footprint: never keep a tree whose
        // trunk pile would appear suspended over a transparent snowbank.
        const rootHalfWidth = height * between(
          0.135, 0.178, hashTree(anchor, 106 + salt)
        );
        if (!hasSolidSnowUnderDecoration(x, z, rootHalfWidth)) continue;

        // Deterministic density falloff as the tree line approaches open sky.
        // No shader/material changes to the original PBR Sundae Dream GLBs.
        const upperBank = THREE.MathUtils.smoothstep(Math.abs(x), 18.3, 21.5);
        const visibility = 1 - upperBank * (mobile ? 0.62 : 0.48);
        if (hashTree(anchor, 209 + salt) > visibility) continue;

        if (!clearOfOtherTrees(candidate, sideTrees)) continue;
        sideTrees.push(candidate);
        const variant = Math.min(
          3, Math.floor(hashTree(anchor, 105 + salt) * 4)
        );
        variants[variant].push(candidate);

        // Blend the trunk into the very same snow texture as the ground.
        // A low dome is mostly buried instead of sitting on top like a ball.
        snowPiles.push({
          id: `${candidate.id}-snow`,
          x, z,
          height,
          rx: rootHalfWidth,
          ry: height * between(0.042, 0.059, hashTree(anchor, 107 + salt)),
          rz: height * between(0.120, 0.155, hashTree(anchor, 108 + salt)),
          yaw: hashTree(anchor, 109 + salt) * Math.PI * 2,
        });
        break;
      }
    });
  }

  return { variants, snowPiles };
}

function SnowAtTreeRoots({ items, groundY }) {
  const meshRef = useRef(null);
  const map = useSnow64Texture("snowGround");
  const scratch = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !map) return;

    const normal = new THREE.Vector3();
    const orientation = new THREE.Quaternion();
    const twist = new THREE.Quaternion();
    const step = 0.45;

    items.forEach((p, i) => {
      const slopeX = (groundY(p.x + step, p.z) -
        groundY(p.x - step, p.z)) / (2 * step);
      const slopeZ = (groundY(p.x, p.z + step) -
        groundY(p.x, p.z - step)) / (2 * step);

      normal.set(-slopeX, 1, -slopeZ).normalize();
      orientation.setFromUnitVectors(WORLD_UP, normal);
      twist.setFromAxisAngle(WORLD_UP, p.yaw);

      scratch.position.set(
        p.x,
        groundY(p.x, p.z) - p.ry * 0.72,
        p.z
      );
      scratch.quaternion.copy(orientation).multiply(twist);
      scratch.scale.set(p.rx, p.ry, p.rz);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, groundY, scratch, map]);

  if (!map || !items.length) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, items.length]}
      frustumCulled
      castShadow={false}
      receiveShadow={false}
    >
      <sphereGeometry args={[1, 16, 10]} />
      <meshBasicMaterial
        map={map}
        color="#fffdfd"
        fog
        toneMapped={false}
        depthWrite
      />
    </instancedMesh>
  );
}

export default function Snow64SundaeTrees({
  trees = [],
  groundY,
  mobile = false,
}) {
  const lavender = useSnowModel("treeLavender");
  const mint = useSnowModel("treeMint");
  const peach = useSnowModel("treePeach");
  const pink = useSnowModel("treePink");
  const models = [lavender, mint, peach, pink];

  const { variants, snowPiles } = useMemo(
    () => createForest(trees, mobile),
    [trees, mobile]
  );

  if (!models.every(Boolean) || typeof groundY !== "function") {
    return null;
  }

  return (
    <group name="SNOW360 V85 · Solid-Bank Forest & Root Snow">
      <SnowAtTreeRoots items={snowPiles} groundY={groundY} />

      {TREE_KEYS.map((key, variantIndex) => {
        const asset = models[variantIndex];
        const items = variants[variantIndex];
        if (!items.length) return null;

        const safeHeight = Math.max(0.0001, asset.size[1]);
        const widthRatio = asset.size[0] / safeHeight;
        const depthRatio = asset.size[2] / safeHeight;

        return (
          <SnowGLBInstances
            key={key}
            type="sundaeForest"
            asset={asset}
            items={items}
            pose={(tree) => ({
              position: [
                tree.x,
                groundY(tree.x, tree.z) - tree.height * 0.072,
                tree.z,
              ],
              rotation: [
                0,
                tree.yaw + FRONT_CORRECTION[variantIndex],
                0,
              ],
              dimensions: [
                tree.height * widthRatio,
                tree.height,
                tree.height * depthRatio,
              ],
            })}
          />
        );
      })}
    </group>
  );
}
