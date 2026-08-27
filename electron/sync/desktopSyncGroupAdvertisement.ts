import { resolveLocalSyncGroupDevice } from '../../lib/platform/syncGroupContract.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import {
  startCompanionMdnsAdvertisement,
  waitForCompanionMdnsAdvertisement
} from './companionMdnsAdvertisement.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

interface DesktopSyncGroupAdvertisementInput {
  appVersion: string;
  deviceId: string;
  onWarning: (error: unknown) => void;
  port: number;
}

export async function advertiseDesktopSyncGroup(args: DesktopSyncGroupAdvertisementInput) {
  const group = loadDesktopSyncGroup();
  if (!group) return;
  const workgroup = loadDesktopWorkgroupKey(group.group_id);
  if (!workgroup) throw new Error('sync_group_workgroup_key_missing');
  const local = resolveLocalSyncGroupDevice(group);
  if (!local) throw new Error('sync_group_local_device_missing');
  const services = startCompanionMdnsAdvertisement({
    appVersion: args.appVersion,
    deviceId: local.device_identity_key,
    groupDisplayName: group.display_name,
    groupId: group.group_id,
    groupTag: workgroup.group_tag,
    onWarning: args.onWarning,
    port: args.port
  });
  try {
    await waitForCompanionMdnsAdvertisement(services);
  } catch (error) {
    args.onWarning(error);
  }
}
