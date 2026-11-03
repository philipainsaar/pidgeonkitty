"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { useSnowModel, SnowGLBVisual } from "./snow64VisualModels";
import { SNOW64_MODEL_PATHS } from "./snow64ModelConfig";

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

export default function Snow64StartCeremony({ mobile, phase, onComplete, groundY }) {
  const { scene, animations } = useGLTF(mobile ? SNOW64_MODEL_PATHS.riderMobile : SNOW64_MODEL_PATHS.riderDesktop);
  const character = useMemo(() => cloneSkinned(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(character), [character]);
  const actions = useMemo(
    () => Object.fromEntries(animations.map(clip => [clip.name, mixer.clipAction(clip)])),
    [animations, mixer],
  );
  const waveBone = useMemo(() => findWaveBone(character), [character]);
  const root = useRef(), rider = useRef(), board = useRef(), dust = useRef();
  const previousPhase = useRef(null), elapsed = useRef(0), finished = useRef(false), active = useRef(null);
  const asset = useSnowModel("snowboard"), { camera } = useThree();
  const aim = useMemo(() => new THREE.Vector3(), []), goal = useMemo(() => new THREE.Vector3(), []);
  const matchingGameCamera = useMemo(() => new THREE.Vector3(), []), gameAim = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => () => {
    mixer.stopAllAction();
    active.current = null;
    previousPhase.current = null;
  }, [mixer]);

  const animate = (name, speed = 1) => {
    const action = actions[name] || actions.SnowboardIdle || actions.Idle || Object.values(actions)[0];
    if (!action) return;
    if (active.current !== action) {
      const old = active.current;
      const oneShot = name === "SnowboardRemount" && !!actions.SnowboardRemount;
      action.reset();
      action.enabled = true;
      action.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
      action.clampWhenFinished = oneShot;
      action.setEffectiveWeight(1);
      action.fadeIn(.18).play();
      if (old && old !== action) old.fadeOut(.18);
      active.current = action;
    }
    action.timeScale = speed;
  };

  useFrame(({ clock }, delta) => {
    const dt = Math.min(.05, Math.max(0, delta));
    if (previousPhase.current !== phase) {
      previousPhase.current = phase;
      elapsed.current = 0;
      finished.current = false;
      if (phase === "ready") { mixer.stopAllAction(); active.current = null; }
    }

    const playing = phase === "intro";
    if (playing) elapsed.current = Math.min(INTRO_END, elapsed.current + dt);
    const t = playing ? elapsed.current : 0;
    const walkP = ease((t - .74) / (WALK_END - .74));
    const mountP = ease((t - WALK_END) / (MOUNT_END - WALK_END));
    const z = lerp(1.80, 0, walkP);
    const y = groundY(0, z);

    if (!playing || t < .95) animate(actions.Wave ? "Wave" : actions.SnowboardIdle ? "SnowboardIdle" : "Idle", .75);
    else if (t < WALK_END) animate(actions.Walk ? "Walk" : "Run", .9);
    else animate(actions.SnowboardRemount ? "SnowboardRemount" : "SnowboardIdle",
      actions.SnowboardRemount ? actions.SnowboardRemount.getClip().duration / (MOUNT_END - WALK_END) : 1);

    mixer.update(dt);
    if (waveBone && !actions.Wave) {
      const waveAmount = playing ? 1 - ease((t - .45) / .60) : 1;
      waveBone.rotation.x += waveAmount * (.22 + .15 * Math.sin(clock.elapsedTime * 5.5));
      waveBone.rotation.z += waveAmount * (.25 + .31 * Math.sin(clock.elapsedTime * 5.5));
    }

    if (root.current) root.current.position.set(0, y + .12, z);
    if (rider.current) {
      rider.current.rotation.y = Math.PI / 2;
      rider.current.position.y = lerp(.10, .33, mountP) + (!playing ? .026 * Math.sin(clock.elapsedTime * 2.3) : 0);
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
    const readyRadius = mobile ? 6.45 : 5.95;
    const reveal = ease(t / FRONT_REVEAL);
    const returnP = ease((t - 2.05) / (INTRO_END - 2.05));
    const orbitAz = lerp(readyAz, frontAz, reveal);
    const orbitRadius = lerp(readyRadius, mobile ? 6.35 : 5.95, reveal);

    // V7: low, gently UPWARD-TILTED starting camera. The wider vertical FOV
    // shows the entire castle roof without cutting the bird/board off at the feet.
    // Stay on the center lane so the left and right sidewalls remain balanced.
    const centerX = lerp(.39, .10, mountP);
    aim.set(centerX, y + lerp(1.44, 1.08, mountP), z);
    goal.set(
      playing ? aim.x + Math.sin(orbitAz) * orbitRadius : 0,
      y + lerp(mobile ? 1.18 : 1.22, mobile ? 1.74 : 1.88, reveal),
      aim.z + Math.cos(orbitAz) * orbitRadius,
    );

    matchingGameCamera.set(mobile ? -.25 : -3.0, startGround + (mobile ? 2.65 : 2.25), mobile ? 7.6 : 5.6);
    goal.lerp(matchingGameCamera, returnP);
    gameAim.set(0, startGround + 1.14, -1.30);
    aim.lerp(gameAim, returnP);

    camera.position.copy(goal);
    camera.lookAt(aim);
    camera.fov = lerp(mobile ? 44 : 42, mobile ? 43 : 42, returnP);
    camera.updateProjectionMatrix();

    if (playing && t >= INTRO_END && !finished.current) {
      finished.current = true;
      onComplete();
    }
  });

  return <>
    <group ref={root}>
      <group ref={rider}>
        <primitive object={character} dispose={null} scale={.86} />
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
