"use client";

import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { classifySnowGesture } from "./snow64Gestures";
import { judgeSnowLanding, recoveryStage, recoveryDuration } from "./snow64Landing";
import { SNOW_GRAVITY, startSnowJump, stepSnowJump, rampTakeoffSpeed, crossedRampLip } from "./snow64Physics";
import { snowSurfaceAt, sweptRockHit, sweptRampSideHit, sweptAirRampContact } from "./snow64Collision";
import { recordSnowPoints, maybeSpawnSnowMushroom, mushroomCollision, activateSnowMushroom } from "./snow64Powerup";
import { SNOW_CHUNK_LENGTH, SNOW_INITIAL_SCORE, getSnowChunk, snowChunkIndex, snowDrainPerSecond, pruneSnowVisited } from "./snow64Endless";
import { enqueueAirTrick, beginNextAirTrick, advanceAirTricks, judgeAirTrickChain, resetAirTrickChain } from "./snow64TrickChain";
import { createCrashBoard, createCrashRider, stepCrashBoard, stepCrashRider, riderRecoveryGroundLift } from "./snow64CrashPhysics";
import { Snow64ModelProvider, useSnowModel, SnowGLBVisual, SnowGLBInstances } from "./snow64VisualModels";
import { SNOW64_MODEL_PATHS } from "./snow64ModelConfig";
import { SNOW64_TERRAIN } from "./snow64Appearance";
import { Snow64TextureProvider, useSnow64TerrainMaterials, useSnow64Texture } from "./snow64VisualMaterials";
import { Snow64ExplosionVFX } from "./snow64ExplosionVFX";
import { playSnow64Sound, playSnow64FrostMusic, unlockSnow64Audio, setSnow64AudioEnabled, updateSnow64AudioFrame, shutdownSnow64Audio } from "./snow64Audio";

// PidgeonKitty Snow 64. Original arcade game inspired by late-1990s N64 snowboarding.
// No Nintendo/N64 game assets are used. Scenery can optionally use custom GLBs from public/models/.
// Files inside public/ are loaded from the site root (without the /public prefix).
// Swap either image in public/images/ to update the brand without editing JSX.
const SNOW360_LOGO = "/images/Snow360Logo.png";
const SNOW360_LOGO_BACKGROUND = "/images/Snow360Logo-background.png";

const WEB_MODEL = SNOW64_MODEL_PATHS.riderDesktop;
const MOBILE_MODEL = SNOW64_MODEL_PATHS.riderMobile;
const SLOPE = 0.077;
const LANES = [-7.4, -3.8, 0, 3.8, 7.4];
const DEG = Math.PI / 180;
const TOKEN_POINTS = 360;
const RIDER_BINDING_HEIGHT = 0.33; // Keep feet just above the raised board bindings.
const FROST_HOVER_HEIGHT = 1.28; // Snowboard floats above actual snow/ramp surfaces.
const FROST_HOVER_BOB = 0.12;
const FROST_POST_SHIELD_SECONDS = 2; // Normal snowboarding, but collision-safe after Frost Shroom.
// V33: powered snowboarding gets its own visible left/right slalom movement.
// The old hover movement used the much weaker airborne steering limit (5).
const FROST_CARVE_AMPLITUDE = 4.45;
const FROST_CARVE_PERIOD = 2.95;
const FROST_CARVE_MAX_LATERAL_SPEED = 14.5;
// V34: lock onto reachable obstacles ahead, instead of nudging only toward
// rocks already close to the slalom line. Impact camera briefly stays with
// the actual explosion, so it remains visible at Frost speed.
const FROST_ROCK_LOOKAHEAD = 103;
const FROST_IMPACT_SHOT_SECONDS = .38;
// The original mushroom boost lasts 9 seconds (snow64Powerup.js).
const FROST_AUTO_TRICKS = ["6", "2", "5", "9", "7", "0", "3", "f", "8", "4"];
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

// Minimum peak height and airtime matter: huge tricks need a charged jump or a ramp.
const TRICKS = [
  { key: "1", name: "180", points: 160, duration: 0.42, minHeight: 1.15, spins: 180, pose: "SnowboardIndy" },
  { key: "2", name: "360", points: 360, duration: 0.57, minHeight: 1.85, spins: 360, pose: "SnowboardIndy" },
  { key: "3", name: "720", points: 800, duration: 0.86, minHeight: 3.2, requiresRamp: true, spins: 720, pose: "SnowboardIndy" },
  { key: "4", name: "1080", points: 1600, duration: 1.22, minHeight: 5.0, minLaunchSpeed: 34, requiresRamp: true, spins: 1080, pose: "SnowboardIndy" },
  { key: "5", name: "METHOD", points: 450, duration: 0.65, minHeight: 1.85, roll: -0.58, pitch: -0.24, pose: "SnowboardMethod" },
  { key: "6", name: "INDY GRAB", points: 400, duration: 0.55, minHeight: 1.52, roll: 0.25, pitch: 0.16, pose: "SnowboardIndy" },
  { key: "7", name: "BACKFLIP", points: 900, duration: 0.84, minHeight: 2.65, bigAir: true, flip: -360, pose: "SnowboardOllie" },
  { key: "8", name: "CORK 720", points: 1350, duration: 1.05, minHeight: 4.25, minLaunchSpeed: 32, requiresRamp: true, spins: 720, flip: -360, pose: "SnowboardMethod" },
  { key: "9", name: "TAIL GRAB", points: 510, duration: 0.64, minHeight: 1.87, roll: -0.18, pitch: 0.49, pose: "SnowboardTailgrab" },
  { key: "0", name: "NOSE GRAB", points: 520, duration: 0.64, minHeight: 1.87, roll: 0.16, pitch: -0.49, pose: "SnowboardNosegrab" },
  { key: "f", name: "FRONTFLIP", points: 960, duration: 0.88, minHeight: 2.8, bigAir: true, flip: 360, pose: "SnowboardFrontflip" },
];

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

function Terrain({index}) {
  const materials=useSnow64TerrainMaterials();
  const geometry = useMemo(() => {
    const verts = [], colors = [], uvs = [], centerIndices = [], bankIndices = [];
    const w = 34, stepsX = 34, stepsZ = 55;
    const c = new THREE.Color();
    for (let i = 0; i <= stepsZ; i++) {
      const z = 32 - index * SNOW_CHUNK_LENGTH - i * (SNOW_CHUNK_LENGTH / stepsZ);
      for (let j = 0; j <= stepsX; j++) {
        const x = -w + (j / stepsX) * w * 2;
        const y = groundY(x, z);
        verts.push(x, y, z);
        // World-space UVs continue seamlessly across endless terrain chunks.
        uvs.push(x / SNOW64_TERRAIN.textureTileMeters, -z / SNOW64_TERRAIN.textureTileMeters);
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
        const destination = Math.abs(-w+((j+.5)/stepsX)*w*2)<11 ? centerIndices : bankIndices;
        destination.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs,2));
    g.setIndex([...centerIndices,...bankIndices]);
    g.addGroup(0,centerIndices.length,0);
    g.addGroup(centerIndices.length,bankIndices.length,1);
    g.computeVertexNormals();
    return g;
  }, [index]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={materials} receiveShadow={false}/>;
}

function Forest({trees}) {
  const custom = useSnowModel("tree");
  // Instancing keeps the forest cheap on mobile for both built-in and GLB trees.
  const trunks=useRef(),bottoms=useRef(),tops=useRef(),caps=useRef();
  useEffect(()=>{
    if (custom) return;
    const matrices=[trunks.current,bottoms.current,tops.current,caps.current];
    const dims=[
      [0,.55,0], [0,1.08,0], [0,1.70,0], [0,2.13,0],
    ];
    const obj=new THREE.Object3D();
    trees.forEach((tree,i)=>{
      matrices.forEach((inst,j)=>{
        obj.position.set(tree.x,groundY(tree.x,tree.z)+dims[j][1]*tree.size,tree.z);
        obj.scale.setScalar(tree.size);obj.rotation.set(0,(i*1.37)%6.28,0);obj.updateMatrix();
        inst.setMatrixAt(i,obj.matrix);
      });
    });
    matrices.forEach(inst=>{inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();});
  },[trees,custom]);
  const n=trees.length;
  if (custom) return <SnowGLBInstances asset={custom} type="tree" items={trees}
    pose={(tree,i) => ({
      position:[tree.x,groundY(tree.x,tree.z),tree.z],
      rotation:[0,(i*1.37)%6.28,0],
      dimensions:[1.38*tree.size,2.42*tree.size,1.38*tree.size],
    })}/>;
  return <>
    <instancedMesh ref={trunks} args={[null,null,n]}><cylinderGeometry args={[.09,.15,1.1,5]}/><meshLambertMaterial color="#64506f"/></instancedMesh>
    <instancedMesh ref={bottoms} args={[null,null,n]}><coneGeometry args={[.69,1.85,6]}/><meshLambertMaterial color="#17646e" flatShading/></instancedMesh>
    <instancedMesh ref={tops} args={[null,null,n]}><coneGeometry args={[.5,1.35,6]}/><meshLambertMaterial color="#26868d" flatShading/></instancedMesh>
    <instancedMesh ref={caps} args={[null,null,n]}><coneGeometry args={[.17,.35,6]}/><meshLambertMaterial color="#e7fbfc" flatShading/></instancedMesh>
  </>;
}
/** Hide destroyed rocks immediately without React updates for each rock. */
function Rock({ id, x, z, size, stateRef }) {
  const custom=useSnowModel("rock");
  const mesh = useRef();
  useFrame(() => {
    if (mesh.current) mesh.current.visible = !stateRef.current.consumedRocks.has(id);
  });
  if (custom) return <group ref={mesh} position={[x,groundY(x,z),z]} rotation={[0,.8,0]}>
    <SnowGLBVisual asset={custom} type="rock" dimensions={[size*2,size*1.6,size*2.2]}/>
  </group>;
  return <mesh ref={mesh} position={[x, groundY(x, z) + size * 0.52, z]} rotation={[0.2, 0.8, 0.1]} scale={[size, size * 0.8, size * 1.1]}><dodecahedronGeometry args={[1, 0]} /><meshLambertMaterial color="#72879e" flatShading /></mesh>;
}

function Ramp({ x, z, index, height = 1.12, length = 3, superAir = false }) {
  const regularModel=useSnowModel("ramp");
  const superModel=useSnowModel("superRamp");
  const custom=(superAir && superModel) || regularModel;
  const type=superAir&&superModel ? "superRamp" : "ramp";
  const geom = useMemo(() => {
    const a = length / 2;
    // Full ramp profile follows the per-ramp physics, with the elevated lip
    // toward downhill (-Z). Super ramps are much taller, not just recolored.
    const v = [-2,0,a, 2,0,a, -2,height,-a, 2,height,-a, -2,0,-a, 2,0,-a];
    const id = [0,1,2, 1,3,2, 2,3,4, 3,5,4, 0,2,4, 1,5,3];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(v,3));
    g.setIndex(id);g.computeVertexNormals();return g;
  }, [height,length]);
  useEffect(() => () => geom.dispose(), [geom]);
  if (custom) return <group position={[x,groundY(x,z),z]}>
    <SnowGLBVisual asset={custom} type={type} dimensions={[4,height,length]}/>
  </group>;
  return (
    <group position={[x, groundY(x, z), z]}>
      <mesh geometry={geom}>
        <meshLambertMaterial color={superAir?"#d87ceb":index%2?"#f28695":"#f9b55a"}
          side={THREE.DoubleSide} flatShading />
      </mesh>
      <mesh position={[0,height+.055,-length/2]}>
        <boxGeometry args={[3.95,.11,.17]} /><meshBasicMaterial color={superAir?"#6cf5ff":"#fffbd5"}/>
      </mesh>
      <mesh position={[0,.45,length/2+.05]}>
        <boxGeometry args={[3.8,.08,.14]} /><meshBasicMaterial color="#fffcdf" />
      </mesh>
      {superAir && <>
        {[-1.9,1.9].map((side) =>
          <mesh key={side} position={[side,height*.55,0]} rotation={[Math.atan2(height,length),0,0]}>
            <boxGeometry args={[.09,.12,length+.3]}/>
            <meshBasicMaterial color="#7cfaff"/>
          </mesh>
        )}
        <mesh position={[0,height+1.55,-length/2]}>
          <torusGeometry args={[1.25,.10,6,24]}/>
          <meshBasicMaterial color="#ffdd70"/>
        </mesh>
      </>}
    </group>
  );
}

/** Original frost-spark mushroom collectible: violet cap, icy dots and teal aura. */
function FrostMushroom({stateRef}) {
  const custom=useSnowModel("frostShroom");
  const group=useRef();
  useFrame(({clock})=>{
    const g=group.current; if(!g)return;
    const item=stateRef.current.mushroom;
    g.visible=!!item;
    if(!item)return;
    g.position.set(item.x,groundY(item.x,item.z)+.92+Math.sin(clock.elapsedTime*3.5)*.20,item.z);
    g.rotation.y=clock.elapsedTime*1.4;
  });
  if (custom) return <group ref={group} visible={false} position={[0,-.30,0]}>
    <group position={[0,-.30,0]}><SnowGLBVisual asset={custom} type="frostShroom" dimensions={[1.8,1.65,1.8]}/></group>
  </group>;
  return <group ref={group} visible={false}>
    <mesh position={[0,.10,0]}><cylinderGeometry args={[.20,.28,.73,8]} /><meshLambertMaterial color="#fff9e5" /></mesh>
    <mesh position={[0,.50,0]} scale={[.68,.34,.63]}><sphereGeometry args={[1,12,8]} /><meshStandardMaterial color="#b955e5" emissive="#4e166b" emissiveIntensity={.6} roughness={.35} /></mesh>
    {[[.38,.63,.18],[-.32,.63,.13],[0,.81,0],[.16,.55,-.42],[-.25,.52,-.35]].map(([x,y,z],i)=><mesh key={i} position={[x,y,z]} scale={[.14,.055,.11]}><sphereGeometry args={[1,7,5]} /><meshBasicMaterial color="#9ffff4" /></mesh>)}
    <mesh position={[0,-.30,0]} rotation={[-Math.PI/2,0,0]}><torusGeometry args={[.64,.045,5,18]} /><meshBasicMaterial color="#7afde6" /></mesh>
    <mesh position={[0,.65,0]} scale={[.95,.62,.95]}><sphereGeometry args={[1,10,6]} /><meshBasicMaterial color="#ad54ff" transparent opacity={.12} depthWrite={false}/></mesh>
  </group>;
}

function Coin({ x, z, id, collectedRef }) {
  const custom=useSnowModel("token");
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.visible = !collectedRef.current.has(id);
    ref.current.rotation.y = clock.elapsedTime * 2.3;
    ref.current.position.y = groundY(x, z) + 1.3 + Math.sin(clock.elapsedTime * 4 + z) * .14;
  });
  if (custom) return <group ref={ref} position={[x,groundY(x,z)+1.3,z]}>
    <group position={[0,-.47,0]}><SnowGLBVisual asset={custom} type="token" dimensions={[.95,.94,.22]}/></group>
  </group>;
  return <group ref={ref} position={[x, groundY(x, z) + 1.3, z]}><mesh><torusGeometry args={[.38,.095,5,9]} /><meshBasicMaterial color="#ffdd67" /></mesh><mesh><octahedronGeometry args={[.13,0]} /><meshBasicMaterial color="#fff5bd" /></mesh></group>;
}
function CourseMarker({ z, side }) {
  const custom=useSnowModel("courseMarker");
  const x = side * 12.25;
  if (custom) return <group position={[x,groundY(x,z),z]}>
    <SnowGLBVisual asset={custom} type="courseMarker" dimensions={[2.0,4.6,.45]}/>
  </group>;
  return (
    <group position={[x, groundY(x,z), z]}>
      <mesh position={[0,2.3,0]}><cylinderGeometry args={[.06,.09,4.6,5]} /><meshLambertMaterial color="#d4f9ff" /></mesh>
      <mesh position={[side*.62,3.55,0]}><boxGeometry args={[1.25,.65,.08]} /><meshBasicMaterial color={side>0?"#ff77ab":"#f8bb66"} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}
const CourseChunk = memo(function CourseChunk({index, collectedRef, stateRef}) {
  const data = useMemo(() => getSnowChunk(index), [index]);
  const rockModel=useSnowModel("rock");
  const tokenModel=useSnowModel("token");
  return <>
    <Terrain index={index} />
    <Forest trees={data.trees} />
    {rockModel ? <SnowGLBInstances asset={rockModel} type="rock" items={data.rocks}
      hidden={r=>stateRef.current.consumedRocks.has(r.id)}
      pose={r=>({position:[r.x,groundY(r.x,r.z),r.z],rotation:[0,.8,0],
        dimensions:[r.size*2,r.size*1.6,r.size*2.2]})}/>
      : data.rocks.map(r=><Rock key={r.id} {...r} stateRef={stateRef} />)}
    {data.ramps.map(r=><Ramp key={r.id} {...r} />)}
    {tokenModel ? <SnowGLBInstances asset={tokenModel} type="token" items={data.coins}
      hidden={c=>collectedRef.current.has(c.id)} animated
      pose={(c,i,t)=>({position:[c.x,groundY(c.x,c.z)+.83+Math.sin(t*4+c.z)*.14,c.z],
        rotation:[0,t*2.3,0], dimensions:[.95,.94,.22]})}/>
      : data.coins.map(c=><Coin key={c.id} {...c} collectedRef={collectedRef} />)}
    {data.banners.map(c=><CourseMarker key={c.id} {...c} />)}
  </>;
});
function Course({ collectedRef, distance, stateRef }) {
  const center = snowChunkIndex(distance);
  const indexes = useMemo(() => Array.from({length:5},(_,i)=>center+i-1).filter(i=>i>=0),[center]);
  return <>{indexes.map(index=><CourseChunk key={index} index={index} collectedRef={collectedRef} stateRef={stateRef} />)}</>;
}

function Mountains({stateRef}) {
  const custom=useSnowModel("mountain");
  const group=useRef();
  useFrame(()=>{if(group.current){const z=stateRef.current.z;group.current.position.set(0,SLOPE*z,z);}});
  const positions = useMemo(() => {
    const random = rand(1998);
    return Array.from({length:25},(_,i)=>({x:(i-12)*17, z:-210-random()*130, height:28+random()*60, width:16+random()*20}));
  },[]);
  if (custom) return <group ref={group}>
    <SnowGLBInstances asset={custom} type="mountain" items={positions}
      pose={(p,i) => ({
        position:[p.x,groundY(p.x,p.z),p.z],rotation:[0,Math.PI/4,0],
        dimensions:[p.width,p.height,p.width],
      })}/>
  </group>;
  return <group ref={group}>
    {positions.map((p,i)=><mesh key={i} position={[p.x,groundY(p.x,p.z)+p.height*.46,p.z]} rotation={[0,Math.PI/4,0]}><coneGeometry args={[p.width,p.height,4]} /><meshLambertMaterial color={i%3===0?"#8ba7bd":"#b1c5d7"} flatShading /></mesh>)}
  </group>;
}

function BoardTrail({stateRef,mobile}) {
  // Fewer dynamic points and spawn calls on mobile; never tie particle updates to React state.
  const num=mobile?110:250;
  const ref=useRef(),next=useRef(0),spawnAccumulator=useRef(0);
  const sprayTexture=useSnow64Texture("snowSpray");
  const snow=useMemo(()=>Array.from({length:num},()=>({x:0,y:0,z:0,life:0,vx:0,vy:0,vz:0})),[num]);
  const coords=useMemo(()=>new Float32Array(num*3).fill(100000),[num]);
  useFrame((_,rawDt)=>{
    if(!ref.current)return;
    const dt=Math.min(rawDt,.05),s=stateRef.current;
    const moving=s.speed>4 && !s.inAir && !s.recovery && s.t>0;
    if(moving){
      const rate=clamp(22+s.speed*(mobile?1.35:2.8)+Math.abs(s.steer)*35,28,mobile?90:185);
      spawnAccumulator.current=Math.min(10,spawnAccumulator.current+rate*dt);
      let emit=Math.min(mobile?4:8,Math.floor(spawnAccumulator.current));
      spawnAccumulator.current-=emit;
      while(emit--){
        const i=next.current++%num,p=snow[i];
        const side=(i%2===0?-1:1),jitter=Math.sin(i*8.19+s.t*91.7);
        p.x=s.x+side*(.31+jitter*.07);
        p.y=groundY(s.x,s.z)+.12;
        p.z=s.z+.57;
        p.life=.30+Math.abs(jitter)*.34;
        p.vx=side*(.7+s.speed*.045+Math.abs(s.steer)*1.4)+jitter*.65;
        p.vy=.75+s.speed*.045+Math.abs(jitter)*1.8;
        p.vz=1.4+s.speed*.27;
      }
    }
    for(let i=0;i<num;i++){
      const p=snow[i];p.life-=dt;
      if(p.life>0){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=6.4*dt;p.z+=p.vz*dt;}
      coords[i*3]=p.life>0?p.x:100000;
      coords[i*3+1]=p.y;coords[i*3+2]=p.z;
    }
    ref.current.geometry.attributes.position.needsUpdate=true;
  });
  return <points ref={ref} frustumCulled={false}>
    <bufferGeometry><bufferAttribute attach="attributes-position" array={coords} count={num} itemSize={3}/></bufferGeometry>
    <pointsMaterial color="#faffff" map={sprayTexture} alphaTest={sprayTexture ? .08 : 0} size={.18} transparent opacity={.86} depthWrite={false} sizeAttenuation/>
  </points>;
}

function Snowfall({ stateRef,mobile }) {
  const count=mobile?80:180;
  const flakeTexture=useSnow64Texture("snowflake");
  const data=useMemo(()=>{
    const r=rand(64); return Array.from({length:count},()=>({x:(r()-.5)*34,z:(r()-.5)*44,y:r()*15,speed:2+r()*4}));
  },[count]);
  const points=useRef();
  const coords=useMemo(()=>new Float32Array(count*3),[count]);
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
    <pointsMaterial color="#ffffff" map={flakeTexture} alphaTest={flakeTexture ? .04 : 0} size={.13} transparent opacity={.85} depthWrite={false} sizeAttenuation />
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
  const custom=useSnowModel("snowboard");
  const geom=useMemo(buildBoardGeometry,[]);
  useEffect(()=>()=>geom.dispose(),[geom]);
  if (custom) return <group position={[0,.045,0]}>
    <SnowGLBVisual asset={custom} type="snowboard" dimensions={[.74,.25,2.43]}/>
  </group>;
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

function initialState(cameraMode = 0) {
  return {
    x:0,z:0,air:0,worldY:0,vy:0,speed:15.8,velX:0,steer:0,t:0,launchSource:"none",launchSpeed:0,
    inAir:false, impact:0, jumpCooldown:0, fakie:false,
    peakAir:0, flightTime:0, recovery:null,
    combo:0, score:SNOW_INITIAL_SCORE, peakScore:SNOW_INITIAL_SCORE, drainRate:snowDrainPerSecond(0), coins:0, hits:0, lastText:"", textUntil:0,
    trick:null, airQueue:[], completedAirTricks:[], airYaw:0, airPitch:0,
    trickNonce:0, trickSequence:0, spamPressure:0, currentPose:"SnowboardIdle", cameraMode,
    armedTrick:null, // Gesture drawn shortly before takeoff, activated on the next jump/ramp.
    launchSuper:false,
    mushroom:null, mushroomTime:0, mushroomCooldownTime:-200, mushroomCooldownDistance:-1000,
    mushroomCount:0, powerTime:0, powerAutoJumpDelay:0, powerTricksScheduled:false,
    frostHover:false, frostAutoIndex:0, frostPaidTricks:0, frostCollisionGrace:0,
    frostCarveStart:0, frostCarveCenter:0, frostCarveDirection:1, frostRockTargetId:null,
    scoreGainEvents:[],
    rockExplosions:[], rockShattered:0,
    consumedRamps:new Set(),consumedRocks:new Set(),hitRocks:new Set(),
  };
}
function safeHud(s) {
  return {
    speed:Math.round(s.speed*3.6),
    score:Math.ceil(Math.max(0,s.score)), peakScore:Math.floor(s.peakScore), drainRate:Math.round(s.drainRate*10)/10, distance:Math.max(0,Math.floor(-s.z)), time:s.t,
    combo:s.combo, coins:s.coins, hits:s.hits,
    powerRemaining:s.powerTime, shieldRemaining:s.frostCollisionGrace, mushroomReady:!!s.mushroom, rockShattered:s.rockShattered,
    air:s.inAir, airHeight:s.air, peakAir:s.peakAir, pose:s.currentPose,
    recovery:recoveryStage(s.recovery),
    trick:s.recovery ? (s.textUntil>s.t ? s.lastText : (recoveryStage(s.recovery)==="chasing" ? "RUN FOR YOUR BOARD!" : "GETTING UP..."))
      : (s.inAir && (s.completedAirTricks.length || s.trick || s.airQueue.length))
      ? `AIR COMBO ×${s.completedAirTricks.length + (s.trick?1:0)}  ${s.trick?.name||"READY"}${s.airQueue.length?`  +${s.airQueue.length} QUEUED`:""}`
      : (s.textUntil>s.t ? s.lastText : ""),
  };
}
function smoothstep(t) { const v=clamp(t,0,1);return v*v*(3-2*v); }

// V23: approach the *side* of a fallen board, hop onto its bindings, and push
// away. Rendered rider and separate board share the same positions/timeline.
// Keeping this independent of React and Three.js also makes it easy to test.
function snowRemountMotion(rec, rider, board, returnTo) {
  const fallEnd=rec.kind === "wipeout" ? .95 : .72;
  const chaseEnd=fallEnd+(rec.kind === "wipeout" ? 1.62 : 1.25);
  const stage=rec.t < fallEnd ? "falling" : rec.t < chaseEnd ? "chasing" : "remounting";
  const mountP=clamp((rec.t-chaseEnd)/Math.max(.35,rec.duration-chaseEnd),0,1);
  const chaseP=smoothstep((rec.t-fallEnd)/(chaseEnd-fallEnd));
  const dx=board.x-rider.x, dz=board.z-rider.z;
  const distance=Math.hypot(dx,dz);
  const directionX=distance>.10 ? dx/distance : 0;
  const directionZ=distance>.10 ? dz/distance : -1;
  // Body and the animated paws have space to stop before touching the deck.
  const standOff=1.82;
  const approachX=board.x-directionX*standOff;
  const approachZ=board.z-directionZ*standOff;
  // Anticipate the hop, travel over the edge, land, then kick off.
  const hopP=smoothstep((mountP-.10)/.37);
  const kickP=smoothstep((mountP-.71)/.29);
  // The loose board may have spun several complete revolutions in the crash.
  // Turn along the SHORTEST yaw arc during the hop, not during the kick-off.
  // The deck and rider face downhill before the paws touch the bindings.
  const turnP=smoothstep((mountP-.11)/.36);
  const looseYaw=Number.isFinite(board.yaw)?board.yaw:0;
  const shortestTurn=Math.atan2(Math.sin(-looseYaw),Math.cos(-looseYaw));
  const boardYaw=looseYaw+shortestTurn*turnP;
  const arc=mountP >= .10 && mountP <= .47 ? Math.sin(Math.PI*hopP)*.83 : 0;
  const landingDip=mountP>.47 && mountP<.65 ? -.09*Math.sin(Math.PI*(mountP-.47)/.18) : 0;
  const kickBounce=mountP>.71 ? .10*Math.sin(Math.PI*kickP) : 0;
  const riderX=stage==="falling" ? rider.x : stage==="chasing" ? lerp(rider.x,approachX,chaseP)
    : lerp(lerp(approachX,board.x,hopP),returnTo.x,kickP);
  const riderZ=stage==="falling" ? rider.z : stage==="chasing" ? lerp(rider.z,approachZ,chaseP)
    : lerp(lerp(approachZ,board.z,hopP),returnTo.z,kickP);
  return {
    stage, fallEnd, chaseEnd, chaseP, mountP, hopP, kickP, turnP, boardYaw,
    x:riderX, z:riderZ, arc:arc+landingDip+kickBounce,
    boardX:lerp(board.x,returnTo.x,kickP),boardZ:lerp(board.z,returnTo.z,kickP),
    // Face the stationary board during approach, then point downhill to push.
    approachDX:directionX, approachDZ:directionZ,
  };
}

/**
 * V32: randomized Frost Shroom camera cuts between cinematic categories.
 * +Z is BEHIND the rider; -Z is the downhill travel direction. We retain low
 * front/side snowboard angles for tricks, but intentionally include rear chase
 * angles to show forward speed and rear-quarter views for shattering rocks.
 * Every preset follows the snowboard's WORLD position, never its spinning yaw.
 * Only the first 1.15s and last 3s blend. Mid-boost changes are REAL cuts.
 */
const FROST_CAMERA_INTRO_SECONDS = 1.15;
const FROST_CAMERA_RETURN_SECONDS = 3;
const FROST_CAMERA_SHOTS = [
  // Trick details: low front/side angles with both bindings visible.
  {kind:"trick",yaw:2.10,elevation:.15,radius:4.65,lookHeight:.38},
  {kind:"trick",yaw:4.17,elevation:.16,radius:4.80,lookHeight:.38},
  {kind:"trick",yaw:1.85,elevation:.12,radius:4.90,lookHeight:.35},
  {kind:"trick",yaw:4.43,elevation:.14,radius:4.90,lookHeight:.37},
  {kind:"trick",yaw:2.76,elevation:.23,radius:4.70,lookHeight:.48},
  {kind:"trick",yaw:3.20,elevation:.18,radius:4.60,lookHeight:.44},
  {kind:"trick",yaw:3.68,elevation:.22,radius:4.75,lookHeight:.48},
  // Speed: chase from behind the board and look DOWNHILL to show the course.
  {kind:"speed",yaw:-.24,elevation:.20,radius:7.30,lookHeight:.63},
  {kind:"speed",yaw:.32,elevation:.17,radius:7.55,lookHeight:.61},
  {kind:"speed",yaw:0,elevation:.26,radius:8.05,lookHeight:.72},
  // Impacts: rear-quarter side shots reveal rock explosions and ice debris.
  {kind:"shatter",yaw:.91,elevation:.17,radius:6.50,lookHeight:.57},
  {kind:"shatter",yaw:5.38,elevation:.19,radius:6.55,lookHeight:.60},
  {kind:"shatter",yaw:1.30,elevation:.15,radius:6.25,lookHeight:.54},
  {kind:"shatter",yaw:4.96,elevation:.16,radius:6.35,lookHeight:.56},
];

/** Smooth C2 easing for the first shot and the 3-second return only. */
function frostCameraEase(t){
  const x=clamp(t,0,1);
  return x*x*x*(x*(x*6-15)+10);
}

/**
 * Weighted, nonrepeating shot selection. An actual rock shatter wins priority;
 * otherwise pick speed or trick angles, with occasional impact previews when
 * a rock is ahead. Avoid two shots of the same kind when alternatives exist.
 */
function nextFrostCameraShot(previousIndex, random=Math.random, options={}){
  const prev=FROST_CAMERA_SHOTS[previousIndex];
  const r=()=>clamp(random(),0,.999999);
  let kind;
  if(options.impact) kind="shatter";
  else if(options.forceSpeed) kind="speed";
  else {
    const roll=r();
    if(options.rockAhead && roll<.22)kind="shatter";
    else kind=roll<(options.rockAhead?.58:.42)?"speed":"trick";
    if(prev?.kind===kind && r()<.64){
      // Variety without forced round-robin: consecutive shots can still match.
      kind=kind==="speed"?"trick":"speed";
    }
  }
  let candidates=FROST_CAMERA_SHOTS.map((shot,index)=>({shot,index}))
    .filter(item=>item.shot.kind===kind && item.index!==previousIndex);
  if(!candidates.length)candidates=FROST_CAMERA_SHOTS.map((shot,index)=>({shot,index}))
    .filter(item=>item.index!==previousIndex);
  return candidates[Math.floor(r()*candidates.length)];
}

/** Check only nearby geometry, not the entire procedural endless course. */
function frostRockCameraTarget(s,localChunks){
  const last=s.rockExplosions?.[s.rockExplosions.length-1];
  if(last && s.t-last.at<.34 && Math.hypot(last.x-s.x,last.z-s.z)<15)
    return {x:last.x,z:last.z,age:s.t-last.at,explosion:true};
  let closest=null,dist=Infinity;
  for(const chunk of localChunks){
    for(const rock of chunk.rocks){
      if(s.consumedRocks.has(rock.id))continue;
      const ahead=s.z-rock.z;
      if(ahead>2 && ahead<20 && Math.abs(rock.x-s.x)<4.2 && ahead<dist){
        closest={x:rock.x,z:rock.z,age:0,explosion:false};dist=ahead;
      }
    }
  }
  return closest;
}

/** A rock close-up must never run during the soft entry or 3s return. */
function cinematicPhaseAvailable(s,director,frostActive){
  if(!frostActive || !director.actionFocus)return null;
  return s.t-director.startAt>=FROST_CAMERA_INTRO_SECONDS &&
    s.powerTime>FROST_CAMERA_RETURN_SECONDS ? director.actionFocus : null;
}

/** Shortest angular path prevents an orbit from doing an unwanted extra spin. */
function approachAngle(a,b,weight) {
  return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*weight;
}

function beginSnowRecovery(s, kind, reason, onSound, impact = null) {
  // During the 2-second post-Frost shield, block environmental crashes only.
  // A genuinely failed normal trick still follows the standard landing rules.
  const environmental = reason.startsWith("ROCK") || reason.startsWith("RAMP");
  if (s.recovery || s.powerTime > 0 || s.frostHover || (environmental && s.frostCollisionGrace > 0)) return;
  const penalty = (kind === "wipeout" ? 650 : 220) + Math.min(600, s.combo * 120);
  s.score = Math.max(0,s.score - penalty);
  s.combo = 0;
  s.hits += 1;
  // Sample a fresh impact trajectory before slowing momentum. Rock/ramp
  // contact normals bias the kick, while randomness changes the side, spin,
  // throw length and how far the rider slides on every wipeout.
  const looseBoard = createCrashBoard(s, kind, Math.random, impact);
  const fallenRider = createCrashRider(s, looseBoard, kind, Math.random, impact);
  s.recovery = {kind, t:0, duration:recoveryDuration(kind)+1.06, board:looseBoard, rider:fallenRider, hopLanded:false, pushedOff:false};
  s.powerAutoJumpDelay=2.0;
  s.lastText = `${reason}  −${penalty} PTS`;
  s.textUntil = s.t + 1.85;
  s.inAir = false;
  s.vy = 0;
  s.air = 0;
  s.worldY = groundY(s.x, s.z);
  s.armedTrick = null;
  s.launchSource = "none";
  resetAirTrickChain(s);
  s.impact = 0;
  s.speed = Math.min(8, s.speed * .34);
  s.steer = 0;
  s.fakie = false;
  // Different impact materials get different sound signatures.
  onSound(reason.startsWith("ROCK") ? "rockHit" : reason.startsWith("RAMP") ? "rampHit" : "crash");
}


/** Frost hover is intentionally NOT a ballistic jump: no unsafe landing checks.
 * We still flag inAir so the embedded grab/spin/flip clips play continuously.
 */
function beginFrostHover(s, supportHeight) {
  if (s.frostHover) return;
  s.frostHover = true;
  s.frostCollisionGrace = 0;
  s.recovery = null;
  s.inAir = true;
  s.worldY = Math.max(s.worldY, supportHeight + FROST_HOVER_HEIGHT);
  s.air = Math.max(FROST_HOVER_HEIGHT, s.worldY - supportHeight);
  s.peakAir = s.air;
  s.vy = 0;
  s.flightTime = 0;
  s.launchSource = "power";
  s.launchSpeed = Math.max(s.speed, 55);
  s.launchSuper = true;
  s.jumpCooldown = 0;
  s.impact = 0;
  s.armedTrick = null;
  s.frostAutoIndex = 0;
  s.frostPaidTricks = 0;
  // Keep the first turn continuous with the rider's current course position.
  // Outside edges begin by turning toward the center of the mountain.
  s.frostRockTargetId = null;
  s.frostCarveStart = s.t;
  s.frostCarveCenter = clamp(s.x, -4, 4);
  s.frostCarveDirection = s.x > 5 ? -1 : s.x < -5 ? 1 : (Math.random() < .5 ? -1 : 1);
  resetAirTrickChain(s);
}

function finishFrostHover(s, supportHeight) {
  if (!s.frostHover) return;
  s.frostHover = false;
  s.frostCollisionGrace = FROST_POST_SHIELD_SECONDS;
  s.inAir = false;
  s.worldY = supportHeight;
  s.air = 0;
  s.vy = 0;
  s.flightTime = 0;
  s.launchSource = "none";
  s.launchSuper = false;
  s.fakie = false;
  // Hand control back gracefully instead of carrying a full-powered sideways
  // slalom velocity into the 2-second normal-riding collision shield.
  s.velX = clamp(s.velX, -4.0, 4.0);
  s.steer = clamp(s.steer, -.42, .42);
  s.jumpCooldown = .48; // Prevent a landing-frame ramp hit.
  s.impact = .3;
  s.frostPaidTricks = 0;
  s.frostRockTargetId = null;
  resetAirTrickChain(s);
  s.lastText = "FROST SHIELD • 2s SAFE LANDING";
  s.textUntil = s.t + 1.1;
}

/**
 * V34: choose a *reachable* live rock in front of the rider, including rocks
 * outside the current carving lane. Keep the same rock locked until impact or
 * passing it; continuously changing targets causes straight-line steering.
 * Scans only the three existing nearby chunks, and allocates no geometry.
 */
function frostRockToChase(s, chunks) {
  let locked=null, candidate=null, best=Infinity;
  const forwardSpeed=Math.max(32,s.speed);
  for(const chunk of chunks) for(const rock of chunk.rocks){
    if(s.consumedRocks.has(rock.id))continue;
    const ahead=s.z-rock.z;
    if(ahead < -2 || ahead > FROST_ROCK_LOOKAHEAD)continue;
    if(rock.id===s.frostRockTargetId){locked=rock;continue;}
    const sideways=Math.abs(rock.x-s.x);
    // Do not chase an impossible last-moment target: an early decision is
    // crucial at 60 units/s. Crossing sideways takes time even with a boost.
    const flightSeconds=ahead/forwardSpeed;
    if(ahead<11 || sideways>Math.max(1.7,(flightSeconds-.10)*12.7))continue;
    const rating=ahead+sideways*2.4;
    if(rating<best){best=rating;candidate=rock;}
  }
  if(locked){
    const ahead=s.z-locked.z;
    // Release a missed rock at its trailing edge, so another can be acquired.
    if(ahead> -1.4)return locked;
  }
  s.frostRockTargetId=candidate?.id||null;
  return candidate;
}

/**
 * Slalom when the course is clear, purposeful turns toward reachable rocks.
 * The approach estimates time to contact, so the character reaches the target
 * before passing it at very high speed. Just before impact the oscillation is
 * reduced for a reliable shatter, then carving resumes toward the next rock.
 * Player touch/keyboard steering still overrides this automatic steering.
 */
function frostAutoCarveVelocity(s,chunks){
  const age=Math.max(0,s.t-(s.frostCarveStart??s.t));
  const omega=2*Math.PI/FROST_CARVE_PERIOD;
  const phase=age*omega;
  const dir=s.frostCarveDirection||1;
  const fade=smoothstep(age/.70);
  const center=s.frostCarveCenter??clamp(s.x,-4,4);
  const waveX=center+dir*FROST_CARVE_AMPLITUDE*Math.sin(phase)*fade;
  const waveSpeed=dir*FROST_CARVE_AMPLITUDE*omega*Math.cos(phase)*fade;
  const target=frostRockToChase(s,chunks);
  if(target){
    const ahead=Math.max(0,s.z-target.z);
    const untilImpact=Math.max(.14,(ahead-1.0)/Math.max(s.speed,25));
    // Plenty of slalom early in the approach, accurate alignment at contact.
    const weaveStrength=smoothstep((ahead-13)/45);
    const arrivalX=target.x+Math.sin(phase)*1.15*weaveStrength;
    const requested=(arrivalX-s.x)*1.13/untilImpact+waveSpeed*.19*weaveStrength;
    return clamp(requested,-FROST_CARVE_MAX_LATERAL_SPEED,FROST_CARVE_MAX_LATERAL_SPEED);
  }
  return clamp((clamp(waveX,-9,9)-s.x)*2.9+waveSpeed*.95,
    -FROST_CARVE_MAX_LATERAL_SPEED,FROST_CARVE_MAX_LATERAL_SPEED);
}

/** Pure horizontal swept test for magical impacts. Ignoring jump height ensures
 * obstacles physically along the power-up path explode instead of being missed.
 * It MUST only be called in the powered branch, never for ordinary collisions.
 */
function frostPathHit(from, to, obstacle, radius) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9
    ? clamp(((obstacle.x - from.x) * dx + (obstacle.z - from.z) * dz) / len2, 0, 1)
    : 0;
  return Math.hypot(from.x + dx * t - obstacle.x, from.z + dz * t - obstacle.z) <= radius;
}

function activateArmedTrick(s) {
  const armed = s.armedTrick;
  s.armedTrick = null;
  if (armed && s.inAir && s.t <= armed.until) {
    enqueueAirTrick(s, armed.trick);
    beginNextAirTrick(s);
  }
}

function Rider({ mobile, phase, runKey, keyRef, queueRef, stateRef, collectedRef, cameraOrbitRef, onHud, onFinish, onSound }) {
  const {scene, animations}=useGLTF(mobile?MOBILE_MODEL:WEB_MODEL);
  const character=useMemo(()=>cloneSkinned(scene),[scene]);
  const mixer=useMemo(()=>new THREE.AnimationMixer(character),[character]);
  const actions=useMemo(()=>Object.fromEntries(animations.map(a=>[a.name,mixer.clipAction(a)])),[animations,mixer]);
  const riderBones=useMemo(()=>{
    const bones=[];
    character.traverse(o=>{if(o.isBone)bones.push(o);});
    return bones;
  },[character]);
  const boneWorld=useMemo(()=>new THREE.Vector3(),[]);
  const root=useRef(), stance=useRef(), board=useRef(), crashBoard=useRef(), kickSnow=useRef(), riderCarrier=useRef(), riderModel=useRef(), hoverRing=useRef();
  const active=useRef(null),frame=useRef(0),cameraReady=useRef(false),crashCameraBlend=useRef(0),phaseRef=useRef(phase);
  const frostCamera=useRef({active:false,index:-1,nextAt:0,startAt:0,yaw:0,elevation:0,radius:0,lookHeight:.55,shot:null,exitYaw:null,exitTarget:null,lastBoard:null,lastShatterCount:0,lastCutAt:-99,speedShots:0,focusRock:null,actionFocus:null});
  const frostBoardAnchor=useMemo(()=>new THREE.Vector3(),[]);
  const nearby=useRef({index:-1,chunks:[]});
  const {camera}=useThree();
  useEffect(()=>{phaseRef.current=phase;},[phase]);
  useEffect(()=>{
    stateRef.current=initialState(mobile ? 1 : 0); collectedRef.current.clear(); queueRef.current.length=0;
    frame.current=0;cameraReady.current=false;crashCameraBlend.current=0;
    frostCamera.current={active:false,index:-1,nextAt:0,startAt:0,yaw:0,elevation:0,radius:0,lookHeight:.55,shot:null,exitYaw:null,exitTarget:null,lastBoard:null,lastShatterCount:0,lastCutAt:-99,speedShots:0,focusRock:null,actionFocus:null};
    nearby.current={index:-1,chunks:[]};
    delete camera.userData._look;
    mixer.stopAllAction();active.current=null;
    if (root.current) root.current.position.set(0,.1,0);
    if (crashBoard.current) crashBoard.current.visible=false;
  },[runKey,stateRef,collectedRef,queueRef,camera]);
  useEffect(()=>()=>mixer.stopAllAction(),[mixer]);

  useFrame((_, rawDt)=>{
    const dt=Math.min(rawDt,0.043),s=stateRef.current;
    const chunkIndex=snowChunkIndex(-s.z);
    if (nearby.current.index!==chunkIndex) {
      nearby.current={index:chunkIndex,chunks:[chunkIndex-1,chunkIndex,chunkIndex+1].filter(i=>i>=0).map(getSnowChunk)};
      pruneSnowVisited(s.consumedRamps,chunkIndex);
      pruneSnowVisited(s.consumedRocks,chunkIndex);
      pruneSnowVisited(s.hitRocks,chunkIndex);
      pruneSnowVisited(collectedRef.current,chunkIndex);
    }
    const localChunks=nearby.current.chunks;
    const playing=phaseRef.current==="playing";
    const left=keyRef.current.left?1:0,right=keyRef.current.right?1:0;
    const tuck=(keyRef.current.tuck || keyRef.current.touchTuck) && playing;
    let steerWanted=playing?clamp(right-left+(keyRef.current.steerAnalog||0),-1,1):0;
    let frostDesiredVelX=null;
    if(playing && s.frostHover && s.powerTime>0 && !s.recovery){
      // Auto-slalom is actually MOVEMENT, not just a subtle animation tilt.
      // A player steering deliberately can still override it at any time.
      frostDesiredVelX=Math.abs(steerWanted)>.18
        ? steerWanted * 13.2
        : frostAutoCarveVelocity(s,localChunks);
      steerWanted=clamp(frostDesiredVelX/13.2,-1,1);
    }
    s.steer=lerp(s.steer,steerWanted,Math.min(1,dt*(frostDesiredVelX!==null?9:6)));
    const queue=queueRef.current.splice(0);
    for (const command of queue) {
      if (command.type === "camera") s.cameraMode = (s.cameraMode + 1) % 3;
      if (!playing || s.recovery) continue;
      if (command.type === "jump" && !s.inAir && !s.frostHover && s.jumpCooldown <= 0) {
        const boost=clamp(command.boost || 0,0,1);
        startSnowJump(s,snowSurfaceAt(s.x,s.z,localChunks,groundY).height,{velocity:7.9+(tuck?.8:0)+4.0*boost,source:"ollie"});
        resetAirTrickChain(s);
        activateArmedTrick(s);
        s.lastText = s.trick ? `${s.trick.name} TAKEOFF!` : boost>.6 ? "CHARGED OLLIE!" : "OLLIE!";
        s.textUntil = s.t + .9;
        onSound("ollie");
      }
      if (command.type === "trick") {
        const found=TRICKS.find(q=>q.key===command.key);
        const trick=found ? {...found,spins:found.spins&&command.direction===-1?-found.spins:found.spins} : null;
        if(trick && !s.inAir){
          // Ground drawings never silently become an Ollie. Buffer one trick
          // for 1.5 seconds so a swipe made just before a ramp starts on launch.
          s.armedTrick={trick,until:s.t+1.5};
          s.lastText=`${trick.name} READY • HIT THE RAMP OR TAP OLLIE`;
          s.textUntil=s.t+1.25;
        }
        if(trick && s.inAir){
          // Never ignore spam: queue up to 12 tricks and consume them immediately
          // when each animation duration finishes, including repeated identical clips.
          enqueueAirTrick(s,trick);
          beginNextAirTrick(s);
          onSound("trickStart");
          s.lastText=`${trick.name} QUEUED • ${s.completedAirTricks.length+(s.trick?1:0)+s.airQueue.length} TRICKS`;
          s.textUntil=s.t+1.1;
        }
      }
    }

    if (playing) {
      s.t += dt;
      // Endless survival timer: drains every frame, even while chasing a lost board.
      s.drainRate=snowDrainPerSecond(Math.max(0,-s.z));
      s.score=Math.max(0,s.score-s.drainRate*dt);
      // Arcade warning when the score has under ~5 seconds of runway.
      if(s.score>0 && s.score<s.drainRate*5 && (!s.lastDangerAt||s.t-s.lastDangerAt>2.7)){
        s.lastDangerAt=s.t;onSound("danger");
      }
      // Only counts down while actually playing. Boost expiry refreshes the
      // shield to the full two seconds on its first normal-riding frame.
      s.frostCollisionGrace=Math.max(0,s.frostCollisionGrace-dt);
      s.powerTime=Math.max(0,s.powerTime-dt);
      if (s.powerTime <= 0 && s.frostHover) {
        finishFrostHover(s, snowSurfaceAt(s.x,s.z,localChunks,groundY).height);
        onSound("powerEnd");
      }
      s.powerAutoJumpDelay=Math.max(0,s.powerAutoJumpDelay-dt);
      if(s.mushroom && s.z < s.mushroom.z - 8) s.mushroom=null;
      s.jumpCooldown = Math.max(0, s.jumpCooldown - dt);
      s.impact = Math.max(0, s.impact - dt);
      if (s.recovery) {
        // The board slides just ahead while the rider falls, runs after it and remounts.
        s.recovery.t += dt;
        const recoveryPhase=recoveryStage(s.recovery);
        if(recoveryPhase==="chasing"){
          const footstep=Math.floor(s.recovery.t*3.8);
          if(s.recovery.footstep!==footstep){s.recovery.footstep=footstep;onSound("step");}
        }
        if(recoveryPhase==="remounting"){
          const rec=s.recovery;
          const fallEnd=rec.kind==="wipeout"?.95:.72;
          const chaseEnd=fallEnd+(rec.kind==="wipeout"?1.62:1.25);
          const mountP=clamp((rec.t-chaseEnd)/Math.max(.35,rec.duration-chaseEnd),0,1);
          if(!rec.hopLanded && mountP>=.49){rec.hopLanded=true;onSound("remount");}
          if(!rec.pushedOff && mountP>=.76){rec.pushedOff=true;onSound("step");}
        }
        // Simulate two small crash bodies, not a full ragdoll solver. Rock
        // ricochets, snow contacts and variable distance are calculated only
        // during recovery so normal mobile gameplay stays lightweight.
        const crashGround=(x,z)=>snowSurfaceAt(x,z,localChunks,groundY).height;
        const crashRocks=localChunks.flatMap(chunk=>chunk.rocks).filter(rock=>
          Math.abs(rock.z-s.z)<17 && Math.abs(rock.x-s.x)<16);
        if (s.recovery.board) {
          const bouncesBefore=s.recovery.board.bounces;
          stepCrashBoard(s.recovery.board,dt,crashGround,crashRocks);
          if(s.recovery.board.bounces>bouncesBefore)onSound("boardBounce");
        }
        if (s.recovery.rider && recoveryStage(s.recovery)==="falling") {
          stepCrashRider(s.recovery.rider,dt,crashGround,crashRocks);
        }
        s.speed = lerp(s.speed, 1.35, Math.min(1, dt * 2.2));
        s.z -= s.speed * dt;
        s.velX = 0;
        // Keep recovery ground contact current as the snow slope descends.
        s.worldY = snowSurfaceAt(s.x,s.z,localChunks,groundY).height;
        if (s.recovery.t >= s.recovery.duration) {
          s.recovery = null;
          s.speed = 15.5; // Momentum from the animated push-off.
          s.jumpCooldown = .45;
          s.lastText = "HOP ON • PUSH OFF!";
          s.textUntil = s.t + 1.1;
        }
      } else {
        if (s.powerTime > 0 && !s.frostHover) {
          beginFrostHover(s, snowSurfaceAt(s.x,s.z,localChunks,groundY).height);
        }
        const targetSpeed = (s.powerTime>0 ? (mobile?57:60) : tuck ? (mobile ? 42 : 38) : 21.5) - Math.abs(s.steer) * 2.6;
        // Higher acceleration, same controllable carving range.
        s.speed = lerp(s.speed, targetSpeed, Math.min(1, dt * (s.powerTime>0?3.6:tuck ? (mobile ? 2.1 : 1.35) : .5)));
        // Frost Hover is flagged as inAir for tricks, but it should steer like
        // a powerful snowboard, not inherit the weak normal airborne steering.
        const poweredCarve=s.frostHover && s.powerTime>0;
        const lateralTarget=poweredCarve
          ? (frostDesiredVelX??s.steer*13.2)
          : s.steer * (s.inAir ? 5.0 : 9.2);
        s.velX=lerp(s.velX,lateralTarget,
          Math.min(1,dt*(poweredCarve?8.5:s.inAir?2.8:5.5)));
        const previousX=s.x;
        s.x = clamp(s.x + s.velX * dt, -11.15, 11.15);
        const previousZ=s.z;
        const previousY=s.worldY;
        s.z -= s.speed * dt;
        // Solid ramp collision, including while airborne. An Ollie started
        // before a pink ramp must clear its deck or hit the wedge. Sampling the
        // ballistic path stops the board tunnelling through at high speeds.
        let surface=snowSurfaceAt(s.x,s.z,localChunks,groundY);
        const from={x:previousX,z:previousZ,y:previousY};
        const predictedAirY=s.worldY+s.vy*dt-.5*SNOW_GRAVITY*dt*dt;
        const to={x:s.x,z:s.z,y:s.inAir?predictedAirY:surface.height};
        if (!s.frostHover && !s.recovery) {
          for (const chunk of localChunks) for (const ramp of chunk.ramps) {
            if (s.recovery) break;
            // The rider has already left the lip of this ramp.
            if (s.inAir && !s.consumedRamps.has(ramp.id)) {
              const hit=sweptAirRampContact(from,to,ramp,groundY);
              if (hit) {
                if (hit.kind === "deck" || s.frostCollisionGrace > 0) {
                  // Genuine deck landings remain unchanged. If a rider is
                  // shielded after Frost, safely lift onto the solid deck
                  // instead of crashing or tunnelling through the ramp.
                  s.x=hit.x;
                  s.z=hit.z;
                  surface=snowSurfaceAt(s.x,s.z,localChunks,groundY);
                  s.worldY=Math.max(hit.y+.003,surface.height+(s.frostCollisionGrace>0?.08:0));
                  if(s.frostCollisionGrace>0){
                    s.inAir=false;s.vy=0;s.air=0;
                    s.jumpCooldown=Math.max(s.jumpCooldown,.2);
                    resetAirTrickChain(s);
                    s.consumedRamps.add(ramp.id);
                  } else s.vy=Math.min(-1,s.vy);
                  break;
                }
                s.x=previousX;s.z=previousZ;
                beginSnowRecovery(s,"wipeout","RAMP COLLISION!",onSound,{x:ramp.x,z:ramp.z});
                break;
              }
            }
            if (sweptRampSideHit(from,to,ramp,groundY)) {
              if(s.frostCollisionGrace>0){
                // Protected ramp side entry: settle on the support surface.
                // Keep the board above the snow instead of rewinding each
                // frame and getting stuck against the ramp edge.
                surface=snowSurfaceAt(s.x,s.z,localChunks,groundY);
                s.worldY=Math.max(s.worldY,surface.height+.08);
                if(s.inAir){s.inAir=false;s.vy=0;s.air=0;resetAirTrickChain(s);}
                s.consumedRamps.add(ramp.id);
                break;
              }
              s.x=previousX;s.z=previousZ;
              beginSnowRecovery(s,"wipeout","RAMP SIDE COLLISION!",onSound,{x:ramp.x,z:ramp.z});
              break;
            }
          }
        }
        if(!s.recovery && !s.inAir) {
          s.worldY=surface.height;
        }
        if (!s.inAir && !s.recovery && !s.frostHover) {
          for(const chunk of localChunks) for(const ramp of chunk.ramps){
            if(s.recovery || s.inAir) break;
            if(s.consumedRamps.has(ramp.id)) continue;
            if(crossedRampLip(ramp,previousZ,s.z,s.x,previousX)){
              if(s.jumpCooldown>0){
                if(s.frostCollisionGrace>0){
                  // Don't wipe out immediately after the magical boost ends.
                  s.consumedRamps.add(ramp.id);
                  continue;
                }
                beginSnowRecovery(s,"wipeout","RAMP LIP COLLISION!",onSound,{x:ramp.x,z:ramp.z});
                break;
              }
              const verticalSpeed=rampTakeoffSpeed(s.speed,ramp);
              // Launch from the physical lip instead of adding a visual-only lift.
              const lipY=groundY(ramp.x,ramp.z)+ramp.height;
              startSnowJump(s,lipY,{velocity:verticalSpeed,source:"ramp",lift:0});
              s.peakAir=Math.max(0,lipY-groundY(s.x,s.z));
              resetAirTrickChain(s);
              activateArmedTrick(s);
              s.launchSuper=ramp.superAir;
              s.consumedRamps.add(ramp.id);
              s.lastText=ramp.superAir?"✦ SUPER AIR! CHAIN THOSE TRICKS! ✦":s.speed>=28?"RAMP BIG AIR!":"RAMP TAKEOFF!";
              s.textUntil=s.t+(ramp.superAir?2.3:1.5);
              onSound(ramp.superAir?"superRamp":"ramp");break;
            }
          }
        }
        if (s.frostHover && s.powerTime > 0) {
          // Follow the solid snow/ramp support with a gentle floating bob.
          // Flip poses gain a little clearance to keep the board out of the snow.
          const flipProgress = s.trick ? clamp(s.trick.t / s.trick.duration,0,1) : 0;
          const flipLift = s.trick?.flip ? Math.sin(Math.PI * flipProgress) * .85 : 0;
          const hoverFloor = snowSurfaceAt(s.x,s.z,localChunks,groundY).height;
          const hoverTarget = hoverFloor + FROST_HOVER_HEIGHT + Math.sin(s.t * 6.8) * FROST_HOVER_BOB + flipLift;
          s.worldY = lerp(s.worldY, hoverTarget, Math.min(1,dt * 12));
          s.air = Math.max(0, s.worldY - hoverFloor);
          s.peakAir = Math.max(s.peakAir,s.air);
          s.flightTime += dt;
          // Keep a maximum of one ahead: manual mobile/keyboard input is still
          // accepted and starts right after the current animation finishes.
          if (!s.trick && s.airQueue.length === 0) {
            const key = FROST_AUTO_TRICKS[s.frostAutoIndex++ % FROST_AUTO_TRICKS.length];
            const definition = TRICKS.find(t => t.key === key);
            if (definition) enqueueAirTrick(s,definition);
          }
          advanceAirTricks(s,dt);
          // Completed auto/manual magic tricks immediately earn points without
          // requiring a landing, so no partial trick can cause a powered wipeout.
          while (s.frostPaidTricks < s.completedAirTricks.length) {
            const finished = s.completedAirTricks[s.frostPaidTricks++];
            const bonus = Math.round(finished.points * 0.75);
            s.score += bonus;
            s.combo += 1;
            s.lastText = `✦ FROST ${finished.name}! +${bonus} ✦`;
            s.textUntil = s.t + .85;
            onSound("magicTrick");
          }
        } else if(s.inAir && !s.recovery){
          // Standard non-magical jumps retain the original gravity and risky
          // landing checks. The protection must never leak into normal riding.
          advanceAirTricks(s,dt);
          const landingFloor=snowSurfaceAt(s.x,s.z,localChunks,groundY).height;
          const landed=stepSnowJump(s,dt,landingFloor);
          if(landed){
            const outcome=judgeAirTrickChain(s,s.steer,judgeSnowLanding,Math.random());
            if(outcome.grade === "clean"){
              if(outcome.trickCount===0){
                onSound("land");
                s.impact=.45;
                resetAirTrickChain(s);
              }else{
                s.combo += outcome.trickCount;
                const earned=outcome.basePoints*Math.min(5,Math.max(1,s.combo));
                s.score+=earned;
                recordSnowPoints(s,earned);
                const spawnedMushroom=maybeSpawnSnowMushroom(s,localChunks);
                const turns=((s.airYaw/Math.PI)%2+2)%2;
                if(turns>.8&&turns<1.2)s.fakie=!s.fakie;
                s.lastText=spawnedMushroom ? "✦ RARE FROST SHROOM AHEAD! ✦" : `CLEAN ${outcome.trickCount} TRICK${outcome.trickCount===1?"":"S"}! +${earned.toLocaleString()}`;
                s.textUntil=s.t+1.85;
                s.impact=.45;
                if(outcome.trickCount){onSound("land");onSound("combo");}
                resetAirTrickChain(s);
              }
            }else{
              const reason=outcome.reason||"BAD LANDING";
              const label=outcome.grade==="wipeout"?`WIPEOUT • ${reason}!`:`SKETCHY • ${reason}!`;
              beginSnowRecovery(s,outcome.grade,label,onSound);
            }
          }
        }
        if (!s.recovery) {
          // Swept path + vertical clearance: no tunnelling between frames at tuck speed,
          // but safely jumping over a rock still works.
          const end={x:s.x,z:s.z,y:s.worldY};
          for (const chunk of localChunks) for (const rock of chunk.rocks) {
            // A normal crash marks this rock as already HIT (not destroyed),
            // avoiding a crash loop on the very next frame after recovery.
            if (s.consumedRocks.has(rock.id)) continue;
            const powered = s.frostHover && s.powerTime > 0;
            if (!powered && s.hitRocks.has(rock.id)) continue;
            const contact = powered
              ? frostPathHit(from,end,rock,rock.size*1.18+.9)
              : sweptRockHit(from,end,rock,groundY,.37);
            if (contact) {
              if(powered) {
                // Destruction is exclusive to the active Frost Shroom.
                s.consumedRocks.add(rock.id);
                // The boost turns real collisions into shattering rock geometry.
                // Don't award shatter points for distant rocks or rocks jumped over.
                s.rockExplosions.push({x:rock.x,y:groundY(rock.x,rock.z)+rock.size*.65,
                  z:rock.z,size:rock.size,seed:s.rockShattered,at:s.t});
                if(s.rockExplosions.length>9)s.rockExplosions.shift();
                s.rockShattered++;
                s.score+=110;
                s.lastText=`✦ SHATTER! ROCK ${s.rockShattered} • +110 ✦`;
                s.textUntil=s.t+.9;
                onSound("shatter");
                continue;
              }
              // During the two normal-riding shield seconds, rocks stay
              // visible and intact; the rider simply passes safely by.
              // Remember contact so the same rock cannot crash the rider on
              // the exact frame the shield expires.
              if(s.frostCollisionGrace>0){
                s.hitRocks.add(rock.id);
                continue;
              }
              // Normal collisions never destroy or hide a rock.
              s.hitRocks.add(rock.id);
              s.x=previousX;s.z=previousZ;
              beginSnowRecovery(s, "wipeout", "ROCK COLLISION!", onSound,{x:rock.x,z:rock.z});
              break;
            }
          }
        }
        if (!s.recovery) {
          for (const chunk of localChunks) for (const coin of chunk.coins) {
            if (collectedRef.current.has(coin.id)) continue;
            if (Math.abs(s.z - coin.z) < 1.55 && Math.abs(s.x - coin.x) < 1.28) {
              collectedRef.current.add(coin.id); s.coins++; s.score += TOKEN_POINTS; recordSnowPoints(s,TOKEN_POINTS); const spawnedMushroom=maybeSpawnSnowMushroom(s,localChunks); onSound("pickup");
              s.lastText = spawnedMushroom ? "✦ RARE FROST SHROOM AHEAD! ✦" : `SHRED TOKEN +${TOKEN_POINTS}`; s.textUntil = s.t + (spawnedMushroom ? 2 : 1.25);
            }
          }
        }
        // Floating rare mushroom: collected by crossing its actual position.
        if (!s.recovery && mushroomCollision(s,{x:previousX,z:previousZ}, {x:s.x,z:s.z},groundY)){
          activateSnowMushroom(s);
          beginFrostHover(s, snowSurfaceAt(s.x,s.z,localChunks,groundY).height);
          s.score+=450; // bonus is intentionally not counted toward the next mushroom spawn
          s.lastText="✦ FROST SHROOM! SUPER SPEED + AUTO TRICKS! ✦";
          s.textUntil=s.t+2.4;
          onSound("power");
        }
      }
      s.peakScore=Math.max(s.peakScore,s.score);
      if(s.score<=0){
        s.score=0;
        phaseRef.current="finished";
        onSound("finish");
        onFinish(safeHud(s));
      }
    }

    const recoveryMode = recoveryStage(s.recovery);
    const remountP=s.recovery && recoveryMode==="remounting"
      ? clamp((s.recovery.t-(s.recovery.kind==="wipeout"?2.57:1.97))/Math.max(.35,s.recovery.duration-(s.recovery.kind==="wipeout"?2.57:1.97)),0,1) : 0;
    const desired = recoveryMode === "falling" ? "SnowboardWipeout" :
      recoveryMode === "chasing" ? "Run" :
      recoveryMode === "remounting" ? (remountP < .49 ? "SnowboardRemount" : remountP < .71 ? "SnowboardLanding" : remountP < .90 ? "Run" : "SnowboardCruise") :
      s.inAir ? (s.trick?.pose || (s.flightTime < .3 ? "SnowboardOllie" : "SnowboardCruise")) :
      s.impact > 0 ? "SnowboardLanding" : tuck ? "SnowboardTuck" :
      s.steer < -.16 ? "SnowboardCarveLeft" : s.steer > .16 ? "SnowboardCarveRight" :
      playing ? "SnowboardCruise" : "SnowboardIdle";
    s.currentPose=desired;
    const poseIdentity=`${desired}:${s.inAir && s.trick ? s.trick.id : "base"}`;
    if(active.current?.id !== poseIdentity){
      const prev=active.current?.action, next=actions[desired]||actions.SnowboardIdle;
      if(next){
        // Same clip can be queued twice. Restarting its AnimationAction is
        // required; comparing only the clip name used to silently skip it.
        if(prev===next)next.stop();
        next.reset();
        next.enabled=true;
        const oneShot=!!s.trick && s.inAir || recoveryMode==="falling" || (recoveryMode==="remounting" && desired!=="SnowboardCruise");
        next.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot?1:Infinity);
        next.clampWhenFinished=oneShot;
        next.timeScale=s.trick ? next.getClip().duration / Math.max(.15,s.trick.duration) :
          recoveryMode==="remounting" && desired==="SnowboardRemount" ? next.getClip().duration/.78 :
          recoveryMode==="remounting" && desired==="Run" ? next.getClip().duration/.36 : 1;
        next.fadeIn(prev===next ? .06 : .13).play();
        if(prev && prev!==next)prev.fadeOut(.13);
      }
      active.current={id:poseIdentity,action:next};
    }
    if(recoveryMode==="chasing" && s.recovery && actions.Run){
      // Brake before the board instead of running full-speed into its edge.
      const end=s.recovery.kind==="wipeout"?2.57:1.97;
      const approach=smoothstep((s.recovery.t-(end-.40))/.40);
      actions.Run.timeScale=1-.70*approach;
    }
    if(phaseRef.current!=="paused")mixer.update(dt);

    const cy = groundY(s.x, s.z);
    const deck=snowSurfaceAt(s.x,s.z,localChunks,groundY);
    // Support the board along its length, not just at its center.
    const frontFloor=snowSurfaceAt(s.x,s.z-1.08,localChunks,groundY).height;
    const backFloor=snowSurfaceAt(s.x,s.z+1.08,localChunks,groundY).height;
    const boardFloor=Math.max(deck.height,frontFloor-.12,backFloor-.12);
    const visualY=s.inAir ? s.worldY : s.recovery ? boardFloor : Math.max(s.worldY,boardFloor);
    if (hoverRing.current) {
      hoverRing.current.visible = s.frostHover && s.powerTime > 0;
      if (hoverRing.current.visible) {
        hoverRing.current.position.y = boardFloor - visualY + .035;
        const pulse = 1 + Math.sin(s.t * 9) * .08;
        hoverRing.current.scale.set(pulse,pulse,pulse);
        hoverRing.current.rotation.z = s.t * .9;
      }
    }
    if (root.current && stance.current && board.current && riderCarrier.current && riderModel.current) {
      root.current.position.set(s.x, visualY + .14, s.z);
      // During a wipeout the normal board disappears; a second, physically
      // independent copy renders in world space until the rider remounts.
      board.current.visible = !s.recovery;
      const trick = s.trick;
      const progress = trick ? smoothstep(trick.t / trick.duration) : 0;
      const grabEnvelope = trick ? Math.sin(Math.PI * progress) : 0;
      const rec = s.recovery;
      const airYaw = rec ? 0 : (s.fakie ? Math.PI : 0) + (s.inAir ? s.airYaw : 0)
        + (trick ? (trick.spins || 0) * DEG * progress : 0);
      const flip = (s.inAir ? s.airPitch : 0)
        + (trick ? (trick.flip || 0) * DEG * progress : 0);
      const roll = trick ? (trick.roll || 0) * grabEnvelope : 0;
      // A small heading change makes the physical powered slalom read as a
      // snowboard carve; spins and flips still use the existing airYaw.
      const frostCarveYaw=s.frostHover ? clamp(s.velX/Math.max(22,s.speed),-.24,.24) : 0;
      stance.current.rotation.set(flip - s.velX * .013 * (s.inAir ? .3 : 1), airYaw+frostCarveYaw,
        s.steer * -.22 + roll, "YXZ");
      const terrainPitch=clamp(Math.atan2(frontFloor-backFloor,2.16),-.16,.88);
      board.current.rotation.x = (trick?.pitch || 0) * grabEnvelope +
        (s.inAir ? Math.sin(s.air * .58) * .1 : terrainPitch);
      board.current.rotation.z = trick ? (trick.roll || 0) * grabEnvelope * .55 : 0;
      board.current.position.y = s.impact > 0 ? -.09 * Math.sin((.45 - s.impact) * Math.PI / .45) : 0;
      if (rec) {
        const falling = recoveryMode === "falling";
        const chasing = recoveryMode === "chasing";
        const fallen=rec.rider;
        const loose=rec.board;
        const motion=snowRemountMotion(rec,
          {x:fallen?.x ?? s.x,z:fallen?.z ?? s.z},
          {x:loose?.x ?? s.x,z:loose?.z ?? s.z,yaw:loose?.yaw ?? 0},
          {x:s.x,z:s.z});
        const {fallEnd,chaseP,mountP,hopP}=motion;
        const fallP=smoothstep(rec.t/fallEnd);
        // Stop about one metre before the board so the run cycle never puts a
        // boot through the deck. Only the airborne hop closes that last gap.
        const chaseX=motion.x, chaseZ=motion.z;
        const riderFloor=snowSurfaceAt(chaseX,chaseZ,localChunks,groundY).height;
        const groundLift=falling && fallen ? Math.max(-.12,fallen.y-root.current.position.y) :
          riderFloor-root.current.position.y + motion.arc + (chasing ? .035*Math.sin(chaseP*19) : 0);
        riderCarrier.current.position.set(chaseX-s.x,groundLift,chaseZ-s.z);
        const getUp=smoothstep((rec.t-fallEnd)/.38);
        const downRoll=(fallen?.roll ?? -1.35)*Math.sin(Math.PI*fallP*.5);
        const downPitch=(fallen?.pitch ?? 0)*Math.sin(Math.PI*fallP*.5);
        const downYaw=(fallen?.yaw ?? 0)*Math.sin(Math.PI*fallP*.5);
        const pushLean=mountP>.70 ? -.16*Math.sin(Math.PI*motion.kickP) : 0;
        riderCarrier.current.rotation.set(
          falling?downPitch:chasing?downPitch*(1-getUp):pushLean,
          falling?downYaw:chasing?downYaw*(1-getUp):0,
          falling?downRoll:chasing?downRoll*(1-getUp)-.04*Math.sin(chaseP*17):0,
          "YXZ");
        // A steady approach direction avoids a last-frame swivel when the
        // rider reaches the middle of the deck. Turn the rider together with
        // the board WHILE airborne, finishing the alignment before landing.
        const lookTowardBoard=clamp(Math.atan2(motion.approachDX,-motion.approachDZ),-1.1,1.1);
        const approachFacing=lookTowardBoard*.72;
        // Compute the original orientation offset once from the loose board
        // yaw; changing this reference as the board turns makes the rider
        // briefly counter-rotate in the middle of the hop.
        const initialBoardYaw=loose?.yaw ?? 0;
        const facingOffset=Math.atan2(
          Math.sin(approachFacing-initialBoardYaw),
          Math.cos(approachFacing-initialBoardYaw)
        );
        riderModel.current.rotation.y=Math.PI/2 + (chasing ? approachFacing*getUp :
          falling ? (fallen?.modelTurn||0) :
          motion.boardYaw+facingOffset*(1-motion.turnP));
        // The board stays put while the rider hops on. Move both together only
        // for the last push-off, restoring the normal snowboard binding height.
        riderModel.current.position.y=lerp(.06,RIDER_BINDING_HEIGHT,hopP)
          + (mountP>.71 && mountP<.90 ? .10*Math.sin(Math.PI*(mountP-.71)/.19) : 0);
        // Capsule-like pose/ground collision for the skinned rider. A sideways
        // fall rotates its broad head/body below the feet; simply putting the
        // model root at snow level was causing it to sink underground.
        const riderX=s.x+riderCarrier.current.position.x;
        const riderZ=s.z+riderCarrier.current.position.z;
        const colliderFloor=Math.max(
          snowSurfaceAt(riderX,riderZ,localChunks,groundY).height,
          snowSurfaceAt(riderX-.34,riderZ,localChunks,groundY).height,
          snowSurfaceAt(riderX+.34,riderZ,localChunks,groundY).height,
          snowSurfaceAt(riderX,riderZ-.48,localChunks,groundY).height,
          snowSurfaceAt(riderX,riderZ+.48,localChunks,groundY).height,
        );
        const lift=riderRecoveryGroundLift({
          rootY:root.current.position.y,
          carrierY:riderCarrier.current.position.y,
          modelY:riderModel.current.position.y,
          roll:riderCarrier.current.rotation.z,
          yaw:riderModel.current.rotation.y,
          pitch:riderCarrier.current.rotation.x,
          floor:colliderFloor,
        });
        riderCarrier.current.position.y += lift;
        // Bone-level contact is inexpensive (16 bones, crash frames only).
        // It also catches animated paws/head parts that leave the rigid
        // proxy's envelope during the original wipeout clip.
        root.current.updateMatrixWorld(true);
        let skeletonLift=0;
        for(const bone of riderBones){
          bone.getWorldPosition(boneWorld);
          const boneFloor=snowSurfaceAt(boneWorld.x,boneWorld.z,localChunks,groundY).height;
          skeletonLift=Math.max(skeletonLift,boneFloor+.085-boneWorld.y);
        }
        riderCarrier.current.position.y += Math.max(0,skeletonLift);
      } else {
        riderCarrier.current.position.set(0, 0, 0);
        riderCarrier.current.rotation.set(0, 0, 0);
        riderModel.current.rotation.y = Math.PI / 2;
        riderModel.current.position.y = RIDER_BINDING_HEIGHT;
      }
    }
    if (crashBoard.current) {
      const rec=s.recovery;
      const loose=rec?.board;
      crashBoard.current.visible=!!loose;
      if (loose) {
        // Hold position until the rider has landed on the bindings. During
        // the final kick, move the loose board and rider back to the normal
        // gameplay position together, so they never pass through each other.
        const motion=snowRemountMotion(rec,
          {x:rec.rider?.x??s.x,z:rec.rider?.z??s.z},
          {x:loose.x,z:loose.z,yaw:loose.yaw},{x:s.x,z:s.z});
        const atX=motion.boardX, atZ=motion.boardZ;
        // Sample the nose and tail along the board's ACTUAL yaw as it turns.
        // Otherwise rotating a long board sideways on a sloped snowbank can
        // push one end through the surface even though the center is clear.
        const noseX=Math.sin(motion.boardYaw)*1.08;
        const noseZ=Math.cos(motion.boardYaw)*1.08;
        const landingY=Math.max(
          snowSurfaceAt(atX,atZ,localChunks,groundY).height+.12,
          snowSurfaceAt(atX+noseX,atZ+noseZ,localChunks,groundY).height+.06,
          snowSurfaceAt(atX-noseX,atZ-noseZ,localChunks,groundY).height+.06,
        );
        crashBoard.current.position.set(atX,
          Math.max(landingY,lerp(loose.y,landingY,motion.turnP)),atZ);
        crashBoard.current.rotation.set(
          lerp(loose.pitch,0,motion.turnP),
          motion.boardYaw,
          lerp(loose.roll,0,motion.turnP),"YXZ"
        );
      }
    }
    // Two tiny powder puffs accent the final kick. Hidden for all other frames.
    if(kickSnow.current){
      const rec=s.recovery;
      const moving=rec?.pushedOff && rec?.board && crashBoard.current?.visible;
      kickSnow.current.visible=!!moving;
      if(moving){
        const f=snowRemountMotion(rec,
          {x:rec.rider?.x??s.x,z:rec.rider?.z??s.z},
          {x:rec.board.x,z:rec.board.z},{x:s.x,z:s.z});
        kickSnow.current.position.set(f.boardX-.33,crashBoard.current.position.y+.1,f.boardZ+.70);
        kickSnow.current.scale.setScalar(.6+.55*Math.sin(Math.PI*f.kickP));
      }
    }
    // V26: CRASH CAMERA NEVER ZOOMS OUT. Stay at the player's selected riding
    // distance and FOV for the entire wipeout, chase, hop and kick-off.
    // Follow the actual fallen rider, not s.x/s.z, so the crash stays in frame.
    // Distant loose boards may leave frame; tight rider framing is intentional.
    const offsets=[[-3.0,2.25,5.6],mobile?[-.25,2.65,7.6]:[-.7,3.15,10.5],[-6.1,4.2,12.5]];
    const off=offsets[s.cameraMode];
    const followLift=Math.max(0,visualY-cy);
    const normalLook=new THREE.Vector3(s.x,cy+1.14+followLift*.92,s.z-1.3);
    const relX=off[0]+s.steer*.4;
    const relY=off[1]-1.14;
    const relZ=off[2]+1.3;
    const baseRadius=Math.hypot(relX,relY,relZ);
    const horizontal=Math.hypot(relX,relZ);
    const orbit=cameraOrbitRef.current;
    const baseAzimuth=Math.atan2(relX,relZ)+orbit.yaw;
    const baseElevation=clamp(Math.atan2(relY,horizontal)+orbit.pitch,.12,1.18);
    const baseFov=(mobile?43:42)+Math.max(0,s.speed-20)*.16;
    crashCameraBlend.current=lerp(crashCameraBlend.current,s.recovery?1:0,
      Math.min(1,dt*(s.recovery?10:4)));
    const crashBlend=crashCameraBlend.current;
    const look=normalLook.clone();
    if(s.recovery && riderCarrier.current && riderModel.current){
      // The carrier's offset is randomized by crash physics, so aim where the
      // visible character really is. Avoid weighting a far-flung snowboard:
      // this never changes camera radius or field-of-view.
      const riderX=s.x+riderCarrier.current.position.x;
      const riderY=root.current.position.y+riderCarrier.current.position.y+riderModel.current.position.y+1.03;
      const riderZ=s.z+riderCarrier.current.position.z;
      const aim=new THREE.Vector3(riderX,riderY,riderZ);
      if(crashBoard.current?.visible){
        const towardBoard=new THREE.Vector3(
          crashBoard.current.position.x-riderX,
          crashBoard.current.position.y+.25-riderY,
          crashBoard.current.position.z-riderZ,
        );
        // A hint of the board helps the remount, without pulling the camera away.
        towardBoard.clampLength(0,1.15);
        aim.addScaledVector(towardBoard,.22);
      }
      look.lerp(aim,crashBlend);
    }

    // V32: board-locked cinematic CUTS. Randomly alternate between low trick
    // close-ups, rear high-speed chase, and rock-shatter action shots.
    const director=frostCamera.current;
    const frostActive=playing && s.frostHover && s.powerTime>0 && !s.recovery;
    let frostMix=0;
    let frostCut=false;
    let frostAnchorValid=false;
    let azimuth=baseAzimuth;
    let elevation=baseElevation;
    let radius=baseRadius; // Also fixed during recovery: no crash zoom-out.
    let desiredFov=baseFov;
    if(frostActive){
      if(!director.active){
        director.active=true;
        director.startAt=s.t;
        director.nextAt=s.t;
        director.index=-1;
        director.yaw=baseAzimuth; // travel naturally from the current view
        director.elevation=baseElevation;
        director.radius=baseRadius;
        director.lookHeight=.55;
        director.exitYaw=null;
        director.exitTarget=null;
        director.lastBoard=null;
        director.lastShatterCount=s.rockShattered;
        director.lastCutAt=-99;
        director.speedShots=0;
        director.focusRock=null;
      }
      // A fresh shatter may trigger a special shot between regular timed cuts.
      // Do not cut on every particle or during the smooth entrance/exit.
      const newImpact=s.rockShattered>director.lastShatterCount;
      director.lastShatterCount=s.rockShattered;
      const rockFocus=frostRockCameraTarget(s,localChunks);
      const cinematicPhase=s.t-director.startAt>=FROST_CAMERA_INTRO_SECONDS &&
        s.powerTime>FROST_CAMERA_RETURN_SECONDS;
      const impactCut=cinematicPhase && s.powerTime>FROST_CAMERA_RETURN_SECONDS+FROST_IMPACT_SHOT_SECONDS+.12 &&
        newImpact && s.t-director.lastCutAt>.34;
      // Freeze the lens on the shattered rock for a few frames. Following the
      // board here would carry the lens 20+ world units away before the shards
      // have finished flying, making the explosion impossible to see.
      if(impactCut){
        const blast=s.rockExplosions?.[s.rockExplosions.length-1];
        if(blast){
          director.actionFocus={x:blast.x,y:blast.y,z:blast.z,
            until:s.t+FROST_IMPACT_SHOT_SECONDS,
            side:Math.random()<.5?-1:1};
        }
      }
      if(director.actionFocus && s.t>=director.actionFocus.until){
        director.actionFocus=null;
        director.nextAt=s.t; // Cut straight back to the board after the blast.
      }
      if(s.powerTime>FROST_CAMERA_RETURN_SECONDS &&
          (impactCut || (!director.actionFocus && s.t>=director.nextAt))){
        const firstShot=director.index<0;
        // Guarantee at least one rear-speed shot by the first few cuts, then
        // leave the order randomized. Shatters still take priority over it.
        const forceSpeed=!firstShot && director.speedShots===0 &&
          s.t-director.startAt>2.15 && !impactCut;
        const next=nextFrostCameraShot(director.index,Math.random,{
          impact:impactCut,forceSpeed,rockAhead:!!rockFocus,
        });
        director.index=next.index;
        director.shot=next.shot;
        director.focusRock=next.shot.kind==="shatter"?rockFocus:null;
        if(next.shot.kind==="speed")director.speedShots++;
        // First shot eases in. Every subsequent mid-boost change is a cut.
        frostCut=!firstShot && cinematicPhase;
        director.lastCutAt=s.t;
        director.nextAt=s.t+(firstShot?1.34:next.shot.kind==="shatter"?.67:.57+Math.random()*.26);
      }
      if(director.shot){
        // Keep the view fixed between cuts. No smooth orbital travel between
        // different trick shots, and no dependence on the board's spin yaw.
        director.yaw=director.shot.yaw;
        director.elevation=director.shot.elevation;
        director.radius=director.shot.radius*(mobile?1.26:1.12);
        director.lookHeight=director.shot.lookHeight;
      }
      const intro=frostCameraEase((s.t-director.startAt)/FROST_CAMERA_INTRO_SECONDS);
      const exit=frostCameraEase(s.powerTime/FROST_CAMERA_RETURN_SECONDS);
      frostMix=intro*exit;
      // Keep one continuous angle path during the smooth 3-second exit. Otherwise
      // blending angles at the +/-PI seam can make the camera suddenly whip
      // to the opposite side midway through the return animation.
      if(s.powerTime<=FROST_CAMERA_RETURN_SECONDS){
        if(director.exitYaw===null){
          director.exitYaw=director.yaw;
        }
        director.exitTarget=director.exitYaw+Math.atan2(
          Math.sin(baseAzimuth-director.exitYaw),
          Math.cos(baseAzimuth-director.exitYaw),
        );
        azimuth=lerp(director.exitTarget,director.exitYaw,exit);
      }else{
        // ABSOLUTE cinematic azimuth, NOT added to the old follow azimuth.
        azimuth=approachAngle(baseAzimuth,director.yaw,intro);
      }
      elevation=lerp(baseElevation,director.elevation,frostMix);
      radius=lerp(baseRadius,director.radius,frostMix);
      // Rear chase shots widen the view to emphasize rushing snow and
      // approaching obstacles. Close trick shots stay cinematic and tighter.
      const shotFov=director.shot?.kind==="speed"?(mobile?52:50)
        :director.shot?.kind==="shatter"?(mobile?47:46):(mobile?43:42);
      desiredFov=lerp(baseFov,shotFov,frostMix);
      // getWorldPosition includes animated stance yaw/pitch and board offset.
      // The focus remains glued to the deck itself, not s.z or a spot behind.
      if(root.current && board.current){
        root.current.updateMatrixWorld(true);
        board.current.getWorldPosition(frostBoardAnchor);
        frostAnchorValid=true;
        const frostLook=new THREE.Vector3(
          frostBoardAnchor.x,
          frostBoardAnchor.y+director.lookHeight,
          frostBoardAnchor.z,
        );
        if(director.shot?.kind==="speed"){
          // Camera behind, aimed slightly down-course: speed is visible, but
          // the board still occupies the foreground instead of disappearing.
          frostLook.z-=1.45;
        }else if(director.shot?.kind==="shatter"){
          // Briefly favor debris or a nearby rock without ever losing the board.
          // Do not chase a fixed old explosion at 60 world units per second.
          const impact=rockFocus?.explosion?rockFocus:director.focusRock;
          if(impact){
            const dx=impact.x-frostBoardAnchor.x,dz=impact.z-frostBoardAnchor.z;
            if(Math.hypot(dx,dz)<10){
              frostLook.x+=clamp(dx*.26,-1.6,1.6);
              frostLook.z+=clamp(dz*.26,-1.6,1.6);
            }
          }
        }
        look.lerp(frostLook,frostMix);
      }
    }else if(director.active){
      director.active=false;
      director.shot=null;
      director.lastBoard=null;
      director.actionFocus=null;
    }

    const projected=radius*Math.cos(elevation);
    const dest=new THREE.Vector3(
      look.x+Math.sin(azimuth)*projected,
      look.y+Math.sin(elevation)*radius,
      look.z+Math.cos(azimuth)*projected,
    );
    // Cinematic orbit must not put the lens beneath a raised snowbank.
    if(frostMix>0)dest.y=Math.max(dest.y,groundY(dest.x,dest.z)+.75);
    const targetLook=camera.userData._look || (camera.userData._look=look.clone());
    // V28: eliminate the fast-movement camera lag. At Frost Shroom speed
    // (~60 world units/sec), smoothing the camera's WORLD position by 9/sec
    // leaves it about 6 metres behind the snowboard. Independently smoothing
    // the look target puts the rider off screen, even with correct orbit angles.
    // Translate BOTH the camera and its look target by the real snowboard's
    // displacement first, then smooth only the relative cinematic orbit.
    // This tracks the board correctly during carving, ramp hover and flips.
    if(frostActive && frostAnchorValid){
      if(director.lastBoard && cameraReady.current){
        const delta=frostBoardAnchor.clone().sub(director.lastBoard);
        // Ignore discontinuities (restart/teleport); normal follow will recover.
        if(delta.lengthSq()<100){
          camera.position.add(delta);
          targetLook.add(delta);
        }
      }
      if(!director.lastBoard) director.lastBoard=frostBoardAnchor.clone();
      else director.lastBoard.copy(frostBoardAnchor);
    } else {
      director.lastBoard=null;
    }
    if(!cameraReady.current){camera.position.copy(dest);cameraReady.current=true;}
    else if(frostCut && frostMix>.98){
      // A REAL EDIT CUT: set both lens AND aim instantly on the same frame.
      // Moving one without the other would temporarily hide the snowboard.
      camera.position.copy(dest);
      targetLook.copy(look);
    }else camera.position.lerp(dest,Math.min(1,dt*(frostMix>.01?9:s.recovery?10:orbit.dragging?11:4.8)));
    if(!(frostCut && frostMix>.98))targetLook.lerp(look,Math.min(1,dt*(frostMix>.01?12:s.recovery?12:7)));
    camera.lookAt(targetLook);
    // Fallback for mobile frame drops or sudden camera state changes: never
    // allow the lens to stay several metres away from the current board.
    // The camera still eases between angle presets in local board space.
    if(frostActive && frostAnchorValid && frostMix>.65){
      const aimLag=targetLook.distanceTo(look);
      const positionLag=camera.position.distanceTo(dest);
      if(aimLag>2.25 || positionLag>4.5){
        targetLook.copy(look);
        camera.position.copy(dest);
        camera.lookAt(targetLook);
      }
    }
    const impactFocus=cinematicPhaseAvailable(s, director, frostActive);
    if(impactFocus){
      // Dedicated impact edit: eye *and* lookAt remain world-locked to the
      // rock, while the board passes through the frame and shards explode.
      // The subsequent shot cuts back to the tracking camera automatically.
      const p=impactFocus;
      camera.position.set(p.x+p.side*3.9,p.y+2.55,p.z-4.45);
      targetLook.set(p.x,p.y+.55,p.z);
      camera.lookAt(targetLook);
      camera.fov=mobile?55:51;
      // Keep board displacement bookkeeping current during the static edit.
      if(frostAnchorValid)director.lastBoard?.copy(frostBoardAnchor);
    }else{
      camera.fov=lerp(camera.fov,desiredFov,Math.min(1,dt*(frostMix>.01?8:2)));
    }
    camera.updateProjectionMatrix();
    updateSnow64AudioFrame({playing, speed:s.speed,steer:s.steer,tuck,
      inAir:s.inAir,recovery:!!s.recovery,powered:s.frostHover&&s.powerTime>0,airHeight:s.air});
    frame.current+=dt;
    if(frame.current>.12){frame.current=0;onHud(safeHud(s));}
  });
  return <>
  <group ref={crashBoard} visible={false}><Snowboard /></group>
  <group ref={kickSnow} visible={false}>
    <mesh position={[-.11,.13,0]}><sphereGeometry args={[.19,6,4]}/><meshBasicMaterial color="#efffff" transparent opacity={.52} depthWrite={false}/></mesh>
    <mesh position={[.18,.10,.16]}><sphereGeometry args={[.13,6,4]}/><meshBasicMaterial color="#cceef5" transparent opacity={.38} depthWrite={false}/></mesh>
  </group>
  <group ref={root}>
    <mesh ref={hoverRing} visible={false} rotation={[-Math.PI/2,0,0]}>
      <ringGeometry args={[.62,1.1,32]}/>
      <meshBasicMaterial color="#95ffed" transparent opacity={.58} depthWrite={false} side={THREE.DoubleSide}/>
    </mesh>
    <group ref={stance}>
      <group ref={board}><Snowboard /></group>
      <group ref={riderCarrier}>
        <group ref={riderModel}>
          <primitive object={character} dispose={null} scale={.86} />
        </group>
      </group>
    </group>
  </group>
  </>;
}

function Loading() {
  return <Html center><div style={{color:"#fff",font:"800 15px monospace",whiteSpace:"nowrap",background:"#16405ba9",padding:18,borderRadius:8}}>LOADING RIDER...</div></Html>;
}
function Scene({mobile,phase,runKey,keyRef,queueRef,cameraOrbitRef,onHud,onFinish,onSound,collectedRef,stateRef,distance}){
  return <Snow64ModelProvider><Snow64TextureProvider mobile={mobile}>
    <color attach="background" args={["#bfd9e6"]}/>
    <fog attach="fog" args={["#c1dce9",30,138]}/>
    <ambientLight intensity={1.7}/>
    <hemisphereLight args={["#e6f6ff","#597988",1.3]}/>
    <directionalLight position={[-8,20,-30]} intensity={2.2} color="#fff6e9"/>
    <Course collectedRef={collectedRef} distance={distance} stateRef={stateRef}/>
    <Snow64ExplosionVFX stateRef={stateRef} mobile={mobile}/>
    <FrostMushroom stateRef={stateRef}/>
    <Mountains stateRef={stateRef}/>
    <Suspense fallback={<Loading/>}>
      <Rider mobile={mobile} phase={phase} runKey={runKey} keyRef={keyRef} queueRef={queueRef} stateRef={stateRef} collectedRef={collectedRef} cameraOrbitRef={cameraOrbitRef} onHud={onHud} onFinish={onFinish} onSound={onSound}/>
    </Suspense>
    <Snowfall mobile={mobile} stateRef={stateRef}/>
    <BoardTrail mobile={mobile} stateRef={stateRef}/>
  </Snow64TextureProvider></Snow64ModelProvider>;
}

function FrostMagicOverlay({ remaining, mobile }) {
  if (remaining <= 0) return null;
  const alpha=Math.min(1,remaining/.85);
  return <div aria-hidden="true" className="snow64-magic" style={{position:"absolute",inset:0,
    zIndex:2,overflow:"hidden",pointerEvents:"none",opacity:alpha,
    background:"radial-gradient(ellipse at 50% 45%, transparent 34%, #91ffe52b 75%, #ae73ff4d 100%)"}}>
    <div className="snow64-magic-halo" style={{position:"absolute",inset:"-24%",opacity:.58,animation:mobile?"none":undefined,
      background:"conic-gradient(from 30deg at 50% 50%,transparent 0deg,#97fff933 36deg,transparent 70deg,#bb8eff30 145deg,transparent 210deg,#8ffff13b 270deg,transparent 310deg)",
      borderRadius:"50%"}}/>
    {[[16,24,0],[81,20,.35],[26,79,.8],[73,72,1.15],[50,34,.55],[91,49,1.6]].slice(0,mobile?4:6).map(([x,y,d],i)=><div key={i} className="snow64-magic-star"
      style={{position:"absolute",left:`${x}%`,top:`${y}%`,animationDelay:`-${d}s`,
        color:i%2?"#f3cdff":"#b5fff0",fontSize:i%3===0?26:16,textShadow:"0 0 12px currentColor"}}>✦</div>)}
    {remaining>7.3 && <div className="snow64-magic-title" style={{position:"absolute",top:"34%",left:"50%",transform:"translateX(-50%)",
      whiteSpace:"nowrap",font:"900 clamp(17px,4vw,32px) system-ui",letterSpacing:".14em",color:"#ddfffa",
      textShadow:"0 0 14px #80f5ff,2px 3px #3e347b"}}>✦ FROST MAGIC ✦</div>}
  </div>;
}

function formatTime(s){const m=Math.floor(s/60);const sec=(s%60).toFixed(2).padStart(5,"0");return `${String(m).padStart(2,"0")}:${sec}`;}

/** Two independent touch zones allow true two-thumb multi-touch: steering with the
 * left finger while drawing tricks on the right. No WebGL raycasting required. */
function MobileTouchControls({ inputRef, stateRef, act, phase, runKey, onTuckChange, trickMode }) {
  const steering = useRef(null);
  const drawing = useRef(null);
  const strokePath = useRef(null);
  const strokeTimeout = useRef(null);
  const lastTuck = useRef(false);
  const tapSequence = useRef(0);

  useEffect(() => {
    // Explicitly release held controls after pausing, restarting or unmounting.
    inputRef.current.steerAnalog = 0;
    inputRef.current.touchTuck = false;
    lastTuck.current = false;
    steering.current = null;
    drawing.current = null;
    return () => {
      inputRef.current.steerAnalog = 0;
      inputRef.current.touchTuck = false;
      onTuckChange?.(false);
      clearTimeout(strokeTimeout.current);
    };
  }, [inputRef, phase, runKey]);

  function startSteer(e) {
    if (phase !== "playing" || steering.current) return;
    e.preventDefault();
    steering.current = {id:e.pointerId, x:e.clientX, y:e.clientY};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveSteer(e) {
    if (!steering.current || steering.current.id !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - steering.current.x;
    const dy = e.clientY - steering.current.y;
    inputRef.current.steerAnalog = clamp(dx / 68, -1, 1);
    const isTuck = dy < -43;
    inputRef.current.touchTuck = isTuck;
    if (lastTuck.current !== isTuck) {
      lastTuck.current = isTuck;
      onTuckChange?.(isTuck);
    }
  }
  function endSteer(e) {
    if (!steering.current || steering.current.id !== e.pointerId) return;
    steering.current = null;
    inputRef.current.steerAnalog = 0;
    inputRef.current.touchTuck = false;
    if (lastTuck.current) {
      lastTuck.current = false;
      onTuckChange?.(false);
    }
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
    if (d.points.length < 150) d.points.push(pt);
    drawLine();
  }
  function endDrawing(e, cancelled = false) {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    drawing.current = null;
    if (!cancelled) {
      const elapsed = performance.now() - d.time;
      const span = Math.hypot(
        d.points[d.points.length - 1].x - d.points[0].x,
        d.points[d.points.length - 1].y - d.points[0].y
      );
      const travelled = d.points.reduce((sum,p,i) => i ? sum + Math.hypot(p.x-d.points[i-1].x,p.y-d.points[i-1].y) : 0,0);
      const tap = travelled < 26 && span < 22;
      if (trickMode === "buttons") {
        // In buttons mode the right touch area remains an Ollie pad. Swipe
        // recognition is disabled: only the visible trick icons perform tricks.
        if (tap && !stateRef.current.inAir && !stateRef.current.recovery) {
          act({type:"jump",boost:clamp((elapsed-120)/750,0,1)});
        }
      } else if (tap) {
        if (stateRef.current.inAir && !stateRef.current.recovery) {
          // Easy mode without buttons: tap mid-air to cycle four real grab clips.
          // Taps queue immediately even during another grab animation.
          const grabs = ["6", "5", "9", "0"];
          act({type:"trick",key:grabs[tapSequence.current++ % grabs.length]});
          // Tiny visible glint: the full gold stroke remains for drawn tricks.
          strokePath.current?.setAttribute("d", `M${d.points[0].x-12} ${d.points[0].y+8} l24 -16`);
        } else {
          // Hold then release on the ground to charge the Ollie.
          act({type:"jump",boost:clamp((elapsed-120)/750,0,1)});
        }
      } else {
        const gesture = classifySnowGesture(d.points);
        if (gesture) {
          // Flicks are easy; loops / flips are still drawing-only high-risk tricks.
          act({type:"trick",key:gesture.key,direction:gesture.direction});
        } else if (strokePath.current) {
          strokePath.current.setAttribute("stroke", "#ff829e");
        }
      }
    }
    clearTimeout(strokeTimeout.current);
    strokeTimeout.current = setTimeout(() => {
      strokePath.current?.setAttribute("d", "");
      strokePath.current?.setAttribute("stroke", "#ffe284");
    }, 380);
  }

  const zone = {position:"absolute",top:192,bottom:0,zIndex:4,touchAction:"none",
    userSelect:"none",WebkitUserSelect:"none",WebkitTouchCallout:"none",overflow:"hidden"};

  return <>
    <div aria-label="Steering touchpad: drag left or right to carve and upward to tuck"
      style={{...zone,left:0,width:"50%"}} onPointerDown={startSteer}
      onPointerMove={moveSteer} onPointerUp={endSteer}
      onPointerCancel={endSteer} onLostPointerCapture={endSteer} />
    <div aria-label={trickMode==="buttons"?"Tap to Ollie, or use the trick icons":"Jump and trick touchpad: tap to jump or draw a trick pattern"}
      style={{...zone,right:0,width:"50%"}} onPointerDown={startDrawing}
      onPointerMove={moveDrawing} onPointerUp={endDrawing}
      onPointerCancel={e=>endDrawing(e,true)}
      onLostPointerCapture={e=>endDrawing(e,true)}>
      {trickMode==="draw" && <svg aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",overflow:"visible"}}>
        <path ref={strokePath} fill="none" stroke="#ffe284" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
          style={{filter:"drop-shadow(0 0 5px #ff9ca8)"}}/>
      </svg>}
    </div>
  </>;
}

/** Optional arcade-button alternative to drawing. Renders only in BUTTONS mode.
 * Kept separate from the Three.js scene: no raycasting, no additional WebGL draws.
 * All 11 actions go through the same trick queue and landing checks as gestures.
 */
const SNOW64_BUTTON_TRICKS = [
  {key:"1",label:"180",icon:"spin",full:"180 degree spin"},
  {key:"2",label:"360",icon:"spin",full:"360 degree spin"},
  {key:"3",label:"720",icon:"spin",full:"720 degree spin"},
  {key:"4",label:"1080",icon:"spin",full:"1080 degree spin"},
  {key:"5",label:"METHOD",icon:"method",full:"Method grab"},
  {key:"6",label:"INDY",icon:"indy",full:"Indy grab"},
  {key:"7",label:"BACK",icon:"backflip",full:"Backflip"},
  {key:"8",label:"CORK",icon:"cork",full:"Cork 720"},
  {key:"9",label:"TAIL",icon:"tail",full:"Tail grab"},
  {key:"0",label:"NOSE",icon:"nose",full:"Nose grab"},
  {key:"f",label:"FRONT",icon:"frontflip",full:"Frontflip"},
];

function Snow64TrickGlyph({kind,level}) {
  const props={width:23,height:23,viewBox:"0 0 32 32",fill:"none",stroke:"currentColor",strokeWidth:2.4,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"};
  if(kind==="spin" || kind==="cork")return <svg {...props}>
    {level==="1" ? <path d="M 6 16 A 10 10 0 0 1 26 16"/> : <path d="M 8 11 A 11 11 0 1 1 7 23"/>}
    <path d={level==="1" ? "M 21 12 L 26 16 L 28 10" : "M 7 16 L 8 10 L 14 12"}/>
    {level==="3" && <path d="M 11 15 A 5.5 5.5 0 1 1 15 21"/>}
    {level==="4" && <><path d="M 11 15 A 5.5 5.5 0 1 1 15 21"/><circle cx="16" cy="16" r="2.2"/></>}
    {kind==="cork" ? <path d="M 12 19 C 9 12 22 10 22 18 C 22 22 16 24 13 20"/> : level==="2"?<path d="M 12 22 L 20 22"/>:null}
  </svg>;
  if(kind==="backflip" || kind==="frontflip")return <svg {...props}>
    <path d={kind==="backflip"?"M 11 6 C 2 10 2 23 14 26 C 23 28 28 21 27 14":"M 21 6 C 30 10 30 23 18 26 C 9 28 4 21 5 14"}/>
    <path d={kind==="backflip"?"M 23 16 L 27 12 L 30 18":"M 9 16 L 5 12 L 2 18"}/>
    <path d="M 11 18 L 22 14 M 13 21 L 20 10"/>
  </svg>;
  return <svg {...props}>
    <path d="M 5 22 Q 16 26 27 22" strokeWidth="3.3"/>
    <circle cx="12" cy="14" r="2.3"/><circle cx="21" cy="14" r="2.3"/>
    {kind==="method" ? <path d="M 15 4 L 16 9 L 21 10 L 16 12 L 15 17 L 13 12 L 8 10 L 13 9 Z"/> : null}
    {kind==="indy" ? <path d="M 16 5 L 16 17 M 13 10 L 16 14 L 20 10"/> : null}
    {kind==="tail" ? <path d="M 13 7 L 6 18 M 6 18 L 6 12 M 6 18 L 12 18"/> : null}
    {kind==="nose" ? <path d="M 20 7 L 27 18 M 27 18 L 21 18 M 27 18 L 27 12"/> : null}
  </svg>;
}

const Snow64TrickButtonPad = memo(function Snow64TrickButtonPad({act,mobile}) {
  const jumpHeld=useRef(null);
  const sendTrick=useCallback(key=>act({type:"trick",key}),[act]);
  const sendJump=useCallback(boost=>act({type:"jump",boost}),[act]);
  const jumpDown=e=>{
    e.stopPropagation();
    if(e.pointerType==="mouse" && e.button!==0)return;
    jumpHeld.current={id:e.pointerId,start:performance.now()};
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const jumpUp=e=>{
    e.stopPropagation();
    const held=jumpHeld.current;
    if(!held || held.id!==e.pointerId)return;
    jumpHeld.current=null;
    sendJump(clamp((performance.now()-held.start-120)/750,0,1));
  };
  return <div role="group" aria-label="Snowboard trick buttons" className="snow64-button-pad"
    onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
    style={{position:"absolute",right:mobile?"max(8px, env(safe-area-inset-right))":18,
      bottom:mobile?"max(40px, env(safe-area-inset-bottom))":26,zIndex:7,
      width:mobile?"clamp(144px, 45vw, 190px)":238,
      padding:mobile?5:8,borderRadius:13,border:"1px solid #e1faffb8",
      background:"linear-gradient(160deg,#113e56de,#0e2749e6)",
      boxShadow:"0 5px 16px #03273a80",touchAction:"manipulation",userSelect:"none",WebkitUserSelect:"none"}}>
    <div style={{fontSize:mobile?8:10,fontWeight:950,color:"#b3efff",letterSpacing:".1em",textAlign:"center",marginBottom:5}}>✦ TRICK BUTTONS ✦</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:mobile?3:5}}>
      {SNOW64_BUTTON_TRICKS.map(t=><button key={t.key} type="button"
        aria-label={`Perform ${t.full}`} title={`${t.full} · ${t.key.toUpperCase()}`}
        className="snow64-iconbtn" onPointerDown={e=>e.stopPropagation()}
        onClick={e=>{e.stopPropagation();sendTrick(t.key);}}
        style={{minWidth:0,minHeight:mobile?44:53,padding:"3px 0 2px",color:"#f9f3d9",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,
          background:"linear-gradient(#2d657d,#194860)",border:"1px solid #9ce5f5a8",borderRadius:8,
          boxShadow:"inset 0 1px #ffffff50,0 2px #09283d",cursor:"pointer",touchAction:"manipulation"}}>
        <Snow64TrickGlyph kind={t.icon} level={t.key}/>
        <span style={{fontSize:mobile?7.5:9,fontWeight:950,lineHeight:1.05,letterSpacing:"-.015em"}}>{t.label}</span>
      </button>)}
      <button type="button" className="snow64-iconbtn" aria-label="Ollie jump; hold to charge" title="OLLIE · Hold to charge"
        onPointerDown={jumpDown} onPointerUp={jumpUp} onPointerCancel={()=>{jumpHeld.current=null;}}
        onLostPointerCapture={()=>{jumpHeld.current=null;}}
        onClick={e=>{e.stopPropagation();if(e.detail===0)sendJump(0);}}
        style={{minWidth:0,minHeight:mobile?44:53,padding:"3px 0 2px",color:"#293e5b",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,
          background:"linear-gradient(#ffeb9c,#f6ad79)",border:"1px solid #fff6c1",borderRadius:8,
          boxShadow:"inset 0 1px #ffffffa8,0 2px #75384c",cursor:"pointer",touchAction:"manipulation"}}>
        <span aria-hidden="true" style={{fontSize:25,fontWeight:1000,lineHeight:"23px"}}>↑</span>
        <span style={{fontSize:mobile?7.5:9,fontWeight:950,lineHeight:1.05}}>OLLIE</span>
      </button>
    </div>
  </div>;
});

/** Single compositor-friendly speed layer. No animated per-ray SVG or fullscreen blur. */
function SpeedRush({active,speed,mobile}){
  const power=clamp((speed-68)/65,0,1);
  const show=active && power>.045;
  const rays=useMemo(()=>Array.from({length:mobile?12:20},(_,i)=>{
    const n=mobile?12:20;
    const theta=2*Math.PI*(i+.31)/n;
    const dx=Math.cos(theta),dy=Math.sin(theta);
    return {
      x1:500+dx*(230+(i%3)*38), y1:350+dy*(180+(i%3)*28),
      x2:500+dx*(690+(i%4)*70), y2:350+dy*(525+(i%4)*55),
      width:i%4===0?2.7:1.4,
    };
  }),[mobile]);
  if(!show)return null;
  return <div aria-hidden="true" className="snow64-speedfx" style={{position:"absolute",inset:0,zIndex:2,pointerEvents:"none",overflow:"hidden",opacity:.3+power*.58}}>
    <svg viewBox="0 0 1000 700" preserveAspectRatio="none" className="snow64-rush-layer"
      style={{position:"absolute",inset:0,width:"100%",height:"100%",willChange:"transform,opacity"}}>
      {rays.map((ray,i)=><line key={i} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2}
        stroke={i%3===0?"#ffffff":"#d5f6ff"} strokeOpacity={.56} strokeWidth={ray.width} strokeLinecap="round"/>)}
    </svg>
  </div>;
}

/** Transparent top-center drag region: no buttons, and both touch zones stay free. */
function FollowCameraDragArea({ cameraOrbitRef, mobile }) {
  const pointer = useRef(null);
  const down = (e) => {
    if(e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    pointer.current={id:e.pointerId,x:e.clientX,y:e.clientY};
    cameraOrbitRef.current.dragging=true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const prev=pointer.current;
    if(!prev || prev.id !== e.pointerId) return;
    e.preventDefault();
    const dx=e.clientX-prev.x, dy=e.clientY-prev.y;
    const orbit=cameraOrbitRef.current;
    orbit.yaw=(orbit.yaw+dx*.009)%(2*Math.PI);
    orbit.pitch=clamp(orbit.pitch-dy*.0075,-.42,.98);
    pointer.current={id:e.pointerId,x:e.clientX,y:e.clientY};
  };
  const release = (e) => {
    if(!pointer.current || pointer.current.id !== e.pointerId) return;
    pointer.current=null;
    cameraOrbitRef.current.dragging=false;
  };
  const reset = (e) => {
    e.preventDefault();
    cameraOrbitRef.current.yaw=0;
    cameraOrbitRef.current.pitch=0;
  };
  return <div role="region" aria-label="Camera orbit: drag left, right, up or down. Double click to reset the camera."
    onPointerDown={down} onPointerMove={move} onPointerUp={release}
    onPointerCancel={release} onLostPointerCapture={release} onDoubleClick={reset}
    style={{position:"absolute",zIndex:5,left:"50%",transform:"translateX(-50%)",
      top:mobile?82:9,height:mobile?108:119,width:mobile?"min(56vw,260px)":"min(36vw,420px)",
      touchAction:"none",userSelect:"none",WebkitUserSelect:"none",cursor:"grab",
      display:"flex",alignItems:"flex-start",justifyContent:"center"}}>
    <span aria-hidden="true" style={{font:"800 10px system-ui, sans-serif",letterSpacing:1.2,
      marginTop:mobile?4:14,opacity:.76,color:"#eaffff",pointerEvents:"none",
      textShadow:"0 2px 4px #19445b, 0 0 7px #19445b"}}>↔ DRAG CAMERA ↕</span>
  </div>;
}

/**
 * One-time PNG alpha trim. The V37 logo had a fixed-height box and may also
 * include transparent empty pixels above/below the actual artwork. Measure the
 * visible alpha bounds once and crop both title-screen layers using the SAME
 * normalized rect, so the foreground and decorative background stay aligned.
 * Cached across HUD/title mounts; never runs in the game animation loop.
 * If pixel access isn't possible, the original PNGs still render normally.
 */
const SNOW360_LOGO_ALPHA_THRESHOLD = 12;
const SNOW360_LOGO_TRIM_MARGIN = 0.015; // Keep 1.5% breathing room around artwork.
const SNOW360_LOGO_HUD_GAP = 2; // Distance to the HUD text above and below.
const snow360LogoCropCache = new Map();

function loadSnow360Image(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
function snow360VisibleBounds(img) {
  const preview = document.createElement("canvas");
  const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
  preview.width = Math.max(1, Math.round(img.naturalWidth * scale));
  preview.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = preview.getContext("2d", {willReadFrequently:true});
  if (!ctx) return {left:0, top:0, right:1, bottom:1};
  ctx.drawImage(img, 0, 0, preview.width, preview.height);
  const pixels = ctx.getImageData(0, 0, preview.width, preview.height).data;
  let left = preview.width, top = preview.height, right = -1, bottom = -1;
  for (let y=0; y<preview.height; y++) {
    for (let x=0; x<preview.width; x++) {
      if (pixels[(y*preview.width+x)*4+3] <= SNOW360_LOGO_ALPHA_THRESHOLD) continue;
      left=Math.min(left,x); top=Math.min(top,y);
      right=Math.max(right,x); bottom=Math.max(bottom,y);
    }
  }
  if (right < left || bottom < top) return {left:0, top:0, right:1, bottom:1};
  return {left:left/preview.width, top:top/preview.height,
    right:(right+1)/preview.width, bottom:(bottom+1)/preview.height};
}
function getSnow360TrimmedLogos(startScreen) {
  const key = startScreen ? "layered" : "hud";
  if (snow360LogoCropCache.has(key)) return snow360LogoCropCache.get(key);
  const task = Promise.all([
    loadSnow360Image(SNOW360_LOGO),
    startScreen ? loadSnow360Image(SNOW360_LOGO_BACKGROUND) : Promise.resolve(null),
  ]).then(([logo,background]) => {
    if (!logo) return {missing:true};
    try {
      const boxes = [logo,background].filter(Boolean).map(snow360VisibleBounds);
      const pad = SNOW360_LOGO_TRIM_MARGIN;
      const left=Math.max(0,Math.min(...boxes.map(b=>b.left))-pad);
      const top=Math.max(0,Math.min(...boxes.map(b=>b.top))-pad);
      const right=Math.min(1,Math.max(...boxes.map(b=>b.right))+pad);
      const bottom=Math.min(1,Math.max(...boxes.map(b=>b.bottom))+pad);
      const sourceWidth=Math.max(1,(right-left)*logo.naturalWidth);
      const sourceHeight=Math.max(1,(bottom-top)*logo.naturalHeight);
      const outputScale=Math.min(1,2304/Math.max(sourceWidth,sourceHeight));
      const width=Math.max(1,Math.round(sourceWidth*outputScale));
      const height=Math.max(1,Math.round(sourceHeight*outputScale));
      const crop = img => {
        if (!img) return null;
        const c=document.createElement("canvas");
        c.width=width; c.height=height;
        c.getContext("2d").drawImage(img,
          left*img.naturalWidth,top*img.naturalHeight,
          (right-left)*img.naturalWidth,(bottom-top)*img.naturalHeight,
          0,0,width,height);
        return c.toDataURL("image/png");
      };
      return {logo:crop(logo),background:crop(background),aspect:width/height};
    } catch {
      // Keep both unmodified PNGs if the browser disallows canvas pixel reads.
      return {logo:SNOW360_LOGO,background:background?SNOW360_LOGO_BACKGROUND:null,
        aspect:logo.naturalWidth/logo.naturalHeight};
    }
  });
  snow360LogoCropCache.set(key,task);
  return task;
}

/** Layered start logo and in-game HUD logo, without vertical letterboxing. */
function Snow360Logo({ startScreen = false, mobile = false }) {
  const [images,setImages] = useState(null);
  useEffect(() => {
    let mounted=true;
    getSnow360TrimmedLogos(startScreen).then(result=>{
      if(mounted) setImages(result);
    });
    return () => {mounted=false;};
  },[startScreen]);
  const hasLogo=images && !images.missing;
  const aspect=hasLogo ? images.aspect : (startScreen ? 960/370 : mobile ? 260/94 : 428/132);
  // V37 maximum logo dimensions are unchanged. Only transparent padding and
  // unnecessary vertical layout space are removed, preserving proportions.
  const maxW=startScreen ? 960 : mobile ? 260 : 428;
  const maxH=startScreen ? 370 : mobile ? 94 : 132;
  const width=Math.min(maxW,maxH*aspect);
  const frame = {
    width:startScreen ? `min(100%, ${width.toFixed(2)}px)` : width,
    aspectRatio:String(aspect),
    margin:startScreen ? "3px auto 3px" : 0,
    position:"relative", flexShrink:0,
  };
  const imgStyle = {
    position:"absolute",inset:0,width:"100%",height:"100%",
    objectFit:"fill",pointerEvents:"none",userSelect:"none",WebkitUserSelect:"none",
  };
  return <div style={frame}>
    {images?.missing ? <div style={{width:"100%",height:"100%",display:"flex",
      justifyContent:startScreen?"center":"flex-start",alignItems:"center",
      fontSize:startScreen?"clamp(34px, 8vw, 64px)":mobile?25:42,
      fontStyle:"italic",fontWeight:1000,letterSpacing:"-.04em",lineHeight:1,
      color:"#fdf3ce",textShadow:"3px 4px #245a6e"}}>
      SNOW<span style={{color:"#f796b6"}}>360</span>
    </div> : <>
      {startScreen && <img src={hasLogo?images.background||SNOW360_LOGO_BACKGROUND:SNOW360_LOGO_BACKGROUND}
        alt="" aria-hidden="true" loading="eager" decoding="async" draggable={false}
        onError={e=>{e.currentTarget.style.display="none";}}
        style={{...imgStyle,zIndex:0}} />}
      <img src={hasLogo?images.logo:SNOW360_LOGO} alt="SNOW 360"
        loading="eager" decoding="async" draggable={false}
        style={{...imgStyle,zIndex:1}} />
    </>}
  </div>;
}

export default function SnowboardGame(){
  const [phase,setPhase]=useState("ready");
  const [runKey,setRunKey]=useState(0);
  const [mobile,setMobile]=useState(null);
  // Default to clean HD. The retro filter is opt-in on the title screen only.
  const [retro,setRetro]=useState(false);
  // Default to classic drawing; selectable on the start / new-run screen.
  const [trickMode,setTrickMode]=useState("draw");
  const [soundOn,setSoundOn]=useState(true);
  const soundRef=useRef(true);
  const [best,setBest]=useState(0);
  const [hud,setHud]=useState({speed:57,score:SNOW_INITIAL_SCORE,peakScore:SNOW_INITIAL_SCORE,drainRate:snowDrainPerSecond(0),distance:0,time:0,combo:0,coins:0,hits:0,air:false,trick:""});
  const [touchTuckFx,setTouchTuckFx]=useState(false);
  const sound=useCallback(kind=>{if(soundRef.current)playSnow64Sound(kind);},[]);
  const frostMusicActive=phase==="playing" && hud.powerRemaining>0;
  useEffect(()=>{
    if(!frostMusicActive || !soundRef.current)return;
    return playSnow64FrostMusic();
  },[frostMusicActive,soundOn]);
  useEffect(()=>{
    if(phase!=="playing")updateSnow64AudioFrame({playing:false});
  },[phase]);
  useEffect(()=>()=>{
    updateSnow64AudioFrame({playing:false});
    shutdownSnow64Audio();
  },[]);
  const input=useRef({left:false,right:false,tuck:false,steerAnalog:0,touchTuck:false});
  const queue=useRef([]);
  const cameraOrbit=useRef({yaw:0,pitch:0,dragging:false});
  const state=useRef(initialState());
  const collected=useRef(new Set());
  const lastPhase=useRef(phase);
  const lastHeldTrick=useRef(0);
  useEffect(()=>{
    // Play pause/resume cues on committed state changes, not inside React setState updaters.
    if(lastPhase.current!==phase){
      if(phase==="paused")sound("pause");
      else if(phase==="playing" && lastPhase.current==="paused")sound("resume");
    }
    lastPhase.current=phase;
  },[phase,sound]);
  useEffect(()=>{
    const m=window.matchMedia("(max-width: 720px), (pointer: coarse)");
    const update=()=>setMobile(m.matches);update();m.addEventListener?.("change",update);
    try{setBest(Number(localStorage.getItem("pidgeonkitty-snow-64-best")||0));}catch{}
    return()=>m.removeEventListener?.("change",update);
  },[]);
  const start=useCallback(()=>{
    input.current.left=false;input.current.right=false;input.current.tuck=false;input.current.steerAnalog=0;input.current.touchTuck=false;
    queue.current.length=0;collected.current.clear();state.current=initialState(mobile?1:0);
    cameraOrbit.current.yaw=0;cameraOrbit.current.pitch=0;cameraOrbit.current.dragging=false;
    // Start audio only on this user gesture (required by mobile browsers).
    if(soundRef.current)unlockSnow64Audio();
    setHud(safeHud(state.current));setRunKey(k=>k+1);setPhase("playing");sound("start");
  },[sound,mobile]);
  const onFinish=useCallback(h=>{
    setHud(h);setPhase("finished");
    setBest(b=>{const v=Math.max(b,h.peakScore);try{localStorage.setItem("pidgeonkitty-snow-64-best",String(v));}catch{}return v;});
  },[]);
  const pause=useCallback(()=>setPhase(p=>p==="playing"?"paused":p==="paused"?"playing":p),[]);
  const act=useCallback((command)=>{queue.current.push(command);},[]);
  useEffect(()=>{
    const down=e=>{
      // Let the title-screen N64 filter button handle Enter/Space itself.
      if (e.target?.closest?.("button")) return;
      const key=e.key.toLowerCase();
      const block=[" ","arrowleft","arrowright","arrowup","arrowdown"];
      if(block.includes(key))e.preventDefault();
      if(key==="a"||key==="arrowleft")input.current.left=true;
      if(key==="d"||key==="arrowright")input.current.right=true;
      if(key==="w"||key==="arrowup")input.current.tuck=true;
      if(e.repeat){
        // Holding a trick key repeats it at a controlled rate. Repeated taps
        // are never throttled, so intentional spam still works.
        if(!(/^[0-9]$/.test(key)||key==="f"))return;
        if(performance.now()-lastHeldTrick.current<175)return;
        lastHeldTrick.current=performance.now();
      }
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
  const currentBest=Math.max(best,hud.peakScore);
  return <main onContextMenu={e=>{if(mobile)e.preventDefault();}} style={{position:"fixed",inset:0,overflow:"hidden",background:"#bedae7",color:"#ffffff",fontFamily:"Arial, Helvetica, sans-serif",touchAction:mobile?"none":"auto",overscrollBehavior:"none",userSelect:mobile?"none":"auto",WebkitUserSelect:mobile?"none":"auto"}}>
    <style>{`
      @keyframes snowboardPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
      @keyframes snowboardFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
      @keyframes snow64MagicSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      @keyframes snow64MagicTwinkle{0%,100%{opacity:.35;transform:scale(.72) rotate(-16deg)}50%{opacity:1;transform:scale(1.4) rotate(16deg)}}
      @keyframes snow64MagicReveal{0%{opacity:0}30%{opacity:1}100%{opacity:0}}
      .snow64-magic-halo{animation:snow64MagicSpin 9s linear infinite;will-change:transform}
      .snow64-magic-star{animation:snow64MagicTwinkle 1.65s ease-in-out infinite}
      .snow64-magic-title{animation:snow64MagicReveal 1.65s ease-out both}
      @media (prefers-reduced-motion:reduce){.snow64-magic-halo,.snow64-magic-star,.snow64-magic-title{animation:none!important}}
      @keyframes snow64RushLayer{from{transform:scale(.94);opacity:.4}to{transform:scale(1.13);opacity:1}}
      .snow64-rush-layer{animation:snow64RushLayer .35s linear infinite;transform-origin:50% 50%;}
      @media (prefers-reduced-motion: reduce){.snow64-speedfx{display:none!important}}
      .snow64-iconbtn{transition:background .10s ease,transform .10s ease}
      .snow64-iconbtn:active{transform:scale(.92);filter:brightness(1.3)}
      .snow64-iconbtn:focus-visible{outline:3px solid #fff1a3;outline-offset:1px}
      .snow64-panel{background:linear-gradient(130deg,#153b55ee,#0f2d46db);border:2px solid #c5eff4;border-radius:9px;box-shadow:3px 5px 0 #0e2a39bb;padding:8px 13px}
      .snow64-label{font-size:10px;font-weight:900;letter-spacing:.17em;color:#8feaf1}
      .snow64-number{font-weight:1000;font-style:italic;font-size:clamp(17px,2.6vw,30px);letter-spacing:.025em;text-shadow:2px 2px #193447}
      .snow64-trick{font-size:clamp(18px,3vw,40px);font-weight:1000;font-style:italic;color:#ffe581;text-shadow:3px 3px #194764;letter-spacing:.035em}
      @media(max-width:680px){.snow64-label{font-size:8px}.snow64-panel{padding:5px 8px}.snow64-hud{gap:5px!important}}
    `}</style>
    <div style={{position:"absolute",inset:0,zIndex:0}}>
      {mobile!==null && <Canvas key={retro ? "retro" : "hd"} dpr={retro?[.75,mobile?1:1.12]:[1,mobile?1.1:1.7]} camera={{position:[-3,2.4,5.6],fov:42,near:.08,far:230}} gl={{antialias:!retro, powerPreference:"high-performance"}}>
        <Scene mobile={mobile} phase={phase} runKey={runKey} keyRef={input} queueRef={queue} cameraOrbitRef={cameraOrbit} stateRef={state} collectedRef={collected} distance={hud.distance} onHud={setHud} onFinish={onFinish} onSound={sound}/>
      </Canvas>}
    </div>
    <SpeedRush mobile={mobile===true} active={phase==="playing" && (hud.powerRemaining>0 || (mobile?touchTuckFx:hud.pose==="SnowboardTuck"))} speed={hud.speed}/>
    {phase==="playing" && <FrostMagicOverlay remaining={hud.powerRemaining||0} mobile={mobile===true}/>}
    {/* Original retro filter, enabled only by the optional title-screen setting. */}
    {retro && <div aria-hidden="true" style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:1,opacity:.13,background:"repeating-linear-gradient(0deg,transparent 0px,transparent 3px,#002c3b 4px)"}}/>}
    <div style={{position:"absolute",left:0,right:0,top:0,zIndex:3,padding:"clamp(9px,2vw,22px)",display:"flex",flexDirection:mobile?"column":"row",justifyContent:"space-between",alignItems:"flex-start",gap:mobile?9:10,pointerEvents:"none"}}>
      <div style={{display:"flex",flexDirection:"column",gap:SNOW360_LOGO_HUD_GAP,filter:"drop-shadow(2px 3px #103348)"}}>
        <div style={{fontSize:10,fontWeight:900,letterSpacing:".24em",color:"#eefffc"}}>PIDGEONKITTY PRESENTS</div>
        <Snow360Logo mobile={mobile===true} />
        <div style={{fontSize:10,fontWeight:900,letterSpacing:".16em",color:"#cdfaff"}}>DOWNHILL FREESTYLE</div>
      </div>
      <div className="snow64-hud" style={{display:"flex",gap:8,alignItems:"stretch",alignSelf:mobile?"stretch":"auto",justifyContent:mobile?"space-between":"flex-start"}}>
        {[{label:"SPEED",value:hud.speed,unit:"KM/H"},{label:"TIME",value:formatTime(hud.time)},{label:"SCORE",value:hud.score.toLocaleString()}].map(v=><div key={v.label} className="snow64-panel" style={{minWidth:mobile?65:100,textAlign:"center"}}><div className="snow64-label">{v.label}</div><div className="snow64-number">{v.value}<span style={{fontSize:9,marginLeft:2}}>{v.unit}</span></div></div>)}
      </div>
    </div>
    {phase==="playing" && <div style={{position:"absolute",zIndex:3,top:mobile?192:145,left:"50%",transform:"translateX(-50%)",textAlign:"center",pointerEvents:"none"}}>
      {hud.powerRemaining>0 && <div style={{font:"900 13px system-ui",color:"#b9ffeb",textShadow:"1px 2px #165473",letterSpacing:".07em"}}>✦ FROST SHROOM {hud.powerRemaining.toFixed(1)}s • {hud.rockShattered||0} ROCKS ✦</div>}
      {hud.powerRemaining<=0 && hud.shieldRemaining>0 && <div style={{font:"900 12px system-ui",color:"#b9ffeb",textShadow:"1px 2px #165473",letterSpacing:".08em"}}>❄ FROST SHIELD {hud.shieldRemaining.toFixed(1)}s ❄</div>}
      {hud.trick&&<div className="snow64-trick" style={{animation:"snowboardFloat .5s ease-in-out infinite"}}>{hud.trick}</div>}
      {hud.air && <div style={{fontWeight:900,color:"#d7f8ff",textShadow:"2px 2px #285467",fontSize:12}}>AIR {hud.airHeight.toFixed(1)}m · PEAK {hud.peakAir.toFixed(1)}m</div>}
      {hud.recovery!=="riding" && <div style={{fontWeight:900,color:"#ffd89a",textShadow:"2px 2px #285467",fontSize:12}}> {hud.recovery==="chasing" ? "RUNNING BACK TO THE BOARD" : hud.recovery==="remounting" ? "REMOUNTING" : "RIDER DOWN"}</div>}
      {hud.combo>1&&<div style={{fontWeight:900,letterSpacing:".15em",color:"#f8ffff",textShadow:"2px 2px #285467"}}>COMBO ×{hud.combo}</div>}
    </div>}
    <div style={{position:"absolute",right:mobile?10:20,top:mobile?100:121,zIndex:3,pointerEvents:"none",textAlign:"right"}}>
      <div className="snow64-label" style={{color:"#22546c",textShadow:"1px 1px #e6f7ff"}}>ENDLESS DOWNHILL</div>
      <div style={{fontSize:mobile?15:19,color:"#16445a",fontWeight:1000,textShadow:"1px 1px #e9f8ff"}}>{hud.distance.toLocaleString()} m</div>
      <div style={{fontSize:mobile?10:12,color:hud.score<Math.max(900,hud.drainRate*9)?"#bb395b":"#20536a",fontWeight:900,textShadow:"1px 1px #f4faff"}}>−{hud.drainRate.toFixed(1)} PTS / SEC</div>
    </div>
    {(phase==="ready"||phase==="paused"||phase==="finished")&&<div onClick={e=>{if(e.target?.closest?.("button"))return;phase==="paused"?pause():start();}} style={{position:"absolute",inset:0,zIndex:6,background:"linear-gradient(145deg,#092e4ab9,#163c58b0)",display:"grid",placeItems:"center",padding:16,cursor:"pointer"}}>
      <div style={{maxWidth:mobile?560:1060,width:"min(100%,1060px)",maxHeight:"calc(100dvh - 24px)",overflowY:"auto",border:"3px solid #d9f4ff",borderRadius:14,padding:"clamp(14px,3vw,30px)",background:"linear-gradient(155deg,#123e5cf5,#142c4ff2)",boxShadow:"8px 10px 0 #123145aa",textAlign:"center"}}>
        <div style={{letterSpacing:".24em",fontSize:12,fontWeight:900,color:"#a8e7ed"}}>ARCADE FREESTYLE • WINTER CUP</div>
        <Snow360Logo startScreen mobile={mobile===true} />
        <p style={{lineHeight:1.6,fontWeight:700,color:"#dbf3ff",fontSize:14,margin:"15px 0 16px"}}>{phase==="ready"?"ENDLESS SURVIVAL! Your score drains faster the farther you ride. Land tricks and collect tokens to stay alive. Wipeouts cost points. Reach zero and the run is over!":phase==="paused"?"Ride paused. Tap or click anywhere to resume.":`SCORE DEPLETED! Survived ${hud.distance.toLocaleString()} m · Peak ${hud.peakScore.toLocaleString()} points · ${hud.hits} wipeouts`}</p>
        {phase==="finished"&&<div style={{color:"#ffda75",fontSize:18,fontWeight:900,marginBottom:15}}>BEST PEAK: {currentBest.toLocaleString()} PTS</div>}
        {phase==="paused"&&<button type="button" aria-pressed={soundOn}
          onClick={e=>{e.stopPropagation();const next=!soundRef.current;soundRef.current=next;
            setSoundOn(next);setSnow64AudioEnabled(next);if(next)unlockSnow64Audio();}}
          style={{padding:"9px 15px",border:"2px solid #d7f4ff",borderRadius:9,
            background:soundOn?"#b7e8ce":"#163d59",color:soundOn?"#213e42":"#f3fbff",
            font:"900 11px system-ui",cursor:"pointer",touchAction:"manipulation"}}>
          {soundOn?"♪ SOUND & MUSIC: ON":"♪ SOUND & MUSIC: OFF"}
        </button>}
        {(phase==="ready"||phase==="finished") && <div data-snow64-settings="true"
          onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
          style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,margin:"0 0 16px"}}>
          <div role="group" aria-label="Trick input style" style={{width:"100%",maxWidth:370}}>
            <div style={{font:"900 11px system-ui,sans-serif",letterSpacing:".1em",color:"#a8e7ed",marginBottom:7}}>CHOOSE TRICK CONTROLS</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["draw","✎ DRAW TRICKS"],["buttons","▦ TRICK BUTTONS"]].map(([mode,label])=><button
                key={mode} type="button" aria-pressed={trickMode===mode} onClick={e=>{e.stopPropagation();setTrickMode(mode);}}
                style={{padding:"11px 7px",border:"2px solid",borderColor:trickMode===mode?"#ffe998":"#7caec4",
                  borderRadius:9,background:trickMode===mode?"#f7cc8d":"#153c56",
                  color:trickMode===mode?"#20394d":"#f0faff",font:"900 12px system-ui,sans-serif",
                  letterSpacing:".025em",cursor:"pointer",touchAction:"manipulation"}}>{label}</button>)}
            </div>
            <div style={{fontSize:10,color:"#c8e7f2",marginTop:6}}>{trickMode==="draw"
              ? "Draw glowing gestures on mobile; airborne taps still perform grabs."
              : "All 11 tricks + an Ollie button appear in a compact corner pad."}</div>
          </div>
          <button type="button" aria-pressed={soundOn} aria-label="Toggle game sound effects and music"
            onClick={e=>{e.stopPropagation();const next=!soundRef.current;
              soundRef.current=next;setSoundOn(next);setSnow64AudioEnabled(next);
              if(next){unlockSnow64Audio();playSnow64Sound("pickup");}}}
            style={{padding:"8px 14px",border:"2px solid #d7f4ff",borderRadius:9,
              background:soundOn?"#b7e8ce":"#163d59",color:soundOn?"#213e42":"#f3fbff",
              font:"900 11px system-ui,sans-serif",letterSpacing:".055em",cursor:"pointer",touchAction:"manipulation"}}>
            {soundOn?"♪ SOUND & MUSIC: ON":"♪ SOUND & MUSIC: OFF"}
          </button>
          <button type="button" aria-pressed={retro}
            onClick={e=>{e.stopPropagation();setRetro(v=>!v);}}
            style={{padding:"8px 14px",border:"2px solid #d7f4ff",borderRadius:9,
              background:retro?"#f7cc8d":"#163d59",color:retro?"#223448":"#f3fbff",
              font:"900 11px system-ui,sans-serif",letterSpacing:".055em",cursor:"pointer",touchAction:"manipulation"}}>
            N64 FILTER: {retro?"ON":"OFF"}
          </button>
        </div>}
        <div style={{fontSize:22,fontStyle:"italic",fontWeight:1000,color:"#ffe395",animation:"snowboardPulse 1.7s ease-in-out infinite"}}>{phase==="ready"?"TAP / CLICK ANYWHERE TO START":phase==="paused"?"TAP / CLICK ANYWHERE TO RESUME":"TAP / CLICK ANYWHERE TO RIDE AGAIN"}</div>
        <p style={{fontSize:11,color:"#b3dbe9",lineHeight:1.7,margin:"22px 0 0"}}>{mobile ? <>LEFT HALF: DRAG TO CARVE · DRAG UP TO TUCK<br/>{trickMode==="draw"?"RIGHT HALF: TAP TO JUMP · AIR TAP = GRAB · FLICK OR DRAW TRICKS":"RIGHT HALF: TAP TO JUMP · USE THE ICONS FOR ALL TRICKS"}<br/>TOP CENTER: DRAG TO ROTATE FOLLOW CAMERA (CAMERA 2 DEFAULT)</> : <>A / D = CARVE &nbsp; • &nbsp; W = TUCK &nbsp; • &nbsp; SPACE = OLLIE · SHIFT+SPACE = POWER<br/>{trickMode==="draw"?"1–0 / F = TRICKS":"TAP ICON BUTTONS OR USE 1–0 / F FOR TRICKS"} &nbsp; • &nbsp; TOP CENTER DRAG = ORBIT &nbsp; • &nbsp; C = CAMERA &nbsp; • &nbsp; P = PAUSE</>}</p>
      </div>
    </div>}
    {phase==="playing" && <FollowCameraDragArea cameraOrbitRef={cameraOrbit} mobile={mobile} />}
    {mobile && phase==="playing" ? <MobileTouchControls inputRef={input} stateRef={state} act={act} phase={phase} runKey={runKey} trickMode={trickMode} onTuckChange={setTouchTuckFx} /> : null}
    {phase==="playing" && trickMode==="buttons" && <Snow64TrickButtonPad act={act} mobile={mobile===true}/>}
    {phase==="playing" && <>
      <div style={{position:"absolute",bottom:mobile?14:18,left:mobile?10:24,zIndex:3,pointerEvents:"none",color:"#1a5268",fontSize:mobile?9:12,fontWeight:900,textShadow:"1px 1px #e9f8ff"}}>BEST {currentBest.toLocaleString()} &nbsp; ✦ {hud.coins} TOKENS</div>
      {!mobile && <div style={{position:"absolute",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:3,pointerEvents:"none",color:"#174760",fontSize:11,fontWeight:900,textShadow:"1px 1px #effbff",letterSpacing:".04em"}}>{trickMode==="buttons"?"A / D CARVE · W TUCK · TAP TRICK ICONS OR 1–0 / F · TOP CENTER DRAG ORBIT · P PAUSE · C CAMERA":"A / D CARVE · W TUCK · SPACE OLLIE · SHIFT+SPACE POWER · 1–0 / F TRICKS · TOP CENTER DRAG ORBIT · P PAUSE · C CAMERA"}</div>}
    </>}
  </main>;
}

