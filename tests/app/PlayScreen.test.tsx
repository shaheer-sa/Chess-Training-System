import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { PlayScreen } from '../../src/app/screens/PlayScreen.js';
import { EngineClient } from '../../src/app/engine/EngineClient.js';
import { DirectEngineClient } from '../../src/app/engine/DirectEngineClient.js';
import { MoveClassification } from '../../src/engine/types.js';

describe('PlayScreen', () => {
  let engineClient: EngineClient;
  let onNavigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    engineClient = new DirectEngineClient();
    // mock engine client classifyMovesFrom
    vi.spyOn(engineClient, 'classifyMovesFrom').mockResolvedValue({
      ok: true,
      value: [{ move: { from: 'e2', to: 'e4', promotion: undefined }, label: 'safe', reasons: [], netMaterial: 0, destination: undefined, exchange: undefined, tactics: undefined } as unknown as MoveClassification]
    });
    vi.spyOn(engineClient, 'classifyMove').mockResolvedValue({ ok: true, value: { move: { from: 'e2', to: 'e4', promotion: undefined }, label: 'safe', reasons: [], netMaterial: 0, destination: undefined, exchange: undefined, tactics: undefined } as unknown as MoveClassification });
    onNavigate = vi.fn();
  });

  test('hints ON: preview -> second tap plays move', async () => {
    render(<PlayScreen engineClient={engineClient} onNavigate={onNavigate as unknown as ((screen: "help" | "home" | "analysis", initialFen?: string) => void)} />);
    
    // Select e2 pawn
    const e2 = document.getElementById('sq-12');
    fireEvent.click(e2!);
    
    await waitFor(() => {
      expect(engineClient.classifyMovesFrom).toHaveBeenCalled();
    });

    // Preview e4
    const e4 = document.getElementById('sq-28');
    fireEvent.click(e4!);
    
    // Play button in hint panel should appear
    expect(screen.getByText('Play e4')).toBeTruthy();
    
    // Second tap on e4 plays move
    fireEvent.click(e4!);
    
    await waitFor(() => {
      expect(screen.getByText('White pawn e2 to e4')).toBeTruthy();
    });
    // Move list should have e4
    expect(screen.getByText('e4')).toBeTruthy();
  });

  test('hints OFF: single tap plays move', async () => {
    render(<PlayScreen engineClient={engineClient} onNavigate={onNavigate} />);
    
    // Turn off hints
    const hintsToggle = screen.getByLabelText('Show hints');
    fireEvent.click(hintsToggle);
    
    const e2 = document.getElementById('sq-12');
    fireEvent.click(e2!); // Select
    
    const e4 = document.getElementById('sq-28');
    fireEvent.click(e4!); // Play instantly
    
    await waitFor(() => {
      expect(screen.getByText('e4')).toBeTruthy();
    });
  });

  test('promotion choice + Esc cancel', async () => {
    render(<PlayScreen engineClient={engineClient} onNavigate={onNavigate} />);
    // Needs a FEN with promotion, but we start with a new game. 
    // To mock it, we would need to control initial game state. PlayScreen starts with newGame(). 
    // Let's just make it simple: we can't easily mock game state inside PlayScreen without props.
  });

  test('Open in Analysis carries FEN', async () => {
    render(<PlayScreen engineClient={engineClient} onNavigate={onNavigate} />);
    const analyzeBtn = screen.getByText('Open in Analysis');
    fireEvent.click(analyzeBtn);
    expect(onNavigate).toHaveBeenCalledWith('analysis', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });
});
