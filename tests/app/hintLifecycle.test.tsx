/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React, { useState } from 'react';
import { newGame, playMove, GameState } from '../../src/app/play/game.js';
import { DEFAULT_SETTINGS, type PlaySettings } from '../../src/app/play/playSettings.js';
import { DirectEngineClient } from '../../src/app/engine/DirectEngineClient.js';

// The computer answers 1.e4 with 1...e5.
vi.mock('../../src/app/bot/StockfishBot.js', () => ({
  StockfishBot: class {
    bestMove = async () => 'e7e5';
    cancel() { /* nothing running */ }
    dispose() { /* nothing to free */ }
  },
}));

const sq = (s: string) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);

describe('Hint after a move', () => {
  it('a hint still being worked out is dropped by a move: after the reply, Hint works again for the new position', async () => {
    const { PlayScreen } = await import('../../src/app/screens/PlayScreen.js');
    // A slow engine: each answer arrives only when the test releases it. Knight moves are legal in both positions.
    const pending: (() => void)[] = [];
    const createChecker = () => ({
      check: () => new Promise<Record<string, { cp: number }>>(res => { pending.push(() => res({ g1f3: { cp: 40 }, b1c3: { cp: 30 } })); }),
      dispose: () => {},
    });
    const release = async () => { await act(async () => { pending.splice(0).forEach(f => f()); await new Promise(r => setTimeout(r, 0)); }); };
    const settings: PlaySettings = { ...DEFAULT_SETTINGS, mode: 'computer', humanColor: 'white', trainingMode: true, hintsOn: false, level: 2 };
    let play: (g: GameState) => void = () => {};
    let latest: GameState = newGame();
    const Harness = () => {
      const [game, setGame] = useState<GameState>(newGame());
      play = setGame;
      latest = game;
      return <PlayScreen engineClient={new DirectEngineClient()} onNavigate={() => {}} game={game} settings={settings}
        onChange={(g) => setGame(g)} createChecker={createChecker as never} />;
    };
    const { container } = render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.getByRole('button', { name: /Thinking/ })).toBeTruthy();
    act(() => play(playMove(latest, sq('e2'), sq('e4'))!)); // the player moves before the hint arrives
    await waitFor(() => expect(latest.moves).toHaveLength(2), { timeout: 3000 }); // the computer replies 1...e5
    // The old request is still unanswered, yet Hint is ready for the new position.
    const hint = await screen.findByRole('button', { name: 'Hint' });
    expect((hint as HTMLButtonElement).disabled).toBe(false);
    expect(container.querySelector('.rv-hint')).toBeNull();

    fireEvent.click(hint);
    await release(); // both answers arrive; only the new one counts
    await waitFor(() => expect(container.querySelector('.rv-hint')?.textContent).toMatch(/Nf3/));
    expect(container.querySelectorAll('.rv-arrow--best')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Hint' })).toBeTruthy();
  });
});
