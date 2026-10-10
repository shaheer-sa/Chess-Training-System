/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import React from 'react';
import { AnalysisScreen } from '../../src/app/screens/AnalysisScreen.js';
import { DirectEngineClient } from '../../src/app/engine/DirectEngineClient.js';
import { formatEval, explainReview, reviewMove, PositionEval } from '../../src/app/analysis/review.js';
import { fensOf, lineFromPgn } from '../../src/app/analysis/line.js';
import { RatingChip, EvalBar, SummaryCard } from '../../src/app/components/ReviewViews.js';
import type { Searcher } from '../../src/app/analysis/useLineReview.js';
import type { PvLine } from '../../src/app/bot/EngineCheck.js';

afterEach(() => { cleanup(); localStorage.clear(); });

describe('review text', () => {
  it('formats evaluations from White\'s side', () => {
    expect(formatEval({ cp: 123 })).toBe('+1.2');
    expect(formatEval({ cp: -40 })).toBe('−0.4');
    expect(formatEval({ cp: 0 })).toBe('0.0');
    expect(formatEval({ mate: 3 })).toBe('M3');
    expect(formatEval({ mate: -2 })).toBe('−M2');
    expect(formatEval({ mate: 0 })).toBe('#');
  });

  it('explains a mistake with the better move and its evaluation (White\'s side)', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const before: PositionEval = { lines: [{ uci: 'e2e4', score: { cp: 30 }, pv: ['e2e4'] }, { uci: 'd2d4', score: { cp: 25 }, pv: ['d2d4'] }] };
    const after: PositionEval = { lines: [{ uci: 'e7e5', score: { cp: 120 }, pv: ['e7e5'] }] }; // Black to move, +1.2 for Black
    const mv = { uci: 'f2f3', san: 'f3', color: 'white' as const };
    const r = reviewMove(fen, mv as never, undefined, before, after, false);
    expect(r.rating).toBe('mistake');
    expect(explainReview(r, mv as never)).toBe('Mistake. The position goes from equal to slightly worse for you. Better was e4 (+0.3).');
  });

  it('lists every position of the line, start included', () => {
    const r = lineFromPgn('1. e4 e5 2. Nf3 *');
    if (!r.ok) throw new Error(r.error);
    const fens = fensOf(r.line);
    expect(fens).toHaveLength(4);
    expect(fens[3].split(' ')[0]).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R');
  });
});

describe('review views', () => {
  it('a rating chip shows its mark and its name (never colour alone)', () => {
    render(<div><RatingChip rating="blunder" /><RatingChip rating="brilliant" compact /></div>);
    expect(screen.getByText('Blunder')).toBeTruthy();
    expect(screen.getByText('??')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Brilliant' })).toBeTruthy();
  });

  it('the evaluation bar reads out the score', () => {
    render(<div><EvalBar score={{ cp: -150 }} flipped={false} /><EvalBar score={null} flipped /></div>);
    expect(screen.getByRole('img', { name: 'Evaluation −1.5 (from White\'s side)' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Evaluating…' })).toBeTruthy();
  });

  it('the summary shows progress until the review is done', () => {
    const counts = { brilliant: 0, great: 0, best: 2, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 1 };
    const summary = { accuracy: { white: 91.6, black: null }, counts: { white: counts, black: { ...counts, best: 0, blunder: 0 } } };
    const { rerender } = render(<SummaryCard summary={summary} done={3} total={8} whiteName="You" blackName="Computer" />);
    expect(screen.getByRole('status').textContent).toBe('Reviewing… 3 / 8');
    expect(screen.getByText('92%')).toBeTruthy();
    rerender(<SummaryCard summary={summary} done={8} total={8} whiteName="You" blackName="Computer" />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

/** Fake engine: the game move is best everywhere (+0.3 for the side to move), except 3...Nf6, which allows mate. */
const SCHOLAR = '[White "You"]\n[Black "Computer (level 1)"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';
const fakeSearcher = (calls: string[]): (() => Searcher) => {
  const r = lineFromPgn(SCHOLAR);
  if (!r.ok) throw new Error(r.error);
  const fens = fensOf(r.line);
  const ucis = r.line.game.map(m => m.uci);
  return () => ({
    search: async (fen: string): Promise<PvLine[]> => {
      calls.push(fen);
      const i = fens.indexOf(fen);
      if (i === 5) return [{ uci: 'g7g6', score: { cp: -40 }, pv: ['g7g6'] }, { uci: 'g8f6', score: { mate: -1 }, pv: ['g8f6', 'h5f7'] }];
      if (i === 6) return [{ uci: 'h5f7', score: { mate: 1 }, pv: ['h5f7'] }];
      const uci = i >= 0 && i < ucis.length ? ucis[i] : 'a2a3';
      return [{ uci, score: { cp: 30 }, pv: [uci] }, { uci: 'a2a3', score: { cp: 20 }, pv: ['a2a3'] }];
    },
    dispose: () => undefined,
  });
};

describe('Analyze — game review', () => {
  it('rates every move of a loaded game, shows the summary, the eval bar and only review labels', async () => {
    const calls: string[] = [];
    const { container } = render(<AnalysisScreen engineClient={new DirectEngineClient()} initialPgn={SCHOLAR} onNavigate={() => {}} createReviewSearcher={fakeSearcher(calls)} />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 5000 });
    expect(calls.length).toBe(7); // the final checkmate position needs no search

    const moves = screen.getByLabelText('Moves');
    expect(within(moves).getAllByRole('img', { name: 'Blunder' })).toHaveLength(1);
    // The card for the last move (checkmate) and the evaluation bar.
    expect(screen.getByText('Checkmate. Best move.')).toBeTruthy();
    expect(screen.getByRole('img', { name: "Evaluation 1-0 (from White's side)" })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Nf6' }));
    expect(await screen.findByText(/^Blunder\. This allows a forced checkmate\. Better was g6/)).toBeTruthy();

    // A game review never shows the square labels (Safe, Loses material…).
    const html = container.innerHTML;
    for (const word of ['Safe', 'Loses material', 'Even trade', 'Wins material']) expect(html).not.toContain(word);

    // Exploring your own move keeps the game summary as it was.
    const accuracy = () => [...container.querySelectorAll('.rv-summary-acc')].map(e => e.textContent).join('|');
    const before = accuracy();
    fireEvent.click(screen.getByRole('button', { name: 'Nc6' }));
    fireEvent.click(container.querySelector('#sq-3')!); // d1 queen
    await waitFor(() => expect(container.querySelector('#sq-21')?.getAttribute('aria-label')).toMatch(/legal destination/));
    fireEvent.click(container.querySelector('#sq-21')!); // Qf3 instead of Qh5
    expect(await screen.findByRole('button', { name: 'Back to game line' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/^3\. Qf3/)).toBeTruthy());
    expect(accuracy()).toBe(before);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('the evaluation bar can be turned off', async () => {
    render(<AnalysisScreen engineClient={new DirectEngineClient()} initialPgn={SCHOLAR} onNavigate={() => {}} createReviewSearcher={fakeSearcher([])} />);
    const toggle = await screen.findByRole('button', { name: 'Evaluation bar' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('img', { name: /from White's side/ })).toBeNull();
  });

  it('a finished review is reused without searching again', async () => {
    const first: string[] = [];
    render(<AnalysisScreen engineClient={new DirectEngineClient()} initialPgn={SCHOLAR} onNavigate={() => {}} createReviewSearcher={fakeSearcher(first)} />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 5000 });
    cleanup();
    const second: string[] = [];
    render(<AnalysisScreen engineClient={new DirectEngineClient()} initialPgn={SCHOLAR} onNavigate={() => {}} createReviewSearcher={fakeSearcher(second)} />);
    await screen.findByText('Checkmate. Best move.');
    expect(second).toHaveLength(0);
  });
});
