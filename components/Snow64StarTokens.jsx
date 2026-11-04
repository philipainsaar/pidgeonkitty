"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// V74: same rounded five-point star, same game physics/animation,
// but with a transparent body, a CorePlanet-style hologram shell,
// additive warm yellow aura and an immediate 0.45-second pickup burst.
// The original yellow/honey/champagne-only color family is retained.
const GOLD_PARTICLES = 14;
const BURST_SECONDS = 0.45;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function makeRoundedStarGeometry() {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.54;
    const a = Math.PI * 0.5 + i * Math.PI / 5;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const shape = new THREE.Shape();
  const corner = 0.19;
  const before = i => pts[i].clone().lerp(pts[(i + 9) % 10], corner);
  const after = i => pts[i].clone().lerp(pts[(i + 1) % 10], corner);
  const first = before(0);
  shape.moveTo(first.x, first.y);
  for (let i = 0; i < pts.length; i++) {
    const a = before(i), b = after(i);
    shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(pts[i].x, pts[i].y, b.x, b.y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.29,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.13,
    bevelSegments: 5,
    curveSegments: 6,
  });
  g.center();
  g.computeBoundingSphere();
  return g;
}

// The CorePlanet shell shader, adapted to use instanceMatrix and confined
// to golden, buttery yellow/cream colors.
const STAR_SHELL_VERTEX = [
  "uniform float uRadius;",
  "uniform float uGap;",
  "varying vec3 vPosition;",
  "varying vec3 vNormalView;",
  "varying vec3 vPositionView;",
  "void main() {",
  "  vPosition=position/max(0.001,uRadius);",
  "  vec3 outer=position+normalize(normal)*uGap;",
  "  vec4 localPos=vec4(outer,1.0);",
  "  vec3 n=normal;",
  "  #ifdef USE_INSTANCING",
  "    localPos=instanceMatrix*localPos;",
  "    n=mat3(instanceMatrix)*n;",
  "  #endif",
  "  vec4 p=modelViewMatrix*localPos;",
  "  vPositionView=p.xyz;",
  "  vNormalView=normalize(normalMatrix*n);",
  "  gl_Position=projectionMatrix*p;",
  "}",
].join("\n");

const STAR_SHELL_FRAGMENT = [
  "uniform float uTime;",
  "uniform float uIntensity;",
  "uniform float uRimGlow;",
  "uniform float uReflections;",
  "uniform float uFlowSpeed;",
  "uniform float uBandScale;",
  "uniform vec3 uPink;",
  "uniform vec3 uBlue;",
  "uniform vec3 uKeyViewPosition;",
  "uniform vec3 uFillViewPosition;",
  "varying vec3 vPosition;",
  "varying vec3 vNormalView;",
  "varying vec3 vPositionView;",
  "void main() {",
  "  vec3 n=normalize(vNormalView);",
  "  vec3 v=normalize(-vPositionView);",
  "  float facing=clamp(dot(n,v),0.0,1.0);",
  "  float fresnel=pow(1.0-facing,2.15);",
  "  vec3 p=vPosition;",
  "  float scale=max(0.05,uBandScale);",
  "  float t=uTime*uFlowSpeed;",
  "  float phaseA=sin(scale*(p.x*5.1+p.y*3.7-p.z*2.4)+t*1.30);",
  "  float phaseB=sin(scale*(p.z*6.4-p.x*2.6+p.y*1.7)-t*0.85);",
  "  float mixFactor=clamp(0.52+0.34*phaseA+0.18*phaseB,0.0,1.0);",
  "  vec3 film=mix(uBlue,uPink,mixFactor);",
  "  film=mix(film,vec3(1.0,0.98,0.75),0.11);",
  "  vec3 keyDir=normalize(uKeyViewPosition-vPositionView);",
  "  vec3 fillDir=normalize(uFillViewPosition-vPositionView);",
  "  float keyGlint=pow(max(dot(n,normalize(v+keyDir)),0.0),112.0);",
  "  float fillGlint=pow(max(dot(n,normalize(v+fillDir)),0.0),76.0);",
  "  float sweepPeriod=2.4;",
  "  float sweepCenter=mod(t*0.75,sweepPeriod)-0.5*sweepPeriod;",
  "  float stripPosition=p.x*0.72+p.y*0.39+0.08*phaseB;",
  "  float stripDistance=abs(stripPosition-sweepCenter);",
  "  stripDistance=min(stripDistance,abs(stripPosition-sweepCenter+sweepPeriod));",
  "  stripDistance=min(stripDistance,abs(stripPosition-sweepCenter-sweepPeriod));",
  "  float strip=exp(-pow(stripDistance/0.070,2.0));",
  "  strip*=0.35+0.65*fresnel;",
  "  float shine=max(0.0,uReflections)*(0.80*keyGlint+0.48*fillGlint+0.20*strip);",
  "  float flowing=0.5+0.5*sin(scale*(p.x*7.3-p.y*4.0)-t*1.0);",
  "  float rim=fresnel*max(0.0,uRimGlow);",
  "  float alpha=max(0.0,uIntensity)*(0.038+0.075*flowing+0.29*rim+0.22*shine);",
  "  alpha=clamp(alpha,0.0,0.78);",
  "  vec3 color=film*(0.88+0.45*rim)+vec3(1.0,0.98,0.65)*(1.40*shine);",
  "  gl_FragColor=vec4(color,alpha);",
  "  #include <colorspace_fragment>",
  "}",
].join("\n");

// One soft billboard halo per token. No GLB or texture file required.
const GLOW_VERTEX = [
  "varying vec2 vGlowUv;",
  "void main() {",
  "  vGlowUv=uv;",
  "  vec4 p=vec4(position,1.0);",
  "  #ifdef USE_INSTANCING",
  "    p=instanceMatrix*p;",
  "  #endif",
  "  gl_Position=projectionMatrix*modelViewMatrix*p;",
  "}",
].join("\n");
const GLOW_FRAGMENT = [
  "varying vec2 vGlowUv;",
  "void main() {",
  "  vec2 d=(vGlowUv-.5)*2.0;",
  "  float r=dot(d,d);",
  "  float soft=exp(-r*3.8)*0.24;",
  "  float core=exp(-r*18.0)*0.24;",
  "  float cross=exp(-pow(abs(d.x)/.045,2.0))*exp(-abs(d.y)*2.8);",
  "  cross+=exp(-pow(abs(d.y)/.045,2.0))*exp(-abs(d.x)*2.8);",
  "  float alpha=soft+core+cross*.035;",
  "  gl_FragColor=vec4(1.0,0.83,0.30,alpha);",
  "  #include <colorspace_fragment>",
  "}",
].join("\n");

function emptyMatrix() {
  return new THREE.Matrix4().makeScale(0.000001, 0.000001, 0.000001);
}

export default function Snow64StarTokens({
  items = [],
  groundY,
  collectedRef,
  preview = false,
}) {
  const body = useRef(null);
  const shell = useRef(null);
  const glow = useRef(null);
  const particles = useRef(null);
  const rings = useRef(null);
  const bursts = useRef(new Map());
  const seenCollected = useRef(new Set());

  const geometry = useMemo(makeRoundedStarGeometry, []);
  const bodyMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    name: "SNOW360_V74_TranslucentGoldenStar",
    color: "#ffe36b",
    roughness: 0.20,
    metalness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: "#a68126",
    emissiveIntensity: 0.24,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);

  const shellMaterial = useMemo(() => new THREE.ShaderMaterial({
    name: "SNOW360_V74_CorePlanetYellowHologram",
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
    uniforms: {
      uTime: {value:0},
      uKeyViewPosition: {value:new THREE.Vector3()},
      uFillViewPosition: {value:new THREE.Vector3()},
      uRadius: {value:Math.max(geometry.boundingSphere?.radius || 1, 0.01)},
      uGap: {value:0.038},
      uIntensity: {value:1.95},
      uRimGlow: {value:1.85},
      uReflections: {value:2.5},
      uFlowSpeed: {value:0.7},
      uBandScale: {value:1.15},
      // yellow ONLY, with creamy champagne glints
      uPink: {value:new THREE.Color("#fff18b")},
      uBlue: {value:new THREE.Color("#ffc64a")},
    },
    vertexShader: STAR_SHELL_VERTEX,
    fragmentShader: STAR_SHELL_FRAGMENT,
  }), [geometry]);

  const glowGeometry = useMemo(() => new THREE.PlaneGeometry(2.0,2.0), []);
  const glowMaterial = useMemo(() => new THREE.ShaderMaterial({
    name: "SNOW360_V74_WarmYellowGlow",
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: THREE.DoubleSide,
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
  }), []);

  const particleGeometry = useMemo(() => new THREE.OctahedronGeometry(0.065,0), []);
  const particleMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#fff7ce",
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);
  const ringGeometry = useMemo(() => new THREE.RingGeometry(.84,1.0,28), []);
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#ffe875",
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  }), []);

  const scratch = useMemo(() => ({
    star: new THREE.Object3D(),
    glow: new THREE.Object3D(),
    particle: new THREE.Object3D(),
    ring: new THREE.Object3D(),
    keyView: new THREE.Vector3(),
    fillView: new THREE.Vector3(),
    color: new THREE.Color(),
    hidden: emptyMatrix(),
  }), []);

  const particleCount = items.length * GOLD_PARTICLES;

  // Mark coins already collected when a course chunk remounts.
  // This avoids replaying the burst for previously collected tokens.
  useLayoutEffect(() => {
    const existing = collectedRef?.current;
    seenCollected.current = new Set(
      existing ? items.filter(c => existing.has(c.id)).map(c => c.id) : []
    );
    bursts.current.clear();
  }, [items, collectedRef]);

  useLayoutEffect(() => {
    const hidden=scratch.hidden;
    if (particles.current) {
      for (let i=0; i<particleCount; i++) particles.current.setMatrixAt(i,hidden);
      particles.current.instanceMatrix.needsUpdate=true;
    }
    if (rings.current) {
      for (let i=0; i<items.length; i++) rings.current.setMatrixAt(i,hidden);
      rings.current.instanceMatrix.needsUpdate=true;
    }
  }, [items,particleCount,scratch]);

  useEffect(() => () => {
    geometry.dispose();
    bodyMaterial.dispose();
    shellMaterial.dispose();
    glowGeometry.dispose();
    glowMaterial.dispose();
    particleGeometry.dispose();
    particleMaterial.dispose();
    ringGeometry.dispose();
    ringMaterial.dispose();
  }, [geometry,bodyMaterial,shellMaterial,glowGeometry,glowMaterial,
      particleGeometry,particleMaterial,ringGeometry,ringMaterial]);

  useFrame(({clock,camera}) => {
    const t=clock.elapsedTime;
    const bodyMesh=body.current;
    const shellMesh=shell.current;
    const glowMesh=glow.current;
    const particleMesh=particles.current;
    const ringMesh=rings.current;
    if (!bodyMesh || !shellMesh || !glowMesh || !particleMesh || !ringMesh) return;

    // Match the actual CorePlanet hologram's key/fill lighting positions.
    const uniforms=shellMaterial.uniforms;
    uniforms.uTime.value=t;
    scratch.keyView.set(-8,20,-30).applyMatrix4(camera.matrixWorldInverse);
    scratch.fillView.set(13,14,8).applyMatrix4(camera.matrixWorldInverse);
    uniforms.uKeyViewPosition.value.copy(scratch.keyView);
    uniforms.uFillViewPosition.value.copy(scratch.fillView);

    let particlesDirty = false;
    for (let i=0; i<items.length; i++) {
      const c=items[i];
      const hidden=!preview && !!collectedRef?.current?.has(c.id);
      const y=groundY(c.x,c.z)+1.3+Math.sin(t*4+c.z)*0.14;
      if (hidden && !seenCollected.current.has(c.id)) {
        bursts.current.set(c.id,{time:t,x:c.x,y,z:c.z});
      }
      if (hidden) seenCollected.current.add(c.id);
      else {
        seenCollected.current.delete(c.id);
        if (bursts.current.has(c.id)) bursts.current.delete(c.id);
      }

      scratch.star.position.set(c.x,y,c.z);
      scratch.star.rotation.set(0,t*2.3,0);  // original rotation
      scratch.star.scale.setScalar(hidden?0.000001:0.48);
      scratch.star.updateMatrix();
      bodyMesh.setMatrixAt(i,scratch.star.matrix);
      shellMesh.setMatrixAt(i,scratch.star.matrix);

      scratch.glow.position.set(c.x,y,c.z);
      scratch.glow.rotation.set(0,0,0);
      scratch.glow.quaternion.copy(camera.quaternion);
      scratch.glow.scale.setScalar(hidden?0.000001:0.76);
      scratch.glow.updateMatrix();
      glowMesh.setMatrixAt(i,scratch.glow.matrix);

      const b=bursts.current.get(c.id);
      const age=b?t-b.time:100;
      const active=age>=0 && age<BURST_SECONDS;
      const fade=active?Math.pow(1-age/BURST_SECONDS,1.45):0;
      const expand=active?1-Math.pow(1-age/BURST_SECONDS,2):0;

      if(active){
        scratch.ring.position.set(b.x,b.y,b.z);
        scratch.ring.rotation.set(0,0,0);
        scratch.ring.quaternion.copy(camera.quaternion);
        scratch.ring.scale.setScalar((0.18+expand*0.93)*fade);
        scratch.ring.updateMatrix();
        ringMesh.setMatrixAt(i,scratch.ring.matrix);
        ringMesh.setColorAt(i,scratch.color.setRGB(fade,fade*.90,fade*.36));
      }else{
        ringMesh.setMatrixAt(i,scratch.hidden);
        ringMesh.setColorAt(i,scratch.color.setRGB(0,0,0));
      }

      // Performance: update particle matrices ONLY during an actual burst,
      // not for every uncollected token on every game frame.
      if (active || b) {
        particlesDirty = true;
        for (let j=0; j<GOLD_PARTICLES; j++){
          const k=i*GOLD_PARTICLES+j;
          if (!active) {
            particleMesh.setMatrixAt(k,scratch.hidden);
            particleMesh.setColorAt(k,scratch.color.setRGB(0,0,0));
            continue;
          }
          const a=j*GOLDEN_ANGLE+0.4*c.x;
        const v=(j+0.5)/GOLD_PARTICLES;
        const speed=0.65+(j%5)*0.13;
        const dx=Math.cos(a)*speed;
        const dz=Math.sin(a)*speed;
        const dy=(v-.3)*1.15;
        scratch.particle.position.set(
          b.x+dx*expand,
          b.y+dy*expand-0.12*expand*expand,
          b.z+dz*expand
        );
        scratch.particle.rotation.set(t*(2+j*.1),t*(2.5+j*.2),0);
        scratch.particle.scale.setScalar((.70+(j%4)*.22)*fade);
        scratch.particle.updateMatrix();
        particleMesh.setMatrixAt(k,scratch.particle.matrix);
        particleMesh.setColorAt(k,scratch.color.setRGB(
          Math.min(1,fade*1.20),fade*.90,fade*.25
        ));
        }
      }
      if(b && !active)bursts.current.delete(c.id);
    }
    bodyMesh.instanceMatrix.needsUpdate=true;
    shellMesh.instanceMatrix.needsUpdate=true;
    glowMesh.instanceMatrix.needsUpdate=true;
    ringMesh.instanceMatrix.needsUpdate=true;
    if(particlesDirty){
      particleMesh.instanceMatrix.needsUpdate=true;
      if(particleMesh.instanceColor)particleMesh.instanceColor.needsUpdate=true;
    }
    if(ringMesh.instanceColor)ringMesh.instanceColor.needsUpdate=true;
  });

  if(!items.length)return null;
  return <>
    <instancedMesh ref={body}
      args={[geometry,bodyMaterial,items.length]}
      frustumCulled={false} renderOrder={3}
      receiveShadow={false} castShadow={false}/>
    <instancedMesh ref={glow}
      args={[glowGeometry,glowMaterial,items.length]}
      frustumCulled={false} renderOrder={4}/>
    <instancedMesh ref={shell}
      args={[geometry,shellMaterial,items.length]}
      frustumCulled={false} renderOrder={5}/>
    <instancedMesh ref={particles} name="Snow360TokenBurstParticles"
      args={[particleGeometry,particleMaterial,particleCount]}
      frustumCulled={false} renderOrder={7}/>
    <instancedMesh ref={rings}
      args={[ringGeometry,ringMaterial,items.length]}
      frustumCulled={false} renderOrder={6}/>
  </>;
}
