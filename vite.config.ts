/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        name: 'engine',
        test: {
          include: ['tests/engine/**/*.test.ts', 'tests/spike/**/*.test.ts'],
          environment: 'node',
        }
      },
      {
        name: 'app',
        test: {
          include: ['tests/app/**/*.test.tsx', 'tests/app/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['tests/app/setup.ts'],
        }
      }
    ]
  }
});
