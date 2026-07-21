import {
  applyCompanionSyncPushAsync
} from '../database/companionSyncPushAsyncApply.js';

import { handleCompanionSyncPushWithApply } from './companionLanSyncPushWithApply.js';
import { notifyWorkspaceSyncApplied } from './workspaceSyncAppliedEvents.js';

export const SYNC_PUSH_PATH = '/companion/sync-push';

export async function handleCompanionSyncPush(bodyText: string) {
  return await handleCompanionSyncPushWithApply(
    bodyText,
    applyCompanionSyncPushAsync,
    notifyWorkspaceSyncApplied
  );
}

export { handleCompanionSyncPushWithApply } from './companionLanSyncPushWithApply.js';
