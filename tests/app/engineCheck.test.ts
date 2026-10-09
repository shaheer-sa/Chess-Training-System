import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { engineVerdict, turnContext, materialForSideToMove, scoreValue, EngineScores } from '../../src/app/play/engineVerdict.js';
import { EngineCheck, parseInfoLines } from '../../src/app/bot/EngineCheck.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('engineVerdict (pure)', () => {
  it('materialForSideToMove is from the side to move', () => {
    expect(materialForSideToMove(START)).toBe(0);
    expect(materialForSideToMove('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')).toBe(900);
    expect(materialForSideToMove('4k3/8/8/8/8/8/8/3QK3 b - - 0 1')).toBe(-900);
  });

  it('scoreValue orders mates above any cp score', () => {
    expect(scoreValue({ mate: 1 })).toBeGreaterThan(scoreValue({ mate: 3 }));
    expect(scoreValue({ mate: 3 })).toBeGreaterThan(scoreValue({ cp: 5000 }));
    expect(scoreValue({ mate: -1 })).toBeLessThan(scoreValue({ mate: -4 }));
    expect(scoreValue({ mate: -4 })).toBeLessThan(scoreValue({ cp: -5000 }));
  });

  // Quiet position: median ≈ 20, best 60.
  const quiet: EngineScores = { a2a3: { cp: 10 }, b2b3: { cp: 20 }, c2c3: { cp: 25 }, d2d4: { cp: 60 }, g2g4: { cp: -280 }, e2e4: { cp: 55 } };
  const ctx = turnContext(START, quiet);

  type Row = [string, 'safe' | 'even_trade' | 'loses_material' | 'unclear', number, keyof typeof quiet | string, EngineScores | null, string];
  const rows: Row[] = [
    ['safe + engine agrees', 'safe', 0, 'a2a3', null, 'none'],
    ['safe + engine sees a big loss (≥2 pawns below prediction and below best)', 'safe', 0, 'g2g4', null, 'danger'],
    ['even trade + engine sees a big loss', 'even_trade', 0, 'g2g4', null, 'danger'],
    ['loses material + engine agrees it loses', 'loses_material', -300, 'g2g4', null, 'none'],
    ['loses material but engine says it is the best move and gains ≥2 pawns → tactic', 'loses_material', -300, 'x', { a2a3: { cp: 10 }, b2b3: { cp: 20 }, c2c3: { cp: 25 }, x: { cp: 400 } }, 'tactic'],
    ['even trade but engine says best and +2 pawns → tactic', 'even_trade', 0, 'x', { a2a3: { cp: 10 }, b2b3: { cp: 20 }, c2c3: { cp: 25 }, x: { cp: 330 } }, 'tactic'],
    ['safe is never upgraded to tactic', 'safe', 0, 'x', { a2a3: { cp: 10 }, b2b3: { cp: 20 }, c2c3: { cp: 25 }, x: { cp: 900 } }, 'none'],
    ['gain is real but not near the best move → no tactic', 'loses_material', -300, 'x', { a2a3: { cp: 10 }, b2b3: { cp: 20 }, y: { cp: 900 }, x: { cp: 400 } }, 'none'],
    ['allowing mate is always danger for safe/even trade', 'safe', 0, 'x', { a2a3: { cp: 10 }, b2b3: { cp: 20 }, x: { mate: -2 } }, 'danger'],
    ['mate for the mover ≤5 available → nothing is added anywhere', 'safe', 0, 'g2g4', { a2a3: { cp: 10 }, g2g4: { cp: -400 }, m: { mate: 3 } }, 'none'],
  ];
  it.each(rows)('%s', (_name, label, net, uci, scores, expected) => {
    const s = scores ?? quiet;
    const c = scores ? turnContext(START, s) : ctx;
    expect(engineVerdict({ label, netMaterial: net }, s[uci], c).kind).toBe(expected);
  });

  it('turnContext reports mate in N only up to 5', () => {
    expect(turnContext(START, { a: { cp: 0 }, b: { mate: 3 } })?.mateIn).toBe(3);
    expect(turnContext(START, { a: { cp: 0 }, b: { mate: 6 } })?.mateIn).toBeNull();
    expect(turnContext(START, { a: { cp: 0 }, b: { mate: -2 } })?.mateIn).toBeNull();
    expect(turnContext(START, {})).toBeNull();
  });

  it('no score or no context → none', () => {
    expect(engineVerdict({ label: 'safe', netMaterial: 0 }, undefined, ctx).kind).toBe('none');
    expect(engineVerdict({ label: 'safe', netMaterial: 0 }, { cp: -900 }, null).kind).toBe('none');
  });
});

describe('EngineCheck (fake worker)', () => {
  class FakeWorker {
    posted: string[] = [];
    terminated = false;
    private listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
    postMessage(msg: string): void { this.posted.push(msg); }
    terminate(): void { this.terminated = true; }
    addEventListener(type: string, fn: (e: MessageEvent) => void): void { (this.listeners[type] ??= []).push(fn); }
    emit(line: string): void { for (const fn of this.listeners.message ?? []) fn({ data: line } as MessageEvent); }
    ready(): void { this.emit('uciok'); this.emit('readyok'); }
  }
  let workers: FakeWorker[];
  const factory = () => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; };
  const flush = () => new Promise<void>(r => setTimeout(r, 0));
  const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';
  beforeEach(() => { workers = []; });
  afterEach(() => { vi.useRealTimers(); });

  it('parseInfoLines reads cp and mate scores keyed by first pv move', () => {
    expect(parseInfoLines([
      'info depth 10 seldepth 12 multipv 1 score cp 35 nodes 1 pv e2e4 e7e5',
      'info depth 10 multipv 2 score mate -2 nodes 1 pv g2g4 d8h4',
    ])).toEqual({ e2e4: { cp: 35 }, g2g4: { mate: -2 } });
  });

  it('sends MultiPV = move count and depth, keeps the last line per multipv, ignores bound lines', async () => {
    const ec = new EngineCheck(factory);
    const p = ec.check(START, 20);
    workers[0].ready(); await flush();
    expect(workers[0].posted.slice(-3)).toEqual(['setoption name MultiPV value 20', `position fen ${START}`, 'go depth 10']);
    workers[0].emit('info depth 9 multipv 1 score cp 10 pv e2e4');
    workers[0].emit('info depth 10 multipv 1 score cp 40 pv e2e4');
    workers[0].emit('info depth 10 multipv 1 score cp 90 upperbound pv e2e4');
    workers[0].emit('info depth 10 multipv 2 score cp 20 pv d2d4');
    workers[0].emit('bestmove e2e4');
    await expect(p).resolves.toEqual({ e2e4: { cp: 40 }, d2d4: { cp: 20 } });
  });

  it("a cancelled check's late lines and bestmove never reach the next check", async () => {
    const ec = new EngineCheck(factory);
    const p1 = ec.check(START, 20);
    workers[0].ready(); await flush();
    const p2 = ec.check(START, 20);
    await expect(p1).rejects.toSatisfy(isAbort);
    await flush();
    workers[0].emit('info depth 10 multipv 1 score cp -999 pv a2a3'); // old search
    workers[0].emit('bestmove a2a3');                                   // old search ends
    workers[0].emit('info depth 10 multipv 1 score cp 33 pv e2e4');   // new search
    workers[0].emit('bestmove e2e4');
    await expect(p2).resolves.toEqual({ e2e4: { cp: 33 } });
  });

  it('timeout discards the worker; the next check starts a fresh one', async () => {
    vi.useFakeTimers();
    const ec = new EngineCheck(factory);
    const p1 = ec.check(START, 20);
    workers[0].ready(); await vi.advanceTimersByTimeAsync(0);
    const done = expect(p1).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(15001);
    await done;
    expect(workers[0].terminated).toBe(true);
    const p2 = ec.check(START, 20);
    expect(workers).toHaveLength(2);
    workers[1].ready(); await vi.advanceTimersByTimeAsync(0);
    workers[1].emit('info depth 10 multipv 1 score cp 5 pv e2e4');
    workers[1].emit('bestmove e2e4');
    await expect(p2).resolves.toEqual({ e2e4: { cp: 5 } });
  });

  it('dispose rejects a waiting check and terminates the worker', async () => {
    const ec = new EngineCheck(factory);
    const p = ec.check(START, 20);
    ec.dispose();
    await expect(p).rejects.toThrow('disposed');
    expect(workers[0].terminated).toBe(true);
  });
});
