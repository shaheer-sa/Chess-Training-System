import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { App } from '../../src/app/App';
import { DirectEngineClient } from '../../src/app/engine/DirectEngineClient';
import { MoveClassification } from '../../src/engine/types';

test('App Integration: Move in Play, open Analysis, verify position', async () => {
  const engineClient = new DirectEngineClient();
  vi.spyOn(engineClient, 'classifyMovesFrom').mockResolvedValue({
    ok: true,
    value: [{ move: { from: 12, to: 28, promotion: undefined }, label: 'safe', reasons: [], netMaterial: 0, destination: undefined, exchange: undefined, tactics: undefined } as unknown as MoveClassification]
  });

  render(<App engineClient={engineClient} />);

  // Go to play screen
  fireEvent.click(screen.getAllByText('Play')[0]);

  // Turn off hints for simplicity
  const hintsToggle = screen.getByLabelText('Show hints');
  if ((hintsToggle as HTMLInputElement).checked) {
    fireEvent.click(hintsToggle);
  }

  // Click e2 (id sq-12), click e4 (id sq-28)
  const e2 = document.getElementById('sq-12');
  const e4 = document.getElementById('sq-28');
  expect(e2).not.toBeNull();
  fireEvent.click(e2!);
  fireEvent.click(e4!);

  // Check it's black's turn
  await waitFor(() => {
    expect(screen.getByText('White pawn e2 to e4')).toBeTruthy();
  });

  // Open Analysis
  fireEvent.click(screen.getByText('Open in Analysis'));

  // Now we should be in Analysis screen and see FEN input
  await waitFor(() => {
    const fenInput = screen.getByLabelText('FEN') as HTMLInputElement;
    expect(fenInput.value).toContain('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  });


});
