/**
 * SNOW 64 V20: softer airborne wind / original procedural soundscape, using the browser's Web Audio API.
 * No downloaded audio, copyrighted music, libraries, or per-frame node creation.
 * A single AudioContext plays continuous snow/speed/carve/wind noise, event cues,
 * and the original Frost Shroom arpeggio. Sound starts on a user gesture.
 *
 * SNOW 64: SOFT BUBBLE FOOTSTEPS
 * Only walking/chasing footsteps are redesigned: a tiny, gentle sine-wave
 * bubble or squeak (no metallic thump, noise crackle or resonant filtering).
 * Token pickup, original game SFX and master volume remain unchanged.
 */
export const SNOW64_EFFECT_LEVELS = {
  footsteps: 1.0,    // Soft bubble loudness; try 0.65 for extra quiet, 1.4 for louder
  tokenPickup: 1.9,  // Keep the token pickup volume unchanged
};
// Change to 'squeak' for a slightly higher, whisper-soft "peep".
export const SNOW64_FOOTSTEP_STYLE = 'bubble'; // 'bubble' | 'squeak'


let engine = null;
let enabled = true;
let volume = 0.72;
const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
const FLOAT_ZERO = 0.0001;

function audioEngine() {
  if (!enabled || typeof window === 'undefined') return null;
  if (engine) return engine;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  try {
    const ctx = new Context();
    const master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    // Loopable short noise buffer: no audio files or network fetches.
    const frames = Math.ceil(ctx.sampleRate * 1.25);
    const buffer = ctx.createBuffer(1,frames,ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0, seed = 190765;
    for (let i=0;i<frames;i++) {
      seed = (Math.imul(seed,1664525)+1013904223)>>>0;
      const white = (seed/2147483648)-1;
      previous = (previous + white*.18) / 1.18;
      data[i] = white*.65 + previous*.35;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer; source.loop=true;
    const chains = {};
    // Reuse the same noise oscillator across three filtered sound layers.
    for(const [name,type,freq,q] of [
      ['snow','lowpass',1250,.56],
      ['edge','bandpass',2300,.77],
      ['wind','highpass',770,.61],
    ]) {
      const filter=ctx.createBiquadFilter(); filter.type=type;filter.frequency.value=freq;filter.Q.value=q;
      const gain=ctx.createGain();gain.gain.value=FLOAT_ZERO;
      source.connect(filter);filter.connect(gain);gain.connect(master);
      chains[name]={filter,gain};
    }
    source.start();

    // Separate, low-frequency *colored* airflow. White/high-passed noise sounds
    // like a shower on phone speakers, especially during long Super Air jumps.
    // Filtering the signal BEFORE playback removes the brittle water-like hiss.
    // This source is created once, not per animation frame.
    const airBuffer = ctx.createBuffer(1,frames,ctx.sampleRate);
    const airData = airBuffer.getChannelData(0);
    let low=0,mid=0,body=0,airSeed=863971;
    for(let i=0;i<frames;i++) {
      airSeed=(Math.imul(airSeed,1664525)+1013904223)>>>0;
      const white=(airSeed/2147483648)-1;
      body=body*.62+white*.38;
      mid=mid*.92+white*.08;
      low=low*.987+white*.013;
      airData[i]=clamp((body*.13+mid*.62+low*.25)*1.5,-1,1);
    }
    const airSource=ctx.createBufferSource();
    airSource.buffer=airBuffer;
    airSource.loop=true;
    const airFilter=ctx.createBiquadFilter();
    airFilter.type='lowpass';
    airFilter.frequency.value=470;
    airFilter.Q.value=.5;
    const airGain=ctx.createGain();
    airGain.gain.value=FLOAT_ZERO;
    airSource.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(master);
    airSource.start();
    chains.air={filter:airFilter,gain:airGain};
    engine={ctx,master,buffer,source,airSource,chains,lastBedAt:-1,cueAt:{},musicStop:null};
    return engine;
  } catch { return null; }
}

export function setSnow64AudioEnabled(next) {
  enabled = Boolean(next);
  if (engine) {
    const t=engine.ctx.currentTime;
    engine.master.gain.setTargetAtTime(enabled ? volume : FLOAT_ZERO,t,.035);
    if(!enabled && engine.musicStop)engine.musicStop();
  }
}
export function setSnow64AudioVolume(next) {
  volume=clamp(Number(next)||0,0,1);
  if(engine)engine.master.gain.setTargetAtTime(enabled?volume:FLOAT_ZERO,engine.ctx.currentTime,.04);
}
export function unlockSnow64Audio() {
  const e=audioEngine();
  if(e?.ctx.state==='suspended')e.ctx.resume().catch(()=>{});
}
/** Tear down the sound loop when leaving the game; avoid orphan audio on navigation. */
export function shutdownSnow64Audio() {
  if(!engine)return;
  const e=engine;
  engine=null;
  if(e.musicStop)e.musicStop();
  try{e.source.stop();e.source.disconnect();}catch{}
  try{e.airSource.stop();e.airSource.disconnect();}catch{}
  try{e.ctx.close();}catch{}
}

/** Update a few filter/gain parameters ~20 times/sec. No new nodes are created. */
export function updateSnow64AudioFrame({playing=false,speed=0,steer=0,tuck=false,
  inAir=false,recovery=false,powered=false,airHeight=0}={}) {
  const e=engine;
  if(!e)return;
  const t=e.ctx.currentTime;
  if(t-e.lastBedAt<.045)return;
  e.lastBedAt=t;
  const moving=playing&&!recovery;
  const airborne=moving&&(inAir||powered);
  const grounded=moving&&!inAir&&!powered;
  const v=clamp(speed/58);
  const carving=clamp(Math.abs(steer));
  const snow=grounded ? (.012+.22*Math.pow(v,.9))*(.88+carving*.12) : FLOAT_ZERO;
  const edge=grounded ? (.012+.17*v)*Math.pow(carving,1.45) : FLOAT_ZERO;
  // Brighter speed hiss belongs ON THE SNOW, not in the air. On airborne
  // frames it fades completely, rather than adding a permanent spray layer.
  const wind=grounded ? (.008+.085*v*v+(tuck?.036*v:0)) : FLOAT_ZERO;
  // Soft, dark airflow responds to speed and altitude but never produces a
  // shower-like high-frequency band. Frost Hover uses this same smooth layer.
  const air=airborne ? (.055+.092*v+clamp(airHeight/15)*.018+(powered?.018:0)) : FLOAT_ZERO;
  const smooth=(chain,target,rate=.075)=>chain.gain.gain.setTargetAtTime(Math.max(FLOAT_ZERO,target),t,rate);
  // Rapidly silence contact noise at takeoff; gently swell the air current.
  smooth(e.chains.snow,snow,grounded?.065:.018);
  smooth(e.chains.edge,edge,grounded?.055:.018);
  smooth(e.chains.wind,wind,grounded?.09:.028);
  smooth(e.chains.air,air,airborne?.15:.055);
  e.chains.snow.filter.frequency.setTargetAtTime(390+v*2100+(tuck?200:0),t,.09);
  e.chains.edge.filter.frequency.setTargetAtTime(680+v*2100+carving*880,t,.09);
  e.chains.wind.filter.frequency.setTargetAtTime(650+v*1050,t,.13);
  e.chains.air.filter.frequency.setTargetAtTime(230+v*440+clamp(airHeight/20)*90,t,.16);
}

function tone(e,when,hz,length,level=.065,wave='triangle',endHz=hz,attack=.008) {
  const {ctx,master}=e;
  const osc=ctx.createOscillator(),env=ctx.createGain();
  osc.type=wave;
  osc.frequency.setValueAtTime(Math.max(45,hz),when);
  osc.frequency.exponentialRampToValueAtTime(Math.max(45,endHz),when+length);
  env.gain.setValueAtTime(FLOAT_ZERO,when);
  env.gain.exponentialRampToValueAtTime(Math.max(FLOAT_ZERO,level),when+attack);
  env.gain.exponentialRampToValueAtTime(FLOAT_ZERO,when+length);
  osc.connect(env);env.connect(master);
  osc.start(when);osc.stop(when+length+.012);
  osc.onended=()=>{osc.disconnect();env.disconnect();};
}
function burst(e,when,length,level=.095,frequency=850,type='lowpass') {
  const {ctx,master}=e;
  const source=ctx.createBufferSource();source.buffer=e.buffer;
  const filter=ctx.createBiquadFilter();filter.type=type;filter.frequency.value=frequency;
  const env=ctx.createGain();
  env.gain.setValueAtTime(FLOAT_ZERO,when);
  env.gain.exponentialRampToValueAtTime(Math.max(FLOAT_ZERO,level),when+.007);
  env.gain.exponentialRampToValueAtTime(FLOAT_ZERO,when+length);
  source.connect(filter);filter.connect(env);env.connect(master);
  source.start(when,0);source.stop(when+length+.006);
  source.onended=()=>{source.disconnect();filter.disconnect();env.disconnect();};
}

/**
 * Very soft, single-voice fish-on-snow footstep. No synthesized noise,
 * low-frequency thud, hard click or metallic harmonics.
 * A rounded sine glides slightly upward and down, with a gentle envelope.
 * Tiny alternating variations prevent identical repeated "notes".
 * Generated on demand, never downloads or plays a sound file.
 */
function playSoftSnowStep(e, when) {
  const level = clamp(SNOW64_EFFECT_LEVELS.footsteps, 0, 2.5);
  if (level <= 0) return;
  const squeak = SNOW64_FOOTSTEP_STYLE === 'squeak';
  const alternate = (e.softStepIndex = (e.softStepIndex || 0) + 1) % 2;
  const ctx = e.ctx;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const start = squeak ? (alternate ? 495 : 515) : (alternate ? 358 : 385);
  const peak  = squeak ? (alternate ? 605 : 620) : (alternate ? 452 : 478);
  const end   = squeak ? (alternate ? 455 : 480) : (alternate ? 390 : 405);
  const duration = squeak ? 0.118 : 0.145;
  const peakVolume = (squeak ? 0.061 : 0.087) * level;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(start, when);
  osc.frequency.exponentialRampToValueAtTime(peak, when + (squeak ? .041 : .064));
  osc.frequency.exponentialRampToValueAtTime(end, when + duration);
  env.gain.setValueAtTime(FLOAT_ZERO, when);
  env.gain.linearRampToValueAtTime(Math.max(FLOAT_ZERO, peakVolume), when + .026);
  env.gain.exponentialRampToValueAtTime(FLOAT_ZERO, when + duration);
  osc.connect(env);
  env.connect(e.master);
  osc.start(when);
  osc.stop(when + duration + .012);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}

/** Gameplay sound cues are material-specific, not generic UI beeps. */
export function playSnow64Sound(kind) {
  if(!enabled)return;
  const e=audioEngine();if(!e)return;
  if(e.ctx.state==='suspended')e.ctx.resume().catch(()=>{});
  const n=e.ctx.currentTime+.008;
  // Rate-limit repeated taps/automatic tricks to avoid sound overload.
  const limits={trickStart:.12,magicTrick:.24,shatter:.09,boardBounce:.10,pickup:.09};
  if(limits[kind] && n-(e.cueAt[kind]||-50)<limits[kind])return;
  e.cueAt[kind]=n;
  switch(kind) {
    case 'start':
      [330,440,660].forEach((hz,i)=>tone(e,n+i*.11,hz,.19,.065,'triangle',hz*1.06));break;
    case 'ollie':
    case 'jump':
      burst(e,n,.095,.038,480,'lowpass');
      tone(e,n,175,.23,.075,'sine',430);break;
    case 'ramp':
      burst(e,n,.14,.053,560,'lowpass');
      tone(e,n,160,.31,.086,'triangle',525);break;
    case 'superRamp':
      burst(e,n,.19,.075,680,'lowpass');
      tone(e,n,150,.38,.087,'triangle',790);
      tone(e,n+.12,360,.32,.042,'sine',1050);break;
    case 'trickStart':
      tone(e,n,450,.13,.038,'sine',720);break;
    case 'trick':
    case 'combo':
      [520,770,1040].forEach((hz,i)=>tone(e,n+i*.075,hz,.17,.064,'triangle',hz*1.08));break;
    case 'magicTrick':
      [700,920,1240].forEach((hz,i)=>tone(e,n+i*.050,hz,.24,.040,'sine',hz*1.06));break;
    case 'pickup': {
      const boost=clamp(SNOW64_EFFECT_LEVELS.tokenPickup,0,3);
      tone(e,n,910,.12,.075*boost,'sine',1110);
      tone(e,n+.075,1320,.21,.064*boost,'sine',1710);
      break;
    }
    case 'land':
      burst(e,n,.20,.13,500,'lowpass');
      tone(e,n,122,.10,.06,'sine',81);break;
    case 'rockHit':
      burst(e,n,.41,.27,340,'lowpass');
      tone(e,n,120,.27,.15,'triangle',57);
      burst(e,n+.055,.13,.092,1600,'highpass');break;
    case 'rampHit':
      burst(e,n,.29,.16,720,'bandpass');
      tone(e,n,210,.22,.12,'square',88);break;
    case 'crash':
      burst(e,n,.34,.20,510,'lowpass');
      tone(e,n,160,.28,.12,'triangle',72);break;
    case 'boardBounce':
      burst(e,n,.11,.075,620,'bandpass');
      tone(e,n,260,.095,.035,'triangle',150);break;
    case 'remount':
      burst(e,n,.08,.055,1800,'highpass');
      tone(e,n,345,.13,.042,'triangle',570);break;
    case 'step':
      playSoftSnowStep(e,n);break;
    case 'pause':
      tone(e,n,470,.11,.035,'sine',360);break;
    case 'resume':
      tone(e,n,390,.11,.037,'sine',590);break;
    case 'powerEnd':
      [720,560,430].forEach((hz,i)=>tone(e,n+i*.07,hz,.19,.037,'sine',hz*.92));break;
    case 'danger':
      tone(e,n,600,.12,.047,'square',570);
      tone(e,n+.15,600,.12,.045,'square',570);break;
    case 'power':
      burst(e,n,.36,.13,1800,'highpass');
      [600,800,1050,1360].forEach((hz,i)=>tone(e,n+i*.092,hz,.33,.085,'sine',hz*1.03));break;
    case 'shatter':
      burst(e,n,.38,.16,2000,'highpass');
      burst(e,n,.15,.17,540,'lowpass');
      [450,740,1130].forEach((hz,i)=>tone(e,n+i*.065,hz,.19,.048,'sine',hz*1.2));break;
    case 'finish':
      [392,295,220,147].forEach((hz,i)=>tone(e,n+i*.145,hz,.33,.068,'triangle',hz*.84));break;
    default:break;
  }
}

/** Original repeating Frost Shroom melody. Uses the same context + master bus. */
export function playSnow64FrostMusic() {
  if(!enabled || typeof window==='undefined')return()=>{};
  const e=audioEngine();if(!e)return()=>{};
  if(e.musicStop)e.musicStop();
  if(e.ctx.state==='suspended')e.ctx.resume().catch(()=>{});
  const bus=e.ctx.createGain();
  const when=e.ctx.currentTime;
  bus.gain.setValueAtTime(FLOAT_ZERO,when);
  bus.gain.exponentialRampToValueAtTime(.62,when+.20);
  bus.connect(e.master);
  const notes=[0,7,12,16,14,9,7,12,5,9,12,17,16,12,9,7,
    0,5,9,12,19,17,14,9,7,12,16,19,17,12,7,4];
  let step=0,next=when+.055,stopped=false;
  const bell=(t,freq,length,gain,wave='sine')=>{
    const osc=e.ctx.createOscillator(),env=e.ctx.createGain();
    osc.type=wave;osc.frequency.value=freq;
    env.gain.setValueAtTime(FLOAT_ZERO,t);
    env.gain.exponentialRampToValueAtTime(gain,t+.017);
    env.gain.exponentialRampToValueAtTime(FLOAT_ZERO,t+length);
    osc.connect(env);env.connect(bus);osc.start(t);osc.stop(t+length+.015);
    osc.onended=()=>{osc.disconnect();env.disconnect();};
  };
  const schedule=()=>{
    if(stopped)return;
    while(next<e.ctx.currentTime+.26){
      const note=notes[step%notes.length];
      bell(next,392*Math.pow(2,note/12),.29,.032);
      if(step%4===0)bell(next,196*Math.pow(2,notes[(step+2)%notes.length]/24),.68,.016,'triangle');
      step++;next+=.19;
    }
  };
  schedule();
  const interval=window.setInterval(schedule,95);
  const stop=()=>{
    if(stopped)return;
    stopped=true;window.clearInterval(interval);
    const t=e.ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setTargetAtTime(FLOAT_ZERO,t,.044);
    window.setTimeout(()=>{try{bus.disconnect();}catch{}},400);
    if(e.musicStop===stop)e.musicStop=null;
  };
  e.musicStop=stop;
  return stop;
}
