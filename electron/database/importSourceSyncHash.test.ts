// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-source-sync-hash-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { recordImportSourceSync, writeImportSource } from '../../lib/core/database/importPipelineRecords.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-source-sync-hash-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function readImportSourceContentHash() {
  return openDatabaseConnection().driver.queryOne<{ content_hash: string }>(
    `SELECT content_hash FROM sync_object_state WHERE object_type = 'import_source' AND object_id = 'source-1'`
  )?.content_hash;
}

it('does not change import source sync hash for last imported time only changes', () => {
  const baseRecord: PersistedImportRecord = {
    contentFingerprint: 'content-1',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-04-21T16:00:00.000Z',
    nodeId: 'node-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-1',
    sourceKind: 'markdown',
    sourceLocator: '/docs/alpha.md',
    sourceName: 'alpha.md'
  };

  writeImportSource(openDatabaseConnection().driver, baseRecord);
  const firstHash = readImportSourceContentHash();

  writeImportSource(openDatabaseConnection().driver, {
    ...baseRecord,
    importId: 'import-2',
    importedAt: '2026-04-21T17:00:00.000Z'
  });

  expect(readImportSourceContentHash()).toBe(firstHash);
});

it('hashes a watched source without its local file locator', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO desktop_sources
    (source_ref, source_type, config_ref, host_name, host_platform, root_path,
     path_flavor, type_settings_json, created_at, updated_at)
    VALUES ('watched:old', 'watched', 'old', 'Mac', 'macOS', '/private',
      'posix', '{}', 'now', 'now')`);
  driver.execute(`INSERT INTO import_sources
    (source_fingerprint, provider, source_kind, source_name, source_locator,
     first_imported_at, last_imported_at, last_content_fingerprint, source_ref)
    VALUES ('source-1', 'markdown', 'file', 'note.md', '/private/note.md',
      'now', 'now', 'content', 'watched:old')`);
  recordImportSourceSync(driver, 'source-1', 'now');
  const payload = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.import_source,
    ['source-1'])!.payload_json;
  expect(payload).not.toContain('/private');
  const hashedPayload = JSON.parse(payload) as Record<string, unknown>;
  delete hashedPayload.last_imported_at;
  expect(readImportSourceContentHash()).toBe(computeSyncContentHash('import_source',
    hashedPayload as Parameters<typeof computeSyncContentHash>[1]));
});
