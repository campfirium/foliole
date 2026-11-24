// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { beforeAll, expect, it } from 'vitest';
import { writeFolderDocumentStubs } from './fixtures/folder-documents/android-stubs.mjs';

let root;
const java = process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
beforeAll(() => {
  const parent = path.resolve('.tmp/artifacts/T692/document-contract');
  mkdirSync(parent, { recursive: true });
  root = mkdtempSync(path.join(parent, 'run-'));
  execFileSync(`${java}/bin/javac`, ['-d', root, ...writeFolderDocumentStubs(root),
    'android/app/src/main/java/com/foliole/android/FolioleFolderBackupDocuments.java',
    'android/app/src/main/java/com/foliole/android/FolioleFolderBackupDocumentNames.java',
    'android/app/src/main/java/com/foliole/android/FolioleFolderBackupReplacement.java',
    'scripts/build/fixtures/folder-documents/com/foliole/android/FolderDocumentsFixture.java']);
  for (const [name, fact] of [['foreign', 'external fact'], ['candidate', 'new fact']]) {
    execFileSync('python3', ['-c',
      'import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); d.execute("CREATE TABLE facts(value TEXT)"); d.execute("INSERT INTO facts VALUES(?)",(sys.argv[2],)); d.commit(); d.close()',
      path.join(root, name + '.sqlite'), fact]);
  }
});

it.each(['before-create', 'after-create'])('resumes the same target after interruption %s', scenario => {
  expect(execFileSync(`${java}/bin/java`, ['-cp', root, 'com.foliole.android.FolderDocumentsFixture',
    scenario, path.join(root, scenario)], { encoding: 'utf8' })).toContain('interrupted creation resumed');
});
it.each(['foreign-empty', 'foreign-nonempty', 'pending-foreign'])('preserves %s files without adopting them', scenario => {
  expect(execFileSync(`${java}/bin/java`, ['-cp', root, 'com.foliole.android.FolderDocumentsFixture',
    scenario, path.join(root, scenario), path.join(root, 'foreign.sqlite')], { encoding: 'utf8' }))
    .toContain('external facts retained');
});
it.each(['owned-missing', 'owned-missing-interrupted'])('recreates a removed owned backup in the same folder: %s', scenario => {
  expect(execFileSync(`${java}/bin/java`, ['-cp', root, 'com.foliole.android.FolderDocumentsFixture',
    scenario, path.join(root, scenario)], { encoding: 'utf8' })).toContain('removed backup recreated');
});
function replace(scenario) {
  return execFileSync(`${java}/bin/java`, ['-cp', root, 'com.foliole.android.FolderDocumentsFixture',
    scenario, path.join(root, scenario), path.join(root, 'foreign.sqlite'), path.join(root, 'candidate.sqlite')],
  { encoding: 'utf8' });
}

it('replaces another backup only when the user confirmed it', () => {
  expect(replace('foreign-replaced')).toContain('other backup replaced');
});
it.each(['create', 'write', 'publish'])('keeps the old database if replacement fails during %s', step => {
  expect(replace(`foreign-replace-${step}-failed`)).toContain('old backup survives replacement failure');
});
it('keeps both completed databases when the published identity cannot be saved', () => {
  expect(replace('foreign-replace-metadata-failed')).toContain('both backups survive metadata failure');
});
