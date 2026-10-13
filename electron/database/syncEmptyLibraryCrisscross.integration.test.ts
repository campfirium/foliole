// @vitest-environment node
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { repairDirectChildAnchorsForAppliedParent } from '../../lib/core/sync/syncNodeAnchorRepair.js';
import { loadCurrentSyncNodeRecord, loadMergeBaseCandidates } from '../../lib/core/sync/syncNodeGraph.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { root } from './syncLibrary.testSupport.js';
import {
  assertPersisted, closeLibraries, createPeer, edit, joinPeers, startLibraries, type Peer
} from './syncLibrary.testSupport.js';
import { syncRequestLibrary as sync } from './syncRequestLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

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
  await withTopicSnapshot(left, right, async toRight => {
    await withTopicSnapshot(right, left, async toLeft => { await toLeft(); await toRight(); });
  });
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
  await withTopicSnapshot(right, left, async toLeft => {
    await withTopicSnapshot(left, right, async toRight => {
      await toLeft();
      const bases = await loadMergeBaseCandidates(left.port, a.version_id!, b.version_id!);
      expect(bases.length).toBeGreaterThan(0);
      for (const id of bases) expect(left.db.prepare(
        'SELECT version_id FROM node_sync_versions WHERE version_id = ?').pluck().get(id)).toBe(id);
      await toRight();
      const final = await current(left);
      expect((await current(right)).version_id).toBe(final.version_id);
      expect((await current(right)).body_text).toBe(final.body_text);
      for (const peer of [left, right]) {
        assertPersisted(peer, 'Shared final body', final.version_id!);
        const replay = peer === left ? toLeft : toRight;
        await replay();
        assertPersisted(peer, 'Shared final body', final.version_id!);
      }
      await toLeft();
      await toRight();
      assertPersisted(left, 'Shared final body', final.version_id!);
      assertPersisted(right, 'Shared final body', final.version_id!);
      await sync(left, right);
      await sync(right, left);
      assertPersisted(left, 'Shared final body', final.version_id!);
      assertPersisted(right, 'Shared final body', final.version_id!);
    });
  });
});

it('resolves different production heads while preserving both bodies when their common bases are incomparable', async () => {
  const { left, right } = await diverge();
  await withTopicSnapshot(left, right, async toRight => {
    await withTopicSnapshot(right, left, async toLeft => { await toLeft(); await toRight(); });
  });
  for (const peer of [left, right]) {
    const final = await current(peer);
    assertPersisted(peer, final.body_text!, final.version_id!);
    const alternatives = (final.alternative_bodies ?? []).map((entry) => entry.text);
    expect(new Set([final.body_text, ...alternatives])).toEqual(new Set(['Left edit', 'Right edit']));
  }
});

async function withTopicSnapshot(source: Peer, target: Peer,
  execute: (replay: () => Promise<void>) => Promise<void>) {
  const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.port),
    remote: await readFramedSyncInventory(target.port) }).filter(value => value.direction === 'local_to_remote'
      && value.objectType === 'node' && value.globalId === 'topic');
  expect(differences).toHaveLength(1);
  const files = createDesktopFramedSyncFiles(path.join(root, `snapshot-${crypto.randomUUID()}`));
  const requests = differences.map(() => new RequestSyncFiles(files, `requests/${crypto.randomUUID()}`));
  const proof = source.db.prepare<[], { library_epoch: string; proof_revision: number }>(
    'SELECT library_epoch, proof_revision FROM node_version_local_proof_state').get()!;
  const targetEpoch = String(target.db.prepare('SELECT library_epoch FROM node_version_local_proof_state').pluck().get());
  try {
    for (const [index, difference] of differences.entries()) {
      await writeRequestSyncSnapshot(source.port, difference, requests[index]!);
    }
    await execute(async () => {
      for (const [index, difference] of differences.entries()) {
        const request = requests[index]!;
        await applyRequestSyncObject(target.port, {
          context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
            senderDeviceId: source.id, senderLibraryEpoch: proof.library_epoch,
            receiverDeviceId: target.id, receiverLibraryEpoch: targetEpoch },
          peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
            ...proof, devices: [], removals: [], restore: null, source_proof_revisions: {} },
          globalId: difference.globalId, objectType: difference.objectType, requestId: new Uint8Array(16),
          facts: () => request.readFacts(), loadBody: (_db, blob) => request.loadBody(blob), enqueueSearchInvalidations: false
        });
      }
    });
  } finally { await Promise.all(requests.map(request => request.close())); }
}
