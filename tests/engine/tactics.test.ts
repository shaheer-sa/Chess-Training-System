import { describe, it, expect } from 'vitest';
import { analyzeTactics } from '../../src/engine/tactics.js';

describe('Tactical Report (Phase 1C)', () => {
  describe('Supervisor Fixtures', () => {
    it('T1: defender moved away', () => {
      const fen = '6k1/8/1b6/8/3N4/8/8/3R2K1 w - - 0 1';
      const move = { from: 'd1' as const, to: 'a1' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.hangingAfterMove).toContainEqual({
        piece: { square: 'd4', role: 'knight', color: 'white' },
        opponentGain: 300,
        cause: 'defender_moved'
      });
      expect(result.value.allowsMateInOne).toEqual([]);
      expect(result.value.givesCheck).toBe(false);
    });

    it('T1b: same, Black mover (mirror)', () => {
      const fen = '3r2k1/8/8/3n4/8/1B6/8/6K1 b - - 0 1';
      const move = { from: 'd8' as const, to: 'a8' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.hangingAfterMove).toContainEqual({
        piece: { square: 'd5', role: 'knight', color: 'black' },
        opponentGain: 300,
        cause: 'defender_moved'
      });
    });

    it('T2: moving a blocker opens a line', () => {
      const fen = '4r1k1/8/8/8/4B3/8/4N3/6K1 w - - 0 1';
      const move = { from: 'e4' as const, to: 'c2' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.hangingAfterMove).toContainEqual({
        piece: { square: 'e2', role: 'knight', color: 'white' },
        opponentGain: 300,
        cause: 'line_opened'
      });
    });

    it('T3: leaving the back rank allows mate', () => {
      const fen = '1r4k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
      const move = { from: 'a1' as const, to: 'a7' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.allowsMateInOne).toContainEqual({ from: 'b8', to: 'b1' });
      expect(result.value.hangingAfterMove).toEqual([]);
    });

    it('T3b: same, Black mover (mirror)', () => {
      const fen = 'r5k1/5ppp/8/8/8/8/5PPP/1R4K1 b - - 0 1';
      const move = { from: 'a8' as const, to: 'a2' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.allowsMateInOne).toContainEqual({ from: 'b1', to: 'b8' });
    });

    it('T4: candidate delivers mate', () => {
      const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
      const move = { from: 'a1' as const, to: 'a8' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.givesCheck).toBe(true);
      expect(result.value.deliversMate).toBe(true);
      expect(result.value.allowsMateInOne).toEqual([]);
      expect(result.value.hangingAfterMove).toEqual([]);
    });

    it('T5: candidate stalemates', () => {
      const fen = '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1';
      const move = { from: 'g1' as const, to: 'g6' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.causesStalemate).toBe(true);
      expect(result.value.deliversMate).toBe(false);
      expect(result.value.givesCheck).toBe(false);
      expect(result.value.allowsMateInOne).toEqual([]);
      expect(result.value.hangingAfterMove).toEqual([]);
    });

    it('T6: moved piece lands in an absolute pin', () => {
      const fen = '4r1k1/8/8/8/8/8/5N2/4K3 w - - 0 1';
      const move = { from: 'f2' as const, to: 'e4' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.moverPinned).toEqual({
        kind: 'absolute',
        pinned: { square: 'e4', role: 'knight', color: 'white' },
        pinner: { square: 'e8', role: 'rook', color: 'black' },
        target: { square: 'e1', role: 'king', color: 'white' }
      });
    });

    it('T7: exchange line ends in mate', () => {
      const fen = '1r4k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
      const move = { from: 'a1' as const, to: 'b1' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.exchangeLineMate).toEqual({ stepIndex: 0, matedColor: 'white' });
      expect(result.value.allowsMateInOne).toContainEqual({ from: 'b8', to: 'b1' });
    });

    it('T8: quiet baseline', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const move = { from: 'e2' as const, to: 'e4' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.givesCheck).toBe(false);
      expect(result.value.deliversMate).toBe(false);
      expect(result.value.causesStalemate).toBe(false);
      expect(result.value.allowsMateInOne).toEqual([]);
      expect(result.value.hangingAfterMove).toEqual([]);
      expect(result.value.moverPinned).toBeNull();
      expect(result.value.exchangeLineMate).toBeNull();
    });
  });

  describe('Additional Tests', () => {
    it('One hangingAfterMove case with cause "other" (already hanging before)', () => {
      // White knight on c3 is attacked by Black bishop on b4.
      // White plays a2-a3. Knight is still hanging.
      const fen = '4k3/8/8/8/1b6/2N5/P7/4K3 w - - 0 1';
      const move = { from: 'a2' as const, to: 'a3' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.hangingAfterMove).toContainEqual({
        piece: { square: 'c3', role: 'knight', color: 'white' },
        opponentGain: 300,
        cause: 'other'
      });
    });

    it('A case where the post-move position is check and hanging pieces are still computed with legal moves only', () => {
      // White knight on e4, White king g1. Black rook on e8, Black bishop on c5.
      // White plays g1-h1. Black bishop checks on c5. White knight is on e4.
      // Wait, let's use a simpler check:
      // White plays Ne4-d6+. Post-move, Black king is in check.
      // White has a bishop on b2. Is it hanging? Black CANNOT capture it because Black must resolve the check!
      const fen = '4k3/8/8/8/4N3/8/1B6/4K3 w - - 0 1';
      const move = { from: 'e4' as const, to: 'd6' as const };
      const result = analyzeTactics(fen, move);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Because Black is in check, Black's legal moves only resolve the check.
      // Black cannot capture the bishop on b2.
      // So hangingAfterMove must NOT include b2 bishop.
      expect(result.value.hangingAfterMove.some(h => h.piece.square === 'b2')).toBe(false);
    });

    it('Error passthrough: invalid FEN, illegal move, castling candidate', () => {
      expect(analyzeTactics('invalid', { from: 'e2', to: 'e4' }).ok).toBe(false);
      
      const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
      expect(analyzeTactics(fen, { from: 'e2', to: 'e4' }).ok).toBe(false); // illegal move

      const fenCastle = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
      expect(analyzeTactics(fenCastle, { from: 'e1', to: 'g1' }).ok).toBe(false); // castling
    });
  });
});
