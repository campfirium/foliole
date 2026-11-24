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
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));

const defaults = [0, 11, 22, 33, 44, 56, 67, 78, 89, 100];

it.each([
  { boundaries: undefined, expected: [1, 1, 2, 2, 9] },
  { boundaries: [5, 11, 20, 33, 44, 56, 67, 78, 100, 100], expected: [0, 1, 2, 3, 9] }
])('writes source priorities against the selected boundaries $boundaries', async ({ boundaries, expected }) => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    const collectionDirectory = path.join(fixture.root, 'SuperMemo');
    const xml = await writeSuperMemoPriorityCollection(collectionDirectory);
    await authorizeSelectedImportDirectoryPath(collectionDirectory);
    const elements = readSuperMemoXmlDraft(new DOMParser().parseFromString(xml, 'application/xml'));
    const args = { elements, collectionDirectory, percent: 0, priorityBoundaries: boundaries };
    const preview = await handleSuperMemoImportCommand(NATIVE_COMMANDS.previewSuperMemoImport, args);
    if (!preview || !('rows' in preview)) throw new Error('Missing import preview');
    const signed = { ...args, previewSignature: preview.previewSignature };
    const differentBoundaries = boundaries ? defaults : [5, ...defaults.slice(1)];
    await expect(handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport,
      { ...signed, priorityBoundaries: differentBoundaries })).rejects.toThrow('supermemo_preview_changed');
    await expect(handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport,
      { ...signed, priorityBoundaries: [12, ...defaults.slice(1)] })).rejects.toThrow();
    await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, signed);
    peer.reopen();
    const priorityFor = peer.sqlite.prepare('SELECT priority FROM nodes WHERE title = ?').pluck();
    expect([0, 10, 11, 20, 100].map(percent => priorityFor.get(`Priority ${percent}`))).toEqual(expected);
  } finally {
    connection.driver = null;
    resetImportPathAuthorizationForTests();
    await fixture.close();
  }
});
