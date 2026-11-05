// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';
import { prepareMobileSqlcipher } from '../build/mobile-sqlcipher.mjs';

it.runIf(process.platform === 'darwin')('uses the production iOS worker and durable private profile to update one standard database', async () => {
  const prepared = await prepareMobileSqlcipher('ios');
  const framework = path.join(prepared.artifact, 'macos-arm64_x86_64');
  const parent = path.resolve('.tmp/artifacts/T692/ios-host-worker');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'run-'));
  const binary = path.join(root, 'fixture');
  execFileSync('xcrun', ['swiftc', '-F', framework, '-framework', 'SQLCipher',
    '-Xlinker', '-rpath', '-Xlinker', framework,
    '-module-cache-path', path.resolve('.cache/ios-runtime-contract/clang'),
    'ios/App/App/FolioleFolderBackupProfile.swift', 'ios/App/App/FolioleFolderBackupOperation.swift',
    'ios/App/App/FolioleFolderBackupDirectory.swift', 'ios/App/App/FolioleCompanionAppDataFiles.swift',
    'scripts/ios/fixtures/folder-backup-host.swift', '-o', binary]);
  const report = JSON.parse(execFileSync(binary, [root], { encoding: 'utf8', timeout: 15_000 }));
  expect(report.initialPages).toBeGreaterThan(400);
  expect(report.changedPages).toBeLessThan(10);
  expect(execFileSync('python3', ['-c',
    'import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); assert d.execute("PRAGMA integrity_check").fetchone()==("ok",); assert d.execute("SELECT value FROM facts").fetchone()==("updated",);print("passed")',
    report.target], { encoding: 'utf8' })).toContain('passed');
}, 180_000);
