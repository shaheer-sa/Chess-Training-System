/**
 * Engine check (phase 5C): Stockfish verifies the square-safety labels.
 * Pure logic only — the worker lives in src/app/bot/EngineCheck.ts.
 *
 * Square safety only looks at the landing square. The engine check looks at the whole position, once per turn,
 * and can add exactly two things on top of the square-safety label (it never removes information):
 *  - "danger": the square check says Safe / Even trade, but the engine sees the mover losing ≥ 2 pawns more than
 *    the square check predicts (discovered attacks, king exposure, mate threats…).
 *  - "tactic": the square check says Even trade / Loses material / Unclear, but the move is one of the strongest
 *    and really gains ≥ 2 pawns that the square check cannot see.
 * While the mover has a forced checkmate in ≤ 5, nothing is added at all (the mate banner says it instead), so the
 * board never points at the solution.
 */
import type { MoveClassification } from '../../engine/types.js';

export type EngineScore = { cp: number } | { mate: number };

/** uci → score, from the point of view of the side to move. */
export type EngineScores = Record<string, EngineScore>;

export const THRESHOLD_CP = 200;
export const MATE_BANNER_MAX = 5;
const TACTIC_NEAR_BEST_CP = 50;

const VALUES: Record<string, number> = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 0 };

export const scoreValue = (s: EngineScore): number =>
  'mate' in s ? (s.mate > 0 ? 100000 - 100 * s.mate : -100000 - 100 * s.mate) : s.cp;

/** Material balance in centipawns from the side to move's point of view. */
export const materialForSideToMove = (fen: string): number => {
  const [board, turn] = fen.split(' ');
  let white = 0;
  let black = 0;
  for (const ch of board) {
    const v = VALUES[ch.toLowerCase()];
    if (v === undefined) continue;
    if (ch === ch.toUpperCase()) white += v;
    else black += v;
  }
  return turn === 'w' ? white - black : black - white;
};

export interface TurnContext {
  /** Forced mate for the side to move in N moves (1…5), else null. */
  mateIn: number | null;
  best: number;
  /** Material balance now (cp, side to move). */
  material: number;
  /** Median engine score over all moves: the engine's view of the position before anything special happens. */
  baseline: number;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const turnContext = (fen: string, scores: EngineScores): TurnContext | null => {
  const entries = Object.values(scores);
  if (entries.length === 0) return null;
  const values = entries.map(scoreValue);
  const mates = entries.filter((s): s is { mate: number } => 'mate' in s && s.mate > 0).map(s => s.mate);
  const mateIn = mates.length > 0 && Math.min(...mates) <= MATE_BANNER_MAX ? Math.min(...mates) : null;
  // Most moves are quiet, so the median score is the engine's view of the position before anything special
  // happens. Clamp mates so they cannot drag the median.
  const clamped = values.map(v => Math.max(-3000, Math.min(3000, v)));
  return { mateIn, best: Math.max(...values), material: materialForSideToMove(fen), baseline: median(clamped) };
};

export type Verdict =
  | { kind: 'none' }
  | { kind: 'danger'; mateAgainst: boolean }
  | { kind: 'tactic' };

export const engineVerdict = (
  base: Pick<MoveClassification, 'label' | 'netMaterial'>,
  score: EngineScore | undefined,
  ctx: TurnContext | null
): Verdict => {
  if (!score || !ctx || ctx.mateIn !== null) return { kind: 'none' };
  const v = scoreValue(score);
  const predicted = ctx.baseline + base.netMaterial;
  const mateAgainst = 'mate' in score && score.mate < 0;

  if (base.label === 'safe' || base.label === 'even_trade') {
    if (mateAgainst || (v <= predicted - THRESHOLD_CP && v <= ctx.best - THRESHOLD_CP)) {
      return { kind: 'danger', mateAgainst };
    }
  }
  // "Safe" stays Safe even when the engine likes the move more: Tactic is for moves the square check undersells.
  if (
    base.label !== 'safe' &&
    v - predicted >= THRESHOLD_CP &&
    v - ctx.baseline >= THRESHOLD_CP &&
    v - ctx.material >= THRESHOLD_CP && // a real gain over the material on the board, not just the best defence
    v >= ctx.best - TACTIC_NEAR_BEST_CP
  ) {
    return { kind: 'tactic' };
  }
  return { kind: 'none' };
};
