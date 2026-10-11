import React from 'react';
import type { EngineScore } from '../play/engineVerdict.js';
import type { GameMove } from '../play/game.js';
import { MoveReview, MoveRating, RATING_ORDER, ReviewSummary, explainReview, formatEval, winPercent } from '../analysis/review.js';
import { RATING_INFO } from '../shared/ratingInfo.js';

/** A small open book (the mark for opening-book moves). */
const BookIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" /><path d="M12 6.5v13" />
  </svg>
);

/** The mark of a rating: the annotation glyph, or an icon (Book). */
export const RatingGlyph: React.FC<{ rating: MoveRating }> = ({ rating }) =>
  rating === 'book' ? <BookIcon /> : <>{RATING_INFO[rating].glyph}</>;

/** Rating chip: mark + name, never colour alone. */
export const RatingChip: React.FC<{ rating: MoveRating; compact?: boolean }> = ({ rating, compact }) => {
  const r = RATING_INFO[rating];
  return (
    <span className={`rv-rating${compact ? ' rv-rating--compact' : ''}`} style={{ background: r.color, color: r.textColor }} {...(compact ? { role: 'img', 'aria-label': r.text, title: r.text } : {})}>
      <span aria-hidden={compact ? undefined : true} className="rv-rating-glyph"><RatingGlyph rating={rating} /></span>
      {!compact && <span>{r.text}</span>}
    </span>
  );
};

/** Plain words for an evaluation from White's side: "White is winning (about 11.5 pawns ahead)". */
export const evalWords = (score: EngineScore, label: string): string => {
  if (label === '1-0' || label === '0-1') return `Game over: ${label === '1-0' ? 'White' : 'Black'} won by checkmate`;
  if (label === '½-½') return 'Game over: draw';
  if ('mate' in score) return score.mate > 0 ? `White can force checkmate in ${score.mate}` : `Black can force checkmate in ${-score.mate}`;
  const w = winPercent(score);
  const pawns = Math.abs(score.cp / 100).toFixed(1);
  const side = w >= 50 ? 'White' : 'Black';
  const share = w >= 50 ? w : 100 - w;
  const state = share >= 90 ? 'is winning' : share >= 70 ? 'is clearly better' : share >= 55 ? 'is slightly better' : null;
  if (!state) return 'The position is about equal';
  return `${side} ${state} (about ${pawns} ${pawns === '1.0' ? 'pawn' : 'pawns'} ahead)`;
};

/** Evaluation bar: White's share of the winning chances. Vertical beside the board; horizontal on phones. Hover or focus it for the score in words. */
export const EvalBar: React.FC<{ score: EngineScore | null; flipped: boolean; label?: string }> = ({ score, flipped, label: given }) => {
  // While the next position is being evaluated, keep showing the last evaluation (no jump to 0.0 and back).
  const last = React.useRef<{ score: EngineScore; label: string } | null>(null);
  if (score) last.current = { score, label: given ?? formatEval(score) };
  const shown = score ? { score, label: given ?? formatEval(score) } : last.current;
  const pending = !score;
  const white = shown ? winPercent(shown.score) : 50;
  const label = shown ? shown.label : '…';
  const whiteAhead = white >= 50;
  const words = shown ? evalWords(shown.score, label) : 'The engine is still evaluating this position';
  return (
    <div className="rv-evalbar-wrap">
      <div tabIndex={0} className={`rv-evalbar${flipped ? ' rv-evalbar--flipped' : ''}${shown ? '' : ' rv-evalbar--loading'}${pending && shown ? ' rv-evalbar--pending' : ''}`} role="img"
        aria-label={!shown ? 'Evaluating…' : pending ? 'Evaluating the new position…' : `Evaluation ${label} (from White's side). ${words}.`}>
        <div className="rv-evalbar-white" style={{ ['--w' as string]: `${white}%` }} />
        <span className={`rv-evalbar-label ${whiteAhead ? 'rv-evalbar-label--white' : 'rv-evalbar-label--black'}`} aria-hidden="true">{label}</span>
      </div>
      <div className="rv-evaltip" aria-hidden="true"><strong>{label}</strong>{words}</div>
    </div>
  );
};

/**
 * Evaluation over the game (White's winning chances). A slider: click a point, or focus it and use
 * ←/→ (one move), Home/End, PageUp/PageDown (ten moves) to jump.
 */
export const EvalGraph: React.FC<{
  values: (number | null)[]; cursor: number; onJump: (i: number) => void; valueText: (i: number) => string;
}> = ({ values, cursor, onJump, valueText }) => {
  const n = values.length;
  if (n < 2) return null;
  const x = (i: number) => (i / (n - 1)) * 100;
  const pts = values.map((v, i) => (v === null ? null : `${x(i).toFixed(2)},${(100 - v).toFixed(2)}`));
  const known = pts.filter((p): p is string => p !== null);
  const area = known.length > 1 ? `M0,100 L${known.join(' L')} L${x(n - 1)},100 Z` : '';
  const jump = (i: number) => { const t = Math.max(0, Math.min(n - 1, i)); if (t !== cursor) onJump(t); };
  const onKey = (e: React.KeyboardEvent) => {
    const to: Record<string, number> = {
      ArrowLeft: cursor - 1, ArrowDown: cursor - 1, ArrowRight: cursor + 1, ArrowUp: cursor + 1,
      Home: 0, End: n - 1, PageDown: cursor - 10, PageUp: cursor + 10,
    };
    if (!(e.key in to)) return;
    e.preventDefault();
    jump(to[e.key]);
  };
  return (
    <div
      className="rv-evalgraph"
      role="slider"
      tabIndex={0}
      aria-label="Evaluation graph: move through the game"
      aria-valuemin={0}
      aria-valuemax={n - 1}
      aria-valuenow={cursor}
      aria-valuetext={valueText(cursor)}
      onKeyDown={onKey}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (r.width > 0) jump(Math.round(((e.clientX - r.left) / r.width) * (n - 1)));
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect x="0" y="0" width="100" height="100" className="rv-evalgraph-bg" />
        {area && <path d={area} className="rv-evalgraph-area" />}
        <line x1="0" y1="50" x2="100" y2="50" className="rv-evalgraph-mid" />
        <line x1={x(cursor)} y1="0" x2={x(cursor)} y2="100" className="rv-evalgraph-cursor" />
      </svg>
    </div>
  );
};

/** The current move: rating, a short explanation, and the evaluation. */
export const MoveCard: React.FC<{
  move: GameMove | null; label: string; review: MoveReview | undefined; pending: boolean;
  /** What the arrows on the board show (they are never the only way to tell). */
  note?: string;
  /** The engine's better move, which can be shown on the position before the move. */
  better?: { san: string; showing: boolean; toggle: () => void };
}> = ({ move, label, review, pending, note, better }) => {
  if (!move) {
    return (
      <div className="rv-movecard">
        <div className="rv-movecard-head"><strong>Start position</strong></div>
        <p className="rv-movecard-text">Step through the moves, or play your own on the board.</p>
        {note && <p className="rv-movecard-note">{note}</p>}
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
      {review && better && (
        <div><button type="button" className="rv-btn rv-chiptoggle" aria-pressed={better.showing} onClick={better.toggle}>
          {better.showing ? `Back to ${move.san}` : `Show ${better.san} on the board`}
        </button></div>
      )}
      {review && note && <p className="rv-movecard-note">{note}</p>}
    </div>
  );
};

/** Accuracy per side and how many moves got each rating. */
export const SummaryCard: React.FC<{
  summary: ReviewSummary; done: number; total: number; missing: number; onRetry: () => void; whiteName: string; blackName: string;
}> = ({ summary, done, total, missing, onRetry, whiteName, blackName }) => {
  const working = done + missing < total;
  const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);
  return (
    <div className="rv-summary">
      <div className="rv-summary-head">
        <h3>Game review</h3>
        {working && <span className="rv-summary-progress" role="status">Reviewing… {done} / {total}</span>}
      </div>
      {working && <div className="rv-summary-bar" aria-hidden="true"><div style={{ width: `${(done / Math.max(1, total)) * 100}%` }} /></div>}
      {!working && missing > 0 && (
        <div className="rv-summary-missing" role="alert">
          <span>{missing === 1 ? '1 position' : `${missing} positions`} couldn't be checked, so some moves have no rating.</span>
          <button type="button" className="rv-btn" onClick={onRetry}>Try again</button>
        </div>
      )}
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
