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
      expect.objectContaining({
        code: 'completed_event_with_local_work',
        detail: 'Completed was recorded while 1 dirty change(s), 1 pending ack(s), 0 body blob(s), 0 attachment file(s), and 0 structure change(s) remain.',
        severity: 'error'
      })
    ]));
  });

  it('blocks error diagnostic verdicts', () => {
    const report = buildSyncConvergenceReport(result({
      verdicts: [{
        code: 'android_recent_sync_failed',
        evidence: { message: 'Failed to apply companion desktop sync pack.' },
        message: 'Recent sync activity failed.',
        severity: 'error'
      }]
    }));

    expect(report.status).toBe('blocked');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'diagnostic_error_android_recent_sync_failed',
        detail: 'Diagnostic verdict android_recent_sync_failed is blocking convergence.',
        severity: 'error'
      })
    ]));
  });

  it('blocks pending acks that survive a later finished sync pass', () => {
    const report = buildSyncConvergenceReport(result({
      android: {
        ...result().android!,
        events: [{
          endpoint_url: 'http://10.0.2.2:38641',
          message: 'Sync pass finished; local changes are still waiting to settle.',
          occurred_at: '2026-05-01T00:02:00.000Z',
          status: 'skipped'
        }],
        sync_state: {
          ...result().android!.sync_state,
          pending_ack_count: 1,
          pending_acks: [{
            acked_at: '2026-05-01T00:01:00.000Z',
            client_op_id: 'node_review:node-1:9',
            object_id: 'node-1',
            object_type: 'node_review',
            state_seq: 12,
            status: 'accepted'
          }]
        }
      }
    }));

    expect(report.status).toBe('blocked');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'pending_ack_survived_finished_pass',
        detail: '1 accepted push ack(s) remained pending after a later sync pass finished.',
        severity: 'error'
      })
    ]));
  });

  it('blocks skipped passes that ended with push conflicts or rejections', () => {
    const report = buildSyncConvergenceReport(result({
      android: {
        ...result().android!,
        events: [{
          endpoint_url: 'http://10.0.2.2:38641',
          message: 'Sync pass finished; 2 device change(s) need review before they can be sent.',
          occurred_at: '2026-05-01T00:03:00.000Z',
          status: 'skipped'
        }]
      }
    }));

    expect(report.status).toBe('blocked');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'push_conflict_or_rejection_waiting',
        detail: 'Sync pass finished; 2 device change(s) need review before they can be sent.',
        severity: 'error'
      })
    ]));
  });

  it('blocks completed events that still have structure or resource backlog', () => {
    const report = buildSyncConvergenceReport(result({
      android: {
        ...result().android!,
        content: {
          missing_attachment_resource_count: 2,
          missing_content_blob_count: 3
        },
        events: [{ endpoint_url: 'http://10.0.2.2:38641', message: 'Sync completed.', occurred_at: '2026-05-01T00:01:00.000Z', status: 'completed' }],
        sync_state: { ...result().android!.sync_state, pack_cursor: 9 }
      }
    }));

    expect(report.status).toBe('blocked');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'completed_event_with_local_work',
        detail: 'Completed was recorded while 0 dirty change(s), 0 pending ack(s), 3 body blob(s), 2 attachment file(s), and 1 structure change(s) remain.',
        severity: 'error'
      })
    ]));
  });

  it('keeps body backlog and structure lag as pending work', () => {
    const report = buildSyncConvergenceReport(result({
      android: {
        ...result().android!,
        content: {
          missing_content_blob_count: 3,
          missing_external_document_body_count: 1,
          missing_topic_body_count: 2
        },
        sync_state: { ...result().android!.sync_state, pack_cursor: 8 }
      }
    }));

    expect(report.status).toBe('pending');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'content_backlog_exists',
        detail: '3 body blob(s) remain uncached: 2 topic, 1 external document.'
      })
    ]));
    expect(report.checks.map((item) => item.code)).toEqual(expect.arrayContaining([
      'content_backlog_exists',
      'structure_lag_exists'
    ]));
  });

  it('keeps attachment backlog as pending work', () => {
    const report = buildSyncConvergenceReport(result({
      android: {
        ...result().android!,
        content: { missing_attachment_resource_count: 2, missing_content_blob_count: 0 }
      }
    }));

    expect(report.status).toBe('pending');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'attachment_backlog_exists', severity: 'info' })
    ]));
  });
});
