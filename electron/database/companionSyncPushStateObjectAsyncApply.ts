import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import {
  applyStateObjectPushWithDbPort,
  rejectedStateObjectPushResult,
  type StatePushObjectType
} from './companionSyncPushStateObjectWithDbPort.js';
import type {
  CompanionSyncPushPayload,
  CompanionSyncPushResult
} from './companionSyncPushTypes.js';
import { openDatabaseConnection } from './connection.js';

export async function applyStateObjectPushAsync(
  item: CompanionSyncPushPayload
): Promise<CompanionSyncPushResult> {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-sync-state-push' });
  try {
    return await applyStateObjectPushWithDbPort(
      port, item, item.identity.objectType as StatePushObjectType
    );
  } catch (error) {
    return rejectedStateObjectPushResult(item, error instanceof Error ? error.message : 'apply_failed');
  }
}

export { applyStateObjectPushWithDbPort, isStateObjectPush } from './companionSyncPushStateObjectWithDbPort.js';
export type { StatePushObjectType } from './companionSyncPushStateObjectWithDbPort.js';
