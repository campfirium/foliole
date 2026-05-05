import { describe, expect, it } from 'vitest';

import { buildSyncConvergenceReport } from './companionSyncConvergence';
import type { CombinedSyncDiagnosticResult } from './companionSyncDiagnostics';

function result(overrides: Partial<CombinedSyncDiagnosticResult> = {}): CombinedSyncDiagnosticResult {
  return {
    android: {
      collected_at: '2026-05-01T00:00:00.000Z',
      connection: { endpoint_url: 'http://10.0.2.2:38641', last_error: null, state: 'ready' },
      content: { missing_content_blob_count: 0 },
      events: [],
      host: 'android',
      identity: { app_version: null, device_id: 'android' },
      storage: { active_node_count: 1, content_blob_count: 1, external_document_count: 0, missing_node_state_count: 0, missing_node_version_count: 0, node_blob_references_missing_rows: 0 },
      sync_state: { local_dirty_count: 0, max_state_seq: 10, pack_cursor: 10, pending_ack_count: 0, state_counts: [] },
      verdicts: []
    },
    desktop: {
      collected_at: '2026-05-01T00:00:00.000Z',
      connection: { endpoint_url: 'http://127.0.0.1:38641', last_error: null, state: 'running' },
      content: { missing_content_blob_count: 0 },
      events: [],
      host: 'desktop',
      identity: { app_version: '0.1.0', device_id: 'desktop' },
      storage: { active_node_count: 1, content_blob_count: 1, external_document_count: 0, missing_node_state_count: 0, missing_node_version_count: 0, node_blob_references_missing_rows: 0 },
      sync_state: { local_dirty_count: 0, max_state_seq: 10, pack_cursor: null, state_counts: [] },
      verdicts: []
    },
    verdicts: [],
    ...overrides
  };
}

describe('buildSyncConvergenceReport', () => {
  it('reports converged when local and desktop state are aligned', () => {
    expect(buildSyncConvergenceReport(result())).toMatchObject({
      status: 'converged',
      checks: [{ code: 'sync_converged', severity: 'ok' }]
    });
  });

  it('blocks completed events that still have dirty or pending local work', () => {
    const report = buildSyncConvergenceReport(result({
      android: {
        ...result().android!,
        events: [{ endpoint_url: 'http://10.0.2.2:38641', message: 'Auto sync completed.', occurred_at: '2026-05-01T00:01:00.000Z', status: 'completed' }],
        sync_state: { ...result().android!.sync_state, local_dirty_count: 1, pending_ack_count: 1 }
      }
    }));

    expect(report.status).toBe('blocked');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'completed_event_with_local_work', severity: 'error' })
    ]));
  });

  it('keeps body backlog and structure lag as pending work', () => {
    const report = buildSyncConvergenceReport(result({
      android: {
        ...result().android!,
        content: { missing_content_blob_count: 3 },
        sync_state: { ...result().android!.sync_state, pack_cursor: 8 }
      }
    }));

    expect(report.status).toBe('pending');
    expect(report.checks.map((item) => item.code)).toEqual(expect.arrayContaining([
      'content_backlog_exists',
      'structure_lag_exists'
    ]));
  });
});
