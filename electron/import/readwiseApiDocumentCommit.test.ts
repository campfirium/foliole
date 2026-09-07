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

const { persistOriginal, prepareOriginal } = vi.hoisted(() => ({
  persistOriginal: vi.fn(), prepareOriginal: vi.fn()
}));
vi.mock('./readwiseApiOriginalFile.js', () => ({
  persistReadwiseApiOriginalFile: persistOriginal,
  prepareReadwiseApiOriginalFile: prepareOriginal
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-commit-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  persistOriginal.mockReset();
  prepareOriginal.mockReset();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('creates a nonblank PDF Topic with links and an explicit unavailable reason', async () => {
  prepareOriginal.mockResolvedValue({
    bytes: null,
    state: {
      attachmentId: null, contentHash: null, mimeType: null, reason: 'original_file_too_large',
      sizeBytes: null, status: 'unavailable'
    }
  });
  const result = await commitReadwiseApiDocument({
    config: { ...createDefaultReadwiseReaderConfig(), withoutHighlightsDestination: 'inbox' },
    connectionRef: 'connection', document: documentFixture('')
  });
  expect(result.status).toBe('imported');
  const row = openDatabaseConnection().driver.queryOne<{ content: string; remote_import_state_json: string; source_kind: string }>(
    `SELECT n.content, i.remote_import_state_json, i.source_kind FROM import_sources i
     JOIN nodes n ON n.id = i.latest_node_id WHERE i.remote_document_id = 'document-1'`
  );
  expect(row?.content).toContain('The original PDF was not synced: the file exceeds the 100 MB limit.');
  expect(row?.content).toContain('[Open in Reader](https://readwise.io/reader/read/document-1)');
  expect(row?.source_kind).toBe('pdf');
  expect(JSON.parse(row?.remote_import_state_json ?? '{}').originalFile).toMatchObject({ status: 'unavailable' });
  expect(persistOriginal).not.toHaveBeenCalled();
});

it('records a localized EPUB attachment result without persisting its signed URL', async () => {
  const localized = {
    attachmentId: 'hash', contentHash: 'hash', mimeType: 'application/epub+zip',
    reason: null, sizeBytes: 32, status: 'localized' as const
  };
  prepareOriginal.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), state: localized });
  await commitReadwiseApiDocument({
    config: { ...createDefaultReadwiseReaderConfig(), withoutHighlightsDestination: 'inbox' },
    connectionRef: 'connection', document: { ...documentFixture('Readable HTML'), category: 'epub' }
  });
  expect(persistOriginal).toHaveBeenCalledWith(expect.objectContaining({ category: 'epub', state: localized }));
  const row = openDatabaseConnection().driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id = 'document-1'"
  );
  expect(row?.remote_import_state_json).not.toContain('amazonaws');
  expect(JSON.parse(row?.remote_import_state_json ?? '{}').originalFile).toMatchObject({ attachmentId: 'hash', status: 'localized' });
});

function documentFixture(body: string): PreparedReadwiseApiDocument {
  return {
    annotations: [], body, category: 'pdf', degradedReason: body ? null : 'Readable body is unavailable',
    id: 'document-1', metadata: {
      author: null, category: 'pdf', readerUrl: 'https://readwise.io/reader/read/document-1',
      sourceUrl: 'https://example.com/source', title: 'Remote PDF'
    }, title: 'Remote PDF', unmatchedAnnotationCount: 0, updatedAt: '2026-09-08T00:00:00.000Z'
  };
}
