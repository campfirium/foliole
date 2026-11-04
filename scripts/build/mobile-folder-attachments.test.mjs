// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';

it('streams and verifies actual files, skips unchanged files and preserves valid files through failures and retry', () => {
  const java = process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
  const parent = path.resolve('.tmp/artifacts/T692/attachment-contract');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'run-'));
  execFileSync(`${java}/bin/javac`, ['-d', root,
    'android/app/src/main/java/com/foliole/android/FolioleFolderBackupAttachmentCopy.java',
    'scripts/build/fixtures/attachments/com/foliole/android/FolderAttachmentCopyFixture.java']);
  const result = execFileSync(`${java}/bin/java`, ['-cp', root, 'com.foliole.android.FolderAttachmentCopyFixture', root], { encoding: 'utf8' });
  expect(result).toContain('cancellation and retry passed');
});
