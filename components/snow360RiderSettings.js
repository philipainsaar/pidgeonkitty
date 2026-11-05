"use client";

import { useCallback, useEffect, useState } from "react";

export const SNOW360_RIDER_STORAGE_KEY = "snow360-rider";
export const SNOW360_RIDERS = Object.freeze({
  ALIEN_CAT: "alien-cat",
  PIDGEON_KITTY: "pidgeonkitty",
});

export function normalizeSnow360Rider(value) {
  return value === SNOW360_RIDERS.PIDGEON_KITTY
    ? SNOW360_RIDERS.PIDGEON_KITTY
    : SNOW360_RIDERS.ALIEN_CAT;
}

export function readSnow360RiderPreference(storage) {
  try {
    return normalizeSnow360Rider(storage?.getItem(SNOW360_RIDER_STORAGE_KEY));
  } catch {
    return SNOW360_RIDERS.ALIEN_CAT;
  }
}

export function writeSnow360RiderPreference(storage, value) {
  const rider = normalizeSnow360Rider(value);
  try {
    storage?.setItem(SNOW360_RIDER_STORAGE_KEY, rider);
  } catch {
    // The selected rider still works when private browsing blocks persistence.
  }
  return rider;
}

/** Mount in the game; expose the selector only between runs. */
export function useSnow360RiderPreference() {
  // Keep server output and the initial browser render identical.
  const [rider, setRiderState] = useState(SNOW360_RIDERS.ALIEN_CAT);
  useEffect(() => {
    try {
      setRiderState(readSnow360RiderPreference(window.localStorage));
    } catch {
      // Accessing localStorage itself can throw in restricted browser contexts.
    }
  }, []);

  const setRider = useCallback((value) => {
    const next = normalizeSnow360Rider(value);
    setRiderState(next);
    try {
      writeSnow360RiderPreference(window.localStorage, next);
    } catch {
      // Persistence is optional; changing the character is not.
    }
  }, []);

  return [rider, setRider];
}
