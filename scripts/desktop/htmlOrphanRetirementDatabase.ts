import type Database from 'better-sqlite3';

import type { LocalRetirementTarget } from '../../electron/attachments/htmlOrphanRetirementJournal.js';

type Sqlite = Database.Database;
type Row = Record<string, unknown>;

export interface RetirementDatabaseSnapshot {
  rows: Record<string, Row[]>;
  userVersion: number;
  version: 1;
}

const TABLES = ['attachments', 'attachment_blobs', 'node_attachments', 'pdf_page_text', 'sync_object_state'] as const;

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

function targetRows(sqlite: Sqlite, table: string, attachmentIds: string[]) {
  const idColumn = table === 'attachments' ? 'id' : table === 'sync_object_state' ? 'object_id' : 'attachment_id';
  const typeClause = table === 'sync_object_state' ? "object_type = 'attachment' AND " : '';
  return sqlite.prepare(`SELECT * FROM "${table}" WHERE ${typeClause}"${idColumn}" IN (${placeholders(
    attachmentIds.length
  )})`).all(...attachmentIds) as Row[];
}

function enableAndVerifyForeignKeys(sqlite: Sqlite) {
  sqlite.pragma('foreign_keys = ON');
  if (Number(sqlite.pragma('foreign_keys', { simple: true })) !== 1) {
    throw new Error('Attachment retirement requires foreign_keys = ON.');
  }
}

export function assertLocalRetirementPreconditions(sqlite: Sqlite) {
  enableAndVerifyForeignKeys(sqlite);
  const userVersion = Number(sqlite.pragma('user_version', { simple: true }));
  if (!Number.isInteger(userVersion) || userVersion > 84) {
    throw new Error(`Attachment retirement database version is not supported: ${userVersion}`);
  }
  const localGroup = sqlite.prepare('SELECT COUNT(*) AS count FROM sync_group_local_state').get() as { count: number };
  if (localGroup.count !== 0) throw new Error('Attachment retirement requires no active Sync Group.');
  return userVersion;
}

export function captureRetirementDatabaseSnapshot(sqlite: Sqlite, attachmentIds: string[]) {
  if (!attachmentIds.length) throw new Error('Attachment retirement has no database targets.');
  const rows = Object.fromEntries(TABLES.map((table) => [table, targetRows(sqlite, table, attachmentIds)]));
  return { rows, userVersion: Number(sqlite.pragma('user_version', { simple: true })),
    version: 1 } satisfies RetirementDatabaseSnapshot;
}

function deleteTargetRows(sqlite: Sqlite, attachmentIds: string[]) {
  const values = placeholders(attachmentIds.length);
  sqlite.prepare(`DELETE FROM node_attachments WHERE attachment_id IN (${values})`).run(...attachmentIds);
  sqlite.prepare(`DELETE FROM pdf_page_text WHERE attachment_id IN (${values})`).run(...attachmentIds);
  sqlite.prepare(
    `DELETE FROM sync_object_state WHERE object_type = 'attachment' AND object_id IN (${values})`
  ).run(...attachmentIds);
  sqlite.prepare(`DELETE FROM attachment_blobs WHERE attachment_id IN (${values})`).run(...attachmentIds);
  sqlite.prepare(`DELETE FROM attachments WHERE id IN (${values})`).run(...attachmentIds);
}

function insertRows(sqlite: Sqlite, table: string, rows: Row[]) {
  for (const row of rows) {
    const columns = Object.keys(row);
    const names = columns.map((column) => `"${column}"`).join(', ');
    sqlite.prepare(`INSERT INTO "${table}" (${names}) VALUES (${placeholders(columns.length)})`)
      .run(...columns.map((column) => row[column]));
  }
}

export function applyLocalAttachmentRetirement(sqlite: Sqlite, targets: LocalRetirementTarget[]) {
  const attachmentIds = targets.map((target) => target.attachmentId);
  sqlite.transaction(() => deleteTargetRows(sqlite, attachmentIds))();
  for (const table of TABLES) {
    if (targetRows(sqlite, table, attachmentIds).length) {
      throw new Error(`Attachment retirement left local database state in ${table}.`);
    }
  }
}

export function restoreRetirementDatabase(
  sqlite: Sqlite,
  snapshot: RetirementDatabaseSnapshot,
  attachmentIds: string[]
) {
  if (snapshot.version !== 1) throw new Error('Unsupported attachment retirement database snapshot.');
  enableAndVerifyForeignKeys(sqlite);
  const alreadyRestored = snapshot.userVersion === Number(sqlite.pragma('user_version', { simple: true })) &&
    TABLES.every((table) => JSON.stringify(targetRows(sqlite, table, attachmentIds)) ===
      JSON.stringify(snapshot.rows[table] ?? []));
  if (alreadyRestored) return;
  sqlite.transaction(() => {
    deleteTargetRows(sqlite, attachmentIds);
    for (const table of TABLES) insertRows(sqlite, table, snapshot.rows[table] ?? []);
    sqlite.pragma(`user_version = ${snapshot.userVersion}`);
  })();
}
