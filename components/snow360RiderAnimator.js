import { AnimationMixer, LoopOnce, LoopRepeat } from "three";

const DEFAULT_FADE_SECONDS = 0.13;

/**
 * Plays game poses without restarting stable identities or jumping weights
 * when a new pose interrupts an unfinished transition. The caller pauses by
 * withholding setPose/update calls; update(0) also preserves animation time.
 */
export function createSnow360RiderAnimator(character, animations) {
  const mixer = new AnimationMixer(character);
  const clips = new Map(animations.map((clip) => [clip.name, clip]));
  const cache = new Map();
  const live = new Set();
  let active = null;
  let transition = null;
  let disposed = false;

  function release(record) {
    record.action.setEffectiveWeight(0).stop();
    live.delete(record);
  }

  function acquire(name) {
    let entries = cache.get(name);
    if (!entries) {
      entries = [];
      cache.set(name, entries);
    }
    const available = entries.find((entry) => !live.has(entry));
    if (available) return available;

    // A repeated trick needs a fresh playback clock while its previous
    // instance fades out. Reuse that extra instance once its weight is zero.
    const source = clips.get(name);
    const clip = entries.length ? source.clone() : source;
    const record = { action: mixer.clipAction(clip) };
    entries.push(record);
    return record;
  }

  function setPose(name, identity = name, options = {}) {
    if (disposed) return false;
    const resolved = clips.has(name) ? name : clips.has("SnowboardIdle") ? "SnowboardIdle" : null;
    if (!resolved || (active?.name === name && active.identity === identity)) return false;

    // Capture every outgoing contribution, including those left by an earlier
    // interruption. Three's fadeOut() would start each one at weight 1 again.
    const from = new Map();
    for (const record of live) {
      const weight = record.action.getEffectiveWeight();
      if (weight > 0) from.set(record, weight);
      else release(record);
    }

    const next = acquire(resolved);
    const oneShot = !!options.oneShot;
    const timeScale = Number.isFinite(options.timeScale) && options.timeScale >= 0 ? options.timeScale : 1;
    const duration = Number.isFinite(options.fadeSeconds) && options.fadeSeconds >= 0
      ? options.fadeSeconds : DEFAULT_FADE_SECONDS;
    next.action.reset();
    next.action.setLoop(oneShot ? LoopOnce : LoopRepeat, oneShot ? 1 : Infinity);
    next.action.clampWhenFinished = oneShot;
    next.action.setEffectiveTimeScale(timeScale);
    next.action.setEffectiveWeight(0).play();
    live.add(next);
    active = { name, identity };

    if (!from.size || duration === 0) {
      next.action.setEffectiveWeight(1);
      for (const record of from.keys()) release(record);
      transition = null;
    } else {
      transition = { from, next, duration, elapsed: 0 };
    }
    return true;
  }

  function update(dt) {
    if (disposed || !Number.isFinite(dt) || dt < 0) return;
    if (transition) {
      transition.elapsed += dt;
      const progress = Math.min(1, transition.elapsed / transition.duration);
      for (const [record, weight] of transition.from) {
        record.action.setEffectiveWeight(weight * (1 - progress));
      }
      transition.next.action.setEffectiveWeight(progress);
      if (progress === 1) {
        for (const record of transition.from.keys()) release(record);
        transition = null;
      }
    }
    mixer.update(dt);
  }

  function setSpeed(name, speed) {
    if (disposed || !Number.isFinite(speed) || speed < 0) return false;
    const entries = cache.get(name);
    if (!entries) return false;
    for (const record of entries) record.action.setEffectiveTimeScale(speed);
    return true;
  }

  function reset() {
    // React development effects may mount again after cleanup. Explicit reset
    // safely rebuilds cached actions after dispose without restoring stale time.
    disposed = false;
    mixer.stopAllAction();
    mixer.time = 0;
    live.clear();
    active = null;
    transition = null;
  }

  function dispose() {
    if (disposed) return;
    reset();
    mixer.uncacheRoot(character);
    cache.clear();
    disposed = true;
  }

  return { setPose, update, setSpeed, reset, dispose };
}
