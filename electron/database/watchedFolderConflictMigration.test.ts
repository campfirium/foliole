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
