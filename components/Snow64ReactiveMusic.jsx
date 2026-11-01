"use client";

/**
 * SNOW 64 / Rapid Rain V2 direct-copy integration.
 *
 * Place alongside the unmodified SnowboardGame component and render from
 * app/page.jsx. A tiny portal adds MUSIC ON/OFF to the existing start menu.
 * The music listens to live HUD values instead of modifying game physics.
 * All existing game sounds and camera behavior remain unchanged.
 *
 * Beat events for optional future Three.js effects:
 *   window.addEventListener("snow64:music-beat", (event) => {
 *     console.log(event.detail.beat, event.detail.bpm);
 *   });
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  startSnow64Music, pauseSnow64Music, resumeSnow64Music,
  stopSnow64Music, updateSnow64MusicFrame, playSnow64MusicEvent,
  disposeSnow64Music, getSnow64Music, onSnow64MusicBeat,
} from "./snow64Music";

const WATCH_INTERVAL_MS = 130; // HUD itself updates about every 120 ms.
const speedFromText = (label) => {
  const value = parseFloat(String(label ?? "").replace(/[^\d.-].*$/, ""));
  return Number.isFinite(value) ? Math.max(0, value / 3.6) : 21.5;
};

function gameSnapshot() {
  const main = document.querySelector("main");
  if (!main) return null;
  const settings = main.querySelector('[data-snow64-settings="true"]');
  // The ready/finished menus have the settings group; paused does not.
  // The status overlay is removed when playing begins.
  const all = main.textContent || "";
  const phase = settings
    ? (all.includes("SCORE DEPLETED!") ? "finished" : "ready")
    : all.includes("TAP / CLICK ANYWHERE TO RESUME") ? "paused" : "playing";

  const speed = speedFromText(main.querySelector(".snow64-hud .snow64-number")?.textContent);
  const powered = phase === "playing" && !!main.querySelector(".snow64-magic");
  const air = /\bAIR\s+(\d+(?:\.\d+)?)m/.exec(all);
  const coins = /✦\s*(\d+)\s+TOKENS/.exec(all);
  const rocks = /FROST SHROOM\s+[\d.]+s\s*[•·]\s*(\d+)\s+ROCKS/.exec(all);
  const combo = /\bCOMBO\s*×\s*(\d+)/.exec(all);
  const recovery = /RIDER DOWN|RUNNING BACK TO THE BOARD|REMOUNTING/.test(all);
  const trick = main.querySelector(".snow64-trick")?.textContent?.trim() || "";
  const inAir = phase === "playing" && !!air;

  return {
    settings, phase, speed, powered, inAir, recovery, trick,
    airHeight: air ? Number(air[1]) : 0,
    coins: coins ? Number(coins[1]) : null,
    rocks: rocks ? Number(rocks[1]) : null,
    combo: combo ? Number(combo[1]) : 0,
  };
}

export default function Snow64ReactiveMusic() {
  const [menuNode, setMenuNode] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(true);
  const snapshotRef = useRef(null);
  const startRequested = useRef(false);

  // Input handler runs in the browser's direct click/keyboard gesture. This is
  // essential for iOS / Chrome Web Audio autoplay permissions.
  useEffect(() => {
    const begin = () => {
      if (!enabledRef.current || startRequested.current) return;
      startRequested.current = true;
      void startSnow64Music();
    };
    const resume = () => {
      if (enabledRef.current) void resumeSnow64Music();
    };
    const onClick = (event) => {
      const current = gameSnapshot() || snapshotRef.current;
      if (!current) return;
      if (event.target?.closest?.('button, [data-snow64-settings="true"]')) return;
      if (current.phase === "ready" || current.phase === "finished") begin();
      else if (current.phase === "paused") resume();
    };
    const onKeyDown = (event) => {
      if (event.repeat) return;
      const key = event.key?.toLowerCase();
      const current = gameSnapshot() || snapshotRef.current;
      if (!current) return;
      if ((key === "enter" || event.code === "Space") &&
        (current.phase === "ready" || current.phase === "finished") &&
        !event.target?.closest?.("button")) begin();
      if ((key === "p" || key === "escape") && current.phase === "paused") resume();
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onSnow64MusicBeat((event) => {
      window.dispatchEvent(new CustomEvent("snow64:music-beat", { detail: event }));
    });
    let last = null;
    const update = () => {
      const next = gameSnapshot();
      if (!next) return;
      snapshotRef.current = next;
      setMenuNode(old => old === next.settings ? old : next.settings);

      if (last?.phase !== next.phase) {
        if (next.phase === "paused") pauseSnow64Music();
        if (next.phase === "ready" || next.phase === "finished") {
          stopSnow64Music();
          startRequested.current = false;
        }
        // Browser gesture handlers start audio. This fallback also handles
        // starting through any future game control introduced later.
        if (next.phase === "playing" && enabledRef.current && !startRequested.current) {
          startRequested.current = true;
          void startSnow64Music();
        }
      }
      if (next.phase === "playing" && enabledRef.current && getSnow64Music()?.isPlaying) {
        updateSnow64MusicFrame({
          playing: true, speed: next.speed, powered: next.powered,
          inAir: next.inAir, recovery: next.recovery,
          tuck: next.speed > 30, airHeight: next.airHeight,
        });
        if (last?.phase === "playing") {
          const react = (name) => playSnow64MusicEvent(name);
          if (!last.powered && next.powered) react("power");
          if (last.powered && !next.powered) react("powerEnd");
          if (last.coins !== null && next.coins !== null && next.coins > last.coins) react("pickup");
          if (last.rocks !== null && next.rocks !== null && next.rocks > last.rocks) react("shatter");
          if (next.combo > last.combo) react("combo");
          if (next.trick && next.trick !== last.trick) react("trickStart");
          if (!last.inAir && next.inAir && !next.powered) react("ollie");
          if (last.inAir && !next.inAir && !next.recovery && !last.powered) react("land");
          if (!last.recovery && next.recovery) react("crash");
        }
      }
      last = next;
    };
    update();
    const watcher = window.setInterval(update, WATCH_INTERVAL_MS);
    return () => {
      window.clearInterval(watcher);
      unsubscribe();
      stopSnow64Music();
      void disposeSnow64Music();
    };
  }, []);

  const toggle = () => {
    enabledRef.current = !enabledRef.current;
    setEnabled(enabledRef.current);
    if (!enabledRef.current) {
      stopSnow64Music();
      startRequested.current = false;
    }
  };

  // No visible audio player. The only UI is a single extra setting inside the
  // game's original first window (and again on the new-run settings screen).
  return menuNode ? createPortal(
    <div data-snow64-reactive-music="true" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <button type="button" aria-pressed={enabled} aria-label="Include recorded reactive soundtrack"
        onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();toggle();}}
        style={{padding:"9px 15px",border:"2px solid #d7f4ff",borderRadius:9,
          background:enabled?"#f7cc8d":"#163d59",color:enabled?"#20394d":"#f3fbff",
          font:"900 11px system-ui,sans-serif",letterSpacing:".055em",cursor:"pointer",touchAction:"manipulation"}}>
        {enabled ? "♫ REACTIVE MUSIC: ON" : "♫ REACTIVE MUSIC: OFF"}
      </button>
      <div style={{font:"700 10px system-ui,sans-serif",color:"#b3dbe9"}}>
        Recorded soundtrack · reacts to speed, tricks & Frost Shroom
      </div>
    </div>, menuNode
  ) : null;
}
