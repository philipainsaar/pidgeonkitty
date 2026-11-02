/** Deterministic endless course generation and increasing survival drain. Pure JavaScript. */
export const SNOW_ROW_STEP = 6.1;
export const SNOW_CHUNK_ROWS = 36;
export const SNOW_CHUNK_LENGTH = SNOW_ROW_STEP * SNOW_CHUNK_ROWS;
export const SNOW_INITIAL_SCORE = 2800;
export const SNOW_LANES = [-7.4, -3.8, 0, 3.8, 7.4];

function seededRandom(seed) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

/** More distance = faster score loss, including while recovering from a wipeout. */
export function snowDrainPerSecond(distanceMeters) {
  const d = Math.max(0, distanceMeters);
  return 68 + d * 0.055 + d * d * 0.000010;
}

export function snowChunkIndex(distanceMeters) {
  return Math.max(0, Math.floor(Math.max(0, distanceMeters) / SNOW_CHUNK_LENGTH));
}

function groupSuperSlot(groupIndex) {
  const random = seededRandom(108064 ^ Math.imul(groupIndex + 1, 0x9e3779b1));
  return Math.floor(random() * 4);
}

export function generateSnowChunk(index) {
  if (!Number.isInteger(index) || index < 0) throw new Error('Snow chunk index must be nonnegative');
  const random = seededRandom(108064 ^ Math.imul(index + 1, 0x85ebca6b));
  const trees = [], rocks = [], ramps = [], coins = [], banners = [];
  for (let local = 0; local < SNOW_CHUNK_ROWS; local++) {
    const row = index * SNOW_CHUNK_ROWS + local;
    const z = 8 - row * SNOW_ROW_STEP;
    if (row % 2 === 0) {
      for (const sign of [-1, 1]) {
        trees.push({id:`tree-${row}-${sign}`, x:sign*(16.1 + random()*18), z:z + random()*3, size:1.8+random()*3.1});
      }
    }
    if (row > 4 && row % 6 === 0) {
      coins.push({id:`coin-${row}`, x:SNOW_LANES[Math.floor(random()*SNOW_LANES.length)], z:z-1.2});
    }
    if (row > 10 && row % 15 === 0) {
      const rampIndex = Math.floor(row/15)-1;
      const superAir = rampIndex % 4 === groupSuperSlot(Math.floor(rampIndex/4));
      const height = superAir ? 2.9+random()*1.35 : .95+random()*.62;
      const length = superAir ? 4.2+random()*.6 : 3;
      ramps.push({id:`ramp-${row}`,x:SNOW_LANES[1+Math.floor(random()*3)],z,index:row,height,length,superAir,variant:Math.floor(random()*2)});
    }
    if (row > 12 && row % 7 === 0 && row % 15 !== 0) {
      rocks.push({id:`rock-${row}`,x:SNOW_LANES[Math.floor(random()*SNOW_LANES.length)],z:z+.9,size:.6+random()*.55});
    }
    if (row % 21 === 0) banners.push({id:`banner-${row}`,z,side:row%42===0?1:-1});
  }
  return {index,trees,rocks,ramps,coins,banners};
}

/** Bounded cache. Chunks are regenerated from their index, with no permanent world arrays. */
const cache = new Map();
export function getSnowChunk(index) {
  if (index < 0) return null;
  if (cache.has(index)) {
    const data = cache.get(index);
    cache.delete(index);
    cache.set(index,data);
    return data;
  }
  const chunk = generateSnowChunk(index);
  cache.set(index,chunk);
  while (cache.size > 12) cache.delete(cache.keys().next().value);
  return chunk;
}

/** Keep only recently passed collision/collection IDs. Sets do not grow forever. */
export function pruneSnowVisited(set, currentChunk) {
  const firstRetainedRow = Math.max(0,currentChunk - 2) * SNOW_CHUNK_ROWS;
  for (const id of set) {
    const match = /^(?:coin|ramp|rock)-(\d+)$/.exec(id);
    if (match && Number(match[1]) < firstRetainedRow) set.delete(id);
  }
}
