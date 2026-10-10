/**
 * Game review (phase 6): move ratings, accuracy and evaluation from engine lines. Pure functions only.
 *
 * Ratings use the loss in winning chances between the best move and the move played, from the mover's side
 * (win % from the engine's centipawns, the formula Lichess uses). Owner-approved thresholds (ADR-005):
 *   Brilliant  a piece sacrifice (the moved piece is lost on its square) within 3 % of the best move; in an already
 *              won position only when it is also the only good move (e.g. Qb8+ in the Opera Game)
 *   Great      the only good move: best, every other move ≥ 10 % worse — and not an obvious one
 *              (captures, replies to check and checkmating moves are just Best)
 *   Best       the engine's top move
 *   Excellent  < 2 %   Good < 5 %   Inaccuracy < 10 %   Mistake < 20 %   Blunder ≥ 20 %
 */
import { Chess, Role, fen as fenOps, parseUci } from 'chessops';
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

/**
 * A sound sacrifice may cost up to this much winning chance against the engine's top move and still be Brilliant
 * (e.g. 8.Rxg4!, a deflection: +2.3 against +2.6 for the best move at depth 14).
 */
export const BRILLIANT_MAX_LOSS = 3;

export const rateMove = (m: RatingInput): MoveRating => {
  const loss = m.playedIsBest ? 0 : Math.max(0, m.bestWin - m.playedWin);
  const onlyMove = m.secondWin !== null && m.bestWin - m.secondWin >= 10;
  if (loss < BRILLIANT_MAX_LOSS && m.sacrifice && m.playedWin >= 40 && (m.bestWin < 97 || onlyMove)) return 'brilliant';
  if (m.playedIsBest && !m.obvious && onlyMove) return 'great';
  if (m.playedIsBest) return 'best';
  if (loss < 2) return 'excellent';
  if (loss < 5) return 'good';
  if (loss < 10) return 'inaccuracy';
  if (loss < 20) return 'mistake';
  return 'blunder';
};

/** What the opponent can do after a bad move: their best reply, and what it wins along the engine line. */
export interface Threat {
  uci: string;
  san: string;
  /** The opponent's line in SAN, up to the point where the material count settles (at most 8 moves). */
  line: string[];
  /** The opponent forces checkmate in this many moves. */
  mateIn: number | null;
  /** What the line wins from the mover ("a pawn", "a piece", "the exchange", "a rook", "your queen", …), if anything. */
  wins: string | null;
}

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
  /** The move played was the engine's top move. */
  playedIsBest: boolean;
  /** The piece that moved (for the explanation of a sacrifice). */
  movedRole: Role | null;
  /** Set for inaccuracies, mistakes and blunders when the engine has a reply. */
  threat: Threat | null;
  /** Opening theory: the move keeps the game in the opening book (the opening's name when known). */
  book?: { name: string | null };
}

/**
 * A move that keeps the game in the opening book is Best: at review depth the engine can't tell sound opening
 * moves apart (1.e4 vs 1.d4). Only moves that the engine thinks lose < 5 % count; dubious book lines keep their rating.
 */
export const withBook = (r: MoveReview, name: string | null): MoveReview =>
  r.rating === 'best' || r.rating === 'excellent' || r.rating === 'good'
    ? { ...r, rating: 'best', accuracy: 100, book: { name } }
    : r;

const negate = (s: EngineScore): EngineScore => ('mate' in s ? { mate: -s.mate || 0 } : { cp: -s.cp || 0 });

/** SAN of a UCI move in a position (null if it can't be read). */
export const sanOfUci = (fen: string, uci: string): string | null => {
  try {
    const pos = Chess.fromSetup(fenOps.parseFen(fen).unwrap()).unwrap();
    const mv = parseUci(uci);
    return mv ? makeSan(pos, normalizeMove(pos, mv)) : null; // castling: e1g1 → king takes rook for chessops
  } catch {
    return null;
  }
};

const ROLE_VALUE: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };

const parsePos = (fen: string): Chess | null => {
  try { return Chess.fromSetup(fenOps.parseFen(fen).unwrap()).unwrap(); } catch { return null; }
};

/** Name what a line wins, from the losing side's point of view. */
export const describeWin = (lost: Role[], gained: Role[]): string | null => {
  const value = (rs: Role[]) => rs.reduce((a, r) => a + ROLE_VALUE[r], 0);
  const net = value(lost) - value(gained);
  if (net < 1) return null;
  const has = (rs: Role[], r: Role) => rs.includes(r);
  if (has(lost, 'queen') && net >= 6) return 'your queen';
  if (has(lost, 'rook') && net >= 4) return 'a rook';
  if (has(lost, 'rook') && net === 2 && (has(gained, 'knight') || has(gained, 'bishop'))) return 'the exchange';
  if ((has(lost, 'knight') || has(lost, 'bishop')) && net >= 2) return 'a piece';
  if (net === 1) return 'a pawn';
  if (net === 2) return 'two pawns';
  return 'material';
};

/** The opponent's best line after a move: SAN, mate, and the material it wins from `mover` once captures stop. */
export const threatOf = (fenAfter: string, reply: PvLine, mover: 'white' | 'black'): Threat | null => {
  const pos = parsePos(fenAfter);
  if (!pos || reply.pv.length === 0) return null;
  const sans: string[] = [];
  const lost: Role[] = [], gained: Role[] = [];
  const settledAt: { plies: number; wins: string | null }[] = [];
  const moves = reply.pv.slice(0, 8);
  for (let i = 0; i < moves.length; i++) {
    const m = parseUci(moves[i]);
    if (!m || !pos.isLegal(normalizeMove(pos, m))) break;
    const nm = normalizeMove(pos, m);
    const target = 'from' in nm ? pos.board.get(nm.to) : undefined;
    const capture = 'from' in nm && ((target && target.color !== pos.turn) || (pos.board.get(nm.from)?.role === 'pawn' && nm.to === pos.epSquare));
    if (capture) (pos.turn === mover ? gained : lost).push(target && target.color !== pos.turn ? target.role : 'pawn');
    sans.push(makeSan(pos, nm));
    pos.play(nm);
    // The count is settled after a move when the next move in the line is not a capture.
    const next = moves[i + 1] ? parseUci(moves[i + 1]) : undefined;
    const nextCapture = !!next && 'from' in next && !!pos.board.get(next.to) && pos.board.get(next.to)!.color !== pos.turn;
    if (!nextCapture) settledAt.push({ plies: i + 1, wins: describeWin(lost, gained) });
  }
  if (sans.length === 0) return null;
  const mateIn = 'mate' in reply.score && reply.score.mate > 0 ? reply.score.mate : null;
  // What the line wins once captures stop, shown up to the first point where that is already won.
  const final = settledAt[settledAt.length - 1]?.wins ?? null;
  const shownPlies = settledAt.find(p => p.wins === final)?.plies ?? 1;
  return { uci: reply.uci, san: sans[0], line: sans.slice(0, Math.max(1, shownPlies)), mateIn, wins: mateIn ? null : final };
};

/** Review one move: `before`/`after` are the engine views of the positions before and after it. */
export const reviewMove = (
  fenBefore: string, mv: GameMove, prev: GameMove | undefined, before: PositionEval, after: PositionEval, sacrifice: boolean,
): MoveReview => {
  const best = before.lines[0];
  const bestScore = best ? best.score : null;
  // When the move played is one of the engine's lines, use that score: it comes from the same search as the best
  // move, so the two compare fairly. Otherwise use the search of the position after it.
  const inSearch = before.lines.find(l => l.uci === mv.uci);
  // The move that checkmates wins outright (negating "mate 0" would lose who was mated).
  const playedScore: EngineScore = after.terminal === 'checkmate' ? { mate: 1 }
    : inSearch ? inSearch.score : negate(positionScore(after));
  const bestWin = bestScore ? winPercent(bestScore) : winPercent(playedScore);
  const playedWin = winPercent(playedScore);
  const playedIsBest = !!best && best.uci === mv.uci;
  const second = before.lines[1];
  const obvious = mv.san.includes('x') || mv.san.includes('#') || (!!prev && /[+#]$/.test(prev.san));
  const rating = rateMove({
    bestWin, playedWin, secondWin: second ? winPercent(second.score) : null,
    playedIsBest, sacrifice, obvious,
  });
  const winBefore = playedIsBest ? playedWin : Math.max(bestWin, playedWin);
  const posBefore = parsePos(fenBefore);
  const from = parseUci(mv.uci);
  const movedRole = posBefore && from && 'from' in from ? posBefore.board.get(from.from)?.role ?? null : null;
  let threat: Threat | null = null;
  if ((rating === 'inaccuracy' || rating === 'mistake' || rating === 'blunder') && after.lines[0] && posBefore && from) {
    posBefore.play(normalizeMove(posBefore, from));
    threat = threatOf(fenOps.makeFen(posBefore.toSetup()), after.lines[0], mv.color);
  }
  return {
    rating, winBefore, winAfter: playedWin, accuracy: moveAccuracy(winBefore, playedWin),
    bestUci: best?.uci ?? null, bestSan: best ? sanOfUci(fenBefore, best.uci) : null, bestLine: best?.pv ?? [],
    bestScore, playedScore, playedIsBest, movedRole, threat,
  };
};

/**
 * Review every move of a game. `fens[i]` is the position before move i (fens.length = moves.length + 1),
 * `evals[i]` its engine view, `sacrifices[i]` whether move i is a sacrifice (isSacrifice on its square check).
 */
export const reviewMoves = (fens: string[], moves: GameMove[], evals: PositionEval[], sacrifices: boolean[]): MoveReview[] =>
  moves.map((mv, i) => reviewMove(fens[i], mv, moves[i - 1], evals[i], evals[i + 1], !!sacrifices[i]));

/** "+1.2", "−0.4", "M3" (mate for White), "−M2", "0.0" — from White's side. */
export const formatEval = (s: EngineScore): string => {
  if ('mate' in s) return s.mate === 0 ? '#' : s.mate > 0 ? `M${s.mate}` : `−M${-s.mate}`;
  const v = s.cp / 100;
  return v === 0 ? '0.0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
};

const stateOf = (win: number): string =>
  win >= 90 ? 'winning' : win >= 70 ? 'clearly better' : win >= 55 ? 'slightly better' : win > 45 ? 'equal'
    : win > 30 ? 'slightly worse' : win > 10 ? 'clearly worse' : 'losing';

const toWhite = (s: EngineScore, mover: 'white' | 'black'): EngineScore => (mover === 'white' ? s : negate(s));

const SIDE = { white: 'White', black: 'Black' } as const;
const ROLE_NAME: Record<Role, string> = { pawn: 'pawn', knight: 'knight', bishop: 'bishop', rook: 'rook', queen: 'queen', king: 'king' };

/** "...Qxg4" for a Black move, "Qxg4" for a White one. */
const moveText = (san: string, color: 'white' | 'black') => (color === 'black' ? `...${san}` : san);

/** The concrete reason a move was bad: what the opponent can do now. */
export const threatText = (t: Threat, mover: 'white' | 'black'): string => {
  const opp = mover === 'white' ? 'black' : 'white';
  // Moves of the line alternate, starting with the opponent's.
  const line = t.line.map((san, i) => moveText(san, i % 2 === 0 ? opp : mover)).join(' ');
  if (t.mateIn === 1) return `${SIDE[opp]} can now checkmate with ${moveText(t.san, opp)}.`;
  if (t.mateIn) return `${SIDE[opp]} can now force checkmate in ${t.mateIn}, starting with ${moveText(t.san, opp)}.`;
  if (t.wins) return t.line.length > 1
    ? `${SIDE[opp]} can answer ${moveText(t.san, opp)} and win ${t.wins} (${line}).`
    : `${SIDE[opp]} can answer ${moveText(t.san, opp)} and win ${t.wins}.`;
  return `${SIDE[opp]}'s best answer is ${moveText(t.san, opp)}.`;
};

/** One to three plain sentences for the move card (no engine jargon beyond the moves and the evaluation). */
export const explainReview = (r: MoveReview, mv: GameMove): string => {
  const better = r.bestSan && r.bestScore ? `Better was ${r.bestSan} (${formatEval(toWhite(r.bestScore, mv.color))}).` : '';
  const before = stateOf(r.winBefore);
  const after = stateOf(r.winAfter);
  const allowsMate = 'mate' in r.playedScore && r.playedScore.mate < 0;
  const reason = r.threat ? threatText(r.threat, mv.color) : allowsMate ? 'This allows a forced checkmate.' : '';
  const drop = r.threat?.mateIn ? '' // the reason already says it
    : before !== after ? `The position goes from ${before} to ${after} for you.` : 'This gives away part of your advantage.';
  const bad = (word: string) => [word + '.', drop, reason, better].filter(Boolean).join(' ');
  const to = mv.uci.slice(2, 4);
  if (r.book) return r.book.name ? `Book move: ${r.book.name}.` : 'Book move: a main line of the opening.';
  switch (r.rating) {
    case 'brilliant': return r.movedRole
      ? `Brilliant! You give up your ${ROLE_NAME[r.movedRole]} on ${to}, and it works: ${r.playedIsBest ? 'this is the engine\'s best move' : 'it is almost as good as the engine\'s best move'}.`
      : 'Brilliant! You give up material here, and it works.';
    case 'great': return `Great move! The only move that keeps the position ${after === 'equal' ? 'equal' : after + ' for you'}.`;
    case 'best': return mv.san.includes('#') ? 'Checkmate. Best move.' : 'Best move.';
    case 'excellent': return r.bestSan ? `Excellent. Almost as good as ${r.bestSan}.` : 'Excellent.';
    case 'good': return r.bestSan ? `Good move. ${r.bestSan} was a little better.` : 'Good move.';
    case 'inaccuracy': return bad('Inaccuracy');
    case 'mistake': return bad('Mistake');
    case 'blunder': return bad('Blunder');
  }
};

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

/** Score from White's side for the evaluation bar/graph. A checkmate counts as a won game for the side that gave it. */
export const whiteScore = (fen: string, p: PositionEval): EngineScore => {
  const whiteToMove = fen.split(' ')[1] === 'w';
  if (p.terminal === 'checkmate') return whiteToMove ? { mate: 0 } : { mate: 1 };
  const s = positionScore(p);
  return whiteToMove ? s : negate(s);
};

/** Text for the evaluation bar: the score from White's side, or the result once the game is over. */
export const evalLabel = (fen: string, p: PositionEval): string =>
  p.terminal === 'checkmate' ? (fen.split(' ')[1] === 'w' ? '0-1' : '1-0') : p.terminal === 'draw' ? '½-½' : formatEval(whiteScore(fen, p));
