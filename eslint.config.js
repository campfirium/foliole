import js from '@eslint/js';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'electron-dist/**',
      'coverage/**',
      '.claude/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.tmp/**',
      '.tmp-tests/**',
      'logs/**',
      'ref/**',
      '.lab/**',
      'src-tauri/**'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest
      }
    },
    plugins: {
      '@typescript-eslint': tsEslintPlugin,
      import: importPlugin
    },
    rules: {
      ...tsEslintPlugin.configs.recommended.rules,
      'no-undef': 'off',
      'max-lines': [
        'error',
        {
          max: 260,
          skipBlankLines: true,
          skipComments: true
        }
      ],
      'max-lines-per-function': [
        'error',
        {
          max: 60,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true
        }
      ],
      'import/order': [
        'error',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always',
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index']
        }
      ]
    }
  },
  {
    files: ['src/{app,features,store}/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'better-sqlite3',
            'child_process',
            'electron',
            'fs',
            'node:child_process',
            'node:fs',
            'node:path',
            'path'
          ],
          patterns: ['child_process/*', 'electron/*', 'fs/*', 'node:child_process/*', 'node:fs/*', 'node:path/*', 'path/*']
        }
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'globalThis',
          property: 'electron',
          message: 'Use an existing shared platform bridge or adapter instead.'
        },
        {
          object: 'globalThis',
          property: 'electronAPI',
          message: 'Use an existing shared platform bridge or adapter instead.'
        },
        {
          object: 'window',
          property: 'electron',
          message: 'Use an existing shared platform bridge or adapter instead.'
        },
        {
          object: 'window',
          property: 'electronAPI',
          message: 'Use an existing shared platform bridge or adapter instead.'
        },
        {
          object: 'window',
          property: 'alert',
          message: 'Use the app-owned notice, dialog, or panel surface instead of native browser alerts.'
        }
      ]
    }
  }
];
