/**
 * Engine review for the line shown in Analyze (phase 6).
 * One engine worker evaluates positions one at a time: the position on the board first (so the evaluation bar
 * answers right away), then the rest of the line from the start. Moves get their rating as soon as the positions
 * before and after them are known. A finished game review is saved in the browser and reused next time.
 *
 * Only successful searches count as evaluated. A failed position is retried once more later; after that it is left
 * out (the review says so and offers a retry) and the game is never saved while any position is missing.
 * A search for a position that is no longer wanted (another game, another source) is stopped at once.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EngineClient } from '../engine/EngineClient.js';
import { EngineCheck, PvLine } from '../bot/EngineCheck.js';
import type { GameMove } from '../play/game.js';
import { terminalOf } from './gameAnalyzer.js';
import { MoveReview, PositionEval, REVIEW_DEPTH, REVIEW_MULTIPV, isSacrifice, reviewMove } from './review.js';
import { loadReview, reviewKey, saveReview } from './reviewCache.js';

export interface Searcher {
  search(fen: string, multiPv: number, depth: number): Promise<PvLine[]>;
  /** Stop the search in progress (its promise rejects). */
  cancel(): void;
  dispose(): void;
}

/** Attempts per position before it is left out. */
export const MAX_ATTEMPTS = 2;

export interface ReviewProgress {
  reviews: (MoveReview | undefined)[];
  /** Positions evaluated so far / total. */
  done: number;
  total: number;
  /** Positions that could not be evaluated (after retries); the review is stuck on them until `retry`. */
  missing: number;
}

export interface LineReview extends ReviewProgress {
  /** Engine view per position of the path (index 0 = start). */
  evals: (PositionEval | undefined)[];
  /** The loaded game's own moves (for the game summary, which stays put while you explore). */
  game: ReviewProgress | null;
  /** Try the positions that failed again. */
  retry: () => void;
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
  const attemptsRef = useRef(new Map<string, number>());
  const sacRef = useRef(new Map<string, boolean>());
  const [version, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);
  const engineRef = useRef<Searcher | null>(null);
  /** The position being searched, and a token that changes whenever results in flight must be ignored. */
  const busyRef = useRef<string | null>(null);
  const tokenRef = useRef(0);
  const aliveRef = useRef(false);
  const wanted = game ? [...fens, ...game.fens.filter(f => !fens.includes(f))] : fens;
  const wantedRef = useRef<{ fens: string[]; current: string | null }>({ fens: wanted, current });
  wantedRef.current = { fens: wanted, current };
  const createRef = useRef(createSearcher);
  createRef.current = createSearcher;

  // A saved review of this game fills everything at once.
  const gameKey = game ? reviewKey(game.startFen, game.ucis, REVIEW_DEPTH) : null;
  useEffect(() => {
    if (!game || !gameKey) return;
    const store = storage();
    if (!store) return;
    const cached = loadReview(store, gameKey, game.ucis.length + 1);
    if (!cached || game.fens.length !== cached.length) return;
    game.fens.forEach((f, i) => evalsRef.current.set(f, cached[i]));
    bump();
  }, [gameKey]);

  const searchable = (f: string) => !evalsRef.current.has(f) && (attemptsRef.current.get(f) ?? 0) < MAX_ATTEMPTS;

  const pump = useRef<() => void>(() => undefined);
  pump.current = () => {
    if (!aliveRef.current) return;
    const { fens: want, current: cur } = wantedRef.current;
    // Stop a search nobody needs any more (another game or source), so the new position goes first.
    if (busyRef.current !== null) {
      if (busyRef.current === cur || want.includes(busyRef.current)) return;
      tokenRef.current++;
      busyRef.current = null;
      engineRef.current?.cancel();
    }
    const next = cur && searchable(cur) ? cur : want.find(searchable);
    if (!next) return;
    const terminal = terminalOf(next);
    if (terminal) {
      evalsRef.current.set(next, { lines: [], terminal });
      bump();
      pump.current();
      return;
    }
    const token = ++tokenRef.current;
    busyRef.current = next;
    if (!engineRef.current) {
      const make = createRef.current;
      engineRef.current = make ? make() : new EngineCheck();
    }
    const engine = engineRef.current;
    engine.search(next, REVIEW_MULTIPV, REVIEW_DEPTH).then(
      lines => {
        if (token !== tokenRef.current) return; // stopped or unmounted
        if (lines.length > 0) evalsRef.current.set(next, { lines });
        else attemptsRef.current.set(next, (attemptsRef.current.get(next) ?? 0) + 1);
      },
      () => {
        if (token !== tokenRef.current) return;
        attemptsRef.current.set(next, (attemptsRef.current.get(next) ?? 0) + 1);
        // A failed engine may be stuck: start a fresh one for the next position.
        engine.dispose();
        if (engineRef.current === engine) engineRef.current = null;
      },
    ).finally(() => {
      if (token !== tokenRef.current) return;
      busyRef.current = null;
      bump();
      pump.current();
    });
  };

  useEffect(() => { pump.current(); });

  // Mount / unmount (safe when React runs setup → cleanup → setup, as Strict Mode does in development).
  useEffect(() => {
    aliveRef.current = true;
    pump.current();
    return () => {
      aliveRef.current = false;
      tokenRef.current++;
      busyRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Sacrifice check for each move (square check of the moved piece), needed for Brilliant.
  useEffect(() => {
    const check = (fs: string[], ms: GameMove[]) => ms.forEach((mv, i) => {
      const key = `${fs[i]}|${mv.uci}`;
      if (!fs[i] || sacRef.current.has(key)) return;
      sacRef.current.set(key, false);
      engineClient.classifyMove(fs[i], { from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: undefined } as never)
        .then(res => { if (res.ok) sacRef.current.set(key, isSacrifice(res.value)); if (aliveRef.current) bump(); })
        .catch(() => undefined);
    });
    check(fens, moves);
    if (game) check(game.fens, game.moves);
  }, [engineClient, fens, moves, game]);

  const retry = useCallback(() => {
    attemptsRef.current.clear();
    bump();
  }, []);

  const result = useMemo<LineReview>(() => {
    const rate = (fs: string[], ms: GameMove[]) => {
      const evals = fs.map(f => evalsRef.current.get(f));
      const reviews = ms.map((mv, i) => {
        const b = evals[i], a = evals[i + 1];
        if (!b || !a) return undefined;
        return reviewMove(fs[i], mv, ms[i - 1], b, a, sacRef.current.get(`${fs[i]}|${mv.uci}`) ?? false);
      });
      const missing = fs.filter(f => !evalsRef.current.has(f) && (attemptsRef.current.get(f) ?? 0) >= MAX_ATTEMPTS).length;
      return { evals, reviews, done: evals.filter(Boolean).length, total: fs.length, missing };
    };
    const line = rate(fens, moves);
    const g = game ? rate(game.fens, game.moves) : null;
    return {
      reviews: line.reviews, evals: line.evals, done: line.done, total: line.total, missing: line.missing,
      game: g && { reviews: g.reviews, done: g.done, total: g.total, missing: g.missing },
      retry,
    };
  }, [fens, moves, game, version, retry]);

  // Save a finished game review (once per game), only when every position was really evaluated.
  const savedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!game || !gameKey || savedRef.current === gameKey) return;
    const gameEvals = game.fens.map(f => evalsRef.current.get(f));
    if (gameEvals.length !== game.ucis.length + 1) return;
    if (!gameEvals.every((e): e is PositionEval => !!e && (e.lines.length > 0 || !!e.terminal))) return;
    const store = storage();
    if (store) saveReview(store, gameKey, gameEvals as PositionEval[]);
    savedRef.current = gameKey;
  }, [version, gameKey]);

  return result;
};
