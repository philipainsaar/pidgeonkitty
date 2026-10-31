/** Pure landing/recovery rules so gameplay can be tested without WebGL. */
export function judgeSnowLanding(trick, peakHeight, steering = 0) {
  if (!trick) return { grade: "clean", heightRatio: 1, progress: 1 };
  const progress = Math.min(2, Math.max(0, trick.t / trick.duration));
  const heightRatio = Math.max(0, peakHeight / trick.minHeight);
  const instability = Math.abs(steering);
  if (progress >= 0.97 && heightRatio >= 1 && instability <= 0.88) {
    return { grade: "clean", progress, heightRatio };
  }
  if (progress >= 0.79 && heightRatio >= 0.78 && instability <= 0.98) {
    return { grade: "sketchy", progress, heightRatio };
  }
  return { grade: "wipeout", progress, heightRatio };
}

export function recoveryStage(recovery) {
  if (!recovery) return "riding";
  const fallEnd = recovery.kind === "wipeout" ? 0.95 : 0.72;
  const chaseEnd = fallEnd + (recovery.kind === "wipeout" ? 1.62 : 1.25);
  if (recovery.t < fallEnd) return "falling";
  if (recovery.t < chaseEnd) return "chasing";
  return "remounting";
}

export function recoveryDuration(kind) {
  return kind === "wipeout" ? 3.15 : 2.46;
}
