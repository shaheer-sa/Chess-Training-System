/**
 * Display layer (phase 5C): combines the square-safety classification with the engine-check verdict.
 * The square-safety result is never hidden: when the engine check adds something, both sources are named.
 */
import type { MoveClassification } from '../../engine/types.js';
import { explain } from '../explain/explain.js';
import type { Label } from '../shared/badgeInfo.js';
import type { Verdict } from './engineVerdict.js';

export interface DisplayMove {
  move: MoveClassification['move'];
  label: Label;
  base: MoveClassification;
  engine: 'danger' | 'tactic' | null;
  mateAgainst: boolean;
}

/** suppressTactic: the player is in the middle of a tactic they started — don't point at the follow-up. */
export const toDisplay = (base: MoveClassification, verdict: Verdict, suppressTactic: boolean): DisplayMove => {
  if (verdict.kind === 'danger') {
    return { move: base.move, label: 'loses_material', base, engine: 'danger', mateAgainst: verdict.mateAgainst };
  }
  if (verdict.kind === 'tactic' && !suppressTactic) {
    return { move: base.move, label: 'tactic', base, engine: 'tactic', mateAgainst: false };
  }
  return { move: base.move, label: base.label, base, engine: null, mateAgainst: false };
};

/**
 * hideMate: the mate banner is up ("checkmate in N — can you find it?"). A move that mates is then described as the
 * check it also is, so the hints never point at the solution. After it is played, the game-over state says checkmate.
 */
export const displayText = (d: DisplayMove, opts: { hideMate?: boolean } = {}): { primary: string; squareCheck: string | null; notes: string[] } => {
  if (opts.hideMate && d.base.reasons.some(r => r.code === 'DELIVERS_MATE')) {
    return { primary: 'This move gives check.', squareCheck: null, notes: [] };
  }
  const e = explain(d.base);
  if (d.engine === 'danger') {
    const what = d.base.label === 'even_trade' ? 'The trade itself is even' : 'The square itself is safe';
    const engine = d.mateAgainst
      ? `${what}, but an engine check found that your opponent can then force checkmate.`
      : `${what}, but an engine check found a strong reply for your opponent.`;
    return { primary: engine, squareCheck: `Square check: ${e.primary}`, notes: e.notes };
  }
  if (d.engine === 'tactic') {
    return {
      primary: 'Engine check: strong only if you find the right follow-up — otherwise it can cost you.',
      squareCheck: `Square check: ${e.primary}`,
      notes: e.notes
    };
  }
  return { primary: e.primary, squareCheck: null, notes: e.notes };
};

/** SAN shown in hints: while the mate banner is up, "#" is shown as "+" (still true: mate is a check). */
export const hintSan = (san: string, hideMate: boolean): string => (hideMate ? san.replace('#', '+') : san);
