/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: 'engine',
          include: ['tests/engine/**/*.test.ts', 'tests/spike/**/*.test.ts'],
          environment: 'node',
        }
      },
      {
        test: {
          name: 'app',
          include: ['tests/app/**/*.test.tsx', 'tests/app/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['tests/app/setup.ts'],
        }
      }
    ]
  }
});
