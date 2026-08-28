import { describe, expect, test } from 'vitest';

import {
  desktopDnsSdRouteFixtureFact, reciprocalDesktopDnsSdRouteIdentity
} from './desktop-dnssd-route-identity.mjs';

describe('desktop DNS-SD route fixture identity', () => {
  test('binds the group and ordered reciprocal Device identities', () => {
    const mac = { groupId: 'group-1', localDeviceId: 'mac-1', peerDeviceId: 'windows-1' };
    const windows = reciprocalDesktopDnsSdRouteIdentity(mac);

    expect(windows).toEqual({
      groupId: 'group-1', localDeviceId: 'windows-1', peerDeviceId: 'mac-1'
    });
    expect(desktopDnsSdRouteFixtureFact(windows)).toMatch(/^[0-9a-f]{64}$/u);
    expect(desktopDnsSdRouteFixtureFact(windows)).not.toBe(desktopDnsSdRouteFixtureFact(mac));
    expect(desktopDnsSdRouteFixtureFact({ ...windows, groupId: 'group-2' }))
      .not.toBe(desktopDnsSdRouteFixtureFact(windows));
  });
});
