import { describe, it, expect } from 'vitest';
import { followUp, tacticStart, materialFor, gainWords, FOLLOW_UP_TEXT } from '../../src/app/play/tacticFollowUp.js';
import { moveSound, playSound } from '../../src/app/shared/sound.js';
import { loadSettings, DEFAULT_SETTINGS } from '../../src/app/settings.js';

describe('Tactic follow-up', () => {
  const ctx = { mateIn: null, best: 450, material: 0, baseline: 0 };

  it('finds the Tactic still in progress for the mover', () => {
    const colors: ('white' | 'black')[] = ['white', 'black', 'white', 'black', 'white', 'black', 'white'];
    expect(tacticStart(colors, { 2: 'tactic' }, 4)).toBe(2); // the next own move
    expect(tacticStart(colors, { 2: 'tactic' }, 6)).toBe(2); // the one after (2 turns)
    expect(tacticStart([...colors, 'black', 'white'], { 2: 'tactic' }, 8)).toBeNull(); // window over
    expect(tacticStart(colors, { 3: 'tactic' }, 4)).toBeNull(); // the opponent's Tactic
    expect(tacticStart(colors, {}, 4)).toBeNull();
  });

  it('on track, complete or missed — from the engine score of the move played', () => {
    expect(followUp({ cp: 440 }, ctx, 0)).toBe('on-track');
    expect(followUp({ cp: 450 }, ctx, 300)).toBe('complete');
    expect(followUp({ mate: 3 }, { ...ctx, best: 99700 }, 0)).toBe('on-track');
    expect(followUp({ cp: 100 }, ctx, 0)).toBe('missed');
    expect(followUp({ cp: 330 }, ctx, 0)).toBeNull(); // in between: no note
    expect(followUp(undefined, ctx, 0)).toBeNull();
    expect(followUp(undefined, null, -700, true)).toBe('complete'); // the follow-up mates (Legal trap: 7.Nd5#)
    expect(FOLLOW_UP_TEXT.complete(-700, true)).toBe('Tactic complete: checkmate!');
  });

  it('counts material for the mover whoever is to move, and names the gain', () => {
    expect(materialFor('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'white')).toBe(500);
    expect(materialFor('4k3/8/8/8/8/8/8/R3K3 b - - 0 1', 'white')).toBe(500);
    expect(materialFor('4k3/8/8/8/8/8/8/R3K3 b - - 0 1', 'black')).toBe(-500);
    expect(gainWords(100)).toBe('a pawn');
    expect(gainWords(300)).toBe('a piece');
    expect(gainWords(500)).toBe('a rook');
    expect(gainWords(900)).toBe('a queen');
    expect(FOLLOW_UP_TEXT.complete(300)).toBe('Tactic complete: you won a piece!');
  });
});

describe('sounds', () => {
  it('picks the sound from the move', () => {
    expect(moveSound('e4')).toBe('move');
    expect(moveSound('Nxe5')).toBe('capture');
    expect(moveSound('O-O-O')).toBe('castle');
    expect(moveSound('e8=Q')).toBe('promote');
    expect(moveSound('Qh5+')).toBe('check');
    expect(moveSound('Qxf7#')).toBe('mate');
  });

  it('is a setting (on by default) and silent where audio is unavailable', () => {
    expect(DEFAULT_SETTINGS.sound).toBe(true);
    expect(loadSettings(JSON.stringify({ sound: false })).sound).toBe(false);
    expect(() => playSound('brilliant')).not.toThrow(); // no Web Audio in this test environment
  });
});
