// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import {
  buildCanonicalSettingSyncPayload,
  buildCanonicalViewStateSyncPayload
} from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';

const updatedAt = '2026-10-05T01:00:00.000Z';

it('publishes legacy private-state hashes once without changing business clocks', () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    sqlite.prepare(
      `INSERT INTO setting_records
       (scope, platform, form_factor, host_name, key, value_json, content_hash, updated_at, deleted_at)
       VALUES ('user_space', 'windows', 'desktop', '*', 'app_settings', ?, 'legacy-setting', ?, NULL)`
    ).run('{"theme":"dark"}', updatedAt);
    sqlite.prepare(
      "INSERT INTO workspace_meta (key, value, updated_at) VALUES ('active_node_id', '', ?)"
    ).run(updatedAt);
    insertState(sqlite, 'setting', 'user_space:windows:desktop:*:app_settings', 'legacy-setting', 10);
    insertState(sqlite, 'view_state',
      'session_resume:windows:desktop:host-a:active_node', 'legacy-view', 11);
    insertState(sqlite, 'setting', 'device:windows:desktop:host-a:retired', 'legacy-delete', 12);
    sqlite.prepare(`UPDATE sync_object_state SET deleted_at = ? WHERE object_id = ?`)
      .run(updatedAt, 'device:windows:desktop:host-a:retired');
    sqlite.pragma('user_version = 135');

    initializeDatabaseSchema(sqlite);

    const settingHash = computeSyncContentHash('setting', buildCanonicalSettingSyncPayload({
      form_factor: 'desktop', host_name: '*', key: 'app_settings', platform: 'windows',
      scope: 'user_space', value_json: '{"theme":"dark"}'
    }));
    const viewHash = computeSyncContentHash('view_state', buildCanonicalViewStateSyncPayload({
      active_node_id: null, form_factor: 'desktop', host_name: 'host-a', key: 'active_node',
      platform: 'windows', scope: 'session_resume'
    }));
    const tombstoneHash = computeSyncContentHash('setting', buildCanonicalSyncTombstone(
      'device:windows:desktop:host-a:retired'
    ));
    expect(readState(sqlite, 'setting')).toMatchObject({ base_content_hash: 'legacy-setting',
      content_hash: settingHash, sync_dirty: 1, updated_at: updatedAt });
    expect(readState(sqlite, 'view_state')).toMatchObject({ base_content_hash: 'legacy-view',
      content_hash: viewHash, sync_dirty: 1, updated_at: updatedAt });
    expect(sqlite.prepare(`SELECT base_content_hash, content_hash, sync_dirty FROM sync_object_state
      WHERE object_id = 'device:windows:desktop:host-a:retired'`).get()).toEqual({
      base_content_hash: 'legacy-delete', content_hash: tombstoneHash, sync_dirty: 1
    });
    expect(readState(sqlite, 'setting').state_seq).toBeGreaterThan(12);
    expect(readState(sqlite, 'view_state').state_seq).toBeGreaterThan(12);
    expect(sqlite.prepare('SELECT content_hash, updated_at FROM setting_records').get())
      .toEqual({ content_hash: settingHash, updated_at: updatedAt });

    const published = sqlite.prepare(
      'SELECT object_type, state_seq, content_hash FROM sync_object_state ORDER BY object_type'
    ).all();
    initializeDatabaseSchema(sqlite);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    expect(sqlite.prepare(
      'SELECT object_type, state_seq, content_hash FROM sync_object_state ORDER BY object_type'
    ).all()).toEqual(published);
  } finally {
    sqlite.close();
  }
});

function insertState(
  sqlite: Database.Database, objectType: string, objectId: string, contentHash: string, stateSeq: number
) {
  sqlite.prepare(
    `INSERT INTO sync_object_state
     (object_type, object_id, state_seq, current_version_id, content_hash,
      last_modified_by_host_name, updated_at, deleted_at, sync_dirty, base_content_hash)
     VALUES (?, ?, ?, NULL, ?, 'host-a', ?, NULL, 0, NULL)`
  ).run(objectType, objectId, stateSeq, contentHash, updatedAt);
}

function readState(sqlite: Database.Database, objectType: string) {
  return sqlite.prepare(
    `SELECT base_content_hash, content_hash, state_seq, sync_dirty, updated_at
     FROM sync_object_state WHERE object_type = ? AND deleted_at IS NULL`
  ).get(objectType) as Record<string, string | number | null>;
}
