import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { adoptedPeerEpochKey, adoptedPeerEpochStatements, retirePeerPositionStatements } from '../../lib/core/sync/syncGroupAdoptedPeerEpoch.js';
import { completedSyncGroupAdoptionSource, parseSyncGroupLocalAdoption, syncGroupPeerAdoptionKey, SYNC_GROUP_COMPLETED_ADOPTION_KEY, SYNC_GROUP_LOCAL_ADOPTION_KEY } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';

import { openDatabaseConnection } from './connection.js';
import { assertDesktopPeerProofFresh, recordDesktopAcknowledgedPeerProof } from './nodeVersionPeerProof.js';

export function loadDesktopSyncGroupLocalAdoption(driver: DatabaseDriver) {
  return parseSyncGroupLocalAdoption(driver.queryOne<{ value: string }>(
    'SELECT value FROM sync_group_metadata WHERE key = ?', [SYNC_GROUP_LOCAL_ADOPTION_KEY])?.value);
}

export function loadDesktopCompletedAdoptionSource(driver: DatabaseDriver, groupId: string, epoch: string) {
  return completedSyncGroupAdoptionSource(driver.queryOne<{ value: string }>(
    'SELECT value FROM sync_group_metadata WHERE key = ?', [SYNC_GROUP_COMPLETED_ADOPTION_KEY])?.value, groupId, epoch);
}

export function saveDesktopSyncGroupPeerAdoption(
  driver: DatabaseDriver, local: SyncGroupMemberStatePayload,
  incoming: SyncGroupMemberStatePayload, now: string
) {
  const key = syncGroupPeerAdoptionKey(local.group_id, incoming.sender_device_identity_key);
  if (incoming.adopting_from === local.sender_device_identity_key) driver.execute(
    `INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, 'true', ?)
     ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = excluded.updated_at`, [key, now]);
  else driver.execute('DELETE FROM sync_group_metadata WHERE key = ?', [key]);
}

export function applyDesktopSyncGroupAdoptionPeerProof(incoming: SyncGroupMemberStatePayload, local: SyncGroupMemberStatePayload) {
  const driver = openDatabaseConnection().driver;
  if (incoming.adopted_from) {
    const known = driver.queryOne<{ library_epoch: string }>(
      'SELECT library_epoch FROM node_version_device_revisions WHERE group_id = ? AND device_identity_key = ?',
      [incoming.group_id, incoming.sender_device_identity_key]);
    const seen = driver.queryOne('SELECT value FROM sync_group_metadata WHERE key = ?', [adoptedPeerEpochKey(incoming)]);
    for (const statement of adoptedPeerEpochStatements(incoming, known?.library_epoch, Boolean(seen))) {
      driver.execute(statement.sql, statement.params);
    }
  }
  if (incoming.adopting_from !== local.sender_device_identity_key && !local.adopting_from) {
    assertDesktopPeerProofFresh(incoming);
  }
  if (incoming.adopting_from === local.sender_device_identity_key) {
    for (const statement of retirePeerPositionStatements(incoming)) driver.execute(statement.sql, statement.params);
    driver.execute('DELETE FROM node_version_device_revisions WHERE group_id = ? AND device_identity_key = ?',
      [incoming.group_id, incoming.sender_device_identity_key]);
  } else recordDesktopAcknowledgedPeerProof(incoming, local.sender_device_identity_key);
}
