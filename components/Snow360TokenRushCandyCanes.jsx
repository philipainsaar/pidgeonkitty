"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * SNOW360 TOKEN RUSH | Straight pastel candy-striped guide poles.
 *
 * • Completely vertical poles (no curved candy-cane hooks).
 * • Scrolling cream / strawberry / mint / lavender stripes beneath a
 *   transparent CorePlanet-inspired thin-film hologram, like Mode 1 crystals.
 * • Slow six-color pastel cycle, animated interference bands and Fresnel glints.
 * • All visual-only: no hitboxes and no impact on Standard mode.
 * • One shared instanced mesh per layer, mobile-friendly, no texture downloads.
 */
const POLE_HEIGHT = 2.72;
const POLE_RADIUS = 0.145;
const PASTELS = ["#ffd0e9", "#c8e7ff", "#c8ffe8", "#e1cfff", "#ccfbff", "#ffe3cb"]
  .map(c => new THREE.Color(c));

const clamp01 = x => Math.max(0, Math.min(1, x));
function samplePastel(out, phase) {
  const p=((phase%PASTELS.length)+PASTELS.length)%PASTELS.length;
  const i=Math.floor(p), f=p-i;
  const s=f*f*(3-2*f);
  return out.copy(PASTELS[i]).lerp(PASTELS[(i+1)%PASTELS.length],s);
}

function makeStripesTexture() {
  const w=96, h=128;
  const rgba=new Uint8Array(w*h*4);
  const palette=[
    [255,143,191],  // strawberry
    [255,253,240],  // whipped cream
    [164,242,217],  // mint
    [220,192,255],  // lavender
  ];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    // Cylinder UV: x is circumference, y is vertical height.
    // Wrapped diagonals are candy-stripes, not a flat barcode.
    const stripe=((x/w)*2.1+(y/h)*7.5+3)%1;
    const c=palette[stripe<.29?0:stripe<.57?1:stripe<.78?2:3];
    const i=(y*w+x)*4;
    rgba[i]=c[0];rgba[i+1]=c[1];rgba[i+2]=c[2];rgba[i+3]=255;
  }
  const tex=new THREE.DataTexture(rgba,w,h,THREE.RGBAFormat);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=THREE.RepeatWrapping;
  tex.wrapT=THREE.RepeatWrapping;
  tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.magFilter=THREE.LinearFilter;
  tex.generateMipmaps=true;
  tex.needsUpdate=true;
  return tex;
}

const VERTEX = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  void main(){
    vLocal=position;
    vec4 localPos=vec4(position + normal*0.025,1.0);
    vec3 norm=normal;
    #ifdef USE_INSTANCING
      localPos=instanceMatrix*localPos;
      norm=mat3(instanceMatrix)*norm;
    #endif
    vec4 eye=modelViewMatrix*localPos;
    vViewPos=eye.xyz;
    vViewNormal=normalize(normalMatrix*norm);
    gl_Position=projectionMatrix*eye;
  }
`;
const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec3 vLocal;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  void main(){
    vec3 normal=normalize(vViewNormal);
    vec3 toward=normalize(-vViewPos);
    float facing=clamp(abs(dot(normal,toward)),0.0,1.0);
    float rim=pow(1.0-facing,2.1);
    // Twin opposite-direction flowing interference bands, Mode 1 style.
    float t=uTime*1.05;
    float a=sin(vLocal.y*7.0 + vLocal.x*5.1 - vLocal.z*3.7 + t*1.30);
    float b=sin(vLocal.y*11.3 - vLocal.z*6.4 + t*-0.85);
    float band=clamp(0.53+0.30*a+0.17*b,0.0,1.0);
    vec3 holo=mix(uColorA,uColorB,band);
    float moving=0.5+0.5*sin(vLocal.y*9.4+t*2.2+vLocal.x*4.7);
    float scan=pow(moving,12.0);
    float narrow=pow(0.5+0.5*sin(vLocal.y*14.6-t*3.3),14.0);
    float shine=pow(max(dot(normal,normalize(toward+vec3(.29,.76,.26))),0.0),40.0);
    float alpha=clamp(0.10+0.36*rim+0.15*scan+0.08*narrow+0.13*shine,0.07,0.72);
    vec3 color=holo*(0.92+0.40*rim)+vec3(1.0,.98,.99)*(scan*.25+shine*.38);
    gl_FragColor=vec4(clamp(color,0.0,1.0),alpha);
    #include <colorspace_fragment>
  }
`;

export default function Snow360TokenRushCandyCanes({markers=[],groundY}) {
  const poles=useRef(null);
  const filmMesh=useRef(null);
  const topCaps=useRef(null);
  const texture=useMemo(makeStripesTexture,[]);
  const geometry=useMemo(()=>{
    const g=new THREE.CylinderGeometry(POLE_RADIUS,POLE_RADIUS,POLE_HEIGHT,12,1,false);
    g.translate(0,POLE_HEIGHT*.5+0.04,0);
    return g;
  },[]);
  const capGeometry=useMemo(()=>{
    const g=new THREE.SphereGeometry(POLE_RADIUS,12,8);
    g.translate(0,POLE_HEIGHT+.04,0);
    return g;
  },[]);
  const bodyMat=useMemo(()=>new THREE.MeshStandardMaterial({
    name:"Snow360_Pastel_Candy_Stripes_Transparent",
    map:texture,color:"#fffafc",roughness:.22,metalness:.04,
    transparent:true,opacity:.72,depthWrite:false,side:THREE.DoubleSide,
    emissive:"#a865a3",emissiveIntensity:.12,
  }),[texture]);
  const capMat=useMemo(()=>new THREE.MeshPhysicalMaterial({
    name:"Snow360_Pearly_Candy_Top",
    color:"#ffe5f5",metalness:.10,roughness:.20,
    transparent:true,opacity:.72,depthWrite:false,
    clearcoat:1,clearcoatRoughness:.14,
    emissive:"#cfa4ee",emissiveIntensity:.22,
  }),[]);
  const filmMat=useMemo(()=>new THREE.ShaderMaterial({
    name:"Snow360_CorePlanet_CandyPole_ThinFilm",
    transparent:true,depthWrite:false,depthTest:true,
    blending:THREE.NormalBlending,
    side:THREE.FrontSide,
    toneMapped:false,
    uniforms:{uTime:{value:0},uColorA:{value:new THREE.Color("#ffd0e9")},
      uColorB:{value:new THREE.Color("#c8e7ff")}},
    vertexShader:VERTEX,fragmentShader:FRAGMENT,
  }),[]);
  const scratch=useMemo(()=>({matrix:new THREE.Matrix4(),pos:new THREE.Vector3(),
    rotation:new THREE.Quaternion(),scale:new THREE.Vector3(1,1,1),
    a:new THREE.Color(),b:new THREE.Color()}),[]);

  useLayoutEffect(()=>{
    if(!poles.current||!filmMesh.current||!topCaps.current)return;
    for(let i=0;i<markers.length;i++){
      const m=markers[i];
      scratch.pos.set(m.x,groundY(m.x,m.z)-.04,m.z);
      scratch.rotation.identity(); // Absolute straight vertical on every turn.
      scratch.matrix.compose(scratch.pos,scratch.rotation,scratch.scale);
      poles.current.setMatrixAt(i,scratch.matrix);
      filmMesh.current.setMatrixAt(i,scratch.matrix);
      topCaps.current.setMatrixAt(i,scratch.matrix);
    }
    poles.current.instanceMatrix.needsUpdate=true;
    filmMesh.current.instanceMatrix.needsUpdate=true;
    topCaps.current.instanceMatrix.needsUpdate=true;
  },[markers,groundY,scratch]);

  useFrame(({clock},dt)=>{
    const time=clock.elapsedTime;
    // Gentle animated diagonal stripes plus 12-second pastel hue cycle.
    texture.offset.y=(texture.offset.y+Math.min(dt,.06)*.10)%1;
    const phase=(time/12)*PASTELS.length;
    filmMat.uniforms.uTime.value=time;
    filmMat.uniforms.uColorA.value.copy(samplePastel(scratch.a,phase));
    filmMat.uniforms.uColorB.value.copy(samplePastel(scratch.b,phase+.65));
    capMat.emissiveIntensity=.16+.16*(.5+.5*Math.sin(time*2.6));
  });

  useEffect(()=>()=>{
    geometry.dispose();capGeometry.dispose();
    bodyMat.dispose();capMat.dispose();filmMat.dispose();texture.dispose();
  },[geometry,capGeometry,bodyMat,capMat,filmMat,texture]);

  if(!markers.length)return null;
  return <group name="Token Rush Upright Holographic Candy Stripe Corner Poles">
    <instancedMesh ref={poles} args={[geometry,bodyMat,markers.length]}
      frustumCulled={false} castShadow={false} receiveShadow={false} renderOrder={2}/>
    <instancedMesh ref={filmMesh} args={[geometry,filmMat,markers.length]}
      frustumCulled={false} castShadow={false} receiveShadow={false} renderOrder={3}/>
    <instancedMesh ref={topCaps} args={[capGeometry,capMat,markers.length]}
      frustumCulled={false} castShadow={false} receiveShadow={false} renderOrder={4}/>
  </group>;
}
