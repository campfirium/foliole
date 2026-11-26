// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => { throw new Error('no_app_paths_in_schema_test'); } }));

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { readSchemaShape, restorePreLocalDerivedIndexSchema } from './localDerivedIndexMigration.testSupport.js';

const opened: Database.Database[] = [];
afterEach(() => { for (const sqlite of opened.splice(0)) sqlite.close(); });

function freshLibrary() {
  const sqlite = new Database(':memory:');
  opened.push(sqlite);
  initializeDatabaseSchema(sqlite);
  return sqlite;
}

function insertNode(sqlite: Database.Database, id: string, fields: Record<string, unknown> = {}) {
  const row = { id, title: id, created_at: '2026-11-01', updated_at: '2026-11-01', ...fields };
  const columns = Object.keys(row);
  sqlite.prepare(`INSERT INTO nodes (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .run(...Object.values(row));
}

const dirty = (sqlite: Database.Database) =>
  sqlite.prepare('SELECT node_id FROM daily_flow_dirty_nodes ORDER BY node_id').pluck().all();

describe('desktop local derived indexes (schema 205)', () => {
  it('upgrades a 204 library to the same shape a new library gets', () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(205);
    const fresh = freshLibrary();
    const upgraded = freshLibrary();
    restorePreLocalDerivedIndexSchema(upgraded, 204);
    expect(readSchemaShape(upgraded)).not.toEqual(readSchemaShape(fresh));
    initializeDatabaseSchema(upgraded);
    expect(upgraded.pragma('user_version', { simple: true })).toBe(205);
    expect(readSchemaShape(upgraded)).toEqual(readSchemaShape(fresh));
  });

  it('rolls the whole step back when the upgrade fails before the version commit', () => {
    const sqlite = freshLibrary();
    restorePreLocalDerivedIndexSchema(sqlite, 204);
    const before = readSchemaShape(sqlite);
    expect(() => initializeDatabaseSchema(sqlite, { beforeVersionCommit: () => { throw new Error('injected'); } }))
      .toThrow('injected');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(204);
    expect(readSchemaShape(sqlite)).toEqual(before);
  });

  it('records changed Flow facts while only learning writes invalidate the sequence', () => {
    const sqlite = freshLibrary();
    insertNode(sqlite, 'a', { content: '' });
    insertNode(sqlite, 'b', { content: 'body' });
    sqlite.exec(`INSERT INTO daily_flow_state (id, day_key, revision, settings_key, mode, session_json, updated_at)
      VALUES (1, 'd', 1, 's', 'cycle', '{}', 'now')`);
    expect(dirty(sqlite)).toEqual(['a', 'b']);
    sqlite.exec('DELETE FROM daily_flow_dirty_nodes');
    sqlite.exec(`UPDATE nodes SET content = 'changed body', updated_at = 'later', reveal = NULL WHERE id = 'b'`);
    expect(dirty(sqlite)).toEqual([]);
    sqlite.exec(`UPDATE nodes SET content = 'now has body' WHERE id = 'a'`);
    sqlite.exec(`UPDATE nodes SET priority = 2 WHERE id = 'b'`);
    expect(dirty(sqlite)).toEqual(['a', 'b']);
    expect(sqlite.prepare('SELECT invalidated, scope_complete FROM daily_flow_state').get())
      .toEqual({ invalidated: 0, scope_complete: 0 });
    sqlite.exec(`DELETE FROM daily_flow_dirty_nodes;
      INSERT INTO node_review (node_id, due, state) VALUES ('a', '2026-11-02', 0);
      INSERT INTO parent_order_sources (parent_id, author_id, counter, child_ids_json) VALUES ('b', 'me', 1, '[]')`);
    expect(dirty(sqlite)).toEqual(['a', 'b']);
    expect(sqlite.prepare('SELECT invalidated FROM daily_flow_state').pluck().get()).toBe(1);
  });

  it('indexes import items by the node they produced', () => {
    const sqlite = freshLibrary();
    const plan = sqlite.prepare(`EXPLAIN QUERY PLAN SELECT rule_id FROM keep_import_items
      WHERE last_node_id IN (SELECT value FROM json_each(?))`).all('["a"]') as { detail: string }[];
    expect(plan.map(step => step.detail).join('\n')).toContain('idx_keep_import_items_last_node');
  });
});
