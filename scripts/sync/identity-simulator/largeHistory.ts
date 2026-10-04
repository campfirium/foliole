import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';

import { assertBody, assertHealthy } from './assertions.js';
import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve } from './transport.js';

export function seedLargeHistory(peer: SimulatorPeer) {
  for (let index = 0; index < 141; index++) edit(peer, `history body ${index}`);
  const insert = peer.sqlite.prepare(`INSERT INTO review_log (id, op_id, host_name, node_id,
    grade, scheduler_version, reviewed_at, due_before, stability_before, difficulty_before,
    due_after, stability_after, difficulty_after) VALUES (?, ?, ?, 'topic', 3, 'fsrs-v1',
    '2026-09-30T00:00:01.000Z', '2026-09-30T00:00:00.000Z', 1, 5,
    '2026-10-01T00:00:00.000Z', 2, 4)`);
  peer.sqlite.transaction(() => {
    for (let index = 0; index < 4097; index++) {
      const id = `large-review-${String(index).padStart(5, '0')}`;
      insert.run(id, id, peer.name);
    }
  })();
}

export function originalFacts(peer: SimulatorPeer) {
  return {
    versions: peer.sqlite.prepare(`SELECT version_id, object_id, parent_version_id,
      host_name, created_at, content_hash FROM node_sync_versions
      WHERE object_id = 'topic' ORDER BY version_id`).all(),
    parents: peer.sqlite.prepare(`SELECT version_id, parent_version_id, ordinal
      FROM node_sync_version_parents ORDER BY version_id, ordinal, parent_version_id`).all(),
    reviews: peer.sqlite.prepare("SELECT * FROM review_log WHERE node_id = 'topic' ORDER BY op_id").all()
  };
}

/** Exercise bounded history over authenticated HTTP in each direction, including an interrupted transfer. */
export async function runIdentityLargeHistory(root: string, direction: 'download' | 'upload') {
  const scenario = `identity-large-history-${direction}`;
  process.env.FOLIOLE_SIM_SCENARIO = scenario;
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const a = openPeer(root, 'a', scenario);
  const b = openPeer(root, 'b', scenario);
  const peers = [a, b];
  pairPeers(peers);
  const origin = direction === 'download' ? a : b;
  const receiver = direction === 'download' ? b : a;
  seedLargeHistory(origin);
  const expected = originalFacts(origin);
  expect(expected.versions).toHaveLength(141);
  expect(expected.reviews).toHaveLength(4097);
  const endpoint = await serve(a);
  try {
    let interruptedAfterStaging = false;
    endpoint.afterResponse = () => {
      if (interruptedAfterStaging || !receiver.sqlite.prepare(
        'SELECT COUNT(*) FROM sync_identity_fact_staging').pluck().get()) return;
      interruptedAfterStaging = true;
      endpoint.interrupt = { path: direction === 'download' ?
        '/companion/sync-identity-pack' : '/companion/sync-identity-push', remaining: 1 };
    };
    await expect(inPeer(b, () => runDesktopSyncIdentityRound(route(endpoint, b)))).rejects.toThrow();
    expect(interruptedAfterStaging).toBe(true);
    expect(endpoint.interrupt).toBeNull();
    endpoint.afterResponse = undefined;
    expect(receiver.sqlite.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
    expect(receiver.sqlite.prepare('SELECT COUNT(*) FROM sync_identity_fact_staging').pluck().get())
      .toBeGreaterThan(0);
    reopenPeer(a);
    reopenPeer(b);
    const round = await inPeer(b, () => runDesktopSyncIdentityRound(route(endpoint, b)));
    expect(round.verifiedCandidateCount).toBe(0);
    expect(originalFacts(receiver)).toEqual(expected);
    assertBody(receiver, 'history body 140');
    reopenPeer(receiver);
    expect(originalFacts(receiver)).toEqual(expected);
    expect(await inPeer(b, () => runDesktopSyncIdentityRound(route(endpoint, b))))
      .toMatchObject({ verifiedCandidateCount: 0 });
    peers.forEach((peer) => assertHealthy(peer, []));
  } finally {
    await endpoint.close();
    for (const peer of peers) peer.sqlite.close();
  }
}
