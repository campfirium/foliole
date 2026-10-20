/* global console, process */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PREFLIGHT_DURATIONS_FILE = 'scripts/quality/remote-quality-preflight-durations.json';
export const PREFLIGHT_BUDGET_SECONDS = 240;
// Files measured above this stay with the remote full run instead of the local preflight.
export const PREFLIGHT_HEAVY_SECONDS = 60;
// Unlisted files measured below the recording floor, or never measured.
export const PREFLIGHT_DEFAULT_SECONDS = 2;
const RECORDING_FLOOR_SECONDS = 5;

// Windows measurements from the dev machine override the shared table on that host.
export function parsePreflightDurations(text, host = 'mac') {
  if (!text) return {};
  const table = JSON.parse(text);
  if (!table.seconds || typeof table.seconds !== 'object') {
    throw new Error(`${PREFLIGHT_DURATIONS_FILE} has no seconds map`);
  }
  return host === 'windows' ? { ...table.seconds, ...table.windowsSeconds } : table.seconds;
}

// Walks the priority-ordered entries once: known heavy files go to the remote run,
// the rest run while the estimate stays within the budget and the file cap.
export function budgetPreflightTests(entries, {
  budgetSeconds = PREFLIGHT_BUDGET_SECONDS, cap, defaultSeconds = PREFLIGHT_DEFAULT_SECONDS,
  durations = {}, heavySeconds = PREFLIGHT_HEAVY_SECONDS
}) {
  const run = [];
  const deferred = [];
  const heavy = [];
  let estimatedSeconds = 0;
  for (const entry of entries) {
    const seconds = durations[entry.file] ?? defaultSeconds;
    if (seconds > heavySeconds) {
      heavy.push(entry);
      deferred.push(entry);
    } else if (run.length >= cap || estimatedSeconds + seconds > budgetSeconds) {
      deferred.push(entry);
    } else {
      run.push(entry);
      estimatedSeconds += seconds;
    }
  }
  return { budgetSeconds, deferred, estimatedSeconds, heavy, run };
}

function reportDurations(reportPath, cwd) {
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return [];
  }
  return (report?.testResults ?? [])
    .filter(({ endTime, startTime, status }) => status === 'passed' && startTime && endTime)
    .map(({ endTime, name, startTime }) => [
      path.relative(cwd, name).split(path.sep).join('/'), (endTime - startTime) / 1000
    ]);
}

// Newer passed reports replace older measurements; files not measured again keep theirs.
export function refreshPreflightDurations({ cwd, current, reports }) {
  const seconds = { ...current };
  const ordered = [...reports].sort((left, right) => statSync(left).mtimeMs - statSync(right).mtimeMs);
  for (const report of ordered) {
    for (const [file, value] of reportDurations(report, cwd)) {
      if (file.startsWith('.') || !existsSync(path.join(cwd, file))) continue;
      if (value >= RECORDING_FLOOR_SECONDS) seconds[file] = Math.round(value);
      else delete seconds[file];
    }
  }
  return Object.fromEntries(Object.entries(seconds)
    .filter(([file]) => existsSync(path.join(cwd, file)))
    .sort(([left], [right]) => left.localeCompare(right)));
}

function runRefresh(cwd) {
  const file = path.join(cwd, PREFLIGHT_DURATIONS_FILE);
  const current = JSON.parse(readFileSync(file, 'utf8'));
  const reportDir = path.join(cwd, '.tmp', 'vitest');
  const reports = readdirSync(reportDir).filter((name) => name.endsWith('.json'))
    .map((name) => path.join(reportDir, name));
  const seconds = refreshPreflightDurations({ cwd, current: current.seconds, reports });
  writeFileSync(file, `${JSON.stringify({ ...current, seconds }, null, 2)}\n`);
  console.log(`[remote-preflight-budget] recorded ${Object.keys(seconds).length} file(s) from ${reports.length} report(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv[2] !== 'refresh') {
    console.error('Usage: node scripts/quality/remote-quality-preflight-budget.mjs refresh');
    process.exitCode = 1;
  } else {
    runRefresh(process.cwd());
  }
}
