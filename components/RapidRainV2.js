/**
 * PROCEDURAL RAPID RAIN
 * Pure Web Audio composition, no fetch(), samples, MP3, MIDI or dependencies.
 * Music reconstructed in the style of the user-provided reference (not an exact
 * stem transcription). Measured reference duration: 244.824 seconds.
 * Estimated pulse: 136 BPM; tonal center: Eb major.
 *
 * V3 CLEAN RHYTHM MIX: controlled N64-inspired kick/bass/hat soundtrack.
 * Space between hits, non-overlapping monophonic bass, kick-to-bass ducking,
 * restrained hats, centered drums, dry transient buses and clean master.
 * No piano or marimba in the score; no external samples or audio assets.
 * Live tempo, arrangement, game events and beat sync remain available.
 * Not an extraction of any commercial game or any prerecorded samples.
 * Browser:
 *   const music = new ProceduralRapidRain();
 *   await music.play(); // MUST be initiated by a user click/tap
 *   music.pause(); music.resume(); music.stop(); music.seek(90);
 *   music.setVolume(0.65); music.getTime(); music.getDuration();
 */
export const BPM = 136;
export const DURATION = 244.824;
export const RAPID_RAIN_LAYERS = Object.freeze(['pluck','bubble','lead','keys','pad','bass','glitch','kick','snare','hat','rise','crash']);
const DRUM_LAYERS = new Set(['kick','snare','hat']);
export const BAR = 240 / BPM;
const STEP = BAR / 16;
const TAU = 2 * Math.PI;
const EPS = 0.00008;
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const frac = (x) => x - Math.floor(x);
function rand(n, salt = 0) {
  return frac(Math.sin(n * 127.1 + salt * 311.7 + 17.23) * 43758.5453123);
}
function choose(arr, index) { return arr[((index % arr.length) + arr.length) % arr.length]; }

const CHORDS = [
  { root:39, upper:[75,79,82,86,89], pad:[63,67,70,74] }, // Eb maj9
  { root:34, upper:[70,74,77,82,84], pad:[58,62,65,70] }, // Bb add9
  { root:36, upper:[72,75,79,82,87], pad:[60,63,67,70] }, // C min7
  { root:32, upper:[68,72,75,79,82], pad:[56,60,63,67] }, // Ab maj9
  { root:39, upper:[75,79,82,87,89], pad:[63,67,70,75] }, // Eb6/9
  { root:31, upper:[67,70,74,77,82], pad:[55,58,62,65] }, // G min7
  { root:32, upper:[68,72,75,79,84], pad:[56,60,63,67] }, // Ab maj7
  { root:34, upper:[70,74,77,80,82], pad:[58,62,65,68] }, // Bb7
];
// Mid-register adventure-game lead (D4 to C6), an octave below V2.
const EB_LEAD = [62,63,65,67,68,70,72,74,75,77,79,80,82,84];
const MELODIES = [
  [[0,1,2],[3,3,2],[6,5,2],[9,4,2],[12,3,3],[16,1,2],[19,5,2],[22,7,2],[25,5,2],[28,3,3]],
  [[0,5,2],[2,7,2],[5,8,2],[8,7,3],[12,5,2],[15,4,2],[18,3,1],[20,5,2],[23,8,2],[26,7,2],[29,5,2]],
  [[0,3,2],[4,4,2],[6,5,2],[8,7,2],[11,5,2],[14,3,2],[17,4,2],[20,7,3],[24,8,2],[27,7,2],[30,5,1]],
  [[0,1,2],[2,3,2],[4,5,2],[7,7,2],[10,8,2],[13,7,2],[16,5,2],[19,4,2],[22,3,2],[25,5,2],[28,7,4]],
];
function section(bar) {
  // Dynamic drum/bass score: variations are rhythmic, not lead-instrument driven.
  if (bar < 2) return {name:'snow rumble',energy:.53, lead:false, drums:.76, pad:.08};
  if (bar < 8) return {name:'opening grooves',energy:.68, lead:false, drums:.92, pad:.09};
  if (bar < 16) return {name:'first downhill',energy:.84, lead:false, drums:1, pad:.08};
  if (bar < 32) return {name:'powder breaks',energy:.97, lead:false, drums:1.07, pad:.1};
  if (bar < 48) return {name:'slalom drive',energy:1.12, lead:false, drums:1.12, pad:.08};
  if (bar < 64) return {name:'ridge rollers',energy:.87, lead:false, drums:.98, pad:.1};
  if (bar < 80) return {name:'arcade downhill',energy:1.13, lead:false, drums:1.13, pad:.07};
  if (bar < 96) return {name:'cloudline bounce',energy:.92, lead:false, drums:1.04, pad:.1};
  if (bar < 112) return {name:'frost sprint',energy:1.19, lead:false, drums:1.15, pad:.08};
  if (bar < 124) return {name:'final snow rush',energy:1.08, lead:false, drums:1.1, pad:.1};
  if (bar < 132) return {name:'mountain rolloff',energy:.83, lead:false, drums:.95, pad:.1};
  return {name:'loop landing',energy:.64, lead:false, drums:.8, pad:.07};
}

/** A compact retro breakbeat score. ALL notes are oscillators/noise, never audio files.
 * The dominant instruments are kick, hat, bass and a little dusty snare.
 * No EP, wooden marimba, pluck or bell events are emitted in the song score.
 */
export function buildRapidRainScore() {
  const e = [];
  const add=(bar,step,type,note=0,duration=STEP,velocity=1,pan=0,extras={})=>{
    const t=bar*BAR + step*STEP;
    if(t<0 || t>=DURATION-.04)return;
    e.push({t,type,note,duration,velocity,pan,...extras});
  };
  // Two or three kicks per bar, deliberately away from the snare backbeats.
  // Close-spaced 16th kick rolls were the main cause of the muddy low-end.
  const KICKS=[
    [0,8,11], [0,7,10], [0,6,10.5], [0,8,14],
    [0,6.5,11], [0,9,13], [0,7.5,10], [0,8,11.5],
  ];
  // Four notes per bar, with rhythmic gaps. A clean monophonic lane means
  // the preceding bass note is always released before the next one.
  const BASSES=[
    [[0,0,2.8],[3.75,0,1.45],[7.25,7,2.15],[11.25,0,2.4]],
    [[0,0,3.1],[5.1,7,1.3],[8.4,0,2.1],[12.5,12,1.7]],
    [[0,0,2.45],[3.3,0,1.15],[7.6,7,2.45],[12.1,0,2.6]],
    [[0,0,3.0],[5.4,12,1.2],[9,0,1.7],[13.25,7,1.75]],
  ];
  for(let bar=0;bar<139;bar++) {
    const s=section(bar),ch=CHORDS[bar%CHORDS.length];
    const energy=s.energy, late=bar>=132, fill=bar%8===7;
    const drop=bar%16===15;
    // Very quiet pad texture only every 16 bars: not a piano/mallet layer.
    if(bar>0 && bar%16===0 && bar<129) {
      add(bar,0,'pad',ch.root+24,STEP*14,.028,0,{bright:false});
    }
    const bass=BASSES[(Math.floor(bar/2)+bar%2)%BASSES.length];
    for(let i=0;i<bass.length;i++) {
      const [st,pitch,steps]=bass[i];
      // Lift only the deepest G/Ab roots into a cleaner mid-bass register.
      // The kick owns 40-70 Hz, while bass fundamentals remain audible.
      const note=ch.root+pitch+(ch.root<=32?12:0);
      const velocity=(pitch===12?.33:.45)*(.91+energy*.11)*(i===0?1.08:1);
      add(bar,st,'bass',note,STEP*steps,velocity,0,{slide:i===1,squawk:i===2});
    }
    const kickSteps=KICKS[(bar+Math.floor(bar/8))%KICKS.length];
    kickSteps.forEach((st,i)=>{
      if(late && i>1 && bar%2)return;
      // Keep kick strengths repeatable and leave the main downbeat full-sized.
      add(bar,st,'kick',0,STEP*1.6,(i===0?.87:.63)*(.91+.08*energy),0,
        {accent:i===0});
    });
    // One clean backbeat on 2 and 4, fewer ghost snare collisions.
    [4,12].forEach((st,i)=>add(bar,st,'snare',0,STEP*.80,
      (i===1?.40:.41)*(.87+.11*energy),0));
    if(bar>=8 && !late && bar%4===1) {
      add(bar,14.6,'snare',0,STEP*.36,.105,0,{ghost:true});
    }
    // Eight closed hats per bar, with two optional ghost ticks maximum.
    // Hats under the snare are reduced and kick-adjacent ones are softened.
    for(let st=0;st<16;st+=2) {
      const offbeat=st%4===2;
      const onSnare=st===4||st===12;
      const swing=offbeat?.12:0;
      const human=(rand(bar*101+st,17)-.5)*.025;
      const opened=st===14 && bar%8===6;
      const v=(offbeat?.32:.23)*(onSnare?.54:1)*(opened?.78:1)*(.9+energy*.06);
      add(bar,st+swing+human,'hat',0,STEP*(opened?.87:.38),v,
        offbeat?.13:-.11,{open:opened});
    }
    if(bar>=8 && !late && energy>.92 && !fill) {
      [3.55,11.55].forEach((st,i)=>add(bar,st,'hat',0,STEP*.22,
        .115,i?.09:-.09,{ghost:true}));
    }
    // Short deliberate fills: two extra hats + a single ghost snare,
    // rather than the previous wall of overlapping snare/hat rolls.
    if(fill && bar>=7 && !late) {
      [13.4,15.3].forEach((st,i)=>add(bar,st,'hat',0,STEP*.20,
        .135,i?.13:-.13,{ghost:true}));
      add(bar,15,'snare',0,STEP*.35,.14,0,{ghost:true});
    }
    // Restrained transitions, never a long noisy wash over the next groove.
    if(drop && bar<125) add(bar,14,'rise',0,STEP*2,.075,0);
    if(bar>0 && bar%16===0 && bar<129) add(bar,0,'crash',0,.20,.065,0);
  }
  e.sort((a,b)=>a.t-b.t);
  // Ensure bass notes, including adjacent bars, are strictly monophonic.
  // Subtract a small gap for oscillator releases and the kick sidechain.
  const bass=e.filter(ev=>ev.type==='bass');
  for(let i=0;i<bass.length-1;i++) {
    bass[i].duration=Math.min(bass[i].duration,
      Math.max(.04,bass[i+1].t-bass[i].t-.055));
  }
  return e;
}
const SCORE = buildRapidRainScore();
export const EVENT_COUNT = SCORE.length;
function lowerBound(events,t) {
  let a=0,b=events.length;
  while(a<b) {const m=(a+b)>>1;if(events[m].t<t)a=m+1;else b=m;}
  return a;
}

/** Full Web Audio player. An AudioContext is created only after user interaction. */
export class ProceduralRapidRain {
  constructor({volume=.72, onEnded=null}={}) {
    this.ctx=null; this.master=null; this.musicBus=null;this.drumBus=null;
    this.fxReverb=null;this.fxDelay=null;
    this.active=new Set();this.timer=null;this.isPlaying=false;
    this.position=0;this.startPosition=0;this.startCtx=0;this.cursor=0;
    this.volume=clamp(volume,0,1);this.onEnded=onEnded;
    this.score=SCORE;
    this.tempo=BPM;this.loop=true;
    this.warmth=.73;
    this.intensity=.63;this.arrangement='auto';
    this.layerVolumes=Object.fromEntries(RAPID_RAIN_LAYERS.map(type=>[type,1]));
    this.muted=new Set();this.soloed=new Set();
    this.layerGains={};this.reverbGates={};this.delayGates={};
    this.listeners=new Map();this._lastBeat=-1;this._lastSection='';
    this._lastGameUpdate=0;this._eventAt=new Map();
    this._eventInstrument='pluck';
  }
  getDuration() {return DURATION;}
  getTime() {
    if(!this.isPlaying||!this.ctx)return this.position;
    const elapsed=this.startPosition+Math.max(0,this.ctx.currentTime-this.startCtx)*this.tempo/BPM;
    return this.loop ? elapsed%DURATION : clamp(elapsed,0,DURATION);
  }
  getSection() {return section(Math.min(138,Math.floor(this.getTime()/BAR))).name;}
  getTempo() {return this.tempo;}
  getBeat() {return this.getTime()*BPM/60;}
  getBeatPhase() {const beat=this.getBeat();return beat-Math.floor(beat);}
  /** The analyser can drive a Three.js visualizer without audio-file decoding. */
  getEnergy() {
    if(!this.analyser)return 0;
    if(!this._energyBins)this._energyBins=new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this._energyBins);
    let sum=0;for(let i=0;i<this._energyBins.length;i++)sum+=this._energyBins[i];
    return sum/(255*this._energyBins.length);
  }
  on(event,callback) {
    if(typeof callback!=='function')return()=>{};
    let handlers=this.listeners.get(event);
    if(!handlers){handlers=new Set();this.listeners.set(event,handlers);}
    handlers.add(callback);return()=>this.off(event,callback);
  }
  off(event,callback) {this.listeners.get(event)?.delete(callback);}
  _emit(event,payload) {
    for(const callback of this.listeners.get(event)||[]) {
      try{callback(payload);}catch(error){console.error('Rapid Rain music listener:',error);}
    }
  }
  /** Tempo adjusts the score clock, never oscillator pitch. Safe while playing. */
  setTempo(bpm) {
    const next=clamp(Number(bpm)||BPM,75,205);
    if(Math.abs(next-this.tempo)<.16)return;
    if(this.isPlaying&&this.ctx){
      const songTime=this.getTime();
      this.startPosition=songTime;
      this.startCtx=this.ctx.currentTime;
    }
    this.tempo=next;
    if(this.delay && this.ctx)this.delay.delayTime.setTargetAtTime((60/next)*.75,this.ctx.currentTime,.04);
    this._emit('tempo',{bpm:next});
  }
  setInstrumentVolume(type,level) {
    if(!RAPID_RAIN_LAYERS.includes(type))return false;
    this.layerVolumes[type]=clamp(Number(level)||0,0,1.5);
    this._refreshLayerGains();return true;
  }
  muteInstrument(type,muted=true) {
    if(!RAPID_RAIN_LAYERS.includes(type))return false;
    if(muted)this.muted.add(type);else this.muted.delete(type);
    this._refreshLayerGains();return true;
  }
  soloInstrument(type,solo=true) {
    if(!RAPID_RAIN_LAYERS.includes(type))return false;
    if(solo)this.soloed.add(type);else this.soloed.delete(type);
    this._refreshLayerGains();return true;
  }
  setIntensity(value) {
    this.intensity=clamp(Number(value)||0,0,1.35);
    this._refreshLayerGains();
  }
  /** Manual mix scene; 'auto' returns control to game-speed adaptation. */
  transitionTo(name,{bars=2}={}) {
    if(!['auto','calm','groove','peak'].includes(name))return false;
    this.arrangement=name;
    if(name!=='auto') {
      this.intensity={calm:.12,groove:.62,peak:1.26}[name];
      this._refreshLayerGains(Math.max(.05,bars*4*60/this.tempo/2));
    }
    this._emit('arrangement',{name,bars});return true;
  }
  _refreshLayerGains(smoothing=.10) {
    if(!this.ctx)return;
    const now=this.ctx.currentTime;
    for(const type of RAPID_RAIN_LAYERS) {
      if(!this.layerGains[type])continue;
      // Drum/bass-first default mix. Other lanes are still independently
      // controllable by the public remix API, but intentionally very quiet.
      const weight=type==='kick'?(.83+.09*this.intensity)
        :type==='hat'?(.62+.11*this.intensity)
        :type==='bass'?(.80+.12*this.intensity)
        :type==='snare'?(.69+.09*this.intensity)
        :type==='pad'?(.055+.01*this.intensity)
        :type==='lead'?(.065+.01*this.intensity)
        :type==='glitch'?(.055+.01*this.intensity)
        :type==='rise'||type==='crash'?.10
        :.025;
      const audible=!this.muted.has(type) && (this.soloed.size===0||this.soloed.has(type));
      const gain=audible?this.layerVolumes[type]*Math.max(.01,weight):0;
      for(const node of [this.layerGains[type],this.reverbGates[type],this.delayGates[type]]) {
        node?.gain.setTargetAtTime(gain,now,Math.max(.025,smoothing));
      }
    }
  }
  /** Gameplay events accent the arrangement while leaving all original SFX intact. */
  reactToGameEvent(kind) {
    if(!this.isPlaying||!this.ctx)return;
    const now=this.ctx.currentTime;
    const last=this._eventAt.get(kind)||-100;
    if(now-last<({shatter:.12,magicTrick:.22,pickup:.1,trickStart:.12}[kind]||.07))return;
    this._eventAt.set(kind,now);
    if(kind==='power')this._emit('power',{time:this.getTime()});
    if(['shatter','power','combo','superRamp','magicTrick','land'].includes(kind)) {
      this._emit('accent',{kind,time:this.getTime(),beat:this.getBeat()});
    }
    // Gameplay remains reactive without multiplying kick/bass voices.
    // Accents intentionally avoid the sub-bass and the existing SFX frequencies.
    if(['pickup','combo','magicTrick','power','shatter'].includes(kind)) {
      const next=now+.025;
      const level=kind==='pickup'?.11:kind==='shatter'?.17:.14;
      this._scheduleNote({type:'hat',note:0,duration:.026,velocity:level,
        pan:0,ghost:true,open:false},next);
    }
    if(['rockHit','crash','rampHit','shatter'].includes(kind) && this.duck) {
      const depth=kind==='shatter'?.67:.43;
      const hold=kind==='shatter'?.23:.46;
      this.duck.gain.cancelScheduledValues(now);
      this.duck.gain.setValueAtTime(this.duck.gain.value,now);
      this.duck.gain.linearRampToValueAtTime(depth,now+.018);
      this.duck.gain.linearRampToValueAtTime(1,now+hold);
    }
  }
  /** Call from requestAnimationFrame; updates the music at low frequency. */
  updateFromGame({playing=true,speed=21.5,powered=false,inAir=false,recovery=false,tuck=false,airHeight=0,steer=0}={}) {
    if(!this.isPlaying||!playing||!this.ctx)return;
    const now=this.ctx.currentTime;
    if(now-this._lastGameUpdate<.18)return;
    this._lastGameUpdate=now;
    const targetBpm=clamp(118+Math.max(0,speed)*.70+(powered?8:0),118,174);
    this.setTempo(this.tempo+(targetBpm-this.tempo)*.24);
    if(this.arrangement==='auto') {
      let target=clamp(.25+speed/72+(powered?.32:0)+(tuck?.08:0)+(inAir?.07:0),.18,1.3);
      if(recovery)target=.17;
      this.setIntensity(this.intensity+(target-this.intensity)*.22);
    }
    this._emit('motion',{speed,powered,inAir,recovery,steer,airHeight,bpm:this.tempo,intensity:this.intensity});
  }
  /** Optional programmatic warmth: 1 = darkest N64 mix; 0 = brighter. */
  setWarmth(amount=0.78) {
    const warmth=clamp(Number(amount)||0,0,1);
    if(this.ctx && this.toneLowpass && this.toneShelf) {
      this.toneLowpass.frequency.setTargetAtTime(7200-warmth*3100,this.ctx.currentTime,.08);
      this.toneShelf.gain.setTargetAtTime(-1.5-warmth*6.5,this.ctx.currentTime,.08);
    }
    this.warmth=warmth;
  }
  getProgress() {return this.getTime()/DURATION;}
  setVolume(v) {
    this.volume=clamp(Number(v)||0,0,1);
    if(this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.025);
  }
  async _ensureAudio() {
    if(this.ctx) {if(this.ctx.state==='suspended')await this.ctx.resume();return;}
    const Constructor=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Constructor) throw new Error('Web Audio is not supported by this browser.');
    const c=this.ctx=new Constructor({latencyHint:'interactive'});
    const master=this.master=c.createGain();master.gain.value=this.volume;
    // Clean headroom rather than loud saturation: guard against stacked hits.
    const comp=c.createDynamicsCompressor();
    comp.threshold.value=-12;comp.knee.value=7;comp.ratio.value=3.1;
    comp.attack.value=.004;comp.release.value=.12;
    this.duck=c.createGain();this.duck.gain.value=1;
    // Console-inspired warm bandwidth: less glassy top, strong midrange.
    const hiShelf=this.toneShelf=c.createBiquadFilter();hiShelf.type='highshelf';
    hiShelf.frequency.value=2800;hiShelf.gain.value=-4.5;
    const lo=this.toneLowpass=c.createBiquadFilter();lo.type='lowpass';
    lo.frequency.value=5200;lo.Q.value=.64;
    const subClean=c.createBiquadFilter();subClean.type='highpass';
    subClean.frequency.value=31;subClean.Q.value=.65;
    // No waveshaper: the old tanh stage smeared overlapping transients.
    master.connect(this.duck);this.duck.connect(subClean);
    subClean.connect(hiShelf);hiShelf.connect(lo);lo.connect(comp);
    this.analyser=c.createAnalyser();this.analyser.fftSize=512;
    this.analyser.smoothingTimeConstant=.8;
    comp.connect(this.analyser);this.analyser.connect(c.destination);
    this.musicBus=c.createGain();this.drumBus=c.createGain();
    this.musicBus.gain.value=.74;this.drumBus.gain.value=.76;
    this.musicBus.connect(master);this.drumBus.connect(master);
    // Kick-triggered gain dip makes space for the kick fundamental.
    // This is an AudioParam envelope, no extra JS timer or sample loading.
    this.bassDuck=c.createGain();this.bassDuck.gain.value=1;
    this.bassDuck.connect(this.musicBus);
    // Generate impulse response from math/noise: NOT a sample or network file.
    // Tiny bandlimited ROM-like wavetables synthesized in memory, not sampled.
    const makeWave=(harmonics)=>{
      const real=new Float32Array(harmonics.length+1);
      const imag=new Float32Array(harmonics.length+1);
      harmonics.forEach((strength,i)=>{imag[i+1]=strength;});
      return c.createPeriodicWave(real,imag);
    };
    this.epWave=makeWave([1,.18,.19,.07,.045]);
    this.brassWave=makeWave([1,.36,.21,.10,.055,.028]);
    const len=Math.floor(c.sampleRate*1.7);
    const ir=c.createBuffer(2,len,c.sampleRate);
    for(let channel=0;channel<2;channel++) {
      const d=ir.getChannelData(channel);
      for(let i=0;i<len;i++) {
        const t=i/c.sampleRate;
        const noise=rand(i+channel*100003,198)-.5;
        const early= t<.075 ? .35:1;
        d[i]=noise*(Math.exp(-3.9*t)+.20*Math.exp(-1.7*t))*early*.75;
      }
    }
    this.revIn=c.createGain();this.revIn.gain.value=1;
    const rev=c.createConvolver();rev.buffer=ir;
    const revWet=c.createGain();revWet.gain.value=.017;
    const revTone=c.createBiquadFilter();revTone.type='lowpass';revTone.frequency.value=2500;
    this.revIn.connect(rev);rev.connect(revTone);revTone.connect(revWet);revWet.connect(master);
    this.delayIn=c.createGain();
    const dl=this.delay=c.createDelay(1.2);dl.delayTime.value=STEP*3;
    const feedback=c.createGain();feedback.gain.value=.11;
    const dlTone=c.createBiquadFilter();dlTone.type='lowpass';dlTone.frequency.value=2000;
    const dlWet=c.createGain();dlWet.gain.value=.010;
    this.delayIn.connect(dl);dl.connect(dlTone);dlTone.connect(feedback);
    feedback.connect(dl);dlTone.connect(dlWet);dlWet.connect(master);
    // Each lane gets its own dry and FX gates for live mute/solo/remixing.
    for(const type of RAPID_RAIN_LAYERS){
      const channel=this.layerGains[type]=c.createGain();
      const rev=this.reverbGates[type]=c.createGain();
      const delay=this.delayGates[type]=c.createGain();
      channel.gain.value=1;rev.gain.value=1;delay.gain.value=1;
      channel.connect(type==='bass'?this.bassDuck
        :DRUM_LAYERS.has(type)?this.drumBus:this.musicBus);
      rev.connect(this.revIn);delay.connect(this.delayIn);
    }
    this._refreshLayerGains();
    // Buffer is synthesized on the spot. No audio asset is downloaded or decoded.
    this.noise=c.createBuffer(1,Math.ceil(c.sampleRate*1.1),c.sampleRate);
    const nd=this.noise.getChannelData(0);
    for(let i=0;i<nd.length;i++)nd[i]=rand(i,51)*2-1;
    this.setWarmth(this.warmth ?? .73);
    await c.resume();
  }
  _makeVoice(t,dur,amp,{attack=.005,release=.12,decay=0,sustain=1,pan=0,reverb=.12,delay=0,bus='music'}={}) {
    const c=this.ctx;
    const input=c.createGain(),shape=c.createGain();
    shape.gain.setValueAtTime(EPS,t);
    const peak=t+Math.min(Math.max(.002,attack),Math.max(.003,dur*.8));
    const end=t+Math.max(dur,.01);
    const level=Math.max(EPS,amp*(decay>0?sustain:1));
    shape.gain.linearRampToValueAtTime(Math.max(EPS,amp),peak);
    if(decay>0)shape.gain.exponentialRampToValueAtTime(level,Math.min(end,peak+Math.max(.015,decay)));
    shape.gain.setValueAtTime(level,Math.max(end,peak+.002));
    shape.gain.exponentialRampToValueAtTime(EPS,Math.max(end+.014,peak+.012)+release);
    const stereo=typeof c.createStereoPanner==='function'?c.createStereoPanner():c.createGain();
    if(stereo.pan) stereo.pan.value=clamp(pan,-1,1);
    input.connect(shape);shape.connect(stereo);
    const lane=this._eventInstrument;
    stereo.connect(this.layerGains[lane]||this.musicBus);
    const nodes=[input,shape,stereo];
    if(reverb>0) {const send=c.createGain();send.gain.value=reverb;stereo.connect(send);send.connect(this.reverbGates[lane]||this.revIn);nodes.push(send);}
    if(delay>0) {const send=c.createGain();send.gain.value=delay;stereo.connect(send);send.connect(this.delayGates[lane]||this.delayIn);nodes.push(send);}
    const v={input, nodes, sources:new Set(), add:(node)=>{nodes.push(node);return node;}};
    v.track=(src,start=t,end=t+dur+release+.08)=>{
      v.sources.add(src);this.active.add(src);
      src.onended=()=>{
        this.active.delete(src);v.sources.delete(src);
        try{src.disconnect();}catch(_){}
        if(v.sources.size===0) {
          for(const n of nodes)try{n.disconnect();}catch(_){}
        }
      };
      src.start(start);src.stop(Math.max(start+.003,end));
      return src;
    };
    return v;
  }
  _osc(v,type,freq,t,end,gain=1,detune=0,glide=0) {
    const c=this.ctx;
    const osc=c.createOscillator(),g=v.add(c.createGain());
    osc.type=type;osc.frequency.setValueAtTime(freq*(glide||1),t);
    if(glide)osc.frequency.exponentialRampToValueAtTime(freq,t+.058);
    osc.detune.value=detune;g.gain.value=gain;
    osc.connect(g);g.connect(v.input);v.track(osc,t,end);
    return osc;
  }
  _noise(v,t,end,{filterType='highpass',cutoff=6000,q=.75,gain=1}={}) {
    const c=this.ctx;
    const src=c.createBufferSource();src.buffer=this.noise;src.loop=true;
    src.playbackRate.value=1.07+rand(Math.floor(t*100),69)*.27;
    const filt=v.add(c.createBiquadFilter());filt.type=filterType;
    filt.frequency.value=cutoff;filt.Q.value=q;
    const g=v.add(c.createGain());g.gain.value=gain;
    src.connect(filt);filt.connect(g);g.connect(v.input);
    v.track(src,t,end);
  }
  _scheduleNote(ev,t) {
    const c=this.ctx,f=midiHz(ev.note),dur=ev.duration;
    this._eventInstrument=ev.type;
    if(ev.type==='kick' && this.bassDuck) {
      const g=this.bassDuck.gain;
      const pre=Math.max(this.ctx.currentTime+.001,t-.010);
      g.setValueAtTime(1,pre);
      g.linearRampToValueAtTime(.34,t+.009);
      g.linearRampToValueAtTime(.65,t+.080);
      g.linearRampToValueAtTime(1,t+.195);
    }
    let v;
    switch(ev.type) {
      case 'pluck': { // Soft, pseudo-sampled wooden mallet (marimba/kalimba)
        v=this._makeVoice(t,dur,ev.velocity*.49,{attack:.004,decay:.13,sustain:.22,release:.12,
          pan:ev.pan,reverb:.17,delay:.075});
        const filt=v.add(c.createBiquadFilter());filt.type='lowpass';filt.Q.value=.65;
        filt.frequency.setValueAtTime(2700,t);
        filt.frequency.exponentialRampToValueAtTime(1250,t+Math.min(.32,dur+.06));
        filt.connect(v.input);
        const a=c.createOscillator(),ag=v.add(c.createGain());
        a.type='triangle';a.frequency.setValueAtTime(f*1.012,t);
        a.frequency.exponentialRampToValueAtTime(f,t+.035);
        ag.gain.value=.94;a.connect(ag);ag.connect(filt);v.track(a,t,t+dur+.18);
        const b=c.createOscillator(),bg=v.add(c.createGain());
        b.type='sine';b.frequency.value=f*2.007;
        bg.gain.setValueAtTime(.19,t);bg.gain.exponentialRampToValueAtTime(.009,t+.18);
        b.connect(bg);bg.connect(filt);v.track(b,t,t+dur+.09);
        // Soft 12ms woody finger attack, made from procedural filtered noise.
        this._noise(v,t,t+.013,{filterType:'bandpass',cutoff:1650,q:.85,gain:.045});
        break;
      }
      case 'bubble': { // Low, muted 90s FM electric-bell answer
        v=this._makeVoice(t,dur,ev.velocity*.41,{attack:.006,decay:.17,sustain:.26,release:.18,
          pan:ev.pan,reverb:.17,delay:.09});
        const car=c.createOscillator(),mod=c.createOscillator(),mi=v.add(c.createGain());
        const filt=v.add(c.createBiquadFilter());filt.type='lowpass';filt.frequency.value=1950;
        car.type='sine';mod.type='sine';car.frequency.value=f;
        mod.frequency.value=f*1.997;
        mi.gain.setValueAtTime(f*.52,t);mi.gain.exponentialRampToValueAtTime(f*.012,t+.19);
        mod.connect(mi);mi.connect(car.frequency);car.connect(filt);filt.connect(v.input);
        v.track(car,t,t+dur+.22);v.track(mod,t,t+dur+.18);
        break;
      }
      case 'keys': { // PCM-like electric-piano chord stabs, glass-free
        v=this._makeVoice(t,dur,ev.velocity*.31,{attack:.009,decay:.22,sustain:.33,release:.24,
          pan:ev.pan,reverb:.18,delay:.024});
        const low=v.add(c.createBiquadFilter());low.type='lowpass';low.frequency.value=1650;
        low.Q.value=.6;low.connect(v.input);
        const o=c.createOscillator(),og=v.add(c.createGain());o.setPeriodicWave(this.epWave);o.frequency.value=f;
        og.gain.value=.67;o.connect(og);og.connect(low);v.track(o,t,t+dur+.25);
        const second=c.createOscillator(),sg=v.add(c.createGain());
        second.type='sine';second.frequency.value=f*.997;
        sg.gain.value=.40;second.connect(sg);sg.connect(low);v.track(second,t,t+dur+.25);
        break;
      }
      case 'lead': { // Soft synth-brass/woodwind lead with gentle pitch glides
        v=this._makeVoice(t,dur,ev.velocity*.31,{attack:.028,decay:.19,sustain:.69,release:.18,
          pan:ev.pan,reverb:.15,delay:.08});
        const filt=v.add(c.createBiquadFilter());filt.type='lowpass';filt.Q.value=.73;
        filt.frequency.setValueAtTime(ev.bright?2300:1800,t);
        filt.frequency.exponentialRampToValueAtTime(1200,t+Math.min(.35,dur+.05));
        filt.connect(v.input);
        const car=c.createOscillator(),cg=v.add(c.createGain());
        car.setPeriodicWave(this.brassWave);car.frequency.setValueAtTime(f*(ev.slide?.91:1),t);
        if(ev.slide)car.frequency.exponentialRampToValueAtTime(f,t+.055);
        cg.gain.value=.8;car.connect(cg);cg.connect(filt);v.track(car,t,t+dur+.2);
        const sine=c.createOscillator(),sg=v.add(c.createGain());
        sine.type='sine';sine.frequency.setValueAtTime(f*(ev.slide?.91:1),t);
        if(ev.slide)sine.frequency.exponentialRampToValueAtTime(f,t+.055);
        sg.gain.value=.49;sine.connect(sg);sg.connect(filt);v.track(sine,t,t+dur+.2);
        const lfo=c.createOscillator(),depth=v.add(c.createGain());
        lfo.type='sine';lfo.frequency.value=4.6;depth.gain.value=f*.002;
        lfo.connect(depth);depth.connect(car.frequency);depth.connect(sine.frequency);
        v.track(lfo,t,t+dur+.20);
        break;
      }
      case 'pad': { // Warm, slow triangle/string blend, no exposed fizzy saws
        v=this._makeVoice(t,dur,ev.velocity*.29,{attack:.34,release:.64,pan:ev.pan,
          reverb:.24,delay:.005});
        const filt=v.add(c.createBiquadFilter());filt.type='lowpass';filt.Q.value=.72;
        filt.frequency.setValueAtTime(900,t);
        filt.frequency.linearRampToValueAtTime(ev.bright?1530:1180,t+1.1);
        filt.connect(v.input);
        for(const [j,d] of [-6,0,7].entries()){
          const o=c.createOscillator(),g=v.add(c.createGain());
          o.type=j===1?'sine':'triangle';o.frequency.value=f;o.detune.value=d;
          g.gain.value=j===1?.43:.26;
          o.connect(g);g.connect(filt);v.track(o,t,t+dur+.68);
        }
        break;
      }
      case 'bass': { // Deep but audible on mobile: sine sub + filtered harmonics
        v=this._makeVoice(t,dur,ev.velocity*.64,{attack:.006,decay:.085,
          sustain:.48,release:.028,pan:0,reverb:0,delay:0});
        const sub=c.createOscillator();sub.type='sine';
        sub.frequency.setValueAtTime(f*(ev.slide?1.095:1.025),t);
        sub.frequency.exponentialRampToValueAtTime(f,t+(ev.slide?.085:.034));
        sub.connect(v.input);v.track(sub,t,t+dur+.035);
        const body=c.createOscillator(),fil=v.add(c.createBiquadFilter()),g=v.add(c.createGain());
        body.type='triangle';body.frequency.setValueAtTime(f*(ev.slide?1.08:1),t);
        if(ev.slide)body.frequency.exponentialRampToValueAtTime(f,t+.09);
        fil.type='lowpass';fil.Q.value=.71;
        fil.frequency.setValueAtTime(ev.squawk?890:670,t);
        fil.frequency.exponentialRampToValueAtTime(175,t+.20);
        g.gain.value=.78;body.connect(fil);fil.connect(g);g.connect(v.input);
        v.track(body,t,t+dur+.035);
        // A quiet second harmonic lets small phone speakers reproduce bass notes.
        const overtone=c.createOscillator(),og=v.add(c.createGain());
        overtone.type='sine';overtone.frequency.value=f*2;
        og.gain.setValueAtTime(.16,t);og.gain.exponentialRampToValueAtTime(.035,t+Math.min(.16,dur));
        overtone.connect(og);og.connect(v.input);v.track(overtone,t,t+dur+.030);
        break;
      }
      case 'glitch': { // Occasional muted 8-bit-flavored accent, never a sharp square shriek
        v=this._makeVoice(t,dur,ev.velocity*.25,{attack:.004,decay:.05,sustain:.16,
          release:.065,pan:ev.pan,reverb:.06,delay:.095});
        const filt=v.add(c.createBiquadFilter());filt.type='lowpass';filt.frequency.value=1600;
        const o=c.createOscillator();o.type='triangle';
        o.frequency.setValueAtTime(f*.93,t);
        o.frequency.exponentialRampToValueAtTime(f,t+Math.max(.03,dur*.72));
        o.connect(filt);filt.connect(v.input);v.track(o,t,t+dur+.09);
        break;
      }
      case 'kick': { // Chunky late-90s drum machine: body before click
        v=this._makeVoice(t,.205,ev.velocity*.77,{attack:.0015,decay:.052,
          sustain:.17,release:.038,bus:'drum',reverb:0,delay:0});
        const o=c.createOscillator();o.type='sine';
        o.frequency.setValueAtTime(ev.accent?155:133,t);
        o.frequency.exponentialRampToValueAtTime(58,t+.059);
        o.frequency.exponentialRampToValueAtTime(46,t+.20);
        o.connect(v.input);v.track(o,t,t+.25);
        // Very quiet click for articulation, deliberately below snare/hats.
        this._noise(v,t,t+.008,{filterType:'bandpass',cutoff:950,q:.7,gain:.048});
        break;
      }
      case 'snare': { // Dusty snare with a short, warm body and soft noise
        const ghost=!!ev.ghost;
        v=this._makeVoice(t,ghost?.055:.090,ev.velocity*.54,{attack:.002,decay:.040,sustain:.17,
          release:ghost?.025:.039,bus:'drum',pan:0,reverb:.008,delay:0});
        this._noise(v,t,t+(ghost?.06:.11),{filterType:'bandpass',cutoff:1470,q:.75,gain:.65});
        const o=c.createOscillator();o.type='triangle';
        o.frequency.setValueAtTime(172,t);o.frequency.exponentialRampToValueAtTime(117,t+.075);
        const g=v.add(c.createGain());g.gain.value=.46;
        o.connect(g);g.connect(v.input);v.track(o,t,t+.10);
        break;
      }
      case 'hat': { // Front-of-mix warm hats, never high-register glassy bells
        const open=!!ev.open;
        v=this._makeVoice(t,open?.088:.027,ev.velocity*.52,{attack:.0015,decay:.021,
          sustain:.09,release:open?.029:.012,pan:ev.pan,bus:'drum',reverb:0,delay:0});
        this._noise(v,t,t+(open?.12:.045),{filterType:'bandpass',cutoff:open?2800:2500,q:.65,
          gain:open?.60:.78});
        break;
      }
      case 'rise': {
        v=this._makeVoice(t,dur,ev.velocity*.18,{attack:dur*.7,release:.10,pan:ev.pan,reverb:.16});
        const filt=v.add(c.createBiquadFilter());filt.type='bandpass';
        filt.frequency.setValueAtTime(420,t);filt.frequency.exponentialRampToValueAtTime(2600,t+dur);
        filt.Q.value=.62;
        const src=c.createBufferSource();src.buffer=this.noise;src.loop=true;
        src.connect(filt);filt.connect(v.input);v.track(src,t,t+dur+.1);
        break;
      }
      case 'crash': {
        v=this._makeVoice(t,.12,ev.velocity*.15,{attack:.004,decay:.045,sustain:.10,release:.18,pan:0,reverb:.04});
        this._noise(v,t,t+.26,{filterType:'bandpass',cutoff:2300,q:.8,gain:.28});
        break;
      }
    }
  }
  /** Reorchestrate the underlying deterministic score without new audio assets. */
  _shouldPlayEvent(ev,index) {
    const level=this.intensity;
    if(this.arrangement==='calm' && (ev.type==='glitch'||ev.type==='rise'||ev.type==='crash'))return false;
    if(ev.type==='glitch' && level<.62)return false;
    if(ev.type==='hat' && level<.24 && index%5===0)return false;
    if(ev.type==='kick' && level<.16 && index%4===0)return false;
    if(ev.type==='snare' && level<.19 && ev.ghost)return false;
    if(ev.type==='bass' && level<.14 && index%3===0)return false;
    if(ev.type==='lead' && level<.20 && index%4!==0)return false;
    return true;
  }
  _tick() {
    if(!this.isPlaying || !this.ctx)return;
    const now=this.ctx.currentTime;
    const horizon=now+.115;
    const rate=this.tempo/BPM;
    while(this.cursor<this.score.length) {
      const ev=this.score[this.cursor];
      const when=this.startCtx+(ev.t-this.startPosition)/rate;
      if(when>horizon)break;
      const scoreIndex=this.cursor++;
      if(when<now-.035||!this._shouldPlayEvent(ev,scoreIndex))continue;
      this._scheduleNote({...ev,duration:ev.duration/rate},Math.max(when,now+.002));
    }
    const elapsed=this.startPosition+Math.max(0,now-this.startCtx)*rate;
    const beatIndex=Math.floor(elapsed*BPM/60);
    if(beatIndex!==this._lastBeat){
      this._lastBeat=beatIndex;
      this._emit('beat',{beat:((beatIndex%4)+4)%4,bar:Math.floor(beatIndex/4),bpm:this.tempo,time:elapsed,phase:this.getBeatPhase()});
    }
    const name=this.getSection();
    if(name!==this._lastSection){this._lastSection=name;this._emit('section',{name,time:this.getTime()});}
    const endAt=this.startCtx+(DURATION-this.startPosition)/rate;
    if(this.loop && this.cursor>=this.score.length && horizon>=endAt){
      this.startCtx=endAt;this.startPosition=0;this.cursor=0;this._lastBeat=-1;
      this._emit('loop',{time:0});
    } else if(!this.loop && elapsed>=DURATION){
      this.pause();this.position=DURATION;
      this._emit('ended',{});
      if(typeof this.onEnded==='function')this.onEnded();
    }
  }
  _killVoices() {
    if(!this.ctx)return;
    for(const src of Array.from(this.active)) {
      try{src.stop(this.ctx.currentTime);}catch(_){}
    }
    this.active.clear();
  }
  async play() {
    if(this.isPlaying)return;
    await this._ensureAudio();
    if(this.position>=DURATION-.01)this.position=0;
    this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.012);
    this.startPosition=this.position;
    this.startCtx=this.ctx.currentTime+.060;
    this._lastBeat=-1;this._lastSection='';
    this.cursor=lowerBound(this.score,this.startPosition);
    this.isPlaying=true;
    this._tick();
    this.timer=setInterval(()=>this._tick(),25);
  }
  async resume(){return this.play();}
  pause() {
    if(!this.isPlaying)return;
    this.position=this.getTime();this.isPlaying=false;
    clearInterval(this.timer);this.timer=null;
    this._killVoices();
    this.master.gain.setTargetAtTime(EPS,this.ctx.currentTime,.015);
  }
  stop() {this.pause();this.position=0;this._lastBeat=-1;}
  seek(seconds) {
    const wasPlaying=this.isPlaying;
    this.pause();this.position=clamp(Number(seconds)||0,0,DURATION);
    if(wasPlaying && this.position<DURATION)this.play();
  }
  async dispose() {
    this.stop();this.listeners.clear();
    if(this.ctx) {try{await this.ctx.close();}catch(_){}this.ctx=null;}
  }
}
export default ProceduralRapidRain;

/** Explicit V2 class name for game integrations. */
export class RapidRainV2 extends ProceduralRapidRain {}
