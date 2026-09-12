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
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { runReadwiseApiImport } from './readwiseApiImportRun.js';
import { runReadwiseSourceCutover } from './readwiseSourceCutover.js';
import {
  epubMigrationFetch,
  incrementalHighlightFetch,
  migrationFetch,
  migrationFetchWithoutHighlightBody,
  seedMigratableSource
} from './readwiseSourceCutoverTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-body-highlight-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  state.sourcePath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(state.sourcePath, { recursive: true });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('writes the API body before materializing a legacy fallback highlight', async () => {
  await seedMigratableSource(state.sourcePath);
  const seeded = openDatabaseConnection().driver;
  seeded.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('readwise-folder',NULL,'folder','Readwise Folder',0,'','old','old')`);
  seeded.execute("UPDATE nodes SET parent_id='readwise-folder' WHERE id='topic-1'");
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl: migrationFetchWithoutHighlightBody(), minIntervalMs: 0 }
  })).resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .toContain('API body with remembered phrase.');
  expect(driver.queryOne<{ content: string }>(
    `SELECT content FROM nodes WHERE parent_id='topic-1'
     AND json_extract(anchor_link, '$.kind')='highlight'`
  )?.content).toBe('remembered phrase');
  expect(driver.queryOne<{ anchor_link: string }>(
    "SELECT anchor_link FROM nodes WHERE id='local-cloze'"
  )?.anchor_link).toContain('remembered phrase');
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM nodes WHERE kind='topic' AND title LIKE 'Sample%' AND deleted_at IS NULL"
  )?.count).toBe(1);
  expect(driver.queryOne<{ parent_id: string }>("SELECT parent_id FROM nodes WHERE id='topic-1'")?.parent_id)
    .toBe('readwise-folder');
});

it('builds a bound EPUB as chapters during the cutover instead of keeping the flat root body', async () => {
  await seedMigratableSource(state.sourcePath);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');

  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl: epubMigrationFetch(), minIntervalMs: 0 }
  })).resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .toContain('Cover matter');
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .not.toContain('API body with remembered phrase.');
  expect(driver.queryAll<{ title: string }>(
    "SELECT title FROM nodes WHERE parent_id='topic-1' AND id LIKE 'node-epub-%' AND deleted_at IS NULL"
  ).map((item) => item.title)).toEqual(['Chapter 1', 'Chapter 2']);
  expect(driver.queryOne<{ parent_id: string }>(
    "SELECT parent_id FROM nodes WHERE content='remembered phrase' AND deleted_at IS NULL"
  )?.parent_id).not.toBe('topic-1');
});

it('adds later API highlights without creating a source-update workflow', async () => {
  await seedMigratableSource(state.sourcePath);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  await runReadwiseSourceCutover({ dependencies: { fetchImpl: migrationFetch(), minIntervalMs: 0 } });
  const driver = openDatabaseConnection().driver;
  const migratedBody = driver.queryOne<{ content: string }>(
    "SELECT content FROM nodes WHERE id='topic-1'"
  )?.content;
  await expect(runReadwiseApiImport({
    dependencies: { fetchImpl: incrementalHighlightFetch(), minIntervalMs: 0 }
  })).resolves.toMatchObject({ annotation_count: 1, status: 'completed' });

  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .toBe(migratedBody);
  expect(migratedBody).not.toContain('Changed API body');
  expect(driver.queryOne<{ anchor_link: string; content: string }>(
    "SELECT anchor_link, content FROM nodes WHERE parent_id='topic-1' AND content='new phrase' AND deleted_at IS NULL"
  )).toMatchObject({ anchor_link: expect.stringContaining('new phrase'), content: 'new phrase' });
  const stateJson = driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id='document-1'"
  )?.remote_import_state_json ?? '{}';
  const importState = JSON.parse(stateJson) as {
    annotations: Array<{ remoteId: string }>;
    sourceUpdate: null | { status: string };
  };
  expect(importState.annotations.map((item) => item.remoteId).sort()).toEqual(['highlight-1', 'highlight-2']);
  expect(importState.sourceUpdate).toBeNull();
});

it('returns immediately after a real completion without requesting the API again', async () => {
  await seedMigratableSource(state.sourcePath);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  await runReadwiseSourceCutover({ dependencies: { fetchImpl: migrationFetch(), minIntervalMs: 0 } });
  const fetchImpl = vi.fn(async () => { throw new Error('network_must_not_run'); }) as typeof fetch;

  await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } }))
    .resolves.toMatchObject({ status: 'already_completed' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
