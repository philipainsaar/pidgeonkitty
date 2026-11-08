"use client";

import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { createPortal } from "react-dom";

/**
 * Snow360 startup screen. The larger layered logo sits at the top center
 * while loading; the progress display stays centered. The screen fades only
 * when the real Welcome PLAY button is ready, never after an arbitrary delay.
 */

/**
 * Two mode buttons share the same round cloud PNG and selected-state filter as
 * Welcome settings. Kept inside this EXISTING file, so app/page.jsx never has
 * to import a separate, easy-to-miss mode-selector module.
 * Only numbers are visually displayed. Descriptive names remain accessible.
 */
function Snow360WelcomeModeButtons() {
  const [host, setHost] = useState(null);
  const [mode, setMode] = useState("standard");

  useEffect(() => {
    let saved="standard";
    try { saved=sessionStorage.getItem("snow360-game-mode")==="token"?"token":"standard"; } catch {}
    setMode(saved);
    document.documentElement.dataset.snow360Mode=saved;

    const findHost=()=>{
      const next=document.querySelector(".snow360-start-floating");
      if(next) { setHost(next); return true; }
      return false;
    };
    if(findHost()) return () => { delete document.documentElement.dataset.snow360Mode; };
    const observer=new MutationObserver(()=>{
      if(findHost()) observer.disconnect();
    });
    observer.observe(document.body,{childList:true,subtree:true});
    return () => { observer.disconnect(); delete document.documentElement.dataset.snow360Mode; };
  },[]);

  const choose = next => {
    if(next!=="standard" && next!=="token")return;
    setMode(next);
    document.documentElement.dataset.snow360Mode=next;
    try { sessionStorage.setItem("snow360-game-mode",next); } catch {}
    window.dispatchEvent(new CustomEvent("snow360-mode-change",{detail:{gameMode:next}}));
  };

  return <>
    <style>{`
      /* Identical PNG and ON/OFF color treatment to the settings toggles. */
      .snow360-start-floating .snow360-mode-picker {
        order: -1 !important;
        display: flex !important;
        flex-direction: row !important;
        justify-content: center !important;
        align-items: center !important;
        gap: 9px !important;
        width: 100% !important;
        min-height: 56px !important;
        pointer-events: auto !important;
      }
      .snow360-start-floating .snow360-mode-picker button.snow360-mode-choice {
        appearance: none !important;
        -webkit-appearance: none !important;
        display: grid !important;
        place-items: center !important;
        flex: 0 0 57px !important;
        width: 57px !important;
        height: 57px !important;
        min-height: 57px !important;
        padding: 0 !important;
        margin: 0 !important;
        border: 0 !important;
        border-radius: 50% !important;
        background: transparent var(--snow-cloud-round) center / contain no-repeat !important;
        box-shadow: none !important;
        color: #fff9ff !important;
        font: 900 27px Fredoka,system-ui,sans-serif !important;
        letter-spacing: 0 !important;
        text-shadow: 0 1px 2px #b6427d88 !important;
        cursor: pointer !important;
        touch-action: manipulation !important;
        user-select: none !important;
        transition: filter .18s ease, transform .18s ease, opacity .18s ease !important;
      }
      .snow360-start-floating .snow360-mode-picker button.snow360-mode-choice[aria-pressed="true"] {
        opacity: 1 !important;
        filter: saturate(1.15) drop-shadow(0 4px 7px rgba(241,111,182,.23)) !important;
      }
      .snow360-start-floating .snow360-mode-picker button.snow360-mode-choice[aria-pressed="false"] {
        opacity: .79 !important;
        filter: grayscale(1) saturate(0) contrast(.94) brightness(1.08) !important;
      }
      .snow360-start-floating .snow360-mode-picker button.snow360-mode-choice[aria-pressed="false"]:hover {
        filter: grayscale(1) saturate(0) contrast(.94) brightness(1.16) !important;
      }
      .snow360-start-floating .snow360-mode-picker button.snow360-mode-choice:active {
        transform: scale(.955) !important;
      }
      .snow360-start-floating .snow360-mode-picker button.snow360-mode-choice:focus-visible {
        outline: 3px solid #8f85ea !important;
        outline-offset: 2px !important;
      }
      /* No trick choices in the Token Rush settings. */
      html[data-snow360-mode="token"] #snow360-intro-settings .snow360-settings-icon-grid >
        button.snow360-settings-icon-btn:nth-child(-n+2) { display: none !important; }
      html[data-snow360-mode="token"] #snow360-intro-settings .snow360-settings-icon-grid {
        grid-template-columns: repeat(3, minmax(0,1fr)) !important;
        max-width: 248px !important;
      }
      @media(max-width:720px),(pointer:coarse) {
        .snow360-start-floating .snow360-mode-picker {
          gap: 8px !important;
          min-height: 48px !important;
        }
        .snow360-start-floating .snow360-mode-picker button.snow360-mode-choice {
          flex-basis: 48px !important;
          width: 48px !important;
          height: 48px !important;
          min-height: 48px !important;
          font-size: 24px !important;
        }
      }
    `}</style>
    {host && createPortal(
      <div className="snow360-mode-picker" role="group" aria-label="Choose game mode">
        <button type="button" className="snow360-mode-choice" aria-label="Mode 1: Standard Downhill Freestyle"
          title="1: Standard" aria-pressed={mode==="standard"} onClick={()=>choose("standard")}>1</button>
        <button type="button" className="snow360-mode-choice" aria-label="Mode 2: Token Rush"
          title="2: Token Rush" aria-pressed={mode==="token"} onClick={()=>choose("token")}>2</button>
      </div>, host
    )}
  </>;
}

export default function Snow360StartupLoader() {
  const { progress, total } = useProgress();
  const [ready, setReady] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const next = Number.isFinite(progress) ? Math.max(0, progress) : 0;
    setDisplayProgress(previous => Math.max(previous, Math.min(99, Math.floor(next))));
  }, [progress]);

  useEffect(() => {
    if (ready) return;
    const check = () => {
      const play = document.querySelector('button[aria-label="Play Snow360"]');
      if (play && !play.disabled) {
        setDisplayProgress(100);
        setReady(true);
      }
    };
    check();
    const interval = window.setInterval(check, 150);
    return () => window.clearInterval(interval);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const fade = window.setTimeout(() => setFading(true), 180);
    const hide = window.setTimeout(() => setVisible(false), 950);
    return () => { window.clearTimeout(fade); window.clearTimeout(hide); };
  }, [ready]);

  const percent = ready ? 100 : displayProgress;

  return <>
    <Snow360WelcomeModeButtons />
    {visible && <div aria-label="Snow360 loading screen" aria-busy={!ready}
    style={{position:"fixed",inset:0,zIndex:9999,display:"grid",placeItems:"center",
      overflow:"hidden",backgroundColor:"#fbeef8",
      backgroundImage:'url("/images/pastel-sky.jpg")',backgroundSize:"cover",backgroundPosition:"center",
      padding:20,boxSizing:"border-box",opacity:fading?0:1,
      transition:"opacity .55s ease",pointerEvents:fading?"none":"auto"}}>
    <style>{`
      @keyframes snow360LoadShine {from{transform:translateX(-120%)}to{transform:translateX(400%)}}
      @keyframes snow360LoadPulse {0%,100%{opacity:.65;transform:scale(.98)}50%{opacity:1;transform:scale(1.02)}}
      @media(prefers-reduced-motion:reduce){.snow360-loading-word,.snow360-loading-shine{animation:none!important}}
    `}</style>

    {/* The large logo is shown ONLY during loading. As this overlay fades, the
        small top-left Welcome logo is revealed beneath it. */}
    <div aria-label="Snow360" style={{position:"absolute",zIndex:1,pointerEvents:"none",
      left:"50%",top:"clamp(12px, 4.5vh, 58px)",transform:"translateX(-50%)",
      width:"min(88vw, 720px)",height:"min(26vh, 280px)",
      maxWidth:"100%",userSelect:"none"}}>
      <img src="/images/Snow360Logo-background.png" alt="" aria-hidden="true"
        draggable={false} loading="eager" decoding="async"
        style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain"}} />
      <img src="/images/Snow360Logo.png" alt="SNOW360"
        draggable={false} loading="eager" decoding="async"
        style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain"}} />
    </div>

    <div aria-live="polite" style={{width:"min(340px,80vw)",textAlign:"center",position:"relative",
      zIndex:1,filter:"drop-shadow(0 2px 10px rgba(255,255,255,.86))"}}>
      <div aria-hidden="true" style={{font:"900 20px Fredoka,system-ui,sans-serif",
        color:"#ef95cc",letterSpacing:".35em",marginBottom:4}}>✦ ✧ ✦</div>
      <div className="snow360-loading-word" style={{font:"1000 clamp(29px,7vw,43px) Fredoka,system-ui,sans-serif",
        color:"#e778b4",letterSpacing:".065em",lineHeight:1.2,
        textShadow:"0 2px 0 #fff8ff,0 3px 15px #ffffffbd",animation:"snow360LoadPulse 2.4s ease-in-out infinite"}}>
        {ready ? "READY!" : "LOADING…"}
      </div>
      <div role="progressbar" aria-label="Loading progress" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={percent} style={{height:12,marginTop:20,overflow:"hidden",borderRadius:999,
          border:"2px solid #ffffffef",background:"#b5cfdf7a",
          boxShadow:"0 2px 10px #8fb4ca35,inset 0 1px 4px #8fb4ca46"}}>
        <div style={{width:`${percent}%`,height:"100%",position:"relative",borderRadius:999,
          background:"linear-gradient(90deg,#a6e7f6 0%,#d2c5ff 35%,#ffa8d6 75%,#ffe1ac 100%)",
          transition:"width .32s ease-out",overflow:"hidden"}}>
          <div className="snow360-loading-shine" aria-hidden="true"
            style={{position:"absolute",inset:0,width:"32%",background:"linear-gradient(90deg,transparent,#ffffffcc,transparent)",animation:"snow360LoadShine 2.2s linear infinite"}}/>
        </div>
      </div>
      <div style={{marginTop:7,font:"900 11px Fredoka,system-ui,sans-serif",letterSpacing:".10em",
        color:"#6085a2",textShadow:"0 1px 3px #fff",fontVariantNumeric:"tabular-nums"}}>
        {total>0||ready?`${percent}%`:""}
      </div>
    </div>
  </div>}
  </>;
}
