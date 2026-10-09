import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', '*.log', 'smoke-screenshots/**', 'public/**'],
  },
  {
    // Supervisor CI scripts run in Node.
    files: ['scripts/ci/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', fetch: 'readonly', setTimeout: 'readonly', document: 'readonly' },
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['*/app/*', '../../app/*', '../app/*'],
          message: 'Engine files cannot import from app files.'
        }]
      }]
    }
  }
);
