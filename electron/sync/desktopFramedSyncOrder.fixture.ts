import { replaceNodeOrder, restoreSavedParentOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { collectAllParentOrderBodiesWithDriver } from '../../lib/core/sync/parentOrderBodyRetention.js';
import { openDatabaseConnection } from '../database/connection.js';
import { joinDesktopSyncGroup, leaveDesktopSyncGroupDevice, loadDesktopSyncGroupInfo, registerSyncGroupDevice } from '../database/syncGroupStore.js';

import { markDesktopSyncGroupMemberStateReady } from './desktopSyncGroupMemberStateReadiness.js';

export function runDesktopFramedSyncOrderCommand(action: string, args: Readonly<Record<string, unknown>>) {
  const driver = openDatabaseConnection().driver;
  if (action === 'register_order_member') {
    const id = String(args.deviceId);
    markDesktopSyncGroupMemberStateReady(id);
    return registerSyncGroupDevice({ device: { contract_version: 1, group_id: 't326-group',
      identity_key: id, device_anchor: `${id}-anchor`, canonical_library_path: `/t326/${id}` },
    deviceName: id, platform: 'desktop' });
  }
  if (action === 'standalone_edit') {
    const info = loadDesktopSyncGroupInfo();
    const local = driver.queryOne<{ local_device_identity_key: string }>(
      'SELECT local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1');
    if (!info || !local) throw new Error('fixture_group_missing');
    const id = local.local_device_identity_key;
    leaveDesktopSyncGroupDevice(id);
    return { ...info, device: { contract_version: 1, group_id: info.group_id,
      identity_key: id, device_anchor: `${id}-anchor`, canonical_library_path: `/t326/${id}` } };
  }
  if (action === 'rejoin') {
    const device = args.device as Parameters<typeof joinDesktopSyncGroup>[0]['device'];
    collectAllParentOrderBodiesWithDriver(driver);
    return joinDesktopSyncGroup({ device, deviceName: device.identity_key, platform: 'desktop',
      displayName: String(args.display_name), workgroupKey: String(args.workgroup_key) });
  }
  if (action === 'reorder') {
    if (!Array.isArray(args.nodeIds) || args.nodeIds.some((id) => typeof id !== 'string')) {
      throw new Error('fixture_order_invalid');
    }
    replaceNodeOrder(driver, args.nodeIds as string[]);
    return;
  }
  if (typeof args.parentId !== 'string' || typeof args.versionId !== 'string') {
    throw new Error('fixture_restore_order_invalid');
  }
  return restoreSavedParentOrder(driver, { parentId: args.parentId, versionId: args.versionId,
    hostName: requireDatabaseHostName(driver), updatedAt: new Date().toISOString() });
}
