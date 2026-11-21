import type { DbPort } from '../sync/dbPort.js';

import { NODE_IMPORT_FINGERPRINT_INDEX_SCHEMA } from './coreIndexSchemaStatements.js';
import { migrateCompanionDailyFlowReadiness } from './dailyFlowReadinessMigration.js';
import { INVALIDATE_ALL_SYNC_DIGESTS } from './framedSyncDigestSchema.js';
import { reinstallNodeHistoryInventoryUpdates } from './framedSyncInventorySchema.js';
import { migrateCompanionIndependentImportHistoryInventory } from './independentImportHistoryInventoryMigration.js';
import { RETIRE_COVERED_NODE_CHILD_STATE } from './nodeTombstoneStateRetirementMigration.js';

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
}
