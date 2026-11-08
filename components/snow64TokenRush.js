/**
 * SNOW360 Token Rush mode. No changes to the Standard course generator.
 * Each three-row stretch gets one reachable star token; ramps are completely
 * absent from rendering AND collisions. Rocks, trees, terrain remain.
 */
import { getSnowChunk, SNOW_CHUNK_ROWS, SNOW_ROW_STEP } from "./snow64Endless";
export const TOKEN_RUSH_MAX_HITS=3;
export const TOKEN_RUSH_BASE_POINTS=100;
const lanes=[-7.4,-3.8,0,3.8,7.4];
const path=[1,2,3,2,1,0,1,2,3,4,3,2];
const cache=new Map();
export function getSnowModeChunk(index,mode="standard"){
  if(mode!=="token")return getSnowChunk(index);
  if(index<0)return null;
  if(cache.has(index))return cache.get(index);
  const base=getSnowChunk(index);
  const coins=[];
  for(let local=0;local<SNOW_CHUNK_ROWS;local++){
    const row=index*SNOW_CHUNK_ROWS+local;
    if(row<=5 || row%3!==0)continue;
    const z=8-row*SNOW_ROW_STEP-1.2;
    const preferred=path[Math.floor(row/3)%path.length];
    // If a rock shares the token row, move to the nearest safe lane.
    const order=[preferred,preferred-1,preferred+1,preferred-2,preferred+2,0,4,2];
    const safe=order.find(i=>i>=0&&i<lanes.length&&!
      base.rocks.some(rock=>Math.abs(rock.z-z)<3.1&&Math.abs(rock.x-lanes[i])<rock.size+2.3));
    if(safe===undefined)continue;
    coins.push({id:`coin-${row}`,x:lanes[safe],z});
  }
  const data={...base,ramps:[],coins};
  cache.set(index,data);
  while(cache.size>12)cache.delete(cache.keys().next().value);
  return data;
}
/** The only source of points in Token Rush is collecting a star token. */
export function collectTokenRush(state){
  state.tokenStreak=(state.tokenStreak||0)+1;
  state.tokenMultiplier=Math.min(5,1+Math.floor((state.tokenStreak-1)/3));
  return TOKEN_RUSH_BASE_POINTS*state.tokenMultiplier;
}
/** No point deduction: misses/wipeouts remove the streak instead. */
export function missTokenRush(state){
  state.tokenStreak=0;
  state.tokenMultiplier=1;
  state.tokenMisses=(state.tokenMisses||0)+1;
}

/** Independent safe downhill placement for Token Rush. Unlike the old short
 * spawn distances, this stays 90–135 units ahead on every installed version.
 * Use the same open lanes and rock/ramp clearances as Snow360 Ice-cream Power.
 */
function chooseSafeTokenRushPowerSpot(s,chunks){
  const ramps=chunks.flatMap(c=>c?.ramps||[]);
  const rocks=chunks.flatMap(c=>c?.rocks||[]);
  const sides=(s.icecreamPowerCount||0)%2 ? [-1,1] : [1,-1];
  let best=null;
  for(const dz of [105,120,90,135]){
    const z=s.z-dz;
    for(const side of sides)for(const offset of [2.4,3.7,5.2,6.6]){
      const x=Math.max(-8.65,Math.min(8.65,s.x+side*offset));
      const lateral=Math.abs(x-s.x);
      if(lateral<1.65 || lateral>6.75)continue;
      if(ramps.some(r=>Math.abs(z-r.z)<(r.length??3)*.5+7 && Math.abs(x-r.x)<5.4))continue;
      if(rocks.some(r=>Math.abs(z-r.z)<(r.size+2.8) && Math.abs(x-r.x)<(r.size+2.6)))continue;
      const score=Math.abs(lateral-2.9)*2.7+Math.abs(dz-105)*.11;
      if(!best || score<best.score)best={x,z,score};
    }
  }
  return best ? {x:best.x,z:best.z} : null;
}

/** Rare Token Rush Ice-cream collectible, earned entirely through token pickups.
 * Uses the existing distant (90–135m) safe-spawn placement and cooldown.
 * Standard mode continues using its original score-surge spawn logic.
 */
export function maybeSpawnTokenRushIcecreamPower(s,chunks=[]){
  if(!s || s.gameMode!=="token" || s.icecreamPower || s.powerTime>0 || s.recovery)return false;
  const distance=Math.max(0,-s.z);
  if(distance<85 || (s.coins||0)<(s.tokenRushNextPowerAt??5))return false;
  if(s.t-(s.icecreamPowerCooldownTime??-999)<27)return false;
  if(distance-(s.icecreamPowerCooldownDistance??-999)<300)return false;
  const spot=chooseSafeTokenRushPowerSpot(s,chunks.filter(Boolean));
  if(!spot)return false;
  s.icecreamPower=spot;
  s.icecreamPowerCount=(s.icecreamPowerCount||0)+1;
  s.icecreamPowerCooldownTime=s.t;
  s.icecreamPowerCooldownDistance=distance;
  s.tokenRushNextPowerAt=(s.coins||0)+10;
  return true;
}

/** Magnetic pickup while the *real* Scene 1 Ice-cream boost is active.
 * The look-ahead catches tokens reliably at high powered speed and the lateral
 * radius covers the full token course. Every collectible still scores via
 * collectTokenRush, and each ID can be collected only once.
 */
export function tokenRushMagnetCanCollect(s,coin){
  if(!s || s.gameMode!=="token" || !s.icecreamHover || s.powerTime<=0 || s.recovery || !coin)return false;
  const ahead=s.z-coin.z;
  return ahead>=-3.5 && ahead<=13 && Math.abs(s.x-coin.x)<=20;
}
