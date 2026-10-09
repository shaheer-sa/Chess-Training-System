/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { SettingsPanel } from '../../src/app/components/SettingsPanel.js';
import { Home } from '../../src/app/screens/Home.js';
import { DirectEngineClient } from '../../src/app/engine/DirectEngineClient.js';

afterEach(() => { cleanup(); document.documentElement.classList.remove('rv-reduce-motion'); });
const S = { reduceMotion: false, coordinates: true, loadingScreen: true };

describe('settings panel and reduced motion (review fixes)', () => {
  it('a closing panel is no longer a modal dialog and cannot be reached', () => {
    const { rerender, container } = render(<SettingsPanel open={true} onClose={() => {}} settings={S} onChange={() => {}} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    rerender(<SettingsPanel open={false} onClose={() => {}} settings={S} onChange={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelector('.rv-sheet-panel')?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('[aria-modal]')).toBeNull();
  });

  it("Home's demo readout shows the whole sentence at once when Reduce animations is on", async () => {
    document.documentElement.classList.add('rv-reduce-motion');
    const { container } = render(<Home onNavigate={() => {}} engineClient={new DirectEngineClient()} />);
    await waitFor(() => expect(container.querySelector('.rv-demo-readout .sr-only')).toBeTruthy());
    const readout = container.querySelector('.rv-demo-readout')!;
    const full = readout.querySelector('.sr-only')!.textContent!;
    expect(full.length).toBeGreaterThan(10);
    // No typing: the whole sentence is there right away (well before a typing effect could finish).
    await waitFor(() => expect(readout.querySelector('[aria-hidden="true"]')!.textContent).toBe(full), { timeout: 100 });
    expect(container.querySelector('.rv-caret')).toBeNull();
  });
});
