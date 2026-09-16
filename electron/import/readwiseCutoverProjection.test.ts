// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
const state = vi.hoisted(() => ({ sourcePath: '' }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: () => true,
  loadReadwiseHostAssignment: () => ({ current_host_name: 'This Mac', is_active: true })
}));
vi.mock('./readwiseApiConnectionState.js', async () => {
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
  return {
    isStoredReadwiseApiConnectionReady: () => true,
    loadStoredReadwiseHostSettings: () => ({
      apiConnection: { secretRef: 'readwise-secret', state: 'connected' },
      readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
      readwiseSourceMode: 'api'
    })
  };
});
vi.mock('./importManagerSettings.js', async () => {
  const { createDefaultReadwiseAutoImportPolicy } = await import('../../lib/core/import/readwiseAutoImportPolicy.js');
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
  return { loadImportManagerSettings: () => ({
    readwiseAutoImportPolicy: createDefaultReadwiseAutoImportPolicy(),
    readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
    readwiseSources: [{
      highlightMode: 'split', highlightPath: state.sourcePath, id: 'local', keepState: 'enabled',
      kind: 'articles', primaryPath: state.sourcePath
    }]
  }) };
});
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'secret' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import {
  clearAttachmentLibraryPathSnapshot,
  publishAttachmentLibraryPathSnapshot
} from '../attachments/attachmentLibraryPathSnapshot.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { normalizeExpectedRootBody } from './readwiseCutoverProjection.js';
import { previewReadwiseSourceCutover, runReadwiseSourceCutover } from './readwiseSourceCutover.js';
import {
  epubMigrationFetch,
  seedMigratableSource
} from './readwiseSourceCutoverTestSupport.js';

let tempRoot = '';

it('projects EPUB root headings through the same normalization as the imported Topic', () => {
  expect(normalizeExpectedRootBody('---\n\n# First\n\n# Second')).toBe('---\n\n## First\n\n## Second');
  expect(normalizeExpectedRootBody('Plain body')).toBe('Plain body');
});

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-body-highlight-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  publishAttachmentLibraryPathSnapshot({
    assetsDir: path.join(mockedAppDataDir, 'assets'),
    libraryScope: 'test-library'
  });
  state.sourcePath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(state.sourcePath, { recursive: true });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
  openDatabaseConnection().driver.execute(
    "INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('readwise_source_mode',?,'old')",
    [JSON.stringify({ mode: 'relay', version: 1 })]
  );
});

afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});


it('verifies four materialized original EPUBs against their final chapters and resumes without rewriting', async () => {
  const source = ensureReadwiseRemoteSource();
  const driver = openDatabaseConnection().driver;
  driver.execute(`CREATE TRIGGER pause_completion BEFORE UPDATE OF value ON settings
    WHEN NEW.key='readwise_source_mode' BEGIN SELECT RAISE(ABORT, 'pause completion'); END`);
  const original = epubMigrationFetch();
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const response = await original(input);
    if (new URL(String(input)).hostname.endsWith('.amazonaws.com')) return response;
    const payload = await response.json();
    const results = Array.from({ length: 4 }, (_, index) => payload.results.map((item: Record<string, unknown>) => ({
      ...item, id: item.id ? `${item.id}-${index}` : undefined,
      parent_id: item.parent_id ? `${item.parent_id}-${index}` : null,
      external_id: item.external_id ? `${item.external_id}-${index}` : undefined,
      highlights: Array.isArray(item.highlights) ? item.highlights.map((highlight: Record<string, unknown>) => ({
        ...highlight, external_id: `${highlight.external_id}-${index}`
      })) : undefined
    }))).flat();
    return Response.json({ ...payload, count: results.length, results });
  });
  expect((await runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } })).status).toBe('failed');
  expect(await previewReadwiseSourceCutover()).toMatchObject({ completed_count: 4, total_count: 4 });
  const before = driver.queryAll('SELECT id, content, updated_at FROM nodes ORDER BY id');
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM import_sources WHERE json_extract(remote_import_state_json, '$.bodyAuthority')='original_epub'"
  )?.count).toBe(4);
  // Simulate the previous version's missing final-result receipt, retaining its saved resources.
  driver.execute("DELETE FROM readwise_api_import_stage WHERE record_kind='cutover-projection-v1'");
  driver.execute('DROP TRIGGER pause_completion');
  fetchImpl.mockClear();
  expect((await runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } })).status).toBe('completed');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(driver.queryAll('SELECT id, content, updated_at FROM nodes ORDER BY id')).toEqual(before);
  expect(source.connectionRef).toBeTruthy();
});

it('rebuilds a bound book when legacy timestamps look edited', async () => {
  await seedMigratableSource(state.sourcePath);
  ensureReadwiseRemoteSource();
  const driver = openDatabaseConnection().driver;
  driver.execute("UPDATE nodes SET content='User edited book', updated_at='2026-09-16T10:00:00Z' WHERE id='topic-1'");
  driver.execute("UPDATE import_sources SET last_imported_at='2026-09-15T10:00:00Z'");
  await runReadwiseSourceCutover({ dependencies: { fetchImpl: epubMigrationFetch(), minIntervalMs: 0 } });
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .not.toBe('User edited book');
  expect(await previewReadwiseSourceCutover()).toMatchObject({
    completed_count: 1, error_reason: null, total_count: 1
  });
});

it('rolls back content and identity when a new book fails during its final write', async () => {
  ensureReadwiseRemoteSource();
  const driver = openDatabaseConnection().driver;
  driver.execute(`CREATE TRIGGER reject_chapter BEFORE INSERT ON nodes
    WHEN NEW.id LIKE 'node-epub-%' BEGIN SELECT RAISE(ABORT, 'injected chapter failure'); END`);
  expect((await runReadwiseSourceCutover({ dependencies: {
    fetchImpl: epubMigrationFetch(), minIntervalMs: 0
  } })).status).toBe('failed');
  expect(driver.queryOne<{ count: number }>("SELECT COUNT(*) count FROM nodes WHERE kind='topic'")?.count).toBe(0);
  expect(driver.queryOne<{ count: number }>("SELECT COUNT(*) count FROM import_sources WHERE remote_provider='readwise'")?.count).toBe(0);
  expect(await previewReadwiseSourceCutover()).toMatchObject({
    failed_items: [expect.objectContaining({ stage: 'writing', reason: 'injected chapter failure' })],
    status: 'migration_in_progress'
  });
});
