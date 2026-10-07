import { EngineClient } from './EngineClient.js';
import { Result, MoveClassification, MoveInput, Square } from '../../engine/types.js';

export class WorkerEngineClient implements EngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (res: unknown) => void; reject: (err: unknown) => void }>();
  private fatalError = false;

  constructor() {
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const deferred = this.pending.get(id);
      if (deferred) {
        this.pending.delete(id);
        if (error) {
          deferred.reject(new Error(error));
        } else {
          deferred.resolve(result);
        }
      }
    };

    const handleFatalError = () => {
      this.fatalError = true;
      for (const deferred of this.pending.values()) {
        deferred.reject(new Error("Worker error"));
      }
      this.pending.clear();
    };

    this.worker.onerror = handleFatalError;
    this.worker.onmessageerror = handleFatalError;
  }

  private cache = new Map<string, Result<MoveClassification[]>>();
  private currentCacheFen: string | null = null;

  async classifyMovesFrom(fen: string, from: Square): Promise<Result<MoveClassification[]>> {
    if (this.currentCacheFen !== fen) {
      this.cache.clear();
      this.currentCacheFen = fen;
    }
    const cacheKey = from;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    const result = await this.postRequest('classifyMovesFrom', { fen, from }) as Result<MoveClassification[]>;
    this.cache.set(cacheKey, result);
    return result;
  }

  async classifyMove(fen: string, move: MoveInput): Promise<Result<MoveClassification>> {
    return this.postRequest('classifyMove', { fen, move }) as Promise<Result<MoveClassification>>;
  }

  private postRequest(type: string, payload: unknown): Promise<unknown> {
    if (this.fatalError) return Promise.reject(new Error("Worker error"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...(payload as Record<string, unknown>) });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
