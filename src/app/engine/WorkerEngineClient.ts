import { EngineClient } from './EngineClient.js';
import { Result, MoveClassification, MoveInput, Square } from '../../engine/types.js';

export class WorkerEngineClient implements EngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();

  constructor() {
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const { id, result } = e.data;
      const deferred = this.pending.get(id);
      if (deferred) {
        this.pending.delete(id);
        deferred.resolve(result);
      }
    };
  }

  async classifyMovesFrom(fen: string, from: Square): Promise<Result<MoveClassification[]>> {
    return this.postRequest('classifyMovesFrom', { fen, from });
  }

  async classifyMove(fen: string, move: MoveInput): Promise<Result<MoveClassification>> {
    return this.postRequest('classifyMove', { fen, move });
  }

  private postRequest(type: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...payload });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
