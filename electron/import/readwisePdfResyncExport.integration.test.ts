// @vitest-environment node

import './readwisePdfResync.testSupport.js';

import { expect, it, vi } from 'vitest';

import { resolveAttachmentFile } from '../attachments/resourceResolver.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import { disconnectReadwiseApi } from './readwiseApiConnection.js';
import {
  connectionRef, database, documentId, exportBook, exportPage, hash,
  nodeId, readHighlight, readTopic, remoteFetch, writeLocalPdf
} from './readwisePdfResync.testSupport.js';
import { resyncReadwiseSource } from './readwiseSourceResyncAction.js';

it.each(['existing', 'missing'])('updates the %s PDF with only its own annotations across export pages', async original => {
  if (original === 'existing') await writeLocalPdf();
  const requests: URL[] = [];
  const download = remoteFetch('https://bucket.s3.amazonaws.com/original.pdf');
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname !== '/api/v2/export/') return download(input);
    requests.push(url);
    if (url.searchParams.has('updatedAfter')) return exportPage(null);
    return url.searchParams.has('pageCursor')
      ? exportPage(null, exportBook(documentId, { external_id: 'new', text: 'alpha keyword' }))
      : exportPage('page-2', exportBook('other-pdf', { external_id: 'foreign', text: 'alpha keyword' }),
        exportBook(documentId, { external_id: 'highlight', note: 'Updated from Reader.', text: 'beta keyword' }));
  });
  const before = readTopic();
  const resync = () => resyncReadwiseSource(nodeId, { fetchImpl, minIntervalMs: 0 });
  await expect(resync()).resolves.toMatchObject({ status: 'completed' });
  expect(readHighlight()?.content).toBe('beta keyword\n※ Updated from Reader.');
  expect(JSON.parse(readHighlight()?.anchor_link ?? '{}')).toMatchObject({ locator: { page: 2 } });
  expect(JSON.parse(readHighlight('new')?.anchor_link ?? '{}')).toMatchObject({ locator: { page: 1 } });
  expect(readHighlight('foreign')).toBeUndefined();
  expect(readTopic()).toEqual(before);
  expect(requests.map(url => url.searchParams.get('pageCursor'))).toEqual([null, 'page-2']);
  expect(download).toHaveBeenCalledTimes(original === 'existing' ? 0 : 2);
  const checkedAt = loadReadwiseApiImportSource(connectionRef, documentId)?.state.pdfAnnotationsCheckedAt;
  expect(checkedAt).toBeDefined();
  await expect(resync()).resolves.toMatchObject({ status: 'completed' });
  expect(Date.parse(requests[2]?.searchParams.get('updatedAfter') ?? '')).toBeLessThan(Date.parse(checkedAt!));
  expect(loadReadwiseApiImportSource(connectionRef, documentId)?.annotations.map(item => item.remoteId).sort())
    .toEqual(['highlight', 'new']);
});

it.each([
  ['http', 'readwise_api_http_500'],
  ['abort', 'readwise_pdf_resync_cancelled'],
  ['cycle', 'readwise_api_cursor_cycle'],
  ['limit', 'readwise_pdf_export_page_limit'],
  ['invalid', 'readwise_pdf_export_highlights_invalid'],
  ['write', 'readwise_pdf_resync_write_failed']
])('leaves the PDF and all annotations unchanged after export %s', async (failure, error_code) => {
  const missingOriginal = failure === 'http';
  if (!missingOriginal) await writeLocalPdf();
  if (failure === 'write') {
    database.sqlite.exec(`CREATE TRIGGER reject_new_pdf_annotation BEFORE INSERT ON nodes
      WHEN NEW.content = 'alpha keyword' BEGIN SELECT RAISE(ABORT, 'readwise_pdf_resync_write_failed'); END`);
  }
  const before = { highlight: readHighlight(), source: loadReadwiseApiImportSource(connectionRef, documentId), topic: readTopic() };
  const controller = new AbortController();
  const download = remoteFetch('https://bucket.s3.amazonaws.com/original.pdf');
  let page = 0;
  const fetchImpl = vi.fn<typeof fetch>(async input => {
    if (new URL(String(input)).pathname !== '/api/v2/export/') return download(input);
    page += 1;
    if (page > 300) throw new Error('Export was not bounded');
    if (page === 1) return exportPage('next', exportBook(documentId, { external_id: 'new', text: 'alpha keyword' }));
    if (failure === 'http') return new Response(null, { status: 500 });
    if (failure === 'invalid') return exportPage(null, { external_id: documentId, source: 'reader' });
    if (failure === 'write') return exportPage(null, exportBook(documentId, { external_id: 'highlight', text: 'beta keyword' }));
    if (failure === 'abort') {
      controller.abort();
      return exportPage(null);
    }
    return exportPage(failure === 'cycle' ? 'next' : String(page));
  });
  await expect(resyncReadwiseSource(nodeId, { fetchImpl, minIntervalMs: 0, signal: controller.signal }))
    .resolves.toMatchObject({ error_code, status: 'failed' });
  expect(page).toBeGreaterThanOrEqual(2);
  expect(page).toBeLessThanOrEqual(300);
  expect(readHighlight('new')).toBeUndefined();
  expect(readHighlight()).toEqual(before.highlight);
  expect(readTopic()).toEqual(before.topic);
  expect(loadReadwiseApiImportSource(connectionRef, documentId)).toEqual(before.source);
  if (missingOriginal) await expect(resolveAttachmentFile(`${hash}.pdf`)).resolves.toMatchObject({ status: 'missing_file' });
});

it('cancels an in-flight export request when the Readwise account disconnects', async () => {
  await writeLocalPdf();
  const started = Promise.withResolvers<void>();
  const fetchImpl = vi.fn<typeof fetch>(async (_input, options) => {
    const signal = options?.signal;
    started.resolve();
    return new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  const before = readHighlight();
  const result = resyncReadwiseSource(nodeId, { fetchImpl, minIntervalMs: 0 });
  await Promise.race([started.promise, result.then(value => { throw new Error(JSON.stringify(value)); })]);
  expect(disconnectReadwiseApi().status).toBe('disconnected');
  await expect(result).resolves.toMatchObject({ error_code: 'readwise_pdf_resync_cancelled', status: 'failed' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(readHighlight()).toEqual(before);
});

it('preserves local edits and deleted highlights while adding a new remote highlight', async () => {
  await writeLocalPdf();
  const fetchImpl = vi.fn<typeof fetch>(async () => exportPage(null,
    exportBook(documentId, { external_id: 'highlight', text: 'beta keyword' },
      { external_id: 'deleted', text: 'gamma keyword' })));
  const resync = () => resyncReadwiseSource(nodeId, { fetchImpl, minIntervalMs: 0 });
  await expect(resync()).resolves.toMatchObject({ status: 'completed' });
  const bindings = loadReadwiseApiImportSource(connectionRef, documentId)?.annotations ?? [];
  const edited = bindings.find(item => item.remoteId === 'highlight')!;
  const deleted = bindings.find(item => item.remoteId === 'deleted')!;
  const now = new Date().toISOString();
  database.driver.execute('UPDATE nodes SET content = ?, updated_at = ? WHERE id = ?', ['My edited excerpt', now, edited.nodeId]);
  database.driver.execute('UPDATE nodes SET deleted_at = ? WHERE id = ?', [now, deleted.nodeId]);
  fetchImpl.mockResolvedValueOnce(exportPage(null, exportBook(documentId,
    { external_id: 'highlight', text: 'gamma keyword' },
    { external_id: 'deleted', text: 'beta keyword' },
    { external_id: 'new', text: 'alpha keyword' })));
  await expect(resync()).resolves.toMatchObject({ status: 'completed' });
  expect(readHighlight()?.content).toBe('My edited excerpt');
  expect(database.driver.queryOne('SELECT deleted_at FROM nodes WHERE id = ?', [deleted.nodeId])).toEqual({ deleted_at: now });
  expect(readHighlight('new')?.content).toBe('alpha keyword');
});
