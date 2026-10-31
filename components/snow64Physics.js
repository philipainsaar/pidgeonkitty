/** Arcadey but physically integrated snowboard flight, in world-space metres. */
export const SNOW_GRAVITY = 18.6;
export const RAMP_LIP_HEIGHT = 1.12;
export const RAMP_LIP_OFFSET = 1.5;

export function rampTakeoffSpeed(speed) {
  // The lip is 1.12m high over its 3m run. Only fast approaches create giant air.
  const angle = Math.atan2(RAMP_LIP_HEIGHT, 3.0);
  return Math.min(18.5, 2.4 + Math.max(0, speed - 6) * Math.sin(angle) * 1.25);
}

export function crossedRampLip(ramp, previousZ, z, x) {
  const lipZ = ramp.z - RAMP_LIP_OFFSET;
  return previousZ > lipZ && z <= lipZ && Math.abs(x - ramp.x) < 1.85;
}

export function startSnowJump(s, groundHeight, { velocity, source = 'ollie', lift = 0 }) {
  s.inAir = true;
  s.worldY = groundHeight + lift;
  s.vy = velocity;
  s.air = lift;
  s.peakAir = lift;
  s.flightTime = 0;
  s.launchSource = source;
  s.launchSpeed = s.speed;
  s.trick = null;
  s.jumpCooldown = .4;
}

export function stepSnowJump(s, dt, groundHeight) {
  // worldY is independent of the descending terrain. Gravity never resets each frame.
  s.worldY += s.vy * dt - .5 * SNOW_GRAVITY * dt * dt;
  s.vy -= SNOW_GRAVITY * dt;
  s.flightTime += dt;
  s.air = Math.max(0, s.worldY - groundHeight);
  s.peakAir = Math.max(s.peakAir, s.air);
  if (s.vy <= 0 && s.worldY <= groundHeight) {
    s.worldY = groundHeight;
    s.air = 0;
    s.vy = 0;
    s.inAir = false;
    return true;
  }
  return false;
}
