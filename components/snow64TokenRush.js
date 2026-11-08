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
/** Return the actual token position for any global token row. Sharing this
 * lookup with corner-marker placement keeps the candy canes on the real route
 * even when a rock forces one token into a safer adjacent lane.
 */
function tokenForRow(row) {
  if(row<=5 || row%3!==0) return null;
  const z=8-row*SNOW_ROW_STEP-1.2;
  const preferred=path[Math.floor(row/3)%path.length];
  const order=[preferred,preferred-1,preferred+1,preferred-2,preferred+2,0,4,2];
  const source=getSnowChunk(Math.floor(row/SNOW_CHUNK_ROWS));
  const lane=order.find(i=>i>=0&&i<lanes.length&&!
    source.rocks.some(rock=>Math.abs(rock.z-z)<3.1&&Math.abs(rock.x-lanes[i])<rock.size+2.3));
  return lane===undefined ? null : {id:`coin-${row}`,row,x:lanes[lane],z};
}

/** Select ONLY the Rock1..Rock7 meshes in snow64-obstacles.glb.
 * The game's shared obstacle library maps a rock's ID to a mesh via FNV-1a.
 * Token Rush uses a separate numeric ID range per original rock row.
 * This keeps all IDs unique while the existing obstacle library selects only
 * its seven rock meshes; Standard's IDs and library are never modified.
 */
const TOKEN_ROCK_VARIANT_START = 2; // NAMES[2] = Rock1
const TOKEN_ROCK_VARIANT_END = 8;   // NAMES[8] = Rock7
function obstacleHash(id) {
  let h=2166136261;
  for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);
  return h>>>0;
}
function tokenRushGLBRock(rock) {
  const match=/^rock-(\d+)$/.exec(rock.id);
  if(!match)return null;
  const row=Number(match[1]);
  const initial=(row*3+5)%16;
  for(let i=0;i<16;i++){
    const offset=(initial+i)%16;
    const id=`rock-${row*16+offset}`;
    const variant=obstacleHash(id)%12;
    if(variant>=TOKEN_ROCK_VARIANT_START && variant<=TOKEN_ROCK_VARIANT_END){
      return {...rock,id};
    }
  }
  // Never substitute a crystal even if all variant candidates fail.
  return null;
}

export function getSnowModeChunk(index,mode="standard") {
  if(mode!=="token")return getSnowChunk(index);
  if(index<0)return null;
  if(cache.has(index))return cache.get(index);
  const base=getSnowChunk(index);
  const coins=[];
  const candyCanes=[];
  for(let local=0;local<SNOW_CHUNK_ROWS;local++){
    const row=index*SNOW_CHUNK_ROWS+local;
    const coin=tokenForRow(row);
    if(!coin)continue;
    coins.push({id:coin.id,x:coin.x,z:coin.z});
    const before=tokenForRow(row-3);
    const after=tokenForRow(row+3);
    if(!before||!after)continue;
    const enter=Math.sign(coin.x-before.x);
    const leave=Math.sign(after.x-coin.x);
    // Two candy-cane signposts frame each actual slalom corner.
    if(enter===0 || leave===0 || enter===leave)continue;
    for(const side of [-1,1]){
      const x=coin.x+side*2.43;
      const z=coin.z+2.9;
      if(Math.abs(x)>10.6)continue;
      // Markers are decorative, but avoid intersecting collision rocks.
      if(base.rocks.some(rock=>Math.hypot(rock.x-x,rock.z-z)<rock.size+0.75))continue;
      candyCanes.push({id:`cane-${row}-${side}`,x,z,side,phase:row*.19+side*1.7});
    }
  }
  // Real visible/collidable Rock1..Rock7 variants from snow64-obstacles.glb.
  // No crystals, no RockCrystal families, and never the old snow64-rock.glb.
  const rocks=base.rocks.map(tokenRushGLBRock).filter(Boolean);
  const data={...base,rocks,ramps:[],coins,candyCanes};
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

/** Swept *physical* star/board contact. Never uses camera distance.
 * Token centers hover 1.3m above the snow, with a visible ~.5m half width.
 * A compact radius avoids triggering the burst when the rider is in a nearby
 * lane. The sweep prevents skipping legitimate stars at high speed/mobile fps.
 */
export function sweptStarTokenPickup(from,to,coin,terrainHeight,radius=.80){
  if(!from||!to||!coin||typeof terrainHeight!=="function")return false;
  const dx=to.x-from.x,dz=to.z-from.z;
  const len2=dx*dx+dz*dz;
  const t=len2>1e-9 ? Math.max(0,Math.min(1,((coin.x-from.x)*dx+(coin.z-from.z)*dz)/len2)) : 0;
  const x=from.x+dx*t,z=from.z+dz*t;
  if((x-coin.x)**2+(z-coin.z)**2>radius*radius)return false;
  const boardY=from.y+(to.y-from.y)*t;
  const surface=terrainHeight(coin.x,coin.z);
  // Grounded/ollie/hover contact is possible, but not a distant overhead jump.
  return Number.isFinite(boardY) && boardY>=surface-.50 && boardY<=surface+2.12;
}

/** Token Rush power is still automatic: the board steers toward the next coin.
 * However the pickup itself MUST happen near the board, not 13m ahead and
 * 20m sideways. This prevents pickups that appear to happen at the camera.
 */
export function tokenRushMagnetCanCollect(s,coin,from,to,terrainHeight){
  if(!s||s.gameMode!=="token"||!s.icecreamHover||s.powerTime<=0||s.recovery)return false;
  // Slightly wider than the normal 0.80m board contact only while powered:
  // still a genuine close-range sweep, never a remote or camera pickup.
  return sweptStarTokenPickup(from,to,coin,terrainHeight,1.15);
}
