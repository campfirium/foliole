// @vitest-environment node
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));

import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { downloadReadwiseOriginalEpubFile } from '../import/readwiseOriginalEpubFileDownload.js';
import { prepareOriginalEpubCandidate } from '../import/readwiseOriginalEpubPreparation.js';

import { runEpubImport } from './epubImport.js';
import { bookZip, createLargeStoredImageBook, forgeEntrySize } from './epubStreaming.testSupport.js';

let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-large-import-'));
  appDataDir = path.join(root, 'library');
  initializeDatabase();
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('imports a 272 MiB EPUB with 68 MiB images locally and through streamed Readwise preparation', async () => {
  const filePath = path.join(root, 'large.epub');
  const { imageSize } = await createLargeStoredImageBook(filePath);
  expect((await fs.stat(filePath)).size).toBeGreaterThan(256 * 1024 * 1024);
  const result = await runEpubImport({
    adapterId: 'text_file', kind: 'epub', filePath, sourceName: 'large.epub'
  }, '2026-10-04T00:00:00.000Z');
  expect(result.resultStatus).toBe('imported');
  const driver = openDatabaseConnection().driver;
  const chapter = driver.queryOne<{ id: string; content: string }>(
    `SELECT n.id, ${buildNodeBodyContentSql()} content FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash=n.body_blob_hash WHERE n.parent_id=?`, [result.nodeId]
  )!;
  expect(chapter.content).toContain('All images survive.');
  expect(chapter.content.match(/asset:\/\//g)).toHaveLength(4);
  const attachment = listNodeAttachments(chapter.id)[0]!;
  expect((await fs.stat(resolveAttachmentStoragePath(attachment.attachmentId, undefined, attachment.attachment.mimeType!))).size).toBe(imageSize);

  const downloaded = await downloadReadwiseOriginalEpubFile('https://bucket.s3.amazonaws.com/large.epub', {
    fetchImpl: async () => new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>, {
      headers: { 'content-type': 'application/epub+zip', 'content-length': String((await fs.stat(filePath)).size) }
    })
  });
  try {
    expect((await fs.stat(downloaded.filePath)).size).toBe((await fs.stat(filePath)).size);
    const candidate = await prepareOriginalEpubCandidate({
      filePath: downloaded.filePath, title: 'Large Book', now: '2026-10-04T00:00:00.000Z'
    });
    expect(candidate.images.sections[0]?.content.match(/asset:\/\//g)).toHaveLength(4);
    expect(candidate.stages[0]?.sizeBytes).toBe(imageSize);
  } finally { await downloaded.dispose(); }
  await expect(fs.stat(downloaded.filePath)).rejects.toMatchObject({ code: 'ENOENT' });
}, 120_000);

it('rejects a forged chapter before writing any library content', async () => {
  const zip = bookZip(`<html><body><p>${'a'.repeat(64 * 1024)}</p></body></html>`);
  forgeEntrySize(zip, 'OPS/chapter.xhtml', 1);
  const filePath = path.join(root, 'forged.epub');
  await fs.writeFile(filePath, zip);
  const driver = openDatabaseConnection().driver;
  const before = driver.queryAll('SELECT * FROM nodes');
  await expect(runEpubImport({
    adapterId: 'text_file', kind: 'epub', filePath, sourceName: 'forged.epub'
  }, '2026-10-04T00:00:00.000Z')).rejects.toThrow('exceeds declared size');
  expect(driver.queryAll('SELECT * FROM nodes')).toEqual(before);
});
