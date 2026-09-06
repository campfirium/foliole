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

  it('reconstructs the advertised Windows provider with Windows path semantics', () => {
    const device = createSyncGroupDeviceIdentity({
      device_anchor: '22222222-2222-4222-8222-222222222222',
      group_id: 'group-1', library_path: 'D:\\Foliole\\foliole.db', path_flavor: 'windows'
    });

    expect(providerFromDiscovery({
      providerDeviceId: device.identity_key,
      providerDeviceName: 'V',
      providerPlatform: 'Windows'
    }, 'group-1')).toEqual({ device, deviceName: 'V', platform: 'Windows' });
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
