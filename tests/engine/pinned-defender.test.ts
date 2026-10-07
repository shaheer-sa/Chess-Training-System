import { describe, it, expect } from 'vitest';
import { Chess, fen, parseSquare, makeSquare } from 'chessops';
import { FEN_FIXTURES } from '../fixtures/positions.js';

describe('Engine Regression: Pinned Defender (Geometric vs Legal)', () => {
  // FEN: 4r1k1/8/8/8/1b6/8/3nR3/4K3 w - - 0 1
  // Facts:
  // - White rook e2 is pinned to the king by black rook on e8.
  // - Black knight on d2 is defended by black bishop on b4.
  // - White has NO legal capture on d2 (Rxd2 exposes king; Kxd2 moves into bishop's attack).

  it('proves geometric attack calculation includes pinned and king moves', () => {
    const setup = fen.parseFen(FEN_FIXTURES.PINNED_DEFENDER).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();

    const d2 = parseSquare('d2');
    const whiteAttackersSet = pos.kingAttackers(
      d2,
      'white',
      pos.board.occupied
    );
    const whiteAttackers = Array.from(whiteAttackersSet).map((sq) =>
      makeSquare(sq)
    );

    // Geometric attacks include e1 (king) and e2 (rook) regardless of legality
    expect(whiteAttackers.sort()).toEqual(['e1', 'e2'].sort());
  });

  it('identifies pinned pieces via context blockers', () => {
    const setup = fen.parseFen(FEN_FIXTURES.PINNED_DEFENDER).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();

    const e2 = parseSquare('e2');
    const ctx = pos.ctx();

    // Rook e2 is an absolute pin blocker protecting King e1 from Rook e8
    expect(ctx.blockers.has(e2)).toBe(true);
  });

  it('confirms White has ZERO legal captures on d2', () => {
    const setup = fen.parseFen(FEN_FIXTURES.PINNED_DEFENDER).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();

    const d2 = parseSquare('d2');
    const e2 = parseSquare('e2');
    const e1 = parseSquare('e1');
    const ctx = pos.ctx();

    // Pinned rook e2 cannot move to d2 (it can only move along the e-file pin ray)
    expect(pos.dests(e2, ctx).has(d2)).toBe(false);

    // King e1 cannot capture d2 because d2 is attacked by Black bishop b4
    expect(pos.dests(e1, ctx).has(d2)).toBe(false);

    // Across all legal moves for White, no move lands on d2
    const legalMovesToD2: Array<{ from: string; to: string }> = [];
    for (const [from, dests] of pos.allDests(ctx)) {
      if (dests.has(d2)) {
        legalMovesToD2.push({ from: makeSquare(from), to: 'd2' });
      }
    }

    expect(legalMovesToD2).toHaveLength(0);
  });
});
