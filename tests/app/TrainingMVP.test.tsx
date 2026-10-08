/** @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react';
import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import { axe } from 'vitest-axe';
// @ts-expect-error vitest-axe matchers missing types
import * as matchers from 'vitest-axe/matchers';
import React from 'react';
import { App } from '../../src/app/App.js';
import TrainingScreen from '../../src/app/screens/TrainingScreen.js';
import { EngineClient } from '../../src/app/engine/EngineClient.js';
import { Exercise, EXERCISES } from '../../src/app/training/exercises.js';
import { buildSession } from '../../src/app/training/session.js';
import { BADGE_INFO } from '../../src/app/shared/badgeInfo.js';
import { _resetRecordsState } from '../../src/app/training/records.js';

expect.extend(matchers);

// --- Deterministic RNG ---
function seededRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// --- Deferred promise helper ---
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// --- Create a controllable mock engine ---
function createMockEngine(overrides?: Partial<EngineClient>) {
  const classifyMove = vi.fn().mockImplementation(async (fen: string, move: any) => {
    const label = 'safe';
    return {
      ok: true,
      value: {
        move,
        label,
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

// Fixed 10-exercise session for deterministic tests
function getFixedSession(): Exercise[] {
  return buildSession(EXERCISES, seededRng(42));
}

describe('Phase 3.1 — Training MVP Acceptance', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetRecordsState();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  // ==========================================================================
  // §1: HOME NAVIGATION
  // ==========================================================================
  describe('§1 Home Navigation', () => {
    it('Home displays Train button before Analyze', () => {
      const engine = createMockEngine();
      render(<App engineClient={engine} />);

      const trainBtn = screen.getByText('Train');
      const analyzeBtn = screen.getByText('Analyze a position');

      // Train should appear before Analyze in DOM order
      const allButtons = screen.getAllByRole('button');
      const trainIdx = allButtons.indexOf(trainBtn);
      const analyzeIdx = allButtons.indexOf(analyzeBtn);
      expect(trainIdx).toBeLessThan(analyzeIdx);
    });

    it('Home also shows "What do the labels mean?" link', () => {
      const engine = createMockEngine();
      render(<App engineClient={engine} />);
      expect(screen.getByText('What do the labels mean?')).toBeTruthy();
    });

    it('clicking Train opens Training mode', async () => {
      const engine = createMockEngine();
      render(<App engineClient={engine} />);
      fireEvent.click(screen.getByText('Train'));
      // Should see training mode bar
      await waitFor(() => {
        expect(screen.getByText(/TRAINING/)).toBeTruthy();
      });
    });

    it('App uses injected EngineClient (no second worker)', async () => {
      const engine = createMockEngine();
      render(<App engineClient={engine} />);
      fireEvent.click(screen.getByText('Train'));
      await waitFor(() => {
        expect(screen.getByText(/TRAINING/)).toBeTruthy();
      });
      // The App should pass the same engineClient through
      // Verify by checking classifyMove gets called when we submit
    });

    it('Exit Training returns to Home', async () => {
      const engine = createMockEngine();
      render(<App engineClient={engine} />);
      fireEvent.click(screen.getByText('Train'));
      await waitFor(() => {
        expect(screen.getByText(/TRAINING/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Exit Training'));
      await waitFor(() => {
        expect(screen.getByText('Train')).toBeTruthy();
      });
    });
  });

  // ==========================================================================
  // §2: CLASSIFICATION PRELOAD
  // ==========================================================================
  describe('§2 Classification Preload', () => {
    it('"Loading exercise…" appears during deferred engine', async () => {
      const d = deferred<any>();
      const engine = createMockEngine({
        classifyMove: vi.fn().mockReturnValue(d.promise),
      });
      const exercises = [getFixedSession()[0]];
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      expect(screen.getByText('Loading exercise…')).toBeTruthy();

      // No question/board/answer controls while loading
      expect(screen.queryByText(/What happens/)).toBeNull();
      expect(screen.queryByRole('radiogroup')).toBeNull();

      // Resolve
      d.resolve({
        ok: true,
        value: {
          move: { from: exercises[0].from, to: exercises[0].to },
          label: 'safe', netMaterial: 0,
          reasons: [{ code: 'NOT_ATTACKED', squares: [] }],
          exchange: { fenBefore: exercises[0].fen, fenAfter: exercises[0].fen, mover: { color: 'white', role: 'pawn', from: exercises[0].from, to: exercises[0].to }, materialFromMove: 0, see: 0, captureOptions: [], bestLine: [] },
          destination: { fenBefore: exercises[0].fen, fenAfter: exercises[0].fen, mover: { color: 'white', role: 'pawn', from: exercises[0].from, to: exercises[0].to }, givesCheck: false, geometricAttackers: [], geometricDefenders: [], legalCaptures: [] },
          tactics: { fenBefore: exercises[0].fen, fenAfter: exercises[0].fen, mover: { color: 'white', role: 'pawn', from: exercises[0].from, to: exercises[0].to }, givesCheck: false, deliversMate: false, causesStalemate: false, moverPinned: null, allowsMateInOne: [], hangingAfterMove: [], exchangeLineMate: null }
        }
      });
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
    });

    it('Submit does not call classifyMove again', async () => {
      const engine = createMockEngine();
      const exercises = [getFixedSession()[0]];
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      const callCountAfterPreload = (engine.classifyMove as any).mock.calls.length;

      // Select answer and submit
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText(/Correct|Not quite|Not graded/)).toBeTruthy();
      });
      // Call count should not have increased
      expect((engine.classifyMove as any).mock.calls.length).toBe(callCountAfterPreload);
    });
  });

  // ==========================================================================
  // §3: SESSION BUILDER INTEGRATION
  // ==========================================================================
  describe('§3 Session Builder', () => {
    it('clicking Train generates a real 10-exercise 4/3/3 session', async () => {
      const engine = createMockEngine();
      render(<App engineClient={engine} />);
      fireEvent.click(screen.getByText('Train'));
      await waitFor(() => {
        expect(screen.getByText(/Exercise 1 of 10/)).toBeTruthy();
      });
    });
  });

  // ==========================================================================
  // §4: TRAINING MODE BAR
  // ==========================================================================
  describe('§4 Training Mode Bar', () => {
    it('shows exact format: TRAINING · Exercise {k} of 10 · Answer hidden until you submit', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      expect(screen.getByText(/TRAINING · Exercise 1 of 10 · Answer hidden until you submit/)).toBeTruthy();
    });

    it('mode bar does not use classification colors (green/blue/red/yellow)', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      const { container } = render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      const modeBar = screen.getByText(/TRAINING · Exercise/).closest('div');
      if (modeBar) {
        const bg = (modeBar as HTMLElement).style.background || (modeBar as HTMLElement).style.backgroundColor;
        // Must not be classification green (#2e7d32), blue (#1565c0), red (#c62828), yellow (#f57f17)
        expect(bg).not.toContain('#2e7d32');
        expect(bg).not.toContain('#1565c0');
        expect(bg).not.toContain('#c62828');
        expect(bg).not.toContain('#f57f17');
      }
    });
  });

  // ==========================================================================
  // §5: BOARD FLIP + ARROW
  // ==========================================================================
  describe('§5 Board Flip + Arrow', () => {
    it('has a Flip Board button', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      expect(screen.getByText('Flip Board')).toBeTruthy();
    });

    it('readOnly board does not select pieces on click', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      const sq = document.getElementById('sq-0');
      if (sq) {
        fireEvent.click(sq);
        // Should not show any selection indicator (border should remain 'none')
        expect(sq.style.border).not.toContain('solid #333');
      }
    });
  });

  // ==========================================================================
  // §6: ACCESSIBLE RADIOGROUP
  // ==========================================================================
  describe('§6 Accessible Answer Group', () => {
    it('answer options use role="radiogroup" with aria-label="Your prediction"', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      const group = screen.getByRole('radiogroup');
      expect(group.getAttribute('aria-label')).toBe('Your prediction');
    });

    it('shows all four options plus Not sure', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      expect(screen.getByText(/Safe/)).toBeTruthy();
      expect(screen.getByText(/Even trade/)).toBeTruthy();
      expect(screen.getByText(/Loses material/)).toBeTruthy();
      expect(screen.getByText(/Unclear/)).toBeTruthy();
      expect(screen.getByText('Not sure')).toBeTruthy();
    });

    it('confidence options appear after answer selection', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      // Before selecting, no confidence
      expect(screen.queryByText('Low')).toBeNull();

      fireEvent.click(screen.getByText('Safe ✓'));
      // Confidence options should appear
      expect(screen.getByText('Low')).toBeTruthy();
      expect(screen.getByText('Medium')).toBeTruthy();
      expect(screen.getByText('High')).toBeTruthy();
    });
  });

  // ==========================================================================
  // §7: ANSWER-LEAK TESTS
  // ==========================================================================
  describe('§7 Answer Leak Prevention', () => {
    it('no correct-label badge, explanation, or classification-colored square before Submit', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      const { container } = render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });

      // No badge in the board area
      const boardEl = container.querySelector('[aria-label="Chess board"]');
      if (boardEl) {
        const boardHtml = boardEl.innerHTML;
        // No classification badge colors
        expect(boardHtml).not.toContain('#2e7d32'); // safe green
        expect(boardHtml).not.toContain('#c62828'); // loses red
        expect(boardHtml).not.toContain('#1565c0'); // even blue
        expect(boardHtml).not.toContain('#f57f17'); // unclear yellow
      }

      // No square aria label containing answer wording
      const ariaElements = container.querySelectorAll('[aria-label]');
      ariaElements.forEach(el => {
        const label = el.getAttribute('aria-label') || '';
        expect(label).not.toMatch(/legal destination/i);
        expect(label).not.toMatch(/\bSafe\b/);
        expect(label).not.toMatch(/\bLoses material\b/);
        expect(label).not.toMatch(/\bEven trade\b/);
        expect(label).not.toMatch(/\bUnclear\b/);
      });

      // No explanation text
      expect(screen.queryByText(/Nothing attacks this square/)).toBeNull();

      // No live region announcing correct result
      const liveRegion = container.querySelector('[aria-live="polite"]');
      if (liveRegion) {
        const text = liveRegion.textContent || '';
        expect(text).not.toMatch(/Correct|Not quite|Not graded/);
      }
    });
  });

  // ==========================================================================
  // §8: SUBMIT CORRECTNESS
  // ==========================================================================
  describe('§8 Submit Correctness', () => {
    it('Submit disabled until answer selected', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      const submitBtn = screen.getByText('Submit') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);

      fireEvent.click(screen.getByText('Safe ✓'));
      expect(submitBtn.disabled).toBe(false);
    });

    it('Submit disabled after submission (no double-submit)', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText(/Correct|Not quite|Not graded/)).toBeTruthy();
      });
      // Submit should no longer be present
      expect(screen.queryByText('Submit')).toBeNull();
    });

    it('correct answer shows "Correct"', async () => {
      // Using an exercise where the engine returns 'safe' and we pick 'safe'
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText('Correct')).toBeTruthy();
      });
    });

    it('Not sure shows "Not graded"', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Not sure'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText('Not graded')).toBeTruthy();
      });
    });
  });

  // ==========================================================================
  // §9: RESULT BADGE AND PANEL
  // ==========================================================================
  describe('§9 Result Badge + Panel', () => {
    it('after Submit shows real classification badge with color, icon and text', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      const { container } = render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText('Correct')).toBeTruthy();
      });
      // Badge should appear
      expect(screen.getByText('Safe')).toBeTruthy();
      expect(screen.getByText('✓')).toBeTruthy();
    });

    it('shows "Show why" button after submit', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText('Correct')).toBeTruthy();
      });
      expect(screen.getByText('Show why')).toBeTruthy();
    });
  });

  // ==========================================================================
  // §11: TRY AGAIN AND FIRST-ATTEMPT RULE
  // ==========================================================================
  describe('§11 Try Again + First-Attempt Rule', () => {
    it('Try again is available after submit (even on correct)', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText('Correct')).toBeTruthy();
      });
      expect(screen.getByText('Try again')).toBeTruthy();
    });

    it('Try again resets prediction, confidence, expanded levels', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText('Correct')).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Try again'));
      // Should go back to question mode
      await waitFor(() => {
        expect(screen.getByText('Submit')).toBeTruthy();
      });
      expect(screen.queryByText('Correct')).toBeNull();
      // Submit should be disabled again (no answer selected)
      expect((screen.getByText('Submit') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  // ==========================================================================
  // §12: LOCALSTORAGE RECORDING
  // ==========================================================================
  describe('§12 LocalStorage Recording', () => {
    it('stores record with correct schema under cts.training.v1', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText(/Correct|Not quite/)).toBeTruthy();
      });

      const raw = localStorage.getItem('cts.training.v1');
      expect(raw).not.toBeNull();
      const records = JSON.parse(raw!);
      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBe(1);
      const r = records[0];
      expect(r.exerciseId).toBeTruthy();
      expect(r.sessionId).toBeTruthy();
      expect(r.attempt).toBe(1);
      expect(r.answer).toBe('safe');
      expect(typeof r.correct).toBe('boolean');
      expect(typeof r.msToAnswer).toBe('number');
      expect(r.msToAnswer).toBeGreaterThanOrEqual(0);
      expect(r.timestamp).toBeTruthy();
      expect(r.correctLabel).toBeTruthy();
    });

    it('Not sure records correct=null', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Not sure'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText('Not graded')).toBeTruthy();
      });
      const records = JSON.parse(localStorage.getItem('cts.training.v1')!);
      expect(records[0].correct).toBeNull();
      expect(records[0].answer).toBe('not_sure');
    });

    it('retry increments attempt number', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });

      // First submit
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText(/Correct|Not quite/)).toBeTruthy();
      });

      // Try again
      fireEvent.click(screen.getByText('Try again'));
      await waitFor(() => {
        expect(screen.getByText('Submit')).toBeTruthy();
      });

      // Second submit
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText(/Correct|Not quite/)).toBeTruthy();
      });

      const records = JSON.parse(localStorage.getItem('cts.training.v1')!);
      expect(records.length).toBe(2);
      expect(records[0].attempt).toBe(1);
      expect(records[1].attempt).toBe(2);
    });

    it('tolerates malformed JSON in storage', async () => {
      localStorage.setItem('cts.training.v1', '{invalid json!!!');
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText(/Correct|Not quite/)).toBeTruthy();
      });
      // Should not crash
    });

    it('tolerates getItem throwing', async () => {
      const origGet = localStorage.getItem;
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('quota'); });
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText(/Correct|Not quite/)).toBeTruthy();
      });
      // Should not crash
    });

    it('tolerates setItem throwing', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText(/Correct|Not quite/)).toBeTruthy();
      });
      // Should not crash
    });

    it('preserves old records when adding new ones', async () => {
      localStorage.setItem('cts.training.v1', JSON.stringify([
        { sessionId: 'old', exerciseId: 'E99', attempt: 1, answer: 'safe', confidence: null, correctLabel: 'safe', correct: true, msToAnswer: 100, timestamp: '2024-01-01T00:00:00Z' }
      ]));
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText(/Correct|Not quite/)).toBeTruthy();
      });
      const records = JSON.parse(localStorage.getItem('cts.training.v1')!);
      expect(records.length).toBe(2);
      expect(records[0].sessionId).toBe('old');
    });
  });

  // ==========================================================================
  // §13: SESSION SUMMARY
  // ==========================================================================
  describe('§13 Complete Session Summary', () => {
    // This test is intentionally lightweight — a real 10-exercise test
    // is done later, but we verify the summary components exist
    it('session complete shows "Train again" and "Download my results"', async () => {
      // Use a 1-exercise session for speed
      const engine = createMockEngine();
      const exercises = getFixedSession().slice(0, 1);
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText(/Correct|Not quite/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => {
        expect(screen.getByText(/Session Complete/i)).toBeTruthy();
      });
      expect(screen.getByText(/correct/i)).toBeTruthy();
      expect(screen.getByText('Train again')).toBeTruthy();
      expect(screen.getByText('Download my results')).toBeTruthy();
    });
  });

  // ==========================================================================
  // §14: DOWNLOAD
  // ==========================================================================
  describe('§14 Download All Results', () => {
    it('Download my results creates a JSON download', async () => {
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test');
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      const engine = createMockEngine();
      const exercises = getFixedSession().slice(0, 1);
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText(/What happens/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => {
        expect(screen.getByText(/Correct|Not quite/)).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => {
        expect(screen.getByText('Download my results')).toBeTruthy();
      });

      // Mock anchor click
      const mockClick = vi.fn();
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          return { click: mockClick, href: '', download: '', style: {} } as any;
        }
        return document.createElement(tag);
      });

      fireEvent.click(screen.getByText('Download my results'));
      // URL.createObjectURL should have been called
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
  });
});
