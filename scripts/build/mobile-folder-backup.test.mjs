// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareMobileSqlcipher } from './mobile-sqlcipher.mjs';

// These contracts load the App's actual XCFramework Mac slice. Android native
// compilation and device directory/lifecycle acceptance remain separate evidence.
describe.runIf(process.platform === 'darwin')('native single-engine differential backup', () => {
  let root;
  let binary;
  beforeAll(async () => {
    const prepared = await prepareMobileSqlcipher('ios');
    const cache = path.resolve(prepared.packageDirectory, '../..');
    const parent = path.resolve('.tmp/artifacts/T692/native-contracts');
    mkdirSync(parent, { recursive: true });
    root = mkdtempSync(path.join(parent, 'run-'));
    binary = path.join(root, 'contract');
    const framework = path.join(prepared.artifact, 'macos-arm64_x86_64');
    execFileSync('xcrun', ['clang', '-O2', '-I', path.join(cache, 'amalgamation'),
      '-I', 'lib/native/folderBackup',
      'scripts/build/fixtures/mobile-folder-backup-fixture.c',
      'scripts/build/fixtures/mobile-folder-backup-io.c',
      'scripts/build/fixtures/mobile-folder-backup-ownership.c',
      '-F', framework, '-framework', 'SQLCipher', `-Wl,-rpath,${framework}`, '-o', binary]);
  }, 180_000);
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });
  const directory = name => {
    const result = path.join(root, name);
    mkdirSync(result);
    return result;
  };
  const run = (scenario, folder) => execFileSync(binary, [scenario, folder], {
    encoding: 'utf8', timeout: 10_000
  });
  it('commits hot snapshots, changes/schema/growth/shrink and catches up after concurrent source writes', () => {
    const folder = directory('continuous');
    expect(JSON.parse(run('sequence', folder))).toMatchObject({ passed: true,
      sourceCommits: 64, sourceConnectionsClosed: 128 });
    // A closed committed target remains a standard plaintext SQLite file.
    expect(execFileSync('python3', ['-c',
      'import sqlite3,sys;d=sqlite3.connect(sys.argv[1]);assert d.execute("PRAGMA integrity_check").fetchone()==("ok",);assert d.execute("SELECT count(*) FROM events").fetchone()==(64,);print("standard SQLite passed")',
      path.join(folder, 'target.db')], { encoding: 'utf8' })).toContain('standard SQLite passed');
  });
  it('retains the old target on cancellation, retries and preserves an already committed outcome', () => {
    expect(JSON.parse(run('cancel', directory('cancel')))).toMatchObject({ passed: true,
      cancelledOldTargetRetained: true, committedOutcomeRetained: true });
  });
  it.each(['io-error', 'full-error'])('retains the committed target after %s and retries the same owner/target', scenario => {
    expect(JSON.parse(run(scenario, directory(scenario)))).toMatchObject({ passed: true,
      oldTargetRetained: true, retrySucceeded: true });
  });
  it.each(['foreign', 'unknown'])('refuses a %s target without overwriting external facts', scenario => {
    expect(JSON.parse(run(scenario, directory(scenario)))).toMatchObject({ passed: true,
      externalFactsRetained: true, targetWrites: 0 });
  });
  it('recovers the old snapshot after a real main-page write/sync and process death before commit', () => {
    const folder = directory('crash-page');
    run('prepare', folder);
    const killed = spawnSync(binary, ['crash-page', folder], { encoding: 'utf8', timeout: 10_000 });
    expect(killed.status, killed.stderr).toBe(86);
    expect(() => run('recover-old', folder)).not.toThrow();
  });
  it('reopens the new committed snapshot after process death before journal cleanup and then retries', () => {
    const folder = directory('crash');
    run('prepare', folder);
    const killed = spawnSync(binary, ['crash-commit', folder], { encoding: 'utf8', timeout: 10_000 });
    expect(killed.status, killed.stderr).toBe(87);
    expect(() => run('recover', folder)).not.toThrow();
  });
});
