import type { SyncGroupMemberStatePayload } from '../../platform/syncGroupMemberStateContract.js';

import type { DbPort, DbParams } from './dbPort.js';
import { versionPositionStorage } from './nodeVersionMemberPositionFact.js';

export function adoptedPeerEpochKey(incoming: SyncGroupMemberStatePayload, epoch = incoming.library_epoch) {
  return `sync_group_adopted_epoch:${JSON.stringify([incoming.group_id, incoming.sender_device_identity_key, epoch])}`;
}

export function retirePeerPositionStatements(incoming: SyncGroupMemberStatePayload): { sql: string; params: DbParams }[] {
  return (['node', 'parent_child_order'] as const).flatMap((domain) => {
    const storage = versionPositionStorage(domain);
    return [{
    sql: `DELETE FROM sync_object_state WHERE object_type = '${storage.objectType}' AND object_id IN
      (SELECT fact_id FROM ${storage.table} WHERE group_id = ? AND device_identity_key = ?)`,
    params: [incoming.group_id, incoming.sender_device_identity_key]
  }, { sql: `DELETE FROM ${storage.table} WHERE group_id = ? AND device_identity_key = ?`,
    params: [incoming.group_id, incoming.sender_device_identity_key] }];
  });
}

export function adoptedPeerEpochStatements(
  incoming: SyncGroupMemberStatePayload, knownEpoch: string | undefined, alreadySeen: boolean
): { sql: string; params: DbParams }[] {
  if (!incoming.adopted_from || !incoming.devices.some((device) =>
    device.device_identity_key === incoming.adopted_from && device.state === 'active')) return [];
  const changed = knownEpoch !== undefined && knownEpoch !== incoming.library_epoch;
  if (changed && alreadySeen) return [];
  const epochs = changed ? [knownEpoch, incoming.library_epoch] : [incoming.library_epoch];
  return [
    ...(changed ? retirePeerPositionStatements(incoming) : []),
    ...(changed ? [{ sql: 'DELETE FROM node_version_device_revisions WHERE group_id = ? AND device_identity_key = ?',
      params: [incoming.group_id, incoming.sender_device_identity_key] }] : []),
    ...epochs.map((epoch) => ({
      sql: 'INSERT OR IGNORE INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
      params: [adoptedPeerEpochKey(incoming, epoch), 'true', new Date().toISOString()]
    }))
  ];
}

export async function reconcileAdoptedPeerEpoch(db: DbPort, incoming: SyncGroupMemberStatePayload) {
  if (!incoming.adopted_from) return;
  const [known] = await db.query<{ library_epoch: string }>(
    'SELECT library_epoch FROM node_version_device_revisions WHERE group_id = ? AND device_identity_key = ?',
    [incoming.group_id, incoming.sender_device_identity_key]);
  const [seen] = await db.query<{ value: string }>('SELECT value FROM sync_group_metadata WHERE key = ?',
    [adoptedPeerEpochKey(incoming)]);
  for (const statement of adoptedPeerEpochStatements(incoming, known?.library_epoch, Boolean(seen))) {
    await db.run(statement.sql, statement.params);
  }
}
