// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { formatDiagnosticsSummary, summarizePreviewState } from './preview-dedupe-diagnostics.mjs';

describe('preview dedupe diagnostics', () => {
  it('summarizes active, next, stale, and recent runs', () => {
    const now = 10_000;
    const summary = summarizePreviewState({
      acceptingUntil: 12_500,
      activeRunId: 'active',
      nextRunId: 'next',
      runs: {
        active: { driverPid: -1, runId: 'active', startedAt: 7_000, status: 'running', waiters: ['a'] },
        next: { createdAt: 8_000, runId: 'next', status: 'pending', waiters: ['b', 'c'] },
        stale: { driverPid: -1, runId: 'stale', startedAt: 1_000, status: 'running', waiters: [] }
      }
    }, now);

    expect(summary.acceptingRemainingSec).toBe(3);
    expect(summary.activeRun).toMatchObject({ ageSec: 3, runId: 'active' });
    expect(summary.nextRun).toMatchObject({ runId: 'next', waiters: 2 });
    expect(summary.staleRunningRuns).toHaveLength(1);
    expect(summary.totalRuns).toBe(3);
  });

  it('formats a compact summary for preview logs', () => {
    const summary = formatDiagnosticsSummary({
      hash: 'abcdef1234567890',
      processSnapshot: ['100 preview-dedupe'],
      state: {
        acceptingRemainingSec: 12,
        activeRun: { ageSec: 4, driverPid: 100, driverPidAlive: true, runId: 'run-1', status: 'running' },
        nextRun: { runId: 'run-2', status: 'pending', waiters: 2 },
        staleRunningRuns: []
      },
      target: 'windows',
      windowsStatus: { stdout: '[windows-restart-client] status: STOPPED trust=FAILED reason=no-runtime' }
    });

    expect(summary).toMatchObject({
      acceptingRemainingSec: 12,
      active: { pidAlive: true, runId: 'run-1' },
      processCount: 1,
      windowsStatus: 'status: STOPPED trust=FAILED reason=no-runtime'
    });
  });
});
