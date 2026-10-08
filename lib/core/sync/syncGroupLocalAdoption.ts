import { z } from 'zod';

import type { DbPort } from './dbPort.js';
import { loadSyncGroupOverwriteProgress } from './syncGroupOverwriteProgress.js';
import { loadLatestSyncGroupRestoreEvent, markSyncGroupRestoreApplied } from './syncGroupRestoreEvents.js';

export const SYNC_GROUP_LOCAL_ADOPTION_KEY = 'sync_group_local_adoption';
export const SYNC_GROUP_COMPLETED_ADOPTION_KEY = 'sync_group_completed_adoption';
const adoptionSchema = z.object({
  endpointUrl: z.string().url(),
  groupId: z.string().min(1),
  libraryEpoch: z.string().min(1),
  providerDeviceId: z.string().min(1),
  providerDeviceName: z.string().min(1),
  providerPlatform: z.string().min(1)
});
export type SyncGroupLocalAdoption = z.infer<typeof adoptionSchema>;

export function parseSyncGroupLocalAdoption(value: string | null | undefined) {
  return value ? adoptionSchema.parse(JSON.parse(value)) : null;
}

export async function loadSyncGroupLocalAdoption(db: DbPort) {
  const [row] = await db.query<{ value: string }>(
    'SELECT value FROM sync_group_metadata WHERE key = ?', [SYNC_GROUP_LOCAL_ADOPTION_KEY]
  );
  return parseSyncGroupLocalAdoption(row?.value);
}

export async function beginSyncGroupLocalAdoption(db: DbPort, value: SyncGroupLocalAdoption) {
  const adoption = adoptionSchema.parse(value);
  await db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [SYNC_GROUP_LOCAL_ADOPTION_KEY, JSON.stringify(adoption), new Date().toISOString()]);
  await db.run('DELETE FROM sync_group_restore_events WHERE group_id = ?', [adoption.groupId]);
  await db.run('DELETE FROM node_version_local_source_revisions');
  await db.run(`UPDATE node_version_local_proof_state SET library_epoch = ?, proof_revision = 0
    WHERE singleton_id = 1`, [adoption.libraryEpoch]);
}

export async function syncGroupLocalPublicationBlockReason(db: DbPort) {
  if (await loadSyncGroupLocalAdoption(db)) return 'sync_group_local_adoption_pending';
  if (await loadSyncGroupOverwriteProgress(db)) return 'sync_group_overwrite_pending';
  const [restore] = await db.query(`SELECT 1 FROM sync_group_restore_events event
    WHERE event.applied_at IS NULL AND NOT EXISTS (SELECT 1 FROM sync_group_restore_events newer
      WHERE newer.group_id = event.group_id AND (newer.restored_at > event.restored_at OR
        (newer.restored_at = event.restored_at AND newer.restore_id > event.restore_id))) LIMIT 1`);
  return restore ? 'sync_group_restore_pending' : null;
}

export async function assertSyncGroupLocalPublicationAllowed(db: DbPort) {
  const reason = await syncGroupLocalPublicationBlockReason(db);
  if (reason) throw new Error(reason);
}

export async function finishSyncGroupLocalAdoption(db: DbPort, expected: SyncGroupLocalAdoption) {
  const current = await loadSyncGroupLocalAdoption(db);
  if (!current || current.groupId !== expected.groupId ||
      current.providerDeviceId !== expected.providerDeviceId || current.libraryEpoch !== expected.libraryEpoch) {
    throw new Error('sync_group_local_adoption_changed');
  }
  const restore = await loadLatestSyncGroupRestoreEvent(db, expected.groupId);
  if (restore && !restore.applied) await markSyncGroupRestoreApplied(db, restore.event);
  await db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [SYNC_GROUP_COMPLETED_ADOPTION_KEY, JSON.stringify(current), new Date().toISOString()]);
  await db.run('DELETE FROM sync_group_metadata WHERE key = ?', [SYNC_GROUP_LOCAL_ADOPTION_KEY]);
}

export function completedSyncGroupAdoptionSource(value: string | null | undefined, groupId: string, epoch: string) {
  const adoption = parseSyncGroupLocalAdoption(value);
  return adoption?.groupId === groupId && adoption.libraryEpoch === epoch ? adoption.providerDeviceId : undefined;
}

export function syncGroupPeerAdoptionKey(groupId: string, deviceId: string) {
  return `sync_group_peer_adoption:${JSON.stringify([groupId, deviceId])}`;
}

export async function isSyncGroupPeerAdopting(db: DbPort, groupId: string, deviceId: string) {
  const [row] = await db.query<{ value: string }>('SELECT value FROM sync_group_metadata WHERE key = ?',
    [syncGroupPeerAdoptionKey(groupId, deviceId)]);
  return row?.value === 'true';
}
