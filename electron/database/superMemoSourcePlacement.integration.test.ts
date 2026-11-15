// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { expect, it, vi } from 'vitest';

import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { readSuperMemoXmlDraft } from '../../lib/core/import/superMemoXmlDraft.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { authorizeSelectedImportDirectoryPath, resetImportPathAuthorizationForTests } from '../ipc/importPathAuthorization.js';
import { handleSuperMemoImportCommand } from '../ipc/superMemoImportCommands.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));

it('does not fabricate a source when importing an XML-only card', async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    const xmlDocument = new DOMParser().parseFromString(
      '<SuperMemoCollection><Count>1</Count><SuperMemoElement><ID>1</ID><Type>Item</Type><Title>Source-free card</Title>'
      + '<Content><Question>Question</Question><Answer>Answer</Answer></Content></SuperMemoElement></SuperMemoCollection>',
      'application/xml');
    const elements = readSuperMemoXmlDraft(xmlDocument);
    const sourceFormat = { placement: 'content-end', template: 'Source: {articleLink}' };
    const args = { elements, sourceFormat, percent: 0 };
    const preview = await handleSuperMemoImportCommand(NATIVE_COMMANDS.previewSuperMemoImport, args);
    if (!preview || !('rows' in preview)) throw new Error('missing import preview');
    expect(await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, { ...args, previewSignature: preview.previewSignature }))
      .toMatchObject({ imported: 1 });
    expect(peer.sqlite.prepare('SELECT content, reveal FROM nodes WHERE title = ?').get('Source-free card'))
      .toEqual({ content: 'Question', reveal: 'Answer' });
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});

const xml = process.env.FOLIOLE_SUPERMEMO_VALIDATION_XML;
const collectionDirectory = process.env.FOLIOLE_SUPERMEMO_VALIDATION_COLLECTION;

const sourceInfoTitle = 'keeps native Topic source information off descendant Topics and Items';
if (!xml || !collectionDirectory) {
  // SKIP: requires the private Learning export and collection | 2026-11-15 | revive: supply both validation paths
  it.skip(sourceInfoTitle, () => {});
} else it(sourceInfoTitle, { meta: { calibratedMs: 20_000 }, timeout: 180_000 }, async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    publishAttachmentLibraryPathSnapshot({ assetsDir: fixture.root + '/assets', libraryScope: fixture.root });
    await authorizeSelectedImportDirectoryPath(collectionDirectory);
    const elements = readSuperMemoXmlDraft(new DOMParser().parseFromString(readFileSync(xml, 'utf8'), 'application/xml'));
    const sourceFormat = { placement: 'topic-info', template: 'Source: {articleLink}' };
    const result = await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, { elements, collectionDirectory, sourceFormat, percent: 0 });
    if (!result || !('batchId' in result)) throw new Error('missing import result');
    peer.reopen();
    const raw = peer.sqlite.prepare('SELECT value FROM workspace_meta WHERE key = ?').pluck().get(`supermemo-import:${result.batchId}`);
    const batch = JSON.parse(raw as string) as { entries: Array<{ id: number; nodeId: string; sourceArticleId?: number }> };
    const node = (id: number) => peer.sqlite.prepare('SELECT content, reveal FROM nodes WHERE id = ?')
      .get(batch.entries.find(entry => entry.id === id)?.nodeId) as { content: string; reveal: string | null };
    expect(node(3302).content).toMatch(/^---\nsupermemoTitle: "Atomic Habits"/u);
    expect(node(1148).content).not.toMatch(/^---\nsupermemo/u);
    expect(node(797).content).not.toMatch(/^---\nsupermemo/u);
    expect(node(797).reveal).not.toMatch(/^---\nsupermemo/u);
    expect(batch.entries.find(entry => entry.id === 797)?.sourceArticleId).toBe(3302);
  } finally {
    connection.driver = null;
    clearAttachmentLibraryPathSnapshot();
    resetImportPathAuthorizationForTests();
    await fixture.close();
  }
});
