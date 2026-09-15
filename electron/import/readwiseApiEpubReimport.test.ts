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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-api-epub-reimport-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  openDatabaseConnection().driver.execute(
    "INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('readwise_source_mode',?,'old')",
    [JSON.stringify({
      completion: { batchId: 'test', completedAt: 'old', sourceHost: 'desktop-test', startedAt: 'old' },
      mode: 'api', version: 1
    })]
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('routes a flat API EPUB re-import to staged Reader HTML', async () => {
  const document = { ...structuredDocument(), body: 'Legacy flat body', epubStructure: null };
  materializeReadwiseApiDocument({
    config: createDefaultReadwiseReaderConfig(), connectionRef: 'connection', destination: 'inbox', document
  });
  const source = openDatabaseConnection().driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'epub-1'"
  )!;
  const staged = normalizeReaderDocument({
    category: 'epub', html_content: '<h1 data-rw-epub-toc="chapter">Chapter</h1><p>Body</p>',
    id: 'epub-1', title: 'Book'
  })!;
  saveReadwiseApiStagePage({ connectionRef: 'connection', cursor: null, items: [staged], kind: 'reader' });

  await expect(reimportCurrentTopicSource(source.latest_node_id)).resolves.toMatchObject({
    node_id: source.latest_node_id, status: 'reimported'
  });
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM nodes WHERE id LIKE 'node-epub-%' AND deleted_at IS NULL"
  )).toEqual({ count: 1 });
});

it('keeps original EPUB authority through forced API structure re-imports', () => {
  const config = createDefaultReadwiseReaderConfig();
  const document = structuredDocument();
  materializeReadwiseApiDocument({ config, connectionRef: 'connection', destination: 'inbox', document });
  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id = 'epub-1'"
  )!;
  const state = { ...JSON.parse(source.remote_import_state_json), bodyAuthority: 'original_epub' };
  driver.execute(
    "UPDATE import_sources SET remote_import_state_json = ? WHERE remote_document_id = 'epub-1'",
    [JSON.stringify(state)]
  );
  const replacement = { ...document, epubStructure: {
    ...document.epubStructure!, rootBody: 'Reader replacement',
    sections: [{ content: '# Replaced', headingLevel: 1, markerKey: 'replaced', title: 'Replaced' }]
  } };

  expect(shouldPrepareReadwiseApiEpubImages({
    config, connectionRef: 'connection', destination: 'inbox', document: replacement, forceEpubStructure: true
  })).toBe(false);
  materializeReadwiseApiDocument({
    config, connectionRef: 'connection', destination: 'inbox', document: replacement,
    forceEpubStructure: true, replaceExistingBody: true
  });
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM nodes WHERE title='Replaced' AND deleted_at IS NULL"
  )).toEqual({ count: 0 });
});

function structuredDocument(): PreparedReadwiseApiDocument {
  return {
    annotations: [], body: '# Chapter\n\nBody', category: 'epub', coverImageUrl: null,
    degradedReason: null,
    epubStructure: {
      degradedReason: null, imageCount: 0, markerCount: 1, rootBody: '',
      sections: [{ content: '# Chapter\n\nBody', headingLevel: 1, markerKey: 'chapter', title: 'Chapter' }]
    },
    id: 'epub-1',
    metadata: { author: null, category: 'epub', readerUrl: null, sourceUrl: null, title: 'Book' },
    title: 'Book', unmatchedAnnotationCount: 0, updatedAt: null
  };
}
