// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';
import { prepareMobileSqlcipher } from './mobile-sqlcipher.mjs';

it.runIf(process.platform === 'darwin')('runs the production JNI/descriptor VFS on real JVM callback threads and preserves the target on cancellation', async () => {
  // The Mac framework tests the same engine/JNI ABI without installing or running a mobile App.
  const prepared = await prepareMobileSqlcipher('ios');
  const framework = path.join(prepared.artifact, 'macos-arm64_x86_64');
  const java = process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
  const parent = path.resolve('.tmp/artifacts/T692/android-jni-contract');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'run-'));
  const binary = path.join(root, 'bridge.dylib');
  execFileSync('xcrun', ['clang', '-dynamiclib', '-O2', '-I', `${framework}/SQLCipher.framework/Headers`,
    '-I', `${java}/include`, '-I', `${java}/include/darwin`, '-I', 'lib/native/folderBackup',
    ...['Io', 'Vfs', 'Jni'].map(name => `lib/native/folderBackup/FolioleFolderBackupAndroid${name}.c`),
    '-F', framework, '-framework', 'SQLCipher', `-Wl,-rpath,${framework}`, '-o', binary]);
  execFileSync(`${java}/bin/javac`, ['-d', root,
    'android/app/src/main/java/com/foliole/android/FolioleFolderBackupDocumentNames.java',
    'scripts/build/fixtures/jni/com/foliole/android/FolioleFolderBackupOperation.java']);
  execFileSync('python3', ['-c',
    'import sqlite3,sys;d=sqlite3.connect(sys.argv[1]);d.executescript("CREATE TABLE facts(value TEXT);INSERT INTO facts VALUES(\'initial\');CREATE TABLE payload(value BLOB);INSERT INTO payload VALUES(zeroblob(2000000));");d.close()',
    path.join(root, 'source.db')]);
  const report = JSON.parse(execFileSync(`${java}/bin/java`, ['--add-opens', 'java.base/java.io=ALL-UNNAMED',
    '-cp', root, 'com.foliole.android.FolioleFolderBackupOperation', binary, root], { encoding: 'utf8', timeout: 15_000 }));
  expect(report.initialPages).toBeGreaterThan(400);
  expect(report.changedPages).toBeLessThan(10);
  expect(report.sourceReleases).toBe(3);
  execFileSync('python3', ['-c',
    'import sqlite3,sys;d=sqlite3.connect(sys.argv[1]);assert d.execute("PRAGMA integrity_check").fetchone()==("ok",);assert d.execute("SELECT value FROM facts").fetchone()==("updated",)',
    path.join(root, 'Foliole.sqlite')]);
}, 180_000);
