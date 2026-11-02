/**
 * SNOW 64 V9: BUBBLE RADIO, six recorded songs / three adaptive tiers.
 * A complete replacement for components/RapidRainV2.js.
 * Works with the existing snow64Music.js and Snow64ReactiveMusic.jsx adapter.
 * Browser chooses WebM/Opus or MP3, never downloads both formats.
 * No visible player, samples generated in JS, or additional dependencies.
 *
 * Tiers (selected by snowboard speed OR the highest score in the run):
 *   Candy  / Candy 1 : gentle riding
 *   Surf   / Surf 1  : tucked / higher-score riding
 *   Speed  / Speed 1 : Frost Shroom / fastest / high-score riding
 * Smooth, two-element crossfades. Variants are random on each tier entry and
 * periodically while riding. Wipeouts slow the recording like a tape effect.
 * Different source songs are not guaranteed to share beat grids or key.
 */
export const BPM = 156; // Compatibility/reference beat clock, NOT a claim about all six songs.
export const DURATION = 300; // Replaced with the actual loaded track's duration.
export const BAR = 240 / BPM;
export const RAPID_RAIN_LAYERS = Object.freeze(['music']);
export const EVENT_COUNT = 0;
export function buildRapidRainScore() { return []; }

export const SNOW64_BUBBLE_CONFIG = Object.freeze({
  // Game displays km/h; updateFromGame receives meters/second.
  surfSpeedKmh: 105,
  speedSpeedKmh: 170,
  surfScore: 4500,
  speedScore: 7600,
  downshiftHysteresisKmh: 16,
  crossfadeSeconds: 2.8,
  minimumTierSeconds: 8,
  tierConfirmSeconds: 1.0,
  variantChangeSeconds: 80,
  maxFastPlaybackRate: 1.06,
  wipeoutPlaybackRate: 0.62,
});

const SONGS = Object.freeze([
  Object.freeze([{id:'bubble-candy',name:'Bubble Candy'}, {id:'bubble-candy-1',name:'Bubble Candy 1'}]),
  Object.freeze([{id:'bubble-surf',name:'Bubble Surf'}, {id:'bubble-surf-1',name:'Bubble Surf 1'}]),
  Object.freeze([{id:'bubble-speed',name:'Bubble Speed'}, {id:'bubble-speed-1',name:'Bubble Speed 1'}]),
]);
const clamp = (n,a,b) => Math.min(b,Math.max(a,Number.isFinite(Number(n)) ? Number(n) : a));
const nowSeconds = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export class ProceduralRapidRain {
  constructor({volume=.14,onEnded=null,random=Math.random}={}) {
    this.volume=clamp(volume,0,1);
    this.onEnded=onEnded;
    this.loop=true;
    this.tempo=BPM;
    this.intensity=.53;
    this.arrangement='auto';
    this.warmth=.25;
    this.isPlaying=false;
    this.position=0;
    this.ctx=null;
    this.master=null;
    this.analyser=null;
    this.slots=[];
    this.activeSlot=0;
    this.track=null;
    this.tier=0;
    this._desiredTier=0;
    this._desiredSince=0;
    this._lastSwitchAt=-10000;
    this._variantAt=0;
    this._transition=null;
    this._busy=false;
    this._generation=0;
    this._clock=nowSeconds;
    this._random=typeof random==='function'?random:Math.random;
    this._timer=null;
    this._listeners=new Map();
    this._lastBeat=-1;
    this._lastPosition=0;
    this._lastGameUpdate=-100;
    this._lastEvent=new Map();
    this._bins=null;
    this._duck=1;
    this._desiredRate=1;
    this._currentRate=1;
    this._manualRate=1;
    this._recovery=false;
    this._recoveryStage='riding';
    this._frost=false;
    this._inAir=false;
    this._lastScore=2800;
    this._peakScore=2800;
    this._lastSpeed=21.5;
    this._codec='mp3';
  }

  getDuration() { const d=this.slots[this.activeSlot]?.audio.duration;return Number.isFinite(d)&&d>1?d:DURATION; }
  getTime() { const t=this.slots[this.activeSlot]?.audio.currentTime;return Number.isFinite(t)?t:this.position; }
  getProgress() {return clamp(this.getTime()/Math.max(1,this.getDuration()),0,1);}
  getTempo() {return this.tempo;}
  getBeat() {return this.getTime()*BPM/60;}
  getBeatPhase() {const x=this.getBeat();return x-Math.floor(x);}
  getSection() {return ['candy','surf','speed'][this.tier]||'candy';}
  getEnergy() {
    if(!this.analyser)return 0;
    if(!this._bins)this._bins=new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this._bins);
    let sum=0;const count=Math.min(120,this._bins.length);
    for(let i=0;i<count;i++)sum+=this._bins[i];
    return count?sum/(count*255):0;
  }
  on(type,listener) {
    if(typeof listener!=='function')return()=>{};
    if(!this._listeners.has(type))this._listeners.set(type,new Set());
    this._listeners.get(type).add(listener);
    return()=>this.off(type,listener);
  }
  off(type,listener){this._listeners.get(type)?.delete(listener);}
  _emit(type,payload){for(const cb of this._listeners.get(type)||[]){try{cb(payload);}catch(e){console.warn('[SNOW64 music listener]',e);}}}

  _choose(tier,excludeId=null) {
    const options=SONGS[clamp(tier,0,2)];
    const available=options.filter(s=>s.id!==excludeId);
    const choices=available.length?available:options;
    return choices[Math.min(choices.length-1,Math.floor(clamp(this._random(),0,.999999)*choices.length))];
  }
  _trackUrl(id,format=this._codec){return `/audio/${id}.${format==='webm'?'webm':'mp3'}`;}
  _setPitchPreservation(el,preserve){
    for(const key of ['preservesPitch','webkitPreservesPitch','mozPreservesPitch']){
      if(key in el){try{el[key]=preserve;}catch{}}
    }
  }
  _init() {
    if(this.ctx || typeof window==='undefined')return;
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)throw new Error('Web Audio API is required for SNOW 64 recorded music.');
    const c=this.ctx=new Context({latencyHint:'playback'});
    this.master=c.createGain();this.master.gain.value=this.volume;
    this.duck=c.createGain();this.duck.gain.value=1;
    this.lowpass=c.createBiquadFilter();this.lowpass.type='lowpass';this.lowpass.frequency.value=12500;this.lowpass.Q.value=.6;
    this.analyser=c.createAnalyser();this.analyser.fftSize=512;
    this.duck.connect(this.lowpass);this.lowpass.connect(this.master);
    this.master.connect(this.analyser);this.analyser.connect(c.destination);
    this.slots=Array.from({length:2},()=>{
      const audio=new Audio();
      audio.preload='auto'; audio.loop=true;audio.playsInline=true;
      audio.volume=1;
      this._setPitchPreservation(audio,true);
      const source=c.createMediaElementSource(audio);
      const gain=c.createGain();gain.gain.value=0;
      source.connect(gain);gain.connect(this.duck);
      return {audio,gain,track:null};
    });
    this._codec=this.slots[0].audio.canPlayType?.('audio/webm; codecs="opus"')?'webm':'mp3';
  }
  _load(slot,track,format=this._codec){
    slot.track=track;
    slot.audio.src=this._trackUrl(track.id,format);
    slot.audio.load();
    slot.gain.gain.setValueAtTime(0,this.ctx.currentTime);
    this._setPitchPreservation(slot.audio,!this._recovery);
    slot.audio.playbackRate=this._currentRate;
  }
  async _startSlot(slot,track) {
    this._load(slot,track);
    try {
      await slot.audio.play();
    } catch(error) {
      // The source can fail on one codec despite an optimistic canPlayType().
      // Never hide a permissions/autoplay error by silently changing the track.
      if(this._codec!=='webm'||error?.name==='NotAllowedError')throw error;
      this._load(slot,track,'mp3');
      await slot.audio.play();
    }
  }

  _chooseTier(speedKmh,peakScore,powered) {
    if(powered)return 2;
    const scoreTier=peakScore>=SNOW64_BUBBLE_CONFIG.speedScore?2
      :peakScore>=SNOW64_BUBBLE_CONFIG.surfScore?1:0;
    const c=SNOW64_BUBBLE_CONFIG;
    // Hysteresis prevents chatter when the rider is hovering near a threshold.
    let speedTier=0;
    if(this.tier===0){speedTier=speedKmh>=c.speedSpeedKmh?2:speedKmh>=c.surfSpeedKmh?1:0;}
    else if(this.tier===1){speedTier=speedKmh>=c.speedSpeedKmh?2
      :speedKmh<c.surfSpeedKmh-c.downshiftHysteresisKmh?0:1;}
    else {speedTier=speedKmh>=c.speedSpeedKmh-c.downshiftHysteresisKmh?2
      :speedKmh>=c.surfSpeedKmh-c.downshiftHysteresisKmh?1:0;}
    return Math.max(scoreTier,speedTier);
  }

  /** Called by the existing adapter; `speed` is in meters/second, not km/h. */
  updateFromGame({playing=true,speed=21.5,score=2800,peakScore=2800,powered=false,
    recovery=false,recoveryStage='riding',inAir=false,tuck=false,airHeight=0,steer=0}={}) {
    if(!playing||!this.isPlaying)return;
    const at=this._clock();
    if(at-this._lastGameUpdate<.10)return;
    this._lastGameUpdate=at;
    const speedMs=clamp(speed,0,90),kmh=speedMs*3.6;
    this._lastSpeed=speedMs;
    this._lastScore=clamp(score,0,1000000);
    this._peakScore=Math.max(this._peakScore,clamp(peakScore,2800,1000000),this._lastScore);
    this._recovery=!!recovery;
    this._recoveryStage=recoveryStage;
    this._frost=!!powered;
    this._inAir=!!inAir;
    this.intensity=clamp(.25+speedMs/85+(powered?.26:0),0,1.35);

    // In ordinary riding, the TRACK is what makes the game feel faster;
    // playbackRate adds only a tiny extra push so the recorded mix stays clear.
    const speedLift=clamp((kmh-80)/140,0,1)*.039;
    const scoreLift=clamp((this._peakScore-2800)/10000,0,1)*.013;
    const ridingRate=clamp(this._manualRate+speedLift+scoreLift+(powered?.008:0),.98,
      SNOW64_BUBBLE_CONFIG.maxFastPlaybackRate);
    const recoveryRate=recoveryStage==='falling'?.62
      :recoveryStage==='chasing'?.78
      :recoveryStage==='remounting'?.91:.70;
    this._desiredRate=recovery?recoveryRate:ridingRate;
    this._setColor();
    for(const slot of this.slots)this._setPitchPreservation(slot.audio,!recovery);

    if(!recovery){
      const wanted=this._chooseTier(kmh,this._peakScore,powered);
      if(wanted!==this._desiredTier){this._desiredTier=wanted;this._desiredSince=at;}
      if(wanted!==this.tier && at-this._desiredSince>=SNOW64_BUBBLE_CONFIG.tierConfirmSeconds
        && at-this._lastSwitchAt>=SNOW64_BUBBLE_CONFIG.minimumTierSeconds && !this._transition && !this._busy){
        void this._switchTrack(wanted,false);
      }
    }
    this._emit('motion',{speed:speedMs,score:this._lastScore,peakScore:this._peakScore,
      powered,recovery,inAir,tuck,airHeight,steer,level:this.tier,
      bpm:this.getTempo(),track:this.track?.name,intensity:this.intensity});
  }
  _setColor() {
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    const frequency=this._recovery?5800:this._inAir?10200:13500;
    this.lowpass.frequency.setTargetAtTime(frequency,t,.22);
  }
  setTempo(value) {
    // Retain the legacy adapter API. Each song plays at its original pitch
    // and speed by default; minor game-driven rate changes are separate.
    const bpm=clamp(value,80,220);
    this.tempo=bpm;
    this._manualRate=clamp(bpm/BPM,.94,1.06);
    if(!this.isPlaying)this._desiredRate=this._manualRate;
    this._emit('tempo',{bpm});
  }
  setVolume(value){this.volume=clamp(value,0,1);if(this.ctx)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.06);}
  setWarmth(value){this.warmth=clamp(value,0,1);}
  setIntensity(value){this.intensity=clamp(value,0,1.35);}
  transitionTo(name,{bars=2}={}) {
    if(!['auto','calm','groove','peak'].includes(name))return false;
    this.arrangement=name;
    if(name!=='auto')this.setIntensity({calm:.2,groove:.65,peak:1.2}[name]);
    this._emit('arrangement',{name,bars});return true;
  }
  setInstrumentVolume(name,value){if(name!=='music')return false;this.setVolume(value);return true;}
  muteInstrument(name,muted=true){if(name!=='music')return false;this.master?.gain.setTargetAtTime(muted?0:this.volume,this.ctx.currentTime,.07);return true;}
  soloInstrument(name){return name==='music';}
  reactToGameEvent(kind) {
    if(!this.isPlaying)return;
    const at=this._clock();if(at-(this._lastEvent.get(kind)??-100)<.14)return;
    this._lastEvent.set(kind,at);
    if(kind==='power')this._emit('power',{time:this.getTime()});
    if(['pickup','combo','power','shatter','land','magicTrick','superRamp'].includes(kind))
      this._emit('accent',{kind,time:this.getTime()});
    if(['crash','rockHit','rampHit','shatter'].includes(kind))this._duck=kind==='shatter'?.74:.55;
  }

  async _switchTrack(nextTier,shuffle=false) {
    if(!this.ctx||!this.isPlaying||this._busy||this._transition||this._recovery)return;
    const dest=this._choose(nextTier,shuffle?this.track?.id:null);
    if(dest.id===this.track?.id)return;
    const incomingIdx=1-this.activeSlot;
    const incoming=this.slots[incomingIdx];
    const source=this.slots[this.activeSlot];
    this._busy=true;const token=++this._generation;
    try {
      await this._startSlot(incoming,dest);
      if(token!==this._generation || !this.isPlaying || this._recovery) {
        incoming.audio.pause();return;
      }
      // The old song remains audible while the new audio is buffering.
      // Only begin the fade after the browser has actually started playback.
      const at=this.ctx.currentTime;
      this._transition={from:this.activeSlot,to:incomingIdx,started:at,
        duration:SNOW64_BUBBLE_CONFIG.crossfadeSeconds,
        tier:nextTier,track:dest,previous:source.track};
      this._emit('crossfade',{from:source.track?.name,to:dest.name,tier:nextTier,
        seconds:SNOW64_BUBBLE_CONFIG.crossfadeSeconds});
    } catch(error) {
      incoming.audio.pause();
      // Don't stop the current music if a requested track fails to load/play.
      this._emit('error',{message:`Could not transition to ${dest.name}: ${String(error)}`});
    } finally {this._busy=false;}
  }

  _tick(){
    if(!this.isPlaying||!this.ctx)return;
    const t=this.ctx.currentTime;
    // Smooth acceleration; much quicker slowdown on wipeout, gentle recovery.
    const delta=this._desiredRate-this._currentRate;
    const maxStep=this._recovery?.008:.0035; // Called every ~40ms.
    this._currentRate+=clamp(delta,-maxStep,maxStep);
    for(const s of this.slots){
      if(s.track && Math.abs(s.audio.playbackRate-this._currentRate)>.0005){
        try{s.audio.playbackRate=this._currentRate;}catch{}
      }
    }
    this._duck=Math.min(1,this._duck+.012);
    this.duck.gain.setTargetAtTime(this._duck,t,.06);

    if(this._transition){
      const tr=this._transition;
      const u=clamp((t-tr.started)/tr.duration,0,1);
      const theta=u*Math.PI/2;
      // Equal-power curve, modest overlap attenuation to prevent loudness spikes.
      const overlap=1-.10*Math.sin(u*Math.PI);
      this.slots[tr.from].gain.gain.setTargetAtTime(Math.cos(theta)*overlap,t,.025);
      this.slots[tr.to].gain.gain.setTargetAtTime(Math.sin(theta)*overlap,t,.025);
      if(u>=1){
        const old=this.slots[tr.from],current=this.slots[tr.to];
        old.gain.gain.setValueAtTime(0,t);
        old.audio.pause();old.audio.removeAttribute('src');old.audio.load();old.track=null;
        current.gain.gain.setTargetAtTime(1,t,.025);
        this.activeSlot=tr.to;this.tier=tr.tier;this.track=tr.track;
        this._lastSwitchAt=this._clock();
        this._variantAt=this._lastSwitchAt+SNOW64_BUBBLE_CONFIG.variantChangeSeconds;
        this._transition=null;
        this._lastBeat=-1;
        this._lastPosition=0;
        this._emit('track',{name:this.track.name,id:this.track.id,tier:this.tier});
      }
    } else if(!this._busy && !this._recovery &&
      this._clock()>=this._variantAt && this._clock()-this._lastSwitchAt>=SNOW64_BUBBLE_CONFIG.minimumTierSeconds) {
      // Rotate between the two variants at a gentle interval while staying
      // within the same tier; not random chaos or a shuffle every few seconds.
      this._variantAt=this._clock()+SNOW64_BUBBLE_CONFIG.variantChangeSeconds;
      void this._switchTrack(this.tier,true);
    }

    const pos=this.getTime();
    if(this._lastPosition-pos>1.2){this._lastBeat=-1;this._emit('loop',{time:pos});}
    const beat=Math.floor(pos*BPM/60); // Approximate visual pulse only.
    if(beat!==this._lastBeat){
      this._lastBeat=beat;
      this._emit('beat',{beat:((beat%4)+4)%4,bar:Math.floor(beat/4),time:pos,
        bpm:BPM*this._currentRate,approximate:true,track:this.track?.name});
    }
    this._lastPosition=pos;
  }

  async play(){
    if(this.isPlaying)return;
    this._init();
    if(!this.ctx)throw new Error('Music needs a browser AudioContext.');
    const resumePending=this.ctx.state==='suspended'?this.ctx.resume():Promise.resolve();
    const slot=this.slots[this.activeSlot];
    const first=!slot.track;
    if(first){
      this.tier=0;this._desiredTier=0;this._desiredSince=this._clock();
      this.track=this._choose(0);
      // Start from Candy, not from the rider's speed on a prior run.
      this._load(slot,this.track);
      if(this.position>0)slot.audio.currentTime=this.position;
    }
    slot.gain.gain.setValueAtTime(1,this.ctx.currentTime);
    slot.audio.loop=this.loop;
    slot.audio.playbackRate=this._currentRate;
    // play() is invoked immediately within the Start click's activation.
    const pending=slot.audio.play();
    try {
      await Promise.all([resumePending,pending]);
    } catch(error) {
      if(this._codec==='webm'&&error?.name!=='NotAllowedError'&&first){
        this._load(slot,this.track,'mp3');
        slot.gain.gain.setValueAtTime(1,this.ctx.currentTime);
        try{await slot.audio.play();}catch(second){throw second;}
      } else throw error;
    }
    this.isPlaying=true;
    this._variantAt=this._clock()+SNOW64_BUBBLE_CONFIG.variantChangeSeconds;
    this._timer=setInterval(()=>this._tick(),40);
    this._tick();
    this._emit('track',{name:this.track?.name,id:this.track?.id,tier:this.tier});
  }
  async resume(){return this.play();}
  pause(){
    if(!this.isPlaying)return;
    this.position=this.getTime();
    this.isPlaying=false;
    if(this._timer){clearInterval(this._timer);this._timer=null;}
    this._generation++;
    this._transition=null;
    for(let i=0;i<this.slots.length;i++){
      const slot=this.slots[i];slot.audio.pause();
      slot.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      slot.gain.gain.setValueAtTime(i===this.activeSlot?1:0,this.ctx.currentTime);
    }
  }
  stop(){
    this.pause();this._generation++;
    this.position=0;this._desiredRate=1;this._currentRate=1;this._manualRate=1;
    this._recovery=false;this._recoveryStage='riding';this._peakScore=2800;
    this._desiredTier=0;this._desiredSince=0;this._lastSwitchAt=-10000;
    this._lastBeat=-1;this._lastPosition=0;
    this.activeSlot=0;this.track=null;this.tier=0;
    this._transition=null;
    for(const slot of this.slots){
      slot.audio.pause();slot.audio.removeAttribute('src');slot.audio.load();slot.track=null;
      slot.gain.gain.setValueAtTime(0,this.ctx.currentTime);
    }
  }
  seek(seconds){
    const t=clamp(seconds,0,this.getDuration());this.position=t;
    const slot=this.slots[this.activeSlot];
    if(slot){try{slot.audio.currentTime=t;}catch{}}
    this._lastBeat=-1;this._lastPosition=t;
  }
  async dispose(){
    this.stop();this._listeners.clear();
    for(const slot of this.slots){slot.audio.removeAttribute('src');slot.audio.load();try{slot.gain.disconnect();}catch{}}
    this.slots=[];
    if(this.ctx){try{await this.ctx.close();}catch{}}
    this.ctx=null;this.master=null;this.analyser=null;
  }
}
export default ProceduralRapidRain;
export class RapidRainV2 extends ProceduralRapidRain {}
