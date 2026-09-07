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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import {
  confirmReadwiseIdentityBindings,
  ensureReadwiseRemoteSource
} from './readwiseRemoteIdentity.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-remote-identity-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id, kind, title, created_at, updated_at)
    VALUES ('topic-1','topic','One','old','old'), ('topic-2','topic','Two','old','old')`);
  driver.execute(`INSERT INTO import_sources
    (source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at,
      last_imported_at, last_content_fingerprint, latest_node_id, source_ref, source_location)
    VALUES ('one','desktop_text_file','markdown','One','/old/one','old','old','hash','topic-1','readwise:a','One.md'),
      ('two','desktop_text_file','markdown','Two','/old/two','old','old','hash','topic-2','readwise:a','Two.md')`);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('persists bindings idempotently, marks sync dirty, and rejects identity conflicts', () => {
  const source = ensureReadwiseRemoteSource(false, '2026-09-07T00:00:00.000Z');
  const binding = {
    annotations: [{ kind: 'highlight' as const, nodeId: 'child-1', remoteId: 'highlight-1' }],
    remoteDocumentId: 'document-1', sourceFingerprint: 'one'
  };
  confirmReadwiseIdentityBindings(source.connectionRef, [binding], '2026-09-07T00:01:00.000Z');
  confirmReadwiseIdentityBindings(source.connectionRef, [binding], '2026-09-07T00:02:00.000Z');

  expect(openDatabaseConnection().driver.queryOne(`SELECT source_locator, remote_document_id,
    remote_annotations_json FROM import_sources WHERE source_fingerprint='one'`)).toEqual({
    remote_annotations_json: '[{"kind":"highlight","nodeId":"child-1","remoteId":"highlight-1"}]',
    remote_document_id: 'document-1', source_locator: '/old/one'
  });
  expect(openDatabaseConnection().driver.queryOne<{ sync_dirty: number }>(`SELECT sync_dirty FROM sync_object_state
    WHERE object_type='import_source' AND object_id='one'`)).toEqual({ sync_dirty: 1 });
  expect(() => confirmReadwiseIdentityBindings(source.connectionRef, [{
    annotations: [], remoteDocumentId: 'document-1', sourceFingerprint: 'two'
  }])).toThrow();
});
