import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { syncWorkspaceSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import {
  decideIncomingNodeApply,
  isConflictCopyNodeId,
  latestBranchHeadRecords,
  orderNodesForApply
} from '../../lib/core/sync/syncNodeApplyRules.js';
import {
  buildAttachmentExistsQuery,
  buildNodeAttachmentDelete,
  buildNodeAttachmentInsert,
  buildNodeOrderReplace,
  buildRemoteNodeUpsert,
  buildRemoteNodeVersionUpsert
} from '../../lib/core/sync/syncNodeApplyStatements.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { recordNodeConflictAndCreateCopy } from './syncConflictCopies.js';
import { loadLocalNodeSyncState } from './syncLocalNodeState.js';

interface ApplySyncNodesOptions {
  includeAlreadyApplied?: boolean;
}

function upsertRemoteVersion(driver: DatabaseDriver, record: NativeSyncNodeRecord) {
  const statement = buildRemoteNodeVersionUpsert(record);
  if (!statement) {
    return;
  }
  driver.execute(statement.sql, [...statement.params]);
}

function upsertRemoteNode(driver: DatabaseDriver, record: NativeSyncNodeRecord) {
  const { snapshot } = record;
  const content = snapshot.content ?? '';
  const bodyBlobHash = snapshot.body_blob_hash ?? upsertTextBodyBlob(driver, content, snapshot.updated_at);
  const statement = buildRemoteNodeUpsert(record, bodyBlobHash);
  driver.execute(statement.sql, [...statement.params]);
}

function replaceNodeOrderCompat(driver: DatabaseDriver, record: NativeSyncNodeRecord) {
  const statement = buildNodeOrderReplace(record);
  driver.execute(statement.sql, [...statement.params]);
}

function replaceNodeAttachmentLinks(driver: DatabaseDriver, record: NativeSyncNodeRecord) {
  const deleteStatement = buildNodeAttachmentDelete(record);
  driver.execute(deleteStatement.sql, [...deleteStatement.params]);
  for (const attachment of record.snapshot.attachments) {
    const existsQuery = buildAttachmentExistsQuery(attachment.attachment_id);
    const existing = driver.queryOne<{ id: string }>(existsQuery.sql, [...existsQuery.params]);
    if (!existing) {
      continue;
    }
    const insertStatement = buildNodeAttachmentInsert(record, attachment);
    driver.execute(insertStatement.sql, [...insertStatement.params]);
  }
}

export function applySyncNodes(records: NativeSyncNodeRecord[], options: ApplySyncNodesOptions = {}) {
  if (records.length === 0) {
    return [];
  }
  const connection = openDatabaseConnection();
  const ordered = orderNodesForApply(latestBranchHeadRecords(records));
  const appliedIds: string[] = [];
  const conflictCopyIds: string[] = [];

  connection.driver.transaction(() => {
    const timestamp = new Date().toISOString();
    for (const record of ordered) {
      const localNode = loadLocalNodeSyncState(connection.driver, record.object_id);
      if (isConflictCopyNodeId(record.object_id) || isConflictCopyNodeId(record.snapshot.id)) {
        continue;
      }
      const decision = decideIncomingNodeApply(localNode ?? null, record);
      if (decision === 'apply_missing_local') {
        upsertRemoteNode(connection.driver, record);
        upsertRemoteVersion(connection.driver, record);
        replaceNodeOrderCompat(connection.driver, record);
        replaceNodeAttachmentLinks(connection.driver, record);
        appliedIds.push(record.object_id);
        continue;
      }
      upsertRemoteVersion(connection.driver, record);
      if (decision === 'block_incoming') {
        continue;
      }
      if (decision === 'record_conflict') {
        const copyNodeId = recordNodeConflictAndCreateCopy({
          driver: connection.driver,
          record,
          timestamp
        });
        if (copyNodeId) {
          conflictCopyIds.push(copyNodeId);
        }
        continue;
      }
      if (decision === 'already_applied') {
        if (options.includeAlreadyApplied) {
          appliedIds.push(record.object_id);
        }
        continue;
      }
      upsertRemoteNode(connection.driver, record);
      replaceNodeOrderCompat(connection.driver, record);
      replaceNodeAttachmentLinks(connection.driver, record);
      appliedIds.push(record.object_id);
    }
    syncWorkspaceSearchIndexForNodeIds(connection.driver, [...appliedIds, ...conflictCopyIds]);
  });

  return appliedIds;
}

export async function applySyncNodesAsync(records: NativeSyncNodeRecord[], options: ApplySyncNodesOptions = {}) {
  if (records.length === 0) {
    return [];
  }
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-sync-node-apply' });
  const result = await applySyncNodesWithDbPort(port, records, {
    includeAlreadyApplied: options.includeAlreadyApplied
  });
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
