// Keep nearby props together so off-camera trees can be rejected as a batch.
// No density, distance or geometry reduction: every input is retained once.
export function snow360SpatialBatches(items, cellSize = 24) {
  const cells = new Map();
  for (const item of items) {
    const key = Number.isFinite(item.x) && Number.isFinite(item.z)
      ? `${Math.floor(item.x / cellSize)}:${Math.floor(item.z / cellSize)}` : "fallback";
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(item);
  }
  return [...cells].map(([key, items]) => ({ key, items }));
}
