import { expect, it } from 'vitest';

import { resolveSyncGroupDisplayDeviceName } from './syncGroupContract.js';

it('uses the persistent Sync Group display name without a creator role', () => {
  const identityKey = '[1,"group-a","a1111111-1111-4111-8111-111111111111","/foliole.db"]';
  expect(resolveSyncGroupDisplayDeviceName({
    created_at: '2026-08-08T00:00:00Z', display_name: 'Reading group',
    group_id: 'group-a', local_device_identity_key: identityKey, devices: [{
      canonical_library_path: '/foliole.db', contract_version: 1,
      device_anchor: 'a1111111-1111-4111-8111-111111111111', device_name: 'MacBook',
      device_identity_key: identityKey, joined_at: '2026-08-08T00:00:00Z',
      last_seen_at: null, left_at: null, platform: 'darwin', state: 'active',
      updated_at: '2026-08-08T00:00:00Z'
    }]
  })).toBe('Reading group');
});
