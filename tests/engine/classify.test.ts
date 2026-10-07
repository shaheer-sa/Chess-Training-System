import { describe, it, expect } from 'vitest';
import { classifyMove, classifyMovesFrom } from '../../src/engine/classify.js';
import { Square, Role } from '../../src/engine/types.js';

describe('Move Classification (Phase 1E)', () => {
  describe('Supervisor Fixtures', () => {
    const fixtures = [
      {
        id: 'S1', fen: 'k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1', move: { from: 'e6', to: 'g5' },
        label: 'loses_material', netMaterial: -300, reasons: ['PINNED_DEFENDER', 'PIECE_ALREADY_HANGING']
      },
      {
        id: 'S2', fen: '7k/8/8/8/R1r5/8/5N2/K7 w - - 0 1', move: { from: 'f2', to: 'e4' },
        label: 'safe', netMaterial: 0, reasons: ['PIECE_ALREADY_HANGING', 'OPPONENT_CAPTURE_LOSES']
      },
      {
        id: 'S3', fen: '4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1', move: { from: 'd2', to: 'd4' },
        label: 'even_trade', netMaterial: 0, reasons: ['EVEN_EXCHANGE']
      },
      {
        id: 'S4', fen: 'k7/1b6/4p3/8/5N2/8/8/3R2K1 w - - 0 1', move: { from: 'f4', to: 'd5' },
        label: 'loses_material', netMaterial: -300, reasons: ['BAD_EXCHANGE']
      },
      {
        id: 'S5', fen: '3r3k/8/5n2/8/8/4N3/3R4/3R2K1 w - - 0 1', move: { from: 'e3', to: 'd5' },
        label: 'even_trade', netMaterial: 0, reasons: ['EVEN_EXCHANGE']
      },
      {
        id: 'S6', fen: '4k3/8/8/2n5/2b5/8/2KP4/8 w - - 0 1', move: { from: 'd2', to: 'd3' },
        label: 'loses_material', netMaterial: -100, reasons: ['KING_CANNOT_RECAPTURE']
      },
      {
        id: 'S7', fen: '6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1', move: { from: 'e2', to: 'e4' },
        label: 'even_trade', netMaterial: 0, reasons: ['EVEN_EXCHANGE']
      },
      {
        id: 'S8', fen: '7k/8/8/1R6/8/8/2pN3K/8 w - - 0 1', move: { from: 'b5', to: 'b1' },
        label: 'loses_material', netMaterial: -400, reasons: ['BAD_EXCHANGE']
      },
      {
        id: 'S9', fen: '4k3/8/8/4p3/5P2/6P1/8/4K3 b - - 0 1', move: { from: 'e5', to: 'f4' },
        label: 'even_trade', netMaterial: 0, reasons: ['EVEN_EXCHANGE']
      },
      {
        id: 'S10', fen: '4k3/1p6/8/4N3/8/8/8/4R1K1 w - - 0 1', move: { from: 'e5', to: 'c6' },
        label: 'safe', netMaterial: 0, reasons: ['ATTACKER_CANNOT_CAPTURE', 'GIVES_CHECK']
      },
      {
        id: 'S11', fen: '7k/8/2p5/8/4P3/8/8/3Q2K1 w - - 0 1', move: { from: 'd1', to: 'd5' },
        label: 'loses_material', netMaterial: -800, reasons: ['BAD_EXCHANGE']
      },
      {
        id: 'S12', fen: '4k3/1P6/8/8/8/8/8/R3K3 w Q - 0 1', move: { from: 'b7', to: 'b8', promotion: 'queen' },
        label: 'safe', netMaterial: 800, reasons: ['NOT_ATTACKED', 'WINS_MATERIAL', 'GIVES_CHECK']
      },
      {
        id: 'T1', fen: '6k1/8/1b6/8/3N4/8/8/3R2K1 w - - 0 1', move: { from: 'd1', to: 'a1' },
        label: 'loses_material', netMaterial: -300, reasons: ['DEFENDER_MOVED', 'NOT_ATTACKED']
      },
      {
        id: 'T2', fen: '4r1k1/8/8/8/4B3/8/4N3/6K1 w - - 0 1', move: { from: 'e4', to: 'c2' },
        label: 'loses_material', netMaterial: -300, reasons: ['LINE_OPENED', 'NOT_ATTACKED']
      },
      {
        id: 'T3', fen: '1r4k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', move: { from: 'a1', to: 'a7' },
        label: 'loses_material', netMaterial: 0, reasons: ['ALLOWS_MATE_IN_ONE', 'NOT_ATTACKED']
      },
      {
        id: 'T4', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', move: { from: 'a1', to: 'a8' },
        label: 'safe', netMaterial: 0, reasons: ['NOT_ATTACKED', 'DELIVERS_MATE']
      },
      {
        id: 'T5', fen: '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1', move: { from: 'g1', to: 'g6' },
        label: 'unclear', netMaterial: 0, reasons: ['CAUSES_STALEMATE', 'NOT_ATTACKED']
      },
      {
        id: 'T6', fen: '4r1k1/8/8/8/8/8/5N2/4K3 w - - 0 1', move: { from: 'f2', to: 'e4' },
        label: 'loses_material', netMaterial: -300, reasons: ['UNDEFENDED_PIECE_LOST', 'MOVER_PINNED']
      },
      {
        id: 'T7', fen: '1r4k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', move: { from: 'a1', to: 'b1' },
        label: 'loses_material', netMaterial: -500, reasons: ['ALLOWS_MATE_IN_ONE', 'EXCHANGE_LINE_MATE', 'UNDEFENDED_PIECE_LOST']
      },
      {
        id: 'T8', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', move: { from: 'e2', to: 'e4' },
        label: 'safe', netMaterial: 0, reasons: ['NOT_ATTACKED']
      },
      {
        id: 'U1', fen: '3r2k1/5ppp/8/8/8/8/4R3/4R1K1 w - - 0 1', move: { from: 'e2', to: 'e8' },
        label: 'unclear', netMaterial: 0, reasons: ['EXCHANGE_LINE_MATES_OPPONENT', 'GIVES_CHECK']
      },
      {
        id: 'U2', fen: '7k/7p/6P1/5N2/2Bq4/8/8/1K6 w - - 0 1', move: { from: 'g6', to: 'g7' },
        label: 'unclear', netMaterial: 0, reasons: ['FORCED_CAPTURE_IGNORED', 'GIVES_CHECK']
      }
    ];

    for (const fx of fixtures) {
      it(`Fixture ${fx.id}`, () => {
        const res = classifyMove(fx.fen, fx.move as { from: Square; to: Square; promotion?: Role });
        expect(res.ok).toBe(true);
        if (!res.ok) return;

        expect(res.value.label).toBe(fx.label);
        expect(res.value.netMaterial).toBe(fx.netMaterial);
        expect(res.value.reasons.map(r => r.code)).toEqual(fx.reasons);
      });
    }

    it('Fixture C1: classifyMovesFrom(startpos, g1)', () => {
      const res = classifyMovesFrom('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'g1');
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.value).toHaveLength(2);
      expect(res.value.map(c => c.move.to)).toEqual(['f3', 'h3']);
      for (const c of res.value) {
        expect(c.label).toBe('safe');
        expect(c.netMaterial).toBe(0);
        expect(c.reasons.map(r => r.code)).toEqual(['NOT_ATTACKED']);
      }
    });

    it('Fixture C2: classifyMovesFrom castling', () => {
      const res = classifyMovesFrom('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1');
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.value).toHaveLength(7);
      expect(res.value.map(c => c.move.to)).toEqual(['c1', 'd1', 'f1', 'g1', 'd2', 'e2', 'f2']);
      
      const c1 = res.value.find(c => c.move.to === 'c1');
      const g1 = res.value.find(c => c.move.to === 'g1');
      expect(c1?.label).toBe('unclear');
      expect(c1?.reasons.map(r => r.code)).toEqual(['CASTLING_NOT_ANALYZED']);
      expect(c1?.netMaterial).toBe(0);
      expect(c1?.destination).toBeNull();
      
      expect(g1?.label).toBe('unclear');
      expect(g1?.reasons.map(r => r.code)).toEqual(['CASTLING_NOT_ANALYZED']);
      expect(g1?.netMaterial).toBe(0);
      expect(g1?.destination).toBeNull();
    });

    it('Fixture C3: Errors', () => {
      expect(classifyMove('invalid', { from: 'e2', to: 'e4' }).ok).toBe(false);
      expect(classifyMovesFrom('invalid', 'e2').ok).toBe(false);
      
      const startpos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      expect(classifyMovesFrom(startpos, 'e4').ok).toBe(false); // empty square
      expect(classifyMovesFrom(startpos, 'e7').ok).toBe(false); // wrong color
    });
  });

  describe('Additional Tests', () => {
    it('Black-mover: safe', () => {
      // Black plays e7-e5, safe.
      const res = classifyMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', { from: 'e7', to: 'e5' });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.label).toBe('safe');
    });

    it('Black-mover: loses_material', () => {
      // Black knight moves to square attacked by white pawn.
      // White pawn on c3 attacks d4.
      const fen = '4k3/8/2n5/8/8/2P5/8/4K3 b - - 0 1';
      const res = classifyMove(fen, { from: 'c6', to: 'd4' });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.label).toBe('loses_material');
    });

    it('Black-mover: even_trade', () => {
      // Black rook captures white rook. White king recaptures.
      const fen2 = '4k3/8/8/8/8/8/K7/R3r3 b - - 0 1';
      const res = classifyMove(fen2, { from: 'e1', to: 'a1' });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.label).toBe('even_trade');
    });

    it('Black-mover: unclear', () => {
      // Black stalemates white.
      const fen = '7K/5k2/8/8/8/8/8/6q1 b - - 0 1';
      const res = classifyMove(fen, { from: 'g1', to: 'g6' });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.label).toBe('unclear');
    });

    it('WINS_MATERIAL where destination is later recaptured (net > 0)', () => {
      // White plays Nd5 capturing a queen (value 900). Black can recapture with pawn (value 100).
      // White loses knight (300). Net 900 - 300 = 600.
      const fen = '4k3/8/4p3/3q4/8/2N5/8/4K3 w - - 0 1';
      const res = classifyMove(fen, { from: 'c3', to: 'd5' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.netMaterial).toBe(600);
      expect(res.value.label).toBe('safe'); // WINS_MATERIAL -> safe (or rather, netMaterial > 0 -> WINS_MATERIAL -> safe)
      expect(res.value.reasons.map(r => r.code)).toContain('WINS_MATERIAL');
    });

    it('PIECE_ALREADY_HANGING that does NOT change the label', () => {
      const fen = '4k3/8/8/8/8/3K4/7P/N5r1 w - - 0 1'; // White knight a1 attacked by black rook g1
      const res = classifyMove(fen, { from: 'h2', to: 'h3' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.label).toBe('safe');
      expect(res.value.reasons.map(r => r.code)).toContain('PIECE_ALREADY_HANGING');
    });
  });
});
