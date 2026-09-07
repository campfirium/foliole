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
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import {
  stableReadwiseAnnotationNodeId,
  type PreparedReadwiseApiDocument
} from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-api-materialization-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('preserves the local body and materializes distinct remote annotation identities once', () => {
  const config = { ...createDefaultReadwiseReaderConfig(), withHighlightsDestination: 'inbox' as const };
  const first = documentFixture([{ content: 'Repeated excerpt', remoteId: 'highlight-1' }]);
  expect(materializeReadwiseApiDocument({ config, connectionRef: 'connection', document: first }))
    .toMatchObject({ annotationCount: 1, status: 'imported' });

  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'document-1'"
  )!;
  const row = driver.queryOne<{ content: string; title: string }>(
    'SELECT content, title FROM nodes WHERE id = ?', [source.latest_node_id]
  )!;
  applyParentContentChange({
    driver, nextContent: `${row.content}\n\nLocal edit`, nodeId: source.latest_node_id,
    previousContent: row.content, title: row.title, updatedAt: '2026-09-07T01:00:00.000Z'
  });

  const second = documentFixture([
    { content: 'Repeated excerpt', remoteId: 'highlight-1' },
    { content: 'Repeated excerpt', remoteId: 'highlight-2' }
  ], '# Replaced remote body');
  expect(materializeReadwiseApiDocument({ config, connectionRef: 'connection', document: second }))
    .toMatchObject({ annotationCount: 1, status: 'imported' });

  const body = driver.queryOne<{ body: string }>(
    `SELECT CAST(cbd.data AS TEXT) body FROM nodes n JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ?`, [source.latest_node_id]
  );
  expect(body?.body).toContain('Local edit');
  expect(body?.body).not.toContain('Replaced remote body');
  expect(driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) count FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [source.latest_node_id]
  )).toEqual({ count: 2 });

  materializeReadwiseApiDocument({ config, connectionRef: 'connection', document: second });
  expect(driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) count FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [source.latest_node_id]
  )).toEqual({ count: 2 });
});

it('keeps deleted topics blocked instead of reviving them', () => {
  const config = { ...createDefaultReadwiseReaderConfig(), withHighlightsDestination: 'inbox' as const };
  const document = documentFixture([{ content: 'Excerpt', remoteId: 'highlight-1' }]);
  materializeReadwiseApiDocument({ config, connectionRef: 'connection', document });
  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'document-1'"
  )!;
  driver.execute('UPDATE nodes SET deleted_at = ? WHERE id = ?', ['2026-09-07T02:00:00.000Z', source.latest_node_id]);

  expect(materializeReadwiseApiDocument({ config, connectionRef: 'connection', document }))
    .toMatchObject({ status: 'blocked' });
  expect(driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) count FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [source.latest_node_id]
  )).toEqual({ count: 1 });
  const state = driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id = 'document-1'"
  );
  expect(JSON.parse(state?.remote_import_state_json ?? '{}').documentBlockedAt).toBeTruthy();
});

it('keeps a deleted annotation child blocked while appending a different remote identity', () => {
  const config = { ...createDefaultReadwiseReaderConfig(), withHighlightsDestination: 'inbox' as const };
  materializeReadwiseApiDocument({
    config, connectionRef: 'connection', document: documentFixture([{ content: 'Excerpt', remoteId: 'highlight-1' }])
  });
  const driver = openDatabaseConnection().driver;
  const childId = stableReadwiseAnnotationNodeId('connection', 'highlight-1');
  driver.execute('UPDATE nodes SET deleted_at = ? WHERE id = ?', ['2026-09-07T02:00:00.000Z', childId]);

  const result = materializeReadwiseApiDocument({
    config,
    connectionRef: 'connection',
    document: documentFixture([
      { content: 'Excerpt', remoteId: 'highlight-1' },
      { content: 'Excerpt', remoteId: 'highlight-2' }
    ])
  });
  expect(result).toMatchObject({ annotationCount: 1, status: 'imported' });
  expect(driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) count FROM nodes WHERE id = ? AND deleted_at IS NULL', [childId]
  )).toEqual({ count: 0 });
  const state = driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id = 'document-1'"
  );
  const annotations = JSON.parse(state?.remote_import_state_json ?? '{}').annotations;
  expect(annotations.find((item: { remoteId: string }) => item.remoteId === 'highlight-1').blockedAt).toBeTruthy();
});

it('records unavailable bodies without creating an empty Topic', () => {
  const config = { ...createDefaultReadwiseReaderConfig(), withoutHighlightsDestination: 'inbox' as const };
  const result = materializeReadwiseApiDocument({
    config, connectionRef: 'connection', document: documentFixture([], '')
  });
  expect(result.status).toBe('degraded');
  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ count: number }>('SELECT COUNT(*) count FROM nodes')).toEqual({ count: 0 });
  const source = driver.queryOne<{ latest_node_id: string | null; remote_import_state_json: string }>(
    "SELECT latest_node_id, remote_import_state_json FROM import_sources WHERE remote_document_id = 'document-1'"
  );
  expect(source?.latest_node_id).toBeNull();
  expect(JSON.parse(source?.remote_import_state_json ?? '{}').bodyState).toBe('unavailable');
});

function documentFixture(
  annotations: Array<{ content: string; remoteId: string }>,
  body = 'Before Repeated excerpt after.'
): PreparedReadwiseApiDocument {
  return {
    annotations: annotations.map((annotation) => ({
      content: annotation.content, contentHash: annotation.remoteId, kind: 'highlight',
      locatorText: annotation.content, parentRemoteId: 'document-1', remoteId: annotation.remoteId,
      updatedAt: '2026-09-07T00:00:00.000Z'
    })),
    body, category: 'article', degradedReason: null, id: 'document-1',
    metadata: { author: null, category: 'article', readerUrl: null, sourceUrl: null, title: 'Remote title' },
    title: 'Remote title', unmatchedAnnotationCount: 0, updatedAt: '2026-09-07T00:00:00.000Z'
  };
}
