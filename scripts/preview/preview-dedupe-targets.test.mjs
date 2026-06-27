// @vitest-environment node

import { expect, it } from 'vitest';

import { TARGET_PATHS } from './preview-dedupe-targets.mjs';

it('includes desktop renderer entry files in the windows preview surface', () => {
  expect(TARGET_PATHS.windows).toEqual(expect.arrayContaining([
    'src/global.d.ts',
    'src/main.tsx',
    'src/startupBootstrap.ts',
    'src/startupViewMode.ts'
  ]));
});

it('includes Electron dev shell inputs in the windows preview surface', () => {
  expect(TARGET_PATHS.windows).toEqual(expect.arrayContaining([
    'scripts/electron-dev-env.mjs',
    'scripts/electron-dev-server.mjs',
    'scripts/electron-dev.mjs',
    'scripts/windows/'
  ]));
});

it('includes shared companion build inputs in the android preview surface', () => {
  expect(TARGET_PATHS.android).toEqual(expect.arrayContaining([
    'src/app/styles.css',
    'src/app/tokens/',
    'src/app/generated/appearance-colors.css',
    'electron/startupSkeletonLayout.ts',
    'index.html',
    'public/favicon.ico',
    'public/favicon.png',
    'tailwind.config.js',
    'vite.shared.ts'
  ]));
});
