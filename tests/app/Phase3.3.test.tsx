/** @vitest-environment jsdom */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import TrainingScreen from '../../src/app/screens/TrainingScreen.js';
import { EngineClient } from '../../src/app/engine/EngineClient.js';
import { Exercise, EXERCISES } from '../../src/app/training/exercises.js';
import { buildSession } from '../../src/app/training/session.js';
import { _resetRecordsState } from '../../src/app/training/records.js';

// --- Deterministic RNG ---
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

// Mock URL.createObjectURL for download test
if (typeof window !== 'undefined') {
  window.URL.createObjectURL = vi.fn(() => 'blob:test-url');
  window.URL.revokeObjectURL = vi.fn();
}

describe('Phase 3.3 — Final P0 Defects', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetRecordsState();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  describe('1. Atomic Exercise Transitions', () => {
    it('Next immediately enters loading state and hides previous answer', async () => {
      const d1 = deferred<unknown>();
      const d2 = deferred<unknown>();
      const engine = createMockEngine();
      engine.classifyMove = vi.fn()
        .mockReturnValueOnce(d1.promise)
        .mockReturnValueOnce(d2.promise);

      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);

      d1.resolve({ ok: true, value: { move: { from: 'e2', to: 'e4' }, label: 'safe', netMaterial: 0, reasons: [], exchange: { bestLine: [] }, destination: { legalCaptures: [] }, tactics: { allowsMateInOne: [], hangingAfterMove: [] } } });
      await screen.findByRole('grid');

      fireEvent.click(screen.getByText(/Safe/));
      fireEvent.click(screen.getByText('Submit'));
      await screen.findByText('Correct');

      // Now click Next. d2 is NOT resolved yet.
      // Transition MUST be atomic: Loading must show, old grid must disappear.
      fireEvent.click(screen.getByText('Next'));
      
      expect(screen.queryByText('Correct')).toBeNull();
      expect(screen.queryByRole('grid')).toBeNull();
      expect(screen.getByText('Loading exercise…')).toBeTruthy();

      d2.resolve({ ok: true, value: { move: { from: 'd2', to: 'd4' }, label: 'loses_material', netMaterial: 0, reasons: [], exchange: { bestLine: [] }, destination: { legalCaptures: [] }, tactics: { allowsMateInOne: [], hangingAfterMove: [] } } });
      await screen.findByRole('grid');
    });
  });

  describe('2. Actual Async Request Invalidation', () => {
    it('ignores stale success/rejection from a previous exercise', async () => {
      const d1 = deferred<unknown>();
      const d2 = deferred<unknown>();
      const engine = createMockEngine();
      engine.classifyMove = vi.fn()
        .mockReturnValueOnce(d1.promise)
        .mockReturnValueOnce(d2.promise);

      const exercises = getFixedSession();
      const { unmount } = render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);

      // Fast forward by changing props
      unmount();
      render(<TrainingScreen engineClient={engine} exercises={exercises.slice(1)} onExit={vi.fn()} />);

      // Resolving the first promise should NOT affect the current screen
      d1.resolve({ ok: true, value: { move: { from: 'e2', to: 'e4' }, label: 'safe', netMaterial: 0, reasons: [], exchange: { bestLine: [] }, destination: { legalCaptures: [] }, tactics: { allowsMateInOne: [], hangingAfterMove: [] } } });
      
      // The screen should still be loading the second exercise
      expect(screen.getByText('Loading exercise…')).toBeTruthy();
      
      // Rejecting first promise shouldn't error the screen
      d1.reject(new Error('crash'));
      expect(screen.queryByText(/error occurred/i)).toBeNull();

      d2.resolve({ ok: true, value: { move: { from: 'd2', to: 'd4' }, label: 'safe', netMaterial: 0, reasons: [], exchange: { bestLine: [] }, destination: { legalCaptures: [] }, tactics: { allowsMateInOne: [], hangingAfterMove: [] } } });
      await screen.findByRole('grid');
    });
  });

  describe('3. First-Attempt Scoring with Retries', () => {
    it('correctly scores first attempt when learner retries', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession(); // length 10
      render(<TrainingScreen engineClient={engine} exercises={exercises} onExit={vi.fn()} />);
      
      for (let i = 0; i < 10; i++) {
        await screen.findByRole('grid');
        
        if (i === 0) {
          // Attempt 1: wrong
          fireEvent.click(screen.getByText(/Loses material/));
          fireEvent.click(screen.getByText('Submit'));
          await screen.findByText(/Not quite/);
          
          fireEvent.click(screen.getByText('Try again'));
          
          // Attempt 2: correct
          fireEvent.click(screen.getByText(/Safe/));
          fireEvent.click(screen.getByText('Submit'));
          await screen.findAllByText('Correct');
        } else if (i === 1) {
          // Attempt 1: not_sure
          fireEvent.click(screen.getByText('Not sure'));
          fireEvent.click(screen.getByText('Submit'));
          await screen.findByText('Not graded');
          
          fireEvent.click(screen.getByText('Try again'));
          
          // Attempt 2: correct
          fireEvent.click(screen.getByText(/Safe/));
          fireEvent.click(screen.getByText('Submit'));
          await screen.findAllByText('Correct');
        } else {
          // correct
          fireEvent.click(screen.getByText(/Safe/));
          fireEvent.click(screen.getByText('Submit'));
          await screen.findByText('Correct');
        }
        
        if (i < 9) fireEvent.click(screen.getByText('Next'));
      }
      
      fireEvent.click(screen.getByText('Next'));
      await screen.findByText('Session Complete');
      
      // c = 8, g = 9 (exercise 0 was graded wrong first, exercise 1 was not graded first)
      expect(screen.getByText('8 of 9 correct')).toBeTruthy();
      expect(screen.getByText('1 not sure')).toBeTruthy();
    }, 15000);
  });

  describe('4. Complete Results Download', () => {
    it('Blob contains all records correctly', async () => {
      const engine = createMockEngine();
      const exercises = getFixedSession();
      render(<TrainingScreen engineClient={engine} exercises={exercises.slice(0, 1)} onExit={vi.fn()} />);
      
      await screen.findByRole('grid');
      
      // Attempt 1: wrong
      fireEvent.click(await screen.findByText(/Loses material/));
      fireEvent.click(screen.getByText('Submit'));
      await screen.findByText(/Not quite/);
      fireEvent.click(screen.getByText('Try again'));
      // Attempt 2: correct
      fireEvent.click(screen.getByText(/Safe/));
      fireEvent.click(screen.getByText('Submit'));
      await screen.findAllByText('Correct');
      fireEvent.click(screen.getByText('Next'));
      
      fireEvent.click(screen.getByText('Download my results'));
      
      const calls = (window.URL.createObjectURL as import("vitest").Mock).mock.calls;
      expect(calls.length).toBe(1);
      const blob = calls[0][0] as Blob;
      
      const text = await blob.text();
      const parsed = JSON.parse(text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0].attempt).toBe(1);
      expect(parsed[0].answer).toBe('loses_material');
      expect(parsed[1].attempt).toBe(2);
      expect(parsed[1].answer).toBe('safe');
      
      expect(window.URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe('5. Session Complete Home Action', () => {
    it('provides a Home button distinct from Train again', async () => {
      const onExit = vi.fn();
      const onTrainAgain = vi.fn();
      const engine = createMockEngine();
      const exercises = getFixedSession();
      
      // only 1 exercise
      render(<TrainingScreen engineClient={engine} exercises={exercises.slice(0, 1)} onExit={onExit} onTrainAgain={onTrainAgain} />);
      
      await screen.findByRole('grid');
      fireEvent.click(screen.getByText(/Safe/));
      fireEvent.click(screen.getByText('Submit'));
      await screen.findByText('Correct');
      fireEvent.click(screen.getByText('Next'));
      
      await screen.findByText('Session Complete');
      
      fireEvent.click(screen.getByText('Home'));
      expect(onExit).toHaveBeenCalled();
      
      fireEvent.click(screen.getByText('Train again'));
      expect(onTrainAgain).toHaveBeenCalled();
    });
  });
});
