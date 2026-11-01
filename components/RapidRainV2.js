/**
 * PROCEDURAL RAPID RAIN
 * Pure Web Audio composition, no fetch(), samples, MP3, MIDI or dependencies.
 * Music reconstructed in the style of the user-provided reference (not an exact
 * stem transcription). Measured reference duration: 244.824 seconds.
 * Estimated pulse: 136 BPM; tonal center: Eb major.
 *
 * V2 adds live tempo, adaptive arrangement, instrument mixing, game events, and beat sync.
 * Browser:
 *   const music = new ProceduralRapidRain();
 *   await music.play(); // MUST be initiated by a user click/tap
 *   music.pause(); music.resume(); music.stop(); music.seek(90);
 *   music.setVolume(0.65); music.getTime(); music.getDuration();
 */
export const BPM = 136;
export const DURATION = 244.824;
export const RAPID_RAIN_LAYERS = Object.freeze(['pluck','bubble','lead','pad','bass','glitch','kick','snare','hat','rise','crash']);
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
const EB_LEAD = [74,75,77,79,80,82,84,86,87,89,91,92,94,96];
const MELODIES = [
  [[0,1,2],[3,3,2],[6,5,2],[9,4,2],[12,3,3],[16,1,2],[19,5,2],[22,7,2],[25,5,2],[28,3,3]],
  [[0,5,2],[2,7,2],[5,8,2],[8,7,3],[12,5,2],[15,4,2],[18,3,1],[20,5,2],[23,8,2],[26,7,2],[29,5,2]],
  [[0,3,2],[4,4,2],[6,5,2],[8,7,2],[11,5,2],[14,3,2],[17,4,2],[20,7,3],[24,8,2],[27,7,2],[30,5,1]],
  [[0,1,2],[2,3,2],[4,5,2],[7,7,2],[10,8,2],[13,7,2],[16,5,2],[19,4,2],[22,3,2],[25,5,2],[28,7,4]],
];
function section(bar) {
  if (bar < 8) return {name:'watercolor intro',energy:.18, lead:false, drums:0, pad:1};
  if (bar < 16) return {name:'melodic introduction',energy:.38,lead:true,drums:.25,pad:1};
  if (bar < 32) return {name:'rolling groove',energy:.63,lead:true,drums:.72,pad:1};
  if (bar < 48) return {name:'first drop',energy:1,lead:true,drums:1,pad:.8};
  if (bar < 64) return {name:'colorful melodic break',energy:.73,lead:true,drums:.77,pad:1};
  if (bar < 80) return {name:'second drop',energy:1.08,lead:true,drums:1,pad:.9};
  if (bar < 96) return {name:'lead improvisations',energy:.89,lead:true,drums:.89,pad:1};
  if (bar < 112) return {name:'final peak',energy:1.13,lead:true,drums:1.1,pad:1};
  if (bar < 124) return {name:'last groove',energy:.77,lead:true,drums:.8,pad:1};
  if (bar < 132) return {name:'outro',energy:.42,lead:false,drums:.36,pad:1};
  return {name:'ambient final decay',energy:.12,lead:false,drums:0,pad:1};
}
/** Pure deterministic score generation: can be inspected, remixed and exported. */
export function buildRapidRainScore() {
  const e = [];
  const add = (bar,step,type,note=0,duration=STEP,velocity=1,pan=0,extras={}) => {
    const t = bar*BAR + step*STEP;
    if (t >= DURATION - .06) return;
    e.push({t, type, note, duration, velocity, pan, ...extras});
  };
  for(let bar=0;bar<139;bar++) {
    const s=section(bar), ch=CHORDS[bar%8], b8=bar%8, energy=s.energy;
    const last = bar >= 132;
    // Warm, airy, sustained harmonic cushions: no recorded samples.
    if (bar%2===0 && bar<138) {
      for(let k=0;k<ch.pad.length;k++) {
        if (k===3 && bar<6) continue;
        add(bar,0,'pad',ch.pad[k],BAR*2.26,(.076+.022*energy)*s.pad,[-.45,-.17,.19,.43][k], {bright:bar>=32&&bar<124});
      }
    }
    // Signature bouncing, bright, liquid pluck ostinato.
    const pluckSteps=last?[0,4,8]:[0,2,5,7,10,12,14];
    for(let k=0;k<pluckSteps.length;k++) {
      const st=pluckSteps[k];
      const ix=choose([0,2,1,3,2,4,1],k+(bar%4===3?2:0));
      const n=ch.upper[ix]+((bar>=32 && k===5)?12:0);
      const human=(rand(bar*41+k,2)-.5)*.026;
      add(bar,st,'pluck',n,.19+(.07*rand(bar*17+k,1)),(.30+energy*.22)*(k===0?1.14:1)+human,
        [-.37,.28,-.17,.42,-.35,.25,.03][k]);
    }
    // Additional mallet bubbles and glass harmonics; sparse in the opening.
    const bubbleSteps = last?[6]:energy>.8?[3,6,9,11,15]:[3,9,15];
    for(let k=0;k<bubbleSteps.length;k++) {
      const st=bubbleSteps[k];
      if (bar<4 && k>0) continue;
      const jump=rand(bar*23+k,3)>.79?12:0;
      add(bar,st,'bubble',ch.upper[choose([3,2,4,1],k+bar)]+jump,.115+rand(bar+k,6)*.09,
        (.14+energy*.2)*(1-.14*rand(bar+k,7)),(rand(bar*7+k,8)-.5)*1.3);
    }
    // Lyrical high, sliding FM solo: deterministic 2-bar melodies.
    if (s.lead && bar<126) {
      const phrase = MELODIES[Math.floor(bar/8)%MELODIES.length];
      const twoBarStart=bar-(bar%2);
      for(const [pos,scaleIndex,len] of phrase) {
        if(Math.floor(pos/16)!==bar%2) continue;
        const st=pos%16;
        let n=EB_LEAD[scaleIndex];
        // Transpose an occasional arpeggiated turnaround, retain Eb tonality.
        if (energy>1 && rand(bar*37+st,14)>.94) n+=12;
        add(bar,st,'lead',n,STEP*(len*.91),.30+energy*.25,Math.sin(bar*.8+st)*.24,
          {slide:rand(bar*31+st,4)>.42,bright:energy>.83});
      }
      // Interstitial tiny jazzy answering phrases.
      if (bar%4===3 && bar>16 && bar<123) {
        [11,12,13,14,15].forEach((st,k)=>add(bar,st,'lead',ch.upper[choose([1,2,3,2,4],k)]+(bar%8===7?0:12),STEP*.61,.21+energy*.07,(k-2)*.16,{slide:k===0}));
      }
    }
    // Elastic, sub-heavy bass with syncopated note and octave articulations.
    if(bar>=12 && bar<132) {
      const bassSteps=energy>.7?[0,3,6,8,11,14]:[0,6,10];
      bassSteps.forEach((st,k)=> {
        const octave=k===2 && bar%4===3?12:0;
        const fifth=k===4?7:0;
        add(bar,st,'bass',ch.root+octave+fifth,STEP*(k===0?2.6:1.55),
          (energy>.85?.42:.35)*(st===0?1.2:1),0,{squawk:k===3&&energy>.8});
      });
    }
    // Drum sequencer: synthetic kicks, snares, hats, breaks and rolls.
    if(s.drums>0) {
      const full=s.drums>=.7;
      const kickSteps=full?[0,6,8,11,14]:[0,8];
      for(const st of kickSteps) {
        if(s.drums<.5 && bar%2 && st!==0) continue;
        add(bar,st,'kick',0,.36,Math.min(.9,s.drums*(st===0?.7:.55)),0);
      }
      for(const st of [4,12]) add(bar,st,'snare',0,.22,s.drums*(st===12?.64:.57),.07);
      if(full && bar%2) for(const st of [10,15]) add(bar,st,'snare',0,.1,.11*s.drums,-.2,{ghost:true});
      for(let st=0;st<16;st+=(bar<16?4:2)) {
        if(!full && st%4===2) continue;
        add(bar,st,'hat',0,.075,Math.min(.22,s.drums*(st%4===2?.22:.15)),(st%4===2?.4:-.25),{open:st===14&&full&&bar%4===1});
      }
      if(full && bar%2===1) for(const st of [3,7,11,15])
        add(bar,st,'hat',0,.053,.095*s.drums,.45);
      // Quick fills every 4/8 bars, 32nd-note rolls.
      if(full && (bar%8===7 || bar%4===3)) {
        const density=bar%8===7?8:4;
        for(let k=0;k<density;k++) add(bar,12+k*(4/density),'snare',0,.08,(.17+k/density*.21)*s.drums,
          (rand(bar*23+k,99)-.5)*.6,{ghost:k%2===0});
      }
    }
    // Tick-tock chiptune sparkle in high-energy sections.
    if(energy>.74 && bar%2===0 && bar<126) {
      for(let k=0;k<6;k++) {
        const st=8+k*1.25;
        add(bar,st,'glitch',ch.upper[(k+2)%5]+12,STEP*.5,.10+energy*.07,
          (k%2?.65:-.65));
      }
    }
    // Transition details, rising spectral noise and a brief bright crash.
    if([15,31,47,63,79,95,111,123].includes(bar)) {
      add(bar,8,'rise',0,STEP*8,.18+energy*.13,.0);
    }
    if([16,32,48,64,80,96,112,124].includes(bar)) {
      add(bar,0,'crash',0,1.45,.18+energy*.12,-.05);
    }
    // Emphatic 1-beat fills before drops.
    if([31,63,95,111].includes(bar)) {
      for(let k=0;k<8;k++)
        add(bar,12+k*.5,'glitch',ch.upper[(k+bar)%5]+(k%3===0?12:0),STEP*.41,.19+k*.018,(k%2?-.6:.6));
    }
  }
  // Final splash and long synthesis-only release, matching audio length.
  e.push({t:240.1,type:'pad',note:63,duration:3.8,velocity:.08,pan:-.3});
  e.push({t:240.1,type:'pad',note:70,duration:3.8,velocity:.08,pan:.3});
  e.sort((a,b)=>a.t-b.t);
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
      const isDrum=DRUM_LAYERS.has(type);
      const weight=type==='pad'?(.85-.22*this.intensity)
        :isDrum?(.18+.75*this.intensity)
        :type==='glitch'?(.08+.81*this.intensity)
        :type==='bass'?(.25+.65*this.intensity)
        :(.5+.40*this.intensity);
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
    const targetBpm=clamp(116+Math.max(0,speed)*.92+(powered?3:0),112,180);
    this.setTempo(this.tempo+(targetBpm-this.tempo)*.24);
    if(this.arrangement==='auto') {
      let target=clamp(.25+speed/72+(powered?.32:0)+(tuck?.08:0)+(inAir?.07:0),.18,1.3);
      if(recovery)target=.17;
      this.setIntensity(this.intensity+(target-this.intensity)*.22);
    }
    this._emit('motion',{speed,powered,inAir,recovery,steer,airHeight,bpm:this.tempo,intensity:this.intensity});
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
    const comp=c.createDynamicsCompressor();
    comp.threshold.value=-15;comp.knee.value=16;comp.ratio.value=3.1;
    comp.attack.value=.008;comp.release.value=.16;
    this.duck=c.createGain();this.duck.gain.value=1;
    master.connect(this.duck);this.duck.connect(comp);
    this.analyser=c.createAnalyser();this.analyser.fftSize=512;
    this.analyser.smoothingTimeConstant=.8;
    comp.connect(this.analyser);this.analyser.connect(c.destination);
    this.musicBus=c.createGain();this.drumBus=c.createGain();
    this.musicBus.gain.value=.82;this.drumBus.gain.value=.85;
    this.musicBus.connect(master);this.drumBus.connect(master);
    // Generate impulse response from math/noise: NOT a sample or network file.
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
    const revWet=c.createGain();revWet.gain.value=.12;
    this.revIn.connect(rev);rev.connect(revWet);revWet.connect(master);
    this.delayIn=c.createGain();
    const dl=this.delay=c.createDelay(1.2);dl.delayTime.value=STEP*3;
    const feedback=c.createGain();feedback.gain.value=.31;
    const dlTone=c.createBiquadFilter();dlTone.type='lowpass';dlTone.frequency.value=4700;
    const dlWet=c.createGain();dlWet.gain.value=.2;
    this.delayIn.connect(dl);dl.connect(dlTone);dlTone.connect(feedback);
    feedback.connect(dl);dlTone.connect(dlWet);dlWet.connect(master);
    // Each lane gets its own dry and FX gates for live mute/solo/remixing.
    for(const type of RAPID_RAIN_LAYERS){
      const channel=this.layerGains[type]=c.createGain();
      const rev=this.reverbGates[type]=c.createGain();
      const delay=this.delayGates[type]=c.createGain();
      channel.gain.value=1;rev.gain.value=1;delay.gain.value=1;
      channel.connect(DRUM_LAYERS.has(type)?this.drumBus:this.musicBus);
      rev.connect(this.revIn);delay.connect(this.delayIn);
    }
    this._refreshLayerGains();
    // Buffer is synthesized on the spot. No audio asset is downloaded or decoded.
    this.noise=c.createBuffer(1,Math.ceil(c.sampleRate*1.1),c.sampleRate);
    const nd=this.noise.getChannelData(0);
    for(let i=0;i<nd.length;i++)nd[i]=rand(i,51)*2-1;
    await c.resume();
  }
  _makeVoice(t,dur,amp,{attack=.005,release=.12,pan=0,reverb=.12,delay=0,bus='music'}={}) {
    const c=this.ctx;
    const input=c.createGain(),shape=c.createGain();
    shape.gain.setValueAtTime(EPS,t);
    shape.gain.linearRampToValueAtTime(Math.max(EPS,amp),t+Math.max(.002,attack));
    shape.gain.setValueAtTime(Math.max(EPS,amp),t+Math.max(attack+.002,dur));
    shape.gain.exponentialRampToValueAtTime(EPS,t+Math.max(dur+.015,attack+.01)+release);
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
    let v;
    switch(ev.type) {
      case 'pluck': {
        v=this._makeVoice(t,dur,ev.velocity*.38,{attack:.002,release:.15,pan:ev.pan,reverb:.21,delay:.16});
        const filter=v.add(c.createBiquadFilter());filter.type='lowpass';
        filter.frequency.setValueAtTime(5100,t);filter.frequency.exponentialRampToValueAtTime(950,t+.22);
        const o=c.createOscillator();o.type='triangle';o.frequency.value=f;
        o.connect(filter);filter.connect(v.input);v.track(o,t,t+dur+.16);
        this._osc(v,'sine',f*2.002,t,t+dur+.12,.28);
        break;
      }
      case 'bubble': {
        v=this._makeVoice(t,dur,ev.velocity*.45,{attack:.002,release:.24,pan:ev.pan,reverb:.29,delay:.23});
        const car=c.createOscillator(),mod=c.createOscillator(),mi=v.add(c.createGain());
        car.type='sine';mod.type='sine';car.frequency.value=f;
        mod.frequency.value=f*2.002;
        mi.gain.setValueAtTime(f*1.65,t);mi.gain.exponentialRampToValueAtTime(.8,t+.14);
        mod.connect(mi);mi.connect(car.frequency);car.connect(v.input);
        v.track(car,t,t+dur+.26);v.track(mod,t,t+dur+.22);
        break;
      }
      case 'lead': {
        const bright=ev.bright;
        v=this._makeVoice(t,dur,ev.velocity*.36,{attack:.016,release:.135,pan:ev.pan,reverb:.15,delay:.12});
        const filt=v.add(c.createBiquadFilter());filt.type='lowpass';
        filt.frequency.setValueAtTime(bright?4400:3200,t);
        filt.frequency.exponentialRampToValueAtTime(bright?1900:1200,t+dur+.09);
        const car=c.createOscillator();car.type='sawtooth';
        car.frequency.setValueAtTime(f*(ev.slide?.75:1),t);
        if(ev.slide)car.frequency.exponentialRampToValueAtTime(f,t+.075);
        const g=v.add(c.createGain());g.gain.value=.55;
        car.connect(filt);filt.connect(g);g.connect(v.input);
        v.track(car,t,t+dur+.155);
        const sine=c.createOscillator();sine.type='sine';sine.frequency.setValueAtTime(f*(ev.slide?.75:1),t);
        if(ev.slide)sine.frequency.exponentialRampToValueAtTime(f,t+.075);
        const g2=v.add(c.createGain());g2.gain.value=.4;
        sine.connect(g2);g2.connect(v.input);v.track(sine,t,t+dur+.15);
        const lfo=c.createOscillator(),depth=v.add(c.createGain());
        lfo.type='sine';lfo.frequency.value=5.6;depth.gain.value=f*.003;
        lfo.connect(depth);depth.connect(car.frequency);depth.connect(sine.frequency);
        v.track(lfo,t,t+dur+.14);
        break;
      }
      case 'pad': {
        v=this._makeVoice(t,dur,ev.velocity*.27,{attack:.33,release:.7,pan:ev.pan,reverb:.27,delay:.02});
        const filt=v.add(c.createBiquadFilter());filt.type='lowpass';
        filt.frequency.setValueAtTime(ev.bright?1800:1250,t);
        filt.frequency.linearRampToValueAtTime(ev.bright?2550:1600,t+1);
        filt.connect(v.input);
        for(const [j,d] of [-9,0,8].entries()) {
          const o=c.createOscillator(),g=v.add(c.createGain());
          o.type=j===1?'triangle':'sawtooth';o.frequency.value=f;o.detune.value=d;
          g.gain.value=j===1?.32:.19;
          o.connect(g);g.connect(filt);v.track(o,t,t+dur+.75);
        }
        break;
      }
      case 'bass': {
        v=this._makeVoice(t,dur,ev.velocity*.54,{attack:.002,release:.085,pan:0,reverb:.017});
        const o=c.createOscillator();o.type='sine';
        o.frequency.setValueAtTime(f*1.05,t);o.frequency.exponentialRampToValueAtTime(f,t+.05);
        o.connect(v.input);v.track(o,t,t+dur+.09);
        const of=c.createOscillator(),fil=v.add(c.createBiquadFilter()),g=v.add(c.createGain());
        of.type=ev.squawk?'sawtooth':'triangle';of.frequency.value=f;
        fil.type='lowpass';fil.Q.value=2.3;
        fil.frequency.setValueAtTime(ev.squawk?2600:1250,t);
        fil.frequency.exponentialRampToValueAtTime(210,t+.18);
        g.gain.value=ev.squawk?.42:.32;
        of.connect(fil);fil.connect(g);g.connect(v.input);v.track(of,t,t+dur+.09);
        break;
      }
      case 'glitch': {
        v=this._makeVoice(t,dur,ev.velocity*.46,{attack:.001,release:.06,pan:ev.pan,reverb:.08,delay:.2});
        const o=c.createOscillator();o.type='square';
        o.frequency.setValueAtTime(f*.6,t);
        o.frequency.exponentialRampToValueAtTime(f*1.25,t+Math.max(.019,dur*.7));
        const g=v.add(c.createGain());g.gain.value=.4;
        o.connect(g);g.connect(v.input);v.track(o,t,t+dur+.065);
        break;
      }
      case 'kick': {
        v=this._makeVoice(t,.31,ev.velocity*.82,{attack:.001,release:.03,bus:'drum',reverb:.028});
        const o=c.createOscillator();o.type='sine';
        o.frequency.setValueAtTime(155,t);
        o.frequency.exponentialRampToValueAtTime(49,t+.095);
        o.frequency.exponentialRampToValueAtTime(44,t+.31);
        o.connect(v.input);v.track(o,t,t+.345);
        // Transient click adds attack without a stored drum sample.
        this._noise(v,t,t+.018,{filterType:'highpass',cutoff:3600,gain:.15});
        // Algorithmic sidechain dip, scheduled alongside the kick.
        const mg=this.musicBus.gain;
        mg.setValueAtTime(.78,t);mg.linearRampToValueAtTime(.82,t+.19);
        break;
      }
      case 'snare': {
        const ghost=!!ev.ghost;
        v=this._makeVoice(t,ghost?.085:.14,ev.velocity*.56,{attack:.001,release:.078,bus:'drum',pan:ev.pan,reverb:.10});
        this._noise(v,t,t+(ghost?.13:.21),{filterType:'bandpass',cutoff:1850,q:.6,gain:.95});
        const o=c.createOscillator();o.type='triangle';
        o.frequency.setValueAtTime(195,t);o.frequency.exponentialRampToValueAtTime(122,t+.075);
        const g=v.add(c.createGain());g.gain.value=.35;
        o.connect(g);g.connect(v.input);v.track(o,t,t+.13);
        break;
      }
      case 'hat': {
        const open=!!ev.open;
        v=this._makeVoice(t,open?.20:.055,ev.velocity*.38,{attack:.001,release:open?.16:.03,pan:ev.pan,bus:'drum',reverb:.055});
        this._noise(v,t,t+(open?.36:.095),{filterType:'highpass',cutoff:open?6000:7800,q:.7,gain:1});
        break;
      }
      case 'rise': {
        v=this._makeVoice(t,dur,ev.velocity*.32,{attack:dur*.7,release:.10,pan:ev.pan,reverb:.25});
        const filt=v.add(c.createBiquadFilter());filt.type='bandpass';
        filt.frequency.setValueAtTime(480,t);filt.frequency.exponentialRampToValueAtTime(8100,t+dur);
        filt.Q.value=.62;
        const src=c.createBufferSource();src.buffer=this.noise;src.loop=true;
        src.connect(filt);filt.connect(v.input);v.track(src,t,t+dur+.1);
        break;
      }
      case 'crash': {
        v=this._makeVoice(t,.18,ev.velocity*.4,{attack:.001,release:1.08,pan:ev.pan,reverb:.40});
        this._noise(v,t,t+1.3,{filterType:'highpass',cutoff:4500,gain:.85});
        break;
      }
    }
  }
  /** Reorchestrate the underlying deterministic score without new audio assets. */
  _shouldPlayEvent(ev,index) {
    const level=this.intensity;
    if(this.arrangement==='calm' && (DRUM_LAYERS.has(ev.type)||ev.type==='bass'||ev.type==='glitch'))return false;
    if(ev.type==='glitch' && level<.62)return false;
    if(ev.type==='hat' && level<.70 && index%3!==0)return false;
    if(ev.type==='kick' && level<.42 && index%2!==0)return false;
    if(ev.type==='snare' && level<.30)return false;
    if(ev.type==='bass' && level<.22 && index%3!==0)return false;
    if(ev.type==='lead' && level<.22 && index%4!==0)return false;
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
