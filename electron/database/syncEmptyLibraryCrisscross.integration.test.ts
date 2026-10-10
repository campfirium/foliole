// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { confirmOutboundNodeVersionPack } from '../../lib/core/sync/nodeVersionDeliveryProof.js';
import { loadPendingNodeVersionReceipts } from '../../lib/core/sync/nodeVersionInboundReceipt.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { repairDirectChildAnchorsForAppliedParent } from '../../lib/core/sync/syncNodeAnchorRepair.js';
import { loadCurrentSyncNodeRecord, loadMergeBaseCandidates } from '../../lib/core/sync/syncNodeGraph.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { applyNodePushBatchWithDbPort } from './companionSyncNodeConvergence.js';
import type { CompanionSyncPushPayload } from './companionSyncPushTypes.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import {
  assertPersisted, buildPack, closeLibraries, createPeer, edit, joinPeers, receivePack, startLibraries, sync, type Peer
} from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function payload(record: NativeSyncNodeRecord): CompanionSyncPushPayload {
  return {
    authorHostName: record.host_name!,
    base: { kind: 'node_version', ancestorVersionIds: record.ancestor_version_ids,
      parentVersionId: record.parent_version_id,
      parentVersionIds: record.parent_version_ids ?? (record.parent_version_id ? [record.parent_version_id] : []) },
    clientOpId: `node:${record.version_id}`, contentHash: record.content_hash!,
    identity: { objectId: record.object_id, objectType: 'node', scope: 'workspace' },
    payloadJson: JSON.stringify(record), updatedAt: record.updated_at
  };
}

async function current(peer: Peer) {
  return (await loadCurrentSyncNodeRecord(peer.port, 'topic'))!;
}

async function annotate(peer: Peer, versionId: string, content: string) {
  const at = '2026-09-30T00:10:00.000Z';
  const nodeId = `note-${peer.name}`;
  peer.driver.transaction((driver) => {
    upsertNodeSnapshot(driver, { nodeId, hostName: peer.name, parentNodeId: 'topic', kind: 'item',
      title: 'Note', isTitleManual: true, content: 'Annotation', position: null, reveal: null,
      anchorLink: { id: nodeId, kind: 'highlight', locator: { from: 0, to: content.length, originalText: content } },
      createdAt: at, updatedAt: at });
    flushNodeSyncVersionWithDriver(driver, nodeId, peer.name, at);
  });
  await repairDirectChildAnchorsForAppliedParent({ port: peer.port, parentNodeId: 'topic',
    content, sourceVersionId: versionId, updatedAt: at });
}

async function diverge() {
  const left = createPeer('left');
  const right = createPeer('right');
  joinPeers(left, right);
  edit(left, 'Original');
  await sync(left, right);
  await sync(right, left);
  const l = edit(left, 'Left edit', 'Title A');
  const r = edit(right, 'Right edit', 'Title B');
  await annotate(left, l, 'Left edit');
  await annotate(right, r, 'Right edit');
  const [a, b] = await Promise.all([current(left), current(right)]);
  // Topic envelopes may arrive before annotation envelopes, so each side resolves independently.
  expect((await applyNodePushBatchWithDbPort(left.port, [payload(b)])).acks[0]?.status).toBe('accepted');
  expect((await applyNodePushBatchWithDbPort(right.port, [payload(a)])).acks[0]?.status).toBe('accepted');
  assertPersisted(left, 'Left edit');
  assertPersisted(right, 'Right edit');
  expect((await current(left)).version_id).not.toBe((await current(right)).version_id);
  return { left, right, bases: [l, r] };
}

it.each([false, true])('converges matching production heads after independent overlapping resolutions (collection=%s)', async (collect) => {
  const { left, right } = await diverge();
  edit(left, 'Intermediate body', 'Title A');
  edit(right, 'Intermediate body', 'Title B');
  edit(left, 'Shared final body', 'Title A');
  edit(right, 'Shared final body', 'Title B');
  if (collect) {
    for (const peer of [left, right]) {
      const result = await collectNodeVersionPayloads(peer.port, 'topic');
      expect(result.skipped).toBeNull();
      expect(result.released).toBe(0);
    }
  }
  const [a, b] = await Promise.all([current(left), current(right)]);
  const toLeft = await buildPack(right, left);
  const toRight = await buildPack(left, right);
  await receivePack(right, left, toLeft);
  const bases = await loadMergeBaseCandidates(left.port, a.version_id!, b.version_id!);
  expect(bases.length).toBeGreaterThan(0);
  for (const id of bases) expect(left.db.prepare(
    'SELECT version_id FROM node_sync_versions WHERE version_id = ?').pluck().get(id)).toBe(id);
  await receivePack(left, right, toRight);
  for (const [source, target, pack] of [[right, left, toLeft], [left, right, toRight]] as const) {
    const receipt = (await loadPendingNodeVersionReceipts(target.port, source.id))
      .find((item) => item.packId === pack.packId)!;
    expect(receipt.results.find((item) => item.objectId === 'topic'))
      .toMatchObject({ baseVersionId: receipt.results.find((item) => item.objectId === 'topic')!.sentVersionId, result: 'applied' });
    await confirmOutboundNodeVersionPack(source.port, { ...receipt, confirmedAt: '2026-09-30T01:00:00Z' });
    expect(source.db.prepare(`SELECT version_id FROM node_version_outbound_holds
      WHERE pack_id = ? AND object_id = 'topic'`).pluck().get(pack.packId)).toBeUndefined();
  }
  const final = await current(left);
  expect((await current(right)).version_id).toBe(final.version_id);
  expect((await current(right)).body_text).toBe(final.body_text);
  for (const peer of [left, right]) {
    assertPersisted(peer, 'Shared final body', final.version_id!);
    const source = peer === left ? right : left;
    const replay = peer === left ? toLeft : toRight;
    expect(await receivePack(source, peer, replay))
      .toMatchObject({ appliedObjectCount: 0, handledConflictCount: 0 });
    assertPersisted(peer, 'Shared final body', final.version_id!);
  }
  await receivePack(right, left, toLeft);
  await receivePack(left, right, toRight);
  assertPersisted(left, 'Shared final body', final.version_id!);
  assertPersisted(right, 'Shared final body', final.version_id!);
  await sync(left, right);
  await sync(right, left);
  assertPersisted(left, 'Shared final body', final.version_id!);
  assertPersisted(right, 'Shared final body', final.version_id!);
});

it('resolves different production heads while preserving both bodies when their common bases are incomparable', async () => {
  const { left, right } = await diverge();
  const [a, b] = await Promise.all([current(left), current(right)]);
  expect((await applyNodePushBatchWithDbPort(left.port, [payload(b)])).acks[0]?.status).toBe('accepted');
  expect((await applyNodePushBatchWithDbPort(right.port, [payload(a)])).acks[0]?.status).toBe('accepted');
  for (const peer of [left, right]) {
    const final = await current(peer);
    assertPersisted(peer, final.body_text!, final.version_id!);
    const alternatives = (final.alternative_bodies ?? []).map((entry) => entry.text);
    expect(new Set([final.body_text, ...alternatives])).toEqual(new Set(['Left edit', 'Right edit']));
  }
});
