// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(eslint.configs.recommended, ...tseslint.configs.strict, prettier, {
  rules: {
    'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
    'no-console': 'error',
    'eqeqeq': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
}, {
  files: ['**/scripts/**/*.ts'],
  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'max-lines-per-function': 'off',
  },
}, {
  // Arquivos de teste: describe() callbacks são naturalmente grandes
  files: ['**/*.test.ts', '**/*.spec.ts', '**/e2e/**/*.ts'],
  rules: {
    'max-lines-per-function': 'off',
    'max-lines': 'off',
    'no-console': 'off',
  },
}, {
  ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.ts'],
}, storybook.configs["flat/recommended"]);
