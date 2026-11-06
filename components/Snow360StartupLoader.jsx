"use client";

import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";

/**
 * First-visit loading overlay for SNOW360.
 *
 * - The background is the exact image at /public/images/pastel-sky.jpg.
 * - The progress bar follows Three.js's real asset LoadingManager.
 * - 100% is reserved for the moment the existing Snow64Welcome Play button
 *   actually becomes enabled. This includes rider readiness and scene setup.
 * - The underlying original welcome screen remains mounted, unchanged.
 *
 * This component never starts or changes the game.
 */
export default function Snow360StartupLoader() {
  const { progress, active, loaded, total, errors } = useProgress();
  const [ready, setReady] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [visible, setVisible] = useState(true);
  const [takingLong, setTakingLong] = useState(false);

  // Asset loads may arrive in waves. Avoid an unsettling backwards jump.
  useEffect(() => {
    const next = Number.isFinite(progress) ? Math.max(0, progress) : 0;
    setDisplayProgress(previous => Math.max(previous, Math.min(99, Math.floor(next))));
  }, [progress]);

  // This uses Snow64Welcome's existing readiness condition, rather than
  // assuming that a reported 100% asset download means the game is ready.
  useEffect(() => {
    if (ready) return undefined;

    const checkPlayReady = () => {
      const playButton = document.querySelector('button[aria-label="Play Snow360"]');
      if (playButton && !playButton.disabled) {
        setDisplayProgress(100);
        setReady(true);
      }
    };

    checkPlayReady();
    const interval = window.setInterval(checkPlayReady, 150);
    return () => window.clearInterval(interval);
  }, [ready]);

  // Give the 100% state a moment to be visible, then softly reveal the original
  // welcome screen and remove the overlay entirely.
  useEffect(() => {
    if (!ready) return undefined;
    const fadeTimer = window.setTimeout(() => setFading(true), 180);
    const removeTimer = window.setTimeout(() => setVisible(false), 950);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [ready]);

  // If an asset fails or startup stalls, don't trap the user indefinitely.
  useEffect(() => {
    if (ready) return undefined;
    const timer = window.setTimeout(() => setTakingLong(true), 45000);
    return () => window.clearTimeout(timer);
  }, [ready]);

  if (!visible) return null;

  const hasTrackedAssets = total > 0;
  const pct = ready ? 100 : displayProgress;
  const failure = Array.isArray(errors) && errors.length > 0;

  const description = ready
    ? "Your snowy adventure is ready!"
    : failure
      ? "An asset could not be loaded."
      : pct >= 99
        ? "Preparing the welcome screen..."
        : active || hasTrackedAssets
          ? "Loading snow, clouds and characters..."
          : "Preparing your snowy world...";

  return (
    <div
      aria-label="SNOW360 game loading screen"
      aria-busy={!ready}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        padding: "24px",
        backgroundColor: "#fbeef8",
        backgroundImage: 'url("/images/pastel-sky.jpg")',
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.55s ease",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <style>{`
        @keyframes snow360StartupGlimmer {
          0%, 100% { transform: translateX(-110%); }
          50% { transform: translateX(330%); }
        }
        @keyframes snow360StartupBreathe {
          0%, 100% { opacity: 0.58; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .snow360-loading-glimmer { animation: none !important; }
          .snow360-loading-dot { animation: none !important; }
        }
      `}</style>

      {/* Brightens the uploaded art slightly without covering the clouds. */}
      <div aria-hidden="true" style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg,rgba(255,247,254,.08),rgba(245,240,255,.08))",
        pointerEvents: "none",
      }} />

      <section
        aria-live="polite"
        style={{
          width: "min(390px, 100%)",
          position: "relative",
          zIndex: 1,
          boxSizing: "border-box",
          padding: "clamp(23px, 5vw, 34px)",
          borderRadius: 27,
          textAlign: "center",
          color: "#547188",
          background: "linear-gradient(145deg,rgba(255,255,255,.84),rgba(255,240,249,.75),rgba(235,247,255,.82))",
          border: "1.5px solid rgba(255,255,255,.94)",
          boxShadow: "0 16px 56px rgba(137,139,176,.15), inset 0 2px 0 rgba(255,255,255,.95)",
          backdropFilter: "blur(14px) saturate(1.3)",
          WebkitBackdropFilter: "blur(14px) saturate(1.3)",
        }}
      >
        <div aria-hidden="true" className="snow360-loading-dot" style={{
          fontSize: 22,
          lineHeight: 1,
          marginBottom: 11,
          color: "#ee96ca",
          animation: "snow360StartupBreathe 2.2s ease-in-out infinite",
        }}>✦ ✧ ✦</div>

        <h1 style={{
          margin: "0 0 6px",
          color: "#e477b1",
          letterSpacing: ".065em",
          fontSize: "clamp(25px, 6vw, 35px)",
          fontWeight: 700,
          lineHeight: 1.2,
        }}>
          {ready ? "READY!" : "LOADING..."}
        </h1>

        <p style={{
          fontSize: "clamp(12px, 3.1vw, 14px)",
          lineHeight: 1.5,
          margin: "0 0 23px",
          color: "#67879c",
        }}>{description}</p>

        <div
          role="progressbar"
          aria-label="Game loading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          style={{
            width: "100%",
            height: 16,
            overflow: "hidden",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,.95)",
            background: "rgba(195,217,231,.47)",
            boxShadow: "inset 0 2px 5px rgba(115,156,179,.15)",
          }}
        >
          <div style={{
            position: "relative",
            height: "100%",
            width: `${pct}%`,
            borderRadius: 999,
            background: "linear-gradient(90deg,#a2deed 0%,#c7c2fa 37%,#ffa6d1 76%,#ffe1aa 100%)",
            boxShadow: "0 0 12px rgba(255,145,205,.35)",
            transition: "width .3s ease-out",
            overflow: "hidden",
          }}>
            <div className="snow360-loading-glimmer" style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "35%",
              background: "linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent)",
              animation: "snow360StartupGlimmer 2.1s ease-in-out infinite",
            }}/>
          </div>
        </div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 10,
          gap: 10,
          fontSize: 12,
          color: "#698aa2",
          letterSpacing: ".03em",
        }}>
          <span>{ready ? "READY TO PLAY" : "LOADING GAME"}</span>
          <span style={{fontVariantNumeric:"tabular-nums", fontWeight:700}}>
            {hasTrackedAssets || ready ? `${pct}%` : "PREPARING"}
          </span>
        </div>

        {(takingLong || failure) && !ready && (
          <div style={{
            marginTop: 17,
            fontSize: 12,
            lineHeight: 1.5,
            color: "#765d86",
          }}>
            <p style={{margin:"0 0 10px"}}>
              {failure ? "Some assets did not load." : "This is taking longer than usual."}
            </p>
            <button
              type="button"
              onClick={() => {
                setFading(true);
                window.setTimeout(() => setVisible(false), 600);
              }}
              style={{
                appearance: "none",
                border: "1px solid #f4b8da",
                background: "#fff8fc",
                color: "#795c83",
                borderRadius: 999,
                padding: "10px 15px",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              Show welcome screen
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
