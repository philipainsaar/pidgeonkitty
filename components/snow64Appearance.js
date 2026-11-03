/**
 * SNOW360 V67: restored V63 3D snow-lobe geometry,
 * with snow-white realistic plush fleece rather than gray materials.
 */
export const SNOW64_TEXTURE_PATHS = Object.freeze({
  snowGround: "/textures/snow64-white-plush-color-v67.webp",
  snowBanks: null,
  snowNormal: "/textures/snow64-white-plush-normal-v67.webp",
  bankNormal: null,
  snowPile: "/textures/snow64-white-plush-pile-v67.webp",
  snowflake: "/textures/snow64-snowflake.png",
  snowSpray: "/textures/snow64-snow-spray.png",
  explosionFlash: "/textures/snow64-explosion-flash.png",
});

/** World space texture coordinates stay continuous between endless chunks. */
export const SNOW64_TERRAIN = Object.freeze({
  textureTileMeters: 5.9,
  normalStrength: 0.19,
  roughness: 0.995,
  useGroundTextureOnBanksWhenMissing: true,
});

/** Current game's explosion settings, preserved exactly. */
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
  palette: ["#91adbe","#c2dbed","#95ffef","#b776eb","#e5faff"],
});
