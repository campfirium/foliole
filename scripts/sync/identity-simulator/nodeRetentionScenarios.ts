import { expect } from 'vitest';

import { closeNodeFixture, collectNode, createNodeFixture, currentNode,
  exchangeNodes, independentNodeReceives, type NodeFixture } from './nodeScenarioSupport.js';
import { edit, mobileEdit, resetOperations } from './operations.js';
import { reopenPeer } from './peers.js';
import type { SimulatorPeer } from './scope.js';

function version(peer: SimulatorPeer, id: string) {
  return peer.sqlite.prepare(`SELECT version_id, object_id, parent_version_id, host_name,
    created_at, content_hash, body_text, snapshot_json FROM node_sync_versions WHERE version_id = ?`).get(id);
}
function edges(peer: SimulatorPeer) {
  return peer.sqlite.prepare(`SELECT version_id, parent_version_id, ordinal
    FROM node_sync_version_parents ORDER BY version_id, ordinal`).all();
}

/** Missing persisted body bytes are repaired from a real holder, without changing identity or lineage. */
async function seedOfflineFork(fixture: NodeFixture) {
  const [a, b, c] = fixture.peers as [SimulatorPeer, SimulatorPeer, SimulatorPeer];
  const base = edit(a, 'left=0\nright=0\nextra=0\n');
  for (const target of [1, 2, 3]) await exchangeNodes(fixture, 0, target);
  const hidden = await mobileEdit(c, base, 'left=0\nright=0\nextra=1\n');
  await mobileEdit(a, base, 'left=2\nright=0\nextra=0\n');
  await mobileEdit(b, base, 'left=0\nright=2\nextra=0\n');
  const left = edit(a, 'left=1\nright=0\nextra=0\n');
  const right = edit(b, 'left=0\nright=1\nextra=0\n');
  const original = version(a, base);
  const beforeEdges = edges(b);
  b.sqlite.prepare(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = ?`).run(base);
  expect(edges(b)).toEqual(beforeEdges);
  expect((version(b, base) as { body_text: string | null }).body_text).toBeNull();
  await exchangeNodes(fixture, 3, 1);
  expect(version(b, base)).toEqual(original);
  expect((await currentNode(b))!.version_id).toBe(right);
  return { base, hidden, left, right, original };
}

export async function runIdentityRetainedOfflineFork(root: string) {
  process.env.FOLIOLE_SIM_SCENARIO = 'identity-retained-offline-fork';
  resetOperations();
  const fixture = await createNodeFixture(root, ['a', 'b', 'c', 'd']);
  try {
    const facts = await seedOfflineFork(fixture);
    await independentNodeReceives(fixture);
    const [a, b] = fixture.peers as [SimulatorPeer, SimulatorPeer];
    const merged = (await currentNode(a))!;
    expect(merged.body_text).toBe('left=1\nright=1\nextra=0\n');
    expect(new Set(merged.parent_version_ids)).toEqual(new Set([facts.left, facts.right]));
    expect((await currentNode(b))!.version_id).toBe(merged.version_id);
    for (const peer of [a, b]) {
      const before = edges(peer);
      await collectNode(peer);
      expect(edges(peer)).toEqual(before);
      expect((version(peer, facts.base) as { body_text: string }).body_text)
        .toBe('left=0\nright=0\nextra=0\n');
      reopenPeer(peer);
    }
    await exchangeNodes(fixture, 0, 1);
    expect((await currentNode(b))!.version_id).toBe(merged.version_id);
    expect(version(a, facts.hidden)).toBeUndefined();
    await relayHiddenFork(fixture, facts.hidden, facts.base);
  } finally { await closeNodeFixture(fixture); }
}

async function relayHiddenFork(fixture: NodeFixture, hidden: string, base: string) {
  await exchangeNodes(fixture, 2, 3);
  await exchangeNodes(fixture, 3, 0);
  await exchangeNodes(fixture, 0, 1);
  await exchangeNodes(fixture, 0, 2);
  await exchangeNodes(fixture, 0, 3);
  const expected = (await currentNode(fixture.peers[0]!))!;
  expect(expected.body_text).toBe('left=1\nright=1\nextra=1\n');
  for (const peer of fixture.peers) {
    reopenPeer(peer);
    expect((await currentNode(peer))!.version_id).toBe(expected.version_id);
    expect((await currentNode(peer))!.body_text).toBe(expected.body_text);
    expect(version(peer, hidden)).toBeTruthy();
    expect(peer.sqlite.prepare(`SELECT parent_version_id FROM node_sync_version_parents
      WHERE version_id = ? ORDER BY ordinal`).pluck().all(hidden)).toEqual([base]);
  }
}
