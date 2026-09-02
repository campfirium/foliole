import { describe, expect, it } from 'vitest';

import { createSyncGroupDeviceIdentity } from '../../../lib/platform/syncGroupUnifiedContract';

import { providerFromDiscovery } from './companionSyncGroupJoinClient';

describe('companion Sync Group provider identity', () => {
  it('reconstructs the discovered Mac provider for local membership persistence', () => {
    const device = createSyncGroupDeviceIdentity({
      device_anchor: '11111111-1111-4111-8111-111111111111',
      group_id: 'group-1', library_path: '/mac/library/foliole.db', path_flavor: 'posix'
    });

    expect(providerFromDiscovery({
      providerDeviceId: device.identity_key,
      providerDeviceName: 'Mac Studio',
      providerPlatform: 'darwin'
    }, 'group-1')).toEqual({ device, deviceName: 'Mac Studio', platform: 'darwin' });
  });

  it('rejects a provider identity from a different group', () => {
    const device = createSyncGroupDeviceIdentity({
      device_anchor: '11111111-1111-4111-8111-111111111111',
      group_id: 'group-other', library_path: '/mac/library/foliole.db', path_flavor: 'posix'
    });

    expect(() => providerFromDiscovery({
      providerDeviceId: device.identity_key,
      providerDeviceName: 'Mac Studio', providerPlatform: 'darwin'
    }, 'group-1')).toThrow('sync_group_provider_identity_invalid');
  });
});
