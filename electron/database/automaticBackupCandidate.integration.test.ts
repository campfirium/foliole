// @vitest-environment node
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

const verified = vi.hoisted(() => ({ files: [] as string[] }));
vi.mock('./sqliteFileOffMainThread.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./sqliteFileOffMainThread.js')>();
  return { ...actual, verifySqliteDatabaseFileOffMainThread: (filePath: string) => {
    verified.files.push(path.basename(filePath));
    return actual.verifySqliteDatabaseFileOffMainThread(filePath);
  } };
});

import { commitAutomaticBackupWhenChanged } from './automaticBackupCandidate.js';
import type { ApplicationDatabaseBackupEntry } from './backupCatalog.js';
import { backupSqliteDatabase } from './sqliteBackupRestore.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  await mkdir(path.resolve('.tmp/artifacts'), { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/automatic-backup-'));
  roots.push(root);
  const sourcePath = path.join(root, 'library.db');
  const sqlite = new Database(sourcePath);
  sqlite.exec("CREATE TABLE notes(body TEXT); INSERT INTO notes VALUES ('" + 'x'.repeat(200_000) + "')");
  const commit = async (name: string, latestOrdinary: ApplicationDatabaseBackupEntry | null) =>
    commitAutomaticBackupWhenChanged({ destinationPath: path.join(root, name), latestOrdinary, sourcePath,
      createSnapshot: candidatePath => backupSqliteDatabase({ destinationPath: candidatePath, sourceDatabase: sqlite, sourcePath }) });
  const entry = async (name: string): Promise<ApplicationDatabaseBackupEntry> => ({ fileName: name,
    filePath: path.join(root, name), kind: 'automatic', autoFrequency: 'hourly', snapshotReason: null,
    sizeBytes: (await stat(path.join(root, name))).size, updatedAt: new Date().toISOString() });
  return { sqlite, commit, entry };
}

it('skips an unchanged library after verifying only the new candidate', async () => {
  const host = await fixture();
  try {
    expect(await host.commit('first.db.gz', null)).not.toBeNull();
    verified.files.length = 0;
    expect(await host.commit('second.db.gz', await host.entry('first.db.gz'))).toBeNull();
    expect(verified.files).toHaveLength(1);
    expect(verified.files[0]).toMatch(/\.second\.db\.gz-.+\.source\.db$/u);
  } finally { host.sqlite.close(); }
});

it('commits a new restore point once the library changes', async () => {
  const host = await fixture();
  try {
    expect(await host.commit('first.db.gz', null)).not.toBeNull();
    host.sqlite.exec("INSERT INTO notes VALUES ('changed')");
    expect(await host.commit('second.db.gz', await host.entry('first.db.gz'))).toMatchObject({
      destinationPath: expect.stringContaining('second.db.gz') });
    await expect(stat(path.join(path.dirname(host.sqlite.name), 'second.db.gz'))).resolves.toBeTruthy();
  } finally { host.sqlite.close(); }
});
