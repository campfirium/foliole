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
      readwiseReaderConfig: createDefaultReadwiseReaderConfig(), readwiseSourceMode: 'api'
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
import { loadReadwiseApiCompletedThrough } from '../database/readwiseApiImportState.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { runReadwiseApiImport } from './readwiseApiImportRun.js';
import { runReadwiseSourceCutover } from './readwiseSourceCutover.js';
import {
  incrementalHighlightFetch,
  migrationFetch,
  seedMigratableSource
} from './readwiseSourceCutoverTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-post-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  publishAttachmentLibraryPathSnapshot({
    assetsDir: path.join(mockedAppDataDir, 'assets'), libraryScope: 'test-library'
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

it('adds later API highlights without creating a source-update workflow', async () => {
  await seedMigratableSource(state.sourcePath);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  await runReadwiseSourceCutover({ dependencies: { fetchImpl: migrationFetch(), minIntervalMs: 0 } });
  const connectionRef = ensureReadwiseRemoteSource().connectionRef;
  const completedThrough = loadReadwiseApiCompletedThrough(connectionRef);
  const fetchImpl = incrementalHighlightFetch();
  const driver = openDatabaseConnection().driver;
  const migratedBody = driver.queryOne<{ content: string }>(
    "SELECT content FROM nodes WHERE id='topic-1'"
  )?.content;
  await expect(runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }
  })).resolves.toMatchObject({ annotation_count: 1, status: 'completed' });

  const incrementalScopes = fetchImpl.mock.calls.map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === '/api/v2/export/' || url.searchParams.has('category'));
  expect(completedThrough).not.toBeNull();
  expect(incrementalScopes.length).toBeGreaterThan(0);
  expect(incrementalScopes.every((url) =>
    url.searchParams.get('updatedAfter') === completedThrough)).toBe(true);

  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .toBe(migratedBody);
  expect(migratedBody).not.toContain('Changed API body');
  expect(driver.queryOne<{ anchor_link: string; content: string }>(
    "SELECT anchor_link, content FROM nodes WHERE parent_id='topic-1' AND content='new phrase' AND deleted_at IS NULL"
  )).toMatchObject({ content: 'new phrase' });
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

it('does not revive a legacy highlight that Export reports as deleted', async () => {
  await seedMigratableSource(state.sourcePath);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  const fallback = migrationFetch();
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname !== '/api/v2/export/') return fallback(input);
    return Response.json({ count: 1, nextPageCursor: null, results: [{
      external_id: 'document-1', source: 'reader', highlights: [{
        external_id: 'highlight-1', is_deleted: true, text: 'remembered phrase'
      }]
    }] });
  }) as typeof fetch;

  await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } }))
    .resolves.toMatchObject({ status: 'completed' });

  const source = openDatabaseConnection().driver.queryOne<{ remote_annotations_json: string }>(
    "SELECT remote_annotations_json FROM import_sources WHERE remote_document_id='document-1'"
  );
  expect(JSON.parse(source?.remote_annotations_json ?? '[]')).toEqual([]);
});

it('rebinds an already migrated dismissed source during recovery', async () => {
  await seedMigratableSource(state.sourcePath);
  const source = ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO source_disposition_states
    (source_kind,source_scope,original_title,disposition,updated_at)
    VALUES ('readwise',?,'Sample','dismissed','old')`, [
    `api/${encodeURIComponent(source.connectionRef)}/document-1`
  ]);

  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl: migrationFetch(), minIntervalMs: 0 }
  })).resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  const journal = JSON.parse(driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
  )?.value ?? '{}') as { documents: Array<{ remoteId: string; status: string }>; failures?: unknown[] };
  expect(journal.documents).toContainEqual({ nodeId: 'topic-1', remoteId: 'document-1', status: 'bound' });
  expect(journal.failures ?? []).toEqual([]);
});
