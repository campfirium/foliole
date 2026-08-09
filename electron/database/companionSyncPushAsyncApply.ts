import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import type {
  CompanionSyncPushPayload,
  CompanionSyncPushResult
} from './companionSyncPushTypes.js';
import { applyCompanionStateSyncPushWithDbPort } from './companionSyncPushWithDbPort.js';
import { openDatabaseConnection } from './connection.js';

export type { CompanionSyncPushPayload } from './companionSyncPushTypes.js';

export async function applyCompanionSyncPushAsync(
  items: CompanionSyncPushPayload[],
  sourceDeviceId: string
): Promise<CompanionSyncPushResult> {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'desktop-sync-push-batch' });
  return applyCompanionStateSyncPushWithDbPort(port, items, sourceDeviceId);
}

export { applyCompanionStateSyncPushWithDbPort } from './companionSyncPushWithDbPort.js';
