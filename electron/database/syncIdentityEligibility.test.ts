import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { isEligibleSyncIdentityState } from '../../lib/core/sync/syncIdentityEligibility.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('indexes only backed, syncable live state while retaining tombstones', async () => {
  const sqlite = new Database(':memory:');
  try {
    for (const statement of DESKTOP_FRESH_SCHEMA_STATEMENTS) sqlite.exec(statement);
    const port = createBetterSqliteDbPort(sqlite);
    const state = (object_type: string, object_id: string, deleted_at: string | null = null) => ({
      object_type, object_id, deleted_at, content_hash: 'hash', current_version_id: null,
      updated_at: '2026-10-03T00:00:00.000Z'
    });
    expect(await isEligibleSyncIdentityState(port, state('node', 'missing'))).toBe(false);
    expect(await isEligibleSyncIdentityState(port, state('node', 'missing', 'deleted'))).toBe(true);
    expect(await isEligibleSyncIdentityState(port, state('node', 'special-inbox', 'deleted'))).toBe(false);
    expect(await isEligibleSyncIdentityState(port, state('local_cache', 'id'))).toBe(false);
    sqlite.exec(`INSERT INTO nodes (id, title, created_at, updated_at)
      VALUES ('present', 'Present', 't1', 't1')`);
    expect(await isEligibleSyncIdentityState(port, state('node', 'present'))).toBe(true);
    expect(await isEligibleSyncIdentityState(port, state('node_reading', 'present'))).toBe(false);
    sqlite.exec(`INSERT INTO node_reading (node_id, last_handled_at, next_at)
      VALUES ('present', 't1', 't2')`);
    expect(await isEligibleSyncIdentityState(port, state('node_reading', 'present'))).toBe(true);
    expect(await isEligibleSyncIdentityState(port, state('external_document', 'missing'))).toBe(false);
  } finally {
    sqlite.close();
  }
});

it('invalidates identity keys when backing rows change without a state sequence update', () => {
  const sqlite = new Database(':memory:');
  try {
    for (const statement of DESKTOP_FRESH_SCHEMA_STATEMENTS) sqlite.exec(statement);
    sqlite.exec(`INSERT INTO nodes (id, title, created_at, updated_at)
      VALUES ('node-a', 'Old', 't1', 't1')`);
    sqlite.exec('DELETE FROM sync_identity_dirty_keys');
    sqlite.exec("UPDATE nodes SET title = 'New' WHERE id = 'node-a'");
    expect(sqlite.prepare(`SELECT object_type FROM sync_identity_dirty_keys
      WHERE object_id = 'node-a' ORDER BY object_type`).all()).toEqual([
      { object_type: 'node' }, { object_type: 'node_open_state' },
      { object_type: 'node_reading' }, { object_type: 'node_review' }
    ]);
    sqlite.exec(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
      VALUES ('view_state', 'session_resume:mac:desktop:Mac:active_node', 1, 'hash', 'Mac', 't1')`);
    sqlite.exec("INSERT INTO workspace_meta (key, value, updated_at) VALUES ('active_node_id', 'node-a', 't1')");
    sqlite.exec('DELETE FROM sync_identity_dirty_keys');
    sqlite.exec("UPDATE workspace_meta SET value = 'node-b' WHERE key = 'active_node_id'");
    expect(sqlite.prepare(`SELECT object_id FROM sync_identity_dirty_keys
      WHERE object_type = 'view_state'`).all()).toEqual([
      { object_id: 'session_resume:mac:desktop:Mac:active_node' }
    ]);
  } finally {
    sqlite.close();
  }
});
