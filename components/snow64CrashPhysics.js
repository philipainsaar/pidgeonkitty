/**
 * SNOW 64 V21: variable wipeout dynamics.
 * Small, bounded crash bodies. No external physics engine or per-frame allocations
 * are needed outside crashes. Pass a random() function in tests for reproducibility.
 */
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const GRAVITY = 18.6;
const TAU = Math.PI * 2;
const sample = random => clamp(Number(random()) || 0, 0, .999999999);
const between = (random, a, b) => a + (b - a) * sample(random);

function impactHeading(state, impact, random) {
  // Known rock/ramp contact contributes an outward normal, but never forces
  // every collision with the same obstacle to produce the same direction.
  const steer = clamp(state.steer || 0, -1, 1);
  const theta = between(random, -Math.PI, Math.PI);
  let x = Math.sin(theta) + steer * .35;
  let z = -Math.cos(theta) - .20;
  if (impact && Number.isFinite(impact.x) && Number.isFinite(impact.z)) {
    const dx = state.x - impact.x;
    const dz = state.z - impact.z;
    const n = Math.hypot(dx, dz);
    if (n > .04) {
      const contactWeight = between(random, .35, .85);
      x += (dx / n) * contactWeight;
      z += (dz / n) * contactWeight;
    }
  }
  const len = Math.max(.00001, Math.hypot(x, z));
  return {x:x / len, z:z / len};
}

/** A fresh board trajectory for every impact, derived from speed and contact. */
export function createCrashBoard(state, kind = 'wipeout', random = Math.random, impact = null) {
  const speed = Math.max(0, state.speed || 0);
  const force = kind === 'wipeout' ? 1 : .72;
  const heading = impactHeading(state, impact, random);
  const throwSpeed = (between(random, 3.5, 10.0) + Math.min(4.6, speed * .10)) * force;
  const maxTravel = clamp(between(random, 4.2, 9.8) + speed * .035, 4.6, 11.25);
  const spinDir = sample(random) < .5 ? -1 : 1;
  return {
    x:state.x, z:state.z, y:(Number.isFinite(state.worldY) ? state.worldY : 0) + between(random, .28, .78),
    vx:heading.x * throwSpeed + (state.velX || 0) * .16,
    vy:(between(random, 3.2, 6.2) + Math.min(1.6, speed * .042)) * force,
    vz:heading.z * throwSpeed - speed * .025,
    yaw:between(random, -.8, .8), pitch:between(random, -.2, .2), roll:between(random, -.25, .25),
    wx:spinDir * between(random, 1.5, 5.2) * force,
    wy:-spinDir * between(random, 1.2, 5.0) * force,
    wz:(sample(random) < .5 ? -1 : 1) * between(random, 1.2, 4.9) * force,
    bounceElasticity:between(random, .20, .38),
    maxBounces:sample(random) < .34 ? 1 : sample(random) < .55 ? 2 : 3,
    maxTravel, bounces:0, landed:false, time:0, rockHits:0,
    originX:state.x, originZ:state.z,
  };
}

/** Short randomized body skid, separate from the board's rigid body. */
export function createCrashRider(state, board, kind = 'wipeout', random = Math.random, impact = null) {
  const heading = impactHeading(state, impact, random);
  const speed = Math.max(0, state.speed || 0);
  const force = kind === 'wipeout' ? 1 : .72;
  const skid = (between(random, 1.25, 4.1) + speed * .045) * force;
  const side = sample(random) < .5 ? -1 : 1;
  return {
    x:state.x, z:state.z, y:(Number.isFinite(state.worldY) ? state.worldY : 0) + .25,
    vx:heading.x * skid + (state.velX || 0) * .12,
    vz:heading.z * skid - speed * .025,
    vy:between(random, .65, 2.3) * force,
    slideDrag:between(random, 1.6, 3.0),
    roll:side * between(random, .82, 1.62) * force,
    pitch:between(random, -.38, .38) * force,
    yaw:between(random, -.50, .50),
    modelTurn:between(random, -.28, .28),
    originX:state.x, originZ:state.z, maxTravel:between(random, 1.9, 4.4),
    groundHits:0, rockHits:0,
  };
}

/** Board ends included so nose and tail don't clip the slope while rotating. */
export function crashBoardFloor(board, groundAt) {
  const alongX = Math.sin(board.yaw) * 1.12;
  const alongZ = Math.cos(board.yaw) * 1.12;
  const snow = Math.max(groundAt(board.x, board.z),
    groundAt(board.x+alongX,board.z+alongZ),groundAt(board.x-alongX,board.z-alongZ));
  return snow + .09 + Math.abs(Math.sin(board.pitch)) * .88 + Math.abs(Math.sin(board.roll)) * .24;
}

function collideRocks(body, rocks, groundAt, radius) {
  if (!rocks?.length) return;
  for (const rock of rocks) {
    const dx=body.x-rock.x, dz=body.z-rock.z;
    const r=rock.size*.92+radius;
    if (dx*dx+dz*dz>=r*r) continue;
    const rockTop=groundAt(rock.x,rock.z)+rock.size*1.43;
    if (body.y > rockTop + .18) continue;
    const len=Math.max(.001,Math.hypot(dx,dz));
    const nx=len<=.0011 ? 1 : dx/len;
    const nz=len<=.0011 ? 0 : dz/len;
    body.x=rock.x+nx*r;body.z=rock.z+nz*r;
    const approach=body.vx*nx+body.vz*nz;
    if(approach<0){
      body.vx-=approach*1.45*nx;
      body.vz-=approach*1.45*nz;
      body.vy=Math.max(body.vy,body.rockHits<2 ? .9 : .15);
      body.rockHits+=1;
    }
  }
}

/** Simulate detached board only during recovery. Includes up to 3 bounces. */
export function stepCrashBoard(board, dt, groundAt, rocks = null) {
  if (!board || dt <= 0) return board;
  // At most nine physics steps per rendered frame on phones.
  const duration = Math.min(dt, .1);
  const steps=Math.max(1,Math.min(9,Math.ceil(duration/.012)));
  const h=duration/steps;
  if(board.time===0)board.y=Math.max(board.y,crashBoardFloor(board,groundAt)+.28);
  for(let i=0;i<steps;i++){
    board.time+=h;
    if(!board.landed){
      const drag=Math.exp(-1.20*h);
      board.vx*=drag;board.vz*=drag;
      board.vy-=GRAVITY*h;
      board.x+=board.vx*h;board.z+=board.vz*h;board.y+=board.vy*h;
      board.pitch+=board.wx*h;board.yaw+=board.wy*h;board.roll+=board.wz*h;
      board.wx*=Math.exp(-1.65*h);board.wy*=Math.exp(-1.45*h);board.wz*=Math.exp(-1.65*h);
      collideRocks(board,rocks,groundAt,.37);
      const dist=Math.hypot(board.x-board.originX,board.z-board.originZ);
      if(dist>board.maxTravel){
        const scale=board.maxTravel/dist;
        board.x=board.originX+(board.x-board.originX)*scale;
        board.z=board.originZ+(board.z-board.originZ)*scale;
        board.vx*=.2;board.vz*=.2;
      }
    }
    const floor=crashBoardFloor(board,groundAt);
    if(board.y<floor){
      board.y=floor;
      if(!board.landed && board.vy>0)continue;
      board.bounces+=1;
      if(!board.landed && board.vy<-1.15 && board.bounces<=board.maxBounces){
        board.vy=-board.vy*board.bounceElasticity*Math.pow(.63,board.bounces-1);
        board.vx*=.72;board.vz*=.72;
        board.wx*=.5;board.wy*=.5;board.wz*=.5;
      }else{
        board.vy=0;board.vx=0;board.vz=0;board.landed=true;
      }
    }
    if(board.landed){
      board.pitch*=Math.exp(-7*h);board.roll*=Math.exp(-7*h);
      board.y=Math.max(board.y-1.8*h,crashBoardFloor(board,groundAt));
    }
  }
  return board;
}

/** Rider skids/bounces in the chosen impact direction during the falling stage. */
export function stepCrashRider(rider, dt, groundAt, rocks = null) {
  if(!rider || dt<=0)return rider;
  const duration=Math.min(dt,.1);
  const steps=Math.max(1,Math.min(8,Math.ceil(duration/.014)));
  const h=duration/steps;
  for(let i=0;i<steps;i++){
    const damping=Math.exp(-rider.slideDrag*h);
    rider.vx*=damping;rider.vz*=damping;rider.vy-=GRAVITY*h;
    rider.x+=rider.vx*h;rider.z+=rider.vz*h;rider.y+=rider.vy*h;
    collideRocks(rider,rocks,groundAt,.48);
    const distance=Math.hypot(rider.x-rider.originX,rider.z-rider.originZ);
    if(distance>rider.maxTravel){
      const t=rider.maxTravel/distance;
      rider.x=rider.originX+(rider.x-rider.originX)*t;
      rider.z=rider.originZ+(rider.z-rider.originZ)*t;
      rider.vx*=.12;rider.vz*=.12;
    }
    const floor=groundAt(rider.x,rider.z)+.22;
    if(rider.y<floor){
      rider.y=floor;
      if(rider.vy<-.7 && rider.groundHits<1){rider.vy=-rider.vy*.15;rider.groundHits++;}
      else rider.vy=0;
    }
  }
  return rider;
}

/** A broad capsule proxy + bone check in the game prevent skinned mesh penetration. */
export function riderCrashMinY(rollZ, yawY, scale=.86, pitchX=0) {
  const halfX=(.6244*Math.abs(Math.cos(yawY))+1.094*Math.abs(Math.sin(yawY)))*scale;
  const minYFromSpine=Math.min(0,1.7*scale*Math.cos(rollZ)*Math.cos(pitchX));
  return minYFromSpine-Math.abs(Math.sin(rollZ))*halfX-Math.abs(Math.sin(pitchX))*.72*scale;
}
export function riderRecoveryGroundLift({rootY,carrierY,modelY,roll,yaw,pitch=0,floor}){
  const lowest=rootY+carrierY+modelY+riderCrashMinY(roll,yaw,.86,pitch);
  return Math.max(0,floor+.075-lowest);
}
