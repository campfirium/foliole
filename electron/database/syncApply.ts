import { syncWorkspaceSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { recordNodeConflictAndCreateCopy } from './syncConflictCopies.js';

interface ApplySyncNodesOptions {
  includeAlreadyApplied?: boolean;
}

export async function applySyncNodesAsync(records: NativeSyncNodeRecord[], options: ApplySyncNodesOptions = {}) {
  if (records.length === 0) {
    return [];
  }
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-sync-node-apply' });
  const result = await applySyncNodesWithDbPort(
    port,
    records,
    options.includeAlreadyApplied === undefined ? {} : { includeAlreadyApplied: options.includeAlreadyApplied }
  );
  const conflictCopyIds: string[] = [];
  const timestamp = new Date().toISOString();

  connection.driver.transaction(() => {
    for (const record of result.conflictNodes) {
      const copyNodeId = recordNodeConflictAndCreateCopy({
        driver: connection.driver,
        record,
        timestamp
      });
      if (copyNodeId) {
        conflictCopyIds.push(copyNodeId);
      }
    }
    syncWorkspaceSearchIndexForNodeIds(connection.driver, [...result.appliedIds, ...conflictCopyIds]);
  });

  return result.appliedIds;
}
