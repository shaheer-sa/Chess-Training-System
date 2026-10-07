import { describe, it, expect } from 'vitest';
import {
  Chess as Chessops,
  fen as fenOps,
  parseSquare,
  rookAttacks,
  ray,
  between,
} from 'chessops';

describe('Spike D: Exchange Analysis Primitives (chessops)', () => {
  it('exposes rays, between sets, and sliding attacks with custom occupancy for X-rays', () => {
    const e8 = parseSquare('e8');
    const e2 = parseSquare('e2');
    const e1 = parseSquare('e1');

    // ray and between
    const fileRay = ray(e8, e1);
    expect(fileRay.has(e2)).toBe(true);

    const squaresBetween = between(e8, e1);
    expect(squaresBetween.has(e2)).toBe(true);
    expect(squaresBetween.has(e8)).toBe(false);
    expect(squaresBetween.has(e1)).toBe(false);

    // X-ray calculation: rook on e8 attacking past e2 by removing e2 from occupied set
    const setup = fenOps
      .parseFen('4r1k1/8/8/8/1b6/8/3nR3/4K3 w - - 0 1')
      .unwrap();
    const pos = Chessops.fromSetup(setup).unwrap();

    // Standard attacks through board.occupied stop at e2
    const normalRookAttacks = rookAttacks(e8, pos.board.occupied);
    expect(normalRookAttacks.has(e2)).toBe(true);
    expect(normalRookAttacks.has(e1)).toBe(false); // blocked by e2

    // X-ray attacks: simply omit e2 from occupied bitboard WITHOUT mutating pos or board!
    const xrayOccupied = pos.board.occupied.without(e2);
    const xrayRookAttacks = rookAttacks(e8, xrayOccupied);
    expect(xrayRookAttacks.has(e1)).toBe(true); // Hits e1 through e2!
  });

  it('exposes first-class pin (blockers) and checker bitboards via ctx()', () => {
    const setup = fenOps
      .parseFen('4r1k1/8/8/8/1b6/8/3nR3/4K3 w - - 0 1')
      .unwrap();
    const pos = Chessops.fromSetup(setup).unwrap();
    const ctx = pos.ctx();

    const e2 = parseSquare('e2');
    expect(ctx.blockers.has(e2)).toBe(true); // Rook on e2 is pinned to king
    expect(ctx.checkers.isEmpty()).toBe(true); // White king is not in check
  });

  it('exposes en passant square and promotion roles on moves', () => {
    const setup = fenOps
      .parseFen('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3')
      .unwrap();
    const pos = Chessops.fromSetup(setup).unwrap();

    const f6 = parseSquare('f6');
    expect(pos.epSquare).toBe(f6);

    const e5 = parseSquare('e5');
    const dests = pos.dests(e5);
    expect(dests.has(f6)).toBe(true);
  });
});
