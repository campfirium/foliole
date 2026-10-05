// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { collectNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { chainReferencesQuery } from '../../lib/core/sync/nodeVersionChainSql.js';
import { retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { applyNodeMemberPosition } from '../../lib/core/sync/nodeVersionMemberPositionApply.js';
import { nodePositionFactId, nodePositionPayloadSchema } from '../../lib/core/sync/nodeVersionMemberPositionFact.js';
import { publishLocalNodePosition } from '../../lib/core/sync/nodeVersionMemberPositionPublish.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { compareSyncIdentityNodeFacts, selectRequiredSyncIdentityNodeFacts,
  type SyncIdentityNodeFactDescription } from '../../lib/core/sync/syncIdentityNodeFactComparison.js';
import { hashText } from '../../lib/core/sync/syncNodeResolution.js';
import { describeVersionFact } from '../../lib/core/sync/syncPackFactPresence.js';

import { closeLibraries, createPeer, edit, history, joinPeers, startLibraries, sync,
  type Peer } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function description(peer: Peer): SyncIdentityNodeFactDescription {
  const references = chainReferencesQuery('topic');
  const head = peer.driver.queryOne<{ current_version_id: string }>(
    "SELECT current_version_id FROM nodes WHERE id = 'topic'");
  if (!head) throw new Error('test_head_missing');
  return { headId: head.current_version_id, nodeId: 'topic', reviews: [],
    requirements: peer.driver.queryAll(references.sql, references.params),
    parents: peer.driver.queryAll('SELECT * FROM node_sync_version_parents'),
    versions: peer.driver.queryAll<Parameters<typeof describeVersionFact>[0]>(
      `SELECT *, json_remove(snapshot_json, '$.content') AS snapshot_metadata
        FROM node_sync_versions WHERE object_id = 'topic'`).map(describeVersionFact) };
}

it('accepts legal retired edges with immutable metadata intact through both production collectors', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const base = edit(source, 'Base');
  const middle = edit(source, 'Middle');
  edit(source, 'Head');
  await sync(source, target);
  await sync(target, source);
  const original = history(target).map(({ version_id, parent_version_id }) => ({ version_id, parent_version_id }));
  target.db.prepare('DELETE FROM node_sync_version_parents WHERE version_id = ?').run(middle);
  expect(compareSyncIdentityNodeFacts(description(source), description(target)))
    .toEqual({ leftNeedsRepair: false, rightNeedsRepair: false });
  collectNodeVersionChainWithDriver(target.driver, 'topic');
  expect((await collectNodeVersionPayloads(target.port, 'topic')).skipped).toBeNull();
  expect(history(target).map(({ version_id, parent_version_id }) => ({ version_id, parent_version_id })))
    .toEqual(original);
  expect(history(target).find((row) => row.version_id === middle)?.parent_version_id).toBe(base);
  expect(target.db.prepare('SELECT COUNT(*) FROM node_sync_version_parents WHERE version_id = ?')
    .pluck().get(middle)).toBe(0);
  const required = selectRequiredSyncIdentityNodeFacts(description(source), description(source).requirements);
  expect(required.bodyIds).toEqual([description(source).headId]);
  expect(required.parents).toEqual([]);
});

it('requests a necessary body from its legitimate holder and never publishes missing adoption evidence', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  const offline = createPeer('offline');
  joinPeers(source, target, offline);
  const base = edit(source, 'Original base');
  await sync(source, offline);
  const payload = nodePositionPayloadSchema.parse(offline.db.prepare(`SELECT adopted_version_id,
    device_identity_key, group_id, library_epoch, object_id, pending_version_ids_json,
    proof_revision, updated_at FROM node_version_member_positions WHERE device_identity_key = ?`)
    .get(offline.id));
  await retainLocalEditBase(source.port, { holdId: 'editor-base', nodeId: 'topic', versionId: base });
  edit(source, 'Middle');
  edit(source, 'Head');
  await sync(source, target);
  await sync(target, source);
  // Use the production migration policy to retire blanket legacy-history retention.
  await collectNodeVersionPayloads(target.port, 'topic', 32, true);
  expect(history(source).find((row) => row.version_id === base)?.body_text).toBe('Original base');
  expect(history(target).find((row) => row.version_id === base)?.body_text).toBeNull();
  // Relay the offline library's actual original declaration, captured before later edits.
  await applyNodeMemberPosition(target.port, { object_type: 'node_position', object_id: nodePositionFactId(payload),
    content_hash: hashText(JSON.stringify(payload)), payload_json: JSON.stringify(payload),
    deleted_at: null, updated_at: payload.updated_at });
  expect(compareSyncIdentityNodeFacts(description(source), description(target)))
    .toEqual({ leftNeedsRepair: false, rightNeedsRepair: true });
  const before = target.db.prepare('SELECT * FROM node_version_member_positions WHERE device_identity_key = ?').get(target.id);
  await target.port.transaction((tx) => publishLocalNodePosition(tx, 'topic'));
  expect(target.db.prepare('SELECT * FROM node_version_member_positions WHERE device_identity_key = ?').get(target.id))
    .toEqual(before);
  expect(before).toBeTruthy();
  expect((await collectNodeVersionPayloads(target.port, 'topic')).skipped).toBe('protected_body_unavailable');
});

it('preserves the original offline owner revision across indirect and late production relays', async () => {
  const owner = createPeer('owner');
  const relay = createPeer('relay');
  const receiver = createPeer('receiver');
  joinPeers(owner, relay, receiver);
  edit(owner, 'Initial');
  await sync(owner, relay);
  const readOriginal = (peer: Peer, identity: string) => nodePositionPayloadSchema.parse(
    peer.db.prepare(`SELECT adopted_version_id, device_identity_key, group_id, library_epoch,
      object_id, pending_version_ids_json, proof_revision, updated_at
      FROM node_version_member_positions WHERE device_identity_key = ? AND object_id = 'topic'`).get(identity));
  const old = readOriginal(owner, owner.id);
  edit(owner, 'New original');
  await sync(owner, receiver);
  const newest = readOriginal(owner, owner.id);
  expect(newest.proof_revision).toBeGreaterThan(old.proof_revision);
  await sync(receiver, relay);
  expect(readOriginal(relay, owner.id)).toEqual(newest);
  for (const peer of [relay, receiver]) {
    const members = peer.db.prepare('SELECT device_identity_key, proof_revision FROM node_version_member_positions ORDER BY fact_id').all();
    for (let repeat = 0; repeat < 2; repeat++) expect(await applyNodeMemberPosition(peer.port, {
      object_type: 'node_position', object_id: nodePositionFactId(old),
      content_hash: hashText(JSON.stringify(old)), payload_json: JSON.stringify(old),
      deleted_at: null, updated_at: old.updated_at
    })).toBe(false);
    expect(readOriginal(peer, owner.id)).toEqual(newest);
    expect(peer.db.prepare('SELECT device_identity_key, proof_revision FROM node_version_member_positions ORDER BY fact_id').all())
      .toEqual(members);
  }
  expect(readOriginal(owner, owner.id)).toEqual(newest);
});
