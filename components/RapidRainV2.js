/**
 * PROCEDURAL RAPID RAIN
 * Pure Web Audio composition, no fetch(), samples, MP3, MIDI or dependencies.
 * Music reconstructed in the style of the user-provided reference (not an exact
 * stem transcription). Measured reference duration: 244.824 seconds.
 * Estimated pulse: 136 BPM; tonal center: Eb major.
 *
 * V2 N64 Snow Mix: warm, console-era style procedural composition.
 * Rounded pseudo-sampled mallets, EP chord stabs, low-mid synth brass,
 * mono bass, shuffle drums and low-pass / soft-saturation mix bus.
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
  // Game-first design: a short pickup, then a real groove within four seconds.
  if (bar < 2) return {name:'snowy opening',energy:.33, lead:false, drums:.28, pad:1};
  if (bar < 8) return {name:'mountain warmup',energy:.50, lead:true, drums:.60, pad:1};
  if (bar < 16) return {name:'first descent',energy:.62, lead:true, drums:.70, pad:.85};
  if (bar < 32) return {name:'powder trail',energy:.77, lead:true, drums:.82, pad:.92};
  if (bar < 48) return {name:'slalom rush',energy:1.00, lead:true, drums:1.00, pad:.88};
  if (bar < 64) return {name:'sunlit ridge',energy:.69, lead:true, drums:.74, pad:1};
  if (bar < 80) return {name:'mountain arcade',energy:1.06, lead:true, drums:1.05, pad:.88};
  if (bar < 96) return {name:'cloudline cruise',energy:.81, lead:true, drums:.88, pad:1};
  if (bar < 112) return {name:'snowfall sprint',energy:1.12, lead:true, drums:1.06, pad:.92};
  if (bar < 124) return {name:'final run',energy:.91, lead:true, drums:.98, pad:1};
  if (bar < 132) return {name:'summit sunset',energy:.65, lead:true, drums:.65, pad:1};
  return {name:'gentle loopdown',energy:.47, lead:true, drums:.52, pad:.88};
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
        add(bar,0,'pad',ch.pad[k]-(k===3?12:0),BAR*2.14,(.090+.020*energy)*s.pad,[-.31,-.12,.12,.31][k], {bright:bar>=32&&bar<124});
      }
    }
    // Signature bouncing, bright, liquid pluck ostinato.
    const pluckSteps=last?[0,4,8,12]:[0,3,6,8,11,14];
    for(let k=0;k<pluckSteps.length;k++) {
      const st=pluckSteps[k];
      const ix=choose([0,2,1,3,2,4],k+(bar%4===3?2:0));
      const n=ch.upper[ix]-12+((bar>=32 && k===5)?0:0);
      const human=(rand(bar*41+k,2)-.5)*.026;
      add(bar,st,'pluck',n,.27+(.09*rand(bar*17+k,1)),(.38+energy*.14)*(k===0?1.12:1)+human,
        [-.27,.19,-.10,.22,-.18,.10][k]);
    }
    // Additional mallet bubbles and glass harmonics; sparse in the opening.
    const bubbleSteps = last?[6,14]:energy>.8?[2,7,10,15]:[6,14];
    for(let k=0;k<bubbleSteps.length;k++) {
      const st=bubbleSteps[k];
      if (bar<4 && k>0) continue;
      const jump=rand(bar*23+k,3)>.90?12:0;
      add(bar,st,'bubble',ch.upper[choose([3,2,4,1],k+bar)]-12+jump,.22+rand(bar+k,6)*.12,
        (.21+energy*.09)*(1-.14*rand(bar+k,7)),(rand(bar*7+k,8)-.5)*.55);
    }
    // Soft 90s-console EP chord stabs: jazzy, syncopated harmonic bed.
    if(bar<138) {
      const chordSteps = bar<2 ? [0] : energy>.85 ? [0,7,12] : [0,10];
      chordSteps.forEach((st,k) => {
        // Each stab is a light three-note voicing, not a dense wall of synth.
        const voicing = [ch.upper[0]-12,ch.upper[1]-12,ch.upper[3]-12];
        for(let j=0;j<3;j++) {
          const n=voicing[j] + (k===2 && j===2 ? -12 : 0);
          add(bar,st+(j===2?.10:0),'keys',n,STEP*(k===0?4.4:2.6),
            (.25+energy*.08)*(k===0?1:.75),[-.17,0,.17][j],{soft:true});
        }
      });
    }
    // Singing middle-register synth-brass lead; short answers to the keys.
    if (s.lead && bar<139) {
      const phrase = MELODIES[Math.floor(bar/8)%MELODIES.length];
      const twoBarStart=bar-(bar%2);
      for(const [pos,scaleIndex,len] of phrase) {
        if(Math.floor(pos/16)!==bar%2) continue;
        const st=pos%16;
        let n=EB_LEAD[scaleIndex];
        // Transpose an occasional arpeggiated turnaround, retain Eb tonality.
        if (energy>1 && rand(bar*37+st,14)>.96) n+=12;
        add(bar,st,'lead',n,STEP*(len*1.02),.33+energy*.13,Math.sin(bar*.8+st)*.17,
          {slide:rand(bar*31+st,4)>.42,bright:energy>.83});
      }
      // Interstitial tiny jazzy answering phrases.
      if (bar%4===3 && bar>8 && bar<132) {
        [11,12,13,14].forEach((st,k)=>add(bar,st,'lead',ch.upper[choose([1,2,3,2],k)]-12,STEP*.78,.21+energy*.07,(k-2)*.12,{slide:k===0}));
      }
    }
    // Elastic, sub-heavy bass with syncopated note and octave articulations.
    if(bar>=2 && bar<139) {
      const bassSteps=energy>.7?[0,3,7,10,14]:[0,7,11];
      bassSteps.forEach((st,k)=> {
        const octave=k===2 && bar%4===3?12:0;
        const fifth=k===4?7:0;
        add(bar,st,'bass',ch.root+octave+fifth,STEP*(k===0?2.6:1.55),
          (energy>.85?.47:.40)*(st===0?1.2:1),0,{squawk:k===3&&energy>.8});
      });
    }
    // Drum sequencer: synthetic kicks, snares, hats, breaks and rolls.
    if(s.drums>0) {
      const full=s.drums>=.7;
      const kickSteps=full?[0,7,10,14]:[0,10];
      for(const st of kickSteps) {
        if(s.drums<.5 && bar%2 && st!==0) continue;
        add(bar,st,'kick',0,.36,Math.min(.9,s.drums*(st===0?.7:.55)),0);
      }
      for(const st of [4,12]) add(bar,st,'snare',0,.20,s.drums*(st===12?.65:.60),.07);
      if(full && bar%2) for(const st of [10,15]) add(bar,st,'snare',0,.1,.11*s.drums,-.2,{ghost:true});
      for(let st=0;st<16;st+=(bar<8?4:2)) {
        if(!full && st%4===2) continue;
        add(bar,st,'hat',0,.065,Math.min(.17,s.drums*(st%4===2?.16:.11)),(st%4===2?.22:-.18),{open:st===14&&full&&bar%4===1});
      }
      if(full && bar%2===1) for(const st of [7,15])
        add(bar,st,'hat',0,.055,.065*s.drums,.25);
      // Quick fills every 4/8 bars, 32nd-note rolls.
      if(full && (bar%8===7 || bar%4===3)) {
        const density=bar%8===7?8:4;
        for(let k=0;k<density;k++) add(bar,12+k*(4/density),'snare',0,.08,(.17+k/density*.21)*s.drums,
          (rand(bar*23+k,99)-.5)*.6,{ghost:k%2===0});
      }
    }
    // Tick-tock chiptune sparkle in high-energy sections.
    if(energy>.84 && bar%4===2 && bar<132) {
      for(let k=0;k<4;k++) {
        const st=9+k*1.5;
        add(bar,st,'glitch',ch.upper[(k+2)%5]-12,STEP*.68,.09+energy*.06,
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
        add(bar,12+k*.5,'glitch',ch.upper[(k+bar)%5]-12+(k%3===0?12:0),STEP*.41,.11+k*.009,(k%2?-.6:.6));
    }
  }
  // Final splash and long synthesis-only release, matching audio length.
  e.push({t:240.1,type:'pad',note:51,duration:3.8,velocity:.11,pan:-.3});
  e.push({t:240.1,type:'pad',note:58,duration:3.8,velocity:.11,pan:.3});
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
    this.warmth=.78;
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
      const weight=type==='pad'?(.80-.21*this.intensity)
        :type==='keys'?(.75+.07*this.intensity)
        :isDrum?(.18+.75*this.intensity)
        :type==='glitch'?(.04+.39*this.intensity)
        :type==='bass'?(.51+.51*this.intensity)
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
    // Gameplay-aware *musical* motifs. These are notes in the current key,
    // not extra UI beeps, and don't replace any existing game sound effects.
    if(['pickup','combo','magicTrick','power','shatter'].includes(kind)) {
      const chord=CHORDS[Math.floor(this.getTime()/BAR)%CHORDS.length];
      const tick=60/this.tempo/2;
      const next=now+.035; // safe render lead time, independent of game framerate
      const notes=kind==='power'?[0,1,2,3]
        :kind==='combo'||kind==='magicTrick'?[1,2,3]
        :kind==='shatter'?[0,2]:[1,2];
      notes.forEach((index,i)=>this._scheduleNote({
        type:kind==='power'?'lead':'pluck',note:chord.upper[index]-12,
        duration:tick*(kind==='shatter'?.65:.84),
        velocity:kind==='power'?.22:.15,pan:(i%2?-.12:.12)
      },next+i*tick*.83));
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
    const comp=c.createDynamicsCompressor();
    comp.threshold.value=-19;comp.knee.value=19;comp.ratio.value=2.6;
    comp.attack.value=.013;comp.release.value=.22;
    this.duck=c.createGain();this.duck.gain.value=1;
    // Console-inspired warm bandwidth: less glassy top, strong midrange.
    const hiShelf=this.toneShelf=c.createBiquadFilter();hiShelf.type='highshelf';
    hiShelf.frequency.value=2050;hiShelf.gain.value=-6.5;
    const tape=c.createWaveShaper();
    const curve=new Float32Array(1024);
    for(let i=0;i<curve.length;i++){
      const x=(i/(curve.length-1))*2-1;
      curve[i]=Math.tanh(x*1.28)/Math.tanh(1.28);
    }
    tape.curve=curve;tape.oversample='2x';
    const lo=this.toneLowpass=c.createBiquadFilter();lo.type='lowpass';lo.frequency.value=4800;lo.Q.value=.68;
    master.connect(this.duck);this.duck.connect(tape);tape.connect(hiShelf);
    hiShelf.connect(lo);lo.connect(comp);
    this.analyser=c.createAnalyser();this.analyser.fftSize=512;
    this.analyser.smoothingTimeConstant=.8;
    comp.connect(this.analyser);this.analyser.connect(c.destination);
    this.musicBus=c.createGain();this.drumBus=c.createGain();
    this.musicBus.gain.value=.92;this.drumBus.gain.value=1;
    this.musicBus.connect(master);this.drumBus.connect(master);
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
    const revWet=c.createGain();revWet.gain.value=.095;
    const revTone=c.createBiquadFilter();revTone.type='lowpass';revTone.frequency.value=2500;
    this.revIn.connect(rev);rev.connect(revTone);revTone.connect(revWet);revWet.connect(master);
    this.delayIn=c.createGain();
    const dl=this.delay=c.createDelay(1.2);dl.delayTime.value=STEP*3;
    const feedback=c.createGain();feedback.gain.value=.24;
    const dlTone=c.createBiquadFilter();dlTone.type='lowpass';dlTone.frequency.value=2000;
    const dlWet=c.createGain();dlWet.gain.value=.14;
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
    this.setWarmth(this.warmth ?? .78);
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
      case 'bass': { // Rounded, rubbery N64-style synth bass with a soft attack
        v=this._makeVoice(t,dur,ev.velocity*.46,{attack:.004,decay:.22,sustain:.72,release:.10,
          pan:0,reverb:.008});
        const o=c.createOscillator();o.type='sine';
        o.frequency.setValueAtTime(f*1.04,t);o.frequency.exponentialRampToValueAtTime(f,t+.05);
        o.connect(v.input);v.track(o,t,t+dur+.11);
        const of=c.createOscillator(),fil=v.add(c.createBiquadFilter()),g=v.add(c.createGain());
        of.type='triangle';of.frequency.value=f;
        fil.type='lowpass';fil.Q.value=1.0;
        fil.frequency.setValueAtTime(ev.squawk?1250:950,t);
        fil.frequency.exponentialRampToValueAtTime(220,t+.2);
        g.gain.value=.42;of.connect(fil);fil.connect(g);g.connect(v.input);
        v.track(of,t,t+dur+.11);
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
      case 'kick': {
        v=this._makeVoice(t,.33,ev.velocity*.86,{attack:.002,decay:.095,sustain:.22,release:.07,bus:'drum',reverb:.012});
        const o=c.createOscillator();o.type='sine';
        o.frequency.setValueAtTime(135,t);
        o.frequency.exponentialRampToValueAtTime(52,t+.09);
        o.frequency.exponentialRampToValueAtTime(46,t+.31);
        o.connect(v.input);v.track(o,t,t+.345);
        // Transient click adds attack without a stored drum sample.
        this._noise(v,t,t+.015,{filterType:'bandpass',cutoff:1650,q:.8,gain:.06});
        // Algorithmic sidechain dip, scheduled alongside the kick.
        // Music bus kept stable: avoid overpowering the game's existing SFX.
        break;
      }
      case 'snare': {
        const ghost=!!ev.ghost;
        v=this._makeVoice(t,ghost?.08:.15,ev.velocity*.66,{attack:.003,decay:.07,sustain:.31,release:.075,bus:'drum',pan:ev.pan,reverb:.13});
        this._noise(v,t,t+(ghost?.13:.20),{filterType:'bandpass',cutoff:1500,q:.7,gain:.92});
        const o=c.createOscillator();o.type='triangle';
        o.frequency.setValueAtTime(175,t);o.frequency.exponentialRampToValueAtTime(115,t+.08);
        const g=v.add(c.createGain());g.gain.value=.36;
        o.connect(g);g.connect(v.input);v.track(o,t,t+.13);
        break;
      }
      case 'hat': {
        const open=!!ev.open;
        v=this._makeVoice(t,open?.16:.045,ev.velocity*.34,{attack:.003,decay:.04,sustain:.15,release:open?.09:.025,pan:ev.pan,bus:'drum',reverb:.018});
        this._noise(v,t,t+(open?.22:.08),{filterType:'bandpass',cutoff:open?2800:3150,q:.9,gain:.76});
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
        v=this._makeVoice(t,.18,ev.velocity*.28,{attack:.004,decay:.09,sustain:.16,release:.9,pan:ev.pan,reverb:.28});
        this._noise(v,t,t+1.2,{filterType:'bandpass',cutoff:2700,q:.8,gain:.50});
        break;
      }
    }
  }
  /** Reorchestrate the underlying deterministic score without new audio assets. */
  _shouldPlayEvent(ev,index) {
    const level=this.intensity;
    if(this.arrangement==='calm' && (ev.type==='glitch'||ev.type==='rise'||ev.type==='crash'))return false;
    if(ev.type==='glitch' && level<.62)return false;
    if(ev.type==='hat' && level<.70 && index%3!==0)return false;
    if(ev.type==='kick' && level<.42 && index%2!==0)return false;
    if(ev.type==='snare' && level<.21)return false;
    if(ev.type==='bass' && level<.22 && index%3!==0)return false;
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
