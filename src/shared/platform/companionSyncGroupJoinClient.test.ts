import { describe, expect, it } from 'vitest';

import {
  IOS_HOSTED_PROVIDER_DEVICE_ID,
  IOS_HOSTED_PROVIDER_NAME,
  IOS_HOSTED_SYNC_GROUP_ID
} from '../../../lib/platform/iosHostedSyncGroupContract';
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

  it('accepts the hosted iOS provider discovery identity', () => {
    expect(providerFromDiscovery({
      providerDeviceId: IOS_HOSTED_PROVIDER_DEVICE_ID,
      providerDeviceName: IOS_HOSTED_PROVIDER_NAME,
      providerPlatform: 'macOS'
    }, IOS_HOSTED_SYNC_GROUP_ID).device.identity_key).toBe(IOS_HOSTED_PROVIDER_DEVICE_ID);
  });
});
