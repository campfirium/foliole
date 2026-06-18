#!/usr/bin/env node
/* global console, process */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_LOG_ROOT = path.join('.tmp', 'logs', 'quality-gate');
const TELEMETRY_FILE = 'telemetry.jsonl';

function parseArgs(argv) {
  const args = { runDir: '', logRoot: process.env.QUALITY_GATE_LOG_ROOT || DEFAULT_LOG_ROOT, limit: 10 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--run-dir') {
      args.runDir = argv[++index] ?? '';
    } else if (arg === '--log-root') {
      args.logRoot = argv[++index] ?? '';
    } else if (arg === '--limit') {
      args.limit = Number(argv[++index] ?? '10');
    } else {
      args.runDir = arg;
    }
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    args.limit = 10;
  }
  return args;
}

export function resolveLatestRunDir(logRoot) {
  if (!existsSync(logRoot)) {
    return '';
  }
  const runDirs = readdirSync(logRoot)
    .map((entry) => path.join(logRoot, entry))
    .filter((entryPath) => statSync(entryPath).isDirectory())
    .sort((left, right) => right.localeCompare(left));
  return runDirs.find((runDir) => {
    const telemetryPath = path.join(runDir, TELEMETRY_FILE);
    return existsSync(telemetryPath) && statSync(telemetryPath).size > 0;
  }) ?? runDirs[0] ?? '';
}

export function readTelemetryEntries(runDir) {
  const telemetryPath = path.join(runDir, TELEMETRY_FILE);
  if (!existsSync(telemetryPath)) {
    return { telemetryPath, entries: [] };
  }
  const entries = readFileSync(telemetryPath, 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { telemetryPath, entries };
}

function formatSeconds(value) {
  return `${Number(value).toFixed(1)}s`;
}

function sumDurations(entries) {
  return entries.reduce((total, entry) => total + Number(entry.durationSeconds || 0), 0);
}

export function buildQualityGateCostReport(runDir, entries, limit = 10) {
  const sorted = [...entries].sort((left, right) => Number(right.durationSeconds || 0) - Number(left.durationSeconds || 0));
  const failed = entries.filter((entry) => Number(entry.exitCode) !== 0);
  const lines = [
    '[quality-gate-cost] report',
    `[quality-gate-cost] run: ${runDir}`,
    `[quality-gate-cost] steps: ${entries.length}`,
    `[quality-gate-cost] summed step duration: ${formatSeconds(sumDurations(entries))}`
  ];

  if (entries.length === 0) {
    lines.push('[quality-gate-cost] no telemetry entries found.');
    lines.push('[quality-gate-cost] run a quality gate with the current scripts, or pass --run-dir to an existing telemetry run.');
    return lines.join('\n');
  }

  lines.push(`[quality-gate-cost] failed steps: ${failed.length}`);
  lines.push(`[quality-gate-cost] slowest steps: top ${Math.min(limit, sorted.length)}`);
  for (const [index, entry] of sorted.slice(0, limit).entries()) {
    const status = Number(entry.exitCode) === 0 ? 'passed' : `failed(${entry.exitCode})`;
    lines.push(
      `${index + 1}. ${entry.prefix} ${entry.scriptName} ${formatSeconds(entry.durationSeconds)} peak=${entry.peakRssKb}KiB status=${status}`
    );
  }
  lines.push('[quality-gate-cost] benefit review candidates: inspect the slowest steps above against future failure summaries.');
  return lines.join('\n');
}

export function runReport(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const runDir = args.runDir || resolveLatestRunDir(args.logRoot);
  if (!runDir) {
    console.log('[quality-gate-cost] no quality gate log runs found.');
    return 0;
  }
  const { entries } = readTelemetryEntries(runDir);
  console.log(buildQualityGateCostReport(runDir, entries, args.limit));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/quality/quality-gate-cost-report.mjs')) {
  process.exitCode = runReport();
}
