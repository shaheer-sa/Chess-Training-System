import { describe, it, expect } from 'vitest';
import { analyzeDestination } from '../../src/engine/destination.js';

describe('Destination Report (Phase 1A)', () => {
  describe('Required Fixtures', () => {
    it('F1 — Pinned apparent defender', () => {
      // FEN: k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1   move: e6g5
      const res = analyzeDestination('k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1', { from: 'e6', to: 'g5' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.geometricAttackers).toEqual([{ square: 'h6', role: 'pawn', color: 'black' }]);
      expect(r.geometricDefenders).toEqual([{ square: 'g2', role: 'rook', color: 'white' }]);
      expect(r.legalCaptures).toHaveLength(1);
      expect(r.legalCaptures[0].capturer).toEqual({ square: 'h6', role: 'pawn', color: 'black' });
      expect(r.legalCaptures[0].captureSquare).toBe('g5');
      expect(r.legalCaptures[0].legalRecaptures).toEqual([]);
    });

    it('F2 — Capture reveals a recapturer', () => {
      // FEN: 7k/8/8/8/R1r5/8/5N2/K7 w - - 0 1   move: f2e4
      const res = analyzeDestination('7k/8/8/8/R1r5/8/5N2/K7 w - - 0 1', { from: 'f2', to: 'e4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.geometricAttackers).toEqual([{ square: 'c4', role: 'rook', color: 'black' }]);
      expect(r.geometricDefenders).toEqual([]);
      expect(r.legalCaptures).toHaveLength(1);
      expect(r.legalCaptures[0].capturer).toEqual({ square: 'c4', role: 'rook', color: 'black' });
      expect(r.legalCaptures[0].legalRecaptures).toEqual([{ square: 'a4', role: 'rook', color: 'white' }]);
    });

    it('F3 — Discovered check prevents the capture', () => {
      // FEN: 4k3/1p6/8/4N3/8/8/8/4R1K1 w - - 0 1   move: e5c6
      const res = analyzeDestination('4k3/1p6/8/4N3/8/8/8/4R1K1 w - - 0 1', { from: 'e5', to: 'c6' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.givesCheck).toBe(true);
      expect(r.geometricAttackers).toEqual([{ square: 'b7', role: 'pawn', color: 'black' }]);
      expect(r.legalCaptures).toEqual([]); 
    });

    it('F4 — En passant capture of the moved pawn', () => {
      // FEN: 6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1   move: e2e4
      const res = analyzeDestination('6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1', { from: 'e2', to: 'e4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.geometricAttackers).toEqual([]);
      expect(r.legalCaptures).toHaveLength(1);
      expect(r.legalCaptures[0].capturer).toEqual({ square: 'd4', role: 'pawn', color: 'black' });
      expect(r.legalCaptures[0].captureSquare).toBe('e3');
      expect(r.legalCaptures[0].isEnPassant).toBe(true);
      expect(r.legalCaptures[0].legalRecaptures).toEqual([{ square: 'c1', role: 'bishop', color: 'white' }]);
    });

    it('F5 — Moving piece vacates its origin, revealing a defender', () => {
      // FEN: 4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1   move: d2d4
      const res = analyzeDestination('4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1', { from: 'd2', to: 'd4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const r = res.value;
      expect(r.geometricAttackers).toEqual([{ square: 'c5', role: 'pawn', color: 'black' }]);
      expect(r.geometricDefenders).toEqual([{ square: 'd1', role: 'queen', color: 'white' }]);
      expect(r.legalCaptures).toHaveLength(1);
      expect(r.legalCaptures[0].capturer).toEqual({ square: 'c5', role: 'pawn', color: 'black' });
      expect(r.legalCaptures[0].legalRecaptures).toEqual([{ square: 'd1', role: 'queen', color: 'white' }]);
    });
  });

  describe('Additional Tests', () => {
    it('Geometric attackers: pawn (both directions), knight, bishop, rook, queen, king', () => {
      // e4 is attacked by d5(p), f5(p), c3(n), d4(k), e8(r), g2(b), h4(q).
      // FEN: 4r3/8/8/3p1p2/3k3q/2n5/4P1b1/K7 w - - 0 1
      const fen = '4r3/8/8/3p1p2/3k3q/2n5/4P1b1/K7 w - - 0 1';
      const res = analyzeDestination(fen, { from: 'e2', to: 'e4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const attackers = res.value.geometricAttackers.map(a => `${a.role}@${a.square}`);
      expect(attackers.sort()).toEqual([
        'bishop@g2', 'king@d4', 'knight@c3', 'pawn@d5', 'pawn@f5', 'queen@h4', 'rook@e8'
      ].sort());
    });

    it('King as the moved piece -> legalCaptures always empty', () => {
      const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
      const res = analyzeDestination(fen, { from: 'e1', to: 'd1' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.legalCaptures).toEqual([]);
    });

    it('Defenders: own king as defender, but cannot recapture due to another attacker', () => {
      // White king on c2, white pawn on d2. Black knight on c5, black bishop on c4.
      // White plays d2-d3.
      // King on c2 defends d3. Knight on c5 captures d3. King cannot recapture because bishop on c4 protects d3.
      const fen = '4k3/8/8/2n5/2b5/8/2KP4/8 w - - 0 1';
      const res = analyzeDestination(fen, { from: 'd2', to: 'd3' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const r = res.value;
      expect(r.geometricDefenders).toEqual([{ square: 'c2', role: 'king', color: 'white' }]);
      const capture = r.legalCaptures.find(c => c.capturer.square === 'c5');
      expect(capture).toBeDefined();
      expect(capture?.legalRecaptures).toEqual([]);
    });

    it('Returns correct error for Castling candidate', () => {
      const fen = '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1';
      const res = analyzeDestination(fen, { from: 'e1', to: 'g1' });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('UNSUPPORTED_MOVE_TYPE');
    });

    it('Works for Black as the side moving (catch color bugs)', () => {
      // Black plays d7d5. White attacks d5 with pawn on c4. Black defends d5 with Queen on d8.
      const fen = '3qk3/3p4/8/8/2P5/8/8/4K3 b - - 0 1';
      const res = analyzeDestination(fen, { from: 'd7', to: 'd5' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.mover.color).toBe('black');
      expect(res.value.geometricAttackers).toEqual([{ square: 'c4', role: 'pawn', color: 'white' }]);
      expect(res.value.geometricDefenders).toEqual([{ square: 'd8', role: 'queen', color: 'black' }]);
    });

    it('Multiple geometric defenders and blocked slider (Black to move)', () => {
      // Black to move: d5 is defended by Black Knights on c7 and e7.
      // White rook on a5 attacks d5. White bishop on h1 is blocked from d5 by a white pawn on e4.
      // FEN: 8/2n1n3/8/R2p4/4P3/8/8/4K2k b - - 0 1
      const fen = '8/2n1n3/8/R2p4/4P3/8/8/4K2k b - - 0 1';
      const res = analyzeDestination(fen, { from: 'd5', to: 'd4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.mover.color).toBe('black');
      // On d4, does White rook on a5 attack it? No, a5 attacks a4, b4, c4, d4? No, a5 is 5th rank, d4 is 4th rank.
      // Wait, let's look at the destination d4.
      // We want multiple defenders on d4, and blocked slider attacking d4.
      // White bishop on a1 attacks d4. Blocked by white pawn on c3. (a1, b2, c3, d4).
      // Black Knights on b5, f5 defend d4.
      // Black pawn on d5 moves to d4.
      // Black king on h8. White king on e1.
      // FEN: 7k/8/8/1n3n2/8/2P5/3P4/B3K3 b - - 0 1 -> move d5 to d4. (Wait, black pawn is on d5).
      // FEN: 7k/8/8/1n1p1n2/8/2P5/8/B3K3 b - - 0 1. move d5 to d4.
      const fen2 = '7k/8/8/1n1p1n2/8/2P5/8/B3K3 b - - 0 1';
      const res2 = analyzeDestination(fen2, { from: 'd5', to: 'd4' });
      expect(res2.ok).toBe(true);
      if (!res2.ok) return;
      expect(res2.value.geometricDefenders.sort((a,b) => a.square.localeCompare(b.square))).toEqual([
        { square: 'b5', role: 'knight', color: 'black' },
        { square: 'f5', role: 'knight', color: 'black' }
      ]);
      // Bishop on a1 is blocked by c3 pawn. The pawn itself attacks d4, but the bishop does not.
      expect(res2.value.geometricAttackers).toEqual([{ square: 'c3', role: 'pawn', color: 'white' }]);
    });

    it('Black candidate move into capture and recapture (Black to move)', () => {
      // Black plays e5xf4. White pawn on g3 recaptures f4.
      // FEN: 4k3/8/8/4p3/5P2/6P1/8/4K3 b - - 0 1
      const fen = '4k3/8/8/4p3/5P2/6P1/8/4K3 b - - 0 1';
      const res = analyzeDestination(fen, { from: 'e5', to: 'f4' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.mover.color).toBe('black');
      expect(res.value.legalCaptures).toHaveLength(1);
      expect(res.value.legalCaptures[0].capturer.square).toBe('g3');
      expect(res.value.legalCaptures[0].captureSquare).toBe('f4');
    });

    it('Returns INVALID_FEN error for malformed FEN', () => {
      const res = analyzeDestination('invalid fen', { from: 'e2', to: 'e4' });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('INVALID_FEN');
      }
    });

    it('Returns ILLEGAL_MOVE error for illegal candidate move', () => {
      // e2 to e5 is an illegal pawn move
      const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
      const res = analyzeDestination(fen, { from: 'e2', to: 'e5' });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('ILLEGAL_MOVE');
      }
    });

    it('Returns ILLEGAL_MOVE error for move by wrong side', () => {
      // White to move, but trying to move Black pawn on d7
      const fen = '4k3/3p4/8/8/8/8/4P3/4K3 w - - 0 1';
      const res = analyzeDestination(fen, { from: 'd7', to: 'd5' });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('ILLEGAL_MOVE');
      }
    });
  });
});
