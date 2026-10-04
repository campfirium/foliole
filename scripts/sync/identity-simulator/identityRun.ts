import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { computeSyncContentHash } from '../../../lib/core/database/syncState.js';

import { assertBody, assertHealthy, convergenceState } from './assertions.js';
import { edit, mobileEdit, remove, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve, type Endpoint } from './transport.js';

async function exchange(source: Endpoint, target: SimulatorPeer) {
  return inPeer(target, () => runDesktopSyncIdentityRound(route(source, target)));
}

function prepareScenario(name: string) {
  process.env.FOLIOLE_SIM_SCENARIO = name;
  resetOperations();
}

function rootOrder(peer: SimulatorPeer): string[] {
  const raw = peer.sqlite.prepare(`SELECT child_ids_json FROM parent_child_order
    WHERE parent_id = 'parent-child-order:root'`).pluck().get() as string;
  return JSON.parse(raw) as string[];
}

function assertRootOrderHash(peer: SimulatorPeer) {
  const order = rootOrder(peer);
  const hash = peer.sqlite.prepare(`SELECT content_hash FROM sync_object_state
    WHERE object_type = 'parent_child_order' AND object_id = 'parent-child-order:root'`)
    .pluck().get();
  expect(hash).toBe(computeSyncContentHash('parent_child_order', {
    parent_id: 'parent-child-order:root', child_ids_json: JSON.stringify(order)
  }));
}

function assertRoundPageMetrics(round: Awaited<ReturnType<typeof exchange>>, requests: string[]) {
  const pages = (path: string) => requests.filter((route) =>
    new URL(route, 'http://localhost').pathname === path).length;
  expect(round.received.pageCount).toBe(pages('/companion/sync-identity-pack'));
  expect(round.sent.pageCount).toBe(pages('/companion/sync-identity-push'));
  expect(round.received.pageCount + round.sent.pageCount).toBeGreaterThan(2);
}

function identityRelayFailure(error: unknown, b: SimulatorPeer, c: SimulatorPeer) {
  const order = (peer: SimulatorPeer) => peer.sqlite.prepare(`SELECT child_ids_json,
        state.updated_at, state.sync_dirty FROM parent_child_order entity
        JOIN sync_object_state state ON state.object_type = 'parent_child_order'
        AND state.object_id = entity.parent_id WHERE entity.parent_id = 'parent-child-order:root'`).get();
  return new Error(`identity_relay_failed:${String(error)}:${JSON.stringify({
        b: order(b), c: order(c), sameNodes: JSON.stringify(convergenceState(b)) ===
          JSON.stringify(convergenceState(c))
      })}`);
}

/** Real SQLite files, signed HTTP, and the production bilateral identity path. */
export async function runIdentityRelay(root: string) {
  prepareScenario('identity-relay');
  await fs.mkdir(root, { recursive: true });
  const peers = ['a', 'b', 'c'].map((name) => openPeer(root, name, 'identity-relay'));
  const [a, b, c] = peers as [SimulatorPeer, SimulatorPeer, SimulatorPeer];
  pairPeers(peers);
  const endpoints: Endpoint[] = [];
  try {
    const sa = await serve(a);
    endpoints.push(sa);
    edit(a, 'A first', 'a-first');
    await exchange(sa, c);
    edit(c, 'C earlier', 'c-earlier', { title: 'Apple' });
    edit(a, 'A later', 'a-later', { title: 'Zebra' });
    await exchange(sa, b);
    expect(b.sqlite.prepare("SELECT 1 FROM nodes WHERE id = 'c-earlier'").get()).toBeUndefined();
    await sa.close();
    endpoints.pop();
    const sc = await serve(c);
    endpoints.push(sc);
    const firstRequest = sc.requests.length;
    const relay = await exchange(sc, b).catch((error: unknown) => {
      throw identityRelayFailure(error, b, c);
    });
    expect(relay.verifiedCandidateCount).toBe(0);
    assertRoundPageMetrics(relay, sc.requests.slice(firstRequest));
    assertBody(b, 'C earlier', 'c-earlier');
    assertBody(c, 'A later', 'a-later');
    const originalPositions = (peer: SimulatorPeer) => peer.sqlite.prepare(`SELECT fact_id,
      group_id, device_identity_key, object_id, library_epoch, proof_revision, adopted_version_id,
      pending_version_ids_json, updated_at FROM node_version_member_positions
      WHERE device_identity_key = ? ORDER BY object_id`).all(a.id);
    expect(originalPositions(c)).toEqual(originalPositions(a));
    expect(originalPositions(b)).toEqual(originalPositions(a));
    expect(rootOrder(b)).toEqual(['a-first', 'c-earlier', 'a-later']);
    expect(rootOrder(c)).toEqual(rootOrder(b));
    assertRootOrderHash(b);
    assertRootOrderHash(c);
    reopenPeer(b);
    reopenPeer(c);
    expect(convergenceState(b)).toEqual(convergenceState(c));
    expect(rootOrder(b)).toEqual(rootOrder(c));
    const sb = await serve(b);
    endpoints.push(sb);
    const reunion = await exchange(sb, a);
    expect(reunion.verifiedCandidateCount).toBe(0);
    assertBody(a, 'C earlier', 'c-earlier');
    expect(rootOrder(a)).toEqual(rootOrder(b));
    assertRootOrderHash(a);
    peers.forEach((peer) => assertHealthy(peer, []));
  } finally {
    for (const endpoint of endpoints) await endpoint.close();
    for (const peer of peers) peer.sqlite.close();
  }
}

/** A lost push reply must replay by page identity without replaying local sequence progress. */
export async function runIdentityLostReply(root: string) {
  prepareScenario('identity-lost-reply');
  await fs.mkdir(root, { recursive: true });
  const peers = ['a', 'b'].map((name) => openPeer(root, name, 'identity-lost-reply'));
  const [a, b] = peers as [SimulatorPeer, SimulatorPeer];
  pairPeers(peers);
  const endpoint = await serve(a);
  try {
    edit(b, 'offline contribution', 'b-contribution');
    endpoint.loseResponse = '/companion/sync-identity-push';
    await expect(exchange(endpoint, b)).rejects.toThrow();
    expect(endpoint.loseResponse).toBeNull();
    assertBody(a, 'offline contribution', 'b-contribution');
    reopenPeer(a);
    reopenPeer(b);
    const replay = await exchange(endpoint, b);
    expect(replay.verifiedCandidateCount).toBe(0);
    expect(convergenceState(a)).toEqual(convergenceState(b));
    peers.forEach((peer) => assertHealthy(peer, []));
  } finally {
    await endpoint.close();
    for (const peer of peers) peer.sqlite.close();
  }
}

/** Matching object heads do not prove a retained parent edge is present. */
export async function runIdentityMissingFact(root: string) {
  prepareScenario('identity-missing-fact');
  await fs.mkdir(root, { recursive: true });
  const peers = ['a', 'b'].map((name) => openPeer(root, name, 'identity-missing-fact'));
  const [a, b] = peers as [SimulatorPeer, SimulatorPeer];
  pairPeers(peers);
  const endpoint = await serve(a);
  const reverse = await serve(b);
  try {
    const base = edit(a, 'shared base\nx=0\n');
    await exchange(endpoint, b);
    await mobileEdit(a, base, 'left edit\nx=0\n');
    await mobileEdit(b, base, 'shared base\nx=1\n');
    await exchange(endpoint, b);
    await exchange(reverse, a);
    expect(convergenceState(a)).toEqual(convergenceState(b));
    const edge = a.sqlite.prepare(`SELECT edge.version_id, edge.parent_version_id
      FROM node_sync_version_parents edge JOIN nodes node
        ON node.current_version_id = edge.version_id
      WHERE node.id = 'topic' AND edge.ordinal = 1`).get() as
      { version_id: string; parent_version_id: string } | undefined;
    expect(edge).toBeTruthy();
    const removed = b.sqlite.prepare(`DELETE FROM node_sync_version_parents
      WHERE version_id = ? AND parent_version_id = ?`)
      .run(edge!.version_id, edge!.parent_version_id);
    expect(removed.changes).toBe(1);
    expect(b.sqlite.prepare(`SELECT 1 FROM node_sync_version_parents
      WHERE version_id = ? AND parent_version_id = ?`)
      .get(edge!.version_id, edge!.parent_version_id)).toBeUndefined();
    const repaired = await exchange(endpoint, b);
    expect(repaired.verifiedCandidateCount).toBe(0);
    expect(b.sqlite.prepare(`SELECT parent_version_id FROM node_sync_version_parents
      WHERE version_id = ? AND parent_version_id = ?`).pluck()
      .get(edge!.version_id, edge!.parent_version_id)).toBe(edge!.parent_version_id);
    expect(convergenceState(a)).toEqual(convergenceState(b));
    peers.forEach((peer) => assertHealthy(peer, []));
  } finally {
    await endpoint.close();
    await reverse.close();
    for (const peer of peers) peer.sqlite.close();
  }
}

/** Two offline edits of one global node ID must retain both branch facts. */
export async function runIdentityDivergence(root: string) {
  prepareScenario('identity-divergence');
  await fs.mkdir(root, { recursive: true });
  const peers = ['a', 'b'].map((name) => openPeer(root, name, 'identity-divergence'));
  const [a, b] = peers as [SimulatorPeer, SimulatorPeer];
  pairPeers(peers);
  const sa = await serve(a);
  const sb = await serve(b);
  try {
    const base = edit(a, 'shared base\nx=0\n');
    await exchange(sa, b);
    await mobileEdit(a, base, 'left edit\nx=0\n');
    await mobileEdit(b, base, 'shared base\nx=1\n');
    await exchange(sa, b);
    await exchange(sb, a);
    expect(convergenceState(a)).toEqual(convergenceState(b));
    const versions = (peer: SimulatorPeer) => peer.sqlite.prepare(`SELECT version_id
      FROM node_sync_versions WHERE object_id = 'topic' ORDER BY version_id`).pluck().all();
    expect(versions(a)).toEqual(versions(b));
    peers.forEach((peer) => assertHealthy(peer, []));
  } finally {
    await sa.close();
    await sb.close();
    for (const peer of peers) peer.sqlite.close();
  }
}

/** A later restoration of the same global ID must supersede its tombstone. */
export async function runIdentityDeleteRestore(root: string) {
  prepareScenario('identity-delete-restore');
  await fs.mkdir(root, { recursive: true });
  const peers = ['a', 'b'].map((name) => openPeer(root, name, 'identity-delete-restore'));
  const [a, b] = peers as [SimulatorPeer, SimulatorPeer];
  pairPeers(peers);
  const endpoint = await serve(a);
  try {
    edit(a, 'original');
    await exchange(endpoint, b);
    remove(a);
    await exchange(endpoint, b);
    expect(b.sqlite.prepare("SELECT deleted_at FROM nodes WHERE id='topic'")
      .pluck().get()).toBeTruthy();
    edit(a, 'restored');
    const restored = await exchange(endpoint, b);
    expect(restored.verifiedCandidateCount).toBe(0);
    assertBody(b, 'restored');
    expect(convergenceState(a)).toEqual(convergenceState(b));
    peers.forEach((peer) => assertHealthy(peer, []));
  } finally {
    await endpoint.close();
    for (const peer of peers) peer.sqlite.close();
  }
}
