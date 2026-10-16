// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { collectRequestSyncBodies, requestSyncBodyReferences } from '../../lib/core/sync/requestSyncBodyRetention.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => { for (const device of devices.splice(0)) device.sqlite.close(); });

async function history() {
  const host = textDevice();
  devices.push(host);
  const base = textBranch('base', 'Original');
  await host.receive([base]);
  const middle = textBranch('middle', 'Intermediate', base);
  const head = textBranch('head', 'Current', middle);
  for (const record of [middle, head]) await upsertRemoteVersion(host.db, record);
  await host.db.run("UPDATE nodes SET current_version_id = 'head', sync_dirty = 0 WHERE id = 'topic'");
  return host;
}

it('reclaims only historical bodies and preserves all identities and parent edges', async () => {
  const host = await history();
  const before = await host.db.query('SELECT version_id, parent_version_id FROM node_sync_versions ORDER BY version_id');
  const edges = await host.db.query('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal');
  expect(await collectRequestSyncBodies(host.db, 'topic')).toEqual({ released: 2, skipped: null });
  expect(await host.db.query('SELECT version_id, parent_version_id FROM node_sync_versions ORDER BY version_id')).toEqual(before);
  expect(await host.db.query('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal')).toEqual(edges);
  expect(await host.db.query("SELECT version_id FROM node_sync_versions WHERE body_text IS NOT NULL"))
    .toEqual([{ version_id: 'head' }]);
  expect(await host.db.query("SELECT version_id FROM node_sync_versions WHERE json_extract(snapshot_json, '$.body_deleted') = 1 ORDER BY version_id"))
    .toEqual([{ version_id: 'base' }, { version_id: 'middle' }]);
  expect(await collectRequestSyncBodies(host.db, 'topic')).toEqual({ released: 0, skipped: null });
});

it('keeps identities without treating legacy references as main body uses', async () => {
  const host = await history();
  await host.db.run("INSERT INTO node_version_local_holds VALUES ('editor', 'topic', 'edit-base', 'now')");
  await host.db.run(`INSERT INTO sync_change_log
    (change_id, object_type, object_id, change_type, host_name, base_version_id, result_version_id,
      content_hash, payload_json, created_at) VALUES ('pending', 'node', 'topic', 'update', 'local',
      'change-base', 'change-result', 'hash', '{}', 'now')`);
  await host.db.run(`INSERT INTO node_sync_conflicts (conflict_version_id, object_id, parent_version_id,
    snapshot_json, detected_at) VALUES ('conflict', 'topic', 'conflict-parent', '{}', 'now')`);
  await host.db.run(`INSERT INTO node_text_alternatives
    (alternative_id, node_id, source_version_id, body_text, source_host_name, created_at, status, updated_at)
    VALUES ('alternative', 'topic', 'alternative-source', 'Body', 'other', 'now', 'available', 'now')`);
  await host.db.run("UPDATE nodes SET anchor_source_version_id = 'base' WHERE id = 'topic'");
  const result = await requestSyncBodyReferences(host.db, 'topic', 'head');
  expect([...result.keep].sort()).toEqual(['head']);
  expect(result.skipped).toBeNull();
  expect(await collectRequestSyncBodies(host.db, 'topic')).toEqual({ released: 2, skipped: null });
});

it('reclaims history independently of peer membership', async () => {
  const host = await history();
  host.sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'local', 'active', 'now');
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', 'peer', 'anchor', '/peer', 'Peer', 'mac', 'active', 'now', 'now');
    INSERT INTO node_version_device_revisions VALUES ('group', 'peer', 'new', 0, 'business', NULL, 'now')`);
  expect(await collectRequestSyncBodies(host.db, 'topic'))
    .toEqual({ released: 2, skipped: null });
  expect(await collectRequestSyncBodies(host.db, 'topic')).toEqual({ released: 0, skipped: null });
  await host.db.run("UPDATE sync_group_devices SET state = 'left'");
  expect(await collectRequestSyncBodies(host.db, 'topic')).toEqual({ released: 0, skipped: null });
});

it.each(['group-left', 'group-switched'] as const)(
  'preserves retained facts after %s while preserving current text and the version graph', async change => {
    const host = await history();
    host.sqlite.exec(`INSERT INTO sync_groups VALUES ('old-group', 'Old', 'key', 'now', 'now');
      INSERT INTO sync_group_local_state VALUES (1, 'old-group', 'local', 'active', 'now');
      INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
        device_name, platform, state, joined_at, updated_at)
      VALUES ('old-group', 'peer', 'anchor', '/peer', 'Peer', 'mac', 'active', 'now', 'now');
      INSERT INTO node_version_device_revisions VALUES ('old-group', 'peer', 'epoch', 0, 'business', NULL, 'now')`);
    expect(await collectRequestSyncBodies(host.db, 'topic')).toEqual({ released: 2, skipped: null });
    const identities = await host.db.query(
      'SELECT version_id, content_hash, parent_version_id FROM node_sync_versions ORDER BY version_id');
    const parents = await host.db.query('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal');
    if (change === 'group-left') await host.db.run('DELETE FROM sync_group_local_state');
    else {
      await host.db.run("INSERT INTO sync_groups VALUES ('new-group', 'New', 'new-key', 'now', 'now')");
      await host.db.run("UPDATE sync_group_local_state SET group_id = 'new-group'");
    }
    expect(await collectRequestSyncBodies(host.db, 'topic')).toEqual({ released: 0, skipped: null });
    expect(await host.db.query(
      'SELECT version_id, content_hash, parent_version_id FROM node_sync_versions ORDER BY version_id')).toEqual(identities);
    expect(await host.db.query('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal')).toEqual(parents);
    expect(await host.db.query(`SELECT n.current_version_id, v.body_text FROM nodes n
      JOIN node_sync_versions v ON v.version_id = n.current_version_id WHERE n.id = 'topic'`))
      .toEqual([{ current_version_id: 'head', body_text: 'Current' }]);
    expect(await host.db.query('SELECT version_id FROM node_sync_versions WHERE body_text IS NOT NULL'))
      .toEqual([{ version_id: 'head' }]);
    expect(await collectRequestSyncBodies(host.db, 'topic')).toEqual({ released: 0, skipped: null });
  }
);

it('never reclaims folder history', async () => {
  const host = await history();
  await host.db.run("UPDATE nodes SET kind = 'folder' WHERE id = 'topic'");
  expect(await collectRequestSyncBodies(host.db, 'topic')).toEqual({ released: 0, skipped: 'non_topic' });
});

const protectionCases = [
  ['editor baseline', "INSERT INTO node_version_local_holds VALUES ('editor', 'topic', 'base', 'now')",
    'DELETE FROM node_version_local_holds'],
  ['pending change baseline', `INSERT INTO sync_change_log
    (change_id, object_type, object_id, change_type, host_name, base_version_id, result_version_id,
      content_hash, payload_json, created_at) VALUES ('pending', 'node', 'topic', 'update', 'local',
      'base', 'head', 'hash', '{}', 'now')`, 'DELETE FROM sync_change_log'],
  ['pending change result', `INSERT INTO sync_change_log
    (change_id, object_type, object_id, change_type, host_name, base_version_id, result_version_id,
      content_hash, payload_json, created_at) VALUES ('pending', 'node', 'topic', 'update', 'local',
      NULL, 'base', 'hash', '{}', 'now')`, 'DELETE FROM sync_change_log'],
  ['conflict version', `INSERT INTO node_sync_conflicts (conflict_version_id, object_id, parent_version_id,
    snapshot_json, detected_at) VALUES ('base', 'topic', NULL, '{}', 'now')`, 'DELETE FROM node_sync_conflicts'],
  ['conflict parent', `INSERT INTO node_sync_conflicts (conflict_version_id, object_id, parent_version_id,
    snapshot_json, detected_at) VALUES ('head', 'topic', 'base', '{}', 'now')`, 'DELETE FROM node_sync_conflicts'],
  ['available alternative', `INSERT INTO node_text_alternatives
    (alternative_id, node_id, source_version_id, body_text, source_host_name, created_at, status, updated_at)
    VALUES ('alternative', 'topic', 'base', 'Original', 'peer', 'now', 'available', 'now')`,
    "UPDATE node_text_alternatives SET status = 'discarded'"],
  ['anchor source', "UPDATE nodes SET anchor_source_version_id = 'base' WHERE id = 'topic'",
    "UPDATE nodes SET anchor_source_version_id = NULL WHERE id = 'topic'"]
] as const;

it.each(protectionCases)('reclaims obsolete main text while preserving its %s identity reference', async (_label, protect, release) => {
  const host = await history();
  host.sqlite.exec(protect);
  expect((await collectRequestSyncBodies(host.db, 'topic')).skipped).toBeNull();
  expect(await host.db.query("SELECT body_text FROM node_sync_versions WHERE version_id = 'base'"))
    .toEqual([{ body_text: null }]);
  host.sqlite.exec(release);
  expect((await collectRequestSyncBodies(host.db, 'topic')).released).toBe(0);
  expect(await host.db.query("SELECT body_text FROM node_sync_versions WHERE version_id = 'base'"))
    .toEqual([{ body_text: null }]);
});

it('preserves both branch payloads without retaining their common ancestor text', async () => {
  const host = await history();
  await upsertRemoteVersion(host.db, textBranch('offline', 'Offline edit', textBranch('base', 'Original')));
  await host.db.run("INSERT INTO node_version_local_holds VALUES ('editor', 'topic', 'offline', 'now')");
  expect((await collectRequestSyncBodies(host.db, 'topic')).skipped).toBeNull();
  expect(await host.db.query('SELECT version_id FROM node_sync_versions WHERE body_text IS NOT NULL ORDER BY version_id'))
    .toEqual([{ version_id: 'head' }, { version_id: 'offline' }]);
  await host.db.run('DELETE FROM node_version_local_holds');
  expect((await collectRequestSyncBodies(host.db, 'topic')).released).toBe(0);
  const merged = { ...textBranch('merged', 'Merged', textBranch('head', 'Current')),
    parent_version_ids: ['head', 'offline'] };
  await upsertRemoteVersion(host.db, merged);
  await host.db.run("UPDATE nodes SET current_version_id = 'merged' WHERE id = 'topic'");
  expect((await collectRequestSyncBodies(host.db, 'topic')).released).toBe(2);
  expect(await host.db.query('SELECT version_id FROM node_sync_versions WHERE body_text IS NOT NULL'))
    .toEqual([{ version_id: 'merged' }]);
});
