import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import type { DbPort } from '../sync/dbPort.js';

export const FOLDER_ATTACHMENT_WORK_SCHEMA = [`CREATE TABLE IF NOT EXISTS folder_attachment_work (
  storage_key TEXT NOT NULL, stage TEXT NOT NULL CHECK(stage IN ('source','backup')),
  action TEXT NOT NULL CHECK(action IN ('copy','delete')), token TEXT NOT NULL,
  last_error TEXT, PRIMARY KEY(storage_key,stage))`];
const profileKey = 'folder_attachment_backup_profile';
const baselineKey = 'folder_attachment_backup_baseline';
export interface FolderAttachmentWork {
  storage_key: string; stage: 'source' | 'backup'; action: 'copy' | 'delete'; token: string; last_error: string | null;
}

export async function readFolderAttachmentProfile(db: DbPort) {
  const [row] = await db.query<{ value: string }>('SELECT value FROM companion_meta WHERE key=?', [profileKey]);
  return row?.value ?? null;
}

async function writeMeta(db: DbPort, key: string, value: string) {
  await db.run('INSERT OR REPLACE INTO companion_meta(key,value,updated_at) VALUES (?,?,?)', [key, value, new Date().toISOString()]);
}

export async function configureFolderAttachmentProfile(db: DbPort, profile: string) {
  return db.transaction(async tx => {
    if (await readFolderAttachmentProfile(tx) !== profile) {
      // Source intents survive a target change so in-flight publication cannot fall through the baseline.
      await tx.run("DELETE FROM folder_attachment_work WHERE stage='backup'");
      await writeMeta(tx, profileKey, profile);
      await tx.run('DELETE FROM companion_meta WHERE key=?', [baselineKey]);
    }
    const [row] = await tx.query<{ value: string }>('SELECT value FROM companion_meta WHERE key=?', [baselineKey]);
    return row?.value === profile;
  });
}

export async function seedFolderAttachmentBaseline(db: DbPort, profile: string, keys: readonly string[]) {
  return db.transaction(async tx => {
    await requireProfile(tx, profile);
    for (const key of new Set(keys)) {
      checkKey(key);
      await tx.run(`INSERT OR IGNORE INTO folder_attachment_work(storage_key,stage,action,token)
        SELECT ?,'backup','copy',? WHERE NOT EXISTS
        (SELECT 1 FROM folder_attachment_work WHERE storage_key=?)`, [key, crypto.randomUUID(), key]);
    }
    await writeMeta(tx, baselineKey, profile);
  });
}

/** Register before native publication; a new intent never overwrites an older valid backup obligation. */
export async function prepareFolderAttachmentCopy(db: DbPort, key: string) {
  checkKey(key);
  const token = crypto.randomUUID();
  await db.run(`INSERT INTO folder_attachment_work(storage_key,stage,action,token) VALUES (?,'source','copy',?)
    ON CONFLICT(storage_key,stage) DO UPDATE SET action=excluded.action,token=excluded.token,last_error=NULL`, [key, token]);
  return token;
}

/** Called inside the original receive completion transaction, after verified source publication. */
export async function completeFolderAttachmentCopy(db: DbPort, key: string) {
  const [source] = await db.query<FolderAttachmentWork & Record<string, unknown>>(
    "SELECT * FROM folder_attachment_work WHERE storage_key=? AND stage='source'", [key]);
  if (await readFolderAttachmentProfile(db)) {
    const token = source?.token ?? crypto.randomUUID();
    if (source) await upsertBackup(db, key, token);
    else await db.run(`INSERT OR IGNORE INTO folder_attachment_work(storage_key,stage,action,token)
      VALUES (?,'backup','copy',?)`, [key, token]);
  }
  if (source) await db.run("DELETE FROM folder_attachment_work WHERE storage_key=? AND stage='source' AND token=?", [key, source.token]);
}

async function upsertBackup(db: DbPort, key: string, token: string) {
  await db.run(`INSERT INTO folder_attachment_work(storage_key,stage,action,token) VALUES (?,'backup','copy',?)
    ON CONFLICT(storage_key,stage) DO UPDATE SET action=excluded.action,token=excluded.token,last_error=NULL`, [key, token]);
}

export async function readFolderAttachmentWork(db: DbPort, profile: string) {
  await requireProfile(db, profile);
  return db.query<FolderAttachmentWork & Record<string, unknown>>(`SELECT w.* FROM folder_attachment_work w
    WHERE w.stage='source' OR NOT EXISTS (SELECT 1 FROM folder_attachment_work s
      WHERE s.storage_key=w.storage_key AND s.stage='source') ORDER BY w.storage_key`);
}

/** Native copy has verified the target before this confirmation; original receive completion stays independent. */
export async function confirmFolderAttachmentCopy(db: DbPort, profile: string, work: FolderAttachmentWork) {
  return db.transaction(async tx => {
    await requireProfile(tx, profile);
    if (work.stage === 'source') await tx.run(`DELETE FROM folder_attachment_work
      WHERE storage_key=? AND stage='backup' AND EXISTS
      (SELECT 1 FROM folder_attachment_work s WHERE s.storage_key=? AND s.stage='source' AND s.token=?)`,
    [work.storage_key, work.storage_key, work.token]);
    await tx.run('DELETE FROM folder_attachment_work WHERE storage_key=? AND token=?', [work.storage_key, work.token]);
  });
}

export async function failFolderAttachmentCopy(db: DbPort, profile: string, work: FolderAttachmentWork, error: string) {
  await requireProfile(db, profile);
  await db.run('UPDATE folder_attachment_work SET last_error=? WHERE storage_key=? AND stage=? AND token=?',
    [error, work.storage_key, work.stage, work.token]);
}

export async function countFolderAttachmentWork(db: DbPort, profile: string) {
  await requireProfile(db, profile);
  const [row] = await db.query<{ count: number }>('SELECT count(DISTINCT storage_key) AS count FROM folder_attachment_work');
  return row!.count;
}

async function requireProfile(db: DbPort, profile: string) {
  if (await readFolderAttachmentProfile(db) !== profile) throw new Error('Backup folder changed.');
}
function checkKey(key: string) {
  if (!parseCanonicalAttachmentStorageKey(key)) throw new Error('Invalid attachment filename.');
}
