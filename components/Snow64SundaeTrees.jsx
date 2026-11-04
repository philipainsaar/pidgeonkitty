"use client";

import { useMemo } from "react";
import { useSnowModel, SnowGLBInstances } from "./snow64VisualModels";

/**
 * SNOW360 V81 | Dense front-facing Sundae Dream forest.
 *
 * Goals from latest feedback:
 * - keep the same downhill bowl / corridor shape
 * - make the forest feel fuller like a real downhill lined with trees
 * - keep the decorated front of the GLB trees facing the rider corridor
 * - fix the Pink tree orientation only
 * - reduce top-part collisions between neighboring trees
 * - add more trees, but keep the center ride line open
 *
 * This file only changes visual tree placement. It does not change physics,
 * collisions, ramps, terrain generation, score, mobile controls, or effects.
 */

const VARIANTS = Object.freeze([
  "treeLavender",
  "treeMint",
  "treePeach",
  "treePink",
]);

// Pink tree's modeled "front" faces the opposite way from the others.
const VARIANT_YAW_OFFSET = [0, 0, 0, Math.PI];

const MIN_BANK_X = 15.8;
const PRIMARY_HEIGHT_BASE = 8.8;
const PRIMARY_HEIGHT_PER_SIZE = 1.95;
const MOBILE_HEIGHT_SCALE = 0.98;

// Extra forest rows. These create the packed real-forest feeling while staying
// on the sidewalls, not in the playable center corridor.
const EXTRA_ROWS = [
  {
    probabilityDesktop: 0.97,
    probabilityMobile: 0.58,
    outwardMin: 3.8,
    outwardMax: 7.0,
    zOffsetBase: -6.6,
    zOffsetJitter: 2.2,
    heightMin: 0.82,
    heightMax: 0.96,
  },
  {
    probabilityDesktop: 0.82,
    probabilityMobile: 0.34,
    outwardMin: 7.6,
    outwardMax: 12.4,
    zOffsetBase: 1.8,
    zOffsetJitter: 3.2,
    heightMin: 0.92,
    heightMax: 1.08,
  },
];

function hashTree(tree, salt = 0) {
  let h = Math.imul(Math.round(tree.x * 113) | 0, 374761393);
  h ^= Math.imul(Math.round(tree.z * 107) | 0, 668265263);
  h ^= Math.imul((salt + 7129) | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function faceTheCorridor(x, variation = 0) {
  const bankSide = Math.sign(x) || 1;
  // Trees should present their decorated front to the rider corridor.
  // Keep the turn subtle so they still look naturally planted.
  return -bankSide * 0.15 + (variation - 0.5) * 0.12;
}

function treeHeight(tree, mobile) {
  return (PRIMARY_HEIGHT_BASE + tree.size * PRIMARY_HEIGHT_PER_SIZE)
    * (0.95 + hashTree(tree, 31) * 0.14)
    * (mobile ? MOBILE_HEIGHT_SCALE : 1);
}

function minSpacingFor(heightA, heightB, rowIndexA, rowIndexB) {
  const base = (heightA + heightB) * 0.18;
  const extra = rowIndexA === rowIndexB ? 0.75 : 0.2;
  return base + extra;
}

function overlapsCandidate(candidate, placedForSide) {
  for (const placed of placedForSide) {
    const dx = candidate.x - placed.x;
    const dz = candidate.z - placed.z;
    const dist = Math.hypot(dx, dz);
    const minDist = minSpacingFor(candidate.height, placed.height, candidate.rowIndex, placed.rowIndex);
    if (dist < minDist) return true;
  }
  return false;
}

function pushTree(forest, sidePlaced, tree, variantSalt) {
  const variantIndex = Math.min(3, Math.floor(hashTree(tree, variantSalt) * 4));
  forest[variantIndex].push(tree);
  sidePlaced.push(tree);
}

function createForest(trees, mobile) {
  const forest = [[], [], [], []];
  const placedLeft = [];
  const placedRight = [];

  for (const anchor of trees) {
    if (Math.abs(anchor.x) < MIN_BANK_X) continue;
    if (mobile && hashTree(anchor, 17) < 0.12) continue;

    const side = Math.sign(anchor.x) || 1;
    const sidePlaced = side < 0 ? placedLeft : placedRight;
    const anchorHeight = treeHeight(anchor, mobile);

    const primary = {
      ...anchor,
      rowIndex: 0,
      height: anchorHeight,
      yaw: faceTheCorridor(anchor.x, hashTree(anchor, 11)),
    };
    pushTree(forest, sidePlaced, primary, 0);

    EXTRA_ROWS.forEach((row, rowIndex) => {
      const chance = mobile ? row.probabilityMobile : row.probabilityDesktop;
      if (hashTree(anchor, 100 + rowIndex) >= chance) return;

      let accepted = null;
      for (let attempt = 0; attempt < 4 && !accepted; attempt++) {
        const outward = row.outwardMin + hashTree(anchor, 110 + rowIndex * 10 + attempt) * (row.outwardMax - row.outwardMin);
        const x = side * clamp(Math.abs(anchor.x) + outward, MIN_BANK_X + 1.2, 34.5);
        const z = anchor.z + row.zOffsetBase + (hashTree(anchor, 120 + rowIndex * 10 + attempt) - 0.5) * row.zOffsetJitter;
        const scaleFactor = row.heightMin + hashTree(anchor, 130 + rowIndex * 10 + attempt) * (row.heightMax - row.heightMin);
        const candidate = {
          id: `${anchor.id}-forest-${rowIndex}-${attempt}`,
          x,
          z,
          size: anchor.size,
          rowIndex: rowIndex + 1,
          height: anchorHeight * scaleFactor,
          yaw: faceTheCorridor(x, hashTree(anchor, 140 + rowIndex * 10 + attempt)),
        };

        if (!overlapsCandidate(candidate, sidePlaced)) {
          accepted = candidate;
        }
      }

      if (accepted) {
        pushTree(forest, sidePlaced, accepted, 200 + rowIndex);
      }
    });
  }

  return forest;
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

  const grouped = useMemo(() => createForest(trees, mobile), [trees, mobile]);
  if (!models.every(Boolean) || typeof groundY !== "function") return null;

  return (
    <group name="SNOW360 V81 · Dense Front-Facing Sundae Forest">
      {VARIANTS.map((key, index) => {
        const asset = models[index];
        const items = grouped[index];
        if (!items.length) return null;
        const sizeY = Math.max(0.0001, asset.size[1]);
        const ratioX = asset.size[0] / sizeY;
        const ratioZ = asset.size[2] / sizeY;

        return (
          <SnowGLBInstances
            key={key}
            type="sundaeForest"
            asset={asset}
            items={items}
            pose={(tree) => ({
              position: [
                tree.x,
                groundY(tree.x, tree.z) - tree.height * 0.065,
                tree.z,
              ],
              rotation: [0, tree.yaw + VARIANT_YAW_OFFSET[index], 0],
              dimensions: [tree.height * ratioX, tree.height, tree.height * ratioZ],
            })}
          />
        );
      })}
    </group>
  );
}
