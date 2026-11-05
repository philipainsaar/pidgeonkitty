import test from "node:test";
import assert from "node:assert/strict";
import { snow360SpatialBatches } from "../components/snow360SpatialBatches.js";

test("spatial batches preserve all authored trees, including negative and boundary positions", () => {
  const items = [{x:-24,z:-48},{x:-.01,z:0},{x:0,z:0},{x:23.99,z:0},{x:24,z:0},{id:"missing"}];
  const batches = snow360SpatialBatches(items);
  assert.deepEqual(batches.map(b=>b.key), ["-1:-2","-1:0","0:0","1:0","fallback"]);
  const flattened = batches.flatMap(b=>b.items);
  assert.equal(flattened.length, items.length);
  for (const item of items) assert.equal(flattened.filter(x=>x===item).length, 1);
  assert.deepEqual(snow360SpatialBatches([]), []);
});
