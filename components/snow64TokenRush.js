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
  // x5 is attained at five uninterrupted real tokens; x10 at ten.
  state.tokenMultiplier=Math.min(10,state.tokenStreak);
  return TOKEN_RUSH_BASE_POINTS*state.tokenMultiplier;
}
/** No point deduction: misses/wipeouts remove the streak instead. */
export function missTokenRush(state){
  // Reset the combo AND the temporary powered speed bonus. Earned score
  // remains, so the permanent downhill pace doesn't drop after a miss.
  state.tokenRushPowerTier=1;
  // If the rider breaks the combo BEFORE collecting a reserved power-up,
  // turn that fifth slot back into a real star. Already-missed power slots
  // stay hidden and never play a fake collection burst.
  const reserved=state.icecreamPower?.tokenId;
  if(reserved && !state.missedTokens?.has(reserved)){
    state.icecreamPower=null;
    if(state.replacedTokens?.delete(reserved)){
      state.tokenOmitVersion=(state.tokenOmitVersion||0)+1;
    }
  }
  state.tokenStreak=0;
  state.tokenMultiplier=1;
  state.tokenMisses=(state.tokenMisses||0)+1;
}

/** Smooth arcade difficulty curve based on total earned points.
 * The player gradually builds momentum, rather than changing speed in
 * abrupt combo tiers. Tops out at +32% for fair mobile/desktop play.
 * A broken streak resets the score multiplier but not the lifetime score.
 */
export function tokenRushScoreSpeedScale(score=0){
  return 1 + 0.32*(1-Math.exp(-Math.max(0,Number(score)||0)/48000));
}

/** Carving becomes more demanding as the run accelerates. The loss of
 * steering responsiveness is gentle and bounded, never a random skid. */
export function tokenRushArcadeHandling(score=0){
  const progress=Math.min(1,Math.max(0,(tokenRushScoreSpeedScale(score)-1)/0.32));
  return {lateral:1-0.22*progress,response:1-0.28*progress};
}

/** Earn a real Ice-cream Power only after ten consecutive STAR pickups.
 * At streak 10 (and again every ten pickups if no power is active), the
 * FIFTH future star becomes an Ice-cream collectible. The ten qualifying
 * tokens remain real tokens, so the achievement is always reachable.
 * While the streak is intact, picking up this reward provides up to x2
 * powered speed. It never stacks to x4/x10 and never changes normal speed.
 */
export function maybeSpawnTokenRushIcecreamPower(s,chunks=[]){
  if(!s || s.gameMode!=="token" || s.recovery || s.powerTime>0 || s.icecreamPower)return false;
  const streak=Math.max(0,Math.floor(s.tokenStreak||0));
  if(streak<10 || streak%10!==0)return false;
  const future=[];
  const ids=new Set();
  for(const chunk of chunks.filter(Boolean))for(const coin of chunk.coins||[]){
    if(coin.z>=s.z-1 || ids.has(coin.id) || s.missedTokens?.has(coin.id)
      || s.replacedTokens?.has(coin.id))continue;
    ids.add(coin.id);
    future.push(coin);
  }
  future.sort((a,b)=>b.z-a.z);
  const fifth=future[4];
  if(!fifth)return false;
  s.replacedTokens ||= new Set();
  s.replacedTokens.add(fifth.id);
  s.tokenOmitVersion=(s.tokenOmitVersion||0)+1;
  s.icecreamPower={x:fifth.x,z:fifth.z,tokenId:fifth.id,tier:2};
  s.icecreamPowerCount=(s.icecreamPowerCount||0)+1;
  return 'spawned';
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
  // Slightly wider than the 1.38m Token Rush close-absorb zone while powered:
  // still a genuine close-range sweep, never a remote or camera pickup.
  return sweptStarTokenPickup(from,to,coin,terrainHeight,1.48);
}
