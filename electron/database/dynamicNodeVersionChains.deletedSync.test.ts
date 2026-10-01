// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { collectAllNodeVersionChains } from '../../lib/core/database/dynamicNodeVersionChainMigration.js';
import { collectAllNodeVersionChainsWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { confirmOutboundNodeVersionPack } from '../../lib/core/sync/nodeVersionDeliveryProof.js';
import { loadPendingNodeVersionReceipts } from '../../lib/core/sync/nodeVersionInboundReceipt.js';
import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';

import { permanentlyDelete, restartDeletedPeer } from './dynamicNodeVersionChains.delete.testSupport.js';
import { buildPack, closeLibraries, createPeer, edit, history, joinPeers, receivePack,
  startLibraries, type Peer } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

async function confirm(source: Peer, target: Peer, packId: string) {
  const receipt = (await loadPendingNodeVersionReceipts(target.port, source.id)).find(row => row.packId === packId)!;
  expect(receipt.results).toHaveLength(1);
  expect(receipt.results[0]?.result).toBe('applied');
  await confirmOutboundNodeVersionPack(source.port, { ...receipt, confirmedAt: 'confirmed' });
}

it('keeps a sent version through deletion and restart, then advances to the received deletion fact', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const old = edit(source, 'body');
  const live = await buildPack(source, target);
  const tomb = permanentlyDelete(source);
  restartDeletedPeer(source);
  expect(history(source).map(row => row.version_id)).toContain(old);
  await receivePack(source, target, live);
  await confirm(source, target, live.packId);
  expect(history(source).map(row => row.version_id)).toContain(old);
  const deleted = await buildPack(source, target);
  await receivePack(source, target, deleted);
  expect(target.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
  await confirm(source, target, deleted.packId);
  for (const peer of [source, target]) {
    restartDeletedPeer(peer);
    expect(history(peer).map(row => [row.version_id, row.body_text, row.parent_version_id]))
      .toEqual([[tomb.version_id, 'body', null]]);
    expect(peer.db.pragma('foreign_key_check')).toEqual([]);
    expect(peer.db.prepare("SELECT parent_version_id FROM node_sync_tombstones WHERE node_id = 'topic'").pluck().get()).toBeNull();
  }
  await receivePack(source, target, live);
  expect(target.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
});

it('releases a persisted editor base after the node entity has been permanently deleted', async () => {
  const peer = createPeer('local');
  const base = edit(peer, 'body');
  await retainLocalEditBase(peer.port, { holdId: 'draft', nodeId: 'topic', versionId: base });
  const tomb = permanentlyDelete(peer);
  restartDeletedPeer(peer);
  expect(history(peer)).toHaveLength(2);
  await releaseLocalEditBase(peer.port, 'draft', 'topic');
  expect(history(peer).map(row => row.version_id)).toEqual([tomb.version_id]);
});

it('releases a surviving anchor dependency only when its actual reference is removed', async () => {
  const peer = createPeer('local');
  const base = edit(peer, 'body');
  peer.db.prepare(`INSERT INTO nodes (id, title, kind, anchor_source_version_id, created_at, updated_at)
    VALUES ('anchor', 'Anchor', 'item', ?, 'now', 'now')`).run(base);
  const tomb = permanentlyDelete(peer);
  restartDeletedPeer(peer);
  await collectNodeVersionPayloads(peer.port, 'topic');
  expect(history(peer)).toHaveLength(2);
  peer.db.prepare("UPDATE nodes SET anchor_source_version_id = NULL WHERE id = 'anchor'").run();
  await collectNodeVersionPayloads(peer.port, 'topic');
  expect(history(peer).map(row => row.version_id)).toEqual([tomb.version_id]);
});

it('keeps an unresolved conflict through physical deletion and restart until explicitly resolved', async () => {
  const peer = createPeer('local');
  const base = edit(peer, 'body');
  peer.db.prepare(`INSERT INTO node_sync_conflicts
    (conflict_version_id, object_id, snapshot_json, detected_at) VALUES (?, 'topic', '{}', 'now')`).run(base);
  const tomb = permanentlyDelete(peer);
  restartDeletedPeer(peer);
  await collectNodeVersionPayloads(peer.port, 'topic');
  expect(peer.db.prepare('SELECT conflict_version_id FROM node_sync_conflicts').pluck().all()).toEqual([base]);
  expect(history(peer)).toHaveLength(2);
  peer.db.prepare('DELETE FROM node_sync_conflicts WHERE conflict_version_id = ?').run(base);
  await collectNodeVersionPayloads(peer.port, 'topic');
  expect(history(peer).map(row => row.version_id)).toEqual([tomb.version_id]);
});

it.each(['driver', 'port'])('releases a deleted object history when its direct peer leaves (%s)', async host => {
  const peer = createPeer('local');
  const remote = createPeer('remote');
  joinPeers(peer, remote);
  edit(peer, 'body');
  await buildPack(peer, remote);
  const tomb = permanentlyDelete(peer);
  restartDeletedPeer(peer);
  expect(history(peer)).toHaveLength(2);
  peer.db.prepare("UPDATE sync_group_devices SET state = 'left' WHERE device_identity_key = ?").run(remote.id);
  if (host === 'driver') collectAllNodeVersionChainsWithDriver(peer.driver);
  else await collectAllNodeVersionChains(peer.port);
  expect(history(peer).map(row => row.version_id)).toEqual([tomb.version_id]);
});
