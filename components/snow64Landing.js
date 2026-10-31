/** Snow 64 landing grading, separate from rendering so it is easy to test. */
export function judgeSnowLanding(trick, peakHeight, steering = 0, context = {}) {
  if(!trick)return {grade:"clean",progress:1,heightRatio:1};
  const ctx=typeof context==="number"?{flightTime:context}:context;
  const flightTime=ctx.flightTime || 0;
  const launchSource=ctx.launchSource || "ollie";
  const launchSpeed=ctx.launchSpeed || 0;
  const progress=Math.min(2,Math.max(0,trick.t/trick.duration));
  const heightRatio=Math.max(0,peakHeight/trick.minHeight);
  const unstable=Math.abs(steering);
  const bigAir=Boolean(trick.requiresRamp || trick.bigAir || trick.flip || Math.abs(trick.spins||0)>=720);
  const enoughAir=flightTime >= Math.max(bigAir ? .95 : .55,trick.duration*(bigAir?1.08:.95));

  // The biggest spins demand a steep fast ramp. A charged flat-ground ollie
  // can NEVER qualify for 720, 1080 or Cork 720, no matter how much it jumps.
  if(trick.requiresRamp && ((launchSource!=="ramp" && launchSource!=="power") || launchSpeed < (trick.minLaunchSpeed || 0))){
    return {grade:"wipeout",reason:"NO RAMP BIG AIR",progress,heightRatio};
  }
  // Height is measured from the actual ballistic flight over descending terrain.
  if(bigAir && (heightRatio < 1 || !enoughAir || progress < .99)){
    return {grade:"wipeout",reason:"NOT ENOUGH HEIGHT OR AIRTIME",progress,heightRatio};
  }
  if(heightRatio >= 1 && enoughAir && progress >= .98 && unstable <= .8){
    return {grade:"clean",progress,heightRatio};
  }
  if(bigAir){
    return {grade:unstable < 1.02 && progress >= .99 ? "sketchy":"wipeout",progress,heightRatio};
  }
  if(heightRatio >= .84 && progress >= .82 && unstable <= .99){
    return {grade:"sketchy",progress,heightRatio};
  }
  return {grade:"wipeout",progress,heightRatio};
}

export function recoveryStage(recovery){
  if(!recovery)return "riding";
  const fallEnd=recovery.kind==="wipeout"?.95:.72;
  const chaseEnd=fallEnd+(recovery.kind==="wipeout"?1.62:1.25);
  if(recovery.t<fallEnd)return "falling";
  if(recovery.t<chaseEnd)return "chasing";
  return "remounting";
}
export function recoveryDuration(kind){return kind==="wipeout"?3.15:2.46;}
