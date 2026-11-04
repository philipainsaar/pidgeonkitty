"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useSnowModel, SnowGLBInstances } from "./snow64VisualModels";
import { useSnow64TerrainMaterials, useSnow64SkylineMaterial, useSnow64CorePlanetFilmMaterial } from "./snow64VisualMaterials";
import { SNOW64_TERRAIN } from "./snow64Appearance";
import { getSnowChunk, SNOW_CHUNK_LENGTH } from "./snow64Endless";
import { snow360Drift } from "./snow64SnowDrifts";
import { applySnowbankSkylineGroups } from "./snow64SkylineFade";
import Snow360CloudRamp from "./Snow360CloudRamps";
import Snow64StarTokens from "./Snow64StarTokens";
import Snow64SundaeTrees from "./Snow64SundaeTrees";

// Same world coordinates, snowdrift function, UVs and lights as SnowboardGame.
// This is only a preview of the first course chunks; the full game is already
// mounted beneath the intro and remains the authoritative game simulation.
const SLOPE = .077;
export function introGroundY(x,z) {
  const bank = Math.max(0,Math.abs(x)-12);
  return SLOPE*z+.5*Math.sin(-z*.04)+.31*Math.sin(x*.22-z*.018)
    +bank*bank*.055+snow360Drift(x,z);
}
function terrainNormal(x,z){
  const phase=x*.22-z*.018, bank=Math.max(0,Math.abs(x)-12);
  const drift=snow360Drift(x,z,true);
  const dx=.31*.22*Math.cos(phase)+(bank>0?Math.sign(x)*.11*bank:0)+drift.dx;
  const dz=SLOPE-.02*Math.cos(-z*.04)-.31*.018*Math.cos(phase)+drift.dz;
  const inv=1/Math.hypot(dx,1,dz);
  return [-dx*inv,inv,-dz*inv];
}
function PreviewTerrain({index,mobile}) {
  const material=useSnow64TerrainMaterials();
  const skylineMaterial=useSnow64SkylineMaterial();
  const corePlanetFilm=useSnow64CorePlanetFilmMaterial();
  const geometry=useMemo(()=>{
    const halfWidth=34, stepsX=mobile?50:68,stepsZ=mobile?88:120;
    const positions=[],normals=[],uvs=[],colors=[],indices=[];
    const c=new THREE.Color();
    const smooth=t=>{const v=THREE.MathUtils.clamp(t,0,1);return v*v*(3-2*v);};
    for(let iz=0;iz<=stepsZ;iz++){
      const z=32-index*SNOW_CHUNK_LENGTH-iz*SNOW_CHUNK_LENGTH/stepsZ;
      for(let ix=0;ix<=stepsX;ix++){
        const x=-halfWidth+ix/stepsX*(halfWidth*2);
        positions.push(x,introGroundY(x,z),z);
        normals.push(...terrainNormal(x,z));
        uvs.push(x/SNOW64_TERRAIN.textureTileMeters,-z/SNOW64_TERRAIN.textureTileMeters);
        const side=smooth((Math.abs(x)-10.5)/8.5);
        const breath=Math.sin(x*.31+z*.083)*Math.sin(x*.17-z*.19);
        const shade=.981+breath*.010-side*.026;
        c.setRGB(shade*(1-side*.006),shade*(1-side*.004),shade);
        colors.push(c.r,c.g,c.b);
      }
    }
    for(let iz=0;iz<stepsZ;iz++)for(let ix=0;ix<stepsX;ix++){
      const a=iz*(stepsX+1)+ix,b=a+stepsX+1;
      indices.push(a,a+1,b,a+1,b+1,b);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
    g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
    g.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
    applySnowbankSkylineGroups(g, positions, indices);
    g.computeBoundingSphere();
    return g;
  },[index,mobile]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <>
    <mesh geometry={geometry} material={[material,skylineMaterial]} receiveShadow={false}/>
    <mesh geometry={geometry} material={corePlanetFilm}
      renderOrder={1} castShadow={false} receiveShadow={false}
      frustumCulled={false}/>
  </>;
}
function PreviewTrees({trees, mobile}){
  // Same sidewall GLBs and deterministic colors as the actual game.
  // Hide the closest trees here only so the castle intro stays uncluttered.
  const visible = useMemo(
    () => trees.filter(t => t.z > -185 && t.z < -25 && Math.abs(t.x) > 19.5),
    [trees]
  );
  return <Snow64SundaeTrees trees={visible} groundY={introGroundY} mobile={mobile}/>;
}
function PreviewTokens({coins}){
  const visible=useMemo(()=>coins.filter(c=>c.z>-175),[coins]);
  return <Snow64StarTokens items={visible} groundY={introGroundY} preview />;
}
function PreviewRocks({rocks}){
  const model=useSnowModel("rock");
  const visible=useMemo(()=>rocks.filter(r=>r.z>-165),[rocks]);
  if(model)return <SnowGLBInstances asset={model} type="rock" items={visible}
    pose={r=>({position:[r.x,introGroundY(r.x,r.z),r.z],
      rotation:[0,.8,0],dimensions:[r.size*2,r.size*1.6,r.size*2.2]})}/>;
  return <group>{visible.map(r=><mesh key={r.id}
    position={[r.x,introGroundY(r.x,r.z)+r.size*.52,r.z]}
    rotation={[.2,.8,.1]} scale={[r.size,r.size*.8,r.size*1.1]}>
    <dodecahedronGeometry args={[1,0]}/><meshLambertMaterial color="#a1b5c1" flatShading/>
  </mesh>)}</group>;
}
function PreviewMarkers({banners}){
  return <group>{banners.filter(b=>b.z>-170).map(b=><group key={b.id}
    position={[b.side*12.8,introGroundY(b.side*12.8,b.z),b.z]}>
    <mesh position={[0,2.3,0]}><cylinderGeometry args={[.06,.09,4.6,5]}/>
      <meshLambertMaterial color="#d4f9ff"/></mesh>
    <mesh position={[b.side*.62,3.55,0]}><boxGeometry args={[1.25,.65,.08]}/>
      <meshBasicMaterial color={b.side>0?"#ff77ab":"#f8bb66"} side={THREE.DoubleSide}/></mesh>
  </group>)}</group>;
}

// SNOW360 V9: all four existing Big Air GLBs become permanent intro scenery.
// The castle sits at Z=22 with a maximum depth of 9.1m. Every cloud below
// is strictly BEHIND its far wall (Z > 27), not between the camera and castle.
// Gems are modeled on +Z in these GLBs; the intro camera sits toward -Z.
// Start the clouds yawed exactly 180 degrees to expose the gems and stars.
const CLOUD_LAYOUT = [
  {key:"c1",url:"/models/snow360-sky-cloud-1.glb",x:-10.2,z:32.0,lift:10.1,scale:10.0,bob:.35,drift:.85,phase:.4,rotate:.10},
  {key:"c2",url:"/models/snow360-sky-cloud-2.glb",x:10.0,z:33.5,lift:10.9,scale:10.1,bob:.30,drift:.73,phase:1.9,rotate:.09},
  {key:"c3",url:"/models/snow360-sky-cloud-3.glb",x:-5.2,z:40.0,lift:17.2,scale:11.2,bob:.40,drift:.95,phase:3.2,rotate:.08},
  {key:"c4",url:"/models/snow360-sky-cloud-4.glb",x:6.3,z:41.5,lift:16.5,scale:10.5,bob:.36,drift:.84,phase:4.4,rotate:.08},
];

// Keep original baked AO and maps. ONLY the fluffy body gets soft transparency.
// Pastel pearls/stars remain solid and metallic, just like the Big Air GLBs.
const cloudSoftMaterials = new WeakMap();
function softFleeceMaterial(original){
  const prior=cloudSoftMaterials.get(original);
  if(prior)return prior;
  const material=original.clone();
  material.name="SNOW360_IntroSoftFleece_AO";
  material.transparent=true;
  material.opacity=.93;
  material.depthWrite=false;
  material.roughness=.99;
  material.metalness=0;
  material.side=THREE.FrontSide;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=`varying vec3 vIntroCloudNormal;
varying vec3 vIntroCloudEye;
`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
       vec4 introCloudView=modelViewMatrix*vec4(transformed,1.0);
       vIntroCloudEye=normalize(-introCloudView.xyz);
       vIntroCloudNormal=normalize(normalMatrix*normal);`
    );
    shader.fragmentShader=`varying vec3 vIntroCloudNormal;
varying vec3 vIntroCloudEye;
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `float introFacing=abs(dot(normalize(vIntroCloudNormal),normalize(vIntroCloudEye)));
       diffuseColor.a *= mix(.38,1.0,smoothstep(.08,.82,introFacing));
       #include <opaque_fragment>`
    );
  };
  material.customProgramCacheKey=()=>"snow360-intro-fleece-soft-v9";
  material.needsUpdate=true;
  cloudSoftMaterials.set(original,material);
  return material;
}

const cloudCache=new Map();
const cloudPending=new Map();
function loadCloud(url){
  if(cloudCache.has(url))return Promise.resolve(cloudCache.get(url));
  if(!cloudPending.has(url)){
    cloudPending.set(url,new Promise(resolve=>{
      new GLTFLoader().load(url,gltf=>{
        const source=gltf?.scene||null;
        cloudCache.set(url,source);
        resolve(source);
      },undefined,()=>resolve(null));
    }));
  }
  return cloudPending.get(url);
}

function StartCloud({item,mobile}){
  const [scene,setScene]=useState(()=>cloudCache.get(item.url)??null);
  const root=useRef();
  const x0=item.x*(mobile ? 0.80 : 1);
  const scale=item.scale*(mobile ? 0.88 : 1);
  const baseY=introGroundY(x0,item.z)+item.lift*(mobile ? 0.96 : 1);
  useEffect(()=>{
    let mounted=true;
    loadCloud(item.url).then(source=>{if(mounted)setScene(source);});
    return()=>{mounted=false;};
  },[item.url]);
  const clone=useMemo(()=>{
    if(!scene)return null;
    const copy=scene.clone(true);
    copy.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.castShadow=false;
      mesh.receiveShadow=false;
      if(mesh.name==="Cloud"||mesh.name.startsWith("Cloud_")){
        mesh.material=Array.isArray(mesh.material)?mesh.material.map(softFleeceMaterial):softFleeceMaterial(mesh.material);
      }
      // Do not alter Gems_*'s opaque PBR materials.
    });
    return copy;
  },[scene]);
  useFrame(({clock})=>{
    if(!root.current)return;
    const t=clock.elapsedTime;
    // Visible, low-frequency floating movement, without ever flying in front
    // of the castle or changing the clouds' location when PLAY is clicked.
    root.current.position.x=x0+Math.sin(t*.31+item.phase)*item.drift*(mobile ? 0.80 : 1);
    root.current.position.y=baseY+Math.sin(t*.47+item.phase)*item.bob;
    root.current.rotation.y=Math.PI+Math.sin(t*.19+item.phase)*item.rotate;
  });
  if(!clone)return null;
  return <group ref={root} position={[x0,baseY,item.z]} rotation={[0,Math.PI,0]}
    scale={[scale,scale,scale]}>
    <primitive object={clone} dispose={null}/>
  </group>;
}
function StartSkyClouds({mobile}){
  return <group>{CLOUD_LAYOUT.map(item=><StartCloud key={item.key} item={item} mobile={mobile}/>)}</group>;
}

export default function Snow64IntroCourse({mobile}){
  // The first two chunks are sufficient within the game's 138 m fog radius.
  const chunks=useMemo(()=>[getSnowChunk(0),getSnowChunk(1)],[]);
  const trees=useMemo(()=>chunks.flatMap(c=>c.trees),[chunks]);
  const coins=useMemo(()=>chunks.flatMap(c=>c.coins),[chunks]);
  const rocks=useMemo(()=>chunks.flatMap(c=>c.rocks),[chunks]);
  const banners=useMemo(()=>chunks.flatMap(c=>c.banners),[chunks]);
  const ramps=useMemo(()=>chunks.flatMap(c=>c.ramps).filter(r=>r.z>-200),[chunks]);
  return <>
    <StartSkyClouds mobile={mobile}/>
    <PreviewTerrain index={0} mobile={mobile}/>
    <PreviewTerrain index={1} mobile={mobile}/>
    <PreviewTrees trees={trees} mobile={mobile}/>
    <PreviewTokens coins={coins}/>
    <PreviewRocks rocks={rocks}/>
    <PreviewMarkers banners={banners}/>
    {ramps.map(r=><Snow360CloudRamp key={r.id} {...r} groundHeight={introGroundY(r.x,r.z)}/>)}
  </>;
}
