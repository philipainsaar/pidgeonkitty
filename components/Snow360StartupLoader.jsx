"use client";

import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";

/**
 * Snow360 startup screen. The larger layered logo sits at the top center
 * while loading; the progress display stays centered. The screen fades only
 * when the real Welcome PLAY button is ready, never after an arbitrary delay.
 */
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

  if (!visible) return null;
  const percent = ready ? 100 : displayProgress;

  return <div aria-label="Snow360 loading screen" aria-busy={!ready}
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
  </div>;
}
