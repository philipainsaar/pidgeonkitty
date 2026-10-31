/** Snow 64 collision helpers. Physics only; no Three.js dependency. */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Surface of the solid ramp deck, null when outside its rectangular footprint. */
export function rampTopAt(ramp, x, z, terrainHeight) {
  const half = (ramp.length ?? 3) / 2;
  if (Math.abs(x - ramp.x) > 1.96 || z < ramp.z - half || z > ramp.z + half) return null;
  const t = clamp((ramp.z + half - z) / (2 * half), 0, 1);
  return terrainHeight(ramp.x, ramp.z) + t * ramp.height;
}

export function snowSurfaceAt(x, z, chunks, terrainHeight) {
  let height = terrainHeight(x, z);
  let supportingRamp = null;
  for (const chunk of chunks) {
    for (const ramp of chunk.ramps) {
      const deck = rampTopAt(ramp, x, z, terrainHeight);
      if (deck !== null && deck > height) {
        height = deck;
        supportingRamp = ramp;
      }
    }
  }
  return {height, ramp: supportingRamp};
}

/** Closest point on the rider's XZ travel segment. Prevents high-speed tunnelling. */
export function sweptRockHit(from, to, rock, terrainHeight, riderRadius = 0.37) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? clamp(((rock.x - from.x) * dx + (rock.z - from.z) * dz) / len2, 0, 1) : 0;
  const x = from.x + dx * t, z = from.z + dz * t;
  const radius = rock.size * 1.10 + riderRadius;
  if ((x-rock.x)**2 + (z-rock.z)**2 > radius*radius) return false;
  const boardY = from.y + (to.y - from.y) * t;
  const rockTop = terrainHeight(rock.x, rock.z) + rock.size * 1.43;
  return boardY < rockTop + 0.16;
}

/** Do not let the rider teleport onto tall ramp sides when entering from the edge. */
export function sweptRampSideHit(from, to, ramp, terrainHeight) {
  const half = (ramp.length ?? 3) / 2;
  const side = from.x < ramp.x ? ramp.x - 1.96 : ramp.x + 1.96;
  const dx = to.x - from.x;
  if (Math.abs(dx) < 1e-8) return false;
  const crossed = (from.x < side && to.x >= side) || (from.x > side && to.x <= side);
  if (!crossed || Math.abs(from.x - ramp.x) <= 1.96) return false;
  const t = (side - from.x) / dx;
  if (t < 0 || t > 1) return false;
  const z = from.z + (to.z - from.z) * t;
  if (z < ramp.z - half || z > ramp.z + half) return false;
  const height = terrainHeight(ramp.x, ramp.z) + ramp.height * clamp((ramp.z + half - z) / (2 * half), 0, 1);
  return from.y + (to.y - from.y) * t < height - 0.08;
}
