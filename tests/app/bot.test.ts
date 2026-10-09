import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { levelSettings, LEVEL_ELO } from '../../src/app/bot/levels.js';
import { parseBestMove, chooseMove } from '../../src/app/bot/uci.js';
import { StockfishBot } from '../../src/app/bot/StockfishBot.js';
import { newGame } from '../../src/app/play/game.js';

describe('Bot Logic', () => {
  describe('levels.ts', () => {
    it('levelSettings returns exact values for all levels', () => {
      expect(levelSettings(1)).toEqual({ skill: 0, depth: 1, movetimeMs: 50, randomMoveChance: 0.35 });
      expect(levelSettings(2)).toEqual({ skill: 2, depth: 2, movetimeMs: 100, randomMoveChance: 0.20 });
      expect(levelSettings(3)).toEqual({ skill: 5, depth: 4, movetimeMs: 200, randomMoveChance: 0.08 });
      expect(levelSettings(4)).toEqual({ skill: 9, depth: 6, movetimeMs: 400, randomMoveChance: 0 });
      expect(levelSettings(5)).toEqual({ skill: 14, depth: 10, movetimeMs: 800, randomMoveChance: 0 });
      expect(levelSettings(6)).toEqual({ skill: 20, depth: 14, movetimeMs: 1500, randomMoveChance: 0 });
    });

    it('LEVEL_ELO has all six levels and strictly increases', () => {
      expect(Object.keys(LEVEL_ELO).length).toBe(6);
      expect(LEVEL_ELO[1]).toBeLessThan(LEVEL_ELO[2]);
      expect(LEVEL_ELO[2]).toBeLessThan(LEVEL_ELO[3]);
      expect(LEVEL_ELO[3]).toBeLessThan(LEVEL_ELO[4]);
      expect(LEVEL_ELO[4]).toBeLessThan(LEVEL_ELO[5]);
      expect(LEVEL_ELO[5]).toBeLessThan(LEVEL_ELO[6]);
    });
  });

  describe('uci.ts', () => {
    describe('parseBestMove', () => {
      it('parses bestmove e2e4 ponder e7e5', () => {
        expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
      });
      it('parses bestmove e7e8q', () => {
        expect(parseBestMove('bestmove e7e8q')).toBe('e7e8q');
      });
      it('returns null for (none)', () => {
        expect(parseBestMove('bestmove (none)')).toBeNull();
      });
      it('returns null for lines not starting with bestmove', () => {
        expect(parseBestMove('info depth 10')).toBeNull();
      });
    });

    describe('chooseMove', () => {
      it('random pick when rng < randomMoveChance', () => {
        let calls = 0;
        const rng = () => { calls++; return calls === 1 ? 0.1 : 0.5; };
        expect(chooseMove('e2e4', ['a1a2', 'b1b2', 'c1c2'], 0.35, rng)).toBe('b1b2'); // 0.5 * 3 = 1.5 -> index 1
      });

      it('engine move when rng >= randomMoveChance', () => {
        const rng = () => 0.9;
        expect(chooseMove('e2e4', ['a1a2', 'b1b2', 'c1c2'], 0.35, rng)).toBe('e2e4');
      });

      it('engine move when legalMoves is empty', () => {
        const rng = () => 0.1; // Will pass chance but list is empty
        expect(chooseMove('e2e4', [], 0.35, rng)).toBe('e2e4');
      });
    });
  });

  describe('StockfishBot', () => {
    let mockWorker: { postMessage: ReturnType<typeof vi.fn>, terminate: ReturnType<typeof vi.fn>, addEventListener: ReturnType<typeof vi.fn>, removeEventListener: ReturnType<typeof vi.fn> };
    let createWorker: () => Worker;
    let postedMessages: string[];
    let messageListeners: ((e: MessageEvent) => void)[];

    beforeEach(() => {
      postedMessages = [];
      messageListeners = [];
      
      mockWorker = {
        postMessage: vi.fn((msg: string) => { postedMessages.push(msg); }),
        terminate: vi.fn(),
        addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
          if (type === 'message') {
            messageListeners.push(listener as (e: MessageEvent) => void);
          }
        }),
        removeEventListener: vi.fn()
      };
      
      createWorker = () => mockWorker as unknown as Worker;
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const simulateMessage = (data: string) => {
      for (const listener of messageListeners) {
        listener({ data } as MessageEvent);
      }
    };

    it('handshake order and three search commands in order', async () => {
      const bot = new StockfishBot(createWorker, () => 0.9);
      const game = newGame();
      
      const p = bot.bestMove(game, 1);
      
      // Handshake: Should have sent 'uci'
      expect(postedMessages).toContain('uci');
      
      // Simulate 'uciok'
      simulateMessage('uciok');
      expect(postedMessages).toContain('isready');
      
      // Simulate 'readyok'
      simulateMessage('readyok');
      
      // Wait for the async code to proceed after initWorker
      await new Promise(r => setTimeout(r, 0));
      
      // The three search commands in order
      expect(postedMessages[postedMessages.length - 3]).toBe('setoption name Skill Level value 0');
      expect(postedMessages[postedMessages.length - 2]).toBe('position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      expect(postedMessages[postedMessages.length - 1]).toBe('go depth 1 movetime 50');
      
      // Resolve the move
      simulateMessage('bestmove e2e4');
      
      const move = await p;
      expect(move).toBe('e2e4');
    });

    it('timeout rejection', async () => {
      vi.useFakeTimers();
      
      const bot = new StockfishBot(createWorker, () => 0.9);
      const game = newGame();
      const p = bot.bestMove(game, 1);
      
      simulateMessage('uciok');
      simulateMessage('readyok');
      
      // Wait for it to post go command
      await Promise.resolve(); // flush microtasks
      
      // Advance time by 50ms (movetime) + 5000ms
      vi.advanceTimersByTime(5050);
      
      await expect(p).rejects.toThrow('timeout');
      
      // Should have posted stop
      expect(postedMessages).toContain('stop');
    });

    it('cancel -> old promise rejects with AbortError and late bestmove is ignored', async () => {
      const bot = new StockfishBot(createWorker, () => 0.9);
      const game = newGame();
      
      const p1 = bot.bestMove(game, 1);
      simulateMessage('uciok');
      simulateMessage('readyok');
      
      await new Promise(r => setTimeout(r, 0)); // wait for it to be running
      
      bot.cancel();
      await expect(p1).rejects.toThrowError(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
      
      expect(postedMessages).toContain('stop');
      
      // late bestmove is ignored (no unhandled rejection or anything)
      simulateMessage('bestmove e2e4');
    });

    it('dispose -> terminate called and later calls reject', async () => {
      const bot = new StockfishBot(createWorker, () => 0.9);
      const game = newGame();
      // Start a search to ensure worker is created
      bot.bestMove(game, 1).catch(() => {});
      bot.dispose();
      
      expect(mockWorker.terminate).toHaveBeenCalled();
      
      await expect(bot.bestMove(game, 1)).rejects.toThrow('disposed');
    });
  });
  describe('StockfishBot response ownership (supervisor race tests)', () => {
    class FakeWorker {
      posted: string[] = [];
      terminated = false;
      private listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
      postMessage(msg: string): void { this.posted.push(msg); }
      terminate(): void { this.terminated = true; }
      addEventListener(type: string, fn: (e: MessageEvent) => void): void { (this.listeners[type] ??= []).push(fn); }
      emit(line: string): void { for (const fn of this.listeners.message ?? []) fn({ data: line } as MessageEvent); }
      fail(): void { for (const fn of this.listeners.error ?? []) fn({} as MessageEvent); }
      ready(): void { this.emit('uciok'); this.emit('readyok'); }
      goCount(): number { return this.posted.filter(m => m.startsWith('go ')).length; }
    }

    let workers: FakeWorker[];
    const factory = () => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; };
    const flush = () => new Promise<void>(r => setTimeout(r, 0));
    const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';

    beforeEach(() => { workers = []; });
    afterEach(() => { vi.useRealTimers(); });

    it('a cancelled search\'s late bestmove never resolves the next search', async () => {
      const bot = new StockfishBot(factory, () => 0.9);
      const p1 = bot.bestMove(newGame(), 4);
      workers[0].ready(); await flush();
      bot.cancel();
      await expect(p1).rejects.toSatisfy(isAbort);
      const p2 = bot.bestMove(newGame(), 4); await flush();
      workers[0].emit('bestmove a2a3'); // late answer to the cancelled search
      workers[0].emit('bestmove e2e4'); // answer to the new search
      await expect(p2).resolves.toBe('e2e4');
    });

    it('a new request supersedes a running one; the stale answer is dropped', async () => {
      const bot = new StockfishBot(factory, () => 0.9);
      const p1 = bot.bestMove(newGame(), 4);
      workers[0].ready(); await flush();
      const p2 = bot.bestMove(newGame(), 4);
      await expect(p1).rejects.toSatisfy(isAbort);
      await flush();
      workers[0].emit('bestmove a2a3');
      workers[0].emit('bestmove d2d4');
      await expect(p2).resolves.toBe('d2d4');
    });

    it('two requests during startup: the first aborts, only one search is started', async () => {
      const bot = new StockfishBot(factory, () => 0.9);
      const p1 = bot.bestMove(newGame(), 4);
      const p2 = bot.bestMove(newGame(), 4);
      workers[0].ready();
      await expect(p1).rejects.toSatisfy(isAbort);
      await flush();
      expect(workers).toHaveLength(1);
      expect(workers[0].goCount()).toBe(1);
      workers[0].emit('bestmove g1f3');
      await expect(p2).resolves.toBe('g1f3');
    });

    it('after a timeout the next request uses a fresh engine and ignores the old one', async () => {
      vi.useFakeTimers();
      const bot = new StockfishBot(factory, () => 0.9);
      const p1 = bot.bestMove(newGame(), 1);
      workers[0].ready(); await vi.advanceTimersByTimeAsync(0);
      const done = expect(p1).rejects.toThrow('timeout');
      await vi.advanceTimersByTimeAsync(5050);
      await done;
      expect(workers[0].terminated).toBe(true);
      const p2 = bot.bestMove(newGame(), 1);
      expect(workers).toHaveLength(2);
      workers[1].ready(); await vi.advanceTimersByTimeAsync(0);
      workers[0].emit('bestmove a2a3'); // old engine, must be ignored
      workers[1].emit('bestmove e2e4');
      await expect(p2).resolves.toBe('e2e4');
    });

    it('dispose while the engine is starting rejects the waiting request', async () => {
      const bot = new StockfishBot(factory, () => 0.9);
      const p1 = bot.bestMove(newGame(), 4);
      bot.dispose();
      await expect(p1).rejects.toThrow('disposed');
      expect(workers[0].terminated).toBe(true);
    });

    it('a startup error does not poison later requests', async () => {
      const bot = new StockfishBot(factory, () => 0.9);
      const p1 = bot.bestMove(newGame(), 4);
      workers[0].fail();
      await expect(p1).rejects.toThrow('engine error');
      const p2 = bot.bestMove(newGame(), 4);
      expect(workers).toHaveLength(2);
      workers[1].ready(); await flush();
      workers[1].emit('bestmove e2e4');
      await expect(p2).resolves.toBe('e2e4');
    });
  });
});
