// @vitest-environment node

import './readwisePdfResync.testSupport.js';

import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';


import { deferred } from '../../src/test/deferred.js';
import { resolveAttachmentFile, resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { disconnectReadwiseApi } from './readwiseApiConnection.js';
import {
  bytes, connectionRef, database, documentId, hash, nodeId, now, pauseAfterPdfParsing,
  readHighlight, readTopic, remoteFetch, root, writeLocalPdf
} from './readwisePdfResync.testSupport.js';
import { resyncReadwiseSource } from './readwiseSourceResyncAction.js';

it('restores a missing localized original before reporting that the PDF resync succeeded', async () => {
  const fetchImpl = remoteFetch('https://bucket.s3.amazonaws.com/original.pdf');
  const before = readTopic();
  await expect(resyncReadwiseSource(nodeId, { fetchImpl, minIntervalMs: 0 })).resolves.toMatchObject({ status: 'completed' });
  expect(fetchImpl.mock.calls.map(([input]) => new URL(String(input)).pathname))
    .toEqual(['/api/v3/list/', '/original.pdf', '/api/v2/export/']);
  await expect(resolveAttachmentFile(`${hash}.pdf`)).resolves.toMatchObject({ status: 'ready' });
  expect(JSON.parse(readHighlight()?.anchor_link ?? '{}')).toMatchObject({ locator: { page: 1 } });
  expect(readTopic()).toEqual(before);
});

it('reports failure and makes no Topic writes if a missing localized original is unavailable from Readwise', async () => {
  const before = { topic: readTopic(), highlight: readHighlight(), source: loadReadwiseApiImportSource(connectionRef, documentId) };
  await expect(resyncReadwiseSource(nodeId, { fetchImpl: remoteFetch(null), minIntervalMs: 0 })).resolves.toMatchObject({
    error_code: 'original_file_not_distributed', status: 'failed'
  });
  expect(readTopic()).toEqual(before.topic);
  expect(readHighlight()).toEqual(before.highlight);
  expect(loadReadwiseApiImportSource(connectionRef, documentId)).toEqual(before.source);
});

it('fails when a repaired path still cannot be opened as a managed original', async () => {
  const storagePath = resolveAttachmentStoragePath(hash, undefined, 'application/pdf');
  const externalPath = path.join(root, 'outside.pdf');
  await writeFile(externalPath, bytes);
  await mkdir(path.dirname(storagePath), { recursive: true });
  await symlink(externalPath, storagePath);
  const fetchImpl = remoteFetch('https://bucket.s3.amazonaws.com/original.pdf');
  const before = readHighlight();
  await expect(resyncReadwiseSource(nodeId, { fetchImpl, minIntervalMs: 0 })).resolves.toMatchObject({
    status: 'failed'
  });
  expect(fetchImpl.mock.calls.map(([input]) => new URL(String(input)).pathname))
    .toEqual(['/api/v3/list/', '/original.pdf', '/api/v2/export/']);
  expect(readHighlight()).toEqual(before);
});

it.each(['connection disconnected', 'attachment link changed', 'Topic trashed'])(
  'discards a parsed PDF highlight when the %s before placement', async change => {
    await writeLocalPdf();
    const before = readHighlight();
    const parsed = deferred<void>();
    const resume = deferred<void>();
    pauseAfterPdfParsing(() => { parsed.resolve(); return resume.promise; });
    const result = resyncReadwiseSource(nodeId, { fetchImpl: remoteFetch(null), minIntervalMs: 0 });
    try {
      await Promise.race([parsed.promise, result.then(value => { throw new Error(JSON.stringify(value)); })]);
      if (change === 'connection disconnected') {
        expect(disconnectReadwiseApi().status).toBe('disconnected');
        expect(loadReadwiseRemoteSource()?.connectionRef).toBe(connectionRef);
      } else if (change === 'attachment link changed') {
        database.driver.execute("UPDATE nodes SET resource_references = '[]' WHERE id = ?", [nodeId]);
      } else {
        database.driver.execute('UPDATE nodes SET deleted_at = ? WHERE id = ?', [now, nodeId]);
      }
    } finally {
      resume.resolve();
    }
    await expect(result).resolves.toMatchObject({ status: 'failed' });
    expect(readHighlight()).toEqual(before);
  });
