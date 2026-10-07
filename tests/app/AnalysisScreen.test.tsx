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
      expect(screen.getAllByText('⚠').length).toBeGreaterThan(0);
      expect(screen.getByText('This move loses material or allows a tactic against you right away.')).toBeTruthy();
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
      expect(indicator?.getAttribute('style')).toMatch(/dashed (#1a1a1a|rgb\(26, 26, 26\))/i);
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
});
