// @vitest-environment node

import { expect, it } from 'vitest';

import {
  WINDOWS_ACCEPTANCE_CONFIG,
  createWindowsAcceptanceBuilderConfig,
  resolveAcceptanceBaselineVersion,
  resolveWindowsAcceptanceOutputDir
} from './package-windows-acceptance-config.mjs';
import { createNativePackageSteps } from './package-windows.mjs';

it('accepts only an explicit stable baseline version', () => {
  expect(resolveAcceptanceBaselineVersion(['node', 'script'])).toBeNull();
  expect(resolveAcceptanceBaselineVersion([
    'node', 'script', '--acceptance-baseline-version=0.7.2'
  ])).toBe('0.7.2');
  expect(() => resolveAcceptanceBaselineVersion([
    'node', 'script', '--acceptance-baseline-version=0.7.2-internal'
  ])).toThrow('exact stable semver');
});

it('changes only version metadata and artifact output for a formal-identity package', () => {
  const config = createWindowsAcceptanceBuilderConfig({
    appId: 'com.campfirium.foliole',
    directories: { output: 'artifacts/windows' },
    extraMetadata: { folioleBuildChannel: 'github' },
    productName: 'Foliole',
    publish: [{ owner: 'campfirium', provider: 'github', repo: 'foliole' }]
  }, '0.7.2');

  expect(config).toMatchObject({
    appId: 'com.campfirium.foliole',
    directories: { output: resolveWindowsAcceptanceOutputDir('0.7.2') },
    extraMetadata: { folioleBuildChannel: 'github', version: '0.7.2' },
    productName: 'Foliole',
    publish: [{ owner: 'campfirium', provider: 'github', repo: 'foliole' }]
  });
});

it('routes the native package step through the generated acceptance config', () => {
  const steps = createNativePackageSteps(true, false, WINDOWS_ACCEPTANCE_CONFIG);

  expect(steps[0].args.join(' ')).toContain(`--config ${WINDOWS_ACCEPTANCE_CONFIG}`);
});
