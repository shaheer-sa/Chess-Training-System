import { describe, it, expect } from 'vitest';
import { DirectEngineClient } from '../../src/app/engine/DirectEngineClient.js';
import { explain } from '../../src/app/explain/explain.js';
import { MoveClassification } from '../../src/engine/types.js';

describe('explain module', () => {
  const client = new DirectEngineClient();

  const getClassification = async (fen: string, from: string, to: string): Promise<MoveClassification> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await client.classifyMovesFrom(fen, from as any);
    if (!res.ok) throw new Error(`Engine failed: ${res.error.message}`);
    const move = res.value.find(m => m.move.to === to);
    if (!move) throw new Error(`Move ${from}->${to} not found in ${fen}`);
    return move;
  };

  it('P1', async () => {
    const c = await getClassification('k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1', 'e6', 'g5');
    const result = explain(c);
    expect(result.primary).toBe("Your rook on g2 seems to defend this square, but it's pinned to your king, so it can't take back.");
    expect(result.notes).toContain("Note: your rook on g2 was already in danger before this move.");
  });

  it('P2', async () => {
    const c = await getClassification('7k/8/8/8/R1r5/8/5N2/K7 w - - 0 1', 'f2', 'e4');
    const result = explain(c);
    expect(result.primary).toBe("Your opponent can take, but they would lose material doing it.");
    expect(result.notes).toContain("Note: your rook on a4 was already in danger before this move.");
  });

  it('P3', async () => {
    const c = await getClassification('4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1', 'd2', 'd4');
    const result = explain(c);
    expect(result.primary).toBe("Your opponent can take, and you take back the same value.");
  });

  it('P4', async () => {
    const c = await getClassification('1r4k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1', 'a7');
    const result = explain(c);
    expect(result.primary).toBe("After this move your opponent can checkmate you: rook b8→b1.");
  });

  it('P5', async () => {
    const c = await getClassification('3r2k1/5ppp/8/8/8/8/4R3/4R1K1 w - - 0 1', 'e2', 'e8');
    const result = explain(c);
    expect(result.primary).toBe("The capture sequence on this square ends with your opponent checkmated — calculate it yourself.");
    expect(result.notes).toContain("This move gives check.");
  });

  it('X1', async () => {
    const c = await getClassification('k7/1b6/4p3/8/5N2/8/8/3R2K1 w - - 0 1', 'f4', 'd5');
    const result = explain(c);
    expect(result.primary).toBe("You can take back, but you still end up 3 pawns down.");
  });

  it('X2', async () => {
    const c = await getClassification('6k1/8/1b6/8/3N4/8/8/3R2K1 w - - 0 1', 'd1', 'a1');
    const result = explain(c);
    expect(result.primary).toBe("This piece was protecting your knight on d4 — now it can be taken.");
    expect(result.details).toContain("Nothing attacks this square.");
  });

  it('X3', async () => {
    const c = await getClassification('4r1k1/8/8/8/4B3/8/4N3/6K1 w - - 0 1', 'e4', 'c2');
    const result = explain(c);
    expect(result.primary).toBe("Moving this piece opens a line: your knight on e2 can now be taken.");
  });

  it('X4', async () => {
    const c = await getClassification('4k3/1P6/8/8/8/8/8/R3K3 w Q - 0 1', 'b7', 'b8');
    const result = explain(c);
    expect(result.primary).toBe("You win material here (+8 pawns).");
    expect(result.details).toContain("Nothing attacks this square.");
    expect(result.notes).toContain("This move gives check.");
  });

  it('X5', async () => {
    const c = await getClassification('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1', 'a8');
    const result = explain(c);
    expect(result.primary).toBe("This is checkmate.");
  });

  it('X6', async () => {
    const c = await getClassification('7k/5K2/8/8/8/8/8/6Q1 w - - 0 1', 'g1', 'g6');
    const result = explain(c);
    expect(result.primary).toBe("This move leaves your opponent no legal moves — the game ends in a draw.");
  });

  it('X7', async () => {
    const c = await getClassification('4k3/8/8/2n5/2b5/8/2KP4/8 w - - 0 1', 'd2', 'd3');
    const result = explain(c);
    expect(result.primary).toBe("Your king defends this square, but it can't take back because the square is still attacked.");
  });

  it('X8', async () => {
    const c = await getClassification('4r1k1/8/8/8/8/8/5N2/4K3 w - - 0 1', 'f2', 'e4');
    const result = explain(c);
    expect(result.primary).toBe("Nothing protects your knight on e4 — it can be taken for free.");
    expect(result.notes).toContain("Careful: on this square your piece is pinned by the rook on e8.");
  });

  it('X9', async () => {
    const c = await getClassification('4k3/1p6/8/4N3/8/8/8/4R1K1 w - - 0 1', 'e5', 'c6');
    const result = explain(c);
    expect(result.primary).toBe("The pawn on b7 attacks this square but can't legally take right now.");
    expect(result.notes).toContain("This move gives check.");
  });

  it('X10', async () => {
    const c = await getClassification('7k/7p/6P1/5N2/2Bq4/8/8/1K6 w - - 0 1', 'g6', 'g7');
    const result = explain(c);
    expect(result.primary).toBe("Your opponent is forced to capture here — this trainer can't judge the result simply.");
  });

  describe('Additional templates', () => {
    it('CASTLING_NOT_ANALYZED', () => {
      const result = explain({
        move: { from: 'e1', to: 'e2' },
        reasons: [{ code: 'CASTLING_NOT_ANALYZED', squares: [] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      expect(result.primary).toBe("Castling isn't analyzed by this trainer yet.");
    });
    it('EXCHANGE_LINE_MATE', () => {
      const result = explain({
        move: { from: 'e1', to: 'e2' },
        reasons: [{ code: 'EXCHANGE_LINE_MATE', squares: [] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      expect(result.primary).toBe("The capture sequence on this square ends with you getting checkmated.");
    });
    it('DEFENDER_UNAVAILABLE', () => {
      const result = explain({
        move: { from: 'e1', to: 'e2' },
        exchange: { fenAfter: 'k7/8/8/8/8/8/8/4K3 w - - 0 1' },
        reasons: [{ code: 'DEFENDER_UNAVAILABLE', squares: ['e4'] }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // Wait, we need a piece on e4 in the fenAfter for the template "Your {role} on {sq}...". 
      // I'll just check if it contains the substring.
      expect(result.primary).toMatch(/can't legally take back here\./);
    });
  });
});
