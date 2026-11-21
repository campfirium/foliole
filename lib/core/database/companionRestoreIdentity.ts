import type { DbPort, DbRow } from '../sync/dbPort.js';

import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from './androidCompanionSyncProtocolDefinitions.js';
import { renewForegroundSources } from './foregroundTimeSource.js';
import { SYNC_DEVICE_COPY_META_KEYS, SYNC_DEVICE_COPY_TRANSPORT_TABLES } from './syncDeviceCopyPreparation.js';

/** Group membership the restored library must not inherit from the device that made the backup. */
const MEMBERSHIP_TABLES = [
  'sync_group_removal_confirmations',
  'sync_group_removal_decisions',
  'sync_group_local_state',
  'sync_group_devices',
  'sync_group_nonce_ledger',
  'sync_groups'
] as const;

/** This device's own sync connection state, carried from the library being replaced. */
export const RESTORE_CARRIED_META_KEYS = Object.values(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncMetaKeys);

const BACKUP_TARGET_META_KEYS = ['folder_attachment_backup_profile', 'folder_attachment_backup_baseline'];

export interface CompanionRestoreIdentity {
  deviceId: string;
  /** Values of RESTORE_CARRIED_META_KEYS read from this device's current library. */
  carriedMeta: Readonly<Record<string, string>>;
  now: string;
}

/**
 * Detach a restored library from the backup device: this device keeps its own identity,
 * sync connection state and backup target, and the library starts outside any sync group.
 */
export async function adoptRestoredLibraryIdentity(db: DbPort, identity: CompanionRestoreIdentity) {
  await db.transaction(async (tx) => {
    const tables = new Set((await tx.query<DbRow>("SELECT name FROM sqlite_master WHERE type = 'table'"))
      .map(row => String(row.name)));
    for (const table of [...SYNC_DEVICE_COPY_TRANSPORT_TABLES, ...MEMBERSHIP_TABLES, 'folder_attachment_work']) {
      if (tables.has(table)) await tx.run(`DELETE FROM ${table}`);
    }
    if (tables.has('sync_state_sequence')) {
      await tx.run('UPDATE sync_state_sequence SET source_epoch = lower(hex(randomblob(16))) WHERE singleton_id = 1');
    }
    const cleared = [...SYNC_DEVICE_COPY_META_KEYS, ...RESTORE_CARRIED_META_KEYS, ...BACKUP_TARGET_META_KEYS];
    await tx.run(`DELETE FROM companion_meta WHERE key IN (${cleared.map(() => '?').join(', ')})
      OR substr(key, 1, 14) = 'folder_backup_'`, cleared);
    const upsert = 'INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)';
    await tx.run(upsert, ['device_id', identity.deviceId, identity.now]);
    for (const key of RESTORE_CARRIED_META_KEYS) {
      const value = identity.carriedMeta[key];
      if (typeof value === 'string') await tx.run(upsert, [key, value, identity.now]);
    }
    await renewForegroundSources(tx);
  });
}

export async function readRestoreCarriedMeta(db: DbPort) {
  const rows = await db.query<{ key: string; value: string }>(
    `SELECT key, value FROM companion_meta WHERE key IN (${RESTORE_CARRIED_META_KEYS.map(() => '?').join(', ')})`,
    RESTORE_CARRIED_META_KEYS
  );
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}
