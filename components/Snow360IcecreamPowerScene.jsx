"use client";

import { useEffect, useRef } from "react";

/**
 * Snow360 Ice-cream Power: Candy World visual layer.
 * The whole scene is a single, transparent 2D canvas over the 3D course.
 * - No GLBs, texture downloads, new WebGL context, or audio nodes.
 * - Only mounted during Ice-cream Power; never changes physics or the camera.
 * - Sprinkles and dessert shapes scale down on mobile and reduced-motion devices.
 * - The game's HUD and logo have a higher stacking level and stay untouched.
 */
export const SNOW360_CANDY_WORLD = {
  desktopSprinkles: 190,
  mobileSprinkles: 75,
  desktopDesserts: 15,
  mobileDesserts: 6,
  desktopFps: 60,
  mobileFps: 35,
};

const COLORS = ["#ffc4df", "#fff0ac", "#aef0da", "#b9e9ff", "#dccaff", "#ffffff", "#f7a8d2"];
const TYPES = ["scoop", "wafer", "cherry", "whip", "star"];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Draw five cute, low-cost dessert icons once. During animation these are
// drawn using a cached canvas atlas instead of rebuilding geometry every frame.
function drawDessertAtlas() {
  const size = 96;
  const atlas = document.createElement("canvas");
  atlas.width = TYPES.length * size;
  atlas.height = size;
  const ctx = atlas.getContext("2d");
  if (!ctx) return null;

  for (let i = 0; i < TYPES.length; i++) {
    ctx.save();
    ctx.translate(i * size + 48, 48);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,.88)";
    if (i === 0) { // strawberry scoop with creamy ridges
      ctx.fillStyle = "#ffb6d9";
      ctx.beginPath();
      ctx.arc(0, 1, 29, Math.PI, 0);
      ctx.bezierCurveTo(31, 25, 21, 29, 12, 25);
      ctx.quadraticCurveTo(3, 33, -7, 25);
      ctx.quadraticCurveTo(-30, 31, -30, 8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#ffeaf3"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(-7, -2, 13, .3, 4.7); ctx.stroke();
      ctx.beginPath(); ctx.arc(12, 6, 6, 3.2, 6); ctx.stroke();
      ctx.fillStyle = "#fff6cc";
      for (const [x,y] of [[-17,12],[2,-18],[17,13]]) {ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();}
    } else if (i === 1) { // waffle wafer, buttery rounded edges
      ctx.rotate(-.40);
      ctx.fillStyle = "#ffe0a9";
      ctx.beginPath(); ctx.roundRect(-18,-34,36,68,10); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#df9e82"; ctx.lineWidth = 2;ctx.globalAlpha=.7;
      for(let a=-11;a<=13;a+=12){ctx.beginPath();ctx.moveTo(a,-28);ctx.lineTo(a,29);ctx.stroke();}
      for(let a=-20;a<=22;a+=12){ctx.beginPath();ctx.moveTo(-14,a);ctx.lineTo(14,a);ctx.stroke();}
    } else if (i === 2) { // cherry with bent leaf and stem
      ctx.strokeStyle="#74bd95";ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(2,-12);ctx.quadraticCurveTo(-8,-35,9,-40);ctx.stroke();
      ctx.fillStyle="#b4e5a7";ctx.beginPath();ctx.ellipse(12,-35,12,5,-.46,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#ff8dab";ctx.strokeStyle="#fff1f0";ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(0,9,25,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle="#fff9fa";ctx.beginPath();ctx.ellipse(-10,-1,8,5,-.8,0,Math.PI*2);ctx.fill();
    } else if (i === 3) { // whipped cream swirl
      ctx.fillStyle="#fff9ee";
      for(const [x,y,r] of [[-18,15,15],[0,18,19],[19,15,15],[-7,0,15],[10,1,14],[2,-17,13]]){
        ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
      }
      ctx.fillStyle="#ffd7ea";ctx.beginPath();ctx.ellipse(-4,-21,9,4,-.3,0,Math.PI*2);ctx.fill();
    } else { // edible candy star
      ctx.fillStyle="#ffe9a6";
      ctx.beginPath();
      for(let t=0;t<10;t++){
        const ang=-Math.PI/2+t*Math.PI/5;
        const r=t%2?13:31;
        if(t===0)ctx.moveTo(Math.cos(ang)*r,Math.sin(ang)*r);
        else ctx.lineTo(Math.cos(ang)*r,Math.sin(ang)*r);
      }
      ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle="#fffef7";ctx.beginPath();ctx.arc(-7,-8,4,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  return atlas;
}

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
    width:rand(2.4,4.4)*depth,length:rand(6,15)*depth,
    color:pick(COLORS), glow:Math.random()>.89,
  };
}
function newDessert(w,h,initial=false) {
  const side=Math.random()<.5?-1:1;
  return {
    x:initial?rand(0,w):side<0 ? -90 : w+90,
    y:rand(-h*.1,h*1.12), side,
    vx:-side*rand(15,48), vy:rand(11,29),
    scale:rand(.36,.87), angle:rand(-Math.PI,Math.PI),
    spin:rand(-.65,.65), kind:Math.floor(rand(0,TYPES.length)),
    alpha:rand(.43,.85),
  };
}

function renderFrame(ctx,w,h,sprinkles,desserts,atlas,dt,speed,elapsed,reduceMotion,burst) {
  ctx.clearRect(0,0,w,h);
  const pace=reduceMotion?.23:clamp(.62+speed/52,.62,2.3);
  const centerX=w*.5,centerY=h*.50;

  // Cream swirls / cherries / candy stars pass along the edges of the view.
  for(const d of desserts) {
    d.x+=d.vx*pace*dt;
    d.y+=d.vy*pace*dt;
    d.angle+=d.spin*dt;
    if(d.x < -135 || d.x>w+135 || d.y>h+135){Object.assign(d,newDessert(w,h));}
    const edge=clamp(Math.abs(d.x-centerX)/(w*.37),.12,1);
    const drawSize=(Math.min(w,h)<500?62:83)*d.scale;
    ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.angle);
    ctx.globalAlpha=d.alpha*edge;
    if(atlas)ctx.drawImage(atlas,d.kind*96,0,96,96,-drawSize/2,-drawSize/2,drawSize,drawSize);
    ctx.restore();
  }

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
    const edge=clamp(Math.abs(p.x-centerX)/(w*.35),.23,1);
    const isBurst=burst && elapsed < .9;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.globalAlpha=Math.min(1,(isBurst?.94:.83)*edge);
    ctx.lineWidth=p.width;ctx.lineCap="round";
    ctx.strokeStyle=p.color;
    ctx.beginPath();ctx.moveTo(-p.length*.5,0);ctx.lineTo(p.length*.5,0);ctx.stroke();
    if(p.glow) {
      ctx.fillStyle="#ffffff";
      ctx.globalAlpha*=.72;
      ctx.beginPath();ctx.arc(0,0,Math.min(2.7,p.width*.43),0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
}

export default function Snow360IcecreamPowerScene({remaining=0,mobile=false,speed=0,trick=""}) {
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
    const canvas=canvasRef.current;
    if(!canvas)return;
    const ctx=canvas.getContext("2d",{alpha:true,desynchronized:true});
    if(!ctx)return;
    const motion=window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduceMotion=Boolean(motion?.matches);
    const atlas=drawDessertAtlas();
    let w=0,h=0,last=0,lastDraw=0,raf=0,frame=0,seenBurst=0;
    const origin=performance.now();
    let sprinkles=[],desserts=[];
    const resize=()=>{
      const rect=canvas.getBoundingClientRect();
      w=Math.max(1,Math.round(rect.width));h=Math.max(1,Math.round(rect.height));
      const dpr=Math.min(window.devicePixelRatio||1,mobile?1.15:1.5);
      canvas.width=Math.max(1,Math.round(w*dpr));
      canvas.height=Math.max(1,Math.round(h*dpr));
      ctx.setTransform(dpr,0,0,dpr,0,0);
      sprinkles=Array.from({length:reduceMotion?22:mobile?SNOW360_CANDY_WORLD.mobileSprinkles:SNOW360_CANDY_WORLD.desktopSprinkles},
        (_,i)=>newSprinkle(w,h,i<32));
      desserts=Array.from({length:reduceMotion?3:mobile?SNOW360_CANDY_WORLD.mobileDesserts:SNOW360_CANDY_WORLD.desktopDesserts},
        ()=>newDessert(w,h,true));
    };
    resize();window.addEventListener("resize",resize,{passive:true});
    const tick=(now)=>{
      raf=window.requestAnimationFrame(tick);
      const fps=reduceMotion?18:mobile?SNOW360_CANDY_WORLD.mobileFps:SNOW360_CANDY_WORLD.desktopFps;
      if(now-lastDraw<1000/fps)return;
      const dt=last?clamp((now-last)/1000,0,.05):1/fps;
      last=now;lastDraw=now;frame++;
      const elapsed=(now-origin)/1000;
      const current=gameRef.current;
      if(burstCount.current!==seenBurst){
        seenBurst=burstCount.current;
        // A second burst around the middle for each new automatic trick.
        for(let i=0;i<Math.min(sprinkles.length,45);i++) sprinkles[i]=newSprinkle(w,h,true);
      }
      renderFrame(ctx,w,h,sprinkles,desserts,atlas,dt,current.speed,elapsed,reduceMotion,elapsed<.9);
    };
    raf=window.requestAnimationFrame(tick);
    return()=>{window.cancelAnimationFrame(raf);window.removeEventListener("resize",resize);};
  },[mobile]);

  if(remaining<=0)return null;
  const alpha=clamp(remaining/.7,0,1);
  return <div aria-hidden="true" className="snow360-candy-world"
    style={{position:"absolute",inset:0,zIndex:2,overflow:"hidden",pointerEvents:"none",opacity:alpha,
      isolation:"isolate"}}>
    {/* Leave the center clear so the rider and world stay readable. */}
    <div style={{position:"absolute",inset:0,
      background:"radial-gradient(ellipse at 50% 49%, transparent 17%, rgba(255,216,237,.08) 46%, rgba(244,190,250,.20) 77%, rgba(177,241,248,.25) 100%)"}}/>
    <div style={{position:"absolute",inset:0,opacity:.52,
      background:"linear-gradient(125deg,rgba(251,190,225,.12),transparent 37%,transparent 65%,rgba(255,232,174,.14))"}}/>
    <canvas ref={canvasRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}/>
    {remaining>7.6&&<div className="snow360-candy-title" style={{position:"absolute",top:"34%",left:"50%",
      transform:"translateX(-50%)",whiteSpace:"nowrap",maxWidth:"95vw",color:"#fff4ff",
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
