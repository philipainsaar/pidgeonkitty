"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Snow360 / Ice Cream Power: actual snowboard-emitted candy particles for mobile.
 *
 * Unlike the old CSS overlay, these are world-space 3D rods with perspective,
 * depth testing, and independent physics. The exact snowboard group determines
 * emission position and direction on every frame, including Sky Surf / tricks.
 * Scene 1 and Scene 2 share this ONE renderer and the desktop Canvas is intact.
 * One instanced draw call; no additional canvas/context/texture/PNG/GLB required.
 */
export const SNOW360_3D_SPRINKLE_COUNT = 105;
const PALETTE = ["#ff87bf", "#ffdf82", "#7ee4c2", "#7bcfff", "#b999ff", "#fff9fc", "#ff9bd3"];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const between = (a, b) => a + Math.random() * (b - a);

export default function Snow360IcecreamBoardSprinkles({boardRef, stateRef, phase="playing"}) {
  const meshRef = useRef(null);
  const activeRef = useRef(false);
  const lastScene = useRef(0);
  const lastTrick = useRef(null);
  const nextIndex = useRef(0);
  const emissionCarry = useRef(0);

  // Geometry is a rounded candy rod rather than a flat rectangular screen sprite.
  const geometry = useMemo(() => new THREE.CapsuleGeometry(0.5, 2.2, 2, 6), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
    transparent: false,
    depthTest: true,
    depthWrite: false,
    fog: false,
  }), []);
  const colors = useMemo(() => PALETTE.map(hex => new THREE.Color(hex)), []);
  const particles = useMemo(() => Array.from({length:SNOW360_3D_SPRINKLE_COUNT}, () => ({
    life:0, duration:1, position:new THREE.Vector3(), velocity:new THREE.Vector3(),
    rotation:new THREE.Euler(), spin:new THREE.Vector3(), width:.08, length:.13,
  })), []);
  const scratch = useMemo(() => ({
    dummy:new THREE.Object3D(), origin:new THREE.Vector3(), quat:new THREE.Quaternion(),
    previousOrigin:new THREE.Vector3(), boardVelocity:new THREE.Vector3(),
    offset:new THREE.Vector3(), launch:new THREE.Vector3(),
  }), []);

  useEffect(() => {
    if(meshRef.current){
      meshRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      meshRef.current.visible=false;
    }
    return () => {geometry.dispose(); material.dispose();};
  }, [geometry,material]);

  useFrame((_,rawDt) => {
    const mesh=meshRef.current;
    if(!mesh) return;
    const s=stateRef.current;
    const board=boardRef.current;
    const active=phase==="playing" && !!board && !!s &&
      s.powerTime>0 && s.icecreamHover && !s.recovery &&
      (s.icecreamScene===1 || s.icecreamScene===2);

    if(!active){
      if(activeRef.current){
        activeRef.current=false;
        lastScene.current=0;
        lastTrick.current=null;
        emissionCarry.current=0;
        particles.forEach(p=>{p.life=0;});
        mesh.visible=false;
      }
      return;
    }

    // Update the parent transforms first so particles begin at the snowboard,
    // not an approximate fixed point or the centre of the phone screen.
    board.updateWorldMatrix(true,false);
    board.getWorldPosition(scratch.origin);
    board.getWorldQuaternion(scratch.quat);
    const dt=clamp(rawDt,0,.045);
    const speed=clamp(Number(s.speed)||40,16,100);
    const isSky=s.icecreamScene===2;
    const start=!activeRef.current || lastScene.current!==s.icecreamScene;
    if(start){
      activeRef.current=true;
      lastScene.current=s.icecreamScene;
      nextIndex.current=0;
      emissionCarry.current=0;
      lastTrick.current=null;
      particles.forEach(p=>{p.life=0;});
      mesh.visible=true;
      scratch.previousOrigin.copy(scratch.origin);
      scratch.boardVelocity.set(0,0,0);
    }else{
      // The snowboard itself moves downhill fast (often 50+ world units/sec).
      // Inherit its REAL world velocity so candy stays around the board and
      // streams behind it instead of disappearing off-screen in 0.1 seconds.
      scratch.boardVelocity.subVectors(scratch.origin,scratch.previousOrigin)
        .multiplyScalar(1/Math.max(.008,rawDt));
      scratch.boardVelocity.clampLength(0,125);
      scratch.previousOrigin.copy(scratch.origin);
    }

    // All particles start at the physical board tail. They then travel through
    // the actual Three.js world behind the moving snowboard, which creates
    // correct parallax and occlusion during the randomized cinematic cameras.
    const spawn = (burst=false) => {
      const index=nextIndex.current++ % particles.length;
      const p=particles[index];
      const side=between(-.32,.32);
      scratch.offset.set(side,between(.02,.13),between(.36,.91));
      scratch.offset.applyQuaternion(scratch.quat);
      p.position.copy(scratch.origin).add(scratch.offset);
      const spread=burst?1.5:1;
      scratch.launch.set(
        between(-5.3,5.3)*spread,
        between(1.0,4.4)*spread,
        between(3.5,9.0) + speed*.13
      );
      scratch.launch.applyQuaternion(scratch.quat);
      // The flight remains buoyant even when the snowboard is flipping.
      p.velocity.copy(scratch.launch).addScaledVector(scratch.boardVelocity,.91);
      // Relative drift makes the rods stream BACK from the rider while
      // retaining the character's downhill, carving and Sky Surf movement.
      p.velocity.y+=between(1.1,2.9);
      p.velocity.y=clamp(p.velocity.y,-25,32);
      p.duration=between(.52,1.02)*(isSky?1.13:1);
      p.life=p.duration;
      p.width=between(.068,.112); // THICK rounded candy rods.
      p.length=between(.106,.181); // Preserve the LONG shape.
      p.rotation.set(between(-3,3),between(-3,3),between(-3,3));
      p.spin.set(between(-6,6),between(-6,6),between(-6,6));
      mesh.setColorAt(index,colors[Math.floor(Math.random()*colors.length)]);
    };

    if(start){
      // Visible pickup burst at the board, never screen-wide falling confetti.
      for(let i=0;i<28;i++)spawn(true);
    }
    const trickIdentity=s.trick?.id ?? null;
    if(trickIdentity!==null && trickIdentity!==lastTrick.current){
      lastTrick.current=trickIdentity;
      for(let i=0;i<12;i++)spawn(true);
    }else if(trickIdentity===null){lastTrick.current=null;}

    // Same ~105 maximum active particles as the original mobile treatment,
    // not the doubled mobile-only 170 particle experiment.
    const emissionRate=clamp(82+speed*.37,88,124);
    emissionCarry.current=Math.min(15,emissionCarry.current+emissionRate*dt);
    const toEmit=Math.min(9,Math.floor(emissionCarry.current));
    emissionCarry.current-=toEmit;
    for(let i=0;i<toEmit;i++)spawn(false);

    const obj=scratch.dummy;
    for(let i=0;i<particles.length;i++){
      const p=particles[i];
      if(p.life>0){
        p.life-=dt;
        if(p.life>0){
          p.position.addScaledVector(p.velocity,dt);
          p.velocity.y-=(isSky?2.1:3.5)*dt;
          p.velocity.x*=Math.max(0,1-dt*.26);
          p.rotation.x+=p.spin.x*dt;
          p.rotation.y+=p.spin.y*dt;
          p.rotation.z+=p.spin.z*dt;
          obj.position.copy(p.position);
          obj.rotation.copy(p.rotation);
          // Solid, long candy pieces with true 3D perspective and depth.
          obj.scale.set(p.width,p.length,p.width);
        } else {
          obj.position.set(0,-10000,0);
          obj.scale.setScalar(0.00001);
        }
      } else {
        obj.position.set(0,-10000,0);
        obj.scale.setScalar(0.00001);
      }
      obj.updateMatrix();
      mesh.setMatrixAt(i,obj.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  });

  return <instancedMesh ref={meshRef} args={[geometry,material,SNOW360_3D_SPRINKLE_COUNT]}
    visible={false} frustumCulled={false} renderOrder={2}
    castShadow={false} receiveShadow={false}
    name="Snow360 real 3D snowboard candy sprinkle trail"/>;
}
