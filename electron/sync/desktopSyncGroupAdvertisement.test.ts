import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  group: {
    devices: [
      { device_identity_key: 'desktop-a', device_name: 'Desktop', platform: 'win32', state: 'active' }
    ],
    display_name: 'My devices',
    group_id: 'group-1',
    local_device_identity_key: 'desktop-a'
  },
  start: vi.fn(() => ['service']),
  wait: vi.fn(async () => { throw new Error('mDNS advertisement did not become available.'); })
}));

vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => runtime.group
}));
vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: () => ({ group_tag: 'tag-1' })
}));
vi.mock('./companionMdnsAdvertisement.js', () => ({
  startCompanionMdnsAdvertisement: runtime.start,
  waitForCompanionMdnsAdvertisement: runtime.wait
}));

import { advertiseDesktopSyncGroup } from './desktopSyncGroupAdvertisement.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('keeps the sync provider available when mDNS publication reports a warning', async () => {
  const onWarning = vi.fn();

  await expect(advertiseDesktopSyncGroup({
    appVersion: '1.0.0', deviceId: 'desktop-a', onWarning, port: 38641
  })).resolves.toBeUndefined();

  expect(runtime.start).toHaveBeenCalledOnce();
  expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({
    message: 'mDNS advertisement did not become available.'
  }));
});

it('fails closed without crashing the provider when the OS capability cannot start', async () => {
  const onWarning = vi.fn();
  runtime.start.mockImplementationOnce(() => { throw new Error('desktop_dnssd_unavailable'); });

  await expect(advertiseDesktopSyncGroup({
    appVersion: '1.0.0', deviceId: 'desktop-a', onWarning, port: 38641
  })).resolves.toBeUndefined();

  expect(runtime.wait).not.toHaveBeenCalled();
  expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({
    message: 'desktop_dnssd_unavailable'
  }));
});
