/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { botPromotion } from '../../src/app/bot/uci.js';
import { newGame, GameState } from '../../src/app/play/game.js';
import { DEFAULT_SETTINGS } from '../../src/app/play/playSettings.js';
import { DirectEngineClient } from '../../src/app/engine/DirectEngineClient.js';

// The computer under-promotes to a knight (as a weak Stockfish level can).
vi.mock('../../src/app/bot/StockfishBot.js', () => ({
  StockfishBot: class {
    bestMove = async () => 'a2a1n';
    cancel() { /* nothing running */ }
    dispose() { /* nothing to free */ }
  },
}));

describe('the computer promotes by itself', () => {
  it('picks a queen, or a knight only when a strong level chose one', () => {
    expect(botPromotion('a2a1q', 1)).toBe('queen');
    expect(botPromotion('a2a1n', 2)).toBe('queen');
    expect(botPromotion('a2a1r', 6)).toBe('queen');
    expect(botPromotion('a2a1b', 5)).toBe('queen');
    expect(botPromotion('a2a1n', 5)).toBe('knight');
    expect(botPromotion('a2a1', 3)).toBe('queen');
  });

  it("never opens the player's promotion dialog for the computer's move", async () => {
    const { PlayScreen } = await import('../../src/app/screens/PlayScreen.js');
    const start = newGame('4k3/8/8/8/8/8/p7/4K3 b - - 0 1'); // Black (the computer) promotes on a1
    let latest: GameState = start;
    render(<PlayScreen engineClient={new DirectEngineClient()} game={start} onNavigate={() => {}}
      settings={{ ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'white', level: 2 }}
      onChange={(g) => { latest = g; }} />);
    await waitFor(() => expect(latest.moves).toHaveLength(1), { timeout: 3000 });
    expect(latest.moves[0].uci).toBe('a2a1q');
    expect(screen.queryByText('Choose promotion')).toBeNull();
  });
});
