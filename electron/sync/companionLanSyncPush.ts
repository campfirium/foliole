import { randomUUID } from 'node:crypto';

import {
  applyCompanionSyncPushAsync
} from '../database/companionSyncPushAsyncApply.js';

import { handleCompanionSyncPushWithApply } from './companionLanSyncPushWithApply.js';
import { recordDesktopSyncActivity } from './desktopSyncActivityStore.js';
import { notifyWorkspaceSyncApplied } from './workspaceSyncAppliedEvents.js';

export const SYNC_PUSH_PATH = '/companion/sync-push';

export async function handleCompanionSyncPush(bodyText: string, authenticatedHostName: string,
  authenticatedDeviceId?: string) {
  const context = { runId: randomUUID(), startedAt: new Date().toISOString() };
  const peer = { peer_device_id: authenticatedDeviceId ?? '', peer_device_name: authenticatedHostName };
  if (authenticatedDeviceId) await recordDesktopSyncActivity(context, {
    direction: 'receive', kind: 'run_started', message: 'Receiving device changes', stage: 'sync_push', status: 'started'
  }, peer);
  try {
    const result = await handleCompanionSyncPushWithApply(
      bodyText, authenticatedHostName,
      items => applyCompanionSyncPushAsync(items, authenticatedDeviceId ?? ''), notifyWorkspaceSyncApplied
    );
    const saved = result.acks.filter((ack) => ack.status === 'accepted' || ack.status === 'already_applied').length;
    if (authenticatedDeviceId) await recordDesktopSyncActivity(context, {
      direction: 'receive', kind: 'run_finished', message: 'Device changes processed',
      record_count: saved, result: saved === result.acks.length ? 'completed' : 'blocked',
      stage: 'sync_push', status: 'completed', confirmation: 'saved'
    }, peer);
    return result;
  } catch (error) {
    if (authenticatedDeviceId) await recordDesktopSyncActivity(context, {
      direction: 'receive', kind: 'run_finished', message: error instanceof Error ? error.message : String(error),
      result: 'failed', stage: 'sync_push', status: 'failed'
    }, peer);
    throw error;
  }
}

export { handleCompanionSyncPushWithApply } from './companionLanSyncPushWithApply.js';
