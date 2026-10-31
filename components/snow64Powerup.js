/** Rare score-surge collectible. Pure game rules, no React or WebGL dependencies. */
export const MUSHROOM_DURATION = 9;
export const MUSHROOM_GAIN_WINDOW = 5;
export const MUSHROOM_MIN_SURGE = 1800;

export function recordSnowPoints(s,amount){
  if(amount<=0)return;
  if(!s.scoreGainEvents)s.scoreGainEvents=[];
  s.scoreGainEvents.push({at:s.t,points:amount});
  s.scoreGainEvents=s.scoreGainEvents.filter(e=>s.t-e.at<MUSHROOM_GAIN_WINDOW);
}

/** Spawns when scoring bursts, not on a fixed timer. Cooldown keeps them rare. */
/** Pick a reachable lane that stays out of the physical AND visual ramp silhouette.
 * In world coordinates downhill is negative Z.  Existing ramp placement is
 * deterministic, so no random geometry queries or unstable frame-to-frame moves.
 */
export function chooseSafeMushroomSpot(s, chunks = []) {
  const ramps = chunks.flatMap(c => c.ramps || []);
  const rocks = chunks.flatMap(c => c.rocks || []);
  const sides = ((s.mushroomCount || 0) % 2) ? [-1, 1] : [1, -1];
  let best = null;
  for (const dz of [24, 30, 36, 43]) {
    const z = s.z - dz;
    for (const side of sides) {
      for (const offset of [2.4, 3.7, 5.2, 6.6]) {
        const x = Math.max(-8.65, Math.min(8.65, s.x + side * offset));
        const lateral = Math.abs(x - s.x);
        if (lateral < 1.65 || lateral > 6.75) continue;
        // Keeping at least 3m of clear air beside ramp edges means the power-up
        // is visible *alongside* a tall pink ramp, never inside or hidden behind it.
        if (ramps.some(r =>
          Math.abs(z - r.z) < (r.length ?? 3) * .5 + 7 &&
          Math.abs(x - r.x) < 5.4
        )) continue;
        if (rocks.some(r =>
          Math.abs(z - r.z) < (r.size + 2.8) &&
          Math.abs(x - r.x) < (r.size + 2.6)
        )) continue;
        const score = Math.abs(lateral - 2.9) * 2.7 + Math.abs(dz - 27) * .11;
        if (!best || score < best.score) best = {x, z, score};
      }
    }
  }
  if (best) return {x: best.x, z: best.z};
  // Edge case for dense obstacle layouts: pick a clear patch farther ahead.
  // Prefer no mushroom over spawning one hidden inside a collision surface.
  return null;
}

export function maybeSpawnSnowMushroom(s, chunks = []) {
  const distance=Math.max(0,-s.z);
  if(s.mushroom || s.powerTime>0 || s.recovery || distance<85)return false;
  if(s.score<3500 || s.t-(s.mushroomCooldownTime??-999)<36 || distance-(s.mushroomCooldownDistance??-999)>0 && distance-(s.mushroomCooldownDistance??-999)<500)return false;
  const gained=(s.scoreGainEvents||[]).filter(e=>s.t-e.at<=MUSHROOM_GAIN_WINDOW).reduce((sum,e)=>sum+e.points,0);
  if(gained < MUSHROOM_MIN_SURGE + Math.min(1500,distance*.30))return false;
  const spot = chooseSafeMushroomSpot(s, chunks);
  if (!spot) return false;
  s.mushroom = spot;
  s.mushroomCooldownTime=s.t;
  s.mushroomCooldownDistance=distance;
  s.mushroomCount=(s.mushroomCount||0)+1;
  s.scoreGainEvents=[];
  return true;
}

export function mushroomCollision(s, from, to, terrainHeight){
  const m=s.mushroom;
  if(!m)return false;
  const dz=to.z-from.z,dx=to.x-from.x;
  const t=Math.max(0,Math.min(1,Math.abs(dz)>1e-9?(m.z-from.z)/dz:0));
  const x=from.x+dx*t,z=from.z+dz*t;
  if((x-m.x)**2+(z-m.z)**2>1.7**2)return false;
  const riderY=s.worldY;
  return riderY <= terrainHeight(m.x,m.z)+3.2;
}

export function activateSnowMushroom(s){
  s.mushroom=null;
  s.powerTime=MUSHROOM_DURATION;
  s.powerAutoJumpDelay=.55;
  s.powerTricksScheduled=false;
  s.armedTrick=null;
}
