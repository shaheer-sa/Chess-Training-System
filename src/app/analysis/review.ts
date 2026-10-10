/**
 * Game review (phase 6): move ratings, accuracy and evaluation from engine lines. Pure functions only.
 *
 * Ratings use the loss in winning chances between the best move and the move played, from the mover's side
 * (win % from the engine's centipawns, the formula Lichess uses). Owner-approved thresholds (ADR-005):
 *   Brilliant  best (or within 2 %) and a piece sacrifice (the moved piece is lost on its square); in an already
 *              won position only when it is also the only good move (e.g. Qb8+ in the Opera Game)
 *   Great      the only good move: best, every other move ≥ 10 % worse — and not an obvious one
 *              (captures, replies to check and checkmating moves are just Best)
 *   Best       the engine's top move
 *   Excellent  < 2 %   Good < 5 %   Inaccuracy < 10 %   Mistake < 20 %   Blunder ≥ 20 %
 */
import { Chess, fen as fenOps, parseUci } from 'chessops';
import { makeSan } from 'chessops/san';
import { normalizeMove } from 'chessops/chess';
import type { EngineScore } from '../play/engineVerdict.js';
import type { PvLine } from '../bot/EngineCheck.js';
import type { GameMove } from '../play/game.js';
import type { MoveClassification } from '../../engine/types.js';

export type MoveRating = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const RATING_ORDER: MoveRating[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];

export const REVIEW_DEPTH = 14;
export const REVIEW_MULTIPV = 2;

/** Engine view of one position, from the side to move. `lines` best first; empty for finished positions. */
export interface PositionEval {
  lines: PvLine[];
  /** Set when the game is over in this position (no search needed). */
  terminal?: 'checkmate' | 'draw';
}

/** Winning chances 0–100 for the side the score belongs to. */
export const winPercent = (s: EngineScore): number => {
  if ('mate' in s) return s.mate > 0 ? 100 : 0; // mate 0 = already checkmated
  const cp = Math.max(-1000, Math.min(1000, s.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
};

/** Score of the best line from the side to move (finished positions: mate 0 / draw 0). */
export const positionScore = (p: PositionEval): EngineScore =>
  p.terminal === 'checkmate' ? { mate: 0 } : p.terminal === 'draw' ? { cp: 0 } : p.lines[0]?.score ?? { cp: 0 };

/** Lichess move accuracy from win % before and after (mover's side). */
export const moveAccuracy = (winBefore: number, winAfter: number): number => {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, winBefore - winAfter)) - 3.1669;
  return Math.max(0, Math.min(100, a));
};

/** Side accuracy: average of the arithmetic and harmonic means of move accuracies (simplified Lichess). */
export const sideAccuracy = (moveAccuracies: number[]): number | null => {
  if (moveAccuracies.length === 0) return null;
  const arith = moveAccuracies.reduce((a, b) => a + b, 0) / moveAccuracies.length;
  const harm = moveAccuracies.length / moveAccuracies.reduce((a, b) => a + 1 / Math.max(1, b), 0);
  return (arith + harm) / 2;
};

/** A piece sacrifice: the exchange on the destination square costs the mover material (Nxb5 cxb5, Rxd7 Rxd7, Qb8+ Nxb8). Pawn moves don't count. */
export const isSacrifice = (c: Pick<MoveClassification, 'exchange'>): boolean =>
  !!c.exchange && c.exchange.see < 0 && c.exchange.mover.role !== 'pawn';

export interface RatingInput {
  bestWin: number;
  playedWin: number;
  /** Win % of the second-best move, when there was one. */
  secondWin: number | null;
  playedIsBest: boolean;
  /** The moved piece can be won on its square (see isSacrifice). */
  sacrifice: boolean;
  /** A capture, a reply to check, or checkmate: the only move, but not a hard one to find. */
  obvious: boolean;
}

export const rateMove = (m: RatingInput): MoveRating => {
  const loss = m.playedIsBest ? 0 : Math.max(0, m.bestWin - m.playedWin);
  const onlyMove = m.secondWin !== null && m.bestWin - m.secondWin >= 10;
  if (loss < 2 && m.sacrifice && m.playedWin >= 40 && (m.bestWin < 97 || onlyMove)) return 'brilliant';
  if (m.playedIsBest && !m.obvious && onlyMove) return 'great';
  if (m.playedIsBest) return 'best';
  if (loss < 2) return 'excellent';
  if (loss < 5) return 'good';
  if (loss < 10) return 'inaccuracy';
  if (loss < 20) return 'mistake';
  return 'blunder';
};

export interface MoveReview {
  rating: MoveRating;
  /** Mover's winning chances before (best play) and after the move played. */
  winBefore: number;
  winAfter: number;
  accuracy: number;
  /** The engine's best move in the position before (UCI + SAN) and its line. */
  bestUci: string | null;
  bestSan: string | null;
  bestLine: string[];
  /** Mover's score after the best move, and after the move played. */
  bestScore: EngineScore | null;
  playedScore: EngineScore;
}

const negate = (s: EngineScore): EngineScore => ('mate' in s ? { mate: -s.mate || 0 } : { cp: -s.cp || 0 });

const sanOf = (fen: string, uci: string): string | null => {
  try {
    const pos = Chess.fromSetup(fenOps.parseFen(fen).unwrap()).unwrap();
    const mv = parseUci(uci);
    return mv ? makeSan(pos, normalizeMove(pos, mv)) : null; // castling: e1g1 → king takes rook for chessops
  } catch {
    return null;
  }
};

/**
 * Review every move of a game. `fens[i]` is the position before move i (fens.length = moves.length + 1),
 * `evals[i]` its engine view, `sacrifices[i]` whether move i is a sacrifice (isSacrifice on its square check).
 */
export const reviewMoves = (fens: string[], moves: GameMove[], evals: PositionEval[], sacrifices: boolean[]): MoveReview[] =>
  moves.map((mv, i) => {
    const before = evals[i];
    const after = evals[i + 1];
    const best = before.lines[0];
    const bestScore = best ? best.score : null;
    // The move that checkmates wins outright (negating "mate 0" would lose who was mated).
    const playedScore: EngineScore = after.terminal === 'checkmate' ? { mate: 1 } : negate(positionScore(after));
    const bestWin = bestScore ? winPercent(bestScore) : winPercent(playedScore);
    const playedWin = winPercent(playedScore);
    const playedIsBest = !!best && best.uci === mv.uci;
    const second = before.lines[1];
    const prev = moves[i - 1];
    const obvious = mv.san.includes('x') || mv.san.includes('#') || (!!prev && /[+#]$/.test(prev.san));
    const rating = rateMove({
      bestWin, playedWin, secondWin: second ? winPercent(second.score) : null,
      playedIsBest, sacrifice: !!sacrifices[i], obvious,
    });
    const winBefore = playedIsBest ? playedWin : Math.max(bestWin, playedWin);
    return {
      rating, winBefore, winAfter: playedWin, accuracy: moveAccuracy(winBefore, playedWin),
      bestUci: best?.uci ?? null, bestSan: best ? sanOf(fens[i], best.uci) : null, bestLine: best?.pv ?? [],
      bestScore, playedScore,
    };
  });

export interface ReviewSummary {
  accuracy: { white: number | null; black: number | null };
  counts: { white: Record<MoveRating, number>; black: Record<MoveRating, number> };
}

const zeroCounts = (): Record<MoveRating, number> =>
  ({ brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 });

export const summarize = (moves: GameMove[], reviews: MoveReview[]): ReviewSummary => {
  const acc = { white: [] as number[], black: [] as number[] };
  const counts = { white: zeroCounts(), black: zeroCounts() };
  reviews.forEach((r, i) => {
    const side = moves[i].color;
    acc[side].push(r.accuracy);
    counts[side][r.rating]++;
  });
  return { accuracy: { white: sideAccuracy(acc.white), black: sideAccuracy(acc.black) }, counts };
};

/** Score from White's side for the evaluation bar/graph. */
export const whiteScore = (fen: string, p: PositionEval): EngineScore => {
  const s = positionScore(p);
  return fen.split(' ')[1] === 'w' ? s : negate(s);
};
