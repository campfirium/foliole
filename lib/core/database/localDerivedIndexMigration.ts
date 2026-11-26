import type { DbPort } from '../sync/dbPort.js';

import { DAILY_FLOW_DIRTY_NODE_SCHEMA } from './dailyFlowDirtyNodeSchema.js';
import { DAILY_FLOW_SCOPE_COMPLETE_COLUMN as SCOPE } from './dailyFlowSchema.js';
import { KEEP_IMPORT_ITEM_NODE_INDEX } from './keepImportSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { NODE_SYNC_STATE_BACKFILL_SCHEMA, migrateNodeSyncStateBackfill } from './nodeSyncStateBackfillSchema.js';
import { addColumnIfMissing, tableExists } from './numberedMigrationHelpers.js';
import { migrateCompanionPdfAttachmentNodeIndex } from './pdfAttachmentNodeIndex.js';

/**
 * Device-local lookup structures added in one schema step (desktop 205, phone 129).
 * None of them is a sync fact; each is rebuilt from local tables and kept current by triggers.
 */
export const DESKTOP_LOCAL_DERIVED_INDEX_SCHEMA = [
  ...DAILY_FLOW_DIRTY_NODE_SCHEMA,
  ...NODE_SYNC_STATE_BACKFILL_SCHEMA
] as const;

export function migrateLocalDerivedIndexes(sqlite: DatabaseMigrationTarget) {
  addColumnIfMissing(sqlite, SCOPE.table, SCOPE.column, SCOPE.definition);
  for (const sql of DAILY_FLOW_DIRTY_NODE_SCHEMA) sqlite.exec(sql);
  migrateNodeSyncStateBackfill(sqlite);
  if (tableExists(sqlite, 'keep_import_items')) sqlite.exec(KEEP_IMPORT_ITEM_NODE_INDEX);
}

/** Runs once per phone library, outside the schema statements that historical steps replay. */
export async function migrateCompanionLocalDerivedIndexes(db: DbPort) {
  const columns = await db.query<{ name: string }>(`PRAGMA table_info(${SCOPE.table})`);
  if (!columns.some(column => column.name === SCOPE.column)) {
    await db.run(`ALTER TABLE ${SCOPE.table} ADD COLUMN ${SCOPE.column} ${SCOPE.definition}`);
  }
  for (const sql of DAILY_FLOW_DIRTY_NODE_SCHEMA) await db.run(sql);
  await migrateCompanionPdfAttachmentNodeIndex(db);
}
