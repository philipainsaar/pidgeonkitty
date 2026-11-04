"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";

// The existing game owns the trick logic and .snow64-trick DOM element.
// This layer only mirrors its display, without changing game source or scoring.
const NAME_PATTERN = /^(?:CORK 720|INDY GRAB|TAIL GRAB|NOSE GRAB|FRONTFLIP|BACKFLIP|METHOD|1080|720|360|180|OLLIE)$/;
const TOKEN_PATTERN = /\b(?:CORK 720|INDY GRAB|TAIL GRAB|NOSE GRAB|FRONTFLIP|BACKFLIP|METHOD|1080|720|360|180|OLLIE)\b|×\d+|\+\d[\d,]*/g;
const AIR_PATTERN = /^AIR COMBO ×(\d+)\s+(.+?)(\s+\+\d+ QUEUED)?$/;

// In-air text gives the combo count and current trick. Remember names as they
// are shown so an ongoing sequence can be displayed THPS4-style on one line.
function advanceTrickDisplay(raw, track) {
  const matched = AIR_PATTERN.exec(raw);
  if (!matched) {
    if (!raw || /CLEAN|WIPEOUT|RIDER DOWN|GETTING UP|RUN FOR YOUR BOARD/.test(raw)) {
      track.count = 0;
      track.current = "";
      track.names = [];
    }
    return raw;
  }

  const count = Number(matched[1]);
  const current = matched[2].trim();
  const queued = matched[3] || "";

  if (count < track.count || (count <= 1 && !track.count)) {
    track.names = [];
    track.current = "";
  }

  if (NAME_PATTERN.test(current)) {
    if (count > track.count || current !== track.current || !track.names.length) {
      track.names.push(current);
      track.names = track.names.slice(-3);
    }
    track.current = current;
  }
  track.count = count;
  const names = track.names.length ? track.names.join(" + ") : current;
  return `AIR COMBO ×${count}  ${names}${queued}`;
}

function StyledTrickParts({ text }) {
  const parts = useMemo(() => {
    const result = [];
    let cursor = 0;
    let colorIndex = 0;
    for (const match of text.matchAll(TOKEN_PATTERN)) {
      const start = match.index;
      const token = match[0];
      const end = start + token.length;
      if (start > cursor) {
        result.push(<span className="snow360-trick-plain" key={`plain-${cursor}`}>{text.slice(cursor, start)}</span>);
      }
      if (NAME_PATTERN.test(token)) {
        result.push(
          <span className="snow360-trick-name" key={`name-${start}`}
            style={{ animationDelay: `${-(colorIndex++ * 2.4)}s` }}>{token}</span>
        );
      } else if (token.startsWith("+") && text.slice(end).startsWith(" QUEUED")) {
        result.push(<span className="snow360-trick-plain" key={`queued-${start}`}>{token}</span>);
      } else {
        result.push(<span className="snow360-trick-points" key={`points-${start}`}>{token}</span>);
      }
      cursor = end;
    }
    if (cursor < text.length) {
      result.push(<span className="snow360-trick-plain" key={`last-${cursor}`}>{text.slice(cursor)}</span>);
    }
    return result;
  }, [text]);
  return <>{parts}</>;
}

function Snow360TrickOverlay() {
  const [text, setText] = useState("");
  const overlay = useRef(null);

  useEffect(() => {
    const tracker = { count: 0, current: "", names: [] };
    let previousRaw = "";
    let lastCheck = -100;
    let request = 0;
    let currentEl = null;

    // Leave the underlying React text node in place so the soundtrack's
    // .snow64-trick.textContent reader keeps working without changes.
    document.documentElement.classList.add("snow360-trick-overlay-ready");

    const tick = (now) => {
      request = requestAnimationFrame(tick);
      // 30 Hz position synchronization for the original floating animation.
      if (now - lastCheck < 32) return;
      lastCheck = now;
      const el = document.querySelector("main .snow64-trick");
      const layer = overlay.current;
      if (!layer) return;

      if (!el) {
        layer.style.display = "none";
        currentEl = null;
        previousRaw = "";
        tracker.count = 0;
        tracker.current = "";
        tracker.names = [];
        return;
      }
      if (el !== currentEl) {
        currentEl = el;
        previousRaw = "";
      }
      const raw = el.textContent?.trim() || "";
      if (raw !== previousRaw) {
        previousRaw = raw;
        setText(advanceTrickDisplay(raw, tracker));
      }

      const rect = el.getBoundingClientRect();
      const originalStyle = window.getComputedStyle(el);
      if (!raw || rect.width < 1 || rect.height < 1 || originalStyle.display === "none") {
        layer.style.display = "none";
        return;
      }
      layer.style.display = "block";
      layer.style.left = `${rect.left + rect.width / 2}px`;
      layer.style.fontSize = originalStyle.fontSize;
      // If the combo wraps, extend upward so it does not cover the air meter.
      layer.style.top = `${rect.top - Math.max(0, layer.offsetHeight - rect.height)}px`;
    };
    request = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(request);
      document.documentElement.classList.remove("snow360-trick-overlay-ready");
    };
  }, []);

  return <div ref={overlay} className="snow360-trick-overlay" aria-hidden="true">
    <StyledTrickParts text={text} />
  </div>;
}

export default memo(Snow360TrickOverlay);
