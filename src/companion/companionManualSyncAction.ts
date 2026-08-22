import type {
  NativeCompanionSyncEvent,
  NativeCompanionWorkspaceSyncState
} from '../../lib/platform/nativeCompanionSyncContract';
import { isSyncRunFinishedEvent } from '../shared/platform/companionSyncActivityEvents';

export type CompanionManualSyncAction = {
  mode: 'joined' | 'owned' | 'resolving';
  runId: string | null;
};

const FAILED_RESULTS = new Set(['cancelled', 'failed', 'system_fault']);

export function findCompanionSyncRunFinishedEvent(
  state: NativeCompanionWorkspaceSyncState,
  runId: string
) {
  return state.sync_events.find((event) => (
    event.run_id === runId && isSyncRunFinishedEvent(event)
  )) ?? null;
}

export function assertCompanionManualSyncFinished(
  state: NativeCompanionWorkspaceSyncState,
  runId: string
): NativeCompanionSyncEvent {
  const event = findCompanionSyncRunFinishedEvent(state, runId);
  if (!event) {
    throw new Error('The requested sync did not record a matching completion.');
  }
  if (event.result && FAILED_RESULTS.has(event.result)) {
    throw new Error(event.message);
  }
  return event;
}
