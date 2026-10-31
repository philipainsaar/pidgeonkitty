"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, useAnimations, useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

/* ------------------------------------------------------------
 * PidgeonKitty / Frog Hopper
 * A complete Next.js + React Three Fiber game.
 * Uses your EXISTING skinned animated GLBs in /public/models.
 * ------------------------------------------------------------ */
const MODEL_HI = "/models/character-animated.glb";
const MODEL_MOBILE = "/models/character-animated-mobile.glb";
const LANES = [-2.12, 0, 2.12];
const STEP = 2.12;
const PAD_Y = 0.05;
const HOP_DURATION = 0.43;
const MAX_HEARTS = 1; // Single-hit arcade mode

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRows(seed, count) {
  const random = randomGenerator(seed);
  const rows = [];
  let safeLane = 1;
  for (let index = 0; index < count; index++) {
    if (index > 3) {
      const d = random();
      safeLane = THREE.MathUtils.clamp(safeLane + (d < 0.3 ? -1 : d > 0.7 ? 1 : 0), 0, 2);
    }
    const pads = Array.from({ length: 3 }, (_, lane) => {
      const exists = index < 4 || lane === safeLane || random() > 0.29;
      if (!exists) return null;
      const hazard = index > 4 && lane !== safeLane && random() < 0.20;
      return {
        hazard,
        gem: !hazard && index > 0 && random() < 0.28,
        flower: random() < 0.38,
        turn: random() * Math.PI * 2,
        color: Math.floor(random() * 3),
      };
    });
    rows.push({ index, pads });
  }
  return rows;
}

function newGame(seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) {
  return {
    status: "ready",
    seed,
    rows: makeRows(seed, 60),
    row: 0,
    lane: 1,
    score: 0,
    gems: 0,
    collected: [],
    message: "",
    hearts: MAX_HEARTS,
  };
}

const faceTuning = {
  // Approximate face locations in the ORIGINAL GLB's Y-up rest pose.
  // These work without altering the GLB, and can be tuned for a future mesh revision.
  leftEye: [-0.39, 1.17, -0.56],
  rightEye: [0.39, 1.17, -0.56],
  mouth: [0, 0.86, -1.10],
  eyeRadius: 0.087,
  jawOpenRadians: 0.32,
};

function createFaceParts(character) {
  character.updateMatrixWorld(true);
  const head = character.getObjectByName("Bone_015") || character.getObjectByName("Bone_002");
  const jaw = character.getObjectByName("Bone_014");
  if (!head) return { eyeParts: [], mouth: null, jaw, jawBase: jaw?.quaternion.clone(), dispose: () => {} };
  const allMeshes = [];
  const eyeParts = [];
  const eyeGeo = new THREE.SphereGeometry(1, 16, 12);
  const pupilGeo = new THREE.SphereGeometry(1, 12, 10);
  const lidGeo = new THREE.SphereGeometry(1, 16, 12);
  const dark = new THREE.MeshStandardMaterial({ color: 0x182126, roughness: 0.63 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe5cd78, roughness: 0.48 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x70646b, roughness: 0.98 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x24141f, roughness: 0.85, side: THREE.DoubleSide });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const materials = [dark, gold, lidMat, mouthMat, white];
  const headQ = head.getWorldQuaternion(new THREE.Quaternion());

  const anchor = (worldPos, outwardAngle = 0) => {
    const group = new THREE.Group();
    group.position.copy(head.worldToLocal(new THREE.Vector3(...worldPos)));
    group.quaternion.copy(headQ.clone().invert().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, outwardAngle, 0))));
    head.add(group);
    return group;
  };

  for (const [idx, loc] of [faceTuning.leftEye, faceTuning.rightEye].entries()) {
    const side = idx === 0 ? -1 : 1;
    const pivot = anchor(loc, side * 0.54);
    const iris = new THREE.Mesh(eyeGeo, gold);
    iris.scale.set(faceTuning.eyeRadius, 0.089, 0.033);
    pivot.add(iris);
    const pupil = new THREE.Mesh(pupilGeo, dark);
    pupil.position.z = -0.032;
    pupil.scale.set(0.045, 0.056, 0.015);
    pivot.add(pupil);
    const glint = new THREE.Mesh(pupilGeo, white);
    glint.position.set(-0.015, 0.023, -0.048);
    glint.scale.set(0.011, 0.014, 0.005);
    pivot.add(glint);
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.set(0, 0.105, -0.054);
    lid.scale.set(0.091, 0.005, 0.030);
    pivot.add(lid);
    allMeshes.push(pivot);
    eyeParts.push({ iris, pupil, glint, lid });
  }

  const mouthGroup = anchor(faceTuning.mouth);
  const mouth = new THREE.Mesh(eyeGeo, mouthMat);
  mouth.scale.set(0.13, 0.009, 0.018);
  mouthGroup.add(mouth);
  allMeshes.push(mouthGroup);

  return {
    eyeParts,
    mouth,
    jaw,
    jawBase: jaw?.quaternion.clone(),
    dispose: () => {
      allMeshes.forEach((o) => o.parent?.remove(o));
      [eyeGeo, pupilGeo, lidGeo].forEach((geo) => geo.dispose());
      materials.forEach((mat) => mat.dispose());
    },
  };
}

function SkinnedHopper({ animation, mobile, blinkSignal, croakSignal, playing }) {
  const url = mobile ? MODEL_MOBILE : MODEL_HI;
  const { scene, animations } = useGLTF(url);
  const character = useMemo(() => cloneSkeleton(scene), [scene]);
  const { actions } = useAnimations(animations, character);
  const currentAction = useRef(null);
  const faceRef = useRef(null);
  const eyesValue = useRef(0);
  const eyesTarget = useRef(0);
  const croakEnd = useRef(0);
  const clock = useRef(0);
  const nextBlink = useRef(2.4);
  const previousBlink = useRef(blinkSignal);
  const previousCroak = useRef(croakSignal);
  const mouthOpen = useRef(0);
  const jawEuler = useMemo(() => new THREE.Quaternion(), []);
  const jawAxis = useMemo(() => new THREE.Vector3(1, 0, 0), []);

  useEffect(() => {
    const attachedFace = createFaceParts(character);
    faceRef.current = attachedFace;
    return () => {
      attachedFace.dispose();
      if (faceRef.current === attachedFace) faceRef.current = null;
    };
  }, [character]);

  useEffect(() => {
    const next = actions[animation] || actions.Idle;
    if (!next || next === currentAction.current) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity);
    next.enabled = true;
    next.setEffectiveTimeScale(animation === "Hop" ? 2.2 : 1);
    next.setEffectiveWeight(1);
    next.fadeIn(0.12).play();
    currentAction.current?.fadeOut(0.15);
    currentAction.current = next;
  }, [animation, actions]);

  useFrame((_, delta) => {
    if (!playing) {
      for (const action of Object.values(actions)) if (action) action.paused = true;
      return;
    }
    for (const action of Object.values(actions)) if (action) action.paused = false;
    const dt = Math.min(delta, 0.06);
    clock.current += dt;
    const t = clock.current;

    if (previousBlink.current !== blinkSignal) {
      previousBlink.current = blinkSignal;
      nextBlink.current = t;
    }
    if (t >= nextBlink.current) {
      eyesTarget.current = t + 0.18;
      nextBlink.current = t + 2.7 + Math.random() * 2.4;
    }
    const closing = t < eyesTarget.current;
    eyesValue.current = THREE.MathUtils.damp(eyesValue.current, closing ? 1 : 0, 24, dt);

    if (previousCroak.current !== croakSignal) {
      previousCroak.current = croakSignal;
      croakEnd.current = t + 0.70;
    }
    const mouthTarget = t < croakEnd.current || animation === "Hop" ? 1 : 0;
    mouthOpen.current = THREE.MathUtils.damp(mouthOpen.current, mouthTarget, 10, dt);
    const face = faceRef.current;
    if (!face) return;
    for (const eye of face.eyeParts) {
      const b = eyesValue.current;
      eye.iris.scale.y = Math.max(0.012, 0.089 * (1 - b));
      eye.pupil.scale.y = Math.max(0.006, 0.056 * (1 - b));
      eye.glint.visible = b < 0.65;
      eye.lid.position.y = 0.105 - 0.105 * b;
      eye.lid.scale.y = Math.max(0.005, 0.092 * b);
    }
    if (face.mouth) face.mouth.scale.y = 0.009 + 0.083 * mouthOpen.current;
    if (face.jaw && face.jawBase) {
      jawEuler.setFromAxisAngle(jawAxis, -faceTuning.jawOpenRadians * mouthOpen.current);
      face.jaw.quaternion.copy(face.jawBase).multiply(jawEuler);
    }
  });

  return <primitive object={character} dispose={null} />;
}

function LilyPad({ row, lane, tile, collected }) {
  const z = -row * STEP;
  const x = LANES[lane];
  const shade = ["#68b856", "#75be5a", "#55ac63"][tile.color];
  return (
    <group position={[x, PAD_Y, z]} rotation={[0, tile.turn, 0]}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.89, 0.78, 0.15, 20]} />
        <meshStandardMaterial color={shade} roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.099, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.78, 24]} />
        <meshStandardMaterial color="#88d676" roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.104, -0.46]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.12, 12]} />
        <meshBasicMaterial color="#8ed77d" />
      </mesh>
      {tile.flower && !tile.hazard && (
        <group position={[0.5, 0.18, 0.39]}>
          {[0, 1, 2, 3, 4].map((petal) => (
            <mesh key={petal} position={[Math.cos((petal * Math.PI * 2) / 5) * 0.13, 0.03, Math.sin((petal * Math.PI * 2) / 5) * 0.13]}>
              <sphereGeometry args={[0.092, 8, 6]} />
              <meshStandardMaterial color={petal % 2 ? "#ffd4e8" : "#ffffff"} />
            </mesh>
          ))}
          <mesh position={[0, 0.08, 0]}>
            <sphereGeometry args={[0.095, 10, 8]} />
            <meshStandardMaterial color="#ffe58c" emissive="#b28c30" emissiveIntensity={0.12} />
          </mesh>
        </group>
      )}
      {tile.gem && !collected && <Firefly color="#f8e78b" position={[0, 0.88, 0]} />}
      {tile.hazard && <Hazard />}
    </group>
  );
}

function Hazard() {
  return (
    <group position={[0, 0.30, 0]}>
      <mesh position={[0, 0.10, 0]}>
        <sphereGeometry args={[0.32, 10, 8]} />
        <meshStandardMaterial color="#ad496b" roughness={0.78} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i * Math.PI * 2) / 6;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.26, 0.22, Math.sin(a) * 0.26]} rotation={[Math.sin(a) * 0.43, 0, -Math.cos(a) * 0.43]}>
            <coneGeometry args={[0.11, 0.42, 6]} />
            <meshStandardMaterial color="#e37992" roughness={0.8} />
          </mesh>
        );
      })}
    </group>
  );
}

function Firefly({ position, color }) {
  const group = useRef();
  const phase = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    if (group.current) {
      group.current.position.y = position[1] + Math.sin(clock.elapsedTime * 2.5 + phase) * 0.13;
      group.current.rotation.y = clock.elapsedTime * 1.5;
    }
  });
  return (
    <group ref={group} position={position}>
      <mesh>
        <icosahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} roughness={0.2} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <torusGeometry args={[0.28, 0.016, 4, 16]} />
        <meshBasicMaterial color="#fff7cc" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function PondDetails({ centerRow }) {
  const decorations = useMemo(() => {
    const points = [];
    for (let row = Math.max(0, centerRow - 5); row < centerRow + 23; row++) {
      const rand = randomGenerator((391843 ^ Math.imul(row + 1, 2654435761)) >>> 0);
      for (const side of [-1, 1]) points.push({
        x: side * (4.0 + rand() * 8),
        z: -(row * STEP + rand() * STEP),
        radius: 0.12 + rand() * 0.18,
        twist: rand() * Math.PI,
      });
    }
    return points;
  }, [centerRow]);
  return (
    <>
      {decorations.filter((d) => Math.abs(d.z + centerRow * STEP) < 34).map((d, i) => (
        <group key={i} position={[d.x, -0.08, d.z]} rotation={[-Math.PI / 2, 0, d.twist]}>
          <mesh>
            <ringGeometry args={[d.radius, d.radius + 0.015, 18]} />
            <meshBasicMaterial color="#88dbe0" transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>
          <mesh scale={[0.67, 0.67, 1]}>
            <ringGeometry args={[d.radius + 0.17, d.radius + 0.18, 18]} />
            <meshBasicMaterial color="#8bd9e1" transparent opacity={0.12} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function GameScene({ game, motionRef, onLand, blinkSignal, croakSignal, mobile, pageVisible }) {
  const player = useRef();
  const shadow = useRef();
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const cameraPlace = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const [actorAnimation, setActorAnimation] = useState("Idle");
  const landed = useRef(onLand);
  const actorAnimationRef = useRef("Idle");
  useEffect(() => { landed.current = onLand; }, [onLand]);
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);

  useEffect(() => {
    if (!motionRef.current) setActorAnimation(game.status === "lost" ? "Sleep" : game.status === "won" ? "Celebrate" : "Idle");
  }, [game.status, motionRef]);

  useFrame(({ camera }, delta) => {
    if (!player.current) return;
    const g = gameRef.current;
    const motion = motionRef.current;
    if (motion && actorAnimationRef.current !== "Hop") {
      actorAnimationRef.current = "Hop";
      setActorAnimation("Hop");
    }
    let x = LANES[g.lane];
    let z = -g.row * STEP;
    let y = 0.17;
    if (motion && pageVisible) {
      motion.elapsed = Math.min(motion.duration, motion.elapsed + Math.min(delta, 0.06));
      const p = motion.elapsed / motion.duration;
      const ease = p * p * (3 - 2 * p);
      x = THREE.MathUtils.lerp(LANES[motion.fromLane], LANES[motion.toLane], ease);
      z = THREE.MathUtils.lerp(-motion.fromRow * STEP, -motion.toRow * STEP, ease);
      y += Math.sin(Math.PI * p) * 1.10;
      if (p >= 1) {
        motionRef.current = null;
        landed.current(motion);
        actorAnimationRef.current = motion.failed ? "Sleep" : motion.collected ? "Celebrate" : "Idle";
        setActorAnimation(actorAnimationRef.current);
      }
    }
    if (actorAnimation === "Celebrate" && !motion && g.status === "playing") {
      // Landed celebration lasts until next move, no separate per-frame setState.
    }
    player.current.position.set(x, y, z);
    if (shadow.current) {
      shadow.current.position.set(x, PAD_Y + 0.106, z);
      const size = Math.max(0.55, 1 - (y - 0.17) * 0.24);
      shadow.current.scale.set(size, size, size);
      shadow.current.material.opacity = 0.21 * size;
    }
    cameraPlace.set(x * 0.32 + 5.0, 7.1, z + 8.1);
    cameraTarget.copy(cameraPlace);
    camera.position.lerp(cameraTarget, 1 - Math.exp(-Math.min(delta, 0.1) * 3.6));
    lookAt.set(x * 0.14, 0.3, z - 3.1);
    camera.lookAt(lookAt);
  });

  const visible = useMemo(() => game.rows.filter((r) => r.index >= Math.max(0, game.row - 5) && r.index < game.row + 22), [game.rows, game.row]);
  const collected = useMemo(() => new Set(game.collected), [game.collected]);

  return (
    <>
      <color attach="background" args={["#86d3d4"]} />
      <fog attach="fog" args={["#86d3d4", 23, 61]} />
      <ambientLight intensity={1.6} />
      <hemisphereLight args={["#e5faff", "#458077", 1.0]} />
      <directionalLight position={[-5, 10, 6]} intensity={2.3} color="#fff5dd" />
      <directionalLight position={[5, 4, -8]} intensity={0.7} color="#b9eaff" />
      <mesh position={[0, -0.25, -game.row * STEP - 13]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[140, 160]} />
        <meshStandardMaterial color="#2e8fa0" roughness={0.28} metalness={0.16} />
      </mesh>
      <PondDetails centerRow={game.row} />
      {visible.flatMap((r) => r.pads.map((pad, lane) => pad ? (
        <LilyPad key={`${r.index}-${lane}`} row={r.index} lane={lane} tile={pad} collected={collected.has(`${r.index}:${lane}`)} />
      ) : null))}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, PAD_Y + 0.106, 0]}>
        <circleGeometry args={[0.56, 24]} />
        <meshBasicMaterial color="#244f43" transparent opacity={0.21} depthWrite={false} />
      </mesh>
      <group ref={player} position={[0, 0.17, 0]} rotation={[0, Math.PI, 0]} scale={0.82}>
        <Suspense fallback={<Html center><div style={{ color: "white", whiteSpace: "nowrap" }}>Loading character…</div></Html>}>
          <SkinnedHopper
            animation={actorAnimation}
            playing={pageVisible}
            mobile={mobile}
            blinkSignal={blinkSignal}
            croakSignal={croakSignal}
          />
        </Suspense>
      </group>
    </>
  );
}

export default function FrogHopperGame() {
  const [game, setGame] = useState(() => newGame(20261031));
  const gameRef = useRef(game);
  const motionRef = useRef(null);
  const [mobile, setMobile] = useState(null);
  const [pageVisible, setPageVisible] = useState(true);
  const [blinkSignal, blink] = useState(0);
  const [croakSignal, croak] = useState(0);
  const [best, setBest] = useState(0);
  const touchRef = useRef(null);
  const [instructions, showInstructions] = useState(true);

  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px), (pointer: coarse)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    try { setBest(Number(window.localStorage.getItem("pidgeonkitty-hopper-best") || 0)); } catch { /* storage disabled */ }
  }, []);

  const start = useCallback(() => {
    motionRef.current = null;
    setGame((g) => ({ ...g, status: "playing", message: "" }));
    showInstructions(false);
  }, []);
  const restart = useCallback(() => {
    motionRef.current = null;
    setGame({ ...newGame(), status: "playing" });
    showInstructions(false);
  }, []);

  const land = useCallback((motion) => {
    setGame((prev) => {
      const lost = motion.failed;
      const key = `${motion.toRow}:${motion.toLane}`;
      const found = motion.collected && !prev.collected.includes(key);
      const nextScore = lost ? prev.score : Math.max(prev.score, motion.toRow);
      const next = {
        ...prev,
        row: motion.toRow,
        lane: motion.toLane,
        score: nextScore,
        status: lost ? "lost" : "playing",
        hearts: lost ? 0 : prev.hearts,
        collected: found ? [...prev.collected, key] : prev.collected,
        gems: prev.gems + (found ? 1 : 0),
        message: lost ? (motion.reason === "water" ? "Splash! You missed the lily pad." : "Ouch! Watch out for thorns.") : found ? "+1 firefly!" : "",
      };
      if (next.row + 35 > next.rows.length) next.rows = makeRows(next.seed, next.row + 55);
      return next;
    });
    if (motion.collected && !motion.failed) croak((v) => v + 1);
    const nextBest = motion.failed ? gameRef.current.score : Math.max(gameRef.current.score, motion.toRow);
    setBest((prev) => Math.max(prev, nextBest));
    try {
      const old = Number(window.localStorage.getItem("pidgeonkitty-hopper-best") || 0);
      if (nextBest > old) window.localStorage.setItem("pidgeonkitty-hopper-best", String(nextBest));
    } catch { /* storage disabled */ }
  }, []);

  const move = useCallback((direction) => {
    const g = gameRef.current;
    if (g.status !== "playing" || motionRef.current || !pageVisible) return;
    let newRow = g.row;
    let newLane = g.lane;
    if (direction === "up") newRow++;
    else if (direction === "down") newRow--;
    else if (direction === "left") newLane--;
    else if (direction === "right") newLane++;
    if (newRow < 0 || newLane < 0 || newLane > 2) return;
    const tile = g.rows[newRow]?.pads[newLane];
    const failed = !tile || tile.hazard;
    motionRef.current = {
      fromRow: g.row,
      fromLane: g.lane,
      toRow: newRow,
      toLane: newLane,
      elapsed: 0,
      duration: HOP_DURATION,
      failed,
      reason: !tile ? "water" : tile.hazard ? "thorn" : null,
      collected: Boolean(tile?.gem),
    };
  }, [pageVisible]);

  useEffect(() => {
    const handle = (e) => {
      const key = e.key.toLowerCase();
      const directions = { arrowup: "up", w: "up", " ": "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };
      if (directions[key]) {
        e.preventDefault();
        if (gameRef.current.status === "ready") start();
        else move(directions[key]);
      } else if (key === "enter" && gameRef.current.status !== "playing") {
        e.preventDefault();
        if (gameRef.current.status === "lost") restart(); else start();
      } else if (key === "b") blink((v) => v + 1);
      else if (key === "m") croak((v) => v + 1);
      else if (key === "p" || key === "escape") {
        setGame((prev) => ({ ...prev, status: prev.status === "playing" ? "paused" : prev.status === "paused" ? "playing" : prev.status }));
      }
    };
    window.addEventListener("keydown", handle, { passive: false });
    return () => window.removeEventListener("keydown", handle);
  }, [move, start, restart]);

  const touchStart = (e) => {
    const t = e.touches?.[0];
    if (t) touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const touchEnd = (e) => {
    const t = e.changedTouches?.[0];
    const from = touchRef.current;
    touchRef.current = null;
    if (!t || !from || gameRef.current.status !== "playing") return;
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    if (Math.hypot(dx, dy) < 36) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };

  return (
    <div className="frog-hopper-root" onTouchStart={touchStart} onTouchEnd={touchEnd}>
      <style>{`
        .frog-hopper-root{position:relative;width:100%;height:100dvh;min-height:520px;overflow:hidden;background:#7ed0d2;color:white;font-family:ui-rounded,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;touch-action:none;user-select:none;-webkit-user-select:none}
        .fh-canvas{position:absolute;inset:0}
        .fh-top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;gap:10px;padding:max(18px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 0 max(16px,env(safe-area-inset-left));pointer-events:none}
        .fh-brand{letter-spacing:.13em;text-transform:uppercase;font-weight:950;font-size:clamp(13px,1.8vw,21px);color:#fff;filter:drop-shadow(0 2px 3px #146276)}
        .fh-brand span{display:block;font-size:10px;letter-spacing:.3em;font-weight:750;margin-bottom:2px}
        .fh-stats{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;justify-content:flex-end}
        .fh-stat{background:rgba(14,79,80,.76);border:1px solid rgba(224,255,234,.39);border-radius:16px;min-width:74px;text-align:center;padding:7px 12px;box-shadow:0 6px 20px #15586b24;backdrop-filter:blur(9px)}
        .fh-stat small{display:block;color:#c7f6e9;font-size:9px;font-weight:850;letter-spacing:.14em}
        .fh-stat strong{display:block;font-size:24px;line-height:1.12;font-variant-numeric:tabular-nums}
        .fh-actions{position:absolute;left:max(16px,env(safe-area-inset-left));bottom:max(18px,env(safe-area-inset-bottom));display:flex;gap:9px;align-items:flex-end}
        .fh-action{appearance:none;border:1px solid #ffffff60;border-radius:16px;background:#134f64c9;color:white;padding:11px 14px;font-size:12px;font-weight:850;box-shadow:0 6px 20px #114e5940;cursor:pointer;backdrop-filter:blur(10px)}
        .fh-action:active{transform:translateY(2px)}
        .fh-dpad{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(2,52px);gap:5px}
        .fh-dpad button{border:1px solid #ffffffaa;background:rgba(18,85,92,.72);color:white;border-radius:16px;font-size:23px;font-weight:900;cursor:pointer;touch-action:manipulation;box-shadow:0 7px 20px #174d573d}
        .fh-dpad button:active{background:#8ac869;transform:scale(.95)}
        .fh-dpad .up{grid-column:2;grid-row:1}.fh-dpad .left{grid-column:1;grid-row:2}.fh-dpad .down{grid-column:2;grid-row:2}.fh-dpad .right{grid-column:3;grid-row:2}
        .fh-help{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);font-weight:750;letter-spacing:.03em;font-size:12px;color:#e6ffed;text-shadow:0 1px 4px #105565;pointer-events:none;white-space:nowrap}
        .fh-modal{position:absolute;inset:0;display:grid;place-items:center;background:linear-gradient(180deg,rgba(11,66,83,.3),rgba(12,66,85,.64));backdrop-filter:blur(5px);z-index:4;padding:18px}
        .fh-card{border:2px solid #f0ffd0a6;background:linear-gradient(150deg,#176b68f2,#174663f4);box-shadow:0 20px 90px #053d5e7b, inset 0 1px #ffffff50;border-radius:30px;padding:clamp(22px,4vw,40px);max-width:470px;width:min(100%,470px);text-align:center}
        .fh-eyebrow{color:#ecfb98;letter-spacing:.23em;font-size:12px;font-weight:900}
        .fh-title{font-size:clamp(40px,8vw,67px);line-height:1;letter-spacing:-.05em;margin:12px 0 8px;text-shadow:0 5px 0 #144f48}
        .fh-description{font-size:15px;line-height:1.55;color:#e4fff8;margin:18px auto 25px;max-width:370px}
        .fh-primary{border:none;border-radius:999px;background:linear-gradient(#ffec94,#e3cd5c);color:#205553;font-size:16px;font-weight:950;letter-spacing:.04em;padding:16px 38px;cursor:pointer;box-shadow:0 7px 0 #b59c39, 0 14px 20px #163d414f}
        .fh-primary:active{transform:translateY(5px);box-shadow:0 2px 0 #b59c39}
        .fh-shortcuts{font-size:11px;color:#bfe7db;margin-top:24px;letter-spacing:.02em}
        @media(max-width:680px){.fh-brand{font-size:15px}.fh-stat{min-width:57px;padding:7px 9px;border-radius:12px}.fh-stat strong{font-size:20px}.fh-stats{gap:5px}.fh-action{font-size:11px;padding:10px}.fh-help{display:none}.fh-dpad{grid-template-columns:repeat(3,48px);grid-template-rows:repeat(2,48px)}.fh-card{padding:26px 20px}.fh-title{font-size:47px}}
        @media(max-height:600px){.fh-top{padding-top:7px}.fh-actions,.fh-dpad{bottom:7px}.fh-card{padding:16px}.fh-description{margin:9px auto 12px}}
      `}</style>
      <div className="fh-canvas">
        {mobile !== null && <Canvas
          shadows={false}
          dpr={[1, mobile ? 1.25 : 1.65]}
          camera={{ position: [5, 7.1, 8.1], fov: mobile ? 51 : 44, near: 0.1, far: 145 }}
          gl={{ antialias: !mobile, alpha: false, powerPreference: "high-performance" }}
        >
          <GameScene game={game} motionRef={motionRef} onLand={land} blinkSignal={blinkSignal} croakSignal={croakSignal} mobile={mobile} pageVisible={pageVisible && game.status !== "paused"} />
        </Canvas>}
      </div>
      <header className="fh-top">
        <div className="fh-brand"><span>PidgeonKitty presents</span>🐸 FROG HOPPER</div>
        <div className="fh-stats">
          <div className="fh-stat"><small>HOPS</small><strong>{game.score}</strong></div>
          <div className="fh-stat"><small>✨ FIREFLIES</small><strong>{game.gems}</strong></div>
          <div className="fh-stat"><small>BEST</small><strong>{Math.max(best, game.score)}</strong></div>
        </div>
      </header>
      <div className="fh-actions">
        <button className="fh-action" type="button" onClick={() => blink((v) => v + 1)} aria-label="Make the character blink">👀 BLINK</button>
        <button className="fh-action" type="button" onClick={() => croak((v) => v + 1)} aria-label="Open the character mouth">😮 CROAK</button>
        <button className="fh-action" type="button" onClick={() => setGame((g) => ({ ...g, status: g.status === "playing" ? "paused" : g.status === "paused" ? "playing" : g.status }))} aria-label="Pause or resume game">{game.status === "paused" ? "▶ RESUME" : "Ⅱ PAUSE"}</button>
      </div>
      <nav className="fh-dpad" aria-label="Character movement controls">
        <button type="button" className="up" onClick={() => move("up")} aria-label="Hop forward">↑</button>
        <button type="button" className="left" onClick={() => move("left")} aria-label="Hop left">←</button>
        <button type="button" className="down" onClick={() => move("down")} aria-label="Hop backward">↓</button>
        <button type="button" className="right" onClick={() => move("right")} aria-label="Hop right">→</button>
      </nav>
      <div className="fh-help">ARROWS / WASD TO HOP · SWIPE ON MOBILE · B BLINK · M MOUTH · P PAUSE</div>
      {(game.status === "ready" || game.status === "lost" || game.status === "paused") && (
        <div className="fh-modal" role="dialog" aria-modal="true" aria-label="Frog Hopper menu">
          <div className="fh-card">
            <div className="fh-eyebrow">✦ LITTLE POND, BIG ADVENTURE ✦</div>
            <h1 className="fh-title">{game.status === "lost" ? "SPLASH!" : game.status === "paused" ? "PAUSED" : "FROG HOPPER"}</h1>
            <div style={{ fontSize: 40 }} aria-hidden="true">{game.status === "lost" ? "💦" : game.status === "paused" ? "🍃" : "🐸 🪷 ✨"}</div>
            <p className="fh-description">
              {game.status === "lost" ? `${game.message} You made ${game.score} hops and collected ${game.gems} fireflies.` : game.status === "paused" ? "The pond is taking a tiny nap. Resume when you're ready." : "Hop from lily pad to lily pad, collect glowing fireflies and dodge the prickly pink hazards. A missing pad means a splash!"}
            </p>
            <button className="fh-primary" type="button" onClick={game.status === "lost" ? restart : start}>
              {game.status === "lost" ? "PLAY AGAIN ↻" : game.status === "paused" ? "RESUME ▶" : "START HOPPING →"}
            </button>
            {(instructions || game.status !== "ready") && <div className="fh-shortcuts">↑ ↓ ← → / WASD / SPACE · swipe on phones · B to blink · M to open mouth</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// The mobile / desktop quality choice is made before mounting Canvas.
// Avoid preloading both GLBs on slower mobile networks.
