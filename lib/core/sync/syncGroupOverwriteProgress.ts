import { z } from 'zod';

import { readForegroundTimePreservation, mergeRestoredForegroundTime } from '../database/foregroundTimeRestore.js';

import type { DbPort } from './dbPort.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { loadSyncGroupLocalAdoption } from './syncGroupLocalAdoption.js';
import { loadLatestSyncGroupRestoreEvent } from './syncGroupRestoreEvents.js';
import { clearWorkgroupSyncDataForRestore } from './syncGroupRestoreReset.js';

export const SYNC_GROUP_OVERWRITE_PROGRESS_KEY = 'sync_group_overwrite_progress';
const schema = z.object({ groupId: z.string().min(1), overwriteId: z.string().min(1),
  providerDeviceId: z.string().min(1), providerLibraryEpoch: z.string().min(1),
  receiverDeviceId: z.string().min(1), receiverLibraryEpoch: z.string().min(1) });
export type SyncGroupOverwriteProgress = z.infer<typeof schema>;

export async function loadSyncGroupOverwriteProgress(db: DbPort) {
  const [row] = await db.query<{ value: string }>('SELECT value FROM sync_group_metadata WHERE key = ?',
    [SYNC_GROUP_OVERWRITE_PROGRESS_KEY]);
  return row ? schema.parse(JSON.parse(row.value)) : null;
}

async function assertPendingOwner(db: DbPort, expected: SyncGroupOverwriteProgress) {
  const adoption = await loadSyncGroupLocalAdoption(db);
  if (adoption) {
    if (adoption.groupId === expected.groupId && adoption.libraryEpoch === expected.overwriteId &&
        adoption.providerDeviceId === expected.providerDeviceId && adoption.libraryEpoch === expected.receiverLibraryEpoch) return;
    throw new Error('sync_group_local_adoption_source_mismatch');
  }
  const restore = await loadLatestSyncGroupRestoreEvent(db, expected.groupId);
  if (!restore || restore.applied || restore.event.restore_id !== expected.overwriteId ||
      restore.event.source_device_identity_key !== expected.providerDeviceId) throw new Error('framed_sync_restore_state_invalid');
}

/** The reset and its durable phase marker commit together, independently of later received units. */
export async function prepareSyncGroupOverwrite(db: DbPort, value: SyncGroupOverwriteProgress) {
  const expected = schema.parse(value);
  return db.transaction(async (tx) => {
    await assertPendingOwner(tx, expected);
    const current = await loadSyncGroupOverwriteProgress(tx);
    if (current?.overwriteId === expected.overwriteId && current.groupId === expected.groupId) {
      if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('sync_group_overwrite_source_changed');
      return { removedNodeIds: [] as string[], cleared: false };
    }
    const foreground = await readForegroundTimePreservation(tx);
    const removedNodeIds = await clearWorkgroupSyncDataForRestore(tx, expected.overwriteId);
    await mergeRestoredForegroundTime(tx, foreground, expected.receiverDeviceId);
    await tx.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [SYNC_GROUP_OVERWRITE_PROGRESS_KEY, JSON.stringify(expected), new Date().toISOString()]);
    return { removedNodeIds, cleared: true };
  });
}

export async function assertSyncGroupOverwriteInbound(db: DbPort, context: FramedSyncContext) {
  const progress = await loadSyncGroupOverwriteProgress(db);
  if (!progress) return false;
  await assertPendingOwner(db, progress);
  if (progress.groupId !== context.groupId || progress.providerDeviceId !== context.senderDeviceId ||
      progress.providerLibraryEpoch !== context.senderLibraryEpoch || progress.receiverDeviceId !== context.receiverDeviceId ||
      progress.receiverLibraryEpoch !== context.receiverLibraryEpoch) throw new Error('sync_group_overwrite_source_changed');
  return true;
}

export async function finishSyncGroupOverwriteProgress(db: DbPort, expected: SyncGroupOverwriteProgress) {
  const current = await loadSyncGroupOverwriteProgress(db);
  if (!current || JSON.stringify(current) !== JSON.stringify(schema.parse(expected))) throw new Error('sync_group_overwrite_changed');
  await assertPendingOwner(db, current);
  await db.run('DELETE FROM sync_group_metadata WHERE key = ?', [SYNC_GROUP_OVERWRITE_PROGRESS_KEY]);
}
