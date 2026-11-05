"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { useSnowModel, SnowGLBInstances, SnowGLBVisual } from "./snow64VisualModels";
import { useSnow64Texture } from "./snow64VisualMaterials";
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

// V92: Intro-only Sundae Dream trees. The center riding lane stays clear,
// and all eight trees sit on terrain inside the upper-bank skyline boundary.
// Their PBR GLBs are already shared by Snow64ModelProvider. No new assets.
const INTRO_TREE_LAYOUT = Object.freeze([
  { id: "left-near", side: -1, variant: 0, x: -14.9, z: 7.4, height: 7.0, yaw: .15 },
  { id: "left-mid", side: -1, variant: 2, x: -15.8, z: 16.2, height: 8.0, yaw: .13 },
  { id: "left-back", side: -1, variant: 3, x: -17.0, z: 24.0, height: 7.7, yaw: .12 },
  { id: "left-far", side: -1, variant: 1, x: -18.2, z: 30.3, height: 7.0, yaw: .10 },
  { id: "right-near", side: 1, variant: 1, x: 14.7, z: 9.0, height: 7.2, yaw: -.15 },
  { id: "right-mid", side: 1, variant: 3, x: 15.8, z: 17.9, height: 8.1, yaw: -.12 },
  { id: "right-back", side: 1, variant: 0, x: 17.1, z: 25.0, height: 7.7, yaw: -.11 },
  { id: "right-far", side: 1, variant: 2, x: 18.3, z: 30.5, height: 6.8, yaw: -.10 },
]);

// The portrait mobile camera has a much narrower horizontal field of view.
// Visually bring intro-only trees inward; the actual gameplay forests stay put.
const introTreeX = (tree, mobile) => tree.x * (mobile ? .57 : 1);

function IntroTreeSnow({ trees, groundY, mobile }) {
  const map = useSnow64Texture("snowGround");
  const mesh = useRef(null);
  const obj = useMemo(() => new THREE.Object3D(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useLayoutEffect(() => {
    if (!map || !mesh.current) return;
    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];
      const x = introTreeX(tree, mobile), z = tree.z;
      const step = .4;
      const sx = (groundY(x + step, z) - groundY(x - step, z)) / (2 * step);
      const sz = (groundY(x, z + step) - groundY(x, z - step)) / (2 * step);
      const h = tree.height * (mobile ? .94 : 1);
      const radiusY = h * .041;
      normal.set(-sx, 1, -sz).normalize();
      obj.position.set(x, groundY(x, z) - radiusY * .66, z);
      obj.quaternion.setFromUnitVectors(up, normal);
      obj.scale.set(h * .16, radiusY, h * .14);
      obj.updateMatrix();
      mesh.current.setMatrixAt(i, obj.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [trees, groundY, mobile, map, obj, normal, up]);

  if (!map || !trees.length) return null;
  return <instancedMesh ref={mesh} args={[null, null, trees.length]}
    castShadow={false} receiveShadow={false} frustumCulled={false}>
    <sphereGeometry args={[1, 16, 10]} />
    <meshBasicMaterial map={map} color="#fffdfc" fog toneMapped={false} />
  </instancedMesh>;
}

function IntroSundaeTrees({ groundY, mobile }) {
  // Hooks must run in this fixed order even while GLBs are still loading.
  const lavender = useSnowModel("treeLavender");
  const mint = useSnowModel("treeMint");
  const peach = useSnowModel("treePeach");
  const pink = useSnowModel("treePink");
  const models = [lavender, mint, peach, pink];
  const trees = useMemo(
    () => INTRO_TREE_LAYOUT.filter(tree => !!models[tree.variant]),
    [lavender, mint, peach, pink]
  );

  return <group name="SNOW360 V92 · Intro Sundae Tree Avenue">
    <IntroTreeSnow trees={trees} groundY={groundY} mobile={mobile} />
    {models.map((asset, variant) => {
      if (!asset) return null;
      const items = trees.filter(tree => tree.variant === variant);
      if (!items.length) return null;
      const modelHeight = Math.max(.0001, asset.size[1]);
      const width = asset.size[0] / modelHeight;
      const depth = asset.size[2] / modelHeight;
      return <SnowGLBInstances key={variant} asset={asset} type="introSundaeTree"
        items={items}
        pose={tree => {
          const height = tree.height * (mobile ? .94 : 1);
          return {
            position: [introTreeX(tree, mobile), groundY(introTreeX(tree, mobile), tree.z) - height * .075, tree.z],
            // The pink GLB has the opposite modeled front: compensate 180°.
            rotation: [0, tree.yaw + (variant === 3 ? Math.PI : 0), 0],
            dimensions: [height * width, height, height * depth],
          };
        }}
      />;
    })}
  </group>;
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
    const frontAz = readyAz + .74;
    // A wider, slightly lower establishing shot showcases the uphill valley
    // while fitting the enlarged Alien Cat and the decorated side trees.
    const readyRadius = mobile ? 9.4 : 8.6;
    const reveal = ease(t / FRONT_REVEAL);
    const returnP = ease((t - 2.05) / (INTRO_END - 2.05));
    const orbitAz = lerp(readyAz, frontAz, reveal);
    const orbitRadius = lerp(readyRadius, mobile ? 8.0 : 7.3, reveal);

    // V92: look farther UP the hill without sliding the camera toward it.
    // The separate aim and camera Z keep Alien Cat visible in the foreground,
    // and let the castle, snowbanks and intro-only ice-cream trees frame it.
    const centerX = lerp(.30, .10, mountP);
    aim.set(
      centerX,
      y + lerp(mobile ? 1.45 : 1.95, 1.14, mountP),
      z + lerp(mobile ? 6.2 : 4.8, .35, mountP),
    );
    goal.set(
      playing ? centerX + Math.sin(orbitAz) * orbitRadius : 0,
      y + lerp(mobile ? 1.24 : 1.18, mobile ? 1.80 : 1.86, reveal),
      z + Math.cos(orbitAz) * orbitRadius - .75,
    );

    matchingGameCamera.set(mobile ? -.25 : -3.0, startGround + (mobile ? 2.65 : 2.25), mobile ? 7.6 : 5.6);
    goal.lerp(matchingGameCamera, returnP);
    gameAim.set(0, startGround + 1.14, -1.30);
    aim.lerp(gameAim, returnP);

    camera.position.copy(goal);
    camera.lookAt(aim);
    camera.fov = lerp(mobile ? 55 : 50, mobile ? 43 : 42, returnP);
    camera.updateProjectionMatrix();

    if (playing && t >= INTRO_END && !finished.current) {
      finished.current = true;
      onComplete();
    }
  });

  return <>
    <IntroSundaeTrees groundY={groundY} mobile={mobile} />
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
