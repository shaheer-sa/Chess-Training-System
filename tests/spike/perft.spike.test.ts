import { describe, it, expect } from 'vitest';
import { Chess as Chessops, fen as fenOps, debug as debugOps } from 'chessops';
import { FEN_FIXTURES } from '../fixtures/positions.js';

describe('Spike A: Perft Legal Move Generation (chessops)', () => {
  it('computes correct perft for start position', () => {
    const setup = fenOps.parseFen(FEN_FIXTURES.STARTPOS).unwrap();
    const pos = Chessops.fromSetup(setup).unwrap();
    expect(debugOps.perft(pos, 1)).toBe(20);
    expect(debugOps.perft(pos, 2)).toBe(400);
    expect(debugOps.perft(pos, 3)).toBe(8902);
  });

  it('computes correct perft for Kiwipete position', () => {
    const setup = fenOps.parseFen(FEN_FIXTURES.KIWIPETE).unwrap();
    const pos = Chessops.fromSetup(setup).unwrap();
    expect(debugOps.perft(pos, 1)).toBe(48);
    expect(debugOps.perft(pos, 2)).toBe(2039);
  });
});
