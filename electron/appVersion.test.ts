import { expect, it } from 'vitest';

import { resolveFolioleAppVersion } from './appVersion.js';

it('uses the package version when Electron exposes its runtime version as the app version', () => {
  expect(
    resolveFolioleAppVersion(
      { getVersion: () => '41.7.0' },
      { npm_package_version: '0.6.1' },
      '41.7.0'
    )
  ).toBe('0.6.1');
});

it('keeps the Electron app version when it is already an application version', () => {
  expect(
    resolveFolioleAppVersion(
      { getVersion: () => '1.2.3' },
      { npm_package_version: '0.6.1' },
      '41.7.0'
    )
  ).toBe('1.2.3');
});

it('falls back to the package manifest when npm does not provide a package version', () => {
  expect(resolveFolioleAppVersion({ getVersion: () => '41.7.0' }, {}, '41.7.0')).toBe('0.6.1');
});
