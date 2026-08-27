import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { registerSyncGroupDevice, loadDesktopSyncGroupInfo } from '../database/syncGroupStore.js';

import { refreshCompanionMdnsAdvertisement } from './companionMdnsAdvertisement.js';
import { DesktopSyncGroupJoinProvider } from './syncGroupJoinProvider.js';

let active: { groupId: string; provider: DesktopSyncGroupJoinProvider } | null = null;

export function loadDesktopSyncGroupJoinProvider() {
  const groupInfo = loadDesktopSyncGroupInfo();
  if (!groupInfo) {
    active?.provider.clear();
    active = null;
    return null;
  }
  if (active?.groupId === groupInfo.group_id) return active.provider;
  active?.provider.clear();
  const provider = new DesktopSyncGroupJoinProvider(groupInfo, async (device) => {
    registerSyncGroupDevice({
      device: createSyncGroupDeviceIdentity({
        device_anchor: device.device_anchor,
        group_id: groupInfo.group_id,
        library_path: device.canonical_library_path,
        path_flavor: device.path_flavor
      }),
      deviceName: device.device_name,
      platform: device.platform
    });
    await refreshCompanionMdnsAdvertisement();
  });
  active = { groupId: groupInfo.group_id, provider };
  return provider;
}

export function clearDesktopSyncGroupJoinProvider() {
  active?.provider.clear();
  active = null;
}
