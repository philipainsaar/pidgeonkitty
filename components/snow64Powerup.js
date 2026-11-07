/** Rare Ice-cream Power collectible. Pure rules: no React or WebGL dependencies. */
export const ICECREAM_DURATION = 9;
export const ICECREAM_GAIN_WINDOW = 5;
export const ICECREAM_MIN_SURGE = 1800;

export function recordSnowPoints(s,amount){
  if(amount<=0)return;
  if(!s.scoreGainEvents)s.scoreGainEvents=[];
  s.scoreGainEvents.push({at:s.t,points:amount});
  s.scoreGainEvents=s.scoreGainEvents.filter(e=>s.t-e.at<ICECREAM_GAIN_WINDOW);
}

/** Spawn 90-135 downhill units ahead; avoid ramps/rocks in all look-ahead chunks. */
export function chooseSafeIcecreamPowerSpot(s,chunks=[]){
  const ramps=chunks.flatMap(c=>c.ramps||[]);
  const rocks=chunks.flatMap(c=>c.rocks||[]);
  const sides=((s.icecreamPowerCount||0)%2)?[-1,1]:[1,-1];
  let best=null;
  // Start about 4x farther downhill than the old near-rider spawn.
  // 90-135 world units gives time to see the glowing collectible and steer toward it.
  for(const dz of [105,120,90,135]){
    const z=s.z-dz;
    for(const side of sides){
      for(const offset of [2.4,3.7,5.2,6.6]){
        const x=Math.max(-8.65,Math.min(8.65,s.x+side*offset));
        const lateral=Math.abs(x-s.x);
        if(lateral<1.65||lateral>6.75)continue;
        if(ramps.some(r=>Math.abs(z-r.z)<(r.length??3)*.5+7&&Math.abs(x-r.x)<5.4))continue;
        if(rocks.some(r=>Math.abs(z-r.z)<(r.size+2.8)&&Math.abs(x-r.x)<(r.size+2.6)))continue;
        const score=Math.abs(lateral-2.9)*2.7+Math.abs(dz-105)*.11;
        if(!best||score<best.score)best={x,z,score};
      }
    }
  }
  if(best)return{x:best.x,z:best.z};
  return null;
}

/** Spawn only following a high score burst, keeping the original cooldown. */
export function maybeSpawnIcecreamPower(s,chunks=[]){
  const distance=Math.max(0,-s.z);
  if(s.icecreamPower||s.powerTime>0||s.recovery||distance<85)return false;
  if(s.score<3500||s.t-(s.icecreamPowerCooldownTime??-999)<36||
    (distance-(s.icecreamPowerCooldownDistance??-999)>0&&distance-(s.icecreamPowerCooldownDistance??-999)<500))return false;
  const gained=(s.scoreGainEvents||[]).filter(e=>s.t-e.at<=ICECREAM_GAIN_WINDOW).reduce((sum,e)=>sum+e.points,0);
  if(gained<ICECREAM_MIN_SURGE+Math.min(1500,distance*.30))return false;
  const spot=chooseSafeIcecreamPowerSpot(s,chunks);
  if(!spot)return false;
  s.icecreamPower=spot;
  s.icecreamPowerCooldownTime=s.t;
  s.icecreamPowerCooldownDistance=distance;
  s.icecreamPowerCount=(s.icecreamPowerCount||0)+1;
  s.scoreGainEvents=[];
  return true;
}

/** Use a swept path so high-speed riders cannot tunnel through the ice cream. */
export function icecreamPowerCollision(s,from,to,terrainHeight){
  const item=s.icecreamPower;
  if(!item)return false;
  const dz=to.z-from.z,dx=to.x-from.x;
  const t=Math.max(0,Math.min(1,Math.abs(dz)>1e-9?(item.z-from.z)/dz:0));
  const x=from.x+dx*t,z=from.z+dz*t;
  if((x-item.x)**2+(z-item.z)**2>1.7**2)return false;
  return s.worldY<=terrainHeight(item.x,item.z)+3.2;
}

export function activateIcecreamPower(s){
  s.icecreamPower=null;
  s.powerTime=ICECREAM_DURATION;
  s.powerAutoJumpDelay=.55;
  s.powerTricksScheduled=false;
  s.armedTrick=null;
}
