import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { ensureCompanionSyncGroupDataOwner } from '../sync/syncGroupProviderDataOwner';

import { seedAttachmentThroughputFixture } from './attachmentThroughputFixtureData';
import type { CapacitorCompanionDatabaseManager } from './capacitorCompanionDatabaseOwner';
import { closeIosCompanionDatabase, getIosCompanionDatabaseOwner, initializeIosCompanionDatabase } from './iosCompanionDatabaseBootstrap';

export const THROUGHPUT_FILE_BYTES = 64 * 1024 * 1024;
export const THROUGHPUT_KEYS = [
  'a0ad2c5b0eaa274bc631cfe4930bdd202dee2aa0afc1b18c76b3f125f676a34c.png',
  '37815ef5863eeda1520f39852f2d294b0d86bdcecff41841cb02cb092708292b.png',
  'db87b44cea81e588e730f1be9b75262f06314d235f922d803ccc64d715eb7a76.png',
  '40a2c40b88d5bcfb1a40d8d4e314922e1188c0ecd6cbcaeac0e4a5df1afb503c.png'
];
export function throughputFile(index: number) {
  const bytes = new Uint8Array(THROUGHPUT_FILE_BYTES).fill(0x43);
  bytes[0] = index;
  return { bytes, key: THROUGHPUT_KEYS[index]! };
}

/** Used only by the isolated acceptance application, never a user's library. */
export async function openAttachmentThroughputFixture(platform: 'android' | 'ios', keys: string[]) {
  const name = `attachment_throughput_${crypto.randomUUID().replaceAll('-', '')}`;
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  if ((await sqlite.isDatabase(name)).result !== false) throw new Error('Scratch database absence unverified');
  const manager: CapacitorCompanionDatabaseManager = {
    createConnection: (_name, encrypted, mode, version, readonly) => sqlite.createConnection(name, encrypted, mode, version, readonly),
    closeConnection: (_name, readonly) => sqlite.closeConnection(name, readonly),
    isConnection: (_name, readonly) => sqlite.isConnection(name, readonly),
    isDatabase: () => sqlite.isDatabase(name),
    retrieveConnection: (_name, readonly) => sqlite.retrieveConnection(name, readonly)
  };
  await initializeIosCompanionDatabase({ booted_at: new Date().toISOString(), database_path: null,
    database_ready: false, host_name: 'Attachment throughput acceptance', runtime_kind: `${platform}-capacitor` }, manager);
  const owner = getIosCompanionDatabaseOwner();
  const close = async () => {
    await closeIosCompanionDatabase();
    await sqlite.createConnection(name, false, 'no-encryption', 1, false);
    try { await CapacitorSQLite.deleteDatabase({ database: name, readonly: false }); }
    finally { await sqlite.closeConnection(name, false); }
    if ((await sqlite.isDatabase(name)).result !== false) throw new Error('Scratch cleanup failed');
  };
  try {
    await owner.runWriter(db => seedAttachmentThroughputFixture(db, keys));
    await ensureCompanionSyncGroupDataOwner();
    return { owner, close };
  } catch (error) { await close(); throw error; }
}


export async function removeThroughputFiles(keys: string[]) {
  const inventories = await Promise.all([false, true].map(trash =>
    FolioleCompanionSync.maintainAttachmentFiles({ operation: 'inventory', trash })));
  if (inventories.some(result => !result.files)) throw new Error('Throughput inventory missing');
  const present = new Set(inventories.flatMap(result => result.files!.map(file => file.storageKey)));
  for (const storageKey of keys) {
    if (!present.has(storageKey)) continue;
    await FolioleCompanionSync.maintainAttachmentFiles({ operation: 'move', storageKey, trash: true });
    await FolioleCompanionSync.maintainAttachmentFiles({ operation: 'remove-trash', storageKey });
  }
}
