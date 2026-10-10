/**
 * Tactic follow-up (phase 6D). After a move labelled Tactic, the player's next moves are checked against the engine
 * check of each position: on track (one of the best moves), complete (the material gain is on the board), or missed.
 * It never shows a new Tactic label and never names the follow-up before it is played.
 */
import { EngineScore, TurnContext, materialForSideToMove, scoreValue, THRESHOLD_CP } from './engineVerdict.js';
import { PlayedVerdicts, TACTIC_HIDE_TURNS } from './playedVerdicts.js';

export type FollowUp = 'on-track' | 'complete' | 'missed';

const NEAR_BEST_CP = 50;

/** The mover's latest Tactic move that is still in progress before `moveIndex`, if any. */
export const tacticStart = (moveColors: ('white' | 'black')[], verdicts: PlayedVerdicts, moveIndex: number): number | null => {
  const mover = moveColors[moveIndex];
  for (let i = moveIndex - 1; i >= 0; i--) {
    if (moveColors[i] !== mover) continue;
    if (verdicts[i] !== 'tactic') continue;
    let own = 0;
    for (let j = i + 1; j < moveIndex; j++) if (moveColors[j] === mover) own++;
    return own < TACTIC_HIDE_TURNS ? i : null;
  }
  return null;
};

/** Material for `mover` (centipawns) in a position, whoever is to move. */
export const materialFor = (fen: string, mover: 'white' | 'black'): number =>
  (fen.split(' ')[1] === 'w') === (mover === 'white') ? materialForSideToMove(fen) : -materialForSideToMove(fen);

/**
 * How the follow-up move went. `played` is the engine score of the move in the position it was played in,
 * `gain` the mover's material now minus before the Tactic move.
 */
export const followUp = (played: EngineScore | undefined, ctx: TurnContext | null, gain: number, checkmate = false): FollowUp | null => {
  if (checkmate) return 'complete';
  if (!played || !ctx) return null;
  const v = scoreValue(played);
  if (v >= ctx.best - NEAR_BEST_CP) return gain >= THRESHOLD_CP ? 'complete' : 'on-track';
  if (v <= ctx.best - THRESHOLD_CP) return 'missed';
  return null;
};

/** "a pawn", "a piece", "a rook"… for a material gain in centipawns. */
export const gainWords = (gain: number): string =>
  gain < 150 ? 'a pawn' : gain < 250 ? 'two pawns' : gain < 450 ? 'a piece' : gain < 750 ? 'a rook' : 'a queen';

export const FOLLOW_UP_TEXT: Record<FollowUp, (gain: number, checkmate?: boolean) => string> = {
  'on-track': () => "Tactic on track: that's the follow-up.",
  complete: (gain, checkmate) => (checkmate ? 'Tactic complete: checkmate!' : `Tactic complete: you won ${gainWords(gain)}!`),
  missed: () => 'Follow-up missed: the advantage from the tactic is gone.',
};

/** Finished Tactics: Tactic move index → the follow-up move that completed it or missed it. */
export type TacticsDone = Map<number, number>;

/** After Undo to `keep` moves: a Tactic whose finishing follow-up was undone is open again. */
export const pruneTacticsDone = (done: TacticsDone, keep: number): TacticsDone =>
  new Map([...done].filter(([start, finishedAt]) => start < keep && finishedAt < keep));
