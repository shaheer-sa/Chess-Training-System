import { GameState, legalUciMoves } from '../play/game.js';
import { BotLevel, levelSettings } from './levels.js';
import { parseBestMove, chooseMove } from './uci.js';

export interface BotClient {
  bestMove(game: GameState, level: BotLevel): Promise<string>;
  cancel(): void;
  dispose(): void;
}

interface Search {
  id: number;
  resolve: (engineMove: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const STARTUP_TIMEOUT_MS = 15000;

const abortError = (): Error => {
  const err = new Error('cancelled');
  err.name = 'AbortError';
  return err;
};

/**
 * Stockfish (UCI) in a Web Worker. One search at a time.
 *
 * Response ownership: UCI answers every "go" with exactly one "bestmove". When a running search is
 * stopped (cancel / superseded), its bestmove still arrives later, so we count those and drop them
 * (`staleBestmoves`). Requests are numbered (`requestId`): a request that was cancelled or superseded
 * while it waited for the engine to start never posts "go" and rejects with AbortError.
 * A timeout or worker error throws the worker away; the next request starts a fresh one.
 */
export class StockfishBot implements BotClient {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private failStart: ((err: Error) => void) | null = null;
  private search: Search | null = null;
  private staleBestmoves = 0;
  private requestId = 0;
  private disposed = false;

  constructor(
    private createWorker: () => Worker = () => new Worker(new URL('stockfish/stockfish-19-lite-single.js', document.baseURI).href),
    private rng: () => number = Math.random
  ) {}

  private startWorker(): Promise<void> {
    if (this.ready) return this.ready;
    const worker = this.createWorker();
    this.worker = worker;
    this.staleBestmoves = 0;
    this.ready = new Promise<void>((resolve, reject) => {
      const startTimer = setTimeout(() => {
        if (worker !== this.worker) return;
        reject(new Error('engine did not start'));
        this.discardWorker();
      }, STARTUP_TIMEOUT_MS);
      this.failStart = (err: Error) => { clearTimeout(startTimer); reject(err); };
      worker.addEventListener('message', (e: MessageEvent) => {
        if (worker !== this.worker) return; // message from a discarded worker
        const line = typeof e.data === 'string' ? e.data : '';
        if (line === 'uciok') worker.postMessage('isready');
        else if (line === 'readyok') { clearTimeout(startTimer); this.failStart = null; resolve(); }
        else if (line.startsWith('bestmove ')) this.onBestMove(line);
      });
      worker.addEventListener('error', () => {
        if (worker !== this.worker) return;
        this.failStart?.(new Error('engine error'));
        this.failSearch(new Error('engine error'));
        this.discardWorker();
      });
      worker.postMessage('uci');
    });
    // A failed start must not poison later requests.
    this.ready.catch(() => undefined);
    return this.ready;
  }

  private discardWorker(): void {
    this.failStart?.(new Error('engine stopped')); // wake any request waiting for startup
    this.failStart = null;
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.staleBestmoves = 0;
  }

  private failSearch(err: Error): void {
    const s = this.search;
    if (!s) return;
    this.search = null;
    clearTimeout(s.timer);
    s.reject(err);
  }

  private onBestMove(line: string): void {
    if (this.staleBestmoves > 0) {
      this.staleBestmoves--; // answer to a search that was stopped
      return;
    }
    const s = this.search;
    if (!s) return;
    this.search = null;
    clearTimeout(s.timer);
    const move = parseBestMove(line);
    if (move) s.resolve(move);
    else s.reject(new Error('no move'));
  }

  async bestMove(game: GameState, level: BotLevel): Promise<string> {
    if (this.disposed) throw new Error('disposed');
    this.cancel();
    const id = this.requestId;

    try {
      await this.startWorker();
    } catch (err) {
      if (this.disposed) throw new Error('disposed', { cause: err });
      if (id !== this.requestId) throw abortError();
      throw err;
    }
    // Cancelled, superseded or disposed while the engine was starting.
    if (this.disposed) throw new Error('disposed');
    if (id !== this.requestId || !this.worker) throw abortError();

    const worker = this.worker;
    const s = levelSettings(level);
    const legal = legalUciMoves(game);
    const engineMove = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.search?.id !== id) return;
        worker.postMessage('stop');
        this.failSearch(new Error('timeout'));
        this.discardWorker(); // an engine that missed its deadline is not trusted again
      }, s.movetimeMs + 5000);
      this.search = { id, resolve, reject, timer };
      worker.postMessage(`setoption name Skill Level value ${s.skill}`);
      worker.postMessage(`position fen ${game.currentFen}`);
      worker.postMessage(`go depth ${s.depth} movetime ${s.movetimeMs}`);
    });
    return chooseMove(engineMove, legal, s.randomMoveChance, this.rng);
  }

  cancel(): void {
    this.requestId++; // invalidates a request still waiting for the engine to start
    if (this.search) {
      this.worker?.postMessage('stop');
      this.staleBestmoves++;
      this.failSearch(abortError());
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    this.discardWorker();
  }
}
