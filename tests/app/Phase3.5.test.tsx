/** @vitest-environment jsdom */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import TrainingScreen from '../../src/app/screens/TrainingScreen.js';
import { EngineClient } from '../../src/app/engine/EngineClient.js';
import { Exercise } from '../../src/app/training/exercises.js';
import { Result, MoveClassification } from '../../src/engine/types.js';
import { _resetRecordsState } from '../../src/app/training/records.js';

function createMockEngine(): EngineClient {
  const result: Result<MoveClassification> = {
    ok: true,
    value: {
      move: { from: 'e2', to: 'e4' },
      label: 'safe',
      netMaterial: 0,
      reasons: [],
      exchange: {
        fenBefore: '', fenAfter: '',
        mover: { color: 'white', role: 'pawn', from: 'e2', to: 'e4' },
        materialFromMove: 0, see: 0, captureOptions: [], bestLine: []
      },
      destination: {
        fenBefore: '', fenAfter: '',
        mover: { color: 'white', role: 'pawn', from: 'e2', to: 'e4' },
        givesCheck: false, geometricAttackers: [], geometricDefenders: [], legalCaptures: []
      },
      tactics: {
        fenBefore: '', fenAfter: '',
        mover: { color: 'white', role: 'pawn', from: 'e2', to: 'e4' },
        givesCheck: false, deliversMate: false, causesStalemate: false,
        moverPinned: null, allowsMateInOne: [], hangingAfterMove: [], exchangeLineMate: null
      }
    }
  };
  return { classifyMove: vi.fn().mockResolvedValue(result) } as unknown as EngineClient;
}

const FIXED_SESSION: Exercise[] = [
  { id: 'E01', difficulty: 1, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', from: 'e2', to: 'e4' },
  { id: 'E02', difficulty: 1, fen: '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', from: 'd1', to: 'd5' },
  { id: 'E03', difficulty: 1, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', from: 'e2', to: 'e4' },
  { id: 'E04', difficulty: 1, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', from: 'e2', to: 'e4' },
  { id: 'E05', difficulty: 1, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', from: 'e2', to: 'e4' },
  { id: 'E06', difficulty: 1, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', from: 'e2', to: 'e4' },
  { id: 'E07', difficulty: 1, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', from: 'e2', to: 'e4' },
  { id: 'E08', difficulty: 1, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', from: 'e2', to: 'e4' },
  { id: 'E09', difficulty: 1, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', from: 'e2', to: 'e4' },
  { id: 'E10', difficulty: 1, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', from: 'e2', to: 'e4' },
];

describe('Phase 3.5 � Freeze Blockers', () => {
  beforeEach(() => {
    _resetRecordsState?.();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('T2: Confidence radio inputs are visible', () => {
    it('confidence inputs are not styled with opacity 0 or zero width/height', async () => {
      const engine = createMockEngine();
      const { container } = render(
        <TrainingScreen engineClient={engine} exercises={FIXED_SESSION} onExit={vi.fn()} />
      );

      await screen.findByRole('grid');
      fireEvent.click(screen.getByText(/Safe/));
      await screen.findByText('Confidence (optional):');

      const confidenceInputs = container.querySelectorAll('input[name="confidence"]');
      expect(confidenceInputs.length).toBeGreaterThan(0);

      for (const input of Array.from(confidenceInputs)) {
        const el = input as HTMLInputElement;
        const style = el.getAttribute('style') || '';
        expect(style).not.toMatch(/opacity\s*:\s*0/);
        expect(style).not.toMatch(/width\s*:\s*0/);
        expect(style).not.toMatch(/height\s*:\s*0/);
      }
    });
  });

  describe('T3: Session summary uses human-readable labels', () => {
    it('summary text contains no internal code strings', async () => {
      const engine = createMockEngine();
      const { container } = render(
        <TrainingScreen engineClient={engine} exercises={FIXED_SESSION.slice(0, 1)} onExit={vi.fn()} />
      );

      await screen.findByRole('grid');
      fireEvent.click(screen.getByText(/Safe/));
      fireEvent.click(screen.getByText('Submit'));
      await screen.findAllByText('Correct');
      fireEvent.click(screen.getByText('Next'));

      await screen.findByText(/Session Complete/);

      const summaryList = container.querySelector('ul');
      const summaryText = summaryList?.textContent ?? '';

      expect(summaryText).not.toMatch(/even_trade/);
      expect(summaryText).not.toMatch(/loses_material/);
      expect(summaryText).not.toMatch(/not_sure/);
      expect(summaryText).not.toMatch(/_/);
    });
  });

  describe('T4: Training mode bar uses dark purple background', () => {
    it('training mode bar style has background #4a148c', async () => {
      const engine = createMockEngine();
      const { container } = render(
        <TrainingScreen engineClient={engine} exercises={FIXED_SESSION} onExit={vi.fn()} />
      );

      await screen.findByRole('grid');

      const allDivs = Array.from(container.querySelectorAll('div'));
      const bar = allDivs.find((el) => {
        const text = el.textContent ?? '';
        const style = el.getAttribute('style') ?? '';
        return text.includes('TRAINING') && text.includes('Exercise') && style.includes('background');
      }) as HTMLElement | undefined;

      expect(bar).toBeDefined();
      const style = bar!.getAttribute('style')!.toLowerCase();
      expect(style).toMatch(/#4a148c/);
    });
  });
});


