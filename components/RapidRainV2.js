/**
 * SNOW 64 • Recorded Music V7
 * A polished recorded soundtrack, with reactive Web Audio EQ and volume.
 * Replaces the V2–V6 procedural synth using the SAME public game adapter API.
 *
 * Place this file at components/RapidRainV2.js and audio at:
 *   public/audio/snow64-theme.webm  (Opus, compact)
 *   public/audio/snow64-theme.mp3   (MP3 compatibility fallback)
 *
 * No separate player or external dependency. Audio starts on the game's
 * existing user-initiated Start action. Existing snow64Audio.js SFX remain.
 */

export const BPM = 136; // Estimated original tempo. Change if your music is different.
export const DURATION = 244.824;
export const BAR = 240 / BPM;
export const RAPID_RAIN_LAYERS = Object.freeze(['music']);
export const EVENT_COUNT = 0;
export function buildRapidRainScore() { return []; } // Legacy compatibility only: audio is now recorded.

const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));
const OPUS_URL = '/audio/snow64-theme.webm';
const MP3_URL = '/audio/snow64-theme.mp3';
const TICK_MS = 40;

/** Uses HTMLAudioElement.playbackRate with pitch preservation where available.
 * This is gentler on real music than changing pitch with a buffer oscillator.
 * Avoid extreme rates: real-time time stretching can sound warbly past +/- 15%.
 */
export class ProceduralRapidRain {
  constructor({volume=.43, onEnded=null, sourceOpus=OPUS_URL, sourceMP3=MP3_URL}={}) {
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
    this.master=null;
    this.analyser=null;
    this.warmth=.4;
    this._desiredRate=1;
    this._currentRate=1;
    this._duration=DURATION;
    this._timer=null;
    this._lastBeat=-1;
    this._lastSection='';
    this._lastPosition=0;
    this._lastGameUpdate=0;
    this._lastEvent=new Map();
    this._listeners=new Map();
    this._bins=null;
    this._mixDuck=1;
    this._frost=false;
    this._air=false;
    this._recovery=false;
    this._rateSupportsPitch=true;
    this._usedFallback=false;
  }

  getDuration() { return this._duration; }
  getTime() { return this.audio ? (Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : this.position) : this.position; }
  getProgress() { return this.getTime()/this.getDuration(); }
  getTempo() { return this.tempo; }
  getBeat() { return this.getTime()*BPM/60; }
  getBeatPhase() { const b=this.getBeat(); return b-Math.floor(b); }
  getSection() {
    const t=this.getTime();
    return t<25?'intro':t<68?'cruise':t<118?'downhill':t<171?'high-speed':t<212?'final-run':'outro';
  }
  getEnergy() {
    if(!this.analyser)return 0;
    this._bins ||= new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this._bins);
    let sum=0;
    const max=Math.min(this._bins.length,120);
    for(let i=0;i<max;i++)sum+=this._bins[i];
    return max?sum/(max*255):0;
  }
  on(type,fn) {
    if(typeof fn!=='function')return ()=>{};
    let group=this._listeners.get(type);
    if(!group){group=new Set();this._listeners.set(type,group);}
    group.add(fn);return ()=>this.off(type,fn);
  }
  off(type,fn){this._listeners.get(type)?.delete(fn);}
  _emit(type,payload){
    for(const fn of this._listeners.get(type)||[]){try{fn(payload);}catch(e){console.warn('[SNOW64 music event]',e);}}
  }

  _init() {
    if(this.audio||typeof window==='undefined')return;
    const a=this.audio=new Audio();
    a.preload='auto';
    a.loop=this.loop;
    a.playsInline=true;
    a.volume=1;
    // Playback-rate pitch correction is broadly available in modern browsers.
    // For older WebKit, use the legacy names when exposed.
    if('preservesPitch' in a)a.preservesPitch=true;
    else if('webkitPreservesPitch' in a)a.webkitPreservesPitch=true;
    else if('mozPreservesPitch' in a)a.mozPreservesPitch=true;
    else this._rateSupportsPitch=false;

    const canOpus=!!a.canPlayType?.('audio/webm; codecs="opus"');
    a.src=canOpus ? this.sourceOpus : this.sourceMP3;
    a.addEventListener('loadedmetadata',()=>{
      if(Number.isFinite(a.duration)&&a.duration>2)this._duration=a.duration;
    });
    a.addEventListener('ended',()=>{
      if(this.loop)return;
      this.pause();this._emit('ended',{});this.onEnded?.();
    });
    a.addEventListener('error',()=>{
      // Fallback if WebM is announced as supported but decoding fails.
      if(!this._usedFallback && a.src.includes('snow64-theme.webm')) {
        const time=this.getTime();
        this._usedFallback=true;
        a.src=this.sourceMP3;
        a.load();
        a.addEventListener('loadedmetadata',()=>{
          if(Number.isFinite(time)&&time>0)a.currentTime=Math.min(time,Math.max(0,a.duration-.1));
          if(this.isPlaying)a.play().catch(err=>this._emit('error',{message:String(err)}));
        },{once:true});
      } else this._emit('error',{message:'Cannot load game music. Check public/audio/snow64-theme.mp3 and .webm.'});
    });

    const Context=window.AudioContext||window.webkitAudioContext;
    if(Context){
      try {
        const c=this.ctx=new Context({latencyHint:'playback'});
        const source=c.createMediaElementSource(a);
        this.warmEQ=c.createBiquadFilter();
        this.warmEQ.type='highshelf';this.warmEQ.frequency.value=3700;this.warmEQ.gain.value=-2.6;
        this.lowpass=c.createBiquadFilter();
        this.lowpass.type='lowpass';this.lowpass.frequency.value=10000;this.lowpass.Q.value=.55;
        this.bassEQ=c.createBiquadFilter();
        this.bassEQ.type='lowshelf';this.bassEQ.frequency.value=115;this.bassEQ.gain.value=.2;
        this.duck=c.createGain();this.duck.gain.value=1;
        const comp=c.createDynamicsCompressor();
        comp.threshold.value=-7;comp.ratio.value=2.0;comp.knee.value=9;
        comp.attack.value=.01;comp.release.value=.19;
        this.master=c.createGain();this.master.gain.value=this.volume;
        this.analyser=c.createAnalyser();this.analyser.fftSize=512;
        source.connect(this.warmEQ);
        this.warmEQ.connect(this.lowpass);
        this.lowpass.connect(this.bassEQ);
        this.bassEQ.connect(this.duck);
        this.duck.connect(comp);
        comp.connect(this.master);
        this.master.connect(this.analyser);
        this.analyser.connect(c.destination);
      }catch(error){
        // Audio playback is still possible without effects if the API fails.
        // If MediaElementSource was created, routing may be broken. Surface it.
        console.warn('[SNOW64] Audio effects unavailable',error);
      }
    }else a.volume=this.volume;
    this._updateColor();
  }

  _updateColor(){
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    const brightness=this._frost?1:0;
    // Maintain the song's studio mix; only soften excessively sharp content.
    this.warmEQ?.gain.setTargetAtTime(-2.2-3.6*this.warmth+brightness*.7,t,.25);
    this.lowpass?.frequency.setTargetAtTime(
      (this._recovery?5900:this._air?8200:this._frost?11200:9900)-this.warmth*1100,t,.30);
    this.bassEQ?.gain.setTargetAtTime(this._frost?1.3:.3,t,.35);
    this._updateGain();
  }
  _updateGain(){
    if(!this.ctx){if(this.audio)this.audio.volume=clamp(this.volume*this._mixDuck,0,1);return;}
    const t=this.ctx.currentTime;
    this.master?.gain.setTargetAtTime(this.volume,t,.06);
    this.duck?.gain.setTargetAtTime(this._mixDuck,t,.06);
  }
  setVolume(value){this.volume=clamp(value,0,1);this._updateGain();}
  setWarmth(value=.45){this.warmth=clamp(value,0,1);this._updateColor();}
  setTempo(value){
    // Pitch-preserved changes in the *recording* tempo, not resynthesized notes.
    const next=clamp(value,116,161);
    if(Math.abs(this.tempo-next)<.06)return;
    this.tempo=next;
    this._desiredRate=clamp(next/BPM,.85,1.185);
    this._emit('tempo',{bpm:next});
  }
  setIntensity(value){this.intensity=clamp(value,0,1.35);}
  transitionTo(name,{bars=2}={}){
    if(!['auto','calm','groove','peak'].includes(name))return false;
    this.arrangement=name;
    if(name!=='auto')this.intensity={calm:.18,groove:.6,peak:1.2}[name];
    this._emit('arrangement',{name,bars});return true;
  }
  // One mixed recording has no separate instrument stems to mute or remix.
  // Keep the old method names, but explicitly refuse imaginary stem control.
  setInstrumentVolume(name,level){return name==='music'?(this.setVolume(level),true):false;}
  muteInstrument(name,muted=true){return name==='music'?(this.setVolume(muted?0:.43),true):false;}
  soloInstrument(name){return name==='music';}

  reactToGameEvent(kind){
    if(!this.isPlaying)return;
    const at=this.ctx?.currentTime ?? performance.now()/1000;
    if(at-(this._lastEvent.get(kind)??-100)<.14)return;
    this._lastEvent.set(kind,at);
    if(kind==='power')this._emit('power',{time:this.getTime()});
    if(['pickup','combo','magicTrick','power','shatter','land','superRamp'].includes(kind))
      this._emit('accent',{kind,time:this.getTime(),beat:this.getBeat()});
    // Original game sound effects provide the cues. Avoid piling beeps/drums
    // on top of a finished recording, which previously sounded overcrowded.
    if(['crash','rockHit','rampHit','shatter'].includes(kind)) {
      this._mixDuck=kind==='shatter'?.76:.59;
      this._updateGain();
      // Release duck gradually in the regular playback tick.
    }
  }

  updateFromGame({playing=true,speed=21.5,powered=false,inAir=false,recovery=false,tuck=false,steer=0,airHeight=0}={}){
    if(!playing||!this.isPlaying)return;
    const t=this.ctx?.currentTime??performance.now()/1000;
    if(t-this._lastGameUpdate<.16)return;
    this._lastGameUpdate=t;
    // Input speed comes from the game as meters/second, NOT km/h.
    // 15 m/s = leisurely, 38 = fast tuck, 60 = Frost Shroom speed.
    const desired=clamp(124+(speed-15)*.53+(powered?8:0),119,160);
    this.setTempo(this.tempo+(desired-this.tempo)*.20);
    if(this.arrangement==='auto')this.setIntensity(
      this.intensity+(clamp(.40+speed*.010+(powered?.25:0)+(tuck?.05:0),.3,1.25)-this.intensity)*.16
    );
    if(powered!==this._frost||inAir!==this._air||recovery!==this._recovery){
      this._frost=powered;this._air=inAir;this._recovery=recovery;this._updateColor();
    }
    this._emit('motion',{speed,powered,inAir,recovery,tuck,steer,airHeight,bpm:this.tempo,intensity:this.intensity});
  }

  _tick(){
    if(!this.isPlaying||!this.audio)return;
    // Rate slews gently (no sudden tempo lurch when collecting Frost Shroom).
    const difference=this._desiredRate-this._currentRate;
    this._currentRate+=clamp(difference,-.0035,.0035);
    if(Math.abs(this.audio.playbackRate-this._currentRate)>.0004)this.audio.playbackRate=this._currentRate;
    if(this._mixDuck<.999){this._mixDuck=Math.min(1,this._mixDuck+.014);this._updateGain();}

    const pos=this.getTime();
    const beat=Math.floor(pos*BPM/60);
    if(this._lastPosition-pos>1.2){
      this._lastBeat=-1;
      this._emit('loop',{time:pos});
    }
    if(beat!==this._lastBeat){
      this._lastBeat=beat;
      this._emit('beat',{beat:beat%4,bar:Math.floor(beat/4),bpm:this.tempo,time:pos,phase:this.getBeatPhase()});
    }
    const section=this.getSection();
    if(section!==this._lastSection){this._lastSection=section;this._emit('section',{name:section,time:pos});}
    this._lastPosition=pos;
  }

  async play(){
    if(this.isPlaying)return;
    this._init();
    if(!this.audio)throw new Error('Recorded music requires a browser.');
    this.audio.loop=this.loop;
    if(this.position>=this.getDuration()-.1)this.position=0;
    if(Math.abs(this.audio.currentTime-this.position)>.1){
      try{this.audio.currentTime=this.position;}catch{}
    }
    if(this.ctx?.state==='suspended')void this.ctx.resume().catch(()=>{});
    this.audio.playbackRate=this._currentRate;
    // IMPORTANT: call play() synchronously on the game click to satisfy autoplay.
    const pending=this.audio.play();
    this.isPlaying=true;
    this._timer=setInterval(()=>this._tick(),TICK_MS);
    try{await pending;this._tick();}
    catch(error){
      this.isPlaying=false;clearInterval(this._timer);this._timer=null;
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
    this.pause();this.position=0;this._lastBeat=-1;this._lastSection='';this._lastPosition=0;
    if(this.audio){try{this.audio.currentTime=0;}catch{}}
    this._currentRate=1;this._desiredRate=clamp(this.tempo/BPM,.85,1.185);
  }
  seek(seconds){
    const t=clamp(seconds,0,this.getDuration());this.position=t;
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
