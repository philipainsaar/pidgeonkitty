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
  mobileSprinkles: 105, // Existing Scene 2 rods stay untouched; Scene 1 uses 170 balanced rods.
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

/**
 * Mobile WebGL-safe sprinkles: pure DOM/CSS compositor animation.
 * The previous mobile path created a second continuously-redrawn 2D canvas
 * directly above the active WebGL game. Some mobile GPU/viewport combinations
 * failed to composite that transparent canvas consistently. CSS rods do not
 * allocate a second drawing context and are visible immediately at pickup.
 */
function sprinkleRandom(seed) {
  let n=seed>>>0;
  return ()=>{
    n=(Math.imul(n,1664525)+1013904223)>>>0;
    return n/4294967296;
  };
}
const MOBILE_RODS=(()=>{
  const random=sprinkleRandom(3608678);
  const rods=[];
  for(let i=0;i<SNOW360_CANDY_WORLD.mobileSprinkles;i++){
    const startX=-12+random()*122;
    const startY=-52+random()*153;
    const toX=(random()-.5)*90;
    const toY=104+random()*118;
    const duration=1.95+random()*2.25;
    const initialAngle=Math.round(random()*360);
    const rotation=(random()<.5?-1:1)*(260+Math.round(random()*570));
    rods.push({
      id:i,x:startX,y:startY,dx:toX,dy:toY,
      length:15+random()*14,thickness:5.4+random()*3.5,
      angle:initialAngle,endAngle:initialAngle+rotation,
      duration,delay:-random()*duration,
      color:COLORS[i%COLORS.length],
    });
  }
  return rods;
})();
export function MobileCandySprinkles({speed=0}) {
  const holder=useRef(null);
  const lastRate=useRef(0);
  // CSS animation playbackRate varies with the real snowboard speed without
  // repainting/recreating every particle on HUD state updates.
  useEffect(()=>{
    const target=clamp(.8+speed/75,.8,2.3);
    if(Math.abs(target-lastRate.current)<.085)return;
    lastRate.current=target;
    const parent=holder.current;
    if(!parent)return;
    for(const child of parent.children){
      for(const animation of child.getAnimations?.()||[]){
        try{animation.playbackRate=target;}catch{}
      }
    }
  },[speed]);
  return <div ref={holder} className="snow360-mobile-candy-rods" aria-hidden="true"
    style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:1,
      width:"100%",height:"100%",opacity:1,visibility:"visible"}}>
    {MOBILE_RODS.map(p=><span key={p.id} className="snow360-mobile-candy-rod"
      style={{position:"absolute",left:`${p.x}%`,top:`${p.y}%`,
        width:`${p.length}px`,height:`${p.thickness}px`,borderRadius:999,
        backgroundColor:p.color,opacity:1,backfaceVisibility:"hidden",
        animation:`snow360MobileCandyFly ${p.duration}s linear ${p.delay}s infinite`,
        '--dx':`${p.dx}vw`,'--dy':`${p.dy}vh`,
        '--angle0':`${p.angle}deg`,'--angle1':`${p.endAngle}deg`}}/>) }
    <style>{`
      @keyframes snow360MobileCandyFly {
        from {transform:translate3d(0,0,0) rotate(var(--angle0));}
        to {transform:translate3d(var(--dx),var(--dy),0) rotate(var(--angle1));}
      }
      @media(prefers-reduced-motion:reduce){
        .snow360-mobile-candy-rod{animation-duration:9s!important;}
      }
    `}</style>
  </div>;
}

/**
 * Scene 1 mobile density repair. Scene 2 intentionally keeps using the
 * ORIGINAL exported MobileCandySprinkles above, which is already correct.
 *
 * The older mobile rods picked start points as far as 52% of the viewport
 * ABOVE the screen and then traveled up to 222vh. Consequently only a small,
 * unpredictable fraction were actually visible at once. For Scene 1 we
 * evenly stagger 170 individual opaque rods across a shorter, fully visible
 * top-to-bottom flight corridor. Their *physical length* is unchanged:
 * 15–29px, with the same rounded 5.4–8.9px candy thickness as Scene 2.
 * This is CSS-only: no new transparent Canvas or WebGL compositor layer.
 */
const SCENE1_MOBILE_ROD_COUNT = 170;
const SCENE1_MOBILE_RODS=(()=>{
  const random=sprinkleRandom(3611299);
  const rods=[];
  for(let i=0;i<SCENE1_MOBILE_ROD_COUNT;i++){
    // Low-discrepancy placement fills every part of portrait and landscape
    // screens instead of leaving a large empty band around the rider.
    const fx=((i+.5)*.6180339887498949+random()*.035)%1;
    const phase=((i+.5)*.7548776662466927+random()*.025)%1;
    const duration=2.35+random()*1.65;
    const angle=Math.round(random()*360);
    rods.push({
      id:i,
      x:8+fx*84,
      dx:(random()-.5)*17,
      length:15+random()*14,
      thickness:5.4+random()*3.5,
      angle,endAngle:angle+(random()<.5?-1:1)*(230+random()*560),
      duration,delay:-phase*duration,
      color:COLORS[i%COLORS.length],
    });
  }
  return rods;
})();
function Scene1MobileCandySprinkles({speed=0}) {
  const holder=useRef(null);
  const lastRate=useRef(0);
  // CSS animation playback rate follows the same speed curve as the working
  // Scene 2 renderer. No state-driven recreation of 170 DOM nodes per frame.
  useEffect(()=>{
    const rate=clamp(.8+speed/75,.8,2.3);
    if(Math.abs(rate-lastRate.current)<.085)return;
    lastRate.current=rate;
    const holderEl=holder.current;
    if(!holderEl)return;
    for(const child of holderEl.children){
      for(const animation of child.getAnimations?.()||[]){
        try{animation.playbackRate=rate;}catch{}
      }
    }
  },[speed]);
  return <div ref={holder} aria-hidden="true" data-snow360-scene1-full-sprinkles="true"
    style={{position:"absolute",inset:0,zIndex:4,overflow:"hidden",pointerEvents:"none",
      width:"100%",height:"100%",opacity:1,visibility:"visible"}}>
    {SCENE1_MOBILE_RODS.map(p=><span key={p.id}
      className="snow360-scene1-mobile-candy-rod"
      style={{position:"absolute",left:`${p.x}%`,top:"-18vh",
        width:`${p.length}px`,height:`${p.thickness}px`,borderRadius:999,
        backgroundColor:p.color,opacity:1,backfaceVisibility:"hidden",
        animation:`snow360Scene1FullCandyFly ${p.duration.toFixed(3)}s linear ${p.delay.toFixed(3)}s infinite`,
        '--s1-dx':`${p.dx}vw`,'--s1-a0':`${p.angle}deg`,
        '--s1-a1':`${p.endAngle}deg`}}/>) }
    <style>{`
      @keyframes snow360Scene1FullCandyFly {
        from {transform:translate3d(0,0,0) rotate(var(--s1-a0));}
        to {transform:translate3d(var(--s1-dx),136vh,0) rotate(var(--s1-a1));}
      }
      @media(prefers-reduced-motion:reduce){
        .snow360-scene1-mobile-candy-rod{animation-duration:9s!important;}
      }
    `}</style>
  </div>;
}

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
    data-snow360-mobile-renderer={mobile?"css":"canvas"}
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
    {mobile ? (sprinklesOnly
      ? <MobileCandySprinkles speed={speed}/>
      : <Scene1MobileCandySprinkles speed={speed}/>
    ) : <canvas ref={canvasRef}
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
