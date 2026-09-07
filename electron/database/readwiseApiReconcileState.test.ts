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
import { ALL_READWISE_RECONCILE_SCOPE } from '../../lib/core/readwise/readwiseRemoteLifecycle.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import {
  completeReadwiseApiReconcileRun,
  loadOrCreateReadwiseApiReconcileRun,
  loadReadwiseApiReconcileStage,
  saveReadwiseApiReconcilePage
} from './readwiseApiReconcileState.js';
import { loadSyncObjectsFromDriver } from './syncObjectsFromDriver.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-reconcile-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('topic','topic','Topic','Local edited body','old','old'),
      ('highlight','topic','Highlight','Local highlight','old','old')`);
  driver.execute(`INSERT INTO import_sources (
    source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at,
    last_imported_at, last_content_fingerprint, latest_node_id, remote_provider,
    remote_connection_ref, remote_document_id, remote_annotations_json, remote_import_state_json
  ) VALUES ('source','desktop_text_file','html','Topic','readwise://document/document','old','old','hash',
    'topic','readwise','connection','document','[{"kind":"highlight","nodeId":"highlight","remoteId":"highlight"}]',
    '{"annotations":[{"blockedAt":null,"contentHash":"hash","kind":"highlight","nodeId":"highlight","parentRemoteId":"document","remoteId":"highlight","sourceUpdatedAt":"old"}],"bodyState":"materialized","metadata":{},"sourceUpdatedAt":"old","version":2}')`);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('writes deletion and missing facts only after both complete sets and keeps local content', () => {
  const run = loadOrCreateReadwiseApiReconcileRun('connection', ALL_READWISE_RECONCILE_SCOPE, 'start');
  expect(readState().remoteLifecycle).toMatchObject({ checkedAt: null, reader: 'unconfirmed' });
  expect(() => completeReadwiseApiReconcileRun(run, 'too-early')).toThrow('readwise_reconcile_incomplete');
  saveReadwiseApiReconcilePage({ connectionRef: 'connection', cursor: null, items: [], kind: 'reader' });
  saveReadwiseApiReconcilePage({ connectionRef: 'connection', cursor: null, items: [{
    externalId: 'document', highlights: [{ externalId: 'highlight', isDeleted: true }],
    isDeleted: true, source: 'reader'
  }], kind: 'export' });
  const completed = completeReadwiseApiReconcileRun({ ...run, phase: 'ready' }, 'done');
  expect(completed).toMatchObject({ exportDeletedCount: 1, readerMissingCount: 1 });
  expect(readState()).toMatchObject({
    annotations: [{ remoteId: 'highlight', remoteStatus: 'deleted' }],
    remoteLifecycle: { checkedAt: 'done', export: 'deleted', reader: 'missing' }
  });
  expect(readContent()).toEqual(['Local edited body', 'Local highlight']);
  const synced = loadSyncObjectsFromDriver(openDatabaseConnection().driver, ['source'], ['import_source']);
  expect(JSON.parse(JSON.parse(synced[0]!.payload_json!).remote_import_state_json)).toMatchObject({
    remoteLifecycle: { export: 'deleted', reader: 'missing' }
  });
});

it('resets an incomplete set when scope changes and restores present facts on a later full set', () => {
  loadOrCreateReadwiseApiReconcileRun('connection', ALL_READWISE_RECONCILE_SCOPE, 'start');
  saveReadwiseApiReconcilePage({
    connectionRef: 'connection', cursor: 'next', items: [{ category: 'article', id: 'document' }], kind: 'reader'
  });
  expect(loadReadwiseApiReconcileStage('connection').reader).toHaveLength(1);
  const laterScope = { readerLocation: 'later' as const, version: 1 };
  const reset = loadOrCreateReadwiseApiReconcileRun('connection', laterScope, 'changed');
  expect(loadReadwiseApiReconcileStage('connection').reader).toHaveLength(0);
  expect(readState().remoteLifecycle).toMatchObject({ checkedAt: null, scope: laterScope });
  saveReadwiseApiReconcilePage({
    connectionRef: 'connection', cursor: null, items: [
      { category: 'article', id: 'document' }, { category: 'highlight', id: 'highlight' }
    ], kind: 'reader'
  });
  saveReadwiseApiReconcilePage({ connectionRef: 'connection', cursor: null, items: [{
    externalId: 'document', highlights: [{ externalId: 'highlight', isDeleted: false }],
    isDeleted: false, source: 'reader'
  }], kind: 'export' });
  completeReadwiseApiReconcileRun({ ...reset, phase: 'ready' }, 'restored');
  expect(readState()).toMatchObject({ annotations: [{ remoteStatus: 'present' }],
    remoteLifecycle: { checkedAt: 'restored', export: 'present', reader: 'present' } });
  expect(readContent()).toEqual(['Local edited body', 'Local highlight']);
});

function readState() {
  const row = openDatabaseConnection().driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE source_fingerprint='source'"
  );
  return JSON.parse(row?.remote_import_state_json ?? '{}');
}

function readContent() {
  return openDatabaseConnection().driver.queryAll<{ content: string }>(
    "SELECT content FROM nodes WHERE id IN ('topic','highlight') ORDER BY id DESC"
  ).map((row) => row.content);
}
