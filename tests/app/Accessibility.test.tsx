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
import { Help } from '../../src/app/screens/Help.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
expect.extend(matchers as any);

afterEach(() => {
  cleanup();
});

describe('Accessibility - Other Screens', () => {
  it('Home screen has no violations', async () => {
    const { container } = render(<Home onNavigate={() => {}} />);
    const results = await axe(container);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (expect(results) as any).toHaveNoViolations();
  });

  it('Help screen has no violations', async () => {
    const { container } = render(<Help onNavigate={() => {}} />);
    const results = await axe(container);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (expect(results) as any).toHaveNoViolations();
  });
});
