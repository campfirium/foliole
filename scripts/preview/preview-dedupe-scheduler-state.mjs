/* global process */

import { randomUUID } from 'node:crypto';

function createRun(requestId, now) {
  return {
    driverPid: process.pid,
    driverRequestId: requestId,
    runId: randomUUID(),
    startedAt: now,
    status: 'running',
    waiters: [requestId]
  };
}

function createPendingRun(requestId, now, options = {}) {
  return {
    createdAt: now,
    notBeforeAt: options.notBeforeAt ?? 0,
    requireActualPreview: options.requireActualPreview ?? true,
    runId: randomUUID(),
    status: 'pending',
    waiters: [requestId]
  };
}

export function normalizeState(state) {
  return {
    acceptingUntil: Number(state.acceptingUntil) || 0,
    activeRunId: state.activeRunId ?? null,
    nextRunId: state.nextRunId ?? null,
    runs: state.runs && typeof state.runs === 'object' ? state.runs : {}
  };
}

export function startRun(state, requestId, now) {
  const run = createRun(requestId, now);
  state.runs[run.runId] = run;
  state.activeRunId = run.runId;
  return run;
}

export function registerNextRun(state, requestId, now, options) {
  if (!state.nextRunId) {
    const run = createPendingRun(requestId, now, options);
    state.nextRunId = run.runId;
    state.runs[run.runId] = run;
    return run.runId;
  }
  extendPendingRun(state.runs[state.nextRunId], requestId, options);
  return state.nextRunId;
}

function extendPendingRun(run, requestId, options = {}) {
  run.waiters.push(requestId);
  if (options.notBeforeAt !== undefined) {
    const maxNotBeforeAt = Number(run.createdAt) + Number(options.maxSettleMs ?? 0);
    const nextNotBeforeAt = Math.max(Number(run.notBeforeAt) || 0, Number(options.notBeforeAt) || 0);
    run.notBeforeAt = options.maxSettleMs > 0 ? Math.min(nextNotBeforeAt, maxNotBeforeAt) : nextNotBeforeAt;
  }
  if (options.requireActualPreview !== undefined) {
    run.requireActualPreview = Boolean(run.requireActualPreview || options.requireActualPreview);
  }
}

export function completeRun(state, runId, result, windowMs) {
  const now = Date.now();
  const completedRun = {
    ...state.runs[runId],
    completedAt: now,
    exitCode: result.exitCode,
    hash: result.hash,
    previewed: result.previewed,
    status: 'completed'
  };
  state.runs[runId] = completedRun;
  if (result.exitCode === 0) completeWaitingSuccessRuns(state, completedRun);
  if (state.activeRunId === runId) state.activeRunId = null;
  state.acceptingUntil = result.exitCode === 0 && result.previewed ? now + windowMs : 0;
}

function completeWaitingSuccessRuns(state, completedRun) {
  for (const [waitingRunId, run] of Object.entries(state.runs)) {
    if (run.status === 'waiting-success') {
      state.runs[waitingRunId] = {
        ...run,
        completedAt: completedRun.completedAt,
        exitCode: completedRun.exitCode,
        hash: completedRun.hash,
        previewed: completedRun.previewed,
        runId: waitingRunId,
        status: 'completed'
      };
    }
  }
}

export function holdRunUntilSuccess(state, runId, result) {
  state.runs[runId] = {
    ...state.runs[runId],
    failedAt: Date.now(),
    lastExitCode: result.exitCode,
    lastHash: result.hash,
    status: 'waiting-success'
  };
  if (state.activeRunId === runId) state.activeRunId = null;
  state.acceptingUntil = 0;
}
