import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import {
  readDesktopAttachmentRetirementDatabaseSnapshot,
  restoreDesktopAttachmentRetirement
} from '../../electron/attachments/attachmentRetirementJournal.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
type Sqlite = InstanceType<typeof BetterSqlite3>;
type Row = Record<string, unknown>;

interface DatabaseSnapshot {
  journalToken: string;
  rows: Record<string, Row[]>;
  tablesPresent: Record<string, boolean>;
  userVersion: number;
  version: 1;
}

const SNAPSHOT_TABLES = ['attachments', 'attachment_blobs', 'node_attachments', 'pdf_page_text',
  'sync_object_state', 'attachment_sync_tombstones', 'attachment_retirement_obligations'] as const;

function tableExists(sqlite: Sqlite, table: string) {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function queryRows(sqlite: Sqlite, table: string, attachmentIds: string[], journalToken: string) {
  if (table === 'attachment_retirement_obligations') {
    return sqlite.prepare(`SELECT * FROM ${table} WHERE journal_token = ?`).all(journalToken) as Row[];
  }
  const placeholders = attachmentIds.map(() => '?').join(', ');
  const idColumn = table === 'attachments' ? 'id' : table === 'sync_object_state' ? 'object_id' : 'attachment_id';
  const typeClause = table === 'sync_object_state' ? "object_type = 'attachment' AND " : '';
  return sqlite.prepare(`SELECT * FROM ${table} WHERE ${typeClause}${idColumn} IN (${placeholders})`)
    .all(...attachmentIds) as Row[];
}

export function captureHtmlOrphanRetirementDatabaseSnapshot(
  sqlite: Sqlite, attachmentIds: string[], records: NativeSyncObjectRecord[]
) {
  const journalToken = createHash('sha256').update(JSON.stringify(records.map((record) =>
    JSON.parse(record.payload_json ?? 'null')))).digest('hex').slice(0, 24);
  const rows: Record<string, Row[]> = {};
  const tablesPresent: Record<string, boolean> = {};
  for (const table of SNAPSHOT_TABLES) {
    tablesPresent[table] = tableExists(sqlite, table);
    rows[table] = tablesPresent[table] ? queryRows(sqlite, table, attachmentIds, journalToken) : [];
  }
  return { journalToken, rows, tablesPresent,
    userVersion: Number(sqlite.pragma('user_version', { simple: true })), version: 1 } satisfies DatabaseSnapshot;
}

function insertRows(sqlite: Sqlite, table: string, rows: Row[]) {
  for (const row of rows) {
    const columns = Object.keys(row);
    const names = columns.map((column) => `"${column}"`).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    sqlite.prepare(`INSERT INTO "${table}" (${names}) VALUES (${placeholders})`)
      .run(...columns.map((column) => row[column]));
  }
}

function deleteCurrentRows(sqlite: Sqlite, snapshot: DatabaseSnapshot, attachmentIds: string[]) {
  const placeholders = attachmentIds.map(() => '?').join(', ');
  for (const table of [...SNAPSHOT_TABLES].reverse()) {
    if (!tableExists(sqlite, table)) continue;
    if (table === 'attachment_retirement_obligations') {
      sqlite.prepare(`DELETE FROM ${table} WHERE journal_token = ?`).run(snapshot.journalToken);
      continue;
    }
    const idColumn = table === 'attachments' ? 'id' : table === 'sync_object_state' ? 'object_id' : 'attachment_id';
    const typeClause = table === 'sync_object_state' ? "object_type = 'attachment' AND " : '';
    sqlite.prepare(`DELETE FROM ${table} WHERE ${typeClause}${idColumn} IN (${placeholders})`).run(...attachmentIds);
  }
}

function restoreDatabase(sqlite: Sqlite, snapshot: DatabaseSnapshot, attachmentIds: string[]) {
  if (snapshot.version !== 1) throw new Error('Unsupported attachment retirement database snapshot.');
  deleteCurrentRows(sqlite, snapshot, attachmentIds);
  for (const table of SNAPSHOT_TABLES) {
    if (tableExists(sqlite, table)) insertRows(sqlite, table, snapshot.rows[table] ?? []);
  }
  sqlite.pragma(`user_version = ${snapshot.userVersion}`);
  for (const table of ['attachment_retirement_obligations', 'attachment_sync_tombstones']) {
    if (!snapshot.tablesPresent[table] && tableExists(sqlite, table)) sqlite.exec(`DROP TABLE ${table}`);
  }
}

export async function restoreHtmlOrphanRetirement(database: string, journal: string) {
  const snapshot = readDesktopAttachmentRetirementDatabaseSnapshot(journal) as DatabaseSnapshot | undefined;
  if (!snapshot) throw new Error('Attachment retirement journal has no database snapshot.');
  const attachmentIds = (snapshot.rows.attachments ?? []).map((row) => String(row.id));
  const sqlite = new BetterSqlite3(database, { fileMustExist: true });
  try {
    sqlite.transaction(() => {
      restoreDatabase(sqlite, snapshot, attachmentIds);
      restoreDesktopAttachmentRetirement({ journalPath: journal });
    })();
  } finally {
    sqlite.close();
  }
  return { itemCount: attachmentIds.length, journalPath: journal, resultStatus: 'restored', version: 1 };
}
