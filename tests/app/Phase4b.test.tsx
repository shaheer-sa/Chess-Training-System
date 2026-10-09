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
    classifyMovesFrom: vi.fn().mockResolvedValue({ ok: true, value: [
      { move: { from: 'e2', to: 'e4' }, label: 'safe', netMaterial: 0, reasons: [{ code: 'NOT_ATTACKED', squares: [] }], score: 0, exchange: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: 'e2', to: 'e4' }, bestLine: [], captureOptions: [], materialFromMove: 0, see: 0 } },
      { move: { from: 'e2', to: 'e5' }, label: 'even_trade', netMaterial: 0, reasons: [{ code: 'EVEN_EXCHANGE', squares: [] }], score: 0, exchange: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: 'e2', to: 'e5' }, bestLine: [], captureOptions: [], materialFromMove: 0, see: 0 } },
      { move: { from: 'e2', to: 'e6' }, label: 'loses_material', netMaterial: -1, reasons: [{ code: 'UNDEFENDED_PIECE_LOST', squares: [] }], score: 0, exchange: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: 'e2', to: 'e6' }, bestLine: [], captureOptions: [], materialFromMove: 0, see: 0 } },
      { move: { from: 'e2', to: 'e7' }, label: 'unclear', netMaterial: 0, reasons: [{ code: 'CAUSES_STALEMATE', squares: [] }], score: 0, exchange: { fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'pawn', from: 'e2', to: 'e7' }, bestLine: [], captureOptions: [], materialFromMove: 0, see: 0 } }
    ] }),
    classifyMove
  } as unknown as EngineClient;
}

describe('Phase 4B — Specific Acceptance Tests', () => {
  it('Logo navigation to Home from Analysis', async () => {
    const engine = createMockEngine();
    render(<App engineClient={engine} />);
    
    // Go to Analysis
    fireEvent.click(screen.getAllByText('Analyze your game')[0]);
    fireEvent.change(await screen.findByLabelText('Analyze from'), { target: { value: 'fen' } });
    await screen.findByText('Select a position');
    
    // Click logo
    fireEvent.click(screen.getByLabelText('Rookvex — home'));
    await screen.findByText('PLAY. ANALYZE. IMPROVE.');
  });

  it('Home, selected Analysis, contain no old text badge characters', async () => {
    const engine = createMockEngine();
    const { container } = render(<App engineClient={engine} />);
    
    // Check Home
    let html = container.innerHTML;
    expect(html).not.toContain('✓');
    expect(html).not.toContain('⇄');
    expect(html).not.toContain('⚠');
    
    // Check Analysis selected
    fireEvent.click(screen.getAllByText('Analyze your game')[0]);
    fireEvent.change(await screen.findByLabelText('Analyze from'), { target: { value: 'fen' } });
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
  });
  it('Home caption shows the label text', async () => {
    const engine = createMockEngine();
    render(<App engineClient={engine} />);
    const captionText = await screen.findByText('Loses material');
    expect(captionText).toBeTruthy();
  });

  it('No board square has the focus ring before any focus', async () => {
    const engine = createMockEngine();
    const { container } = render(<App engineClient={engine} />);
    const heroBtn = screen.getAllByText('Analyze your game')[0];
    fireEvent.click(heroBtn);
    const squares = container.querySelectorAll('[role="gridcell"]');
    // None should have the focus ring (boxShadow containing #ffffff for focus)
    squares.forEach(sq => {
      const boxShadow = (sq as HTMLElement).style.boxShadow || '';
      expect(boxShadow).not.toContain('#ffffff');
    });
  });

  it('Mobile nav has no role="menu"', async () => {
    const engine = createMockEngine();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
    window.dispatchEvent(new Event('resize'));
    const { container } = render(<App engineClient={engine} />);
    
    const menuBtn = container.querySelector('button[aria-label="Menu"]');
    if (menuBtn) {
        fireEvent.click(menuBtn);
    }
    
    // The nav should be aria-label="Main navigation" instead of role="menu"
    const nav = container.querySelector('nav[aria-label="Main navigation"]');
    expect(nav).toBeTruthy();
    expect(nav?.getAttribute('role')).not.toBe('menu');
    
    // reset
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    window.dispatchEvent(new Event('resize'));
  });
});
