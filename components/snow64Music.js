/**
 * SNOW 64 background music adapter (recorded soundtrack, original speed).
 * The original snow64Audio.js continues to provide ALL game sound effects.
 */
import { RapidRainV2, BPM } from './RapidRainV2';

let music=null;
let lastFailure=false;
// Lower than the old 0.43 setting, so game sound effects remain prominent.
export const DEFAULT_MUSIC_VOLUME=0.14;

function instance(){
  if(typeof window==='undefined')return null;
  if(!music){
    music=new RapidRainV2({volume:DEFAULT_MUSIC_VOLUME});
    music.loop=true;
  }
  return music;
}
export function startSnow64Music(){
  const m=instance();
  if(!m)return Promise.resolve();
  m.stop();
  m.transitionTo('auto');
  m.setTempo(BPM);  // 1.0x original speed at start; no pre-slowed song.
  m.setIntensity(.53);
  return m.play().catch(error=>{
    if(!lastFailure)console.warn('SNOW 64 music unavailable:',error);
    lastFailure=true;
  });
}
export function pauseSnow64Music(){music?.pause();}
export function resumeSnow64Music(){
  return music?.resume().catch(error=>{
    if(!lastFailure)console.warn('SNOW 64 music resume failed:',error);
    lastFailure=true;
  });
}
export function stopSnow64Music(){music?.stop();}
export function updateSnow64MusicFrame(frame){music?.updateFromGame(frame);}
export function playSnow64MusicEvent(kind){music?.reactToGameEvent(kind);}
export function setSnow64MusicVolume(value){music?.setVolume(value);}
export function getSnow64Music(){return music;}
export function onSnow64MusicBeat(callback){return instance()?.on('beat',callback)||(()=>{});}
export function getSnow64MusicPhase(){return music?.getBeatPhase()??0;}
export function getSnow64MusicEnergy(){return music?.getEnergy()??0;}
export async function disposeSnow64Music(){
  const closing=music;
  music=null;
  if(closing)await closing.dispose();
}
