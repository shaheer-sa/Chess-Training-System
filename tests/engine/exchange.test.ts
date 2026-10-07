import { describe, it, expect } from 'vitest';
import { analyzeExchange } from '../../src/engine/exchange.js';

describe('Exchange Analysis (Phase 1B)', () => {
  describe('S1-S12 Supervisor Fixtures', () => {
    it('S1 — PINNED DEFENDER', () => {
      // FEN: k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1   Candidate: e6g5
      const res = analyzeExchange('k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1', { from: 'e6', to: 'g5' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.see).toBe(-300);
      expect(r.bestLine.map(s => `${s.capturer.square}x${s.to}`)).toEqual(['h6xg5']);
      expect(r.bestLine.map(s => s.balanceAfter)).toEqual([-300]);
      expect(r.captureOptions).toHaveLength(1);
      expect(r.captureOptions[0].capturer.square).toBe('h6');
      expect(r.captureOptions[0].resultForMover).toBe(-300);
    });

    it('S2 — STAND PAT: OPPONENT SHOULD NOT CAPTURE', () => {
      // FEN: 7k/8/8/8/R1r5/8/5N2/K7 w - - 0 1   Candidate: f2e4
      const res = analyzeExchange('7k/8/8/8/R1r5/8/5N2/K7 w - - 0 1', { from: 'f2', to: 'e4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.see).toBe(0);
      expect(r.bestLine).toEqual([]);
      expect(r.captureOptions).toHaveLength(1);
      expect(r.captureOptions[0].capturer.square).toBe('c4');
      expect(r.captureOptions[0].resultForMover).toBe(200);
    });

    it('S3 — EVEN TRADE SHOWN', () => {
      // FEN: 4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1   Candidate: d2d4
      const res = analyzeExchange('4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1', { from: 'd2', to: 'd4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.see).toBe(0);
      expect(r.bestLine.map(s => `${s.capturer.square}x${s.to}`)).toEqual(['c5xd4', 'd1xd4']);
      expect(r.bestLine.map(s => s.balanceAfter)).toEqual([-100, 0]);
      expect(r.captureOptions).toHaveLength(1);
      expect(r.captureOptions[0].capturer.square).toBe('c5');
      expect(r.captureOptions[0].resultForMover).toBe(0);
    });

    it('S4 — RECAPTURE WOULD LOSE ROOK, SO MOVER STOPS', () => {
      // FEN: k7/1b6/4p3/8/5N2/8/8/3R2K1 w - - 0 1   Candidate: f4d5
      const res = analyzeExchange('k7/1b6/4p3/8/5N2/8/8/3R2K1 w - - 0 1', { from: 'f4', to: 'd5' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.see).toBe(-300);
      expect(r.bestLine.map(s => `${s.capturer.square}x${s.to}`)).toEqual(['e6xd5']);
      expect(r.bestLine.map(s => s.balanceAfter)).toEqual([-300]);
      
      const cOpts = r.captureOptions.map(c => `${c.capturer.square} -> ${c.resultForMover}`);
      expect(cOpts).toContain('e6 -> -300');
      expect(cOpts).toContain('b7 -> -300');
    });

    it('S5 — X-RAY BATTERY', () => {
      // FEN: 3r3k/8/5n2/8/8/4N3/3R4/3R2K1 w - - 0 1   Candidate: e3d5
      const res = analyzeExchange('3r3k/8/5n2/8/8/4N3/3R4/3R2K1 w - - 0 1', { from: 'e3', to: 'd5' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.see).toBe(0);
      expect(r.bestLine.map(s => `${s.capturer.square}x${s.to}`)).toEqual(['f6xd5', 'd2xd5', 'd8xd5', 'd1xd5']);
      expect(r.bestLine.map(s => s.balanceAfter)).toEqual([-300, 0, -500, 0]);
      const cOpts = r.captureOptions.map(c => `${c.capturer.square} -> ${c.resultForMover}`);
      expect(cOpts).toContain('f6 -> 0');
      expect(cOpts).toContain('d8 -> 0');
    });

    it('S6 — KING DEFENDER CANNOT LEGALLY RECAPTURE', () => {
      // FEN: 4k3/8/8/2n5/2b5/8/2KP4/8 w - - 0 1   Candidate: d2d3
      const res = analyzeExchange('4k3/8/8/2n5/2b5/8/2KP4/8 w - - 0 1', { from: 'd2', to: 'd3' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.see).toBe(-100);
      expect(r.bestLine.map(s => `${s.capturer.square}x${s.to}`)).toEqual(['c4xd3']);
      expect(r.bestLine[0].givesCheck).toBe(true);
      expect(r.bestLine.map(s => s.balanceAfter)).toEqual([-100]);
      
      const cOpts = r.captureOptions.map(c => `${c.capturer.square} -> ${c.resultForMover}`);
      expect(cOpts).toContain('c4 -> -100');
      expect(cOpts).toContain('c5 -> -100');
    });

    it('S7 — EN PASSANT SHIFTS EXCHANGE SQUARE', () => {
      // FEN: 6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1   Candidate: e2e4
      const res = analyzeExchange('6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1', { from: 'e2', to: 'e4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.see).toBe(0);
      expect(r.bestLine.map(s => `${s.capturer.square}x${s.to}`)).toEqual(['d4xe3', 'c1xe3']);
      expect(r.bestLine[0].captured.square).toBe('e4');
      expect(r.bestLine[0].to).toBe('e3');
      expect(r.bestLine.map(s => s.balanceAfter)).toEqual([-100, 0]);
      
      const cOpts = r.captureOptions.map(c => `${c.capturer.square} -> ${c.resultForMover}`);
      expect(cOpts).toContain('d4 -> 0');
    });

    it('S8 — OPPONENT CAPTURE PROMOTES', () => {
      // FEN: 7k/8/8/1R6/8/8/2pN3K/8 w - - 0 1   Candidate: b5b1
      const res = analyzeExchange('7k/8/8/1R6/8/8/2pN3K/8 w - - 0 1', { from: 'b5', to: 'b1' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.see).toBe(-400);
      expect(r.bestLine.map(s => `${s.capturer.square}x${s.to}`)).toEqual(['c2xb1', 'd2xb1']);
      expect(r.bestLine[0].promotion).toBe('queen');
      expect(r.bestLine.map(s => s.balanceAfter)).toEqual([-1300, -400]);
      
      const cOpts = r.captureOptions.map(c => `${c.capturer.square} -> ${c.resultForMover}`);
      expect(cOpts).toContain('c2 -> -400');
    });

    it('S9 — CANDIDATE MOVE ITSELF IS A CAPTURE BLACK MOVER', () => {
      // FEN: 4k3/8/8/4p3/5P2/6P1/8/4K3 b - - 0 1   Candidate: e5f4
      const res = analyzeExchange('4k3/8/8/4p3/5P2/6P1/8/4K3 b - - 0 1', { from: 'e5', to: 'f4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.materialFromMove).toBe(100);
      expect(r.see).toBe(0);
      expect(r.bestLine.map(s => `${s.capturer.square}x${s.to}`)).toEqual(['g3xf4']);
      expect(r.bestLine.map(s => s.balanceAfter)).toEqual([0]);
      const cOpts = r.captureOptions.map(c => `${c.capturer.square} -> ${c.resultForMover}`);
      expect(cOpts).toContain('g3 -> 0');
    });

    it('S10 — DISCOVERED CHECK PREVENTS CAPTURE', () => {
      // FEN: 4k3/1p6/8/4N3/8/8/8/4R1K1 w - - 0 1   Candidate: e5c6
      const res = analyzeExchange('4k3/1p6/8/4N3/8/8/8/4R1K1 w - - 0 1', { from: 'e5', to: 'c6' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.see).toBe(0);
      expect(r.bestLine).toEqual([]);
      expect(r.captureOptions).toEqual([]);
    });

    it('S11 — QUEEN DEFENDED BY PAWN IS STILL LOST', () => {
      // FEN: 7k/8/2p5/8/4P3/8/8/3Q2K1 w - - 0 1   Candidate: d1d5
      const res = analyzeExchange('7k/8/2p5/8/4P3/8/8/3Q2K1 w - - 0 1', { from: 'd1', to: 'd5' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.see).toBe(-800);
      expect(r.bestLine.map(s => `${s.capturer.square}x${s.to}`)).toEqual(['c6xd5', 'e4xd5']);
      expect(r.bestLine.map(s => s.balanceAfter)).toEqual([-900, -800]);
      
      const cOpts = r.captureOptions.map(c => `${c.capturer.square} -> ${c.resultForMover}`);
      expect(cOpts).toContain('c6 -> -800');
    });

    it('S12 — CANDIDATE PROMOTES', () => {
      // FEN: 4k3/1P6/8/8/8/8/8/R3K3 w Q - 0 1   Candidate: b7b8 promotion queen
      const res = analyzeExchange('4k3/1P6/8/8/8/8/8/R3K3 w Q - 0 1', { from: 'b7', to: 'b8', promotion: 'queen' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.materialFromMove).toBe(800);
      expect(r.see).toBe(800);
      expect(r.bestLine).toEqual([]);
      expect(r.captureOptions).toEqual([]);
    });
  });

  describe('Additional Mandatory Tests', () => {
    it('Black mover - meaningful recapture (capture then opponent recaptures)', () => {
      // Black candidate move captures a white pawn on d4 (with knight from c6).
      // White responds by capturing on d4 with a pawn on e3. Black recaptures with Queen from d8.
      // FEN: 3q1rk1/5ppp/2n5/8/3P4/4P3/5PPP/R3K2R b KQ - 0 1. Move: c6xd4.
      const res = analyzeExchange('3q1rk1/5ppp/2n5/8/3P4/4P3/5PPP/R3K2R b KQ - 0 1', { from: 'c6', to: 'd4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.mover.color).toBe('black');
      expect(r.materialFromMove).toBe(100);
      expect(r.see).toBe(-100);
    });

    it('Black mover - stand pat on recapture', () => {
      // Black candidate move captures on d4 (with pawn from e5).
      // White responds by recapturing on d4 with knight from c2.
      // Black then has the option to recapture with a rook from d8, but doing so would lose the rook.
      // So Black stands pat.
      // FEN: 3r2k1/8/8/4p3/3P4/8/2N5/3K4 b - - 0 1. Move: e5xd4.
      const res = analyzeExchange('3r2k1/8/8/4p3/3P4/8/2N5/3K4 b - - 0 1', { from: 'e5', to: 'd4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.mover.color).toBe('black');
      expect(r.materialFromMove).toBe(100);
      expect(r.see).toBe(100); // Black wins 100, White's net gain from c2xd4 is negative so White stands pat.
      expect(r.bestLine).toEqual([]);
    });

    it('Mover\'s own recapture promotes', () => {
      // Black candidate move: Queen to e1 (Qe1).
      // Target square: e1.
      // White's opponent capture: Knight on f3 captures e1 (Nxe1).
      // Black's recapture: Pawn on f2 captures e1 and promotes to Queen (f2xe1=Q).
      // FEN: 4k3/8/8/4q3/8/5N2/5p2/7K b - - 0 1. Candidate: e5e1.
      const res = analyzeExchange('4k3/8/8/4q3/8/5N2/5p2/7K b - - 0 1', { from: 'e5', to: 'e1' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      // White calculates: If I play Nxe1, I win 900 (Queen). 
      // Black responds with f2xe1=Q, winning 300 (Knight) + 800 (Promotion) = 1100.
      // White's net = 900 - 1100 = -200. White stands pat.
      // Therefore, see = 0, bestLine = [].
      expect(r.see).toBe(0);
      expect(r.bestLine).toEqual([]);
      
      // But we can verify the promotion happened in captureOptions!
      // resultForMover = materialFromMove (0) - opponentNetGain (-200) = +200.
      expect(r.captureOptions).toHaveLength(1);
      expect(r.captureOptions[0].capturer.square).toBe('f3');
      expect(r.captureOptions[0].resultForMover).toBe(200);
    });

    describe('Error Passthrough', () => {
      it('Returns INVALID_FEN error for malformed FEN', () => {
        const res = analyzeExchange('invalid fen', { from: 'e2', to: 'e4' });
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.error.code).toBe('INVALID_FEN');
        }
      });

      it('Returns ILLEGAL_MOVE error for illegal candidate move', () => {
        const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
        const res = analyzeExchange(fen, { from: 'e2', to: 'e5' });
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.error.code).toBe('ILLEGAL_MOVE');
        }
      });

      it('Returns UNSUPPORTED_MOVE_TYPE error for castling candidate', () => {
        const fen = '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1';
        const res = analyzeExchange(fen, { from: 'e1', to: 'g1' });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.error.code).toBe('UNSUPPORTED_MOVE_TYPE');
      });
    });
  });
});
