"use client";

import { useEffect, useRef } from "react";

/**
 * Snow360 Ice-cream Power: Candy World visual layer.
 * The whole scene is a single, transparent 2D canvas over the 3D course.
 * - No GLBs, texture downloads, new WebGL context, or audio nodes.
 * - Only mounted during Ice-cream Power; never changes physics or the camera.
 * - Sprinkles are fully opaque, thick and long; there are no floating dessert shapes.
 * - Sprinkle density scales down on mobile and reduced-motion devices.
 * - The game's HUD and logo have a higher stacking level and stay untouched.
 */
export const SNOW360_CANDY_WORLD = {
  desktopSprinkles: 190,
  mobileSprinkles: 105, // Same density, now world-space 3D on mobile.
  desktopFps: 60,
  mobileFps: 35,
};

const COLORS = ["#ff87bf", "#ffdf82", "#7ee4c2", "#7bcfff", "#b999ff", "#fff9fc", "#ff9bd3"];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function newSprinkle(w, h, burst=false) {
  const depth=rand(.38,1.5);
  const theta=rand(0,Math.PI*2);
  const originX=burst ? w*.5+rand(-25,25) : rand(-w*.2,w*1.2);
  const originY=burst ? h*.52+rand(-25,25) : rand(-h*.2,h*1.2);
  return {
    x:originX, y:originY, depth, theta,
    vx:burst?Math.cos(theta)*rand(110,300):rand(-60,60),
    vy:burst?Math.sin(theta)*rand(100,250):rand(12,65),
    spin:rand(-5.5,5.5), angle:rand(0,Math.PI*2),
    width:rand(4.0,6.8)*depth,length:rand(6,15)*depth,
    color:pick(COLORS), glow:Math.random()>.89,
  };
}
function renderFrame(ctx,w,h,sprinkles,dt,speed,reduceMotion,mobile) {
  ctx.clearRect(0,0,w,h);
  const pace=reduceMotion?.23:clamp(.62+speed/52,.62,2.3);
  const centerX=w*.5,centerY=h*.50;

  // During the first moments of a pickup the sprinkles explode from center,
  // then continue flowing outwards as the game accelerates.
  for(let i=0;i<sprinkles.length;i++){
    let p=sprinkles[i];
    p.x+=(p.vx+(p.x-centerX)*.14)*pace*dt;
    p.y+=(p.vy+(p.y-centerY)*.12)*pace*dt;
    p.angle+=p.spin*dt;
    if(p.x < -40 || p.x>w+40 || p.y < -50 || p.y>h+50) {
      sprinkles[i]=p=newSprinkle(w,h,false);
      // Keep new particles near the far edges to mimic oncoming candy.
      if(Math.random()<.45){p.x=Math.random()<.5 ? rand(0,w*.16):rand(w*.84,w);p.y=rand(-20,h*.86);}
    }
    // Solid, thick candy rods with the original length range (6–15, times depth).
    // No distance fading: they stay visible over snow and pastel skies.
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.globalAlpha=1;
    // Maintain the ORIGINAL 6–15-unit rod lengths. Small-screen rods get
    // a minimum 4.2 CSS-pixel thickness so they remain visible over bright sky.
    ctx.lineWidth=mobile?Math.max(4.2,p.width):p.width;ctx.lineCap="round";
    ctx.strokeStyle=p.color;
    ctx.beginPath();ctx.moveTo(-p.length*.5,0);ctx.lineTo(p.length*.5,0);ctx.stroke();
    if(p.glow) {
      // Opaque white candy shine, not a semitransparent particle layer.
      ctx.fillStyle="#ffffff";
      ctx.beginPath();ctx.arc(0,0,Math.min(2.7,p.width*.43),0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
}

/** On mobile, sprinkles now exist as real 3D meshes on the snowboard.
 * This component keeps Scene 1's atmosphere/title and the original desktop Canvas.
 * No CSS sprinkle overlay is drawn on mobile. */

export default function Snow360IcecreamPowerScene({remaining=0,mobile=false,speed=0,trick="",sprinklesOnly=false}) {
  const canvasRef=useRef(null);
  const gameRef=useRef({speed,remaining});
  const trickRef=useRef("");
  const burstCount=useRef(0);
  gameRef.current={speed,remaining};

  useEffect(()=>{
    if(trick && trick!==trickRef.current){
      burstCount.current++;
      trickRef.current=trick;
    }else if(!trick){trickRef.current="";}
  },[trick]);

  useEffect(()=>{
    // On phones the opaque sprinkle rods are animated by CSS instead.
    // This avoids the failing dual-canvas composition and canvas-size races.
    if(mobile)return;
    const canvas=canvasRef.current;
    if(!canvas)return;
    const ctx=canvas.getContext("2d",{alpha:true,desynchronized:true});
    if(!ctx)return;
    const motion=window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduceMotion=Boolean(motion?.matches);
    let w=0,h=0,last=0,lastDraw=0,raf=0,seenBurst=0,dprUsed=0;
    let sprinkles=[];
    const resize=()=>{
      // A newly mounted absolutely positioned Canvas can briefly report 0x0
      // on mobile Safari. Use its parent/viewport until layout catches up.
      // ResizeObserver then applies the true dimensions on first layout.
      const rect=canvas.getBoundingClientRect();
      const parentRect=canvas.parentElement?.getBoundingClientRect();
      const nextW=Math.max(1,Math.round(rect.width>2?rect.width:parentRect?.width>2?parentRect.width:window.innerWidth));
      const nextH=Math.max(1,Math.round(rect.height>2?rect.height:parentRect?.height>2?parentRect.height:window.innerHeight));
      const dpr=Math.min(window.devicePixelRatio||1,mobile?1.15:1.5);
      if(w===nextW && h===nextH && dprUsed===dpr)return;
      w=nextW;h=nextH;dprUsed=dpr;
      canvas.width=Math.max(1,Math.round(w*dpr));
      canvas.height=Math.max(1,Math.round(h*dpr));
      ctx.setTransform(dpr,0,0,dpr,0,0);
      sprinkles=Array.from({length:reduceMotion?22:mobile?SNOW360_CANDY_WORLD.mobileSprinkles:SNOW360_CANDY_WORLD.desktopSprinkles},
        (_,i)=>newSprinkle(w,h,i<32));
    };
    resize();
    const sizeObserver=typeof ResizeObserver!=="undefined"?new ResizeObserver(resize):null;
    sizeObserver?.observe(canvas);
    window.addEventListener("resize",resize,{passive:true});
    window.visualViewport?.addEventListener("resize",resize,{passive:true});
    const tick=(now)=>{
      raf=window.requestAnimationFrame(tick);
      const fps=reduceMotion?18:mobile?SNOW360_CANDY_WORLD.mobileFps:SNOW360_CANDY_WORLD.desktopFps;
      if(now-lastDraw<1000/fps)return;
      const dt=last?clamp((now-last)/1000,0,.05):1/fps;
      last=now;lastDraw=now;
      const current=gameRef.current;
      if(burstCount.current!==seenBurst){
        seenBurst=burstCount.current;
        // A second burst around the middle for each new automatic trick.
        for(let i=0;i<Math.min(sprinkles.length,45);i++) sprinkles[i]=newSprinkle(w,h,true);
      }
      renderFrame(ctx,w,h,sprinkles,dt,current.speed,reduceMotion,mobile);
    };
    raf=window.requestAnimationFrame(tick);
    return()=>{
      window.cancelAnimationFrame(raf);
      sizeObserver?.disconnect();
      window.removeEventListener("resize",resize);
      window.visualViewport?.removeEventListener("resize",resize);
    };
  },[mobile]);

  if(remaining<=0)return null;
  const backgroundFade=clamp(remaining/.7,0,1);
  // A single stable root handles BOTH scene modes. Never switch the actual
  // canvas element while the drawing effect is attached to it.
  return <div aria-hidden="true"
    data-snow360-sprinkles={sprinklesOnly?"sky":"candy"}
    data-snow360-mobile-renderer={mobile?"world-3d":"canvas"}
    className="snow360-candy-world"
    style={{position:"absolute",inset:0,zIndex:1,overflow:"hidden",pointerEvents:"none",
      background:"transparent",opacity:1,isolation:"isolate",width:"100%",height:"100%"}}>
    {!sprinklesOnly&&<>
      {/* Scene 1: same soft background treatment; Scene 2 stays untouched. */}
      <div style={{position:"absolute",inset:0,opacity:backgroundFade,
        background:"radial-gradient(ellipse at 50% 49%,transparent 17%,rgba(255,216,237,.08) 46%,rgba(244,190,250,.20) 77%,rgba(177,241,248,.25) 100%)"}}/>
      <div style={{position:"absolute",inset:0,opacity:.52*backgroundFade,
        background:"linear-gradient(125deg,rgba(251,190,225,.12),transparent 37%,transparent 65%,rgba(255,232,174,.14))"}}/>
    </>}
    {!mobile && <canvas ref={canvasRef}
      style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}/>}
    {!sprinklesOnly&&remaining>7.6&&<div className="snow360-candy-title"
      style={{position:"absolute",top:"34%",left:"50%",transform:"translateX(-50%)",
        whiteSpace:"nowrap",maxWidth:"95vw",color:"#fff4ff",
        font:"1000 clamp(18px,4vw,32px) Fredoka,system-ui,sans-serif",letterSpacing:".07em",
        textShadow:"0 0 18px #f49ccd,1px 2px #a367a1",textAlign:"center"}}>
      ✦ ICE-CREAM POWER ✦
    </div>}
    <style>{`
      @keyframes snow360CandyTitle {from{opacity:0;transform:translate(-50%,15px) scale(.76)}25%{opacity:1;transform:translate(-50%,0) scale(1.08)}70%{opacity:1}to{opacity:0;transform:translate(-50%,-9px) scale(1)}}
      .snow360-candy-title{animation:snow360CandyTitle 1.55s ease both}
      @media(prefers-reduced-motion:reduce){.snow360-candy-title{animation:none!important}}
    `}</style>
  </div>;
}
