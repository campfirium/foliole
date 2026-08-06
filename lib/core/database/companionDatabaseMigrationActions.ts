import type { DbPort, DbRow } from '../sync/dbPort.js';

import { ANDROID_COMPANION_MIGRATION_QUERY_DEFINITIONS } from './androidCompanionMigrationQueryDefinitions.js';
import {
  ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS as STATEMENTS
} from './androidCompanionMigrationSchemaStatements.js';
import { ANDROID_COMPANION_MUTATION_DEFINITIONS as MUTATIONS } from './androidCompanionMutationDefinitions.js';
import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionNodeResourceQueryDefinitions.js';
import { COMPANION_SCHEMA_STATEMENTS } from './companionSchemaStatements.js';

interface LegacySyncRow extends DbRow {
  content_hash: string;
  current_version_id: string | null;
  deleted_at: string | null;
  last_modified_by_device_id: string;
  object_id: string;
  object_type: string;
  sync_dirty: number;
  updated_at: string;
}

interface AttachmentSnapshotRow extends DbRow {
  id: string;
  snapshot_json: string;
}

export async function installCompanionSchema(db: DbPort) {
  for (const statement of COMPANION_SCHEMA_STATEMENTS) await db.run(statement);
}

export async function addColumnIfMissing(
  db: DbPort,
  rule: { columnName: string; statementName: keyof typeof STATEMENTS; tableName: string }
) {
  if (!(await companionColumnExists(db, rule.tableName, rule.columnName))) {
    await db.run(STATEMENTS[rule.statementName]);
  }
}

export async function migrateSyncObjectStateSequence(db: DbPort) {
  if (!(await companionTableExists(db, 'sync_object_state')) ||
      await companionColumnExists(db, 'sync_object_state', 'state_seq')) return;
  await db.run(STATEMENTS.syncObjectStateNextTable);
  const rows = await db.query<LegacySyncRow>(
    ANDROID_COMPANION_MIGRATION_QUERY_DEFINITIONS.migrationLegacySyncObjectStateRows.sql
  );
  for (const [index, row] of rows.entries()) {
    await db.run(MUTATIONS.migrationSyncObjectStateNextInsert, [
      row.object_type, row.object_id, index + 1, row.current_version_id, row.content_hash,
      row.last_modified_by_device_id, row.updated_at, row.deleted_at, row.sync_dirty, null
    ]);
  }
  await db.run(STATEMENTS.syncObjectStateDropLegacyTable);
  await db.run(STATEMENTS.syncObjectStateRenameNextTable);
  await db.run(STATEMENTS.syncObjectStateSeqIndex);
  await db.run(STATEMENTS.syncObjectStateTypeSeqIndex);
}

export async function backfillNodeAttachments(db: DbPort) {
  let rows: AttachmentSnapshotRow[];
  try {
    rows = await db.query<AttachmentSnapshotRow>(
      ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.nodeAttachmentBackfillSnapshots.sql
    );
  } catch {
    return;
  }
  for (const row of rows) await replaceSnapshotAttachments(db, row);
}

export async function migrateExternalFolderOwnership(db: DbPort) {
  if (!(await companionTableExists(db, 'external_search_folders')) ||
      await companionColumnExists(db, 'external_search_folders', 'owner_installation_id')) return;
  await db.run(STATEMENTS.externalFoldersNextTable);
  await db.run(STATEMENTS.externalFoldersCopyLegacyRows);
  await db.run(STATEMENTS.externalFoldersDropLegacyTable);
  await db.run(STATEMENTS.externalFoldersRenameNextTable);
  await db.run(STATEMENTS.externalFoldersOwnerPathIndex);
}

export async function companionTableExists(db: DbPort, tableName: string) {
  const rows = await db.query('SELECT 1 AS present FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1', [
    'table', tableName
  ]);
  return rows.length > 0;
}

export async function companionColumnExists(db: DbPort, tableName: string, columnName: string) {
  const rows = await db.query('SELECT name FROM pragma_table_info(?) WHERE name = ? LIMIT 1', [tableName, columnName]);
  return rows.length > 0;
}

async function replaceSnapshotAttachments(db: DbPort, row: AttachmentSnapshotRow) {
  let value: unknown;
  try {
    value = JSON.parse(row.snapshot_json);
  } catch {
    return;
  }
  const attachments = record(value) && Array.isArray(value.attachments) ? value.attachments : [];
  await db.run(MUTATIONS.nodeAttachmentDeleteByNode, [row.id]);
  for (const item of attachments) {
    if (!record(item)) continue;
    const attachmentId = typeof item.attachment_id === 'string' ? item.attachment_id.trim() : '';
    const role = typeof item.role === 'string' ? item.role.trim() : '';
    if (attachmentId && role) await db.run(MUTATIONS.nodeAttachmentUpsert, [row.id, attachmentId, role]);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
