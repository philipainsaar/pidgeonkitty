/**
 * SNOW 64: lightweight, deterministic crash physics. No physics engine needed.
 * The free snowboard is a single independent rigid body. It is simulated only
 * while a rider is recovering, and collides with the same snow/ramp surface
 * used by the rest of the game.
 */
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const GRAVITY = 18.6;

export function createCrashBoard(state, kind = 'wipeout') {
  const speed = Math.max(0, state.speed || 0);
  // Deterministic kick to one side; enough motion to see, not enough to escape
  // the active course chunk or draw distance on a slower phone.
  const side = (state.steer || 0) < -.12 ? -1 : (state.steer || 0) > .12 ? 1 :
    Math.sin(state.x * 4.2 + state.z * .31) >= 0 ? 1 : -1;
  const force = kind === 'wipeout' ? 1 : .66;
  return {
    x: state.x, z: state.z, y: (Number.isFinite(state.worldY) ? state.worldY : 0) + .62,
    vx: clamp((state.velX || 0) * .32 + side * (1.15 + speed * .055) * force, -5.6, 5.6),
    vy: (3.65 + Math.min(2.6, speed * .065)) * force,
    vz: -(1.6 + Math.min(5.2, speed * .16)) * force,
    yaw: 0, pitch: -.05, roll: 0,
    wx: (1.55 + Math.min(1.2, speed * .026)) * side * force,
    wy: (1.7 + speed * .022) * side * force,
    wz: (1.6 + Math.min(1.2, speed * .033)) * force,
    bounces: 0, landed: false, time: 0,
    originX: state.x, originZ: state.z,
  };
}

/** Board ends are included in the support height so its nose/tail cannot dive
 * into a downhill snowbank. The upright angular envelope allows a tumbling
 * board to touch, bounce, then settle on the surface. */
export function crashBoardFloor(board, groundAt) {
  const halfLength = 1.12;
  const alongX = Math.sin(board.yaw) * halfLength;
  const alongZ = Math.cos(board.yaw) * halfLength;
  const terrain = Math.max(
    groundAt(board.x, board.z),
    groundAt(board.x + alongX, board.z + alongZ),
    groundAt(board.x - alongX, board.z - alongZ),
  );
  const tumbleClearance = .09 + Math.abs(Math.sin(board.pitch)) * .88 + Math.abs(Math.sin(board.roll)) * .24;
  return terrain + tumbleClearance;
}

export function stepCrashBoard(board, dt, groundAt) {
  if (!board || dt <= 0) return board;
  // A fixed upper substep prevents high-speed or low-FPS tunnelling.
  const steps = Math.max(1, Math.ceil(Math.min(dt, .1) / .012));
  const h = Math.min(dt, .1) / steps;
  // Start clear of ramps even if the obstacle collision happened below deck.
  if (board.time === 0) board.y = Math.max(board.y, crashBoardFloor(board, groundAt) + .35);
  for (let i = 0; i < steps; i++) {
    board.time += h;
    if (!board.landed) {
      board.vx *= Math.exp(-1.7 * h);
      board.vz *= Math.exp(-1.7 * h);
      board.vy -= GRAVITY * h;
      board.x += board.vx * h;
      board.z += board.vz * h;
      board.y += board.vy * h;
      board.pitch += board.wx * h;
      board.roll += board.wz * h;
      board.yaw += board.wy * h;
      board.wx *= Math.exp(-1.2 * h);
      board.wy *= Math.exp(-1.0 * h);
      board.wz *= Math.exp(-1.2 * h);
      // Do not let a loose board shoot away from the camera/course.
      const offset = Math.hypot(board.x - board.originX, board.z - board.originZ);
      if (offset > 7.25) {
        const scale = 7.25 / offset;
        board.x = board.originX + (board.x - board.originX) * scale;
        board.z = board.originZ + (board.z - board.originZ) * scale;
        board.vx *= .25;
        board.vz *= .25;
      }
    }
    const floor = crashBoardFloor(board, groundAt);
    if (board.y < floor) {
      board.y = floor;
      if (!board.landed && board.vy > 0) {
        // An upside-down nose can brush the snow while the board is still
        // rising. Slide over it instead of immediately ending its flight.
        board.vy *= .80;
        continue;
      }
      board.bounces += 1;
      if (!board.landed && board.vy < -1.15 && board.bounces <= 2) {
        board.vy = -board.vy * (board.bounces === 1 ? .28 : .12);
        board.vx *= .72;
        board.vz *= .72;
        board.wx *= .52;
        board.wy *= .52;
        board.wz *= .52;
      } else {
        board.vy = 0;
        board.vx = 0;
        board.vz = 0;
        board.landed = true;
      }
    }
    if (board.landed) {
      board.pitch *= Math.exp(-7.0 * h);
      board.roll *= Math.exp(-7.0 * h);
      board.y = Math.max(board.y - 1.8 * h, crashBoardFloor(board, groundAt));
    }
  }
  return board;
}

/**
 * Approximate rigid capsule/pose collider for the recovery animation. The GLB
 * is 1.7 units tall with a broad 1.09-unit Z extent (before 0.86 scale).
 * As the character rolls on its side, one edge of that envelope swings down.
 * The returned minimum height is local to the rider's model origin; callers
 * lift the carrier so this lowest point cannot penetrate the snow/ramp deck.
 * No per-vertex skinned mesh collision work is required on mobile.
 */
export function riderCrashMinY(rollZ, yawY, scale = .86) {
  const halfX = (.6244 * Math.abs(Math.cos(yawY)) + 1.094 * Math.abs(Math.sin(yawY))) * scale;
  const minYFromSpine = Math.min(0, 1.7 * scale * Math.cos(rollZ));
  return minYFromSpine - Math.abs(Math.sin(rollZ)) * halfX;
}

export function riderRecoveryGroundLift({rootY, carrierY, modelY, roll, yaw, floor}) {
  const lowest = rootY + carrierY + modelY + riderCrashMinY(roll, yaw);
  return Math.max(0, floor + .075 - lowest);
}
