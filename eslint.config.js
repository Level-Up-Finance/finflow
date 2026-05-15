// =============================================================
// FinFlow — ESLint flat config
// =============================================================
// Foco: detectar código morto (TASK-A) e bugs sutis sem ser
// chato com estilo. Stack vanilla JS + ES Modules + browser.
// Rode: npm run lint  (ou npm run lint:fix pra autofix)
// =============================================================
import js from '@eslint/js';

export default [
  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Browser
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Intl: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        // Timers
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // DOM events / classes
        Event: 'readonly',
        CustomEvent: 'readonly',
        Element: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        getComputedStyle: 'readonly',
        // Async helpers
        Promise: 'readonly',
        AbortController: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        // Carregado por libs externas via <script> em alguns lugares
        XLSX: 'readonly',
      },
    },

    rules: {
      // ── O que importa: pegar dead code automaticamente ─────────
      'no-unused-vars': ['warn', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-imports': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],

      // ── Relaxar regras irritantes ──────────────────────────────
      'no-prototype-builtins': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
    },
  },

  // Scripts Node (extract-strings, sync-strings, query.mjs)
  {
    files: ['scripts/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
      },
    },
  },

  // Vite config
  {
    files: ['vite.config.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
      },
    },
  },

  {
    ignores: ['dist/**', 'node_modules/**', '.vercel/**', 'extracted-strings.json'],
  },
];
