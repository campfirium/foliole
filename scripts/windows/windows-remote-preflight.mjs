#!/usr/bin/env node
/* global console, process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runRelatedTests } from '../quality/quality-fast-related-tests.mjs';
import { planPreflightSelection } from '../quality/remote-quality-preflight-plan.mjs';
import { executeBounded } from './windows-bounded-process.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';
import { ensureWindowsPreflightDependencies } from './windows-remote-preflight-dependencies.mjs';

export const WINDOWS_REMOTE_PREFLIGHT_ACTION = 'remote-preflight';
const SHA = /^[0-9a-f]{40}$/u;
const TEST_TIMEOUT_MS = 40 * 60_000;
const REPORTS = ['.tmp/vitest/related.json', '.tmp/vitest/related-electron.json'];

function stageError(stage, message, extra = {}) {
  return Object.assign(new Error(message), { stage, ...extra });
}

function gitRunner(execute, paths) {
  return (command, args) => execute(command, args, {
    cwd: paths.repoRoot, timeoutCode: 'git_timeout', timeoutMs: 120_000, windowsHide: true
  });
}

async function git(run, paths, args, stage) {
  const result = await run(paths.gitPath, args);
  if (result.code !== 0) throw stageError(stage, `git ${args[0]} exited ${result.code}`);
  return result.stdout.trim();
}

function readJson(fsApi, file) {
  try {
    return JSON.parse(fsApi.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function collectFailedTestFiles(fsApi, repoRoot) {
  const failed = [];
  for (const report of REPORTS) {
    for (const result of readJson(fsApi, path.join(repoRoot, report))?.testResults ?? []) {
      if (result.status !== 'failed') continue;
      const file = path.relative(repoRoot, result.name).replaceAll('\\', '/');
      failed.push({ file, message: String(result.message || '').slice(0, 400) });
    }
  }
  return failed;
}

function electronVersion(fsApi, repoRoot) {
  return readJson(fsApi, path.join(repoRoot, 'node_modules', 'electron', 'package.json'))?.version ?? null;
}

async function runSelectedTests({ execute, files, paths, runTests }) {
  let output = '';
  const runner = async (command, args) => {
    try {
      const result = await execute(command, args, { cwd: paths.repoRoot,
        timeoutCode: 'tests_timeout', timeoutMs: TEST_TIMEOUT_MS, windowsHide: true });
      output += result.output ?? '';
      return result.code;
    } catch (error) {
      output += `${error.output ?? ''}\n${error.message}\n`;
      return 1;
    }
  };
  try {
    await runTests(files, runner);
    return { output, passed: true };
  } catch (error) {
    return { message: error.message, output, passed: false };
  }
}

async function prepare({ base, execute, fsApi, home, paths, plan }) {
  if (!SHA.test(base ?? '')) throw stageError('request', 'remote preflight base must be a full SHA');
  const run = gitRunner(execute, paths);
  const revision = await git(run, paths, ['rev-parse', 'HEAD'], 'source');
  const tree = await git(run, paths, ['rev-parse', 'HEAD^{tree}'], 'source');
  if (await git(run, paths, ['status', '--porcelain', '--untracked-files=all'], 'source')) {
    throw stageError('source', 'Windows checkout is not clean after alignment');
  }
  if ((await run(paths.gitPath, ['cat-file', '-e', `${base}^{commit}`])).code !== 0) {
    throw stageError('base', `base ${base} is not present in the Windows mirror`);
  }
  const dependencies = await ensureWindowsPreflightDependencies({ execute, fsApi, home, paths });
  const selection = await plan({ base, cwd: paths.repoRoot, git: paths.gitPath, head: revision,
    host: 'windows', revision: true, runner: run });
  return { dependencies, revision, selection, tree };
}

export async function runWindowsRemotePreflight({
  base, execute = executeBounded, fsApi = fs, home, id = randomUUID, now = () => new Date(),
  paths = windowsDevPaths(), plan = planPreflightSelection, runTests = runRelatedTests
} = {}) {
  const started = now();
  const runId = `${started.toISOString().replace(/[-:.TZ]/gu, '')}-${id().slice(0, 8)}`;
  const root = path.join(paths.repoRoot, '.tmp', 'artifacts', 'windows-dev-action', runId,
    WINDOWS_REMOTE_PREFLIGHT_ACTION);
  fsApi.mkdirSync(root, { recursive: true });
  const receipt = { action: WINDOWS_REMOTE_PREFLIGHT_ACTION, base: base ?? null, runId,
    schemaVersion: 1, startedAt: started.toISOString() };
  let log = '';
  try {
    const prepared = await prepare({ base, execute, fsApi, home, paths, plan });
    log += prepared.dependencies.output;
    const { selection } = prepared;
    Object.assign(receipt, {
      cap: selection.cap, changedCount: selection.changedFiles.length,
      deferred: selection.deferred.map(({ file }) => file),
      dependencies: { installed: prepared.dependencies.installed,
        lockSha256: prepared.dependencies.lockSha256 },
      environment: { arch: process.arch, electron: electronVersion(fsApi, paths.repoRoot),
        node: process.version, platform: process.platform },
      selected: selection.run.map(({ file }) => file),
      target: { revision: prepared.revision, tree: prepared.tree }
    });
    const testsStarted = now();
    const tests = receipt.selected.length === 0 ? { output: '', passed: true }
      : await runSelectedTests({ execute, files: receipt.selected, paths, runTests });
    log += tests.output;
    receipt.testDurationMs = now() - testsStarted;
    receipt.resultStatus = tests.passed ? 'passed' : 'failed';
    if (!tests.passed) {
      receipt.failure = { failedFiles: collectFailedTestFiles(fsApi, paths.repoRoot),
        message: tests.message, stage: 'tests' };
    }
  } catch (error) {
    log += error.output ?? '';
    receipt.resultStatus = 'error';
    receipt.failure = { message: error.message, stage: error.stage ?? 'entry' };
  }
  const completed = now();
  Object.assign(receipt, { completedAt: completed.toISOString(), durationMs: completed - started });
  const receiptPath = path.join(root, 'receipt.json');
  fsApi.writeFileSync(path.join(root, 'action.log'), log, 'utf8');
  fsApi.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { exitCode: receipt.resultStatus === 'passed' ? 0 : receipt.resultStatus === 'failed' ? 1 : 64,
    receipt, receiptPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runWindowsRemotePreflight({ base: process.argv[2] });
  const stream = result.exitCode === 0 ? console.log : console.error;
  if (result.receipt.failure) {
    stream(`[windows-dev-action] failure stage=${result.receipt.failure.stage} `
      + `message=${String(result.receipt.failure.message).replace(/[\r\n]+/gu, ' ').slice(0, 400)}`);
  }
  stream(`[windows-dev-action] remote-preflight identity=${result.receipt.runId} `
    + `receipt=${result.receiptPath}`);
  process.exitCode = result.exitCode;
}
