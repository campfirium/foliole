import { requestSearchIndexInvalidationProcessing } from '../../lib/core/database/searchIndexInvalidationRuntime.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { SyncNodeApplyOperation } from '../../lib/core/sync/syncNodeApplyRules.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';

interface ApplySyncNodesOptions {
  includeAlreadyApplied?: boolean;
  operation?: SyncNodeApplyOperation;
}

function warnUnmappedAnchor(record: {
  anchorId: string | null;
  nodeId: string;
  parentNodeId: string;
  reason: string;
}) {
  console.warn('[sync] unmapped child text anchor after parent apply', {
    anchorId: record.anchorId,
    nodeId: record.nodeId,
    parentNodeId: record.parentNodeId,
    reason: record.reason
  });
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
    {
      ...(options.includeAlreadyApplied === undefined
        ? {}
        : { includeAlreadyApplied: options.includeAlreadyApplied }),
      ...(options.operation ? { operation: options.operation } : {})
    }
  );
  result.unmappedAnchorRecords.forEach(warnUnmappedAnchor);
  requestSearchIndexInvalidationProcessing();

  return result.appliedIds;
}
