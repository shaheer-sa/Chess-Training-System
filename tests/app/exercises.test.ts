import { expect, it, describe } from 'vitest';
import { EXERCISES } from '../../src/app/training/exercises';
import { classifyMove } from '../../src/engine/index';

describe('Training Exercises', () => {
  it('has 30 exercises with unique IDs', () => {
    expect(EXERCISES.length).toBe(30);
    const ids = new Set(EXERCISES.map(e => e.id));
    expect(ids.size).toBe(30);
  });

  const EXPECTED_LABELS: Record<string, string> = {
    'safe': 'E01 E02 E05 E06 E10 E11 E15 E28',
    'even_trade': 'E04 E08 E09 E14 E21 E26',
    'loses_material': 'E03 E07 E12 E13 E16 E17 E18 E19 E22 E23 E24 E25 E27',
    'unclear': 'E20 E29 E30'
  };

  const idToExpectedLabel = new Map<string, string>();
  for (const [label, idsStr] of Object.entries(EXPECTED_LABELS)) {
    for (const id of idsStr.split(' ')) {
      idToExpectedLabel.set(id, label);
    }
  }

  for (const ex of EXERCISES) {
    it(`exercise ${ex.id} has correct label and is a legal non-castling move`, () => {
      const res = classifyMove(ex.fen, { from: ex.from, to: ex.to, promotion: ex.promotion as any });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const c = res.value;
      
      expect(c).toBeDefined();
      expect(c.label).toBe(idToExpectedLabel.get(ex.id));
      
      if (c.exchange.mover.role === 'king') {
        const fileDiff = Math.abs(ex.from.charCodeAt(0) - ex.to.charCodeAt(0));
        expect(fileDiff).toBeLessThan(2); // no castling
      }
    });
  }
});
