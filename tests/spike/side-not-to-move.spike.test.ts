import { describe, it, expect } from 'vitest';
import {
  Chess as Chessops,
  fen as fenOps,
  parseSquare,
  makeSquare,
  SquareSet,
  opposite,
  between,
  rookAttacks,
  bishopAttacks,
  IllegalSetup,
} from 'chessops';

describe('Spike C: Defenders for Side Not to Move & FEN Flipping (chessops)', () => {
  const flippedWhileInCheckFen = '6rk/8/8/8/8/8/8/6K1 b - - 0 1';
  const flippedEpFen =
    'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR b KQkq f6 0 3';

  it('rejects flipped FEN when opponent king is in check via Result type', () => {
    const setup = fenOps.parseFen(flippedWhileInCheckFen).unwrap();
    const posResult = Chessops.fromSetup(setup);
    expect(posResult.isErr).toBe(true);
    if (posResult.isErr) {
      expect(posResult.error.message).toBe(IllegalSetup.OppositeCheck);
    }
  });

  it('rejects invalid en passant square upon parsing/setup', () => {
    const setup = fenOps.parseFen(flippedEpFen).unwrap();
    const pos = Chessops.fromSetup(setup).unwrap();
    expect(pos.epSquare).toBeUndefined();
  });

  it('can query defenders for the side NOT to move WITHOUT flipping the position', () => {
    const setup = fenOps
      .parseFen('4r1k1/8/8/8/1b6/8/3nR3/4K3 w - - 0 1')
      .unwrap();
    const pos = Chessops.fromSetup(setup).unwrap();
    const d2 = parseSquare('d2');

    // Query black attackers/defenders of d2 directly on the white-to-move position:
    const blackDefenders = pos.kingAttackers(d2, 'black', pos.board.occupied);
    const b4 = parseSquare('b4');
    expect(blackDefenders.has(b4)).toBe(true);
    expect(Array.from(blackDefenders).map((sq) => makeSquare(sq))).toEqual([
      'b4',
    ]);
  });

  it('can evaluate pin status for side NOT to move using bitboard primitives', () => {
    const setup = fenOps
      .parseFen('4r1k1/8/8/8/1b6/8/3nR3/4K3 w - - 0 1')
      .unwrap();
    const pos = Chessops.fromSetup(setup).unwrap();

    const blackColor = 'black';
    const blackKing = pos.board.kingOf(blackColor);
    expect(blackKing).toBeDefined();

    if (blackKing !== undefined) {
      const whiteSnipers = rookAttacks(blackKing, SquareSet.empty())
        .intersect(pos.board.rooksAndQueens())
        .union(
          bishopAttacks(blackKing, SquareSet.empty()).intersect(
            pos.board.bishopsAndQueens()
          )
        )
        .intersect(pos.board[opposite(blackColor)]);

      let blackBlockers = SquareSet.empty();
      for (const sniper of whiteSnipers) {
        const b = between(blackKing, sniper).intersect(pos.board.occupied);
        if (!b.moreThanOne()) {
          blackBlockers = blackBlockers.union(b);
        }
      }
      expect(blackBlockers.isEmpty()).toBe(true);
    }
  });
});
