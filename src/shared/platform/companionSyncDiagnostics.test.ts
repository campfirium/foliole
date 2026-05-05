import { describe, expect, it } from 'vitest';

import type { SyncDiagnosticSnapshot } from '../../../lib/platform/syncDiagnosticsContract';

import {
  findLaggingDesktopObjectTypes,
  mergeSyncDiagnosticVerdicts
} from './companionSyncDiagnostics';

function snapshot(host: 'android' | 'desktop', overrides: Partial<SyncDiagnosticSnapshot>): SyncDiagnosticSnapshot {
  return {
    collected_at: '2026-04-29T00:00:00.000Z',
    connection: { endpoint_url: null, last_error: null, state: 'ready' },
    content: { missing_content_blob_count: 0 },
    events: [],
    host,
    identity: { app_version: null, device_id: `${host}-device` },
    storage: {
      active_node_count: 1,
      content_blob_count: 1,
      external_document_count: 0,
      missing_node_state_count: 0,
      missing_node_version_count: 0,
      node_blob_references_missing_rows: 0
    },
    sync_state: {
      local_dirty_count: 0,
      max_state_seq: host === 'desktop' ? 4 : null,
      pack_cursor: host === 'android' ? 4 : null,
      state_counts: []
    },
    verdicts: [],
    ...overrides
  };
}

function expectAndroidCursorLagVerdict() {
  const verdicts = mergeSyncDiagnosticVerdicts({
    android: snapshot('android', { sync_state: { local_dirty_count: 0, max_state_seq: 2, pack_cursor: 2, state_counts: [] } }),
    desktop: snapshot('desktop', { sync_state: { local_dirty_count: 0, max_state_seq: 7, pack_cursor: null, state_counts: [] } })
  });

  expect(verdicts.some((verdict) => verdict.code === 'sync_android_not_caught_up')).toBe(true);
}

function expectCursorLagWithRecentFailure() {
  const verdicts = mergeSyncDiagnosticVerdicts({
    android: snapshot('android', {
      events: [{
        endpoint_url: null,
        message: 'Failed to apply companion desktop sync pack.',
        occurred_at: '2026-04-29T01:26:00.000Z',
        status: 'failed'
      }],
      sync_state: { local_dirty_count: 0, max_state_seq: 2, pack_cursor: 2, state_counts: [] }
    }),
    desktop: snapshot('desktop', { sync_state: { local_dirty_count: 0, max_state_seq: 7, pack_cursor: null, state_counts: [] } })
  });

  expect(verdicts).toContainEqual(expect.objectContaining({ code: 'sync_recent_android_failure' }));
  expect(verdicts).toContainEqual(expect.objectContaining({
    code: 'sync_android_not_caught_up',
    evidence: expect.objectContaining({ cursor_lag: 5 }),
    message: 'New desktop changes are available for this device.',
    severity: 'info'
  }));
}

function expectOldFailureHiddenAfterCompletedAutoSync() {
  const verdicts = mergeSyncDiagnosticVerdicts({
    android: snapshot('android', {
      events: [
        {
          endpoint_url: null,
          message: 'Auto sync completed.',
          occurred_at: '2026-04-29T01:30:00.000Z',
          status: 'completed'
        },
        {
          endpoint_url: null,
          message: 'Failed to apply companion desktop sync pack.',
          occurred_at: '2026-04-29T01:26:00.000Z',
          status: 'failed'
        }
      ],
      sync_state: { local_dirty_count: 0, max_state_seq: 7, pack_cursor: 7, state_counts: [] }
    }),
    desktop: snapshot('desktop', { sync_state: { local_dirty_count: 0, max_state_seq: 7, pack_cursor: null, state_counts: [] } })
  });

  expect(verdicts).not.toContainEqual(expect.objectContaining({ code: 'sync_recent_android_failure' }));
}

function expectLaggingDesktopObjectTypes() {
  const lagging = findLaggingDesktopObjectTypes({
    packCursor: 101693,
    desktop: snapshot('desktop', {
      sync_state: {
        local_dirty_count: 0,
        max_state_seq: 101747,
        pack_cursor: null,
        state_counts: [
          { count: 40, max_state_seq: 98740, min_state_seq: 98701, object_type: 'node' },
          { count: 3, max_state_seq: 101712, min_state_seq: 1257, object_type: 'setting' },
          { count: 47, max_state_seq: 101747, min_state_seq: 1544, object_type: 'view_state' }
        ]
      }
    })
  });

  expect(lagging).toEqual([
    { object_type: 'view_state', cursor_lag: 54, max_state_seq: 101747 },
    { object_type: 'setting', cursor_lag: 19, max_state_seq: 101712 }
  ]);
}

function expectAlignedStructureWithoutPercentages() {
  const verdicts = mergeSyncDiagnosticVerdicts({
    android: snapshot('android', {}),
    desktop: snapshot('desktop', {})
  });

  expect(verdicts).toContainEqual(expect.objectContaining({ code: 'sync_structure_aligned' }));
  expect(JSON.stringify(verdicts)).not.toContain('%');
}

function expectContentBacklogSeparateFromStructure() {
  const verdicts = mergeSyncDiagnosticVerdicts({
    android: snapshot('android', {
      content: {
        missing_content_blob_count: 12,
        missing_external_document_body_count: 3,
        missing_topic_body_count: 9
      }
    }),
    desktop: snapshot('desktop', {})
  });

  expect(verdicts).toContainEqual(expect.objectContaining({ code: 'sync_structure_aligned' }));
  expect(verdicts).toContainEqual(expect.objectContaining({
    code: 'sync_android_content_cache_backlog',
    evidence: expect.objectContaining({
      missing_external_document_body_count: 3,
      missing_topic_body_count: 9
    }),
    message: 'Some topic bodies are still downloading.',
    severity: 'info'
  }));
  expect(verdicts).not.toContainEqual(expect.objectContaining({ code: 'sync_android_not_caught_up' }));
}

function expectAttachmentBacklogSeparateFromStructure() {
  const verdicts = mergeSyncDiagnosticVerdicts({
    android: snapshot('android', { content: { missing_attachment_resource_count: 4, missing_content_blob_count: 0 } }),
    desktop: snapshot('desktop', {})
  });

  expect(verdicts).toContainEqual(expect.objectContaining({ code: 'sync_structure_aligned' }));
  expect(verdicts).toContainEqual(expect.objectContaining({
    code: 'sync_android_attachment_cache_backlog',
    message: 'Some attachment files are still downloading.',
    severity: 'info'
  }));
  expect(verdicts).not.toContainEqual(expect.objectContaining({ code: 'sync_android_not_caught_up' }));
}

describe('mergeSyncDiagnosticVerdicts', () => {
  it('reports when Android has not caught up to the desktop state sequence', expectAndroidCursorLagVerdict);
  it('keeps cursor lag visible even when the latest Android sync failed', expectCursorLagWithRecentFailure);
  it('ignores older failed events after a completed auto sync', expectOldFailureHiddenAfterCompletedAutoSync);
  it('identifies desktop object types that are still beyond the Android cursor', expectLaggingDesktopObjectTypes);
  it('reports aligned structure without using progress percentages', expectAlignedStructureWithoutPercentages);
  it('keeps content cache backlog separate from structure alignment', expectContentBacklogSeparateFromStructure);
  it('keeps attachment cache backlog separate from structure alignment', expectAttachmentBacklogSeparateFromStructure);
});
