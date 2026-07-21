import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { applyReviewLogPushWithDbPort } from './companionSyncPushReviewLogWithDbPort.js';
import type {
  CompanionSyncPushPayload,
  CompanionSyncPushResult
} from './companionSyncPushTypes.js';
import { openDatabaseConnection } from './connection.js';

export async function applyReviewLogPushAsync(item: CompanionSyncPushPayload): Promise<CompanionSyncPushResult> {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'desktop-sync-review-log-push' });
  return await applyReviewLogPushWithDbPort(port, item);
}

export { applyReviewLogPushWithDbPort } from './companionSyncPushReviewLogWithDbPort.js';
