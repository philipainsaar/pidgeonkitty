/**
 * SNOW360 V62: endless, deterministic 3D cotton-candy snowdrifts.
 *
 * Evaluated entirely in WORLD coordinates. Chunk seams share identical
 * positions/normals, and repeated runs reproduce the same lovely piles.
 * Both the renderer and gameplay groundY call the exact same function.
 *
 * For performance, mounds are sparse (a 3x3 cell neighborhood) and
 * return early if outside their elliptical footprints. No React state,
 * timers, meshes per pile, or per-frame geometry regeneration.
 */

const CELL_X = 7.0;
const CELL_Z = 9.2;
const SEED = 0x36072;
const mix = (a, b, t) => a + (b - a) * t;

function hash2(ix, iz, salt) {
  let h = Math.imul(ix ^ SEED, 374761393)
    ^ Math.imul(iz + 104729, 668265263)
    ^ Math.imul(salt + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function bankBlend(absX) {
  const t = Math.max(0, Math.min(1, (absX - 9.75) / 8.25));
  return t * t * (3 - 2 * t);
}
function bankBlendDx(x) {
  const t = (Math.abs(x) - 9.75) / 8.25;
  return t > 0 && t < 1
    ? 6 * t * (1 - t) / 8.25 * Math.sign(x)
    : 0;
}

/**
 * @param {number} x world X, meters
 * @param {number} z world Z, meters
 * @param {boolean} gradient whether to return analytic X/Z slopes too
 * @returns {number|{height:number,dx:number,dz:number}}
 */
export function snow360Drift(x, z, gradient = false) {
  const bank = bankBlend(Math.abs(x));
  const bankDx = gradient ? bankBlendDx(x) : 0;

  // Quiet, soft ripples through the riding lane, bigger between the trees.
  const a = 0.113 * x + 0.091 * z + 1.21;
  const b = 0.047 * x - 0.163 * z - 0.38;
  const sa = Math.sin(a), ca = Math.cos(a);
  const sb = Math.sin(b), cb = Math.cos(b);
  const wave = sa * cb;
  const amplitude = 0.095 + bank * 0.145;
  let height = amplitude * wave;
  let dx = 0, dz = 0;
  if (gradient) {
    dx = bankDx * 0.145 * wave
      + amplitude * (0.113 * ca * cb - 0.047 * sa * sb);
    dz = amplitude * (0.091 * ca * cb + 0.163 * sa * sb);
  }

  // Secondary, finer undulations sculpt soft, overlapping cloud billows
  // across the riding lane rather than saving all 3D volume for the banks.
  const c = 0.21 * x - 0.13 * z + 1.7;
  const d = 0.08 * x + 0.26 * z - .8;
  const sc = Math.sin(c), cc = Math.cos(c);
  const sd = Math.sin(d), cd = Math.cos(d);
  const fine = sc * cd;
  const fineAmplitude = 0.062 + bank * 0.055;
  height += fineAmplitude * fine;
  if (gradient) {
    dx += bankDx * 0.055 * fine
      + fineAmplitude * (0.21 * cc * cd - 0.08 * sc * sd);
    dz += fineAmplitude * (-0.13 * cc * cd - 0.26 * sc * sd);
  }

  // Sparse, smooth snow pillows. We only inspect adjacent world cells;
  // a pile's footprint cannot reach beyond this neighborhood.
  const cellX = Math.floor(x / CELL_X);
  const cellZ = Math.floor(z / CELL_Z);
  for (let j = cellZ - 1; j <= cellZ + 1; j++) {
    for (let i = cellX - 1; i <= cellX + 1; i++) {
      const cx = (i + 0.5) * CELL_X + (hash2(i, j, 1) - 0.5) * 3.8;
      const cz = (j + 0.5) * CELL_Z + (hash2(i, j, 2) - 0.5) * 5.0;
      const radiusX = 2.7 + hash2(i, j, 3) * 2.4;
      const radiusZ = 3.9 + hash2(i, j, 4) * 2.7;
      const nx = (x - cx) / radiusX;
      const nz = (z - cz) / radiusZ;
      const q = 1 - nx * nx - nz * nz;
      if (q <= 0) continue;

      const side = bankBlend(Math.abs(cx));
      const luck = hash2(i, j, 5);
      // Smooth, low mounds in the lane, taller plush heaps beyond x≈12.
      // The tiny central rise stays safe under the snowboard and ramps.
      const rise = mix(0.17 + luck * 0.26, 0.46 + luck * 0.86, side);
      const eased = q * q;
      height += rise * eased;
      if (gradient) {
        dx -= 4 * rise * q * (x - cx) / (radiusX * radiusX);
        dz -= 4 * rise * q * (z - cz) / (radiusZ * radiusZ);
      }
    }
  }
  return gradient ? {height, dx, dz} : height;
}
