import { describe, expect, it } from 'vitest';

import { buildSyncConvergenceReport } from './companionSyncConvergence';
import { syncConvergenceResult } from './companionSyncConvergence.testHelpers';

function testReportsConverged() {
  expect(buildSyncConvergenceReport(syncConvergenceResult())).toMatchObject({
    status: 'converged',
    checks: [{ code: 'sync_converged', severity: 'ok' }]
  });
}

function testUsesCrossPlatformDeviceCopy() {
  const missingDevice = buildSyncConvergenceReport(syncConvergenceResult({ android: null }));
  const missingPosition = buildSyncConvergenceReport(syncConvergenceResult({
    android: {
      ...syncConvergenceResult().android!,
      sync_state: { ...syncConvergenceResult().android!.sync_state, pack_cursor: null }
    }
  }));

  expect(missingDevice.checks).toContainEqual(expect.objectContaining({
    code: 'android_diagnostics_missing',
    detail: 'Run this check inside the companion app.',
    title: 'Device diagnostics unavailable'
  }));
  expect(missingPosition.checks).toContainEqual(expect.objectContaining({
    code: 'structure_lag_unknown',
    detail: 'Device or desktop sync position is missing.'
  }));
}

function testBlocksFinishedPassWithDirtyWork() {
  const report = buildSyncConvergenceReport(syncConvergenceResult({
    android: {
      ...syncConvergenceResult().android!,
      events: [{ endpoint_url: 'http://10.0.2.2:38641', message: 'Auto sync completed.', occurred_at: '2026-05-01T00:01:00.000Z', status: 'completed' }],
      sync_state: { ...syncConvergenceResult().android!.sync_state, local_dirty_count: 1, pending_ack_count: 1 }
    }
  }));

  expect(report.status).toBe('pending');
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'completed_event_with_local_work',
      detail: 'A finished sync check was recorded while 1 device change, 1 desktop confirmation, 0 change issues, 0 topic body files, 0 attachment files, 0 topic list changes were still present.',
      severity: 'warning'
    })
  ]));
}

function testBlocksErrorDiagnosticVerdicts() {
  const report = buildSyncConvergenceReport(syncConvergenceResult({
    verdicts: [{
      code: 'android_recent_sync_failed',
      evidence: { message: 'Failed to apply companion desktop sync pack.' },
      message: 'Recent sync activity failed.',
      severity: 'error'
    }]
  }));

  expect(report.status).toBe('system_fault');
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'diagnostic_error_android_recent_sync_failed',
      detail: 'Sync diagnostic android_recent_sync_failed needs attention.',
      severity: 'error'
    })
  ]));
}

function testDeduplicatesMergedErrorVerdicts() {
  const diagnosticError = {
    code: 'android_recent_sync_failed',
    evidence: { message: 'Failed to apply companion desktop sync pack.' },
    message: 'Recent sync activity failed.',
    severity: 'error' as const
  };
  const report = buildSyncConvergenceReport(syncConvergenceResult({
    android: { ...syncConvergenceResult().android!, verdicts: [diagnosticError] },
    verdicts: [diagnosticError]
  }));

  expect(report.checks.filter((item) => item.code === 'diagnostic_error_android_recent_sync_failed')).toHaveLength(1);
}

function testBlocksStalePendingAck() {
  const report = buildSyncConvergenceReport(syncConvergenceResult({
    android: {
      ...syncConvergenceResult().android!,
      events: [{ endpoint_url: 'http://10.0.2.2:38641', message: 'Sync checked; local changes are still waiting to settle.', occurred_at: '2026-05-01T00:02:00.000Z', status: 'skipped' }],
      sync_state: {
        ...syncConvergenceResult().android!.sync_state,
        pending_ack_count: 1,
        pending_acks: [{ acked_at: '2026-05-01T00:01:00.000Z', client_op_id: 'node_review:node-1:9', object_id: 'node-1', object_type: 'node_review', state_seq: 12, status: 'accepted' }]
      }
    }
  }));

  expect(report.status).toBe('system_fault');
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'pending_ack_survived_finished_pass',
      detail: '1 desktop confirmation remained pending after a later sync check.',
      severity: 'error'
    })
  ]));
}

function testDoesNotDoubleCountPendingAckAsReadyDirty() {
  const report = buildSyncConvergenceReport(syncConvergenceResult({
    android: {
      ...syncConvergenceResult().android!,
      events: [{ endpoint_url: 'http://10.0.2.2:38641', message: 'Sync completed.', occurred_at: '2026-05-01T00:01:00.000Z', status: 'completed' }],
      sync_state: {
        ...syncConvergenceResult().android!.sync_state,
        local_dirty_count: 1,
        pending_ack_count: 1,
        ready_dirty_count: 0
      }
    }
  }));

  expect(report.status).toBe('pending');
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'completed_event_with_local_work',
      detail: 'A finished sync check was recorded while 0 device changes, 1 desktop confirmation, 0 change issues, 0 topic body files, 0 attachment files, 0 topic list changes were still present.'
    }),
    expect.objectContaining({
      code: 'pending_ack_not_confirmed',
      severity: 'warning'
    })
  ]));
  expect(report.checks.map((item) => item.code)).not.toContain('local_dirty_not_converged');
}

function testBlocksPushConflicts() {
  const report = buildSyncConvergenceReport(syncConvergenceResult({
    android: {
      ...syncConvergenceResult().android!,
      events: [{ endpoint_url: 'http://10.0.2.2:38641', message: 'Sync checked; 2 device changes need review before sending.', occurred_at: '2026-05-01T00:03:00.000Z', status: 'skipped' }]
    }
  }));

  expect(report.status).toBe('pending');
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'push_conflict_or_rejection_waiting',
      detail: 'Sync checked; 2 device changes need review before sending.',
      severity: 'warning'
    })
  ]));
}

function testBlocksPersistedPushIssues() {
  const report = buildSyncConvergenceReport(syncConvergenceResult({
    android: {
      ...syncConvergenceResult().android!,
      sync_state: { ...syncConvergenceResult().android!.sync_state, push_issue_count: 1 }
    }
  }));

  expect(report.status).toBe('pending');
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'push_issue_not_converged',
      detail: '1 device change was rejected or conflicted during push.',
      severity: 'warning'
    })
  ]));
}

function testBlocksFinishedPassWithResourceBacklog() {
  const report = buildSyncConvergenceReport(syncConvergenceResult({
    android: {
      ...syncConvergenceResult().android!,
      content: { missing_attachment_resource_count: 2, missing_content_blob_count: 3 },
      events: [{ endpoint_url: 'http://10.0.2.2:38641', message: 'Sync completed.', occurred_at: '2026-05-01T00:01:00.000Z', status: 'completed' }],
      sync_state: { ...syncConvergenceResult().android!.sync_state, pack_cursor: 9 }
    }
  }));

  expect(report.status).toBe('pending');
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'completed_event_with_local_work',
      detail: 'A finished sync check was recorded while 0 device changes, 0 desktop confirmations, 0 change issues, 3 topic body files, 2 attachment files, 1 topic list change were still present.',
      severity: 'warning'
    })
  ]));
}

describe('buildSyncConvergenceReport', () => {
  it('reports converged when local and desktop state are aligned', testReportsConverged);
  it('uses cross-platform device copy for missing local diagnostics', testUsesCrossPlatformDeviceCopy);
  it('blocks finished sync passes that still have dirty or pending local work', testBlocksFinishedPassWithDirtyWork);
  it('blocks error diagnostic verdicts', testBlocksErrorDiagnosticVerdicts);
  it('deduplicates merged error diagnostic verdicts', testDeduplicatesMergedErrorVerdicts);
  it('blocks pending acks that survive a later finished sync pass', testBlocksStalePendingAck);
  it('does not double count pending acks as ready dirty changes', testDoesNotDoubleCountPendingAckAsReadyDirty);
  it('blocks skipped passes that ended with push conflicts or rejections', testBlocksPushConflicts);
  it('blocks persisted push conflicts or rejections', testBlocksPersistedPushIssues);
  it('blocks finished sync passes that still have structure or resource backlog', testBlocksFinishedPassWithResourceBacklog);
});
