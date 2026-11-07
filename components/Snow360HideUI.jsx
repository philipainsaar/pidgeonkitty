"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Visual-only Snow360 cinematic / Hide UI mode.
 * - Adds a sixth Unicode-only option to the EXISTING Welcome Settings grid.
 * - ON hides the game HUD, trick icons, notifications and mobile pause button.
 * - Leaves the logo, rendered scene, music, controls and gameplay untouched.
 * - H (desktop) or a tap on the logo (mobile) restores UI during gameplay.
 * No changes to Snow64Welcome.jsx or the large SnowboardGame.jsx are needed.
 */
export default function Snow360HideUI() {
  const [settingsGrid, setSettingsGrid] = useState(null);
  const [hidden, setHidden] = useState(false);

  // The Welcome screen mounts its own React subtree. A portal makes our
  // sixth option a genuine accessible React button inside the same grid.
  useEffect(() => {
    const findGrid = () => {
      const grid = document.querySelector(
        '#snow360-intro-settings .snow360-settings-icon-grid'
      );
      if (grid) {
        setSettingsGrid(grid);
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(findGrid);
    observer.observe(document.body, { childList: true, subtree: true });
    findGrid();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-snow360-hide-ui", hidden ? "on" : "off"
    );
    return () => document.documentElement.removeAttribute("data-snow360-hide-ui");
  }, [hidden]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key?.toLowerCase() !== "h") return;
      if (!document.querySelector('main[data-game-phase="playing"]')) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setHidden((value) => !value);
    };

    // The HUD logo becomes the one unobtrusive way to restore mobile controls.
    // It is clickable ONLY in Hide UI mode. There is no permanent extra button.
    const onLogoClick = (event) => {
      if (document.documentElement.getAttribute("data-snow360-hide-ui") !== "on") return;
      const main = document.querySelector('main[data-game-phase="playing"]');
      const logo = main?.querySelector(
        'div:has(> .snow64-hud) > div:first-child > div:has(> img)'
      );
      if (!logo || !logo.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setHidden(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("click", onLogoClick, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("click", onLogoClick, true);
    };
  }, []);

  return settingsGrid ? createPortal(
    <button
      type="button"
      className={`snow360-settings-icon-btn ${hidden ? "is-on" : "is-off"}`}
      aria-label={`Hide UI: ${hidden ? "on" : "off"}`}
      aria-pressed={hidden}
      title={hidden ? "Hide UI ON: logo only while riding" : "Hide UI OFF: show all game controls"}
      onClick={() => setHidden((value) => !value)}
    >
      <span className="snow360-settings-icon-glyph" aria-hidden="true">◉</span>
    </button>,
    settingsGrid
  ) : null;
}
