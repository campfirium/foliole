// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';

import { reviveDeletedFoldersForLaterChildren } from './syncFolderChildRevival.js';
import { upsertRemoteVersion } from './syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from './syncNodeGraph.js';

const before = '2026-10-07T00:00:00.000Z';
const deletedAt = '2026-10-07T02:00:00.000Z';
const after = '2026-10-07T03:00:00.000Z';
const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach((device) => device.sqlite.close()));

function folderAndChild(samePlacement: boolean, createdAt: string) {
  const folder = textBranch('folder-version', '\uFEFFFolder 中文\r\n😀', undefined, deletedAt);
  folder.object_id = 'folder';
  folder.snapshot = { ...folder.snapshot, id: 'folder', kind: 'folder', deleted_at: deletedAt };
  const previous = textBranch('previous-child', 'Child body', undefined, before);
  previous.snapshot.parent_id = samePlacement ? 'folder' : null;
  const child = textBranch('later-child', 'Child body', previous, createdAt);
  child.snapshot.parent_id = 'folder';
  return { folder, previous, child };
}

it.each([false, true])('retains folder revival decisions at every temporal boundary with same-placement=%s', async (samePlacement) => {
  for (const createdAt of [before, deletedAt, after]) {
    const host = textDevice();
    devices.push(host);
    const { folder, previous, child } = folderAndChild(samePlacement, createdAt);
    await applySyncNodesWithDbPort(host.db, [folder]);
    await upsertRemoteVersion(host.db, previous);
    await reviveDeletedFoldersForLaterChildren(host.db, [child], new Set(['topic']));
    const current = await loadCurrentSyncNodeRecord(host.db, 'folder');
    const restored = !samePlacement && createdAt === after;
    expect(current?.snapshot.deleted_at).toBe(restored ? null : deletedAt);
    expect(current?.body_text).toBe(folder.body_text);
    if (restored) expect(current?.parent_version_ids).toEqual(['folder-version']);
    else expect(current?.version_id).toBe('folder-version');
  }
});

it('rolls back folder version and relations when adoption fails, then retries the same input', async () => {
  const host = textDevice();
  devices.push(host);
  const { folder, previous, child } = folderAndChild(false, after);
  await applySyncNodesWithDbPort(host.db, [folder]);
  await upsertRemoteVersion(host.db, previous);
  const initial = await loadCurrentSyncNodeRecord(host.db, 'folder');
  const versions = host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  const parents = host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all();
  host.sqlite.exec("CREATE TRIGGER reject_revival BEFORE UPDATE OF current_version_id ON nodes BEGIN SELECT RAISE(ABORT, 'reject_revival'); END");
  await expect(reviveDeletedFoldersForLaterChildren(host.db, [child], new Set(['topic'])))
    .rejects.toThrow('reject_revival');
  expect(await loadCurrentSyncNodeRecord(host.db, 'folder')).toEqual(initial);
  expect(host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
  expect(host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all()).toEqual(parents);
  host.sqlite.exec('DROP TRIGGER reject_revival');
  await reviveDeletedFoldersForLaterChildren(host.db, [child], new Set(['topic']));
  expect((await loadCurrentSyncNodeRecord(host.db, 'folder'))?.snapshot.deleted_at).toBeNull();
});
