/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { AnalysisScreen } from '../../src/app/screens/AnalysisScreen.js';
import { DirectEngineClient } from '../../src/app/engine/DirectEngineClient.js';
import { Piece } from '../../src/app/components/Piece.js';

afterEach(() => {
  cleanup();
});

describe('Piece Assets and Accessibility', () => {
  const startpos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('starting position visually renders SVG assets and not Unicode', () => {
    const client = new DirectEngineClient();
    const { container } = render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
    
    // There are 32 pieces in the starting position
    const images = container.querySelectorAll('img');
    expect(images.length).toBe(32);

    // Images should have aria-hidden true or alt=""
    images.forEach(img => {
      expect(img.getAttribute('aria-hidden') === 'true' || img.getAttribute('alt') === '').toBeTruthy();
    });

    // Check that there are no unicode pieces used (e.g. ♟, ♞, ♝, ♜, ♛, ♚, ♙, ♘, ♗, ♖, ♕, ♔)
    const html = container.innerHTML;
    const unicodePieces = /[♔♕♖♗♘♙♚♛♜♝♞♟]/;
    expect(unicodePieces.test(html)).toBe(false);
  });

  it('all twelve role/color combinations resolve to images', () => {
    const { container } = render(
      <div>
        <Piece type="K" color="w" />
        <Piece type="Q" color="w" />
        <Piece type="R" color="w" />
        <Piece type="B" color="w" />
        <Piece type="N" color="w" />
        <Piece type="P" color="w" />
        <Piece type="K" color="b" />
        <Piece type="Q" color="b" />
        <Piece type="R" color="b" />
        <Piece type="B" color="b" />
        <Piece type="N" color="b" />
        <Piece type="P" color="b" />
      </div>
    );

    const images = container.querySelectorAll('img');
    expect(images.length).toBe(12);
    
    // Check that each src maps to an actual svg (src is populated by Vite asset imports)
    images.forEach(img => {
      expect(img.getAttribute('src')).toBeTruthy();
      expect(img.getAttribute('src')).toMatch(/(\.svg$|^data:image\/svg\+xml)/);
    });
  });

  it('piece graphics do not create duplicate accessible names, square is semantic source', () => {
    const client = new DirectEngineClient();
    render(<AnalysisScreen engineClient={client} initialFen={startpos} />);
    
    // The semantic source should be the square's aria-label
    const e2Square = screen.getByLabelText(/e2, white pawn/i);
    expect(e2Square).toBeTruthy();
    expect(e2Square.tagName.toLowerCase()).toBe('div');

    // The image inside the square must not add to the accessible name
    const img = e2Square.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('aria-hidden')).toBe('true');
    expect(img?.getAttribute('alt')).toBe('');
  });
});
