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

it.each([false, true])('uses a native cloze mark to resolve a repeated answer (marked: %s)', async marked => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    const body = 'The milestone arrived. A second milestone with clear context. A candid review.';
    const item = (id: number, question: string, answer: string) =>
      '<SuperMemoElement><ID>' + id + '</ID><Type>Item</Type><Title>Card ' + id + '</Title><Content><Question><![CDATA['
      + question + ']]></Question><Answer>' + answer + '</Answer></Content></SuperMemoElement>';
    const blank = '<span class="cloze">[...]</span>';
    const xml = '<SuperMemoCollection><Count>6</Count><SuperMemoElement><ID>1</ID><Type>Topic</Type><Title>Parent</Title>'
      + '<Content><Question><![CDATA[' + (marked ? body.replace('second milestone', 'second <span class=clozed>milestone</span>') : body) + ']]></Question></Content>'
      + item(2, 'Rewritten sentence with ' + blank, 'review')
      + item(3, 'A second ' + blank + ' with clear context.', 'milestone')
      + item(4, 'a ' + blank, 'milestone')
      + item(5, 'Already answered', 'review')
      + item(6, 'The ' + blank, 'did')
      + '</SuperMemoElement></SuperMemoCollection>';
    const elements = readSuperMemoXmlDraft(new DOMParser().parseFromString(xml, 'application/xml'));
    const args = { elements, percent: 0 };
    const result = await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, args);
    expect(result).toMatchObject({ imported: 6 });
    expect(await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, args)).toEqual(result);
    peer.reopen();
    const parent = peer.sqlite.prepare('SELECT id, content FROM nodes WHERE title = ?').get('Parent') as { id: string; content: string };
    const card = (id: number) => peer.sqlite.prepare('SELECT parent_id, anchor_link, reveal FROM nodes WHERE title = ?')
      .get('Card ' + id) as { parent_id: string; anchor_link: string | null; reveal: string };
    for (const [id, answer, from] of [[2, 'review', body.indexOf('review')], [3, 'milestone', body.lastIndexOf('milestone')]] as const) {
      expect(card(id)).toMatchObject({ parent_id: parent.id, reveal: answer });
      expect(JSON.parse(card(id).anchor_link!)).toMatchObject({
        kind: 'cloze', locator: { from, to: from + answer.length, originalText: parent.content.slice(from, from + answer.length) }
      });
    }
    const repeated = card(4);
    expect(repeated.parent_id).toBe(parent.id);
    if (marked) expect(JSON.parse(repeated.anchor_link!)).toMatchObject({
      kind: 'cloze', locator: { from: parent.content.lastIndexOf('milestone'), originalText: 'milestone' }
    });
    else expect(repeated.anchor_link).toBeNull();
    for (const id of [5, 6]) expect(card(id)).toMatchObject({ parent_id: parent.id, anchor_link: null });
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});

it.each(['none', 'one', 'both'])('uses native extract colors only to resolve a unique candidate (%s)', async marks => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    const revised = 'The first boundary remains, the wording in the middle changed, the last boundary remains.';
    const topic = (id: number, body: string, children = '') =>
      '<SuperMemoElement><ID>' + id + '</ID><Type>Topic</Type><Title>Topic ' + id + '</Title><Content><Question><![CDATA['
      + body + ']]></Question></Content>' + children + '</SuperMemoElement>';
    const parent = '<p>' + revised + '</p><p>A second distinct selection.</p>'
      + (marks === 'both' ? '<p><span class="extract">A repeated passage.</span></p>' : '<p>A repeated passage.</p>')
      + (marks === 'none' ? '<p>A repeated passage.</p>'
        : '<p><font style="background-color:#7be1e1">A repeated</font> <font style="background-color:#7be1e1">passage.</font></p>');
    const children = topic(2, 'The first boundary remains, a brief paraphrase, the last boundary remains.')
      + topic(3, 'A second distinct selection.<hr SuperMemo><SuperMemoReference>#Title: Parent</SuperMemoReference>')
      + topic(4, 'A repeated passage.') + topic(5, 'Text that has no surviving evidence.');
    const xml = '<SuperMemoCollection><Count>5</Count>' + topic(1, parent, children) + '</SuperMemoCollection>';
    const elements = readSuperMemoXmlDraft(new DOMParser().parseFromString(xml, 'application/xml'));
    const args = { elements, percent: 0 };
    const result = await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, args);
    expect(result).toMatchObject({ imported: 5 });
    expect(await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, args)).toEqual(result);
    peer.reopen();
    const get = peer.sqlite.prepare('SELECT id, parent_id, content, anchor_link FROM nodes WHERE title = ?');
    const node = (id: number) => get.get('Topic ' + id) as { id: string; parent_id: string; content: string; anchor_link: string | null };
    const parentNode = node(1);
    for (const [id, originalText] of [[2, revised], [3, 'A second distinct selection.']] as const) {
      const from = parentNode.content.indexOf(originalText);
      expect(node(id).parent_id).toBe(parentNode.id);
      expect(JSON.parse(node(id).anchor_link!)).toMatchObject({
        kind: 'highlight', locator: { from, to: from + originalText.length, originalText }
      });
    }
    expect(node(4).parent_id).toBe(parentNode.id);
    if (marks === 'one') expect(JSON.parse(node(4).anchor_link!)).toMatchObject({
      kind: 'highlight', locator: { from: parentNode.content.lastIndexOf('A repeated passage.'), originalText: 'A repeated passage.' }
    });
    else expect(node(4).anchor_link).toBeNull();
    expect(node(5)).toMatchObject({ parent_id: parentNode.id, anchor_link: null });
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});
