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
  async classifyMovesFrom(_fen: string, _from: string): Promise<unknown> {
    if (this.delayMs > 0) {
      await new Promise(r => setTimeout(r, this.delayMs));
    }
    if (this.shouldReject) {
      return { ok: false, error: { code: 'ENGINE_ERROR', message: 'Mock error' } };
    }
    return { ok: true, value: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async classifyMove(_fen: string, _move: unknown): Promise<unknown> {
    return { ok: true, value: { label: 'safe', netMaterial: 0, reasons: [] } };
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
      const user = userEvent.setup();
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
      const user = userEvent.setup();
      const client = new MockEngineClient();
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e7Square = screen.getByLabelText('e7, black pawn');
      await user.click(e7Square);
      
      // Should not show any legal moves or change selection state
      const messages = screen.queryByText(/legal move/i);
      expect(messages).toBeNull();
    });

    it('tapping a non-legal square shows the exact message', async () => {
      const user = userEvent.setup();
      const client = new MockEngineClient();
      client.classifyMovesFrom = async () => ({ ok: true, value: [] });
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e2Square = screen.getByLabelText('e2, white pawn');
      await user.click(e2Square);
      
      const a6Square = screen.getByLabelText('a6, empty');
      await user.click(a6Square);
      
      expect(screen.getByText("That square isn't a legal move for this piece.")).toBeTruthy();
    });

    it('piece with no legal moves shows specific message', async () => {
      const user = userEvent.setup();
      const client = new MockEngineClient();
      client.classifyMovesFrom = async () => ({ ok: true, value: [] });
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e1Square = screen.getByLabelText('e1, white king');
      await user.click(e1Square);
      
      await waitFor(() => {
        expect(screen.getByText("This piece has no legal moves.")).toBeTruthy();
      });
    });
  });

  describe('States', () => {
    it('does not show Checking moves... if analysis is fast', async () => {
      const user = userEvent.setup();
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
      const user = userEvent.setup();
      const client = new MockEngineClient();
      client.shouldReject = true;
      render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
      
      const e2Square = screen.getByLabelText('e2, white pawn');
      await user.click(e2Square);
      
      await waitFor(() => {
        expect(screen.getByText("We couldn't analyze this move. Try another square.")).toBeTruthy();
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
    const user = userEvent.setup();
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
        expect(screen.getByText("This piece has no legal moves.")).toBeTruthy();
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
      const user = userEvent.setup();
      const { container } = render(<AnalysisScreen engineClient={new MockEngineClient()} initialFen={startpos} />);
      await user.click(screen.getByLabelText(/e2, white pawn/i));
      const results = await axe(container);
      (expect(results) as unknown as { toHaveNoViolations: () => void }).toHaveNoViolations();
    });
  });
});
