"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * V75 subtle snowboard underglow.
 * Independent of the GLB materials: no change to the board's map,
 * color, transparency, foot alignment, UVs, or physically fitted size.
 * Draws only outside the edge of the deck, so every texture remains readable.
 * The soft cyan/pink/pearl light pulses gently like the glowing star tokens.
 */
const GLOW_VERTEX = [
  "varying vec2 vBoardUv;",
  "void main(){",
  "  vBoardUv=uv;",
  "  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);",
  "}",
].join("\n");

const GLOW_FRAGMENT = [
  "uniform float uTime;",
  "uniform float uStrength;",
  "varying vec2 vBoardUv;",
  "void main(){",
  "  // UV maps to a 1.54 x 3.18 meter glow sheet beneath the snowboard.",
  "  vec2 p=(vBoardUv-0.5)*vec2(1.54,3.18);",
  "  vec2 box=vec2(0.32,1.07);",
  "  vec2 q=abs(p)-box;",
  "  float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-0.12;",
  "  // No film over the snowboard. Only the edge glow and outside halo.",
  "  float outer=smoothstep(-0.045,0.015,d);",
  "  float soft=exp(-pow(max(d,0.0)/0.155,2.0));",
  "  float edge=exp(-pow(d/0.045,2.0));",
  "  float motion=0.5+0.5*sin(uTime*0.85+p.y*1.75+p.x*2.8);",
  "  vec3 cyan=vec3(0.57,0.92,1.0);",
  "  vec3 blush=vec3(1.0,0.73,0.92);",
  "  vec3 color=mix(cyan,blush,motion);",
  "  color=mix(color,vec3(1.0,0.98,1.0),0.22);",
  "  float breathe=0.90+0.10*sin(uTime*1.2);",
  "  float a=(0.11*soft+0.14*edge)*outer*uStrength*breathe;",
  "  if(a<0.002) discard;",
  "  gl_FragColor=vec4(color,a);",
  "  #include <colorspace_fragment>",
  "}",
].join("\n");

export default function Snow64SnowboardGlow({ mobile=false, offsetX=0 }) {
  const geometry = useMemo(() => {
    const g=new THREE.PlaneGeometry(1.54,3.18);
    g.rotateX(-Math.PI/2);
    return g;
  }, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    name:"SNOW360_V75_SnowboardSoftUnderglow",
    uniforms:{
      uTime:{value:0},
      uStrength:{value:mobile?0.90:1.0},
    },
    vertexShader:GLOW_VERTEX,
    fragmentShader:GLOW_FRAGMENT,
    transparent:true,
    depthTest:true,
    depthWrite:false,
    blending:THREE.AdditiveBlending,
    side:THREE.DoubleSide,
    toneMapped:false,
  }),[mobile]);

  useFrame(({clock}) => {
    material.uniforms.uTime.value=clock.elapsedTime;
  });

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  },[geometry,material]);

  return <mesh
    name="SNOW360 Snowboard Glow (preserves original board textures)"
    geometry={geometry}
    material={material}
    position={[offsetX,-0.016,0]}
    renderOrder={2}
    frustumCulled={false}
    castShadow={false}
    receiveShadow={false}
  />;
}
