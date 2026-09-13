// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({ canCurrentHostRunReadwise: () => true }));
vi.mock('./readwiseApiConnectionState.js', () => ({ isStoredReadwiseApiConnectionReady: () => true }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { loadReadwiseApiImportSource, saveReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { mergeRetainedReadwiseAnnotations } from './readwiseOriginalEpubAnnotations.js';
import { commitReadwiseSourceResync } from './readwiseSourceResyncCommit.js';
import {
  captureReadwiseSourceResyncSnapshot,
  loadReadwiseSourceResyncTarget
} from './readwiseSourceResyncTarget.js';

const firstImportedAt = '2026-09-13T01:00:00.000Z';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-source-resync-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function document(body: string): PreparedReadwiseApiDocument {
  return {
    annotations: [{
      content: 'Remote highlight', contentHash: 'remote-hash', kind: 'highlight',
      locatorText: 'kept phrase', parentRemoteId: 'document-1', remoteId: 'highlight-1',
      updatedAt: firstImportedAt
    }],
    body,
    category: 'article',
    coverImageUrl: null,
    degradedReason: null,
    id: 'document-1',
    metadata: {
      author: null, category: 'article', readerUrl: null, sourceUrl: null, title: 'Source'
    },
    title: 'Source',
    unmatchedAnnotationCount: 0,
    updatedAt: firstImportedAt
  };
}

function epubDocument(sectionTitle: string, sectionBody: string): PreparedReadwiseApiDocument {
  return {
    ...document(sectionBody),
    category: 'epub',
    epubStructure: {
      degradedReason: null,
      imageCount: 0,
      markerCount: 1,
      rootBody: '',
      sections: [{
        content: `# ${sectionTitle}\n\n${sectionBody}`,
        headingLevel: 1,
        markerKey: sectionTitle.toLowerCase(),
        title: sectionTitle
      }]
    },
    metadata: { ...document(sectionBody).metadata, category: 'epub' }
  };
}

function seedSource() {
  const connectionRef = ensureReadwiseRemoteSource(false, firstImportedAt).connectionRef;
  materializeReadwiseApiDocument({
    config: createDefaultReadwiseReaderConfig(), connectionRef, destination: 'inbox',
    document: document('# Source\n\nOld body with kept phrase and local phrase.')
  });
  const driver = openDatabaseConnection().driver;
  const rootId = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id='document-1'"
  )!.latest_node_id;
  const remoteId = driver.queryOne<{ id: string }>(
    "SELECT id FROM nodes WHERE parent_id=? AND content='Remote highlight'", [rootId]
  )!.id;
  driver.execute("UPDATE nodes SET title='Edited highlight', content='User edited highlight' WHERE id=?", [remoteId]);
  driver.execute(
    `INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,anchor_link,created_at,updated_at)
     VALUES ('local-cloze',?,'item','Local cloze',1,'Answer',?,?,?),
       ('local-note',?,'topic','Local note',1,'Note text',?,?,?)`,
    [
      rootId, anchor('cloze-anchor', 'cloze', 'local phrase'), firstImportedAt, firstImportedAt,
      rootId, anchor('note-anchor', 'highlight', 'missing phrase'), firstImportedAt, firstImportedAt
    ]
  );
  driver.execute(
    `INSERT INTO node_reading (node_id,last_handled_at,next_at,state)
     VALUES ('local-cloze',?,?, 'active')`, [firstImportedAt, firstImportedAt]
  );
  return { connectionRef, remoteId, rootId };
}

function anchor(id: string, kind: 'cloze' | 'highlight', text: string) {
  return JSON.stringify({ id, kind, locator: { from: 0, originalText: text, to: text.length } });
}

function resync(rootId: string, body: string, importedAt: string) {
  const target = loadReadwiseSourceResyncTarget(rootId)!;
  const nextDocument = document(body);
  nextDocument.annotations = mergeRetainedReadwiseAnnotations(target, []);
  return commitReadwiseSourceResync({
    candidate: { cover: null, document: nextDocument, images: null },
    expectedSnapshot: captureReadwiseSourceResyncSnapshot(target),
    importedAt,
    target
  });
}

it('atomically replaces one source while preserving user identities, content, and review state', () => {
  const seeded = seedSource();
  expect(resync(seeded.rootId, '# Source\n\nNew body with kept phrase and local phrase.',
    '2026-09-13T02:00:00.000Z')).toMatchObject({ status: 'imported' });

  const driver = openDatabaseConnection().driver;
  const root = driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id=?', [seeded.rootId]);
  expect(root?.content).toContain('New body');
  expect(root?.content).toContain('local phrase');
  expect(driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id=?', [seeded.remoteId]))
    .toEqual({ content: 'User edited highlight' });
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='local-cloze'"))
    .toEqual({ content: 'Answer' });
  expect(driver.queryOne<{ anchor_link: string }>("SELECT anchor_link FROM nodes WHERE id='local-cloze'")?.anchor_link)
    .toContain('local phrase');
  expect(driver.queryOne<{ anchor_link: string }>("SELECT anchor_link FROM nodes WHERE id='local-note'")?.anchor_link)
    .not.toContain('locator');
  expect(driver.queryOne<{ state: string }>("SELECT state FROM node_reading WHERE node_id='local-cloze'"))
    .toEqual({ state: 'active' });
  const source = driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id='document-1'"
  )!;
  expect(JSON.parse(source.remote_import_state_json)).toMatchObject({ bodyAuthority: 'reader_html' });
});

it('repeats in place and rolls back all source changes after a commit failure', () => {
  const seeded = seedSource();
  resync(seeded.rootId, '# Source\n\nSecond body with kept phrase and local phrase.',
    '2026-09-13T02:00:00.000Z');
  resync(seeded.rootId, '# Source\n\nThird body with kept phrase and local phrase.',
    '2026-09-13T03:00:00.000Z');
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM import_sources WHERE remote_document_id='document-1'"
  )).toEqual({ count: 1 });

  const target = loadReadwiseSourceResyncTarget(seeded.rootId)!;
  const before = captureReadwiseSourceResyncSnapshot(target);
  openDatabaseConnection().driver.execute(`CREATE TRIGGER fail_resync_state BEFORE UPDATE ON import_sources
    BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
  expect(() => commitReadwiseSourceResync({
    candidate: { cover: null, document: document('# Source\n\nBroken body.'), images: null },
    expectedSnapshot: before,
    importedAt: '2026-09-13T04:00:00.000Z',
    target
  })).toThrow('injected failure');
  expect(captureReadwiseSourceResyncSnapshot(target)).toBe(before);
});

it('rejects a commit when the source snapshot changed after preparation', () => {
  const seeded = seedSource();
  const target = loadReadwiseSourceResyncTarget(seeded.rootId)!;
  const before = captureReadwiseSourceResyncSnapshot(target);
  openDatabaseConnection().driver.execute('UPDATE nodes SET updated_at=? WHERE id=?', [
    '2026-09-13T05:00:00.000Z', seeded.rootId
  ]);
  expect(() => commitReadwiseSourceResync({
    candidate: { cover: null, document: document('# Source\n\nChanged body.'), images: null },
    expectedSnapshot: before,
    importedAt: '2026-09-13T06:00:00.000Z',
    target
  })).toThrow('readwise_resync_target_changed');
});

it('rebuilds a Reader EPUB tree in place and switches EPUB authority back to Readwise', () => {
  const connectionRef = ensureReadwiseRemoteSource(false, firstImportedAt).connectionRef;
  materializeReadwiseApiDocument({
    config: createDefaultReadwiseReaderConfig(), connectionRef, destination: 'inbox',
    document: epubDocument('Old chapter', 'Old EPUB body with kept phrase.')
  });
  const source = loadReadwiseApiImportSource(connectionRef, 'document-1')!;
  saveReadwiseApiImportSource({
    annotationsJson: JSON.stringify(source.annotations), connectionRef, documentId: 'document-1',
    sourceFingerprint: source.sourceFingerprint,
    state: { ...source.state, bodyAuthority: 'original_epub' },
    updatedAt: '2026-09-13T02:00:00.000Z'
  });
  const target = loadReadwiseSourceResyncTarget(source.nodeId!)!;
  const next = epubDocument('New chapter', 'New EPUB body with kept phrase.');
  next.annotations = mergeRetainedReadwiseAnnotations(target, []);
  commitReadwiseSourceResync({
    candidate: { cover: { attachmentIds: [], degradedReason: null, text: '' }, document: next, images: null },
    expectedSnapshot: captureReadwiseSourceResyncSnapshot(target),
    importedAt: '2026-09-13T03:00:00.000Z',
    target
  });

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ id: string }>("SELECT id FROM nodes WHERE title='Old chapter' AND deleted_at IS NULL"))
    .toBeUndefined();
  expect(driver.queryOne<{ parent_id: string }>("SELECT parent_id FROM nodes WHERE title='New chapter'"))
    .toEqual({ parent_id: source.nodeId });
  expect(loadReadwiseApiImportSource(connectionRef, 'document-1')).toMatchObject({
    nodeId: source.nodeId,
    state: { bodyAuthority: 'reader_html' }
  });
});
