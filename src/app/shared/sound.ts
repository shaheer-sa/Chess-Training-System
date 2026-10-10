/**
 * Sound effects (phase 6D), synthesised with the Web Audio API: no audio files, nothing to download or license.
 * Off when the "Sounds" setting is off, and silent where Web Audio isn't available.
 */
import { readSettings } from '../settings.js';

export type SoundKind =
  | 'move' | 'capture' | 'check' | 'castle' | 'promote'
  | 'start' | 'mate' | 'end'
  | 'brilliant' | 'great' | 'blunder' | 'tactic';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

const audio = (): AudioContext | null => {
  try {
    if (!ctx) {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

/** A short wooden knock: filtered noise plus a low thump. */
const knock = (c: AudioContext, at: number, bright = 1800, loud = 1) => {
  const len = Math.floor(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = bright;
  band.Q.value = 1.2;
  const g = c.createGain();
  g.gain.value = 0.9 * loud;
  noise.connect(band).connect(g).connect(master!);
  noise.start(at);
  const thump = c.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(190, at);
  thump.frequency.exponentialRampToValueAtTime(70, at + 0.08);
  const tg = c.createGain();
  tg.gain.setValueAtTime(0.8 * loud, at);
  tg.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
  thump.connect(tg).connect(master!);
  thump.start(at);
  thump.stop(at + 0.1);
};

/** A soft bell-like note. */
const note = (c: AudioContext, at: number, freq: number, dur = 0.35, type: OscillatorType = 'sine', loud = 0.5) => {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(loud, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
};

const PLAY: Record<SoundKind, (c: AudioContext, t: number) => void> = {
  move: (c, t) => knock(c, t),
  capture: (c, t) => { knock(c, t, 2600, 1.15); knock(c, t + 0.045, 1500, 0.7); },
  castle: (c, t) => { knock(c, t); knock(c, t + 0.11, 1600, 0.8); },
  check: (c, t) => { knock(c, t); note(c, t + 0.06, 880, 0.18, 'triangle', 0.35); note(c, t + 0.16, 660, 0.25, 'triangle', 0.35); },
  promote: (c, t) => { knock(c, t); [523, 659, 784, 1046].forEach((f, i) => note(c, t + 0.05 + i * 0.06, f, 0.3, 'triangle', 0.3)); },
  start: (c, t) => { note(c, t, 523, 0.6); note(c, t + 0.14, 784, 0.8); },
  mate: (c, t) => { [523, 659, 784].forEach((f, i) => note(c, t + i * 0.12, f, 0.35, 'triangle', 0.4)); note(c, t + 0.36, 1046, 1.1, 'triangle', 0.5); note(c, t + 0.36, 523, 1.1, 'sine', 0.3); },
  end: (c, t) => { note(c, t, 659, 0.5); note(c, t + 0.16, 523, 0.8); },
  brilliant: (c, t) => {
    [1046, 1318, 1568, 2093, 2637].forEach((f, i) => note(c, t + i * 0.05, f, 0.5, 'sine', 0.28));
    note(c, t + 0.3, 3136, 0.6, 'sine', 0.12);
  },
  great: (c, t) => { note(c, t, 784, 0.35, 'sine', 0.35); note(c, t + 0.09, 1046, 0.5, 'sine', 0.35); },
  tactic: (c, t) => { note(c, t, 659, 0.3, 'triangle', 0.3); note(c, t + 0.08, 988, 0.45, 'triangle', 0.3); },
  blunder: (c, t) => {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(330, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.45);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(lp).connect(g).connect(master!);
    o.start(t);
    o.stop(t + 0.55);
  },
};

export const playSound = (kind: SoundKind, delayMs = 0): void => {
  if (!readSettings().sound) return;
  const c = audio();
  if (!c || !master) return;
  try { PLAY[kind](c, c.currentTime + 0.01 + delayMs / 1000); } catch { /* audio unavailable */ }
};

/** The sound of a move from its SAN: checkmate, check, castling, promotion, capture or a plain move. */
export const moveSound = (san: string): SoundKind =>
  san.includes('#') ? 'mate' : san.includes('+') ? 'check' : san.startsWith('O-O') ? 'castle' : san.includes('=') ? 'promote' : san.includes('x') ? 'capture' : 'move';
