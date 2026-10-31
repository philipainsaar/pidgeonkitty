/** Snow 64 collision helpers. Physics only; no Three.js dependency. */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const SIDE_PAD = 0.32; // rider/board overhang beyond visible 2m half-width
const END_PAD = 0.24; // prevent narrow gaps near ramp ends

/** Surface of the solid ramp deck, null when outside its rectangular footprint. */
export function rampTopAt(ramp, x, z, terrainHeight) {
  const half = (ramp.length ?? 3) / 2;
  if (Math.abs(x - ramp.x) > 2 + SIDE_PAD || z < ramp.z - half - END_PAD || z > ramp.z + half + END_PAD) return null;
  const t = clamp((ramp.z + half + END_PAD - z) / (2 * half + END_PAD), 0, 1);
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
  const halfWidth = 2 + SIDE_PAD;
  const side = from.x < ramp.x ? ramp.x - halfWidth : ramp.x + halfWidth;
  const dx = to.x - from.x;
  if (Math.abs(dx) < 1e-8) return false;
  const crossed = (from.x < side && to.x >= side) || (from.x > side && to.x <= side);
  if (!crossed || Math.abs(from.x - ramp.x) <= halfWidth) return false;
  const t = (side - from.x) / dx;
  if (t < 0 || t > 1) return false;
  const z = from.z + (to.z - from.z) * t;
  if (z < ramp.z - half - END_PAD || z > ramp.z + half + END_PAD) return false;
  const height = terrainHeight(ramp.x, ramp.z) + ramp.height * clamp((ramp.z + half - z) / (2 * half), 0, 1);
  return from.y + (to.y - from.y) * t < height - 0.08;
}

/**
 * Collision against a ramp's *solid wedge* while airborne.
 *
 * Sweeps the board's actual ballistic path, rather than testing only its
 * final point. This catches an Ollie launched just before a Super Air ramp
 * even at high tuck speed. A descending board may land ON the deck; passing
 * into its front/side/underside produces a wall impact instead.
 *
 * Coordinates and deck heights use the same rampTopAt() as grounded riding.
 */
export function sweptAirRampContact(from, to, ramp, terrainHeight) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const travel = Math.hypot(dx, dz);
  if (travel < 1e-7) return null;
  const steps = Math.max(2, Math.min(64, Math.ceil(travel / .16)));
  let lastDeck = rampTopAt(ramp, from.x, from.z, terrainHeight);
  let lastY = from.y;
  const descending = to.y < from.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    const y = from.y + (to.y - from.y) * t;
    const deck = rampTopAt(ramp, x, z, terrainHeight);
    if (deck !== null) {
      // The snowboard's contact edge is slightly wider/lower than its center.
      const clearance = .11;
      if (y < deck - clearance) {
        // Genuine descent through the upper surface is a valid deck landing.
        // Coming from outside or below the ramp is never converted to a landing.
        if (descending && lastDeck !== null && lastY >= lastDeck - clearance) {
          return {kind: 'deck', x, z, y: deck, t, rampId: ramp.id};
        }
        const terrain = terrainHeight(x, z);
        // Ignore negative-space detections below the terrain; ordinary ground
        // collision owns those. It remains a solid ramp if at snow level.
        if (y >= terrain - .65) {
          return {kind: 'wall', x, z, y: deck, t, rampId: ramp.id};
        }
      }
    }
    lastDeck = deck;
    lastY = y;
  }
  return null;
}
