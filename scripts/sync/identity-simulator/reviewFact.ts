import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { syncCompanionObjectsFromDesktop } from '../../../src/shared/platform/companionDesktopSyncObjects.js';

import { assertBody, assertHealthy, convergenceState } from './assertions.js';
import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve, type Endpoint } from './transport.js';

function reviewRows(peer: SimulatorPeer) {
  return peer.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all();
}

/** Equal node heads must not hide a missing retained review operation. */
export async function runIdentityMissingReview(root: string, companion = false) {
  process.env.FOLIOLE_SIM_SCENARIO = 'identity-missing-review';
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const peers = ['a', 'b'].map((name) => openPeer(root, name, 'identity-missing-review'));
  const [a, b] = peers as [SimulatorPeer, SimulatorPeer];
  pairPeers(peers);
  const endpoint: Endpoint = await serve(a);
  const exchange = () => inPeer(b, () => companion
    ? syncCompanionObjectsFromDesktop(endpoint.origin, { includeResources: false })
    : runDesktopSyncIdentityRound(route(endpoint, b)));
  try {
    edit(a, 'reviewed content');
    await exchange();
    a.sqlite.prepare(`INSERT INTO review_log (id, op_id, host_name, node_id, grade,
      scheduler_version, reviewed_at, due_before, stability_before, difficulty_before,
      due_after, stability_after, difficulty_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'review-1', 'review-op-1', a.name, 'topic', 3, 'fsrs-v1',
      '2026-09-30T00:00:01.000Z', '2026-09-30T00:00:00.000Z', 1, 5,
      '2026-10-01T00:00:00.000Z', 2, 4);
    await exchange();
    expect(reviewRows(b)).toEqual(reviewRows(a));
    const removed = b.sqlite.prepare('DELETE FROM review_log WHERE op_id = ?')
      .run('review-op-1');
    expect(removed.changes).toBe(1);
    expect(convergenceState(b)).toEqual(convergenceState(a));
    const repaired = await exchange();
    if (companion) expect(repaired).toMatchObject({ pushError: null });
    else expect(repaired).toMatchObject({ verifiedCandidateCount: 0 });
    expect(reviewRows(b)).toEqual(reviewRows(a));
    reopenPeer(b);
    expect(reviewRows(b)).toEqual(reviewRows(a));
    assertBody(b, 'reviewed content');
    peers.forEach((peer) => assertHealthy(peer, []));
  } finally {
    await endpoint.close();
    for (const peer of peers) peer.sqlite.close();
  }
}
