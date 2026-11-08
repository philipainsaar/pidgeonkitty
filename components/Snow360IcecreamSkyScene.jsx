"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * SNOW360 Ice Cream Power | randomized SCENE 2: CLOUD SURF.
 *
 * Independent visual layer, NO physics / camera overrides here.
 * - SnowboardGame.jsx selects this scene only once when the item is collected.
 * - The rider physically glides up and back down via its existing hover state.
 * - Reuses Snow360's four actual Big Air cloud GLBs, including their gems.
 * - All 2D stars, sky glitter, breeze streaks and cotton-candy haze are procedural.
 * - Does not draw over the gameplay logo, HUD, or touch controls (zIndex: 2).
 * - Mobile-friendly: <= 5 cloud clones and <= 46 2D motes.
 */

const CLOUD_FILES = [
  "/models/snow360-sky-cloud-1.glb",
  "/models/snow360-sky-cloud-2.glb",
  "/models/snow360-sky-cloud-3.glb",
  "/models/snow360-sky-cloud-4.glb",
];
const PINK = ["#ffc5eb", "#ffecb9", "#cefcf0", "#d4edff", "#dccbff", "#ffffff"];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const fract = x => x - Math.floor(x);
const seeded = n => fract(Math.sin(n * 127.1 + 53.7) * 43758.5453);

function CloudCopy({scene, positionRef, modelIndex}) {
  // A clone gets its own transforms but shares the cached geometry and PBR
  // textures with the existing Big Air clouds. No new textures or GLB URLs.
  const copy=useMemo(()=>scene.clone(true),[scene]);
  return <group ref={positionRef} visible={false}>
    <primitive object={copy} dispose={null}/>
  </group>;
}

/** 3D component: put INSIDE the game's R3F Canvas, after the regular course. */
export function Snow360IcecreamSkyClouds({stateRef, mobile=false, groundY}) {
  // Hooks are unconditional; Three's GLTF cache shares these with the course.
  const cloud0=useGLTF(CLOUD_FILES[0]);
  const cloud1=useGLTF(CLOUD_FILES[1]);
  const cloud2=useGLTF(CLOUD_FILES[2]);
  const cloud3=useGLTF(CLOUD_FILES[3]);
  const scenes=useMemo(()=>[cloud0.scene,cloud1.scene,cloud2.scene,cloud3.scene],
    [cloud0.scene,cloud1.scene,cloud2.scene,cloud3.scene]);
  const count=mobile?5:7;
  const refs=useRef([]);
  const root=useRef(null);
  const slots=useMemo(()=>Array.from({length:count},(_,i)=>({id:i,modelIndex:i%4})),[count]);

  // Run after the rider's camera update (see Scene in SnowboardGame.jsx).
  // The original GLBs have pearly decorations predominantly on one face.
  // Camera-facing yaw keeps that decorated side visible even when the Sky Surf
  // director cuts from rear chase to side or front views.
  useFrame(({clock,camera})=>{
    const group=root.current;
    if(!group)return;
    const s=stateRef.current;
    const active=Boolean(s?.icecreamScene===2 && s.icecreamHover && s.powerTime>0);
    // Mode 2 uses Scene 1 during Ice Cream Power, so its actual GLB sky
    // clouds must also be visible in normal gameplay, not Scene 2 alone.
    const ambient=s?.gameMode==="token";
    group.visible=active||ambient;
    if(!group.visible)return;

    const spacing=active?33:60;
    const currentSegment=Math.floor((-s.z)/spacing);
    const firstCell=currentSegment-(active?2:3);
    const time=clock.elapsedTime;
    for(let i=0;i<count;i++){
      const g=refs.current[i];if(!g)continue;

      // Stable modulo assignment: each cloud owns one world-space cell until
      // it falls behind the rider. Only ONE retired clone moves ahead when a
      // 33-metre boundary is crossed, instead of all clouds teleporting at
      // once and appearing to reverse direction.
      const cell=i+count*Math.ceil((firstCell-i)/count);
      const x=active ? (seeded(cell*7+6)-.5)*15.0
        : (seeded(cell*7+6)-.5)*49.0;
      const z=-(cell*spacing+spacing*.5);
      const y=active ? groundY(x,z)+11.4+seeded(cell*13+29)*6.6
        : groundY(x,z)+24+seeded(cell*13+29)*8;
      const sz=active ? 5.3+seeded(cell*5+10)*2.0
        : 3.3+seeded(cell*5+10)*1.1;
      g.position.set(x,y+Math.sin(time*.68+cell*1.7)*.17,z);
      g.scale.setScalar(mobile?sz*.85:sz);

      // In the original chase view, a yaw of PI exposes the GLBs' pearly
      // side. Rotate that same side toward the CURRENT camera for every
      // cinematic shot. Only yaw changes: clouds stay upright in world space.
      // Evaluate this AFTER camera cuts so no reversed frame is rendered.
      const toCameraX=camera.position.x-x;
      const toCameraZ=camera.position.z-z;
      if(toCameraX*toCameraX+toCameraZ*toCameraZ>0.0001){
        g.rotation.y=Math.PI+Math.atan2(toCameraX,toCameraZ);
      }
      g.visible=true;
    }
  });

  return <group ref={root} visible={false} name="SNOW360 Ice Cream Sky Surf Clouds">
    {slots.map(({id,modelIndex})=><CloudCopy key={id}
      scene={scenes[modelIndex]} modelIndex={modelIndex}
      positionRef={el=>{refs.current[id]=el;}}/>) }
  </group>;
}

function newMote(w,h) {
  return {
    x:rand(-w*.1,w*1.1), y:rand(-h*.12,h*1.05),
    r:rand(1.5,3.8), glow:rand(.35,.8),
    speed:rand(34,110), spread:rand(-.5,.5),
    color:PINK[Math.floor(Math.random()*PINK.length)],
    kind:Math.random()<.33?"star":Math.random()<.72?"pearl":"trail",
    phase:rand(0,Math.PI*2),
  };
}

function drawStar(ctx,x,y,r) {
  ctx.beginPath();
  ctx.moveTo(x,y-r*2.2);
  ctx.quadraticCurveTo(x+r*.35,y-r*.3,x+r*1.35,y);
  ctx.quadraticCurveTo(x+r*.35,y+r*.3,x,y+r*2.2);
  ctx.quadraticCurveTo(x-r*.35,y+r*.3,x-r*1.35,y);
  ctx.quadraticCurveTo(x-r*.35,y-r*.3,x,y-r*2.2);
  ctx.closePath();ctx.fill();
}

/** Mobile-safe Sky Surf motes. The desktop keeps its ORIGINAL Canvas motes;
 * mobile draws the same kinds of star, pearl and sky streak with CSS instead.
 * Keeping every screen-space effect in the SAME DOM layer avoids mobile GPU
 * compositing conflicts between a constantly-redrawn sky canvas and sprinkles.
 * The real 3D cloud GLBs and every cinematic camera shot are unchanged. */
const MOBILE_SKY_MOTES=(()=>{
  const kinds=["star","pearl","trail"];
  return Array.from({length:46},(_,i)=>{
    const n=i+1;
    const hash=(salt)=>seeded(n*(salt+21)+salt*33.25);
    const kind=kinds[Math.floor(hash(7)*3)];
    return {
      id:i,kind,color:PINK[Math.floor(hash(13)*PINK.length)],
      x:-7+hash(2)*114,y:-18+hash(3)*133,
      size:kind==="trail"?1.4+hash(4)*1.6:2.7+hash(5)*3.2,
      length:kind==="trail"?12+hash(9)*16:0,
      dx:(hash(11)-.5)*37,dy:105+hash(17)*73,
      duration:2.5+hash(19)*2.7,delay:-hash(23)*4.7,
    };
  });
})();
function MobileSkyMotes({speed=0}) {
  const rate=clamp(.78+speed/150,.78,1.9);
  return <div aria-hidden="true" data-snow360-mobile-sky-motes="true"
    style={{position:"absolute",inset:0,zIndex:2,pointerEvents:"none",overflow:"hidden"}}>
    {MOBILE_SKY_MOTES.map(p=><span key={p.id}
      className={`snow360-css-skymote snow360-css-skymote-${p.kind}`}
      style={{position:"absolute",left:`${p.x}%`,top:`${p.y}%`,
        width:p.kind==="star"?p.size*2.4:p.size,
        height:p.kind==="trail"?p.length:p.kind==="star"?p.size*2.4:p.size,
        borderRadius:p.kind==="pearl"?"50%":p.kind==="trail"?"100px":0,
        backgroundColor:p.color,
        clipPath:p.kind==="star"?"polygon(50% 0%,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0% 50%,39% 39%)":undefined,
        opacity:p.kind==="star"?.78:.52,
        '--sky-mote-x':`${p.dx}vw`,'--sky-mote-y':`${p.dy}vh`,
        animation:`snow360CssSkyMote ${(p.duration/rate).toFixed(2)}s linear ${p.delay.toFixed(2)}s infinite`}}/>) }
    <style>{`
      @keyframes snow360CssSkyMote {
        from {transform:translate3d(0,0,0);opacity:.45}
        45% {opacity:.8}
        to {transform:translate3d(var(--sky-mote-x),var(--sky-mote-y),0);opacity:.35}
      }
      @media(prefers-reduced-motion:reduce){
        .snow360-css-skymote {animation-duration:10s!important}
      }
    `}</style>
  </div>;
}

/** 2D scene overlay: soft magical sky particles, not the scene-1 sprinkles. */
export default function Snow360IcecreamSkyScene({remaining=0,mobile=false,speed=0,trick=""}) {
  const canvasRef=useRef(null);
  const propsRef=useRef({speed,remaining});
  const burstRef=useRef(0);
  const lastTrickRef=useRef("");
  propsRef.current={speed,remaining};
  useEffect(()=>{
    if(trick && trick!==lastTrickRef.current){lastTrickRef.current=trick;burstRef.current++;}
    else if(!trick){lastTrickRef.current="";}
  },[trick]);

  useEffect(()=>{
    // On mobile both sky motes and the candy rods use CSS in the same DOM
    // scene. Do not create a constantly-redrawn sky canvas above them.
    if(mobile)return;
    const canvas=canvasRef.current;
    if(!canvas)return;
    const ctx=canvas.getContext("2d",{alpha:true,desynchronized:true});
    if(!ctx)return;
    let w=0,h=0,last=0,lastDraw=0,frame=0,raf=0,seenBursts=0;
    const reduceMotion=Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    let motes=[];
    const resize=()=>{
      const rect=canvas.getBoundingClientRect();
      w=Math.max(1,Math.round(rect.width));h=Math.max(1,Math.round(rect.height));
      const dpr=Math.min(window.devicePixelRatio||1,mobile?1.15:1.5);
      canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));
      ctx.setTransform(dpr,0,0,dpr,0,0);
      motes=Array.from({length:reduceMotion?14:mobile?46:96},()=>newMote(w,h));
    };
    resize();
    window.addEventListener("resize",resize,{passive:true});
    const tick=now=>{
      raf=requestAnimationFrame(tick);
      const fps=reduceMotion?18:mobile?35:60;
      if(now-lastDraw<1000/fps)return;
      const dt=last?clamp((now-last)/1000,0,.05):1/fps;
      last=now;lastDraw=now;frame+=dt;
      const {speed:kmh}=propsRef.current;
      const pace=reduceMotion?.24:clamp(.8+kmh/130,.8,2.5);
      const burst=burstRef.current!==seenBursts;
      if(burst)seenBursts=burstRef.current;
      ctx.clearRect(0,0,w,h);
      for(let i=0;i<motes.length;i++){
        let p=motes[i];
        p.x+=((p.x-w*.5)*.10+p.spread*14)*pace*dt;
        p.y+=p.speed*pace*dt;
        if(p.y>h+30 || p.x < -40 || p.x>w+40){
          p=motes[i]=newMote(w,h);p.y=-rand(5,h*.18);
        }
        if(burst && i<Math.min(24,motes.length)){
          p.x=w*.5+rand(-85,85);p.y=h*.5+rand(-70,70);
        }
        const shimmer=.62+.38*Math.sin(frame*4.4+p.phase);
        ctx.globalAlpha=p.glow*shimmer;
        ctx.fillStyle=p.color;ctx.strokeStyle=p.color;
        if(p.kind==="star"){
          drawStar(ctx,p.x,p.y,p.r);
        }else if(p.kind==="trail"){
          ctx.lineWidth=Math.max(1.2,p.r*.62);ctx.lineCap="round";
          ctx.beginPath();ctx.moveTo(p.x,p.y-p.r*(3.0+pace*1.8));
          ctx.lineTo(p.x,p.y+p.r*2.0);ctx.stroke();
        }else{
          ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
        }
      }
      ctx.globalAlpha=1;
    };
    raf=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",resize);};
  },[mobile]);

  if(remaining<=0)return null;
  const fade=clamp(remaining/.85,0,1);
  return <div className="snow360-icecream-sky-scene" aria-hidden="true"
    style={{position:"absolute",inset:0,zIndex:0,overflow:"hidden",pointerEvents:"none",isolation:"isolate"}}>
    {/* Clear middle for rider; cotton-candy sky concentrated around perimeter. */}
    <div style={{position:"absolute",inset:0,opacity:fade,
      background:"radial-gradient(ellipse at 50% 50%,transparent 22%,rgba(202,235,255,.09) 55%,rgba(255,196,234,.22) 100%)"}}/>
    <div style={{position:"absolute",inset:0,opacity:.8*fade,
      background:"linear-gradient(120deg,rgba(226,206,255,.13),transparent 45%,rgba(203,255,248,.12))"}}/>
    {mobile ? <MobileSkyMotes speed={speed}/> : <canvas ref={canvasRef}
      style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}/>}
    {/* Mobile Scene 2's sprinkles are now REAL 3D particles emitted by the
        snowboard inside SnowboardGame's Three.js Canvas. Keep sky motes,
        cameras, cloud GLBs and title fully intact. */}
    {remaining>7.5&&<div className="snow360-sky-title" style={{position:"absolute",left:"50%",top:"32%",
      transform:"translateX(-50%)",whiteSpace:"nowrap",maxWidth:"94vw",pointerEvents:"none",
      color:"#fff9ff",font:"1000 clamp(17px,3.9vw,33px) Fredoka,system-ui,sans-serif",
      textShadow:"0 1px 0 #9e80bb,0 3px 19px #9dc9ef",letterSpacing:".06em"}}>
      ✦ BIG AIR SKY SURF! ✦
    </div>}
    <style>{`
      @keyframes snow360SkyTitle {0%{opacity:0;transform:translate(-50%,17px) scale(.8)}23%{opacity:1;transform:translate(-50%,0) scale(1.06)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-10px) scale(1)}}
      .snow360-sky-title{animation:snow360SkyTitle 1.55s ease both}
      @media(prefers-reduced-motion:reduce){.snow360-sky-title{animation:none!important}}
    `}</style>
  </div>;
}
