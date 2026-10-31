"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { classifySnowGesture, MOBILE_TRICK_GUIDE } from "./snow64Gestures";
import { judgeSnowLanding, recoveryStage, recoveryDuration } from "./snow64Landing";

// PidgeonKitty Snow 64. Original arcade game inspired by late-1990s N64 snowboarding.
// No Nintendo/N64 game assets are used. All mountain scenery, board and track are procedural.
const WEB_MODEL = "/models/pidgeonkitty-snowboard-v2.glb";
const MOBILE_MODEL = "/models/pidgeonkitty-snowboard-v2-mobile.glb";
const END_Z = -1050;
const SLOPE = 0.077;
const GRAVITY = 17.6;
const LANES = [-7.4, -3.8, 0, 3.8, 7.4];
const DEG = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

// Minimum peak height and airtime matter: huge tricks need a charged jump or a ramp.
const TRICKS = [
  { key: "1", name: "180", points: 160, duration: 0.42, minHeight: 1.15, spins: 180, pose: "SnowboardIndy" },
  { key: "2", name: "360", points: 360, duration: 0.57, minHeight: 1.85, spins: 360, pose: "SnowboardIndy" },
  { key: "3", name: "720", points: 800, duration: 0.86, minHeight: 3.05, spins: 720, pose: "SnowboardIndy" },
  { key: "4", name: "1080", points: 1600, duration: 1.22, minHeight: 4.38, spins: 1080, pose: "SnowboardIndy" },
  { key: "5", name: "METHOD", points: 450, duration: 0.65, minHeight: 1.85, roll: -0.58, pitch: -0.24, pose: "SnowboardMethod" },
  { key: "6", name: "INDY GRAB", points: 400, duration: 0.55, minHeight: 1.52, roll: 0.25, pitch: 0.16, pose: "SnowboardIndy" },
  { key: "7", name: "BACKFLIP", points: 900, duration: 0.84, minHeight: 2.3, flip: -360, pose: "SnowboardOllie" },
  { key: "8", name: "CORK 720", points: 1350, duration: 1.05, minHeight: 3.45, spins: 720, flip: -360, pose: "SnowboardMethod" },
  { key: "9", name: "TAIL GRAB", points: 510, duration: 0.64, minHeight: 1.87, roll: -0.18, pitch: 0.49, pose: "SnowboardTailgrab" },
  { key: "0", name: "NOSE GRAB", points: 520, duration: 0.64, minHeight: 1.87, roll: 0.16, pitch: -0.49, pose: "SnowboardNosegrab" },
  { key: "f", name: "FRONTFLIP", points: 960, duration: 0.88, minHeight: 2.52, flip: 360, pose: "SnowboardFrontflip" },
];

let snowAudioContext;
function synthSfx(kind) {
  if (typeof window === "undefined") return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!snowAudioContext) snowAudioContext = new AC();
    if (snowAudioContext.state === "suspended") snowAudioContext.resume();
    const notes = {
      start: [[330,.00,.09],[440,.10,.10],[660,.22,.17]],
      jump: [[190,.00,.08],[290,.09,.11]],
      pickup: [[660,.00,.075],[880,.085,.12]],
      trick: [[520,.00,.07],[780,.08,.09],[1040,.18,.17]],
      crash: [[140,.00,.14],[90,.12,.26]],
      finish: [[392,.00,.14],[494,.17,.15],[587,.35,.16],[784,.56,.32]],
    }[kind] || [];
    const now=snowAudioContext.currentTime;
    notes.forEach(([freq,delay,duration])=>{
      const osc=snowAudioContext.createOscillator();
      const env=snowAudioContext.createGain();
      osc.type="triangle";osc.frequency.setValueAtTime(freq,now+delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(50,freq*.75),now+delay+duration);
      env.gain.setValueAtTime(.0001,now+delay);
      env.gain.exponentialRampToValueAtTime(.055,now+delay+.012);
      env.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);
      osc.connect(env);env.connect(snowAudioContext.destination);
      osc.start(now+delay);osc.stop(now+delay+duration+.02);
    });
  }catch{ /* Optional audio should never interrupt gameplay. */ }
}

function rand(seed) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

function groundY(x, z) {
  const rolled = 0.5 * Math.sin(-z * 0.04) + 0.31 * Math.sin(x * 0.22 - z * 0.018);
  const bank = Math.max(0, Math.abs(x) - 12);
  return SLOPE * z + rolled + bank * bank * 0.055;
}

function buildCourse() {
  const random = rand(108064);
  const trees = [], rocks = [], ramps = [], coins = [], banners = [];
  for (let row = 0; row < 185; row++) {
    const z = 8 - row * 6.1;
    if (row % 2 === 0) {
      for (const sign of [-1, 1]) {
        const x = sign * (16.1 + random() * 18);
        trees.push({ id: `tree-${row}-${sign}`, x, z: z + random() * 3, size: 1.8 + random() * 3.1 });
      }
    }
    if (row > 4 && row % 9 === 0) {
      const lane = Math.floor(random() * LANES.length);
      coins.push({ id: `coin-${row}`, x: LANES[lane], z: z - 1.2 });
    }
    if (row > 10 && row % 15 === 0) {
      ramps.push({ id: `ramp-${row}`, x: LANES[1 + Math.floor(random() * 3)], z, index: row });
    }
    if (row > 12 && row % 7 === 0 && row % 15 !== 0) {
      const lane = Math.floor(random() * LANES.length);
      rocks.push({ id: `rock-${row}`, x: LANES[lane], z: z + 0.9, size: 0.6 + random() * 0.55 });
    }
    if (row % 21 === 0) banners.push({ z, side: row % 42 === 0 ? 1 : -1 });
  }
  return { trees, rocks, ramps, coins, banners };
}
const COURSE = buildCourse();

function Terrain() {
  const geometry = useMemo(() => {
    const verts = [], colors = [], indices = [];
    const w = 34, stepsX = 34, stepsZ = 295;
    const c = new THREE.Color();
    for (let i = 0; i <= stepsZ; i++) {
      const z = 32 - i * 4;
      for (let j = 0; j <= stepsX; j++) {
        const x = -w + (j / stepsX) * w * 2;
        const y = groundY(x, z);
        verts.push(x, y, z);
        const texture = 0.5 + 0.5 * Math.sin(j * 12.93 + i * 17.77);
        const center = Math.abs(x) < 11;
        const shade = center ? 0.965 + 0.022 * texture : 0.88 + texture * 0.065;
        c.setRGB(shade * 0.84, shade * 0.93, shade);
        colors.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < stepsZ; i++) {
      for (let j = 0; j < stepsX; j++) {
        const a = i * (stepsX + 1) + j, b = a + stepsX + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow={false}><meshLambertMaterial vertexColors side={THREE.DoubleSide} /></mesh>;
}

function Forest() {
  // Instancing keeps the forest to four draw calls, even on mobile.
  const trunks=useRef(),bottoms=useRef(),tops=useRef(),caps=useRef();
  useEffect(()=>{
    const matrices=[trunks.current,bottoms.current,tops.current,caps.current];
    const dims=[
      [0,.55,0], [0,1.08,0], [0,1.70,0], [0,2.13,0],
    ];
    const obj=new THREE.Object3D();
    COURSE.trees.forEach((tree,i)=>{
      matrices.forEach((inst,j)=>{
        obj.position.set(tree.x,groundY(tree.x,tree.z)+dims[j][1]*tree.size,tree.z);
        obj.scale.setScalar(tree.size);obj.rotation.set(0,(i*1.37)%6.28,0);obj.updateMatrix();
        inst.setMatrixAt(i,obj.matrix);
      });
    });
    matrices.forEach(inst=>{inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();});
  },[]);
  const n=COURSE.trees.length;
  return <>
    <instancedMesh ref={trunks} args={[null,null,n]}><cylinderGeometry args={[.09,.15,1.1,5]}/><meshLambertMaterial color="#64506f"/></instancedMesh>
    <instancedMesh ref={bottoms} args={[null,null,n]}><coneGeometry args={[.69,1.85,6]}/><meshLambertMaterial color="#17646e" flatShading/></instancedMesh>
    <instancedMesh ref={tops} args={[null,null,n]}><coneGeometry args={[.5,1.35,6]}/><meshLambertMaterial color="#26868d" flatShading/></instancedMesh>
    <instancedMesh ref={caps} args={[null,null,n]}><coneGeometry args={[.17,.35,6]}/><meshLambertMaterial color="#e7fbfc" flatShading/></instancedMesh>
  </>;
}
function Rock({ x, z, size }) {
  return <mesh position={[x, groundY(x, z) + size * 0.52, z]} rotation={[0.2, 0.8, 0.1]} scale={[size, size * 0.8, size * 1.1]}><dodecahedronGeometry args={[1, 0]} /><meshLambertMaterial color="#72879e" flatShading /></mesh>;
}
function Ramp({ x, z, index }) {
  const geom = useMemo(() => {
    // Uphill end is behind (+z), lip faces downhill (-z).
    const v = [-2,0,1.5, 2,0,1.5, -2,1.12,-1.5, 2,1.12,-1.5, -2,0,-1.5, 2,0,-1.5];
    const id = [0,1,2,1,3,2, 2,3,4,3,5,4, 0,2,4, 1,5,3];
    const g = new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(v,3));g.setIndex(id);g.computeVertexNormals();return g;
  }, []);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <group position={[x, groundY(x, z), z]}>
      <mesh geometry={geom}><meshLambertMaterial color={index % 2 ? "#f28695" : "#f9b55a"} side={THREE.DoubleSide} flatShading /></mesh>
      <mesh position={[0, 1.14, -1.47]}><boxGeometry args={[3.95, .1, .15]} /><meshBasicMaterial color="#fffbd5" /></mesh>
      <mesh position={[0, .45, 1.56]}><boxGeometry args={[3.8, .08, .14]} /><meshBasicMaterial color="#fffcdf" /></mesh>
    </group>
  );
}
function Coin({ x, z, id, collectedRef }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.visible = !collectedRef.current.has(id);
    ref.current.rotation.y = clock.elapsedTime * 2.3;
    ref.current.position.y = groundY(x, z) + 1.3 + Math.sin(clock.elapsedTime * 4 + z) * .14;
  });
  return <group ref={ref} position={[x, groundY(x, z) + 1.3, z]}><mesh><torusGeometry args={[.38,.095,5,9]} /><meshBasicMaterial color="#ffdd67" /></mesh><mesh><octahedronGeometry args={[.13,0]} /><meshBasicMaterial color="#fff5bd" /></mesh></group>;
}
function CourseMarker({ z, side }) {
  const x = side * 12.25;
  return (
    <group position={[x, groundY(x,z), z]}>
      <mesh position={[0,2.3,0]}><cylinderGeometry args={[.06,.09,4.6,5]} /><meshLambertMaterial color="#d4f9ff" /></mesh>
      <mesh position={[side*.62,3.55,0]}><boxGeometry args={[1.25,.65,.08]} /><meshBasicMaterial color={side>0?"#ff77ab":"#f8bb66"} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}
function FinishGate() {
  return <group position={[0,groundY(0,END_Z),END_Z]}>
    {[-11,11].map(x => <mesh key={x} position={[x,4,0]}><boxGeometry args={[.42,8,.42]} /><meshLambertMaterial color="#21465f" /></mesh>)}
    <mesh position={[0,7.7,0]}><boxGeometry args={[22.5,1.3,.65]} /><meshLambertMaterial color="#f6b963" /></mesh>
  </group>;
}
function Course({ collectedRef }) {
  return <>
    <Terrain />
    <Forest />
    {COURSE.rocks.map(r=><Rock key={r.id} {...r} />)}
    {COURSE.ramps.map(r=><Ramp key={r.id} {...r} />)}
    {COURSE.coins.map(c=><Coin key={c.id} {...c} collectedRef={collectedRef} />)}
    {COURSE.banners.map(c=><CourseMarker key={c.z} {...c} />)}
    <FinishGate />
  </>;
}

function Mountains() {
  const positions = useMemo(() => {
    const random = rand(1998);
    return Array.from({length:25},(_,i)=>({x:(i-12)*17, z:-1070-random()*130, height:28+random()*60, width:16+random()*20}));
  },[]);
  return <group>
    {positions.map((p,i)=><mesh key={i} position={[p.x,groundY(p.x,p.z)+p.height*.46,p.z]} rotation={[0,Math.PI/4,0]}><coneGeometry args={[p.width,p.height,4]} /><meshLambertMaterial color={i%3===0?"#8ba7bd":"#b1c5d7"} flatShading /></mesh>)}
  </group>;
}

function BoardTrail({stateRef}) {
  const num=90;
  const ref=useRef(),next=useRef(0);
  const sparks=useMemo(()=>Array.from({length:num},()=>({x:0,y:0,z:0,life:0,vx:0,vy:0})),[]);
  const coords=useMemo(()=>new Float32Array(num*3).fill(100000),[]);
  useFrame((_,dt)=>{
    if(!ref.current)return;
    const s=stateRef.current;
    if(s.speed>2 && !s.inAir && !s.recovery && s.t>0){
      for(let k=0;k<2;k++){
        const i=next.current++%num;const p=sparks[i];
        const side=k===0?-1:1;
        p.x=s.x+side*.31;p.y=groundY(s.x,s.z)+.14;p.z=s.z+.6;
        p.life=.45;p.vx=side*(.8+s.speed*.05);p.vy=1.3;
      }
    }
    for(let i=0;i<num;i++){
      const p=sparks[i];p.life-=dt;
      if(p.life>0){p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=1.6*dt;}
      coords[i*3]=p.life>0?p.x:100000;
      coords[i*3+1]=p.y;coords[i*3+2]=p.z;
    }
    ref.current.geometry.attributes.position.needsUpdate=true;
  });
  return <points ref={ref} frustumCulled={false}>
    <bufferGeometry><bufferAttribute attach="attributes-position" array={coords} count={num} itemSize={3}/></bufferGeometry>
    <pointsMaterial color="#f9ffff" size={.22} transparent opacity={.65} depthWrite={false}/>
  </points>;
}

function Snowfall({ stateRef }) {
  const count=180;
  const data=useMemo(()=>{
    const r=rand(64); return Array.from({length:count},()=>({x:(r()-.5)*34,z:(r()-.5)*44,y:r()*15,speed:2+r()*4}));
  },[]);
  const points=useRef();
  const coords=useMemo(()=>new Float32Array(count*3),[]);
  useFrame((_,dt)=>{
    if(!points.current)return;
    const s=stateRef.current;
    data.forEach((p,i)=>{
      p.y-=p.speed*Math.min(dt,.05);if(p.y<0)p.y+=15;
      coords[i*3]=s.x+p.x;
      coords[i*3+1]=groundY(s.x,s.z)+p.y;
      coords[i*3+2]=s.z+p.z;
    });
    points.current.geometry.attributes.position.needsUpdate=true;
  });
  return <points ref={points} frustumCulled={false}>
    <bufferGeometry><bufferAttribute attach="attributes-position" array={coords} count={count} itemSize={3}/></bufferGeometry>
    <pointsMaterial color="#ffffff" size={.13} transparent opacity={.85} depthWrite={false} sizeAttenuation />
  </points>;
}

function buildBoardGeometry() {
  const shape=new THREE.Shape();
  shape.moveTo(-.33,-.86);
  shape.quadraticCurveTo(-.33,-1.14,0,-1.17);
  shape.quadraticCurveTo(.33,-1.14,.33,-.86);
  shape.lineTo(.33,.86);
  shape.quadraticCurveTo(.33,1.14,0,1.17);
  shape.quadraticCurveTo(-.33,1.14,-.33,.86);
  shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:.07,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:1,curveSegments:5});
  g.rotateX(-Math.PI/2);
  return g;
}

function Snowboard() {
  const geom=useMemo(buildBoardGeometry,[]);
  useEffect(()=>()=>geom.dispose(),[geom]);
  return <group position={[0,.045,0]}>
    <mesh geometry={geom} position={[0,.065,0]}><meshStandardMaterial color="#252849" metalness={.18} roughness={.5} flatShading /></mesh>
    <mesh position={[0,.147,0]}><boxGeometry args={[.38,.018,1.45]} /><meshBasicMaterial color="#f6b5cc" /></mesh>
    <mesh position={[0,.159,0]}><boxGeometry args={[.09,.019,1.58]} /><meshBasicMaterial color="#fff1ce" /></mesh>
    {[-.43,.43].map(z=><group key={z} position={[0,.17,z]}>
      <mesh><boxGeometry args={[.56,.065,.40]} /><meshStandardMaterial color="#303c5c" roughness={.8} /></mesh>
      <mesh position={[0,.038,0]}><boxGeometry args={[.56,.035,.085]} /><meshStandardMaterial color="#ffce75" /></mesh>
    </group>)}
    <mesh position={[0,.05,-1.02]}><boxGeometry args={[.26,.025,.08]} /><meshBasicMaterial color="#80ebf1" /></mesh>
    <mesh position={[0,.05,1.02]}><boxGeometry args={[.26,.025,.08]} /><meshBasicMaterial color="#80ebf1" /></mesh>
  </group>;
}

function initialState() {
  return {
    x:0,z:0,air:0,vy:0,speed:15.8,velX:0,steer:0,t:0,
    inAir:false, impact:0, jumpCooldown:0, fakie:false,
    peakAir:0, flightTime:0, recovery:null,
    combo:0, score:0, coins:0, hits:0, lastText:"", textUntil:0,
    trick:null, currentPose:"SnowboardIdle", cameraMode:0,
    consumedRamps:new Set(),consumedRocks:new Set(),
  };
}
function safeHud(s) {
  return {
    speed:Math.round(s.speed*3.6),
    score:s.score, distance:Math.floor(-s.z), time:s.t,
    combo:s.combo, coins:s.coins, hits:s.hits,
    air:s.inAir, airHeight:s.air, peakAir:s.peakAir, pose:s.currentPose,
    recovery:recoveryStage(s.recovery),
    trick:s.recovery ? (s.textUntil>s.t ? s.lastText : (recoveryStage(s.recovery)==="chasing" ? "RUN FOR YOUR BOARD!" : "GETTING UP...")) : (s.trick ? `${s.trick.name}  ${s.peakAir.toFixed(1)} / ${s.trick.minHeight.toFixed(1)}m` : (s.textUntil>s.t ? s.lastText : "")),
  };
}
function smoothstep(t) { const v=clamp(t,0,1);return v*v*(3-2*v); }

function beginSnowRecovery(s, kind, reason, onSound) {
  if (s.recovery) return;
  const penalty = (kind === "wipeout" ? 650 : 220) + Math.min(600, s.combo * 120);
  s.score -= penalty;
  s.combo = 0;
  s.hits += 1;
  s.recovery = { kind, t: 0, duration: recoveryDuration(kind) };
  s.lastText = `${reason}  −${penalty} PTS`;
  s.textUntil = s.t + 1.85;
  s.inAir = false;
  s.vy = 0;
  s.air = 0;
  s.trick = null;
  s.impact = 0;
  s.speed = Math.min(8, s.speed * .34);
  s.steer = 0;
  s.fakie = false;
  onSound("crash");
}

function Rider({ mobile, phase, runKey, keyRef, queueRef, stateRef, collectedRef, onHud, onFinish, onSound }) {
  const {scene, animations}=useGLTF(mobile?MOBILE_MODEL:WEB_MODEL);
  const character=useMemo(()=>cloneSkinned(scene),[scene]);
  const mixer=useMemo(()=>new THREE.AnimationMixer(character),[character]);
  const actions=useMemo(()=>Object.fromEntries(animations.map(a=>[a.name,mixer.clipAction(a)])),[animations,mixer]);
  const root=useRef(), stance=useRef(), board=useRef(), riderCarrier=useRef(), riderModel=useRef();
  const active=useRef(null),frame=useRef(0),cameraReady=useRef(false),phaseRef=useRef(phase);
  const {camera}=useThree();
  useEffect(()=>{phaseRef.current=phase;},[phase]);
  useEffect(()=>{
    stateRef.current=initialState(); collectedRef.current.clear(); queueRef.current.length=0;
    frame.current=0;cameraReady.current=false;
    mixer.stopAllAction();active.current=null;
    if (root.current) root.current.position.set(0,.1,0);
  },[runKey,stateRef,collectedRef,queueRef]);
  useEffect(()=>()=>mixer.stopAllAction(),[mixer]);

  useFrame((_, rawDt)=>{
    const dt=Math.min(rawDt,0.043),s=stateRef.current;
    const playing=phaseRef.current==="playing";
    const left=keyRef.current.left?1:0,right=keyRef.current.right?1:0;
    const tuck=(keyRef.current.tuck || keyRef.current.touchTuck) && playing;
    const steerWanted=playing?clamp(right-left+(keyRef.current.steerAnalog||0),-1,1):0;
    s.steer=lerp(s.steer,steerWanted,Math.min(1,dt*6));
    const queue=queueRef.current.splice(0);
    for (const command of queue) {
      if (command.type === "camera") s.cameraMode = (s.cameraMode + 1) % 3;
      if (!playing || s.recovery) continue;
      if (command.type === "jump" && !s.inAir && s.jumpCooldown <= 0) {
        s.inAir = true;
        s.vy = 8.6 + (tuck ? .8 : 0) + 4.2 * clamp(command.boost || 0, 0, 1);
        s.air = .03; s.peakAir = 0; s.flightTime = 0;
        s.jumpCooldown = .3; s.trick = null;
        s.lastText = (command.boost || 0) > .5 ? "POWER OLLIE!" : "OLLIE!";
        s.textUntil = s.t + .9;
        onSound("jump");
      }
      if (command.type === "trick") {
        const found = TRICKS.find(q => q.key === command.key);
        const trick = found ? { ...found, spins: found.spins && command.direction === -1 ? -found.spins : found.spins } : null;
        if (trick && !s.inAir && s.jumpCooldown <= 0) {
          // Quick tricks trigger an ollie, but do NOT guarantee sufficient height.
          // For 720/1080/Cork tricks, use a ramp or a charged jump then trick in midair.
          s.inAir = true; s.vy = 9.8;
          s.air = .03; s.peakAir = 0; s.flightTime = 0;
          s.jumpCooldown = .4; s.trick = null; onSound("jump");
        }
        if (trick && s.inAir && !s.trick) {
          s.trick = { ...trick, t: 0 };
          s.lastText = `${trick.name} • NEED ${trick.minHeight.toFixed(1)}m AIR`;
          s.textUntil = s.t + 1.4;
        }
      }
    }

    if (playing) {
      s.t += dt;
      s.jumpCooldown = Math.max(0, s.jumpCooldown - dt);
      s.impact = Math.max(0, s.impact - dt);
      if (s.recovery) {
        // The board slides just ahead while the rider falls, runs after it and remounts.
        s.recovery.t += dt;
        s.speed = lerp(s.speed, 1.35, Math.min(1, dt * 2.2));
        s.z -= s.speed * dt;
        s.velX = 0;
        if (s.recovery.t >= s.recovery.duration) {
          s.recovery = null;
          s.speed = 12;
          s.jumpCooldown = .45;
          s.lastText = "BACK ON BOARD!";
          s.textUntil = s.t + 1.1;
        }
      } else {
        const targetSpeed = (tuck ? 29 : 21.5) - Math.abs(s.steer) * 2.6;
        s.speed = lerp(s.speed, targetSpeed, Math.min(1, dt * (tuck ? .65 : .45)));
        s.velX = lerp(s.velX, s.steer * (s.inAir ? 5.0 : 9.2), Math.min(1, dt * (s.inAir ? 2.8 : 5.5)));
        s.x = clamp(s.x + s.velX * dt, -11.15, 11.15);
        s.z -= s.speed * dt;
        if (!s.inAir) {
          for (const ramp of COURSE.ramps) {
            if (s.consumedRamps.has(ramp.id)) continue;
            if (Math.abs(s.z - ramp.z) < 1.7 && Math.abs(s.x - ramp.x) < 1.95 && s.jumpCooldown <= 0) {
              s.inAir = true; s.vy = 11.7; s.air = .02;
              s.peakAir = 0; s.flightTime = 0;
              s.jumpCooldown = .4; s.trick = null;
              s.consumedRamps.add(ramp.id);
              s.lastText = "BIG AIR!"; s.textUntil = s.t + 1.5;
              onSound("jump"); break;
            }
          }
        }
        if (s.inAir) {
          s.vy -= GRAVITY * dt;
          s.air += s.vy * dt;
          s.flightTime += dt;
          s.peakAir = Math.max(s.peakAir, s.air);
          if (s.trick) s.trick.t += dt;
          if (s.air <= 0) {
            s.air = 0; s.vy = 0; s.inAir = false;
            if (s.trick) {
              const result = judgeSnowLanding(s.trick, s.peakAir, s.steer);
              if (result.grade === "clean") {
                s.combo++;
                const earned = s.trick.points * Math.min(5, s.combo);
                if (Math.abs((s.trick.spins || 0) % 360) === 180) s.fakie = !s.fakie;
                s.score += earned;
                onSound("trick");
                s.lastText = `CLEAN ${s.trick.name}!  +${earned.toLocaleString()}`;
                s.textUntil = s.t + 1.8;
                s.impact = .45;
                s.trick = null;
              } else {
                const label = result.grade === "wipeout" ? "WIPEOUT!" : "SKETCHY LANDING!";
                beginSnowRecovery(s, result.grade, label, onSound);
              }
            } else s.impact = .45;
          }
        }
        if (!s.inAir && !s.recovery) {
          for (const rock of COURSE.rocks) {
            if (s.consumedRocks.has(rock.id)) continue;
            if (Math.abs(s.z - rock.z) < 1.1 && Math.abs(s.x - rock.x) < rock.size + .5) {
              s.consumedRocks.add(rock.id);
              beginSnowRecovery(s, "wipeout", "ROCK WIPEOUT!", onSound);
              break;
            }
          }
        }
        if (!s.recovery) {
          for (const coin of COURSE.coins) {
            if (collectedRef.current.has(coin.id)) continue;
            if (Math.abs(s.z - coin.z) < 1.55 && Math.abs(s.x - coin.x) < 1.28) {
              collectedRef.current.add(coin.id); s.coins++; s.score += 250; onSound("pickup");
              s.lastText = "SHRED TOKEN +250"; s.textUntil = s.t + 1.25;
            }
          }
        }
        if (s.z <= END_Z) {
          phaseRef.current = "finished"; onSound("finish"); onFinish(safeHud(s));
        }
      }
    }

    const recoveryMode = recoveryStage(s.recovery);
    const desired = recoveryMode === "falling" ? "SnowboardWipeout" :
      recoveryMode === "chasing" ? "Run" :
      recoveryMode === "remounting" ? "SnowboardRemount" :
      s.inAir ? (s.trick?.pose || "SnowboardOllie") :
      s.impact > 0 ? "SnowboardLanding" : tuck ? "SnowboardTuck" :
      s.steer < -.16 ? "SnowboardCarveLeft" : s.steer > .16 ? "SnowboardCarveRight" :
      playing ? "SnowboardCruise" : "SnowboardIdle";
    s.currentPose=desired;
    if(active.current!==desired){
      const prev=actions[active.current],next=actions[desired]||actions.SnowboardIdle;
      if(next){
        next.reset();
        next.enabled = true;
        const oneShot = !!s.trick && s.inAir || recoveryMode === "falling" || recoveryMode === "remounting";
        next.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
        next.clampWhenFinished = oneShot;
        next.timeScale = s.trick ? next.getClip().duration / Math.max(.15, s.trick.duration) :
          recoveryMode === "remounting" ? next.getClip().duration / .55 : 1;
        next.fadeIn(.17).play();if(prev)prev.fadeOut(.17);
      }
      active.current=desired;
    }
    if(phaseRef.current!=="paused")mixer.update(dt);

    const cy = groundY(s.x, s.z);
    if (root.current && stance.current && board.current && riderCarrier.current && riderModel.current) {
      root.current.position.set(s.x, cy + Math.max(0, s.air) + .08, s.z);
      const trick = s.trick;
      const progress = trick ? smoothstep(trick.t / trick.duration) : 0;
      const grabEnvelope = trick ? Math.sin(Math.PI * progress) : 0;
      const rec = s.recovery;
      const airYaw = rec ? 0 : (s.fakie ? Math.PI : 0) + (trick ? (trick.spins || 0) * DEG * progress : 0);
      const flip = trick ? (trick.flip || 0) * DEG * progress : 0;
      const roll = trick ? (trick.roll || 0) * grabEnvelope : 0;
      stance.current.rotation.set(flip - s.velX * .013 * (s.inAir ? .3 : 1), airYaw,
        s.steer * -.22 + roll, "YXZ");
      board.current.rotation.x = (trick?.pitch || 0) * grabEnvelope +
        (s.inAir ? Math.sin(s.air * .58) * .1 : -Math.min(.2, s.speed * .003));
      board.current.rotation.z = trick ? (trick.roll || 0) * grabEnvelope * .55 : 0;
      board.current.position.y = s.impact > 0 ? -.09 * Math.sin((.45 - s.impact) * Math.PI / .45) : 0;
      if (rec) {
        const falling = recoveryMode === "falling";
        const chasing = recoveryMode === "chasing";
        const fallEnd = rec.kind === "wipeout" ? .95 : .72;
        const chaseEnd = fallEnd + (rec.kind === "wipeout" ? 1.62 : 1.25);
        const fallP = smoothstep(rec.t / fallEnd);
        const chaseP = smoothstep((rec.t - fallEnd) / (chaseEnd - fallEnd));
        const separation = falling ? fallP : chasing ? (1 - chaseP) : 0;
        // The rider is genuinely detached from the board: falls into powder,
        // stands, runs from behind and climbs back into the bindings.
        riderCarrier.current.position.set(separation * (rec.kind === "wipeout" ? 1.25 : .8),
          falling ? -.03 * fallP : chasing ? 0 : -.08 * Math.sin(Math.PI * smoothstep((rec.t - chaseEnd) / .5)),
          separation * (rec.kind === "wipeout" ? 2.7 : 1.8));
        const downAngle = rec.kind === "wipeout" ? -1.35 : -.98;
        const getUp = smoothstep((rec.t - fallEnd) / .38);
        riderCarrier.current.rotation.set(0, 0,
          falling ? downAngle * Math.sin(Math.PI * fallP * .5) :
          chasing ? downAngle * (1 - getUp) - .055 * Math.sin(chaseP * 17) : 0);
        const turnToRun = smoothstep((rec.t - fallEnd) / .38);
        const turnToBoard = smoothstep((rec.t - chaseEnd + .34) / .34);
        riderModel.current.rotation.y = chasing ? (Math.PI / 2) * (1 - turnToRun + turnToRun * turnToBoard) : Math.PI / 2;
        riderModel.current.position.y = .17;
      } else {
        riderCarrier.current.position.set(0, 0, 0);
        riderCarrier.current.rotation.set(0, 0, 0);
        riderModel.current.rotation.y = Math.PI / 2;
        riderModel.current.position.y = .17;
      }
    }
    // Close three-quarter camera, offset sideways to frame the rider's face and board.
    const offsets=[[-3.0,2.25,5.6],[-.7,3.15,10.5],[-6.1,4.2,12.5]];
    const off=offsets[s.cameraMode];
    const dest=new THREE.Vector3(s.x+off[0]+s.steer*.4,cy+s.air*.32+off[1],s.z+off[2]);
    const look=new THREE.Vector3(s.x,cy+1.14+s.air*.45,s.z-1.3);
    if(!cameraReady.current){camera.position.copy(dest);cameraReady.current=true;}
    else camera.position.lerp(dest,Math.min(1,dt*4));
    const targetLook=camera.userData._look || (camera.userData._look=look.clone());
    targetLook.lerp(look,Math.min(1,dt*5));camera.lookAt(targetLook);
    camera.fov=lerp(camera.fov,42+Math.max(0,s.speed-20)*.16,Math.min(1,dt*2));camera.updateProjectionMatrix();
    frame.current+=dt;
    if(frame.current>.12){frame.current=0;onHud(safeHud(s));}
  });
  return <group ref={root}>
    <group ref={stance}>
      <group ref={board}><Snowboard /></group>
      <group ref={riderCarrier}>
        <group ref={riderModel}>
          <primitive object={character} dispose={null} scale={.86} />
        </group>
      </group>
    </group>
  </group>;
}

function Loading() {
  return <Html center><div style={{color:"#fff",font:"800 15px monospace",whiteSpace:"nowrap",background:"#16405ba9",padding:18,borderRadius:8}}>LOADING RIDER...</div></Html>;
}
function Scene({mobile,phase,runKey,keyRef,queueRef,onHud,onFinish,onSound,collectedRef,stateRef}){
  return <>
    <color attach="background" args={["#bfd9e6"]}/>
    <fog attach="fog" args={["#c1dce9",30,138]}/>
    <ambientLight intensity={1.7}/>
    <hemisphereLight args={["#e6f6ff","#597988",1.3]}/>
    <directionalLight position={[-8,20,-30]} intensity={2.2} color="#fff6e9"/>
    <Course collectedRef={collectedRef}/>
    <Mountains/>
    <Suspense fallback={<Loading/>}>
      <Rider mobile={mobile} phase={phase} runKey={runKey} keyRef={keyRef} queueRef={queueRef} stateRef={stateRef} collectedRef={collectedRef} onHud={onHud} onFinish={onFinish} onSound={onSound}/>
    </Suspense>
    <Snowfall stateRef={stateRef}/>
    <BoardTrail stateRef={stateRef}/>
  </>;
}

const uiButton={font:"800 12px system-ui, sans-serif",letterSpacing:".05em",color:"#ecfbff",background:"#13354dcb",border:"2px solid #9ccfe2",boxShadow:"0 4px 0 #102638",borderRadius:9,cursor:"pointer",touchAction:"none",userSelect:"none",WebkitUserSelect:"none"};
function formatTime(s){const m=Math.floor(s/60);const sec=(s%60).toFixed(2).padStart(5,"0");return `${String(m).padStart(2,"0")}:${sec}`;}
function HoldButton({label,onDown,onUp,style={}}){
  return <button type="button" style={{...uiButton,...style}} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);onDown();}} onPointerUp={e=>{e.preventDefault();onUp();}} onPointerCancel={onUp} onLostPointerCapture={onUp}>{label}</button>;
}

/** Two independent touch zones allow true two-thumb multi-touch: steering with the
 * left finger while drawing tricks on the right. No WebGL raycasting required. */
function MobileTouchControls({ inputRef, act, phase, runKey }) {
  const steering = useRef(null);
  const drawing = useRef(null);
  const stickBase = useRef(null);
  const stickKnob = useRef(null);
  const strokePath = useRef(null);
  const noticeTimeout = useRef(null);
  const strokeTimeout = useRef(null);
  const [notice, setNotice] = useState("");
  const [help, setHelp] = useState(false);

  useEffect(() => {
    // Explicitly release held controls after pausing, restarting or unmounting.
    inputRef.current.steerAnalog = 0;
    inputRef.current.touchTuck = false;
    steering.current = null;
    drawing.current = null;
    return () => {
      inputRef.current.steerAnalog = 0;
      inputRef.current.touchTuck = false;
      clearTimeout(noticeTimeout.current);
      clearTimeout(strokeTimeout.current);
    };
  }, [inputRef, phase, runKey]);

  function flash(message) {
    clearTimeout(noticeTimeout.current);
    setNotice(message);
    noticeTimeout.current = setTimeout(() => setNotice(""), 1450);
  }
  function startSteer(e) {
    if (phase !== "playing" || steering.current) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    steering.current = {id:e.pointerId, x:e.clientX, y:e.clientY};
    e.currentTarget.setPointerCapture(e.pointerId);
    if (stickBase.current) {
      const el = stickBase.current;
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      el.style.bottom = "auto"; el.style.opacity = "1";
    }
    if (stickKnob.current) stickKnob.current.style.transform = "translate(-50%,-50%)";
  }
  function moveSteer(e) {
    if (!steering.current || steering.current.id !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - steering.current.x;
    const dy = e.clientY - steering.current.y;
    inputRef.current.steerAnalog = clamp(dx / 68, -1, 1);
    inputRef.current.touchTuck = dy < -43;
    if (stickKnob.current) {
      const mag = Math.max(1, Math.hypot(dx, dy));
      const ratio = Math.min(1, 43 / mag);
      stickKnob.current.style.transform = `translate(-50%,-50%) translate(${dx * ratio}px,${dy * ratio}px)`;
      stickKnob.current.style.background = dy < -43 ? "#f9dc78" : "#f49db9";
    }
  }
  function endSteer(e) {
    if (!steering.current || steering.current.id !== e.pointerId) return;
    steering.current = null;
    inputRef.current.steerAnalog = 0;
    inputRef.current.touchTuck = false;
    if (stickBase.current) {
      const el = stickBase.current;
      el.style.left = "27%"; el.style.top = "auto";
      el.style.bottom = "calc(28px + env(safe-area-inset-bottom, 0px))";
      el.style.opacity = ".72";
    }
    if (stickKnob.current) stickKnob.current.style.transform = "translate(-50%,-50%)";
  }
  function drawLine() {
    if (!strokePath.current || !drawing.current) return;
    const {points} = drawing.current;
    const data = points.map((p,i) => `${i===0?"M":"L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    strokePath.current.setAttribute("d", data);
  }
  function startDrawing(e) {
    if (phase !== "playing" || drawing.current) return;
    e.preventDefault();
    clearTimeout(strokeTimeout.current);
    const rect = e.currentTarget.getBoundingClientRect();
    drawing.current = {id:e.pointerId, time:performance.now(), rect,
      points:[{x:e.clientX - rect.left, y:e.clientY - rect.top}]};
    e.currentTarget.setPointerCapture(e.pointerId);
    if (strokePath.current) strokePath.current.setAttribute("d", "");
  }
  function moveDrawing(e) {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    const pt = {x:e.clientX - d.rect.left, y:e.clientY - d.rect.top};
    const prev = d.points[d.points.length - 1];
    if (Math.hypot(pt.x - prev.x, pt.y - prev.y) < 2.5) return;
    if (d.points.length < 320) d.points.push(pt);
    drawLine();
  }
  function endDrawing(e, cancelled = false) {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    drawing.current = null;
    if (!cancelled) {
      const gesture = classifySnowGesture(d.points);
      if (gesture) {
        // A drawn trick also launches a jump when the rider is on the snow.
        act({type:"trick",key:gesture.key,direction:gesture.direction});
        flash(`${gesture.shape}  →  ${gesture.label}`);
      } else {
        const elapsed = performance.now() - d.time;
        act({type:"jump",boost:clamp((elapsed-120)/750,0,1)});
        flash(elapsed > 460 ? "POWER OLLIE!" : "OLLIE!");
      }
    }
    clearTimeout(strokeTimeout.current);
    strokeTimeout.current = setTimeout(() => strokePath.current?.setAttribute("d", ""), 350);
  }

  const zone = {position:"absolute",top:138,bottom:0,zIndex:4,touchAction:"none",
    userSelect:"none",WebkitUserSelect:"none",WebkitTouchCallout:"none",overflow:"hidden"};
  const labelStyle={position:"absolute",bottom:"calc(22px + env(safe-area-inset-bottom, 0px))",
    font:"900 10px system-ui, sans-serif",letterSpacing:1.2,color:"#faffff",
    textShadow:"1px 2px 3px #102f47, 0 0 5px #102f47",pointerEvents:"none"};

  return <>
    <div aria-label="Steering touchpad: drag left or right to carve and upward to tuck"
      style={{...zone,left:0,width:"47%"}} onPointerDown={startSteer}
      onPointerMove={moveSteer} onPointerUp={endSteer}
      onPointerCancel={endSteer} onLostPointerCapture={endSteer}>
      <div ref={stickBase} aria-hidden="true" style={{position:"absolute",left:"27%",bottom:"calc(28px + env(safe-area-inset-bottom, 0px))",
        width:116,height:116,borderRadius:"50%",border:"2px solid #e6f9ff9c",
        background:"#0e3c5a30",boxShadow:"inset 0 0 22px #ffffff24,0 0 12px #163e5666",
        transform:"translate(-50%,-50%)",opacity:.72,pointerEvents:"none"}}>
        <div ref={stickKnob} style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",
          width:56,height:56,borderRadius:"50%",border:"3px solid #fff4d8",background:"#f49db9",
          boxShadow:"0 3px 0 #203e59,0 0 14px #213c5c99",display:"grid",placeItems:"center",
          fontSize:18,color:"#17334c",fontWeight:900}}>✛</div>
      </div>
      <div style={{...labelStyle,left:13}}>DRAG ↔ STEER · ↑ TUCK</div>
    </div>
    <div aria-label="Jump and trick touchpad: tap to jump or draw a trick pattern"
      style={{...zone,right:0,width:"53%"}} onPointerDown={startDrawing}
      onPointerMove={moveDrawing} onPointerUp={endDrawing}
      onPointerCancel={e=>endDrawing(e,true)}
      onLostPointerCapture={e=>endDrawing(e,true)}>
      <div aria-hidden="true" style={{position:"absolute",right:"12%",bottom:"calc(112px + env(safe-area-inset-bottom, 0px))",
        border:"2px dashed #fff7dd9a",background:"#153c5773",borderRadius:"50%",width:134,height:134,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,
        pointerEvents:"none",boxShadow:"inset 0 0 22px #fff5e819"}}>
        <span style={{fontSize:31,lineHeight:1,color:"#ffdf8b"}}>↻ Z V</span>
        <span style={{font:"900 11px system-ui",color:"#ffffff"}}>DRAW A TRICK</span>
        <span style={{font:"700 10px system-ui",color:"#d7f6ff"}}>TAP = JUMP</span>
      </div>
      <svg aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",overflow:"visible"}}>
        <path ref={strokePath} fill="none" stroke="#ffe284" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
          style={{filter:"drop-shadow(0 0 5px #ff9ca8)"}}/>
      </svg>
      <div style={{...labelStyle,right:16}}>TAP JUMP · DRAW TRICKS</div>
    </div>
    {notice && <div aria-live="polite" style={{position:"absolute",zIndex:5,top:"31%",left:"50%",transform:"translateX(-50%)",
      padding:"9px 14px",borderRadius:8,background:"#183e5bdd",color:"#ffe89b",font:"900 15px system-ui",
      textShadow:"1px 1px #22405b",whiteSpace:"nowrap",pointerEvents:"none"}}>{notice}</div>}
    <button type="button" className="snow64-tool" aria-label="Show touch trick gestures"
      onPointerDown={e=>e.stopPropagation()} onClick={()=>setHelp(v=>!v)}
      style={{...uiButton,position:"absolute",zIndex:6,right:10,top:149,padding:"8px 10px",background:"#173e5add"}}>
      {help?"✕ CLOSE":"? TRICKS"}
    </button>
    {help && <div style={{position:"absolute",inset:0,zIndex:5,background:"#112e48d9",display:"grid",placeItems:"center",
      padding:"50px 16px 20px",touchAction:"none"}}>
      <div style={{width:"min(100%,410px)",maxHeight:"72dvh",overflowY:"auto",borderRadius:14,
        border:"2px solid #cdeefd",background:"#173f5de8",padding:18,boxShadow:"0 8px 23px #0c2139aa"}}>
        <h2 style={{margin:"0 0 12px",fontSize:21,color:"#ffebaa"}}>DRAW YOUR TRICKS</h2>
        <p style={{fontSize:12,color:"#ddf5ff",lineHeight:1.5,margin:"0 0 14px"}}>Left thumb steers the board (swipe upward to tuck). On the right half, tap to ollie or draw one continuous gesture to jump and do a trick. Both fingers work together!</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:7}}>
          {MOBILE_TRICK_GUIDE.map(([shape,name])=><div key={shape} style={{display:"flex",alignItems:"center",gap:11,
            padding:"7px 9px",background:"#0f304e9c",borderRadius:8}}>
            <span style={{color:"#ffdf92",fontSize:24,fontWeight:900,width:54,textAlign:"center"}}>{shape}</span>
            <span style={{fontSize:11,fontWeight:900,color:"#f6fbff"}}>{name}</span>
          </div>)}
        </div>
        <p style={{color:"#b5d9e6",fontSize:11,lineHeight:1.4,margin:"14px 0 0"}}>Tip: draw slowly and clearly. A hold-and-release without drawing charges a higher ollie. Big tricks need a ramp or a charged jump. Incomplete tricks cause a sketchy landing or wipeout, and you run back to your board.</p>
        <button type="button" className="snow64-tool" onClick={()=>setHelp(false)} style={{...uiButton,marginTop:12,padding:"10px 18px",width:"100%",background:"#eea2b6",color:"#18374e"}}>BACK TO SLOPES</button>
      </div>
    </div>}
  </>;
}

export default function SnowboardGame(){
  const [phase,setPhase]=useState("ready");
  const [runKey,setRunKey]=useState(0);
  const [mobile,setMobile]=useState(null);
  const [retro,setRetro]=useState(true);
  const [soundEnabled,setSoundEnabled]=useState(true);
  const soundRef=useRef(true);
  const [best,setBest]=useState(0);
  const [hud,setHud]=useState({speed:57,score:0,distance:0,time:0,combo:0,coins:0,hits:0,air:false,trick:""});
  const sound=useCallback(kind=>{if(soundRef.current)synthSfx(kind);},[]);
  const input=useRef({left:false,right:false,tuck:false,steerAnalog:0,touchTuck:false});
  const queue=useRef([]);
  const state=useRef(initialState());
  const collected=useRef(new Set());
  const lastPhase=useRef(phase);
  useEffect(()=>{lastPhase.current=phase;},[phase]);
  useEffect(()=>{
    const m=window.matchMedia("(max-width: 720px), (pointer: coarse)");
    const update=()=>setMobile(m.matches);update();m.addEventListener?.("change",update);
    try{setBest(Number(localStorage.getItem("pidgeonkitty-snow-64-best")||0));}catch{}
    return()=>m.removeEventListener?.("change",update);
  },[]);
  const start=useCallback(()=>{
    input.current.left=false;input.current.right=false;input.current.tuck=false;input.current.steerAnalog=0;input.current.touchTuck=false;
    queue.current.length=0;collected.current.clear();state.current=initialState();
    setHud(safeHud(state.current));setRunKey(k=>k+1);setPhase("playing");sound("start");
  },[sound]);
  const onFinish=useCallback(h=>{
    setHud(h);setPhase("finished");
    setBest(b=>{const v=Math.max(b,h.score);try{localStorage.setItem("pidgeonkitty-snow-64-best",String(v));}catch{}return v;});
  },[]);
  const pause=useCallback(()=>setPhase(p=>p==="playing"?"paused":p==="paused"?"playing":p),[]);
  const act=useCallback((command)=>{queue.current.push(command);},[]);
  useEffect(()=>{
    const down=e=>{
      const key=e.key.toLowerCase();
      const block=[" ","arrowleft","arrowright","arrowup","arrowdown"];
      if(block.includes(key))e.preventDefault();
      if(key==="a"||key==="arrowleft")input.current.left=true;
      if(key==="d"||key==="arrowright")input.current.right=true;
      if(key==="w"||key==="arrowup")input.current.tuck=true;
      if(e.repeat)return;
      if(e.code==="Space"){
        if(lastPhase.current==="ready"||lastPhase.current==="finished")start();
        else act({type:"jump",boost:e.shiftKey?1:0});
      }
      if(/^[0-9]$/.test(key) || key === "f")act({type:"trick",key});
      if(key==="c")act({type:"camera"});
      if(key==="p"||key==="escape")pause();
      if(key==="enter" && (lastPhase.current==="ready"||lastPhase.current==="finished"))start();
    };
    const up=e=>{
      const key=e.key.toLowerCase();
      if(key==="a"||key==="arrowleft")input.current.left=false;
      if(key==="d"||key==="arrowright")input.current.right=false;
      if(key==="w"||key==="arrowup")input.current.tuck=false;
    };
    const blur=()=>{input.current.left=false;input.current.right=false;input.current.tuck=false;input.current.steerAnalog=0;input.current.touchTuck=false;};
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",blur);
    return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",blur);};
  },[act,start,pause]);
  const currentBest=Math.max(best,hud.score);
  return <main onContextMenu={e=>{if(mobile)e.preventDefault();}} style={{position:"fixed",inset:0,overflow:"hidden",background:"#bedae7",color:"#ffffff",fontFamily:"Arial, Helvetica, sans-serif",touchAction:mobile?"none":"auto",overscrollBehavior:"none",userSelect:mobile?"none":"auto",WebkitUserSelect:mobile?"none":"auto"}}>
    <style>{`
      @keyframes snowboardPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
      @keyframes snowboardFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
      .snow64-panel{background:linear-gradient(130deg,#153b55ee,#0f2d46db);border:2px solid #c5eff4;border-radius:9px;box-shadow:3px 5px 0 #0e2a39bb;padding:8px 13px}
      .snow64-label{font-size:10px;font-weight:900;letter-spacing:.17em;color:#8feaf1}
      .snow64-number{font-weight:1000;font-style:italic;font-size:clamp(17px,2.6vw,30px);letter-spacing:.025em;text-shadow:2px 2px #193447}
      .snow64-trick{font-size:clamp(18px,3vw,40px);font-weight:1000;font-style:italic;color:#ffe581;text-shadow:3px 3px #194764;letter-spacing:.035em}
      .snow64-tool:active,.snow64-tool[aria-pressed=true]{background:#e57f8e!important;color:#102538!important;transform:translateY(3px);box-shadow:none!important}
      @media(max-width:680px){.snow64-label{font-size:8px}.snow64-panel{padding:5px 8px}.snow64-hud{gap:5px!important}.snow64-tricks button{font-size:9px!important;padding:8px 5px!important}}
    `}</style>
    <div style={{position:"absolute",inset:0,zIndex:0}}>
      {mobile!==null && <Canvas dpr={retro?[.75,mobile?1:1.12]:[1,mobile?1.25:1.7]} camera={{position:[-3,2.4,5.6],fov:42,near:.08,far:230}} gl={{antialias:!retro, powerPreference:"high-performance"}}>
        <Scene mobile={mobile} phase={phase} runKey={runKey} keyRef={input} queueRef={queue} stateRef={state} collectedRef={collected} onHud={setHud} onFinish={onFinish} onSound={sound}/>
      </Canvas>}
    </div>
    {/* Low-opacity scanlines and letterboxed arcade atmosphere, without intercepting controls. */}
    {retro&&<div aria-hidden="true" style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:1,opacity:.13,background:"repeating-linear-gradient(0deg,transparent 0px,transparent 3px,#002c3b 4px)"}}/>}
    <div style={{position:"absolute",left:0,right:0,top:0,zIndex:3,padding:"clamp(9px,2vw,22px)",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,pointerEvents:"none"}}>
      <div style={{display:"flex",flexDirection:"column",gap:5,filter:"drop-shadow(2px 3px #103348)"}}>
        <div style={{fontSize:10,fontWeight:900,letterSpacing:".24em",color:"#eefffc"}}>PIDGEONKITTY PRESENTS</div>
        <div style={{fontSize:"clamp(22px,4vw,47px)",fontWeight:1000,fontStyle:"italic",lineHeight:.95,letterSpacing:"-.02em",color:"#fdf3ce",textShadow:"3px 4px #245a6e"}}>SNOW <span style={{color:"#f796b6"}}>64</span></div>
        <div style={{fontSize:10,fontWeight:900,letterSpacing:".16em",color:"#cdfaff"}}>DOWNHILL FREESTYLE</div>
      </div>
      <div className="snow64-hud" style={{display:"flex",gap:8,alignItems:"stretch"}}>
        {[{label:"SPEED",value:hud.speed,unit:"KM/H"},{label:"TIME",value:formatTime(hud.time)},{label:"SCORE",value:hud.score.toLocaleString()}].map(v=><div key={v.label} className="snow64-panel" style={{minWidth:mobile?65:100,textAlign:"center"}}><div className="snow64-label">{v.label}</div><div className="snow64-number">{v.value}<span style={{fontSize:9,marginLeft:2}}>{v.unit}</span></div></div>)}
      </div>
    </div>
    {phase==="playing" && <div style={{position:"absolute",zIndex:3,top:mobile?92:116,left:"50%",transform:"translateX(-50%)",textAlign:"center",pointerEvents:"none"}}>
      {hud.trick&&<div className="snow64-trick" style={{animation:"snowboardFloat .5s ease-in-out infinite"}}>{hud.trick}</div>}
      {hud.air && <div style={{fontWeight:900,color:"#d7f8ff",textShadow:"2px 2px #285467",fontSize:12}}>AIR {hud.airHeight.toFixed(1)}m · PEAK {hud.peakAir.toFixed(1)}m</div>}
      {hud.recovery!=="riding" && <div style={{fontWeight:900,color:"#ffd89a",textShadow:"2px 2px #285467",fontSize:12}}> {hud.recovery==="chasing" ? "RUNNING BACK TO THE BOARD" : hud.recovery==="remounting" ? "REMOUNTING" : "RIDER DOWN"}</div>}
      {hud.combo>1&&<div style={{fontWeight:900,letterSpacing:".15em",color:"#f8ffff",textShadow:"2px 2px #285467"}}>COMBO ×{hud.combo}</div>}
    </div>}
    <div style={{position:"absolute",right:mobile?10:20,top:mobile?100:121,zIndex:3,pointerEvents:"none",textAlign:"right"}}>
      <div className="snow64-label" style={{color:"#22546c",textShadow:"1px 1px #e6f7ff"}}>COURSE PROGRESS</div>
      <div style={{width:mobile?90:155,height:10,border:"2px solid #23516a",background:"#d6f4ff99",borderRadius:9,overflow:"hidden"}}><div style={{height:"100%",width:`${clamp(hud.distance/1050*100,0,100)}%`,background:"#e995ae"}} /></div>
      <div style={{fontSize:11,color:"#1d506b",fontWeight:900}}>{hud.distance} / 1050 m</div>
    </div>
    {(phase==="ready"||phase==="paused"||phase==="finished")&&<div style={{position:"absolute",inset:0,zIndex:6,background:"linear-gradient(145deg,#092e4ab9,#163c58b0)",display:"grid",placeItems:"center",padding:16}}>
      <div style={{maxWidth:560,width:"min(100%,560px)",border:"3px solid #d9f4ff",borderRadius:14,padding:"clamp(20px,5vw,39px)",background:"linear-gradient(155deg,#123e5cf5,#142c4ff2)",boxShadow:"8px 10px 0 #123145aa",textAlign:"center"}}>
        <div style={{letterSpacing:".24em",fontSize:12,fontWeight:900,color:"#a8e7ed"}}>ARCADE FREESTYLE • WINTER CUP</div>
        <h1 style={{fontSize:"clamp(34px,7vw,70px)",fontStyle:"italic",fontWeight:1000,color:"#ffedb6",textShadow:"4px 5px #28586e",margin:"14px 0 8px",lineHeight:.94}}>PIDGEON KITTY<br/><span style={{color:"#f6a0bc"}}>SNOW 64</span></h1>
        <p style={{lineHeight:1.6,fontWeight:700,color:"#dbf3ff",fontSize:14,margin:"15px 0 23px"}}>{phase==="ready"?"Carve through alpine powder. Launch from ramps. Pull 1080 spins and wild grabs. Stick the landing and build a monster combo!":phase==="paused"?"Ride paused. Your snow is going nowhere.":`RUN COMPLETE! ${hud.score.toLocaleString()} points · ${hud.coins} tokens · ${hud.hits} wipeouts`}</p>
        {phase==="finished"&&<div style={{color:"#ffda75",fontSize:18,fontWeight:900,marginBottom:15}}>BEST: {currentBest.toLocaleString()} PTS</div>}
        <button type="button" className="snow64-tool" onClick={phase==="paused"?()=>setPhase("playing"):start} style={{...uiButton,color:"#1f3852",background:"#ffe395",borderColor:"#ffffff",fontSize:22,fontStyle:"italic",fontWeight:1000,padding:"14px 36px",animation:"snowboardPulse 1.7s ease-in-out infinite"}}>{phase==="ready"?"START RIDING ▶":phase==="paused"?"RESUME ▶":"RIDE AGAIN ↻"}</button>
        <p style={{fontSize:11,color:"#b3dbe9",lineHeight:1.7,margin:"22px 0 0"}}>{mobile ? <>LEFT THUMB: STEER / UP: TUCK<br/>RIGHT HALF: TAP TO JUMP, DRAW PATTERNS TO TRICK</> : <>A / D = CARVE &nbsp; • &nbsp; W = TUCK &nbsp; • &nbsp; SPACE = OLLIE · SHIFT+SPACE = POWER<br/>1–0 / F = TRICKS (F = FRONTFLIP) &nbsp; • &nbsp; C = CAMERA &nbsp; • &nbsp; P = PAUSE</>}</p>
      </div>
    </div>}
    {mobile && phase==="playing" ? <MobileTouchControls inputRef={input} act={act} phase={phase} runKey={runKey} /> : !mobile ? <>
    <div style={{position:"absolute",left:mobile?9:18,bottom:mobile?12:18,zIndex:4,display:"flex",gap:7,alignItems:"flex-end"}}>
      <HoldButton label="◀ CARVE" style={{padding:mobile?"13px 12px":"14px 20px"}} onDown={()=>input.current.left=true} onUp={()=>input.current.left=false}/>
      <HoldButton label="CARVE ▶" style={{padding:mobile?"13px 12px":"14px 20px"}} onDown={()=>input.current.right=true} onUp={()=>input.current.right=false}/>
      <HoldButton label="TUCK" style={{padding:mobile?"13px 9px":"14px 14px",color:"#ffe6a5"}} onDown={()=>input.current.tuck=true} onUp={()=>input.current.tuck=false}/>
    </div>
    <div style={{position:"absolute",right:mobile?8:18,bottom:mobile?10:18,zIndex:4,display:"flex",alignItems:"flex-end",gap:6}}>
      <button type="button" className="snow64-tool" onClick={()=>act({type:"jump"})} style={{...uiButton,padding:mobile?"22px 15px":"22px 25px",background:"#f2a0ae",color:"#102d46",fontSize:mobile?14:17,borderColor:"#fff8d0"}}>✦ JUMP</button>
    </div>
    <div className="snow64-tricks" style={{position:"absolute",right:mobile?8:18,bottom:mobile?82:98,zIndex:4,width:mobile?"min(270px,55vw)":440,display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:5}}>
      {TRICKS.map(t=><button key={t.key} type="button" className="snow64-tool" onClick={()=>act({type:"trick",key:t.key})} style={{...uiButton,padding:mobile?"7px 3px":"9px 3px",fontSize:mobile?9:10,background:"#254961cf",borderColor:"#84cbe3"}}>{t.name}</button>)}
    </div>
    </> : null}
    <div style={{position:"absolute",bottom:mobile?"auto":18,top:mobile?113:"auto",left:mobile?10:"50%",transform:mobile?"none":"translateX(-50%)",display:"flex",gap:5,zIndex:4}}>
      <button type="button" className="snow64-tool" onClick={pause} style={{...uiButton,padding:"8px 11px"}}>{phase==="paused"?"▶ RESUME":mobile?"Ⅱ":"Ⅱ PAUSE"}</button>
      <button type="button" className="snow64-tool" onClick={()=>act({type:"camera"})} style={{...uiButton,padding:"8px 11px"}}>{mobile?"◉ CAM":"◉ CAMERA"}</button>
      <button type="button" className="snow64-tool" onClick={()=>setRetro(x=>!x)} style={{...uiButton,padding:"8px 11px"}}>{retro?(mobile?"N64":"N64 PIXELS"):(mobile?"HD":"HD MODE")}</button>
      <button type="button" className="snow64-tool" onClick={()=>setSoundEnabled(on=>{soundRef.current=!on;return !on;})} style={{...uiButton,padding:"8px 11px"}}>{soundEnabled?(mobile?"♪ ON":"♪ SOUND ON"):(mobile?"♪ OFF":"♪ MUTED")}</button>
    </div>
    {phase==="playing" && <div style={{position:"absolute",bottom:mobile?176:57,left:mobile?10:24,zIndex:3,pointerEvents:"none",color:"#1a5268",fontSize:mobile?9:12,fontWeight:900,textShadow:"1px 1px #e9f8ff"}}>BEST {currentBest.toLocaleString()} &nbsp; ✦ {hud.coins} TOKENS</div>}
  </main>;
}

