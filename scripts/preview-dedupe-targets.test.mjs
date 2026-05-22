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
