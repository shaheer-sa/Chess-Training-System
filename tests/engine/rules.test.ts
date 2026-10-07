import { describe, it, expect } from 'vitest';
import { getLegalMoves } from '../../src/engine/rules.js';

describe('Rules Adapter (Phase 1A)', () => {
  it('returns INVALID_FEN for malformed FEN', () => {
    const res = getLegalMoves('invalid fen');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('INVALID_FEN');
    }
  });

  it('returns ILLEGAL_POSITION if opponent king is in check', () => {
    // White king is in check, but it is black's turn to move
    const res = getLegalMoves('4k3/8/8/8/8/8/8/4K2r b - - 0 1');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('ILLEGAL_POSITION');
    }
  });

  it('identifies castling in standard format', () => {
    const res = getLegalMoves('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const e1g1 = res.value.find(m => m.from === 'e1' && m.to === 'g1');
      expect(e1g1).toBeDefined();
      expect(e1g1?.isCastling).toBe(true);

      const e1c1 = res.value.find(m => m.from === 'e1' && m.to === 'c1');
      expect(e1c1).toBeDefined();
      expect(e1c1?.isCastling).toBe(true);
    }
  });

  it('generates promotions one per role', () => {
    const res = getLegalMoves('k7/3P4/8/8/8/8/8/4K3 w - - 0 1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const promotions = res.value.filter(m => m.from === 'd7' && m.to === 'd8');
      expect(promotions).toHaveLength(4);
      const roles = promotions.map(m => m.promotion).sort();
      expect(roles).toEqual(['bishop', 'knight', 'queen', 'rook']);
    }
  });

  it('flags en passant captures', () => {
    // White pawn on d5, black just played f7f5.
    const res = getLegalMoves('4k3/8/8/3pPp2/8/8/8/4K3 w - f6 0 1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const epCapture = res.value.find(m => m.from === 'e5' && m.to === 'f6');
      expect(epCapture).toBeDefined();
      expect(epCapture?.isEnPassant).toBe(true);
      expect(epCapture?.isCapture).toBe(true);
    }
  });

  it('sorts deterministically (from, then to, then promotion)', () => {
    const res = getLegalMoves('k7/3P4/8/8/8/8/8/4K3 w - - 0 1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const moves = res.value.filter(m => m.from === 'd7');
      expect(moves[0].to).toBe('d8');
      expect(moves[0].promotion).toBe('bishop'); // b, k, q, r
      expect(moves[1].promotion).toBe('knight');
      expect(moves[2].promotion).toBe('queen');
      expect(moves[3].promotion).toBe('rook');
    }
  });
});
