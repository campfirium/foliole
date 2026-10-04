import { expect } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { retainLocalEditBase } from '../../../lib/core/sync/nodeVersionLocalEditHold.js';
import { repairDirectChildAnchorsForAppliedParent } from '../../../lib/core/sync/syncNodeAnchorRepair.js';
import { loadMergeBaseCandidates } from '../../../lib/core/sync/syncNodeGraph.js';

import { closeNodeFixture, collectNode, createNodeFixture, currentNode,
  exchangeNodes, independentNodeReceives } from './nodeScenarioSupport.js';
import { edit, resetOperations } from './operations.js';
import { reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';

async function annotateOriginal(peer: SimulatorPeer, versionId: string, body: string) {
  const port = createBetterSqliteDbPort(peer.sqlite);
  await retainLocalEditBase(port, { holdId: `draft-${peer.name}`, nodeId: 'topic', versionId });
  edit(peer, 'Annotation', `note-${peer.name}`, { kind: 'item', parentNodeId: 'topic',
    anchorLink: { id: `note-${peer.name}`, kind: 'highlight',
      locator: { from: 0, to: body.length, originalText: body } } });
  await inPeer(peer, () => repairDirectChildAnchorsForAppliedParent({ port,
    parentNodeId: 'topic', content: body, sourceVersionId: versionId,
    updatedAt: '2026-10-04T00:00:00.000Z' }));
}

async function readableBodies(peer: SimulatorPeer) {
  const body = (await currentNode(peer))!.body_text;
  const alternatives = peer.sqlite.prepare(`SELECT body_text FROM node_text_alternatives
    WHERE node_id = 'topic' AND status = 'available'`).pluck().all();
  return new Set([body, ...alternatives]);
}

/** Production projection heads are independently created, then compared through the v21 HTTP path. */
export async function runIdentityIncomparableProjection(root: string) {
  process.env.FOLIOLE_SIM_SCENARIO = 'identity-incomparable-projection';
  resetOperations();
  const fixture = await createNodeFixture(root, ['left', 'right']);
  const [a, b] = fixture.peers as [SimulatorPeer, SimulatorPeer];
  try {
    const originalA = edit(a, 'Body branch-a', 'topic', { title: 'Title A' });
    const originalB = edit(b, 'Body branch-b', 'topic', { title: 'Title B' });
    // Annotation writes occur after freezing envelopes, as in independently delayed topic delivery.
    await independentNodeReceives(fixture, 0, 1, async () => {
      await annotateOriginal(a, originalA, 'Body branch-a');
      await annotateOriginal(b, originalB, 'Body branch-b');
    });
    const left = (await currentNode(a))!;
    const right = (await currentNode(b))!;
    expect(left.snapshot.title).toBe('Title A');
    expect(right.snapshot.title).toBe('Title B');
    expect(left.version_id).not.toBe(right.version_id);
    expect(left.content_hash).not.toBe(right.content_hash);
    await retainAndCollect(a, left.version_id!);
    await retainAndCollect(b, right.version_id!);
    for (const peer of [a, b]) {
      expect(new Set((await currentNode(peer))!.parent_version_ids))
        .toEqual(new Set([originalA, originalB]));
      expect(await readableBodies(peer)).toEqual(new Set(['Body branch-a', 'Body branch-b']));
      reopenPeer(peer);
    }
    await exchangeNodes(fixture, 0, 1);
    await exchangeNodes(fixture, 1, 0);
    for (const peer of [a, b]) {
      const bases = await loadMergeBaseCandidates(createBetterSqliteDbPort(peer.sqlite),
        left.version_id!, right.version_id!);
      expect(new Set(bases)).toEqual(new Set([originalA, originalB]));
    }
    await assertProjectionReplay(fixture, [left.version_id!, right.version_id!]);
  } finally { await closeNodeFixture(fixture); }
}

async function retainAndCollect(peer: SimulatorPeer, versionId: string) {
  await retainLocalEditBase(createBetterSqliteDbPort(peer.sqlite), {
    holdId: `result-${peer.name}`, nodeId: 'topic', versionId });
  await collectNode(peer);
}

async function assertProjectionReplay(fixture: Awaited<ReturnType<typeof createNodeFixture>>,
  parents: string[]) {
  const result = (await currentNode(fixture.peers[0]!))!;
  expect(new Set(result.parent_version_ids)).toEqual(new Set(parents));
  for (const peer of fixture.peers) {
    reopenPeer(peer);
    const persisted = (await currentNode(peer))!;
    expect(persisted.version_id).toBe(result.version_id);
    expect(persisted.content_hash).toBe(result.content_hash);
    expect(persisted.snapshot).toEqual(result.snapshot);
    expect(await readableBodies(peer)).toEqual(new Set(['Body branch-a', 'Body branch-b']));
  }
  const counts = fixture.peers.map((peer) =>
    peer.sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions').pluck().get());
  await exchangeNodes(fixture, 0, 1);
  await exchangeNodes(fixture, 1, 0);
  expect(fixture.peers.map((peer) =>
    peer.sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions').pluck().get())).toEqual(counts);
  expect((await currentNode(fixture.peers[0]!))!.version_id).toBe(result.version_id);
}
