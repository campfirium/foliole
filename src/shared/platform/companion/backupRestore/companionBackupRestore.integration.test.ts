import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CompanionBackupRestorePort } from '../../../../../lib/platform/companionBackupRestoreContract';
import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';
import { createAndroidSqlitePluginFake } from '../runtime/androidSqlitePluginFake.testSupport';
import { CapacitorCompanionDatabaseOwner, type CapacitorCompanionDatabaseManager } from '../runtime/capacitorCompanionDatabaseOwner';
import { CompanionDatabaseManager } from '../runtime/companionDatabaseManager';
import { runCompanionSideDatabase } from '../runtime/iosCompanionDatabaseBootstrap';

import { stageCompanionBackupRestore } from './companionBackupRestore';
import { V082_IMAGE_A, writeV082Backup } from './companionV082Backup.testSupport';

const STAGING = 'foliole-restore-staging';
const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

async function spareDevice() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'companion-restore-'));
  const stagingFile = path.join(root, `${STAGING}SQLite.db`);
  const native = createAndroidSqlitePluginFake(path.join(root, 'foliole-companionSQLite.db'),
    database => database === STAGING ? stagingFile : undefined!);
  cleanups.push(() => { native.close(); rmSync(root, { recursive: true, force: true }); });
  const manager = new CompanionDatabaseManager(native.plugin as never) as unknown as CapacitorCompanionDatabaseManager;
  const owner = new CapacitorCompanionDatabaseOwner(manager, 'android');
  await owner.open({ expectedHostName: 'Spare Phone', now: '2026-11-20T00:00:00Z' });
  await owner.runWriter(db => db.run(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('spare-topic', NULL, 'topic', 'Spare only', '', '2026-11-20', '2026-11-20')`));
  const port = {
    stage: vi.fn(async () => {
      writeV082Backup(stagingFile).close();
      return { cancelled: false as const, database: STAGING, sourceLabel: 'backup.zip',
        storageKeys: [V082_IMAGE_A], skippedFiles: 2, damagedFiles: 1 };
    }),
    cancel: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
    addListener: vi.fn()
  } satisfies CompanionBackupRestorePort;
  const openCandidate = <T,>(database: string, task: Parameters<typeof runCompanionSideDatabase<T>>[3]) =>
    runCompanionSideDatabase(manager, 'android', database, task);
  return { native, owner, openCandidate, port, stagingFile };
}

const titles = (owner: CapacitorCompanionDatabaseOwner) =>
  owner.read(db => db.query<{ id: string }>("SELECT id FROM nodes WHERE kind = 'topic' ORDER BY id"));

describe('staging a backup for restore on the spare phone', () => {
  it('summarizes a migrated candidate while the current library stays untouched', async () => {
    const device = await spareDevice();
    const staged = await stageCompanionBackupRestore({ ...device, now: () => '2026-11-21T00:00:00Z' }, 'zip');

    expect(staged).toEqual({ cancelled: false, summary: {
      backupHostName: 'Main Phone', backupVersion: 117, entryCount: 1, lastModifiedAt: '2026-10-02T00:00:00Z',
      stagedAttachmentCount: 1, missingAttachmentCount: 1, unreadableEntryCount: 0,
      sourceLabel: 'backup.zip', skippedFiles: 2, damagedFiles: 1 } });
    expect(device.port.stage).toHaveBeenCalledWith({ source: 'zip' });
    expect(await titles(device.owner)).toEqual([{ id: 'spare-topic' }]);
    expect(device.native.nativeConnections()).toEqual(['RW_foliole-companion']);
    expect(device.port.discard).not.toHaveBeenCalled();

    const candidate = (await import('better-sqlite3')).default(device.stagingFile, { readonly: true });
    cleanups.unshift(() => candidate.close());
    expect(candidate.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
    const spareId = await device.owner.read(db => db.query<{ value: string }>("SELECT value FROM companion_meta WHERE key = 'device_id'"));
    expect(candidate.prepare("SELECT value FROM companion_meta WHERE key = 'device_id'").pluck().get()).toBe(spareId[0]!.value);
  });

  it('refuses while this phone belongs to a sync group, before any file is chosen', async () => {
    const device = await spareDevice();
    await device.owner.runWriter(async db => {
      await db.run("INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at) VALUES ('g', 'Home', 'k', 'now', 'now')");
      await db.run("INSERT INTO sync_group_local_state (singleton_id, group_id, local_device_identity_key, state, updated_at) VALUES (1, 'g', 'spare', 'active', 'now')");
    });
    await expect(stageCompanionBackupRestore(device, 'folder')).rejects.toThrow('restore_sync_group_active');
    expect(device.port.stage).not.toHaveBeenCalled();
  });

  it('discards the staged copy when the backup cannot become a library', async () => {
    const device = await spareDevice();
    device.port.stage.mockImplementationOnce(async () => {
      writeV082Backup(device.stagingFile).pragma(`user_version = ${COMPANION_DATABASE_VERSION + 1}`);
      return { cancelled: false, database: STAGING, sourceLabel: 'Backup', storageKeys: [], skippedFiles: 0, damagedFiles: 0 };
    });
    await expect(stageCompanionBackupRestore(device, 'folder')).rejects.toMatchObject({ reason: 'newer-version' });
    expect(device.port.discard).toHaveBeenCalledOnce();
    expect(device.native.nativeConnections()).toEqual(['RW_foliole-companion']);
    expect(await titles(device.owner)).toEqual([{ id: 'spare-topic' }]);
  });

  it('does nothing when the file picker is cancelled', async () => {
    const device = await spareDevice();
    device.port.stage.mockResolvedValueOnce({ cancelled: true } as never);
    expect(await stageCompanionBackupRestore(device, 'zip')).toEqual({ cancelled: true });
    expect(device.port.discard).not.toHaveBeenCalled();
  });
});
