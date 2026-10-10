import { describe, it, expect } from 'vitest';
import { winPercent, rateMove, moveAccuracy, sideAccuracy, reviewMoves, summarize, whiteScore, PositionEval, RatingInput } from '../../src/app/analysis/review.js';
import { analyzeGame, terminalOf, Searcher } from '../../src/app/analysis/gameAnalyzer.js';
import { reviewKey, loadReview, saveReview, MAX_GAMES, KeyValueStore } from '../../src/app/analysis/reviewCache.js';
import { newGame, playMove, GameState } from '../../src/app/play/game.js';

const sq = (s: string) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
const play = (moves: [string, string][]): { game: GameState; fens: string[] } => {
  let g = newGame();
  const fens = [g.currentFen];
  for (const [a, b] of moves) { g = playMove(g, sq(a), sq(b))!; fens.push(g.currentFen); }
  return { game: g, fens };
};
const line = (uci: string, cp: number, pv: string[] = [uci]) => ({ uci, score: { cp }, pv });

describe('win % and accuracy', () => {
  it('maps engine scores to winning chances', () => {
    expect(winPercent({ cp: 0 })).toBeCloseTo(50, 5);
    expect(winPercent({ cp: 300 })).toBeGreaterThan(70);
    expect(winPercent({ cp: 5000 })).toBe(winPercent({ cp: 1000 })); // clamped
    expect(winPercent({ mate: 3 })).toBe(100);
    expect(winPercent({ mate: -2 })).toBe(0);
    expect(winPercent({ mate: 0 })).toBe(0); // already checkmated
  });
  it('move and side accuracy', () => {
    expect(moveAccuracy(60, 60)).toBeCloseTo(100, 0);
    expect(moveAccuracy(60, 30)).toBeLessThan(30);
    expect(sideAccuracy([])).toBeNull();
    expect(sideAccuracy([100, 100])).toBeCloseTo(100, 0);
    expect(sideAccuracy([100, 0])!).toBeLessThan(50); // one disaster weighs heavily
  });
});

describe('move ratings (ADR-005 thresholds)', () => {
  const base: RatingInput = { bestWin: 60, playedWin: 60, secondWin: 58, playedIsBest: false, sacrifice: false, obvious: false };
  const rows: [string, Partial<RatingInput>, string][] = [
    ['best move', { playedIsBest: true }, 'best'],
    ['only good move', { playedIsBest: true, secondWin: 45 }, 'great'],
    ['only move but an obvious one (capture / reply to check / mate)', { playedIsBest: true, secondWin: 45, obvious: true }, 'best'],
    ['sound sacrifice', { playedIsBest: true, sacrifice: true }, 'brilliant'],
    ['sacrifice in an already won position is not brilliant', { playedIsBest: true, sacrifice: true, bestWin: 99, playedWin: 99, secondWin: 98 }, 'best'],
    ['sacrifice that loses', { sacrifice: true, playedWin: 45 }, 'mistake'],
    ['sacrifice that is the only win in a won position (Qb8+!!)', { playedIsBest: true, sacrifice: true, bestWin: 100, playedWin: 100, secondWin: 60 }, 'brilliant'],
    ['loses 1 %', { playedWin: 59 }, 'excellent'],
    ['loses 3 %', { playedWin: 57 }, 'good'],
    ['loses 7 %', { playedWin: 53 }, 'inaccuracy'],
    ['loses 15 %', { playedWin: 45 }, 'mistake'],
    ['loses 30 %', { playedWin: 30 }, 'blunder'],
  ];
  it.each(rows)('%s', (_n, patch, expected) => {
    expect(rateMove({ ...base, ...patch })).toBe(expected);
  });
});

describe('reviewing a game', () => {
  // 1. f3 e5 2. g4 Qh4#
  const { game, fens } = play([['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]);
  const evals: PositionEval[] = [
    { lines: [line('e2e4', 30), line('d2d4', 28)] },
    { lines: [line('e7e5', 60), line('d7d5', 55)] },   // Black to move: Black is better after f3
    { lines: [line('e1f2', -80), line('b1c3', -90)] }, // White to move after ...e5
    { lines: [{ uci: 'd8h4', score: { mate: 1 }, pv: ['d8h4'] }, line('b8c6', 300)] },
    { lines: [], terminal: 'checkmate' },
  ];
  const reviews = reviewMoves(fens, game.moves, evals, [false, false, false, false]);

  it('rates each move from the mover side', () => {
    expect(reviews.map(r => r.rating)).toEqual(['inaccuracy', 'best', 'blunder', 'best']); // f3 loses ~8 %; mate in one is just Best
    expect(reviews[2].bestSan).toBe('Kf2');
    expect(reviews[3].winAfter).toBe(100);
  });
  it('summarizes accuracy and counts per side', () => {
    const s = summarize(game.moves, reviews);
    expect(s.counts.white.blunder).toBe(1);
    expect(s.counts.black.best).toBe(2);
    expect(s.accuracy.black!).toBeGreaterThan(s.accuracy.white!);
  });
  it('gives the evaluation from White\'s side', () => {
    expect(whiteScore(fens[1], evals[1])).toEqual({ cp: -60 });
    expect(whiteScore(fens[4], evals[4])).toEqual({ mate: 0 }); // White to move and checkmated
  });
  it('names castling as the best move correctly', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const g2 = playMove(newGame(fen), sq('a1'), sq('a2'))!;
    const r = reviewMoves([fen, g2.currentFen], g2.moves, [{ lines: [line('e1g1', 50)] }, { lines: [line('a8a7', 0)] }], [false]);
    expect(r[0].bestSan).toBe('O-O');
  });
});

describe('game analyzer', () => {
  const { fens } = play([['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]);
  it('searches each position in order, skips the finished one, and reports progress', async () => {
    const searched: string[] = [];
    const engine: Searcher = { search: async (fen) => { searched.push(fen); return [line('a2a3', 0)]; } };
    const seen: number[] = [];
    const out = await analyzeGame(engine, fens, { onPosition: i => seen.push(i) });
    expect(searched).toEqual(fens.slice(0, 4));
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(out[4]).toEqual({ lines: [], terminal: 'checkmate' });
    expect(terminalOf('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toBe('draw');
  });
  it('retries a failed search once, then gives up', async () => {
    let calls = 0;
    const flaky: Searcher = { search: async () => { calls++; if (calls === 1) throw new Error('timeout'); return [line('a2a3', 0)]; } };
    await expect(analyzeGame(flaky, fens.slice(0, 1))).resolves.toHaveLength(1);
    const broken: Searcher = { search: async () => { throw new Error('engine error'); } };
    await expect(analyzeGame(broken, fens.slice(0, 1))).rejects.toThrow('engine error');
  });
  it('stops when cancelled', async () => {
    let n = 0;
    const engine: Searcher = { search: async () => { n++; return [line('a2a3', 0)]; } };
    await expect(analyzeGame(engine, fens, { isCancelled: () => n >= 2 })).rejects.toMatchObject({ name: 'AbortError' });
    expect(n).toBe(2);
  });
});

describe('review cache', () => {
  const memory = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } };
  };
  const evals: PositionEval[] = [{ lines: [line('e2e4', 30)] }, { lines: [], terminal: 'draw' }];
  it('round-trips and depends on the game and the depth', () => {
    const store = memory();
    const k = reviewKey('start', ['e2e4'], 14);
    expect(reviewKey('start', ['e2e4'], 16)).not.toBe(k);
    expect(reviewKey('start', ['d2d4'], 14)).not.toBe(k);
    saveReview(store, k, evals);
    expect(loadReview(store, k, 2)).toEqual(evals);
    expect(loadReview(store, k, 3)).toBeNull(); // wrong length
  });
  it('keeps only the most recent games and ignores bad data', () => {
    const store = memory();
    for (let i = 0; i <= MAX_GAMES; i++) saveReview(store, `g${i}`, evals);
    expect(loadReview(store, 'g0', 2)).toBeNull();
    expect(loadReview(store, `g${MAX_GAMES}`, 2)).toEqual(evals);
    store.setItem('rookvex.review.v1:bad', '{"x":1}');
    expect(loadReview(store, 'bad', 2)).toBeNull();
  });
  it('rejects a review saved with a failed search (no lines, not a finished game) and drops it', () => {
    const store = memory();
    store.setItem('rookvex.review.v1:old', JSON.stringify([{ lines: [line('e2e4', 30)] }, { lines: [] }]));
    expect(loadReview(store, 'old', 2)).toBeNull();
    expect(store.data.has('rookvex.review.v1:old')).toBe(false);
    store.setItem('rookvex.review.v1:mate', JSON.stringify([{ lines: [line('e2e4', 30)] }, { lines: [], terminal: 'checkmate' }]));
    expect(loadReview(store, 'mate', 2)).not.toBeNull(); // a finished game needs no lines
  });
});

describe('sacrifice (for Brilliant)', () => {
  it('uses the exchange on the destination square, not other loose pieces', async () => {
    const { isSacrifice } = await import('../../src/app/analysis/review.js');
    const { classifyMove } = await import('../../src/engine/classify.js');
    // Opera Game, 16.Qb8+ Nxb8: the queen is lost on b8 (mate follows, but it is a sacrifice).
    const qb8 = classifyMove('4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 1 16', { from: 'b3', to: 'b8' });
    expect(qb8.ok && isSacrifice(qb8.value)).toBe(true);
    // 10.Nxb5 cxb5 11.Bxb5+: knight for two pawns.
    const nxb5 = classifyMove('rn2kb1r/p3qppp/2p2n2/1p2p1B1/2B1P3/1QN5/PPP2PPP/R3K2R w KQkq - 0 10', { from: 'c3', to: 'b5' });
    expect(nxb5.ok && isSacrifice(nxb5.value)).toBe(true);
    // A pawn sacrifice does not count.
    const pawn = classifyMove('rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2', { from: 'f2', to: 'f4' });
    expect(pawn.ok && isSacrifice(pawn.value)).toBe(false);
    // A quiet developing move is not a sacrifice.
    const nf3 = classifyMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { from: 'g1', to: 'f3' });
    expect(nf3.ok && isSacrifice(nf3.value)).toBe(false);
  });
});
