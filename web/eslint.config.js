import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist', 'coverage', 'features/artifacts'] },
  {
    files: ['**/*.{js,jsx}'],
    ...js.configs.recommended,
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: {
        pragma: 'h',
        version: '16.0',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/no-unknown-property': ['error', { ignore: ['class', 'for'] }],
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.js', 'scripts/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Step definitions run in Node but pass callbacks to page.evaluate() that run in the browser.
    files: ['features/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['src/data/**/*.js'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'fetch'].map(
          (name) => ({ name, message: 'src/data must not use browser APIs (ARCH-1).' }),
        ),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['preact', 'preact/*'],
              message: 'src/data must stay framework-free (ARCH-1).',
            },
            {
              group: ['../components/*', '../App*', '*.css'],
              message: 'src/data must not depend on UI code (ARCH-1).',
            },
          ],
        },
      ],
    },
  },
];
