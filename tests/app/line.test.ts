import { describe, it, expect } from 'vitest';
import { newLine, pathOf, stateAt, playOnLine, goTo, backToGame, isExploring, lineFromPgn, pgnFromGame, START_FEN } from '../../src/app/analysis/line.js';
import { newGame, playMove } from '../../src/app/play/game.js';

const sq = (s: string) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
const play = (l: ReturnType<typeof newLine>, from: string, to: string) => {
  const r = playOnLine(l, sq(from), sq(to));
  if (!r) throw new Error(`illegal ${from}${to}`);
  return r;
};

describe('analysis line (pure)', () => {
  it('single position: moves for both sides extend the line; stepping back keeps them', () => {
    let l = newLine(START_FEN);
    l = play(l, 'e2', 'e4');
    l = play(l, 'e7', 'e5');
    expect(pathOf(l).map(m => m.san)).toEqual(['e4', 'e5']);
    expect(isExploring(l)).toBe(false); // nothing to return to
    l = goTo(l, 1);
    expect(stateAt(l).currentFen.split(' ')[1]).toBe('b');
    expect(pathOf(l)).toHaveLength(2);
    l = play(l, 'c7', 'c5'); // a different move replaces the rest
    expect(pathOf(l).map(m => m.san)).toEqual(['e4', 'c5']);
  });

  it('a loaded game: following the next game move stays on the game; another move starts your line', () => {
    const r = lineFromPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *');
    if (!r.ok) throw new Error(r.error);
    let l = goTo(r.line, 2);
    l = play(l, 'g1', 'f3'); // the game move
    expect(l.branchAt).toBeNull();
    expect(l.cursor).toBe(3);
    l = play(l, 'g8', 'f6'); // not the game move (Nc6)
    expect(isExploring(l)).toBe(true);
    expect(pathOf(l).map(m => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nf6']);
    l = backToGame(l);
    expect(l.cursor).toBe(3);
    expect(pathOf(l).map(m => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  });

  it('illegal moves are refused', () => {
    expect(playOnLine(newLine(START_FEN), sq('e2'), sq('e5'))).toBeNull();
  });

  it('reads castling, promotion and a FEN start from PGN', () => {
    const r = lineFromPgn('[FEN "4k3/P7/8/8/8/8/8/4K2R w K - 0 1"]\n[SetUp "1"]\n\n1. O-O Kd7 2. a8=Q *');
    if (!r.ok) throw new Error(r.error);
    expect(r.line.game.map(m => m.uci)).toEqual(['e1g1', 'e8d7', 'a7a8q']);
    expect(stateAt(goTo(r.line, 3)).currentFen.startsWith('Q7/3k4')).toBe(true);
  });

  it('explains a bad PGN instead of failing silently', () => {
    const bad = lineFromPgn('1. e4 e5 2. Ke3 *');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("Move 2. Ke3 isn't legal in this game.");
    expect(lineFromPgn('').ok).toBe(false);
  });

  it('a played game round-trips through PGN', () => {
    let g = newGame();
    for (const [a, b] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) g = playMove(g, sq(a), sq(b))!;
    const pgn = pgnFromGame(g, { white: 'You', black: 'Computer' }, new Date(2026, 9, 10));
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).toContain('[Date "2026.10.10"]');
    expect(pgn.trim().endsWith('1. f3 e5 2. g4 Qh4# 0-1')).toBe(true);
    const back = lineFromPgn(pgn);
    expect(back.ok && back.line.game.map(m => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(back.ok && back.line.result).toBe('0-1');
  });
});

describe('site settings (pure)', () => {
  it('reads saved settings and falls back to defaults on bad data', async () => {
    const { loadSettings, DEFAULT_SETTINGS } = await import('../../src/app/settings.js');
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings('{bad')).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(JSON.stringify({ coordinates: false, reduceMotion: 'yes' }))).toEqual({ ...DEFAULT_SETTINGS, coordinates: false });
  });
});

describe('PGN errors use the real move numbers', () => {
  it('numbers the failing move from the FEN counters (Black to move at move 23)', () => {
    const r = lineFromPgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/R3K3 b - - 0 23"]\n\n23... Kd7 24. Ra8 Kxa8 *');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Move 24... Kxa8 isn't legal in this game.");
  });
});
