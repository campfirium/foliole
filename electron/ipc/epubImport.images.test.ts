// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-epub-import-images-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { runEpubImport } from './epubImport.js';
import { createTestZip } from './testZipBuilder.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-import-images-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function writeEpub(fileName: string, entries: Array<{ content: string | Uint8Array; name: string }>) {
  const filePath = path.join(tempRoot, fileName);
  await fs.writeFile(filePath, createTestZip(entries.map((entry) => ({ ...entry, compression: 'store' as const }))));
  return filePath;
}

function source(filePath: string) {
  return { adapterId: 'text_file' as const, filePath, kind: 'epub' as const, sourceName: path.basename(filePath) };
}

it('imports embedded chapter images and rewrites relative epub image paths to stored attachments', async () => {
  const filePath = await writeEpub('embedded-images.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Image Book</dc:title></metadata><manifest><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/><item id="image" href="images/00006.jpeg" media-type="image/jpeg"/></manifest><spine><itemref idref="chapter"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content:
        '<html><head><title>Picture Chapter</title></head><body><p>Intro paragraph.</p><img src="../images/00006.jpeg" alt="Image"/><p>Outro paragraph.</p></body></html>',
      name: 'OPS/text/chapter.xhtml'
    },
    {
      content: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) as unknown as string,
      name: 'OPS/images/00006.jpeg'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-01T12:12:00.000Z');
  const database = openDatabaseConnection().sqlite;
  const child = database
    .prepare(
      `SELECT n.id, n.content, n.body_blob_hash, CAST(cbd.data AS TEXT) AS body_blob_data
       FROM nodes n
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       JOIN node_order o ON o.node_id = n.id
       WHERE n.parent_id = ?
       ORDER BY o.position ASC
       LIMIT 1`
    )
    .get(imported.nodeId) as { body_blob_data: string; body_blob_hash: string; content: string; id: string };
  const attachments = listNodeAttachments(child.id);

  expect(imported.resultStatus).toBe('imported');
  expect(imported.degradedReason).toBeNull();
  expect(child.content).toContain('Intro paragraph.');
  expect(child.content).toContain('Outro paragraph.');
  expect(child.content).toContain('![Image](asset://');
  expect(child.content).not.toContain('../images/00006.jpeg');
  expect(child.content).not.toContain('[EPUB image not imported:');
  expect(child.body_blob_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(child.body_blob_data).toBe(child.content);
  expect(attachments).toHaveLength(1);
  expect(attachments[0]?.attachment.mimeType).toBe('image/jpeg');
  expect(attachments[0]?.attachment.originalName).toBe('00006.jpeg');
});
