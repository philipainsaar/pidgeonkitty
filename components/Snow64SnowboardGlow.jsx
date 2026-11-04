"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SNOW64_MODEL_SCALE, SNOW64_SNOWBOARD_FOOT_TUNE } from "./snow64ModelConfig";

/**
 * V78: One smooth halo following the ACTUAL snowboard deck silhouette.
 *
 * Unlike V77's three camera-facing glow sprites, this single soft ribbon
 * follows the fitted GLB top/bottom outline. It is transparent INSIDE
 * the board and on its outer boundary. The pastel colors stay visible even
 * over the white snow because this uses alpha compositing instead of a
 * nearly invisible additive-only effect on very bright pixels.
 *
 * The true snowboard GLB, UVs, texture maps, bindings and physics are untouched.
 */
const DECK_NAME = /WHITE_CLOUD_PLUSH_TOP|PINK_BLUE_PLUSH_BOTTOM/i;
const WIDTH = 0.74;
const LENGTH = 2.43;
const RADII = [-0.045, 0.005, 0.065, 0.16, 0.29, 0.43];
const WEIGHTS = [0.0, 0.54, 0.43, 0.26, 0.10, 0.0];

function convexHull(points) {
  // Monotone chain, counterclockwise, in the snowboard's local X/Z plane.
  const sorted = points
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.z))
    .sort((a,b) => a.x-b.x || a.z-b.z);
  if (sorted.length < 3) return sorted;
  const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  const lower=[];
  for(const p of sorted){
    while(lower.length>1 && cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();
    lower.push(p);
  }
  const upper=[];
  for(let i=sorted.length-1;i>=0;i--){
    const p=sorted[i];
    while(upper.length>1 && cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower,...upper];
}

function smoothLoop(outline, samples=96) {
  // Evenly spaced samples along actual deck hull, with gently filtered
  // turns. Convexity is preserved: no sharp corner blooms or end hotspots.
  const len=outline.length;
  if(len<3)return [];
  const cumulative=[0];
  for(let i=0;i<len;i++){
    const a=outline[i], b=outline[(i+1)%len];
    cumulative.push(cumulative.at(-1)+Math.hypot(b.x-a.x,b.z-a.z));
  }
  const perimeter=cumulative.at(-1);
  if(perimeter<1e-6)return [];
  const pts=[];
  let edge=0;
  for(let i=0;i<samples;i++){
    const d=i*perimeter/samples;
    while(edge<len-1 && cumulative[edge+1]<d)edge++;
    const a=outline[edge], b=outline[(edge+1)%len];
    const f=(d-cumulative[edge])/Math.max(1e-6,cumulative[edge+1]-cumulative[edge]);
    pts.push({x:THREE.MathUtils.lerp(a.x,b.x,f),z:THREE.MathUtils.lerp(a.z,b.z,f)});
  }
  // Chaikin-like smoothing to make rounded nose/tail glow continuous.
  return pts.map((p,i)=>{
    const a=pts[(i-1+samples)%samples],b=pts[(i+1)%samples];
    return {x:p.x*.64+(a.x+b.x)*.18,z:p.z*.64+(a.z+b.z)*.18};
  });
}

function deckOutline(asset,fallbackGeometry) {
  const pts=[];
  if(asset?.scene){
    asset.scene.updateMatrixWorld(true);
    const inv=asset.scene.matrixWorld.clone().invert();
    const fitX=WIDTH*(SNOW64_MODEL_SCALE.snowboard?.[0]||1)/Math.max(1e-5,asset.size[0]);
    const fitZ=LENGTH*(SNOW64_MODEL_SCALE.snowboard?.[2]||1)/Math.max(1e-5,asset.size[2]);
    const offset=SNOW64_SNOWBOARD_FOOT_TUNE;
    const local=new THREE.Matrix4();
    const p=new THREE.Vector3();
    asset.scene.traverse(node=>{
      if(!node.isMesh || !DECK_NAME.test(node.name||""))return;
      local.multiplyMatrices(inv,node.matrixWorld);
      const positions=node.geometry?.getAttribute("position");
      if(!positions)return;
      // Only run on asset load, never during the animation loop.
      for(let i=0;i<positions.count;i++){
        p.fromBufferAttribute(positions,i).applyMatrix4(local);
        pts.push({
          x:(p.x-asset.centerX)*fitX+offset[0],
          z:(p.z-asset.centerZ)*fitZ+offset[2],
        });
      }
    });
  }else if(fallbackGeometry){
    const a=fallbackGeometry.getAttribute("position");
    if(a)for(let i=0;i<a.count;i++)pts.push({x:a.getX(i),z:a.getZ(i)});
  }
  if(pts.length<3){
    // Fallback in case a differently named snowboard GLB is installed.
    for(let i=0;i<80;i++){
      const t=i/80*Math.PI*2;
      pts.push({x:0.36*Math.cos(t),z:1.19*Math.sin(t)});
    }
  }
  return smoothLoop(convexHull(pts));
}

function createBoardHaloGeometry(asset,fallbackGeometry){
  const points=deckOutline(asset,fallbackGeometry);
  if(points.length<3)return null;
  const n=points.length, rings=RADII.length;
  const position=new Float32Array(n*rings*3);
  const strength=new Float32Array(n*rings);
  const lengthwise=new Float32Array(n*rings);
  const indices=[];
  // The glow is a child of the snowboard's existing parent transform.
  // This height is close to the deck upper edge, not a floating underlay.
  const y=asset?0.095:0.080;
  for(let k=0;k<rings;k++){
    for(let i=0;i<n;i++){
      const p=points[i],a=points[(i+n-1)%n],b=points[(i+1)%n];
      const tx=b.x-a.x,tz=b.z-a.z;
      const mag=Math.max(1e-6,Math.hypot(tx,tz));
      // Convex hull is CCW, outward is (tz,-tx).
      const nx=tz/mag,nz=-tx/mag;
      const j=k*n+i;
      position[j*3]=p.x+nx*RADII[k];
      position[j*3+1]=y;
      position[j*3+2]=p.z+nz*RADII[k];
      strength[j]=WEIGHTS[k];
      lengthwise[j]=Math.min(1,Math.max(0,(p.z+LENGTH*.5)/LENGTH));
    }
  }
  for(let k=0;k<rings-1;k++){
    for(let i=0;i<n;i++){
      const next=(i+1)%n;
      const a=k*n+i,b=k*n+next,c=(k+1)*n+i,d=(k+1)*n+next;
      indices.push(a,c,b,b,c,d);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.BufferAttribute(position,3));
  g.setAttribute("aStrength",new THREE.BufferAttribute(strength,1));
  g.setAttribute("aLengthwise",new THREE.BufferAttribute(lengthwise,1));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const HALO_VERTEX = [
  "attribute float aStrength;",
  "attribute float aLengthwise;",
  "varying float vStrength;",
  "varying float vLengthwise;",
  "void main(){",
  " vStrength=aStrength;",
  " vLengthwise=aLengthwise;",
  " gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);",
  "}",
].join("\n");

const HALO_FRAGMENT = [
  "uniform float uTime;",
  "uniform float uOpacity;",
  "varying float vStrength;",
  "varying float vLengthwise;",
  "void main(){",
  " float flow=0.5+0.5*sin(6.2831853*vLengthwise*1.15+uTime*.44);",
  " vec3 cyan=vec3(.30,.83,1.0);",
  " vec3 pink=vec3(1.0,.49,.85);",
  " vec3 col=mix(cyan,pink,flow);",
  " col=mix(col,vec3(1.0,.98,1.0),.10);",
  " float breathe=.93+.07*sin(uTime*1.15);",
  " float a=clamp(vStrength*uOpacity*breathe,0.0,.60);",
  " if(a<.001)discard;",
  " gl_FragColor=vec4(col,a);",
  " #include <colorspace_fragment>",
  "}",
].join("\n");

export default function Snow64SnowboardGlow({
  asset=null,
  fallbackGeometry=null,
  mobile=false,
}){
  const geometry=useMemo(
    ()=>createBoardHaloGeometry(asset,fallbackGeometry),
    [asset,fallbackGeometry]
  );
  const material=useMemo(()=>new THREE.ShaderMaterial({
    name:"SNOW360_V78_ActualSnowboardSilhouetteHologlow",
    uniforms:{
      uTime:{value:0},
      uOpacity:{value:mobile?.90:1.0},
    },
    vertexShader:HALO_VERTEX,
    fragmentShader:HALO_FRAGMENT,
    transparent:true,
    blending:THREE.NormalBlending,
    depthTest:true,
    depthWrite:false,
    side:THREE.DoubleSide,
    toneMapped:false,
  }),[mobile]);

  useFrame(({clock})=>{material.uniforms.uTime.value=clock.elapsedTime});
  useEffect(()=>()=>{geometry?.dispose();},[geometry]);
  useEffect(()=>()=>material.dispose(),[material]);

  if(!geometry)return null;
  return <mesh
    name="SNOW360 V78 - even feathered glow around the actual snowboard outline"
    geometry={geometry}
    material={material}
    renderOrder={3}
    frustumCulled={false}
    castShadow={false}
    receiveShadow={false}
  />;
}
