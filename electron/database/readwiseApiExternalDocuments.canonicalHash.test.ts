// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_cache_dir: path.join(tempRoot, 'cache'), app_config_dir: path.join(tempRoot, 'config'),
  app_data_dir: path.join(tempRoot, 'data'), app_log_dir: path.join(tempRoot, 'logs')
}) }));

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { buildCanonicalExternalDocumentPayload } from '../../lib/core/sync/canonicalExternalResourcePayload.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { upsertReadwiseApiExternalDocument } from './readwiseApiExternalDocuments.js';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-external-canonical-'));
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('readwise-canonical-host');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('uses the same stable hash across Readwise import clocks', () => {
  upsertReadwiseApiExternalDocument({ connectionRef: 'connection-1', document: document('2026-10-01'),
    indexedAt: '2026-10-02' });
  const before = readState();
  upsertReadwiseApiExternalDocument({ connectionRef: 'connection-1', document: document('2026-10-03'),
    indexedAt: '2026-10-04' });
  const row = openDatabaseConnection().driver.queryOne<
    Parameters<typeof buildCanonicalExternalDocumentPayload>[0] & DatabaseRow
  >(
    `SELECT document_id, folder_id, relative_path, file_name, extension, content_hash, title,
       body_blob_hash, reference_kind, reference_json FROM external_documents`
  )!;

  expect(readState()).toEqual(before);
  expect(before.content_hash).toBe(computeSyncContentHash(
    'external_document', buildCanonicalExternalDocumentPayload(row)
  ));
});

function document(updatedAt: string): PreparedReadwiseApiDocument {
  return {
    annotations: [], body: '# Stable\n\nBody', category: 'article', coverImageUrl: null,
    degradedReason: null, id: 'remote-1', metadata: { author: null, category: 'article',
      readerUrl: 'https://readwise.io/reader/read/remote-1', sourceUrl: 'https://example.com/article',
      title: 'Stable' }, title: 'Stable', unmatchedAnnotationCount: 0, updatedAt
  };
}

function readState() {
  return openDatabaseConnection().driver.queryOne<{ content_hash: string; state_seq: number; updated_at: string }>(
    "SELECT content_hash, state_seq, updated_at FROM sync_object_state WHERE object_type = 'external_document'"
  )!;
}
