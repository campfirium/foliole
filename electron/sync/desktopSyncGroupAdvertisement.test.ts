import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  group: {
    devices: [
      { device_identity_key: 'desktop-a', device_name: 'Desktop', platform: 'win32', state: 'active' }
    ],
    display_name: 'My devices',
    group_id: 'group-1',
    local_device_identity_key: 'desktop-a'
  },
  start: vi.fn(async () => { throw new Error('desktop_dnssd_registration_unavailable'); })
}));

vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => runtime.group
}));
vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: () => ({ group_tag: 'tag-1' })
}));
vi.mock('./companionMdnsAdvertisement.js', () => ({
  startCompanionMdnsAdvertisement: runtime.start
}));

import { advertiseDesktopSyncGroup } from './desktopSyncGroupAdvertisement.js';

it('fails closed when OS DNS-SD publication is unavailable', async () => {
  const onWarning = vi.fn();

  await expect(advertiseDesktopSyncGroup({
    appVersion: '1.0.0', deviceId: 'desktop-a', onWarning, port: 38641
  })).rejects.toThrow('desktop_dnssd_registration_unavailable');

  expect(runtime.start).toHaveBeenCalledOnce();
  expect(runtime.start).toHaveBeenCalledWith(expect.objectContaining({ onWarning }));
});
