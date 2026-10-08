// @vitest-environment node
import { expect, it } from 'vitest';

import { body, pendingCountFixture, time } from '../../../../../../electron/sync/companionSyncbackPendingCount.testSupport.js';

import { createCompanionSyncbackDbStore } from './companionSyncbackDbStore';
import { loadCompanionPendingCount } from './companionSyncbackPendingCount';

const cursors = { node: null, state: null, review: null };

function assertOnlyMetadata(queries: string[]) {
  expect(queries.length).toBeGreaterThan(0);
  for (const sql of queries) expect(sql).not.toMatch(
    /body_text|snapshot_json|content_blob_data|content_body_chunks|node_sync_version_parents/iu);
  for (const sql of queries) expect(sql).not.toMatch(/\?\d+/u);
  const selected = queries.find((sql) => sql.startsWith('WITH selected AS'))!;
  expect(selected.match(/\?/gu)).toHaveLength(15);
}

it('preserves continuous pending counts including full retained identity expansion after the limit-one selection', async () => {
  const host = pendingCountFixture();
  try {
    const old = createCompanionSyncbackDbStore(host.port);
    const expected = (await old.loadNodeVersions('peer', null, 1)).length
      + (await old.loadStateChanges('peer', null, 1)).length + (await old.loadReviewLog('peer', null, 1)).length;
    expect(expected).toBe(5);
    expect(await old.loadPendingCount('peer', cursors)).toBe(expected);
    expect(await loadCompanionPendingCount(host.metadataPort, 'peer', cursors)).toBe(expected);
    assertOnlyMetadata(host.queries);
  } finally { host.db.close(); }
});

it('counts retained and retired identities equally after obsolete cache removal', async () => {
  const host = pendingCountFixture();
  try {
    host.db.exec('DROP TABLE content_blob_data; DROP TABLE content_blobs');
    expect(host.db.prepare('SELECT version_id, body_text FROM node_sync_versions ORDER BY version_id').all())
      .toEqual([{ version_id: 'v1', body_text: body },
        { version_id: 'v2', body_text: null }, { version_id: 'v3', body_text: null }]);
    const before = host.db.prepare('SELECT total_changes()').pluck().get();
    expect(await loadCompanionPendingCount(host.metadataPort, 'peer', cursors)).toBe(5);
    expect(host.db.prepare('SELECT total_changes()').pluck().get()).toBe(before);
    assertOnlyMetadata(host.queries);
  } finally { host.db.close(); }
});

it('retains original host, peer receipt, cursor tie ordering and state limit-one rules', async () => {
  const host = pendingCountFixture();
  try {
    host.receipt('node_version', 'node:v1', 'accepted', 'other-peer');
    host.receipt('node_version', 'node:v1', 'pending');
    expect(await loadCompanionPendingCount(host.metadataPort, 'peer', {
      node: { created_at: time, change_id: 'v1' }, review: { created_at: time, change_id: 'review-op' }, state: 99
    })).toBe(4);
    host.db.prepare("UPDATE sync_delivery_receipts SET status = 'accepted' WHERE peer_id = 'peer'").run();
    host.receipt('node_version', 'node:v3', 'conflict');
    host.receipt('review_log', 'review_log:review-op', 'rejected');
    expect(await loadCompanionPendingCount(host.metadataPort, 'peer', cursors)).toBe(1);
    host.db.prepare('UPDATE sync_object_state SET sync_dirty = 0').run();
    expect(await loadCompanionPendingCount(host.metadataPort, 'peer', cursors)).toBe(0);
    assertOnlyMetadata(host.queries);
  } finally { host.db.close(); }
});

it('preserves deleted live-node exclusion and tombstone selection without expanding its retained history', async () => {
  const host = pendingCountFixture();
  try {
    host.db.prepare('UPDATE nodes SET deleted_at = ?').run(time);
    host.db.prepare(`INSERT INTO node_sync_tombstones
      (node_id, version_id, host_name, content_hash, snapshot_json, deleted_at, created_at)
      VALUES ('node', 'tomb', 'phone', ?, ?, ?, ?)`)
      .run('4'.repeat(64), JSON.stringify({ id: 'node', content: 'inline tombstone body' }), time, time);
    expect(await loadCompanionPendingCount(host.metadataPort, 'peer', cursors)).toBe(3);
    host.receipt('node_version', 'node:tomb', 'confirmed');
    expect(await loadCompanionPendingCount(host.metadataPort, 'peer', cursors)).toBe(2);
    assertOnlyMetadata(host.queries);
  } finally { host.db.close(); }
});
