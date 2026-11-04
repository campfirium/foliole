// @vitest-environment node
import { readFile, rm } from 'node:fs/promises';

import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import { completeFolderAttachmentCopy, prepareFolderAttachmentCopy, readFolderAttachmentWork } from '../../../../../lib/core/database/companionFolderAttachmentWork';
import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';
import type { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';

import { captureFolderAttachmentDeletions, validateFolderAttachmentDeletions } from './companionFolderAttachmentDeletion';
import { folderAttachmentWorkFixture } from './companionFolderAttachmentWork.testSupport';
import { consumeCompanionFolderAttachmentWork } from './consumeCompanionFolderAttachmentWork';

const native = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { accessFramedSyncFile: native.access } }));
const fixtures: Awaited<ReturnType<typeof folderAttachmentWorkFixture>>[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function fixture() {
  const f = await folderAttachmentWorkFixture(native, createBetterSqliteDbPort);
  fixtures.push(f);
  const owner = { read: f.host.write, readBackgroundSnapshot: f.host.write } as unknown as CapacitorCompanionDatabaseOwner;
  const remove = vi.fn(async ({ storageKey }: { storageKey: string }) => {
    if (await f.exists(`${f.directory}/${storageKey}`)) throw new Error('Source attachment still exists.');
    await rm(`${f.target}/${storageKey}`, { force: true });
  });
  const consume = async (snapshot: Awaited<ReturnType<typeof captureFolderAttachmentDeletions>>) =>
    consumeCompanionFolderAttachmentWork({ ...f.port, deleteAttachment: remove } as unknown as CompanionFolderBackupPort,
      { write: f.host.write, inventory: f.inventory }, { profile: 'profile', requestId: 'committed', sourceEpoch: 'owner',
        deletions: await validateFolderAttachmentDeletions(owner, snapshot, 'profile') });
  await f.run();
  return { f, owner, remove, consume };
}

it('retains the old copy when source deletion fails and completes only after a subsequent database snapshot', async () => {
  const { f, owner, remove, consume } = await fixture();
  const item = await f.receive('delete me'); await f.run();
  await prepareFolderAttachmentCopy(f.db, item.key, 'delete');
  await consume(await captureFolderAttachmentDeletions(owner));
  expect(remove).not.toHaveBeenCalled();
  expect(await readFile(item.file)).toEqual(item.bytes);
  expect(f.rows()).toEqual([]);
  // A later genuine deletion is a new source action; the failed action was proven ineffective.
  await prepareFolderAttachmentCopy(f.db, item.key, 'delete');
  await rm(item.source); await f.reopen();
  await consume(await captureFolderAttachmentDeletions(owner));
  expect(await f.exists(item.file)).toBe(false); expect(f.rows()).toEqual([]);
});

it('does not apply post-snapshot deletes or delete while the committed database still references the key', async () => {
  const { f, owner, remove, consume } = await fixture();
  const item = await f.receive('mounted PDF'); await f.run();
  const snapshot = await captureFolderAttachmentDeletions(owner);
  await prepareFolderAttachmentCopy(f.db, item.key, 'delete'); await rm(item.source);
  await completeFolderAttachmentCopy(f.db, item.key);
  await consume(snapshot); expect(remove).not.toHaveBeenCalled();
  await f.db.run(`INSERT INTO nodes(id,title,content,resource_references,created_at,updated_at)
    VALUES ('mount','Mounted','',?,'now','now')`, [JSON.stringify([{ storage_key: item.key, role: 'reference', original_name: null }])]);
  await consume(await captureFolderAttachmentDeletions(owner)); expect(remove).not.toHaveBeenCalled();
  await f.db.run("DELETE FROM nodes WHERE id='mount'");
  await consume(await captureFolderAttachmentDeletions(owner));
  expect(await f.exists(item.file)).toBe(false);
});

it('invalidates permission on writes during the database snapshot and on a new same-key operation', async () => {
  const { f, owner, remove, consume } = await fixture();
  const item = await f.receive('same key'); await f.run();
  await prepareFolderAttachmentCopy(f.db, item.key, 'delete'); await rm(item.source);
  await completeFolderAttachmentCopy(f.db, item.key);
  const snapshot = await captureFolderAttachmentDeletions(owner);
  await f.db.run("INSERT INTO companion_meta(key,value,updated_at) VALUES ('change','changed','now')");
  await consume(snapshot); expect(remove).not.toHaveBeenCalled();
  const newer = await captureFolderAttachmentDeletions(owner);
  await prepareFolderAttachmentCopy(f.db, item.key);
  await consume(newer); expect(remove).not.toHaveBeenCalled();
  expect((await readFolderAttachmentWork(f.db, 'profile'))[0]).toMatchObject({ action: 'copy', stage: 'source' });
});

it('preserves attachments mentioned in retained versions and refuses uncertain retained bodies', async () => {
  const { f, owner, remove, consume } = await fixture();
  const item = await f.receive('history original'); await f.run();
  await prepareFolderAttachmentCopy(f.db, item.key, 'delete'); await rm(item.source);
  await completeFolderAttachmentCopy(f.db, item.key);
  await f.db.run(`INSERT INTO node_sync_versions(version_id,object_id,host_name,created_at,content_hash,body_text,snapshot_json)
    VALUES ('old','retired','host','now','hash',NULL,?)`, [JSON.stringify({ content: `![image](asset://${item.key})` })]);
  await consume(await captureFolderAttachmentDeletions(owner)); expect(remove).not.toHaveBeenCalled();
  await f.db.run('UPDATE node_sync_versions SET snapshot_json=?', [JSON.stringify({ body_blob_hash: 'unknown' })]);
  await consume(await captureFolderAttachmentDeletions(owner)); expect(remove).not.toHaveBeenCalled();
  await f.db.run('UPDATE node_sync_versions SET snapshot_json=?', [JSON.stringify({ content: 'unrelated', body_blob_hash: 'known' })]);
  await consume(await captureFolderAttachmentDeletions(owner)); expect(remove).toHaveBeenCalledTimes(1);
});
