"use client";

import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import Snow360PerformanceRecorder from "./Snow360PerformanceRecorder";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { classifySnowGesture } from "./snow64Gestures";
import { judgeSnowLanding, recoveryStage, recoveryDuration } from "./snow64Landing";
import { SNOW_GRAVITY, startSnowJump, stepSnowJump, rampTakeoffSpeed, crossedRampLip } from "./snow64Physics";
import { createSnow360PlushResponse, snow360GripResponse } from "./snow360PlushPhysics";
import { snowSurfaceAt, sweptRockHit, sweptRampSideHit, sweptAirRampContact } from "./snow64Collision";
import { recordSnowPoints, maybeSpawnIcecreamPower, icecreamPowerCollision, activateIcecreamPower } from "./snow64Powerup";
import { SNOW_CHUNK_LENGTH, SNOW_INITIAL_SCORE, getSnowChunk, snowChunkIndex, snowDrainPerSecond, pruneSnowVisited } from "./snow64Endless";
import { enqueueAirTrick, beginNextAirTrick, advanceAirTricks, judgeAirTrickChain, resetAirTrickChain } from "./snow64TrickChain";
import { createCrashBoard, createCrashRider, stepCrashBoard, stepCrashRider } from "./snow64CrashPhysics";
import { Snow64ModelProvider, useSnowModel, SnowGLBVisual, SnowGLBInstances } from "./snow64VisualModels";
import { SNOW64_SNOWBOARD_FOOT_TUNE } from "./snow64ModelConfig";
import { SNOW64_TERRAIN } from "./snow64Appearance";
import { Snow64TextureProvider, useSnow64TerrainMaterials, useSnow64SkylineMaterial, useSnow64Texture, useSnow64CorePlanetFilmMaterial } from "./snow64VisualMaterials";
import { snow360Drift } from "./snow64SnowDrifts";
import { applySnowbankSkylineGroups } from "./snow64SkylineFade";
import Snow64HDRSky from "./Snow64HDRSky";
import Snow360RiderSecret from "./Snow360RiderSecret";
import Snow360RiderBoundary from "./Snow360RiderBoundary";
import { getSnow360Rider, assertSnow360Clips, snow360CarvePose } from "./snow360RiderConfig";
import { createSnow360RiderAnimator } from "./snow360RiderAnimator";
import { Snow64ExplosionVFX } from "./snow64ExplosionVFX";
import { useSnow64Obstacles, Snow64ObstacleField, Snow64ObstacleShatterVFX, getSnow64ObstacleParams, getSnow64ObstacleBaseY, snow64ObstacleHit } from "./snow64Obstacles";
import Snow360CloudRamp from "./Snow360CloudRamps";
import Snow64CloudLayer from "./Snow64CloudLayer";
import Snow64SundaeTrees from "./Snow64SundaeTrees";
import Snow64StarTokens from "./Snow64StarTokens";
import Snow64SnowboardGlow from "./Snow64SnowboardGlow";
import Snow64IcecreamPowerAura from "./Snow64IcecreamPowerAura";
import Snow360IcecreamPowerScene from "./Snow360IcecreamPowerScene";
import { playSnow64Sound, playSnow64FrostMusic as playSnow64IcecreamPowerMusic, unlockSnow64Audio, setSnow64AudioEnabled, updateSnow64AudioFrame, shutdownSnow64Audio } from "./snow64Audio";

// PidgeonKitty Snow 64. Original arcade game inspired by late-1990s N64 snowboarding.
// No Nintendo/N64 game assets are used. Scenery can optionally use custom GLBs from public/models/.
// Files inside public/ are loaded from the site root (without the /public prefix).
// Swap either image in public/images/ to update the brand without editing JSX.
const SNOW360_LOGO = "/images/Snow360Logo.png";
const SNOW360_LOGO_BACKGROUND = "/images/Snow360Logo-background.png";

const SLOPE = 0.077;
const LANES = [-7.4, -3.8, 0, 3.8, 7.4];
const DEG = Math.PI / 180;
const TOKEN_POINTS = 360;
const ICECREAM_HOVER_HEIGHT = 1.28; // Snowboard floats above actual snow/ramp surfaces.
const ICECREAM_HOVER_BOB = 0.12;
const ICECREAM_POST_SHIELD_SECONDS = 2; // Normal snowboarding, but collision-safe after Ice-cream Power.
// V33: powered snowboarding gets its own visible left/right slalom movement.
// The old hover movement used the much weaker airborne steering limit (5).
const ICECREAM_CARVE_AMPLITUDE = 4.45;
const ICECREAM_CARVE_PERIOD = 2.95;
const ICECREAM_CARVE_MAX_LATERAL_SPEED = 14.5;
// V34: lock onto reachable obstacles ahead, instead of nudging only toward
// rocks already close to the slalom line. Impact camera briefly stays with
// the actual explosion, so it remains visible at Icecream speed.
const ICECREAM_ROCK_LOOKAHEAD = 103;
const ICECREAM_IMPACT_SHOT_SECONDS = .38;
// The original icecreamPower boost lasts 9 seconds (snow64Powerup.js).
const ICECREAM_AUTO_TRICKS = ["6", "2", "5", "9", "7", "0", "3", "f", "8", "4"];
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
  // Same deterministic snow mounds for rider, terrain, rocks, trees and ramps.
  return SLOPE * z + rolled + bank * bank * 0.055 + snow360Drift(x, z);
}

/** Match the rendered terrain's analytic normals to its physical height. */
function snowGroundAndSlope(x, z) {
  const phase = x * 0.22 - z * 0.018;
  const bank = Math.max(0, Math.abs(x) - 12);
  const drift = snow360Drift(x, z, true);
  return {
    y: SLOPE * z + 0.5 * Math.sin(-z * 0.04) + 0.31 * Math.sin(phase)
      + bank * bank * 0.055 + drift.height,
    dx: 0.31 * 0.22 * Math.cos(phase)
      + (bank > 0 ? Math.sign(x) * 0.11 * bank : 0) + drift.dx,
    dz: SLOPE - 0.02 * Math.cos(-z * 0.04)
      - 0.31 * 0.018 * Math.cos(phase) + drift.dz,
  };
}

function Terrain({index, mobile=false}) {
  const corePlanetFilm=useSnow64CorePlanetFilmMaterial();
  // One shared snow shader and one continuous world-space UV field for the
  // entire center and both banks. No separate material boundary is visible.
  const material = useSnow64TerrainMaterials();
  const skylineMaterial = useSnow64SkylineMaterial();
  const geometry = useMemo(() => {
    const vertices = [], uvs = [], normals = [], colors = [], indices = [];
    // More triangles where the drift silhouettes need them, but cheaper on mobile.
    const halfWidth = 34;
    const stepsX = mobile ? 50 : 68;
    const stepsZ = mobile ? 88 : 120;
    const c = new THREE.Color();
    const smooth = t => { const v = clamp(t, 0, 1); return v * v * (3 - 2 * v); };
    for (let i = 0; i <= stepsZ; i++) {
      const z = 32 - index * SNOW_CHUNK_LENGTH - i * (SNOW_CHUNK_LENGTH / stepsZ);
      for (let j = 0; j <= stepsX; j++) {
        const x = -halfWidth + j / stepsX * (halfWidth * 2);
        const snow = snowGroundAndSlope(x, z);
        vertices.push(x, snow.y, z);

        // Absolutely anchored to the terrain coordinates. Moving the rider
        // makes the snowy surface flow under the board, without UV scrolling.
        // Neighboring endless chunks share exactly matching UV coordinates.
        uvs.push(x / SNOW64_TERRAIN.textureTileMeters,
          -z / SNOW64_TERRAIN.textureTileMeters);

        // Analytic derivatives of groundY. Recomputing face normals inside
        // each chunk caused different shading along the shared chunk border.
        const inv = 1 / Math.hypot(snow.dx, 1, snow.dz);
        normals.push(-snow.dx * inv, inv, -snow.dz * inv);

        // Deterministic WORLD-COORDINATE tint, never row or chunk index.
        // Side snow gradually acquires a little extra lavender depth near trees.
        const side = smooth((Math.abs(x) - 10.5) / 8.5);
        const breath = Math.sin(x * 0.31 + z * 0.083)
          * Math.sin(x * 0.17 - z * 0.19);
        const shade = 0.981 + breath * 0.010 - side * 0.026;
        c.setRGB(shade * (1.0 - side * 0.006),
          shade * (1.0 - side * 0.004), shade);
        colors.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < stepsZ; i++) {
      for (let j = 0; j < stepsX; j++) {
        const a = i * (stepsX + 1) + j;
        const b = a + stepsX + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    applySnowbankSkylineGroups(g, vertices, indices);
    g.computeBoundingSphere();
    return g;
  }, [index, mobile]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <>
    <mesh geometry={geometry} material={[material, skylineMaterial]} receiveShadow={false}/>
    <mesh geometry={geometry} material={corePlanetFilm}
      renderOrder={1} castShadow={false} receiveShadow={false}
      frustumCulled={false}/>
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

/** Ice-cream Power: larger PBR GLB in a bright Fresnel bubble with a perfectly clear center. */
function IcecreamPowerCollectible({stateRef,mobile=false}) {
  const asset=useSnowModel("icecreamPower");
  const group=useRef(null);
  useFrame(({clock})=>{
    const g=group.current;
    if(!g)return;
    const item=stateRef.current.icecreamPower;
    g.visible=!!item;
    if(!item)return;
    g.position.set(item.x,groundY(item.x,item.z)+1.05+Math.sin(clock.elapsedTime*3.0)*.18,item.z);
    g.rotation.y=clock.elapsedTime*1.4;
  });
  return <group ref={group} visible={false}>
    <Snow64IcecreamPowerAura mobile={mobile}/>
    {asset ? <group position={[0,-.38,0]}>
      <SnowGLBVisual asset={asset} type="icecreamPower" dimensions={[1.48,2.10,1.43]}/>
    </group> : <group position={[0,-.22,0]}>
      {/* Low-poly dessert fallback, never the old purple mushroom. */}
      <mesh position={[0,.28,0]} rotation={[0,0,Math.PI]}>
        <coneGeometry args={[.38,.66,10,1]}/>
        <meshStandardMaterial color="#f5a5c7" roughness={.75}/>
      </mesh>
      <mesh position={[0,.70,0]} scale={[.68,.60,.68]}>
        <sphereGeometry args={[1,14,10]}/>
        <meshStandardMaterial color="#ffb6d8" roughness={.78}/>
      </mesh>
      <mesh position={[0,.99,0]} scale={[.46,.23,.46]}>
        <sphereGeometry args={[1,12,8]}/>
        <meshStandardMaterial color="#fff4ee" roughness={.55}/>
      </mesh>
      <mesh position={[0,1.23,0]}>
        <sphereGeometry args={[.135,10,8]}/>
        <meshStandardMaterial color="#ee528b" roughness={.28}/>
      </mesh>
      {Array.from({length:9},(_,i)=>{
        const angle=i*Math.PI*2/9;
        return <mesh key={i} position={[Math.cos(angle)*.44,.75+(i%3)*.09,Math.sin(angle)*.44]}
          rotation={[0,angle,Math.PI/4]}>
          <capsuleGeometry args={[.027,.11,2,5]}/>
          <meshStandardMaterial color={['#b8f0ed','#ffe68a','#d3b5ff'][i%3]}/>
        </mesh>;
      })}
    </group>}
  </group>;
}

// SNOW360 V8: Original V3 dreamy neon signs, DIRECTION FIX ONLY.
// The same glowing arrow texture and candy-striped poles are preserved.
// Every arrow lies in the vertical YZ plane and points downhill along -Z.
const COURSE_MARKER_SIDE_X = 12.35;
const COURSE_MARKER_UPHILL_SHIFT = 12.0;
const CANDY_MARKER_COUNT = 5;
const CANDY_MARKER_SPACING = 2.85;
const CANDY_MARKER_SIGN_X_OFFSET = 0.34;
const CANDY_MARKER_CONNECTOR_X = 0.19;
const dreamyChevronTextureCache = new Map();

function dreamyChevronStroke(ctx){
  // A bold, friendly > shape, drawn as a wide rounded ribbon, NOT a signboard.
  ctx.beginPath();
  ctx.moveTo(146,147);
  ctx.lineTo(344,256);
  ctx.lineTo(146,365);
}
function dreamyFourPointStar(ctx,x,y,r){
  ctx.beginPath();
  ctx.moveTo(x,y-r);
  ctx.quadraticCurveTo(x+r*.17,y-r*.17,x+r,y);
  ctx.quadraticCurveTo(x+r*.17,y+r*.17,x,y+r);
  ctx.quadraticCurveTo(x-r*.17,y+r*.17,x-r,y);
  ctx.quadraticCurveTo(x-r*.17,y-r*.17,x,y-r);
  ctx.closePath();
}
function makeSnow360DreamyArrowTexture(mobile,variant=0,halo=false){
  if(typeof document==='undefined')return null;
  const key=`arrow:${mobile?'m':'d'}:${variant}:${halo?'halo':'core'}`;
  if(dreamyChevronTextureCache.has(key))return dreamyChevronTextureCache.get(key);
  const res=mobile?256:512;
  const c=document.createElement('canvas');
  c.width=c.height=res;
  const ctx=c.getContext('2d');
  if(!ctx)return null;
  ctx.scale(res/512,res/512);
  ctx.lineCap='round';ctx.lineJoin='round';
  // A few restrained, closely related sorbet colors across the 5 signs.
  const palettes=[
    ['#ff8ec8','#ffbbe1','#fff5f9','#fffef3'],
    ['#ffaac1','#ffddcb','#fff4ea','#fffdec'],
    ['#c8a9ff','#e1caff','#fff1ff','#fffdfb'],
    ['#94e8ee','#d0f4fa','#fff9f0','#ffffff'],
    ['#ff9fdb','#ffd5ef','#fff4fc','#ffffef'],
  ];
  const [aura,candy,cream,hot]=palettes[variant%palettes.length];
  const stroke=(width,color,blur=0,shadow=color)=>{
    ctx.save();
    dreamyChevronStroke(ctx);
    ctx.lineWidth=width;
    ctx.strokeStyle=color;
    ctx.shadowColor=shadow;
    ctx.shadowBlur=blur;
    ctx.stroke();
    ctx.restore();
  };
  if(halo){
    // Only glow occupies this transparent canvas: no rectangle/waffle backing.
    stroke(112,'rgba(255,247,253,.11)',86,aura);
    stroke(94,'rgba(255,241,253,.28)',64,aura);
    stroke(72,'rgba(255,252,240,.48)',51,candy);
    stroke(43,'rgba(255,255,255,.44)',42,cream);
  }else{
    // Glossy, chunky candy tube with a hot vanilla-white luminous core.
    stroke(108,aura,27,aura);
    stroke(91,candy,15,candy);
    stroke(71,cream,9,cream);
    const g=ctx.createLinearGradient(92,160,373,360);
    g.addColorStop(0,cream);g.addColorStop(.52,hot);g.addColorStop(1,candy);
    stroke(46,g,8,hot);
    stroke(19,hot,17,hot);
    stroke(6,'rgba(255,255,255,.98)',6,'#ffffff');
    // Tiny glossy breaks make the surface feel like pearly frosting.
    ctx.save();ctx.globalAlpha=.72;
    stroke(2.4,'#ffffff',2,'#ffffff');ctx.restore();
  }
  // Little floating fairy lights, intentionally isolated from the main sign.
  const motes=[
    [91,134,8],[393,140,7],[411,344,8],[105,400,6],[255,88,5],[267,424,5],
  ];
  for(let i=0;i<motes.length;i++){
    const [x,y,r]=motes[i];
    ctx.save();
    ctx.fillStyle=i%3===0?'#fff1be':i%3===1?'#d7faff':'#ffe6fa';
    ctx.shadowColor=aura;ctx.shadowBlur=halo?32:11;
    dreamyFourPointStar(ctx,x,y,r*(halo?1.5:1));ctx.fill();
    ctx.restore();
  }
  const tex=new THREE.CanvasTexture(c);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.minFilter=THREE.LinearFilter;
  tex.magFilter=THREE.LinearFilter;
  tex.generateMipmaps=false;
  tex.needsUpdate=true;
  dreamyChevronTextureCache.set(key,tex);
  return tex;
}
function makeSnow360DreamyPoleTexture(){
  if(typeof document==='undefined')return null;
  const key='dreamy-pole';
  if(dreamyChevronTextureCache.has(key))return dreamyChevronTextureCache.get(key);
  const canvas=document.createElement('canvas');
  canvas.width=96;canvas.height=256;
  const ctx=canvas.getContext('2d');
  const bg=ctx.createLinearGradient(0,0,96,0);
  bg.addColorStop(0,'#f9dbeb');bg.addColorStop(.37,'#fff8f1');
  bg.addColorStop(.77,'#ffefef');bg.addColorStop(1,'#e4b7da');
  ctx.fillStyle=bg;ctx.fillRect(0,0,96,256);
  for(let y=-205;y<460;y+=77){
    ctx.beginPath();ctx.moveTo(-10,y);ctx.lineTo(110,y+89);
    ctx.lineTo(110,y+124);ctx.lineTo(-10,y+35);ctx.closePath();
    ctx.fillStyle='#f6a9d0';ctx.fill();
    ctx.beginPath();ctx.moveTo(-10,y+39);ctx.lineTo(110,y+128);
    ctx.lineWidth=4;ctx.strokeStyle='rgba(255,255,255,.72)';ctx.stroke();
  }
  const t=new THREE.CanvasTexture(canvas);
  t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;
  t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;
  t.generateMipmaps=false;t.needsUpdate=true;
  dreamyChevronTextureCache.set(key,t);
  return t;
}

function CourseMarker({z,side,mobile=false}){
  const x=side*COURSE_MARKER_SIDE_X;
  const markerZ=z+COURSE_MARKER_UPHILL_SHIFT;
  const poleTexture=useMemo(makeSnow360DreamyPoleTexture,[]);
  const arrowTextures=useMemo(()=>Array.from({length:CANDY_MARKER_COUNT},(_,i)=>({
    core:makeSnow360DreamyArrowTexture(mobile,i,false),
    halo:makeSnow360DreamyArrowTexture(mobile,i,true),
  })),[mobile]);
  const signFaces=useRef([]);
  const haloMaterials=useRef([]);
  const coreMaterials=useRef([]);
  const positions=useMemo(()=>Array.from({length:CANDY_MARKER_COUNT},(_,i)=>{
    const step=(2-i)*CANDY_MARKER_SPACING;
    return {step,dy:groundY(x,markerZ+step)-groundY(x,markerZ)};
  }),[x,markerZ]);
  useFrame(({clock})=>{
    const t=clock.elapsedTime;
    for(let i=0;i<CANDY_MARKER_COUNT;i++){
      // The texture arrow points along its local +X axis. Turning the
      // vertical sign exactly 90 degrees places that axis along WORLD -Z.
      // On the right bank the existing mirrored texture cancels -90 degrees.
      // Do not billboard: moving the camera must not change the direction.
      const face=signFaces.current[i];
      if(face){
        face.rotation.y=side>0?-Math.PI/2:Math.PI/2;
        face.position.y=2.80+Math.sin(t*1.18-i*.58)*.055;
      }
      const wave=.5+.5*Math.sin(t*3.4-i*.95);
      const halo=haloMaterials.current[i];
      const core=coreMaterials.current[i];
      if(halo)halo.opacity=.32+.34*wave;
      if(core)core.opacity=.91+.09*wave;
    }
  });
  return <group name="Snow360 Dreamy Neon Chevron Markers"
    position={[x,groundY(x,markerZ),markerZ]}>
    {positions.map(({step,dy},i)=><group key={i} position={[0,dy,step]}>
      {/* V11: opaque candy pole ends WELL BELOW the glowing arrow.
          Its matching pearl cap is fixed to the top of the pole, not the bobbing arrow. */}
      <mesh position={[0,.88,0]} castShadow={false} receiveShadow={false}>
        <cylinderGeometry args={[.125,.155,1.76,mobile?8:10,1]}/>
        <meshStandardMaterial map={poleTexture} color="#ffffff" roughness={.74} metalness={0}/>
      </mesh>
      <mesh position={[0,.16,0]}>
        <sphereGeometry args={[.21,mobile?8:12,7]}/>
        <meshStandardMaterial color="#fff8f4" roughness={.78}/>
      </mesh>
      {/* No rectangular sign mesh anywhere. Just the luminous chevron. */}
      <group ref={el=>{signFaces.current[i]=el;}}
        name="Floating pastel neon chevron" position={[side*CANDY_MARKER_SIGN_X_OFFSET,2.80,0]}>
        <group scale={[side>0?-1:1,1,1]}>
          <mesh position={[0,0,-.023]} renderOrder={3}>
            <planeGeometry args={[3.65,3.05]}/>
            <meshBasicMaterial ref={el=>{haloMaterials.current[i]=el;}}
              map={arrowTextures[i].halo} transparent opacity={.48}
              blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide}
              toneMapped={false}/>
          </mesh>
          <mesh position={[0,0,.016]} renderOrder={4}>
            <planeGeometry args={[3.55,2.99]}/>
            <meshBasicMaterial ref={el=>{coreMaterials.current[i]=el;}}
              map={arrowTextures[i].core} transparent opacity={.96}
              alphaTest={.005} depthWrite={false} side={THREE.DoubleSide}
              toneMapped={false}/>
          </mesh>
        </group>
      </group>
      {/* Pearl cap sits directly on the opaque pole, never inside the arrow. */}
      <mesh position={[0,1.79,0]}>
        <sphereGeometry args={[.16,10,7]}/>
        <meshBasicMaterial color={['#ffcee6','#ffebd2','#e6dcff','#d8faf6','#ffdbef'][i]}
          toneMapped={false}/>
      </mesh>
    </group>)}
    {/* The small satin bunting between poles is decorative, not a billboard. */}
    <mesh position={[0,1.08,0]}>
      <boxGeometry args={[.045,.045,CANDY_MARKER_SPACING*(CANDY_MARKER_COUNT-1)]}/>
      <meshStandardMaterial color="#fff6f1" roughness={.78}/>
    </mesh>
    {Array.from({length:CANDY_MARKER_COUNT-1},(_,i)=>{
      const at=(1.5-i)*CANDY_MARKER_SPACING;
      return <mesh key={i} position={[0,.95,at]}
        rotation={[0,side>0?Math.PI/2:-Math.PI/2,Math.PI]}>
        <coneGeometry args={[.20,.27,3]}/>
        <meshBasicMaterial color={['#ffcce6','#d7f6ed','#ffefca','#e6d6ff'][i]}
          transparent opacity={.82} side={THREE.DoubleSide}/>
      </mesh>;
    })}
  </group>;
}
const CourseChunk = memo(function CourseChunk({index, collectedRef, stateRef, mobile}) {
  const data = useMemo(() => getSnowChunk(index), [index]);
  const rockModel=useSnowModel("rock");
  const obstacleLibrary=useSnow64Obstacles();
  return <>
    <Terrain index={index} mobile={mobile} />
    <Snow64CloudLayer index={index} mobile={mobile} groundY={groundY} ramps={data.ramps} />
    <group name="Snow360Trees"><Snow64SundaeTrees trees={data.trees} groundY={groundY} mobile={mobile} /></group>
    {obstacleLibrary ? <Snow64ObstacleField rocks={data.rocks} stateRef={stateRef} groundY={groundY} data={obstacleLibrary}/>
      : rockModel ? <SnowGLBInstances asset={rockModel} type="rock" items={data.rocks}
      hidden={r=>stateRef.current.consumedRocks.has(r.id)}
      pose={r=>({position:[r.x,groundY(r.x,r.z),r.z],rotation:[0,.8,0],
        dimensions:[r.size*2,r.size*1.6,r.size*2.2]})}/>
      : data.rocks.map(r=><Rock key={r.id} {...r} stateRef={stateRef} />)}
    {data.ramps.map(r=><Snow360CloudRamp key={r.id} {...r} groundHeight={groundY(r.x,r.z)} />)}
    <Snow64StarTokens items={data.coins} groundY={groundY} collectedRef={collectedRef} />
    {data.banners.map(c=><CourseMarker key={c.id} {...c} mobile={mobile} />)}
  </>;
});
function Course({ collectedRef, distance, stateRef, mobile }) {
  const center = snowChunkIndex(distance);
  const indexes = useMemo(() => Array.from({length:5},(_,i)=>center+i-1).filter(i=>i>=0),[center]);
  return <>{indexes.map(index=><CourseChunk key={index} index={index} collectedRef={collectedRef} stateRef={stateRef} mobile={mobile} />)}</>;
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

/** Soft rounded snow-powder texture. No sprite-sheet rectangles and no custom shader. */
function useSnow360PowderTexture(){
  const texture=useMemo(()=>{
    if(typeof document==="undefined")return null;
    const canvas=document.createElement("canvas");
    canvas.width=canvas.height=128;
    const ctx=canvas.getContext("2d");
    if(!ctx)return null;
    const center=64;
    const gradient=ctx.createRadialGradient(center,center,7,center,center,63);
    gradient.addColorStop(0,"rgba(255,255,255,1)");
    gradient.addColorStop(.28,"rgba(255,255,255,.99)");
    gradient.addColorStop(.58,"rgba(255,255,255,.68)");
    gradient.addColorStop(.80,"rgba(255,255,255,.24)");
    gradient.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=gradient;
    ctx.fillRect(0,0,128,128);
    const t=new THREE.CanvasTexture(canvas);
    t.colorSpace=THREE.SRGBColorSpace;
    t.magFilter=THREE.LinearFilter;
    t.minFilter=THREE.LinearFilter;
    t.generateMipmaps=false;
    t.needsUpdate=true;
    return t;
  },[]);
  useEffect(()=>()=>texture?.dispose(),[texture]);
  return texture;
}

/** Lightweight, variable-density powder flowing from the actual snowboard edges. */
function BoardTrail({stateRef,mobile}) {
  const num=mobile?130:300;
  const points=useRef(),next=useRef(0),accumulator=useRef(0);
  const powder=useSnow360PowderTexture();
  const flakes=useMemo(()=>Array.from({length:num},()=>({x:0,y:0,z:0,vx:0,vy:0,vz:0,life:0,maxLife:1})),[num]);
  const coords=useMemo(()=>new Float32Array(num*3).fill(100000),[num]);
  const colors=useMemo(()=>{
    const values=new Float32Array(num*3);
    const palette=[[1,1,1],[.92,.97,1],[1,.94,.98],[.86,.95,1]];
    for(let i=0;i<num;i++)values.set(palette[i%palette.length],i*3);
    return values;
  },[num]);
  useFrame((_,rawDt)=>{
    if(!points.current)return;
    const dt=Math.min(Math.max(rawDt,0),.05),s=stateRef.current;
    const steer=Math.abs(s.steer||0);
    const moving=s.speed>4 && !s.inAir && !s.recovery && s.t>0;
    if(moving){
      const rate=Math.min(mobile?105:235,20+s.speed*(mobile?1.6:3.1)+steer*55);
      accumulator.current=Math.min(12,accumulator.current+rate*dt);
      let emit=Math.min(mobile?6:11,Math.floor(accumulator.current));
      accumulator.current-=emit;
      while(emit-->0){
        const i=next.current++%num,p=flakes[i];
        const direction=i%2?1:-1;
        const jitter=Math.sin(i*17.91+s.t*53.3);
        const carveKick=.55+steer*2.1;
        p.x=s.x+direction*(.27+.08*jitter);
        p.y=groundY(s.x,s.z)+.12;
        p.z=s.z+.50+jitter*.13;
        p.life=p.maxLife=.28+(i%7)*.055+steer*.12;
        p.vx=direction*(.35+s.speed*.037+carveKick)+jitter*.85;
        p.vy=.40+Math.abs(jitter)*.90+steer*1.8;
        p.vz=.65+s.speed*.26+(i%3)*.22;
      }
    }else accumulator.current=0;
    for(let i=0;i<num;i++){
      const p=flakes[i];
      if(p.life>0){
        p.life-=dt;
        p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
        p.vy-=5.7*dt;
        p.vx*=Math.max(0,1-dt*.85);
      }
      const n=i*3;
      coords[n]=p.life>0?p.x:100000;
      coords[n+1]=p.y;
      coords[n+2]=p.z;
    }
    points.current.geometry.attributes.position.needsUpdate=true;
  });
  return <points ref={points} frustumCulled={false} renderOrder={2}>
    <bufferGeometry key={num}>
      <bufferAttribute attach="attributes-position" array={coords} count={num} itemSize={3}/>
      <bufferAttribute attach="attributes-color" array={colors} count={num} itemSize={3}/>
    </bufferGeometry>
    <pointsMaterial color="#ffffff" vertexColors map={powder}
      transparent opacity={.84} alphaTest={.012} size={mobile?.23:.25}
      depthWrite={false} sizeAttenuation toneMapped={false}/>
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
    <bufferGeometry key={count}><bufferAttribute attach="attributes-position" array={coords} count={count} itemSize={3}/></bufferGeometry>
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

function Snowboard({plush=false}) {
  const custom=useSnowModel("snowboard");
  const geom=useMemo(buildBoardGeometry,[]);
  useEffect(()=>()=>geom.dispose(),[geom]);
  if (custom) return <group position={[0,.045,0]}>
    <SnowGLBVisual asset={custom} type="snowboard" dimensions={[.74,.25,2.43]}/>
    <Snow64SnowboardGlow asset={custom} />
    {plush && [-.16,.16].map(z=><mesh key={z} position={[.212,.131,z]}>
      <boxGeometry args={[.28,.025,.22]}/><meshStandardMaterial color="#725589" roughness={.8}/>
    </mesh>)}
  </group>;
  return <group position={[0,.045,0]}>
    <Snow64SnowboardGlow fallbackGeometry={geom} />
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
    icecreamPower:null, icecreamPowerTime:0, icecreamPowerCooldownTime:-200, icecreamPowerCooldownDistance:-1000,
    icecreamPowerCount:0, powerTime:0, powerAutoJumpDelay:0, powerTricksScheduled:false,
    icecreamHover:false, icecreamAutoIndex:0, icecreamPaidTricks:0, icecreamCollisionGrace:0,
    icecreamEnter:0, icecreamExitLift:0,
    icecreamCarveStart:0, icecreamCarveCenter:0, icecreamCarveDirection:1, icecreamRockTargetId:null,
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
    powerRemaining:s.powerTime, shieldRemaining:s.icecreamCollisionGrace, icecreamPowerReady:!!s.icecreamPower, rockShattered:s.rockShattered,
    air:s.inAir, airHeight:s.air, peakAir:s.peakAir, pose:s.currentPose,
    recovery:recoveryStage(s.recovery),
    // Visual feedback for cloud trick icons follows the REAL animation, not
    // keyboard focus or a fixed timer. The armed trick is highlighted while
    // waiting briefly for takeoff, then the running trick until completion.
    activeTrickKey:s.recovery ? null : s.trick?.key ??
      (s.armedTrick && s.armedTrick.until > s.t ? s.armedTrick.trick?.key : null),
    ollieActive:!s.recovery && s.inAir && s.launchSource==="ollie",
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
 * V32: randomized Ice-cream Power camera cuts between cinematic categories.
 * +Z is BEHIND the rider; -Z is the downhill travel direction. We retain low
 * front/side snowboard angles for tricks, but intentionally include rear chase
 * angles to show forward speed and rear-quarter views for shattering rocks.
 * Every preset follows the snowboard's WORLD position, never its spinning yaw.
 * Only the first 1.15s and last 3s blend. Mid-boost changes are REAL cuts.
 */
const ICECREAM_CAMERA_INTRO_SECONDS = 1.15;
const ICECREAM_CAMERA_RETURN_SECONDS = 3;
// Preserve the character's last automatic trick before the magic expires.
const ICECREAM_AUTO_TRICK_END_BUFFER = 1.45;
// Keep dramatic camera shots out of the ice-cream-tree trunks and raised banks.
const ICECREAM_CAMERA_SAFE_X = 12.25;
const ICECREAM_CAMERA_SHOTS = [
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
function icecreamCameraEase(t){
  const x=clamp(t,0,1);
  return x*x*x*(x*(x*6-15)+10);
}

/**
 * Weighted, nonrepeating shot selection. An actual rock shatter wins priority;
 * otherwise pick speed or trick angles, with occasional impact previews when
 * a rock is ahead. Avoid two shots of the same kind when alternatives exist.
 */
function nextIcecreamCameraShot(previousIndex, random=Math.random, options={}){
  const prev=ICECREAM_CAMERA_SHOTS[previousIndex];
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
  let candidates=ICECREAM_CAMERA_SHOTS.map((shot,index)=>({shot,index}))
    .filter(item=>item.shot.kind===kind && item.index!==previousIndex);
  if(!candidates.length)candidates=ICECREAM_CAMERA_SHOTS.map((shot,index)=>({shot,index}))
    .filter(item=>item.index!==previousIndex);
  return candidates[Math.floor(r()*candidates.length)];
}

/** Check only nearby geometry, not the entire procedural endless course. */
function icecreamRockCameraTarget(s,localChunks){
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
function cinematicPhaseAvailable(s,director,icecreamActive){
  if(!icecreamActive || !director.actionFocus)return null;
  return s.t-director.startAt>=ICECREAM_CAMERA_INTRO_SECONDS &&
    s.powerTime>ICECREAM_CAMERA_RETURN_SECONDS ? director.actionFocus : null;
}

/** Shortest angular path prevents an orbit from doing an unwanted extra spin. */
function approachAngle(a,b,weight) {
  return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*weight;
}

function beginSnowRecovery(s, kind, reason, onSound, impact = null) {
  // During the 2-second post-Icecream shield, block environmental crashes only.
  // A genuinely failed normal trick still follows the standard landing rules.
  const environmental = reason.startsWith("ROCK") || reason.startsWith("RAMP");
  if (s.recovery || s.powerTime > 0 || s.icecreamHover || (environmental && s.icecreamCollisionGrace > 0)) return;
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


/** Icecream hover is intentionally NOT a ballistic jump: no unsafe landing checks.
 * We still flag inAir so the embedded grab/spin/flip clips play continuously.
 */
function beginIcecreamHover(s, supportHeight) {
  if (s.icecreamHover) return;
  s.icecreamHover = true;
  s.icecreamCollisionGrace = 0;
  s.recovery = null;
  s.inAir = true;
  // Enter smoothly. Teleporting the physical board up by 1.28m in one frame
  // made the rider and camera visibly pop at the start of Ice-cream Power.
  s.icecreamEnter = 0;
  s.icecreamExitLift = 0;
  s.worldY = Math.max(s.worldY, supportHeight + .08);
  s.air = Math.max(.08, s.worldY - supportHeight);
  s.peakAir = s.air;
  s.vy = 0;
  s.flightTime = 0;
  s.launchSource = "power";
  s.launchSpeed = Math.max(s.speed, 55);
  s.launchSuper = true;
  s.jumpCooldown = 0;
  s.impact = 0;
  s.armedTrick = null;
  s.icecreamAutoIndex = 0;
  s.icecreamPaidTricks = 0;
  // Keep the first turn continuous with the rider's current course position.
  // Outside edges begin by turning toward the center of the mountain.
  s.icecreamRockTargetId = null;
  s.icecreamCarveStart = s.t;
  s.icecreamCarveCenter = clamp(s.x, -4, 4);
  s.icecreamCarveDirection = s.x > 5 ? -1 : s.x < -5 ? 1 : (Math.random() < .5 ? -1 : 1);
  resetAirTrickChain(s);
}

function finishIcecreamHover(s, supportHeight) {
  if (!s.icecreamHover) return;
  // Physically end hover immediately, but visually ease the last meter back to
  // the snow. Collision detection remains at the real ground surface.
  s.icecreamExitLift = clamp(s.worldY - supportHeight, 0, 2.0);
  s.icecreamEnter = 0;
  s.icecreamHover = false;
  s.icecreamCollisionGrace = ICECREAM_POST_SHIELD_SECONDS;
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
  s.icecreamPaidTricks = 0;
  s.icecreamRockTargetId = null;
  resetAirTrickChain(s);
  s.lastText = "ICE-CREAM SHIELD • 2s SAFE LANDING";
  s.textUntil = s.t + 1.1;
}

/**
 * V34: choose a *reachable* live rock in front of the rider, including rocks
 * outside the current carving lane. Keep the same rock locked until impact or
 * passing it; continuously changing targets causes straight-line steering.
 * Scans only the three existing nearby chunks, and allocates no geometry.
 */
function icecreamRockToChase(s, chunks) {
  let locked=null, candidate=null, best=Infinity;
  const forwardSpeed=Math.max(32,s.speed);
  for(const chunk of chunks) for(const rock of chunk.rocks){
    if(s.consumedRocks.has(rock.id))continue;
    const ahead=s.z-rock.z;
    if(ahead < -2 || ahead > ICECREAM_ROCK_LOOKAHEAD)continue;
    if(rock.id===s.icecreamRockTargetId){locked=rock;continue;}
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
  s.icecreamRockTargetId=candidate?.id||null;
  return candidate;
}

/**
 * Slalom when the course is clear, purposeful turns toward reachable rocks.
 * The approach estimates time to contact, so the character reaches the target
 * before passing it at very high speed. Just before impact the oscillation is
 * reduced for a reliable shatter, then carving resumes toward the next rock.
 * Player touch/keyboard steering still overrides this automatic steering.
 */
function icecreamAutoCarveVelocity(s,chunks){
  const age=Math.max(0,s.t-(s.icecreamCarveStart??s.t));
  const omega=2*Math.PI/ICECREAM_CARVE_PERIOD;
  const phase=age*omega;
  const dir=s.icecreamCarveDirection||1;
  const fade=smoothstep(age/.70);
  const center=s.icecreamCarveCenter??clamp(s.x,-4,4);
  const waveX=center+dir*ICECREAM_CARVE_AMPLITUDE*Math.sin(phase)*fade;
  const waveSpeed=dir*ICECREAM_CARVE_AMPLITUDE*omega*Math.cos(phase)*fade;
  const target=icecreamRockToChase(s,chunks);
  if(target){
    const ahead=Math.max(0,s.z-target.z);
    const untilImpact=Math.max(.14,(ahead-1.0)/Math.max(s.speed,25));
    // Plenty of slalom early in the approach, accurate alignment at contact.
    const weaveStrength=smoothstep((ahead-13)/45);
    const arrivalX=target.x+Math.sin(phase)*1.15*weaveStrength;
    const requested=(arrivalX-s.x)*1.13/untilImpact+waveSpeed*.19*weaveStrength;
    return clamp(requested,-ICECREAM_CARVE_MAX_LATERAL_SPEED,ICECREAM_CARVE_MAX_LATERAL_SPEED);
  }
  return clamp((clamp(waveX,-9,9)-s.x)*2.9+waveSpeed*.95,
    -ICECREAM_CARVE_MAX_LATERAL_SPEED,ICECREAM_CARVE_MAX_LATERAL_SPEED);
}

/** Pure horizontal swept test for magical impacts. Ignoring jump height ensures
 * obstacles physically along the power-up path explode instead of being missed.
 * It MUST only be called in the powered branch, never for ordinary collisions.
 */
function icecreamPathHit(from, to, obstacle, radius) {
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

function Rider({ rider, onReady, mobile, phase, runKey, keyRef, queueRef, stateRef, collectedRef, cameraOrbitRef, onHud, onFinish, onSound }) {
  const profile=getSnow360Rider(rider);
  const {scene, animations}=useGLTF(mobile?profile.mobile:profile.desktop);
  useMemo(()=>assertSnow360Clips(animations),[animations]);
  const character=useMemo(()=>cloneSkinned(scene),[scene]);
  const animator=useMemo(()=>createSnow360RiderAnimator(character,animations),[character,animations]);
  const riderBones=useMemo(()=>{
    const bones=[];
    character.traverse(o=>{if(o.isBone)bones.push(o);});
    return bones;
  },[character]);
  const plushResponse=useRef(null);
  if (!plushResponse.current) plushResponse.current=createSnow360PlushResponse();
  const plushVisual=useRef();
  // Recompute collision clearance from the actually posed skinned model only
  // during recoveries. Unlike the old capsule + all-bone lift, this cannot stack
  // two large positive offsets and leave the rider hovering above the snow.
  const recoverySkinned=useMemo(()=>{
    const meshes=[];
    character.traverse(object=>{ if(object.isSkinnedMesh) meshes.push(object); });
    return meshes;
  },[character]);
  const recoveryBounds=useMemo(()=>new THREE.Box3(),[]);
  const recoveryScratch=useMemo(()=>new THREE.Box3(),[]);
  const plushSpringBones=useMemo(()=>{
    // Use names only; never edit geometry, skin weights or existing animation clips.
    const springs=[];
    for(const bone of riderBones){
      const name=bone.name.toLowerCase();
      if(/ear|antenna|tail|whisker|cheek|bang|tuft|hair|head/.test(name)){
        springs.push({bone,kind:/ear|antenna|tail|whisker|bang|tuft|hair/.test(name)?"loose":"head",oldZ:0,oldX:0});
      }
    }
    return springs;
  },[riderBones]);
  const root=useRef(), stance=useRef(), board=useRef(), crashBoard=useRef(), kickSnow=useRef(), riderCarrier=useRef(), riderModel=useRef(), hoverRing=useRef();
  const frame=useRef(0),cameraReady=useRef(false),crashCameraBlend=useRef(0),phaseRef=useRef(phase);
  const icecreamCamera=useRef({active:false,index:-1,nextAt:0,startAt:0,yaw:0,elevation:0,radius:0,lookHeight:.55,shot:null,exitYaw:null,exitTarget:null,lastBoard:null,lastShatterCount:0,lastCutAt:-99,speedShots:0,focusRock:null,actionFocus:null});
  const icecreamBoardAnchor=useMemo(()=>new THREE.Vector3(),[]);
  const nearby=useRef({index:-1,chunks:[]});
  const {camera}=useThree();
  useEffect(()=>{phaseRef.current=phase;},[phase]);
  useEffect(()=>{
    stateRef.current=initialState(mobile ? 1 : 0); collectedRef.current.clear(); queueRef.current.length=0;
    frame.current=0;cameraReady.current=false;crashCameraBlend.current=0;
    icecreamCamera.current={active:false,index:-1,nextAt:0,startAt:0,yaw:0,elevation:0,radius:0,lookHeight:.55,shot:null,exitYaw:null,exitTarget:null,lastBoard:null,lastShatterCount:0,lastCutAt:-99,speedShots:0,focusRock:null,actionFocus:null};
    nearby.current={index:-1,chunks:[]};
    delete camera.userData._look;
    animator.reset();
    plushResponse.current.reset();
    for(const softBone of plushSpringBones){softBone.oldX=softBone.oldZ=0;}
    if (plushVisual.current) {plushVisual.current.scale.set(1,1,1);plushVisual.current.rotation.set(0,0,0);plushVisual.current.position.set(0,0,0);}
    if (root.current) root.current.position.set(0,.1,0);
    if (crashBoard.current) crashBoard.current.visible=false;
  },[runKey,stateRef,collectedRef,queueRef,camera,animator,mobile]);
  useEffect(()=>{
    animator.setPose("SnowboardIdle","initial",{fadeSeconds:0});
    animator.update(0);
    onReady(`${rider}:${mobile}`);
    return ()=>animator.dispose();
  },[animator,onReady,rider,mobile]);

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
    let icecreamDesiredVelX=null;
    if(playing && s.icecreamHover && s.powerTime>0 && !s.recovery){
      // Auto-slalom is actually MOVEMENT, not just a subtle animation tilt.
      // A player steering deliberately can still override it at any time.
      icecreamDesiredVelX=Math.abs(steerWanted)>.18
        ? steerWanted * 13.2
        : icecreamAutoCarveVelocity(s,localChunks);
      steerWanted=clamp(icecreamDesiredVelX/13.2,-1,1);
    }
    if(phaseRef.current!=="paused")s.steer=lerp(s.steer,steerWanted,Math.min(1,dt*(icecreamDesiredVelX!==null?9:6)));
    const queue=queueRef.current.splice(0);
    for (const command of queue) {
      if (command.type === "camera") s.cameraMode = (s.cameraMode + 1) % 3;
      if (!playing || s.recovery) continue;
      if (command.type === "jump" && !s.inAir && !s.icecreamHover && s.jumpCooldown <= 0) {
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
      // The rendered board drops gently after boost without changing collision
      // math. Clearing the offset exponentially prevents a final visible snap.
      if(!s.icecreamHover && s.icecreamExitLift>0){
        s.icecreamExitLift *= Math.exp(-dt*7.0);
        if(s.icecreamExitLift<.006)s.icecreamExitLift=0;
      }
      // Endless survival timer: drains every frame, even while chasing a lost board.
      s.drainRate=snowDrainPerSecond(Math.max(0,-s.z));
      s.score=Math.max(0,s.score-s.drainRate*dt);
      // Arcade warning when the score has under ~5 seconds of runway.
      if(s.score>0 && s.score<s.drainRate*5 && (!s.lastDangerAt||s.t-s.lastDangerAt>2.7)){
        s.lastDangerAt=s.t;onSound("danger");
      }
      // Only counts down while actually playing. Boost expiry refreshes the
      // shield to the full two seconds on its first normal-riding frame.
      s.icecreamCollisionGrace=Math.max(0,s.icecreamCollisionGrace-dt);
      s.powerTime=Math.max(0,s.powerTime-dt);
      if (s.powerTime <= 0 && s.icecreamHover) {
        finishIcecreamHover(s, snowSurfaceAt(s.x,s.z,localChunks,groundY).height);
        onSound("powerEnd");
      }
      s.powerAutoJumpDelay=Math.max(0,s.powerAutoJumpDelay-dt);
      if(s.icecreamPower && s.z < s.icecreamPower.z - 8) s.icecreamPower=null;
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
        if (s.powerTime > 0 && !s.icecreamHover) {
          beginIcecreamHover(s, snowSurfaceAt(s.x,s.z,localChunks,groundY).height);
        }
        const targetSpeed = (s.powerTime>0 ? (mobile?57:60) : tuck ? (mobile ? 42 : 38) : 21.5) - Math.abs(s.steer) * 2.6;
        // Higher acceleration, same controllable carving range.
        s.speed = lerp(s.speed, targetSpeed, Math.min(1, dt * (s.powerTime>0?3.6:tuck ? (mobile ? 2.1 : 1.35) : .5)));
        // Icecream Hover is flagged as inAir for tricks, but it should steer like
        // a powerful snowboard, not inherit the weak normal airborne steering.
        const poweredCarve=s.icecreamHover && s.powerTime>0;
        const lateralTarget=poweredCarve
          ? (icecreamDesiredVelX??s.steer*13.2)
          : s.steer * (s.inAir ? 5.0 : 9.2);
        const carveResponse=poweredCarve?8.5:s.inAir?2.8:snow360GripResponse(5.5);
        s.velX=lerp(s.velX,lateralTarget,Math.min(1,dt*carveResponse));
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
        if (!s.icecreamHover && !s.recovery) {
          for (const chunk of localChunks) for (const ramp of chunk.ramps) {
            if (s.recovery) break;
            // The rider has already left the lip of this ramp.
            if (s.inAir && !s.consumedRamps.has(ramp.id)) {
              const hit=sweptAirRampContact(from,to,ramp,groundY);
              if (hit) {
                if (hit.kind === "deck" || s.icecreamCollisionGrace > 0) {
                  // Genuine deck landings remain unchanged. If a rider is
                  // shielded after Icecream, safely lift onto the solid deck
                  // instead of crashing or tunnelling through the ramp.
                  s.x=hit.x;
                  s.z=hit.z;
                  surface=snowSurfaceAt(s.x,s.z,localChunks,groundY);
                  s.worldY=Math.max(hit.y+.003,surface.height+(s.icecreamCollisionGrace>0?.08:0));
                  if(s.icecreamCollisionGrace>0){
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
              if(s.icecreamCollisionGrace>0){
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
        if (!s.inAir && !s.recovery && !s.icecreamHover) {
          for(const chunk of localChunks) for(const ramp of chunk.ramps){
            if(s.recovery || s.inAir) break;
            if(s.consumedRamps.has(ramp.id)) continue;
            if(crossedRampLip(ramp,previousZ,s.z,s.x,previousX)){
              if(s.jumpCooldown>0){
                if(s.icecreamCollisionGrace>0){
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
        if (s.icecreamHover && s.powerTime > 0) {
          // Follow the solid snow/ramp support with a gentle floating bob.
          // Flip poses gain a little clearance to keep the board out of the snow.
          const flipProgress = s.trick ? clamp(s.trick.t / s.trick.duration,0,1) : 0;
          const flipLift = s.trick?.flip ? Math.sin(Math.PI * flipProgress) * .85 : 0;
          const hoverFloor = snowSurfaceAt(s.x,s.z,localChunks,groundY).height;
          // Ease to full hover over 0.5 seconds. Preserve the existing gentle
          // bob and flip lift once the entrance is complete.
          s.icecreamEnter=Math.min(1,(s.icecreamEnter||0)+dt/.50);
          const hoverBlend=smoothstep(s.icecreamEnter);
          const hoverTarget=hoverFloor+.08+(ICECREAM_HOVER_HEIGHT-.08)*hoverBlend
            + Math.sin(s.t*6.8)*ICECREAM_HOVER_BOB*hoverBlend + flipLift*hoverBlend;
          s.worldY=lerp(s.worldY,hoverTarget,Math.min(1,dt*15));
          s.air = Math.max(0, s.worldY - hoverFloor);
          s.peakAir = Math.max(s.peakAir,s.air);
          s.flightTime += dt;
          // Keep a maximum of one ahead: manual mobile/keyboard input is still
          // accepted and starts right after the current animation finishes.
          if (s.powerTime>ICECREAM_AUTO_TRICK_END_BUFFER && !s.trick && s.airQueue.length === 0) {
            const key = ICECREAM_AUTO_TRICKS[s.icecreamAutoIndex++ % ICECREAM_AUTO_TRICKS.length];
            const definition = TRICKS.find(t => t.key === key);
            if (definition) enqueueAirTrick(s,definition);
          }
          advanceAirTricks(s,dt);
          // Completed auto/manual magic tricks immediately earn points without
          // requiring a landing, so no partial trick can cause a powered wipeout.
          while (s.icecreamPaidTricks < s.completedAirTricks.length) {
            const finished = s.completedAirTricks[s.icecreamPaidTricks++];
            const bonus = Math.round(finished.points * 0.75);
            s.score += bonus;
            s.combo += 1;
            s.lastText = `✦ ICE-CREAM ${finished.name}! +${bonus} ✦`;
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
                const spawnedIcecreamPower=maybeSpawnIcecreamPower(s,[...localChunks,getSnowChunk(snowChunkIndex(-s.z)+2)]);
                const turns=((s.airYaw/Math.PI)%2+2)%2;
                if(turns>.8&&turns<1.2)s.fakie=!s.fakie;
                s.lastText=spawnedIcecreamPower ? "✦ RARE ICE-CREAM POWER AHEAD! ✦" : `CLEAN ${outcome.trickCount} TRICK${outcome.trickCount===1?"":"S"}! +${earned.toLocaleString()}`;
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
            const powered = s.icecreamHover && s.powerTime > 0;
            if (!powered && s.hitRocks.has(rock.id)) continue;
            const obstacle=getSnow64ObstacleParams(rock);
            const contact = powered
              ? (snow64ObstacleHit(from,end,rock,groundY,.62,true)
                ?? icecreamPathHit(from,end,rock,rock.size*1.18+.9))
              : (snow64ObstacleHit(from,end,rock,groundY,.32)
                ?? sweptRockHit(from,end,rock,groundY,.32));
            if (contact) {
              if(powered) {
                // Destruction is exclusive to the active Ice-cream Power.
                s.consumedRocks.add(rock.id);
                // The boost turns real collisions into shattering rock geometry.
                // Don't award shatter points for distant rocks or rocks jumped over.
                const obstacleBase=obstacle ? getSnow64ObstacleBaseY(rock,groundY,obstacle) : groundY(rock.x,rock.z);
                s.rockExplosions.push({x:rock.x,y:obstacleBase+(obstacle?.height??rock.size*1.3)*.5,
                  z:rock.z,size:rock.size,seed:s.rockShattered,at:s.t,baseY:obstacleBase,
                  obstacleVariant:obstacle?.asset.name||null,
                  scale:obstacle?.scale||1,
                  yaw:obstacle?.yaw||0});
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
              if(s.icecreamCollisionGrace>0){
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
              collectedRef.current.add(coin.id); s.coins++; s.score += TOKEN_POINTS; recordSnowPoints(s,TOKEN_POINTS); const spawnedIcecreamPower=maybeSpawnIcecreamPower(s,[...localChunks,getSnowChunk(snowChunkIndex(-s.z)+2)]); onSound("pickup");
              s.lastText = spawnedIcecreamPower ? "✦ RARE ICE-CREAM POWER AHEAD! ✦" : `SHRED TOKEN +${TOKEN_POINTS}`; s.textUntil = s.t + (spawnedIcecreamPower ? 2 : 1.25);
            }
          }
        }
        // Floating rare icecreamPower: collected by crossing its actual position.
        if (!s.recovery && icecreamPowerCollision(s,{x:previousX,z:previousZ}, {x:s.x,z:s.z},groundY)){
          activateIcecreamPower(s);
          beginIcecreamHover(s, snowSurfaceAt(s.x,s.z,localChunks,groundY).height);
          s.score+=450; // bonus is intentionally not counted toward the next icecreamPower spawn
          s.lastText="✦ ICE-CREAM POWER! SUPER SPEED + AUTO TRICKS! ✦";
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
    const desired = phaseRef.current==="paused" ? s.currentPose : recoveryMode === "falling" ? "SnowboardWipeout" :
      recoveryMode === "chasing" ? "Run" :
      recoveryMode === "remounting" ? (remountP < .49 ? "SnowboardRemount" : remountP < .71 ? "SnowboardLanding" : remountP < .90 ? "Run" : "SnowboardCruise") :
      s.inAir ? (s.trick?.pose || (s.flightTime < .3 ? "SnowboardOllie" : "SnowboardCruise")) :
      s.impact > 0 ? "SnowboardLanding" : tuck ? "SnowboardTuck" :
      playing ? snow360CarvePose(s.steer,s.currentPose) : "SnowboardIdle";
    s.currentPose=desired;
    const poseIdentity=`${desired}:${s.inAir && s.trick ? s.trick.id : "base"}`;
    if(phaseRef.current!=="paused"){
      const oneShot=!!s.trick && s.inAir || desired==="SnowboardOllie" || desired==="SnowboardLanding" ||
        recoveryMode==="falling" || (recoveryMode==="remounting" && desired!=="SnowboardCruise");
      const clip=animations.find(a=>a.name===desired);
      const duration=recoveryMode==="falling" && profile.plush ? (s.recovery.kind==="wipeout"?.95:.72) : s.trick && s.inAir ? Math.max(.15,s.trick.duration) :
        desired==="SnowboardLanding" ? .45 :
        recoveryMode==="remounting" && desired==="SnowboardRemount" ? .78 :
        recoveryMode==="remounting" && desired==="Run" ? .36 : null;
      animator.setPose(desired,poseIdentity,{oneShot,timeScale:duration?clip.duration/duration:1,fadeSeconds:recoveryMode==="falling"?.06:.13});
      if(recoveryMode==="chasing" && s.recovery){
        const end=s.recovery.kind==="wipeout"?2.57:1.97;
        const approach=smoothstep((s.recovery.t-(end-.40))/.40);
        animator.setSpeed("Run",1-.70*approach);
      }
      // Undo our previous secondary rotation before the next keyed animation pose.
      for(const softBone of plushSpringBones){
        softBone.bone.rotation.x-=softBone.oldX;
        softBone.bone.rotation.z-=softBone.oldZ;
        softBone.oldX=softBone.oldZ=0;
      }
      const animationStart = s.profileTiming ? performance.now() : 0;
      animator.update(dt);
      if (s.profileTiming) s.animationMs = performance.now() - animationStart;
    }

    const cy = groundY(s.x, s.z);
    const deck=snowSurfaceAt(s.x,s.z,localChunks,groundY);
    // Support the board along its length, not just at its center.
    const frontFloor=snowSurfaceAt(s.x,s.z-1.08,localChunks,groundY).height;
    const backFloor=snowSurfaceAt(s.x,s.z+1.08,localChunks,groundY).height;
    const boardFloor=Math.max(deck.height,frontFloor-.12,backFloor-.12);
    const visualY=s.inAir ? s.worldY : s.recovery ? boardFloor : Math.max(s.worldY,boardFloor);
    if (hoverRing.current) {
      hoverRing.current.visible = s.icecreamHover && s.powerTime > 0;
      if (hoverRing.current.visible) {
        hoverRing.current.position.y = boardFloor - visualY + .035;
        const pulse = 1 + Math.sin(s.t * 9) * .08;
        hoverRing.current.scale.set(pulse,pulse,pulse);
        hoverRing.current.rotation.z = s.t * .9;
      }
    }
    if (root.current && stance.current && board.current && riderCarrier.current && riderModel.current) {
      root.current.position.set(s.x, visualY + .14 + (s.icecreamHover?0:(s.icecreamExitLift||0)), s.z);
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
      const icecreamCarveYaw=s.icecreamHover ? clamp(s.velX/Math.max(22,s.speed),-.24,.24) : 0;
      stance.current.rotation.set(flip - s.velX * .013 * (s.inAir ? .3 : 1), airYaw+icecreamCarveYaw,
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
        if(profile.plush){
          const travelYaw=Math.atan2(motion.approachDX,motion.approachDZ);
          const boardFacing=Math.PI/2+motion.boardYaw;
          const turnDelta=Math.atan2(Math.sin(travelYaw-boardFacing),Math.cos(travelYaw-boardFacing));
          riderModel.current.rotation.y=falling ? Math.PI/2+(fallen?.modelTurn||0) :
            chasing ? Math.PI/2+Math.atan2(Math.sin(travelYaw-Math.PI/2),Math.cos(travelYaw-Math.PI/2))*getUp :
            boardFacing+turnDelta*(1-motion.turnP);
        }else{
          riderModel.current.rotation.y=Math.PI/2 + (chasing ? approachFacing*getUp :
            falling ? (fallen?.modelTurn||0) : motion.boardYaw+facingOffset*(1-motion.turnP));
        }
        // The board stays put while the rider hops on. Move both together only
        // for the last push-off, restoring the normal snowboard binding height.
        riderModel.current.position.y=lerp(.06,profile.bindingHeight,hopP)
          + (mountP>.71 && mountP<.90 ? .10*Math.sin(Math.PI*(mountP-.71)/.19) : 0);
        // Contact is resolved AFTER applying the crash squish, below.
        // The previous capsule correction and per-bone correction both moved
        // the entire model UP. Together they could make the character float.
      } else {
        riderCarrier.current.position.set(0, profile.plush ? board.current.position.y : 0, 0);
        // Both soles follow the deck on slopes and grabs, not just the world root.
        if(profile.plush)riderCarrier.current.rotation.copy(board.current.rotation);
        else riderCarrier.current.rotation.set(0, 0, 0);
        riderModel.current.rotation.y = Math.PI / 2;
        riderModel.current.position.y = profile.bindingHeight;
      }
    }
    // Soft-body response stays visual-only; the collision and board roots
    // retain their original movement and trick timeline. Unlike V1, the plush
    // spring keeps running through wipeout, skid, chase, and remount.
    if (plushVisual.current && phaseRef.current !== "paused") {
      const soft=plushResponse.current.step(s,dt);
      plushVisual.current.scale.set(soft.expandXZ,soft.squashY,soft.expandXZ);
      plushVisual.current.rotation.set(soft.tiltX,0,soft.swayZ);
      plushVisual.current.position.y=soft.bobY;
      for(const record of plushSpringBones){
        const weight=record.kind==="loose"?1:0.37;
        const offsetZ=soft.earLagZ*weight,offsetX=soft.earLagX*weight;
        record.bone.rotation.z+=offsetZ;
        record.bone.rotation.x+=offsetX;
        record.oldZ=offsetZ;
        record.oldX=offsetX;
      }
    }

    // Ground the DEFORMED visible rider, not a guessed capsule. A wipeout has
    // brief ballistic airtime, then the model settles onto the actual slope.
    // Never snap down during the intentional remount hop. This adjustment
    // changes only rendered rider height, not the crash body's trajectory.
    if (s.recovery && root.current && riderCarrier.current && riderModel.current) {
      const rec=s.recovery;
      root.current.updateMatrixWorld(true);
      recoveryBounds.makeEmpty();
      for(const mesh of recoverySkinned){
        if(!mesh.visible)continue;
        // AnimationMixer already updated the bones earlier this frame.
        mesh.skeleton?.update();
        mesh.computeBoundingBox();
        if(mesh.boundingBox && !mesh.boundingBox.isEmpty()){
          recoveryScratch.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld);
          recoveryBounds.union(recoveryScratch);
        }
      }
      const contactX=recoveryBounds.isEmpty()?s.x+riderCarrier.current.position.x:
        (recoveryBounds.min.x+recoveryBounds.max.x)*.5;
      const contactZ=recoveryBounds.isEmpty()?s.z+riderCarrier.current.position.z:
        (recoveryBounds.min.z+recoveryBounds.max.z)*.5;
      const floor=snowSurfaceAt(contactX,contactZ,localChunks,groundY).height;
      const actualBottom=recoveryBounds.isEmpty()
        ? root.current.position.y+riderCarrier.current.position.y+riderModel.current.position.y-.18
        : recoveryBounds.min.y;
      const groundAdjust=clamp(floor+.02-actualBottom,-1.65,1.65);
      const recoveryModeNow=recoveryStage(rec);
      const hasHitSnow=(rec.rider?.groundHits||0)>0;
      const canSettle=recoveryModeNow==="chasing" ||
        (recoveryModeNow==="falling" && hasHitSnow) ||
        (recoveryModeNow==="remounting" && remountP<.09);
      if(canSettle){
        riderCarrier.current.position.y+=groundAdjust;
      }else if(groundAdjust>0){
        // Only correct snow penetration during flight and remount jumps.
        riderCarrier.current.position.y+=groundAdjust;
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
    const followLift=Math.max(0,visualY-cy+(s.icecreamExitLift||0));
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
    const director=icecreamCamera.current;
    const icecreamActive=playing && s.icecreamHover && s.powerTime>0 && !s.recovery;
    let icecreamMix=0;
    let icecreamCut=false;
    let icecreamAnchorValid=false;
    let azimuth=baseAzimuth;
    let elevation=baseElevation;
    let radius=baseRadius; // Also fixed during recovery: no crash zoom-out.
    let desiredFov=baseFov;
    if(icecreamActive){
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
      const rockFocus=icecreamRockCameraTarget(s,localChunks);
      const cinematicPhase=s.t-director.startAt>=ICECREAM_CAMERA_INTRO_SECONDS &&
        s.powerTime>ICECREAM_CAMERA_RETURN_SECONDS;
      const impactCut=cinematicPhase && s.powerTime>ICECREAM_CAMERA_RETURN_SECONDS+ICECREAM_IMPACT_SHOT_SECONDS+.12 &&
        newImpact && s.t-director.lastCutAt>.34;
      // Freeze the lens on the shattered rock for a few frames. Following the
      // board here would carry the lens 20+ world units away before the shards
      // have finished flying, making the explosion impossible to see.
      if(impactCut){
        const blast=s.rockExplosions?.[s.rockExplosions.length-1];
        if(blast){
          director.actionFocus={x:blast.x,y:blast.y,z:blast.z,
            until:s.t+ICECREAM_IMPACT_SHOT_SECONDS,
            side:Math.random()<.5?-1:1};
        }
      }
      if(director.actionFocus && s.t>=director.actionFocus.until){
        director.actionFocus=null;
        director.nextAt=s.t; // Cut straight back to the board after the blast.
      }
      if(s.powerTime>ICECREAM_CAMERA_RETURN_SECONDS &&
          (impactCut || (!director.actionFocus && s.t>=director.nextAt))){
        const firstShot=director.index<0;
        // Guarantee at least one rear-speed shot by the first few cuts, then
        // leave the order randomized. Shatters still take priority over it.
        const forceSpeed=!firstShot && director.speedShots===0 &&
          s.t-director.startAt>2.15 && !impactCut;
        const next=nextIcecreamCameraShot(director.index,Math.random,{
          impact:impactCut,forceSpeed,rockAhead:!!rockFocus,
        });
        director.index=next.index;
        director.shot=next.shot;
        director.focusRock=next.shot.kind==="shatter"?rockFocus:null;
        if(next.shot.kind==="speed")director.speedShots++;
        // First shot eases in. Every subsequent mid-boost change is a cut.
        icecreamCut=!firstShot && cinematicPhase;
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
      const intro=icecreamCameraEase((s.t-director.startAt)/ICECREAM_CAMERA_INTRO_SECONDS);
      const exit=icecreamCameraEase(s.powerTime/ICECREAM_CAMERA_RETURN_SECONDS);
      icecreamMix=intro*exit;
      // Keep one continuous angle path during the smooth 3-second exit. Otherwise
      // blending angles at the +/-PI seam can make the camera suddenly whip
      // to the opposite side midway through the return animation.
      if(s.powerTime<=ICECREAM_CAMERA_RETURN_SECONDS){
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
      elevation=lerp(baseElevation,director.elevation,icecreamMix);
      radius=lerp(baseRadius,director.radius,icecreamMix);
      // Rear chase shots widen the view to emphasize rushing snow and
      // approaching obstacles. Close trick shots stay cinematic and tighter.
      const shotFov=director.shot?.kind==="speed"?(mobile?52:50)
        :director.shot?.kind==="shatter"?(mobile?47:46):(mobile?43:42);
      desiredFov=lerp(baseFov,shotFov,icecreamMix);
      // getWorldPosition includes animated stance yaw/pitch and board offset.
      // The focus remains glued to the deck itself, not s.z or a spot behind.
      if(root.current && board.current){
        root.current.updateMatrixWorld(true);
        board.current.getWorldPosition(icecreamBoardAnchor);
        icecreamAnchorValid=true;
        const icecreamLook=new THREE.Vector3(
          icecreamBoardAnchor.x,
          icecreamBoardAnchor.y+director.lookHeight,
          icecreamBoardAnchor.z,
        );
        if(director.shot?.kind==="speed"){
          // Camera behind, aimed slightly down-course: speed is visible, but
          // the board still occupies the foreground instead of disappearing.
          icecreamLook.z-=1.45;
        }else if(director.shot?.kind==="shatter"){
          // Briefly favor debris or a nearby rock without ever losing the board.
          // Do not chase a fixed old explosion at 60 world units per second.
          const impact=rockFocus?.explosion?rockFocus:director.focusRock;
          if(impact){
            const dx=impact.x-icecreamBoardAnchor.x,dz=impact.z-icecreamBoardAnchor.z;
            if(Math.hypot(dx,dz)<10){
              icecreamLook.x+=clamp(dx*.26,-1.6,1.6);
              icecreamLook.z+=clamp(dz*.26,-1.6,1.6);
            }
          }
        }
        look.lerp(icecreamLook,icecreamMix);
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
    // Cinematic orbit stays inside the open riding corridor. Low-angle camera
    // cuts used to enter the Sundae tree trunks or snowbanks near either wall.
    if(icecreamMix>0){
      dest.x=clamp(dest.x,-ICECREAM_CAMERA_SAFE_X,ICECREAM_CAMERA_SAFE_X);
      dest.y=Math.max(dest.y,groundY(dest.x,dest.z)+1.12);
    }
    const targetLook=camera.userData._look || (camera.userData._look=look.clone());
    // V28: eliminate the fast-movement camera lag. At Ice-cream Power speed
    // (~60 world units/sec), smoothing the camera's WORLD position by 9/sec
    // leaves it about 6 metres behind the snowboard. Independently smoothing
    // the look target puts the rider off screen, even with correct orbit angles.
    // Translate BOTH the camera and its look target by the real snowboard's
    // displacement first, then smooth only the relative cinematic orbit.
    // This tracks the board correctly during carving, ramp hover and flips.
    if(icecreamActive && icecreamAnchorValid){
      if(director.lastBoard && cameraReady.current){
        const delta=icecreamBoardAnchor.clone().sub(director.lastBoard);
        // Ignore discontinuities (restart/teleport); normal follow will recover.
        if(delta.lengthSq()<100){
          camera.position.add(delta);
          targetLook.add(delta);
        }
      }
      if(!director.lastBoard) director.lastBoard=icecreamBoardAnchor.clone();
      else director.lastBoard.copy(icecreamBoardAnchor);
    } else {
      director.lastBoard=null;
    }
    if(!cameraReady.current){camera.position.copy(dest);cameraReady.current=true;}
    else if(icecreamCut && icecreamMix>.98){
      // A REAL EDIT CUT: set both lens AND aim instantly on the same frame.
      // Moving one without the other would temporarily hide the snowboard.
      camera.position.copy(dest);
      targetLook.copy(look);
    }else camera.position.lerp(dest,Math.min(1,dt*(icecreamMix>.01?9:s.recovery?10:orbit.dragging?11:4.8)));
    if(!(icecreamCut && icecreamMix>.98))targetLook.lerp(look,Math.min(1,dt*(icecreamMix>.01?12:s.recovery?12:7)));
    camera.lookAt(targetLook);
    // Fallback for mobile frame drops or sudden camera state changes: never
    // allow the lens to stay several metres away from the current board.
    // The camera still eases between angle presets in local board space.
    if(icecreamActive && icecreamAnchorValid && icecreamMix>.65){
      const aimLag=targetLook.distanceTo(look);
      const positionLag=camera.position.distanceTo(dest);
      if(aimLag>2.25 || positionLag>4.5){
        targetLook.copy(look);
        camera.position.copy(dest);
        camera.lookAt(targetLook);
      }
    }
    const impactFocus=cinematicPhaseAvailable(s, director, icecreamActive);
    if(impactFocus){
      // Dedicated impact edit: eye *and* lookAt remain world-locked to the
      // rock, while the board passes through the frame and shards explode.
      // The subsequent shot cuts back to the tracking camera automatically.
      const p=impactFocus;
      const eyeX=clamp(p.x+p.side*3.9,-ICECREAM_CAMERA_SAFE_X,ICECREAM_CAMERA_SAFE_X);
      const eyeZ=p.z-4.45;
      camera.position.set(eyeX,Math.max(p.y+2.55,groundY(eyeX,eyeZ)+1.12),eyeZ);
      targetLook.set(p.x,p.y+.55,p.z);
      camera.lookAt(targetLook);
      camera.fov=mobile?55:51;
      // Keep board displacement bookkeeping current during the static edit.
      if(icecreamAnchorValid)director.lastBoard?.copy(icecreamBoardAnchor);
    }else{
      camera.fov=lerp(camera.fov,desiredFov,Math.min(1,dt*(icecreamMix>.01?8:2)));
    }
    camera.updateProjectionMatrix();
    updateSnow64AudioFrame({playing, speed:s.speed,steer:s.steer,tuck,
      inAir:s.inAir,recovery:!!s.recovery,powered:s.icecreamHover&&s.powerTime>0,airHeight:s.air});
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
        <group ref={riderModel} position-x={profile.offsetX}>
          <group ref={plushVisual}>
            <primitive object={character} dispose={null} scale={profile.scale} />
          </group>
        </group>
      </group>
    </group>
  </group>
  </>;
}

function Loading() {
  return <Html center><div style={{color:"#fff",font:"800 15px monospace",whiteSpace:"nowrap",background:"#16405ba9",padding:18,borderRadius:8}}>LOADING RIDER...</div></Html>;
}
// Only one explosion renderer is active at a time. A crystal shatter clone
// used to copy a MeshBasicMaterial and then add a custom `emissive` property.
// MeshBasicMaterial's shader has NO `emissive` uniform, so Three.js crashed at
// refreshUniformsCommon (Cannot read properties of undefined, reading 'value')
// as soon as that shard became visible. Normalize those cached shard materials
// BEFORE mounting the custom obstacle shatter renderer. MeshBasicMaterial is
// already unlit, so removing the unsupported property preserves its glow.
function Snow360IcecreamShatterEffects({stateRef,mobile}){
  const customObstacles=useSnow64Obstacles();
  useMemo(()=>{
    if(!customObstacles?.variants)return;
    for(const asset of customObstacles.variants.values()){
      for(const shard of asset?.shards||[]){
        const materials=Array.isArray(shard.material)?shard.material:[shard.material];
        for(const material of materials){
          if(material?.isMeshBasicMaterial && material.emissive){
            delete material.emissive;
            delete material.emissiveIntensity;
            material.needsUpdate=true;
          }
        }
      }
    }
  },[customObstacles]);
  if(customObstacles)return <Snow64ObstacleShatterVFX stateRef={stateRef} groundY={groundY} mobile={mobile}/>;
  return <Snow64ExplosionVFX stateRef={stateRef} mobile={mobile}/>;
}

function Scene({rider,assetAttempt,onRiderReady,onRiderError,mobile,phase,runKey,keyRef,queueRef,cameraOrbitRef,onHud,onFinish,onSound,collectedRef,stateRef,distance}){
  return <Snow64ModelProvider><Snow64TextureProvider mobile={mobile}>
    <Snow360PerformanceRecorder phase={phase} stateRef={stateRef}/>
    <color attach="background" args={["#bfd9e6"]}/>
    <fog attach="fog" args={["#bfd9e6",30,138]}/>
    {/* V86: HDRI panorama or the original blue fallback while it loads. */}
    <Suspense fallback={null}>
      <Snow64HDRSky stateRef={stateRef} mobile={mobile}/>
    </Suspense>
    <ambientLight intensity={1.7}/>
    <hemisphereLight args={["#e6f6ff","#597988",1.3]}/>
    <directionalLight position={[-8,20,-30]} intensity={2.2} color="#fff6e9"/>
    <Course collectedRef={collectedRef} distance={distance} stateRef={stateRef} mobile={mobile}/>
    <Snow360IcecreamShatterEffects stateRef={stateRef} mobile={mobile}/>
    <IcecreamPowerCollectible stateRef={stateRef} mobile={mobile}/>
    <Mountains stateRef={stateRef}/>
    <Snow360RiderBoundary key={`${rider}:${mobile}:${assetAttempt}`} onError={onRiderError}>
    <Suspense fallback={<Loading/>}>
      <Rider rider={rider} onReady={onRiderReady} mobile={mobile} phase={phase} runKey={runKey} keyRef={keyRef} queueRef={queueRef} stateRef={stateRef} collectedRef={collectedRef} cameraOrbitRef={cameraOrbitRef} onHud={onHud} onFinish={onFinish} onSound={onSound}/>
    </Suspense>
    </Snow360RiderBoundary>
    <Snowfall mobile={mobile} stateRef={stateRef}/>
    <BoardTrail mobile={mobile} stateRef={stateRef}/>
  </Snow64TextureProvider></Snow64ModelProvider>;
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

const Snow64TrickButtonPad = memo(function Snow64TrickButtonPad({act,mobile,activeTrickKey,ollieActive}) {
  const jumpHeld=useRef(null);
  const [ollieHeld,setOllieHeld]=useState(false);
  const sendTrick=useCallback(key=>act({type:"trick",key}),[act]);
  const sendJump=useCallback(boost=>act({type:"jump",boost}),[act]);
  const jumpDown=e=>{
    e.stopPropagation();
    if(e.pointerType==="mouse" && e.button!==0)return;
    jumpHeld.current={id:e.pointerId,start:performance.now()};
    setOllieHeld(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const jumpUp=e=>{
    e.stopPropagation();
    const held=jumpHeld.current;
    if(!held || held.id!==e.pointerId)return;
    jumpHeld.current=null;
    setOllieHeld(false);
    sendJump(clamp((performance.now()-held.start-120)/750,0,1));
  };
  // Floating trick icons only. No rectangular window, title or visible labels.
  // On touch screens the twelve native buttons form one narrow scrollable strip
  // down the RIGHT edge. Scroll only when the screen is too short to show all.
  return <div role="group" aria-label="Snowboard trick buttons"
    className={`snow64-button-pad ${mobile?"snow64-button-pad--mobile":"snow64-button-pad--desktop"}`}
    onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
    style={{position:"absolute",right:mobile?"max(3px, env(safe-area-inset-right))":18,
      top:mobile?"max(126px, calc(50% - 276px))":undefined,
      bottom:mobile?undefined:26,zIndex:7,
      width:mobile?52:238,
      maxHeight:mobile?"calc(100dvh - 172px)":undefined,
      overflowY:mobile?"auto":"visible",overflowX:mobile?"hidden":"visible",
      padding:mobile?"3px 3px":"0",borderRadius:0,border:"none",
      background:"transparent",boxShadow:"none",
      touchAction:mobile?"pan-y":"manipulation",overscrollBehavior:"contain",
      userSelect:"none",WebkitUserSelect:"none",boxSizing:"border-box"}}>
    <div style={{display:"grid",gridTemplateColumns:mobile?"minmax(0,1fr)":"repeat(4,minmax(0,1fr))",
      gap:mobile?3:5,width:"100%"}}>
      {SNOW64_BUTTON_TRICKS.map(t=><button key={t.key} type="button"
        aria-label={`Perform ${t.full}`} title={`${t.full} · ${t.key.toUpperCase()}`}
        aria-pressed={activeTrickKey===t.key}
        data-snow360-active={activeTrickKey===t.key?"true":"false"}
        className="snow64-iconbtn" onPointerDown={e=>e.stopPropagation()}
        onClick={e=>{e.stopPropagation();sendTrick(t.key);}}
        style={{minWidth:0,minHeight:mobile?44:53,padding:"3px 0 2px",color:"#f9f3d9",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,
          background:"linear-gradient(#2d657d,#194860)",border:"1px solid #9ce5f5a8",borderRadius:8,
          boxShadow:"inset 0 1px #ffffff50,0 2px #09283d",cursor:"pointer",touchAction:"manipulation"}}>
        <Snow64TrickGlyph kind={t.icon} level={t.key}/>
      </button>)}
      <button type="button" className="snow64-iconbtn" aria-label="Ollie jump; hold to charge" title="OLLIE · Hold to charge"
        aria-pressed={ollieHeld||!!ollieActive}
        data-snow360-active={ollieHeld||ollieActive?"true":"false"}
        onPointerDown={jumpDown} onPointerUp={jumpUp} onPointerCancel={()=>{jumpHeld.current=null;setOllieHeld(false);}}
        onLostPointerCapture={()=>{jumpHeld.current=null;setOllieHeld(false);}}
        onClick={e=>{e.stopPropagation();if(e.detail===0)sendJump(0);}}
        style={{minWidth:0,minHeight:mobile?44:53,padding:"3px 0 2px",color:"#293e5b",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,
          background:"linear-gradient(#ffeb9c,#f6ad79)",border:"1px solid #fff6c1",borderRadius:8,
          boxShadow:"inset 0 1px #ffffffa8,0 2px #75384c",cursor:"pointer",touchAction:"manipulation"}}>
        <span aria-hidden="true" style={{fontSize:25,fontWeight:700,lineHeight:"23px"}}>↑</span>
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
      top:mobile?191:9,height:mobile?74:119,width:mobile?"min(52vw,230px)":"min(36vw,420px)",
      touchAction:"none",userSelect:"none",WebkitUserSelect:"none",cursor:"grab",
      display:"flex",alignItems:"flex-start",justifyContent:"center"}}>

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
const SNOW360_MOBILE_STATS_WIDTH = 91; // Compact right-hand SPEED/TIME/SCORE stack.
const SNOW360_MOBILE_STATS_HEIGHT = "clamp(69px, 21vw, 89px)"; // Approximately the logo artwork height.
const SNOW360_MOBILE_STATS_GAP = 3;

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
export function Snow360Logo({ startScreen = false, mobile = false }) {
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
    // On phones, leave the top-right corner free for a compact vertical HUD.
    width:startScreen ? `min(100%, ${width.toFixed(2)}px)`
      : mobile ? `min(calc(100vw - 118px), ${width.toFixed(2)}px)` : width,
    aspectRatio:String(aspect),
    margin:startScreen ? "3px auto 3px" : 0,
    position:"relative", flexShrink:0,
  };
  const imgStyle = {
    position:"absolute",inset:0,width:"100%",height:"100%",
    // Never stretch a PNG to a guessed aspect ratio during async alpha trimming.
    objectFit:"contain",pointerEvents:"none",userSelect:"none",WebkitUserSelect:"none",
  };
  return <div style={frame} aria-busy={!images}>
    {/* Keep the frame reserved, but do not render an untrimmed PNG with an
        incorrect temporary aspect ratio. Show both layers only after trimming. */}
    {!images ? null : images.missing ? <div style={{width:"100%",height:"100%",display:"flex",
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

export default function SnowboardGame({rider="alien-cat",onRiderChange,onRiderStatus,renderActive=true}){
  const [phase,setPhase]=useState("ready");
  const [runKey,setRunKey]=useState(0);
  const [mobile,setMobile]=useState(null);
  const [loadedRider,setLoadedRider]=useState(null);
  const [riderError,setRiderError]=useState(null);
  const [assetAttempt,setAssetAttempt]=useState(0);
  const riderReady=loadedRider===`${rider}:${mobile}` && !riderError;
  const onRiderReady=useCallback(token=>{setLoadedRider(token);setRiderError(null);},[]);
  const onRiderError=useCallback(message=>{setRiderError(message);setLoadedRider(null);},[]);
  useEffect(()=>{setRiderError(null);},[rider,mobile]);
  useEffect(()=>{onRiderStatus?.({ready:riderReady,error:riderError});},[riderReady,riderError,onRiderStatus]);
  const retryRider=()=>{
    const profile=getSnow360Rider(rider);
    useGLTF.clear(mobile?profile.mobile:profile.desktop);
    setRiderError(null);setLoadedRider(null);setAssetAttempt(n=>n+1);
  };
  // Optional pastel rainbow Colorama: a full-scene false-color gradient map, without lowering 3D resolution.
  const [retro,setRetro]=useState(false);
  // Default to classic drawing; selectable on the start / new-run screen.
  const [trickMode,setTrickMode]=useState("draw");
  const [soundOn,setSoundOn]=useState(true);
  const soundRef=useRef(true);
  const [best,setBest]=useState(0);
  const [hud,setHud]=useState({speed:57,score:SNOW_INITIAL_SCORE,peakScore:SNOW_INITIAL_SCORE,drainRate:snowDrainPerSecond(0),distance:0,time:0,combo:0,coins:0,hits:0,air:false,trick:""});
  const [touchTuckFx,setTouchTuckFx]=useState(false);
  const sound=useCallback(kind=>{if(soundRef.current)playSnow64Sound(kind);},[]);
  const icecreamMusicActive=phase==="playing" && hud.powerRemaining>0;
  useEffect(()=>{
    if(!icecreamMusicActive || !soundRef.current)return;
    return playSnow64IcecreamPowerMusic();
  },[icecreamMusicActive,soundOn]);
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
    if(!riderReady)return;
    input.current.left=false;input.current.right=false;input.current.tuck=false;input.current.steerAnalog=0;input.current.touchTuck=false;
    queue.current.length=0;collected.current.clear();state.current=initialState(mobile?1:0);
    cameraOrbit.current.yaw=0;cameraOrbit.current.pitch=0;cameraOrbit.current.dragging=false;
    // Start audio only on this user gesture (required by mobile browsers).
    if(soundRef.current)unlockSnow64Audio();
    setHud(safeHud(state.current));setRunKey(k=>k+1);setPhase("playing");sound("start");
  },[sound,mobile,riderReady]);
  const onFinish=useCallback(h=>{
    setHud(h);setPhase("finished");
    setBest(b=>{const v=Math.max(b,h.peakScore);try{localStorage.setItem("pidgeonkitty-snow-64-best",String(v));}catch{}return v;});
  },[]);
  const pause=useCallback(()=>setPhase(p=>p==="playing"?"paused":p==="paused"?"playing":p),[]);
  const act=useCallback((command)=>{queue.current.push(command);},[]);
  useEffect(()=>{
    const down=e=>{
      // A focused gameplay trick icon must NOT disable keyboard carving/tricks.
      // Keep native keyboard activation for menu buttons, but allow the game
      // shortcuts while a trick icon has focus during active riding.
      const focusedButton=e.target?.closest?.("button");
      if(focusedButton && !(lastPhase.current==="playing" && focusedButton.closest(".snow64-button-pad"))) return;
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
  return <main data-rider={rider} data-rider-ready={riderReady} data-game-phase={phase} data-colorama={retro?"on":"off"}
    onClickCapture={e=>{
      // Desktop pointer clicks leave native buttons focused, which causes the
      // global key handler to ignore its subsequent keydown events. Remove
      // pointer-created focus only, preserving Tab/keyboard accessibility and
      // existing trick, Ollie hold, pause and settings click handlers.
      if(e.detail>0) e.target?.closest?.("button")?.blur();
    }}
    onContextMenu={e=>{if(mobile)e.preventDefault();}} style={{position:"fixed",inset:0,overflow:"hidden",background:"#bedae7",color:"#ffffff",fontFamily:"Arial, Helvetica, sans-serif",touchAction:mobile?"none":"auto",overscrollBehavior:"none",userSelect:mobile?"none":"auto",WebkitUserSelect:mobile?"none":"auto"}}>
    <style>{`
      /* Snow360 Colorama: video-inspired RGB false-color, softened to candy pastels.
         The filter changes only composite pixels, never scene geometry or materials. */
      /* Typed custom angles interpolate smoothly even with SVG url() filters.
         Animating filter:url(...) directly would snap between color states. */
      @property --snow360-colorama-hue {
        syntax: "<angle>";
        inherits: false;
        initial-value: 0deg;
      }
      @keyframes snow360ColoramaPastelRainbow {
        from { --snow360-colorama-hue: 0deg; }
        to   { --snow360-colorama-hue: 360deg; }
      }
      main[data-colorama="on"], .snow360-colorama-preview {
        filter: url(#snow360-pastel-colorama)
          hue-rotate(var(--snow360-colorama-hue)) saturate(1.06) !important;
        animation: snow360ColoramaPastelRainbow 9.5s linear infinite !important;
      }
      main[data-colorama="off"] { animation: none !important; filter: none !important; }
      @media (prefers-reduced-motion: reduce) {
        main[data-colorama="on"], .snow360-colorama-preview {
          animation: none !important;
          filter: url(#snow360-pastel-colorama) hue-rotate(56deg) saturate(1.06) !important;
        }
      }
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
      /* Welcome Play/Settings match the rounded pastel Resume/Ride Again buttons.
         The real Welcome controls live in Snow64Welcome.jsx, a sibling of this game. */
      .snow360-start-glass > div:first-child > button:first-child {
        border-radius:999px!important;
        min-height:54px!important;
        padding:12px 22px!important;
        border:2px solid rgba(255,255,255,.94)!important;
        background:linear-gradient(115deg,#ffe6b0 0%,#ffd1df 50%,#c6dfff 100%)!important;
        color:#354968!important;
        box-shadow:0 8px 26px rgba(27,36,75,.21),inset 0 2px 0 rgba(255,255,255,.70)!important;
        font-family:Fredoka,system-ui,sans-serif!important;
        font-weight:1000!important;
        font-size:20px!important;
        letter-spacing:.055em!important;
      }
      .snow360-start-glass > div:first-child > button:first-child:disabled {
        filter:saturate(.65)!important;
        box-shadow:inset 0 2px 0 rgba(255,255,255,.60)!important;
      }
      .snow360-start-glass > div:first-child > button:nth-child(2) {
        flex:0 0 54px!important;
        width:54px!important;
        min-height:54px!important;
        border-radius:999px!important;
        border:2px solid rgba(255,255,255,.94)!important;
        background:linear-gradient(125deg,#fce7f6,#e9dfff 57%,#ceeaff)!important;
        color:#465779!important;
        box-shadow:0 7px 21px rgba(27,36,75,.18),inset 0 2px 0 rgba(255,255,255,.66)!important;
      }
      .snow360-start-glass > div:first-child > button:nth-child(2)[aria-expanded="true"] {
        background:linear-gradient(125deg,#ffe5b3,#f7c8e7 57%,#d8d0ff)!important;
        color:#774a8c!important;
      }
      .snow360-start-glass > div:first-child > button:nth-child(2) > span {
        font-family:Fredoka,system-ui,sans-serif!important;
        font-size:7px!important;
        letter-spacing:.02em!important;
      }
      .snow360-start-glass > div:first-child > button:not(:disabled):active,
      .snow360-mini-pause:active {transform:scale(.96)!important;}
      @media(max-width:720px) {
        .snow360-start-glass > div:first-child > button:first-child {font-size:18px!important;}
        .snow360-start-glass > div:first-child > button:nth-child(2) {
          flex-basis:50px!important;width:50px!important;min-height:50px!important;
        }
      }
      .snow64-panel{background:linear-gradient(130deg,#153b55ee,#0f2d46db);border:2px solid #c5eff4;border-radius:9px;box-shadow:3px 5px 0 #0e2a39bb;padding:8px 13px}
      .snow64-label{font-size:10px;font-weight:900;letter-spacing:.17em;color:#8feaf1}
      .snow64-number{font-weight:1000;font-style:italic;font-size:clamp(17px,2.6vw,30px);letter-spacing:.025em;text-shadow:2px 2px #193447}
      .snow64-trick{font-size:clamp(18px,3vw,40px);font-weight:1000;font-style:italic;color:#ffe581;text-shadow:3px 3px #194764;letter-spacing:.035em}
      @media(max-width:680px){.snow64-label{font-size:8px}.snow64-panel{padding:5px 8px}.snow64-hud{gap:5px!important}}
    `}</style>
    {/* SVG gradient-map definition, with no visible SVG or extra WebGL draws.
        Each pixel is recolored by brightness: lavender -> cyan -> mint ->
        peach -> pink -> pearly highlights. A slow hue cycle makes it rainbow. */}
    <svg aria-hidden="true" focusable="false"
      style={{position:"absolute",width:0,height:0,overflow:"hidden",pointerEvents:"none"}}>
      <defs>
        <filter id="snow360-pastel-colorama" x="0" y="0" width="100%" height="100%"
          colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={
            "0.2126 0.7152 0.0722 0 0 " +
            "0.2126 0.7152 0.0722 0 0 " +
            "0.2126 0.7152 0.0722 0 0 " +
            "0 0 0 1 0"
          } />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.37 0.55 0.45 0.63 0.73 0.95 1 0.97 1" />
            <feFuncG type="table" tableValues="0.30 0.48 0.73 0.88 0.94 0.77 0.69 0.85 0.96" />
            <feFuncB type="table" tableValues="0.71 0.80 0.91 0.95 0.79 0.68 0.80 0.90 1" />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
    <div style={{position:"absolute",inset:0,zIndex:0}}>
      {mobile!==null && <Canvas frameloop={renderActive?"always":"demand"} key="snow360-hd" dpr={[1,mobile?1.1:1.7]} camera={{position:[-3,2.4,5.6],fov:42,near:.08,far:230}} gl={{antialias:true, powerPreference:"high-performance"}}>
        <Scene rider={rider} assetAttempt={assetAttempt} onRiderReady={onRiderReady} onRiderError={onRiderError} mobile={mobile} phase={phase} runKey={runKey} keyRef={input} queueRef={queue} cameraOrbitRef={cameraOrbit} stateRef={state} collectedRef={collected} distance={hud.distance} onHud={setHud} onFinish={onFinish} onSound={sound}/>
      </Canvas>}
    </div>
    <SpeedRush mobile={mobile===true} active={phase==="playing" && (hud.powerRemaining>0 || (mobile?touchTuckFx:hud.pose==="SnowboardTuck"))} speed={hud.speed}/>
    {phase==="playing" && hud.powerRemaining>0 && <Snow360IcecreamPowerScene remaining={hud.powerRemaining} mobile={mobile===true} speed={hud.speed} trick={hud.trick}/>}
    {/* Mobile: an ultra-compact SPEED / TIME / SCORE rail at top-right, about
        as tall as the visible logo. Distance hangs below the rail without
        stretching its cards. Desktop keeps the original horizontal HUD. */}
    <div style={{position:"absolute",left:0,right:0,top:0,zIndex:3,
      padding:mobile?"max(8px, env(safe-area-inset-top)) 9px 0":"clamp(9px,2vw,22px)",
      display:"flex",flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",
      gap:mobile?6:10,pointerEvents:"none"}}>
      <div style={{display:"flex",flexDirection:"column",gap:SNOW360_LOGO_HUD_GAP,
        minWidth:0,maxWidth:mobile?"calc(100vw - 118px)":undefined,
        filter:"drop-shadow(2px 3px #103348)"}}>
        <div style={{fontSize:mobile?8:10,fontWeight:900,letterSpacing:mobile?".12em":".24em",color:"#eefffc",whiteSpace:"nowrap"}}>PIDGEONKITTY PRESENTS</div>
        <Snow360Logo mobile={mobile===true} />
        <div style={{fontSize:mobile?8:10,fontWeight:900,letterSpacing:mobile?".095em":".16em",color:"#cdfaff",whiteSpace:"nowrap"}}>DOWNHILL FREESTYLE</div>
      </div>
      <div className="snow64-hud snow360-arcade-hud" style={{display:"flex",flexDirection:mobile?"column":"row",
        position:"relative",gap:mobile?SNOW360_MOBILE_STATS_GAP:8,
        alignItems:"stretch",alignSelf:"flex-start",justifyContent:"flex-start",
        flexShrink:0,width:mobile?SNOW360_MOBILE_STATS_WIDTH:undefined,
        height:mobile?SNOW360_MOBILE_STATS_HEIGHT:undefined,
        marginTop:mobile?12:0}}>
        {[{label:"SPEED",value:hud.speed,unit:"KM/H"},{label:"TIME",value:formatTime(hud.time)},{label:"SCORE",value:hud.score.toLocaleString()}].map(v=><div
          key={v.label} data-snow360-stat={v.label.toLowerCase()} className="snow64-panel" style={{minWidth:mobile?0:100,width:mobile?"100%":undefined,
            flex:mobile?"1 1 0":undefined,minHeight:0,
            display:mobile?"flex":undefined,flexDirection:"column",justifyContent:"center",alignItems:"center",
            boxSizing:"border-box",textAlign:"center",padding:mobile?"1px 3px":"8px 13px",
            border:mobile?"1.5px solid #c5eff4":undefined,
            borderRadius:mobile?6:9,
            boxShadow:mobile?"2px 2px 0 #0e2a39bb":undefined}}>
          <div className="snow64-label" style={mobile?{fontSize:6.5,letterSpacing:".08em",lineHeight:1}:undefined}>{v.label}</div>
          <div className="snow64-number" style={mobile?{fontSize:12.5,lineHeight:1.02,whiteSpace:"nowrap",letterSpacing:"0"}:undefined}>{v.value}<span
            style={{fontSize:mobile?6.5:9,marginLeft:mobile?1:2}}>{v.unit}</span></div>
        </div>)}

      </div>
    </div>
    {/* Mobile trick/score/combo notices are anchored just below the compact top HUD,
        instead of hovering over the rider and snowboard. Desktop is unchanged. */}
    {phase==="playing" && <div className="snow360-air-notices" style={{position:"absolute",zIndex:3,top:mobile?"clamp(168px, 20dvh, 190px)":145,left:"50%",transform:"translateX(-50%)",textAlign:"center",pointerEvents:"none",maxWidth:mobile?"94vw":undefined}}>
      {hud.powerRemaining>0 && <div style={{font:"900 13px system-ui",color:"#ffe0f5",textShadow:"1px 2px #854d77",letterSpacing:".07em"}}>✦ ICE-CREAM POWER {hud.powerRemaining.toFixed(1)}s • {hud.rockShattered||0} ROCKS ✦</div>}
      {hud.powerRemaining<=0 && hud.shieldRemaining>0 && <div style={{font:"900 12px system-ui",color:"#ffe0f5",textShadow:"1px 2px #854d77",letterSpacing:".08em"}}>✦ ICE-CREAM SHIELD {hud.shieldRemaining.toFixed(1)}s ✦</div>}
      {hud.trick&&<div className="snow64-trick" style={{animation:"snowboardFloat .5s ease-in-out infinite"}}>{hud.trick}</div>}
      {hud.air && <div style={{fontWeight:900,color:"#d7f8ff",textShadow:"2px 2px #285467",fontSize:12}}>AIR {hud.airHeight.toFixed(1)}m · PEAK {hud.peakAir.toFixed(1)}m</div>}
      {hud.recovery!=="riding" && <div style={{fontWeight:900,color:"#ffd89a",textShadow:"2px 2px #285467",fontSize:12}}> {hud.recovery==="chasing" ? "RUNNING BACK TO THE BOARD" : hud.recovery==="remounting" ? "REMOUNTING" : "RIDER DOWN"}</div>}
      {hud.combo>1&&<div style={{fontWeight:900,letterSpacing:".15em",color:"#f8ffff",textShadow:"2px 2px #285467"}}>COMBO ×{hud.combo}</div>}
    </div>}

    {/* Minimal, immersive pause and game-over screens. The actual course stays behind the soft blur.
        The existing welcome menu above remains untouched, including all settings. */}
    {(phase==="paused" || phase==="finished") &&
      <div
        role="dialog"
        aria-label={phase==="paused" ? "Game paused" : "Game over"}
        onClick={()=>{ if(phase==="paused")pause(); else start(); }}
        style={{
          position:"absolute",inset:0,zIndex:8,
          display:"flex",alignItems:"center",justifyContent:"center",
          padding:"max(20px, env(safe-area-inset-top)) 18px max(20px, env(safe-area-inset-bottom))",
          boxSizing:"border-box",overflowY:"auto",
          background:"linear-gradient(150deg,rgba(60,66,91,.28),rgba(26,41,66,.48) 68%,rgba(41,34,76,.37))",
          backdropFilter:"blur(8px) saturate(1.13)",
          WebkitBackdropFilter:"blur(8px) saturate(1.13)",
          cursor:"pointer",touchAction:"manipulation",textAlign:"center",
        }}>
        <div style={{
          width:"min(100%, 560px)",margin:"auto",display:"flex",flexDirection:"column",
          alignItems:"center",gap:mobile?12:17,color:"#fffafa",
          fontFamily:"Fredoka, 'Fredoka', system-ui, sans-serif",
          filter:"drop-shadow(0 2px 9px rgba(23,29,66,.20))",
        }}>
          <div style={{width:mobile?128:185,maxWidth:"43vw",flexShrink:0}}>
            <Snow360Logo startScreen mobile={mobile===true}/>
          </div>
          <div style={{fontSize:mobile?10:11,fontWeight:900,letterSpacing:".22em",
            color:"#e9faff",textShadow:"0 1px 7px #314c80"}}>
            {phase==="paused" ? "TAKING A LITTLE BREAK" : "THE RUN HAS ENDED"}
          </div>
          <div style={{fontFamily:"'Lilita One', Fredoka, system-ui, sans-serif",
            fontSize:"clamp(42px, 8vw, 77px)",fontWeight:1000,lineHeight:1.03,
            letterSpacing:".015em",color:"#fff8fd",
            textShadow:"0 4px 0 #45678f, 0 7px 20px rgba(17,47,85,.42)"}}>
            {phase==="paused" ? "PAUSED" : "GAME OVER"}
          </div>
          {phase==="finished" ? <>
            <div style={{fontSize:mobile?12:14,fontWeight:900,letterSpacing:".12em",
              color:"#ffe7aa",textShadow:"0 2px 9px rgba(26,36,69,.60)"}}>
              SCORE DEPLETED
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",
              width:"100%",marginTop:mobile?6:14,marginBottom:mobile?5:8}}>
              {[
                {label:"DISTANCE",value:hud.distance.toLocaleString(),unit:"METRES"},
                {label:"PEAK SCORE",value:hud.peakScore.toLocaleString(),unit:"POINTS"},
                {label:"WIPEOUTS",value:hud.hits.toLocaleString(),unit:"TOTAL"},
              ].map((stat,i)=><div key={stat.label} style={{display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",gap:4,padding:mobile?"0 5px":"0 14px",
                borderLeft:i?"1px solid rgba(241,252,255,.40)":"none"}}>
                <div style={{fontSize:mobile?8:10,letterSpacing:".12em",fontWeight:900,
                  color:"#c5faff",whiteSpace:"nowrap"}}>{stat.label}</div>
                <div style={{fontSize:"clamp(19px, 4vw, 31px)",fontWeight:1000,
                  lineHeight:1.15,color:"#ffffff",fontVariantNumeric:"tabular-nums",
                  textShadow:"0 3px 12px rgba(20,32,73,.45)"}}>{stat.value}</div>
                <div style={{fontSize:mobile?8:9,fontWeight:800,letterSpacing:".09em",color:"#f9dfef"}}>{stat.unit}</div>
              </div>)}
            </div>
            <div style={{fontSize:mobile?11:13,fontWeight:900,letterSpacing:".08em",
              color:"#ffebad",textShadow:"0 2px 9px rgba(26,36,69,.55)"}}>
              PERSONAL BEST  {currentBest.toLocaleString()} PTS
            </div>
          </> : null}
          <button type="button"
            onClick={e=>{e.stopPropagation();if(phase==="paused")pause();else start();}}
            style={{marginTop:mobile?12:20,minWidth:mobile?192:244,
              padding:mobile?"13px 28px":"15px 38px",borderRadius:999,
              border:"2px solid rgba(255,255,255,.90)",
              background:"linear-gradient(115deg,#ffe6b0 0%,#ffd1df 50%,#c6dfff 100%)",
              color:"#354968",fontFamily:"inherit",fontWeight:1000,
              fontSize:mobile?16:18,letterSpacing:".055em",
              boxShadow:"0 8px 26px rgba(27,36,75,.26),inset 0 2px 0 rgba(255,255,255,.65)",
              cursor:"pointer",touchAction:"manipulation"}}>
            {phase==="paused" ? "RESUME" : "RESTART"}
          </button>
          <div style={{fontSize:mobile?10:12,fontWeight:800,letterSpacing:".045em",
            color:"#f4faff",textShadow:"0 2px 8px rgba(26,36,69,.55)"}}>
            {phase==="paused" ? "TAP / CLICK ANYWHERE TO RESUME" : "TAP / CLICK ANYWHERE TO RESTART"}
          </div>
        </div>
      </div>}
    {phase==="ready"&&<div onClick={e=>{if(e.target?.closest?.("button"))return;start();}} style={{position:"absolute",inset:0,zIndex:6,background:"linear-gradient(145deg,#092e4ab9,#163c58b0)",display:"grid",placeItems:"center",padding:16,cursor:"pointer"}}>
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
            COLORAMA: {retro?"ON":"OFF"}
          </button>
          {onRiderChange && <Snow360RiderSecret rider={rider} onChange={onRiderChange}/>}
          {riderError && <div role="alert">The rider could not load. <button type="button" onClick={retryRider}>Retry rider</button></div>}
        </div>}
        <div style={{fontSize:22,fontStyle:"italic",fontWeight:1000,color:"#ffe395",animation:"snowboardPulse 1.7s ease-in-out infinite"}}>{!riderReady?"LOADING RIDER…":phase==="ready"?"TAP / CLICK ANYWHERE TO START":phase==="paused"?"TAP / CLICK ANYWHERE TO RESUME":"TAP / CLICK ANYWHERE TO RESTART"}</div>
        <p style={{fontSize:11,color:"#b3dbe9",lineHeight:1.7,margin:"22px 0 0"}}>{mobile ? <>LEFT HALF: DRAG TO CARVE · DRAG UP TO TUCK<br/>{trickMode==="draw"?"RIGHT HALF: TAP TO JUMP · AIR TAP = GRAB · FLICK OR DRAW TRICKS":"RIGHT HALF: TAP TO JUMP · USE THE ICONS FOR ALL TRICKS"}</> : <>A / D = CARVE &nbsp; • &nbsp; W = TUCK &nbsp; • &nbsp; SPACE = OLLIE · SHIFT+SPACE = POWER<br/>{trickMode==="draw"?"1–0 / F = TRICKS":"TAP ICON BUTTONS OR USE 1–0 / F FOR TRICKS"} &nbsp; • &nbsp; C = CAMERA &nbsp; • &nbsp; P = PAUSE</>}</p>
      </div>
    </div>}
    {phase==="playing" && <FollowCameraDragArea cameraOrbitRef={cameraOrbit} mobile={mobile} />}
    {mobile && phase==="playing" ? <MobileTouchControls inputRef={input} stateRef={state} act={act} phase={phase} runKey={runKey} trickMode={trickMode} onTuckChange={setTouchTuckFx} /> : null}
    {phase==="playing" && trickMode==="buttons" && <Snow64TrickButtonPad
      act={act} mobile={mobile===true} activeTrickKey={hud.activeTrickKey}
      ollieActive={hud.ollieActive}/>}
    {/* Keep the downhill view clean. The bottom BEST/TOKENS and keyboard hint
        lines are hidden; values and keyboard shortcuts still work normally. */}
    {mobile && phase==="playing" &&
      <button type="button" className="snow360-mini-pause"
        aria-label="Pause Snow360" title="Pause"
        onPointerDown={e=>e.stopPropagation()}
        onClick={e=>{e.stopPropagation();pause();}}
        style={{position:"absolute",left:"max(10px, env(safe-area-inset-left))",
          bottom:"max(12px, env(safe-area-inset-bottom))",zIndex:10,
          width:34,height:34,padding:0,display:"grid",placeItems:"center",
          borderRadius:"50%",border:"1.5px solid rgba(255,255,255,.91)",
          background:"linear-gradient(125deg,rgba(255,237,200,.91),rgba(255,212,227,.93),rgba(211,231,255,.94))",
          color:"#425676",boxShadow:"0 3px 12px rgba(38,62,101,.22),inset 0 1px 0 #ffffffaa",
          cursor:"pointer",touchAction:"manipulation",WebkitTapHighlightColor:"transparent"}}>
        <svg aria-hidden="true" width="12" height="13" viewBox="0 0 12 13" fill="currentColor">
          <rect x="1.1" y="1.4" width="3.2" height="10.2" rx="1"/>
          <rect x="7.7" y="1.4" width="3.2" height="10.2" rx="1"/>
        </svg>
      </button>}
  </main>;
}

