"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSnowModel, SnowGLBInstances } from "./snow64VisualModels";
import { useSnow64Texture } from "./snow64VisualMaterials";
import { SNOW64_EXPLOSION } from "./snow64Appearance";

const minScale=.000001;

/** Fully pooled VFX: a user GLB shard replaces the default geometry, and a
 * static GLB 'burst' can optionally appear at impact. All motion stays in the
 * same lightweight simulation as the original shatter effect.
 */
export function Snow64ExplosionVFX({stateRef,mobile}) {
  const shardModel=useSnowModel("explosionShard");
  const burstModel=useSnowModel("explosionBurst");
  const flash=useSnow64Texture("explosionFlash");
  const maxBursts=mobile?SNOW64_EXPLOSION.mobileBursts:SNOW64_EXPLOSION.desktopBursts;
  const shardsPerBurst=mobile?SNOW64_EXPLOSION.mobileShardsPerBurst:SNOW64_EXPLOSION.desktopShardsPerBurst;
  const total=maxBursts*shardsPerBurst;
  const shardRefs=useRef([]),flashRef=useRef();
  const dummy=useMemo(()=>new THREE.Object3D(),[]);
  const modelTransforms=useMemo(()=> {
    if(!shardModel)return null;
    const origin=new THREE.Matrix4().makeTranslation(-shardModel.centerX,-shardModel.bottom,-shardModel.centerZ);
    // Keep transforms for multi-part GLBs, not only the first mesh.
    return shardModel.meshes.map(part=>origin.clone().multiply(part.local));
  },[shardModel]);
  const scratch=useMemo(()=>new THREE.Matrix4(),[]);
  const palette=useMemo(()=>SNOW64_EXPLOSION.palette.map(c=>new THREE.Color(c)),[]);
  const burstSlots=useMemo(()=>Array.from({length:maxBursts},(_,i)=>i),[maxBursts]);
  const hidden=useMemo(()=>new THREE.Object3D(),[]);
  useEffect(()=>{
    hidden.position.set(0,-5000,0);
    hidden.scale.setScalar(minScale);
    hidden.updateMatrix();
    for(const mesh of shardRefs.current){
      if(!mesh)continue;
      for(let i=0;i<total;i++) {
        mesh.setMatrixAt(i,hidden.matrix);
        if(!shardModel)mesh.setColorAt(i,palette[i%palette.length]);
      }
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
    const flashes=flashRef.current;
    if(flashes){
      for(let i=0;i<maxBursts;i++)flashes.setMatrixAt(i,hidden.matrix);
      flashes.instanceMatrix.needsUpdate=true;
    }
  },[shardModel,total,maxBursts,hidden,palette]);

  useFrame(({camera})=>{
    const state=stateRef.current;
    if(!state)return;
    const duration=SNOW64_EXPLOSION.duration;
    const live=(state.rockExplosions||[]).filter(b=>state.t-b.at<duration).slice(-maxBursts);
    if(state.rockExplosions?.length!==live.length)state.rockExplosions=live;
    for(let b=0;b<maxBursts;b++){
      const blast=live[b];
      const elapsed=blast?Math.max(0,state.t-blast.at):0;
      for(let k=0;k<shardsPerBurst;k++){
        const i=b*shardsPerBurst+k;
        if(blast){
          const theta=k*2.39996+blast.seed*.37;
          const speed=2.2+(k%4)*.46;
          const spread=elapsed*speed*(1+blast.size*.12);
          dummy.position.set(blast.x+Math.cos(theta)*spread,
            blast.y+Math.max(0,elapsed*(4.9+(k%3)*.5)-9.8*elapsed*elapsed),
            blast.z+Math.sin(theta)*spread);
          const baseScale=(.13+blast.size*.11)*(1-elapsed/duration)*SNOW64_EXPLOSION.fragmentScale;
          if(shardModel){
            dummy.scale.set(baseScale/Math.max(.001,shardModel.size[0]),baseScale/Math.max(.001,shardModel.size[1]),baseScale/Math.max(.001,shardModel.size[2]));
          }else dummy.scale.setScalar(Math.max(minScale,baseScale));
          dummy.rotation.set(theta+elapsed*6,elapsed*8+k,theta*.5+elapsed*4);
          dummy.updateMatrix();
        }
        for(let j=0;j<shardRefs.current.length;j++){
          const mesh=shardRefs.current[j];
          if(!mesh)continue;
          if(blast && shardModel)mesh.setMatrixAt(i,scratch.copy(dummy.matrix).multiply(modelTransforms[j]));
          else mesh.setMatrixAt(i,blast?dummy.matrix:hidden.matrix);
        }
      }
      if(flashRef.current){
        if(flash && blast && elapsed<SNOW64_EXPLOSION.flashDuration){
          const progress=elapsed/SNOW64_EXPLOSION.flashDuration;
          const size=(.7+blast.size*.32)*(1+progress*1.4)*SNOW64_EXPLOSION.flashScale;
          dummy.position.set(blast.x,blast.y+.23,blast.z);
          dummy.quaternion.copy(camera.quaternion);
          dummy.scale.setScalar(Math.max(minScale,size*(1-progress)));
          dummy.updateMatrix();
          flashRef.current.setMatrixAt(b,dummy.matrix);
        }else flashRef.current.setMatrixAt(b,hidden.matrix);
      }
    }
    for(const mesh of shardRefs.current)if(mesh)mesh.instanceMatrix.needsUpdate=true;
    if(flashRef.current)flashRef.current.instanceMatrix.needsUpdate=true;
  });

  const defaultGeometry=useMemo(()=>new THREE.DodecahedronGeometry(.9,0),[]);
  const defaultMaterial=useMemo(()=>new THREE.MeshLambertMaterial({color:"#ffffff",flatShading:true}),[]);
  useEffect(()=>()=>{defaultGeometry.dispose();defaultMaterial.dispose()},[defaultGeometry,defaultMaterial]);
  const parts=shardModel?.meshes||[{geometry:defaultGeometry,material:defaultMaterial}];
  const flashMaterial=useMemo(()=>flash?new THREE.MeshBasicMaterial({map:flash,color:"#b7faff",side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.82}):null,[flash]);
  useEffect(()=>()=>flashMaterial?.dispose(),[flashMaterial]);
  return <group>
    {parts.map((part,j)=><instancedMesh key={`${!!shardModel}-${j}`} ref={m=>{shardRefs.current[j]=m;}}
      args={[part.geometry,part.material,total]} frustumCulled={false} dispose={null}/>)}
    {flashMaterial && <instancedMesh ref={flashRef} args={[null,null,maxBursts]} frustumCulled={false}>
      <planeGeometry args={[1,1]}/><primitive object={flashMaterial} attach="material" />
    </instancedMesh>}
    {burstModel && <SnowGLBInstances asset={burstModel} type="explosionBurst" items={burstSlots} animated
      pose={(_,i)=>{
        const state=stateRef.current;
        const live=(state.rockExplosions||[]).filter(b=>state.t-b.at<SNOW64_EXPLOSION.duration).slice(-maxBursts);
        const blast=live[i];
        if(!blast)return {position:[0,-5000,0],dimensions:[minScale,minScale,minScale]};
        const elapsed=Math.max(0,state.t-blast.at);
        if(elapsed>SNOW64_EXPLOSION.burstModelDuration)return {position:[0,-5000,0],dimensions:[minScale,minScale,minScale]};
        const fade=(1-elapsed/SNOW64_EXPLOSION.burstModelDuration);
        const radius=Math.max(minScale,(.6+blast.size)*SNOW64_EXPLOSION.burstModelScale*(.35+fade));
        return {position:[blast.x,blast.y,blast.z],rotation:[0,blast.seed,0],dimensions:[radius,radius,radius]};
      }}/>} 
  </group>;
}
