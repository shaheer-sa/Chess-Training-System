import { describe, it, expect } from 'vitest';
import {
  Chess as Chessops,
  fen as fenOps,
  parseSquare,
  makeSquare,
} from 'chessops';
import { FEN_FIXTURES } from '../fixtures/positions.js';

describe('Spike B: Pinned-Defender Test (chessops)', () => {
  it('evaluates attackers query as geometric/pseudo-legal', () => {
    const setup = fenOps.parseFen(FEN_FIXTURES.PINNED_DEFENDER).unwrap();
    const pos = Chessops.fromSetup(setup).unwrap();

    const d2 = parseSquare('d2');
    const whiteAttackersSet = pos.kingAttackers(
      d2,
      'white',
      pos.board.occupied
    );
    const whiteAttackers = Array.from(whiteAttackersSet).map((sq) =>
      makeSquare(sq)
    );

    // pos.kingAttackers returns geometric attacks: e1 (king) and e2 (rook)
    expect(whiteAttackers.sort()).toEqual(['e1', 'e2'].sort());
    // CONCLUSION: chessops kingAttackers() is GEOMETRIC / pseudo-legal, NOT legal.
  });

  it('verifies pin detection and ZERO legal captures on d2', () => {
    const setup = fenOps.parseFen(FEN_FIXTURES.PINNED_DEFENDER).unwrap();
    const pos = Chessops.fromSetup(setup).unwrap();

    const e2 = parseSquare('e2');
    const e1 = parseSquare('e1');
    const d2 = parseSquare('d2');

    // Context detects that e2 is an absolute pin blocker
    const ctx = pos.ctx();
    expect(ctx.blockers.has(e2)).toBe(true);

    // Check destinations for pinned rook e2: d2 is NOT a destination
    const rookDests = pos.dests(e2, ctx);
    expect(rookDests.has(d2)).toBe(false);

    // Check destinations for king e1: d2 is NOT a destination (attacked by b4 bishop)
    const kingDests = pos.dests(e1, ctx);
    expect(kingDests.has(d2)).toBe(false);

    // Check all legal destinations for white
    const allLegalMovesToD2: string[] = [];
    for (const [from, dests] of pos.allDests(ctx)) {
      if (dests.has(d2)) {
        allLegalMovesToD2.push(makeSquare(from));
      }
    }

    expect(allLegalMovesToD2).toEqual([]);
    expect(allLegalMovesToD2).toHaveLength(0);
  });
});
