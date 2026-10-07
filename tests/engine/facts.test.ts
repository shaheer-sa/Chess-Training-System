import { describe, it, expect } from 'vitest';
import { getPositionFacts } from '../../src/engine/facts.js';

describe('Position Facts (Phase 1C)', () => {
  describe('Supervisor Fixtures', () => {
    it('P1: pin for the side NOT to move', () => {
      const fen = '4r1k1/8/8/8/8/8/4N3/4K3 b - - 0 1';
      const result = getPositionFacts(fen);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.pins).toContainEqual({
        kind: 'absolute',
        pinned: { square: 'e2', role: 'knight', color: 'white' },
        pinner: { square: 'e8', role: 'rook', color: 'black' },
        target: { square: 'e1', role: 'king', color: 'white' }
      });
    });

    it('P2: relative pin to queen', () => {
      const fen = '3r2k1/8/8/8/8/3B4/8/3Q2K1 w - - 0 1';
      const result = getPositionFacts(fen);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.pins).toContainEqual({
        kind: 'to_queen',
        pinned: { square: 'd3', role: 'bishop', color: 'white' },
        pinner: { square: 'd8', role: 'rook', color: 'black' },
        target: { square: 'd1', role: 'queen', color: 'white' }
      });
      // no absolute pins
      expect(result.value.pins.filter(p => p.kind === 'absolute')).toHaveLength(0);
    });
  });

  describe('Additional Tests', () => {
    it('A piece pinned by a queen along a diagonal (absolute)', () => {
      const fen = '7k/8/8/5q2/8/3B4/8/1K6 w - - 0 1';
      const result = getPositionFacts(fen);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.pins).toContainEqual({
        kind: 'absolute',
        pinned: { square: 'd3', role: 'bishop', color: 'white' },
        pinner: { square: 'f5', role: 'queen', color: 'black' },
        target: { square: 'b1', role: 'king', color: 'white' }
      });
    });

    it('Two pins at once (one per color)', () => {
      // White rook on e1 pins Black knight on e5 to Black king on e8.
      // Black rook on d8 pins White bishop on d4 to White queen on d1.
      // We need a White king somewhere safe, e.g. a1.
      const fen = '3rk3/8/8/4n3/3B4/8/8/K2QR3 w - - 0 1';
      const result = getPositionFacts(fen);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.pins).toEqual(expect.arrayContaining([
        {
          kind: 'to_queen',
          pinned: { square: 'd4', role: 'bishop', color: 'white' },
          pinner: { square: 'd8', role: 'rook', color: 'black' },
          target: { square: 'd1', role: 'queen', color: 'white' }
        },
        {
          kind: 'absolute',
          pinned: { square: 'e5', role: 'knight', color: 'black' },
          pinner: { square: 'e1', role: 'rook', color: 'white' },
          target: { square: 'e8', role: 'king', color: 'black' }
        }
      ]));
    });

    it('A piece between slider and king that belongs to the SLIDER\'s side (must NOT count as a pin)', () => {
      // Black rook e8, Black knight e4, White king e1. Need Black king.
      const fen = '4r2k/8/8/8/4n3/8/8/4K3 w - - 0 1';
      const result = getPositionFacts(fen);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.pins).toHaveLength(0);
    });

    it('Two pieces between slider and king (must NOT count as a pin)', () => {
      // Black rook e8, White knight e5, White bishop e4, White king e1. Need Black king.
      const fen = '4r2k/8/8/4N3/4B3/8/8/4K3 w - - 0 1';
      const result = getPositionFacts(fen);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.pins).toHaveLength(0);
    });

    it('kingZones: king in a corner (zone size 4) and in the center (zone 9), with correct enemyAttackers', () => {
      // White king a1 (corner). Black rook c2 attacks a2, b2.
      // Black king e5 (center). White knight d3 attacks e5, c5, e1, f2, f4, b4, b2. White bishop g3 attacks e5, f4.
      const fen = '8/8/8/4k3/8/3N2B1/2r5/K7 b - - 0 1';
      const result = getPositionFacts(fen);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      const wz = result.value.kingZones.white;
      expect(wz.king).toBe('a1');
      expect(wz.zone.sort()).toEqual(['a1', 'a2', 'b1', 'b2'].sort());
      // Black rook c2 attacks a2 and b2
      expect(wz.enemyAttackers).toEqual([{ square: 'c2', role: 'rook', color: 'black' }]);

      const bz = result.value.kingZones.black;
      expect(bz.king).toBe('e5');
      expect(bz.zone.sort()).toEqual(['d6', 'e6', 'f6', 'd5', 'e5', 'f5', 'd4', 'e4', 'f4'].sort());
      // White knight d3 attacks e5, f4, c5
      // White bishop g3 attacks e5, f4
      expect(bz.enemyAttackers).toEqual(expect.arrayContaining([
        { square: 'd3', role: 'knight', color: 'white' },
        { square: 'g3', role: 'bishop', color: 'white' }
      ]));
      expect(bz.enemyAttackers).toHaveLength(2);
    });

    it('inCheck/checkers including a double check', () => {
      // Black king e8 checked by White rook e1 and White knight d6. White King safe on a1.
      const fen = '4k3/8/3N4/8/8/8/8/K3R3 b - - 0 1';
      const result = getPositionFacts(fen);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.inCheck).toBe(true);
      expect(result.value.checkers).toEqual(expect.arrayContaining([
        { square: 'e1', role: 'rook', color: 'white' },
        { square: 'd6', role: 'knight', color: 'white' }
      ]));
      expect(result.value.checkers).toHaveLength(2);
    });

    it('Error passthrough: invalid FEN', () => {
      const result = getPositionFacts('invalid fen');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_FEN');
      }
    });
  });
});
