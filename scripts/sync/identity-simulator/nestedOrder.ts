import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { computeSyncContentHash } from '../../../lib/core/database/syncState.js';

import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve } from './transport.js';

function nestedOrder(peer: SimulatorPeer) {
  const row = peer.sqlite.prepare(`SELECT entity.child_ids_json, state.content_hash
    FROM parent_child_order entity JOIN sync_object_state state
      ON state.object_type = 'parent_child_order' AND state.object_id = entity.parent_id
    WHERE entity.parent_id = 'folder'`).get() as
      { child_ids_json: string; content_hash: string };
  expect(row.content_hash).toBe(computeSyncContentHash('parent_child_order', {
    parent_id: 'folder', child_ids_json: row.child_ids_json
  }));
  return JSON.parse(row.child_ids_json) as string[];
}

/** Exercise both directions of the production HTTP and SQLite path for one nested parent. */
export async function runIdentityNestedOrder(root: string) {
  process.env.FOLIOLE_SIM_SCENARIO = 'identity-nested-order';
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const peers = ['a', 'b'].map((name) => openPeer(root, name, 'identity-nested-order'));
  const [a, b] = peers as [SimulatorPeer, SimulatorPeer];
  pairPeers(peers);
  const sa = await serve(a);
  const sb = await serve(b);
  try {
    edit(a, '', 'folder', { kind: 'folder' });
    edit(a, 'base', 'base-child', { parentNodeId: 'folder' });
    await inPeer(b, () => runDesktopSyncIdentityRound(route(sa, b)));
    edit(a, 'left', 'left-child', { parentNodeId: 'folder', title: 'Zebra' });
    edit(b, 'right', 'right-child', { parentNodeId: 'folder', title: 'Apple' });
    await inPeer(b, () => runDesktopSyncIdentityRound(route(sa, b)));
    await inPeer(a, () => runDesktopSyncIdentityRound(route(sb, a)));
    reopenPeer(a);
    reopenPeer(b);
    expect(nestedOrder(a)).toEqual(['base-child', 'right-child', 'left-child']);
    expect(nestedOrder(b)).toEqual(nestedOrder(a));
  } finally {
    await sa.close();
    await sb.close();
    for (const peer of peers) peer.sqlite.close();
  }
}
