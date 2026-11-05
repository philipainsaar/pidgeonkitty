// One contract for the welcome scene, game and character inspection page.
export const SNOW360_GAME_CLIPS = Object.freeze([
  "SnowboardIdle", "SnowboardCruise", "SnowboardTuck",
  "SnowboardCarveLeft", "SnowboardCarveRight", "SnowboardOllie",
  "SnowboardLanding", "SnowboardIndy", "SnowboardMethod",
  "SnowboardTailgrab", "SnowboardNosegrab", "SnowboardFrontflip",
  "SnowboardWipeout", "SnowboardRemount", "Run",
]);

const riders = Object.freeze({
  "alien-cat": Object.freeze({
    id: "alien-cat", name: "Alien Cat",
    desktop: "/models/alien-cat-snow360.glb",
    mobile: "/models/alien-cat-snow360-mobile.glb",
    scale: .86, bindingHeight: .169, offsetX: .16,
    wave: "Wave_Hello", plush: true,
  }),
  pidgeonkitty: Object.freeze({
    id: "pidgeonkitty", name: "PidgeonKitty",
    desktop: "/models/pidgeonkitty-snowboard-v2.glb",
    mobile: "/models/pidgeonkitty-snowboard-v2-mobile.glb",
    scale: .86, bindingHeight: .33, offsetX: 0,
    wave: "Wave", plush: false,
  }),
});

export function getSnow360Rider(id) {
  return riders[id] || riders["alien-cat"];
}

export function assertSnow360Clips(animations) {
  const names = new Set(animations.map(clip => clip.name));
  const missing = SNOW360_GAME_CLIPS.filter(name => !names.has(name));
  if (missing.length) throw new Error(`Rider is missing animations: ${missing.join(", ")}`);
}

/** Hysteresis keeps small steering corrections from restarting the carve. */
export function snow360CarvePose(steer, previous = "SnowboardCruise") {
  if (steer < -.18 || (previous === "SnowboardCarveLeft" && steer < -.09)) return "SnowboardCarveLeft";
  if (steer > .18 || (previous === "SnowboardCarveRight" && steer > .09)) return "SnowboardCarveRight";
  return "SnowboardCruise";
}
