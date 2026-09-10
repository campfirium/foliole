// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { saveReadwiseApiStagePage } from '../database/readwiseApiImportState.js';

import { reimportCurrentTopicSource } from './currentSourceReimport.js';
import {
  materializeReadwiseApiDocument,
  shouldPrepareReadwiseApiEpubImages
} from './readwiseApiMaterialization.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-api-epub-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('creates a chapter container, chapter body, sections, and globally unique annotation placement once', () => {
  const document = epubFixture();
  const config = createDefaultReadwiseReaderConfig();

  expect(materializeReadwiseApiDocument({ config, connectionRef: 'connection', destination: 'inbox', document }))
    .toMatchObject({ annotationCount: 2, status: 'imported' });
  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'epub-1'"
  )!;
  const descendants = driver.queryAll<{ content: string; id: string; parent_id: string; title: string }>(
    `WITH RECURSIVE tree AS (
       SELECT id, parent_id, title, content FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
       UNION ALL SELECT n.id, n.parent_id, n.title, n.content FROM nodes n JOIN tree ON n.parent_id = tree.id
       WHERE n.deleted_at IS NULL
     ) SELECT * FROM tree`, [source.latest_node_id]
  );
  const chapter = descendants.find((node) => node.title === 'Chapter 6: Shape')!;
  expect(descendants.filter((node) => node.parent_id === chapter.id).map((node) => node.title))
    .toEqual(expect.arrayContaining(['Shape', 'First section', 'Second section']));
  const unique = descendants.find((node) => node.id.includes('readwise') && node.content === 'Unique second excerpt')!;
  const section = descendants.find((node) => node.title === 'Second section')!;
  expect(unique.parent_id).toBe(section.id);
  const ambiguous = descendants.find((node) => node.id.includes('readwise') && node.content === 'Repeated excerpt')!;
  expect(ambiguous.parent_id).toBe(source.latest_node_id);

  materializeReadwiseApiDocument({ config, connectionRef: 'connection', destination: 'inbox', document });
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM nodes WHERE id LIKE 'node-epub-%' AND deleted_at IS NULL"
  )).toEqual({ count: 4 });
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM nodes WHERE id LIKE 'node-readwise-%' AND deleted_at IS NULL"
  )).toEqual({ count: 2 });
});

it('prepares EPUB images only when a book tree is created or explicitly rebuilt', () => {
  const document = { ...epubFixture(), annotations: [] };
  const config = createDefaultReadwiseReaderConfig();
  const input = { config, connectionRef: 'connection', destination: 'inbox' as const, document };

  expect(shouldPrepareReadwiseApiEpubImages(input)).toBe(true);
  materializeReadwiseApiDocument(input);
  expect(shouldPrepareReadwiseApiEpubImages(input)).toBe(false);
  expect(shouldPrepareReadwiseApiEpubImages({ ...input, forceEpubStructure: true })).toBe(true);
  expect(shouldPrepareReadwiseApiEpubImages({
    ...input,
    connectionRef: 'external-connection',
    destination: 'external'
  })).toBe(false);
  expect(shouldPrepareReadwiseApiEpubImages({
    ...input,
    connectionRef: 'promoted-connection',
    destination: 'external',
    forceInbox: true
  })).toBe(true);
});

it('does not rebuild or revive a persisted structure when remote sections drift', () => {
  const config = createDefaultReadwiseReaderConfig();
  const document = epubFixture();
  materializeReadwiseApiDocument({ config, connectionRef: 'connection', destination: 'inbox', document });
  const driver = openDatabaseConnection().driver;
  const section = driver.queryOne<{ id: string }>("SELECT id FROM nodes WHERE title = 'First section'")!;
  driver.execute('UPDATE nodes SET content = ?, deleted_at = ? WHERE id = ?', [
    'Local edit', '2026-09-08T01:00:00.000Z', section.id
  ]);
  const drifted = { ...document, epubStructure: {
    ...document.epubStructure!,
    sections: [{ content: '# Replacement\n\nRemote drift', headingLevel: 1, markerKey: 'replacement', title: 'Replacement' }]
  } };

  materializeReadwiseApiDocument({ config, connectionRef: 'connection', destination: 'inbox', document: drifted });
  expect(driver.queryOne<{ count: number }>("SELECT COUNT(*) count FROM nodes WHERE title = 'Replacement'"))
    .toEqual({ count: 0 });
  expect(driver.queryOne<{ deleted_at: string }>('SELECT deleted_at FROM nodes WHERE id = ?', [section.id])?.deleted_at)
    .toBe('2026-09-08T01:00:00.000Z');
});

it('keeps a legacy flat API EPUB until an explicit structure re-import', () => {
  const config = createDefaultReadwiseReaderConfig();
  const structured = { ...epubFixture(), annotations: [] };
  const flat = { ...structured, body: 'Legacy flat body', epubStructure: null };
  materializeReadwiseApiDocument({ config, connectionRef: 'connection', destination: 'inbox', document: flat });

  materializeReadwiseApiDocument({ config, connectionRef: 'connection', destination: 'inbox', document: structured });
  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ count: number }>("SELECT COUNT(*) count FROM nodes WHERE id LIKE 'node-epub-%'"))
    .toEqual({ count: 0 });
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE title = 'Book'")?.content)
    .toBe('Legacy flat body');

  materializeReadwiseApiDocument({
    config, connectionRef: 'connection', destination: 'inbox', document: structured, forceEpubStructure: true
  });
  expect(driver.queryOne<{ count: number }>("SELECT COUNT(*) count FROM nodes WHERE id LIKE 'node-epub-%'"))
    .toEqual({ count: 4 });
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE title = 'Book'")?.content)
    .toContain('Front matter');
});

it('routes the current-source re-import command from a flat API EPUB to staged Reader HTML', async () => {
  const config = createDefaultReadwiseReaderConfig();
  const flat = { ...epubFixture(), annotations: [], body: 'Legacy flat body', epubStructure: null };
  materializeReadwiseApiDocument({ config, connectionRef: 'connection', destination: 'inbox', document: flat });
  const source = openDatabaseConnection().driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'epub-1'"
  )!;
  const staged = normalizeReaderDocument({
    category: 'epub',
    html_content: '<h1 data-rw-epub-toc="chapter">Chapter 1: Start</h1><p>Reader body</p>',
    id: 'epub-1',
    title: 'Book'
  })!;
  saveReadwiseApiStagePage({ connectionRef: 'connection', cursor: null, items: [staged], kind: 'reader' });

  await expect(reimportCurrentTopicSource(source.latest_node_id)).resolves.toMatchObject({
    node_id: source.latest_node_id,
    status: 'reimported'
  });
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM nodes WHERE id LIKE 'node-epub-%' AND deleted_at IS NULL"
  )).toEqual({ count: 1 });
});

function epubFixture(): PreparedReadwiseApiDocument {
  return {
    annotations: [annotation('unique', 'Unique second excerpt'), annotation('ambiguous', 'Repeated excerpt')],
    body: '# Chapter 6: Shape\n\nIntro\n\n## First section\n\nRepeated excerpt\n\n## Second section\n\nRepeated excerpt\n\nUnique second excerpt',
    category: 'epub',
    coverImageUrl: null,
    degradedReason: null,
    epubStructure: {
      degradedReason: null,
      imageCount: 0,
      markerCount: 3,
      rootBody: 'Front matter',
      sections: [
        { content: '# Chapter 6: Shape\n\nIntro', headingLevel: 1, markerKey: 'chapter', title: 'Chapter 6: Shape' },
        { content: '## First section\n\nRepeated excerpt', headingLevel: 2, markerKey: 'first', title: 'First section' },
        { content: '## Second section\n\nRepeated excerpt\n\nUnique second excerpt', headingLevel: 2, markerKey: 'second', title: 'Second section' }
      ]
    },
    id: 'epub-1',
    metadata: { author: null, category: 'epub', readerUrl: null, sourceUrl: null, title: 'Book' },
    title: 'Book', unmatchedAnnotationCount: 0, updatedAt: '2026-09-08T00:00:00.000Z'
  };
}

function annotation(remoteId: string, text: string) {
  return {
    content: text, contentHash: remoteId, kind: 'highlight' as const, locatorText: text,
    parentRemoteId: 'epub-1', remoteId, updatedAt: '2026-09-08T00:00:00.000Z'
  };
}
