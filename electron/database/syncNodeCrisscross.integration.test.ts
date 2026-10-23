// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { closeLibraries, createPeer, edit, joinPeers, startLibraries, type Peer } from './syncLibrary.testSupport.js';
import { syncRequestLibrary as sync } from './syncRequestLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

async function current(peer: Peer) {
  return (await loadCurrentSyncNodeRecord(peer.port, 'topic'))!;
}

it.each(['folder', 'item'] as const)('converges %s heads whose independent origins were merged in different orders by different devices', async (kind) => {
  const [a, b, c] = ['a', 'b', 'c'].map((name) => createPeer(name)) as [Peer, Peer, Peer];
  joinPeers(a, b, c);
  for (const peer of [a, b, c]) edit(peer, '', 'Inbox', null, kind);
  // A merges C's origin before B's while B merges C's alone, so the heads share two incomparable best ancestors.
  await sync(c, a);
  await sync(b, a);
  await sync(c, b);
  edit(a, '', 'Renamed', null, kind);
  edit(b, 'Note', 'Inbox', null, kind);
  for (const [source, target] of [[a, b], [b, a], [a, b], [a, c]] as const) await sync(source, target);
  const heads = await Promise.all([a, b, c].map(current));
  expect(new Set(heads.map((head) => head.version_id)).size).toBe(1);
  expect(heads[0]!.snapshot.title).toBe('Renamed');
});
