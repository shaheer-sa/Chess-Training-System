/** @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import { axe } from 'vitest-axe';
// @ts-expect-error vitest-axe matchers missing types
import * as matchers from 'vitest-axe/matchers';
import React from 'react';
import TrainingScreen from '../../src/app/screens/TrainingScreen';
import { EngineClient } from '../../src/app/engine/EngineClient';

expect.extend(matchers);

describe('TrainingScreen', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  const mockEngineClient: EngineClient = {
    classifyMovesFrom: vi.fn(),
    classifyMove: async (fen, moveInput) => {
      let label = 'safe';
      if (moveInput.from === 'c3' && moveInput.to === 'd5') label = 'loses_material';
      return {
        ok: true,
        value: {
          move: moveInput,
          label: label,
          netMaterial: 0,
          reasons: [{ code: 'MOCK_REASON', squares: [] }],
          exchange: {
            fenBefore: fen, fenAfter: fen, mover: { color: 'white', role: 'pawn', from: moveInput.from, to: moveInput.to },
            materialFromMove: 0, see: 0, captureOptions: [], bestLine: []
          },
          destination: { fenBefore: fen, fenAfter: fen, mover: { color: 'white', role: 'pawn', from: moveInput.from, to: moveInput.to }, givesCheck: false, geometricAttackers: [], geometricDefenders: [], legalCaptures: [] },
          tactics: { fenBefore: fen, fenAfter: fen, mover: { color: 'white', role: 'pawn', from: moveInput.from, to: moveInput.to }, givesCheck: false, deliversMate: false, causesStalemate: false, moverPinned: null, allowsMateInOne: [], hangingAfterMove: [], exchangeLineMate: null }
        } as any
      };
    }
  };

  const getDummyExercises = () => [
    { id: 'E10', difficulty: 1, fen: '4k3/1P6/8/8/8/8/8/R3K3 w Q - 0 1', from: 'b7', to: 'b8', promotion: 'queen' },
    { id: 'E02', difficulty: 1, fen: '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', from: 'd1', to: 'd5' },
    { id: 'E03', difficulty: 1, fen: '4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 1', from: 'c3', to: 'd5' }
  ];

  it('shows correct question text for E10', async () => {
    render(<TrainingScreen engineClient={mockEngineClient} exercises={[getDummyExercises()[0]]} onExit={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('White plays pawn b7→b8 and promotes to a queen. What happens?')).toBeTruthy();
    });
  });

  it('prevents answer leaks before submit', async () => {
    const { container } = render(<TrainingScreen engineClient={mockEngineClient} exercises={[getDummyExercises()[1]]} onExit={vi.fn()} />);
    await screen.findByText(/What happens\?/);
    
    // Check no 'legal destination' in aria-label
    const elementsWithAria = document.querySelectorAll('[aria-label]');
    elementsWithAria.forEach(el => {
      expect(el.getAttribute('aria-label')).not.toMatch(/legal destination/i);
    });

    // Check no ResultPanel or badges in the board
    const boardHtml = container.querySelector('[aria-label="Chess board"]')?.innerHTML || '';
    expect(boardHtml).not.toMatch(/badge|safe|loses_material|even_trade/i);
    
    // Live region check should not contain the answer result
    const liveRegion = document.querySelector('[aria-live="polite"]');
    if (liveRegion) {
      expect(liveRegion.textContent).not.toMatch(/Not quite|Correct|Not graded/i);
    }
  });

  it('handles submit flow, disablement, and try again', async () => {
    render(<TrainingScreen engineClient={mockEngineClient} exercises={[getDummyExercises()[1]]} onExit={vi.fn()} />);
    await screen.findByText(/What happens\?/);
    
    const submitBtn = screen.getByText('Submit');
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);

    // Click wrong answer first
    const wrongBtn = screen.getByText('Even trade ⇄');
    fireEvent.click(wrongBtn);
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(submitBtn);
    expect(screen.queryByText('Submit')).toBeNull();

    await screen.findByText(/Not quite/i);
    
    // Try again
    fireEvent.click(screen.getByText('Try again'));
    expect(screen.queryByText(/Not quite/i)).toBeNull();
    
    // Now click correct answer
    const safeBtn = screen.getByText('Safe ✓');
    fireEvent.click(safeBtn);
    fireEvent.click(screen.getByText('Submit'));
    
    await screen.findByText('Correct');
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('handles wrong path and real label display', async () => {
    // E03 is loses_material
    render(<TrainingScreen engineClient={mockEngineClient} exercises={[getDummyExercises()[2]]} onExit={vi.fn()} />);
    await screen.findByText(/What happens\?/);
    
    fireEvent.click(screen.getByText('Safe ✓'));
    fireEvent.click(screen.getByText('Submit'));

    await screen.findByText('Not quite — you chose Safe');
  });

  it('handles not sure', async () => {
    render(<TrainingScreen engineClient={mockEngineClient} exercises={[getDummyExercises()[1]]} onExit={vi.fn()} />);
    await screen.findByText(/What happens\?/);
    
    fireEvent.click(screen.getByText('Not sure'));
    fireEvent.click(screen.getByText('Submit'));

    await screen.findByText('Not graded');
  });

  it('keyboard flow works', async () => {
    render(<TrainingScreen engineClient={mockEngineClient} exercises={[getDummyExercises()[1]]} onExit={vi.fn()} />);
    await screen.findByText(/What happens\?/);
    
    const safeBtn = screen.getByText('Safe ✓');
    safeBtn.focus();
    fireEvent.click(safeBtn);
    
    const submitBtn = screen.getByText('Submit');
    submitBtn.focus();
    fireEvent.click(submitBtn);

    await screen.findByText('Correct');
  });

  it('axe a11y checks', async () => {
    const { container } = render(<TrainingScreen engineClient={mockEngineClient} exercises={[getDummyExercises()[1]]} onExit={vi.fn()} />);
    await screen.findByText(/What happens\?/);
    expect(await axe(container)).toHaveNoViolations();
    
    fireEvent.click(screen.getByText('Safe ✓'));
    fireEvent.click(screen.getByText('Submit'));
    await screen.findByText('Correct');
    expect(await axe(container)).toHaveNoViolations();
  });
});
