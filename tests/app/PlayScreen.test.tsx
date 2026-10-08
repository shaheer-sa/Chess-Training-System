import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { PlayScreen } from '../../src/app/screens/PlayScreen.js';
import { EngineClient } from '../../src/app/engine/EngineClient.js';
import { DirectEngineClient } from '../../src/app/engine/DirectEngineClient.js';
import { MoveClassification } from '../../src/engine/types.js';

describe('PlayScreen', () => {
  let engineClient: EngineClient;
  let onNavigate: ReturnType<typeof vi.fn>;

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    engineClient = new DirectEngineClient();
    vi.spyOn(engineClient, 'classifyMovesFrom').mockResolvedValue({
      ok: true,
      value: [{ move: { from: 'e2', to: 'e4', promotion: undefined }, label: 'safe', reasons: [], netMaterial: 0, destination: undefined, exchange: undefined, tactics: undefined } as unknown as MoveClassification]
    });
    vi.spyOn(engineClient, 'classifyMove').mockResolvedValue({ ok: true, value: { move: { from: 'e2', to: 'e4', promotion: undefined }, label: 'safe', reasons: [], netMaterial: 0, destination: undefined, exchange: undefined, tactics: undefined } as unknown as MoveClassification });
    onNavigate = vi.fn();
  });

  test('hints ON: preview -> second tap plays move', async () => {
    render(<PlayScreen engineClient={engineClient} onNavigate={onNavigate as any} />);
    const e2 = document.getElementById('sq-12');
    fireEvent.click(e2!);
    await waitFor(() => { expect(engineClient.classifyMovesFrom).toHaveBeenCalled(); });
    const e4 = document.getElementById('sq-28');
    fireEvent.click(e4!);
    expect(screen.getByText('Play e4')).toBeTruthy();
    fireEvent.click(e4!);
    await waitFor(() => { expect(screen.getByText(/White pawn e2 to e4/i)).toBeTruthy(); });
    expect(screen.getByText('e4')).toBeTruthy();
  });

  test('hints OFF: single tap plays move', async () => {
    render(<PlayScreen engineClient={engineClient} onNavigate={onNavigate as any} />);
    fireEvent.click(screen.getByLabelText('Show hints')); 
    const e2 = document.getElementById('sq-12');
    fireEvent.click(e2!);
    const e4 = document.getElementById('sq-28');
    fireEvent.click(e4!);
    await waitFor(() => { expect(screen.getByText('e4')).toBeTruthy(); });
  });

  test('promotion choice + Esc cancel', async () => {
    const promoFen = '8/P7/8/8/8/8/8/4K2k w - - 0 1';
    render(<PlayScreen engineClient={engineClient} onNavigate={onNavigate as any} initialFen={promoFen} />);
    const a7 = document.getElementById('sq-48');
    const a8 = document.getElementById('sq-56');
    fireEvent.click(a7!);
    fireEvent.click(a8!);
    
    // We are in hints ON mode now by default. So wait for "Play a8"
    await waitFor(() => expect(screen.getByText(/Play a8/i)).toBeTruthy());
    fireEvent.click(a8!); // Execute move

    await waitFor(() => { expect(screen.getByText(/Choose promotion/i)).toBeTruthy(); });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    await waitFor(() => { expect(screen.queryByText(/Choose promotion/i)).toBeNull(); });
    
    fireEvent.click(a7!);
    fireEvent.click(a8!);
    await waitFor(() => expect(screen.getByText(/Play a8/i)).toBeTruthy());
    fireEvent.click(a8!);

    await waitFor(() => { expect(screen.getByText(/Choose promotion/i)).toBeTruthy(); });
    fireEvent.click(screen.getByRole('button', { name: 'Queen' }));
    await waitFor(() => { expect(screen.getByText(/White pawn a7 to a8/i)).toBeTruthy(); });
  });

  test('checkmate', async () => {
    const mate1Fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1';
    render(<PlayScreen engineClient={engineClient} onNavigate={onNavigate as any} initialFen={mate1Fen} />);
    
    // Default is hints ON. Let's keep it ON to avoid any hints OFF weirdness!
    const f3 = document.getElementById('sq-21');
    const f7 = document.getElementById('sq-53');
    fireEvent.click(f3!);
    fireEvent.click(f7!);
    
    await waitFor(() => expect(screen.getByText(/Play Qxf7/i)).toBeTruthy());
    fireEvent.click(f7!); // Play move
    
    await waitFor(() => {
      expect(screen.getAllByText(/Checkmate/i).length).toBeGreaterThan(0);
    });
  });

  test('undo', async () => {
    render(<PlayScreen engineClient={engineClient} onNavigate={onNavigate as any} />);
    fireEvent.click(screen.getByLabelText('Show hints')); 
    fireEvent.click(document.getElementById('sq-12')!);
    fireEvent.click(document.getElementById('sq-28')!);
    await waitFor(() => { expect(screen.getByText('e4')).toBeTruthy(); });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => { expect(screen.queryByText('e4')).toBeNull(); });
  });

  test('board navigation', async () => {
    render(<PlayScreen engineClient={engineClient} onNavigate={onNavigate as any} />);
    fireEvent.click(screen.getByLabelText('Show hints'));
    fireEvent.click(document.getElementById('sq-12')!);
    fireEvent.click(document.getElementById('sq-28')!);
    await waitFor(() => expect(screen.getByText('e4')).toBeTruthy());
    fireEvent.click(document.getElementById('sq-52')!);
    fireEvent.click(document.getElementById('sq-36')!);
    await waitFor(() => { expect(screen.getByText('e5')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Flip board'));
  });

  test('Open in Analysis carries FEN', async () => {
    render(<PlayScreen engineClient={engineClient} onNavigate={onNavigate as any} />);
    fireEvent.click(screen.getByText('Open in Analysis'));
    expect(onNavigate).toHaveBeenCalledWith('analysis', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });
});
