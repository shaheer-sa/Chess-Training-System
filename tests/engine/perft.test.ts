import { describe, it, expect } from 'vitest';
import { Chess, fen, debug } from 'chessops';
import { FEN_FIXTURES } from '../fixtures/positions.js';

describe('Engine Regression: Legal Move Generation (Perft)', () => {
  it('computes correct perft node counts for start position', () => {
    const setup = fen.parseFen(FEN_FIXTURES.STARTPOS).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();

    expect(debug.perft(pos, 1)).toBe(20);
    expect(debug.perft(pos, 2)).toBe(400);
    expect(debug.perft(pos, 3)).toBe(8902);
  });

  it('computes correct perft node counts for Kiwipete position', () => {
    const setup = fen.parseFen(FEN_FIXTURES.KIWIPETE).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();

    expect(debug.perft(pos, 1)).toBe(48);
    expect(debug.perft(pos, 2)).toBe(2039);
  });
});
