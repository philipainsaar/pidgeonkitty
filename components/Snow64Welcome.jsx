"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import SnowboardGame from "./SnowboardGame";
import Snow64StartCeremony from "./Snow64StartCeremony";
import { Snow64ModelProvider } from "./snow64VisualModels";
import { unlockSnow64Audio, setSnow64AudioEnabled } from "./snow64Audio";
import { startSnow64Music } from "./snow64Music";
import { Snow64TextureProvider } from "./snow64VisualMaterials";
import Snow64IntroCourse, { introGroundY } from "./Snow64IntroCourse";

// The real game is mounted and loaded behind the welcome scene. During the
// cinematic we render an opaque, camera-controlled preview using the SAME
// world-space snow function, textures, GLB trees, ramps and cloud components.
// This avoids the two-character double-exposure from the old transparent Canvas.
function WelcomeScene({mobile,stage,onComplete}) {
  return <Snow64ModelProvider><Snow64TextureProvider mobile={mobile}>
    <color attach="background" args={["#bfd9e6"]}/>
    <fog attach="fog" args={["#c1dce9",30,138]}/>
    <ambientLight intensity={1.7}/>
    <hemisphereLight args={["#e6f6ff","#597988",1.3]}/>
    <directionalLight position={[-8,20,-30]} intensity={2.2} color="#fff6e9"/>
    <Suspense fallback={null}>
      <Snow64IntroCourse mobile={mobile}/>
      <Snow64StartCeremony mobile={mobile} phase={stage === "ready" ? "ready" : "intro"}
        onComplete={onComplete} groundY={introGroundY}/>
    </Suspense>
  </Snow64TextureProvider></Snow64ModelProvider>;
}

function WelcomeToggle({label,checked,onClick}) {
  return <button type="button" onClick={onClick} aria-pressed={checked}
    style={{padding:"7px 8px",borderRadius:9,font:"800 10px system-ui,sans-serif",
      letterSpacing:".02em",minHeight:30,background:checked?"#d1f5e9":"#ffffff98",
      border:`1.5px solid ${checked?"#fff":"#a0bdd1"}`,
      color:checked?"#254657":"#4c6f86",cursor:"pointer",touchAction:"manipulation"}}>
    {label}: {checked?"ON":"OFF"}
  </button>;
}

export default function Snow64Welcome(){
  const [stage,setStage]=useState("ready");
  const [mobile,setMobile]=useState(null);
  const [trickButtons,setTrickButtons]=useState(false);
  const [soundOn,setSoundOn]=useState(true);
  const [musicOn,setMusicOn]=useState(true);
  const [retro,setRetro]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [assetsReady,setAssetsReady]=useState(false);
  const {active: loadingActive, progress: loadingProgress, total: loadTotal} = useProgress();
  const committed=useRef(false);
  const onComplete=useCallback(()=>setStage(s=>s === "intro" ? "handoff" : s),[]);
  // Wait until the actual game Canvas AND shared Three.js loader have finished
  // their initial jobs. Optional endless-course items are loaded on demand.
  useEffect(()=>{
    if(stage!=="ready" || assetsReady)return;
    const check=()=>{
      const gameCanvas=document.querySelector('main canvas');
      const readyMenu=document.querySelector('[data-snow64-settings="true"]');
      const noLoadingText=!(document.querySelector('main')?.textContent||'').includes('LOADING RIDER');
      if(gameCanvas && readyMenu && !loadingActive && noLoadingText &&
          (loadingProgress>=99.5 && loadTotal>0))setAssetsReady(true);
    };
    check();
    const poll=setInterval(check,160);
    return()=>clearInterval(poll);
  },[stage,assetsReady,loadingActive,loadingProgress,loadTotal]);
  useEffect(()=>{
    if(stage!=="fade")return;
    const timer=setTimeout(()=>setStage("done"),650);
    return()=>clearTimeout(timer);
  },[stage]);
  useEffect(()=>{
    const media=window.matchMedia("(max-width: 720px), (pointer: coarse)");
    const update=()=>setMobile(media.matches);
    update();media.addEventListener?.("change",update);
    return()=>media.removeEventListener?.("change",update);
  },[]);
  const play=useCallback(()=>{
    if(stage!=="ready" || !assetsReady)return;
    // Must happen in this actual pointer/key gesture for mobile audio access.
    setSnow64AudioEnabled(soundOn);
    if(soundOn) unlockSnow64Audio();
    // Start the adaptive soundtrack during the actual user gesture. This also
    // unlocks playback on mobile, before the gameplay scene is mounted.
    if(musicOn) void startSnow64Music();
    setStage("intro");
  },[stage,soundOn,musicOn,assetsReady]);
  useEffect(()=>{
    if(stage!=="ready")return;
    const down=e=>{
      if(e.target?.closest?.("button"))return;
      if(e.code === "Space" || e.key === "Enter"){
        e.preventDefault();play();
      }
    };
    window.addEventListener("keydown",down);
    return()=>window.removeEventListener("keydown",down);
  },[stage,play]);

  // Start the original game from its existing ready phase; do not fork its
  // physics, audio, scoring, camera, or pause system. The hidden menu still
  // accepts its original settings before PLAY is dispatched.
  useEffect(()=>{
    if(stage!=="handoff" || committed.current)return;
    committed.current=true;
    let disposed=false, raf=0, attempts=0;
    const begin=()=>{
      if(disposed)return;
      const settings=document.querySelector('[data-snow64-settings="true"]');
      const reactiveButton=document.querySelector('[data-snow64-reactive-music="true"] button');
      if((!settings || (!musicOn && !reactiveButton)) && attempts++<65){
        raf=requestAnimationFrame(begin);return;
      }
      if(settings){
        const buttons=Array.from(settings.querySelectorAll("button"));
        const clickContaining=value=>buttons.find(b=>b.textContent?.includes(value))?.click();
        if(trickButtons)clickContaining("TRICK BUTTONS");
        if(!soundOn)clickContaining("SOUND & MUSIC: ON");
        if(retro)clickContaining("N64 FILTER: OFF");
      }
      if(!musicOn)reactiveButton?.click();
      // Wait for the game to commit the option clicks, then start it exactly
      // once using the Enter handler already implemented in SnowboardGame.jsx.
      raf=requestAnimationFrame(()=>{
        raf=requestAnimationFrame(()=>{
          if(disposed)return;
          window.dispatchEvent(new KeyboardEvent("keydown",{
            key:"Enter",code:"Enter",bubbles:true,cancelable:true,
          }));
          // Wait for the ALREADY-MOUNTED game to leave ready mode, then fade
          // only the character/caption overlay (the real 3D world never swaps).
          let checks=0;
          const finish=()=>{
            if(disposed)return;
            const stillReady=!!document.querySelector('[data-snow64-settings="true"]');
            if(stillReady && checks++<120){raf=requestAnimationFrame(finish);return;}
            setStage("fade");
          };
          raf=requestAnimationFrame(finish);
        });
      });
    };
    raf=requestAnimationFrame(begin);
    return()=>{disposed=true;cancelAnimationFrame(raf);};
  },[stage,trickButtons,soundOn,musicOn,retro]);

  return <>
    {/* The real game loads, creates all its geometry and starts rendering NOW. */}
    <SnowboardGame/>
    {stage!=="done" && <style>{`
      main > div:has([data-snow64-settings="true"]) {visibility:hidden!important;pointer-events:none!important;}
      main > div:has(.snow64-hud) {visibility:hidden!important;pointer-events:none!important;}
    `}</style>}
    {stage!=="done"&&<div style={{position:"fixed",inset:0,zIndex:40,
      background:"#bfd9e6",opacity:stage==="fade"?0:1,
      transition:"opacity .58s ease-out",pointerEvents:stage==="fade"?"none":"auto",
      fontFamily:"Arial,Helvetica,sans-serif",overflow:"hidden",color:"white"}}>
      {mobile!==null&&<Canvas dpr={[.85,mobile?1:1.4]}
        camera={{position:[-4,4.15,13.6],fov:49,near:.08,far:230}}
        gl={{antialias:true,alpha:false,powerPreference:"high-performance"}}
        style={{position:"absolute",inset:0,pointerEvents:"none",
          opacity:assetsReady?1:0,transition:"opacity .72s ease-out"}}>
        <WelcomeScene mobile={mobile} stage={stage} onComplete={onComplete}/>
      </Canvas>}
      {retro && <div aria-hidden="true" style={{position:"absolute",inset:0,zIndex:1,
        pointerEvents:"none",background:"repeating-linear-gradient(0deg,transparent 0px,transparent 3px,#23546833 4px)",
        opacity:.55}}/>}
      <style>{`
        @keyframes snow360GlassShift {
          0%,100% { background-position: 0% 48%; }
          50% { background-position: 100% 52%; }
        }
        @keyframes snow360LogoHover {
          0%,100% { transform: translateX(-50%) translateY(0px); }
          50% { transform: translateX(-50%) translateY(-6px); }
        }
        .snow360-start-logo { animation: snow360LogoHover 6s ease-in-out infinite; }
        .snow360-start-glass button:hover:not(:disabled) { filter: brightness(1.06); }
        .snow360-start-glass button:focus-visible { outline: 3px solid #a389ff; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .snow360-start-logo, .snow360-start-glass { animation: none !important; }
          .snow360-start-glass * { transition: none !important; }
        }
      `}</style>
      {/* Centered, aligned foreground + background logo layers. Both PNGs
          share exactly the same image frame so the fluffy border fits. */}
      <div className="snow360-start-logo" style={{
        position:"absolute",zIndex:3,pointerEvents:"none",
        left:"50%",top:mobile?"7.2%":"6.6%",
        width:mobile?"min(82vw,350px)":"min(44vw,520px)",
        aspectRatio:"2.3 / 1",transform:"translateX(-50%)",
        filter:"drop-shadow(0 9px 14px #7394bb62)",
      }}>
        <img src="/images/Snow360Logo-background.png" alt="" aria-hidden="true"
          draggable={false} decoding="async" loading="eager" style={{
            width:"100%",height:"100%",position:"absolute",inset:0,
            objectFit:"contain",userSelect:"none",
          }}/>
        <img src="/images/Snow360Logo.png" alt="SNOW//360"
          draggable={false} decoding="async" loading="eager" style={{
            width:"100%",height:"100%",position:"absolute",inset:0,
            objectFit:"contain",userSelect:"none",
          }}/>
      </div>
      {stage==="ready" ? <div className="snow360-start-glass" style={{
        position:"absolute",zIndex:5,left:"50%",bottom:mobile?"max(13px,env(safe-area-inset-bottom))":"clamp(20px,5.5vh,70px)",
        transform:"translateX(-50%)",width:mobile?"min(84vw,284px)":"min(290px,85vw)",
        boxSizing:"border-box",padding:mobile?"9px":"10px",borderRadius:22,
        background:"linear-gradient(115deg,rgba(255,236,247,.71),rgba(215,241,255,.72),rgba(236,220,255,.68),rgba(224,253,241,.72),rgba(255,237,224,.70))",
        backgroundSize:"350% 350%",animation:"snow360GlassShift 12s ease-in-out infinite",
        border:"1.6px solid rgba(255,255,255,.95)",
        boxShadow:"0 14px 36px #52779d4a,inset 0 1px 0 #ffffffcf,0 0 25px #f5d1ff55",
        backdropFilter:"blur(19px) saturate(1.48)",WebkitBackdropFilter:"blur(19px) saturate(1.48)",
        color:"#244762",textAlign:"center",maxHeight:"min(66dvh,480px)",overflowY:"auto",overscrollBehavior:"contain",
      }}>
        {/* The resting menu contains only these two controls. */}
        <div style={{display:"flex",gap:8,alignItems:"stretch"}}>
          <button type="button" onClick={play} disabled={!assetsReady}
            aria-label={assetsReady?"Play Snow360":"Loading course"}
            style={{minWidth:0,flex:1,padding:"12px 12px",borderRadius:15,
              background:"linear-gradient(125deg,#ffe9a9,#ffd4dd 47%,#cebaff 100%)",
              color:"#255273",border:"1.6px solid #fff9f0",
              boxShadow:"0 3px 0 #c8a9b8,0 5px 12px #a57d9d38",
              font:"1000 21px system-ui,sans-serif",letterSpacing:".12em",cursor:assetsReady?"pointer":"wait",
              opacity:assetsReady?1:.65,touchAction:"manipulation",
              textShadow:"0 1px 0 #ffffff9c",transition:"transform .18s ease,box-shadow .18s ease",
            }}>{assetsReady?"▶ PLAY":"LOADING…"}</button>
          <button type="button" aria-label={settingsOpen?"Close settings":"Open settings"}
            aria-expanded={settingsOpen} aria-controls="snow360-intro-settings"
            onClick={()=>setSettingsOpen(v=>!v)}
            style={{flex:"0 0 58px",width:58,minHeight:50,display:"flex",flexDirection:"column",gap:1,alignItems:"center",justifyContent:"center",cursor:"pointer",
              borderRadius:15,border:"1.6px solid #fffcff",
              color:settingsOpen?"#774a8c":"#4d6e8c",
              background:settingsOpen?"#ffe5f9d9":"#ffffff99",
              boxShadow:"0 2px 9px #7997bb31",touchAction:"manipulation",
              transition:"transform .2s ease,background .2s ease"}}>
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
              style={{transform:settingsOpen?"rotate(55deg)":"rotate(0deg)",transition:"transform .35s ease"}}>
              <path d="M12 2.7 14 3.4l.4 2.1 1.8 1 2.1-.7 1.5 1.6-.8 2 1 1.8 2.1.4.6 2.1-.6 2.1-2.1.4-1 1.8.8 2-1.5 1.6-2.1-.7-1.8 1-.4 2.1-2 .7-2-.7-.4-2.1-1.8-1-2.1.7-1.5-1.6.8-2-1-1.8-2.1-.4-.6-2.1.6-2.1 2.1-.4 1-1.8-.8-2 1.5-1.6 2.1.7 1.8-1 .4-2.1Z"/>
              <circle cx="12" cy="12" r="3.25"/>
            </svg>
            <span style={{font:"850 7px system-ui,sans-serif",letterSpacing:".045em",lineHeight:1}}>SETTINGS</span>
          </button>
        </div>
        <div id="snow360-intro-settings" inert={!settingsOpen} aria-hidden={!settingsOpen}
          style={{display:"grid",gridTemplateRows:settingsOpen?"1fr":"0fr",
            opacity:settingsOpen?1:0,transition:"grid-template-rows .32s ease,opacity .25s ease"}}>
          <div style={{minHeight:0,overflow:"hidden"}}>
            <div style={{padding:"12px 4px 4px"}}>
              <div style={{font:"1000 11px system-ui",letterSpacing:".13em",color:"#456188",marginBottom:7}}>
                SETTINGS <span aria-hidden="true">✦</span>
              </div>
              <p style={{margin:"0 0 7px",font:"850 9px system-ui",letterSpacing:".10em",color:"#5b7194"}}>
                PIDGEONKITTY PRESENTS · DOWNHILL FREESTYLE
              </p>
              <p style={{margin:"0 0 13px",font:"650 11px/1.45 system-ui",color:"#3c6080"}}>
                WAVE HELLO! PidgeonKitty is waiting at the start.
                Press PLAY to wave, walk onto the snowboard, and ride!
              </p>
              <div role="group" aria-label="Trick controls" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:9}}>
                <button type="button" aria-pressed={!trickButtons} onClick={()=>setTrickButtons(false)}
                  style={{padding:"9px 4px",borderRadius:10,font:"900 10px system-ui",cursor:"pointer",
                    border:"1px solid #fff",background:!trickButtons?"#ffe4b0":"#ffffff75",
                    color:"#32536b",boxShadow:!trickButtons?"0 2px 7px #ebcda355":"none"}}>✎ DRAW TRICKS</button>
                <button type="button" aria-pressed={trickButtons} onClick={()=>setTrickButtons(true)}
                  style={{padding:"9px 4px",borderRadius:10,font:"900 10px system-ui",cursor:"pointer",
                    border:"1px solid #fff",background:trickButtons?"#ffe4b0":"#ffffff75",
                    color:"#32536b",boxShadow:trickButtons?"0 2px 7px #ebcda355":"none"}}>▦ TRICK BUTTONS</button>
              </div>
              <div style={{display:"flex",gap:5,justifyContent:"center",flexWrap:"wrap",marginBottom:9}}>
                <WelcomeToggle label="SFX" checked={soundOn} onClick={()=>setSoundOn(v=>!v)}/>
                <WelcomeToggle label="MUSIC" checked={musicOn} onClick={()=>setMusicOn(v=>!v)}/>
                <WelcomeToggle label="N64 FILTER" checked={retro} onClick={()=>setRetro(v=>!v)}/>
              </div>
              <p style={{margin:"7px 1px 0",color:"#3e6685",font:"750 10px/1.55 system-ui"}}>
                {mobile?"LEFT: CARVE / TUCK · RIGHT: JUMP / TRICKS":"A/D: CARVE · W: TUCK · SPACE: JUMP · P: PAUSE"}
              </p>
              <p style={{margin:"6px 0 0",font:"650 10px/1.45 system-ui",color:"#587a98"}}>
                Endless downhill. Land tricks, collect tokens, and keep your score above zero!
              </p>
            </div>
          </div>
        </div>
      </div> : <div style={{position:"absolute",left:"50%",bottom:"min(12vh,110px)",transform:"translateX(-50%)",
        color:"#fff7e3",font:"1000 clamp(21px,4vw,43px) system-ui",letterSpacing:".10em",
        textShadow:"2px 3px 0 #285a7a,0 4px 15px #173e59",whiteSpace:"nowrap",pointerEvents:"none"}}>
        {stage==="intro"?"GET READY! ❄":"LET'S RIDE!"}
      </div>}
    </div>}
  </>;
}
