/**
 * SNOW 64 - KAWAII SLOPE (V4)
 * A BRAND NEW, original, procedural downhill soundtrack.
 * Warm 1990s console-inspired synth-pop / breakbeat, written in D major.
 * No MP3, samples, audio files, external libraries, fetches or MIDI.
 *
 * Single-file, drop-in replacement for components/RapidRainV2.js.
 * Keeps the RapidRainV2 API used by snow64Music.js and Snow64ReactiveMusic.jsx.
 * The score and synthesizers are intentionally unrelated to the old Rapid Rain.
 */
export const BPM = 136;
export const BAR = 240 / BPM;
export const DURATION = BAR * 128;  // Four-bar phrasing and seamless endless loop.
export const RAPID_RAIN_LAYERS = Object.freeze([
  'pluck', 'bubble', 'lead', 'keys', 'pad', 'bass', 'glitch',
  'kick', 'snare', 'hat', 'rise', 'crash',
]);
const STEP = BAR / 16;
const EPS = 0.00001;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const midiHz = n => 440 * 2 ** ((n - 69) / 12);
const choose = (xs, i) => xs[((i % xs.length) + xs.length) % xs.length];
const random = seed => { let x = Math.sin(seed * 139.173 + 81.91) * 43457.345; return x - Math.floor(x); };
const isDrum = k => k === 'kick' || k === 'snare' || k === 'hat';

// I - V - vi - IV / ii - IV - V - V: cheerful, wintry and melodic.
// All melody notes are composed around these specific chord voicings.
const CHORDS = [
  {name:'Dmaj9',  root:38, notes:[62,66,69,73]},
  {name:'Aadd9',  root:45, notes:[61,64,69,71]},
  {name:'Bm7',    root:47, notes:[62,66,69,71]},
  {name:'Gmaj9',  root:43, notes:[62,66,67,71]},
  {name:'Em7',    root:40, notes:[62,64,67,71]},
  {name:'Gmaj7',  root:43, notes:[62,66,67,71]},
  {name:'Asus4',  root:45, notes:[62,64,69,74]},
  {name:'Aadd9',  root:45, notes:[61,64,69,71]},
];

// Hand-composed 8-bar themes. These are NOTES, not algorithmic note soup.
// Entries: [sixteenth-grid-position, MIDI-note, sixteenth-grid-duration].
const SNOW_BUNNY = [
  [[0,69,2.6],[4,73,2.5],[8,74,3.5],[13,73,2]],
  [[0,71,2.5],[4,69,2],[7,73,3.1],[12,71,2.5]],
  [[0,66,2],[3,69,2.2],[7,71,3.4],[12,69,3]],
  [[0,67,3],[5,71,2.4],[9,74,2],[12,71,3]],
  [[0,71,3],[5,67,2],[8,69,3],[13,67,2]],
  [[0,69,2],[3,71,3],[8,74,2.6],[12,71,2]],
  [[0,73,2.2],[4,71,2.5],[8,69,2.1],[12,74,2.7]],
  [[0,73,2.2],[3,71,2],[7,69,3],[12,64,3.2]],
];
const CANDY_CARVE = [
  [[0,66,2],[3,69,2],[6,73,2.5],[10,76,2],[13,74,2.5]],
  [[0,73,2],[3,71,2],[7,69,3],[12,64,2]],
  [[0,66,2.5],[4,69,2.5],[8,74,2],[11,73,2],[14,71,1.7]],
  [[0,71,2.5],[4,74,2],[8,76,3.2],[13,74,2]],
  [[0,71,2],[3,69,2],[7,67,3],[12,71,3]],
  [[0,74,2.5],[4,71,2],[7,69,2],[11,67,3]],
  [[0,69,2],[3,73,2],[7,76,3],[12,74,2]],
  [[0,73,2.5],[4,71,2],[8,69,4.3]],
];
const STAR_SLOPE = [
  [[0,74,2.7],[4,73,2.1],[7,69,3],[12,66,2]],
  [[0,69,3],[5,71,2],[9,73,3],[13,71,2]],
  [[0,71,3],[4,74,2],[8,69,2],[11,66,3]],
  [[0,67,2],[3,71,2.5],[7,74,2.5],[12,79,2]],
  [[0,76,2.1],[4,74,2],[8,71,2.5],[12,69,2.5]],
  [[0,74,2],[3,71,2],[7,69,3],[12,67,2]],
  [[0,73,3],[5,76,2.3],[9,74,2.5],[13,71,2]],
  [[0,69,3],[5,73,2],[9,71,2],[12,69,3]],
];
const THEMES = [SNOW_BUNNY, CANDY_CARVE, STAR_SLOPE];

function section(bar) {
  if (bar < 4) return {name:'First Snowflakes',density:.42,theme:0};
  if (bar < 16) return {name:'Bunny Hill',density:.72,theme:0};
  if (bar < 32) return {name:'Candy Carving',density:.82,theme:1};
  if (bar < 48) return {name:'Marshmallow Mountain',density:.94,theme:0};
  if (bar < 64) return {name:'Cloudlift',density:.56,theme:2};
  if (bar < 80) return {name:'Rainbow Slalom',density:.91,theme:1};
  if (bar < 96) return {name:'Frost Shroom Flight',density:1.0,theme:2};
  if (bar < 112) return {name:'Starry Downhill',density:1.05,theme:1};
  if (bar < 124) return {name:'Warm Mittens',density:.76,theme:0};
  return {name:'Back to the Summit',density:.47,theme:0};
}

/** Fully reproducible note score. The same 128-bar song plays every time. */
export function buildRapidRainScore() {
  const events=[];
  const add=(bar,step,type,note=0,len=1,velocity=1,extras={})=>{
    if(bar<0 || bar>=128 || step<0 || step>=16)return;
    events.push({t:bar*BAR+step*STEP,type,note,
      duration:Math.min(len*STEP,(16-step)*STEP+.025),velocity,...extras});
  };
  const KICKS=[[0,8],[0,7,10],[0,8,11],[0,6,8],
               [0,8],[0,6,11],[0,8,14],[0,7,10]];
  const BASSES=[
    [[0,2.3,0],[3.3,2.4,7],[8.6,2.4,0],[12.3,2,12]],
    [[0,3.3,0],[5,2.2,12],[9,2.7,7],[13.3,1.8,0]],
    [[0,2.5,0],[4.4,2,7],[8.5,2.1,0],[12.5,2.6,12]],
    [[0,3,0],[5.1,1.8,12],[9.1,2.6,0],[13,2.2,7]],
  ];
  for(let bar=0;bar<128;bar++) {
    const sc=section(bar),ch=CHORDS[bar%8],intro=bar<4,outro=bar>=124;
    const fill=bar%8===7&&!outro,quarter=bar%16===15;
    const pattern=KICKS[(bar+Math.floor(bar/8))%KICKS.length];
    // Deliberate rhythm: no constant 16th-note drum walls.
    if (bar>=2 && !outro) {
      for(const [i,st] of pattern.entries())
        add(bar,st,'kick',0,1.3,i===0?.72:.57,{gate:i>1?.66:0});
      [4,12].forEach((st,i)=>add(bar,st,'snare',0,1.1,i===0?.43:.46,{gate:intro?.5:0}));
      for(let st=0;st<16;st+=2) {
        const upbeat=(st%4===2),atBackbeat=(st===4||st===12);
        const swing=upbeat?.17:0;
        const vel=(upbeat?.25:.17)*(atBackbeat?.67:1);
        add(bar,st+swing,'hat',0,.42,vel,{gate:st%4===0?.44:.12,pan:upbeat?.11:-.1});
      }
      // Extra percussion appears only when speeding up. Keeps the slow groove spacious.
      if(bar>=16 && sc.density>.7) {
        [3.5,11.5].forEach((st,j)=>add(bar,st,'hat',0,.22,.095,
          {gate:.86,pan:j?.08:-.08}));
      }
      if(fill) {
        [13.5,15].forEach((st,j)=>add(bar,st,'snare',0,.35,j?.14:.11,{gate:.8}));
      }
    } else if(outro) {
      add(bar,0,'kick',0,1.25,.51);
      [2,6,10,14].forEach(st=>add(bar,st,'hat',0,.35,.12));
    } else {
      [2,6,10,14].forEach(st=>add(bar,st,'hat',0,.42,.13));
    }
    // Separate bass rhythmic lane, staccato for kick/bass separation.
    if(bar>=2) {
      for(const [i,[step,length,interval]] of BASSES[(bar+Math.floor(bar/4))%4].entries()) {
        const n=ch.root + (interval===12?12:interval===7?7:0);
        add(bar,step,'bass',n,length, i===0?.49:.39,
          {gate:outro?.53:0});
      }
    }
    // Composed main melody, musical rests between notes. No piano or marimba.
    const theme=THEMES[sc.theme][bar%8];
    if(bar>=2 && !outro) {
      for(const [i,[st,midi,dur]] of theme.entries()) {
        const change=(Math.floor(bar/16)%2===1 && i===theme.length-1)?-2:0;
        add(bar,st,'lead',midi+change,dur,.30+(i===0?.045:0),
          {gate:intro?.7:(i>2?.38:0),pan:(i%3-1)*.08});
      }
    } else if(intro) {
      [ [4,69,2.5], [10,73,2.7] ].forEach(([st,n,dur])=>
        add(bar,st,'lead',n,dur,.18,{pan:0}));
    }
    // Supporting synth chirps are sparse and mostly enter at snowboard speed.
    if(bar>=8 && !outro && bar%2===0) {
      add(bar,6.5,'pluck',ch.notes[2]+12,.7,.16,{gate:.68,pan:-.23});
      add(bar,14,'pluck',ch.notes[1]+12,.75,.13,{gate:.9,pan:.22});
    }
    if(bar>=16 && bar<124 && bar%4===2)
      add(bar,10,'bubble',ch.notes[0]+12,.8,.12,{gate:.77,pan:.16});
    // Soft chord wash, never busy keyboard chords. Only one chord every two bars.
    if(bar%2===0) {
      add(bar,0,'pad',0,19,.085,{notes:ch.notes.map(n=>n-12),gate:0});
    }
    // Two quiet chords in each 8-bar phrase provide a warm retro backdrop.
    if(bar>=16 && bar<124 && bar%4===0)
      add(bar,8,'keys',0,4.8,.084,{notes:[ch.notes[0],ch.notes[2]],gate:.33});
    if(bar%16===0 && bar!==0 && bar<124) add(bar,0,'crash',0,2,.085);
    if(quarter && bar<124) add(bar,14.3,'rise',0,1.55,.10,{gate:.55});
  }
  events.sort((a,b)=>a.t-b.t);
  // No bass voices overlap, even when patterns cross bar boundaries.
  const bass=events.filter(e=>e.type==='bass');
  for(let i=0;i<bass.length-1;i++) bass[i].duration=Math.min(bass[i].duration,
    Math.max(.05,bass[i+1].t-bass[i].t-.047));
  return events;
}
export const EVENT_COUNT = buildRapidRainScore().length;
const SCORE = buildRapidRainScore();
function lowerBound(es,time){let lo=0,hi=es.length;while(lo<hi){const m=(lo+hi)>>1;if(es[m].t<time)lo=m+1;else hi=m;}return lo;}

export class ProceduralRapidRain {
  constructor({volume=.72,onEnded=null}={}) {
    this.volume=clamp(volume,0,1);this.onEnded=onEnded;
    this.ctx=null;this.master=null;this.musicBus=null;this.drumBus=null;
    this.bassBus=null;this.analyser=null;this.noiseBuffer=null;
    this.layerGains={};this.layerVolumes=Object.fromEntries(RAPID_RAIN_LAYERS.map(t=>[t,1]));
    this.muted=new Set();this.soloed=new Set();this.listeners=new Map();
    this.active=new Set();this.timer=null;this.score=SCORE;
    this.position=0;this.startPosition=0;this.startCtx=0;this.cursor=0;
    this.isPlaying=false;this.tempo=BPM;this.intensity=.55;
    this.arrangement='auto';this.warmth=.72;this.loop=true;
    this._lastBeat=-1;this._lastSection='';this._lastGameUpdate=0;
    this._eventAt=new Map();this._game={speed:21.5,powered:false};
  }
  getDuration(){return DURATION;}
  getTime(){
    if(!this.isPlaying||!this.ctx)return this.position;
    const elapsed=this.startPosition+Math.max(0,this.ctx.currentTime-this.startCtx)*this.tempo/BPM;
    return this.loop ? (elapsed%DURATION+DURATION)%DURATION : clamp(elapsed,0,DURATION);
  }
  getProgress(){return this.getTime()/DURATION;}
  getSection(){return section(Math.min(127,Math.floor(this.getTime()/BAR))).name;}
  getTempo(){return this.tempo;}
  getBeat(){return this.getTime()*BPM/60;}
  getBeatPhase(){const beat=this.getBeat();return beat-Math.floor(beat);}
  getEnergy(){
    if(!this.analyser)return 0;
    if(!this._energyBins)this._energyBins=new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this._energyBins);
    let sum=0;for(const v of this._energyBins)sum+=v;
    return sum/(this._energyBins.length*255);
  }
  on(event,callback){
    if(typeof callback!=='function')return()=>{};
    let handlers=this.listeners.get(event);
    if(!handlers){handlers=new Set();this.listeners.set(event,handlers);}handlers.add(callback);
    return ()=>this.off(event,callback);
  }
  off(event,callback){this.listeners.get(event)?.delete(callback);}
  _emit(type,detail){for(const fn of this.listeners.get(type)||[])try{fn(detail);}catch(e){console.warn('SNOW 64 music callback:',e);}}
  setTempo(value){
    const bpm=clamp(Number(value)||BPM,85,190);
    if(Math.abs(bpm-this.tempo)<.12)return;
    if(this.isPlaying&&this.ctx){this.startPosition=this.getTime();this.startCtx=this.ctx.currentTime;}
    this.tempo=bpm;this._emit('tempo',{bpm});
  }
  setVolume(v){this.volume=clamp(Number(v)||0,0,1);if(this.master&&this.ctx)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.028);}
  setWarmth(v=.72){
    this.warmth=clamp(Number(v)||0,0,1);
    if(this.outputFilter&&this.ctx)this.outputFilter.frequency.setTargetAtTime(9800-3800*this.warmth,this.ctx.currentTime,.12);
  }
  setInstrumentVolume(type,level){if(!(type in this.layerVolumes))return false;this.layerVolumes[type]=clamp(Number(level)||0,0,1.5);this._refreshLayers();return true;}
  muteInstrument(type,muted=true){if(!(type in this.layerVolumes))return false;muted?this.muted.add(type):this.muted.delete(type);this._refreshLayers();return true;}
  soloInstrument(type,solo=true){if(!(type in this.layerVolumes))return false;solo?this.soloed.add(type):this.soloed.delete(type);this._refreshLayers();return true;}
  setIntensity(value){this.intensity=clamp(Number(value)||0,0,1.35);this._refreshLayers();}
  transitionTo(name,{bars=2}={}){
    if(!['auto','calm','groove','peak'].includes(name))return false;
    this.arrangement=name;
    if(name!=='auto'){
      const amt={calm:.27,groove:.66,peak:1.23}[name];
      this.intensity=amt;this._refreshLayers(Math.max(.08,bars*2*60/this.tempo));
    }
    this._emit('arrangement',{name,bars});return true;
  }
  _refreshLayers(smoothing=.12){
    if(!this.ctx)return;const now=this.ctx.currentTime;
    const levels={lead:.65,pluck:.35,bubble:.31,keys:.32,pad:.33,bass:.82,
      kick:.98,snare:.70,hat:.64,glitch:.15,rise:.20,crash:.27};
    for(const type of RAPID_RAIN_LAYERS){
      const bus=this.layerGains[type];if(!bus)continue;
      const audible=!this.muted.has(type)&&(this.soloed.size===0||this.soloed.has(type));
      const expression=isDrum(type)?(.76+.16*this.intensity):type==='pad'?.86:(.68+.26*this.intensity);
      bus.gain.setTargetAtTime(audible?levels[type]*this.layerVolumes[type]*expression:0,now,smoothing);
    }
  }
  updateFromGame({playing=true,speed=21.5,powered=false,inAir=false,recovery=false,tuck=false,airHeight=0,steer=0}={}){
    if(!this.isPlaying||!playing||!this.ctx)return;
    const now=this.ctx.currentTime;if(now-this._lastGameUpdate<.16)return;
    this._lastGameUpdate=now;this._game={speed,powered,inAir,recovery};
    // Score tempo and drum subdivisions accelerate together; pitches do NOT change.
    const goal=clamp(114+Math.max(0,speed)*.95+(powered?7:0),116,184);
    this.setTempo(this.tempo+(goal-this.tempo)*.19);
    if(this.arrangement==='auto'){
      const target=recovery?.2:clamp(.29+speed/75+(powered?.34:0)+(tuck?.08:0)+(inAir?.1:0),.32,1.32);
      this.setIntensity(this.intensity+(target-this.intensity)*.2);
    }
    this._emit('motion',{speed,powered,inAir,recovery,tuck,steer,airHeight,bpm:this.tempo,intensity:this.intensity});
  }
  reactToGameEvent(kind){
    if(!this.isPlaying||!this.ctx)return;
    const now=this.ctx.currentTime;
    if(now-(this._eventAt.get(kind)??-99)<.15)return;
    this._eventAt.set(kind,now);
    if(kind==='power')this._emit('power',{time:this.getTime()});
    if(['power','combo','land','shatter','magicTrick','superRamp'].includes(kind))
      this._emit('accent',{kind,time:this.getTime(),beat:this.getBeat()});
    // Tiny consonant flourishes, never a full extra drum kit over the score.
    if(['pickup','magicTrick','combo','power'].includes(kind)){
      const note={pickup:81,magicTrick:78,combo:76,power:86}[kind];
      this._playEvent({type:'bubble',note,duration:.10,velocity:.12,pan:.14},now+.02);
    }
    if(['crash','rockHit','rampHit','shatter'].includes(kind) && this.ctx){
      const p=this.ctx.currentTime;
      if(this.musicBus){
        const g=this.musicBus.gain;g.cancelScheduledValues(p);g.setValueAtTime(g.value,p);
        g.linearRampToValueAtTime(kind==='shatter'?.68:.48,p+.025);
        g.setTargetAtTime(1,p+.16,.19);
      }
    }
  }
  async _ensureAudio(){
    if(this.ctx){if(this.ctx.state==='suspended')await this.ctx.resume();return;}
    const C=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!C)throw new Error('Web Audio is not available in this browser.');
    const ctx=this.ctx=new C({latencyHint:'interactive'});
    const master=this.master=ctx.createGain();master.gain.value=this.volume;
    const comp=ctx.createDynamicsCompressor();comp.threshold.value=-13;comp.knee.value=9;
    comp.ratio.value=2.25;comp.attack.value=.008;comp.release.value=.16;
    const low=ctx.createBiquadFilter();low.type='highpass';low.frequency.value=32;
    const out=this.outputFilter=ctx.createBiquadFilter();out.type='lowpass';out.frequency.value=9800-3800*this.warmth;
    const analyser=this.analyser=ctx.createAnalyser();analyser.fftSize=512;
    const mix=this.musicBus=ctx.createGain();mix.gain.value=1;
    mix.connect(low);low.connect(out);out.connect(comp);comp.connect(analyser);analyser.connect(master);master.connect(ctx.destination);
    this.drumBus=ctx.createGain();this.drumBus.gain.value=1;
    this.drumBus.connect(mix);
    this.bassBus=ctx.createGain();this.bassBus.gain.value=1;
    this.bassBus.connect(mix);
    // Tiny synthesized stereo ambience, only for melodies/pads. The drum kit stays DRY.
    const reverb=ctx.createConvolver();
    const ir=ctx.createBuffer(2,Math.floor(ctx.sampleRate*.72),ctx.sampleRate);
    let seed=38719;
    const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};
    for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);
      for(let i=0;i<d.length;i++)d[i]=rnd()*Math.pow(1-i/d.length,3.2)*.25;}
    reverb.buffer=ir;const wet=ctx.createGain();wet.gain.value=.085;
    reverb.connect(wet);wet.connect(mix);this.reverb=reverb;
    // Noise is procedurally synthesized once, not downloaded or stored as a file.
    const buffer=this.noiseBuffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*1.0),ctx.sampleRate);
    const data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=rnd()*.88;
    for(const type of RAPID_RAIN_LAYERS){
      const gain=ctx.createGain();this.layerGains[type]=gain;
      gain.connect(type==='bass'?this.bassBus:isDrum(type)?this.drumBus:mix);
      if(['pad','lead','keys','bubble','pluck'].includes(type))gain.connect(reverb);
    }
    this._refreshLayers(.01);
  }
  _osc(type,freq,when,stop,dest,gain=.5,detune=0){
    const c=this.ctx,o=c.createOscillator(),g=c.createGain();
    o.type=type;o.frequency.setValueAtTime(Math.max(1,freq),when);o.detune.value=detune;
    g.gain.value=gain;o.connect(g);g.connect(dest);
    o.start(when);o.stop(stop);this.active.add(o);
    o.onended=()=>{this.active.delete(o);o.disconnect();g.disconnect();};return o;
  }
  _env(when,attack,peak,release,dest){
    const g=this.ctx.createGain();
    g.gain.setValueAtTime(EPS,when);
    g.gain.linearRampToValueAtTime(Math.max(EPS,peak),when+Math.max(.003,attack));
    g.gain.exponentialRampToValueAtTime(EPS,Math.max(when+attack+.025,when+release));
    g.connect(dest);return g;
  }
  _noise(when,stop,dest){
    const c=this.ctx,src=c.createBufferSource();src.buffer=this.noiseBuffer;
    src.start(when,random(when*433)%Math.max(.01,src.buffer.duration-(stop-when)-.01));
    src.stop(stop);src.connect(dest);this.active.add(src);
    src.onended=()=>{this.active.delete(src);src.disconnect();};return src;
  }
  _pan(gain,pan=0){
    if(Math.abs(pan)<.01)return gain;
    const p=this.ctx.createStereoPanner();p.pan.value=clamp(pan,-.65,.65);
    gain.connect(p);return p;
  }
  _playEvent(ev,when){
    const c=this.ctx;if(!c)return;
    const {type,note=0,duration=.15,velocity=.5,pan=0}=ev;
    const target=this.layerGains[type];if(!target)return;
    const v=velocity, f=midiHz(note),t=Math.max(.06,duration),end=when+t+.03;
    if(type==='kick'){
      const g=this._env(when,.006,v*.86,Math.min(.24,t*.95),target);
      const o=this._osc('sine',165,when,when+.25,g,.85);
      o.frequency.exponentialRampToValueAtTime(51,when+.12);
      o.frequency.setTargetAtTime(44,when+.13,.04);
      // Bass ducked ONLY on the kick, not side-chained to every snare/hat.
      if(this.bassBus){const bg=this.bassBus.gain;
        bg.setValueAtTime(1,when);bg.linearRampToValueAtTime(.52,when+.012);
        bg.linearRampToValueAtTime(1,when+.16);}
      return;
    }
    if(type==='snare'){
      const b=c.createBiquadFilter();b.type='bandpass';b.frequency.value=1750;b.Q.value=.75;b.connect(target);
      const g=this._env(when,.004,v*.48,.115,b);
      this._noise(when,when+.14,g);
      const bo=this._env(when,.002,v*.22,.075,target);
      const o=this._osc('triangle',175,when,when+.09,bo,.65);
      o.frequency.exponentialRampToValueAtTime(110,when+.08);return;
    }
    if(type==='hat'){
      const hp=c.createBiquadFilter();hp.type='highpass';hp.frequency.value=5100;
      const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=8900;
      hp.connect(lp);lp.connect(target);
      const g=this._env(when,.002,v*.29,Math.min(.073,t),hp);
      this._noise(when,when+Math.min(.082,t+.01),g);return;
    }
    if(type==='bass'){
      const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=440;lp.Q.value=.66;
      lp.connect(target);
      const g=this._env(when,.008,v*.47,Math.min(.40,t+.032),lp);
      this._osc('triangle',f,when,when+t+.04,g,.76);
      this._osc('sine',f,when,when+t+.04,g,.30,2);
      return;
    }
    if(type==='lead'){
      // Smooth, rubbery toy-synth flute, NOT keyboard or marimba.
      const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2450;lp.Q.value=.52;
      lp.connect(target);
      const g=this._env(when,.025,v*.31,Math.min(.50,t+.08),lp);
      const o=this._osc('triangle',f,when,when+t+.10,g,.78);
      o.frequency.setValueAtTime(f*1.012,when);
      o.frequency.setTargetAtTime(f,when+.014,.045);
      this._osc('sine',f,when,when+t+.10,g,.22,3);
      return;
    }
    if(type==='pluck'||type==='bubble'){
      const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=type==='bubble'?1700:2600;
      lp.connect(target);
      const g=this._env(when,.005,v*.30,Math.min(.16,t+.04),lp);
      const o=this._osc('sine',f,when,when+t+.045,g,1);
      if(type==='bubble'){
        o.frequency.setValueAtTime(f*.88,when);
        o.frequency.exponentialRampToValueAtTime(f,when+.054);
      }
      return;
    }
    if(type==='pad'||type==='keys'){
      const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=type==='pad'?1150:1650;
      lp.connect(target);
      const release=Math.min(type==='pad'?1.9:.55,t+.35);
      const g=this._env(when,type==='pad'?.30:.04,v*.18,release,lp);
      for(const [i,n] of (ev.notes||[note]).entries()){
        this._osc('triangle',midiHz(n),when,when+Math.max(.2,release)+.05,g,.28,(i-1)*3);
      }
      return;
    }
    if(type==='rise'||type==='crash'||type==='glitch'){
      const bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=type==='crash'?3200:1900;
      bp.Q.value=.8;bp.connect(target);
      const g=this._env(when,.012,v*.16,Math.min(t,.25),bp);
      this._noise(when,when+Math.min(.33,t+.015),g);
    }
  }
  _shouldPlayEvent(ev){
    if(this.muted.has(ev.type))return false;
    if(this.soloed.size&&!this.soloed.has(ev.type))return false;
    // Gate only embellishments: melody, bass and backbeat stay intact at slow speeds.
    if((ev.gate||0)>this.intensity)return false;
    return true;
  }
  _tick(){
    if(!this.isPlaying||!this.ctx)return;
    const now=this.ctx.currentTime,horizon=now+.095,rate=this.tempo/BPM;
    while(this.cursor<this.score.length){
      const ev=this.score[this.cursor];
      const at=this.startCtx+(ev.t-this.startPosition)/rate;
      if(at>horizon)break;
      this.cursor++;
      if(at<now-.045||!this._shouldPlayEvent(ev))continue;
      this._playEvent({...ev,duration:ev.duration/rate},Math.max(now+.003,at));
    }
    const elapsed=this.startPosition+Math.max(0,now-this.startCtx)*rate;
    const beatIndex=Math.floor(elapsed*BPM/60);
    if(beatIndex!==this._lastBeat){
      this._lastBeat=beatIndex;
      this._emit('beat',{beat:((beatIndex%4)+4)%4,bar:Math.floor(beatIndex/4),bpm:this.tempo,
        time:this.getTime(),phase:this.getBeatPhase()});
    }
    const name=this.getSection();
    if(name!==this._lastSection){this._lastSection=name;this._emit('section',{name,time:this.getTime()});}
    const endAt=this.startCtx+(DURATION-this.startPosition)/rate;
    if(this.loop && this.cursor>=this.score.length && horizon>=endAt){
      this.startCtx=endAt;this.startPosition=0;this.cursor=0;this._lastBeat=-1;
      this._emit('loop',{time:0});
    }else if(!this.loop&&elapsed>=DURATION){
      this.pause();this.position=DURATION;this._emit('ended',{});this.onEnded?.();
    }
  }
  _killVoices(){if(!this.ctx)return;for(const x of [...this.active])try{x.stop(this.ctx.currentTime);}catch{}this.active.clear();}
  async play(){
    if(this.isPlaying)return;
    await this._ensureAudio();
    if(this.position>=DURATION-.01)this.position=0;
    this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.012);
    this.startPosition=this.position;this.startCtx=this.ctx.currentTime+.055;
    this.cursor=lowerBound(this.score,this.startPosition);
    this._lastBeat=-1;this._lastSection='';this.isPlaying=true;
    this._tick();this.timer=setInterval(()=>this._tick(),25);
  }
  async resume(){return this.play();}
  pause(){
    if(!this.isPlaying)return;
    this.position=this.getTime();this.isPlaying=false;
    clearInterval(this.timer);this.timer=null;
    this._killVoices();if(this.ctx)this.master.gain.setTargetAtTime(EPS,this.ctx.currentTime,.012);
  }
  stop(){this.pause();this.position=0;this._lastBeat=-1;}
  seek(seconds){const was=this.isPlaying;this.pause();this.position=clamp(Number(seconds)||0,0,DURATION);if(was)this.play();}
  async dispose(){
    this.stop();this.listeners.clear();
    if(this.ctx){try{await this.ctx.close();}catch{}this.ctx=null;}
  }
}
export default ProceduralRapidRain;
export class RapidRainV2 extends ProceduralRapidRain {}
