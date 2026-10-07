import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', '*.log'],
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
