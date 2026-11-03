// @vitest-environment node
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeCompanionFramedFileRequest } from '../../lib/platform/nativeCompanionFramedFilesContract';
import { resetAttachmentResourceResolutionCacheForTest, resolveRuntimeAttachmentResource } from '../shared/platform/attachmentResources';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { loadIosCompanionNodeDocument } from '../shared/platform/companion/runtime/iosCompanionActiveDatabaseReads';
import { companionAttachmentNativeFiles } from '../shared/platform/companion/sync/framed/companionAttachmentNativeFiles.testSupport';
import { resolveLoadedCompanionArticle } from '../shared/platform/companionReadableArticle';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { createCompanionFileImportHandler } from './companionFileImportActions';
import { resolveCompanionPdfReadingEntry } from './CompanionPdfReadingEntry';

const native = vi.hoisted(() => ({ access: null as null | ((input: NativeCompanionFramedFileRequest) => Promise<unknown>), fail: '', publishedPath: '' }));
vi.mock('@capacitor/core', async () => {
  const { access } = await import('node:fs/promises');
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, convertFileSrc: (url: string) => url }, registerPlugin: () => ({
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
afterEach(async () => { await library.close(); });

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
  expect(resolveCompanionPdfReadingEntry(article!)).toBe('original');
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
