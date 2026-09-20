import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('upgrades v37 watched sources without exposing old paths or guessing same-name owners', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-companion-watched-'));
  const sqlite = new Database(path.join(root, 'fixture.db'));
  try {
    sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    sqlite.exec(`ALTER TABLE watched_folder_bindings DROP COLUMN owner_device_identity_key;
      INSERT INTO companion_meta (key, value, updated_at) VALUES ('device_id', 'phone', 'now');
      INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
        VALUES ('group', 'Group', 'key', 'now', 'now');
      INSERT INTO sync_group_local_state
        (singleton_id, group_id, local_device_identity_key, state, updated_at)
        VALUES (1, 'group', 'phone', 'active', 'now');`);
    for (const deviceId of ['first', 'second']) {
      sqlite.prepare(`INSERT INTO sync_group_devices
        (group_id, device_identity_key, device_anchor, canonical_library_path,
         device_name, platform, state, joined_at, updated_at)
        VALUES ('group', ?, ?, ?, 'Same Mac', 'macOS', 'active', 'now', 'now')`)
        .run(deviceId, `${deviceId}-anchor`, `/library/${deviceId}`);
    }
    sqlite.exec(`INSERT INTO desktop_sources
      (source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, created_at, updated_at)
      VALUES ('watched:old', 'watched', 'old', 'Same Mac', 'macOS', '/private/old',
        'posix', '{}', 'now', 'now');
      INSERT INTO import_sources
      (source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, last_content_fingerprint, watched_binding_id,
       watched_relative_path)
      VALUES ('watched-file', 'markdown', 'file', 'note.md', '/private/old/note.md',
        'now', 'now', 'content', 'old', 'note.md');
      INSERT INTO setting_records
      (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES ('import_manager_settings', 'user_space', '*', '*', '*',
        '{"sources":[{"id":"old","primaryPath":"/private/old"}]}', 'old-hash', 'now');`);
    sqlite.pragma('user_version = 37');
    await bootstrapCompanionDatabase(createBetterSqliteDbPort(sqlite), {
      allowCreate: false, expectedHostName: 'Phone', now: 'now'
    });
    expect(sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
    expect(sqlite.prepare(`SELECT owner_device_identity_key, connection_status
      FROM watched_folder_bindings WHERE binding_id = 'old'`).get()).toEqual({
      owner_device_identity_key: null, connection_status: 'needs-folder'
    });
    expect(sqlite.prepare(`SELECT root_path FROM desktop_sources WHERE source_ref = 'watched:old'`)
      .pluck().get()).toBe('/private/old');
    expect(sqlite.prepare(`SELECT value_json FROM setting_records WHERE key = 'import_manager_settings'`)
      .pluck().get()).not.toContain('/private/old');
    expect(sqlite.prepare(`SELECT sync_dirty FROM sync_object_state
      WHERE object_type = 'watched_folder' AND object_id = 'old'`).pluck().get()).toBe(1);
    expect(sqlite.prepare(`SELECT sync_dirty FROM sync_object_state
      WHERE object_type = 'import_source' AND object_id = 'watched-file'`).pluck().get()).toBe(1);
  } finally {
    sqlite.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
