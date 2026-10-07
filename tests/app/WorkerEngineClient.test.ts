import { describe, it, expect } from 'vitest';
import { WorkerEngineClient } from '../../src/app/engine/WorkerEngineClient.js';
import { Square } from '../../src/engine/types.js';

class MockWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  postMessage() {}
  terminate() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.Worker = MockWorker as any;

describe('WorkerEngineClient Cache', () => {
  it('caches the same fen and from square', async () => {
    const client = new WorkerEngineClient();
    let callCount = 0;
    // Mock the internal postRequest to verify it's only called once
    client['postRequest'] = async () => {
      callCount++;
      return { ok: true, value: [] };
    };

    const fen = 'startpos';
    const sq = 'e2' as Square;

    await client.classifyMovesFrom(fen, sq);
    await client.classifyMovesFrom(fen, sq);

    expect(callCount).toBe(1);
  });

  it('recalculates for a new fen', async () => {
    const client = new WorkerEngineClient();
    let callCount = 0;
    client['postRequest'] = async () => {
      callCount++;
      return { ok: true, value: [] };
    };

    const fen1 = 'startpos';
    const fen2 = 'otherpos';
    const sq = 'e2' as Square;

    await client.classifyMovesFrom(fen1, sq);
    await client.classifyMovesFrom(fen2, sq);

    expect(callCount).toBe(2);
  });
});
