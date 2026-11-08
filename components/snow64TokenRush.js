/**
 * SNOW360 Token Rush mode. No changes to the Standard course generator.
 * Each three-row stretch gets one reachable star token; ramps are completely
 * absent from rendering AND collisions. Rocks, trees, terrain remain.
 */
import { getSnowChunk, SNOW_CHUNK_ROWS, SNOW_ROW_STEP, snowChunkIndex } from "./snow64Endless";
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

/** The player follows the stars, so a rock must not sit directly behind
 * a freshly collected token. Test BOTH the interpolated token slalom AND a
 * generous trailing pocket after each star, in real world coordinates.
 * This also preserves honest mesh-aware GLB collision instead of disabling it.
 */
function tokenRouteXAt(z,coins){
  let prev=null,next=null;
  for(const coin of coins){
    if(coin.z>=z && (!prev||coin.z<prev.z))prev=coin;
    if(coin.z<=z && (!next||coin.z>next.z))next=coin;
  }
  if(prev&&next&&prev.z!==next.z){
    const a=Math.max(0,Math.min(1,(prev.z-z)/(prev.z-next.z)));
    return prev.x+(next.x-prev.x)*a;
  }
  return (next||prev)?.x ?? 0;
}
function tokenRockPositionSafe(x,z,size,coins,markers=[]){
  const clearance=size+2.80;
  if(Math.abs(x-tokenRouteXAt(z,coins))<clearance)return false;
  // Extra clearance AFTER a star: the first 15m downhill must not hide a rock
  // just behind the token, even when the following star starts a new turn.
  for(const coin of coins){
    if(coin.z>=z && coin.z-z<=15.0 && Math.abs(x-coin.x)<size+3.15)return false;
  }
  if(markers.some(m=>Math.hypot(m.x-x,m.z-z)<size+1.0))return false;
  return true;
}
const ROCK_LANE_ALTERNATIVES=[-10.55,-9.2,-7.4,-5.7,-3.8,-1.7,0,1.7,3.8,5.7,7.4,9.2,10.55];
function safeRockX(rock,coins,markers=[],straightClearance=0){
  const isSafe=x=>tokenRockPositionSafe(x,rock.z,rock.size,coins,markers) &&
    (!straightClearance || Math.abs(x-coins[0].x)>=rock.size+straightClearance);
  if(isSafe(rock.x))return rock.x;
  // Keep the obstacle a visible, real Rock1..Rock7 mesh. Move it sideways
  // rather than deleting the danger or allowing an unfair instant collision.
  for(const x of [...ROCK_LANE_ALTERNATIVES].sort((a,b)=>Math.abs(a-rock.x)-Math.abs(b-rock.x))){
    if(isSafe(x))return x;
  }
  // If the entire track is unsafe, omit this single rock instead of placing
  // it in the token collection lane. This never affects Mode 1.
  return null;
}

/** Per-run visual + physical overrides for the gently tapered, curved
 * post-power Star route. Cached endless-course chunks are never mutated;
 * GLB rock meshes, star pickups and candy poles share the same remaps.
 */
export function applyTokenRushRecoveryRoute(chunk,state){
  if(!chunk || state?.gameMode!=="token")return chunk;
  const stars=state.tokenRushStraightStars;
  const movedRocks=state.tokenRushStraightRocks;
  const skyLifts=state.tokenRushSkyStarLifts;
  // Scene 2's airborne stars descend with the rider during the last 2.65s.
  // Their physics height and rendered height use the same smoothstep curve.
  const remain=Math.max(0,Math.min(1,(state.powerTime||0)/2.65));
  const skyFade=remain*remain*(3-2*remain);
  if(!stars?.size && !movedRocks?.size && !skyLifts?.size)return chunk;
  // The exact same modified world coordinates go to the GLB scene AND physics.
  const coins=chunk.coins.map(c=>{
    const p=stars?.get(c.id);
    const lift=skyLifts?.get(c.id);
    if(!p && lift===undefined)return c;
    return {...c,x:p?.x??c.x,z:p?.z??c.z,
      ...(lift!==undefined?{skyLift:lift*skyFade}:{})};
  });
  const rocks=movedRocks?.size ? chunk.rocks.flatMap(r=>{
    if(!movedRocks.has(r.id))return [r];
    const x=movedRocks.get(r.id);
    return x===null?[]:[{...r,x}];
  }):chunk.rocks;
  // Corner signposts move along with their tokens, not remain at old bends.
  const candyCanes=chunk.candyCanes.map(p=>{
    const row=/^cane-(\d+)-/.exec(p.id)?.[1];
    const token=chunk.coins.find(c=>c.id===`coin-${row}`);
    const moved=token && stars?.get(token.id);
    return moved?{...p,z:p.z+(moved.z-token.z)}:p;
  });
  return {...chunk,coins,rocks,candyCanes};
}

/** Mode 2: Give the rider a generous, readable approach to the NEXT stars
 * after EITHER Ice Cream Power scene. Curve and lane positions are preserved.
 * The large initial downhill advance tapers with a C1-smooth (smoothstep)
 * easing across many stars, so the route doesn't snap from a long empty gap
 * to a crowded or suddenly bent token corridor. The route is deterministic
 * for each exit; rendering, collision and candy poles all use the same map.
 *
 * The historical function name is retained to avoid breaking game imports.
 */
export const TOKEN_RUSH_EXIT_FIRST_STAR_ADVANCE=92;
export const TOKEN_RUSH_EXIT_TAPER_STARS=40;
function tokenExitAdvanceAt(i,count=TOKEN_RUSH_EXIT_TAPER_STARS){
  const t=Math.max(0,Math.min(1,i/Math.max(1,count-1)));
  const eased=t*t*(3-2*t);
  return TOKEN_RUSH_EXIT_FIRST_STAR_ADVANCE*(1-eased);
}
export function makeTokenRushRecoveryStraight(state,collected,predictedExitZ=state?.z){
  if(!state || state.gameMode!=="token")return 0;
  // Lay out the recovery road from the expected boost landing position,
  // WHILE the power-up is active. Doing this only when powerTime reaches
  // zero made every visible star suddenly jump 92 metres in one frame.
  const exitZ=Number.isFinite(predictedExitZ)?predictedExitZ:state.z;
  const center=snowChunkIndex(-exitZ);
  // Forty natural route tokens span roughly 730 game units. Fetch enough
  // chunks across boundaries; farthest tokens ease back to their original
  // coordinates, preventing a compressed wall of stars at the join.
  const chunks=Array.from({length:6},(_,i)=>getSnowModeChunk(center+i,"token")).filter(Boolean);
  const all=chunks.flatMap(c=>c.coins);
  const upcoming=all.filter(c=>c.z<exitZ-1.2 &&
    !collected?.has(c.id) && !state.missedTokens?.has(c.id) &&
    !state.replacedTokens?.has(c.id)).sort((a,b)=>b.z-a.z).slice(0,TOKEN_RUSH_EXIT_TAPER_STARS);
  if(!upcoming.length)return 0;
  const moved=new Map(upcoming.map((c,i)=>[
    c.id,{x:c.x,z:c.z-tokenExitAdvanceAt(i,upcoming.length)}
  ]));
  // The first ~100m is an unobstructed approach from the *predicted* exit
  // position to the shifted stars. This anchor never appears as a token.
  const route=[{id:"post-power-rider-approach",x:state.x,z:exitZ},
    ...all.filter(c=>c.z<exitZ-1.2 &&
      !collected?.has(c.id) && !state.missedTokens?.has(c.id) &&
      !state.replacedTokens?.has(c.id)).map(c=>{
        const p=moved.get(c.id);
        return p?{...c,...p}:c;
      })];
  const nearStart=exitZ;
  const last=moved.get(upcoming[upcoming.length-1].id).z;
  const rocks=new Map();
  for(const chunk of chunks)for(const rock of chunk.rocks){
    if(rock.z>nearStart+5 || rock.z<last-22)continue;
    const safe=safeRockX(rock,route);
    if(safe!==rock.x)rocks.set(rock.id,safe);
  }
  state.tokenRushStraightStars=moved;
  state.tokenRushStraightRocks=rocks;
  state.tokenRushStraightStartZ=nearStart;
  state.tokenRushStraightLastZ=last;
  state.tokenOmitVersion=(state.tokenOmitVersion||0)+1;
  return upcoming.length;
}

// Scene 2 uses the SAME ground-route stars, lifted into a real airborne
// slalom aligned with the board's smooth cloud flight. No free points, fake
// screen-space pickups or generated bonus tokens. Collision remains physical.
function easeCloud(t){const x=Math.max(0,Math.min(1,t));return x*x*x*(x*(x*6-15)+10);}
function cloudLiftAt(seconds){
  return 14.5*easeCloud(seconds/1.65)*easeCloud((9-seconds)/2.65);
}
export function makeTokenRushSkyStarTrail(state,collected){
  if(!state || state.gameMode!=="token" || state.icecreamScene!==2)return 0;
  const center=snowChunkIndex(-state.z);
  const chunks=Array.from({length:5},(_,i)=>getSnowModeChunk(center+i,"token")).filter(Boolean);
  const startSpeed=Math.max(0,state.speed||0);
  const maxSpeed=state.tokenRushPowerCruise>0
    ? state.tokenRushPowerCruise
    : 21.5*tokenRushScoreSpeedScale(state.peakScore)*
      (state.tokenRushPowerTier===2 && state.tokenStreak>=10 ? 2 : 1);
  const predictedDistance=time=>maxSpeed*time+(startSpeed-maxSpeed)*(1-Math.exp(-2*time))/2;
  const lifts=new Map();
  for(const coin of chunks.flatMap(c=>c.coins)){
    if(coin.z>=state.z-1 || collected?.has(coin.id) || state.missedTokens?.has(coin.id) || state.replacedTokens?.has(coin.id))continue;
    const distance=state.z-coin.z;
    if(distance>predictedDistance(9.1))continue;
    let low=0,high=9;
    for(let i=0;i<17;i++){
      const mid=(low+high)/2;
      if(predictedDistance(mid)<distance)low=mid;else high=mid;
    }
    const predictedTime=(low+high)/2;
    // The collectible's bobbing world Y is base snow + 1.3 + this lift.
    // The rider/board follows the same envelope. A slight lead on the
    // approach avoids a star ending up well above a rapidly climbing board.
    lifts.set(coin.id,cloudLiftAt(predictedTime));
  }
  state.tokenRushSkyStarLifts=lifts;
  state.tokenOmitVersion=(state.tokenOmitVersion||0)+1;
  return lifts.size;
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
  // Preserve a genuinely safe collection route across chunk boundaries,
  // not merely a clearance circle around the star itself. Rocks remain real
  // Rock1..Rock7 meshes with collision at their exact relocated positions.
  const neighborCoins=[];
  for(let row=Math.max(0,index*SNOW_CHUNK_ROWS-12);
      row<(index+1)*SNOW_CHUNK_ROWS+18;row++){
    if(row%3===0){const c=tokenForRow(row);if(c)neighborCoins.push(c);}
  }
  const rocks=base.rocks.map(tokenRushGLBRock).filter(Boolean).flatMap(rock=>{
    const x=safeRockX(rock,neighborCoins,candyCanes);
    return x===null?[]:[{...rock,x}];
  });
  const data={...base,rocks,ramps:[],coins,candyCanes};
  cache.set(index,data);
  while(cache.size>12)cache.delete(cache.keys().next().value);
  return data;
}

/** Display only the stars in the POWER'S actual short collection queue.
 * Not the off-route stars in other lanes or distant future chunks.
 * Physics also checks this list, so no invisible star can award points.
 */
export function refreshTokenRushPowerStarQueue(state,chunks,collected){
  if(!state||state.gameMode!=="token"||state.powerTime<=0||!state.icecreamHover)return false;
  const previous=state.tokenRushPowerVisibleIds||new Set();
  const upcoming=[];
  const seen=new Set();
  for(const chunk of chunks||[])for(const token of chunk?.coins||[]){
    if(seen.has(token.id)||token.z>=state.z+1.5 || state.z-token.z>95)continue;
    seen.add(token.id);
    if(collected?.has(token.id)||state.missedTokens?.has(token.id)||state.replacedTokens?.has(token.id))continue;
    // Sky Surf only displays real airborne collectibles along its flight.
    if(state.icecreamScene===2 && state.tokenRushSkyStarLifts?.size &&
       !state.tokenRushSkyStarLifts.has(token.id))continue;
    upcoming.push(token);
  }
  upcoming.sort((a,b)=>b.z-a.z);
  const next=new Set(upcoming.slice(0,3).map(c=>c.id));
  state.tokenRushRecentPowerPickups ||= new Map();
  for(const [id,at] of state.tokenRushRecentPowerPickups){
    if(state.t-at<0.55)next.add(id);
    else state.tokenRushRecentPowerPickups.delete(id);
  }
  const changed=next.size!==previous.size||[...next].some(id=>!previous.has(id));
  if(changed){
    state.tokenRushPowerVisibleIds=next;
    state.tokenOmitVersion=(state.tokenOmitVersion||0)+1;
  }
  return changed;
}

/** The only source of points in Token Rush is collecting a star token. */
export function collectTokenRush(state){
  state.tokenStreak=(state.tokenStreak||0)+1;
  state.tokenRushConsecutiveMisses=0;
  // x5 is attained at five uninterrupted real tokens; x10 at ten.
  state.tokenMultiplier=Math.min(10,state.tokenStreak);
  return TOKEN_RUSH_BASE_POINTS*state.tokenMultiplier;
}
/** A real missed star during NORMAL Token Rush riding drains the score.
 * The penalty grows smoothly with the player's best score and pace, rather
 * than becoming easier if the score was recently depleted. The first few
 * misses are survivable, but ignoring the route eventually causes game over.
 * Power-up auto-collection and recovery/wipeouts are deliberately excluded.
 */
export function tokenRushMissPenalty(state){
  // Use the best score reached, not the reduced score after recent misses.
  // This makes the endless arcade course steadily riskier as pace increases.
  const high=Math.max(0,Number(state?.peakScore)||0,Number(state?.score)||0);
  const pace=Math.max(0,Math.min(1,(tokenRushScoreSpeedScale(high)-1)/0.32));
  const earnedDifficulty=0.012*high + 115*Math.pow(high/50000,1.25);
  const loss=85+earnedDifficulty+80*pace;
  return Math.max(85,Math.round(loss/5)*5);
}

/** A rock is a major arcade hazard, costing far more than one missed Star.
 * One hit also takes a life through beginSnowRecovery. Both consequences scale
 * consistently with peak score; neither can be reduced by intentionally
 * losing points just before a rock collision.
 */
export function tokenRushRockPenalty(state){
  const loss=650+3.25*tokenRushMissPenalty(state);
  return Math.max(750,Math.round(loss/25)*25);
}
export function penalizeMissedTokenRush(state){
  if(!state||state.gameMode!=="token"||state.powerTime>0||state.icecreamHover||state.recovery)return 0;
  const penalty=tokenRushMissPenalty(state);
  state.score=Math.max(0,(state.score||0)-penalty);
  state.tokenRushConsecutiveMisses=(state.tokenRushConsecutiveMisses||0)+1;
  return penalty;
}

/** Combo resets on missed stars or wipeouts, but only uncollected normal-play
 * stars carry the score penalty above. Keep the life system independent. */
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
 * A broken streak resets the score multiplier but not the peak-score pace.
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
  const surface=terrainHeight(coin.x,coin.z)+(coin.skyLift||0);
  // Grounded/ollie/hover contact is possible, but not a distant overhead jump.
  const sky=Number.isFinite(coin.skyLift) && coin.skyLift>0.01;
  return Number.isFinite(boardY) && boardY>=surface-(sky?1.10:.50) &&
    boardY<=surface+(sky?2.55:2.12);
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
