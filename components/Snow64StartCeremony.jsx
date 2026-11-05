"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { useSnowModel, SnowGLBVisual } from "./snow64VisualModels";
import { getSnow360Rider, assertSnow360Clips } from "./snow360RiderConfig";
import { createSnow360RiderAnimator } from "./snow360RiderAnimator";

const FRONT_REVEAL = 1.15;
const WALK_END = 2.18;
const MOUNT_END = 3.18;
const INTRO_END = 3.86;
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = v => { const p = clamp01(v); return p * p * (3 - 2 * p); };
const lerp = THREE.MathUtils.lerp;

function findWaveBone(root) {
  let best = null, score = -1;
  root.traverse(o => {
    if (!o.isBone) return;
    const n = o.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const s = (/wing|arm|shoulder/.test(n) ? 6 : 0)
      + (/right|wingr|armr/.test(n) ? 2 : 0)
      + (/hand|wrist/.test(n) ? 1 : 0);
    if (s > score) { score = s; best = o; }
  });
  return score >= 6 ? best : null;
}

export default function Snow64StartCeremony({ riderId="alien-cat", mobile, phase, onComplete, groundY }) {
  const profile=getSnow360Rider(riderId);
  const { scene, animations } = useGLTF(mobile ? profile.mobile : profile.desktop);
  useMemo(()=>assertSnow360Clips(animations),[animations]);
  const character = useMemo(() => cloneSkinned(scene), [scene]);
  const animator=useMemo(()=>createSnow360RiderAnimator(character,animations),[character,animations]);
  const clips=useMemo(()=>Object.fromEntries(animations.map(c=>[c.name,c])),[animations]);
  const waveBone = useMemo(() => findWaveBone(character), [character]);
  const root = useRef(), rider = useRef(), board = useRef(), dust = useRef();
  const previousPhase = useRef(null), elapsed = useRef(0), finished = useRef(false);
  const asset = useSnowModel("snowboard"), { camera } = useThree();
  const aim = useMemo(() => new THREE.Vector3(), []), goal = useMemo(() => new THREE.Vector3(), []);
  const matchingGameCamera = useMemo(() => new THREE.Vector3(), []), gameAim = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    animator.reset();
    return () => {animator.dispose();previousPhase.current = null;};
  }, [animator]);
  const animate = (name, speed = 1) => {
    animator.setPose(name,name,{oneShot:name==="SnowboardRemount",timeScale:speed,fadeSeconds:.18});
    animator.setSpeed(name,speed);
  };

  useFrame(({ clock }, delta) => {
    const dt = Math.min(.05, Math.max(0, delta));
    if (previousPhase.current !== phase) {
      previousPhase.current = phase;
      elapsed.current = 0;
      finished.current = false;
      if (phase === "ready") { animator.reset(); }
    }

    const playing = phase === "intro";
    if (playing) elapsed.current = Math.min(INTRO_END, elapsed.current + dt);
    const t = playing ? elapsed.current : 0;
    const walkP = ease((t - .74) / (WALK_END - .74));
    const mountP = ease((t - WALK_END) / (MOUNT_END - WALK_END));
    const z = lerp(1.80, 0, walkP);
    const y = groundY(0, z);

    const waveName=clips[profile.wave] ? profile.wave : "SnowboardIdle";
    if (!playing || t < .95) animate(waveName, .9);
    else if (t < WALK_END) animate(clips.Walk ? "Walk" : "Run", .9);
    else if(t < MOUNT_END) animate("SnowboardRemount",clips.SnowboardRemount.duration/(MOUNT_END-WALK_END));
    else animate("SnowboardCruise");
    animator.update(dt);
    if (waveBone && !clips[profile.wave]) {
      const waveAmount = playing ? 1 - ease((t - .45) / .60) : 1;
      waveBone.rotation.x += waveAmount * (.22 + .15 * Math.sin(clock.elapsedTime * 5.5));
      waveBone.rotation.z += waveAmount * (.25 + .31 * Math.sin(clock.elapsedTime * 5.5));
    }

    if (root.current) root.current.position.set(0, y + .12, z);
    if (rider.current) {
      rider.current.rotation.y = profile.plush ? lerp(Math.PI,Math.PI/2,mountP) : Math.PI/2;
      rider.current.position.x = profile.offsetX*mountP;
      rider.current.position.y = profile.plush
        ? lerp(-.12-.013*profile.scale,profile.bindingHeight,mountP)
        : lerp(.10, profile.bindingHeight, mountP) + (!playing ? .026 * Math.sin(clock.elapsedTime * 2.3) : 0);
    }
    if (board.current) {
      board.current.position.set(lerp(.80, 0, mountP), lerp(1.16, .04, mountP), .09 * (1 - mountP));
      board.current.rotation.set(lerp(Math.PI / 2, 0, mountP), 0, lerp(-.14, 0, mountP));
    }
    if (dust.current) {
      dust.current.visible = playing && t >= WALK_END && t <= MOUNT_END;
      dust.current.position.set(0, y + .1, z + .16);
      dust.current.scale.setScalar(.60 + .60 * Math.sin(Math.PI * mountP));
    }

    const startGround = groundY(0, 0);
    const readyAz = -Math.PI;
    const frontAz = readyAz + .92;
    const readyRadius = mobile ? 7.10 : 6.35;
    const reveal = ease(t / FRONT_REVEAL);
    const returnP = ease((t - 2.05) / (INTRO_END - 2.05));
    const orbitAz = lerp(readyAz, frontAz, reveal);
    const orbitRadius = lerp(readyRadius, mobile ? 6.55 : 6.10, reveal);

    // V9: slightly wider and tilted upward to frame the *whole* castle plus
    // enlarged gem-studded clouds. The eye stays low, the course walls stay
    // symmetrical, and the rider/board remain the centered foreground focus.
    const centerX = lerp(.39, .10, mountP);
    aim.set(centerX, y + lerp(1.90, 1.08, mountP), z);
    goal.set(
      playing ? aim.x + Math.sin(orbitAz) * orbitRadius : 0,
      y + lerp(mobile ? 1.25 : 1.26, mobile ? 1.80 : 1.87, reveal),
      aim.z + Math.cos(orbitAz) * orbitRadius,
    );

    matchingGameCamera.set(mobile ? -.25 : -3.0, startGround + (mobile ? 2.65 : 2.25), mobile ? 7.6 : 5.6);
    goal.lerp(matchingGameCamera, returnP);
    gameAim.set(0, startGround + 1.14, -1.30);
    aim.lerp(gameAim, returnP);

    camera.position.copy(goal);
    camera.lookAt(aim);
    camera.fov = lerp(mobile ? 49 : 46, mobile ? 43 : 42, returnP);
    camera.updateProjectionMatrix();

    if (playing && t >= INTRO_END && !finished.current) {
      finished.current = true;
      onComplete();
    }
  });

  return <>
    <group ref={root}>
      <group ref={rider}>
        <primitive object={character} dispose={null} scale={profile.scale} />
      </group>
      <group ref={board}>
        {asset ? <SnowGLBVisual asset={asset} type="snowboard" dimensions={[.74, .25, 2.43]} />
          : <mesh><boxGeometry args={[.74, .10, 2.43]} /><meshStandardMaterial color="#f7b8d9" roughness={.54} /></mesh>}
      </group>
    </group>
    <group ref={dust} visible={false}>
      <mesh scale={[.28, .13, .23]}><sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#f9ffff" transparent opacity={.48} depthWrite={false} /></mesh>
    </group>
  </>;
}
