import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** 다른 계층 폴더를 가리키는 import 를 막는다 (ARCHITECTURE 3장) */
const forbidLayers = (layers, message) => ({
  regex: `(^|/)(${layers.join('|')})(/|$)`,
  message,
});

export default defineConfig(
  { ignores: ['dist', 'node_modules', 'android'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['src/**/*.tsx'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['tools/**/*.ts', 'vite.config.ts', 'apps-in-toss.config.ts', 'capacitor.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['src/core/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^(react|react-dom|phaser|zustand)(/|$)', message: 'core 는 라이브러리에 의존하지 않는다' },
            forbidLayers(['data', 'session', 'store', 'game', 'ui', 'persistence', 'platform', 'dev'], 'core 는 다른 계층을 모른다'),
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '시드 RNG(core/rng) 를 쓴다' },
        { object: 'Date', property: 'now', message: '시각은 인자로 받는다' },
      ],
    },
  },
  {
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [forbidLayers(['ui', 'store'], 'game 은 session 을 통해서만 상태를 본다')] }],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^phaser$', message: 'ui 는 Phaser 를 직접 쓰지 않는다 (mountBattle 사용)' },
            forbidLayers(['game', 'persistence'], 'ui 는 session · store 를 통해서만 동작한다'),
          ],
        },
      ],
    },
  },
);
