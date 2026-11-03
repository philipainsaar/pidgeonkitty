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
    style={{padding:"8px 10px",borderRadius:9,font:"800 11px system-ui,sans-serif",
      letterSpacing:".02em",minHeight:34,background:checked?"#ccefe7":"#24495d",
      border:`1.5px solid ${checked?"#f7fffa":"#769bae"}`,
      color:checked?"#254657":"#f2fbff",cursor:"pointer",touchAction:"manipulation"}}>
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
      <div style={{position:"absolute",left:mobile?15:30,top:mobile?20:24,
        zIndex:2,pointerEvents:"none",filter:"drop-shadow(2px 3px 1px #13425966)"}}>
        <div style={{font:"900 10px system-ui",letterSpacing:".18em",color:"#164b61"}}>PIDGEONKITTY PRESENTS</div>
        <img alt="SNOW//360" src="/images/Snow360Logo.png"
          style={{display:"block",width:mobile?"min(48vw,190px)":"min(28vw,380px)",
            maxHeight:mobile?92:170,objectFit:"contain",objectPosition:"left"}}/>
        <div style={{font:"900 9px system-ui",letterSpacing:".15em",color:"#164b61"}}>DOWNHILL FREESTYLE</div>
      </div>
      {stage==="ready" ? <div style={{position:"absolute",zIndex:5,
        bottom:mobile?"max(12px, env(safe-area-inset-bottom))":undefined,
        right:mobile?"50%":"clamp(20px,5vw,86px)",
        top:mobile?undefined:"50%",
        transform:mobile?"translateX(50%)":"translateY(-50%)",
        width:mobile?"min(94vw,430px)":"min(355px,38vw)",
        boxSizing:"border-box",background:"linear-gradient(145deg,#113b55eb,#203f65e8)",
        border:"2px solid #d7f5ff",borderRadius:18,padding:mobile?"13px 15px":"24px",
        boxShadow:"0 16px 35px #113c5966",textAlign:"center",maxHeight:mobile?"51dvh":"90dvh",
        overflowY:"auto"}}>
        <div style={{color:"#d3f7fc",font:"900 10px system-ui",letterSpacing:".22em"}}>READY FOR THE MOUNTAIN?</div>
        <div style={{font:"1000 21px system-ui",color:"#fff5d8",margin:"6px 0"}}>WAVE HELLO! 👋</div>
        <p style={{font:"600 12px/1.4 system-ui",color:"#d8effa",margin:"4px 0 12px"}}>
          PidgeonKitty is waiting at the start. Press PLAY to wave, walk onto the board, and ride!
        </p>
        <div style={{display:"flex",gap:7,justifyContent:"center",marginBottom:10}}>
          <button type="button" onClick={()=>setTrickButtons(false)} aria-pressed={!trickButtons}
            style={{flex:1,padding:"8px 6px",cursor:"pointer",font:"900 11px system-ui",borderRadius:9,
              color:!trickButtons?"#153c54":"#dff6ff",background:!trickButtons?"#ffe3a9":"#24495d",
              border:"1.5px solid #fff2d9"}}>✎ DRAW TRICKS</button>
          <button type="button" onClick={()=>setTrickButtons(true)} aria-pressed={trickButtons}
            style={{flex:1,padding:"8px 6px",cursor:"pointer",font:"900 11px system-ui",borderRadius:9,
              color:trickButtons?"#153c54":"#dff6ff",background:trickButtons?"#ffe3a9":"#24495d",
              border:"1.5px solid #fff2d9"}}>▦ TRICK BUTTONS</button>
        </div>
        <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:13,flexWrap:"wrap"}}>
          <WelcomeToggle label="SFX" checked={soundOn} onClick={()=>setSoundOn(v=>!v)}/>
          <WelcomeToggle label="MUSIC" checked={musicOn} onClick={()=>setMusicOn(v=>!v)}/>
          <WelcomeToggle label="N64 FILTER" checked={retro} onClick={()=>setRetro(v=>!v)}/>
        </div>
        <button type="button" onClick={play} disabled={!assetsReady} autoFocus
          style={{width:"100%",padding:mobile?"13px 20px":"16px 24px",borderRadius:12,
            background:"linear-gradient(180deg,#fff3b3,#f8c5a4)",color:"#243f56",
            border:"2px solid #fffce8",boxShadow:"0 5px 0 #a67a75",
            font:"1000 20px system-ui",letterSpacing:".12em",cursor:assetsReady?"pointer":"wait",
            opacity:assetsReady?1:.64,
            touchAction:"manipulation"}}>{assetsReady?"▶ PLAY":"LOADING COURSE…"}</button>
        <p style={{font:"700 10px system-ui",color:"#c2e9f4",margin:"10px 0 0"}}>
          {mobile?"CARVE • JUMP • DRAW OR TAP TRICKS":"A/D CARVE · W TUCK · SPACE JUMP · P PAUSE"}
        </p>
      </div> : <div style={{position:"absolute",left:"50%",bottom:"min(12vh,110px)",transform:"translateX(-50%)",
        color:"#fff7e3",font:"1000 clamp(21px,4vw,43px) system-ui",letterSpacing:".10em",
        textShadow:"2px 3px 0 #285a7a,0 4px 15px #173e59",whiteSpace:"nowrap",pointerEvents:"none"}}>
        {stage==="intro"?"GET READY! ❄":"LET'S RIDE!"}
      </div>}
    </div>}
  </>;
}
