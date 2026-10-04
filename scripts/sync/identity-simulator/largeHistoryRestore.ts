import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { runDesktopSyncIdentityRestoreRound } from '../../../electron/sync/desktopSyncIdentityRestoreRound.js';

import { assertBody, assertHealthy } from './assertions.js';
import { originalFacts, seedLargeHistory } from './largeHistory.js';
import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer } from './scope.js';
import { route, serve } from './transport.js';

/** A large frozen restore set travels through the signed HTTP staging and single production writer. */
export async function runIdentityLargeHistoryRestore(root: string) {
  const scenario = 'identity-large-history-restore';
  process.env.FOLIOLE_SIM_SCENARIO = scenario;
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const a = openPeer(root, 'a', scenario);
  const b = openPeer(root, 'b', scenario);
  const peers = [a, b];
  pairPeers(peers);
  seedLargeHistory(a);
  const expected = originalFacts(a);
  edit(b, 'preserved before restore', 'target-only');
  for (const peer of peers) peer.sqlite.prepare(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES ('large-restore', 'group', '2026-10-04T00:00:00.000Z', ?, ?, 'now')`)
    .run(a.id, peer === a ? 'now' : null);
  const endpoint = await serve(a);
  try {
    endpoint.interrupt = { path: '/companion/sync-identity-pack', remaining: 10 };
    await expect(inPeer(b, () => runDesktopSyncIdentityRestoreRound(route(endpoint, b), 'large-restore')))
      .rejects.toThrow();
    expect(endpoint.interrupt).toBeNull();
    assertBody(b, 'preserved before restore', 'target-only');
    expect(b.sqlite.prepare("SELECT 1 FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
    reopenPeer(a);
    reopenPeer(b);
    await expect(inPeer(b, () => runDesktopSyncIdentityRestoreRound(route(endpoint, b), 'large-restore')))
      .resolves.toMatchObject({ applied: true });
    expect(originalFacts(b)).toEqual(expected);
    expect(b.sqlite.prepare("SELECT 1 FROM nodes WHERE id = 'target-only'").get()).toBeUndefined();
    assertBody(b, 'history body 140');
    reopenPeer(b);
    expect(originalFacts(b)).toEqual(expected);
    expect(b.sqlite.prepare("SELECT applied_at FROM sync_group_restore_events WHERE restore_id = 'large-restore'").get())
      .toMatchObject({ applied_at: expect.any(String) });
    peers.forEach((peer) => assertHealthy(peer, []));
  } finally {
    await endpoint.close();
    for (const peer of peers) peer.sqlite.close();
  }
}
