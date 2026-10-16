// @vitest-environment node
import { createHash } from 'node:crypto';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { collectAllNodeVersionChains } from '../../lib/core/database/dynamicNodeVersionChainMigration.js';
import { collectAllNodeVersionChainsWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';

import { permanentlyDelete, restartDeletedPeer } from './dynamicNodeVersionChains.delete.testSupport.js';
import { closeLibraries, createPeer, edit, history, joinPeers,
  startLibraries, type Peer } from './syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

async function advancePosition(source: Peer, target: Peer) {
  await collectNodeVersionPayloads(source.port, 'topic');
  await collectNodeVersionPayloads(target.port, 'topic');
}

function snapshotFields(json: string) {
  return { position: null, ...JSON.parse(json) };
}

function originalFacts(peer: Peer) {
  const tombstone = peer.db.prepare<[], Record<string, unknown> & { snapshot_json: string }>(
    "SELECT * FROM node_sync_tombstones WHERE node_id = 'topic'").get()!;
  return {
    versions: peer.db.prepare<[], Record<string, unknown> & { metadata: string }>(`SELECT version_id, object_id, parent_version_id,
      host_name, created_at, content_hash,
      json_remove(snapshot_json, '$.content', '$.body_blob_hash', '$.body_deleted') AS metadata
      FROM node_sync_versions WHERE object_id = 'topic' ORDER BY version_id`).all()
      .map(row => ({ ...row, metadata: snapshotFields(row.metadata) })),
    parents: peer.db.prepare(`SELECT edge.* FROM node_sync_version_parents edge
      JOIN node_sync_versions version ON version.version_id = edge.version_id
      WHERE version.object_id = 'topic' ORDER BY edge.version_id, edge.ordinal`).all(),
    tombstone: { ...tombstone, snapshot_json: snapshotFields(tombstone.snapshot_json) }
  };
}

function expectBody(peer: Peer, versionId: string, body: string | null) {
  const row = peer.db.prepare(`SELECT body_text,
    json_extract(snapshot_json, '$.content') AS snapshot_body,
    json_extract(snapshot_json, '$.body_deleted') AS retired,
    json_extract(snapshot_json, '$.body_blob_hash') AS hash,
    json_type(snapshot_json, '$.content') AS snapshot_type
    FROM node_sync_versions WHERE version_id = ?`).get(versionId);
  expect(row).toMatchObject({ body_text: body });
  if (body === null) expect(row).toMatchObject({ snapshot_body: null, snapshot_type: 'null', retired: 1,
    hash: createHash('sha256').update('body').digest('hex') });
}

it('keeps frozen sent text and original identities through deletion and database reopen', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const old = edit(source, 'body');
  await withLibraryRequestSnapshot(source, target, async replayLive => {
    const tomb = permanentlyDelete(source);
    const original = originalFacts(source);
    expect(tomb.parent_version_id).toBe(old);
    restartDeletedPeer(source);
    expectBody(source, old, null);
    expect(history(source).map(row => row.version_id)).toContain(old);
    await replayLive();
    expectBody(target, old, 'body');
    await advancePosition(source, target);
    expect(history(source).map(row => row.version_id)).toContain(old);
    expectBody(source, old, null);
    await withLibraryRequestSnapshot(source, target, async replayDeleted => { await replayDeleted(); });
    expect(target.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
    await advancePosition(source, target);
    for (const peer of [source, target]) {
      restartDeletedPeer(peer);
      expect(originalFacts(peer)).toEqual(original);
      expectBody(peer, old, null);
      expectBody(peer, tomb.version_id, 'body');
      expect(peer.db.pragma('foreign_key_check')).toEqual([]);
      expect(peer.db.prepare("SELECT parent_version_id FROM node_sync_tombstones WHERE node_id = 'topic'").pluck().get()).toBe(old);
    }
    await replayLive();
    expect(target.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
  });
});

it('releases a persisted editor identity after its unused body and node entity are deleted', async () => {
  const peer = createPeer('local');
  const base = edit(peer, 'body');
  await retainLocalEditBase(peer.port, { holdId: 'draft', nodeId: 'topic', versionId: base });
  const tomb = permanentlyDelete(peer);
  const original = originalFacts(peer);
  expect(tomb.parent_version_id).toBe(base);
  restartDeletedPeer(peer);
  expectBody(peer, base, null);
  expect(peer.db.prepare("SELECT version_id FROM node_version_local_holds WHERE hold_id = 'draft'").pluck().get()).toBe(base);
  expect(history(peer)).toHaveLength(2);
  await releaseLocalEditBase(peer.port, 'draft', 'topic');
  expect(originalFacts(peer)).toEqual(original);
  expectBody(peer, base, null);
  expectBody(peer, tomb.version_id, 'body');
});

it('preserves the surviving anchor identity independently of retired main text', async () => {
  const peer = createPeer('local');
  const base = edit(peer, 'body');
  peer.db.prepare(`INSERT INTO nodes (id, title, kind, anchor_source_version_id, created_at, updated_at)
    VALUES ('anchor', 'Anchor', 'item', ?, 'now', 'now')`).run(base);
  const tomb = permanentlyDelete(peer);
  const original = originalFacts(peer);
  expect(tomb.parent_version_id).toBe(base);
  restartDeletedPeer(peer);
  expectBody(peer, base, null);
  await collectNodeVersionPayloads(peer.port, 'topic');
  expect(history(peer)).toHaveLength(2);
  expectBody(peer, base, null);
  expect(peer.db.prepare("SELECT anchor_source_version_id FROM nodes WHERE id = 'anchor'").pluck().get()).toBe(base);
  peer.db.prepare("UPDATE nodes SET anchor_source_version_id = NULL WHERE id = 'anchor'").run();
  await collectNodeVersionPayloads(peer.port, 'topic');
  expect(originalFacts(peer)).toEqual(original);
  expectBody(peer, base, null);
  expectBody(peer, tomb.version_id, 'body');
});

it('keeps an unresolved conflict through physical deletion and database reopen until explicitly resolved', async () => {
  const peer = createPeer('local');
  const base = edit(peer, 'body');
  peer.db.prepare(`INSERT INTO node_sync_conflicts
    (conflict_version_id, object_id, snapshot_json, detected_at) VALUES (?, 'topic', '{}', 'now')`).run(base);
  const tomb = permanentlyDelete(peer);
  const original = originalFacts(peer);
  expect(tomb.parent_version_id).toBe(base);
  restartDeletedPeer(peer);
  expectBody(peer, base, null);
  await collectNodeVersionPayloads(peer.port, 'topic');
  expect(peer.db.prepare('SELECT conflict_version_id FROM node_sync_conflicts').pluck().all()).toEqual([base]);
  expect(history(peer)).toHaveLength(2);
  expectBody(peer, base, null);
  peer.db.prepare('DELETE FROM node_sync_conflicts WHERE conflict_version_id = ?').run(base);
  await collectNodeVersionPayloads(peer.port, 'topic');
  expect(originalFacts(peer)).toEqual(original);
  expectBody(peer, base, null);
  expectBody(peer, tomb.version_id, 'body');
});

it.each(['driver', 'port'])('preserves deleted-object identities and tombstone text when its unknown peer leaves (%s)', async host => {
  const peer = createPeer('local');
  const remote = createPeer('remote');
  joinPeers(peer, remote);
  const base = edit(peer, 'body');
  const tomb = permanentlyDelete(peer);
  const original = originalFacts(peer);
  expect(tomb.parent_version_id).toBe(base);
  restartDeletedPeer(peer);
  expectBody(peer, base, null);
  expect(history(peer)).toHaveLength(2);
  peer.db.prepare("UPDATE sync_group_devices SET state = 'left' WHERE device_identity_key = ?").run(remote.id);
  if (host === 'driver') collectAllNodeVersionChainsWithDriver(peer.driver);
  else await collectAllNodeVersionChains(peer.port);
  expect(originalFacts(peer)).toEqual(original);
  expectBody(peer, base, null);
  expectBody(peer, tomb.version_id, 'body');
});
