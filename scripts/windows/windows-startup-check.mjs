#!/usr/bin/env node
/* global console, process */

import { appendFile, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCapture } from './windows-client-native-process.mjs';
import { readClientState } from './windows-client-native-state.mjs';
import { resolveWindowsNativePaths } from './windows-native-paths.mjs';
import { buildStartupReport, resolveStartupBudgets } from './windows-startup-report.mjs';

async function readText(filePath) {
  if (!filePath) return '';
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export async function readBootEvents(eventLogFile, session) {
  const text = await readText(eventLogFile);
  return text.split(/\r?\n/u)
    .filter(Boolean)
    .map(parseJsonLine)
    .filter((event) => event?.session === session);
}

async function latestEventSession(eventLogFile) {
  const text = await readText(eventLogFile);
  const events = text.split(/\r?\n/u)
    .filter(Boolean)
    .map(parseJsonLine)
    .filter((event) => event?.session && event?.stage === 'boot_start');
  return events.at(-1)?.session ?? null;
}

async function findSessionStdoutLog(logDir, session) {
  const files = await readdir(logDir).catch(() => []);
  const match = files.find((file) => file === `${session}.out.log`);
  return match ? path.join(logDir, match) : null;
}

export async function analyzeStartupSession({ budgets, paths, session }) {
  const events = await readBootEvents(paths.bootEventLogFile, session);
  const state = readClientState(paths.stateFile);
  const stdoutLog = state?.session === session ? state.stdoutLog : await findSessionStdoutLog(paths.logDir, session);
  const stdout = await readText(stdoutLog);
  return buildStartupReport({ budgets, events, session, stdout });
}

async function latestSession(paths, preferBootEventLog) {
  if (preferBootEventLog) {
    const session = await latestEventSession(paths.bootEventLogFile);
    if (session) return session;
  }
  const state = readClientState(paths.stateFile);
  if (state?.session) return state.session;
  const files = await readdir(paths.logDir).catch(() => []);
  const stats = await Promise.all(files.filter((file) => file.endsWith('.out.log')).map(async (file) => ({
    file,
    mtimeMs: (await stat(path.join(paths.logDir, file))).mtimeMs
  })));
  stats.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return stats[0]?.file.replace(/\.out\.log$/u, '') ?? null;
}

function formatTopResources(resources) {
  return resources.slice(0, 5).map((item) => `${item.durationMs}ms:${item.name}`).join(', ');
}

function printReport(report) {
  const { postReadyActivity, stdoutTiming, timings } = report;
  console.log(`[windows-startup-check] session=${report.session}`);
  console.log(`[windows-startup-check] vite_ready_ms=${stdoutTiming.viteReadyMs ?? 'unknown'}`);
  console.log(`[windows-startup-check] prewarm_ms=${stdoutTiming.prewarmTotalMs ?? stdoutTiming.prewarmTimeoutMs ?? 'unknown'} status=${stdoutTiming.prewarmFinalStatus ?? stdoutTiming.prewarmLaunchStatus ?? 'unknown'}`);
  console.log(`[windows-startup-check] window_visible_ms=${timings.window_visible ?? 'unknown'} main_window_ready_ms=${timings.main_window_ready ?? 'unknown'} bridge_ready_ms=${timings.bridge_ready ?? 'unknown'} app_ready_ms=${timings.app_ready ?? 'unknown'} app_responsive_ms=${timings.app_responsive ?? 'unknown'}`);
  console.log(`[windows-startup-check] post_ready_window_ms=${postReadyActivity.windowMs} hydrate_count=${postReadyActivity.hydrateCount} long_background_tasks=${postReadyActivity.longBackgroundTasks.length}`);
  for (const task of postReadyActivity.longBackgroundTasks.slice(0, 5)) {
    console.log(`[windows-startup-check] long_background_task duration_ms=${task.durationMs} label=${task.label}`);
  }
  if (report.resources.length > 0) {
    console.log(`[windows-startup-check] top_resources=${formatTopResources(report.resources)}`);
  }
  if (report.missingTimings.length > 0) {
    console.error(`[windows-startup-check] analysis: startup timing incomplete missing=${report.missingTimings.join(',')}`);
    console.error('[windows-startup-check] analysis: missing timings mean the startup marker chain was not sampled, so this run cannot prove startup performance.');
  }
  if (report.failures.length > 0) {
    console.error('[windows-startup-check] analysis: startup budget failed');
    for (const failure of report.failures) console.error(`[windows-startup-check] analysis: ${failure}`);
    console.error('[windows-startup-check] analysis: prewarm failures point to Vite resource transform; app_ready or bridge_ready failures point to renderer import/hydrate/runtime bridge work.');
  }
  console.log(`[windows-startup-check] status: ${report.status}`);
}

async function appendHistory(paths, report) {
  await appendFile(
    path.join(paths.repoRoot, '.tmp', 'windows-startup-history.ndjson'),
    `${JSON.stringify({ ...report, checkedAt: new Date().toISOString() })}\n`,
    'utf8'
  ).catch(() => {});
}

async function maybeRestart(paths, argv) {
  if (!argv.includes('--full-restart')) return;
  const result = await runCapture(process.execPath, [paths.clientScript, 'full-restart'], {
    cwd: paths.repoRoot,
    timeoutMs: Number.parseInt(process.env.FOLIOLE_STARTUP_CHECK_RESTART_TIMEOUT_MS ?? '180000', 10)
  });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
  if (result.code !== 0) throw new Error(`full restart failed code=${result.code}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const paths = resolveWindowsNativePaths();
  const logArg = argv.indexOf('--log');
  if (logArg >= 0 && argv[logArg + 1]) {
    paths.bootEventLogFile = argv[logArg + 1];
  }
  await maybeRestart(paths, argv);
  const sessionArg = argv.indexOf('--session');
  const session = sessionArg >= 0 ? argv[sessionArg + 1] : await latestSession(paths, logArg >= 0);
  if (!session) throw new Error('no windows native startup session found');
  const report = await analyzeStartupSession({ budgets: resolveStartupBudgets(process.env), paths, session });
  printReport(report);
  await appendHistory(paths, report);
  if (report.status !== 'PASSED' && !argv.includes('--warn-only')) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[windows-startup-check] status: FAILED reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
