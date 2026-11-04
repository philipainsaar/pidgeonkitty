"use client";

import { useMemo } from "react";
import { useSnowModel, SnowGLBInstances } from "./snow64VisualModels";

/**
 * SNOW360 V79 | Four Sundae Dream sidewall trees.
 *
 * Reads the ORIGINAL, deterministic tree placements from snow64Endless.js.
 * No new positions or gameplay collision changes.
 *
 * Each GLB is held once by Snow64ModelProvider and each color is batched
 * into the existing GPU-instanced SnowGLBInstances rendering.
 *
 * GLB UVs/materials/textures are used as authored, no remapping or tints.
 * Size follows original tree.size but preserves each GLB's actual proportions.
 */

const TREE_VARIANTS = Object.freeze([
  { key: "treeLavender", label: "Lavender" },
  { key: "treeMint", label: "Mint" },
  { key: "treePeach", label: "Peach" },
  { key: "treePink", label: "Pink" },
]);

function hashTree(tree, salt = 0) {
  // Position-based hash: stable across chunk reloads and identical in
  // gameplay/intro regardless of item order or React render count.
  let h = Math.imul(Math.round(tree.x * 113) | 0, 374761393);
  h ^= Math.imul(Math.round(tree.z * 107) | 0, 668265263);
  h ^= Math.imul((salt + 7129) | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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

  const grouped = useMemo(() => {
    const result = [[], [], [], []];

    for (const tree of trees) {
      // The original endless-course generator places trees along the banks.
      // Guard against future content extending into the rideable center.
      if (Math.abs(tree.x) < 14.25) continue;

      // Lower per-chunk instance count on mobile without moving trees.
      // Selection is stable, so nothing jumps as the camera moves.
      if (mobile && hashTree(tree, 17) < 0.20) continue;

      const variantIndex = Math.min(3, Math.floor(hashTree(tree, 0) * 4));
      result[variantIndex].push(tree);
    }
    return result;
  }, [trees, mobile]);

  // Use exactly one common load transition. Prevent half of the forest
  // appearing first while other model textures are still downloading.
  if (!models.every(Boolean) || typeof groundY !== "function") return null;

  return (
    <group name="SNOW360 Sundae Dream Forest · Lavender Mint Peach Pink">
      {TREE_VARIANTS.map((variant, index) => {
        const model = models[index];
        const items = grouped[index];
        if (items.length === 0) return null;

        return (
          <SnowGLBInstances
            key={variant.key}
            type="tree"
            asset={model}
            items={items}
            pose={(tree) => {
              // Preserve the GLB aspect ratio (no vertical stretching),
              // with heights close to the former procedural sidewall forest.
              const height = (2.5 + tree.size * 1.15) * (mobile ? .93 : 1);
              const ratioX = model.size[0] / model.size[1];
              const ratioZ = model.size[2] / model.size[1];
              return {
                position: [tree.x, groundY(tree.x, tree.z), tree.z],
                rotation: [0, hashTree(tree, 1) * Math.PI * 2, 0],
                dimensions: [height * ratioX, height, height * ratioZ],
              };
            }}
          />
        );
      })}
    </group>
  );
}
