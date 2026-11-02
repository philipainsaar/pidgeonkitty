"use client";

/**
 * SNOW 64 V9 headless music integration.
 * Preserves the original start-screen toggle and gameplay sound effects.
 * Reads game HUD SPEED and SCORE without touching SnowboardGame.jsx.
 * Passes both current score and current-run peak score to the six-track engine.
 * No visible player, overlays, or extra gameplay UI.
 */
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {
  startSnow64Music,pauseSnow64Music,resumeSnow64Music,
  stopSnow64Music,updateSnow64MusicFrame,playSnow64MusicEvent,
  disposeSnow64Music,getSnow64Music,onSnow64MusicBeat,
} from './snow64Music';

const WATCH_INTERVAL_MS=130;
const BASE_SCORE=2800;
const readNumber=(value,fallback)=>{
  const n=parseFloat(String(value??'').replace(/,/g,'').replace(/^\s*[^\d.-]*/,''));
  return Number.isFinite(n)?n:fallback;
};
function readHudStat(main,name,fallback){
  for(const panel of main.querySelectorAll('.snow64-hud .snow64-panel')){
    if(panel.querySelector('.snow64-label')?.textContent?.trim()===name){
      return readNumber(panel.querySelector('.snow64-number')?.textContent,fallback);
    }
  }
  return fallback;
}
function snapshot(){
  const main=document.querySelector('main');
  if(!main)return null;
  const settings=main.querySelector('[data-snow64-settings="true"]');
  const all=main.textContent||'';
  const phase=settings?(all.includes('SCORE DEPLETED!')?'finished':'ready')
    :all.includes('TAP / CLICK ANYWHERE TO RESUME')?'paused':'playing';
  const speed=readHudStat(main,'SPEED',77)/3.6; // Game HUD displays km/h; engine expects m/s.
  const score=readHudStat(main,'SCORE',BASE_SCORE);
  const powered=phase==='playing'&&!!main.querySelector('.snow64-magic');
  const air=/\bAIR\s+(\d+(?:\.\d+)?)m/.exec(all);
  const coins=/✦\s*(\d+)\s+TOKENS/.exec(all);
  const rocks=/FROST SHROOM\s+[\d.]+s\s*[•·]\s*(\d+)\s+ROCKS/.exec(all);
  const combo=/\bCOMBO\s*×\s*(\d+)/.exec(all);
  const recoveryStage=/RUNNING BACK TO THE BOARD/.test(all)?'chasing'
    :/REMOUNTING/.test(all)?'remounting'
    :/RIDER DOWN|GETTING UP\.\.\./.test(all)?'falling':'riding';
  const recovery=recoveryStage!=='riding';
  return {settings,phase,speed,score,powered,recovery,recoveryStage,
    inAir:phase==='playing'&&!!air,airHeight:air?Number(air[1]):0,
    coins:coins?Number(coins[1]):null,
    rocks:rocks?Number(rocks[1]):null,
    combo:combo?Number(combo[1]):0,
    trick:main.querySelector('.snow64-trick')?.textContent?.trim()||''};
}

export default function Snow64ReactiveMusic(){
  const [menuNode,setMenuNode]=useState(null);
  const [enabled,setEnabled]=useState(true);
  const enabledRef=useRef(true);
  const snapshotRef=useRef(null);
  const started=useRef(false);
  const peakScoreRef=useRef(BASE_SCORE);

  useEffect(()=>{
    const begin=()=>{
      if(!enabledRef.current||started.current)return;
      peakScoreRef.current=BASE_SCORE;
      started.current=true;
      void startSnow64Music();
    };
    const resume=()=>{if(enabledRef.current)void resumeSnow64Music();};
    const onClick=e=>{
      const current=snapshot()||snapshotRef.current;
      if(!current||e.target?.closest?.('button, [data-snow64-settings="true"]'))return;
      if(current.phase==='ready'||current.phase==='finished')begin();
      else if(current.phase==='paused')resume();
    };
    const onKeyDown=e=>{
      if(e.repeat)return;
      const current=snapshot()||snapshotRef.current;
      if(!current||e.target?.closest?.('button'))return;
      const key=e.key?.toLowerCase();
      if((key==='enter'||e.code==='Space')&&(current.phase==='ready'||current.phase==='finished'))begin();
      if((key==='p'||key==='escape')&&current.phase==='paused')resume();
    };
    window.addEventListener('click',onClick,true);
    window.addEventListener('keydown',onKeyDown,true);
    return()=>{window.removeEventListener('click',onClick,true);window.removeEventListener('keydown',onKeyDown,true);};
  },[]);

  useEffect(()=>{
    const unsubscribe=onSnow64MusicBeat(detail=>{
      window.dispatchEvent(new CustomEvent('snow64:music-beat',{detail}));
    });
    let last=null;
    const update=()=>{
      const next=snapshot();
      if(!next)return;
      snapshotRef.current=next;
      setMenuNode(old=>old===next.settings?old:next.settings);
      if(last?.phase!==next.phase){
        if(next.phase==='paused')pauseSnow64Music();
        if(next.phase==='ready'||next.phase==='finished'){
          stopSnow64Music();started.current=false;
        }
        if(next.phase==='playing'&&enabledRef.current&&!started.current){
          started.current=true;void startSnow64Music();
        }
      }
      if(next.phase==='playing'&&enabledRef.current&&getSnow64Music()?.isPlaying){
        peakScoreRef.current=Math.max(peakScoreRef.current,next.score);
        updateSnow64MusicFrame({
          playing:true,speed:next.speed,score:next.score,peakScore:peakScoreRef.current,
          powered:next.powered,inAir:next.inAir,recovery:next.recovery,
          recoveryStage:next.recoveryStage,tuck:next.speed>30,airHeight:next.airHeight,
        });
        if(last?.phase==='playing'){
          const react=kind=>playSnow64MusicEvent(kind);
          if(!last.powered&&next.powered)react('power');
          if(last.powered&&!next.powered)react('powerEnd');
          if(last.coins!==null&&next.coins!==null&&next.coins>last.coins)react('pickup');
          if(last.rocks!==null&&next.rocks!==null&&next.rocks>last.rocks)react('shatter');
          if(next.combo>last.combo)react('combo');
          if(next.trick&&next.trick!==last.trick)react('trickStart');
          if(!last.inAir&&next.inAir&&!next.powered)react('ollie');
          if(last.inAir&&!next.inAir&&!next.recovery&&!last.powered)react('land');
          if(!last.recovery&&next.recovery)react('crash');
        }
      }
      last=next;
    };
    update();
    const timer=window.setInterval(update,WATCH_INTERVAL_MS);
    return()=>{window.clearInterval(timer);unsubscribe();stopSnow64Music();void disposeSnow64Music();};
  },[]);

  const toggle=()=>{
    enabledRef.current=!enabledRef.current;
    setEnabled(enabledRef.current);
    if(!enabledRef.current){stopSnow64Music();started.current=false;}
  };
  return menuNode?createPortal(
    <div data-snow64-reactive-music="true" style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
      <button type="button" aria-pressed={enabled} aria-label="Include adaptive Bubble soundtrack"
        onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();toggle();}}
        style={{padding:'9px 15px',border:'2px solid #d7f4ff',borderRadius:9,
          background:enabled?'#f7cc8d':'#163d59',color:enabled?'#20394d':'#f3fbff',
          font:'900 11px system-ui,sans-serif',letterSpacing:'.055em',cursor:'pointer',touchAction:'manipulation'}}>
        {enabled?'♫ REACTIVE MUSIC: ON':'♫ REACTIVE MUSIC: OFF'}
      </button>
      <div style={{font:'700 10px system-ui,sans-serif',color:'#b3dbe9'}}>
        Bubble Candy · Surf · Speed · adapts to score and snowboard speed
      </div>
    </div>,menuNode
  ):null;
}
