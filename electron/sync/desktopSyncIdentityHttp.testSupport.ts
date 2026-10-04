import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { openDatabaseConnection, runWithDatabaseConnectionOwner, type DatabaseConnection } from '../database/connection.js';

import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import type { runDesktopSyncIdentityRound } from './desktopSyncIdentityRound.js';

export function seedIdentityGroup(sourceId: string, receiverId: string) {
  const db = openDatabaseConnection().sqlite;
  db.exec(`UPDATE sync_object_state SET current_version_id = 'desktop#node-1-v1'
    WHERE object_type = 'node' AND object_id = 'node-1'`);
  db.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  db.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')")
    .run(sourceId);
  for (const [id, anchor, library] of [
    [sourceId, '11111111-1111-4111-8111-111111111111', '/source'],
    [receiverId, '22222222-2222-4222-8222-222222222222', '/receiver']
  ] as const) db.prepare(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
     device_name, platform, state, joined_at, updated_at)
    VALUES ('group', ?, ?, ?, 'Device', 'mac', 'active', 'now', 'now')`).run(id, anchor, library);
}

export function seedRetainedIdentityBranch(source: DatabaseConnection) {
  source.sqlite.exec(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at,
     content_hash, body_text, snapshot_json)
    VALUES ('desktop#node-1-branch', 'node-1', 'desktop#node-1-v1',
      'source', '2026-04-27T00:02:00.000Z', 'branch-hash', 'branch body',
      '{"id":"node-1","title":"Branch","content":"branch body"}');
    INSERT INTO node_sync_version_parents VALUES
      ('desktop#node-1-branch', 'desktop#node-1-v1', 0)`);
}

export function seedReceiverOnlyIdentityNode(receiver: DatabaseConnection) {
  receiver.sqlite.exec(`DELETE FROM node_sync_versions; DELETE FROM nodes;
    DELETE FROM sync_object_state; DELETE FROM setting_records`);
  receiver.sqlite.exec(`INSERT INTO nodes
    (id, kind, title, content, current_version_id, created_at, updated_at)
    VALUES ('node-2', 'topic', 'Receiver Node', 'receiver body', 'receiver#node-2-v1', 'now', 'now');
    INSERT INTO node_sync_versions
    (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('receiver#node-2-v1', 'node-2', 'receiver', 'now', 'receiver-hash',
      'receiver body', '{"id":"node-2","title":"Receiver Node","content":"receiver body"}');
    INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash,
      last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node', 'node-2', 100, 'receiver#node-2-v1', 'receiver-hash',
      'receiver', '2026-04-27T00:00:00.000Z', 1)`);
}

export function assertIdentityPushApplied(source: DatabaseConnection, expectedPages = 1) {
  expect(source.sqlite.prepare("SELECT title FROM nodes WHERE id = 'node-2'").get())
    .toEqual({ title: 'Receiver Node' });
  expect(source.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_identity_pack_receipts').get())
    .toEqual({ count: expectedPages });
}

export function identityPositionCandidate(db: DatabaseConnection['sqlite'], args: {
  nodeId: string; owner: string; head: string; pending: string[];
  kind: 'source_only' | 'receiver_only';
}) {
  const row = db.prepare(`SELECT * FROM node_version_member_positions
    WHERE group_id = 'group' AND device_identity_key = ? AND object_id = ?`).get(args.owner, args.nodeId);
  expect(row).toMatchObject({ group_id: 'group', device_identity_key: args.owner,
    object_id: args.nodeId, adopted_version_id: args.head,
    pending_version_ids_json: JSON.stringify(args.pending),
    library_epoch: expect.any(String), proof_revision: expect.any(Number), updated_at: expect.any(String) });
  const factId = db.prepare(`SELECT fact_id FROM node_version_member_positions
    WHERE group_id = 'group' AND device_identity_key = ? AND object_id = ?`).pluck().get(args.owner, args.nodeId);
  expect(factId).toMatch(/^pos_[a-f0-9]{64}$/u);
  return { object_type: 'node_position', object_id: factId, kind: args.kind };
}

export function assertTypedIdentityCandidates(candidatePath: string, expected: Array<{
  object_type: string; object_id: unknown; kind: string;
}>) {
  const db = new Database(candidatePath, { readonly: true, fileMustExist: true });
  try {
    expect(db.prepare('SELECT object_type, object_id, kind FROM candidates ORDER BY object_type, object_id').all())
      .toEqual([...expected].sort((a, b) => a.object_type.localeCompare(b.object_type) ||
        String(a.object_id).localeCompare(String(b.object_id))));
    return { total: expected.length,
      source: expected.filter((row) => row.kind !== 'receiver_only').length,
      receiver: expected.filter((row) => row.kind !== 'source_only').length };
  } finally { db.close(); }
}

export function identityPositionPayload(db: DatabaseConnection['sqlite'], factId: unknown) {
  return db.prepare(`SELECT group_id, device_identity_key, object_id, library_epoch,
    proof_revision, adopted_version_id, pending_version_ids_json, updated_at
    FROM node_version_member_positions WHERE fact_id = ?`).get(String(factId));
}

export async function captureIdentityPositionRelay(source: DatabaseConnection['sqlite'],
  receiver: DatabaseConnection['sqlite'], sourceFactId: unknown, receiverFactId: unknown) {
  const sourceOriginal = await runWithDatabaseConnectionOwner(() => identityPositionPayload(source, sourceFactId));
  const receiverOriginal = identityPositionPayload(receiver, receiverFactId);
  return async () => {
    const relayedReceiver = await runWithDatabaseConnectionOwner(() => identityPositionPayload(source, receiverFactId));
    expect(identityPositionPayload(receiver, sourceFactId)).toEqual(sourceOriginal);
    expect(relayedReceiver).toEqual(receiverOriginal);
  };
}

export async function assertOlderIdRelayedAfterBaseline(args: {
  source: DatabaseConnection;
  receiver: DatabaseConnection;
  peer: DesktopSyncGroupPeer;
  sourceId: string;
  runRound: () => ReturnType<typeof runDesktopSyncIdentityRound>;
}) {
  expect(args.receiver.sqlite.prepare(`SELECT peer_device_id FROM sync_identity_peer_baselines
    WHERE group_id = 'group'`).get()).toEqual({ peer_device_id: args.sourceId });
  args.source.sqlite.exec(`INSERT INTO nodes (id, kind, title, content, current_version_id,
    created_at, updated_at) VALUES ('node-older', 'topic', 'Older Node', 'older body',
    'source#older-v1', '2026-01-01', '2026-01-01');
    INSERT INTO node_sync_versions (version_id, object_id, host_name, created_at,
      content_hash, body_text, snapshot_json) VALUES
    ('source#older-v1', 'node-older', 'source', '2026-01-01', 'older-hash',
      'older body', '{"id":"node-older","title":"Older Node","content":"older body"}');
    INSERT INTO sync_object_state (object_type, object_id, state_seq,
      current_version_id, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('node', 'node-older', 1000, 'source#older-v1', 'older-hash',
      'source', '2026-01-01');
    UPDATE setting_records SET value_json = '{"theme":"light"}',
      content_hash = 'setting-new', updated_at = '2027-01-01'
      WHERE key = 'app_settings';
    UPDATE sync_object_state SET content_hash = 'setting-new', updated_at = '2027-01-01',
      state_seq = 1001 WHERE object_type = 'setting'`);
  const result = await args.runRound();
  expect(result.usedTimeCandidates).toBe(false);
  expect(result.timeCandidateCount).toBe(0);
  expect(result.candidateCount).toBeGreaterThanOrEqual(2);
  expect(result.verifiedCandidateCount).toBe(0);
  expect(args.receiver.sqlite.prepare("SELECT title FROM nodes WHERE id='node-older'").get())
    .toEqual({ title: 'Older Node' });
}
