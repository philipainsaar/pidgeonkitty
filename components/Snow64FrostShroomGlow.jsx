"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * SNOW360 V76 Frost Shroom aura.
 *
 * Additive mint/cyan/lavender glow BEHIND the original GLB, so the
 * mushroom's genuine fleece texture, pearl orb, stem and cap stay intact.
 * Everything follows the existing collectible group and its rotation/bob.
 * No extra model loading and no PNG asset.
 */
function createGlowTexture(){
  const n=96, data=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const dx=(x+.5-n/2)/(n/2),dy=(y+.5-n/2)/(n/2);
    const r2=dx*dx+dy*dy;
    // Emphasize the halo around the model, not an opaque bright center:
    // the original shroom GLB and its cap/orb textures must remain visible.
    const r=Math.sqrt(r2);
    const halo=Math.exp(-Math.pow((r-.44)/.30,2.0));
    const center=Math.exp(-r2*11.0);
    const falloff=Math.max(0,halo*.82+center*.18);
    const i=(y*n+x)*4;
    data[i]=255;data[i+1]=255;data[i+2]=255;
    data[i+3]=Math.round(255*Math.min(1,falloff));
  }
  const tex=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);
  tex.minFilter=THREE.LinearFilter;
  tex.magFilter=THREE.LinearFilter;
  tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
  tex.needsUpdate=true;
  return tex;
}

export default function Snow64FrostShroomGlow({mobile=false}){
  const outer=useRef(null);
  const inner=useRef(null);
  const loop=useRef(null);
  const glowMap=useMemo(createGlowTexture,[]);
  const outerMat=useMemo(()=>new THREE.SpriteMaterial({
    name:"SNOW360_V76_FrostShroom_IcyCyanAura",
    map:glowMap,
    color:"#70e5f8",
    transparent:true,opacity:0.41,
    blending:THREE.AdditiveBlending,
    depthWrite:false,depthTest:true,
    toneMapped:false,
  }),[glowMap]);
  const innerMat=useMemo(()=>new THREE.SpriteMaterial({
    name:"SNOW360_V76_FrostShroom_MintLavenderShimmer",
    map:glowMap,
    color:"#c4a5ff",
    transparent:true,opacity:0.20,
    blending:THREE.AdditiveBlending,
    depthWrite:false,depthTest:true,
    toneMapped:false,
  }),[glowMap]);

  const loopMat=useMemo(()=>new THREE.MeshBasicMaterial({
    color:"#a2fff1",
    transparent:true,opacity:0.26,
    depthWrite:false,
    side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,
    toneMapped:false,
  }),[]);

  useFrame(({clock})=>{
    const t=clock.elapsedTime;
    const b=0.86+0.14*Math.sin(t*2.25);
    outerMat.opacity=(mobile?0.32:0.41)*b;
    innerMat.opacity=(mobile?0.14:0.20)*(0.88+0.12*Math.sin(t*1.45+1.7));
    if(outer.current)outer.current.scale.setScalar((mobile?2.65:3.02)*(0.97+0.03*Math.sin(t*1.8)));
    if(inner.current)inner.current.scale.setScalar((mobile?1.72:1.95)*(0.97+0.03*Math.cos(t*2.2)));
    if(loop.current){
      loop.current.rotation.z=t*0.5;
      loop.current.scale.setScalar(0.92+0.045*Math.sin(t*1.4));
    }
  });

  useEffect(()=>()=>{glowMap.dispose();outerMat.dispose();innerMat.dispose();loopMat.dispose();},
    [glowMap,outerMat,innerMat,loopMat]);

  return <group name="SNOW360_FrostShroom_OriginalModel_IcyGlow">
    <sprite ref={outer} material={outerMat} position={[0,0.63,0]}
      scale={[3.02,3.02,1]} renderOrder={0}/>
    <sprite ref={inner} material={innerMat} position={[0,0.61,0.01]}
      scale={[1.95,1.95,1]} renderOrder={1}/>
    <mesh ref={loop} position={[0,-.14,0]} rotation={[-Math.PI/2,0,0]}
      material={loopMat} renderOrder={1}>
      <torusGeometry args={[.84,.022,4,48]}/>
    </mesh>
  </group>;
}
