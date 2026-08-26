import type { SyncGroupDeviceIdentity } from '../../platform/syncGroupUnifiedContract.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from './androidCompanionSyncProtocolDefinitions.js';

export const SYNC_DEVICE_COPY_TRANSPORT_TABLES = [
  'sync_peer_cursors',
  'sync_delivery_receipts',
  'sync_group_nonce_ledger',
  'sync_push_ack',
  'sync_peers'
] as const;

export const SYNC_DEVICE_COPY_META_KEYS = Object.values(
  ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncMetaCursors
);

export interface SyncDeviceCopyPreparationInput {
  currentIdentity: SyncGroupDeviceIdentity;
  previousIdentity: SyncGroupDeviceIdentity;
}

export async function prepareCopiedLibraryForDevice(
  port: DbPort,
  input: SyncDeviceCopyPreparationInput
) {
  if (input.currentIdentity.group_id !== input.previousIdentity.group_id) {
    throw new Error('copied_library_group_mismatch');
  }
  if (input.currentIdentity.identity_key === input.previousIdentity.identity_key) {
    return { changed: false, clearedMetaKeys: 0, clearedTables: [] as string[] };
  }
  return port.transaction(async (tx) => {
    const tables = new Set((await tx.query<DbRow>(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    )).map((row) => String(row.name)));
    const clearedTables: string[] = [];
    for (const table of SYNC_DEVICE_COPY_TRANSPORT_TABLES) {
      if (!tables.has(table)) continue;
      await tx.run(`DELETE FROM ${table}`);
      clearedTables.push(table);
    }
    const clearedMetaKeys = tables.has('companion_meta')
      ? (await tx.run(
        `DELETE FROM companion_meta WHERE key IN (${SYNC_DEVICE_COPY_META_KEYS.map(() => '?').join(', ')})`,
        SYNC_DEVICE_COPY_META_KEYS
      )).changes
      : 0;
    return { changed: true, clearedMetaKeys, clearedTables };
  });
}
