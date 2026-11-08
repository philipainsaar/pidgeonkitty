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
