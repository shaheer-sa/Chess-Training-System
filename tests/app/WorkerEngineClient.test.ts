import { describe, it, expect } from 'vitest';
import { WorkerEngineClient } from '../../src/app/engine/WorkerEngineClient.js';
import { Square } from '../../src/engine/types.js';

class MockWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((ev: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onmessageerror: ((ev: any) => void) | null = null;
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

  it('worker.onmessageerror -> all pending reject; later requests reject too', async () => {
    const client = new WorkerEngineClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const worker = (client as any).worker as any;
    
    const p1 = client.classifyMove('fen', {from: 'a1', to: 'a2'});
    const p2 = client.classifyMove('fen', {from: 'a2', to: 'a3'});
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    worker.onmessageerror!({ message: 'worker crashed' } as any);
    
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
  it('R5: Cache does not mix positions when responses arrive out of order', async () => {
    const client = new WorkerEngineClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const worker = (client as any).worker as MockWorker;
    
    // 1. request fenA pending
    const pA = client.classifyMovesFrom('fenA', 'e2');
    
    // 2. request fenB pending
    const pB = client.classifyMovesFrom('fenB', 'e2');
    
    // 3. fenB resolves first
    worker.onmessage!({ data: { id: 2, result: { ok: true, value: ['B'] } } } as MessageEvent);
    
    // 4. fenA resolves second
    worker.onmessage!({ data: { id: 1, result: { ok: true, value: ['A'] } } } as MessageEvent);
    
    await pA;
    await pB;
    
    // 5. a new fenB request should return fenB's result
    // wait, if we requested fenB, the cache for fenB should be preserved?
    // the requirement says "keep clearing it when the FEN changes". 
    // Wait, the client only keeps ONE cached FEN. 
    // Let's just mock postRequest or mock worker to not respond for the second one, 
    // and verify what it returns. Actually, if it clears when FEN changes, 
    // the current FEN in the client should be fenB because it was requested last.
    // Let's just do another classifyMovesFrom('fenB', 'e2') and see if it uses the cache or returns 'B'.
    
    let callCount = 0;
    client['postRequest'] = async () => {
      callCount++;
      return { ok: true, value: ['NewCall'] };
    };
    
    const pB_new = await client.classifyMovesFrom('fenB', 'e2');
    // If it cached fenB correctly (and didn't overwrite it with fenA's late arrival)
    expect(callCount).toBe(0); 
    expect(pB_new).toEqual({ ok: true, value: ['B'] });
  });
});
