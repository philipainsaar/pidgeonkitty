import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSnow360Rider,
  readSnow360RiderPreference,
  writeSnow360RiderPreference,
  SNOW360_RIDER_STORAGE_KEY,
  SNOW360_RIDERS,
} from "../components/snow360RiderSettings.js";

test("new and invalid preferences always select Alien Cat", () => {
  for (const value of [undefined, null, "", "unknown", "PidgeonKitty", 0, {}, []]) {
    assert.equal(normalizeSnow360Rider(value), SNOW360_RIDERS.ALIEN_CAT);
  }
  assert.equal(readSnow360RiderPreference(), SNOW360_RIDERS.ALIEN_CAT);
});

test("the original rider can be saved, restored, and changed back", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(writeSnow360RiderPreference(storage, "pidgeonkitty"), "pidgeonkitty");
  assert.equal(values.get(SNOW360_RIDER_STORAGE_KEY), "pidgeonkitty");
  assert.equal(readSnow360RiderPreference(storage), "pidgeonkitty");
  writeSnow360RiderPreference(storage, "alien-cat");
  assert.equal(readSnow360RiderPreference(storage), "alien-cat");
});

test("blocked storage never prevents selecting a rider", () => {
  const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(readSnow360RiderPreference(storage), "alien-cat");
  assert.equal(writeSnow360RiderPreference(storage, "pidgeonkitty"), "pidgeonkitty");
  assert.equal(writeSnow360RiderPreference(storage, "invalid"), "alien-cat");
});
