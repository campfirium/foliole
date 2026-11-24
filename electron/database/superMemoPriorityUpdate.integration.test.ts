// @vitest-environment jsdom
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { readSuperMemoXmlDraft } from '../../lib/core/import/superMemoXmlDraft.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { writeSuperMemoPriorityCollection } from '../../tests/fixtures/superMemoPriorityCollection.js';
import { authorizeSelectedImportDirectoryPath, resetImportPathAuthorizationForTests } from '../ipc/importPathAuthorization.js';
import { handleSuperMemoImportCommand } from '../ipc/superMemoImportCommands.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushDirtyNodeSyncVersions } from './nodeSyncVersions.js';
import { requestNodeRound, restoreFixture, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));

const defaults = [0, 11, 22, 33, 44, 56, 67, 78, 89, 100];
const boundaries = [5, 11, 20, 33, 44, 56, 67, 78, 89, 100];

function readPriority(peer: RestorePeer) {
  return peer.sqlite.prepare("SELECT priority FROM nodes WHERE title = 'Priority 0'").pluck().get();
}

async function syncPriority(source: RestorePeer, target: RestorePeer, expected: number) {
  flushDirtyNodeSyncVersions();
  await requestNodeRound(source, target);
  target.reopen();
  expect(readPriority(target)).toBe(expected);
}

it.each([false, true])('remaps a saved batch and protects local edits, legacy=%s', async legacy => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const target = fixture.peer('target');
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    const collectionDirectory = path.join(fixture.root, 'SuperMemo');
    const xml = await writeSuperMemoPriorityCollection(collectionDirectory);
    await authorizeSelectedImportDirectoryPath(collectionDirectory);
    const elements = readSuperMemoXmlDraft(new DOMParser().parseFromString(xml, 'application/xml'));
    const args = { elements, collectionDirectory, percent: 0, priorityBoundaries: defaults };
    const previewFor = async (priorityBoundaries: number[]) => {
      const result = await handleSuperMemoImportCommand(NATIVE_COMMANDS.previewSuperMemoImport, { ...args, priorityBoundaries });
      if (!result || !('rows' in result)) throw new Error('Missing preview');
      return result;
    };
    const first = await previewFor(defaults);
    await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, { ...args, previewSignature: first.previewSignature });
    if (legacy) {
      peer.sqlite.exec(`
        UPDATE workspace_meta SET value = json_set(value, '$.entries', json((
          SELECT json_group_array(json_remove(json_set(j.value, '$.sourceRank', json_extract(j.value, '$.id')), '$.appliedPriority'))
          FROM json_each(workspace_meta.value, '$.entries') j
        ))) WHERE key LIKE 'supermemo-import:%';
        UPDATE nodes SET priority = 1 WHERE title = 'Priority 11';
      `);
    }
    await syncPriority(peer, target, 1);
    const apply = (preview: Awaited<ReturnType<typeof previewFor>>, priorityBoundaries: number[]) =>
      handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, { ...args, priorityBoundaries,
        previewSignature: preview.previewSignature, updateSignature: preview.directoryUpdate?.signature });

    const proposed = await previewFor(boundaries);
    expect(proposed.directoryUpdate?.priorityChanges).toContainEqual(
      { sourceId: 1, title: 'Priority 0', from: 1, to: 0, status: 'update' });
    expect(readPriority(peer)).toBe(1);
    peer.sqlite.exec("UPDATE nodes SET priority = 8 WHERE title = 'Priority 20'; UPDATE nodes SET sync_dirty = 0;");
    await expect(apply(proposed, boundaries)).rejects.toThrow('supermemo_update_changed');
    const refreshed = await previewFor(boundaries);
    expect(refreshed.directoryUpdate?.priorityChanges).toContainEqual(
      { sourceId: 21, title: 'Priority 20', from: 8, to: 3, status: 'protected' });
    await apply(refreshed, boundaries);
    peer.reopen();
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    expect(readPriority(peer)).toBe(0);
    expect(peer.sqlite.prepare("SELECT priority, sync_dirty FROM nodes WHERE title = 'Priority 20'").get())
      .toEqual({ priority: 8, sync_dirty: 0 });
    expect(peer.sqlite.prepare("SELECT sync_dirty FROM nodes WHERE title = 'Priority 0'").pluck().get()).toBe(1);
    await syncPriority(peer, target, 0);
    expect((await previewFor(boundaries)).directoryUpdate?.priorityChanges?.filter(change => change.status === 'update')).toEqual([]);
    await apply(await previewFor(defaults), defaults);
    expect(readPriority(peer)).toBe(1);
  } finally {
    connection.driver = null;
    resetImportPathAuthorizationForTests();
    await fixture.close();
  }
});
