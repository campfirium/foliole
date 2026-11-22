import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { vi } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { CompanionBackupRestorePort } from '../../../../../lib/platform/companionBackupRestoreContract';
import { createAndroidSqlitePluginFake } from '../runtime/androidSqlitePluginFake.testSupport';
import { CapacitorCompanionDatabaseOwner, type CapacitorCompanionDatabaseManager } from '../runtime/capacitorCompanionDatabaseOwner';
import { CompanionDatabaseManager } from '../runtime/companionDatabaseManager';
import { runCompanionSideDatabase } from '../runtime/iosCompanionDatabaseBootstrap';

import { V082_IMAGE_A, writeV082Backup } from './companionV082Backup.testSupport';

export const STAGING = 'foliole-restore-staging';

const SUFFIXES = ['', '-wal', '-shm'];

function moveLibrary(from: string, to: string) {
  for (const suffix of SUFFIXES) if (existsSync(from + suffix)) renameSync(from + suffix, to + suffix);
}

/** Renames like the native swap: the closed library moves aside and the incoming one takes its place. */
function swapFiles(root: string, library: string, incoming: string) {
  const previous = path.join(root, 'restore-previous', path.basename(library));
  const outgoing = path.join(root, 'restore-outgoing.db');
  moveLibrary(library, outgoing);
  moveLibrary(incoming, library);
  mkdirSync(path.dirname(previous), { recursive: true });
  moveLibrary(outgoing, previous);
}

/** An Android phone with its own small library, opened the way the app opens it. */
export async function createSpareDevice(cleanups: (() => void)[]) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'companion-restore-'));
  const library = path.join(root, 'foliole-companionSQLite.db');
  const stagingFile = path.join(root, `${STAGING}SQLite.db`);
  const native = createAndroidSqlitePluginFake(library, database => database === STAGING ? stagingFile : undefined!);
  cleanups.push(() => { native.close(); rmSync(root, { recursive: true, force: true }); });
  const open = async () => {
    const manager = new CompanionDatabaseManager(native.plugin as never) as unknown as CapacitorCompanionDatabaseManager;
    const owner = new CapacitorCompanionDatabaseOwner(manager, 'android');
    await owner.open({ expectedHostName: 'Spare Phone', now: '2026-11-20T00:00:00Z' });
    return { manager, owner };
  };
  const { manager, owner } = await open();
  await owner.runWriter(db => db.run(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('spare-topic', NULL, 'topic', 'Spare only', '', '2026-11-20', '2026-11-20')`), { kind: 'business' });
  const port = {
    stage: vi.fn(async () => {
      writeV082Backup(stagingFile).close();
      return { cancelled: false as const, database: STAGING, sourceLabel: 'backup.zip',
        storageKeys: [V082_IMAGE_A], skippedFiles: 2, damagedFiles: 1 };
    }),
    cancel: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
    commit: vi.fn(async () => swapFiles(root, library, stagingFile)),
    revert: vi.fn(async () => swapFiles(root, library, path.join(root, 'restore-previous', path.basename(library)))),
    previous: vi.fn(async () => ({ exists: existsSync(path.join(root, 'restore-previous')), savedAt: null })),
    deletePrevious: vi.fn(async () => rmSync(path.join(root, 'restore-previous'), { recursive: true, force: true })),
    addListener: vi.fn()
  } satisfies CompanionBackupRestorePort;
  const openCandidate = <T,>(database: string, task: (db: DbPort) => Promise<T>) =>
    runCompanionSideDatabase(manager, 'android', database, task);
  /** A fresh document after reload, opening whatever library file is now in place. */
  const reopen = async () => (await open()).owner;
  return { native, owner, openCandidate, port, stagingFile, reopen };
}
