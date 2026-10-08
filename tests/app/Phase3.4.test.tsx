/** @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import TrainingScreen from '../../src/app/screens/TrainingScreen.js';

import { Exercise } from '../../src/app/training/exercises.js';
import { EngineClient } from '../../src/app/engine/EngineClient.js';
import { MoveInput, Result, MoveClassification } from '../../src/engine/types.js';

function deferred<T = unknown>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const getFixedSession = (): Exercise[] => [
  { id: 'E01', difficulty: 1, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', from: 'e2', to: 'e4' },
  { id: 'E02', difficulty: 1, fen: '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', from: 'd1', to: 'd5' }
];

function createClassifyResult(move: MoveInput, fen: string): Result<MoveClassification> {
  return {
    ok: true, value: {
      move, label: 'safe', netMaterial: 0, reasons: [],
      exchange: { fenBefore: fen, fenAfter: fen, mover: { color: 'white', role: 'pawn', from: move.from, to: move.to }, materialFromMove: 0, see: 0, captureOptions: [], bestLine: [] },
      destination: { fenBefore: fen, fenAfter: fen, mover: { color: 'white', role: 'pawn', from: move.from, to: move.to }, givesCheck: false, geometricAttackers: [], geometricDefenders: [], legalCaptures: [] },
      tactics: { fenBefore: fen, fenAfter: fen, mover: { color: 'white', role: 'pawn', from: move.from, to: move.to }, givesCheck: false, deliversMate: false, causesStalemate: false, moverPinned: null, allowsMateInOne: [], hangingAfterMove: [], exchangeLineMate: null }
    }
  };
}

describe('Phase 3.4 — Async Race Conditions and Prefetch', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('Request-Generation Token (Scenarios A-E)', () => {
    it('Scenario A: Stale success after exercise transition', async () => {
      const d1 = deferred<Result<MoveClassification>>();
      const d2 = deferred<Result<MoveClassification>>();
      
      const engine: EngineClient = {
        classifyMovesFrom: vi.fn<EngineClient['classifyMovesFrom']>(),
        classifyMove: vi.fn<EngineClient['classifyMove']>()
          .mockReturnValueOnce(d1.promise)
          .mockReturnValueOnce(d2.promise)
      };

      const { rerender } = render(<TrainingScreen key="A" engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      // Transition by completely remounting (simulating new session/hard transition)
      rerender(<TrainingScreen key="B" engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      // Old request resolves
      d1.resolve(createClassifyResult({ from: 'e2', to: 'e4' }, 'stale_fen'));
      await new Promise(r => setTimeout(r, 0));
      
      // Should not show question, should still be loading
      expect(screen.getByText('Loading exercise…')).toBeTruthy();
      expect(screen.queryByText(/What happens/i)).toBeNull();
    });

    it('Scenario B: Stale rejection after exercise transition', async () => {
      const d1 = deferred<Result<MoveClassification>>();
      const d2 = deferred<Result<MoveClassification>>();
      
      const engine: EngineClient = {
        classifyMovesFrom: vi.fn<EngineClient['classifyMovesFrom']>(),
        classifyMove: vi.fn<EngineClient['classifyMove']>()
          .mockReturnValueOnce(d1.promise)
          .mockReturnValueOnce(d2.promise)
      };

      const { rerender } = render(<TrainingScreen key="A" engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      rerender(<TrainingScreen key="B" engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      // Old request rejects
      d1.reject(new Error('fail'));
      await new Promise(r => setTimeout(r, 0));
      
      // Should not show error/retry
      expect(screen.getByText('Loading exercise…')).toBeTruthy();
      expect(screen.queryByText('Retry')).toBeNull();
    });

    it('Scenario C: Retry/new request cannot be overwritten by an older completion', async () => {
      const d1 = deferred<Result<MoveClassification>>(); // from mount A
      const d2 = deferred<Result<MoveClassification>>(); // from mount B
      const d3 = deferred<Result<MoveClassification>>(); // from retry on B
      
      const engine: EngineClient = {
        classifyMovesFrom: vi.fn<EngineClient['classifyMovesFrom']>(),
        classifyMove: vi.fn<EngineClient['classifyMove']>()
          .mockReturnValueOnce(d1.promise)
          .mockReturnValueOnce(d2.promise)
          .mockReturnValueOnce(d3.promise)
      };

      const { rerender } = render(<TrainingScreen key="A" engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      rerender(<TrainingScreen key="B" engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      // Current request (d2) fails
      d2.reject(new Error('fail'));
      await waitFor(() => screen.getByText('Retry'));
      
      // Click retry -> creates d3
      fireEvent.click(screen.getByText('Retry'));
      expect(screen.getByText('Loading exercise…')).toBeTruthy();
      
      // Old request (d1) resolves
      d1.resolve(createClassifyResult({ from: 'e2', to: 'e4' }, 'stale_fen'));
      await new Promise(r => setTimeout(r, 0));
      
      // Should still be loading for d3
      expect(screen.getByText('Loading exercise…')).toBeTruthy();
      
      // Current valid request (d3) resolves
      d3.resolve(createClassifyResult({ from: 'd1', to: 'd5' }, 'valid_fen'));
      await screen.findByText(/What happens/i);
    });

    it('Scenario D: Unmount before pending result resolves', async () => {
      const d1 = deferred<Result<MoveClassification>>();
      const engine: EngineClient = {
        classifyMovesFrom: vi.fn<EngineClient['classifyMovesFrom']>(),
        classifyMove: vi.fn<EngineClient['classifyMove']>().mockReturnValueOnce(d1.promise)
      };

      const { unmount } = render(<TrainingScreen engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      unmount();
      
      d1.resolve(createClassifyResult({ from: 'e2', to: 'e4' }, 'fen'));
      await new Promise(r => setTimeout(r, 0));
      // No crash should happen
    });

    it('Scenario E: Latest valid request succeeds', async () => {
      const d1 = deferred<Result<MoveClassification>>();
      const engine: EngineClient = {
        classifyMovesFrom: vi.fn<EngineClient['classifyMovesFrom']>(),
        classifyMove: vi.fn<EngineClient['classifyMove']>().mockReturnValueOnce(d1.promise)
      };

      render(<TrainingScreen engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      d1.resolve(createClassifyResult({ from: 'e2', to: 'e4' }, 'fen'));
      await screen.findByText(/What happens/i);
    });
  });

  describe('Scenario F: Prefetch Failure Handling', () => {
    it('Prefetch rejects BEFORE Next. Next shows neutral error. Retry succeeds.', async () => {
      const d1 = deferred<Result<MoveClassification>>();
      const d2 = deferred<Result<MoveClassification>>(); // Prefetch B
      const d3 = deferred<Result<MoveClassification>>(); // Retry B
      
      const engine: EngineClient = {
        classifyMovesFrom: vi.fn<EngineClient['classifyMovesFrom']>(),
        classifyMove: vi.fn<EngineClient['classifyMove']>()
          .mockReturnValueOnce(d1.promise)
          .mockReturnValueOnce(d2.promise)
          .mockReturnValueOnce(d3.promise)
      };

      render(<TrainingScreen engineClient={engine} exercises={getFixedSession()} onExit={vi.fn()} />);
      
      // 1. Current A successfully classified
      d1.resolve(createClassifyResult({ from: 'e2', to: 'e4' }, getFixedSession()[0].fen));
      await screen.findByText(/What happens/i);
      
      // 2. Submit A
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await screen.findByText('Correct'); // A reveal remains correct
      
      // 3. Prefetch B begins (d2) and rejects before Next (d2 rejects)
      d2.reject(new Error('Prefetch fail'));
      await new Promise(r => setTimeout(r, 0));
      
      // 5. A reveal remains correct (no crash or leak)
      expect(screen.getByText('Correct')).toBeTruthy();
      
      // 6. Click Next
      fireEvent.click(screen.getByText('Next'));
      
      // 7. B shows neutral Retry UI
      await waitFor(() => screen.getByText('Retry'));
      
      // 8. Click Retry
      fireEvent.click(screen.getByText('Retry'));
      expect(screen.getByText('Loading exercise…')).toBeTruthy();
      
      // 9. New B request resolves
      d3.resolve(createClassifyResult({ from: 'd1', to: 'd5' }, getFixedSession()[1].fen));
      
      // 10. B question and board appear
      await screen.findByText(/What happens/i);
    });
  });
  
  describe('Session Complete UI', () => {
    it('distinct Home/Train Again buttons are functional', async () => {
      const engine: EngineClient = {
        classifyMovesFrom: vi.fn<EngineClient['classifyMovesFrom']>(),
        classifyMove: vi.fn<EngineClient['classifyMove']>().mockResolvedValue(createClassifyResult({ from: 'e2', to: 'e4' }, 'fen'))
      };
      
      render(<TrainingScreen engineClient={engine} exercises={[getFixedSession()[0]]} onExit={vi.fn()} />);
      await screen.findByText(/What happens/i);
      fireEvent.click(screen.getByText('Safe ✓'));
      fireEvent.click(screen.getByText('Submit'));
      await screen.findByText(/Correct/i);
      fireEvent.click(screen.getByText('Next'));
      
      await screen.findByText(/Session Complete/);
      expect(screen.getByText('Train again')).toBeTruthy();
      expect(screen.getByText('Home')).toBeTruthy();
    });
  });
});

