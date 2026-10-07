import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'engine',
      include: ['tests/engine/**/*.test.ts', 'tests/spike/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'app',
      include: ['tests/app/**/*.test.tsx', 'tests/app/**/*.test.ts'],
      environment: 'jsdom',
    },
  },
]);
