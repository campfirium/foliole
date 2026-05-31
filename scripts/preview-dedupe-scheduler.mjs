/* global console, process */

import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { appendPreviewEvent } from './preview-dedupe-event-log.mjs';
import { completeRun, holdRunUntilSuccess, normalizeState, registerNextRun, startRun } from './preview-dedupe-scheduler-state.mjs';
import { completeTimedOutRun } from './preview-dedupe-scheduler-timeout.mjs';
import { isPidAlive, withStateLock } from './preview-dedupe-state-store.mjs';
import { readMaxSettleMs, readSettleMs, readTotalTimeoutMs, readWindowMs } from './preview-dedupe-time-budget.mjs';
import { createPreviewWaitAnnouncer } from './preview-dedupe-wait-status.mjs';

const RESULT_POLL_MS = 200; export const STATE_STALE_MS = 15 * 60_000;

export function shouldForcePreview(env = process.env) {
  return env.PREVIEW_DEDUPE_FORCE === '1';
}

function readWaitOnFailure(env = process.env) {
  if (env.PREVIEW_DEDUPE_WAIT_ON_FAILURE !== undefined) {
    return env.PREVIEW_DEDUPE_WAIT_ON_FAILURE === '1';
  }
  return false;
}

function canTakeOver(run, now) {
  return run?.status === 'running' && (!isPidAlive(run.driverPid) || now - Number(run.startedAt) > STATE_STALE_MS);
}

function createWaitAction(state, runId, reason, now, waitUntil = state.acceptingUntil) {
  const waitingRun = state.runs[runId];
  return {
    acceptingRemainingSec: Math.max(0, Math.ceil((waitUntil - now) / 1000)),
    activeRunId: state.activeRunId,
    kind: 'wait',
    reason,
    runId,
    waiters: waitingRun?.waiters?.length ?? 0
  };
}

function chooseAction(state, requestId, assignedRunId, windowMs, settleMs, maxSettleMs) {
  const now = Date.now();
  if (windowMs === 0) state.acceptingUntil = 0;
  if (canTakeOver(state.runs[state.activeRunId], now) || state.runs[state.activeRunId]?.status === 'completed') {
    state.activeRunId = null;
  }
  if (assignedRunId && state.runs[assignedRunId]?.status === 'completed') {
    return { kind: 'result', run: state.runs[assignedRunId] };
  }
  if (assignedRunId && state.runs[assignedRunId]?.status === 'waiting-success') {
    return createWaitAction(state, assignedRunId, 'waiting-for-success', now);
  }
  if (state.activeRunId) {
    return createWaitAction(state, assignedRunId ?? registerNextRun(state, requestId, now), 'active-run', now);
  }
  if (state.acceptingUntil > now) {
    const runId = assignedRunId ?? registerNextRun(state, requestId, now, { requireActualPreview: false });
    return createWaitAction(state, runId, 'validation-window', now);
  }
  state.acceptingUntil = 0;
  if (!assignedRunId && !state.nextRunId) {
    if (settleMs > 0) {
      const runId = registerNextRun(state, requestId, now, { maxSettleMs, notBeforeAt: now + settleMs, requireActualPreview: false });
      const run = state.runs[runId];
      return createWaitAction(state, run.runId, 'settle-window', now, run.notBeforeAt);
    }
    const run = startRun(state, requestId, now);
    return { kind: 'drive', requireActualPreview: false, runId: run.runId };
  }
  const runId = assignedRunId ?? registerNextRun(state, requestId, now, { maxSettleMs, notBeforeAt: now + settleMs });
  if (Number(state.runs[runId]?.notBeforeAt) > now) {
    return createWaitAction(state, runId, 'settle-window', now, Number(state.runs[runId].notBeforeAt));
  }
  state.runs[runId] = { ...state.runs[runId], driverPid: process.pid, driverRequestId: requestId, startedAt: now, status: 'running' };
  state.activeRunId = runId;
  if (state.nextRunId === runId) state.nextRunId = null;
  return { kind: 'drive', requireActualPreview: state.runs[runId].requireActualPreview ?? true, runId };
}

export async function runScheduledPreview({
  runtimeDir,
  target,
  runPreview,
  waitAnnouncer = createPreviewWaitAnnouncer(),
  waitOnFailure = readWaitOnFailure(),
  maxSettleMs = readMaxSettleMs(target),
  settleMs = readSettleMs(target),
  windowMs = readWindowMs(target),
  totalTimeoutMs = readTotalTimeoutMs(target, windowMs, process.env, maxSettleMs)
}) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let assignedRunId = null;
  while (true) {
    if (totalTimeoutMs > 0 && Date.now() - startedAt > totalTimeoutMs) {
      const message = `preview timed out after ${totalTimeoutMs}ms before completion`;
      await withStateLock({
        runtimeDir,
        target,
        fn: (rawState) => {
          const state = normalizeState(rawState);
          completeTimedOutRun(state, assignedRunId, message);
          return { state, value: null };
        }
      });
      await appendPreviewEvent({ event: 'request-timeout', fields: { message, runId: assignedRunId }, runtimeDir, target });
      console.error(`[${target}-preview] status: FAILED reason=${message}`);
      return 1;
    }
    const action = await withStateLock({
      runtimeDir,
      target,
      fn: (rawState) => {
        const state = normalizeState(rawState);
        const value = chooseAction(state, requestId, assignedRunId, windowMs, settleMs, maxSettleMs);
        return { state, value };
      }
    });
    assignedRunId = action.runId ?? assignedRunId;
    if (action.kind === 'result') {
      if (action.run.exitCode === 0) {
        console.log(`[${target}-preview] status: ${action.run.previewed || target === 'windows' ? 'STARTED' : 'SYNCED'}`);
      }
      return action.run.exitCode;
    }
    if (action.kind === 'wait') {
      if (waitAnnouncer.shouldAnnounce(action, assignedRunId)) {
        await appendPreviewEvent({ event: 'request-waiting', fields: action, runtimeDir, target });
        console.log(
          `[${target}-preview] request: accepted run=${assignedRunId} reason=${action.reason} remainingSec=${action.acceptingRemainingSec} activeRun=${action.activeRunId ?? 'none'} waiters=${action.waiters}`
        );
      }
      await delay(RESULT_POLL_MS);
      continue;
    }
    await appendPreviewEvent({ event: 'request-driving', fields: action, runtimeDir, target });
    console.log(`[${target}-preview] request: driver run=${assignedRunId} requireActualPreview=${action.requireActualPreview}`);
    const result = await runPreview({ requireActualPreview: action.requireActualPreview });
    await withStateLock({
      runtimeDir,
      target,
      fn: (rawState) => {
        const state = normalizeState(rawState);
        if (result.exitCode !== 0 && waitOnFailure) {
          holdRunUntilSuccess(state, assignedRunId, result);
        } else {
          completeRun(state, assignedRunId, result, windowMs);
        }
        return { state, value: null };
      }
    });
    await appendPreviewEvent({ event: 'run-completed', fields: { runId: assignedRunId, ...result }, runtimeDir, target });
    if (result.exitCode === 0 || !waitOnFailure) {
      return result.exitCode;
    }
  }
}
