#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { pruneMacosA5BuildTemplates } from '../android/macos-a5-build-template.mjs';
import { newestWriteMs, runCleanup } from '../diagnostics/cleanup-local-artifacts.mjs';
import { CACHE_RETENTION_DAYS, REGISTERED_ARTIFACT_CATEGORIES, runRetention } from '../diagnostics/local-artifact-cache-retention.mjs';
import {
  DAY_MS, classifyArtifacts, closedTaskStep, diskUsageBytes, purgeQuarantine, quarantineEntries,
  readCodeReferences, readLedgerContext, tasksOverCap
} from './scheduled-disk-cleanup-steps.mjs';
import { pruneOldReports, writeReport } from './scheduled-disk-cleanup-report.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

export function cleanupConfig({ homeDirectory = os.homedir(), repoRoot = REPO_ROOT } = {}) {
  const artifactsRoot = path.join(repoRoot, '.tmp/artifacts');
  const controller = path.join(repoRoot, '.lab/internal/macos-a5-controller');
  return {
    a5LeasePath: path.join(controller, 'leases/fixed-a5'),
    artifactsRoot,
    closedHelper: path.join(homeDirectory, '.codex/skills/foliole-local-cleanup/scripts/closed_task_artifacts.py'),
    helperInterpreter: 'python3',
    helperReportRoot: path.join(artifactsRoot, 'local-cleanup'),
    internalVolume: '/',
    quarantineRoot: path.join(repoRoot, '.tmp/cleanup-quarantine'),
    repoRoot,
    reportRoot: path.join(artifactsRoot, 'local-cleanup/scheduled'),
    templateRoots: ['/Volumes/UD/Foliole/a5-build/build-templates', path.join(controller, 'build-templates')],
    udVolume: '/Volumes/UD'
  };
}

export function freeBytes(directory) {
  const stats = fs.statfsSync(directory);
  return Number(stats.bavail) * Number(stats.bsize);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || `${command} failed`).trim());
  return result.stdout.trim();
}

function worktreeStep(config, apply) {
  const node = process.execPath;
  const lifecycle = path.join(REPO_ROOT, 'scripts/diagnostics/transient-worktree-lifecycle.mjs');
  const before = run('git', ['-C', config.repoRoot, 'worktree', 'prune', '--dry-run', '-v'], config.repoRoot);
  if (!apply) return { pruneCandidates: before.split('\n').filter(Boolean), status: 'complete', summary: '预览' };
  const sweep = JSON.parse(run(node, [lifecycle, 'sweep', '--repo', config.repoRoot], config.repoRoot));
  run('git', ['-C', config.repoRoot, 'worktree', 'prune'], config.repoRoot);
  const pruned = before.split('\n').filter(Boolean);
  return { pruned, status: sweep.ok ? 'complete' : 'failed', sweep,
    ...(sweep.ok ? {} : { error: JSON.stringify(sweep.failures) }),
    summary: `删除 ${sweep.removed.length} 个，收回 ${pruned.length} 条失效登记` };
}

function templateStep(config, apply) {
  const removed = [];
  for (const root of config.templateRoots.filter((entry) => fs.existsSync(entry))) {
    const planned = pruneMacosA5BuildTemplates(root, { fsApi: { ...fs, rmSync: () => {} } });
    const sizes = diskUsageBytes(planned.map((name) => path.join(root, name)));
    if (apply) pruneMacosA5BuildTemplates(root);
    removed.push(...planned.map((name) => ({ bytes: sizes.get(path.join(root, name)) ?? 0, path: path.join(root, name) })));
  }
  const bytes = removed.reduce((total, item) => total + item.bytes, 0);
  return { bytes, removed, status: 'complete', summary: `${removed.length} 个` };
}

function retentionSteps(config, apply, nowMs) {
  const loose = runCleanup({ apply, days: 7, dryRun: !apply, nowMs, rootDir: config.repoRoot, roots: ['.tmp', 'logs'] });
  const runs = runRetention({ apply, categories: REGISTERED_ARTIFACT_CATEGORIES, nowMs, rootDir: config.repoRoot, scope: 'artifact' });
  const runBytes = runs.entries.reduce((total, entry) => total + entry.sizeBytes, 0);
  const cutoff = nowMs - CACHE_RETENTION_DAYS * DAY_MS;
  const stale = runRetention({ maxCacheBytes: Infinity, nowMs, rootDir: config.repoRoot, scope: 'cache' }).entries
    .filter((entry) => newestWriteMs(entry.path, cutoff) <= cutoff);
  if (apply) for (const entry of stale) fs.rmSync(entry.path, { force: true, recursive: true });
  const cacheRemoved = stale.map((entry) => ({ bytes: entry.sizeBytes, path: entry.path }));
  return {
    cache: { removed: cacheRemoved, status: 'complete', summary: `${cacheRemoved.length} 项` },
    registeredRuns: { bytes: runBytes, paths: runs.entries.map((entry) => entry.path), status: runs.ok ? 'complete' : 'failed',
      ...(runs.ok ? {} : { error: JSON.stringify(runs.failures) }), summary: `${runs.entries.length} 项` },
    tmpLoose: { bytes: loose.totalBytes, paths: loose.entries.map((entry) => entry.path), status: 'complete',
      summary: `${loose.entries.length} 项` }
  };
}

function artifactSteps(config, apply, nowMs) {
  const ledger = readLedgerContext(config.repoRoot);
  const purged = purgeQuarantine({ apply, nowMs, quarantineRoot: config.quarantineRoot });
  const codeReferences = readCodeReferences(config.repoRoot);
  const classified = classifyArtifacts({ artifactsRoot: config.artifactsRoot, codeReferences, ledger, nowMs });
  const sizes = diskUsageBytes([...classified.owned, ...classified.quarantine, ...classified.kept].map((entry) => entry.path));
  const moved = quarantineEntries({ apply, entries: classified.quarantine, nowMs, quarantineRoot: config.quarantineRoot, sizes });
  const withSize = (entry) => ({ ...entry, bytes: sizes.get(entry.path) ?? 0 });
  return {
    kept: classified.kept.map(withSize),
    overCap: tasksOverCap(classified.owned, sizes),
    ownedNotClosed: classified.owned.filter((entry) => entry.status !== 'closed').map(withSize),
    quarantine: { moved, status: 'complete', summary: `${moved.length} 项` },
    quarantinePurge: { removed: purged, status: 'complete', summary: `${purged.length} 批` }
  };
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// One cleanup round. Applying requires the exclusive resource gate; the A5 lease stops the round between steps.
export function runRound({ config = cleanupConfig(), env = process.env, nowMs = Date.now(), preview = false, reasons = [] } = {}) {
  const apply = !preview;
  if (apply && !String(env.FOLIOLE_RESOURCE_GATE_HELD ?? '').split(',').includes('exclusive')) {
    throw new Error('Applying a cleanup round requires scripts/with-resource-gate.mjs exclusive.');
  }
  const free = () => ({ internal: freeBytes(config.internalVolume), ud: freeBytes(config.udVolume) });
  const report = { free: { before: free() }, preview, reasons, startedAt: new Date(nowMs).toISOString(), steps: {} };
  const plan = [
    ['closedTasks', () => closedTaskStep({ apply, helper: config.closedHelper, interpreter: config.helperInterpreter, nowMs, sleep })],
    ['worktrees', () => worktreeStep(config, apply)],
    ['templates', () => templateStep(config, apply)],
    ['retention', () => retentionSteps(config, apply, nowMs)],
    ['artifacts', () => artifactSteps(config, apply, nowMs)]
  ];
  for (const [name, step] of plan) {
    if (apply && fs.existsSync(config.a5LeasePath)) { report.interruptedBy = 'A5 设备锁被占用'; break; }
    try {
      const outcome = step();
      if (name === 'retention') Object.assign(report.steps, outcome);
      else if (name === 'artifacts') {
        const { kept, overCap, ownedNotClosed, ...steps } = outcome;
        Object.assign(report.steps, steps);
        Object.assign(report, { kept, overCap, ownedNotClosed });
      } else {
        report.steps[name] = { ...outcome, ...(name === 'closedTasks' && outcome.status === 'complete'
          ? { summary: `${outcome.removed.length} 个任务，跳过 24 小时内有写入的 ${outcome.skippedRecent.length} 个` } : {}) };
      }
    } catch (error) {
      report.steps[name] = { error: error.message, status: 'failed' };
    }
  }
  if (apply) report.prunedReports = pruneOldReports({ helperReportRoot: config.helperReportRoot, nowMs, reportRoot: config.reportRoot });
  report.free.after = free();
  report.finishedAt = new Date().toISOString();
  const failed = Object.values(report.steps).some((step) => step.status === 'failed');
  report.status = report.interruptedBy ? 'interrupted' : failed ? 'failed' : 'complete';
  return writeReport(config.reportRoot, report, nowMs);
}

function main(args = process.argv.slice(2)) {
  const reasonIndex = args.indexOf('--reason');
  const reasons = reasonIndex >= 0 ? args[reasonIndex + 1].split(',').filter(Boolean) : [];
  if (args[0] === 'round') {
    const report = runRound({ preview: args.includes('--preview'), reasons });
    console.log(JSON.stringify({ report: report.reportPath, status: report.status }));
    return report.status === 'failed' ? 1 : 0;
  }
  throw new Error('Usage: scheduled-disk-cleanup.mjs round [--preview] [--reason <list>]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
