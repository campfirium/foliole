// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';

it.runIf(process.platform === 'darwin')('ends or reclaims every native folder backup round, including after a page reload or process kill', () => {
  const parent = path.resolve('.tmp/artifacts/backup-round/ios-host');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'run-'));
  const binary = path.join(root, 'fixture');
  execFileSync('xcrun', ['swiftc', '-module-cache-path', path.resolve('.cache/ios-runtime-contract/clang'),
    'ios/App/App/FolioleFolderBackupProfile.swift', 'scripts/ios/fixtures/folder-backup-round.swift', '-o', binary]);
  expect(execFileSync(binary, [root], { encoding: 'utf8' })).toContain('folder-backup-round-passed');
}, 60_000);
