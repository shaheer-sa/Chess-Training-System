import { describe, it, expect } from 'vitest';
import { WorkerEngineClient } from '../../src/app/engine/WorkerEngineClient.js';
import { Square } from '../../src/engine/types.js';

class MockWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((ev: any) => void) | null = null;
  postMessage() {}
  terminate() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.Worker = MockWorker as any;

describe('WorkerEngineClient Errors', () => {
  it('exception in worker -> rejects request', async () => {
    const client = new WorkerEngineClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const worker = (client as any).worker as MockWorker;
    
    const promise = client.classifyMove('fen', {from: 'a1', to: 'a2'});
    // Simulate error response
    worker.onmessage!({ data: { id: 1, error: 'fake error' } } as MessageEvent);
    
    await expect(promise).rejects.toThrow('fake error');
  });

  it('worker.onerror -> all pending reject; later requests reject too', async () => {
    const client = new WorkerEngineClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const worker = (client as any).worker as any;
    
    const p1 = client.classifyMove('fen', {from: 'a1', to: 'a2'});
    const p2 = client.classifyMove('fen', {from: 'a2', to: 'a3'});
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    worker.onerror!({ message: 'worker crashed' } as any);
    
    await expect(p1).rejects.toThrow('Worker error');
    await expect(p2).rejects.toThrow('Worker error');
    
    // later requests should also reject immediately
    const p3 = client.classifyMove('fen', {from: 'a1', to: 'b1'});
    await expect(p3).rejects.toThrow('Worker error');
  });
});

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
