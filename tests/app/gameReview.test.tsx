/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, renderHook, act } from '@testing-library/react';
import React from 'react';
import { AnalysisScreen } from '../../src/app/screens/AnalysisScreen.js';
import { DirectEngineClient } from '../../src/app/engine/DirectEngineClient.js';
import { formatEval, explainReview, reviewMove, PositionEval, REVIEW_DEPTH, threatOf, describeWin } from '../../src/app/analysis/review.js';
import { Board } from '../../src/app/components/Board.js';
import { PlayScreen } from '../../src/app/screens/PlayScreen.js';
import { Chess, fen as fenOps } from 'chessops';
import { newGame } from '../../src/app/play/game.js';
import { DEFAULT_SETTINGS } from '../../src/app/play/playSettings.js';
import { reviewKey } from '../../src/app/analysis/reviewCache.js';
import { fensOf, lineFromPgn } from '../../src/app/analysis/line.js';
import { RatingChip, EvalBar, SummaryCard } from '../../src/app/components/ReviewViews.js';
import { useLineReview, MAX_ATTEMPTS, type Searcher } from '../../src/app/analysis/useLineReview.js';
import type { EngineClient } from '../../src/app/engine/EngineClient.js';
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
    expect(explainReview(r, mv as never)).toBe("Mistake. The position goes from equal to slightly worse for you. Black's best answer is ...e5. Better was e4 (+0.3).");
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
    expect(screen.getByRole('img', { name: 'Evaluation −1.5 (from White\'s side). Black is slightly better (about 1.5 pawns ahead).' })).toBeTruthy();
    expect(screen.getByText('Black is slightly better (about 1.5 pawns ahead)')).toBeTruthy(); // hover / focus tooltip
    expect(screen.getByRole('img', { name: 'Evaluating…' })).toBeTruthy();
  });

  it('the summary shows progress until the review is done', () => {
    const counts = { brilliant: 0, great: 0, best: 2, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 1 };
    const summary = { accuracy: { white: 91.6, black: null }, counts: { white: counts, black: { ...counts, best: 0, blunder: 0 } } };
    const noop = () => undefined;
    const { rerender } = render(<SummaryCard summary={summary} done={3} total={8} missing={0} onRetry={noop} whiteName="You" blackName="Computer" />);
    expect(screen.getByRole('status').textContent).toBe('Reviewing… 3 / 8');
    expect(screen.getByText('92%')).toBeTruthy();
    rerender(<SummaryCard summary={summary} done={8} total={8} missing={0} onRetry={noop} whiteName="You" blackName="Computer" />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/** Fake engine: the game move is best everywhere (+0.3 for the side to move), except 3...Nf6, which allows mate. */
const SCHOLAR = '[White "You"]\n[Black "Computer (level 1)"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';
const fakeSearcher = (calls: string[], failAt: { index: number; times: number } | null = null, disposed: { n: number } = { n: 0 }): (() => Searcher) => {
  const r = lineFromPgn(SCHOLAR);
  if (!r.ok) throw new Error(r.error);
  const fens = fensOf(r.line);
  const ucis = r.line.game.map(m => m.uci);
  return () => ({
    search: async (fen: string): Promise<PvLine[]> => {
      calls.push(fen);
      const i = fens.indexOf(fen);
      if (failAt && i === failAt.index && failAt.times > 0) { failAt.times--; throw new Error('engine error'); }
      if (i === 5) return [{ uci: 'g7g6', score: { cp: -40 }, pv: ['g7g6'] }, { uci: 'g8f6', score: { mate: -1 }, pv: ['g8f6', 'h5f7'] }];
      if (i === 6) return [{ uci: 'h5f7', score: { mate: 1 }, pv: ['h5f7'] }];
      const uci = i >= 0 && i < ucis.length ? ucis[i] : 'a2a3';
      return [{ uci, score: { cp: 30 }, pv: [uci] }, { uci: 'a2a3', score: { cp: 20 }, pv: ['a2a3'] }];
    },
    cancel: () => undefined,
    dispose: () => { disposed.n++; },
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
    // A game opens at the start; the last move (checkmate) and the evaluation bar.
    expect(screen.getByText('Start position', { selector: '.rv-an-where' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to end' }));
    expect(screen.getByText('Checkmate. Best move.')).toBeTruthy();
    expect(screen.getByRole('img', { name: "Evaluation 1-0 (from White's side). Game over: White won by checkmate." })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Nf6' }));
    expect(await screen.findByText('Blunder. White can now checkmate with Qxf7#. Better was g6 (+0.4).')).toBeTruthy();

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
    fireEvent.click(await screen.findByRole('button', { name: 'Go to end' }));
    await screen.findByText('Checkmate. Best move.');
    expect(second).toHaveLength(0);
  });
});

const reviewKeys = () => Object.keys(localStorage).filter(k => k.startsWith('rookvex.review.v1:'));

describe('Game review — failures, lifecycle, keyboard (review fixes)', () => {
  it('a position that keeps failing is retried once, never saved, and can be tried again', async () => {
    const calls: string[] = [];
    const failAt = { index: 2, times: MAX_ATTEMPTS };
    render(<AnalysisScreen engineClient={new DirectEngineClient()} initialPgn={SCHOLAR} onNavigate={() => {}} createReviewSearcher={fakeSearcher(calls, failAt)} />);
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert.textContent).toMatch(/^1 position couldn't be checked/);
    expect(screen.queryByRole('status')).toBeNull();
    const r = lineFromPgn(SCHOLAR);
    if (!r.ok) throw new Error(r.error);
    const failed = fensOf(r.line)[2];
    expect(calls.filter(f => f === failed)).toHaveLength(MAX_ATTEMPTS);
    expect(reviewKeys()).toHaveLength(0); // an incomplete review is not saved

    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await waitFor(() => expect(reviewKeys()).toHaveLength(1));
  });

  it('a review saved by an early build with a failed position is reviewed again, not trusted', async () => {
    const r = lineFromPgn(SCHOLAR);
    if (!r.ok) throw new Error(r.error);
    const fens = fensOf(r.line);
    const key = 'rookvex.review.v1:' + reviewKey(r.line.startFen, r.line.game.map(m => m.uci), REVIEW_DEPTH);
    // Old format: every position "done", but position 2 was a failed search saved as no lines.
    const legacy = fens.map((_, i) => (i === 7 ? { lines: [], terminal: 'checkmate' } : i === 2 ? { lines: [] } : { lines: [{ uci: 'a2a3', score: { cp: 0 }, pv: ['a2a3'] }] }));
    localStorage.setItem(key, JSON.stringify(legacy));
    const calls: string[] = [];
    render(<AnalysisScreen engineClient={new DirectEngineClient()} initialPgn={SCHOLAR} onNavigate={() => {}} createReviewSearcher={fakeSearcher(calls)} />);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key) ?? '[]')[2]?.lines?.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(calls).toContain(fens[2]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(screen.getByLabelText('Moves')).getAllByRole('img', { name: 'Blunder' })).toHaveLength(1);
  });

  it('works under React Strict Mode (effects run twice in development)', async () => {
    const calls: string[] = [];
    const disposed = { n: 0 };
    render(<React.StrictMode><AnalysisScreen engineClient={new DirectEngineClient()} initialPgn={SCHOLAR} onNavigate={() => {}} createReviewSearcher={fakeSearcher(calls, null, disposed)} /></React.StrictMode>);
    await waitFor(() => expect(reviewKeys()).toHaveLength(1), { timeout: 5000 });
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Go to end' }));
    expect(screen.getByText('Checkmate. Best move.')).toBeTruthy();
    cleanup();
    expect(disposed.n).toBeGreaterThanOrEqual(1); // the engine is released on unmount
  });

  it('the evaluation graph works with the keyboard', async () => {
    render(<AnalysisScreen engineClient={new DirectEngineClient()} initialPgn={SCHOLAR} onNavigate={() => {}} createReviewSearcher={fakeSearcher([])} />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 5000 });
    const graph = screen.getByRole('slider', { name: 'Evaluation graph: move through the game' });
    expect(graph.getAttribute('tabindex')).toBe('0');
    expect(graph.getAttribute('aria-valuenow')).toBe('0');
    fireEvent.keyDown(graph, { key: 'End' });
    expect(graph.getAttribute('aria-valuenow')).toBe('7');
    expect(graph.getAttribute('aria-valuetext')).toBe('After 4. Qxf7#, 1-0');
    graph.focus();
    fireEvent.keyDown(graph, { key: 'ArrowLeft' });
    expect(screen.getByText('After 3... Nf6', { selector: '.rv-an-where' })).toBeTruthy();
    expect(graph.getAttribute('aria-valuenow')).toBe('6');
    fireEvent.keyDown(graph, { key: 'Home' });
    expect(screen.getByText('Start position', { selector: '.rv-an-where' })).toBeTruthy();
    expect(graph.getAttribute('aria-valuetext')).toMatch(/^Start position, \+0\.3$/);
    fireEvent.keyDown(graph, { key: 'End' });
    expect(graph.getAttribute('aria-valuenow')).toBe('7');
  });
});

describe('useLineReview — stopping searches nobody needs', () => {
  const engineClient = { classifyMove: async () => ({ ok: false }) } as unknown as EngineClient;
  const gameOf = (pgn: string) => {
    const r = lineFromPgn(pgn);
    if (!r.ok) throw new Error(r.error);
    const fens = fensOf(r.line);
    return { fens, moves: r.line.game, game: { startFen: r.line.startFen, ucis: r.line.game.map(m => m.uci), fens, moves: r.line.game } };
  };

  it('loading another game stops the old search and starts on the new position at once', async () => {
    const searched: string[] = [];
    let cancels = 0;
    let rejectRunning: ((e: Error) => void) | null = null;
    const searcher: Searcher = {
      search: (fen) => new Promise<PvLine[]>((_res, rej) => { searched.push(fen); rejectRunning = rej; }), // never finishes on its own
      cancel: () => { cancels++; rejectRunning?.(new Error('cancelled')); },
      dispose: () => undefined,
    };
    const a = gameOf('1. e4 e5 *');
    const b = gameOf('1. d4 d5 2. c4 *');
    const { rerender } = renderHook(
      ({ g }) => useLineReview(engineClient, g.fens, g.moves, g.fens[g.fens.length - 1], g.game, () => searcher),
      { initialProps: { g: a } },
    );
    await waitFor(() => expect(searched).toEqual([a.fens[2]])); // the position on the board first
    await act(async () => { rerender({ g: b }); });
    await waitFor(() => expect(searched).toEqual([a.fens[2], b.fens[3]]));
    expect(cancels).toBe(1);
  });

  it('a search that is still wanted is not stopped when you step through the game', async () => {
    const searched: string[] = [];
    let cancels = 0;
    const searcher: Searcher = {
      search: (fen) => new Promise<PvLine[]>(() => { searched.push(fen); }),
      cancel: () => { cancels++; },
      dispose: () => undefined,
    };
    const a = gameOf('1. e4 e5 2. Nf3 *');
    const { rerender } = renderHook(
      ({ cur }) => useLineReview(engineClient, a.fens, a.moves, cur, a.game, () => searcher),
      { initialProps: { cur: a.fens[3] } },
    );
    await waitFor(() => expect(searched).toEqual([a.fens[3]]));
    await act(async () => { rerender({ cur: a.fens[1] }); });
    expect(cancels).toBe(0);
    expect(searched).toEqual([a.fens[3]]);
  });
});

describe('6C: ratings on the board, arrows, reasons, training mode', () => {
  const GAME = '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qe6+ 4. Be2 Qg6 5. Nf3 Qxg2 6. Rg1 Qh3 7. Bc4 Bg4 8. Rxg4 Qxg4 9. Bxf7+ Kxf7 10. Ne5+ *';

  it('a sacrifice that is the second engine line is rated from the same search (8.Rxg4 is Brilliant)', () => {
    const r = lineFromPgn(GAME);
    if (!r.ok) throw new Error(r.error);
    const fens = fensOf(r.line);
    const mv = r.line.game[14]; // 8. Rxg4
    expect(mv.san).toBe('Rxg4');
    // Real depth-14 lines: Bxf7+ +2.39, Rxg4 +2.25. The separate search after Rxg4 happened to say only +1.0.
    const before: PositionEval = { lines: [{ uci: 'c4f7', score: { cp: 239 }, pv: ['c4f7'] }, { uci: 'g1g4', score: { cp: 225 }, pv: ['g1g4'] }] };
    const after: PositionEval = { lines: [{ uci: 'h3g4', score: { cp: -100 }, pv: ['h3g4'] }] };
    const rv = reviewMove(fens[14], mv, r.line.game[13], before, after, true);
    expect(rv.rating).toBe('brilliant');
    expect(explainReview(rv, mv)).toBe("Brilliant! You give up your rook on g4, and it works: it is almost as good as the engine's best move.");
  });

  it('says what the opponent wins after a bad move (9...Kxf7?? allows Ne5+ and Nxg4)', () => {
    const t = threatOf('rn3bnr/ppp1pkpp/8/8/6q1/2N2N2/PPPP1P1P/R1BQK3 w Q - 0 10', { uci: 'f3e5', score: { cp: 900 }, pv: ['f3e5', 'f7e8', 'e5g4', 'b8c6'] }, 'black');
    expect(t).toEqual({ uci: 'f3e5', san: 'Ne5+', line: ['Ne5+', 'Ke8', 'Nxg4'], mateIn: null, wins: 'your queen' });
    const r = lineFromPgn(GAME);
    if (!r.ok) throw new Error(r.error);
    const fens = fensOf(r.line);
    const mv = r.line.game[17]; // 9... Kxf7
    const before: PositionEval = { lines: [{ uci: 'e8d8', score: { cp: -250 }, pv: ['e8d8'] }] };
    const after: PositionEval = { lines: [{ uci: 'f3e5', score: { cp: 900 }, pv: ['f3e5', 'f7e8', 'e5g4', 'b8c6'] }] };
    const rv = reviewMove(fens[17], mv, r.line.game[16], before, after, false);
    expect(rv.rating).toBe('blunder');
    expect(explainReview(rv, mv)).toBe('Blunder. The position goes from clearly worse to losing for you. White can answer Ne5+ and win your queen (Ne5+ ...Ke8 Nxg4). Better was Kd8 (+2.5).');
  });

  it('names what a line wins', () => {
    expect(describeWin(['pawn'], [])).toBe('a pawn');
    expect(describeWin(['rook'], ['bishop'])).toBe('the exchange');
    expect(describeWin(['knight'], [])).toBe('a piece');
    expect(describeWin(['rook'], [])).toBe('a rook');
    expect(describeWin(['queen'], ['knight'])).toBe('your queen');
    expect(describeWin(['knight'], ['bishop'])).toBeNull();
  });

  it('the board shows the rating mark on the square and plays the Brilliant effect', () => {
    const pos = Chess.default();
    const { container, rerender } = render(<Board position={pos} flipped={false} selectedSquare={null} destinationSquare={null} moves={[]} expandedLevel={1} exchangeStep={0} selectedDestInfo={null}
      moveBadge={{ square: 28, glyph: '!!', label: 'Brilliant', color: '#00796b', textColor: '#fff', effect: 'brilliant', id: 'a' }}
      arrows={[{ from: 'g1', to: 'f3', kind: 'best' }, { from: 'e7', to: 'e5', kind: 'threat' }]} />);
    const badge = container.querySelector('.rv-movebadge')!;
    expect(badge.textContent).toBe('!!');
    expect(badge.getAttribute('title')).toBe('Brilliant');
    expect(container.querySelector('.rv-fx--brilliant .rv-fx-spark')).toBeTruthy();
    expect(container.querySelectorAll('.rv-arrow--best')).toHaveLength(1);
    expect(container.querySelector('.rv-arrow--threat')?.getAttribute('stroke-dasharray')).toBeTruthy(); // not colour alone
    rerender(<Board position={pos} flipped={false} selectedSquare={null} destinationSquare={null} moves={[]} expandedLevel={1} exchangeStep={0} selectedDestInfo={null}
      moveBadge={{ square: 28, glyph: '✓', label: 'Good', color: '#c5d6b8', textColor: '#15171b', effect: null, id: 'b' }} />);
    expect(container.querySelector('.rv-fx-square')).toBeNull();
    expect(container.querySelector('.rv-movebadge')!.textContent).toBe('✓');
  });

  it('Analyze: after a bad move the reply is drawn on the board; the better move only on the position before it', async () => {
    const { container } = render(<AnalysisScreen engineClient={new DirectEngineClient()} initialPgn={SCHOLAR} onNavigate={() => {}} createReviewSearcher={fakeSearcher([])} />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Nf6' }));
    await waitFor(() => expect(container.querySelector('.rv-movebadge')?.textContent).toBe('??'));
    const toggle = screen.getByRole('button', { name: 'Show arrows' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true'); // on by default
    // After 3...Nf6: the better move for Black (g6: the pawn is still on g7) and White's reply (Qxf7#).
    expect(container.querySelectorAll('.rv-arrow--best')).toHaveLength(1);
    expect(container.querySelectorAll('.rv-arrow--threat')).toHaveLength(1);
    expect(container.querySelector('.rv-ghost')).toBeNull();
    expect(screen.getByText("Green arrow: g6, the better move for Black. Red dashed arrow: White's best reply, Qxf7#.")).toBeTruthy();
    expect(container.querySelector('#sq-62')?.getAttribute('aria-label')).toBe('g8, empty'); // the knight left g8

    // "Show g6 on the board": back to the position before 3...Nf6, with g7-g6 drawn where the pawn really is.
    fireEvent.click(screen.getByRole('button', { name: 'Show g6 on the board' }));
    expect(screen.getByText('Before 3... Nf6', { selector: '.rv-an-where' })).toBeTruthy();
    expect(container.querySelector('#sq-62')?.getAttribute('aria-label')).toMatch(/^g8, black knight/);
    expect(container.querySelector('#sq-54')?.getAttribute('aria-label')).toMatch(/^g7, black pawn/);
    expect(container.querySelectorAll('.rv-arrow--best')).toHaveLength(1);
    expect(container.querySelectorAll('.rv-arrow--threat')).toHaveLength(0);
    expect(container.querySelector('.rv-movebadge')).toBeNull();
    expect(screen.getByText('Green arrow: g6, the better move, on the position before 3... Nf6.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Nf6' }));
    expect(screen.getByText('After 3... Nf6', { selector: '.rv-an-where' })).toBeTruthy();
    // Moving on leaves the preview, and coming back shows the move played, not the old preview.
    fireEvent.click(screen.getByRole('button', { name: 'Show g6 on the board' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }));
    expect(screen.getByText('After 4. Qxf7#', { selector: '.rv-an-where' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }));
    expect(screen.getByText('After 3... Nf6', { selector: '.rv-an-where' })).toBeTruthy();
    expect(container.querySelector('#sq-62')?.getAttribute('aria-label')).toBe('g8, empty');
    expect(screen.getByRole('button', { name: 'Show g6 on the board' }).getAttribute('aria-pressed')).toBe('false');
    // Same through the move list and the keyboard: away and back again.
    fireEvent.click(screen.getByRole('button', { name: 'Show g6 on the board' }));
    fireEvent.click(screen.getByRole('button', { name: /^3\. Qh5/ }));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('After 3... Nf6', { selector: '.rv-an-where' })).toBeTruthy();
    expect(container.querySelector('.rv-movebadge')?.textContent).toBe('??');

    // Switching to a position (FEN) and back to the game does not bring the preview back either.
    fireEvent.click(screen.getByRole('button', { name: 'Show g6 on the board' }));
    expect(screen.getByText('Before 3... Nf6', { selector: '.rv-an-where' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Analyze from/ }));
    fireEvent.click(screen.getByRole('option', { name: /FEN/ }));
    await screen.findByText('Paste a position (FEN)');
    fireEvent.click(screen.getByRole('button', { name: /^Analyze from/ }));
    fireEvent.click(screen.getByRole('option', { name: /PGN/ }));
    expect(await screen.findByText('After 3... Nf6', { selector: '.rv-an-where' })).toBeTruthy();
    expect(container.querySelector('#sq-62')?.getAttribute('aria-label')).toBe('g8, empty');
    expect(screen.getByRole('button', { name: 'Show g6 on the board' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('Play: without training mode, "Analyze this position" waits for the end of the game', () => {
    const props = { engineClient: new DirectEngineClient(), game: newGame(), onNavigate: () => {} };
    const { rerender } = render(<PlayScreen {...props} settings={{ ...DEFAULT_SETTINGS, trainingMode: true }} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Analyze this position' })).toBeTruthy();
    rerender(<PlayScreen {...props} settings={{ ...DEFAULT_SETTINGS, trainingMode: false }} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Analyze this position' })).toBeNull();
    // The switches live in the Options menu, not on the page.
    expect(screen.queryByRole('switch', { name: /Training mode/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(screen.getByRole('switch', { name: /Training mode/ })).toBeTruthy();
    expect(screen.getByText('Off: Analyze opens when the game is over. Hints follow their own setting.')).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Show hints/ })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Labels on the board' })).toBeTruthy();
  });
});

describe('6D: arrows on every move, book moves, check and mate', () => {
  const searcherFrom = (table: Record<string, PvLine[]>): (() => Searcher) => () => ({
    search: async (fen: string) => table[fen.split(' ').slice(0, 4).join(' ')] ?? [{ uci: 'a2a3', score: { cp: 0 }, pv: ['a2a3'] }],
    cancel: () => undefined,
    dispose: () => undefined,
  });

  it('the better move starts from a faded copy of the piece when the move played took it away; the reply is blue', async () => {
    const PGN = '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/R3K3 w - - 0 1"]\n\n1. Ra2 *';
    const table = {
      '4k3/8/8/8/8/8/8/R3K3 w - -': [{ uci: 'a1a8', score: { cp: 600 }, pv: ['a1a8'] }, { uci: 'a1a7', score: { cp: 590 }, pv: ['a1a7'] }],
      '4k3/8/8/8/8/8/R7/4K3 b - -': [{ uci: 'e8d7', score: { cp: -560 }, pv: ['e8d7'] }],
    };
    const { container } = render(<AnalysisScreen engineClient={new DirectEngineClient()} initialPgn={PGN} onNavigate={() => {}} createReviewSearcher={searcherFrom(table)} />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Go to end' }));
    await waitFor(() => expect(container.querySelectorAll('.rv-arrow--best')).toHaveLength(1));
    expect(container.querySelector('.rv-ghost')).toBeTruthy(); // the rook left a1
    expect(container.querySelectorAll('.rv-arrow--reply')).toHaveLength(1);
    expect(screen.getByText("Green arrow: Ra8+, the better move for White (the faded piece shows where it stood). Blue arrow: Black's best reply, Kd7.")).toBeTruthy();
  });

  it('opening theory is a Book move, with the opening named', async () => {
    const r = await import('../../src/app/analysis/openingBook.js').then(m => m.loadOpeningBook());
    const line = lineFromPgn('1. e4 e6 2. Nc3 *');
    if (!line.ok) throw new Error(line.error);
    const fens = fensOf(line.line);
    expect(r.has(fens[3])).toBe(true);
    expect(r.name(fens[3])).toBe("French Defense: Queen's Knight");
    // 2.Nc3 is a little worse than 2.d4 at review depth (Excellent), but it is theory.
    const before: PositionEval = { lines: [{ uci: 'd2d4', score: { cp: 40 }, pv: ['d2d4'] }, { uci: 'b1c3', score: { cp: 30 }, pv: ['b1c3'] }] };
    const after: PositionEval = { lines: [{ uci: 'd7d5', score: { cp: -30 }, pv: ['d7d5'] }] };
    const { withBook } = await import('../../src/app/analysis/review.js');
    const rv = withBook(reviewMove(fens[2], line.line.game[2], line.line.game[1], before, after, false), r.name(fens[3]));
    expect(rv.rating).toBe('book');
    expect(rv.accuracy).toBe(100);
    expect(explainReview(rv, line.line.game[2])).toBe("Book move: French Defense: Queen's Knight.");
    // A bad move stays bad even in a book line.
    const bad = reviewMove(fens[2], line.line.game[2], line.line.game[1], { lines: [{ uci: 'd2d4', score: { cp: 200 }, pv: ['d2d4'] }] }, { lines: [{ uci: 'd7d5', score: { cp: 150 }, pv: ['d7d5'] }] }, false);
    expect(withBook(bad, null).rating).toBe(bad.rating);
  });

  it('check: the king shakes in a red glow; checkmate: a celebration says who won', () => {
    const fen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'; // after 2...Qh4#
    const pos = Chess.fromSetup(fenOps.parseFen(fen).unwrap()).unwrap();
    const props = { position: pos, flipped: false, selectedSquare: null, destinationSquare: null, moves: [], expandedLevel: 1, exchangeStep: 0, selectedDestInfo: null };
    const { container, rerender } = render(<Board {...props} checkSquare={4} checkKey={3} />);
    expect(container.querySelector('#sq-4 .rv-check-glow')).toBeTruthy();
    expect(container.querySelector('#sq-4 .rv-piece--check')).toBeTruthy();
    expect(container.querySelector('#sq-4')?.getAttribute('aria-label')).toMatch(/in check/);
    rerender(<Board {...props} checkSquare={4} checkKey={4} mate={{ winner: 'black', id: 'x' }} />);
    expect(container.querySelector('#sq-4 .rv-piece--mated')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Black wins!by checkmate/);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('6E: engine check in Analyze a position', () => {
  it('labels wait for the engine check, then show what it adds (Tactic on 5.Nxe5 in the Legal trap)', async () => {
    const fen = 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5';
    let release: (() => void) | null = null;
    const scores: Record<string, { cp: number }> = { a2a3: { cp: 0 }, a2a4: { cp: 0 }, b2b3: { cp: 0 }, h2h3: { cp: 0 }, d2d3: { cp: 10 }, f3e5: { cp: 420 }, f3h4: { cp: -50 } };
    const checker = {
      check: () => new Promise<typeof scores>(res => { release = () => res(scores); }),
      dispose: () => undefined,
    };
    const { container } = render(<AnalysisScreen engineClient={new DirectEngineClient()} initialFen={fen} onNavigate={() => {}} createChecker={() => checker} />);
    fireEvent.click(container.querySelector('#sq-21')!); // f3 knight
    await waitFor(() => expect(container.querySelector('#sq-36')?.getAttribute('aria-label')).toMatch(/legal destination/));
    await new Promise(r => setTimeout(r, 50));
    expect(container.querySelector('#sq-36')?.getAttribute('aria-label')).toBe('e5, black pawn, legal destination'); // no label yet
    await waitFor(() => expect(release).not.toBeNull());
    await act(async () => { release!(); });
    await waitFor(() => expect(container.querySelector('#sq-36')?.getAttribute('aria-label')).toBe('e5, black pawn, legal destination, Tactic'));
    fireEvent.mouseEnter(container.querySelector('#sq-36')!);
    expect(await screen.findByText('Engine check: strong only if you find the right follow-up — otherwise it can cost you.')).toBeTruthy();
    expect(screen.getByText(/^Square check: /)).toBeTruthy();
  });
});

describe('6E: labels on every square or only where you point', () => {
  afterEach(() => { localStorage.clear(); });

  it('the board shows the label only on the pointed square in "Only where I point" mode', () => {
    const pos = Chess.default();
    const moves = [{ move: { from: 'g1', to: 'f3' }, label: 'safe' }, { move: { from: 'g1', to: 'h3' }, label: 'loses_material' }] as never;
    const props = { position: pos, flipped: false, selectedSquare: 6, moves, expandedLevel: 1, exchangeStep: 0, selectedDestInfo: null };
    const { container, rerender } = render(<Board {...props} destinationSquare={null} />);
    expect(container.querySelectorAll('.rv-badge')).toHaveLength(2);
    rerender(<Board {...props} destinationSquare={null} labelMode="hover" />);
    expect(container.querySelectorAll('.rv-badge')).toHaveLength(0);
    expect(container.querySelector('#sq-21')?.getAttribute('aria-label')).toMatch(/Safe$/); // still read out
    rerender(<Board {...props} destinationSquare={21} labelMode="hover" />);
    expect(container.querySelectorAll('.rv-badge')).toHaveLength(1);
    expect(container.querySelector('#sq-21 .rv-badge')).toBeTruthy();
  });

  it('the choice is a site setting, changed from the Options menu', async () => {
    const { readSettings } = await import('../../src/app/settings.js');
    render(<AnalysisScreen engineClient={new DirectEngineClient()} initialFen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    const group = screen.getByRole('radiogroup', { name: 'Labels on the board' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Hovered square' }));
    expect(readSettings().labelMode).toBe('hover');
    expect(within(group).getByRole('radio', { name: 'Hovered square' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Options' }), { key: 'Escape' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});

describe('6E: help explains square labels vs move ratings', () => {
  it('lists every rating with its mark and meaning', async () => {
    const { Help } = await import('../../src/app/screens/Help.js');
    render(<Help onNavigate={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Square labels and move ratings' })).toBeTruthy();
    for (const word of ['Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder']) expect(screen.getAllByText(word).length).toBeGreaterThan(0);
    expect(screen.getByText(/the opponent's best reply after a mistake/)).toBeTruthy();
  });
});

describe('6E: arrows in Analyze a position', () => {
  it('are off by default there (they would give away a Tactic or a mate), and can be turned on', () => {
    render(<AnalysisScreen engineClient={new DirectEngineClient()} initialFen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" onNavigate={() => {}} />);
    expect(screen.getByRole('button', { name: 'Show arrows' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('6E review fixes', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it("the mate banner names the side whose moves are shown (Show moves for: Black)", async () => {
    const checker = {
      check: async (fen: string): Promise<Record<string, { cp: number } | { mate: number }>> =>
        (fen.split(' ')[1] === 'b' ? { e7e5: { mate: 1 }, d7d5: { cp: 0 } } : { e2e4: { cp: 20 }, d2d4: { cp: 20 } }),
      dispose: () => undefined,
    };
    render(<AnalysisScreen engineClient={new DirectEngineClient()} initialFen={START} onNavigate={() => {}} createChecker={() => checker} />);
    fireEvent.click(screen.getByRole('button', { name: 'Black' }));
    expect(await screen.findByText('Engine check: Black has a checkmate in 1. Can you find it?')).toBeTruthy();
    expect(screen.queryByText(/White has a checkmate/)).toBeNull();
  });

  it('says when the engine check is unavailable (no Web Workers), and keeps the square labels', async () => {
    const { container } = render(<AnalysisScreen engineClient={new DirectEngineClient()} initialFen={START} onNavigate={() => {}} />);
    expect(await screen.findByText('Engine check unavailable — showing square-safety labels only.')).toBeTruthy();
    fireEvent.click(container.querySelector('#sq-6')!); // g1 knight
    await waitFor(() => expect(container.querySelector('#sq-21')?.getAttribute('aria-label')).toBe('f3, empty, legal destination, Safe'));
  });

  it('the two-way choice buttons are at least 44 px tall (touch target)', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/app/styles/global.css', 'utf8');
    expect(css).toMatch(/\.rv-choice-opt\{[^}]*min-height:44px/);
  });
});

describe('6F: Miss, Book, Unclear', () => {
  it('a forced mate passed up is a Miss, and says which mate was there', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    const mv = { uci: 'h2h3', san: 'h3', color: 'white' as const, role: 'pawn' as const };
    const before: PositionEval = { lines: [{ uci: 'd1d8', score: { mate: 1 }, pv: ['d1d8'] }, { uci: 'h2h3', score: { cp: 450 }, pv: ['h2h3'] }] };
    const after: PositionEval = { lines: [{ uci: 'g8f8', score: { cp: -450 }, pv: ['g8f8'] }] };
    const rv = reviewMove(fen, mv as never, undefined, before, after, false);
    expect(rv.rating).toBe('miss');
    expect(explainReview(rv, mv as never)).toBe('Miss. You had a checkmate in 1, starting with Rd8#.');
  });

  it('the opening book covers the main lines of the common openings', async () => {
    const b = await import('../../src/app/analysis/openingBook.js').then(m => m.loadOpeningBook());
    const lines = [
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3',
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7',
      '1. d4 d5 2. Bf4 Nf6 3. e3 e6 4. Nf3 c5 5. c3 Nc6 6. Nbd2 Bd6',
      '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6',
      '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4 h6',
      '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6 5. Nf3 c6 6. Bc4 Bf5',
    ];
    for (const pgn of lines) {
      const r = lineFromPgn(pgn + ' *');
      if (!r.ok) throw new Error(r.error);
      expect(fensOf(r.line).slice(1).every(f => b.has(f))).toBe(true);
    }
  });

  it('a square that looks safe but loses to an engine-found reply is Unclear (a forced mate stays Loses material)', async () => {
    const { toDisplay } = await import('../../src/app/play/display.js');
    const base = { move: { from: 'e2', to: 'e4' }, label: 'safe', netMaterial: 0, reasons: [] } as never;
    expect(toDisplay(base, { kind: 'danger', mateAgainst: false }, false).label).toBe('unclear');
    expect(toDisplay(base, { kind: 'danger', mateAgainst: true }, false).label).toBe('loses_material');
  });
});

describe('6F: Play layout, hint, eval bar, license, pieces', () => {
  afterEach(() => { localStorage.clear(); });

  it('the evaluation bar keeps the last value while the next position is evaluated', () => {
    const { rerender } = render(<EvalBar score={{ cp: 230 }} flipped={false} />);
    expect(screen.getByText('+2.3', { selector: '.rv-evalbar-label' })).toBeTruthy();
    rerender(<EvalBar score={null} flipped={false} />);
    expect(screen.getByText('+2.3', { selector: '.rv-evalbar-label' })).toBeTruthy(); // not 0.0, not "…"
    expect(screen.getByRole('img', { name: 'Evaluating the new position…' })).toBeTruthy();
  });

  it('Play: Undo sits under the board; Hint only against the computer in Training mode; level picker on the side', async () => {
    const { PlayScreen } = await import('../../src/app/screens/PlayScreen.js');
    const base = { engineClient: new DirectEngineClient(), game: newGame(), onNavigate: () => {}, onChange: () => {} };
    const { container, rerender } = render(<PlayScreen {...base} settings={{ ...DEFAULT_SETTINGS, mode: 'two-player' }} />);
    expect(container.querySelector('.rv-board-actions')?.textContent).toMatch(/Undo/);
    expect(screen.queryByRole('button', { name: /Hint/ })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Computer level' })).toBeNull();
    rerender(<PlayScreen {...base} settings={{ ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'white', trainingMode: true }} />);
    expect(screen.getByRole('button', { name: /Hint/ })).toBeTruthy();
    expect(within(screen.getByRole('radiogroup', { name: 'Computer level' })).getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByRole('radiogroup', { name: 'Game' })).toBeTruthy();
    rerender(<PlayScreen {...base} settings={{ ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'white', trainingMode: false }} />);
    expect(screen.queryByRole('button', { name: /Hint/ })).toBeNull();
  });

  it('the hint explains the best move', async () => {
    const { hintText } = await import('../../src/app/play/hint.js');
    expect(hintText('d1h5', { d1h5: { mate: 2 }, a2a3: { cp: 0 } }, null, null)).toBe('It starts a forced checkmate in 2.');
    expect(hintText('d1d8', { d1d8: { mate: 1 } }, null, null)).toBe('It is checkmate.');
    expect(hintText('e2e4', { e2e4: { cp: 40 }, d2d4: { cp: 35 } }, null, null)).toBe("The engine's top move here. Engine: +0.4 for you.");
    expect(hintText('f3e5', { f3e5: { cp: 400 }, a2a3: { cp: 0 } }, null, null)).toBe("The engine's top move here. It's the only good move — everything else is clearly worse. Engine: +4.0 for you.");
  });

  it('Settings › License shows the full GPL text and the third-party notices; Pieces can be changed', async () => {
    const { SettingsPanel } = await import('../../src/app/components/SettingsPanel.js');
    const { DEFAULT_SETTINGS: S } = await import('../../src/app/settings.js');
    let saved = S;
    render(<SettingsPanel open={true} onClose={() => {}} settings={S} onChange={(s) => { saved = s; }} />);
    const pieces = screen.getByRole('radiogroup', { name: 'Pieces' });
    fireEvent.click(within(pieces).getByRole('radio', { name: 'Merida' }));
    expect(saved.pieceSet).toBe('merida');
    fireEvent.click(screen.getByRole('tab', { name: 'License' }));
    expect(await screen.findByText(/TERMS AND CONDITIONS/)).toBeTruthy();
    expect(screen.getByText(/Maurizio Monge \(MIT\)/)).toBeTruthy();
  });
});
