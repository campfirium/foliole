import type { DbPort } from '../sync/dbPort.js';
import { loadNodeOwnedArticleResourceNeeds } from '../sync/nodeOwnedArticleResourceNeeds.js';

import { bootstrapCompanionDatabase, CompanionDatabaseBlockedError } from './companionDatabaseLifecycle.js';
import { adoptRestoredLibraryIdentity, type CompanionRestoreIdentity } from './companionRestoreIdentity.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';

export interface CompanionRestoreCandidateRequest extends CompanionRestoreIdentity {
  /** This device's host name; the backup's per-host state moves to it. */
  hostName: string;
  /** Attachments already verified and staged next to the candidate. */
  stagedStorageKeys: readonly string[];
}

export interface CompanionRestoreCandidateSummary {
  backupHostName: string | null;
  backupVersion: number;
  entryCount: number;
  lastModifiedAt: string | null;
  stagedAttachmentCount: number;
  missingAttachmentCount: number;
  unreadableEntryCount: number;
}

const ARTICLE_BATCH = 64;

/**
 * Turn a staged backup copy into a library this device can open: it must pass the same
 * integrity, schema and version checks as a normal open, migrate to the current version,
 * and adopt this device's identity. The staged copy is the only database written.
 */
export async function prepareCompanionRestoreCandidate(
  db: DbPort,
  request: CompanionRestoreCandidateRequest
): Promise<CompanionRestoreCandidateSummary> {
  const backupVersion = await readVersion(db);
  const backupHostName = await readBackupHostName(db);
  const staged = new Set(request.stagedStorageKeys);
  await bootstrapCompanionDatabase(db, {
    allowCreate: false,
    expectedHostName: request.hostName,
    inventoryResourceStorageKeys: () => Promise.resolve([...staged]),
    now: request.now
  });
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) await db.run(statement);
  await adoptRestoredLibraryIdentity(db, request);
  const references = await readAttachmentReferences(db);
  const [entries] = await db.query<{ count: number; modified: string | null }>(
    `SELECT COUNT(*) AS count, MAX(updated_at) AS modified FROM nodes
     WHERE deleted_at IS NULL AND kind <> 'folder'`);
  return {
    backupHostName,
    backupVersion,
    entryCount: Number(entries?.count ?? 0),
    lastModifiedAt: entries?.modified ?? null,
    stagedAttachmentCount: staged.size,
    missingAttachmentCount: references.storageKeys.filter(key => !staged.has(key)).length,
    unreadableEntryCount: references.unreadable
  };
}

async function readVersion(db: DbPort) {
  try {
    const [row] = await db.query('PRAGMA user_version');
    return Number(Object.values(row ?? {})[0] ?? 0);
  } catch (error) {
    throw new CompanionDatabaseBlockedError(`unreadable:${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readBackupHostName(db: DbPort) {
  const [table] = await db.query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'companion_meta'");
  if (!table) return null;
  const [row] = await db.query<{ value: string }>("SELECT value FROM companion_meta WHERE key = 'host_name'");
  return row?.value?.trim() || null;
}

async function readAttachmentReferences(db: DbPort) {
  const ids = (await db.query<{ id: string }>('SELECT id FROM nodes WHERE deleted_at IS NULL ORDER BY id')).map(row => row.id);
  const storageKeys = new Set<string>();
  let unreadable = 0;
  for (let offset = 0; offset < ids.length; offset += ARTICLE_BATCH) {
    const result = await loadNodeOwnedArticleResourceNeeds(db, ids.slice(offset, offset + ARTICLE_BATCH));
    unreadable += result.unreadableArticleIds.length;
    for (const need of result.needs) storageKeys.add(need.storageKey);
  }
  return { storageKeys: [...storageKeys], unreadable };
}
