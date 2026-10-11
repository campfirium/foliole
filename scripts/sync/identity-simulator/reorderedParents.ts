import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { readCurrentParentOrderSources } from '../../../lib/core/database/currentParentOrderStore.js';
import { replaceNodeOrder } from '../../../lib/core/database/nodeOrderMutations.js';
import { ROOT_CHILD_ORDER_ID } from '../../../lib/core/database/parentChildOrder.js';
import { compareUtf8Text } from '../../../lib/core/sync/syncIdentityKeyOrder.js';

import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve } from './transport.js';

export function savedOrder(peer: SimulatorPeer, parentId: string) {
  const row = peer.sqlite.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?')
    .get(parentId) as { child_ids_json: string };
  return { order: JSON.parse(row.child_ids_json) as string[],
    sources: readCurrentParentOrderSources(peer.driver, parentId) };
}

export function latestOriginal(snapshots: ReturnType<typeof savedOrder>[]) {
  return snapshots.flatMap(value => value.sources).sort((a, b) => b.counter - a.counter ||
    compareUtf8Text(b.authorId, a.authorId))[0]!;
}

/** Three current writers remain convergent while the original sender is offline. */
export async function runIdentityReorderedParents(root: string) {
  process.env.FOLIOLE_SIM_SCENARIO = 'identity-reordered-parents';
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const peers = ['a', 'b', 'c'].map((name) => openPeer(root, name, 'identity-reordered-parents'));
  const [a, b, c] = peers as [SimulatorPeer, SimulatorPeer, SimulatorPeer];
  pairPeers(peers);
  const servers = await Promise.all(peers.map((peer) => serve(peer)));
  const [sa, sb, sc] = servers as [Awaited<ReturnType<typeof serve>>,
    Awaited<ReturnType<typeof serve>>, Awaited<ReturnType<typeof serve>>];
  let originClosed = false;
  try {
    edit(a, '', 'folder', { kind: 'folder' });
    for (const id of ['1', '2', '3']) {
      edit(a, id, `root-${id}`);
      edit(a, id, `nested-${id}`, { parentNodeId: 'folder' });
    }
    await inPeer(b, () => runDesktopSyncIdentityRound(route(sa, b)));
    await inPeer(c, () => runDesktopSyncIdentityRound(route(sa, c)));
    const permutations = [['3', '2', '1'], ['2', '1', '3'], ['1', '3', '2']];
    const original = peers.map((peer, index) => {
      const ids = permutations[index]!;
      inPeer(peer, () => replaceNodeOrder(peer.driver,
        ['folder', ...ids.map((id) => `root-${id}`), ...ids.map((id) => `nested-${id}`)]));
      return new Map([ROOT_CHILD_ORDER_ID, 'folder'].map((parentId) =>
        [parentId, savedOrder(peer, parentId)]));
    });
    await inPeer(b, () => runDesktopSyncIdentityRound(route(sa, b)));
    await sa.close();
    originClosed = true;
    await inPeer(c, () => runDesktopSyncIdentityRound(route(sb, c)));
    await inPeer(b, () => runDesktopSyncIdentityRound(route(sc, b)));
    for (const parentId of [ROOT_CHILD_ORDER_ID, 'folder']) {
      const facts = original.map(snapshots => snapshots.get(parentId)!);
      expect(savedOrder(b, parentId).order).toEqual(latestOriginal(facts).childIds);
      expect(savedOrder(c, parentId)).toEqual(savedOrder(b, parentId));
      expect(savedOrder(c, parentId).sources).toHaveLength(3);
    }
    reopenPeer(b);
    reopenPeer(c);
    const next = [...savedOrder(b, 'folder').order].reverse();
    inPeer(b, () => replaceNodeOrder(b.driver, next));
    await inPeer(c, () => runDesktopSyncIdentityRound(route(sb, c)));
    expect(savedOrder(c, 'folder').order).toEqual(next);
    expect(savedOrder(c, 'folder').sources).toHaveLength(3);
  } finally {
    await Promise.all(servers.filter((_, index) => index !== 0 || !originClosed)
      .map((server) => server.close()));
    for (const peer of peers) peer.sqlite.close();
  }
}
