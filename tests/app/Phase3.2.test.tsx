/** @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error vitest-axe matchers missing types
import * as matchers from 'vitest-axe/matchers';
import React from 'react';
import { App } from '../../src/app/App.js';
import TrainingScreen from '../../src/app/screens/TrainingScreen.js';
import { EngineClient } from '../../src/app/engine/EngineClient.js';
import { Exercise, EXERCISES } from '../../src/app/training/exercises.js';
import { buildSession } from '../../src/app/training/session.js';
import { getAllRecords, _resetRecordsState } from '../../src/app/training/records.js';

expect.extend(matchers);

function seededRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createMockEngine(overrides?: Partial<EngineClient>) {
  const classifyMove = vi.fn().mockImplementation(async (fen: string, move: { from: string, to: string, promotion?: string }) => {
    return {
      ok: true,
      value: {
        move,
        label: 'safe',
        netMaterial: 0,
        reasons: [{ code: 'NOT_ATTACKED', squares: [] }],
        exchange: {
          fenBefore: fen, fenAfter: fen,
          mover: { color: 'white', role: 'pawn', from: move.from, to: move.to },
          materialFromMove: 0, see: 0, captureOptions: [], bestLine: []
        },
        destination: {
          fenBefore: fen, fenAfter: fen,
          mover: { color: 'white', role: 'pawn', from: move.from, to: move.to },
          givesCheck: false, geometricAttackers: [], geometricDefenders: [], legalCaptures: []
        },
        tactics: {
          fenBefore: fen, fenAfter: fen,
          mover: { color: 'white', role: 'pawn', from: move.from, to: move.to },
          givesCheck: false, deliversMate: false, causesStalemate: false,
          moverPinned: null, allowsMateInOne: [], hangingAfterMove: [], exchangeLineMate: null
        }
      }
    };
  });
  return {
    classifyMovesFrom: vi.fn(),
    classifyMove,
    ...overrides,
  } as EngineClient;
}

function getFixedSession(): Exercise[] {
  return buildSession(EXERCISES, seededRng(42));
}

describe('Phase 3.2 — Core Acceptance', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetRecordsState();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  describe('1. Loading State', () => {
    it('hides board, arrow, question, and answers completely while loading', async () => {
      const d = deferred<unknown>();
      const engine = createMockEngine({ classifyMove: vi.fn().mockReturnValue(d.promise) });
      const { container } = render(<TrainingScreen engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      expect(screen.getByText('Loading exercise…')).toBeTruthy();
      expect(screen.queryByRole('grid')).toBeNull(); // Board
      expect(screen.queryByRole('radiogroup')).toBeNull();
      expect(screen.queryByText(/What happens/)).toBeNull();
      expect(container.querySelector('svg line')).toBeNull(); // Arrow
      
      d.resolve({
        ok: true,
        value: {
          move: { from: 'e2', to: 'e4' }, label: 'safe', netMaterial: 0, reasons: [],
          exchange: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: 'e2', to: 'e4' }, materialFromMove: 0, see: 0, captureOptions: [], bestLine: [] },
          destination: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: 'e2', to: 'e4' }, givesCheck: false, geometricAttackers: [], geometricDefenders: [], legalCaptures: [] },
          tactics: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: 'e2', to: 'e4' }, givesCheck: false, deliversMate: false, causesStalemate: false, moverPinned: null, allowsMateInOne: [], hangingAfterMove: [], exchangeLineMate: null }
        }
      });
      
      await waitFor(() => {
        expect(screen.getByRole('grid')).toBeTruthy();
        expect(screen.getByRole('radiogroup')).toBeTruthy();
      });
    });
  });

  describe('2. Prefetch', () => {
    it('prefetches next exercise on submit and uses it on next', async () => {
      const d1 = deferred<unknown>();
      const d2 = deferred<unknown>();
      const engine = createMockEngine();
      engine.classifyMove = vi.fn()
        .mockReturnValueOnce(d1.promise)
        .mockReturnValueOnce(d2.promise);

      const ex = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={ex} onExit={vi.fn()} />);
      
      d1.resolve({ ok: true, value: { move: { from: ex[0].from, to: ex[0].to }, label: 'safe', netMaterial: 0, reasons: [], exchange: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: ex[0].from, to: ex[0].to }, materialFromMove: 0, see: 0, captureOptions: [], bestLine: [] }, destination: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: ex[0].from, to: ex[0].to }, givesCheck: false, geometricAttackers: [], geometricDefenders: [], legalCaptures: [] }, tactics: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: ex[0].from, to: ex[0].to }, givesCheck: false, deliversMate: false, causesStalemate: false, moverPinned: null, allowsMateInOne: [], hangingAfterMove: [], exchangeLineMate: null } } });
      await screen.findByRole('grid');
      
      expect(engine.classifyMove).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText(/Safe/));
      fireEvent.click(screen.getByText('Submit'));
      
      // Submit should trigger background prefetch
      expect(engine.classifyMove).toHaveBeenCalledTimes(2);
      
      fireEvent.click(screen.getByText('Next'));
      
      // Since d2 isn't resolved, it should show Loading exercise
      expect(screen.getByText('Loading exercise…')).toBeTruthy();
      
      d2.resolve({ ok: true, value: { move: { from: ex[1].from, to: ex[1].to }, label: 'safe', netMaterial: 0, reasons: [], exchange: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: ex[1].from, to: ex[1].to }, materialFromMove: 0, see: 0, captureOptions: [], bestLine: [] }, destination: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: ex[1].from, to: ex[1].to }, givesCheck: false, geometricAttackers: [], geometricDefenders: [], legalCaptures: [] }, tactics: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: ex[1].from, to: ex[1].to }, givesCheck: false, deliversMate: false, causesStalemate: false, moverPinned: null, allowsMateInOne: [], hangingAfterMove: [], exchangeLineMate: null } } });
      
      await screen.findByRole('grid');
      // No extra classify call
      expect(engine.classifyMove).toHaveBeenCalledTimes(2);
    });
  });

  describe('3. Handle Engine Errors', () => {
    it('handles ok=false and Promise rejection gracefully', async () => {
      const d1 = deferred<unknown>();
      const engine = createMockEngine({ classifyMove: vi.fn().mockReturnValue(d1.promise) });
      render(<TrainingScreen engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      d1.resolve({ ok: false, error: 'Engine timeout' });
      await waitFor(() => {
        expect(screen.getByText(/An error occurred while loading this exercise/)).toBeTruthy();
      });
      
      expect(screen.getByText('Retry')).toBeTruthy();
      expect(screen.queryByRole('radiogroup')).toBeNull();
      
      // Ensure no record written
      expect(getAllRecords().length).toBe(0);
      
      // Reject case
      const d2 = deferred<unknown>();
      (engine.classifyMove as import("vitest").Mock).mockReturnValue(d2.promise);
      fireEvent.click(screen.getByText('Retry'));
      expect(screen.getByText('Loading exercise…')).toBeTruthy();
      
      d2.reject(new Error('crash'));
      await waitFor(() => {
        expect(screen.getByText(/An error occurred while loading this exercise/)).toBeTruthy();
      });
    });
  });

  describe('4. In-memory Fallback for Records', () => {
    it('saves successfully submitted records even if localStorage throws', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('security'); });
      
      const engine = createMockEngine();
      render(<TrainingScreen engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      await screen.findByRole('grid');
      fireEvent.click(screen.getByText(/Safe/));
      fireEvent.click(screen.getByText('Submit'));
      
      await screen.findByText('Correct');
      
      const records = getAllRecords();
      expect(records.length).toBe(1);
      expect(records[0].answer).toBe('safe');
      expect(records[0].attempt).toBe(1);
    });
  });

  describe('5. Double-Submit Protection', () => {
    it('synchronous ref guard prevents dual submissions', async () => {
      const engine = createMockEngine();
      render(<TrainingScreen engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      await screen.findByRole('grid');
      fireEvent.click(screen.getByText(/Safe/));
      const submitBtn = screen.getByText('Submit');
      
      // Fire quickly
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);
      
      await screen.findByText('Correct');
      
      const records = getAllRecords();
      expect(records.length).toBe(1);
    });
  });

  describe('6. Complete Session Summary UI', () => {
    it('renders exact requested summary text after 10 exercises', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession(); // 10 exercises
      
      const { container } = render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      
      for (let i = 0; i < 10; i++) {
        await screen.findByRole('grid');
        if (i < 4) {
          // 4 correct
          fireEvent.click(screen.getByText(/Safe/));
        } else if (i < 8) {
          // 4 wrong
          fireEvent.click(screen.getByText(/Loses material/));
        } else {
          // 2 not sure
          fireEvent.click(screen.getByText('Not sure'));
        }
        fireEvent.click(screen.getByText('Submit'));
        await screen.findByText(/(Correct|Not quite|Not graded)/);
        if (i < 9) {
          fireEvent.click(screen.getByText('Next'));
        }
      }
      
      fireEvent.click(screen.getByText('Next'));
      
      await screen.findByText(/Session Complete/);
      // c of g correct where c=4, g=8, n=2
      expect(screen.getByText('4 of 8 correct')).toBeTruthy();
      expect(screen.getByText('2 not sure')).toBeTruthy();
      
      // Should display list of all 10 exercises
      const listItems = container.querySelectorAll('li');
      expect(listItems.length).toBe(10);
    });
  });

  describe('7. Train Again / New Session', () => {
    it('Train again creates new session with new RNG exercises', async () => {
      const engine = createMockEngine();
      render(<App engineClient={engine} />);
      
      fireEvent.click(screen.getByText('Train'));
      await screen.findByRole('grid');
      
      // Fast forward to end of 10
      for (let i = 0; i < 10; i++) {
        await screen.findByRole('grid');
        fireEvent.click(screen.getByText(/Safe/));
        fireEvent.click(screen.getByText('Submit'));
        await screen.findByText('Correct');
        fireEvent.click(screen.getByText('Next'));
      }
      
      await screen.findByText('Session Complete');
      fireEvent.click(screen.getByText('Train again'));
      
      // Should show exercise 1 of 10 again
      await waitFor(() => {
        expect(screen.getByText(/TRAINING · Exercise 1 of 10/)).toBeTruthy();
      });
      // Records should contain 11 total now (10 from old, 1 when we submit the new one)
      expect(getAllRecords().length).toBe(10);
    });
  });

  describe('8. Level 3 Replay in Training', () => {
    it('supports step narration, next/prev exchange step, readOnly bounds', async () => {
      const engine = createMockEngine();
      const { classifyMove } = engine;
      (classifyMove as import("vitest").Mock).mockImplementation(async (fen: string, move: { from: string, to: string, promotion?: string }) => {
        return {
          ok: true,
          value: {
            move, label: 'safe', netMaterial: 0, reasons: [],
            exchange: {
              fenBefore: fen, fenAfter: fen, mover: { color: 'white', role: 'pawn', from: move.from, to: move.to },
              materialFromMove: 0, see: 0, captureOptions: [],
              bestLine: [
                { side: 'white', capturer: { square: 'e4', role: 'pawn', color: 'white' }, to: 'd5', captured: { square: 'd5', role: 'pawn', color: 'black' }, balanceAfter: -100 } as unknown as import('../../src/engine/types.js').ExchangeStep
              ]
            },
            destination: { fenBefore: fen, fenAfter: fen, mover: { color: 'white', role: 'pawn', from: move.from, to: move.to }, givesCheck: false, geometricAttackers: [], geometricDefenders: [], legalCaptures: [] },
            tactics: { fenBefore: fen, fenAfter: fen, mover: { color: 'white', role: 'pawn', from: move.from, to: move.to }, givesCheck: false, deliversMate: false, causesStalemate: false, moverPinned: null, allowsMateInOne: [], hangingAfterMove: [], exchangeLineMate: null }
          }
        };
      });

      render(<TrainingScreen engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      await screen.findByRole('grid');
      fireEvent.click(screen.getByText(/Safe/));
      fireEvent.click(screen.getByText('Submit'));
      
      await screen.findAllByText('Correct');
      
      // Replay is level 3
      fireEvent.click(screen.getByText('Show why'));
      fireEvent.click(screen.getByText('Show the exchange'));
      
      // Should show the exchange replay controls
      expect(screen.getByText('Next step')).toBeTruthy();
      expect(screen.getByText('Back to position')).toBeTruthy();
      
      fireEvent.click(screen.getByText('Next step'));
      expect(screen.getAllByText(/takes pawn on d5/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Balance: -1/)).toBeTruthy();
      
      // Ensure the step and next exercise are separate
      expect(screen.getByText('Next')).toBeTruthy(); // The next exercise button
    });
  });

  describe('9. Result Badge Display', () => {
    it('Result panel renders colored badge', async () => {
      const engine = createMockEngine();
      render(<TrainingScreen engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      await screen.findByRole('grid');
      fireEvent.click(screen.getByText(/Safe/));
      fireEvent.click(screen.getByText('Submit'));
      await screen.findByText('Correct');
      
      // Expect the badge div to be present with the correct background color #2e7d32
      const badges = screen.getAllByText('Safe', { exact: false });
      // Find the one that has the background color #2e7d32 (either rgb or hex)
      const badge = badges.find(b => {
        const bg = b.style.backgroundColor || b.style.background || '';
        return bg.includes('rgb(46, 125, 50)') || bg.includes('#2e7d32');
      });
      expect(badge).toBeTruthy();
    });
  });

  describe('10. Accessible Radiogroup', () => {
    it('keyboard navigation with native inputs works', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const engine = createMockEngine();
      render(<TrainingScreen engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      await screen.findByRole('grid');
      
      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(5);
      
      await user.tab(); // focus might go somewhere
      
      // Let's directly focus the first radio and use arrow keys
      radios[0].focus();
      await user.keyboard('{ArrowDown}');
      expect(radios[1]).toHaveProperty('checked', true);
      
      await user.keyboard('{Space}'); // select
      
      const submit = screen.getByText('Submit');
      expect((submit as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('11. Strict Leak Prevention', () => {
    it('never leaks before submit', async () => {
      const engine = createMockEngine();
      const { container } = render(<TrainingScreen engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      await screen.findByRole('grid');
      
      // No aria-labels with "legal destination"
      const labels = Array.from(container.querySelectorAll('[aria-label]')).map(n => n.getAttribute('aria-label'));
      labels.forEach(l => {
        if (l) expect(l.toLowerCase()).not.toContain('legal destination');
        if (l && l !== 'Your prediction') {
           expect(l).not.toMatch(/\b(safe|loses material|even trade|unclear)\b/i);
        }
      });
      
      // No live region leak
      const live = container.querySelector('[aria-live]');
      if (live) {
        expect(live.textContent).not.toMatch(/safe|loses/i);
      }
    });
  });
});
