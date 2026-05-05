import type { NativeCompanionSyncEvent } from '../../../lib/platform/nativeCompanionSyncContract';

export const FULL_SYNC_COMPLETED_MESSAGE = 'Sync fully completed.';

export function isFullSyncCompletedEvent(event: NativeCompanionSyncEvent) {
  return event.status === 'completed' && event.message === FULL_SYNC_COMPLETED_MESSAGE;
}
