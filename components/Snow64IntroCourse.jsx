"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useSnowModel, SnowGLBInstances } from "./snow64VisualModels";
import { useSnow64TerrainMaterials } from "./snow64VisualMaterials";
import { SNOW64_TERRAIN } from "./snow64Appearance";
import { getSnowChunk, SNOW_CHUNK_LENGTH } from "./snow64Endless";
import { snow360Drift } from "./snow64SnowDrifts";
import Snow360CloudRamp from "./Snow360CloudRamps";

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
    g.setIndex(indices);
    g.computeBoundingSphere();
    return g;
  },[index,mobile]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry} material={material} receiveShadow={false}/>;
}
function PreviewTrees({trees}){
  const model=useSnowModel("tree");
  // Opening lane stays uncluttered. Deliberately hide the closest tree props
  // from the preview (not the game) to prevent a giant tree popping in when
  // textures/GLBs finish loading or when the camera begins its orbit.
  // More distant trees remain visible when looking down the course.
  const visible=useMemo(()=>trees.filter(t=>t.z>-185 && t.z<-25 && Math.abs(t.x)>19.5),[trees]);
  if(model)return <SnowGLBInstances asset={model} type="tree" items={visible}
    pose={tree=>({position:[tree.x,introGroundY(tree.x,tree.z),tree.z],
      rotation:[0,0,0],dimensions:[1.38*tree.size,2.42*tree.size,1.38*tree.size]})}/>;
  return <group>{visible.map((t,i)=><group key={t.id}
    position={[t.x,introGroundY(t.x,t.z),t.z]} scale={t.size}>
    <mesh position={[0,.55,0]}><cylinderGeometry args={[.09,.15,1.1,5]}/><meshLambertMaterial color="#dba3c1"/></mesh>
    <mesh position={[0,1.08,0]}><coneGeometry args={[.69,1.85,6]}/><meshLambertMaterial color="#eff9ff"/></mesh>
    <mesh position={[0,1.70,0]}><coneGeometry args={[.5,1.35,6]}/><meshLambertMaterial color="#f6f0fc"/></mesh>
  </group>)}</group>;
}
function PreviewTokens({coins}){
  const model=useSnowModel("token");
  const visible=useMemo(()=>coins.filter(c=>c.z>-175),[coins]);
  if(model)return <SnowGLBInstances asset={model} type="token" items={visible}
    pose={c=>({position:[c.x,introGroundY(c.x,c.z)+.83,c.z],
      rotation:[0,0,0],dimensions:[.95,.94,.22]})}/>;
  return <group>{visible.map(c=><mesh key={c.id} position={[c.x,introGroundY(c.x,c.z)+1.3,c.z]}>
    <torusGeometry args={[.43,.10,7,14]}/><meshBasicMaterial color="#fff2a9"/>
  </mesh>)}</group>;
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
export default function Snow64IntroCourse({mobile}){
  // The first two chunks are sufficient within the game's 138 m fog radius.
  const chunks=useMemo(()=>[getSnowChunk(0),getSnowChunk(1)],[]);
  const trees=useMemo(()=>chunks.flatMap(c=>c.trees),[chunks]);
  const coins=useMemo(()=>chunks.flatMap(c=>c.coins),[chunks]);
  const rocks=useMemo(()=>chunks.flatMap(c=>c.rocks),[chunks]);
  const banners=useMemo(()=>chunks.flatMap(c=>c.banners),[chunks]);
  const ramps=useMemo(()=>chunks.flatMap(c=>c.ramps).filter(r=>r.z>-200),[chunks]);
  return <>
    <PreviewTerrain index={0} mobile={mobile}/>
    <PreviewTerrain index={1} mobile={mobile}/>
    <PreviewTrees trees={trees}/>
    <PreviewTokens coins={coins}/>
    <PreviewRocks rocks={rocks}/>
    <PreviewMarkers banners={banners}/>
    {ramps.map(r=><Snow360CloudRamp key={r.id} {...r} groundHeight={introGroundY(r.x,r.z)}/>)}
  </>;
}
