/**
 * Engine review for the line shown in Analyze (phase 6).
 * One engine worker evaluates positions one at a time: the position on the board first (so the evaluation bar
 * answers right away), then the rest of the line from the start. Moves get their rating as soon as the positions
 * before and after them are known. A finished game review is saved in the browser and reused next time.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { EngineClient } from '../engine/EngineClient.js';
import { EngineCheck, PvLine } from '../bot/EngineCheck.js';
import type { GameMove } from '../play/game.js';
import { terminalOf } from './gameAnalyzer.js';
import { MoveReview, PositionEval, REVIEW_DEPTH, REVIEW_MULTIPV, isSacrifice, reviewMove } from './review.js';
import { loadReview, reviewKey, saveReview } from './reviewCache.js';

export interface Searcher {
  search(fen: string, multiPv: number, depth: number): Promise<PvLine[]>;
  dispose(): void;
}

export interface LineReview {
  /** Rating per move of the path (undefined while not known yet). */
  reviews: (MoveReview | undefined)[];
  /** Engine view per position of the path (index 0 = start). */
  evals: (PositionEval | undefined)[];
  /** Positions of the path evaluated so far / total. */
  done: number;
  total: number;
  failed: boolean;
  /** The loaded game's own moves (for the game summary, which stays put while you explore). */
  game: { reviews: (MoveReview | undefined)[]; done: number; total: number } | null;
}

const storage = (): Storage | null => { try { return localStorage; } catch { return null; } };

export const useLineReview = (
  engineClient: EngineClient,
  fens: string[],
  moves: GameMove[],
  current: string | null,
  /** The loaded game (PGN): its positions are all reviewed (even while exploring) and the result is saved. */
  game: { startFen: string; ucis: string[]; fens: string[]; moves: GameMove[] } | null,
  createSearcher: (() => Searcher) | undefined = undefined,
): LineReview => {
  const evalsRef = useRef(new Map<string, PositionEval>());
  const sacRef = useRef(new Map<string, boolean>());
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const engineRef = useRef<Searcher | null>(null);
  const busyRef = useRef(false);
  const wanted = game ? [...fens, ...game.fens.filter(f => !fens.includes(f))] : fens;
  const wantedRef = useRef<{ fens: string[]; current: string | null }>({ fens: wanted, current });
  wantedRef.current = { fens: wanted, current };
  const aliveRef = useRef(true);

  // A saved review of this game fills everything at once.
  const gameKey = game ? reviewKey(game.startFen, game.ucis, REVIEW_DEPTH) : null;
  useEffect(() => {
    if (!game || !gameKey) return;
    const store = storage();
    if (!store) return;
    const cached = loadReview(store, gameKey, game.ucis.length + 1);
    if (!cached) return;
    if (game.fens.length !== cached.length) return;
    game.fens.forEach((f, i) => evalsRef.current.set(f, cached[i]));
    setVersion(v => v + 1);
  }, [gameKey]);

  const pump = useRef<() => void>(() => undefined);
  pump.current = () => {
    if (busyRef.current || !aliveRef.current) return;
    const { fens: want, current: cur } = wantedRef.current;
    const evals = evalsRef.current;
    const next = cur && !evals.has(cur) ? cur : want.find(f => !evals.has(f));
    if (!next) return;
    const terminal = terminalOf(next);
    if (terminal) {
      evals.set(next, { lines: [], terminal });
      setVersion(v => v + 1);
      pump.current();
      return;
    }
    busyRef.current = true;
    if (!engineRef.current) engineRef.current = createSearcher ? createSearcher() : new EngineCheck();
    engineRef.current.search(next, REVIEW_MULTIPV, REVIEW_DEPTH).then(
      lines => { evals.set(next, { lines }); },
      () => { evals.set(next, { lines: [] }); setFailed(true); }, // skip it rather than retry forever
    ).finally(() => {
      busyRef.current = false;
      if (!aliveRef.current) return;
      setVersion(v => v + 1);
      pump.current();
    });
  };

  useEffect(() => { pump.current(); });

  useEffect(() => () => {
    aliveRef.current = false;
    engineRef.current?.dispose();
    engineRef.current = null;
  }, []);

  // Sacrifice check for each move (square check of the moved piece), needed for Brilliant.
  useEffect(() => {
    let live = true;
    const check = (fs: string[], ms: GameMove[]) => ms.forEach((mv, i) => {
      const key = `${fs[i]}|${mv.uci}`;
      if (!fs[i] || sacRef.current.has(key)) return;
      sacRef.current.set(key, false);
      engineClient.classifyMove(fs[i], { from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: undefined } as never)
        .then(res => { if (res.ok) sacRef.current.set(key, isSacrifice(res.value)); if (live) setVersion(v => v + 1); })
        .catch(() => undefined);
    });
    check(fens, moves);
    if (game) check(game.fens, game.moves);
    return () => { live = false; };
  }, [engineClient, fens, moves, game]);

  const result = useMemo<LineReview>(() => {
    const known = (e: PositionEval | undefined): e is PositionEval => !!e && (e.lines.length > 0 || !!e.terminal);
    const rate = (fs: string[], ms: GameMove[]) => {
      const evals = fs.map(f => evalsRef.current.get(f));
      const reviews = ms.map((mv, i) => {
        const b = evals[i], a = evals[i + 1];
        if (!known(b) || !known(a)) return undefined;
        return reviewMove(fs[i], mv, ms[i - 1], b, a, sacRef.current.get(`${fs[i]}|${mv.uci}`) ?? false);
      });
      return { evals, reviews, done: evals.filter(Boolean).length, total: fs.length };
    };
    const line = rate(fens, moves);
    const g = game ? rate(game.fens, game.moves) : null;
    return { reviews: line.reviews, evals: line.evals, done: line.done, total: line.total, failed, game: g && { reviews: g.reviews, done: g.done, total: g.total } };
  }, [fens, moves, game, version, failed]);

  // Save a finished game review (once per game).
  const savedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!game || !gameKey || savedRef.current === gameKey) return;
    const gameEvals = game.fens.map(f => evalsRef.current.get(f));
    if (gameEvals.length === game.ucis.length + 1 && gameEvals.every(Boolean)) {
      const store = storage();
      if (store) saveReview(store, gameKey, gameEvals as PositionEval[]);
      savedRef.current = gameKey;
    }
  }, [version, gameKey]);

  return result;
};
