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
import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { loadNodeResourceReferences, persistNodeResourceReference } from '../database/nodeResources.js';

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
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.pragma('foreign_keys = OFF');
  expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'attachments'").all()).toEqual([]);
  const preparedEpubImages = preparedImages(document);
  const preparedEpubCover = {
    resourceReferences: [{ storage_key: `${'a'.repeat(64)}.png`, original_name: 'Cover.png', role: 'image' as const }],
    attachmentIds: ['a'.repeat(64)], degradedReason: null,
    text: `![Cover](asset://${'a'.repeat(64)}.png)`
  };
  const config = createDefaultReadwiseReaderConfig();
  materializeReadwiseApiDocument({
    config, connectionRef: 'connection', destination: 'inbox', document, preparedEpubCover, preparedEpubImages
  });

  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'epub-1'"
  )!;
  const root = driver.queryOne<{ id: string; content: string }>(
    `SELECT id, ${buildNodeBodyContentSql('nodes')} AS content FROM nodes LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash WHERE id = ?`, [source.latest_node_id]
  )!;
  const section = driver.queryOne<{ id: string; content: string }>(
    `SELECT id, ${buildNodeBodyContentSql('nodes')} AS content FROM nodes LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash WHERE title = 'Section'`
  )!;
  expect(root.content).toContain(`asset://${'a'.repeat(64)}.png`);
  expect(section.content).toContain(`asset://${'b'.repeat(64)}.png`);
  for (const nodeId of [root.id, section.id]) persistNodeResourceReference(nodeId, {
    storage_key: `${'c'.repeat(64)}.png`, original_name: 'Stale.png', role: 'image'
  });

  materializeReadwiseApiDocument({
    config, connectionRef: 'connection', destination: 'inbox', document, forceEpubStructure: true,
    preparedEpubCover, preparedEpubImages
  });

  expect(loadNodeResourceReferences(root.id)).toEqual([
    { storage_key: `${'a'.repeat(64)}.png`, original_name: 'Cover.png', role: 'image' }
  ]);
  expect(loadNodeResourceReferences(section.id)).toEqual([
    { storage_key: `${'b'.repeat(64)}.png`, original_name: 'Section.png', role: 'image' }
  ]);
});

function preparedImages(document: PreparedReadwiseApiDocument) {
  return {
    accounting: {
      conversionDroppedCount: 0, localizedBodyCount: 1, sourceBodyCount: 1,
      treeBodyCount: 1, unavailableBodyCount: 0
    },
    degradedReason: null,
    rootAttachmentIds: [],
    rootBody: '',
    sections: document.epubStructure!.sections.map((section) => ({
      ...section,
      resourceReferences: [{ storage_key: `${'b'.repeat(64)}.png`, original_name: 'Section.png', role: 'image' as const }],
      attachmentIds: ['b'.repeat(64)],
      content: `![Section](asset://${'b'.repeat(64)}.png)`
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
