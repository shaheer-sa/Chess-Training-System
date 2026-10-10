import React from 'react';
import type { EngineScore } from '../play/engineVerdict.js';
import type { GameMove } from '../play/game.js';
import { MoveReview, MoveRating, RATING_ORDER, ReviewSummary, explainReview, formatEval, winPercent } from '../analysis/review.js';
import { RATING_INFO } from '../shared/ratingInfo.js';

/** Rating chip: mark + name, never colour alone. */
export const RatingChip: React.FC<{ rating: MoveRating; compact?: boolean }> = ({ rating, compact }) => {
  const r = RATING_INFO[rating];
  return (
    <span className={`rv-rating${compact ? ' rv-rating--compact' : ''}`} style={{ background: r.color, color: r.textColor }} {...(compact ? { role: 'img', 'aria-label': r.text, title: r.text } : {})}>
      <span aria-hidden={compact ? undefined : true} className="rv-rating-glyph">{r.glyph}</span>
      {!compact && <span>{r.text}</span>}
    </span>
  );
};

/** Evaluation bar: White's share of the winning chances. Vertical beside the board; horizontal on phones. */
export const EvalBar: React.FC<{ score: EngineScore | null; flipped: boolean; label?: string }> = ({ score, flipped, label: given }) => {
  const white = score ? winPercent(score) : 50;
  const label = score ? given ?? formatEval(score) : '…';
  const whiteAhead = white >= 50;
  return (
    <div className={`rv-evalbar${flipped ? ' rv-evalbar--flipped' : ''}${score ? '' : ' rv-evalbar--loading'}`} role="img" aria-label={score ? `Evaluation ${label} (from White's side)` : 'Evaluating…'}>
      <div className="rv-evalbar-white" style={{ ['--w' as string]: `${white}%` }} />
      <span className={`rv-evalbar-label ${whiteAhead ? 'rv-evalbar-label--white' : 'rv-evalbar-label--black'}`} aria-hidden="true">{label}</span>
    </div>
  );
};

/** Evaluation over the game (White's winning chances); click to jump to a position. */
export const EvalGraph: React.FC<{ values: (number | null)[]; cursor: number; onJump: (i: number) => void }> = ({ values, cursor, onJump }) => {
  const n = values.length;
  if (n < 2) return null;
  const x = (i: number) => (i / (n - 1)) * 100;
  const pts = values.map((v, i) => (v === null ? null : `${x(i).toFixed(2)},${(100 - v).toFixed(2)}`));
  const known = pts.filter((p): p is string => p !== null);
  const area = known.length > 1 ? `M0,100 L${known.join(' L')} L${x(n - 1)},100 Z` : '';
  return (
    <svg className="rv-evalgraph" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Evaluation over the game. Click to jump to a move."
      onClick={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        onJump(Math.round(((e.clientX - r.left) / r.width) * (n - 1)));
      }}>
      <rect x="0" y="0" width="100" height="100" className="rv-evalgraph-bg" />
      {area && <path d={area} className="rv-evalgraph-area" />}
      <line x1="0" y1="50" x2="100" y2="50" className="rv-evalgraph-mid" />
      <line x1={x(cursor)} y1="0" x2={x(cursor)} y2="100" className="rv-evalgraph-cursor" />
    </svg>
  );
};

/** The current move: rating, a short explanation, and the evaluation. */
export const MoveCard: React.FC<{
  move: GameMove | null; label: string; review: MoveReview | undefined; pending: boolean;
}> = ({ move, label, review, pending }) => {
  if (!move) {
    return (
      <div className="rv-movecard">
        <div className="rv-movecard-head"><strong>Start position</strong></div>
        <p className="rv-movecard-text">Step through the moves, or play your own on the board.</p>
      </div>
    );
  }
  return (
    <div className="rv-movecard" aria-live="polite">
      <div className="rv-movecard-head">
        <span className="mono" style={{ fontWeight: 700 }}>{label} {move.san}</span>
        {review && <RatingChip rating={review.rating} />}
      </div>
      {review ? (
        <p key={`${label}${move.san}`} className="rv-movecard-text rv-fade-in-panel">{explainReview(review, move)}</p>
      ) : pending ? (
        <div className="rv-skeleton" style={{ height: 40 }} aria-label="Reviewing this move…" />
      ) : (
        <p className="rv-movecard-text" style={{ color: 'var(--text-muted)' }}>No review for this move.</p>
      )}
    </div>
  );
};

/** Accuracy per side and how many moves got each rating. */
export const SummaryCard: React.FC<{ summary: ReviewSummary; done: number; total: number; whiteName: string; blackName: string }> = ({ summary, done, total, whiteName, blackName }) => {
  const finished = done >= total;
  const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);
  return (
    <div className="rv-summary">
      <div className="rv-summary-head">
        <h3>Game review</h3>
        {!finished && <span className="rv-summary-progress" role="status">Reviewing… {done} / {total}</span>}
      </div>
      {!finished && <div className="rv-summary-bar" aria-hidden="true"><div style={{ width: `${(done / Math.max(1, total)) * 100}%` }} /></div>}
      <div className="rv-summary-grid">
        {(['white', 'black'] as const).map(side => (
          <div key={side} className="rv-summary-side">
            <div className="rv-summary-name">{side === 'white' ? whiteName : blackName}</div>
            <div className="rv-summary-acc" title="Accuracy">{pct(summary.accuracy[side])}<span>accuracy</span></div>
            <div className="rv-summary-counts">
              {RATING_ORDER.filter(r => summary.counts[side][r] > 0).map(r => (
                <span key={r} className="rv-summary-count"><RatingChip rating={r} compact /> {summary.counts[side][r]}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
