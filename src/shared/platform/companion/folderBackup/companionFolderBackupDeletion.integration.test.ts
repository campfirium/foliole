// @vitest-environment node
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import { completeFolderAttachmentCopy, prepareFolderAttachmentCopy } from '../../../../../lib/core/database/companionFolderAttachmentWork';
import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';

import { folderAttachmentWorkFixture } from './companionFolderAttachmentWork.testSupport';
import { backUpCompanionDatabase } from './companionFolderBackup';

const runtime = vi.hoisted(() => ({ access: vi.fn(), inventory: vi.fn(), owner: null as unknown, port: null as unknown }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  accessFramedSyncFile: runtime.access, maintainAttachmentFiles: runtime.inventory
} }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner }));
vi.mock('./companionFolderBackupRuntimeRepository', () => ({ getCompanionFolderBackupPort: () => runtime.port }));

const fixtures: Awaited<ReturnType<typeof folderAttachmentWorkFixture>>[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture() {
  const f = await folderAttachmentWorkFixture({ access: runtime.access }, createBetterSqliteDbPort);
  fixtures.push(f); await f.run();
  runtime.owner = { read: f.host.write, readBackgroundSnapshot: f.host.write,
    runWriter: f.host.write, folderBackupSource: async () => 'owner' };
  const targetDb = path.join(f.target, 'Foliole.sqlite');
  const backup = vi.fn(async ({ requestId }: { requestId: string }) => {
    await f.sqlite.backup(targetDb);
    return { requestId, cancelled: false, databaseCommitted: true,
      state: { configured: true, directoryId: 'profile' } };
  });
  const remove = vi.fn(async ({ storageKey }: { storageKey: string }) => {
    const target = new Database(targetDb, { readonly: true });
    try {
      expect(target.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(target.prepare('SELECT count(*) AS count FROM nodes WHERE instr(resource_references,?)>0').get(storageKey)).toEqual({ count: 0 });
    } finally { target.close(); }
    if (await f.exists(`${f.directory}/${storageKey}`)) throw new Error('source still exists');
    await rm(`${f.target}/${storageKey}`);
  });
  runtime.port = { ...f.port, backupDatabase: backup, deleteAttachment: remove } as unknown as CompanionFolderBackupPort;
  runtime.inventory.mockImplementation(f.inventory);
  const item = await f.receive('retired attachment'); await f.run();
  await prepareFolderAttachmentCopy(f.db, item.key, 'delete'); await rm(item.source);
  await completeFolderAttachmentCopy(f.db, item.key);
  return { f, item, backup, remove, targetDb };
}

it('keeps the prior attachment on a failed database commit, then deletes after a real SQLite backup commits', async () => {
  const { f, item, backup, remove } = await fixture();
  backup.mockRejectedValueOnce(new Error('database commit refused'));
  await expect(backUpCompanionDatabase()).rejects.toThrow('database commit refused');
  expect(remove).not.toHaveBeenCalled(); expect(await readFile(item.file)).toEqual(item.bytes);
  await f.reopen();
  expect((await backUpCompanionDatabase()).state).toMatchObject({ attachmentFilesPending: 0 });
  expect(remove).toHaveBeenCalledTimes(1); expect(await f.exists(item.file)).toBe(false); expect(f.rows()).toEqual([]);
});

it('retains attachments when a new reference enters during the native database snapshot', async () => {
  const { f, item, backup, remove } = await fixture();
  const original = backup.getMockImplementation()!;
  backup.mockImplementationOnce(async input => {
    await f.db.run(`INSERT INTO nodes(id,title,content,resource_references,created_at,updated_at)
      VALUES ('new','New','',?,'now','now')`, [JSON.stringify([{ storage_key: item.key, role: 'reference', original_name: null }])]);
    return original(input);
  });
  expect((await backUpCompanionDatabase()).state).toMatchObject({ attachmentFilesPending: 1 });
  expect(remove).not.toHaveBeenCalled(); expect(await readFile(item.file)).toEqual(item.bytes);
  await f.db.run("DELETE FROM nodes WHERE id='new'");
  await backUpCompanionDatabase(); expect(remove).toHaveBeenCalledTimes(1);
});
