import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

const testGlobals = {
  describe: 'readonly',
  it: 'readonly',
  expect: 'readonly',
  vi: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
};

const unusedVars = ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/logs/**'] },
  js.configs.recommended,

  // Backend (Node, ESM)
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { 'no-unused-vars': unusedVars },
  },

  // Frontend (React, browser)
  {
    files: ['client/src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': unusedVars,
    },
  },

  // Test files (Vitest globals)
  {
    files: ['**/*.test.{js,jsx}', 'server/tests/**/*.js', 'client/src/test/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...testGlobals } },
  },

  // Config files run under Node
  {
    files: ['**/vite.config.js', '**/vitest.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Disable stylistic rules that conflict with Prettier
  prettier,
];
