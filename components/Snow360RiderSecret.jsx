"use client";

import { useEffect, useId, useState } from "react";
import { normalizeSnow360Rider, SNOW360_RIDERS } from "./snow360RiderSettings";

const stopPropagation = (event) => event.stopPropagation();
const choices = [
  [SNOW360_RIDERS.ALIEN_CAT, "Alien Cat"],
  [SNOW360_RIDERS.PIDGEON_KITTY, "PidgeonKitty"],
];

/** A small decorative star hides the original rider among the settings. */
export default function Snow360RiderSecret({ rider, onChange, tone="dark" }) {
  const panelId = useId();
  const light=tone==="light";
  const selected = normalizeSnow360Rider(rider);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // A returning player can always see how to switch back to Alien Cat.
    if (selected === SNOW360_RIDERS.PIDGEON_KITTY) setExpanded(true);
  }, [selected]);

  return <div
    data-snow360-rider-secret="true"
    onPointerDown={stopPropagation}
    onPointerUp={stopPropagation}
    onClick={stopPropagation}
    onKeyDown={stopPropagation}
    onKeyUp={stopPropagation}
    style={{ width: "100%", maxWidth: 370, textAlign: "center" }}
  >
    <style>{`
      .snow360-secret-star {
        display:inline-grid;place-items:center;width:44px;height:44px;
        padding:0;border:0;border-radius:50%;background:transparent;
        color:#a8cbd7;font:20px system-ui,sans-serif;cursor:pointer;
        touch-action:manipulation;
      }
      .snow360-secret-star:hover { color:#ffe998;background:#ffffff0b; }
      .snow360-secret-star:focus-visible,
      .snow360-secret-rider:focus-visible { outline:3px solid #fff1a3;outline-offset:3px; }
      .snow360-secret-rider:active { transform:scale(.98); }
    `}</style>
    <button
      type="button"
      className="snow360-secret-star"
      style={light?{color:"#587a98"}:undefined}
      aria-label="Secret rider"
      aria-expanded={expanded}
      aria-controls={panelId}
      title="A familiar face…"
      onClick={() => setExpanded((open) => !open)}
    ><span aria-hidden="true">✧</span></button>
    <div id={panelId} hidden={!expanded}>
      <div style={{ color: light ? "#456188" : "#ffe998", font: "900 11px system-ui,sans-serif", marginBottom: 8 }}>
        A familiar face from the first snowfall.
      </div>
      <div role="group" aria-label="Choose your rider" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {choices.map(([id, label]) => <button
          key={id}
          type="button"
          className="snow360-secret-rider"
          aria-pressed={selected === id}
          onClick={() => onChange(id)}
          style={{
            minHeight: 44, padding: "10px 8px", border: "2px solid", borderRadius: 9,
            borderColor: selected === id ? "#ffe998" : "#7caec4",
            background: selected === id ? "#f7cc8d" : "#153c56",
            color: selected === id ? "#20394d" : "#f0faff",
            font: "900 12px system-ui,sans-serif", cursor: "pointer", touchAction: "manipulation",
          }}
        >{label}</button>)}
      </div>
      <div role="status" aria-live="polite" style={{ color: light ? "#456188" : "#c8e7f2", fontSize: 10, marginTop: 7 }}>
        {selected === SNOW360_RIDERS.PIDGEON_KITTY ? "PidgeonKitty is ready to ride." : "Alien Cat is ready to ride."}
      </div>
    </div>
  </div>;
}
