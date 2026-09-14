import { expect, it } from 'vitest';

import { normalizeReadwiseHostSettings } from './readwiseHostSettings.js';

it('removes the legacy source mode from Host settings', () => {
  expect(normalizeReadwiseHostSettings({
    readwiseRootPath: '/Readwise',
    version: 1
  })).toMatchObject({
    autoImportPolicyVersion: 3,
    apiConnection: { secretRef: null, state: 'disconnected', verifiedAt: null },
    readwiseRootPath: '/Readwise',
    version: 6
  });
});

it('preserves redacted credential metadata without retaining API mode', () => {
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
    version: 6
  });
});

it('drops an explicit disabled source mode from Host state', () => {
  expect(normalizeReadwiseHostSettings({ readwiseSourceMode: 'off', version: 2 }))
    .not.toHaveProperty('readwiseSourceMode');
});

it('rejects a future settings version instead of downgrading it', () => {
  expect(() => normalizeReadwiseHostSettings({ version: 7 }))
    .toThrow('readwise_host_settings_version_unsupported');
});
