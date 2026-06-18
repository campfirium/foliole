// @vitest-environment node
/* global process */

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
        aged: { driverPid: process.pid, runId: 'aged', startedAt: 0, status: 'running', waiters: [] },
        stale: { driverPid: -1, runId: 'stale', startedAt: 1_000, status: 'running', waiters: [] }
      }
    }, now);

    expect(summary.acceptingRemainingSec).toBe(3);
    expect(summary.activeRun).toMatchObject({ ageSec: 3, runId: 'active' });
    expect(summary.nextRun).toMatchObject({ runId: 'next', waiters: 2 });
    expect(summary.staleRunningRuns).toHaveLength(2);
    expect(summary.totalRuns).toBe(4);
  });

  it('formats a compact summary for preview logs', () => {
    const summary = formatDiagnosticsSummary({
      hash: 'abcdef1234567890',
      processSnapshot: ['100 preview-dedupe'],
      state: {
        acceptingRemainingSec: 12,
        activeRun: { ageSec: 4, driverPid: 100, driverPidAlive: true, runId: 'run-1', status: 'running' },
        nextRun: { runId: 'run-2', status: 'pending', waiters: 2 },
        staleRunningRuns: [
          { ageSec: 1_000, driverPid: -1, driverPidAlive: false, runId: 'dead', status: 'running' },
          { ageSec: 1_000, driverPid: process.pid, driverPidAlive: true, runId: 'aged', status: 'running' }
        ]
      },
      target: 'windows',
      windowsStatus: { stdout: '[windows-restart-client] status: STOPPED trust=FAILED reason=no-runtime' }
    });

    expect(summary).toMatchObject({
      acceptingRemainingSec: 12,
      active: { pidAlive: true, runId: 'run-1' },
      processCount: 1,
      staleAgedCount: 1,
      staleDeadCount: 1,
      staleExplanation: 'Dead stale preview records will not continue and do not block a new windows:preview.',
      windowsStatus: 'status: STOPPED trust=FAILED reason=no-runtime',
      windowsStatusNextAction: 'Run npm run windows:preview; it will sync, verify prerequisites, and use fallback-start.',
      windowsStatusSource: 'official-windows-mirror:D:\\C\\foliole',
      windowsStatusVerdict: 'No trusted official Windows mirror client is running; this is no-runtime, not a confirmed code startup crash.'
    });
  });

  it('reports a trusted running official Windows mirror client', () => {
    const summary = formatDiagnosticsSummary({
      hash: 'abcdef1234567890',
      processSnapshot: [],
      state: {
        acceptingRemainingSec: 0,
        activeRun: null,
        nextRun: null,
        staleRunningRuns: []
      },
      target: 'windows',
      windowsStatus: { stdout: '[windows-restart-client] status: RUNNING trust=OK shell_pid=1 runtime_pid=2' }
    });

    expect(summary).toMatchObject({
      staleAgedCount: 0,
      staleDeadCount: 0,
      staleExplanation: null,
      windowsStatusNextAction: 'No startup repair is needed; run npm run windows:preview after changes that need preview.',
      windowsStatusVerdict: 'Official Windows mirror client is running and trusted.'
    });
  });

  it('reports unavailable Windows status without classifying it as stopped', () => {
    const summary = formatDiagnosticsSummary({
      hash: 'abcdef1234567890',
      processSnapshot: [],
      state: {
        acceptingRemainingSec: 0,
        activeRun: null,
        nextRun: null,
        staleRunningRuns: []
      },
      target: 'windows',
      windowsStatus: { exitCode: 1, stdout: '', stderr: 'powershell failed' }
    });

    expect(summary).toMatchObject({
      windowsStatus: null,
      windowsStatusNextAction: 'Inspect preview diagnostics; the official Windows mirror status source is unavailable.',
      windowsStatusVerdict: 'Official Windows mirror status is unavailable, so startup state is not confirmed.'
    });
  });
});
