/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { botPromotion } from '../../src/app/bot/uci.js';
import { newGame, playMove, GameState } from '../../src/app/play/game.js';
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

describe('checkmate celebration', () => {
  const sq = (s: string) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
  const fools = (n: number) => {
    let g = newGame();
    for (const [a, b] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']].slice(0, n)) g = playMove(g, sq(a), sq(b))!;
    return g;
  };

  it('celebrates a mate played on the screen, not a finished game it opens — also after New game from a long game', async () => {
    const { PlayScreen } = await import('../../src/app/screens/PlayScreen.js');
    const settings = { ...DEFAULT_SETTINGS, mode: 'two-player' as const, hintsOn: false };
    const props = { engineClient: new DirectEngineClient(), onNavigate: () => {}, settings, onChange: () => {} };
    // Opens on a game that is already over (as after a refresh): no celebration.
    let long = newGame();
    for (const [a, b] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8'], ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]) long = playMove(long, sq(a), sq(b))!;
    const { rerender } = render(<PlayScreen {...props} game={fools(4)} />);
    expect(screen.queryByText('Black wins!')).toBeNull();
    // A longer game, then New game, then a mate in four plies: celebrated.
    rerender(<PlayScreen {...props} game={long} />);
    rerender(<PlayScreen {...props} game={newGame()} />);
    for (let n = 1; n <= 4; n++) await act(async () => { rerender(<PlayScreen {...props} game={fools(n)} />); });
    expect(screen.getByText('Black wins!')).toBeTruthy();
  });
});
