"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Snow360Logo } from "./SnowboardGame";

/**
 * Uses the exact same alpha-trimmed logo renderer as the gameplay HUD.
 * Portaling inside the existing welcome logo element guarantees the logo
 * follows the welcome screen's visibility and fade, rather than floating
 * above the game after the transition finishes.
 */
export default function Snow360WelcomeBrandLogo() {
  const [host,setHost]=useState(null);
  const [mobile,setMobile]=useState(false);
  useEffect(()=>{
    const media=window.matchMedia("(max-width: 720px), (pointer: coarse)");
    const update=()=>setMobile(media.matches);
    update();media.addEventListener?.("change",update);
    return()=>media.removeEventListener?.("change",update);
  },[]);
  useEffect(()=>{
    const find=()=>{
      const node=document.querySelector(".snow360-start-logo");
      if(node){setHost(node);return true;}
      return false;
    };
    if(find())return;
    const observer=new MutationObserver(()=>{if(find())observer.disconnect();});
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);
  return host ? createPortal(<Snow360Logo mobile={mobile}/>,host) : null;
}
