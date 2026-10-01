#!/usr/bin/env node
/* global console, process, URL */
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const changed = [
  'scripts/sqlite/sqlite-recovery-drill.test.mjs',
  'electron/database/upgradeRecoveryDrill.test.ts',
  'electron/database/backupRestore.test.ts',
  'electron/database/backupRestore.settings.test.ts',
  'electron/database/backupRestore.compressed.test.ts',
  'electron/database/backupRestore.rollback.test.ts'
];
const release = [...changed,
  'electron/database/publicDesktopDatabaseFixtures.test.ts',
  'electron/database/publicDesktopDatabaseUpgrades.test.ts',
  'electron/database/migrationsCore.test.ts',
  'electron/database/companionUpgradeRestoreStartup.test.ts',
  'electron/database/dynamicNodeVersionChains.migration.test.ts',
  'electron/database/backupRestore.canonicalMigration.test.ts',
  'electron/database/backupRestore.workgroup.test.ts'
];
const quarterly = [...release,
  'electron/database/backupRestore.orphanCleanup.test.ts',
  'electron/database/integrity.test.ts',
  'electron/database/workgroupRestoreIntegration.test.ts',
  'electron/database/workgroupRestoreOffline.test.ts',
  'electron/database/workgroupRestoreStaleTraffic.test.ts',
  'electron/database/workgroupRestoreConvergence.test.ts',
  'electron/sync/workgroupRestore.http.test.ts',
  'electron/sync/workgroupRestore.mobileHttp.integration.test.ts',
  'electron/database/dynamicNodeVersionChains.recovery.test.ts'
];
const profiles = { changed, release, quarterly };

function candidate() {
  const git = (args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  const files = [...new Set(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .toString().split('\0').filter(Boolean))].sort();
  const digest = createHash('sha256');
  for (const file of files) {
    digest.update(`${file}\0`);
    digest.update(existsSync(path.join(root, file)) ? readFileSync(path.join(root, file)) : '<deleted>');
  }
  return {
    head: git(['rev-parse', 'HEAD']).toString().trim(),
    sourceSha256: digest.digest('hex'),
    dirty: git(['status', '--porcelain']).length > 0
  };
}

async function runTests(files, logPath, summaryPath) {
  const stream = createWriteStream(logPath, { flags: 'wx' });
  const args = ['scripts/electron-sqlite-runner.mjs', 'scripts/run-vitest-with-summary.mjs',
    summaryPath, '--', '--silent=passed-only', '--pool=threads', '--maxWorkers=2',
    '--no-file-parallelism', ...files];
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, FOLIOLE_EXPECTED_TEST_FILES: JSON.stringify(files) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.pipe(stream, { end: false });
  child.stderr.pipe(stream, { end: false });
  const result = await new Promise((resolve) => {
    child.on('error', (error) => resolve({ exitCode: 1, error: error.message }));
    child.on('close', (exitCode, signal) => resolve({ exitCode: exitCode ?? 1, signal }));
  });
  await new Promise((resolve) => stream.end(resolve));
  return result;
}

async function main() {
  const profile = process.argv[2];
  if (profile === '--help') {
    console.log('Usage: node scripts/sqlite/upgrade-recovery-drills.mjs <changed|release|quarterly>');
    console.log('Uses isolated fixtures only. Logs and candidate receipt: .tmp/artifacts/t286-drills/<run>/');
    return;
  }
  if (!profiles[profile] || process.argv.length !== 3) throw new Error('Expected changed, release or quarterly; use --help');
  const evidenceRoot = path.join(root, '.tmp/artifacts/t286-drills');
  await mkdir(evidenceRoot, { recursive: true });
  const runRoot = await mkdtemp(path.join(evidenceRoot, `${profile}-`));
  const before = candidate();
  const startedAt = new Date().toISOString();
  const result = await runTests(profiles[profile], path.join(runRoot, 'tests.log'), path.join(runRoot, 'vitest.json'));
  const summaryPath = path.join(runRoot, 'vitest.json');
  const summary = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : null;
  const tests = summary ? {
    total: summary.numTotalTests, passed: summary.numPassedTests,
    failed: summary.numFailedTests, pending: summary.numPendingTests, todo: summary.numTodoTests
  } : null;
  const testsPassed = tests && tests.total > 0 && tests.passed === tests.total;
  const after = candidate();
  const candidateStable = JSON.stringify(before) === JSON.stringify(after);
  const report = {
    profile, startedAt, endedAt: new Date().toISOString(), candidate: before, after,
    candidateStable, ...result, tests, files: profiles[profile],
    status: result.exitCode === 0 && testsPassed ? (candidateStable ? 'passed' : 'candidate-changed') : 'failed',
    scope: 'Isolated SQLite and HTTP; no physical-device or installer acceptance; database backups exclude Assets bytes.'
  };
  await writeFile(path.join(runRoot, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, evidence: runRoot }, null, 2));
  process.exitCode = report.status === 'passed' ? 0 : 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
