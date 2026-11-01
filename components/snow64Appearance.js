/**
 * SNOW 64 V35: drop-in customizable appearance.
 * All paths are relative to Next.js public/ and are OPTIONAL.
 * No files uploaded? The game uses the original procedural visuals.
 * Snow textures should be seamless/tileable. Color/alpha images must be sRGB;
 * normal maps must be LINEAR and use OpenGL +Y green convention.
 */
export const SNOW64_TEXTURE_PATHS = Object.freeze({
  snowGround: "/textures/snow64-snow-ground.webp",
  snowBanks: "/textures/snow64-snow-banks.webp",
  snowNormal: "/textures/snow64-snow-normal.webp",
  bankNormal: "/textures/snow64-bank-normal.webp",
  snowflake: "/textures/snow64-snowflake.png",
  snowSpray: "/textures/snow64-snow-spray.png",
  explosionFlash: "/textures/snow64-explosion-flash.png",
});

/** World-space UVs never reset at procedural chunk boundaries. */
export const SNOW64_TERRAIN = Object.freeze({
  textureTileMeters: 7.5, // Lower = more repeats/detail; larger = wider patterns
  normalStrength: 0.45,
  roughness: 0.94,
  useGroundTextureOnBanksWhenMissing: true,
});

/** Mobile-friendly, pooled explosion art. Source models live in model config. */
export const SNOW64_EXPLOSION = Object.freeze({
  mobileBursts: 5,
  desktopBursts: 9,
  mobileShardsPerBurst: 7,
  desktopShardsPerBurst: 10,
  duration: 1.12,
  fragmentScale: 1,
  burstModelScale: 1.0,
  burstModelDuration: 0.46,
  flashDuration: 0.34,
  flashScale: 2.3,
  palette: ["#91adbe", "#c2dbed", "#95ffef", "#b776eb", "#e5faff"],
});
