import { expect, afterEach, beforeEach } from 'vitest';
// @ts-expect-error vitest-axe types are missing
import * as matchers from 'vitest-axe/matchers';
import { cleanup } from '@testing-library/react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
expect.extend(matchers as any);

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
});
