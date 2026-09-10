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
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { createAttachmentRecord, createNodeAttachmentLink } from '../database/attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-epub-images-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('persists owning-topic image links and replaces stale links on explicit rebuild', () => {
  const document = documentFixture();
  const createdAt = '2026-09-08T00:00:00.000Z';
  for (const id of ['cover-attachment', 'section-attachment', 'stale-attachment']) {
    createAttachmentRecord({ createdAt, id, mimeType: 'image/png', originalName: `${id}.png`, sizeBytes: 3 });
  }
  const preparedEpubImages = preparedImages(document);
  const config = createDefaultReadwiseReaderConfig();
  materializeReadwiseApiDocument({ config, connectionRef: 'connection', destination: 'inbox', document, preparedEpubImages });

  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'epub-1'"
  )!;
  const root = driver.queryOne<{ id: string; content: string }>(
    'SELECT id, content FROM nodes WHERE id = ?', [source.latest_node_id]
  )!;
  const section = driver.queryOne<{ id: string; content: string }>(
    "SELECT id, content FROM nodes WHERE title = 'Section'"
  )!;
  expect(root.content).toContain('asset://cover-attachment.png');
  expect(section.content).toContain('asset://section-attachment.png');
  createNodeAttachmentLink({ attachmentId: 'stale-attachment', nodeId: root.id, role: 'image' });
  createNodeAttachmentLink({ attachmentId: 'stale-attachment', nodeId: section.id, role: 'image' });

  materializeReadwiseApiDocument({
    config, connectionRef: 'connection', destination: 'inbox', document, forceEpubStructure: true, preparedEpubImages
  });

  expect(driver.queryAll<{ attachment_id: string; node_id: string }>(
    'SELECT attachment_id, node_id FROM node_attachments ORDER BY attachment_id'
  )).toEqual([
    { attachment_id: 'cover-attachment', node_id: root.id },
    { attachment_id: 'section-attachment', node_id: section.id }
  ]);
});

function preparedImages(document: PreparedReadwiseApiDocument) {
  return {
    accounting: {
      conversionDroppedCount: 0, localizedBodyCount: 1, sourceBodyCount: 1,
      treeBodyCount: 1, unavailableBodyCount: 0
    },
    coverState: 'localized' as const,
    degradedReason: null,
    rootAttachmentIds: ['cover-attachment'],
    rootBody: '![Cover](asset://cover-attachment.png)',
    sections: document.epubStructure!.sections.map((section) => ({
      ...section,
      attachmentIds: ['section-attachment'],
      content: '![Section](asset://section-attachment.png)'
    }))
  };
}

function documentFixture(): PreparedReadwiseApiDocument {
  return {
    annotations: [], body: 'Reader body', category: 'epub', coverImageUrl: null, degradedReason: null,
    epubStructure: {
      degradedReason: null, imageCount: 1, markerCount: 1, rootBody: '',
      sections: [{ content: 'Reader body', headingLevel: 1, markerKey: 'section', title: 'Section' }]
    },
    id: 'epub-1',
    metadata: { author: null, category: 'epub', readerUrl: null, sourceUrl: null, title: 'Book' },
    title: 'Book', unmatchedAnnotationCount: 0, updatedAt: '2026-09-08T00:00:00.000Z'
  };
}
