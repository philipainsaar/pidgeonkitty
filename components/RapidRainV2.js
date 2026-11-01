/**
 * SNOW 64 - KAWAII SLOPE V5 / LIVE POWDER
 * An original, procedural downhill soundtrack with humanized acoustic-inspired instruments.
 * Organic 1990s-inspired downhill groove: fingered bass, breathy flute, real-feeling drum kit.
 * No MP3, prerecorded samples, audio files, external libraries, fetches or MIDI.
 * Tiny instrument waveforms are physically modeled into AudioBuffers in-browser.
 *
 * Single-file, drop-in replacement for components/RapidRainV2.js.
 * Keeps the RapidRainV2 API used by snow64Music.js and Snow64ReactiveMusic.jsx.
 * A new physically-inspired sound engine with the original Kawaii Slope V4 melody.
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
  const KICKS=[[0,8],[0,7,10],[0,8],[0,6,8],
               [0,8],[0,6,11],[0,8,14],[0,8]];
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
        [13.75].forEach((st,j)=>add(bar,st,'snare',0,.35,.105,{gate:.90}));
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
        add(bar,st,'lead',midi+change,dur*.91,.34+(i===0?.045:0),
          {gate:intro?.7:(i>2?.38:0),pan:(i%3-1)*.08});
      }
    } else if(intro) {
      [ [4,69,2.5], [10,73,2.7] ].forEach(([st,n,dur])=>
        add(bar,st,'lead',n,dur,.18,{pan:0}));
    }
    // Supporting synth chirps are sparse and mostly enter at snowboard speed.
    if(bar>=8 && !outro && bar%2===0) {
      add(bar,6.5,'pluck',ch.notes[2]+12,.7,.16,{gate:.68,pan:-.23});
      // Leave the last two beats free for the next melodic phrase.
    }
    if(bar>=16 && bar<124 && bar%4===2)
      add(bar,10,'bubble',ch.notes[0]+12,.7,.085,{gate:.99,pan:.16});
    // Soft chord wash, never busy keyboard chords. Only one chord every two bars.
    if(bar%2===0) {
      add(bar,0,'pad',0,19,.052,{notes:ch.notes.map(n=>n-12),gate:0});
    }
    // Two quiet chords in each 8-bar phrase provide a warm retro backdrop.
    if(bar>=16 && bar<124 && bar%4===0)
      add(bar,8,'keys',0,3.5,.065,{notes:[ch.notes[0],ch.notes[2]],gate:.45});
    if(bar%16===0 && bar!==0 && bar<124) add(bar,0,'crash',0,2,.085);
    if(quarter && bar<124) add(bar,14.3,'rise',0,1.55,.10,{gate:.55});
  }
  // Pocket-playing: deterministic 5-12 ms timing drift and small variations in touch.
  // Downbeat kick stays firmly locked; everything else breathes around it.
  events.forEach((ev,i)=>{
    const r=random(i*1.712+ev.note*.093+ev.t*.31);
    if(ev.type==='hat')ev.t+=.002+(r-.5)*.011;
    else if(ev.type==='snare')ev.t+=.004+(r-.5)*.008;
    else if(ev.type==='lead')ev.t+=.007+(r-.5)*.014;
    else if(ev.type==='pluck'||ev.type==='keys'||ev.type==='bubble')ev.t+=.004+(r-.5)*.009;
    else if(ev.type==='bass')ev.t+=.001+(r-.5)*.006;
    ev.velocity*=.92+r*.17;
    ev.variant=Math.floor(random(i+80.321)*4);
  });
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

/**
 * Procedural sample-bank: buffers are generated from physical/noise models in RAM.
 * There are no sample downloads, stored audio files, or music assets.
 * Each instrument has four round-robins. This is not identical to recorded instruments,
 * but is substantially more expressive than continuously identical sine oscillators.
 */
const MODEL_RATE = 24000;
const TWO_PI = 2*Math.PI;
function seeded(seed){let x=(seed|0)>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296*2-1;};}
function sampleModel(type,midi,variant,sr=MODEL_RATE){
  const D={kick:.45,snare:.43,hat:.19,crash:1.1,rise:.43,
    bass:1.0,lead:1.20,pluck:.88,bubble:.62,keys:1.25,pad:2.55,glitch:.18};
  const length=D[type]||.7;
  const out=new Float32Array(Math.ceil(sr*length));
  const rand=seeded(1234567+Math.imul(Math.round(midi)+67,3737)+Math.imul(variant+7,11299)+type.length*3167);
  const f=midiHz(midi||60);
  let prev=0,hi=0,phase=0,phase2=0,drift=0;
  if(type==='bass'||type==='pluck'||type==='keys'){
    // Karplus-Strong damped-string model: a real resonating string-like decay.
    const freq=type==='bass'?f:(type==='keys'?f:f*1.0);
    const N=Math.max(11,Math.round(sr/freq-.6));
    const string=new Float32Array(N);
    const pick=(type==='bass'?.19:type==='keys'?.28:.24)+variant*.013;
    let smooth=0;
    for(let k=0;k<N;k++){
      smooth=.50*smooth+.50*rand();
      // The string excitation varies by pick position/velocity.
      string[k]=smooth*.67+Math.sin(k/N*TWO_PI)*.30;
    }
    let lp=0,sub=0;
    const feedback=type==='bass'?.992:type==='keys'?.9915:.987;
    const damping=type==='bass'?.52:.41;
    for(let i=0;i<out.length;i++){
      const t=i/sr,k=i%N;
      const current=string[k],neighbor=string[(k+1)%N];
      lp+=damping*(current-lp);
      string[k]=feedback*(lp*.87+neighbor*.13);
      const envelope=Math.exp(-t*(type==='bass'?1.7:type==='keys'?2.15:2.7));
      const pickTick=(rand()-prev)*Math.exp(-t*115)*(type==='bass'?.035:.075);
      prev=rand()*.1;
      // Rounded body and faint vibrating fundamental, rather than harsh saw waves.
      sub=Math.sin(TWO_PI*f*t);
      const bassBody=type==='bass'? .14*sub*Math.exp(-t*3.3):.065*sub*Math.exp(-t*5);
      const stringBody=(current*.77+lp*.23)*(.66+pick*.26);
      out[i]=(stringBody+bassBody+pickTick)*envelope;
    }
  }else if(type==='lead'||type==='bubble'){
    // Breath-driven wooden flute/ocarina with soft tongue transient, delayed vibrato,
    // natural air noise, and tiny non-periodic pitch drift.
    let breath=0,air=0;
    const airy=type==='lead';
    for(let i=0;i<out.length;i++){
      const t=i/sr;
      const vibrato=Math.sin(TWO_PI*(5.2+variant*.13)*t+variant*.7)*(.0018*Math.min(1,Math.max(0,(t-.11)/.23)));
      drift+=rand()*.000004;drift*=.996;
      const pitch=f*(1+vibrato+drift+(.0017-variant*.0003)*Math.exp(-t*12));
      phase+=TWO_PI*pitch/sr;
      const tone=Math.sin(phase)+(airy?.17:.28)*Math.sin(2*phase+.37)+.046*Math.sin(3*phase+.8);
      breath=breath*.963+rand()*.037;
      air+=.34*(rand()-air);
      const chiff=air*Math.exp(-t*53)*.13;
      const attack=Math.min(1,Math.max(0,t/(airy?.059:.034)));
      const natural=Math.exp(-Math.max(0,t-(airy?.9:.41))*(airy?2.2:6));
      const flutter=1+.026*Math.sin(TWO_PI*3.7*t+variant*.8)+.011*Math.sin(TWO_PI*8.9*t);
      out[i]=(tone*(airy?.74:.62)+breath*(airy?.30:.14)+chiff)*attack*natural*flutter;
    }
  }else if(type==='kick'){
    // Acoustic-like kick: moving drumhead, quick soft beater, rounded room body.
    let click=0;
    for(let i=0;i<out.length;i++){
      const t=i/sr;
      const hz=51+78*Math.exp(-t*42)+7*Math.exp(-t*8);
      phase+=TWO_PI*hz/sr;
      click=click*.60+rand()*.40;
      const body=Math.sin(phase)*Math.exp(-t*19);
      const beater=click*Math.exp(-t*205)*.12;
      const thud=Math.sin(TWO_PI*67*t+1.2)*Math.exp(-t*32)*.18;
      out[i]=.85*body+beater+thud;
    }
  }else if(type==='snare'){
    // Snare rattle + two pitched shell resonances, no harsh white-noise wall.
    let noiseLP=0,noiseHi=0;
    const shell=(182+variant*3.5);
    for(let i=0;i<out.length;i++){
      const t=i/sr,r=rand();
      noiseLP+=.23*(r-noiseLP);
      noiseHi+=.60*(r-noiseHi);
      const wire=(noiseHi-noiseLP*.46)*Math.exp(-t*(30-variant*1.5));
      const ring=(Math.sin(TWO_PI*shell*t+.14)*.29+
        Math.sin(TWO_PI*(shell*1.66)*t+.6)*.15)*Math.exp(-t*23);
      const brush=rand()*Math.exp(-t*125)*.027;
      out[i]=wire*.59+ring+brush;
    }
  }else if(type==='hat'||type==='crash'||type==='rise'||type==='glitch'){
    // Inharmonic metallic resonators + shaded filtered noise. Non-identical hits.
    const metal=[1,1.317,1.633,2.035,2.311,2.824];
    let low=0,sheen=0;
    const base=type==='hat'?2350:type==='crash'?1040:920;
    const tau=type==='hat'?48:type==='crash'?4.8:10;
    for(let i=0;i<out.length;i++){
      const t=i/sr,r=rand();
      low+=.40*(r-low);
      sheen+=.75*(r-sheen);
      let m=0;
      for(let j=0;j<metal.length;j++){
        m+=Math.sin(TWO_PI*base*metal[j]*t*(1+(variant-1)*.0011)+j*1.2)/(j+2.3);
      }
      const decay=Math.exp(-t*(tau+(variant-1)*1.9));
      const noise=(sheen-low*.8)*.39;
      const edge=(m*.32+noise)*decay;
      const fadeIn=type==='rise'? Math.pow(Math.min(1,t/.33),1.8):1;
      out[i]=edge*fadeIn;
    }
  }else if(type==='pad'){
    // Intentionally quiet airy string/woodwind ensemble, not an electronic key chord.
    let air=0;
    for(let i=0;i<out.length;i++){
      const t=i/sr;
      phase+=TWO_PI*f*(1+.0014*Math.sin(t*TWO_PI*3.9+variant))/sr;
      phase2+=TWO_PI*f*1.003/sr;
      air=air*.987+rand()*.013;
      const bowed=.58*Math.sin(phase)+.24*Math.sin(phase2)+.075*Math.sin(2*phase);
      out[i]=(bowed+air*.12)*Math.min(1,t/.29)*Math.exp(-t*.35);
    }
  }
  // Anti-click window and stable normalization. Absolute levels still come from score velocity.
  const fade=isDrum(type)?30:(type==='bass'||type==='pluck'||type==='keys'?65:160);
  const fadeOut=Math.min(350,Math.floor(out.length/9));
  let peak=0;
  for(let i=0;i<out.length;i++){
    if(i<fade)out[i]*=i/Math.max(1,fade);
    if(i>=out.length-fadeOut)out[i]*=(out.length-i-1)/Math.max(1,fadeOut);
    peak=Math.max(peak,Math.abs(out[i]));
  }
  const scale=peak>0?.71/peak:1;
  for(let i=0;i<out.length;i++)out[i]*=scale;
  return out;
}

export class ProceduralRapidRain {
  constructor({volume=.72,onEnded=null}={}){
    this.volume=clamp(volume,0,1);this.onEnded=onEnded;
    this.ctx=null;this.master=null;this.mix=null;this.bassBus=null;this.analyser=null;
    this.layerGains={};this.layerVolumes=Object.fromEntries(RAPID_RAIN_LAYERS.map(t=>[t,1]));
    this.muted=new Set();this.soloed=new Set();this.listeners=new Map();
    this.active=new Set();this.cache=new Map();this.timer=null;this.score=SCORE;
    this.position=0;this.startPosition=0;this.startCtx=0;this.cursor=0;
    this.isPlaying=false;this.tempo=BPM;this.intensity=.55;this.arrangement='auto';
    this.warmth=.66;this.loop=true;this._lastBeat=-1;this._lastSection='';
    this._lastGameUpdate=0;this._eventAt=new Map();this._game={speed:21.5,powered:false};
    this._layerBase={lead:.87,pluck:.22,bubble:.13,keys:.16,pad:.23,bass:.61,
      kick:.72,snare:.59,hat:.34,glitch:.10,rise:.10,crash:.16};
  }
  getDuration(){return DURATION;}
  getTime(){
    if(!this.isPlaying||!this.ctx)return this.position;
    const elapsed=this.startPosition+Math.max(0,this.ctx.currentTime-this.startCtx)*this.tempo/BPM;
    return this.loop?(elapsed%DURATION+DURATION)%DURATION:clamp(elapsed,0,DURATION);
  }
  getProgress(){return this.getTime()/DURATION;}
  getSection(){return section(Math.min(127,Math.floor(this.getTime()/BAR))).name;}
  getTempo(){return this.tempo;}
  getBeat(){return this.getTime()*BPM/60;}
  getBeatPhase(){return this.getBeat()%1;}
  getEnergy(){
    if(!this.analyser)return 0;
    if(!this._energyBins)this._energyBins=new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this._energyBins);
    let sum=0;for(const v of this._energyBins)sum+=v;
    return sum/(this._energyBins.length*255);
  }
  on(name,callback){if(typeof callback!=='function')return()=>{};
    let handlers=this.listeners.get(name);if(!handlers){handlers=new Set();this.listeners.set(name,handlers);}
    handlers.add(callback);return()=>this.off(name,callback);
  }
  off(name,callback){this.listeners.get(name)?.delete(callback);}
  _emit(name,detail){for(const fn of this.listeners.get(name)||[])try{fn(detail);}catch(e){console.warn('SNOW 64 music callback:',e);}}
  setTempo(value){
    const bpm=clamp(Number(value)||BPM,85,190);
    if(Math.abs(bpm-this.tempo)<.12)return;
    if(this.isPlaying&&this.ctx){this.startPosition=this.getTime();this.startCtx=this.ctx.currentTime;}
    this.tempo=bpm;this._emit('tempo',{bpm});
  }
  setVolume(v){this.volume=clamp(Number(v)||0,0,1);
    if(this.master&&this.ctx)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.035);
  }
  setWarmth(v=.67){this.warmth=clamp(Number(v)||0,0,1);
    if(this.outputFilter&&this.ctx)this.outputFilter.frequency.setTargetAtTime(10000-this.warmth*4600,this.ctx.currentTime,.13);
  }
  setInstrumentVolume(type,level){if(!(type in this.layerVolumes))return false;
    this.layerVolumes[type]=clamp(Number(level)||0,0,1.5);this._refreshLayers();return true;
  }
  muteInstrument(type,muted=true){if(!(type in this.layerVolumes))return false;
    muted?this.muted.add(type):this.muted.delete(type);this._refreshLayers();return true;
  }
  soloInstrument(type,solo=true){if(!(type in this.layerVolumes))return false;
    solo?this.soloed.add(type):this.soloed.delete(type);this._refreshLayers();return true;
  }
  setIntensity(value){this.intensity=clamp(Number(value)||0,0,1.35);this._refreshLayers();}
  transitionTo(name,{bars=2}={}){
    if(!['auto','calm','groove','peak'].includes(name))return false;
    this.arrangement=name;
    if(name!=='auto'){
      this.intensity={calm:.24,groove:.65,peak:1.24}[name];
      this._refreshLayers(Math.max(.09,bars*2*60/this.tempo));
    }
    this._emit('arrangement',{name,bars});return true;
  }
  _refreshLayers(smoothing=.13){
    if(!this.ctx)return;const now=this.ctx.currentTime;
    for(const type of RAPID_RAIN_LAYERS){
      const bus=this.layerGains[type];if(!bus)continue;
      const active=!this.muted.has(type)&&(this.soloed.size===0||this.soloed.has(type));
      const strength=isDrum(type)?.83+.15*this.intensity:type==='pad'?.70:.72+.24*this.intensity;
      bus.gain.setTargetAtTime(active?this._layerBase[type]*this.layerVolumes[type]*strength:0,now,smoothing);
    }
  }
  updateFromGame({playing=true,speed=21.5,powered=false,inAir=false,recovery=false,tuck=false,airHeight=0,steer=0}={}){
    if(!this.isPlaying||!playing||!this.ctx)return;
    const now=this.ctx.currentTime;if(now-this._lastGameUpdate<.17)return;
    this._lastGameUpdate=now;this._game={speed,powered,inAir,recovery};
    const goal=clamp(113+Math.max(0,speed)*.98+(powered?8:0),115,182);
    this.setTempo(this.tempo+(goal-this.tempo)*.16);
    if(this.arrangement==='auto'){
      const target=recovery?.22:clamp(.32+speed/78+(powered?.31:0)+(tuck?.08:0)+(inAir?.08:0),.33,1.31);
      this.setIntensity(this.intensity+(target-this.intensity)*.18);
    }
    this._emit('motion',{speed,powered,inAir,recovery,tuck,steer,airHeight,bpm:this.tempo,intensity:this.intensity});
  }
  reactToGameEvent(kind){
    if(!this.isPlaying||!this.ctx)return;
    const now=this.ctx.currentTime;
    if(now-(this._eventAt.get(kind)??-99)<.16)return;
    this._eventAt.set(kind,now);
    if(kind==='power')this._emit('power',{time:this.getTime()});
    if(['power','combo','land','shatter','magicTrick','superRamp'].includes(kind))
      this._emit('accent',{kind,time:this.getTime(),beat:this.getBeat()});
    // Only small melodic accents. Existing game SFX stay audible and unchanged.
    if(['pickup','magicTrick','combo','power'].includes(kind)){
      const note={pickup:81,magicTrick:78,combo:76,power:86}[kind];
      this._playEvent({type:'bubble',note,duration:.10,velocity:.09,pan:.13,variant:2},now+.025);
    }
    if(['crash','rockHit','rampHit','shatter'].includes(kind)&&this.mix){
      const g=this.mix.gain,t=now;
      g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);
      g.linearRampToValueAtTime(kind==='shatter'?.73:.61,t+.018);
      g.setTargetAtTime(1,t+.15,.17);
    }
  }
  async _ensureAudio(){
    if(this.ctx){if(this.ctx.state==='suspended')await this.ctx.resume();return;}
    const C=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!C)throw new Error('Web Audio is not supported in this browser.');
    const c=this.ctx=new C({latencyHint:'interactive'});
    const master=this.master=c.createGain();master.gain.value=this.volume;
    const mix=this.mix=c.createGain();mix.gain.value=1;
    const highpass=c.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=29;
    const lowpass=this.outputFilter=c.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=10000-this.warmth*4600;
    const comp=c.createDynamicsCompressor();comp.threshold.value=-13;comp.knee.value=8;
    comp.ratio.value=2.0;comp.attack.value=.012;comp.release.value=.18;
    const analyser=this.analyser=c.createAnalyser();analyser.fftSize=512;
    mix.connect(highpass);highpass.connect(lowpass);lowpass.connect(comp);
    comp.connect(analyser);analyser.connect(master);master.connect(c.destination);
    this.bassBus=c.createGain();this.bassBus.gain.value=1;
    // A little electric-bass amp filtering keeps bass out of the kick's sub range.
    const bassHighpass=c.createBiquadFilter();bassHighpass.type='highpass';bassHighpass.frequency.value=51;
    const bassShelf=c.createBiquadFilter();bassShelf.type='lowshelf';bassShelf.frequency.value=130;bassShelf.gain.value=-1.7;
    this.bassBus.connect(bassHighpass);bassHighpass.connect(bassShelf);bassShelf.connect(mix);
    const reverb=c.createConvolver(),len=Math.ceil(.55*c.sampleRate);
    const impulse=c.createBuffer(2,len,c.sampleRate);
    let rr=seeded(423172);
    for(let ch=0;ch<2;ch++){
      const d=impulse.getChannelData(ch);
      let filtered=0;
      for(let i=0;i<len;i++){
        filtered=.66*filtered+.34*rr();
        d[i]=filtered*Math.exp(-i/c.sampleRate*8)*.13;
      }
    }
    reverb.buffer=impulse;
    const reverbWet=c.createGain();reverbWet.gain.value=.055;
    reverb.connect(reverbWet);reverbWet.connect(mix);
    this.reverb=reverb;
    for(const type of RAPID_RAIN_LAYERS){
      const g=c.createGain();g.gain.value=0;this.layerGains[type]=g;
      g.connect(type==='bass'?this.bassBus:mix);
      if(['lead','pad','pluck','bubble','keys'].includes(type))g.connect(reverb);
    }
    this._refreshLayers(.01);
  }
  _buffer(type,note=60,variant=0){
    const key=`${type}:${note}:${variant}`;
    const old=this.cache.get(key);if(old)return old;
    const wave=sampleModel(type,note,variant,MODEL_RATE);
    const b=this.ctx.createBuffer(1,wave.length,MODEL_RATE);
    b.copyToChannel(wave,0);
    this.cache.set(key,b);
    return b;
  }
  _sampleVoice(type,note,when,duration,velocity,pan,variant){
    const ctx=this.ctx,buffer=this._buffer(type,note,variant);
    const src=ctx.createBufferSource();src.buffer=buffer;
    const env=ctx.createGain();env.gain.setValueAtTime(EPS,when);
    const drums=isDrum(type)||type==='crash'||type==='rise'||type==='glitch';
    const attack=type==='lead'?.035:type==='pad'?.23:drums?.002:.008;
    const sustainTime=drums?Math.min(duration+(.11),buffer.duration-.015)
      :Math.min(duration,buffer.duration-.09);
    const peak=Math.max(.0001,velocity*(type==='kick'?1.0:type==='snare'?.83:type==='hat'?.73:1));
    const a=when+Math.max(.002,attack);
    const e=when+Math.max(attack+.028,sustainTime);
    const release=drums?.029:type==='pad'?.27:type==='lead'?.10:.052;
    env.gain.linearRampToValueAtTime(peak,a);
    env.gain.setValueAtTime(peak,Math.max(a+.001,e-release));
    env.gain.linearRampToValueAtTime(EPS,e);
    let dest=this.layerGains[type];
    if(Math.abs(pan)>.001){const p=ctx.createStereoPanner();p.pan.value=clamp(pan,-.5,.5);p.connect(dest);dest=p;}
    src.connect(env);env.connect(dest);
    src.start(when);src.stop(Math.min(when+buffer.duration,e+.01));
    this.active.add(src);
    src.onended=()=>{this.active.delete(src);try{src.disconnect();env.disconnect();}catch{}};
    return src;
  }
  _playEvent(ev,when){
    if(!this.ctx)return;
    const {type,note=0,duration=.12,velocity=.5,pan=0,variant=0}=ev;
    if(!(type in this.layerGains))return;
    if(type==='pad'||type==='keys'){
      const voices=ev.notes||[note];
      voices.forEach((n,i)=>this._sampleVoice(type==='keys'?'keys':'pad',n,
        when+i*(type==='keys'?.017:0),Math.min(duration,2.2),velocity/Math.sqrt(voices.length),
        (i-(voices.length-1)/2)*.14,variant));
    }else this._sampleVoice(type,note,when,duration,velocity,pan,variant);
    if(type==='kick'&&this.bassBus){
      const bg=this.bassBus.gain;
      // Keep kick and finger-bass distinctly separate without abrupt retrigger clicks.
      bg.cancelScheduledValues(when);bg.setValueAtTime(bg.value,when);
      bg.linearRampToValueAtTime(.65,when+.014);
      bg.setTargetAtTime(1,when+.077,.075);
    }
  }
  _shouldPlayEvent(ev){
    if(this.muted.has(ev.type))return false;
    if(this.soloed.size&&!this.soloed.has(ev.type))return false;
    return (ev.gate||0)<=this.intensity;
  }
  _tick(){
    if(!this.isPlaying||!this.ctx)return;
    const now=this.ctx.currentTime,horizon=now+.105,rate=this.tempo/BPM;
    while(this.cursor<this.score.length){
      const ev=this.score[this.cursor],at=this.startCtx+(ev.t-this.startPosition)/rate;
      if(at>horizon)break;
      this.cursor++;
      if(at<now-.045||!this._shouldPlayEvent(ev))continue;
      this._playEvent({...ev,duration:ev.duration/rate},Math.max(now+.003,at));
    }
    const elapsed=this.startPosition+Math.max(0,now-this.startCtx)*rate;
    const beatIndex=Math.floor(elapsed*BPM/60);
    if(beatIndex!==this._lastBeat){this._lastBeat=beatIndex;
      this._emit('beat',{beat:((beatIndex%4)+4)%4,bar:Math.floor(beatIndex/4),bpm:this.tempo,
        time:this.getTime(),phase:this.getBeatPhase()});}
    const name=this.getSection();
    if(name!==this._lastSection){this._lastSection=name;this._emit('section',{name,time:this.getTime()});}
    const endAt=this.startCtx+(DURATION-this.startPosition)/rate;
    if(this.loop&&this.cursor>=this.score.length&&horizon>=endAt){
      this.startCtx=endAt;this.startPosition=0;this.cursor=0;this._lastBeat=-1;
      this._emit('loop',{time:0});
    }else if(!this.loop&&elapsed>=DURATION){this.pause();this.position=DURATION;
      this._emit('ended',{});this.onEnded?.();}
  }
  _killVoices(){if(!this.ctx)return;for(const x of [...this.active])try{x.stop(this.ctx.currentTime);}catch{}this.active.clear();}
  async play(){
    if(this.isPlaying)return;
    await this._ensureAudio();if(this.position>=DURATION-.01)this.position=0;
    this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.018);
    this.startPosition=this.position;this.startCtx=this.ctx.currentTime+.06;
    this.cursor=lowerBound(this.score,this.startPosition);
    this._lastBeat=-1;this._lastSection='';this.isPlaying=true;
    this._tick();this.timer=setInterval(()=>this._tick(),25);
  }
  async resume(){return this.play();}
  pause(){if(!this.isPlaying)return;
    this.position=this.getTime();this.isPlaying=false;clearInterval(this.timer);this.timer=null;
    this._killVoices();if(this.ctx)this.master.gain.setTargetAtTime(EPS,this.ctx.currentTime,.018);
  }
  stop(){this.pause();this.position=0;this._lastBeat=-1;}
  seek(seconds){const playing=this.isPlaying;this.pause();this.position=clamp(Number(seconds)||0,0,DURATION);if(playing)this.play();}
  async dispose(){this.stop();this.listeners.clear();this.cache.clear();
    if(this.ctx){try{await this.ctx.close();}catch{}this.ctx=null;}
  }
}
export default ProceduralRapidRain;
export class RapidRainV2 extends ProceduralRapidRain {}
