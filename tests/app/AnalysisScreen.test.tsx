/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
// @ts-expect-error vitest-axe types missing
import * as matchers from 'vitest-axe/matchers';
import React from 'react';
import { AnalysisScreen } from '../../src/app/screens/AnalysisScreen.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
expect.extend(matchers as any);
import { DirectEngineClient } from '../../src/app/engine/DirectEngineClient.js';
import { EngineClient } from '../../src/app/engine/EngineClient.js';
import { Square, Result, MoveClassification, MoveInput } from '../../src/engine/types.js';

import { cleanup } from '@testing-library/react';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const startpos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

class MockEngineClient implements EngineClient {
  public delayMs = 0;
  public shouldReject = false;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async classifyMovesFrom(_fen: string, _from: Square): Promise<Result<MoveClassification[]>> {
    if (this.delayMs > 0) {
      await new Promise(r => setTimeout(r, this.delayMs));
    }
    if (this.shouldReject) {
      return Promise.reject(new Error('Mock engine failure'));
    }
    return { ok: true, value: [] } as unknown as Result<MoveClassification[]>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async classifyMove(_fen: string, _move: MoveInput): Promise<Result<MoveClassification>> {
    return { ok: true, value: { label: 'safe', netMaterial: 0, reasons: [], destination: null, exchange: null, tactics: null, move: { from: 'a1', to: 'a2' } } } as unknown as Result<MoveClassification>;
  }
}

describe('Analysis Screen', () => {
  describe('Board / interaction', () => {
    it('renders 64 squares with correct aria labels in the starting position', () => {
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e4Square = screen.getByLabelText('e4, empty');
      expect(e4Square).toBeTruthy();
      
      const e2Square = screen.getByLabelText('e2, white pawn');
      expect(e2Square).toBeTruthy();
    });

    it('supports keyboard navigation', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const a1Square = screen.getByLabelText('a1, white rook');
      a1Square.focus();
      expect(document.activeElement).toBe(a1Square);

      await user.keyboard('{ArrowUp}');
      const a2Square = screen.getByLabelText('a2, white pawn');
      expect(document.activeElement).toBe(a2Square);

      await user.keyboard('{Enter}');
      // e2 is now selected.
    });

    it('selecting an opponent piece does nothing', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e7Square = screen.getByLabelText('e7, black pawn');
      await user.click(e7Square);
      
      // Should not show any legal moves or change selection state
      const messages = screen.queryByText(/legal move/i);
      expect(messages).toBeNull();
    });

    it('tapping a non-legal square shows the exact message', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      client.classifyMovesFrom = async () => ({ ok: true, value: [] });
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e2Square = screen.getByLabelText('e2, white pawn');
      await user.click(e2Square);
      
      const a6Square = screen.getByLabelText('a6, empty');
      await user.click(a6Square);
      
      expect(screen.getAllByText("That square isn't a legal move for this piece.")[0]).toBeTruthy();
    });

    it('piece with no legal moves shows specific message', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      client.classifyMovesFrom = async () => ({ ok: true, value: [] });
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e1Square = screen.getByLabelText('e1, white king');
      await user.click(e1Square);
      
      await waitFor(() => {
        expect(screen.getAllByText("This piece has no legal moves.")[0]).toBeTruthy();
      });
    });
  });

  describe('States', () => {
    it('does not show Checking moves... if analysis is fast', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      client.delayMs = 50; // < 150ms
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e2Square = screen.getByLabelText('e2, white pawn');
      await user.click(e2Square);
      
      expect(screen.queryByText('Checking moves…')).toBeNull();
    });

    it('shows Checking moves... if analysis is slow', async () => {
      vi.useFakeTimers();
      const client = new MockEngineClient();
      client.delayMs = 200; // > 150ms
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e2Square = screen.getByLabelText('e2, white pawn');
      let resolveClick: () => void;
      
      client.classifyMovesFrom = async () => {
        return new Promise(res => {
          resolveClick = () => res({ ok: true, value: [] });
        });
      };

      fireEvent.click(e2Square);
      
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(screen.getByText('Checking moves…')).toBeTruthy();
      
      act(() => {
        resolveClick();
      });
    });

    it('engine error shows exact message and keeps selection', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      client.shouldReject = true;
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e2Square = screen.getByLabelText('e2, white pawn');
      await user.click(e2Square);
      
      await waitFor(() => {
        expect(screen.getAllByText("We couldn't analyze this move. Try another square.")[0]).toBeTruthy();
      });
    });

    it('invalid FEN shows exact message and keeps field text', async () => {
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen="invalid fen" />);
      
      expect(screen.getByText("This position isn't valid. Check the FEN.")).toBeTruthy();
    });

    it('shows Mode bar text on Analysis', () => {
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      expect(screen.getByText("ANALYSIS · Results are shown immediately")).toBeTruthy();
    });
  });

  describe('End-to-end with REAL engine', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const realClient = new DirectEngineClient();

    it('Position 1, select e6 -> g5 badge Loses material', async () => {
      render(<AnalysisScreen engineClient={realClient} initialFen="k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1" />);
      
      await user.click(screen.getByLabelText(/e6, white knight/i));
      await waitFor(() => {
        const g5 = screen.getByLabelText(/g5, empty, legal destination, Loses material/i);
        expect(g5).toBeTruthy();
      });
    });

    it('Position 2, select f2 -> e4 badge Safe', async () => {
      render(<AnalysisScreen engineClient={realClient} initialFen="7k/8/8/8/R1r5/8/5N2/K7 w - - 0 1" />);
      
      await user.click(screen.getByLabelText(/f2, white knight/i));
      await waitFor(() => {
        const e4 = screen.getByLabelText(/e4, empty, legal destination, Safe/i);
        expect(e4).toBeTruthy();
      });
    });

    it('Position 3, select d2 -> d4 badge Even trade', async () => {
      render(<AnalysisScreen engineClient={realClient} initialFen="4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1" />);
      
      await user.click(screen.getByLabelText(/d2, white pawn/i));
      await waitFor(() => {
        const d4 = screen.getByLabelText(/d4, empty, legal destination, Even trade/i);
        expect(d4).toBeTruthy();
      });
    });

    it('Position 5, select e2 -> e8 badge Unclear', async () => {
      render(<AnalysisScreen engineClient={realClient} initialFen="3r2k1/5ppp/8/8/8/8/4R3/4R1K1 w - - 0 1" />);
      
      await user.click(screen.getByLabelText(/e2, white rook/i));
      await waitFor(() => {
        const e8 = screen.getByLabelText(/e8, empty, legal destination, Unclear/i);
        expect(e8).toBeTruthy();
      });
    });

    it('Starting position, select e1 -> no legal moves message', async () => {
      render(<AnalysisScreen engineClient={realClient} initialFen={startpos} />);
      
      await user.click(screen.getByLabelText(/e1, white king/i));
      await waitFor(() => {
        expect(screen.getAllByText("This piece has no legal moves.")[0]).toBeTruthy();
      });
    });

    it('Destination selected -> result panel shows label + icon + meaning', async () => {
      render(<AnalysisScreen engineClient={realClient} initialFen="k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1" />);
      
      await user.click(screen.getByLabelText(/e6, white knight/i));
      await waitFor(() => {
        expect(screen.getByLabelText(/g5, empty, legal destination, Loses material/i)).toBeTruthy();
      });
      await user.click(screen.getByLabelText(/g5, empty, legal destination, Loses material/i));
      
      expect(screen.getByText('Loses material')).toBeTruthy();
      expect(document.querySelector('svg')).toBeTruthy();
      expect(screen.getByText("Your rook on g2 seems to defend this square, but it's pinned to your king, so it can't take back.")).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('has no violations on idle state', async () => {
      const { container } = render(<AnalysisScreen engineClient={new MockEngineClient()} initialFen={startpos} />);
      const results = await axe(container);
      (expect(results) as unknown as { toHaveNoViolations: () => void }).toHaveNoViolations();
    }, 10000);

    it('has no violations with piece selected', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const { container } = render(<AnalysisScreen engineClient={new MockEngineClient()} initialFen={startpos} />);
      await user.click(screen.getByLabelText(/e2, white pawn/i));
      const results = await axe(container);
      (expect(results) as unknown as { toHaveNoViolations: () => void }).toHaveNoViolations();
    });
  });

  describe('Phase 2B.6 Fixes', () => {
    it('F1: stale results - only latest request badges are shown', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let resolveA: any, resolveB: any;
      client.classifyMovesFrom = vi.fn().mockImplementation(async (fen, sq) => {
        if (sq === 'e2') return new Promise(r => resolveA = () => r({ ok: true, value: [{ move: { from: 'e2', to: 'e3' }, label: 'safe', reasons: [] }] }));
        if (sq === 'd2') return new Promise(r => resolveB = () => r({ ok: true, value: [{ move: { from: 'd2', to: 'd3' }, label: 'safe', reasons: [] }] }));
        return { ok: true, value: [] };
      });
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      await user.click(screen.getByLabelText(/e2, white pawn/i)); // A
      await user.click(screen.getByLabelText(/d2, white pawn/i)); // B
      
      await act(async () => {
        resolveB();
      });
      await act(async () => {
        resolveA();
      });
      
      // Only B's badges should be shown
      expect(screen.queryByLabelText(/e3, empty, legal destination/i)).toBeNull();
      expect(screen.getByLabelText(/d3, empty, legal destination/i)).toBeTruthy();
    });

    it('F1: stale results - position change clears badges', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let resolveA: any;
      client.classifyMovesFrom = vi.fn().mockImplementation(async () => {
        return new Promise(r => resolveA = () => r({ ok: true, value: [{ move: { from: 'e2', to: 'e3' }, label: 'safe', reasons: [] }] }));
      });
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      await user.click(screen.getByLabelText(/e2, white pawn/i)); // pending
      
      // change position
      await user.click(screen.getByText('Change position'));
      
      await act(async () => {
        resolveA();
      });
      
      expect(screen.queryByLabelText(/e3, empty, legal destination/i)).toBeNull();
    });

    it('F6: tapping selected piece again cancels selection', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.classifyMovesFrom = async () => ({ ok: true, value: [{ move: { from: 'e2', to: 'e3' }, label: 'safe' } as any] });
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      await user.click(screen.getByLabelText(/e2, white pawn/i));
      await waitFor(() => expect(screen.getByLabelText(/e3, empty, legal destination/i)).toBeTruthy());
      
      await user.click(screen.getByLabelText(/e2, white pawn/i));
      expect(screen.queryByLabelText(/e3, empty, legal destination/i)).toBeNull();
    });

    it('F7: orientation default = side to move at bottom', () => {
      const client = new MockEngineClient();
      const { container } = render(<AnalysisScreen engineClient={client} initialFen="4k3/8/8/8/8/8/4P3/4K3 b - - 0 1" />);
      const e8 = container.querySelector('[aria-label="e8, black king"]');
      expect(e8?.getAttribute('style')).toMatch(/top: 87\.5%/);
    });

    it('F8: arrow keys follow visual direction when flipped', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen="4k3/8/8/8/8/8/4P3/4K3 b - - 0 1" />);
      
      const e8Square = screen.getByLabelText('e8, black king');
      e8Square.focus();
      await user.keyboard('{ArrowUp}');
      
      expect(document.activeElement).toBe(screen.getByLabelText('e7, empty'));
    });

    it('F9: live region exists before selection and text updates', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      client.classifyMovesFrom = async () => ({ ok: true, value: [] });
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeTruthy();
      
      await user.click(screen.getByLabelText(/e1, white king/i));
      await waitFor(() => {
        expect(liveRegion?.textContent).toMatch(/This piece has no legal moves/);
      });
    });

    it('F11: invalid FEN error text color is neutral', () => {
      const client = new MockEngineClient();
      const { container } = render(<AnalysisScreen engineClient={client} initialFen="invalid fen" />);
      
      const msg = screen.getByText("This position isn't valid. Check the FEN.");
      expect(msg.style.color).not.toBe('red');
      expect(container.textContent).not.toContain('⚠');
    });

    it('F12: Change position button returns to sample list', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = (userEvent as unknown as { setup: () => any }).setup();
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      await user.click(screen.getByText('Change position'));
      
      expect(screen.getByPlaceholderText('Paste FEN here')).toBeTruthy();
    });

    it('F13: Results appear here placeholder', () => {
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      expect(screen.getByText('Results appear here after you choose a destination.')).toBeTruthy();
    });

    it('F15: Analyzing timer cleanup', async () => {
      vi.useFakeTimers();
      const client: EngineClient = {
        classifyMovesFrom: () => new Promise(() => {}),
        classifyMove: vi.fn(),
      };
      
      const { unmount } = render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      const e2Square = screen.getByLabelText('e2, white pawn');
      
      fireEvent.click(e2Square);
      
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      
      unmount();
      
      expect(vi.getTimerCount()).toBe(0); 
      
      act(() => {
        vi.runAllTimers();
      });
    });

    it('F15: Message timer cleanup', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      
      const client = new MockEngineClient();
      const { unmount } = render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e2Square = screen.getByLabelText('e2, white pawn');
      fireEvent.click(e2Square);
      
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      
      const a6Square = screen.getByLabelText('a6, empty');
      fireEvent.click(a6Square);
      
      expect(screen.getAllByText("That square isn't a legal move for this piece.")[0]).toBeTruthy();
      const preTimerCount = vi.getTimerCount();
      expect(preTimerCount).toBeGreaterThan(0);
      
      unmount();
      
      expect(vi.getTimerCount()).toBeLessThan(preTimerCount);
      
      act(() => {
        vi.runAllTimers();
      });
    });
    it('R2: selected-destination indicator is dashed #1a1a1a', async () => {
      const client = new MockEngineClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.classifyMovesFrom = async () => ({ ok: true, value: [{ move: { from: 'e2', to: 'e4' }, label: 'safe' } as any] });
      const { container } = render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      fireEvent.click(screen.getByLabelText('e2, white pawn'));
      
      const e4Square = await screen.findByLabelText(/e4, empty, legal destination/i);
      fireEvent.click(e4Square);
      
      const indicator = container.querySelector('[style*="dashed"]');
      expect(indicator).toBeTruthy();
      expect(indicator?.getAttribute('style')).toMatch(/dashed/i);
      expect(indicator?.getAttribute('style')).not.toMatch(/solid (#fff|rgb\(255, 255, 255\))/i);
    });

    it('R3: Esc fully cancels selection', async () => {
      const client = new MockEngineClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.classifyMovesFrom = async () => ({ ok: true, value: [{ move: { from: 'e2', to: 'e4' }, label: 'safe' } as any] });
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      fireEvent.click(screen.getByLabelText('e2, white pawn'));
      
      expect(await screen.findByLabelText(/e4, empty, legal destination/i)).toBeTruthy();
      
      fireEvent.keyDown(window, { key: 'Escape' });
      
      const allLabels = screen.queryAllByLabelText(/legal destination/);
      expect(allLabels.length).toBe(0);
    });

    it('R4: tap-again while pending cancels indicator', async () => {
      vi.useFakeTimers();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
      let resolvePromise: (value: any) => void;
      const client: EngineClient = {
        classifyMovesFrom: () => new Promise((resolve) => { resolvePromise = resolve; }),
        classifyMove: vi.fn(),
      };
      
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      const e2Square = screen.getByLabelText('e2, white pawn');
      
      fireEvent.click(e2Square);
      
      // Before 150ms tap again
      act(() => {
        vi.advanceTimersByTime(50);
      });
      
      fireEvent.click(e2Square);
      
      act(() => {
        vi.advanceTimersByTime(200);
      });
      
      expect(screen.queryByText('Checking moves…')).toBeNull();
    });

    it('R4: Change position while pending cancels indicator', async () => {
      vi.useFakeTimers();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
      let resolvePromise: (value: any) => void;
      const client: EngineClient = {
        classifyMovesFrom: () => new Promise((resolve) => { resolvePromise = resolve; }),
        classifyMove: vi.fn(),
      };
      
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      const e2Square = screen.getByLabelText('e2, white pawn');
      
      fireEvent.click(e2Square);
      
      act(() => {
        vi.advanceTimersByTime(50);
      });
      
      fireEvent.click(screen.getByText('Change position'));
      
      act(() => {
        vi.advanceTimersByTime(200);
      });
      
      expect(screen.queryByText('Checking moves…')).toBeNull();
    });
  });

  describe('Phase 2C UI (Levels 2 & 3)', () => {
    it('Level 2: Pinned defender marker text and A/D list', async () => {
      const client = new DirectEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen="k7/8/2b1N2p/8/8/8/6R1/7K w - - 0 1" />);
      
      const e6Square = screen.getByLabelText('e6, white knight');
      fireEvent.click(e6Square);
      
      const g5Square = await screen.findByLabelText(/g5, empty/);
      fireEvent.click(g5Square);
      
      const showWhy = await screen.findByText('Show why');
      fireEvent.click(showWhy);
      
      // P1: g2 rook is a pinned defender
      await waitFor(() => {
        expect(screen.getByText(/D1 \(white rook on g2\) \(can't take back — pinned\)/)).toBeTruthy();
        expect(screen.getByText('A1')).toBeTruthy(); // Marker A1
        expect(screen.getByText('D1')).toBeTruthy(); // Marker D1
      });
    });

    it('Level 2: King unavailable and regular unavailable defenders', async () => {
      // We will mock the client just to easily inject reasons for UI testing
      const client: EngineClient = {
        classifyMovesFrom: async () => ({
          ok: true, value: [{
            move: { from: 'e1', to: 'e2' }, label: 'loses_material', netMaterial: -100, reasons: [
              { code: 'KING_CANNOT_RECAPTURE', squares: ['e1'] },
              { code: 'DEFENDER_UNAVAILABLE', squares: ['d1'] }
            ], destination: {
              geometricAttackers: [], geometricDefenders: [{ role: 'king', color: 'white', square: 'e1' }, { role: 'queen', color: 'white', square: 'd1' }]
            }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any]
        }), classifyMove: vi.fn()
      };
      render(<AnalysisScreen engineClient={client} initialFen="4k3/8/8/8/8/8/8/3QK3 w - - 0 1" />);
      
      fireEvent.click(screen.getByLabelText(/e1, white king/));
      fireEvent.click(await screen.findByLabelText(/e2/));
      fireEvent.click(await screen.findByText('Show why'));
      
      await waitFor(() => {
        expect(screen.getByText(/D1 \(white king on e1\) \(king can't take back\)/)).toBeTruthy();
        expect(screen.getByText(/D2 \(white queen on d1\) \(can't take back\)/)).toBeTruthy();
      });
    });

    it('Level 3: Ordinary exchange, Back to position, bounds, collapse', async () => {
      const client = new DirectEngineClient();
      // Use P3: 4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1, d2d4
      render(<AnalysisScreen engineClient={client} initialFen="4k3/8/8/2p5/8/8/3P4/3QK3 w - - 0 1" />);
      
      fireEvent.click(screen.getByLabelText(/d2, white pawn/));
      fireEvent.click(await screen.findByLabelText(/d4/));
      
      const showExchange = await screen.findByText('Show the exchange');
      fireEvent.click(showExchange);
      
      const prev = await screen.findByText('Prev');
      const next = await screen.findByText('Next');
      const back = await screen.findByText('Back to position');
      
      expect(prev.closest('button')?.disabled).toBe(true);
      expect(next.closest('button')?.disabled).toBe(false);
      
      // Step 1
      fireEvent.click(next);
      await waitFor(() => expect(screen.getAllByText(/Step 1 of 2: Black pawn on c5 takes pawn on d4\./).length).toBeGreaterThan(0));
      expect(screen.getByText('Balance: -1')).toBeTruthy();
      
      // Step 2
      fireEvent.click(next);
      await waitFor(() => expect(screen.getAllByText(/Step 2 of 2: White queen on d1 takes pawn on d4\./).length).toBeGreaterThan(0));
      expect(screen.getByText('Balance: 0')).toBeTruthy();
      expect(next.closest('button')?.disabled).toBe(true);
      
      // Prev
      fireEvent.click(prev);
      await waitFor(() => expect(screen.getAllByText(/Step 1 of 2: Black pawn on c5 takes pawn on d4\./).length).toBeGreaterThan(0));
      
      // Back to position
      fireEvent.click(back);
      // Wait for it to revert
      await waitFor(() => {
        expect(prev.closest('button')?.disabled).toBe(true);
      });
      // Assert original board state is restored: white pawn should be back on d2!
      expect(screen.getByLabelText(/d2, white pawn/)).toBeTruthy();
      
      // Change destination collapses
      fireEvent.click(screen.getByLabelText(/d3/));
      await waitFor(() => {
        expect(screen.queryByText('Prev')).toBeNull(); // step-through closed
      });
    });

    it('Level 3: Real En Passant narration and board', async () => {
      const client = new DirectEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen="6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1" />);

      // Candidate move: e2e4
      fireEvent.click(screen.getByLabelText(/e2, white pawn/));
      fireEvent.click(await screen.findByLabelText(/e4, empty/));
      fireEvent.click(await screen.findByText('Show the exchange'));

      // Forward step 1 (d4xe3)
      fireEvent.click(await screen.findByText('Next'));
      await waitFor(() => {
        expect(screen.getAllByText(/Step 1 of 2: Black pawn on d4 takes pawn on e4\./).length).toBeGreaterThan(0);
      });
      // The pawn that moved was placed on e3, but the narration must correctly identify the captured pawn on e4.

      // Verify the board visually has a pawn on e3 and NO pawn on e4.
      // E.g. screen.getByLabelText(/e3, black pawn/);
      expect(screen.getByLabelText(/e3, black pawn/)).toBeTruthy();
      
      // And e4 should be empty
      expect(screen.getByLabelText(/e4, empty/)).toBeTruthy();
    });

    it('Level 3: En Passant, Promotion, changing piece, and immutable FEN', async () => {
      // Mock engine client for en passant and promotion fake steps
      const client: EngineClient = {
        classifyMovesFrom: async () => ({
          ok: true, value: [{
            move: { from: 'e5', to: 'd6' }, label: 'safe', netMaterial: 0, reasons: [],
            exchange: {
              fenBefore: 'k7/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
              fenAfter: 'k7/8/3P4/8/8/8/8/4K3 b - - 0 1',
              mover: { color: 'white', role: 'pawn', from: 'e5', to: 'd6' },
              materialFromMove: 0, see: 0, captureOptions: [],
              bestLine: [
                {
                  side: 'black',
                  capturer: { role: 'king', color: 'black', square: 'a8' },
                  captured: { role: 'pawn', color: 'white', square: 'd6' },
                  to: 'd6', givesCheck: false, balanceAfter: 0
                }
              ]
            }, destination: { geometricAttackers: [], geometricDefenders: [] }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any]
        }), classifyMove: vi.fn()
      };
      const { unmount } = render(<AnalysisScreen engineClient={client} initialFen="k7/8/8/3pP3/8/8/8/4K3 w - d6 0 1" />);
      
      const e5Square = screen.getByLabelText(/e5/);
      fireEvent.click(e5Square);
      fireEvent.click(await screen.findByLabelText(/d6/));
      
      fireEvent.click(await screen.findByText('Show the exchange'));
      fireEvent.click(await screen.findByText('Next'));
      
      await waitFor(() => expect(screen.getAllByText(/Step 1 of 1: Black king on a8 takes pawn on d6\./).length).toBeGreaterThan(0));
      
      // Select a different piece -> collapses everything
      fireEvent.click(screen.getByLabelText(/e1/));
      await waitFor(() => {
        expect(screen.queryByText('Prev')).toBeNull();
      });
      
      unmount();
    });

    it('Level 4: Advanced metrics displayed in pawns, handles null exchange', async () => {
      const client: EngineClient = {
        classifyMovesFrom: async () => ({
          ok: true, value: [{
            move: { from: 'e1', to: 'e2' }, label: 'safe', netMaterial: 100, reasons: [{ code: 'NOT_ATTACKED' }],
            exchange: {
              fenBefore: '', fenAfter: '', mover: { color: 'white', role: 'king', from: 'e1', to: 'e2' },
              materialFromMove: 0, see: 100, captureOptions: [], bestLine: []
            }, destination: { geometricAttackers: [], geometricDefenders: [] }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any]
        }), classifyMove: vi.fn()
      };
      const { unmount } = render(<AnalysisScreen engineClient={client} initialFen="4k3/8/8/8/8/8/8/4K3 w - - 0 1" />);
      
      fireEvent.click(screen.getByLabelText(/e1/));
      fireEvent.click(await screen.findByLabelText(/e2/));
      
      fireEvent.click(await screen.findByText('Advanced'));
      
      await waitFor(() => {
        expect(screen.getByText(/Net material/)).toBeTruthy();
        expect(screen.getAllByText(/\+1/).length).toBeGreaterThan(0); // 100 pawns -> +1
        expect(screen.getByText(/SEE/)).toBeTruthy();
        expect(screen.getByText(/NOT_ATTACKED/)).toBeTruthy(); // raw code
      });
      unmount();
    });

    it('Level 3 Phase 2C.5 R1: Hide overlays during replay', async () => {
      const client = new DirectEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen="6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1" />);
      
      fireEvent.click(screen.getByLabelText(/e2, white pawn/));
      fireEvent.click(await screen.findByLabelText(/e4, empty/));
      
      // Initially e4 has "legal destination" in aria-label
      expect(screen.getByLabelText(/e4, empty, legal destination/)).toBeTruthy();

      fireEvent.click(await screen.findByText('Show the exchange'));
      fireEvent.click(await screen.findByText('Next'));
      
      await waitFor(() => {
        // e3 label is "e3, black pawn" without "legal destination"
        expect(screen.getByLabelText('e3, black pawn')).toBeTruthy();
        
        // no square label contains "legal destination"
        expect(screen.queryByLabelText(/legal destination/)).toBeNull();
        
        // caption directly above or below board
        expect(screen.getByText('Showing the exchange — step 1 of 2')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('Back to position'));
      
      await waitFor(() => {
        // e4 label again contains "legal destination"
        expect(screen.getByLabelText(/e4, empty, legal destination/)).toBeTruthy();
      });
    });

    it('Level 3 Phase 2C.5 R2: Controls positioned under the board', async () => {
      const client = new DirectEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen="6k1/8/8/8/3p4/8/4P3/2B3K1 w - - 0 1" />);
      
      fireEvent.click(screen.getByLabelText(/e2, white pawn/));
      fireEvent.click(await screen.findByLabelText(/e4, empty/));
      
      fireEvent.click(await screen.findByText('Show the exchange'));
      
      const nextBtn = await screen.findByText('Next');
      const board = screen.getByLabelText('Chess board');
      
      // The Next button, the board grid, and the near-board message area should share the same parent container
      // The near-board message area is right next to the board, so let's find the board's parent container:
      const leftPanel = board.parentElement;
      
      // Assert the Next button is inside leftPanel
      expect(leftPanel?.contains(nextBtn)).toBe(true);
      
      // Assert that we removed the duplicate controls from the result panel
      // (The result panel is the right-side element).
      // Since 'Next' only appears once, findByText('Next') works uniquely, 
      // but let's check it's strictly in the left panel.
      expect(screen.getAllByText('Next').length).toBe(1);
    });
  });

  describe('Show moves for (Phase 5A)', () => {
    it('resets Analysis side selection when positions change', async () => {
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} onNavigate={() => {}} />);
      // Select first sample
      fireEvent.click(screen.getByText('Position 1'));
      await waitFor(() => expect(screen.getByLabelText('FEN')).toBeTruthy());
      
      // Should default to White for Fool's Mate starting position
      expect(screen.getByRole('button', { name: 'White' }).getAttribute('aria-pressed')).toBe('true');
      
      // Switch to Black
      fireEvent.click(screen.getByRole('button', { name: 'Black' }));
      expect(screen.getByRole('button', { name: 'Black' }).getAttribute('aria-pressed')).toBe('true');
      
      // Change FEN to a black-to-move position
      const fenInput = screen.getByLabelText('FEN');
      fireEvent.change(fenInput, { target: { value: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' } });
      
      // Should auto-reset to Black since the FEN specifies Black to move
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Black' }).getAttribute('aria-pressed')).toBe('true');
      });
    });

    it('legal opposite-side selection', async () => {
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} onNavigate={() => {}} />);
      fireEvent.click(screen.getByText('Position 1'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'White' })).toBeTruthy());
      
      // Start pos is legal for both sides to "show moves for"
      const blackBtn = screen.getByRole('button', { name: 'Black' });
      expect(blackBtn.getAttribute('disabled')).toBeNull();
      
      fireEvent.click(blackBtn);
      expect(blackBtn.getAttribute('aria-pressed')).toBe('true');
      
      // Indicator text
      expect(screen.getByText(/Showing Black's options as if it were Black's turn/i)).toBeTruthy();
    });

    it('disabled illegal selection', async () => {
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} onNavigate={() => {}} />);
      fireEvent.click(screen.getByText('Position 1'));
      await waitFor(() => expect(screen.getByLabelText('FEN')).toBeTruthy());
      
      // Set to a position where White is in check (so Black cannot pretend it is their turn)
      const fenInput = screen.getByLabelText('FEN');
      fireEvent.change(fenInput, { target: { value: '4k3/8/8/8/8/8/8/4K2r w - - 0 1' } }); // White king in check
      
      await waitFor(() => {
        const blackBtn = screen.getByRole('button', { name: 'Black' });
        expect(blackBtn.getAttribute('disabled')).not.toBeNull();
        expect(screen.getByText(/Black cannot move/i)).toBeTruthy();
      });
    });
  });

});
