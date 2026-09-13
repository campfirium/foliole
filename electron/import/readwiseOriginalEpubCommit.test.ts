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
vi.mock('../database/readwiseHostAssignment.js', () => ({ canCurrentHostRunReadwise: () => true }));
vi.mock('./readwiseApiConnectionState.js', () => ({ isStoredReadwiseApiConnectionReady: () => true }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  clearAttachmentLibraryPathSnapshot,
  publishAttachmentLibraryPathSnapshot
} from '../attachments/attachmentLibraryPathSnapshot.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { createTestZip } from '../ipc/testZipBuilder.js';

import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { buildLocalReadwiseOriginalEpubDocument } from './readwiseOriginalEpubAnnotations.js';
import { commitReadwiseOriginalEpub } from './readwiseOriginalEpubCommit.js';
import { prepareOriginalEpubCandidate } from './readwiseOriginalEpubPreparation.js';
import {
  captureReadwiseOriginalEpubSnapshot,
  loadReadwiseOriginalEpubTarget
} from './readwiseOriginalEpubTarget.js';

const importedAt = '2026-09-12T01:00:00.000Z';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-original-epub-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  publishAttachmentLibraryPathSnapshot({
    assetsDir: path.join(mockedAppDataDir, 'assets'), libraryScope: 'test-library'
  });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function apiDocument(): PreparedReadwiseApiDocument {
  return {
    annotations: [{
      content: 'Remote original', contentHash: 'remote-hash', kind: 'highlight', locatorText: 'Remember me',
      parentRemoteId: 'book-1', remoteId: 'highlight-1', updatedAt: importedAt
    }],
    body: '# Reader chapter\n\nRemember me', category: 'epub', coverImageUrl: null, degradedReason: null,
    epubStructure: {
      degradedReason: null, imageCount: 0, markerCount: 1, rootBody: '',
      sections: [{ content: '# Reader chapter\n\nRemember me', headingLevel: 1, markerKey: 'reader', title: 'Reader chapter' }]
    },
    id: 'book-1', metadata: { author: null, category: 'epub', readerUrl: null, sourceUrl: null, title: 'Book' },
    title: 'Book', unmatchedAnnotationCount: 0, updatedAt: importedAt
  };
}

function originalBytes() {
  return createTestZip([
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content: '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content: '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Original</dc:title></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content: '<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="one.xhtml#missing">Missing anchor</a></li><li><a href="one.xhtml#found">One</a></li><li><a href="two.xhtml">Two</a></li></ol></nav></body></html>',
      name: 'OPS/nav.xhtml'
    },
    { content: '<html><head><title>One</title></head><body><h1 id="found">One</h1><p>Remember me and local phrase.</p></body></html>', name: 'OPS/one.xhtml' },
    { content: '<html><head><title>Two</title></head><body><h1>Two</h1><p>Remember me in another place.</p></body></html>', name: 'OPS/two.xhtml' }
  ]);
}

function invalidImageBytes() {
  return createTestZip([
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content: '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content: '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Broken</dc:title></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="good" href="good.png" media-type="image/png"/><item id="bad" href="bad.png" media-type="image/png"/></manifest><spine><itemref idref="one"/></spine></package>',
      name: 'OPS/book.opf'
    },
    { content: '<html><head><title>One</title></head><body><h1>One</h1><img src="good.png"/><img src="bad.png"/></body></html>', name: 'OPS/one.xhtml' },
    { content: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), name: 'OPS/good.png' },
    { content: 'not-an-image', name: 'OPS/bad.png' }
  ]);
}

function headingCoverBytes() {
  return createTestZip([
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content: '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content: '<?xml version="1.0"?><package version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Cover</dc:title></metadata><manifest><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="image" href="cover.png" media-type="image/png"/></manifest><spine><itemref idref="cover"/><itemref idref="chapter"/></spine><guide><reference type="cover" href="cover.xhtml"/></guide></package>',
      name: 'OPS/book.opf'
    },
    { content: '<html><body><h1><img alt="Cover" src="cover.png"/></h1></body></html>', name: 'OPS/cover.xhtml' },
    { content: '<html><body><h1>Chapter</h1><p>Body remains available.</p></body></html>', name: 'OPS/chapter.xhtml' },
    { content: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), name: 'OPS/cover.png' }
  ]);
}

async function seedTarget() {
  const connectionRef = ensureReadwiseRemoteSource(false, importedAt).connectionRef;
  const document = apiDocument();
  materializeReadwiseApiDocument({
    config: createDefaultReadwiseReaderConfig(), connectionRef, destination: 'inbox', document
  });
  const driver = openDatabaseConnection().driver;
  const root = driver.queryOne<{ id: string }>("SELECT id FROM nodes WHERE title = 'Book'")!;
  const readerSection = driver.queryOne<{ id: string }>("SELECT id FROM nodes WHERE title = 'Reader chapter'")!;
  const remote = driver.queryOne<{ id: string }>("SELECT id FROM nodes WHERE content = 'Remote original'")!;
  driver.execute("UPDATE nodes SET title = 'My title', content = 'My remote note' WHERE id = ?", [remote.id]);
  driver.execute("UPDATE nodes SET title = 'My Book', updated_at = ? WHERE id = ?", ['2026-09-12T01:10:00.000Z', root.id]);
  driver.execute(
    "UPDATE nodes SET title = 'Edited Reader chapter', content = 'Changed Reader body', body_blob_hash = NULL, updated_at = ? WHERE id = ?",
    ['2026-09-12T01:20:00.000Z', readerSection.id]
  );
  driver.execute(
    `INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,anchor_link,created_at,updated_at)
     VALUES ('local-cloze',?,'item','Local',1,'Answer',? ,?,?),
       ('local-missing',?,'topic','Missing',1,'Kept',? ,?,?),
       ('ordinary-same-title',?,'topic','※',1,'# ※',NULL,?,?)`,
    [
      readerSection.id, JSON.stringify({ id: 'anchor-local', kind: 'cloze', locator: { from: 0, originalText: 'local phrase', to: 12 } }), importedAt, importedAt,
      readerSection.id, JSON.stringify({ id: 'anchor-missing', kind: 'highlight', locator: { from: 0, originalText: 'not in original', to: 15 } }), importedAt, importedAt,
      root.id, importedAt, importedAt
    ]
  );
  const target = loadReadwiseOriginalEpubTarget(root.id)!;
  const candidate = await prepareOriginalEpubCandidate({ bytes: originalBytes(), now: importedAt, title: target.title });
  return { candidate, connectionRef, document, readerSectionId: readerSection.id, remoteId: remote.id, rootId: root.id, target };
}

it('builds the replacement document from existing local annotations', async () => {
  const seeded = await seedTarget();

  expect(buildLocalReadwiseOriginalEpubDocument(seeded.target)).toMatchObject({
    annotations: [{ content: 'My remote note', remoteId: 'highlight-1' }],
    id: 'book-1',
    unmatchedAnnotationCount: 0
  });
});

it('force-replaces changed Reader content while preserving identities, user content, and local anchors', async () => {
  const seeded = await seedTarget();
  const expectedSnapshot = captureReadwiseOriginalEpubSnapshot(seeded.target);
  commitReadwiseOriginalEpub({ ...seeded, expectedSnapshot, importedAt });

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id = ?', [seeded.rootId]))
    .toEqual({ title: 'My Book' });
  expect(driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id = ?', [seeded.remoteId]))
    .toEqual({ content: 'My remote note' });
  expect(driver.queryOne('SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL', [seeded.readerSectionId]))
    .toBeUndefined();
  expect(driver.queryOne<{ parent_title: string }>(
    'SELECT parent.title parent_title FROM nodes child JOIN nodes parent ON parent.id=child.parent_id WHERE child.id=?',
    [seeded.remoteId]
  )).toEqual({ parent_title: '※' });
  expect(driver.queryOne<{ parent_title: string }>(
    "SELECT parent.title parent_title FROM nodes child JOIN nodes parent ON parent.id=child.parent_id WHERE child.id='local-cloze'"
  )).toEqual({ parent_title: 'One' });
  expect(driver.queryOne<{ parent_title: string }>(
    "SELECT parent.title parent_title FROM nodes child JOIN nodes parent ON parent.id=child.parent_id WHERE child.id='local-missing'"
  )).toEqual({ parent_title: '※' });
  expect(driver.queryOne<{ parent_id: string }>("SELECT parent_id FROM nodes WHERE id='ordinary-same-title'"))
    .toEqual({ parent_id: seeded.rootId });
  const source = driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id='book-1'"
  )!;
  expect(JSON.parse(source.remote_import_state_json)).toMatchObject({
    bodyAuthority: 'original_epub', originalFile: { status: 'localized' }, sourceUpdate: null
  });
});

it('rolls every database write back when the authority save fails', async () => {
  const seeded = await seedTarget();
  const before = captureReadwiseOriginalEpubSnapshot(seeded.target);
  const driver = openDatabaseConnection().driver;
  driver.execute(`CREATE TRIGGER fail_original_epub_state BEFORE UPDATE ON import_sources
    BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);

  expect(() => commitReadwiseOriginalEpub({ ...seeded, expectedSnapshot: before, importedAt }))
    .toThrow('injected failure');
  expect(captureReadwiseOriginalEpubSnapshot(seeded.target)).toBe(before);
  expect(driver.queryOne<{ count: number }>('SELECT COUNT(*) count FROM attachments')).toEqual({ count: 0 });
});

it('removes files staged before an EPUB preparation failure', async () => {
  await expect(prepareOriginalEpubCandidate({ bytes: invalidImageBytes(), now: importedAt, title: 'Broken' }))
    .rejects.toThrow('original_epub_image_invalid');
  await expect(fs.readdir(path.join(mockedAppDataDir, 'assets'))).resolves.toEqual([]);
});

it('keeps a cover image nested in the leading heading when replacing the whole EPUB', async () => {
  const candidate = await prepareOriginalEpubCandidate({ bytes: headingCoverBytes(), now: importedAt, title: 'Cover' });
  expect(candidate.images.rootBody).toMatch(/^!\[Cover\]\(asset:\/\//u);
  expect(candidate.images.rootAttachmentIds).toHaveLength(1);
  expect(candidate.images.sections.some((section) => section.content.includes('Body remains available.'))).toBe(true);
  expect(candidate.stages).toHaveLength(2);
});
