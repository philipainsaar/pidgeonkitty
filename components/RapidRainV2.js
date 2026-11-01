/**
 * SNOW 64 V8: Original-speed recorded soundtrack + cinematic wipeout slowdown.
 *
 * Place alongside /public/audio/snow64-theme.webm and snow64-theme.mp3.
 * WebM/Opus is preferred, MP3 is the compatibility fallback. No visible player.
 * Compatible with the existing snow64Music.js and Snow64ReactiveMusic.jsx APIs.
 * Existing snowboarding sound effects remain independent.
 */
export const BPM = 156; // Approximate beat grid for the original-speed recording.
export const DURATION = 125.53;
export const BAR = 240 / BPM;
export const RAPID_RAIN_LAYERS = Object.freeze(['music']);
export const EVENT_COUNT = 0;
export function buildRapidRainScore() { return []; }

const OPUS_URL = '/audio/snow64-theme.webm';
const MP3_URL = '/audio/snow64-theme.mp3';
const TICK_MS = 40;
const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, Number(value) || 0));
const monotonicNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

// All speeds are relative to the ORIGINAL file, not a previously slowed export.
export const SNOW64_MUSIC_TUNING = Object.freeze({
  normalRateMin: 0.97,
  normalRateMax: 1.075,
  wipeoutLowRate: 0.62,
  crashFadeSeconds: 0.35,
  resumeFadeSeconds: 0.75,
  crashVolumeFactor: 0.72,
});

export class ProceduralRapidRain {
  constructor({volume=.14, onEnded=null, sourceOpus=OPUS_URL, sourceMP3=MP3_URL}={}) {
    this.volume=clamp(volume,0,1);
    this.onEnded=onEnded;
    this.sourceOpus=sourceOpus;
    this.sourceMP3=sourceMP3;
    this.loop=true;
    this.tempo=BPM;
    this.intensity=.53;
    this.arrangement='auto';
    this.isPlaying=false;
    this.position=0;
    this.audio=null;
    this.ctx=null;
    this.analyser=null;
    this.master=null;
    this.warmth=.36;
    this._duration=DURATION;
    this._normalRate=1;
    this._desiredRate=1;
    this._currentRate=1;
    this._lastTick=0;
    this._lastGameUpdate=0;
    this._timer=null;
    this._lastBeat=-1;
    this._lastSection='';
    this._lastPosition=0;
    this._lastEvent=new Map();
    this._listeners=new Map();
    this._bins=null;
    this._mixDuck=1;
    this._frost=false;
    this._air=false;
    this._recovery=false;
    this._wipeoutStartedAt=null;
    this._restorePitchPending=false;
    this._usedFallback=false;
    this._musicMuted=false;
    this._savedVolume=this.volume;
  }

  getDuration(){return this._duration;}
  getTime(){return this.audio && Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : this.position;}
  getProgress(){return this.getTime()/Math.max(1,this.getDuration());}
  getTempo(){return BPM*this._currentRate;}
  getBeat(){return this.getTime()*BPM/60;}
  getBeatPhase(){const beat=this.getBeat();return beat-Math.floor(beat);}
  getSection(){
    const part=this.getProgress();
    if(part<.12)return 'mountain start';
    if(part<.35)return 'snow trail';
    if(part<.63)return 'downhill';
    if(part<.86)return 'frost run';
    return 'summit loop';
  }
  getEnergy(){
    if(!this.analyser)return 0;
    if(!this._bins)this._bins=new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this._bins);
    let sum=0;
    const count=Math.min(120,this._bins.length);
    for(let i=0;i<count;i++)sum+=this._bins[i];
    return count?sum/(255*count):0;
  }
  on(type,callback){
    if(typeof callback!=='function')return()=>{};
    if(!this._listeners.has(type))this._listeners.set(type,new Set());
    this._listeners.get(type).add(callback);
    return()=>this.off(type,callback);
  }
  off(type,callback){this._listeners.get(type)?.delete(callback);}
  _emit(type,data){
    for(const listener of this._listeners.get(type)||[]){
      try{listener(data);}catch(error){console.warn('[SNOW64 music event]',error);}
    }
  }
  _pitchPreservation(value){
    const a=this.audio;
    if(!a)return;
    if('preservesPitch' in a)a.preservesPitch=value;
    else if('webkitPreservesPitch' in a)a.webkitPreservesPitch=value;
    else if('mozPreservesPitch' in a)a.mozPreservesPitch=value;
  }
  _init(){
    if(this.audio||typeof window==='undefined')return;
    const a=this.audio=new Audio();
    a.preload='auto';
    a.loop=this.loop;
    a.playsInline=true;
    a.volume=this.volume;
    this._pitchPreservation(true);
    const canOpus=!!a.canPlayType?.('audio/webm; codecs="opus"');
    a.src=canOpus?this.sourceOpus:this.sourceMP3;
    a.addEventListener('loadedmetadata',()=>{
      if(Number.isFinite(a.duration)&&a.duration>2)this._duration=a.duration;
    });
    a.addEventListener('ended',()=>{
      if(this.loop)return;
      this.pause();
      this._emit('ended',{});
      this.onEnded?.();
    });
    a.addEventListener('error',()=>{
      if(!this._usedFallback && a.src.includes('snow64-theme.webm')){
        this._usedFallback=true;
        const seekTo=this.getTime();
        a.src=this.sourceMP3;
        a.load();
        a.addEventListener('loadedmetadata',()=>{
          try{a.currentTime=Math.min(seekTo,Math.max(0,a.duration-.1));}catch{}
          if(this.isPlaying)void a.play().catch(e=>this._emit('error',{message:String(e)}));
        },{once:true});
      }else this._emit('error',{message:'Music file failed to load from public/audio/.'});
    });

    const Context=window.AudioContext||window.webkitAudioContext;
    if(Context){
      try{
        const ctx=this.ctx=new Context({latencyHint:'playback'});
        const source=ctx.createMediaElementSource(a);
        this.highShelf=ctx.createBiquadFilter();
        this.highShelf.type='highshelf';
        this.highShelf.frequency.value=3700;
        this.highShelf.gain.value=-3;
        this.lowpass=ctx.createBiquadFilter();
        this.lowpass.type='lowpass';
        this.lowpass.frequency.value=9500;
        this.lowpass.Q.value=.6;
        this.bassShelf=ctx.createBiquadFilter();
        this.bassShelf.type='lowshelf';
        this.bassShelf.frequency.value=115;
        this.bassShelf.gain.value=0;
        this.duck=ctx.createGain();
        this.duck.gain.value=1;
        // Gentle limiter protects the soundtrack without flattening the SFX.
        const compressor=ctx.createDynamicsCompressor();
        compressor.threshold.value=-7;
        compressor.knee.value=8;
        compressor.ratio.value=2;
        compressor.attack.value=.009;
        compressor.release.value=.22;
        this.master=ctx.createGain();
        this.master.gain.value=this.volume;
        this.analyser=ctx.createAnalyser();
        this.analyser.fftSize=512;
        source.connect(this.highShelf);
        this.highShelf.connect(this.lowpass);
        this.lowpass.connect(this.bassShelf);
        this.bassShelf.connect(this.duck);
        this.duck.connect(compressor);
        compressor.connect(this.master);
        this.master.connect(this.analyser);
        this.analyser.connect(ctx.destination);
      }catch(error){
        console.warn('[SNOW64] Music effects could not initialize:',error);
        // The HTMLAudioElement still works on browsers without Web Audio.
      }
    }
    this._updateColor();
    this._updateGain();
  }
  _updateColor(){
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    // Warm filter during airborne play; soft low-pass during a crash.
    this.lowpass?.frequency.setTargetAtTime(
      this._recovery?3850:this._air?7700:this._frost?10500:9600,t,
      this._recovery?.22:.42);
    this.highShelf?.gain.setTargetAtTime(
      this._recovery?-7.5:-2.3-3*this.warmth,t,.26);
    this.bassShelf?.gain.setTargetAtTime(this._frost?1.0:0,t,.3);
  }
  _updateGain(){
    const target=clamp(this.volume*this._mixDuck,0,1);
    if(this.ctx && this.master){
      this.master.gain.setTargetAtTime(target,this.ctx.currentTime,.11);
      this.audio.volume=1;
    }else if(this.audio)this.audio.volume=target;
  }
  setVolume(value){
    this.volume=clamp(value,0,1);
    if(!this._musicMuted)this._savedVolume=this.volume;
    this._updateGain();
  }
  setWarmth(value=.4){this.warmth=clamp(value,0,1);this._updateColor();}
  setTempo(value){
    // External tempo changes remain available, but gameplay favors original rate.
    const requested=clamp(value,BPM*.85,BPM*1.15);
    this.tempo=requested;
    this._normalRate=clamp(requested/BPM,SNOW64_MUSIC_TUNING.normalRateMin,SNOW64_MUSIC_TUNING.normalRateMax);
    if(!this._recovery)this._desiredRate=this._normalRate;
    this._emit('tempo',{bpm:requested});
  }
  setIntensity(value){this.intensity=clamp(value,0,1.35);}
  transitionTo(name,{bars=2}={}){
    if(!['auto','calm','groove','peak'].includes(name))return false;
    this.arrangement=name;
    if(name!=='auto')this.setIntensity({calm:.18,groove:.6,peak:1.2}[name]);
    this._emit('arrangement',{name,bars});
    return true;
  }
  setInstrumentVolume(name,level){
    if(name!=='music')return false;
    this.setVolume(level);return true;
  }
  muteInstrument(name,muted=true){
    if(name!=='music')return false;
    if(muted && !this._musicMuted){this._savedVolume=this.volume;this._musicMuted=true;this.volume=0;}
    else if(!muted && this._musicMuted){this._musicMuted=false;this.volume=this._savedVolume;}
    this._updateGain();return true;
  }
  soloInstrument(name){return name==='music';}

  _beginWipeout(){
    if(this._recovery)return;
    this._recovery=true;
    this._wipeoutStartedAt=monotonicNow();
    this._restorePitchPending=true;
    // Pitch falls together with speed for a cinematic tape-slowing effect.
    this._pitchPreservation(false);
    this._mixDuck=Math.min(this._mixDuck,SNOW64_MUSIC_TUNING.crashVolumeFactor);
    this._updateGain();
    this._updateColor();
    this._emit('wipeout',{time:this.getTime()});
  }
  _endWipeout(){
    if(!this._recovery)return;
    this._recovery=false;
    this._desiredRate=this._normalRate;
    this._updateColor();
    this._emit('recovered',{time:this.getTime()});
  }
  reactToGameEvent(kind){
    if(!this.isPlaying)return;
    const t=this.ctx?.currentTime ?? monotonicNow();
    if(t-(this._lastEvent.get(kind)??-100)<.12)return;
    this._lastEvent.set(kind,t);
    if(kind==='crash'||kind==='rockHit'||kind==='rampHit')this._beginWipeout();
    else if(kind==='shatter'){
      this._mixDuck=Math.min(this._mixDuck,.82);
      this._updateGain();
    }
    if(kind==='power')this._emit('power',{time:this.getTime()});
    if(['pickup','combo','magicTrick','power','shatter','land','superRamp'].includes(kind))
      this._emit('accent',{kind,time:this.getTime(),beat:this.getBeat()});
  }
  updateFromGame({playing=true,speed=21.5,powered=false,inAir=false,recovery=false,tuck=false,steer=0,airHeight=0}={}){
    if(!playing||!this.isPlaying)return;
    const clock=monotonicNow();
    if(clock-this._lastGameUpdate<.13)return;
    this._lastGameUpdate=clock;
    const desiredRate=clamp(
      1 + (speed-21.5)*.0014 + (powered?.018:0) + (tuck?.006:0),
      SNOW64_MUSIC_TUNING.normalRateMin,SNOW64_MUSIC_TUNING.normalRateMax);
    this.tempo=BPM*desiredRate;
    this._normalRate=desiredRate;
    if(recovery&&!this._recovery)this._beginWipeout();
    else if(!recovery&&this._recovery)this._endWipeout();
    if(!this._recovery)this._desiredRate=this._normalRate;
    if(this.arrangement==='auto')this.setIntensity(
      this.intensity+(clamp(.40+speed*.010+(powered?.25:0),.3,1.25)-this.intensity)*.16);
    if(powered!==this._frost||inAir!==this._air){
      this._frost=powered;this._air=inAir;this._updateColor();
    }
    this._emit('motion',{speed,powered,inAir,recovery,tuck,steer,airHeight,bpm:this.getTempo(),intensity:this.intensity});
  }
  _tick(){
    if(!this.isPlaying||!this.audio)return;
    const now=monotonicNow();
    const dt=clamp(now-(this._lastTick||now),.001,.11);
    this._lastTick=now;
    if(this._recovery){
      const age=Math.max(0,now-(this._wipeoutStartedAt??now));
      // Fall: deep slowdown. Chasing the board: a little faster.
      // Remount: glide toward normal before the wipeout finishes.
      const target=age<1.1?.62:age<2.4?.70:.83;
      this._desiredRate=target;
    }
    const tau=this._recovery?SNOW64_MUSIC_TUNING.crashFadeSeconds:SNOW64_MUSIC_TUNING.resumeFadeSeconds;
    const blend=1-Math.exp(-dt/tau);
    this._currentRate+= (this._desiredRate-this._currentRate)*blend;
    if(Math.abs(this._currentRate-this.audio.playbackRate)>.0004){
      this.audio.playbackRate=clamp(this._currentRate,.5,1.15);
    }
    // Keep the tape effect on until the ramp back to normal is almost complete.
    if(this._restorePitchPending&&!this._recovery&&Math.abs(this._currentRate-this._normalRate)<.018){
      this._restorePitchPending=false;
      this._pitchPreservation(true);
    }
    if(this._mixDuck<.999){
      this._mixDuck=Math.min(1,this._mixDuck+dt*(this._recovery?.09:.58));
      this._updateGain();
    }
    const pos=this.getTime();
    const beat=Math.floor(pos*BPM/60);
    if(this._lastPosition-pos>1.2){this._lastBeat=-1;this._emit('loop',{time:pos});}
    if(beat!==this._lastBeat){
      this._lastBeat=beat;
      this._emit('beat',{beat:((beat%4)+4)%4,bar:Math.floor(beat/4),bpm:this.getTempo(),time:pos,phase:this.getBeatPhase()});
    }
    const section=this.getSection();
    if(section!==this._lastSection){this._lastSection=section;this._emit('section',{name:section,time:pos});}
    this._lastPosition=pos;
  }
  async play(){
    if(this.isPlaying)return;
    this._init();
    if(!this.audio)throw new Error('Recorded soundtrack requires a browser.');
    this.audio.loop=this.loop;
    if(this.position>=this.getDuration()-.1)this.position=0;
    if(Math.abs(this.audio.currentTime-this.position)>.1){
      try{this.audio.currentTime=this.position;}catch{}
    }
    if(this.ctx?.state==='suspended')void this.ctx.resume().catch(()=>{});
    this._lastTick=monotonicNow();
    this.audio.playbackRate=this._currentRate;
    // Must be called during the user click or tap for browser autoplay policies.
    const pending=this.audio.play();
    this.isPlaying=true;
    this._timer=setInterval(()=>this._tick(),TICK_MS);
    try{await pending;this._tick();}
    catch(error){
      this.isPlaying=false;
      clearInterval(this._timer);this._timer=null;
      this._emit('error',{message:String(error)});
      throw error;
    }
  }
  async resume(){return this.play();}
  pause(){
    if(!this.audio||!this.isPlaying)return;
    this.position=this.getTime();
    this.isPlaying=false;
    clearInterval(this._timer);this._timer=null;
    this.audio.pause();
  }
  stop(){
    this.pause();
    this.position=0;
    this._lastBeat=-1;this._lastSection='';this._lastPosition=0;
    this._recovery=false;this._wipeoutStartedAt=null;
    this._restorePitchPending=false;
    this._currentRate=1;this._desiredRate=1;this._normalRate=1;
    this.tempo=BPM;this._mixDuck=1;
    this._pitchPreservation(true);
    if(this.audio){try{this.audio.currentTime=0;this.audio.playbackRate=1;}catch{}}
    this._updateColor();this._updateGain();
  }
  seek(seconds){
    const t=clamp(seconds,0,this.getDuration());
    this.position=t;
    if(this.audio){try{this.audio.currentTime=t;}catch{}}
    this._lastPosition=t;this._lastBeat=-1;
  }
  async dispose(){
    this.stop();this._listeners.clear();
    if(this.audio){this.audio.removeAttribute('src');this.audio.load();this.audio=null;}
    if(this.ctx){try{await this.ctx.close();}catch{}}
    this.ctx=null;this.analyser=null;this.master=null;
  }
}
export default ProceduralRapidRain;
export class RapidRainV2 extends ProceduralRapidRain {}
