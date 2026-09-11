// @vitest-environment node

import { expect, it } from 'vitest';

import { syncGroupResultManifestPath } from './windows-sync-group-build-routing.mjs';

it('resolves each T173 product receipt through the registered action route', () => {
  expect(syncGroupResultManifestPath({
    multiDeviceSyncC: { manifestPath: 'multi-device-sync-c.json' }
  }, 'multi-device-sync-c')).toBe('multi-device-sync-c.json');
  expect(syncGroupResultManifestPath({
    twoDeviceSyncProvider: { manifestPath: 'two-device-sync-provider.json' }
  }, 'two-device-sync-provider')).toBe('two-device-sync-provider.json');
});
