import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import {
  parseNodeVersionPush,
  rejectNodeVersionPush,
  resolveNodeVersionPushOperation
} from './companionSyncPushNodeVersionWithDbPort.js';
import type { CompanionSyncPushPayload, CompanionSyncPushResult } from './companionSyncPushTypes.js';
import { openDatabaseConnection } from './connection.js';
import { applySyncNodesAsync } from './syncApply.js';

export async function applyNodeVersionPushAsync(item: CompanionSyncPushPayload): Promise<CompanionSyncPushResult> {
  const record = parseNodeVersionPush(item);
  if (!record) return rejectNodeVersionPush(item, 'invalid_node_push');
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-sync-node-push-classify' });
  const operation = await resolveNodeVersionPushOperation(port, record);
  const appliedNodeIds = await applySyncNodesAsync([record], {
    includeAlreadyApplied: true,
    ...(operation ? { operation } : {})
  });
  const accepted = appliedNodeIds.includes(record.object_id);
  return {
    acks: [{
      clientOpId: item.clientOpId,
      ...(accepted ? {} : { conflictReason: 'node_version_conflict' }),
      identity: item.identity,
      status: accepted ? 'accepted' : 'conflict',
      versionId: record.version_id
    }],
    appliedNodeIds,
    appliedObjectIds: [],
    appliedReviewOpIds: []
  };
}
