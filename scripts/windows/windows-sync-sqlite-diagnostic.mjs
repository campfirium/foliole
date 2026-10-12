/* global process */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildDesktopElectronBuckets } from '../run-desktop-electron-test-bucket.mjs';
import { executeBounded } from './windows-bounded-process.mjs';

export function diagnosticCases() {
  const bucket = buildDesktopElectronBuckets().find(item => item.label === 'database-15');
  if (!bucket) throw new Error('database-15 not found');
  return [
    { name: 'group-restore', files: ['electron/sync/backupRestoreSyncGroup.integration.test.ts'],
      filter: 'covers a whole group', timeoutMs: 5 * 60_000 },
    { name: 'database-15', files: bucket.targets, timeoutMs: 15 * 60_000 },
    { name: 'large-restore', files: ['electron/sync/desktopRequestSyncLargeOverwrite.integration.test.ts'],
      filter: 'production request restore', timeoutMs: 11 * 60_000 },
    { name: 'large-adoption', files: ['electron/sync/desktopRequestSyncLargeOverwrite.integration.test.ts'],
      filter: 'production request adoption', timeoutMs: 11 * 60_000 }
  ];
}

export function diagnosticInvocation({ root, mode, scenario, repoRoot }) {
  const directory = path.join(root, `${scenario.name}-${mode}`);
  const preload = path.join(repoRoot, 'scripts/windows/sync-sqlite-diagnostic-preload.cjs');
  return {
    directory,
    args: ['scripts/electron-sqlite-runner.mjs', '--require', preload, 'scripts/run-vitest-with-summary.mjs',
      path.join(directory, 'tests.json'), '--', '--pool=forks', '--maxWorkers=2', '--no-file-parallelism',
      '--reporter=./scripts/windows/sync-sqlite-diagnostic-reporter.mjs',
      ...(scenario.filter ? ['--testNamePattern', scenario.filter] : []), ...scenario.files],
    env: { ...process.env, FOLIOLE_SQLITE_DIAGNOSTIC_ROOT: directory,
      FOLIOLE_SQLITE_DIAGNOSTIC_MODE: mode, FOLIOLE_REQUEST_SYNC_DIAGNOSTICS: '1',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: path.join(directory, 'state'),
      TEMP: path.join(repoRoot, '.tmp'), TMP: path.join(repoRoot, '.tmp'), TMPDIR: path.join(repoRoot, '.tmp') }
  };
}

export async function runDiagnostic(root, { repoRoot = process.cwd(), execute = executeBounded } = {}) {
  const expected = path.join(repoRoot, '.tmp', 'artifacts');
  const relative = path.relative(expected, root);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('diagnostic evidence root must be temporary');
  fs.mkdirSync(root, { recursive: true });
  const results = [];
  for (const scenario of diagnosticCases()) for (const mode of ['DEFAULT', 'NORMAL']) {
    const invocation = diagnosticInvocation({ root, mode, scenario, repoRoot });
    fs.mkdirSync(invocation.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT, { recursive: true });
    const startedAt = new Date().toISOString();
    const result = await execute(process.execPath, invocation.args, {
      cwd: repoRoot, env: invocation.env, timeoutMs: scenario.timeoutMs, lineLimit: 20,
      timeoutCode: 'diagnostic_scenario_timeout'
    }).catch(error => {
      if (error.code !== 'diagnostic_scenario_timeout') throw error;
      return { code: 124, timedOut: true, output: error.output };
    });
    fs.writeFileSync(path.join(invocation.directory, 'test.log'), result.output);
    results.push({ name: scenario.name, mode, startedAt, endedAt: new Date().toISOString(),
      exitCode: result.code, timedOut: result.timedOut ?? false, files: scenario.files });
    fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify(results, null, 2));
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runDiagnostic(path.resolve(process.argv[2] ?? ''));
}
