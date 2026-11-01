/**
 * Headless SNOW 64 × Rapid Rain V2 adapter.
 * Independent of existing snow64Audio sound effects and Frost Shroom physics.
 * Zero fetched audio files. No UI components, no canvas, no animation loops.
 * Only start on a real user click/tap to satisfy browser autoplay rules.
 */
import { RapidRainV2 } from './RapidRainV2';

let music = null;
let lastFailure = false;
const DEFAULT_MUSIC_VOLUME = 0.43;

function instance() {
  if (typeof window === 'undefined') return null;
  if (!music) {
    music = new RapidRainV2({ volume: DEFAULT_MUSIC_VOLUME });
    // Endless game: loop the procedural arrangement, don't end at 4:04.
    music.loop = true;
  }
  return music;
}

export function startSnow64Music() {
  const m = instance();
  if (!m) return Promise.resolve();
  m.stop();
  m.transitionTo('auto');
  m.setTempo(136);
  m.setIntensity(0.53);
  return m.play().catch((error) => {
    if (!lastFailure) console.warn('SNOW 64 procedural soundtrack unavailable:', error);
    lastFailure = true;
  });
}

export function pauseSnow64Music() { music?.pause(); }
export function resumeSnow64Music() {
  return music?.resume().catch((error) => {
    if (!lastFailure) console.warn('SNOW 64 music resume failed:', error);
    lastFailure = true;
  });
}
export function stopSnow64Music() { music?.stop(); }
export function updateSnow64MusicFrame(gameFrame) { music?.updateFromGame(gameFrame); }
export function playSnow64MusicEvent(kind) { music?.reactToGameEvent(kind); }
export function setSnow64MusicVolume(value) { music?.setVolume(value); }
export function getSnow64Music() { return music; }
// Subscribe to beat/bar/section/accent for future Three.js material effects.
export function onSnow64MusicBeat(callback) { return instance()?.on('beat', callback) || (() => {}); }
export function getSnow64MusicPhase() { return music?.getBeatPhase() ?? 0; }
export function getSnow64MusicEnergy() { return music?.getEnergy() ?? 0; }

export async function disposeSnow64Music() {
  const closing = music;
  music = null;
  if (closing) await closing.dispose();
}
