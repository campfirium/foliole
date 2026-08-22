import { describe, expect, it } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';

import {
  assertCompanionManualSyncFinished,
  findCompanionSyncRunFinishedEvent
} from './companionManualSyncAction';

function state(events: NativeCompanionWorkspaceSyncState['sync_events']): NativeCompanionWorkspaceSyncState {
  return {
    endpoint_url: 'http://desktop:38641', last_synced_at: null, remembered_targets: [],
    sync_events: events, sync_onboarding_status: 'completed', workspace_snapshot: null
  };
}

function event(runId: string, result: 'completed' | 'failed') {
  return {
    endpoint_url: 'http://desktop:38641', id: `event-${runId}`, kind: 'run_finished' as const,
    message: result === 'completed' ? 'All stages completed.' : 'Topic list sync failed.',
    occurred_at: '2026-08-23T00:00:00.000Z', result, run_id: runId,
    status: result === 'completed' ? 'completed' as const : 'failed' as const
  };
}

describe('manual sync run attribution', () => {
  it('selects the requested run instead of an unrelated latest completion', () => {
    const value = state([event('latest', 'completed'), event('requested', 'failed')]);

    expect(findCompanionSyncRunFinishedEvent(value, 'requested')?.result).toBe('failed');
    expect(() => assertCompanionManualSyncFinished(value, 'requested'))
      .toThrow('Topic list sync failed.');
  });

  it('rejects a missing terminal event instead of accepting latest completed', () => {
    const value = state([event('older', 'completed')]);

    expect(() => assertCompanionManualSyncFinished(value, 'requested'))
      .toThrow('matching completion');
  });

  it('accepts the requested completion without removing an earlier attention event', () => {
    const value = state([event('requested', 'completed'), event('attention', 'failed')]);

    expect(assertCompanionManualSyncFinished(value, 'requested').result).toBe('completed');
    expect(value.sync_events.find((entry) => entry.run_id === 'attention')?.result).toBe('failed');
  });
});
