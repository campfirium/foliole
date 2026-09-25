// @vitest-environment node

import Database from 'better-sqlite3';
import { afterAll, afterEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS } from '../../lib/core/sync/androidSyncPackProviderDefinitions.js';
import { applyImportSourceObject } from '../../lib/core/sync/syncObjectImportSourcePayloadExecutor.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
import { applyWatchedFolderObject } from '../../lib/core/sync/syncObjectWatchedFolderPayloadExecutor.js';
import type { SyncPackSyncObjectRecord } from '../../lib/core/sync/syncPackSyncObjectsExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

const db = new Database(':memory:');
initializeDatabaseSchema(db);
afterEach(() => db.exec('DELETE FROM import_sources; DELETE FROM watched_folder_bindings; DELETE FROM desktop_sources'));
afterAll(() => db.close());

function record(payload: Record<string, unknown>): SyncPackSyncObjectRecord {
  return { content_hash: 'hash', deleted_at: null, object_id: 'watched-a',
    object_type: 'watched_folder', payload_json: JSON.stringify(payload), updated_at: 'later' };
}

const shared = { action_mode: 'keep', binding_id: 'watched-a', connection_status: 'connected',
  created_at: 'now', highlight_mode: 'split', host_name: 'Remote Mac', host_platform: 'macOS',
  owner_device_identity_key: 'remote-device', reported_path: '/remote/private',
  source_ref: 'watched:watched-a' };

it('keeps local execution paths while accepting the remote display path', async () => {
  db.prepare(`INSERT INTO desktop_sources
    (source_ref, source_type, config_ref, host_name, host_platform, root_path,
     path_flavor, type_settings_json, created_at, updated_at)
    VALUES ('watched:watched-a', 'watched', 'watched-a', 'Local Mac', 'macOS',
      '/local/private', 'posix', '{"highlightPath":"/local/highlights"}', 'now', 'now')`).run();
  db.prepare(`INSERT INTO watched_folder_bindings
    (binding_id, connection_status, action_mode, highlight_mode, primary_path,
     created_at, updated_at, source_ref, owner_device_identity_key)
    VALUES ('watched-a', 'connected', 'keep', 'split', '/local/private', 'now', 'now',
      'watched:watched-a', 'local-device')`).run();
  const port = createBetterSqliteDbPort(db);
  await applyWatchedFolderObject(port, record(shared));
  expect(db.prepare(`SELECT root_path, type_settings_json FROM desktop_sources
    WHERE source_ref = 'watched:watched-a'`).get()).toEqual({
    root_path: '/local/private', type_settings_json: '{"highlightPath":"/local/highlights"}'
  });
  expect(db.prepare(`SELECT owner_device_identity_key, primary_path, reported_path FROM watched_folder_bindings
    WHERE binding_id = 'watched-a'`).get()).toEqual({
    owner_device_identity_key: 'remote-device', primary_path: '/local/private',
    reported_path: '/remote/private'
  });
  await expect(applyWatchedFolderObject(port, record({ ...shared, primary_path: '/remote/private' })))
    .rejects.toThrow('invalid_watched_folder_payload');
  await expect(applyWatchedFolderObject(port, record({ ...shared, root_path: '/remote/private' })))
    .rejects.toThrow('invalid_watched_folder_payload');
});

it('publishes no watched import locator while preserving its local historical value', async () => {
  db.prepare(`INSERT INTO import_sources
    (source_fingerprint, provider, source_kind, source_name, source_locator,
     first_imported_at, last_imported_at, last_content_fingerprint, watched_binding_id,
     watched_relative_path)
    VALUES ('source', 'markdown', 'file', 'note.md', '/local/private/note.md',
      'now', 'now', 'content', 'watched-a', 'note.md')`).run();
  const payload = db.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.import_source)
    .get('source') as { payload_json: string };
  expect(JSON.parse(payload.payload_json)).toMatchObject({ source_locator: '', watched_relative_path: 'note.md' });
  const port = createBetterSqliteDbPort(db);
  await applyImportSourceObject(port, { ...record(JSON.parse(payload.payload_json)),
    object_id: 'source', object_type: 'import_source' });
  expect(db.prepare(`SELECT source_locator FROM import_sources WHERE source_fingerprint = 'source'`)
    .pluck().get()).toBe('/local/private/note.md');
  await expect(applyImportSourceObject(port, { ...record({ ...JSON.parse(payload.payload_json),
    source_locator: '/remote/private/note.md' }), object_id: 'source', object_type: 'import_source' }))
    .rejects.toThrow('invalid_watched_import_source_locator');
  db.prepare(`INSERT INTO desktop_sources
    (source_ref, source_type, config_ref, host_name, host_platform, root_path,
     path_flavor, type_settings_json, created_at, updated_at)
    VALUES ('watched:old', 'watched', 'old', 'Local Mac', 'macOS', '/local/old',
      'posix', '{}', 'now', 'now')`).run();
  db.prepare(`UPDATE import_sources SET watched_binding_id = NULL,
    source_ref = 'watched:old' WHERE source_fingerprint = 'source'`).run();
  const unbound = db.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.import_source)
    .get('source') as { payload_json: string };
  expect(JSON.parse(unbound.payload_json).source_locator).toBe('');
  db.exec(`ATTACH DATABASE ':memory:' AS source;
    CREATE TABLE source.import_sources AS SELECT * FROM main.import_sources;
    CREATE TABLE source.desktop_sources AS SELECT * FROM main.desktop_sources;`);
  try {
    const plan = ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS.payloadPlans
      .find((item) => item.objectType === 'import_source')!;
    const packed = db.prepare(plan.sql).get() as { source_locator: string };
    expect(packed.source_locator).toBe('');
  } finally {
    db.exec('DETACH DATABASE source');
  }
});
