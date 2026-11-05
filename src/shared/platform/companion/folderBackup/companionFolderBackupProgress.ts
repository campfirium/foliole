import type { DbPort } from '../../../../../lib/core/sync/dbPort';

const revisionKey = 'folder_backup_source_revision';
const savedKey = 'folder_backup_saved_revision';
const targetKey = 'folder_backup_saved_target';

async function readMeta(db: DbPort, key: string) {
  const [row] = await db.query<{ value: string }>('SELECT value FROM companion_meta WHERE key=?', [key]);
  return row?.value ?? null;
}

async function writeMeta(db: DbPort, key: string, value: string) {
  await db.run('INSERT OR REPLACE INTO companion_meta(key,value,updated_at) VALUES (?,?,?)', [key, value, new Date().toISOString()]);
}

export async function readFolderBackupRevision(db: DbPort) {
  return await readMeta(db, revisionKey) ?? 'initial';
}

export async function markFolderBackupChanged(db: DbPort) {
  await writeMeta(db, revisionKey, crypto.randomUUID());
}

export async function confirmFolderDatabaseBackup(db: DbPort, target: string, revision: string) {
  await db.transaction(async tx => {
    await writeMeta(tx, savedKey, revision);
    await writeMeta(tx, targetKey, target);
  });
}

export async function isFolderDatabaseBackupCurrent(db: DbPort, target: string) {
  return await readMeta(db, targetKey) === target && await readMeta(db, savedKey) === await readFolderBackupRevision(db);
}
