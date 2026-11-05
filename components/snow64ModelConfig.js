/**
 * SNOW 64 V17: optional custom 3D models.
 *
 * Upload these files to public/models/ in your Next.js project.
 * Only add the models you want to replace. Missing files use the original
 * procedural scenery automatically. You can change any filename here.
 *
 * Blender: export GLB (.glb), Apply Rotation & Scale, face the front of ramps
 * toward negative Z (downhill), keep rock/tree/board meshes static.
 * All props are normalized to their game's visual footprints by the loader.
 * Collision remains deterministic gameplay geometry, not GLB triangle meshes.
 */
export const SNOW64_MODEL_PATHS = Object.freeze({
  // Animated riders must preserve SnowboardIdle, SnowboardWipeout, Run, etc. clips.
  riderDesktop: "/models/alien-cat-snow360.glb",
  riderMobile: "/models/alien-cat-snow360-mobile.glb",
  // V79: replace legacy single-tree model with four baked/UV-safe GLBs.
  // Snow64ModelProvider already loads the static keys and shares them across
  // the intro and endless-course GPU-instancing layers.
  tree: null,
  treeLavender: "/models/snow64-sundae-tree-lavender.glb",
  treeMint: "/models/snow64-sundae-tree-mint.glb",
  treePeach: "/models/snow64-sundae-tree-peach.glb",
  treePink: "/models/snow64-sundae-tree-pink.glb",
  rock: "/models/snow64-rock.glb",
  ramp: null,
  ramp2: null,
  superRamp: null,
  token: null, // V72 stars are GPU-instanced geometry, not an optional GLB.
  frostShroom: "/models/snow64-frost-shroom.glb",
  snowboard: "/models/snow64-snowboard.glb",
  courseMarker: "/models/snow64-course-marker.glb",
  mountain: "/models/snow64-mountain.glb",
  explosionShard: "/models/snow64-explosion-shard.glb",
  explosionBurst: "/models/snow64-explosion-burst.glb",
});

/** Multiplies auto-fitted size. 1.0 means fit the established game footprint.
 * For ramp models, keep [1,1,1] so the visible mesh matches ramp collisions.
 */
export const SNOW64_MODEL_SCALE = Object.freeze({
  tree: [1,1,1], rock: [1,1,1], ramp: [1,1,1], ramp2: [1,1,1], superRamp: [1,1,1],
  token: [1,1,1], frostShroom: [1,1,1], snowboard: [1,1,1],
  courseMarker: [1,1,1], mountain: [1,1,1],
  explosionShard: [1,1,1], explosionBurst: [1,1,1],
});

/**
 * V46: CUSTOM snowboard sideways foot alignment, in game/world units.
 *
 * The original/procedural board and rider remain unchanged.
 * V42-V45 changed Z, which slides the board along its LENGTH rather than
 * aligning it under the rider's toes in the user's mobile screenshot.
 *
 * The mobile follow camera sees +X toward screen right. The rider's toes are
 * on that side of the custom board, so move the custom board toward +X.
 *
 * [ X sideways, Y height, Z lengthwise ]
 * Start with X=+0.22 and Z=0. Increase X to +0.26 if the feet still stick out,
 * or decrease to +0.16 if the deck moves too far toward the toes.
 * Keep Z=0 unless the nose/tail alignment is also wrong.
 *
 * Only applied to SnowGLBVisual(type="snowboard") by snow64VisualModels.jsx
 * from V45. This doesn't touch the mesh, texture, procedural board, or rider.
 */
export const SNOW64_SNOWBOARD_FOOT_TUNE = Object.freeze([0.22, 0, 0]);
