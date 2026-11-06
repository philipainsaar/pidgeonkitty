/** SNOW360 soft rider. Springy landings, floppy wipeouts, grounded recovery. */
export const SNOW360_PLUSH = Object.freeze({
  bodySquish: 0.75,
  springBounce: 0.65,
  snowboardGrip: 0.72,
  secondaryWobble: 0.90,
});
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;

export function createSnow360PlushResponse(tuning=SNOW360_PLUSH){
  const spring=(f,d)=>({x:0,v:0,f,d});
  const squash=spring(104,11),bob=spring(74,11),sway=spring(62,8),lag=spring(52,7),pitch=spring(69,9);
  const springs=[squash,bob,sway,lag,pitch];
  let airborne=false,lastImpact=0,lastVelX=0,initialized=false;
  let lastRecovery=null,lastGroundHits=0,lastRockHits=0;

  function reset(){
    for(const q of springs){q.x=0;q.v=0;}
    airborne=false;lastImpact=0;lastVelX=0;initialized=false;
    lastRecovery=null;lastGroundHits=0;lastRockHits=0;
  }
  function kick(q,force){q.v=clamp(q.v+force,-22,22);}
  function advance(dt,targets){
    const steps=Math.max(1,Math.ceil(dt/(1/120)));
    const h=dt/steps;
    for(let i=0;i<steps;i++){
      for(let j=0;j<springs.length;j++){
        const q=springs[j];
        q.v+=((targets[j]-q.x)*q.f-q.v*q.d)*h;
        q.x+=q.v*h;
      }
    }
  }
  function step(state,seconds){
    if(!state || !Number.isFinite(seconds) || seconds<=0){
      return {squashY:1,expandXZ:1,swayZ:0,bobY:0,tiltX:0,earLagZ:0,earLagX:0};
    }
    const dt=clamp(seconds,0,.05);
    const recovery=state.recovery || null;
    const steer=clamp(finite(state.steer),-1,1);
    const velX=finite(state.velX);
    const impact=clamp(finite(state.impact),0,1);
    const speed=clamp(finite(state.speed)/40,0,1.5);
    let targetSquash,targetSway,targetPitch,targetLag,targetBob=0;
    if(recovery){
      if(lastRecovery!==recovery){
        // Immediate contact: squeeze wide, then spring back with overshoot.
        squash.x=.29*tuning.bodySquish/.75;
        squash.v=4.2*tuning.springBounce;
        bob.v=-1.0*tuning.springBounce;
        sway.x=clamp(finite(recovery.rider?.roll)*.21,-.26,.26);
        sway.v=3.4*tuning.secondaryWobble*(sway.x>=0?1:-1);
        lag.v=-4.2*tuning.secondaryWobble;
        pitch.v=2.4*tuning.secondaryWobble;
        lastRecovery=recovery;
        lastGroundHits=finite(recovery.rider?.groundHits);
        lastRockHits=finite(recovery.rider?.rockHits);
      }
      const t=finite(recovery.t);
      const fallEnd=recovery.kind==="wipeout"?.95:.72;
      const chaseEnd=fallEnd+(recovery.kind==="wipeout"?1.62:1.25);
      const falling=t<fallEnd,chasing=t>=fallEnd&&t<chaseEnd;
      const groundHits=finite(recovery.rider?.groundHits);
      const rockHits=finite(recovery.rider?.rockHits);
      if(groundHits>lastGroundHits){
        kick(squash,5.8*tuning.springBounce);
        kick(bob,-2.9*tuning.springBounce);
        kick(lag,3.4*tuning.secondaryWobble);
      }
      if(rockHits>lastRockHits){
        kick(squash,4.5*tuning.springBounce);
        kick(sway,4.1*tuning.secondaryWobble);
      }
      lastGroundHits=groundHits;
      lastRockHits=rockHits;
      const wobbleFade=Math.exp(-t*(falling?1.25:2.1));
      targetSquash=(falling?.11:chasing?.035:.014)*tuning.bodySquish;
      targetSway=falling?.10*Math.sin(t*17)*wobbleFade*tuning.secondaryWobble:
        chasing?.055*Math.sin(t*10)*tuning.secondaryWobble:0;
      targetPitch=falling?.09*Math.sin(t*13)*wobbleFade*tuning.secondaryWobble:0;
      targetLag=falling?.24*Math.sin(t*15+1)*wobbleFade*tuning.secondaryWobble:
        chasing?.075*Math.sin(t*9)*tuning.secondaryWobble:0;
      targetBob=0;
    }else{
      lastRecovery=null;
      const isAir=!!state.inAir;
      if(!initialized){airborne=isAir;lastImpact=impact;lastVelX=velX;initialized=true;}
      if(airborne&&!isAir){
        const height=clamp(finite(state.peakAir)/7,0,1);
        kick(squash,(2.6+height*5.8)*tuning.springBounce);
        kick(bob,(1.2+height*2.0)*tuning.springBounce);
        kick(lag,(steer<0?1:-1)*2.1*tuning.secondaryWobble);
      }
      if(impact>lastImpact+.12){
        kick(squash,3.8*tuning.springBounce);
        kick(bob,1.5*tuning.springBounce);
      }
      const xAcceleration=clamp((velX-lastVelX)/Math.max(dt,1/120),-40,40);
      targetSquash=(isAir?-.036:.012+Math.abs(steer)*.055+speed*.02)*tuning.bodySquish;
      targetSway=clamp(-steer*.105-xAcceleration*.003,-.24,.24)*tuning.secondaryWobble;
      targetPitch=clamp(-Math.abs(steer)*.03+(isAir?.024:0),-.07,.07);
      targetLag=clamp(-steer*.18-xAcceleration*.006,-.4,.4)*tuning.secondaryWobble;
      targetBob=isAir?.025:0;
      airborne=isAir;lastImpact=impact;lastVelX=velX;
    }
    advance(dt,[targetSquash,targetBob,targetSway,targetLag,targetPitch]);
    const compression=clamp(squash.x,recovery?-.14:-.075,recovery?.40:.27);
    return {
      squashY:clamp(1-compression,recovery?.60:.73,recovery?1.14:1.075),
      expandXZ:clamp(1+compression*(recovery?.75:.65),recovery?.90:.94,recovery?1.30:1.18),
      swayZ:clamp(sway.x,recovery?-.42:-.28,recovery?.42:.28),
      bobY:clamp(bob.x*.2-compression*.045,-.12,.15),
      tiltX:clamp(pitch.x,recovery?-.2:-.09,recovery?.2:.09),
      earLagZ:clamp(lag.x,recovery?-.52:-.32,recovery?.52:.32),
      earLagX:clamp(-lag.x*.42,recovery?-.22:-.14,recovery?.22:.14),
    };
  }
  return {reset,step};
}
export function snow360GripResponse(rate,tuning=SNOW360_PLUSH){
  return finite(rate,5.5)*(.85+.30*clamp(tuning.snowboardGrip,0,1));
}
