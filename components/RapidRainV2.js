/**
 * SNOW 64 • SOFT SID V6
 * Original minimal C64-inspired music for the PidgeonKitty snowboarding game.
 * Single-file GitHub replacement for components/RapidRainV2.js.
 * No fetched audio, samples, MIDI, MP3s, libraries, or external music player.
 * Warm 3-voice concept: rounded bass, subdued pulse melody, quiet percussion.
 * Randomized but *harmonically constrained* patterns: a new variation per run/loop.
 *
 * Public API deliberately matches snow64Music.js / Snow64ReactiveMusic.jsx.
 * Inspired by the SID chip's simple waveforms, not an exact hardware emulation.
 */

export const BPM = 136;
export const BAR = 240 / BPM;
export const DURATION = BAR * 64;
export const RAPID_RAIN_LAYERS = Object.freeze([
  'pluck', 'bubble', 'lead', 'keys', 'pad', 'bass', 'glitch',
  'kick', 'snare', 'hat', 'rise', 'crash',
]);
const EPS = 0.0001;
const TAU = Math.PI * 2;
const STEP = BAR / 16;
const clamp = (x, a, b) => Math.max(a, Math.min(b, Number(x) || 0));
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function generator(seed) {
  let x = (seed >>> 0) || 36064;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const PROGRESSIONS = [
  [0, 1, 2, 3], [0, 2, 1, 3], [0, 1, 3, 2], [0, 2, 3, 3],
];
// Original key of D major. Chord degrees are curated to prevent random clashes.
const HARMONY = [
  { name:'D',  bass:38, notes:[62,66,69,73] },  // D major
  { name:'Bm', bass:35, notes:[59,62,66,69] },  // B minor
  { name:'G',  bass:43, notes:[59,62,67,71] },  // G major
  { name:'A',  bass:45, notes:[61,64,69,73] },  // A major
];
const MOTIFS = [
  [{s:0,n:0,l:2.5},{s:5,n:1,l:1.7},{s:10,n:2,l:2.7}],
  [{s:2,n:1,l:2.2},{s:7,n:2,l:2.2},{s:12,n:1,l:2.4}],
  [{s:0,n:2,l:2},{s:6,n:1,l:2.8},{s:12,n:0,l:2.1}],
  [{s:2,n:0,l:3},{s:9,n:2,l:2.1}],
  [{s:0,n:1,l:2.5},{s:7,n:0,l:2.4},{s:13,n:1,l:1.5}],
  [{s:4,n:2,l:2},{s:9,n:1,l:2.1},{s:13,n:0,l:1.8}],
];

/** Whole song is regenerated between runs, yet always stays in key and rhythm. */
export function buildRapidRainScore(seed = 36064) {
  const r = generator(seed);
  const events = [];
  const add = (bar, step, type, note=0, steps=1, velocity=1, extra={}) => {
    const t = (bar * 16 + step) * STEP;
    if(t < DURATION - .01) {
      events.push({t,type,note,duration:STEP * steps,velocity,...extra});
    }
  };
  let motif = MOTIFS[0];
  let direction = 0;
  for (let bar=0; bar<64; bar++) {
    const phrase = Math.floor(bar / 4);
    if(bar % 4 === 0) {
      motif = MOTIFS[Math.floor(r() * MOTIFS.length)];
      direction = r() < .27 ? -1 : r() > .74 ? 1 : 0;
    }
    const progression = PROGRESSIONS[(Math.floor(bar/16) + (seed%3))%PROGRESSIONS.length];
    const chord = HARMONY[progression[bar%4]];
    const intro = bar < 4;
    const breakdown = (bar>=28 && bar<36) || (bar>=56 && bar<60);
    const finale = bar>=60;
    const dense = !intro && !breakdown && (bar>=12 && bar<28 || bar>=40 && bar<56);

    // C64-style simple bass: 2-3 short offbeat notes, separated from the kick.
    // No chord stacking, bass overlaps, or resonant sub layers.
    add(bar,2,'bass',chord.bass,2.75,.65);
    if(!intro || bar%2===0) add(bar,7,'bass',chord.bass+7,1.75,.36);
    if(!breakdown && !finale) add(bar,11.25,'bass',chord.bass,2.35,.55);

    // One soft pulse melody voice. 2-3 notes per bar, never higher than D5.
    // Phrases are deliberately sparse, with rests and recognizable shape.
    if(!breakdown || bar%2===0) {
      const rotated = MOTIFS[(MOTIFS.indexOf(motif) + (bar%4===3?1:0))%MOTIFS.length];
      const allowed = intro ? 2 : 3;
      for(const [i,m] of rotated.entries()) {
        if(i>=allowed || (bar%8===7 && i===1) || (r()<.12 && i===2)) continue;
        const note = chord.notes[Math.max(0, Math.min(3, m.n + direction))] - (bar%8>=4?0:0);
        add(bar,m.s,'lead',note,m.l,(intro?.22:.31) * (i===0?1:.83) * (.9+r()*.16));
      }
    }

    // One percussion lane. Very little high-end information.
    // Kick at beat 1/3; a quiet snare on 2/4; hats on selected offbeats only.
    add(bar,0,'kick',0,1.35,.65);
    if(!intro && !breakdown) add(bar,8,'kick',0,1.25,.54);
    if(!intro || bar%2===1) add(bar,4,'snare',0,.8,.27);
    if(!intro && !breakdown) add(bar,12,'snare',0,.8,.25);
    const hats = intro ? [6] : breakdown ? [6,14] : dense ? [2,6,10,14] : [6,14];
    for (const step of hats) {
      if(r()<.11) continue;
      // Velocity variation is bounded and does not brighten the hats.
      add(bar,step,'hat',0,.32,.16 + r()*.07,{ghost:true});
    }
    // One occasional soft percussive turnaround, never a dense drum roll.
    if(dense && bar%8===7 && r()>.55) add(bar,15,'hat',0,.22,.12,{ghost:true});
  }
  events.sort((a,b) => a.t-b.t || a.type.localeCompare(b.type));
  for(const type of ['lead','bass']) {
    const notes = events.filter(ev=>ev.type===type);
    for(let i=0;i<notes.length-1;i++) {
      notes[i].duration=Math.max(.05,Math.min(notes[i].duration,notes[i+1].t-notes[i].t-.035));
    }
  }
  return events;
}
export const EVENT_COUNT = buildRapidRainScore(36064).length;
function binarySearch(events,time) {
  let low=0,high=events.length;
  while(low<high) {const mid=(low+high)>>1;if(events[mid].t<time)low=mid+1;else high=mid;}
  return low;
}

export class ProceduralRapidRain {
  constructor({volume=.58,onEnded=null,seed=null}={}) {
    this.volume=clamp(volume,0,1); this.onEnded=onEnded;
    this.seed=seed; this.run=0; this.score=buildRapidRainScore(seed ?? 36064);
    this.ctx=null; this.master=null; this.analyser=null;this.melodyWave=null;
    this.layerGains={}; this.active=new Set(); this.timer=null;
    this.position=0;this.startPosition=0;this.startCtx=0;this.cursor=0;this.isPlaying=false;
    this.loop=true;this.tempo=BPM;this.intensity=.53;this.arrangement='auto';
    this.layerVolumes=Object.fromEntries(RAPID_RAIN_LAYERS.map(k=>[k,1]));
    this.muted=new Set();this.soloed=new Set();this.listeners=new Map();
    this._lastBeat=-1;this._lastSection='';this._lastGameUpdate=0;this._lastEvent=new Map();
    this._levelData=null;this._lastPowered=false;this._lowpass=null;this._shelf=null;
  }
  getDuration(){return DURATION;}
  getTime() {
    if(!this.isPlaying||!this.ctx)return this.position;
    const time=this.startPosition+Math.max(0,this.ctx.currentTime-this.startCtx)*this.tempo/BPM;
    return this.loop?time%DURATION:Math.min(DURATION,time);
  }
  getTempo(){return this.tempo;}
  getProgress(){return this.getTime()/DURATION;}
  getSection(){const bar=Math.floor(this.getTime()/BAR);return bar<4?'powder intro':bar<28?'snow path':bar<36?'quiet ridge':bar<56?'snow glide':bar<60?'cloud break':'soft landing';}
  getBeat(){return this.getTime()*BPM/60;}
  getBeatPhase(){const beat=this.getBeat();return beat-Math.floor(beat);}
  getEnergy(){
    if(!this.analyser)return 0;
    this._levelData ||= new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this._levelData);
    let sum=0;const count=Math.min(this._levelData.length,160);
    for(let i=0;i<count;i++)sum+=this._levelData[i];
    return count?sum/(255*count):0;
  }
  on(name,callback){if(typeof callback!=='function')return()=>{};let s=this.listeners.get(name);if(!s){s=new Set();this.listeners.set(name,s);}s.add(callback);return()=>this.off(name,callback);}
  off(name,callback){this.listeners.get(name)?.delete(callback);}
  _emit(name,data){for(const cb of this.listeners.get(name)||[]){try{cb(data);}catch(err){console.warn('Soft SID listener error',err);}}}
  setVolume(x){this.volume=clamp(x,0,1);if(this.ctx&&this.master)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.035);}
  setTempo(x){
    const next=clamp(x,85,190);if(Math.abs(next-this.tempo)<.15)return;
    if(this.isPlaying&&this.ctx){this.startPosition=this.getTime();this.startCtx=this.ctx.currentTime;}
    this.tempo=next;this._emit('tempo',{bpm:next});
  }
  setIntensity(x){this.intensity=clamp(x,0,1.35);this._updateMix();}
  setInstrumentVolume(type,level){if(!RAPID_RAIN_LAYERS.includes(type))return false;this.layerVolumes[type]=clamp(level,0,1.5);this._updateMix();return true;}
  muteInstrument(type,value=true){if(!RAPID_RAIN_LAYERS.includes(type))return false;value?this.muted.add(type):this.muted.delete(type);this._updateMix();return true;}
  soloInstrument(type,value=true){if(!RAPID_RAIN_LAYERS.includes(type))return false;value?this.soloed.add(type):this.soloed.delete(type);this._updateMix();return true;}
  transitionTo(name,{bars=2}={}){
    if(!['auto','calm','groove','peak'].includes(name))return false;
    this.arrangement=name;
    if(name!=='auto')this.setIntensity({calm:.18,groove:.6,peak:1.2}[name]);
    this._emit('arrangement',{name,bars});return true;
  }
  setWarmth(amount=.9){
    const warm=clamp(amount,0,1);this.warmth=warm;
    if(this.ctx){const t=this.ctx.currentTime;this._lowpass?.frequency.setTargetAtTime(3300-1500*warm,t,.06);this._shelf?.gain.setTargetAtTime(-5-6*warm,t,.06);}
  }
  reactToGameEvent(kind){
    if(!this.isPlaying||!this.ctx)return;
    const now=this.ctx.currentTime;const last=this._lastEvent.get(kind)??-10;
    if(now-last<.24)return;this._lastEvent.set(kind,now);
    if(kind==='power')this._emit('power',{time:this.getTime()});
    if(['pickup','combo','magicTrick','power','shatter','land','superRamp'].includes(kind)) {
      this._emit('accent',{kind,time:this.getTime(),beat:this.getBeat()});
    }
    // Game's existing sound effects are the accents. No additional beeps,
    // explosions, or extra overlapping percussion are added to the music.
  }
  updateFromGame({playing=true,speed=21.5,powered=false,inAir=false,recovery=false,tuck=false,steer=0,airHeight=0}={}){
    if(!this.isPlaying||!playing||!this.ctx)return;
    const now=this.ctx.currentTime;if(now-this._lastGameUpdate<.18)return;this._lastGameUpdate=now;
    const target=clamp(117+speed*.74+(powered?8:0),112,174);
    this.setTempo(this.tempo+(target-this.tempo)*.20);
    if(this.arrangement==='auto'){
      const energy=recovery?.24:clamp(.40+speed*.010+(powered?.18:0)+(tuck?.06:0),.34,1.18);
      this.setIntensity(this.intensity+(energy-this.intensity)*.13);
    }
    if(powered!==this._lastPowered){this._lastPowered=powered;this._emit('power',{powered,time:this.getTime()});}
    this._emit('motion',{speed,powered,inAir,recovery,tuck,steer,airHeight,bpm:this.tempo,intensity:this.intensity});
  }
  _updateMix(){
    if(!this.ctx)return;const now=this.ctx.currentTime;
    const weights={bass:.80,kick:.65,lead:.38,snare:.23,hat:.16};
    for(const type of ['bass','kick','lead','snare','hat']) {
      const active=!this.muted.has(type) && (!this.soloed.size||this.soloed.has(type));
      const volume=active?weights[type]*(this.layerVolumes[type]??1):0;
      this.layerGains[type]?.gain.setTargetAtTime(volume,now,.04);
    }
  }
  _newSeed(){
    // Each *new run* or complete loop chooses a related, not atonal, variation.
    this.run++;
    const fresh = this.seed===null ? (Math.floor(Math.random()*0xffffffff)>>>0) : (this.seed + this.run*7919)>>>0;
    this.score=buildRapidRainScore(fresh);
    this.cursor=binarySearch(this.score,this.position);
    this._emit('variation',{run:this.run,seed:fresh});
  }
  async _ensureAudio(){
    if(this.ctx){if(this.ctx.state==='suspended')await this.ctx.resume();return;}
    const AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!AudioContextClass)throw new Error('Web Audio unavailable');
    const c=this.ctx=new AudioContextClass({latencyHint:'interactive'});
    const master=this.master=c.createGain();master.gain.value=this.volume;
    const comp=c.createDynamicsCompressor();comp.threshold.value=-17;comp.knee.value=14;comp.ratio.value=2;
    comp.attack.value=.012;comp.release.value=.2;
    this._shelf=c.createBiquadFilter();this._shelf.type='highshelf';this._shelf.frequency.value=1350;this._shelf.gain.value=-10;
    this._lowpass=c.createBiquadFilter();this._lowpass.type='lowpass';this._lowpass.frequency.value=2000;this._lowpass.Q.value=.55;
    this.analyser=c.createAnalyser();this.analyser.fftSize=512;
    master.connect(this._shelf);this._shelf.connect(this._lowpass);this._lowpass.connect(comp);comp.connect(this.analyser);this.analyser.connect(c.destination);
    // All sound sources route through one low-volume mono-compatible console mix.
    for(const type of ['bass','lead','kick','snare','hat']) {
      const gain=this.layerGains[type]=c.createGain();gain.gain.value=0;
      if(type==='bass'){this.bassDucker=c.createGain();this.bassDucker.gain.value=1;gain.connect(this.bassDucker);this.bassDucker.connect(master);}
      else gain.connect(master);
    }
    // Narrow pulse with its high harmonics deliberately attenuated.
    const real=new Float32Array(13),imag=new Float32Array(13);const duty=.32;
    for(let i=1;i<real.length;i++) {
      const damp=1/(1+(i/4)**2);
      real[i]=Math.sin(TAU*i*duty)*damp/(Math.PI*i);
      imag[i]=(1-Math.cos(TAU*i*duty))*damp/(Math.PI*i);
    }
    this.melodyWave=c.createPeriodicWave(real,imag,{disableNormalization:false});
    // 100 ms buffer for *synthesized* filtered noise. It is never downloaded.
    const buffer=this.noiseBuffer=c.createBuffer(1,Math.ceil(c.sampleRate*.13),c.sampleRate);
    const data=buffer.getChannelData(0);let seed=136016,lp=0;
    for(let i=0;i<data.length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const white=(seed/2147483648)-1;lp=.64*lp+.36*white;data[i]=lp;
    }
    this._updateMix();
  }
  _track(nodes,end){
    for(const n of nodes){if(typeof n.stop==='function')this.active.add(n);}
    const source=nodes.find(n=>typeof n.stop==='function');
    if(source)source.onended=()=>{for(const n of nodes){this.active.delete(n);try{n.disconnect();}catch{}}};
  }
  _melody(ev,t,duration){
    const c=this.ctx;const volume=ev.velocity;
    const osc=c.createOscillator();osc.setPeriodicWave(this.melodyWave);
    osc.frequency.setValueAtTime(hz(ev.note),t);
    // A tiny vibrato bloom; never a sharp wobbling digital beep.
    const env=c.createGain();env.gain.setValueAtTime(EPS,t);
    env.gain.linearRampToValueAtTime(volume*.25,t+.018);
    env.gain.setTargetAtTime(volume*.19,t+.034,.060);
    const off=t+Math.max(.11,duration*.85);
    env.gain.setTargetAtTime(EPS,off,.033);
    const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1150;filter.Q.value=.65;
    osc.connect(filter);filter.connect(env);env.connect(this.layerGains.lead);
    const stop=off+.20;osc.start(t);osc.stop(stop);this._track([osc,filter,env],stop);
  }
  _bass(ev,t,duration){
    const c=this.ctx,osc=c.createOscillator();osc.type='triangle';
    const freq=hz(ev.note);osc.frequency.setValueAtTime(freq,t);
    const env=c.createGain();env.gain.setValueAtTime(EPS,t);
    env.gain.linearRampToValueAtTime(ev.velocity*.36,t+.014);
    const off=t+Math.max(.08,duration*.92);
    env.gain.setTargetAtTime(EPS,off,.025);
    const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=520;lp.Q.value=.5;
    osc.connect(lp);lp.connect(env);env.connect(this.layerGains.bass);
    osc.start(t);osc.stop(off+.16);this._track([osc,lp,env],off+.16);
  }
  _kick(ev,t){
    const c=this.ctx,osc=c.createOscillator(),env=c.createGain();osc.type='sine';
    osc.frequency.setValueAtTime(115,t);osc.frequency.exponentialRampToValueAtTime(52,t+.065);
    env.gain.setValueAtTime(EPS,t);env.gain.linearRampToValueAtTime(ev.velocity*.24,t+.009);
    env.gain.exponentialRampToValueAtTime(EPS,t+.14);
    osc.connect(env);env.connect(this.layerGains.kick);osc.start(t);osc.stop(t+.17);this._track([osc,env],t+.17);
    // Dedicated sidechain duck protects the kick transient from bass masking.
    const bass=this.bassDucker;
    if(bass){bass.gain.setValueAtTime(1,t-.002);bass.gain.linearRampToValueAtTime(.62,t+.006);bass.gain.linearRampToValueAtTime(1,t+.13);}
  }
  _noise(ev,t,type){
    const c=this.ctx,src=c.createBufferSource(),f=c.createBiquadFilter(),env=c.createGain();
    src.buffer=this.noiseBuffer;
    const dur=type==='hat'?.038:.10;
    f.type='bandpass';f.frequency.value=type==='hat'?970:630;f.Q.value=type==='hat'?.72:.52;
    env.gain.setValueAtTime(EPS,t);env.gain.linearRampToValueAtTime(ev.velocity*.13,t+.004);
    env.gain.exponentialRampToValueAtTime(EPS,t+dur);
    src.connect(f);f.connect(env);env.connect(this.layerGains[type]);src.start(t);src.stop(t+dur+.008);
    this._track([src,f,env],t+dur+.008);
  }
  _playEvent(ev,t,rate){
    if(ev.type==='bass')this._bass(ev,t,ev.duration/rate);
    else if(ev.type==='lead')this._melody(ev,t,ev.duration/rate);
    else if(ev.type==='kick')this._kick(ev,t);
    else if(ev.type==='snare'||ev.type==='hat')this._noise(ev,t,ev.type);
  }
  _tick(){
    if(!this.isPlaying||!this.ctx)return;
    const now=this.ctx.currentTime,rate=this.tempo/BPM,horizon=now+.09;
    while(this.cursor<this.score.length){
      const ev=this.score[this.cursor];
      const t=this.startCtx+(ev.t-this.startPosition)/rate;
      if(t>horizon)break;
      this.cursor++;
      if(t<now-.025)continue;
      // Optional density follows pace without generating extra crowded voices.
      if(ev.type==='hat'&&this.intensity<.48 && ev.t%BAR>STEP*10)continue;
      if(ev.type==='lead'&&this.intensity<.34 && ev.velocity<.28)continue;
      this._playEvent(ev,Math.max(t,now+.003),rate);
    }
    const elapsed=this.startPosition+Math.max(0,now-this.startCtx)*rate;
    const beatIndex=Math.floor(elapsed*BPM/60);
    if(beatIndex!==this._lastBeat){this._lastBeat=beatIndex;this._emit('beat',{beat:((beatIndex%4)+4)%4,bar:Math.floor(beatIndex/4),bpm:this.tempo,time:this.getTime(),phase:this.getBeatPhase()});}
    const sect=this.getSection();if(sect!==this._lastSection){this._lastSection=sect;this._emit('section',{name:sect,time:this.getTime()});}
    const ending=this.startCtx+(DURATION-this.startPosition)/rate;
    if(this.loop && this.cursor>=this.score.length && horizon>=ending){
      this.startCtx=ending;this.startPosition=0;this.cursor=0;this._lastBeat=-1;
      this._newSeed();this._emit('loop',{time:0});
    }else if(!this.loop&&elapsed>=DURATION){
      this.pause();this.position=DURATION;this._emit('ended',{});if(this.onEnded)this.onEnded();
    }
  }
  _killVoices(){
    if(!this.ctx)return;
    for(const src of this.active){try{src.stop(this.ctx.currentTime);}catch{}}
    this.active.clear();
  }
  async play(){
    if(this.isPlaying)return;
    await this._ensureAudio();
    if(this.position>=DURATION-.01)this.position=0;
    if(this.position===0)this._newSeed();
    this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.012);
    this.startPosition=this.position;this.startCtx=this.ctx.currentTime+.065;
    this.cursor=binarySearch(this.score,this.startPosition);this._lastBeat=-1;this._lastSection='';
    this.isPlaying=true;this._tick();this.timer=setInterval(()=>this._tick(),25);
  }
  async resume(){return this.play();}
  pause(){if(!this.isPlaying)return;this.position=this.getTime();this.isPlaying=false;clearInterval(this.timer);this.timer=null;this._killVoices();if(this.ctx)this.master.gain.setTargetAtTime(EPS,this.ctx.currentTime,.015);}
  stop(){this.pause();this.position=0;this._lastBeat=-1;this._lastPowered=false;}
  seek(seconds){const playing=this.isPlaying;this.pause();this.position=clamp(seconds,0,DURATION);if(playing)this.play();}
  async dispose(){this.stop();this.listeners.clear();if(this.ctx){try{await this.ctx.close();}catch{}this.ctx=null;}}
}
export default ProceduralRapidRain;
export class RapidRainV2 extends ProceduralRapidRain {}
