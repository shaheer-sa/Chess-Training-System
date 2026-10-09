/**
 * Engine-check verdicts of moves that were actually played (phase 5C).
 * Recorded from the engine check of the position the move was played in, saved with the game, and used for:
 *  - the Last move card and move list (same label after Undo / refresh),
 *  - the "Tactic in progress" rule, which is derived from history so Undo and refresh can't break it.
 */
import type { Verdict } from './engineVerdict.js';

export type PlayedVerdict = 'danger' | 'danger-mate' | 'tactic';
export type PlayedVerdicts = Record<number, PlayedVerdict>;
export const VERDICTS_KEY = 'rookvex.play.verdicts.v1';
/** A Tactic hides Tactic labels for the player's next N turns. */
export const TACTIC_HIDE_TURNS = 2;

export const toPlayed = (v: Verdict): PlayedVerdict | null =>
  v.kind === 'tactic' ? 'tactic' : v.kind === 'danger' ? (v.mateAgainst ? 'danger-mate' : 'danger') : null;

export const fromPlayed = (p: PlayedVerdict | undefined): Verdict =>
  p === 'tactic' ? { kind: 'tactic' } : p === 'danger' || p === 'danger-mate' ? { kind: 'danger', mateAgainst: p === 'danger-mate' } : { kind: 'none' };

/** True while `color` is within TACTIC_HIDE_TURNS of its own turns after its latest Tactic move. */
export const tacticInProgress = (moveColors: ('white' | 'black')[], verdicts: PlayedVerdicts, color: 'white' | 'black'): boolean => {
  for (let i = moveColors.length - 1; i >= 0; i--) {
    if (moveColors[i] !== color || verdicts[i] !== 'tactic') continue;
    let ownMovesAfter = 0;
    for (let j = i + 1; j < moveColors.length; j++) if (moveColors[j] === color) ownMovesAfter++;
    return ownMovesAfter < TACTIC_HIDE_TURNS;
  }
  return false;
};

/** Keep only verdicts for indices that exist in the current game. */
export const pruneVerdicts = (v: PlayedVerdicts, moveCount: number): PlayedVerdicts => {
  const out: PlayedVerdicts = {};
  for (const [k, p] of Object.entries(v)) if (Number(k) < moveCount) out[Number(k)] = p;
  return out;
};

export const serializeVerdicts = (uciMoves: string[], v: PlayedVerdicts): string =>
  JSON.stringify({ moves: uciMoves, verdicts: pruneVerdicts(v, uciMoves.length) });

const VALID = new Set<string>(['danger', 'danger-mate', 'tactic']);

/** Restores verdicts for the moves the saved data and the current game share (same move at the same index). */
export const loadVerdicts = (raw: string | null, uciMoves: string[]): PlayedVerdicts => {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return {};
    const { moves, verdicts } = data as { moves?: unknown; verdicts?: unknown };
    if (!Array.isArray(moves) || !verdicts || typeof verdicts !== 'object') return {};
    let shared = 0;
    while (shared < moves.length && shared < uciMoves.length && moves[shared] === uciMoves[shared]) shared++;
    const out: PlayedVerdicts = {};
    for (const [k, p] of Object.entries(verdicts as Record<string, unknown>)) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0 && i < shared && typeof p === 'string' && VALID.has(p)) out[i] = p as PlayedVerdict;
    }
    return out;
  } catch {
    return {};
  }
};

/**
 * The verdict recorded for move `moveIndex`: the engine verdict, except that a Tactic played while the mover's
 * previous Tactic is still in progress is not recorded (no reveal, no endless window). `verdictsBefore` must be the
 * FINAL verdicts of moves 0..moveIndex-1, so moves are decided strictly in order.
 */
export const decidePlayedVerdict = (
  verdict: Verdict,
  moveColors: ('white' | 'black')[],
  verdictsBefore: PlayedVerdicts,
  moveIndex: number
): PlayedVerdict | null => {
  const p = toPlayed(verdict);
  if (p !== 'tactic') return p;
  const mover = moveColors[moveIndex];
  return tacticInProgress(moveColors.slice(0, moveIndex), pruneVerdicts(verdictsBefore, moveIndex), mover) ? null : p;
};
