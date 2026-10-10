/**
 * Runs the engine over every position of a game, one at a time (phase 6).
 * Finished positions (checkmate, stalemate, insufficient material) are not searched.
 */
import { Chess, fen as fenOps } from 'chessops';
import type { PvLine } from '../bot/EngineCheck.js';
import { PositionEval, REVIEW_DEPTH, REVIEW_MULTIPV } from './review.js';

export interface Searcher {
  search(fen: string, multiPv: number, depth: number): Promise<PvLine[]>;
}

export interface AnalyzeOptions {
  depth?: number;
  /** Called as each position is done (in order), e.g. to show ratings while the rest is analysed. */
  onPosition?: (index: number, result: PositionEval) => void;
  /** Checked before each search; true stops the analysis with an AbortError. */
  isCancelled?: () => boolean;
}

const abortError = (): Error => {
  const err = new Error('cancelled');
  err.name = 'AbortError';
  return err;
};

/** Game-over state of a position, if any. */
export const terminalOf = (fen: string): PositionEval['terminal'] | undefined => {
  const setup = fenOps.parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.unwrap());
  if (pos.isErr) return undefined;
  const p = pos.unwrap();
  if (p.isCheckmate()) return 'checkmate';
  if (p.isStalemate() || p.isInsufficientMaterial()) return 'draw';
  return undefined;
};

export const analyzeGame = async (engine: Searcher, fens: string[], opts: AnalyzeOptions = {}): Promise<PositionEval[]> => {
  const depth = opts.depth ?? REVIEW_DEPTH;
  const out: PositionEval[] = [];
  for (let i = 0; i < fens.length; i++) {
    if (opts.isCancelled?.()) throw abortError();
    const terminal = terminalOf(fens[i]);
    let result: PositionEval;
    if (terminal) {
      result = { lines: [], terminal };
    } else {
      let lines: PvLine[];
      try {
        lines = await engine.search(fens[i], REVIEW_MULTIPV, depth);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        if (opts.isCancelled?.()) throw abortError();
        lines = await engine.search(fens[i], REVIEW_MULTIPV, depth); // one retry (a fresh worker after a timeout)
      }
      result = { lines };
    }
    out.push(result);
    opts.onPosition?.(i, result);
  }
  return out;
};
