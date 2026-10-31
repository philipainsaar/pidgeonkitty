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
const MODEL_HI = "/models/character-face-rig.glb";
const MODEL_MOBILE = "/models/character-face-rig-mobile.glb";
const LANES = [-2.12, 0, 2.12];
const STEP = 2.12;
const PAD_Y = 0.05;
const HOP_DURATION = 0.43;
const MAX_HEARTS = 1; // Single-hit arcade mode
const LONG_HOP_DURATION = 0.67;

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

/** The facial controls now live IN the GLB as true skin-surface morph targets.
 * No floating eyes, disks or extra black spheres are created at runtime.
 */
function SkinnedHopper({ animation, mobile, blinkSignal, croakSignal, playing, hopDuration = HOP_DURATION }) {
  const url = mobile ? MODEL_MOBILE : MODEL_HI;
  const { scene, animations } = useGLTF(url);
  const character = useMemo(() => cloneSkeleton(scene), [scene]);
  const { actions } = useAnimations(animations, character);
  const actionRef = useRef(null);
  const morphMeshes = useMemo(() => {
    const meshes = [];
    character.traverse((node) => {
      if (!node.isMesh || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
      const { BlinkLeft, BlinkRight, MouthOpen } = node.morphTargetDictionary;
      if ([BlinkLeft, BlinkRight, MouthOpen].every((idx) => Number.isInteger(idx))) {
        meshes.push({ mesh: node, left: BlinkLeft, right: BlinkRight, mouth: MouthOpen });
      }
    });
    return meshes;
  }, [character]);

  const clock = useRef(0);
  const nextAutoBlink = useRef(1.7);
  const blinkStart = useRef(-10);
  const croakStart = useRef(-10);
  const priorBlink = useRef(blinkSignal);
  const priorCroak = useRef(croakSignal);

  useEffect(() => {
    const next = actions[animation] || actions.Idle;
    if (!next || next === actionRef.current) return;
    const previous = actionRef.current;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setLoop(animation === "Hop" ? THREE.LoopOnce : THREE.LoopRepeat, animation === "Hop" ? 1 : Infinity);
    next.clampWhenFinished = animation === "Hop";
    // One mesh hop completes during one physics hop. Never restart a looping hop mid-air.
    next.setEffectiveTimeScale(animation === "Hop" ? next.getClip().duration / hopDuration : 1);
    next.fadeIn(0.10).play();
    if (previous) previous.fadeOut(0.10);
    actionRef.current = next;
  }, [animation, actions, hopDuration]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.06);
    for (const name of ["Idle", "Walk", "Run", "Hop", "Dance", "LookAround", "Sleep", "Celebrate"]) {
      if (actions[name]) actions[name].paused = !playing;
    }
    if (!playing) return;
    clock.current += dt;
    const t = clock.current;
    if (priorBlink.current !== blinkSignal) {
      priorBlink.current = blinkSignal;
      blinkStart.current = t;
      nextAutoBlink.current = t + 2.6;
    }
    if (t >= nextAutoBlink.current) {
      blinkStart.current = t;
      nextAutoBlink.current = t + 2.5 + Math.random() * 2.2;
    }
    if (priorCroak.current !== croakSignal) {
      priorCroak.current = croakSignal;
      croakStart.current = t;
    }
    // Morph weight is continuous and stays between 0 and 1.
    const bp = (t - blinkStart.current) / 0.24;
    const blink = bp >= 0 && bp <= 1 ? Math.pow(Math.sin(Math.PI * bp), 2) : 0;
    const cp = (t - croakStart.current) / 0.65;
    const mouth = cp >= 0 && cp <= 1 ? Math.pow(Math.sin(Math.PI * cp), 0.75) : 0;
    for (const { mesh, left, right, mouth: jaw } of morphMeshes) {
      mesh.morphTargetInfluences[left] = blink;
      mesh.morphTargetInfluences[right] = blink;
      mesh.morphTargetInfluences[jaw] = mouth;
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
  const cameraPlace = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const [actorAnimation, setActorAnimation] = useState("Idle");
  const [actorHopDuration, setActorHopDuration] = useState(HOP_DURATION);
  // Keep the last settled position locally, independent of delayed React renders.
  const settledRef = useRef({ row: game.row, lane: game.lane, seed: game.seed });
  useEffect(() => {
    settledRef.current = { row: game.row, lane: game.lane, seed: game.seed };
  }, [game.row, game.lane, game.seed]);
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
      setActorHopDuration(motion.duration);
      setActorAnimation("Hop");
    }
    let x = LANES[settledRef.current.lane];
    let z = -settledRef.current.row * STEP;
    let y = 0.17;
    if (motion) {
      // Pausing freezes the current hop instead of snapping back to its start.
      if (pageVisible) motion.elapsed = Math.min(motion.duration, motion.elapsed + Math.min(delta, 0.06));
      const p = motion.elapsed / motion.duration;
      const ease = p * p * (3 - 2 * p);
      x = THREE.MathUtils.lerp(LANES[motion.fromLane], LANES[motion.toLane], ease);
      z = THREE.MathUtils.lerp(-motion.fromRow * STEP, -motion.toRow * STEP, ease);
      y += Math.sin(Math.PI * p) * (motion.longHop ? 1.30 : 0.75);
      if (p >= 1 && pageVisible) {
        // Update the logical location before clearing the motion ref.
        // The very next frame must use the DESTINATION, not the previous pad.
        settledRef.current = { row: motion.toRow, lane: motion.toLane, seed: g.seed };
        landed.current(motion);
        motionRef.current = null;
        actorAnimationRef.current = motion.failed ? "Sleep" : motion.collected ? "Celebrate" : "Idle";
        setActorAnimation(actorAnimationRef.current);
      }
    }
    player.current.position.set(x, y, z);
    // Face the direction of travel IN THE AIR, then turn back toward the viewer
    // on landing so blinking/croaking can be seen between moves.
    const heading = motion
      ? Math.atan2(-(LANES[motion.toLane] - LANES[motion.fromLane]), (motion.toRow - motion.fromRow) * STEP)
      : Math.PI;
    const currentHeading = player.current.rotation.y;
    const deltaHeading = Math.atan2(Math.sin(heading - currentHeading), Math.cos(heading - currentHeading));
    player.current.rotation.y += deltaHeading * (1 - Math.exp(-Math.min(delta, 0.08) * 11));
    if (shadow.current) {
      shadow.current.position.set(x, PAD_Y + 0.106, z);
      const size = Math.max(0.55, 1 - (y - 0.17) * 0.24);
      shadow.current.scale.set(size, size, size);
      shadow.current.material.opacity = 0.21 * size;
    }
    cameraPlace.set(x * 0.32 + 5.0, 7.1, z + 8.1);
    camera.position.lerp(cameraPlace, 1 - Math.exp(-Math.min(delta, 0.1) * 3.6));
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
      {game.status === "playing" && [game.row + 1, game.row + 2].flatMap((row) =>
        (game.rows[row]?.pads || []).map((pad, lane) => {
          if (!pad || pad.hazard || (row === game.row + 1 && Math.abs(lane - game.lane) > 1) ||
             (row === game.row + 2 && lane !== game.lane)) return null;
          return (
            <mesh key={`guide-${row}-${lane}`} rotation={[-Math.PI / 2, 0, 0]}
              position={[LANES[lane], PAD_Y + 0.189, -row * STEP]}>
              <ringGeometry args={[0.68, 0.73, 32]} />
              <meshBasicMaterial color={row === game.row + 2 ? "#ffef91" : "#d5ffd0"}
                transparent opacity={row === game.row + 2 ? 0.45 : 0.66} depthWrite={false} />
            </mesh>
          );
        })
      )}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, PAD_Y + 0.106, 0]}>
        <circleGeometry args={[0.56, 24]} />
        <meshBasicMaterial color="#244f43" transparent opacity={0.21} depthWrite={false} />
      </mesh>
      <group ref={player} position={[0, 0.17, 0]} rotation={[0, Math.PI, 0]} scale={0.82}>
        <Suspense fallback={<Html center><div style={{ color: "white", whiteSpace: "nowrap" }}>Loading character…</div></Html>}>
          <SkinnedHopper
            animation={actorAnimation}
            hopDuration={actorHopDuration}
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
    const next = { ...gameRef.current, status: "playing", message: "" };
    gameRef.current = next;
    setGame(next);
    showInstructions(false);
  }, []);
  const restart = useCallback(() => {
    motionRef.current = null;
    const next = { ...newGame(), status: "playing" };
    gameRef.current = next;
    setGame(next);
    showInstructions(false);
  }, []);

  const land = useCallback((motion) => {
    // Commit synchronously to the ref used by useFrame. A delayed React render
    // must not move the player backwards to the previous pad for one frame.
    const prev = gameRef.current;
    const lost = motion.failed;
    const key = `${motion.toRow}:${motion.toLane}`;
    const found = motion.collected && !prev.collected.includes(key) && !lost;
    const next = {
      ...prev,
      row: motion.toRow,
      lane: motion.toLane,
      score: lost ? prev.score : Math.max(prev.score, motion.toRow),
      status: lost ? "lost" : "playing",
      hearts: lost ? 0 : prev.hearts,
      collected: found ? [...prev.collected, key] : prev.collected,
      gems: prev.gems + (found ? 1 : 0),
      message: lost
        ? (motion.reason === "water" ? "Splash! You missed the lily pad." : "Ouch! Watch out for thorns.")
        : found ? "+1 firefly!" : "",
    };
    if (next.row + 35 > next.rows.length) next.rows = makeRows(next.seed, next.row + 55);
    gameRef.current = next;
    setGame(next);
    if (found) croak((v) => v + 1);
    const nextBest = next.score;
    setBest((value) => Math.max(value, nextBest));
    try {
      const previousBest = Number(window.localStorage.getItem("pidgeonkitty-hopper-best") || 0);
      if (nextBest > previousBest) window.localStorage.setItem("pidgeonkitty-hopper-best", String(nextBest));
    } catch { /* storage may be disabled */ }
  }, []);

  const move = useCallback((direction) => {
    const g = gameRef.current;
    if (g.status !== "playing" || motionRef.current || !pageVisible) return;

    const deltas = {
      up: [1, 0], down: [-1, 0], left: [0, -1], right: [0, 1],
      upLeft: [1, -1], upRight: [1, 1],
      downLeft: [-1, -1], downRight: [-1, 1],
      double: [2, 0],
    };
    const delta = deltas[direction];
    if (!delta) return;
    let [dr, dl] = delta;
    let targetRow = g.row + dr;
    let targetLane = g.lane + dl;
    if (targetRow < 0 || targetLane < 0 || targetLane > 2) return;

    // Forward assist only activates when a normal forward hop would hit water
    // or a thorn. It chooses a reachable diagonal, then a double-length leap.
    if (direction === "up") {
      const straight = g.rows[targetRow]?.pads[targetLane];
      if (!straight || straight.hazard) {
        const possible = [-1, 1].map((offset) => {
          const lane = g.lane + offset;
          const pad = g.rows[g.row + 1]?.pads[lane];
          if (!pad || pad.hazard) return null;
          const follow = g.rows[g.row + 2]?.pads || [];
          const continuations = follow.reduce((n, next, nextLane) =>
            n + Number(Boolean(next && !next.hazard && Math.abs(nextLane - lane) <= 1)), 0);
          return { lane, continuations, gem: Number(Boolean(pad.gem)) };
        }).filter(Boolean);
        possible.sort((a, b) => b.continuations - a.continuations || b.gem - a.gem);
        if (possible.length) {
          targetLane = possible[0].lane;
        } else {
          const longPad = g.rows[g.row + 2]?.pads[g.lane];
          if (longPad && !longPad.hazard) {
            targetRow = g.row + 2;
          }
        }
      }
    }

    const tile = g.rows[targetRow]?.pads[targetLane];
    const failed = !tile || tile.hazard;
    const longHop = targetRow - g.row === 2;
    motionRef.current = {
      fromRow: g.row,
      fromLane: g.lane,
      direction,
      toRow: targetRow,
      toLane: targetLane,
      elapsed: 0,
      duration: longHop ? LONG_HOP_DURATION : HOP_DURATION,
      longHop,
      failed,
      reason: !tile ? "water" : tile.hazard ? "thorn" : null,
      collected: Boolean(tile?.gem),
    };
  }, [pageVisible]);

  useEffect(() => {
    const handle = (e) => {
      const key = e.key.toLowerCase();
      const directions = {
        arrowup: "up", w: "up", " ": "up", arrowdown: "down", s: "down",
        arrowleft: "left", a: "left", arrowright: "right", d: "right",
        q: "upLeft", e: "upRight", z: "downLeft", c: "downRight", x: "double",
      };
      if (directions[key]) {
        e.preventDefault();
        const direction = (key === "arrowup" || key === "w" || key === " ") && e.shiftKey
          ? "double" : directions[key];
        if (gameRef.current.status === "ready") start();
        else move(direction);
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
    if (e.target.closest("button")) return;
    const t = e.touches?.[0];
    if (t) touchRef.current = { x: t.clientX, y: t.clientY, fingers: e.touches.length };
  };
  const touchEnd = (e) => {
    const t = e.changedTouches?.[0];
    const from = touchRef.current;
    touchRef.current = null;
    if (!t || !from || gameRef.current.status !== "playing") return;
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    if (Math.hypot(dx, dy) < 36) return;
    // Two-finger forward swipe performs a long hop.
    const wasDouble = from.fingers >= 2;
    if (wasDouble && dy < -32) return move("double");
    const diagonal = Math.abs(dx) > 28 && Math.abs(dy) > 28 &&
      Math.min(Math.abs(dx), Math.abs(dy)) / Math.max(Math.abs(dx), Math.abs(dy)) > 0.38;
    if (diagonal) return move((dy < 0 ? "up" : "down") + (dx < 0 ? "Left" : "Right"));
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
        .fh-dpad{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(3,52px);gap:5px}
        .fh-dpad button{border:1px solid #ffffffaa;background:rgba(18,85,92,.72);color:white;border-radius:16px;font-size:23px;font-weight:900;cursor:pointer;touch-action:manipulation;box-shadow:0 7px 20px #174d573d}
        .fh-dpad button:active{background:#8ac869;transform:scale(.95)}
        .fh-dpad .upLeft{grid-column:1;grid-row:1}.fh-dpad .up{grid-column:2;grid-row:1}.fh-dpad .upRight{grid-column:3;grid-row:1}.fh-dpad .left{grid-column:1;grid-row:2}.fh-dpad .double{grid-column:2;grid-row:2;background:rgba(146,103,52,.88);font-size:14px}.fh-dpad .right{grid-column:3;grid-row:2}.fh-dpad .down{grid-column:2;grid-row:3}
        .fh-help{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);font-weight:750;letter-spacing:.03em;font-size:12px;color:#e6ffed;text-shadow:0 1px 4px #105565;pointer-events:none;white-space:nowrap}
        .fh-modal{position:absolute;inset:0;display:grid;place-items:center;background:linear-gradient(180deg,rgba(11,66,83,.3),rgba(12,66,85,.64));backdrop-filter:blur(5px);z-index:4;padding:18px}
        .fh-card{border:2px solid #f0ffd0a6;background:linear-gradient(150deg,#176b68f2,#174663f4);box-shadow:0 20px 90px #053d5e7b, inset 0 1px #ffffff50;border-radius:30px;padding:clamp(22px,4vw,40px);max-width:470px;width:min(100%,470px);text-align:center}
        .fh-eyebrow{color:#ecfb98;letter-spacing:.23em;font-size:12px;font-weight:900}
        .fh-title{font-size:clamp(40px,8vw,67px);line-height:1;letter-spacing:-.05em;margin:12px 0 8px;text-shadow:0 5px 0 #144f48}
        .fh-description{font-size:15px;line-height:1.55;color:#e4fff8;margin:18px auto 25px;max-width:370px}
        .fh-primary{border:none;border-radius:999px;background:linear-gradient(#ffec94,#e3cd5c);color:#205553;font-size:16px;font-weight:950;letter-spacing:.04em;padding:16px 38px;cursor:pointer;box-shadow:0 7px 0 #b59c39, 0 14px 20px #163d414f}
        .fh-primary:active{transform:translateY(5px);box-shadow:0 2px 0 #b59c39}
        .fh-shortcuts{font-size:11px;color:#bfe7db;margin-top:24px;letter-spacing:.02em}
        @media(max-width:680px){.fh-brand{font-size:15px}.fh-stat{min-width:57px;padding:7px 9px;border-radius:12px}.fh-stat strong{font-size:20px}.fh-stats{gap:5px}.fh-action{font-size:11px;padding:10px}.fh-help{display:none}.fh-dpad{grid-template-columns:repeat(3,48px);grid-template-rows:repeat(3,48px)}.fh-card{padding:26px 20px}.fh-title{font-size:47px}}
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
        <button type="button" className="upLeft" onClick={() => move("upLeft")} aria-label="Hop diagonally forward left">↖</button>
        <button type="button" className="up" onClick={() => move("up")} aria-label="Hop forward with safe diagonal assist">↑</button>
        <button type="button" className="upRight" onClick={() => move("upRight")} aria-label="Hop diagonally forward right">↗</button>
        <button type="button" className="left" onClick={() => move("left")} aria-label="Hop left">←</button>
        <button type="button" className="double" onClick={() => move("double")} aria-label="Double-length forward jump">2× ↑</button>
        <button type="button" className="down" onClick={() => move("down")} aria-label="Hop backward">↓</button>
        <button type="button" className="right" onClick={() => move("right")} aria-label="Hop right">→</button>
      </nav>
      <div className="fh-help">WASD / ARROWS · Q/E DIAGONAL · SHIFT+↑ OR X DOUBLE · SWIPE · B BLINK · M CROAK</div>
      {(game.status === "ready" || game.status === "lost" || game.status === "paused") && (
        <div className="fh-modal" role="dialog" aria-modal="true" aria-label="Frog Hopper menu">
          <div className="fh-card">
            <div className="fh-eyebrow">✦ LITTLE POND, BIG ADVENTURE ✦</div>
            <h1 className="fh-title">{game.status === "lost" ? "SPLASH!" : game.status === "paused" ? "PAUSED" : "FROG HOPPER"}</h1>
            <div style={{ fontSize: 40 }} aria-hidden="true">{game.status === "lost" ? "💦" : game.status === "paused" ? "🍃" : "🐸 🪷 ✨"}</div>
            <p className="fh-description">
              {game.status === "lost" ? `${game.message} You made ${game.score} hops and collected ${game.gems} fireflies.` : game.status === "paused" ? "The pond is taking a tiny nap. Resume when you're ready." : "Hop from lily pad to lily pad, collect glowing fireflies and dodge the prickly pink hazards. Go diagonally with Q/E or ↖/↗. Use Shift+↑ or 2×↑ to leap over a missing pad. Straight ↑ helps choose a safe diagonal when blocked!"}
            </p>
            <button className="fh-primary" type="button" onClick={game.status === "lost" ? restart : start}>
              {game.status === "lost" ? "PLAY AGAIN ↻" : game.status === "paused" ? "RESUME ▶" : "START HOPPING →"}
            </button>
            {(instructions || game.status !== "ready") && <div className="fh-shortcuts">Q/E ↖ ↗ · ↑ smart jump · Shift+↑ / X long leap · B blink · M croak</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// The mobile / desktop quality choice is made before mounting Canvas.
// Avoid preloading both GLBs on slower mobile networks.
