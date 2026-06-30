// @vitest-environment node

import { expect, it } from 'vitest';

import { resolveWindowsNativeCheckSteps } from './windows-native-check.mjs';

it('uses a lightweight Windows native check matrix by default', () => {
  expect(resolveWindowsNativeCheckSteps(['node', 'script']).map((step) => step.label)).toEqual([
    'preflight',
    'native path tests'
  ]);
});

it('includes heavy validation entries only when requested', () => {
  expect(resolveWindowsNativeCheckSteps(['node', 'script', '--full']).map((step) => step.label)).toEqual([
    'preflight',
    'native path tests',
    'shared tests',
    'quality core tests',
    'quality gate tests',
    'quality gate integration tests',
    'quality node tests',
    'quality preview tests',
    'desktop typecheck',
    'desktop lint'
  ]);
});
