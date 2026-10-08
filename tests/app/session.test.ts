import { expect, it, describe } from 'vitest';
import { buildSession } from '../../src/app/training/session.js';
import { EXERCISES } from '../../src/app/training/exercises.js';

describe('Training Session Builder', () => {
  it('builds a 10-item session: 4x diff-1, 3x diff-2, 3x diff-3 with no repeats in difficulty order', () => {
    let seed = 123;
    const seededRng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    
    const session = buildSession(EXERCISES, seededRng);
    
    expect(session.length).toBe(10);
    
    const d1 = session.filter((e: import("../../src/app/training/exercises.js").Exercise) => e.difficulty === 1);
    const d2 = session.filter((e: import("../../src/app/training/exercises.js").Exercise) => e.difficulty === 2);
    const d3 = session.filter((e: import("../../src/app/training/exercises.js").Exercise) => e.difficulty === 3);
    
    expect(d1.length).toBe(4);
    expect(d2.length).toBe(3);
    expect(d3.length).toBe(3);
    
    const difficulties = session.map((e: import("../../src/app/training/exercises.js").Exercise) => e.difficulty);
    expect(difficulties).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
    
    const uniqueIds = new Set(session.map((e: import("../../src/app/training/exercises.js").Exercise) => e.id));
    expect(uniqueIds.size).toBe(10);
  });
});
