// @vitest-environment node
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { projectCurrentParentOrderWithDbPort } from '../../lib/core/sync/currentParentOrderStore';
import type { NativeCompanionFramedFileRequest } from '../../lib/platform/nativeCompanionFramedFilesContract';
import { companionEpubBook, EPUB_IMAGE, EPUB_ICON } from '../../tests/fixtures/companionEpubBook';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { loadIosCompanionNodeDocument } from '../shared/platform/companion/runtime/iosCompanionActiveDatabaseReads';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { companionAttachmentNativeFiles } from '../shared/platform/companion/sync/framed/companionAttachmentNativeFiles.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { createCompanionFileImportHandler } from './companionFileImportActions';

const native = vi.hoisted(() => ({ access: null as null | ((input: NativeCompanionFramedFileRequest) => Promise<unknown>), fail: false }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: () => ({
    ...createCompanionNativeSyncStub(), accessFramedSyncFile: async (input: NativeCompanionFramedFileRequest) => {
      if (input.operation === 'remove') return {};
      if (native.fail && input.operation === 'attachment' && input.action === 'publish') throw new Error('Unavailable');
      return native.access!(input);
    }
  }) };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let directory: string;
let imageKey: string;
beforeEach(async () => {
  library = await createSearchLibrary(0); native.fail = false;
  directory = path.join(library.root, 'attachments'); await mkdir(directory);
  native.access = companionAttachmentNativeFiles(directory);
  imageKey = `${createHash('sha256').update(EPUB_IMAGE).digest('hex')}.png`;
});
afterEach(async () => { await library.close(); });
async function importBook(bytes: Uint8Array = companionEpubBook(), failRefresh = false) {
  return createCompanionFileImportHandler({ refreshAfterMutation: async () => {
    if (failRefresh) throw new Error('Refresh unavailable');
    return (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  } })(new File([Uint8Array.from(bytes)], 'Book.epub'));
}
async function children(id: string) {
  const order = await getIosCompanionDatabaseOwner().read(db => projectCurrentParentOrderWithDbPort(db, id, '2026-11-03T08:00:00Z'));
  return Promise.all(order.map(child => loadCompanionWorkspaceNode(child)));
}
it('imports the desktop book hierarchy, ordered chapters and embedded images, then reopens without an EPUB original', async () => {
  const result = await importBook();
  if ('error' in result) throw new Error(result.error);
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toMatchObject({ title: 'Pocket Book',
    openingText: expect.stringContaining('First chapter body.'),
    resourceReferences: [{ storage_key: imageKey, original_name: 'cover.png', role: 'image' }] });
  const part = (await children(result.nodeId))[0]!;
  expect(part).toMatchObject({ title: 'Part One', parentNodeId: result.nodeId });
  const sections = await children(part.id);
  expect(sections.map(node => node!.title)).toEqual(['First section', 'Second section']);
  expect(sections[0]!.content).toContain(`![Figure](asset://${imageKey})`);
  expect(await readFile(path.join(directory, imageKey))).toEqual(EPUB_IMAGE);
  const iconKey = `${createHash('sha256').update(EPUB_ICON).digest('hex')}.gif`;
  expect((await readdir(directory)).filter(name => !name.startsWith('.')).sort()).toEqual([imageKey, iconKey].sort());
  expect(await readFile(path.join(directory, iconKey))).toEqual(EPUB_ICON);
  expect(library.database.prepare('SELECT source_kind,result_status FROM import_runs').get()).toEqual({ source_kind: 'epub', result_status: 'imported' });
  await reopenSearchLibrary(library.root, '2026-11-03T08:00:00Z');
  expect((await children(part.id)).map(node => node!.id)).toEqual(sections.map(node => node!.id));
  expect((await loadIosCompanionNodeDocument(sections[1]!.id))!.content).toContain('Second chapter body.');
  expect(await readFile(path.join(directory, imageKey))).toEqual(EPUB_IMAGE);
});
it('imports a book with no images without requiring attachment writes', async () => {
  const result = await importBook(companionEpubBook(false));
  expect(result).toHaveProperty('nodeId'); expect(await readdir(directory)).toEqual([]);
});
it('rolls back every chapter, version and import record if metadata commit fails', async () => {
  library.database.exec("CREATE TRIGGER reject_import BEFORE INSERT ON import_runs BEGIN SELECT RAISE(ABORT,'Unavailable'); END");
  expect(await importBook()).toEqual({ error: 'save-failed' });
  expect(library.database.prepare("SELECT * FROM nodes WHERE kind='topic'").all()).toEqual([]);
  expect(library.database.prepare('SELECT * FROM node_sync_versions').all()).toEqual([]);
  expect(library.database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
  expect(await readFile(path.join(directory, imageKey))).toEqual(EPUB_IMAGE);
});
it('does not publish book metadata if an image file cannot be published', async () => {
  native.fail = true;
  expect(await importBook()).toEqual({ error: 'save-failed' });
  expect(library.database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
  expect(library.database.prepare("SELECT * FROM nodes WHERE kind='topic'").all()).toEqual([]);
});
it('retries only refreshing after a committed complete book', async () => {
  const result = await importBook(companionEpubBook(), true);
  expect(result).toHaveProperty('retryRefresh'); expect(result).toHaveProperty('nodeId');
  expect(library.database.prepare('SELECT count(*) AS count FROM import_runs').get()).toEqual({ count: 1 });
});
it('rejects an invalid container without writing topics or stored attachments', async () => {
  expect(await importBook(new TextEncoder().encode('Not a ZIP'))).toEqual({ error: 'save-failed' });
  expect(await readdir(directory)).toEqual([]);
  expect(library.database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
});

it('rejects a damaged ZIP checksum before storing book metadata', async () => {
  const bytes = companionEpubBook(false);
  let offset = bytes.readUInt32LE(bytes.length - 6);
  while (offset < bytes.length - 22) {
    const length = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + length).toString();
    if (name === 'OPS/one.xhtml') { bytes.writeUInt32LE(1, offset + 16); break; }
    offset += 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  expect(await importBook(bytes)).toEqual({ error: 'save-failed' });
  expect(library.database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
});
it('keeps book publication bound to the library selected before reading the file', async () => {
  const result = await createCompanionFileImportHandler({ refreshAfterMutation: async () => null })({
    name: 'Book.epub', arrayBuffer: async () => {
      await reopenSearchLibrary(library.root, '2026-11-03T09:00:00Z');
      return Uint8Array.from(companionEpubBook()).buffer;
    }
  });
  expect(result).toEqual({ error: 'save-failed' });
  expect(await readdir(directory)).toEqual([]);
});
it('does not save any chapters when cancellation happens while publishing book images', async () => {
  const controller = new AbortController(); const access = native.access!;
  native.access = async input => {
    const result = await access(input);
    if (input.operation === 'attachment' && input.action === 'append') controller.abort();
    return result;
  };
  const result = await createCompanionFileImportHandler({ refreshAfterMutation: async () => null })(
    new File([Uint8Array.from(companionEpubBook())], 'Book.epub'), controller.signal);
  expect(result).toEqual({ error: 'save-failed' });
  expect(library.database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
  expect(library.database.prepare("SELECT * FROM nodes WHERE kind='topic'").all()).toEqual([]);
});

it('creates independent roots and chapters when the same book is selected again', async () => {
  const first = await importBook(); const second = await importBook();
  if ('error' in first || 'error' in second) throw new Error('Book import failed');
  expect(first.nodeId).not.toBe(second.nodeId);
  const firstPart = (await children(first.nodeId))[0]!; const secondPart = (await children(second.nodeId))[0]!;
  expect(firstPart.id).not.toBe(secondPart.id);
  expect(library.database.prepare('SELECT count(*) AS count FROM import_runs').get()).toEqual({ count: 2 });
  expect((await readdir(directory)).filter(name => !name.startsWith('.'))).toHaveLength(2);
});
it('retains available chapters and records a visible degraded result for a missing chapter', async () => {
  const result = await importBook(companionEpubBook(false, true));
  expect(result).toHaveProperty('nodeId'); expect(result).toHaveProperty('importWarning', 'conversion');
  expect(library.database.prepare('SELECT result_status FROM import_runs').get()).toEqual({ result_status: 'degraded' });
  expect(library.database.prepare("SELECT title FROM nodes WHERE title='First section'").get()).toEqual({ title: 'First section' });
});
