"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import SnowboardGame from "./SnowboardGame";
import Snow64StartCeremony from "./Snow64StartCeremony";
import Snow360RiderSecret from "./Snow360RiderSecret";
import Snow360RiderBoundary from "./Snow360RiderBoundary";
import { useSnow360RiderPreference } from "./snow360RiderSettings";
import { Snow64ModelProvider } from "./snow64VisualModels";
import { unlockSnow64Audio, setSnow64AudioEnabled } from "./snow64Audio";
import { startSnow64Music } from "./snow64Music";
import { Snow64TextureProvider } from "./snow64VisualMaterials";
import Snow64IntroCourse, { introGroundY } from "./Snow64IntroCourse";
import Snow64HDRSky from "./Snow64HDRSky";

// The original gameplay scene loads behind the welcome. The intro camera and
// rider animations stay exactly as before; the visual changes are CSS only.
function WelcomeHDRSky({ mobile }) {
  const skyTime = useRef({ t: 0 });
  useFrame((_, dt) => {
    skyTime.current.t = Math.min(240, skyTime.current.t + Math.min(0.06, Math.max(0, dt)));
  });
  return <Suspense fallback={null}>
    <Snow64HDRSky stateRef={skyTime} mobile={mobile}/>
  </Suspense>;
}

function WelcomeScene({rider,onError,mobile,stage,onComplete}) {
  return <Snow64ModelProvider><Snow64TextureProvider mobile={mobile}>
    <color attach="background" args={["#bfd9e6"]}/>
    <fog attach="fog" args={["#bfd9e6",30,138]}/>
    <WelcomeHDRSky mobile={mobile}/>
    <ambientLight intensity={1.7}/>
    <hemisphereLight args={["#e6f6ff","#597988",1.3]}/>
    <directionalLight position={[-8,20,-30]} intensity={2.2} color="#fff6e9"/>
    <Suspense fallback={null}>
      <Snow64IntroCourse mobile={mobile}/>
      <Snow360RiderBoundary key={`${rider}:${mobile}`} onError={onError}>
        <Snow64StartCeremony riderId={rider} mobile={mobile}
          phase={stage === "ready" ? "ready" : "intro"}
          onComplete={onComplete} groundY={introGroundY}/>
      </Snow360RiderBoundary>
    </Suspense>
  </Snow64TextureProvider></Snow64ModelProvider>;
}

const FLOATING_PILL = {
  border:"1.5px solid rgba(255,255,255,.98)",borderRadius:999,
  color:"#375674",background:"linear-gradient(125deg,#ffefceef,#ffe3f1ec,#ddecffed)",
  font:"900 11px Fredoka,system-ui,sans-serif",cursor:"pointer",
  boxShadow:"0 5px 16px #40658d32,inset 0 1px 0 #ffffffd9",
  touchAction:"manipulation",textShadow:"0 1px 0 #ffffffa6",
};

/** Unicode-only, fully accessible pink/gray cloud settings controls. */
function WelcomeIconToggle({symbol,label,checked,onClick}) {
  return <button type="button" onClick={onClick} aria-pressed={checked}
    aria-label={`${label}: ${checked?"on":"off"}`} title={`${label}: ${checked?"ON":"OFF"}`}
    className={`snow360-settings-icon-btn ${checked?"is-on":"is-off"}`}>
    <span className="snow360-settings-icon-glyph" aria-hidden="true">{symbol}</span>
  </button>;
}

export default function Snow64Welcome(){
  const [rider,setRider]=useSnow360RiderPreference();
  const [riderStatus,setRiderStatus]=useState({ready:false,error:null});
  const [introError,setIntroError]=useState(null);
  const [stage,setStage]=useState("ready");
  const [mobile,setMobile]=useState(null);
  const [trickButtons,setTrickButtons]=useState(false);
  const [soundOn,setSoundOn]=useState(true);
  const [musicOn,setMusicOn]=useState(true);
  const [retro,setRetro]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [assetsReady,setAssetsReady]=useState(false);
  const {active:loadingActive,progress:loadingProgress,total:loadTotal}=useProgress();
  const committed=useRef(false);
  const canPlay=assetsReady && riderStatus.ready && !introError;
  useEffect(()=>{setAssetsReady(false);setIntroError(null);},[rider,mobile]);
  const onComplete=useCallback(()=>setStage(s=>s==="intro"?"handoff":s),[]);

  // Do not enable PLAY until the fully mounted original game is actually ready.
  useEffect(()=>{
    if(stage!=="ready"||assetsReady||!riderStatus.ready||introError)return;
    const check=()=>{
      const gameCanvas=document.querySelector("main canvas");
      const readyMenu=document.querySelector('[data-snow64-settings="true"]');
      const noLoadingText=!(document.querySelector("main")?.textContent||"").includes("LOADING RIDER");
      if(gameCanvas&&readyMenu&&!loadingActive&&noLoadingText&&loadingProgress>=99.5&&loadTotal>0)
        setAssetsReady(true);
    };
    check();
    const poll=setInterval(check,160);
    return()=>clearInterval(poll);
  },[stage,assetsReady,loadingActive,loadingProgress,loadTotal,riderStatus.ready,introError]);

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
    if(stage!=="ready"||!canPlay)return;
    setSnow64AudioEnabled(soundOn);
    if(soundOn)unlockSnow64Audio();
    if(musicOn)void startSnow64Music();
    setStage("intro");
  },[stage,soundOn,musicOn,canPlay]);

  useEffect(()=>{
    if(stage!=="ready")return;
    const down=e=>{
      if(e.target?.closest?.("button"))return;
      if(e.code==="Space"||e.key==="Enter"){
        e.preventDefault();play();
      }
    };
    window.addEventListener("keydown",down);
    return()=>window.removeEventListener("keydown",down);
  },[stage,play]);

  // Preserve the existing seamless preloaded-game handoff and all input options.
  useEffect(()=>{
    if(stage!=="handoff"||committed.current)return;
    committed.current=true;
    let disposed=false,raf=0,attempts=0;
    const begin=()=>{
      if(disposed)return;
      const settings=document.querySelector('[data-snow64-settings="true"]');
      const reactiveButton=document.querySelector('[data-snow64-reactive-music="true"] button');
      if((!settings||(!musicOn&&!reactiveButton))&&attempts++<65){
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
      raf=requestAnimationFrame(()=>{
        raf=requestAnimationFrame(()=>{
          if(disposed)return;
          window.dispatchEvent(new KeyboardEvent("keydown",{
            key:"Enter",code:"Enter",bubbles:true,cancelable:true,
          }));
          let checks=0;
          const finish=()=>{
            if(disposed)return;
            const stillReady=!!document.querySelector('[data-snow64-settings="true"]');
            if(stillReady&&checks++<120){raf=requestAnimationFrame(finish);return;}
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
    <SnowboardGame renderActive={stage!=="ready"&&stage!=="intro"}
      rider={rider} onRiderChange={setRider} onRiderStatus={setRiderStatus}/>
    {stage!=="done"&&<style>{`
      main > div:has([data-snow64-settings="true"]) {visibility:hidden!important;pointer-events:none!important;}
      main > div:has(.snow64-hud) {visibility:hidden!important;pointer-events:none!important;}
    `}</style>}
    {stage!=="done"&&<div style={{position:"fixed",inset:0,zIndex:40,
      background:"#bfd9e6",opacity:stage==="fade"?0:1,
      transition:"opacity .58s ease-out",pointerEvents:stage==="fade"?"none":"auto",
      fontFamily:"Fredoka,system-ui,sans-serif",overflow:"hidden",color:"white"}}>
      {mobile!==null&&<Canvas dpr={[.85,mobile?1:1.4]}
        camera={{position:[-4,4.15,13.6],fov:49,near:.08,far:230}}
        gl={{antialias:true,alpha:false,powerPreference:"high-performance"}}
        style={{position:"absolute",inset:0,pointerEvents:"none",
          opacity:assetsReady?1:0,transition:"opacity .72s ease-out"}}>
        <WelcomeScene rider={rider} onError={setIntroError} mobile={mobile}
          stage={stage} onComplete={onComplete}/>
      </Canvas>}
      {retro&&<div aria-hidden="true" style={{position:"absolute",inset:0,zIndex:1,
        pointerEvents:"none",background:"repeating-linear-gradient(0deg,transparent 0px,transparent 3px,#23546833 4px)",
        opacity:.55}}/>}
      <style>{`
        @keyframes snow360LogoHover {0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-5px)}}
        .snow360-start-logo {animation:snow360LogoHover 6s ease-in-out infinite;}
        .snow360-start-floating button:hover:not(:disabled) {filter:brightness(1.045);}
        .snow360-start-floating button:focus-visible {outline:3px solid #a389ff;outline-offset:3px;}
        .snow360-start-floating button:active:not(:disabled) {transform:scale(.97);}
        @media(prefers-reduced-motion:reduce){.snow360-start-logo{animation:none!important;}}
      `}</style>

      {/* Keep both original layered PNG logos, without a shadow or surrounding box. */}
      <div className="snow360-start-logo" style={{position:"absolute",zIndex:3,pointerEvents:"none",
        left:"50%",top:mobile?"7.2%":"6.6%",
        width:mobile?"min(82vw,350px)":"min(44vw,520px)",
        aspectRatio:"2.3 / 1",transform:"translateX(-50%)"}}>
        <img src="/images/Snow360Logo-background.png" alt="" aria-hidden="true"
          draggable={false} decoding="async" loading="eager"
          style={{width:"100%",height:"100%",position:"absolute",inset:0,
            objectFit:"contain",userSelect:"none"}}/>
        <img src="/images/Snow360Logo.png" alt="SNOW//360"
          draggable={false} decoding="async" loading="eager"
          style={{width:"100%",height:"100%",position:"absolute",inset:0,
            objectFit:"contain",userSelect:"none"}}/>
      </div>

      {stage==="ready" ? <div className="snow360-start-floating"
        onClickCapture={e=>{
          // Keep desktop keyboard shortcuts available after selecting a mode:
          // pointer-activated buttons must not retain keyboard focus.
          // Keyboard/Tab activation (detail 0) keeps normal accessible focus.
          if(e.detail>0) e.target?.closest?.("button")?.blur();
        }}
        style={{
        position:"absolute",zIndex:5,left:"50%",
        bottom:mobile?"max(15px,env(safe-area-inset-bottom))":"clamp(18px,4.7vh,65px)",
        transform:"translateX(-50%)",width:mobile?"min(83vw,330px)":"min(320px,88vw)",
        display:"flex",flexDirection:"column",gap:11,alignItems:"stretch",
        boxSizing:"border-box",textAlign:"center",color:"#355676"}}>

        {/* Settings expand UPWARDS from the controls. Each option floats alone.
            There is deliberately NO glass menu window behind any of them. */}
        <div id="snow360-intro-settings" className="snow360-settings-stack" inert={!settingsOpen} aria-hidden={!settingsOpen}
          style={{display:settingsOpen?"flex":"none",flexDirection:"column",gap:9,
            maxHeight:mobile?"min(49dvh,360px)":"min(50dvh,380px)",
            overflowY:"auto",scrollbarWidth:"thin",padding:"2px 5px 6px"}}>
          {/* Every option is a circular Unicode-only cloud. The selected
              trick-control mode is pink; unselected and OFF toggles are gray. */}
          <div className="snow360-settings-icon-grid" role="group" aria-label="Welcome settings">
            <WelcomeIconToggle symbol="✎" label="Draw tricks"
              checked={!trickButtons} onClick={()=>setTrickButtons(false)}/>
            <WelcomeIconToggle symbol="▦" label="Trick buttons"
              checked={trickButtons} onClick={()=>setTrickButtons(true)}/>
            <WelcomeIconToggle symbol="⌁" label="Sound effects"
              checked={soundOn} onClick={()=>setSoundOn(v=>!v)}/>
            <WelcomeIconToggle symbol="♫" label="Music"
              checked={musicOn} onClick={()=>setMusicOn(v=>!v)}/>
            <WelcomeIconToggle symbol="▧" label="N64 filter"
              checked={retro} onClick={()=>setRetro(v=>!v)}/>
          </div>
          <Snow360RiderSecret rider={rider} onChange={setRider} tone="light"/>
        </div>

        {(riderStatus.error||introError)&&<p role="alert" style={{margin:0,
          color:"#953b58",font:"800 12px Fredoka,system-ui,sans-serif",
          textShadow:"0 1px 3px #ffffff"}}>
          Rider could not load. <button type="button" onClick={()=>window.location.reload()}
          style={{...FLOATING_PILL,padding:"5px 11px"}}>Retry</button>
        </p>}

        <div className="snow360-start-actions" style={{display:"flex",gap:9,alignItems:"stretch"}}>
          <button type="button" onClick={play} disabled={!canPlay}
            aria-label={canPlay?"Play Snow360":"Loading course"}
            style={{...FLOATING_PILL,minWidth:0,flex:1,minHeight:55,padding:"12px 15px",
              color:"#354969",background:"linear-gradient(115deg,#ffe3af,#ffd2df 50%,#c8dfff)",
              font:"1000 21px Fredoka,system-ui,sans-serif",letterSpacing:".075em",
              border:"2px solid #ffffff",borderRadius:999,
              boxShadow:"0 7px 22px #365e8935,inset 0 2px 0 #ffffff91",
              cursor:canPlay?"pointer":"wait",opacity:canPlay?1:.72}}>
            {canPlay?"PLAY":"LOADING…"}
          </button>
          <button type="button" aria-label={settingsOpen?"Close settings":"Open settings"}
            aria-expanded={settingsOpen} aria-controls="snow360-intro-settings"
            onClick={()=>setSettingsOpen(v=>!v)}
            style={{...FLOATING_PILL,flex:"0 0 55px",width:55,height:55,padding:0,
              borderRadius:999,background:settingsOpen
                ? "linear-gradient(125deg,#ffe4b3,#f7c9e7 57%,#d6d3ff)"
                : "linear-gradient(125deg,#fce7f6,#e9dfff 57%,#ceeaff)",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,
              fontFamily:'Arial, "Segoe UI Symbol", sans-serif',fontSize:35,
              fontWeight:400,lineHeight:1,color:"#fffaff"}}>
            ❄
          </button>
        </div>
      </div> : <div style={{position:"absolute",left:"50%",bottom:"min(12vh,110px)",
        transform:"translateX(-50%)",color:"#fff7e3",
        font:"1000 clamp(21px,4vw,43px) Fredoka,system-ui,sans-serif",letterSpacing:".10em",
        textShadow:"2px 3px 0 #285a7a,0 4px 15px #173e59",
        whiteSpace:"nowrap",pointerEvents:"none"}}>
        {stage==="intro"?"GET READY! ❄":"LET'S RIDE!"}
      </div>}
    </div>}
  </>;
}
