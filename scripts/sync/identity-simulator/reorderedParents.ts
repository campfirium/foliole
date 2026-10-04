import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { replaceNodeOrder, restoreSavedParentOrder } from '../../../lib/core/database/nodeOrderMutations.js';
import { ROOT_CHILD_ORDER_ID } from '../../../lib/core/database/parentChildOrder.js';

import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve } from './transport.js';

export function savedOrder(peer: SimulatorPeer, parentId: string) {
  const row = peer.sqlite.prepare(`SELECT entity.child_ids_json, state.current_version_id
    FROM parent_child_order entity JOIN sync_object_state state
      ON state.object_type = 'parent_child_order' AND state.object_id = entity.parent_id
    WHERE entity.parent_id = ?`).get(parentId) as
      { child_ids_json: string; current_version_id: string };
  return { order: JSON.parse(row.child_ids_json) as string[], versionId: row.current_version_id };
}

export function originalSnapshot(peer: SimulatorPeer, versionId: string) {
  return peer.sqlite.prepare(`SELECT version_id, child_ids_json, parent_version_ids_json,
    kind, created_at FROM parent_order_versions WHERE version_id = ?`).get(versionId);
}

/** Three independent writers, an offline origin, durable losers and a new restoration edit. */
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
      const facts = original.map((snapshots) => snapshots.get(parentId)!)
        .sort((left, right) => left.versionId < right.versionId ? -1 : 1);
      expect(savedOrder(b, parentId).order).toEqual(facts[0]!.order);
      expect(savedOrder(c, parentId)).toEqual(savedOrder(b, parentId));
      for (const snapshot of facts) {
        expect(originalSnapshot(c, snapshot.versionId)).toEqual(originalSnapshot(b, snapshot.versionId));
        expect(originalSnapshot(c, snapshot.versionId)).toMatchObject({ kind: 'user',
          child_ids_json: JSON.stringify(snapshot.order) });
      }
    }
    reopenPeer(b);
    reopenPeer(c);
    await restoreLoser(b, c, sb, original.map((snapshots) => snapshots.get('folder')!));
  } finally {
    await Promise.all(servers.filter((_, index) => index !== 0 || !originClosed)
      .map((server) => server.close()));
    for (const peer of peers) peer.sqlite.close();
  }
}

async function restoreLoser(b: SimulatorPeer, c: SimulatorPeer, sb: Awaited<ReturnType<typeof serve>>,
  snapshots: ReturnType<typeof savedOrder>[]) {
    const loser = snapshots
      .sort((left, right) => left.versionId < right.versionId ? -1 : 1).at(-1)!;
    const previous = savedOrder(b, 'folder').versionId;
    expect(inPeer(b, () => restoreSavedParentOrder(b.driver, { parentId: 'folder',
      versionId: loser.versionId, hostName: b.name, updatedAt: new Date().toISOString() }))).toBe(true);
    const restored = savedOrder(b, 'folder');
    expect(restored.order).toEqual(loser.order);
    expect(restored.versionId).not.toBe(previous);
    expect(restored.versionId).not.toBe(loser.versionId);
    await inPeer(c, () => runDesktopSyncIdentityRound(route(sb, c)));
    reopenPeer(c);
    expect(savedOrder(c, 'folder')).toEqual(restored);
    expect(originalSnapshot(c, loser.versionId)).toMatchObject({ kind: 'user',
      child_ids_json: JSON.stringify(loser.order) });
}
