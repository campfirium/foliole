#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { normalizeSpawnCommand } from './lib/spawn-command.mjs';
import { maintenanceExitCode, maintenanceSteps, parseMaintenanceArgs } from './system-integration-maintenance-plan.mjs';
import { readVitestReport, validateExpectedTestFiles } from './vitest-report-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git_failed:${args[0]}`);
  return result.stdout;
}

function snapshot(out, label) {
  const files = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0').filter((file) => /\.(?:[cm]?js|tsx?|json|ya?ml)$/.test(file)).sort();
  const hashes = Object.fromEntries(files.map((file) => [file, existsSync(path.join(root, file))
    ? createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex') : null]));
  const state = { revision: git(['rev-parse', 'HEAD']).trim(), hashes };
  writeFileSync(path.join(out, `${label}.json`), JSON.stringify(state, null, 2));
  return state;
}

function preserveChanges(out) {
  writeFileSync(path.join(out, 'workspace.patch'), git(['diff', 'HEAD', '--binary']));
  writeFileSync(path.join(out, 'workspace-status.txt'), git(['status', '--short']));
  const files = git(['ls-files', '-z', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  for (const file of files.filter((name) => /\.(?:[cm]?js|tsx?|json|ya?ml)$/.test(name))) {
    const target = path.join(out, 'untracked-source', file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(root, file), target);
  }
}

function createOutput(id) {
  const parent = path.join(root, '.tmp/artifacts/system-integration');
  mkdirSync(parent, { recursive: true });
  const out = path.join(realpathSync(parent), id);
  mkdirSync(out); // Existing evidence must never be overwritten.
  return out;
}

function runStep(step, out) {
  const startedAt = new Date().toISOString();
  const log = path.join(out, `${step.name}.log`);
  const fd = openSync(log, 'wx');
  let result;
  try {
    const command = normalizeSpawnCommand(['npm', ...step.args]);
    result = spawnSync(command.bin, command.args, {
      cwd: root, env: process.env, stdio: ['ignore', fd, fd],
      timeout: 60 * 60 * 1000
    });
  } finally { closeSync(fd); }
  const record = { name: step.name, command: ['npm', ...step.args], startedAt,
    finishedAt: new Date().toISOString(), exitCode: result.status ?? 1,
    signal: result.signal, error: result.error?.message ?? null, log };
  try {
    const report = path.resolve(root, step.report);
    if (existsSync(report) && Date.parse(startedAt) <= statSync(report).mtimeMs) {
      const target = path.join(out, `${step.name}.report.json`);
      copyFileSync(report, target);
      record.report = target;
    }
  } catch (error) {
    record.error = error.message;
    record.exitCode = 1;
  }
  checkReport(step, record);
  return record;
}

function checkReport(step, record) {
  const report = record.report ? readVitestReport(record.report) : null;
  if (step.name === 'sync') {
    if (!report?.results?.length || report.results.some((result) => result.status !== 'passed')) {
      record.error = 'sync_report_missing_or_failed';
      record.exitCode = 1;
    }
    return;
  }
  if (!report || !validateExpectedTestFiles(report,
    JSON.stringify(step.args.slice(3).map((file) => path.join(root, file)))) ||
    report.numPendingTests > 0 || report.numTodoTests > 0 || report.numFailedTests > 0) {
    record.error = 'test_report_missing_mismatched_or_skipped';
    record.exitCode = 1;
  }
}

function main() {
  const options = parseMaintenanceArgs(process.argv.slice(2));
  if (options.list) {
    process.stdout.write(JSON.stringify(maintenanceSteps(options.scope, '<output>'), null, 2) + '\n');
    return;
  }
  const out = createOutput(options.id);
  const before = snapshot(out, 'source-before');
  preserveChanges(out);
  const results = [];
  for (const step of maintenanceSteps(options.scope, out)) {
    process.stdout.write(`Running ${step.name}; log: ${path.join(out, `${step.name}.log`)}\n`);
    results.push(runStep(step, out));
    writeFileSync(path.join(out, 'progress.json'), JSON.stringify(results, null, 2));
  }
  const after = snapshot(out, 'source-after');
  const sourceStable = JSON.stringify(before) === JSON.stringify(after);
  const changedPaths = Object.keys({ ...before.hashes, ...after.hashes })
    .filter((file) => before.hashes[file] !== after.hashes[file]);
  const exitCode = maintenanceExitCode(results, sourceStable);
  const summary = { options, output: out, revision: before.revision, sourceStable, changedPaths, results, exitCode,
    boundary: 'Isolated SQLite and local HTTP regression; native UI/OS acceptance is separate.' };
  writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exitCode = exitCode;
}

try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
