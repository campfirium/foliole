/* global console, process */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';
import { ensureWindowsPreflightDependencies } from './windows-remote-preflight-dependencies.mjs';

export const TEST_DATABASE_DIAGNOSTIC_ACTION = 'test-database-cleanup';
export const TEST_DATABASE_DIAGNOSTIC_FILE = 'src/store/workspaceStoreNodeRelearn.integration.test.ts';

export async function runWindowsTestDatabaseDiagnostic({ execute = executeBounded, fsApi = fs,
  paths = windowsDevPaths(), prepare = ensureWindowsPreflightDependencies,
  id = randomUUID, now = () => new Date() } = {}) {
  const runId = `${now().toISOString().replace(/[-:.TZ]/gu, '')}-${id().slice(0, 8)}`;
  const root = path.join(paths.repoRoot, '.tmp/artifacts/windows-dev-action', runId,
    TEST_DATABASE_DIAGNOSTIC_ACTION);
  fsApi.mkdirSync(root, { recursive: true });
  const lifecycle = path.join(root, 'connections.jsonl');
  fsApi.writeFileSync(lifecycle, '');
  let output = '';
  const receipt = { action: TEST_DATABASE_DIAGNOSTIC_ACTION, runId, schemaVersion: 1,
    startedAt: now().toISOString(), file: TEST_DATABASE_DIAGNOSTIC_FILE,
    environment: { platform: process.platform, arch: process.arch, node: process.version } };
  try {
    const source = await execute(paths.gitPath, ['rev-parse', 'HEAD'], {
      cwd: paths.repoRoot, timeoutMs: 30_000, timeoutCode: 'source_timeout', windowsHide: true });
    if (source.code !== 0) throw new Error('Cannot identify diagnostic source revision');
    receipt.revision = source.stdout.trim();
    const dependencies = await prepare({ execute, fsApi, paths });
    output += dependencies.output;
    receipt.dependencies = { installed: dependencies.installed, lockSha256: dependencies.lockSha256 };
    const result = await execute(paths.systemNode, [paths.systemNpmCli, 'run',
      'test:sqlite:electron', '--', TEST_DATABASE_DIAGNOSTIC_FILE], {
      cwd: paths.repoRoot, env: { ...process.env, FOLIOLE_TEST_DB_LIFECYCLE_LOG: lifecycle },
      timeoutMs: 10 * 60_000, timeoutCode: 'test_database_cleanup_timeout', windowsHide: true });
    output += result.output ?? '';
    receipt.resultStatus = result.code === 0 ? 'passed' : 'failed';
    receipt.exitCode = result.code;
    receipt.lifecycleEvents = fsApi.readFileSync(lifecycle, 'utf8').split('\n').filter(Boolean).length;
    if (result.code === 0 && receipt.lifecycleEvents === 0) throw new Error('Database lifecycle probe produced no evidence');
  } catch (error) {
    output += error.output ?? '';
    receipt.resultStatus = 'error';
    receipt.failure = error.message;
    receipt.exitCode = 64;
  }
  receipt.completedAt = now().toISOString();
  fsApi.writeFileSync(path.join(root, 'action.log'), output);
  const receiptPath = path.join(root, 'receipt.json');
  fsApi.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, receiptPath, exitCode: receipt.exitCode };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runWindowsTestDatabaseDiagnostic();
  console.log(`[windows-dev-action] ${TEST_DATABASE_DIAGNOSTIC_ACTION} identity=${result.receipt.runId} receipt=${result.receiptPath}`);
  process.exitCode = result.exitCode;
}
