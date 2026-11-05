"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getSnow360Rider, SNOW360_GAME_CLIPS } from "./snow360RiderConfig";
import { createSnow360RiderAnimator } from "./snow360RiderAnimator";
import Snow360RiderBoundary from "./Snow360RiderBoundary";

export const CHARACTER_MODEL_WEB = getSnow360Rider("alien-cat").desktop;
export const CHARACTER_MODEL_MOBILE = getSnow360Rider("alien-cat").mobile;
export const CHARACTER_ANIMATIONS = [...SNOW360_GAME_CLIPS,
  "Idle_Breathe", "Wave_Hello", "Hop_Soft", "HeadTilt_Curious", "Dance_Happy",
  "Antenna_Wiggle", "Tail_Swish", "Blink_Natural"];

/** The same exported model and animation controller used in the game. */
export function AnimatedCharacter({animation="SnowboardIdle",modelUrl=CHARACTER_MODEL_WEB,playing=true,speed=1,...props}){
  const {scene,animations}=useGLTF(modelUrl);
  const character=useMemo(()=>cloneSkeleton(scene),[scene]);
  const animator=useMemo(()=>createSnow360RiderAnimator(character,animations),[character,animations]);
  useEffect(()=>{animator.reset();return ()=>animator.dispose();},[animator]);
  useEffect(()=>{
    animator.setPose(animation,animation,{fadeSeconds:playing?.18:0});
    animator.update(0);
  },[animator,animation,playing]);
  useFrame((_,dt)=>{if(playing)animator.update(Math.min(dt,.05)*speed);});
  return <primitive object={character} dispose={null} {...props}/>;
}

function LoadingModel() {
  return (
    <Html center style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
      <span style={{ color: "#cddcf3", font: "500 13px system-ui" }}>
        Loading character…
      </span>
    </Html>
  );
}

/**
 * Complete standalone viewer, including lights, controls and animation buttons.
 * In an existing R3F scene, use <AnimatedCharacter /> instead.
 */
export default function CharacterViewer({
  initialAnimation = "SnowboardIdle",
  showControls = true,
  height = "min(75vh, 680px)",
  background = "#0b1222",
  onAnimationChange,
}) {
  const [animation, setAnimation] = useState(initialAnimation);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState("auto");
  const [isMobile, setIsMobile] = useState(null);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px), (pointer: coarse)");
    const update = () => setIsMobile(query.matches);
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
    }
  }, []);

  const mobileModel = quality === "mobile" || (quality === "auto" && isMobile);
  const modelUrl = mobileModel ? CHARACTER_MODEL_MOBILE : CHARACTER_MODEL_WEB;

  const chooseAnimation = (name) => {
    setAnimation(name);
    onAnimationChange?.(name);
  };

  const buttonBase = {
    border: "1px solid #34445f",
    background: "#17253b",
    color: "#ebf1fa",
    borderRadius: 11,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div style={{ background, borderRadius: 18, overflow: "hidden", color: "#edf3ff", fontFamily: "system-ui, sans-serif", width: "100%" }}>
      <div style={{ position: "relative", height, minHeight: 300, background: "radial-gradient(ellipse at 50% 55%,#273958 0%,#111b2e 55%,#0b1222 100%)" }}>
        {isMobile !== null && (
          <Canvas
            dpr={[1, isMobile ? 1.25 : 1.6]}
            shadows={false}
            camera={{ position: [2.2, 1.5, 3.4], fov: 37, near: 0.08, far: 50 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            style={{ position: "absolute", inset: 0 }}
          >
            <ambientLight intensity={1.45} />
            <hemisphereLight args={["#e5f1ff", "#34445c", 1.3]} />
            <directionalLight position={[-3, 5, 4]} intensity={2.1} />
            <directionalLight position={[3, 2.5, 3]} intensity={1.0} color="#b3c9ff" />
            <Snow360RiderBoundary key={modelUrl}>
            <Suspense fallback={<LoadingModel />}>
              <AnimatedCharacter
                animation={animation}
                modelUrl={modelUrl}
                playing={playing && pageVisible}
                speed={speed}
                onClick={(e) => {
                  e.stopPropagation();
                  chooseAnimation("Wave_Hello");
                }}
              />
            </Suspense>
            </Snow360RiderBoundary>
            <OrbitControls
              target={[0, 0.84, 0]}
              minDistance={1.4}
              maxDistance={7}
              minPolarAngle={0.15}
              maxPolarAngle={Math.PI - 0.15}
              enablePan={false}
              enableDamping
              dampingFactor={0.08}
            />
          </Canvas>
        )}
        <div style={{ position: "absolute", bottom: 14, left: 16, opacity: 0.7, fontSize: 12, pointerEvents: "none" }}>
          Drag to rotate · Scroll to zoom · Tap character to wave
        </div>
      </div>

      {showControls && (
        <div style={{ padding: "18px 18px 20px", display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <strong style={{ fontSize: 16 }}>Alien Cat</strong>
              <div style={{ fontSize: 12, color: "#9eafc9", marginTop: 4 }}>15 riding motions · 8 character animations</div>
            </div>
            <select
              aria-label="Model quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              style={{ ...buttonBase, padding: "8px 10px" }}
            >
              <option value="auto">Quality: Auto</option>
              <option value="mobile">Quality: Mobile</option>
              <option value="web">Quality: High</option>
            </select>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CHARACTER_ANIMATIONS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => chooseAnimation(name)}
                aria-pressed={animation === name}
                style={{
                  ...buttonBase,
                  background: animation === name ? "#436be6" : "#17253b",
                  borderColor: animation === name ? "#6588ff" : "#34445f",
                }}
              >
                {name}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              aria-pressed={!playing}
              style={{ ...buttonBase, minWidth: 87 }}
            >
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              Speed
              <input
                type="range"
                min="0.25"
                max="2"
                step="0.05"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                aria-label="Animation speed"
              />
              <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 35 }}>{speed.toFixed(2)}×</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
