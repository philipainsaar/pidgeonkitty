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
  riderDesktop: "/models/pidgeonkitty-snowboard-v2.glb",
  riderMobile: "/models/pidgeonkitty-snowboard-v2-mobile.glb",
  tree: "/models/snow64-tree.glb",
  rock: "/models/snow64-rock.glb",
  ramp: "/models/snow64-ramp.glb",
  superRamp: "/models/snow64-super-ramp.glb",
  token: "/models/snow64-token.glb",
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
  tree: [1,1,1], rock: [1,1,1], ramp: [1,1,1], superRamp: [1,1,1],
  token: [1,1,1], frostShroom: [1,1,1], snowboard: [1,1,1],
  courseMarker: [1,1,1], mountain: [1,1,1],
  explosionShard: [1,1,1], explosionBurst: [1,1,1],
});

/**
 * V42: visual position offsets in GAME UNITS, after auto-scaling.
 * The loader normally recenters GLBs by their bounding boxes, so changing
 * the GLB origin in Blender does not shift the visible board in the game.
 *
 * SNOWBOARD: Negative Z is downhill / towards Pidgeon Kitty's facing
 * direction in the side camera. Start at -0.80 to center the bindings
 * under the rider's feet. Increase the magnitude for further forward:
 *   -0.60 = smaller correction; -0.80 = recommended; -1.00 = stronger.
 *
 * The offset affects ONLY the custom visual, not collision/physics.
 */
export const SNOW64_MODEL_POSITION_OFFSET = Object.freeze({
  snowboard: [0, 0, -0.80],
});
