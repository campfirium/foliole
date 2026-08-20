// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

function seedLegacySourceSchema(sqlite: Database.Database) {
  sqlite.exec(`DROP TABLE watched_folder_bindings;
    DROP TABLE external_search_folders;
    DROP TABLE desktop_sources;
    CREATE TABLE desktop_sources (
      source_ref TEXT PRIMARY KEY, source_type TEXT NOT NULL, config_ref TEXT NOT NULL,
      host_name TEXT NOT NULL, host_platform TEXT NOT NULL, owner_installation_id TEXT,
      root_path TEXT NOT NULL, path_flavor TEXT NOT NULL, type_settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(source_type, config_ref)
    );
    CREATE TABLE external_search_folders (
      id TEXT PRIMARY KEY, folder_path TEXT NOT NULL, attachment_mode TEXT NOT NULL,
      attachment_root_path TEXT, excluded_dirs_json TEXT NOT NULL, status TEXT NOT NULL,
      document_count INTEGER NOT NULL, indexed_at TEXT, last_error TEXT,
      owner_installation_id TEXT, owner_device_name TEXT, owner_platform TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, source_ref TEXT
    );
    CREATE TABLE watched_folder_bindings (
      binding_id TEXT PRIMARY KEY, connected_device_id TEXT, connected_device_name TEXT,
      connected_platform TEXT, connection_status TEXT NOT NULL, action_mode TEXT NOT NULL,
      archive_path TEXT NOT NULL, highlight_mode TEXT NOT NULL, highlight_path TEXT NOT NULL,
      primary_path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted_at TEXT, source_ref TEXT
    );`);
}

function seedLegacySourceRows(sqlite: Database.Database) {
  sqlite.exec(`INSERT INTO desktop_sources VALUES
      ('external:docs','external','docs','fixture-device','android','installation-a',
        '/Docs','posix','{"connectionStatus":"connected"}','c','u'),
      ('watched:inbox','watched','inbox','fixture-device','android','installation-a',
        '/Inbox','posix','{}','c','u');
    INSERT INTO external_search_folders VALUES
      ('docs','/Docs','document_relative',NULL,'[]','ready',3,'u',NULL,
        'installation-a','fixture-device','android','c','u','external:docs');
    INSERT INTO watched_folder_bindings VALUES
      ('inbox','fixture-device','fixture-device','android','connected','keep','','merged','',
        '/Inbox','c','u',NULL,'watched:inbox');
    INSERT INTO setting_records VALUES
      ('readwise_active_device','user_space','android','phone','*',
        '{"device_id":"fixture-device"}','old-setting-hash','u',NULL);
    INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES
      ('external_folder','docs',1,'old-external-hash','fixture-device','u',0),
      ('watched_folder','inbox',2,'old-watched-hash','fixture-device','u',0),
      ('setting','user_space:android:phone:*:readwise_active_device',3,
        'old-setting-hash','fixture-device','u',0);`);
}

it('migrates Source ownership to Host without changing roots or source references', async () => {
  fs.mkdirSync(path.resolve('.tmp/artifacts'), { recursive: true });
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/t135-source-host-'));
  const sqlite = new Database(path.join(root, 'companion.db'));
  sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  sqlite.prepare('INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)')
    .run('device_id', 'fixture-device', 'u');
  sqlite.pragma('user_version = 31');
  seedLegacySourceSchema(sqlite);
  seedLegacySourceRows(sqlite);

  await bootstrapCompanionDatabase(createBetterSqliteDbPort(sqlite), {
    allowCreate: false, expectedHostName: 'fixture-host', now: 'u'
  });

  expect(sqlite.prepare(`SELECT source_ref, host_name, root_path FROM desktop_sources
    ORDER BY source_ref`).all()).toEqual([
    { host_name: 'fixture-host', root_path: '/Docs', source_ref: 'external:docs' },
    { host_name: 'fixture-host', root_path: '/Inbox', source_ref: 'watched:inbox' }
  ]);
  expect(sqlite.prepare("SELECT name FROM pragma_table_info('desktop_sources')").pluck().all())
    .not.toContain('owner_installation_id');
  expect(sqlite.prepare("SELECT name FROM pragma_table_info('watched_folder_bindings')").pluck().all())
    .not.toContain('connected_device_id');
  expect(sqlite.prepare("SELECT value_json FROM setting_records WHERE key = 'readwise_active_host'").get())
    .toEqual({ value_json: '{"host_name":"fixture-host"}' });
  expect(sqlite.prepare(`SELECT object_id, sync_dirty FROM sync_object_state
    WHERE object_type = 'setting'`).get()).toEqual({
    object_id: 'user_space:android:phone:*:readwise_active_host', sync_dirty: 1
  });
  sqlite.close();
  fs.rmSync(root, { force: true, recursive: true });
});
