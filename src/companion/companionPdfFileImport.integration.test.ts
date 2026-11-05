// @vitest-environment node
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import * as pdfPageReader from '../../lib/core/pdf/pdfPageTextExtraction';
import type { NativeCompanionFramedFileRequest } from '../../lib/platform/nativeCompanionFramedFilesContract';
import { resetAttachmentResourceResolutionCacheForTest, resolveRuntimeAttachmentResource } from '../shared/platform/attachmentResources';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { loadIosCompanionNodeDocument, loadIosPdfPageText, searchIosPdfPageText } from '../shared/platform/companion/runtime/iosCompanionActiveDatabaseReads';
import { companionAttachmentNativeFiles } from '../shared/platform/companion/sync/framed/companionAttachmentNativeFiles.testSupport';
import { resolveLoadedCompanionArticle } from '../shared/platform/companionReadableArticle';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { createCompanionFileImportHandler } from './companionFileImportActions';
import { resolveCompanionPdfReadingEntry } from './CompanionPdfReadingEntry';

const native = vi.hoisted(() => ({ access: null as null | ((input: NativeCompanionFramedFileRequest) => Promise<unknown>), fail: '', publishedPath: '' }));
vi.mock('@capacitor/core', async () => {
  const { access } = await import('node:fs/promises');
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false, convertFileSrc: (url: string) => url }, registerPlugin: () => ({
    ...createCompanionNativeSyncStub(), resolveAttachmentResource: async () => {
      try { await access(native.publishedPath); return { status: 'ready', resource_url: native.publishedPath }; }
      catch { return { status: 'missing_file' }; }
    }, accessFramedSyncFile: async (input: NativeCompanionFramedFileRequest) => {
      if (input.operation === 'remove') return {};
      if (input.operation === 'attachment' && input.action === native.fail) { native.fail = ''; throw new Error('File write unavailable'); }
      return native.access!(input);
    }
  }) };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let directory: string;
let bytes: Buffer;
let storageKey: string;
beforeEach(async () => {
  native.fail = '';
  resetAttachmentResourceResolutionCacheForTest();
  library = await createSearchLibrary(0);
  directory = path.join(library.root, 'attachments');
  await mkdir(directory);
  native.access = companionAttachmentNativeFiles(directory);
  bytes = await readFile('tests/desktop/fixtures/pdf-user-journey.pdf');
  storageKey = `${createHash('sha256').update(bytes).digest('hex')}.pdf`;
  native.publishedPath = path.join(directory, storageKey);
});
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });

async function importPdf(name = 'Reading.pdf', source: Uint8Array = bytes, failRefresh = false) {
  return createCompanionFileImportHandler({ refreshAfterMutation: async () => {
    if (failRefresh) throw new Error('Refresh unavailable');
    return (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  } })(new File([Uint8Array.from(source)], name));
}

it('publishes byte-identical original PDF storage and persists a reopenable original-reader reference', async () => {
  const result = await importPdf();
  if ('error' in result) throw new Error(result.error);
  expect(await readFile(path.join(directory, storageKey))).toEqual(bytes);
  const expected = { title: 'Reading',
    resourceReferences: [{ storage_key: storageKey, original_name: 'Reading.pdf', role: 'reference' }] };
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toMatchObject(expected);
  expect(library.database.prepare('SELECT source_kind,result_status FROM import_runs').get())
    .toEqual({ source_kind: 'pdf', result_status: 'imported' });
  await reopenSearchLibrary(library.root, '2026-11-03T05:00:00Z');
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toMatchObject(expected);
  expect(await readFile(path.join(directory, storageKey))).toEqual(bytes);
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  const article = resolveLoadedCompanionArticle(snapshot, await loadIosCompanionNodeDocument(result.nodeId));
  expect(article).toMatchObject({ title: 'Reading', pdfAttachmentId: storageKey.slice(0, 64) });
  expect(resolveCompanionPdfReadingEntry(article!)).toBe('text');
  expect(article!.content).toContain('Foliole PDF User Journey Page 1 alpha keyword');
  expect(article!.content).toContain('Foliole PDF User Journey Page 3 gamma keyword');
  expect(await searchIosPdfPageText('gamma')).toMatchObject([{ attachment_id: storageKey.slice(0, 64), page: 3 }]);
  expect(await loadIosPdfPageText(storageKey.slice(0, 64))).toEqual([
    { page: 1, text: 'Foliole PDF User Journey Page 1 alpha keyword', page_width: 612, page_height: 792 },
    { page: 2, text: 'Foliole PDF User Journey Page 2 beta keyword', page_width: 612, page_height: 792 },
    { page: 3, text: 'Foliole PDF User Journey Page 3 gamma keyword', page_width: 612, page_height: 792 }
  ]);
});

it('reuses an existing identical original for a second independent PDF import', async () => {
  const first = await importPdf();
  const second = await importPdf('Second.pdf');
  expect(first).toHaveProperty('nodeId'); expect(second).toHaveProperty('nodeId');
  expect((await readdir(directory)).filter(name => name.endsWith('.pdf'))).toEqual([storageKey]);
  expect(library.database.prepare('SELECT count(*) AS count FROM import_runs').get()).toEqual({ count: 2 });
  expect(await readFile(path.join(directory, storageKey))).toEqual(bytes);
});

it.each(['append', 'publish'])('does not create a topic or import record when original %s fails', async action => {
  native.fail = action;
  expect(await importPdf()).toEqual({ error: 'save-failed' });
  expect(library.database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
  expect(library.database.prepare("SELECT id FROM nodes WHERE kind='topic'").all()).toEqual([]);
});

it('rolls back failed metadata without deleting a verified original that may be reused', async () => {
  library.database.exec("CREATE TRIGGER reject_import BEFORE INSERT ON import_runs BEGIN SELECT RAISE(ABORT,'Unavailable'); END");
  expect(await importPdf()).toEqual({ error: 'save-failed' });
  expect(library.database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
  expect(library.database.prepare("SELECT id FROM nodes WHERE kind='topic'").all()).toEqual([]);
  expect(await readFile(path.join(directory, storageKey))).toEqual(bytes);
});

it('keeps a committed original import distinct from a list-refresh failure', async () => {
  const result = await importPdf('Reading.pdf', bytes, true);
  expect(result).toHaveProperty('nodeId'); expect(result).toHaveProperty('retryRefresh');
  expect(library.database.prepare('SELECT count(*) AS count FROM import_runs').get()).toEqual({ count: 1 });
  expect(await readFile(path.join(directory, storageKey))).toEqual(bytes);
});

it('rejects a renamed non-PDF without creating a published original or topic', async () => {
  expect(await importPdf('Invalid.pdf', new TextEncoder().encode('Not a PDF'))).toEqual({ error: 'save-failed' });
  expect(library.database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
  expect(await readdir(directory)).toEqual([]);
});

it('does not write attachments into a library generation selected while reading the external file', async () => {
  const access = vi.fn(native.access!);
  native.access = access;
  const result = await createCompanionFileImportHandler({ refreshAfterMutation: async () => null })({
    name: 'Reading.pdf', arrayBuffer: async () => {
      await reopenSearchLibrary(library.root, '2026-11-03T06:00:00Z');
      access.mockClear();
      return Uint8Array.from(bytes).buffer;
    }
  });
  expect(result).toEqual({ error: 'save-failed' });
  expect(access).not.toHaveBeenCalled();
  expect(await readdir(directory)).toEqual([]);
});

it('opens an imported original even if the same attachment was previously reported missing', async () => {
  expect(await resolveRuntimeAttachmentResource(`asset://${storageKey}`)).toMatchObject({ status: 'missing_file' });
  expect(await importPdf()).toHaveProperty('nodeId');
  expect(await resolveRuntimeAttachmentResource(`asset://${storageKey}`)).toMatchObject({
    status: 'ready', resource_url: path.join(directory, storageKey)
  });
});

it('cancels during the original write and retries from the same partial storage without losing bytes', async () => {
  const controller = new AbortController();
  const access = native.access!;
  native.access = async input => {
    const result = await access(input);
    if (input.operation === 'attachment' && input.action === 'append') controller.abort();
    return result;
  };
  const handler = createCompanionFileImportHandler({ refreshAfterMutation: async () => null });
  expect(await handler(new File([Uint8Array.from(bytes)], 'Reading.pdf'), controller.signal)).toEqual({ error: 'save-failed' });
  expect(library.database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
  expect((await readdir(directory)).filter(name => name.endsWith('.pdf'))).toEqual([]);
  native.access = access;
  expect(await importPdf()).toHaveProperty('nodeId');
  expect(await readFile(path.join(directory, storageKey))).toEqual(bytes);
});

it('keeps a malformed PDF original imported when page-text extraction fails', async () => {
  const broken = new TextEncoder().encode('%PDF-1.4\nThis document is truncated.');
  const result = await importPdf('Broken.pdf', broken);
  if ('error' in result) throw new Error(result.error);
  const hash = createHash('sha256').update(broken).digest('hex');
  expect(await readFile(path.join(directory, `${hash}.pdf`))).toEqual(Buffer.from(broken));
  expect(library.database.prepare('SELECT status,version FROM pdf_index_state WHERE attachment_id=?').get(hash))
    .toEqual({ status: 'failed', version: 1 });
  expect(await loadIosPdfPageText(hash)).toEqual([]);
  const article = await loadIosCompanionNodeDocument(result.nodeId);
  expect(article!.pdf_attachment_id).toBe(hash);
  expect(resolveCompanionPdfReadingEntry({ ...article!, nodeId: result.nodeId, pdfAttachmentId: hash })).toBe('original');
});

it('retains the original and rolls back derived pages when their transaction fails', async () => {
  library.database.exec("CREATE TRIGGER reject_pages BEFORE INSERT ON pdf_page_text BEGIN SELECT RAISE(ABORT,'Unavailable'); END");
  const result = await importPdf();
  expect(result).toHaveProperty('nodeId');
  expect(await readFile(path.join(directory, storageKey))).toEqual(bytes);
  expect(await loadIosPdfPageText(storageKey.slice(0, 64))).toEqual([]);
  expect(library.database.prepare('SELECT * FROM pdf_text_artifact').all()).toEqual([]);
  expect(library.database.prepare('SELECT status FROM pdf_index_state').get()).toEqual({ status: 'failed' });
  expect(library.database.prepare('SELECT count(*) AS count FROM import_runs').get()).toEqual({ count: 1 });
});

it('keeps image-only PDFs readable as originals while persisting their page dimensions', async () => {
  const imageOnly = Buffer.from(bytes.toString('latin1').replace(/BT[\s\S]*?ET/gu, text => ' '.repeat(text.length)), 'latin1');
  const result = await importPdf('Scanned.pdf', imageOnly);
  if ('error' in result) throw new Error(result.error);
  const hash = createHash('sha256').update(imageOnly).digest('hex');
  expect(await loadIosPdfPageText(hash)).toEqual([1, 2, 3].map(page => ({ page, text: '', page_width: 612, page_height: 792 })));
  const document = await loadIosCompanionNodeDocument(result.nodeId);
  expect(resolveCompanionPdfReadingEntry({ ...document!, nodeId: result.nodeId, pdfAttachmentId: hash })).toBe('original');
});

it('keeps the committed original when extraction is cancelled after reading its first page', async () => {
  const controller = new AbortController();
  const read = pdfPageReader.readPdfTextPage;
  vi.spyOn(pdfPageReader, 'readPdfTextPage').mockImplementation(async (...args) => {
    const page = await read(...args); controller.abort(); return page;
  });
  const result = await createCompanionFileImportHandler({ refreshAfterMutation: async () => null })(
    new File([Uint8Array.from(bytes)], 'Reading.pdf'), controller.signal);
  expect(result).toHaveProperty('nodeId');
  expect(await readFile(path.join(directory, storageKey))).toEqual(bytes);
  expect(await loadIosPdfPageText(storageKey.slice(0, 64))).toEqual([]);
  expect(library.database.prepare('SELECT count(*) AS count FROM import_runs').get()).toEqual({ count: 1 });
});

it('does not write parsed pages to a different generation after reopening during extraction', async () => {
  const read = pdfPageReader.readPdfTextPage;
  vi.spyOn(pdfPageReader, 'readPdfTextPage').mockImplementation(async (...args) => {
    const page = await read(...args);
    if (args[1] === 1) await reopenSearchLibrary(library.root, '2026-11-03T07:00:00Z');
    return page;
  });
  expect(await importPdf()).toHaveProperty('nodeId');
  expect(await loadIosPdfPageText(storageKey.slice(0, 64))).toEqual([]);
  expect(await readFile(path.join(directory, storageKey))).toEqual(bytes);
});

it('preserves prior successful page data if a later import cannot replace its derived rows', async () => {
  await importPdf();
  const saved = await loadIosPdfPageText(storageKey.slice(0, 64));
  library.database.exec("CREATE TRIGGER reject_pages BEFORE INSERT ON pdf_page_text BEGIN SELECT RAISE(ABORT,'Unavailable'); END");
  expect(await importPdf('Again.pdf')).toHaveProperty('nodeId');
  expect(await loadIosPdfPageText(storageKey.slice(0, 64))).toEqual(saved);
  expect(library.database.prepare('SELECT status FROM pdf_index_state').get()).toEqual({ status: 'ready' });
});

it('records a parser failure even when its error message is empty', async () => {
  vi.spyOn(pdfPageReader, 'readPdfTextPage').mockRejectedValueOnce(new Error(''));
  expect(await importPdf()).toHaveProperty('nodeId');
  expect(await loadIosPdfPageText(storageKey.slice(0, 64))).toEqual([]);
  expect(library.database.prepare('SELECT status FROM pdf_index_state').get()).toEqual({ status: 'failed' });
});
