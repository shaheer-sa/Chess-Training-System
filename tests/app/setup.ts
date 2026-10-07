import { expect, afterEach } from 'vitest';
import * as matchers from 'vitest-axe/matchers';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
