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
    'scripts/build/fixtures/folder-documents/com/foliole/android/FolderDocumentsFixture.java']);
  execFileSync('python3', ['-c',
    'import sqlite3,sys;d=sqlite3.connect(sys.argv[1]);d.executescript("CREATE TABLE facts(value TEXT);INSERT INTO facts VALUES(\'external fact\');");d.close()',
    path.join(root, 'foreign.sqlite')]);
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
