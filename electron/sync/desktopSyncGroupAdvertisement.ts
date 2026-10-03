import { resolveLocalSyncGroupDevice } from '../../lib/platform/syncGroupContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import {
  startCompanionMdnsAdvertisement
} from './companionMdnsAdvertisement.js';
import { loadDesktopAnchorTopologyState } from './desktopAnchorTopologyRole.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

interface DesktopSyncGroupAdvertisementInput {
  appVersion: string;
  deviceId: string;
  onRecovered?: () => void;
  onWarning: (error: unknown) => void;
  port: number;
}

export async function advertiseDesktopSyncGroup(args: DesktopSyncGroupAdvertisementInput) {
  const input = await runWithDatabaseConnectionOwner(() => prepareAdvertisement(args));
  if (input) await startCompanionMdnsAdvertisement(input);
}

function prepareAdvertisement(args: DesktopSyncGroupAdvertisementInput) {
  const group = loadDesktopSyncGroup();
  if (!group) return;
  const workgroup = loadDesktopWorkgroupKey(group.group_id);
  if (!workgroup) throw new Error('sync_group_workgroup_key_missing');
  const local = resolveLocalSyncGroupDevice(group);
  if (!local) throw new Error('sync_group_local_device_missing');
  return {
    appVersion: args.appVersion,
    deviceId: local.device_identity_key,
    groupDisplayName: group.display_name,
    groupId: group.group_id,
    groupTag: workgroup.group_tag,
    ...(args.onRecovered ? { onRecovered: args.onRecovered } : {}),
    onWarning: args.onWarning,
    port: args.port,
    role: loadDesktopAnchorTopologyState().role
  };
}
