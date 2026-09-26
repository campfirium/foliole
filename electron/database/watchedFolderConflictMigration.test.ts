// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

it('adds durable watched conflict decisions to an existing version 101 library', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.exec('DROP TABLE watched_folder_conflict_decisions; PRAGMA user_version = 101');
    initializeDatabaseSchema(db);
    db.prepare(`INSERT INTO watched_folder_conflict_decisions
      (group_id, conflict_key, decision_id, decided_at, decided_by_device_identity_key,
       selected_binding_ids_json) VALUES ('group', '["/Articles",["a","b"]]',
       'decision', 'now', 'a', '["a"]')`).run();
    expect(db.prepare(`SELECT selected_binding_ids_json FROM watched_folder_conflict_decisions`).get())
      .toEqual({ selected_binding_ids_json: '["a"]' });
  } finally {
    db.close();
  }
});

it('adds a local reconciliation marker to an existing version 102 decision table', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.exec(`ALTER TABLE watched_folder_conflict_decisions DROP COLUMN local_reconciled_at;
      PRAGMA user_version = 102`);
    initializeDatabaseSchema(db);
    expect(db.prepare(`SELECT name FROM pragma_table_info('watched_folder_conflict_decisions')
      WHERE name = 'local_reconciled_at'`).get()).toEqual({ name: 'local_reconciled_at' });
  } finally {
    db.close();
  }
});

it('adds a frozen source mapping column to existing version 103 decisions', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.exec(`INSERT INTO desktop_sources (source_ref, source_type, config_ref, host_name,
      host_platform, root_path, path_flavor, type_settings_json, created_at, updated_at)
      VALUES ('watched:old', 'watched', 'old', 'Host', 'darwin', '/Articles', 'posix', '{}', 'now', 'now'),
        ('watched:new', 'watched', 'new', 'Host', 'darwin', '/Articles', 'posix', '{}', 'now', 'now');
      INSERT INTO watched_folder_bindings (binding_id, connection_status, action_mode,
        highlight_mode, primary_path, created_at, updated_at, source_ref, local_rule_id)
      VALUES ('old', 'connected', 'keep', 'merged', '/Articles', 'now', 'now',
        'watched:old', 'draft-import-source-11'),
        ('new', 'connected', 'keep', 'merged', '/Articles', 'now', 'now',
        'watched:new', 'draft-import-source-12');
      INSERT INTO watched_folder_conflict_decisions (group_id, conflict_key, decision_id,
        decided_at, decided_by_device_identity_key, selected_binding_ids_json)
      VALUES ('group', '["/Articles",["new","old"]]', 'decision', 'now', 'device', '["new"]');`);
    db.exec(`ALTER TABLE watched_folder_conflict_decisions DROP COLUMN source_alias_refs_json;
      PRAGMA user_version = 103`);
    initializeDatabaseSchema(db);
    expect(db.prepare(`SELECT name FROM pragma_table_info('watched_folder_conflict_decisions')
      WHERE name = 'source_alias_refs_json'`).get()).toEqual({ name: 'source_alias_refs_json' });
    expect(db.prepare(`SELECT source_alias_refs_json FROM watched_folder_conflict_decisions`).get())
      .toEqual({ source_alias_refs_json: JSON.stringify([
        'watched:draft-import-source-11', 'watched:draft-import-source-12', 'watched:old'
      ]) });
  } finally {
    db.close();
  }
});
