/**
 * Hint (phase 6F, vs computer in Training mode): the engine's best move for the player, with one or two plain
 * sentences on why — from the engine score, the engine check verdict and the square check of that move.
 */
import type { MoveClassification } from '../../engine/types.js';
import { explain } from '../explain/explain.js';
import { EngineScore, EngineScores, TurnContext, engineVerdict, scoreValue } from './engineVerdict.js';

const pawns = (s: EngineScore): string => {
  if ('mate' in s) return '';
  const v = s.cp / 100;
  return v === 0 ? '0.0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
};

export const hintText = (uci: string, scores: EngineScores, base: MoveClassification | null, ctx: TurnContext | null): string => {
  const score = scores[uci];
  if (!score) return "The engine's top move here.";
  if ('mate' in score && score.mate > 0) return score.mate === 1 ? 'It is checkmate.' : `It starts a forced checkmate in ${score.mate}.`;
  const others = Object.entries(scores).filter(([u]) => u !== uci).map(([, s]) => scoreValue(s));
  const second = others.length ? Math.max(...others) : null;
  const only = second !== null && scoreValue(score) - second >= 200 ? " It's the only good move — everything else is clearly worse." : '';
  const evalText = ` Engine: ${pawns(score)} for you.`;
  const verdict = base && ctx ? engineVerdict(base, score, ctx) : { kind: 'none' as const };
  if (verdict.kind === 'tactic') return `A tactic: on its square it looks risky, but the follow-up wins material.${only}${evalText}`;
  if (base) {
    const why = explain(base).primary;
    return base.netMaterial > 0 ? `${why}${only}${evalText}` : `The engine's top move here. ${why}${only}${evalText}`;
  }
  return `The engine's top move here.${only}${evalText}`;
};
