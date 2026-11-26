import type { DbPort } from '../sync/dbPort.js';

import { NODE_DELETED_AT_INDEX_RETIREMENT, NODE_IMPORT_FINGERPRINT_INDEX_SCHEMA } from './coreIndexSchemaStatements.js';
import { migrateCompanionDailyFlowReadiness } from './dailyFlowReadinessMigration.js';
import { INVALIDATE_ALL_SYNC_DIGESTS } from './framedSyncDigestSchema.js';
import { reinstallNodeHistoryInventoryUpdates } from './framedSyncInventorySchema.js';
import { migrateCompanionIndependentImportHistoryInventory } from './independentImportHistoryInventoryMigration.js';
import { migrateCompanionLocalDerivedIndexes } from './localDerivedIndexMigration.js';
import { RETIRE_COVERED_NODE_CHILD_STATE } from './nodeTombstoneStateRetirementMigration.js';
import { LEGACY_REVIEW_CALENDAR_INDEX } from './reviewCalendarLegacyIndex.js';

export { migrateCompanionLocalDerivedIndexes };

export async function migrateCompanionNodeInventoryVersions(db: DbPort, currentVersion: number, targetVersion: number) {
  if (currentVersion < 119 && targetVersion >= 119) {
    for (const sql of reinstallNodeHistoryInventoryUpdates()) await db.run(sql);
  }
  if (currentVersion < 120 && targetVersion >= 120) await db.run(INVALIDATE_ALL_SYNC_DIGESTS);
  if (currentVersion < 121 && targetVersion >= 121) {
    for (const sql of RETIRE_COVERED_NODE_CHILD_STATE) await db.run(sql);
  }
  if (currentVersion < 122 && targetVersion >= 122) await migrateCompanionIndependentImportHistoryInventory(db);
  if (currentVersion < 123 && targetVersion >= 123) await migrateCompanionDailyFlowReadiness(db);
  if (currentVersion < 124 && targetVersion >= 124) {
    for (const sql of NODE_IMPORT_FINGERPRINT_INDEX_SCHEMA) await db.run(sql);
  }
  if (currentVersion < 125 && targetVersion >= 125) await db.run(LEGACY_REVIEW_CALENDAR_INDEX);
  if (currentVersion < 126 && targetVersion >= 126) {
    const columns = await db.query<{ name: string }>('PRAGMA table_info(nodes)');
    if (!columns.some(column => column.name === 'enforce_priority')) {
      await db.run('ALTER TABLE nodes ADD COLUMN enforce_priority INTEGER');
    }
  }
  if (currentVersion < 127 && targetVersion >= 127) {
    const columns = await db.query<{ name: string }>('PRAGMA table_info(node_reading)');
    if (!columns.some(column => column.name === 'history_order_at')) {
      await db.run('ALTER TABLE node_reading ADD COLUMN history_order_at TEXT');
    }
  }
  if (currentVersion < 128 && targetVersion >= 128) await db.run(NODE_DELETED_AT_INDEX_RETIREMENT);
  if (currentVersion < 129 && targetVersion >= 129) await migrateCompanionLocalDerivedIndexes(db);
}
