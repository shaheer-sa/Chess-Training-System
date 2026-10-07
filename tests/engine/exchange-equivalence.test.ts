import { describe, it, expect } from 'vitest';
import { analyzeExchange } from '../../src/engine/exchange.js';
import { referenceAnalyzeExchange } from '../support/reference-exchange.js';
import { getLegalMoves } from '../../src/engine/rules.js';
import { MoveInput } from '../../src/engine/types.js';

interface TestCase {
  id: string;
  fen: string;
  move: MoveInput;
}

const INDIVIDUAL_FIXTURES: TestCase[] = [
  // S1–S12
  { id: 'S1', fen: 'k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1', move: { from: 'e6', to: 'g5' } },
  { id: 'S2', fen: '7k/8/8/8/R1r5/8/5N2/K7 w - - 0 1', move: { from: 'f2', to: 'e4' } },
  { id: 'S3', fen: '4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1', move: { from: 'd2', to: 'd4' } },
  { id: 'S4', fen: 'k7/1b6/4p3/8/5N2/8/8/3R2K1 w - - 0 1', move: { from: 'f4', to: 'd5' } },
  { id: 'S5', fen: '3r3k/8/5n2/8/8/4N3/3R4/3R2K1 w - - 0 1', move: { from: 'e3', to: 'd5' } },
  { id: 'S6', fen: '4k3/8/8/2n5/2b5/8/2KP4/8 w - - 0 1', move: { from: 'd2', to: 'd3' } },
  { id: 'S7', fen: '6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1', move: { from: 'e2', to: 'e4' } },
  { id: 'S8', fen: '7k/8/8/1R6/8/8/2pN3K/8 w - - 0 1', move: { from: 'b5', to: 'b1' } },
  { id: 'S9', fen: '4k3/8/8/4p3/5P2/6P1/8/4K3 b - - 0 1', move: { from: 'e5', to: 'f4' } },
  { id: 'S10', fen: '4k3/1p6/8/4N3/8/8/8/4R1K1 w - - 0 1', move: { from: 'e5', to: 'c6' } },
  { id: 'S11', fen: '7k/8/2p5/8/4P3/8/8/3Q2K1 w - - 0 1', move: { from: 'd1', to: 'd5' } },
  { id: 'S12', fen: '4k3/1P6/8/8/8/8/8/R3K3 w Q - 0 1', move: { from: 'b7', to: 'b8', promotion: 'queen' } },
  // Black A & B
  { id: 'Black A', fen: '3q1rk1/5ppp/2n5/8/3P4/4P3/5PPP/R3K2R b KQ - 0 1', move: { from: 'c6', to: 'd4' } },
  { id: 'Black B', fen: '3r2k1/8/8/4p3/3P4/8/2N5/3K4 b - - 0 1', move: { from: 'e5', to: 'd4' } },
  // Mover promotion
  { id: 'Mover promotion', fen: '4k3/8/8/4q3/8/5N2/5p2/7K b - - 0 1', move: { from: 'e5', to: 'e1' } },
  // Candidate en-passant
  { id: 'Candidate en-passant', fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', move: { from: 'e5', to: 'd6' } },
  // Numeric tie-break
  { id: 'Numeric tie-break', fen: '4k3/8/8/3p4/R7/8/8/3R2K1 b - - 0 1', move: { from: 'd5', to: 'd4' } },
  // King tie-break
  { id: 'King tie-break', fen: '7k/8/8/8/1n6/8/4K3/3R4 b - - 0 1', move: { from: 'b4', to: 'd3' } },
  // Crowded
  { id: 'Crowded fixture', fen: '3r2bk/3q4/1np2n2/8/1N3N2/1B6/3Q4/3R3K w - - 0 1', move: { from: 'f4', to: 'd5' } },
];

const CORPUS_POSITIONS = [
  { name: 'startpos', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  { name: 'kiwipete', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1' },
  { name: 'pos4', fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1' },
  { name: 'pos4m', fen: 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1' },
  { name: 'pos6', fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10' },
  { name: 'crowded', fen: '3r2bk/3q4/1np2n2/8/1N3N2/1B6/3Q4/3R3K w - - 0 1' },
];

describe('Exchange Equivalence Harness (Phase 1B.2)', () => {
  it('passes equivalence on all individual fixtures', () => {
    let checkedCount = 0;
    for (const fix of INDIVIDUAL_FIXTURES) {
      const actual = analyzeExchange(fix.fen, fix.move);
      const expected = referenceAnalyzeExchange(fix.fen, fix.move);
      expect(actual).toEqual(expected);
      checkedCount++;
    }
    console.log(`Equivalence harness checked ${checkedCount} individual fixtures.`);
  }, 30_000);

  it('passes equivalence on every legal move of every corpus position', () => {
    let totalMovesChecked = 0;

    for (const pos of CORPUS_POSITIONS) {
      const lmRes = getLegalMoves(pos.fen);
      expect(lmRes.ok).toBe(true);
      if (!lmRes.ok) continue;

      const moves = lmRes.value;
      for (const m of moves) {
        const moveInput: MoveInput = {
          from: m.from,
          to: m.to,
          promotion: m.promotion,
        };
        const actual = analyzeExchange(pos.fen, moveInput);
        const expected = referenceAnalyzeExchange(pos.fen, moveInput);
        expect(actual).toEqual(expected);
        totalMovesChecked++;
      }
    }

    const totalAll = totalMovesChecked + INDIVIDUAL_FIXTURES.length;
    console.log(
      `Equivalence harness checked ${totalMovesChecked} legal moves across all corpus positions. Total inputs compared: ${totalAll}.`
    );
    expect(totalMovesChecked).toBeGreaterThan(150);
  }, 60_000);
});
