/** Pure landing/recovery rules so gameplay can be tested without WebGL. */
export function judgeSnowLanding(trick, peakHeight, steering = 0, flightTime = 0) {
  if (!trick) return { grade: "clean", heightRatio: 1, progress: 1, bigAir: false };
  const progress = Math.min(2, Math.max(0, trick.t / trick.duration));
  const heightRatio = Math.max(0, peakHeight / trick.minHeight);
  const instability = Math.abs(steering);
  const bigAirRequired = trick.minHeight >= 2.3 || Math.abs(trick.spins || 0) >= 720 || !!trick.flip;
  const bigAir = peakHeight >= Math.max(2.25, trick.minHeight * 0.96) && flightTime >= Math.max(0.62, trick.duration * 0.84);

  if (bigAirRequired) {
    if (progress >= 0.97 && heightRatio >= 1.0 && bigAir && instability <= 0.88) {
      return { grade: "clean", progress, heightRatio, bigAir };
    }
    // Big-air tricks are unforgiving: if the jump never truly got enough ramp/gravity height,
    // the rider slams on landing instead of getting a lenient sketchy result.
    if (!bigAir || heightRatio < 1.0 || progress < 0.9) {
      return { grade: "wipeout", progress, heightRatio, bigAir };
    }
    if (instability <= 1.02) {
      return { grade: "sketchy", progress, heightRatio, bigAir };
    }
    return { grade: "wipeout", progress, heightRatio, bigAir };
  }

  if (progress >= 0.97 && heightRatio >= 1 && instability <= 0.88) {
    return { grade: "clean", progress, heightRatio, bigAir };
  }
  if (progress >= 0.82 && heightRatio >= 0.82 && instability <= 0.98) {
    return { grade: "sketchy", progress, heightRatio, bigAir };
  }
  return { grade: "wipeout", progress, heightRatio, bigAir };
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
