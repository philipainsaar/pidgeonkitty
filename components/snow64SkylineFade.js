"use client";

/**
 * SNOW360 V84 | Snowbank-to-Sky horizon.
 * Geometry remains physically unchanged. Only triangles in the steep
 * upper-bank strip use a separate, softly transparent material.
 *
 * Triangles are grouped into opaque and transparent ranges without changing
 * vertex positions, normals, UVs, collider groundY or holographic coordinates.
 * This avoids making the playable ground translucent and protects depth writes.
 */
export const SNOWBANK_FADE_START = 22.9;
export const SNOWBANK_FADE_END = 33.35;

// Start the transparent group BEFORE alpha starts changing. This ensures
// the seam between the original solid material and the fading material is
// fully opaque, even when camera-aliasing resolves two triangles differently.
const SNOWBANK_FADE_GROUP_START = SNOWBANK_FADE_START - 1.9;

export function applySnowbankSkylineGroups(geometry, vertexPositions, triangleIndices) {
  const solid = [];
  const skyEdge = [];

  for (let i = 0; i < triangleIndices.length; i += 3) {
    const a = triangleIndices[i];
    const b = triangleIndices[i + 1];
    const c = triangleIndices[i + 2];
    const extreme = Math.max(
      Math.abs(vertexPositions[a * 3]),
      Math.abs(vertexPositions[b * 3]),
      Math.abs(vertexPositions[c * 3])
    );

    const destination = extreme > SNOWBANK_FADE_GROUP_START ? skyEdge : solid;
    destination.push(a, b, c);
  }

  geometry.setIndex([...solid, ...skyEdge]);
  geometry.clearGroups();
  geometry.addGroup(0, solid.length, 0);
  geometry.addGroup(solid.length, skyEdge.length, 1);
  return geometry;
}

/**
 * V85: exact CPU-side equivalent of the V84 snowbank shader's
 * smoothstep/organic Z waviness. Share the mask with visible decorations.
 *
 * The rendered snowbank's outer edge starts turning transparent at
 * abs(x) ~= 22.9, so NO fully opaque forest tree / trunk mound / snow puff
 * is allowed to stand on terrain after that point.
 */
export function getSnowbankSkyFadeAlpha(x, z) {
  const skyMeander =
    0.23 * Math.sin(z * 0.052) +
    0.13 * Math.sin(z * 0.137 + x * 0.17);
  const v = Math.abs(x) + skyMeander;
  const t = Math.max(0, Math.min(1,
    (v - SNOWBANK_FADE_START) /
    (SNOWBANK_FADE_END - SNOWBANK_FADE_START)
  ));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Test the OUTER footprint, not just the centre: the pile's outer rim
 * must also lie on nearly fully opaque ground. Keeps white snow blobs from
 * floating along the faded edge. Slight clearance prevents alpha shimmer.
 */
export function hasSolidSnowUnderDecoration(x, z, outerRadius = 0) {
  const side = x < 0 ? -1 : 1;
  const outerX = side * (Math.abs(x) + Math.max(0, outerRadius) + 0.18);
  return getSnowbankSkyFadeAlpha(outerX, z) >= 0.9995;
}
