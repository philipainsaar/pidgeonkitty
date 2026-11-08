"use client";

import { useEffect,useState } from "react";
import { createPortal } from "react-dom";

/**
 * Adds two real mode buttons to the original Welcome controls without
 * replacing its preloader, settings, intro, Play button or logo placement.
 * The game receives an event and reads the same session preference on mount.
 */
export default function Snow360GameModeSelector(){
  const [host,setHost]=useState(null);
  const [mode,setMode]=useState("standard");
  useEffect(()=>{
    let initial="standard";
    try{initial=sessionStorage.getItem("snow360-game-mode")==="token"?"token":"standard";}catch{}
    setMode(initial);
    document.documentElement.dataset.snow360Mode=initial;
    const sync=()=>setHost(document.querySelector(".snow360-start-floating"));
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();delete document.documentElement.dataset.snow360Mode;};
  },[]);
  const choose=next=>{
    setMode(next);
    document.documentElement.dataset.snow360Mode=next;
    try{sessionStorage.setItem("snow360-game-mode",next);}catch{}
    window.dispatchEvent(new CustomEvent("snow360-mode-change",{detail:{gameMode:next}}));
  };
  if(!host)return null;
  return createPortal(<>
    <style>{`html[data-snow360-mode="token"] .snow360-start-floating .snow360-settings-icon-btn:nth-child(-n+2){display:none!important}`}</style>
    <div aria-label="Choose Snow360 game mode" role="group" className="snow360-mode-picker"
      style={{order:-1,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,width:"100%",fontFamily:"Fredoka,system-ui,sans-serif"}}>
      {[{id:"standard",number:"1",name:"STANDARD",detail:"Tricks + Ramps"},
        {id:"token",number:"2",name:"TOKEN RUSH",detail:"Tokens + Ollie"}].map(item=>{
        const selected=mode===item.id;
        return <button key={item.id} type="button" aria-pressed={selected}
          aria-label={`Mode ${item.number}: ${item.name}${selected?", selected":""}`}
          onClick={e=>{e.stopPropagation();choose(item.id);}}
          style={{border:selected?"2px solid white":"1.5px solid #f6f6ffe8",borderRadius:15,
            minHeight:56,padding:"7px 4px",color:selected?"#334c64":"#546782",
            background:selected?"linear-gradient(115deg,#ffe3b5,#ffd5e8,#d3eaff)":"linear-gradient(120deg,#f2eff3c9,#e0ecf3cb)",
            boxShadow:selected?"0 5px 18px #385a8435,inset 0 1px 0 #fff":"0 3px 10px #385a8425",
            cursor:"pointer",touchAction:"manipulation",font:"900 11px Fredoka,system-ui,sans-serif",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
            <span style={{fontSize:13,letterSpacing:".02em",fontWeight:1000}}>{item.number} · {item.name}</span>
            <span style={{fontSize:9,opacity:.84,fontWeight:750}}>{item.detail}</span>
          </button>;
      })}
    </div>
    {mode==="token" && <div style={{order:-1,color:"#395b7b",font:"900 10px Fredoka,system-ui,sans-serif",textAlign:"center",textShadow:"0 1px 2px #fff"}}>
      COLLECT TOKENS · CARVE & OLLIE · 3 LIVES
    </div>}
  </>,host);
}
