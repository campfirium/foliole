#!/usr/bin/env node
/* global console, process */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { STATE_STALE_MS } from './preview-dedupe-scheduler.mjs';

const DEFAULT_RUNTIME_DIR = '.lab/internal/runtime';
const DEFAULT_TARGET = 'windows';
const PROCESS_PATTERN = /preview-dedupe|windows-preview|android-preview|windows-restart-client|codex-task|codex exec/u;
const WINDOWS_STATUS_SOURCE = 'official-windows-mirror:D:\\C\\foliole';

function parseArgs(argv) {
  const options = {
    runtimeDir: process.env.PREVIEW_DEDUPE_RUNTIME_DIR ?? DEFAULT_RUNTIME_DIR,
    target: DEFAULT_TARGET,
    windowsStatus: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--target') {
      options.target = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (value === '--runtime-dir') {
      options.runtimeDir = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (value === '--no-windows-status') {
      options.windowsStatus = false;
      continue;
    }
    throw new Error(`unsupported argument: ${value}`);
  }
  if (!['android', 'windows'].includes(options.target)) {
    throw new Error('--target must be android or windows');
  }
  return options;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  try {
    return Number.isInteger(pid) && process.kill(pid, 0);
  } catch {
    return false;
  }
}

function compactRun(run, now = Date.now()) {
  if (!run) {
    return null;
  }
  return {
    ageSec: run.startedAt ? Math.max(0, Math.round((now - Number(run.startedAt)) / 1000)) : null,
    completedAt: run.completedAt ?? null,
    driverPid: run.driverPid ?? null,
    driverPidAlive: run.driverPid ? isPidAlive(Number(run.driverPid)) : null,
    exitCode: run.exitCode ?? null,
    hash: typeof run.hash === 'string' ? run.hash.slice(0, 12) : null,
    lastExitCode: run.lastExitCode ?? null,
    previewed: run.previewed ?? null,
    runId: run.runId ?? null,
    startedAt: run.startedAt ?? null,
    status: run.status ?? 'unknown',
    waiters: Array.isArray(run.waiters) ? run.waiters.length : 0
  };
}

export function summarizePreviewState(rawState, now = Date.now()) {
  const state = rawState && typeof rawState === 'object' ? rawState : {};
  const runs = state.runs && typeof state.runs === 'object' ? state.runs : {};
  const sortedRuns = Object.values(runs).sort(
    (left, right) => Number(left.startedAt ?? left.createdAt ?? 0) - Number(right.startedAt ?? right.createdAt ?? 0)
  );
  return {
    acceptingRemainingSec: Math.max(0, Math.ceil((Number(state.acceptingUntil) - now) / 1000)),
    activeRun: compactRun(runs[state.activeRunId], now),
    activeRunId: state.activeRunId ?? null,
    nextRun: compactRun(runs[state.nextRunId], now),
    nextRunId: state.nextRunId ?? null,
    recentRuns: sortedRuns.slice(-8).map((run) => compactRun(run, now)),
    staleRunningRuns: sortedRuns
      .filter((run) => run.status === 'running' && run.runId !== state.activeRunId)
      .map((run) => compactRun(run, now)),
    totalRuns: sortedRuns.length
  };
}

function readProcessSnapshot() {
  try {
    return execFileSync('ps', ['-eo', 'pid,ppid,etime,command'], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => PROCESS_PATTERN.test(line) && !line.includes('preview-dedupe-diagnostics'))
      .map((line) => line.trim());
  } catch {
    return [];
  }
}

function readWindowsStatus() {
  const result = spawnSync('bash', ['scripts/windows/windows-restart-client.sh'], {
    encoding: 'utf8',
    env: { ...process.env, WINDOWS_CLIENT_ACTION: 'status' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim()
  };
}

export async function buildDiagnostics(options, now = Date.now()) {
  const statePath = path.resolve(options.runtimeDir, `${options.target}-preview.state.json`);
  const hashPath = path.resolve(options.runtimeDir, `${options.target}-preview.hash`);
  const [state, hash] = await Promise.all([
    readJson(statePath),
    readFile(hashPath, 'utf8').then((value) => value.trim()).catch(() => '')
  ]);
  return {
    hash: hash ? hash.slice(0, 12) : null,
    processSnapshot: readProcessSnapshot(),
    state: summarizePreviewState(state, now),
    statePath,
    target: options.target,
    windowsStatus: options.target === 'windows' && options.windowsStatus ? readWindowsStatus() : null
  };
}

function extractWindowsStatusLine(windowsStatus) {
  return windowsStatus?.stdout
    ?.split('\n')
    .find((line) => line.includes('[windows-restart-client] status:'))
    ?.replace('[windows-restart-client] ', '') ?? null;
}

function classifyWindowsStatus(windowsStatus, windowsLine) {
  if (!windowsStatus) {
    return { nextAction: null, verdict: null };
  }
  if ((typeof windowsStatus.exitCode === 'number' && windowsStatus.exitCode !== 0) || !windowsLine) {
    return {
      nextAction: 'Inspect preview diagnostics; the official Windows mirror status source is unavailable.',
      verdict: 'Official Windows mirror status is unavailable, so startup state is not confirmed.'
    };
  }
  if (/\bRUNNING\b/u.test(windowsLine) && /\bresponding=False\b/u.test(windowsLine)) {
    return {
      nextAction: 'Run npm run windows:preview to re-check the official Windows client.',
      verdict: 'Official Windows mirror client is running but not responding.'
    };
  }
  if (/\bRUNNING\b/u.test(windowsLine) && /\btrust=OK\b/u.test(windowsLine)) {
    return {
      nextAction: 'No startup repair is needed; run npm run windows:preview after changes that need preview.',
      verdict: 'Official Windows mirror client is running and trusted.'
    };
  }
  if (/\bSTOPPED\b/u.test(windowsLine) && /\breason=no-runtime\b/u.test(windowsLine)) {
    return {
      nextAction: 'Run npm run windows:preview; it will sync, verify prerequisites, and use fallback-start.',
      verdict: 'No trusted official Windows mirror client is running; this is no-runtime, not a confirmed code startup crash.'
    };
  }
  return {
    nextAction: 'Run npm run windows:preview to re-check the official Windows client.',
    verdict: 'Official Windows mirror client is not trusted; startup failure is not yet classified.'
  };
}

function summarizeStaleRuns(staleRunningRuns) {
  const staleAgeSec = Math.ceil(STATE_STALE_MS / 1000);
  const staleDeadCount = staleRunningRuns.filter((run) => run.driverPidAlive === false).length;
  const staleAgedCount = staleRunningRuns.filter((run) => run.driverPidAlive === true && run.ageSec >= staleAgeSec).length;
  const staleExplanation = staleDeadCount > 0
    ? 'Dead stale preview records will not continue and do not block a new windows:preview.'
    : null;
  return { staleAgedCount, staleDeadCount, staleExplanation };
}

export function formatDiagnosticsSummary(diagnostics) {
  const state = diagnostics.state;
  const windowsLine = extractWindowsStatusLine(diagnostics.windowsStatus);
  const windowsClassification = classifyWindowsStatus(diagnostics.windowsStatus, windowsLine);
  const staleSummary = summarizeStaleRuns(state.staleRunningRuns);
  return {
    acceptingRemainingSec: state.acceptingRemainingSec,
    active: state.activeRun
      ? {
          ageSec: state.activeRun.ageSec,
          pid: state.activeRun.driverPid,
          pidAlive: state.activeRun.driverPidAlive,
          runId: state.activeRun.runId,
          status: state.activeRun.status
        }
      : null,
    hash: diagnostics.hash,
    next: state.nextRun ? { runId: state.nextRun.runId, status: state.nextRun.status, waiters: state.nextRun.waiters } : null,
    processCount: diagnostics.processSnapshot.length,
    ...staleSummary,
    staleRunningCount: state.staleRunningRuns.length,
    target: diagnostics.target,
    windowsStatus: windowsLine,
    windowsStatusNextAction: windowsClassification.nextAction,
    windowsStatusSource: diagnostics.target === 'windows' ? WINDOWS_STATUS_SOURCE : null,
    windowsStatusVerdict: windowsClassification.verdict
  };
}

async function run() {
  const diagnostics = await buildDiagnostics(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({ ...diagnostics, summary: formatDiagnosticsSummary(diagnostics) }, null, 2));
}

if (process.argv[1]?.endsWith('preview-dedupe-diagnostics.mjs')) {
  await run().catch((error) => {
    console.error(`[preview-dedupe-diagnostics] ${error.message}`);
    process.exitCode = 1;
  });
}
