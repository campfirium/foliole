import path from 'node:path';

import { expect } from 'vitest';

import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { replaceNodeOrder } from '../../../lib/core/database/nodeOrderMutations.js';
import { ROOT_CHILD_ORDER_ID } from '../../../lib/core/database/parentChildOrder.js';

import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { originalSnapshot, savedOrder } from './reorderedParents.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve } from './transport.js';

type Intent = 'same-reorder' | 'reversed-anchors';

function writeOrder(peer: SimulatorPeer, parentId: string, ids: string[]) {
  inPeer(peer, () => replaceNodeOrder(peer.driver,
    parentId === ROOT_CHILD_ORDER_ID ? ids : ['folder', ...ids]));
  const saved = savedOrder(peer, parentId);
  expect(saved.order).toEqual(ids);
  const original = originalSnapshot(peer, saved.versionId);
  expect(original).toMatchObject({ kind: 'user', child_ids_json: JSON.stringify(ids) });
  return { versionId: saved.versionId, original };
}

function assertConverged(peers: SimulatorPeer[], parentId: string, expected: string[],
  originals: ReturnType<typeof writeOrder>[]) {
  const head = savedOrder(peers[0]!, parentId);
  expect(head.order).toEqual(expected);
  for (const peer of peers) {
    expect(savedOrder(peer, parentId)).toEqual(head);
    for (const fact of originals) expect(originalSnapshot(peer, fact.versionId)).toEqual(fact.original);
  }
}

async function runParentIntent(root: string, parentId: string, intent: Intent) {
  const scenario = `identity-${intent}-${parentId}`;
  process.env.FOLIOLE_SIM_SCENARIO = scenario;
  resetOperations();
  const peers = ['b', 'c'].map((name) => openPeer(root, name, scenario));
  const [b, c] = peers as [SimulatorPeer, SimulatorPeer];
  pairPeers(peers);
  const [sb, sc] = await Promise.all(peers.map(serve));
  try {
    if (parentId !== ROOT_CHILD_ORDER_ID) edit(b, '', 'folder', { kind: 'folder' });
    const options = parentId === ROOT_CHILD_ORDER_ID ? {} : { parentNodeId: parentId };
    for (const id of ['A', 'B', 'C']) edit(b, id, id, options);
    await inPeer(c, () => runDesktopSyncIdentityRound(route(sb!, c)));
    expect(savedOrder(b, parentId).order).toEqual(['A', 'B', 'C']);
    expect(savedOrder(c, parentId)).toEqual(savedOrder(b, parentId));
    if (intent === 'reversed-anchors') edit(b, 'new', 'new', options);
    const left = intent === 'same-reorder' ? ['C', 'A', 'B'] : ['A', 'new', 'B', 'C'];
    const right = intent === 'same-reorder' ? ['C', 'A', 'B'] : ['B', 'A', 'C'];
    const originals = [writeOrder(b, parentId, left), writeOrder(c, parentId, right)];
    expect(originals[0]!.versionId).not.toBe(originals[1]!.versionId);
    await inPeer(c, () => runDesktopSyncIdentityRound(route(sb!, c)));
    await inPeer(b, () => runDesktopSyncIdentityRound(route(sc!, b)));
    const expected = intent === 'same-reorder' ? ['C', 'A', 'B'] : ['B', 'A', 'new', 'C'];
    assertConverged(peers, parentId, expected, originals);
    peers.forEach(reopenPeer);
    assertConverged(peers, parentId, expected, originals);
  } finally {
    await sb!.close();
    await sc!.close();
    peers.forEach((peer) => peer.sqlite.close());
  }
}

/** Identical user intent and reversed placement anchors use the same root/nested contract. */
export async function runIdentityOrderIntent(root: string, intent: Intent) {
  for (const parentId of [ROOT_CHILD_ORDER_ID, 'folder']) {
    await runParentIntent(path.join(root, parentId === ROOT_CHILD_ORDER_ID ? 'root' : 'nested'), parentId, intent);
  }
}
