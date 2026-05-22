/* global console, process */

import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { appendPreviewEvent } from './preview-dedupe-event-log.mjs';
import { isPidAlive, withStateLock } from './preview-dedupe-state-store.mjs';
import { createPreviewWaitAnnouncer } from './preview-dedupe-wait-status.mjs';

const DEFAULT_WINDOW_MS = { android: 0, windows: 3 * 60_000 }, RESULT_POLL_MS = 200;
const STATE_STALE_MS = 15 * 60_000;

function readDurationMs(env, key, defaultValue) {
  const rawValue = env[key];
  if (rawValue === undefined) {
    return defaultValue;
  }
  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return parsedValue;
}

export function readWindowMs(target, env = process.env) {
  return readDurationMs(
    env,
    `PREVIEW_DEDUPE_${target.toUpperCase()}_WINDOW_MS`,
    readDurationMs(env, `PREVIEW_DEDUPE_${target.toUpperCase()}_COOLDOWN_MS`, DEFAULT_WINDOW_MS[target] ?? 0)
  );
}

export function shouldForcePreview(env = process.env) {
  return env.PREVIEW_DEDUPE_FORCE === '1';
}

function readWaitOnFailure(target, env = process.env) {
  if (env.PREVIEW_DEDUPE_WAIT_ON_FAILURE !== undefined) {
    return env.PREVIEW_DEDUPE_WAIT_ON_FAILURE === '1';
  }
  return false;
}

function canTakeOver(run, now) {
  return run?.status === 'running' && (!isPidAlive(run.driverPid) || now - Number(run.startedAt) > STATE_STALE_MS);
}

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

function createPendingRun(requestId, now) {
  return {
    createdAt: now,
    runId: randomUUID(),
    status: 'pending',
    waiters: [requestId]
  };
}

function normalizeState(state) {
  return {
    acceptingUntil: Number(state.acceptingUntil) || 0,
    activeRunId: state.activeRunId ?? null,
    nextRunId: state.nextRunId ?? null,
    runs: state.runs && typeof state.runs === 'object' ? state.runs : {}
  };
}

function completeRun(state, runId, result, windowMs) {
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
  if (result.exitCode === 0) {
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
  if (state.activeRunId === runId) {
    state.activeRunId = null;
  }
  state.acceptingUntil = result.exitCode === 0 && result.previewed ? now + windowMs : 0;
}

function holdRunUntilSuccess(state, runId, result) {
  const now = Date.now();
  state.runs[runId] = {
    ...state.runs[runId],
    failedAt: now,
    lastExitCode: result.exitCode,
    lastHash: result.hash,
    status: 'waiting-success'
  };
  if (state.activeRunId === runId) {
    state.activeRunId = null;
  }
  state.acceptingUntil = 0;
}

function registerNextRun(state, requestId, now) {
  if (!state.nextRunId) {
    const run = createPendingRun(requestId, now);
    state.nextRunId = run.runId;
    state.runs[run.runId] = run;
    return run.runId;
  }
  state.runs[state.nextRunId].waiters.push(requestId);
  return state.nextRunId;
}

function createWaitAction(state, runId, reason, now) {
  const waitingRun = state.runs[runId];
  return {
    acceptingRemainingSec: Math.max(0, Math.ceil((state.acceptingUntil - now) / 1000)),
    activeRunId: state.activeRunId,
    kind: 'wait',
    reason,
    runId,
    waiters: waitingRun?.waiters?.length ?? 0
  };
}

function chooseAction(state, requestId, assignedRunId, windowMs) {
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
    return createWaitAction(state, assignedRunId ?? registerNextRun(state, requestId, now), 'validation-window', now);
  }
  state.acceptingUntil = 0;
  if (!assignedRunId && !state.nextRunId) {
    const run = createRun(requestId, now);
    state.runs[run.runId] = run;
    state.activeRunId = run.runId;
    return { kind: 'drive', requireActualPreview: false, runId: run.runId };
  }
  const runId = assignedRunId ?? registerNextRun(state, requestId, now);
  state.runs[runId] = { ...state.runs[runId], driverPid: process.pid, driverRequestId: requestId, startedAt: now, status: 'running' };
  state.activeRunId = runId;
  if (state.nextRunId === runId) state.nextRunId = null;
  return { kind: 'drive', requireActualPreview: true, runId };
}

export async function runScheduledPreview({
  runtimeDir,
  target,
  runPreview,
  waitAnnouncer = createPreviewWaitAnnouncer(),
  waitOnFailure = readWaitOnFailure(target),
  windowMs = readWindowMs(target)
}) {
  const requestId = randomUUID();
  let assignedRunId = null;
  while (true) {
    const action = await withStateLock({
      runtimeDir,
      target,
      fn: (rawState) => {
        const state = normalizeState(rawState);
        const value = chooseAction(state, requestId, assignedRunId, windowMs);
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
