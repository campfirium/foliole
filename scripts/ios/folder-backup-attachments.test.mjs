// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';

it.runIf(process.platform === 'darwin')('streams verified attachments, retains existing files and protects live or trash originals', () => {
  const parent = path.resolve('.tmp/artifacts/T692/ios-attachment-host');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'run-'));
  const binary = path.join(root, 'fixture');
  execFileSync('xcrun', ['swiftc', '-module-cache-path', path.resolve('.cache/ios-runtime-contract/clang'),
    'ios/App/App/FolioleFolderBackupProfile.swift', 'ios/App/App/FolioleFolderBackupAttachments.swift',
    'ios/App/App/FolioleCompanionCanonicalAttachmentKey.swift',
    'scripts/ios/fixtures/folder-backup-attachments.swift', '-o', binary]);
  expect(execFileSync(binary, [root], { encoding: 'utf8' })).toContain('attachment-contract-passed');
}, 30_000);
