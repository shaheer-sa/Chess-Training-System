import type { EngineScore, EngineScores } from '../play/engineVerdict.js';

/**
 * Engine check (phase 5C): one Stockfish search per turn that scores EVERY legal move (MultiPV = number of moves).
 * Separate worker from the computer opponent, so the two never wait for each other.
 *
 * Response ownership mirrors StockfishBot: UCI answers every "go" with exactly one "bestmove", and the info lines
 * of a stopped search arrive before its bestmove. While a stopped search is still draining (staleBestmoves > 0),
 * its info lines and its bestmove are ignored. Timeout or worker error → the worker is discarded.
 */
/** One engine line: its first move, score (side to move) and the principal variation. */
export interface PvLine {
  uci: string;
  score: EngineScore;
  pv: string[];
}

export interface EngineCheckClient {
  check(fen: string, legalMoveCount: number): Promise<EngineScores>;
  /** The top `multiPv` lines at `depth`, best first (used by game review). */
  search(fen: string, multiPv: number, depth: number, movetimeMs?: number): Promise<PvLine[]>;
  cancel(): void;
  dispose(): void;
}

export const CHECK_DEPTH = 11;
/** Upper bound for the per-turn check, so hints never wait long on slow devices or sharp positions. */
export const CHECK_MOVETIME_MS = 1200;
const CHECK_TIMEOUT_MS = 15000;
const STARTUP_TIMEOUT_MS = 15000;

interface Pending {
  id: number;
  lines: Map<number, string>;
  resolve: (lines: PvLine[]) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const abortError = (): Error => {
  const err = new Error('cancelled');
  err.name = 'AbortError';
  return err;
};

export const parseInfoLines = (lines: Iterable<string>): EngineScores => {
  const out: EngineScores = {};
  for (const l of lines) {
    const pv = l.split(' pv ')[1];
    const sc = l.match(/ score (cp|mate) (-?\d+)/);
    if (!pv || !sc) continue;
    const move = pv.trim().split(/\s+/)[0];
    out[move] = sc[1] === 'cp' ? { cp: Number(sc[2]) } : { mate: Number(sc[2]) };
  }
  return out;
};

/** Parses the last info line of each multipv index into lines ordered best first. */
export const parsePvLines = (byIndex: Map<number, string>): PvLine[] => {
  const out: PvLine[] = [];
  for (const [, l] of [...byIndex.entries()].sort((a, b) => a[0] - b[0])) {
    const pv = l.split(' pv ')[1];
    const sc = l.match(/ score (cp|mate) (-?\d+)/);
    if (!pv || !sc) continue;
    const moves = pv.trim().split(/\s+/);
    out.push({ uci: moves[0], score: sc[1] === 'cp' ? { cp: Number(sc[2]) } : { mate: Number(sc[2]) }, pv: moves });
  }
  return out;
};

export class EngineCheck implements EngineCheckClient {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private failStart: ((err: Error) => void) | null = null;
  private pending: Pending | null = null;
  private staleBestmoves = 0;
  private requestId = 0;
  private disposed = false;

  constructor(
    private createWorker: () => Worker = () => new Worker(new URL('stockfish/stockfish-19-lite-single.js', document.baseURI).href)
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
        if (worker !== this.worker) return;
        const line = typeof e.data === 'string' ? e.data : '';
        if (line === 'uciok') worker.postMessage('isready');
        else if (line === 'readyok') { clearTimeout(startTimer); this.failStart = null; resolve(); }
        else if (line.startsWith('bestmove')) this.onBestMove();
        else if (line.startsWith('info ') && this.staleBestmoves === 0 && this.pending) this.onInfo(line);
      });
      worker.addEventListener('error', () => {
        if (worker !== this.worker) return;
        this.failStart?.(new Error('engine error'));
        this.failPending(new Error('engine error'));
        this.discardWorker();
      });
      worker.postMessage('uci');
    });
    this.ready.catch(() => undefined);
    return this.ready;
  }

  private onInfo(line: string): void {
    if (!this.pending || / (upper|lower)bound/.test(line) || !line.includes(' pv ')) return;
    const m = line.match(/ multipv (\d+)/);
    this.pending.lines.set(m ? Number(m[1]) : 1, line);
  }

  private onBestMove(): void {
    if (this.staleBestmoves > 0) { this.staleBestmoves--; return; }
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    const lines = parsePvLines(p.lines);
    if (lines.length === 0) p.reject(new Error('no scores'));
    else p.resolve(lines);
  }

  private failPending(err: Error): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    p.reject(err);
  }

  private discardWorker(): void {
    this.failStart?.(new Error('engine stopped'));
    this.failStart = null;
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.staleBestmoves = 0;
  }

  async check(fen: string, legalMoveCount: number): Promise<EngineScores> {
    const lines = await this.search(fen, legalMoveCount, CHECK_DEPTH, CHECK_MOVETIME_MS);
    const out: EngineScores = {};
    for (const l of lines) out[l.uci] = l.score;
    return out;
  }

  async search(fen: string, multiPv: number, depth: number, movetimeMs?: number): Promise<PvLine[]> {
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
    if (this.disposed) throw new Error('disposed');
    if (id !== this.requestId || !this.worker) throw abortError();
    const worker = this.worker;
    return new Promise<PvLine[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.id !== id) return;
        worker.postMessage('stop');
        this.failPending(new Error('timeout'));
        this.discardWorker();
      }, CHECK_TIMEOUT_MS);
      this.pending = { id, lines: new Map(), resolve, reject, timer };
      worker.postMessage(`setoption name MultiPV value ${Math.max(1, multiPv)}`);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(movetimeMs ? `go depth ${depth} movetime ${movetimeMs}` : `go depth ${depth}`);
    });
  }

  cancel(): void {
    this.requestId++;
    if (this.pending) {
      this.worker?.postMessage('stop');
      this.staleBestmoves++;
      this.failPending(abortError());
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    this.discardWorker();
  }
}
