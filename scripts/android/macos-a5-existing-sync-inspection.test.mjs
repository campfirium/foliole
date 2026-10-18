// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';

import { afterEach, expect, it } from 'vitest';

import { inspectExistingSyncBaseline } from './macos-a5-existing-sync-inspection.mjs';

const databases = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function database(local) {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  db.exec(`CREATE TABLE sync_groups(group_id TEXT, workgroup_key TEXT);
    CREATE TABLE sync_group_local_state(singleton_id INTEGER, group_id TEXT, local_device_identity_key TEXT, state TEXT);
    CREATE TABLE sync_group_devices(group_id TEXT, device_identity_key TEXT, platform TEXT, state TEXT);
    CREATE TABLE companion_meta(key TEXT, value TEXT);
    CREATE TABLE sync_object_state(object_type TEXT, object_id TEXT, content_hash TEXT, sync_dirty INTEGER);
    CREATE TABLE node_open_state(node_id TEXT PRIMARY KEY, last_opened_at TEXT NOT NULL);
    CREATE TABLE parent_child_order(parent_id TEXT PRIMARY KEY, child_ids_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO sync_groups VALUES('group', 'test-key');
    INSERT INTO sync_group_devices VALUES('group', 'phone', 'android-capacitor', 'active'), ('group', 'mac', 'macOS', 'active');
    INSERT INTO companion_meta VALUES('workspace_sync_endpoint_url', 'http://192.168.0.2:1234');`);
  db.prepare("INSERT INTO sync_group_local_state VALUES(1, 'group', ?, 'active')").run(local);
  return db;
}

it('accepts current group facts and matching dirty content without retired credentials or routes', () => {
  const phone = database('phone');
  const desktop = database('mac');
  for (let i = 0; i < 576; i++) {
    phone.prepare('INSERT INTO sync_object_state VALUES(?, ?, ?, 1)').run('parent_child_order', String(i), `hash-${i}`);
    desktop.prepare('INSERT INTO sync_object_state VALUES(?, ?, ?, 0)').run('parent_child_order', String(i), `hash-${i}`);
  }
  phone.exec("INSERT INTO sync_object_state VALUES('view_state', 'private', 'private-hash', 1)");
  expect(inspectExistingSyncBaseline(phone, desktop)).toMatchObject({ resultStatus: 'ready',
    dirtyRecordCount: 576, matchedDirtyRecordCount: 576, differences: [] });
});

it.each([
  ["UPDATE sync_groups SET group_id = 'other'; UPDATE sync_group_local_state SET group_id = 'other'", 'group_mismatch'],
  ["UPDATE sync_groups SET workgroup_key = 'other'", 'group_mismatch'],
  ["UPDATE sync_group_local_state SET local_device_identity_key = 'unknown'", 'device_mismatch'],
  ["UPDATE sync_group_devices SET state = 'left' WHERE device_identity_key = 'phone'", 'device_mismatch'],
  ["DELETE FROM companion_meta", 'endpoint_missing']
])('rejects unsafe current state: %s', (sql, reason) => {
  const phone = database('phone');
  const desktop = database('mac');
  phone.exec(sql);
  expect(() => inspectExistingSyncBaseline(phone, desktop)).toThrow(`existing_sync_${reason}`);
});

it('reports changed and missing content without clearing dirty flags or revealing the group key', () => {
  const phone = database('phone');
  const desktop = database('mac');
  phone.exec("INSERT INTO sync_object_state VALUES('node', 'n', 'new', 1), ('foreground_daily_time', 'day', 'time', 1)");
  desktop.exec("INSERT INTO sync_object_state VALUES('node', 'n', 'old', 0)");
  const result = inspectExistingSyncBaseline(phone, desktop);
  expect(result).toMatchObject({ resultStatus: 'approval_required', matchedDirtyRecordCount: 0 });
  expect(result.differences).toHaveLength(2);
  expect(JSON.stringify(result)).not.toContain('test-key');
  expect(phone.prepare('SELECT COUNT(*) AS count FROM sync_object_state WHERE sync_dirty = 1').get().count).toBe(2);
});

it('shows both actual values for review while preserving differences and database contents', () => {
  const phone = database('phone');
  const desktop = database('mac');
  phone.exec(`INSERT INTO sync_object_state VALUES('node_open_state', 'inbox', 'new', 1),
    ('parent_child_order', 'inbox', 'order', 1);
    INSERT INTO node_open_state VALUES('inbox', '2026-10-19T01:00:00Z');
    INSERT INTO parent_child_order VALUES('inbox', '["b","a"]', '2026-10-19T01:00:00Z');`);
  desktop.exec(`INSERT INTO sync_object_state VALUES('node_open_state', 'inbox', 'old', 0);
    INSERT INTO node_open_state VALUES('inbox', '2026-10-18T01:00:00Z');`);
  const snapshot = () => [phone, desktop].map(db => ['sync_object_state', 'node_open_state',
    'parent_child_order'].map(table => db.prepare(`SELECT * FROM ${table}`).all()));
  const before = snapshot();
  const result = inspectExistingSyncBaseline(phone, desktop);
  expect(result.resultStatus).toBe('approval_required');
  expect(result.differences).toEqual([
    expect.objectContaining({ object_type: 'node_open_state', actualValues: {
      phone: { node_id: 'inbox', last_opened_at: '2026-10-19T01:00:00Z' },
      desktop: { node_id: 'inbox', last_opened_at: '2026-10-18T01:00:00Z' }
    } }),
    expect.objectContaining({ object_type: 'parent_child_order', actualValues: {
      phone: { parent_id: 'inbox', child_ids_json: '["b","a"]', updated_at: '2026-10-19T01:00:00Z' },
      desktop: null
    } })
  ]);
  expect(snapshot()).toEqual(before);
  expect(JSON.stringify(result)).not.toMatch(/test-key|192\.168/u);
});
