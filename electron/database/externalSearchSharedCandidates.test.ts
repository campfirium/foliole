// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { buildFtsSearchQueryPlan } from '../../lib/core/database/ftsSearchQuery.js';
import { serializeReadwiseExternalReference } from '../../lib/core/readwise/readwiseExternalReference.js';

let tempRoot = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(tempRoot, 'data'), app_cache_dir: path.join(tempRoot, 'cache'),
  app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs')
}) }));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { markExternalDocumentsMissing, upsertExternalDocuments } from './externalDocuments.js';
import { setExternalFolderEnabled } from './externalFolderHostPreferences.js';
import { searchExternalDocuments } from './externalSearchCache.js';
import { loadExternalSearchFolders, saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';
import { searchReadwiseExternalDocuments } from './readwiseManagedExternalDocuments.js';

const timestamp = '2026-10-03T00:00:00.000Z';
const readwiseFolderId = 'readwise-reader-import-articles';
const readwiseId = `${readwiseFolderId}:readwise.md`;

function seedDocuments() {
  const folder = loadExternalSearchFolders()[0]!;
  for (const [id, relativePath] of [['mirror', 'mirror.md'], [readwiseFolderId, 'readwise.md']] as const) {
    upsertExternalDocuments({ ...folder, id }, [{ absolutePath: path.join(tempRoot, relativePath),
      content: 'sharedtoken body', extension: 'md', fileName: relativePath, modifiedAt: timestamp,
      modifiedMs: 1, relativePath, sizeBytes: 16 }], timestamp);
  }
  openDatabaseConnection().sqlite.prepare(`UPDATE external_documents
    SET reference_kind = 'readwise_remote', reference_json = ? WHERE document_id = ?`)
    .run(serializeReadwiseExternalReference({ connection_ref: 'fixture', remote_document_id: 'remote-doc',
      reader_url: null, source_url: null }), readwiseId);
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-search-shared-candidates-'));
  initializeDatabase();
  saveExternalSearchFolders([{ id: 'mirror', folder_path: path.join(tempRoot, 'source'),
    attachment_mode: 'document_relative_first_then_fixed_root', attachment_root_path: null, excluded_dirs: [] }]);
  openDatabaseConnection().sqlite.prepare("UPDATE desktop_sources SET host_name = 'other-host' WHERE config_ref = 'mirror'").run();
  seedDocuments();
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('returns mirror and Readwise matches without repeating identical source reads', () => {
  const spy = vi.spyOn(openDatabaseConnection().driver, 'queryAll');
  const results = searchExternalDocuments('sharedtoken');
  expect(results.map((row) => row.id)).toEqual(['mirror-document:mirror:mirror.md', `readwise-document:${readwiseId}`]);
  const sourceReads = spy.mock.calls.filter(([sql]) => sql.includes('FROM stored_source_search'));
  const signatures = sourceReads.map(([sql, params]) => JSON.stringify([sql, params]));
  expect(signatures.length).toBeGreaterThan(0);
  expect(new Set(signatures).size).toBe(signatures.length);
});

it('observes folder disabling and document removal on the next search without stale candidates', () => {
  expect(searchExternalDocuments('sharedtoken')).toHaveLength(2);
  setExternalFolderEnabled('mirror', false);
  expect(searchExternalDocuments('sharedtoken').map((row) => row.id)).toEqual([`readwise-document:${readwiseId}`]);
  expect(searchReadwiseExternalDocuments(buildFtsSearchQueryPlan('sharedtoken'))).toHaveLength(1);
  markExternalDocumentsMissing([{ relativePath: 'readwise.md' }], readwiseFolderId, timestamp);
  expect(searchExternalDocuments('sharedtoken')).toEqual([]);
});
