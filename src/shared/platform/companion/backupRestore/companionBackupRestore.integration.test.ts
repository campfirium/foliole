import { afterEach, describe, expect, it } from 'vitest';

import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';
import type { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';

import { stageCompanionBackupRestore } from './companionBackupRestore';
import { createSpareDevice, STAGING } from './companionBackupRestoreDevice.testSupport';
import { writeV082Backup } from './companionV082Backup.testSupport';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
const spareDevice = () => createSpareDevice(cleanups);

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
