/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';
// @ts-expect-error vitest-axe matchers missing types
import * as matchers from 'vitest-axe/matchers';
import React from 'react';
import { Home } from '../../src/app/screens/Home.js';
import { AppShell } from '../../src/app/components/AppShell.js';
import { fireEvent } from '@testing-library/react';
import { Help } from '../../src/app/screens/Help.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
expect.extend(matchers as any);

afterEach(() => {
  cleanup();
}, 10000);

describe('Accessibility - Other Screens', () => {
  it('Home screen has no violations', async () => {
    const { container } = render(<Home onNavigate={() => {}} />);
    const results = await axe(container);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (expect(results) as any).toHaveNoViolations();
  }, 10000);

  it('Help screen has no violations', async () => {
    const { container } = render(<Help onNavigate={() => {}} />);
    const results = await axe(container);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (expect(results) as any).toHaveNoViolations();
  }, 10000);
  it('AppShell + Home has no violations (desktop)', async () => {
    const { container } = render(<AppShell currentScreen="home" onNavigate={() => {}}><Home onNavigate={() => {}} /></AppShell>);
    const results = await axe(container);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (expect(results) as any).toHaveNoViolations();
  }, 10000);

  it('AppShell + Home has no violations (mobile menu open)', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
    window.dispatchEvent(new Event('resize'));
    const { container } = render(<AppShell currentScreen="home" onNavigate={() => {}}><Home onNavigate={() => {}} /></AppShell>);
    
    // jsdom doesn't apply media queries, so manually hide desktop nav
    const desktopNav = container.querySelector('.desktop-nav') as HTMLElement;
    if (desktopNav) desktopNav.style.display = 'none';

    const btn = container.querySelector('button[aria-label="Open navigation menu"]');
    if (btn) fireEvent.click(btn);
    const results = await axe(container);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (expect(results) as any).toHaveNoViolations();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    window.dispatchEvent(new Event('resize'));
  }, 10000);
});
