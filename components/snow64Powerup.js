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
export function maybeSpawnSnowMushroom(s){
  const distance=Math.max(0,-s.z);
  if(s.mushroom || s.powerTime>0 || s.recovery || distance<85)return false;
  if(s.score<3500 || s.t-(s.mushroomCooldownTime??-999)<36 || distance-(s.mushroomCooldownDistance??-999)>0 && distance-(s.mushroomCooldownDistance??-999)<500)return false;
  const gained=(s.scoreGainEvents||[]).filter(e=>s.t-e.at<=MUSHROOM_GAIN_WINDOW).reduce((sum,e)=>sum+e.points,0);
  if(gained < MUSHROOM_MIN_SURGE + Math.min(1500,distance*.30))return false;
  // Set in front of the rider, close enough to catch while carving.
  const x=Math.max(-8.5,Math.min(8.5,s.x + ((s.mushroomCount??0)%2?-.55:.55)));
  const z=s.z-24;
  s.mushroom={x,z};
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
