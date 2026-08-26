import { describe, expect, it } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';
import { definedProps } from '../lib/definedProps';

import {
  normalizeWorkspaceSyncState,
  prependSyncEvent
} from './companionWorkspaceSyncState';

function runEvent(index: number, kind: 'run_finished' | 'run_started') {
  const minute = String(index).padStart(2, '0');
  const startedAt = `2026-04-29T02:${minute}:00.000Z`;
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    kind,
    message: kind === 'run_started'
      ? 'Auto sync started.'
      : 'Sync checked; 1 device change needs review before sending.',
    occurred_at: kind === 'run_started' ? startedAt : `2026-04-29T02:${minute}:30.000Z`,
    run_id: `run-${index}`,
    started_at: startedAt,
    status: kind === 'run_started' ? 'started' as const : 'skipped' as const,
    ...definedProps({ result: kind === 'run_finished' ? 'blocked' as const : undefined })
  };
}

function testUsesLatestFullSyncEvent() {
  const state = normalizeWorkspaceSyncState({
    endpoint_url: 'http://10.0.2.2:38641',
    sync_events: [
      {
        endpoint_url: 'http://10.0.2.2:38641',
        id: 'event-2',
        message: 'Sync fully completed.',
        occurred_at: '2026-04-29T02:18:00.000Z',
        status: 'completed'
      },
      {
        endpoint_url: 'http://10.0.2.2:38641',
        id: 'event-1',
        message: 'Auto sync started.',
        occurred_at: '2026-04-29T02:17:58.000Z',
        status: 'started'
      }
    ]
  });

  expect(state.last_synced_at).toBe('2026-04-29T02:18:00.000Z');
}

function testUsesLegacySkippedSyncCheck() {
  const state = normalizeWorkspaceSyncState({
    endpoint_url: 'http://10.0.2.2:38641',
    sync_events: [
      {
        endpoint_url: 'http://10.0.2.2:38641',
        id: 'event-2',
        message: 'Sync checked',
        occurred_at: '2026-04-29T02:18:00.000Z',
        status: 'skipped'
      }
    ]
  });

  expect(state.last_synced_at).toBe('2026-04-29T02:18:00.000Z');
}

function testBlockedRunDoesNotUpdateLastSyncedAt() {
  const state = normalizeWorkspaceSyncState({
    endpoint_url: 'http://10.0.2.2:38641',
    sync_events: [{
      endpoint_url: 'http://10.0.2.2:38641',
      id: 'run-blocked',
      kind: 'run_finished',
      message: 'Sync checked; 2 device changes need review before sending.',
      occurred_at: '2026-04-29T02:18:00.000Z',
      result: 'blocked',
      run_id: 'run-1',
      started_at: '2026-04-29T02:17:00.000Z',
      status: 'skipped'
    }]
  });

  expect(state.last_synced_at).toBeNull();
}

function testWaitingRunDoesNotUpdateLastSyncedAt() {
  const state = normalizeWorkspaceSyncState({
    endpoint_url: 'http://10.0.2.2:38641',
    sync_events: [{
      endpoint_url: 'http://10.0.2.2:38641',
      id: 'run-waiting',
      kind: 'run_finished',
      message: 'Android changes are still waiting to settle.',
      occurred_at: '2026-04-29T02:18:00.000Z',
      result: 'waiting',
      run_id: 'run-1',
      started_at: '2026-04-29T02:17:00.000Z',
      status: 'skipped'
    }]
  });

  expect(state.last_synced_at).toBeNull();
  expect(state.sync_events[0]?.result).toBe('waiting');
}

function testPreservesStageFinishedKind() {
  const state = normalizeWorkspaceSyncState({
    sync_events: [{
      endpoint_url: 'http://10.0.2.2:38641',
      id: 'stage-1',
      kind: 'stage_finished',
      message: 'Topic bodies downloaded; 1 topic body.',
      occurred_at: '2026-04-29T02:18:00.000Z',
      result: 'completed',
      run_id: 'run-1',
      started_at: '2026-04-29T02:17:00.000Z',
      status: 'completed'
    }]
  });

  expect(state.sync_events[0]?.kind).toBe('stage_finished');
}

function testCapacityUsesFinishedRuns() {
  const initial = normalizeWorkspaceSyncState({ sync_events: [] });
  const state = Array.from({ length: 101 }).reduce<NativeCompanionWorkspaceSyncState>((current, _, index) => (
    prependSyncEvent(prependSyncEvent(current, runEvent(index, 'run_started')), runEvent(index, 'run_finished'))
  ), initial);

  expect(state.sync_events.filter((event) => event.kind === 'run_finished')).toHaveLength(100);
  expect(state.sync_events.some((event) => event.run_id === 'run-0')).toBe(false);
}

function testNormalizesSyncEventSummary() {
  const state = normalizeWorkspaceSyncState({
    sync_events: [{
      endpoint_url: 'http://10.0.2.2:38641',
      id: 'run-summary',
      kind: 'run_finished',
      message: 'All stages completed.',
      occurred_at: '2026-04-29T02:18:08.000Z',
      result: 'completed',
      run_id: 'run-1',
      started_at: '2026-04-29T02:18:00.000Z',
      status: 'completed',
      summary: {
        change_count: 5,
        duration_ms: 8_000
      }
    }]
  });

  expect(state.sync_events[0]?.summary).toEqual({
    change_count: 5,
    duration_ms: 8_000
  });
}

function testNormalizesSyncTriggerReason() {
  const state = normalizeWorkspaceSyncState({
    sync_events: [{
      id: 'run-manual', kind: 'run_finished', message: 'Sync completed.',
      occurred_at: '2026-08-26T06:00:00.000Z', status: 'completed', trigger_reason: 'manual'
    }]
  });

  expect(state.sync_events[0]).toMatchObject({ status: 'completed', trigger_reason: 'manual' });
}

function testKeepsCurrentStartedRunBeforeFinish() {
  const initial = normalizeWorkspaceSyncState({ sync_events: [] });
  const state = prependSyncEvent(initial, runEvent(1, 'run_started'));

  expect(state.sync_events).toHaveLength(1);
  expect(state.sync_events[0]?.kind).toBe('run_started');
}

describe('normalizeWorkspaceSyncState', () => {
  it('uses the latest full sync event when last sync metadata is missing', testUsesLatestFullSyncEvent);
  it('uses a completed sync check when no changes were applied', testUsesLegacySkippedSyncCheck);
  it('does not treat blocked runs as synced progress', testBlockedRunDoesNotUpdateLastSyncedAt);
  it('does not treat waiting local-change runs as synced progress', testWaitingRunDoesNotUpdateLastSyncedAt);
  it('preserves stage finished events as stage facts', testPreservesStageFinishedKind);
  it('keeps capacity by finished run instead of started event count', testCapacityUsesFinishedRuns);
  it('keeps a started run until its final result arrives', testKeepsCurrentStartedRunBeforeFinish);
  it('normalizes structured sync event summaries', testNormalizesSyncEventSummary);
  it('normalizes the durable sync trigger reason', testNormalizesSyncTriggerReason);
});
