"use client";

import {useEffect,useMemo,useRef} from "react";
import {useFrame} from "@react-three/fiber";
import * as THREE from "three";

/** Very light rim lighting around Ice-cream Power, never over its center. */
function makeOrbRimTexture(){
  const n=96;
  const bytes=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const dx=(x+.5-n/2)/(n/2),dy=(y+.5-n/2)/(n/2);
    const r=Math.hypot(dx,dy);
    // Transparent center. No inner additive glow to bleach the ice-cream textures.
    const rim=Math.exp(-Math.pow((r-.79)/.105,2));
    const edge=1-THREE.MathUtils.smoothstep(r,.92,1.02);
    const offset=(x+y*n)*4;
    bytes[offset]=255;bytes[offset+1]=255;bytes[offset+2]=255;
    bytes[offset+3]=Math.round(Math.max(0,Math.min(1,rim*edge))*255);
  }
  const tex=new THREE.DataTexture(bytes,n,n,THREE.RGBAFormat);
  tex.magFilter=tex.minFilter=THREE.LinearFilter;
  tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
  tex.generateMipmaps=false;
  tex.needsUpdate=true;
  return tex;
}

export default function Snow64IcecreamPowerAura({mobile=false}){
  const rimRef=useRef(null);
  const outlineRef=useRef(null);
  const tex=useMemo(makeOrbRimTexture,[]);
  const glow=useMemo(()=>new THREE.SpriteMaterial({
    name:"IcecreamPower_Outer_Pink_Rim",
    map:tex,color:"#ffd3ee",transparent:true,
    opacity:mobile?.10:.15,
    depthTest:true,depthWrite:false,
    blending:THREE.NormalBlending,
    toneMapped:true,
  }),[tex,mobile]);
  const glassLine=useMemo(()=>new THREE.MeshBasicMaterial({
    name:"IcecreamPower_Glass_Outline_Only",
    color:"#ffe9fa",transparent:true,opacity:mobile?.12:.17,
    depthTest:true,depthWrite:false,
    blending:THREE.NormalBlending,
    side:THREE.DoubleSide,
    toneMapped:true,
  }),[mobile]);
  const baseLine=useMemo(()=>new THREE.MeshBasicMaterial({
    name:"IcecreamPower_Pastel_Base_Ring",
    color:"#ffc1e9",transparent:true,opacity:mobile?.18:.23,
    depthTest:true,depthWrite:false,
    blending:THREE.NormalBlending,
    toneMapped:true,
  }),[mobile]);
  useFrame(({clock})=>{
    const t=clock.elapsedTime;
    const pulse=1+.018*Math.sin(t*1.5);
    if(rimRef.current)rimRef.current.scale.set(2.36*pulse,2.36*pulse,1);
    if(outlineRef.current)outlineRef.current.rotation.z=Math.sin(t*.7)*.05;
    glow.opacity=(mobile?.10:.15)*(.95+.05*Math.sin(t*1.45));
  });
  useEffect(()=>()=>{tex.dispose();glow.dispose();glassLine.dispose();baseLine.dispose();},[tex,glow,glassLine,baseLine]);
  return <group name="IcecreamPower_SubtleClearOrb">
    {/* Sprite is a hollow rim. No white additive flash or luminous center. */}
    <sprite ref={rimRef} material={glow} position={[0,.52,-.68]}
      scale={[2.36,2.36,1]} renderOrder={-1}/>
    {/* No glass-fill surface; an outline suggests an orb without washing out the model. */}
    <mesh ref={outlineRef} position={[0,.52,0]} material={glassLine}>
      <torusGeometry args={[.95,.012,4,44]}/>
    </mesh>
    <mesh position={[0,-.26,0]} rotation={[-Math.PI/2,0,0]} material={baseLine}>
      <torusGeometry args={[.82,.016,4,32]}/>
    </mesh>
  </group>;
}
