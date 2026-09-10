import { expect, it } from 'vitest';

import { normalizeReadwiseHostSettings } from './readwiseHostSettings.js';

it('migrates legacy Host settings to folder mode without borrowing API readiness', () => {
  expect(normalizeReadwiseHostSettings({
    readwiseRootPath: '/Readwise',
    version: 1
  })).toMatchObject({
    autoImportPolicyVersion: 2,
    apiConnection: { secretRef: null, state: 'disconnected', verifiedAt: null },
    readwiseRootPath: '/Readwise',
    readwiseSourceMode: 'folder',
    version: 4
  });
});

it('preserves explicit API mode and redacted credential metadata', () => {
  expect(normalizeReadwiseHostSettings({
    apiConnection: {
      secretRef: 'readwise-api-11111111-1111-1111-1111-111111111111.bin',
      state: 'connected',
      verifiedAt: '2026-09-07T00:00:00.000Z'
    },
    readwiseSourceMode: 'api',
    version: 3
  })).toMatchObject({
    apiConnection: { state: 'connected' },
    readwiseSourceMode: 'api',
    version: 4
  });
});

it('preserves an explicit disabled source mode', () => {
  expect(normalizeReadwiseHostSettings({ readwiseSourceMode: 'off', version: 2 }))
    .toMatchObject({ readwiseSourceMode: 'off' });
});

it('rejects a future settings version instead of downgrading it', () => {
  expect(() => normalizeReadwiseHostSettings({ version: 5 }))
    .toThrow('readwise_host_settings_version_unsupported');
});
