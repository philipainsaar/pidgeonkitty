"use client";

import { useEffect } from "react";

// Visual-only HUD feedback. Reads the EXISTING live HUD (no game-state or
// physics changes), so this can be installed without replacing SnowboardGame.
const stat = (rail, name) => rail.querySelector(`[data-snow360-stat="${name}"]`);
const numeric = (card) => {
  const number = card?.querySelector(".snow64-number");
  // The native KM/H <span> is separate from the number's first text node.
  const text = number?.firstChild?.textContent || "";
  const parsed = Number(text.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) && text.trim() ? parsed : null;
};
const elapsedSeconds = (card) => {
  const text = card?.querySelector(".snow64-number")?.firstChild?.textContent || "";
  const parts = text.trim().match(/^(\d+):(\d{2})\.(\d{1,2})$/);
  if (!parts) return null;
  return Number(parts[1]) * 60 + Number(parts[2]) + Number(parts[3]) / (parts[3].length === 1 ? 10 : 100);
};

export default function Snow360HudEffects() {
  useEffect(() => {
    let lastRail = null;
    let previous = null;
    let lastPassiveLoss = 0;
    let lastSpeedFlash = 0;
    let lastPower = false;
    const pulseTimers = new Map();
    const lastCardPulse = new Map();
    const clearPulses = () => {
      pulseTimers.forEach((t) => window.clearTimeout(t));
      pulseTimers.clear();
      lastCardPulse.clear();
    };
    const pulse = (card, mode, duration = 760, minGap = 420) => {
      if (!card) return;
      const now = performance.now();
      const last = lastCardPulse.get(card) || 0;
      if (last && now - last < minGap) return;
      lastCardPulse.set(card, now);
      window.clearTimeout(pulseTimers.get(card));
      card.removeAttribute("data-snow360-pulse");
      // Same state can pulse again after its previous animation completes.
      void card.offsetWidth;
      card.setAttribute("data-snow360-pulse", mode);
      const t = window.setTimeout(() => {
        if (card.getAttribute("data-snow360-pulse") === mode) {
          card.removeAttribute("data-snow360-pulse");
        }
        pulseTimers.delete(card);
      }, duration);
      pulseTimers.set(card, t);
    };

    const tick = () => {
      if (document.hidden) return;
      const rail = document.querySelector("main .snow360-arcade-hud");
      if (!rail) {
        if (lastRail) clearPulses();
        lastRail = null;
        previous = null;
        lastPower = false;
        return;
      }
      if (rail !== lastRail) {
        clearPulses();
        lastRail = rail;
        previous = null;
        lastPower = false;
        lastPassiveLoss = performance.now();
      }
      const main = rail.closest("main");
      if (main?.getAttribute("data-game-phase") !== "playing") {
        previous = null;
        return;
      }
      const speedCard = stat(rail, "speed");
      const scoreCard = stat(rail, "score");
      const timeCard = stat(rail, "time");
      if (!speedCard || !scoreCard || !timeCard) return;
      const speed = numeric(speedCard);
      const score = numeric(scoreCard);
      const elapsed = elapsedSeconds(timeCard);
      if (speed === null || score === null || elapsed === null) return;
      const now = performance.now();
      // Frost is already exposed by the game's own trick/status readout.
      const notices = main?.querySelector(".snow360-air-notices");
      const powered = !!notices?.textContent?.includes("FROST SHROOM");
      if (powered !== lastPower) {
        rail.toggleAttribute("data-snow360-frost-active", powered);
        if (powered) {
          pulse(speedCard, "frost", 940);
          pulse(scoreCard, "frost", 940);
          pulse(timeCard, "frost", 940);
        }
        lastPower = powered;
      }
      if (!previous || elapsed < previous.elapsed - 2) {
        previous = { speed, score, elapsed };
        return;
      }
      const scoreChange = score - previous.score;
      // The score loses small amounts every frame due to normal downhill drain.
      // Only BIG losses flash warning-red instantly, so ordinary drain doesn't
      // strobe continuously. Gentle drain gives a very rare warning tint.
      if (scoreChange >= 40) {
        pulse(scoreCard, "gain", 780, 430);
      } else if (scoreChange <= -85) {
        pulse(scoreCard, "loss", 900, 450);
        lastPassiveLoss = now;
      } else if (scoreChange < 0 && now - lastPassiveLoss >= 6800) {
        pulse(scoreCard, "drain", 530, 6800);
        lastPassiveLoss = now;
      }
      const deltaSpeed = speed - previous.speed;
      if (now - lastSpeedFlash >= 900) {
        if (deltaSpeed >= 5 || (powered && speed >= 115 && deltaSpeed >= 2)) {
          pulse(speedCard, "boost", 800, 750);
          lastSpeedFlash = now;
        } else if (deltaSpeed <= -8) {
          pulse(speedCard, "slow", 700, 750);
          lastSpeedFlash = now;
        }
      }
      // The time display counts UP: celebrate each new 30-second milestone.
      if (Math.floor(elapsed / 30) > Math.floor(previous.elapsed / 30)) {
        pulse(timeCard, "milestone", 850, 700);
      }
      previous = { speed, score, elapsed };
    };

    const timer = window.setInterval(tick, 120);
    tick();
    return () => {
      window.clearInterval(timer);
      clearPulses();
      lastRail?.removeAttribute("data-snow360-frost-active");
    };
  }, []);
  return null;
}
