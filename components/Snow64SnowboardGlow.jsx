"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  SNOW64_MODEL_SCALE,
  SNOW64_SNOWBOARD_FOOT_TUNE,
} from "./snow64ModelConfig";

/**
 * SNOW360 V76: true snowboard silhouette glow, NOT a plane.
 *
 * For the real snowboard GLB: clones only its top and bottom deck meshes,
 * uses their existing triangulated shape and exactly the same auto-fit,
 * original GLB hierarchy and foot offset as SnowGLBVisual.
 *
 * For the procedural fallback: duplicates its existing board geometry.
 * Two translucent BACK-SIDE shells protrude gently from the deck outline.
 *
 * Original snowboard model, textures, bindings, UV maps, materials and
 * rider physics remain completely untouched. No rectangular underglow.
 */

const SHELL_VERTEX = [
  "uniform float uExpansion;",
  "varying vec3 vNormalV;",
  "varying vec3 vViewPosition;",
  "void main(){",
  "  vec3 outPos=position+normalize(normal)*uExpansion;",
  "  vec4 viewPos=modelViewMatrix*vec4(outPos,1.0);",
  "  vNormalV=normalize(normalMatrix*normal);",
  "  vViewPosition=viewPos.xyz;",
  "  gl_Position=projectionMatrix*viewPos;",
  "}",
].join("\n");

const SHELL_FRAGMENT = [
  "uniform float uTime;",
  "uniform float uOpacity;",
  "varying vec3 vNormalV;",
  "varying vec3 vViewPosition;",
  "void main(){",
  "  vec3 n=normalize(vNormalV);",
  "  vec3 v=normalize(-vViewPosition);",
  "  float edge=pow(1.0-clamp(abs(dot(n,v)),0.0,1.0),1.3);",
  "  float shimmer=0.5+0.5*sin(uTime*0.75+vViewPosition.y*2.1+vViewPosition.x*1.8);",
  "  float breathe=0.86+0.14*sin(uTime*1.24);",
  "  vec3 cyan=vec3(0.56,0.91,1.00);",
  "  vec3 pink=vec3(1.00,0.73,0.94);",
  "  vec3 color=mix(cyan,pink,shimmer);",
  "  color=mix(color,vec3(1.0,0.99,1.0),0.28);",
  "  float alpha=uOpacity*breathe*(0.23+0.77*edge);",
  "  if(alpha<0.003)discard;",
  "  gl_FragColor=vec4(color,alpha);",
  "  #include <colorspace_fragment>",
  "}",
].join("\n");

const DECK_NAME=/WHITE_CLOUD_PLUSH_TOP|PINK_BLUE_PLUSH_BOTTOM/i;

function useBoardShellClone(asset,material) {
  return useMemo(()=>{
    if(!asset?.scene)return null;
    const cloned=asset.scene.clone(true);
    let decks=0;
    cloned.traverse(node=>{
      if(!node.isMesh)return;
      // Ignore bindings, rivets, handles and attachments.
      const include=DECK_NAME.test(node.name||"");
      node.visible=include;
      if(include){
        decks++;
        node.material=material;
        node.frustumCulled=false;
        node.castShadow=false;
        node.receiveShadow=false;
      }
    });
    return decks>0 ? cloned : null;
  },[asset,material]);
}

function useShellMaterial(expansion,opacity,name){
  return useMemo(()=>new THREE.ShaderMaterial({
    name,
    uniforms:{
      uTime:{value:0},
      uExpansion:{value:expansion},
      uOpacity:{value:opacity},
    },
    vertexShader:SHELL_VERTEX,
    fragmentShader:SHELL_FRAGMENT,
    transparent:true,
    blending:THREE.AdditiveBlending,
    depthTest:true,
    depthWrite:false,
    side:THREE.BackSide,
    toneMapped:false,
  }),[expansion,opacity,name]);
}

export default function Snow64SnowboardGlow({
  asset=null,
  fallbackGeometry=null,
  mobile=false,
}){
  // The raw GLB is 0.25m wide; normalize displacement before the scale group.
  // A 0.017 local displacement gives roughly a 5cm deck silhouette rim.
  const width=asset?.size?.[0] || 0.255;
  const innerExpansion=asset ? width*0.065 : 0.043;
  const outerExpansion=asset ? width*0.125 : 0.086;

  const innerMat=useShellMaterial(
    innerExpansion, mobile?0.17:0.22,"SNOW360_V76_Board_Shape_Rim"
  );
  const outerMat=useShellMaterial(
    outerExpansion, mobile?0.055:0.080,"SNOW360_V76_Board_Shape_Halo"
  );
  const innerClone=useBoardShellClone(asset,innerMat);
  const outerClone=useBoardShellClone(asset,outerMat);

  useFrame(({clock})=>{
    const t=clock.elapsedTime;
    innerMat.uniforms.uTime.value=t;
    outerMat.uniforms.uTime.value=t;
  });

  useEffect(()=>()=>{innerMat.dispose();outerMat.dispose();},[innerMat,outerMat]);

  if(asset && innerClone && outerClone){
    const fit=[0.74,0.25,2.43].map(
      (dim,i)=>dim*(SNOW64_MODEL_SCALE.snowboard?.[i]||1)/Math.max(0.0001,asset.size[i])
    );
    return <group name="SNOW360_GLBSnowboardSilhouetteGlow"
      position={SNOW64_SNOWBOARD_FOOT_TUNE}>
      <group scale={fit}>
        <group position={[-asset.centerX,-asset.bottom,-asset.centerZ]}>
          <primitive object={innerClone} dispose={null}/>
          <primitive object={outerClone} dispose={null}/>
        </group>
      </group>
    </group>;
  }

  // Same exact procedural board geometry and offset, no rectangular planes.
  if(fallbackGeometry)return <>
    <mesh geometry={fallbackGeometry} material={innerMat}
      position={[0,.065,0]} castShadow={false} receiveShadow={false}
      frustumCulled={false}/>
    <mesh geometry={fallbackGeometry} material={outerMat}
      position={[0,.065,0]} castShadow={false} receiveShadow={false}
      frustumCulled={false}/>
  </>;

  return null;
}
