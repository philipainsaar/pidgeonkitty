/** World-space snowboarding flight and variable-height ramps. */
export const SNOW_GRAVITY=18.6;
export const RAMP_LIP_HEIGHT=1.12; // fallback for older ramps
export const RAMP_LIP_OFFSET=1.5;

export function rampTakeoffSpeed(speed,ramp={}){
  const height=ramp.height ?? RAMP_LIP_HEIGHT;
  const length=ramp.length ?? 3.0;
  const angle=Math.atan2(height,length);
  const momentum=Math.max(0,speed-6)*Math.sin(angle)*1.25;
  const speedBonus=ramp.superAir ? 2.0 : 0;
  return Math.min(ramp.superAir?29:19.5,2.4+momentum+speedBonus);
}
export function rampAirPotential(speed,ramp={}){
  const velocity=rampTakeoffSpeed(speed,ramp);
  return {velocity,peakHeight:(ramp.height||RAMP_LIP_HEIGHT)+velocity*velocity/(2*SNOW_GRAVITY),
    nominalAirtime:2*velocity/SNOW_GRAVITY};
}
export function crossedRampLip(ramp,previousZ,z,x){
  const lipZ=ramp.z-(ramp.length??3)/2;
  return previousZ>lipZ && z<=lipZ && Math.abs(x-ramp.x)<1.85;
}
export function startSnowJump(s,groundHeight,{velocity,source='ollie',lift=0}){
  s.inAir=true;
  s.worldY=groundHeight+lift;
  s.vy=velocity;
  s.air=lift;
  s.peakAir=lift;
  s.flightTime=0;
  s.launchSource=source;
  s.launchSpeed=s.speed;
  s.launchSuper=false;
  s.trick=null;
  s.jumpCooldown=.4;
}
export function stepSnowJump(s,dt,groundHeight){
  s.worldY+=s.vy*dt-.5*SNOW_GRAVITY*dt*dt;
  s.vy-=SNOW_GRAVITY*dt;
  s.flightTime+=dt;
  s.air=Math.max(0,s.worldY-groundHeight);
  s.peakAir=Math.max(s.peakAir,s.air);
  if(s.vy<=0 && s.worldY<=groundHeight){
    s.worldY=groundHeight;s.air=0;s.vy=0;s.inAir=false;
    return true;
  }
  return false;
}
