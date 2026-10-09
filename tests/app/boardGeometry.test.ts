import { describe, it, expect } from 'vitest';
import { squareOffset } from '../../src/app/components/boardGeometry.js';

describe('boardGeometry', () => {
  describe('squareOffset', () => {
    it.each([
      ['e2 to e4, normal', 12, 28, false, { dx: 0, dy: -2 }],
      ['e2 to e4, flipped', 12, 28, true, { dx: 0, dy: 2 }],
      ['a1 to h8, normal', 0, 63, false, { dx: 7, dy: -7 }],
      ['a1 to h8, flipped', 0, 63, true, { dx: -7, dy: 7 }],
      ['h1 to a8, normal', 7, 56, false, { dx: -7, dy: -7 }],
      ['h1 to a8, flipped', 7, 56, true, { dx: 7, dy: 7 }],
      ['g1 to f3, normal', 6, 21, false, { dx: -1, dy: -2 }],
      ['g1 to f3, flipped', 6, 21, true, { dx: 1, dy: 2 }],
    ])('%s', (_name, from, to, flipped, expected) => {
      expect(squareOffset(from, to, flipped)).toEqual(expected);
    });
  });
});
