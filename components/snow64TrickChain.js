/** Sequential airborne tricks: keyboard spam & mobile gestures are buffered.
 * Pure module, independently testable without rendering or browser dependencies.
 */
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function resetAirTrickChain(s){
  s.airQueue=[];s.completedAirTricks=[];s.trick=null;
  s.airYaw=0;s.airPitch=0;s.spamPressure=0;s.trickSequence=0;
}
export function enqueueAirTrick(s,definition){
  if(!s.inAir)return false;
  // No lost commands until the bounded buffer is full. Overflow itself is risky.
  if(s.airQueue.length>=12){s.spamPressure+=.65;return false;}
  const id=++s.trickSequence;
  s.airQueue.push({...definition,id,t:0});
  if(s.airQueue.length>2)s.spamPressure+=.18;
  return true;
}
export function beginNextAirTrick(s){
  if(!s.inAir||s.trick||!s.airQueue.length)return false;
  s.trick=s.airQueue.shift();
  return true;
}
export function advanceAirTricks(s,dt){
  if(!s.inAir)return;
  beginNextAirTrick(s);
  let remaining=Math.max(0,dt);
  while(remaining>1e-7 && s.trick){
    const need=Math.max(0,s.trick.duration-s.trick.t);
    const step=Math.min(remaining,need);
    s.trick.t+=step;
    remaining-=step;
    if(s.trick.t+1e-7>=s.trick.duration){
      s.trick.t=s.trick.duration;
      s.completedAirTricks.push(s.trick);
      s.airYaw+=(s.trick.spins||0)*Math.PI/180;
      s.airPitch+=(s.trick.flip||0)*Math.PI/180;
      s.trick=null;
      beginNextAirTrick(s);
    }else break;
  }
}
export function judgeAirTrickChain(s,steering,judgeLanding,randomSample=0.5){
  const completed=s.completedAirTricks||[];
  const unfinished=!!s.trick || !!s.airQueue?.length;
  if(!completed.length && !unfinished)return {grade:'clean',basePoints:0,trickCount:0,risk:0};
  if(unfinished)return {grade:'wipeout',reason:'TRICK UNFINISHED',basePoints:0,trickCount:completed.length,risk:1};
  const context={flightTime:s.flightTime,launchSource:s.launchSource,launchSpeed:s.launchSpeed};
  let sketchy=false;
  for(const trick of completed){
    const result=judgeLanding(trick,s.peakAir,steering,context);
    if(result.grade==='wipeout')return {grade:'wipeout',reason:result.reason||'NO BIG AIR',basePoints:0,trickCount:completed.length,risk:1};
    if(result.grade==='sketchy')sketchy=true;
  }
  // The faster the player chains, the greater the chance of losing control;
  // SUPER AIR offers room to string several moves together, but isn't free.
  const count=completed.length;
  const crowding=Math.max(0,completed.reduce((a,t)=>a+t.duration,0)-s.flightTime*.88);
  const baseRisk=.012*Math.pow(Math.max(0,count-1),2)
    + .037*Math.max(0,count-2)
    + .045*Math.min(4,s.spamPressure||0)
    + .17*crowding
    + .09*Math.max(0,Math.abs(steering)-.4);
  const risk=clamp((s.launchSuper?baseRisk*.55:baseRisk*1.45),0,.9);
  const roll=clamp(randomSample,0,1);
  if(roll<risk*.60)return {grade:'wipeout',reason:'SPAM OVERLOAD',basePoints:0,trickCount:count,risk};
  if(sketchy || roll<risk)return {grade:'sketchy',reason:'UNSTABLE COMBO',basePoints:0,trickCount:count,risk};
  return {grade:'clean',basePoints:completed.reduce((n,t)=>n+t.points,0),trickCount:count,risk};
}
