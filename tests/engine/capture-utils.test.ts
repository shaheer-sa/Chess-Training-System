import { describe, it, expect } from 'vitest';
import { getActualCapturedSquare } from '../../src/engine/capture-utils.js';

describe('Capture Utils', () => {
  it('returns null for non-capture', () => {
    expect(getActualCapturedSquare({ from: 'e2', to: 'e4' }, false, false)).toBeNull();
  });

  it('returns destination square for normal capture', () => {
    expect(getActualCapturedSquare({ from: 'e4', to: 'd5' }, true, false)).toBe('d5');
  });

  it('returns correct captured pawn square for en passant (White captures Black)', () => {
    // Before candidate: 6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1
    // Candidate: e2e4. Then from resulting position, Black legal move: d4e3 en passant
    expect(getActualCapturedSquare({ from: 'd4', to: 'e3' }, true, true)).toBe('e4');
  });

  it('returns correct captured pawn square for en passant (Black captures White)', () => {
    expect(getActualCapturedSquare({ from: 'd5', to: 'e6' }, true, true)).toBe('e5');
  });
});
