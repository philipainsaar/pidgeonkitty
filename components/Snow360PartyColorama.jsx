"use client";

import { useEffect } from "react";
import {
  getSnow64Music,
  getSnow64MusicEnergy,
  onSnow64MusicBeat,
} from "./snow64Music";

/**
 * SNOW360 MUSIC PARTY MODE
 *
 * This is a visual-only controller for the EXISTING Colorama SVG filter.
 * It reads the existing game HUD, the Bubble Candy/Surf/Speed soundtrack tier,
 * and real Web Audio analyser energy. It never modifies physics, audio gain,
 * track selection, trick timing, or the Three.js scene.
 *
 * The existing Colorama setting remains the ON/OFF switch. When OFF, the
 * game renders with its normal, unfiltered pastel palette.
 */
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const smooth = (from, target, amount) => from + (target - from) * clamp(amount, 0, 1);
const TIER_PERIOD_SECONDS = Object.freeze({
  candy: 12.5, // Relaxed Bubble Candy
  surf: 8.0,   // Bubble Surf
  speed: 4.8,  // Bubble Speed
});

function readSpeedKmh(main) {
  if (!main) return 0;
  const panel = main.querySelector('[data-snow360-stat="speed"]');
  let number = panel?.querySelector(".snow64-number");
  if (!number) {
    for (const item of main.querySelectorAll(".snow64-hud .snow64-panel")) {
      if (item.querySelector(".snow64-label")?.textContent?.trim() === "SPEED") {
        number = item.querySelector(".snow64-number");
        break;
      }
    }
  }
  const value = parseFloat((number?.firstChild?.textContent || number?.textContent || "")
    .replace(/,/g, "").trim());
  return Number.isFinite(value) ? clamp(value, 0, 360) : 0;
}

export default function Snow360PartyColorama() {
  useEffect(() => {
    const root = document.documentElement;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let main = null;
    let preview = null;
    let refreshAt = 0;
    let lastFrame = 0;
    let lastPaint = 0;
    let speedKmh = 0;
    let hue = 0;
    let beat = 0;
    let audioLevel = 0;
    let peak = 0.06;
    let wasActive = false;
    let raf = 0;
    let disposed = false;

    // Beat events come from the existing recorded-music engine. The analyser
    // energy below adds genuine sound-reactivity between these clock beats.
    const unsubscribe = onSnow64MusicBeat(() => {
      beat = Math.min(1, beat + 0.65);
    });

    const paint = (time) => {
      if (disposed) return;
      raf = window.requestAnimationFrame(paint);
      // 30 fps limit: cheaper than a full-resolution per-frame screen effect,
      // with smoothly interpolated hue angles for desktop and mobile.
      if (time - lastPaint < 32) return;
      const dt = clamp(lastFrame ? (time - lastFrame) / 1000 : 0.033, 0.001, 0.09);
      lastFrame = time;
      lastPaint = time;

      if (time >= refreshAt) {
        main = document.querySelector("main[data-colorama]");
        preview = document.querySelector(".snow360-colorama-preview");
        speedKmh = readSpeedKmh(main);
        refreshAt = time + 230;
      }
      const active = main?.dataset.colorama === "on" || !!preview;
      if (!active) {
        if (wasActive) {
          root.style.removeProperty("--snow360-party-hue");
          root.style.removeProperty("--snow360-party-saturation");
          root.style.removeProperty("--snow360-party-brightness");
          wasActive = false;
        }
        beat = 0;
        audioLevel = 0;
        return;
      }
      wasActive = true;
      if (motion.matches) return; // Static pastel Colorama for reduced-motion users.

      const engine = getSnow64Music();
      const playing = main?.dataset.gamePhase === "playing";
      const musicPlaying = playing && !!engine?.isPlaying;
      const tier = musicPlaying ? engine.getSection?.() : null;
      const effectiveTier = tier === "candy" || tier === "surf" || tier === "speed"
        ? tier
        : speedKmh >= 170 ? "speed" : speedKmh >= 105 ? "surf" : "candy";

      // Follow the game's actual Candy -> Surf -> Speed music tier and smoothly
      // increase the rainbow rotation as the rider gains speed within a tier.
      const tierPeriod = TIER_PERIOD_SECONDS[effectiveTier];
      const speedFactor = clamp(0.78 + speedKmh / 250, 0.78, 1.56);
      let degreesPerSecond = (360 / tierPeriod) * speedFactor;
      if (!playing) degreesPerSecond = preview ? 360 / 15 : 0;

      const rawEnergy = musicPlaying ? clamp(getSnow64MusicEnergy(), 0, 1) : 0;
      // A floating peak means quiet tracks still produce visible breathing;
      // it also avoids permanently maxing out on louder recorded tracks.
      peak = Math.max(rawEnergy, peak * Math.exp(-dt * 0.16), 0.035);
      const targetEnergy = musicPlaying
        ? clamp(Math.sqrt(rawEnergy / Math.max(0.10, peak * 1.35)), 0, 1)
        : 0;
      audioLevel = smooth(audioLevel, targetEnergy, 1 - Math.exp(-dt * (targetEnergy > audioLevel ? 10 : 3.6)));
      beat *= Math.exp(-dt * 8.0);
      if (!musicPlaying) beat = 0;

      // Animated full-screen pastel rainbow, with tasteful audio-driven flashes.
      hue = (hue + dt * degreesPerSecond * (1 + audioLevel * 0.22 + beat * 0.15)) % 360;
      const saturation = 1.055 + (musicPlaying ? audioLevel * 0.14 + beat * 0.10 : 0);
      const brightness = 1.005 + (musicPlaying ? audioLevel * 0.035 + beat * 0.057 : 0);
      root.style.setProperty("--snow360-party-hue", `${hue.toFixed(2)}deg`);
      root.style.setProperty("--snow360-party-saturation", saturation.toFixed(3));
      root.style.setProperty("--snow360-party-brightness", brightness.toFixed(3));
    };

    raf = window.requestAnimationFrame(paint);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      unsubscribe?.();
      root.style.removeProperty("--snow360-party-hue");
      root.style.removeProperty("--snow360-party-saturation");
      root.style.removeProperty("--snow360-party-brightness");
    };
  }, []);

  return null;
}
