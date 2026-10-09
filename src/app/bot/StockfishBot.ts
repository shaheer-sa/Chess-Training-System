import { GameState, legalUciMoves } from '../play/game.js';
import { BotLevel, levelSettings } from './levels.js';
import { parseBestMove, chooseMove } from './uci.js';

export interface BotClient {
  bestMove(game: GameState, level: BotLevel): Promise<string>;
  cancel(): void;
  dispose(): void;
}

export class StockfishBot implements BotClient {
  private worker: Worker | null = null;
  private workerReady: Promise<void> | null = null;
  private currentSearch: { resolve: (move: string) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> | null } | null = null;
  private disposed = false;
  
  constructor(
    private createWorker: () => Worker = () => new Worker(new URL('stockfish/stockfish-19-lite-single.js', document.baseURI).href),
    private rng: () => number = Math.random
  ) {}

  private initWorker(): Promise<void> {
    if (this.workerReady) return this.workerReady;
    
    this.worker = this.createWorker();
    
    this.workerReady = new Promise((resolve, reject) => {
      const onMessage = (e: MessageEvent) => {
        const line = typeof e.data === 'string' ? e.data : '';
        if (line === 'uciok') {
          this.worker?.postMessage('isready');
        } else if (line === 'readyok') {
          resolve();
        } else if (line.startsWith('bestmove ')) {
          this.handleBestMove(line);
        }
      };
      
      this.worker!.addEventListener('message', onMessage);
      this.worker!.addEventListener('error', () => {
        if (this.currentSearch) {
          this.currentSearch.reject(new Error('engine error'));
          if (this.currentSearch.timer) clearTimeout(this.currentSearch.timer);
          this.currentSearch = null;
        } else {
          // If error happens during startup or idle
          reject(new Error('engine error'));
        }
      });
      
      this.worker!.postMessage('uci');
    });
    
    return this.workerReady;
  }
  
  private handleBestMove(line: string) {
    if (!this.currentSearch) return;
    const move = parseBestMove(line);
    const search = this.currentSearch;
    this.currentSearch = null;
    if (search.timer) clearTimeout(search.timer);
    
    if (!move) {
      search.reject(new Error('no move'));
    } else {
      search.resolve(move);
    }
  }

  async bestMove(game: GameState, level: BotLevel): Promise<string> {
    if (this.disposed) throw new Error('disposed');
    
    this.cancel();
    
    await this.initWorker();
    
    return new Promise((resolve, reject) => {
      const s = levelSettings(level);
      
      this.currentSearch = { 
        resolve: (moveStr: string) => {
          resolve(chooseMove(moveStr, legalUciMoves(game), s.randomMoveChance, this.rng));
        }, 
        reject, 
        timer: null 
      };
      
      this.worker!.postMessage(`setoption name Skill Level value ${s.skill}`);
      this.worker!.postMessage(`position fen ${game.currentFen}`);
      this.worker!.postMessage(`go depth ${s.depth} movetime ${s.movetimeMs}`);
      
      this.currentSearch.timer = setTimeout(() => {
        if (this.currentSearch) {
          this.worker!.postMessage('stop');
          this.currentSearch.reject(new Error('timeout'));
          this.currentSearch = null;
        }
      }, s.movetimeMs + 5000);
    });
  }

  cancel(): void {
    if (this.currentSearch) {
      this.worker?.postMessage('stop');
      const err = new Error('cancelled');
      err.name = 'AbortError';
      this.currentSearch.reject(err);
      if (this.currentSearch.timer) clearTimeout(this.currentSearch.timer);
      this.currentSearch = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
    this.workerReady = null;
  }
}
