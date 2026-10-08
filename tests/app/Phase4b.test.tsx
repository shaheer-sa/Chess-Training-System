/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { App } from '../../src/app/App.js';
import { EngineClient } from '../../src/app/engine/EngineClient.js';

function createMockEngine(): EngineClient {
  const classifyMove = vi.fn().mockImplementation(async (fen, move) => {
    return {
      ok: true,
      value: {
        move: { from: move.from, to: move.to },
        label: 'safe',
        reasons: [],
        score: 0,
        exchange: { fenAfter: fen, bestLine: [] }
      }
    };
  });
  return {
    classifyMovesFrom: vi.fn().mockResolvedValue({ ok: true, value: [{ move: { from: 'e2', to: 'e4' }, label: 'safe', netMaterial: 0, reasons: ['NOT_ATTACKED'], score: 0, exchange: { fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', mover: { color: 'white', role: 'pawn', from: 'e2', to: 'e4' }, bestLine: [], captureOptions: [], materialFromMove: 0, see: 0 } }] }),
    classifyMove
  } as unknown as EngineClient;
}

describe('Phase 4B — Specific Acceptance Tests', () => {
  it('Logo navigation to Home from Analysis and Beginner drills', async () => {
    const engine = createMockEngine();
    render(<App engineClient={engine} />);
    
    // Go to Analysis
    fireEvent.click(screen.getAllByText('Analyze a position')[0]);
    await screen.findByText('Select a position');
    
    // Click logo
    fireEvent.click(screen.getByLabelText('Rookvex — home'));
    await screen.findByText('PLAY. ANALYZE. IMPROVE.');
    
    // Go to Training
    fireEvent.click(screen.getAllByText('Beginner drills')[0]);
    await screen.findByText(/BEGINNER DRILLS/);
    
    // Click logo
    fireEvent.click(screen.getByLabelText('Rookvex — home'));
    await screen.findByText('PLAY. ANALYZE. IMPROVE.');
  });

  it('Home, selected Analysis, and drill reveal contain no old text badge characters', async () => {
    const engine = createMockEngine();
    const { container } = render(<App engineClient={engine} />);
    
    // Check Home
    let html = container.innerHTML;
    expect(html).not.toContain('✓');
    expect(html).not.toContain('⇄');
    expect(html).not.toContain('⚠');
    
    // Check Analysis selected
    fireEvent.click(screen.getAllByText('Analyze a position')[0]);
    await screen.findByText('Select a position');
    fireEvent.click(screen.getAllByText('Starting position')[0]);
    await screen.findByRole('grid');
    fireEvent.click(container.querySelector('#sq-12')!); // select e2 pawn
    await waitFor(() => expect(container.innerHTML).toMatch(/Tap a square to see why/i));
    fireEvent.click(container.querySelector('#sq-28')!); // click e4 destination
    
    // wait for analysis to complete
    await waitFor(() => {
      expect(container.innerHTML).toContain('Safe'); // from our live announcement
    });
    
    html = container.innerHTML;
    expect(html).not.toContain('✓');
    expect(html).not.toContain('⇄');
    expect(html).not.toContain('⚠');
    
    // Check Drill Reveal
    fireEvent.click(screen.getByLabelText('Rookvex — home'));
    await screen.findByText('PLAY. ANALYZE. IMPROVE.');
    
    fireEvent.click(screen.getAllByText('Beginner drills')[0]);
    await screen.findByRole('grid');
    
    fireEvent.click(screen.getByText('Safe'));
    fireEvent.click(screen.getByText('Submit'));
    
    await screen.findByText('Correct');
    
    html = container.innerHTML;
    expect(html).not.toContain('✓');
    expect(html).not.toContain('⇄');
    expect(html).not.toContain('⚠');
  });
});
