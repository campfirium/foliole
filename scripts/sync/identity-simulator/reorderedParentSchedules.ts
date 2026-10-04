import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { replaceNodeOrder, restoreSavedParentOrder } from '../../../lib/core/database/nodeOrderMutations.js';
import { ROOT_CHILD_ORDER_ID } from '../../../lib/core/database/parentChildOrder.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { readParentOrderVersionPage } from '../../../lib/core/sync/syncParentOrderVersionStore.js';

import { edit, remove, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { originalSnapshot, savedOrder } from './reorderedParents.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve, type Endpoint } from './transport.js';

type Fixture = { peers: SimulatorPeer[]; servers: Endpoint[];
  originals: Map<string, ReturnType<typeof savedOrder>>[] };
const parents = [ROOT_CHILD_ORDER_ID, 'folder'];

async function exchange(fixture: Fixture, source: number, target: number) {
  const peer = fixture.peers[target]!;
  await inPeer(peer, () => runDesktopSyncIdentityRound(route(fixture.servers[source]!, peer)));
}

async function seedOrders(fixture: Fixture) {
  const a = fixture.peers[0]!;
  edit(a, '', 'folder', { kind: 'folder' });
  edit(a, '', 'other-folder', { kind: 'folder' });
  for (const id of ['1', '2', '3', '4', '5']) {
    edit(a, id, `root-${id}`);
    edit(a, id, `nested-${id}`, { parentNodeId: 'folder' });
  }
  for (const target of [1, 2, 3]) await exchange(fixture, 0, target);
  const permutations = [['5', '4', '3', '2', '1'], ['2', '1', '3', '4', '5'], ['1', '3', '5', '4', '2']];
  fixture.originals = fixture.peers.slice(0, 3).map((peer, index) => {
    const ids = permutations[index]!;
    inPeer(peer, () => replaceNodeOrder(peer.driver, ['folder', 'other-folder',
      ...ids.map((id) => `root-${id}`), ...ids.map((id) => `nested-${id}`)]));
    return new Map(parents.map((parentId) => [parentId, savedOrder(peer, parentId)]));
  });
  // A fourth receiver holds A's exact original edit, without either other writer's facts.
  await exchange(fixture, 0, 3);
}

async function settle(fixture: Fixture) {
  for (const target of [0, 1, 3]) await exchange(fixture, 2, target);
  for (const source of [0, 1, 3]) await exchange(fixture, source, 2);
  for (const target of [0, 1, 3]) await exchange(fixture, 2, target);
}

function assertOrders(fixture: Fixture) {
  return parents.map((parentId) => {
    const originals = fixture.originals.map((facts) => facts.get(parentId)!)
      .sort((a, b) => a.versionId < b.versionId ? -1 : 1);
    const result = savedOrder(fixture.peers[0]!, parentId);
    expect(result.order).toEqual(originals[0]!.order);
    for (const peer of fixture.peers) {
      expect(savedOrder(peer, parentId)).toEqual(result);
      for (const fact of originals) expect(originalSnapshot(peer, fact.versionId))
        .toEqual(originalSnapshot(fixture.peers[0]!, fact.versionId));
    }
    return result;
  });
}

async function restoreInitialFiles(fixture: Fixture, backups: string[]) {
  for (const [index, peer] of fixture.peers.entries()) {
    peer.sqlite.close();
    await fs.copyFile(backups[index]!, peer.dbPath);
    const reopened = openPeer(peer.root.slice(0, peer.root.lastIndexOf('/')), peer.name, peer.seed);
    Object.assign(peer, reopened);
  }
}

/** Replay identical original facts through distinct authenticated pairwise exchanges. */
export async function runIdentityReorderSchedules(root: string) {
  process.env.FOLIOLE_SIM_SCENARIO = 'identity-reorder-schedules';
  resetOperations();
  const peers = ['a', 'b', 'c', 'd'].map((name) => openPeer(root, name, 'reorder-schedules'));
  pairPeers(peers);
  const fixture: Fixture = { peers, servers: await Promise.all(peers.map(serve)), originals: [] };
  try {
    await seedOrders(fixture);
    const backups = await Promise.all(peers.map(async (peer) => {
      const file = `${peer.root}/original-orders.db`;
      await peer.sqlite.backup(file);
      return file;
    }));
    const schedules = [[[0, 1], [3, 2], [1, 2]], [[1, 2], [0, 1], [2, 3]]];
    let expected: ReturnType<typeof savedOrder>[] | undefined;
    for (const schedule of schedules) {
      await restoreInitialFiles(fixture, backups);
      for (const [source, target] of schedule) await exchange(fixture, source!, target!);
      await settle(fixture);
      peers.forEach(reopenPeer);
      const actual = assertOrders(fixture);
      if (expected) expect(actual).toEqual(expected);
      expected = actual;
    }
    await interleaveMembership(fixture);
    await collectAndRestore(fixture);
  } finally {
    await Promise.all(fixture.servers.map((server) => server.close()));
    peers.forEach((peer) => peer.sqlite.close());
  }
}

async function interleaveMembership(fixture: Fixture) {
  const b = fixture.peers[1]!;
  const c = fixture.peers[2]!;
  edit(b, 'later nested member', 'later-nested', { parentNodeId: 'folder' });
  edit(b, '1', 'nested-1', { parentNodeId: 'other-folder' });
  remove(b, 'nested-2');
  edit(c, 'later root member', 'later-root');
  inPeer(c, () => replaceNodeOrder(c.driver, ['folder', 'other-folder', 'later-root',
    'root-2', 'root-3', 'root-1', 'root-4', 'root-5',
    'nested-2', 'nested-3', 'nested-5', 'nested-4', 'nested-1']));
  await exchange(fixture, 1, 2);
  await settle(fixture);
  for (const peer of fixture.peers) {
    expect(new Set(savedOrder(peer, 'folder').order)).toEqual(new Set(['nested-3', 'nested-4', 'nested-5', 'later-nested']));
    expect(savedOrder(peer, ROOT_CHILD_ORDER_ID).order).toContain('later-root');
    expect(peer.sqlite.prepare("SELECT parent_id FROM nodes WHERE id = 'nested-1'").pluck().get())
      .toBe('other-folder');
    expect(peer.sqlite.prepare("SELECT deleted_at FROM nodes WHERE id = 'nested-2'").pluck().get())
      .toBeTruthy();
  }
}

async function collectAndRestore(fixture: Fixture) {
  const b = fixture.peers[1]!;
  const port = createBetterSqliteDbPort(b.sqlite);
  const ids = b.sqlite.prepare('SELECT id FROM nodes').pluck().all() as string[];
  const results = await inPeer(b, async () => {
    const collected = [];
    for (const id of ids) collected.push(await collectNodeVersionPayloads(port, id));
    return collected;
  });
  expect(results.some((result) => result.skipped === null)).toBe(true);
  reopenPeer(b);
  for (const parentId of parents) {
    const loser = selectDurableLoser(fixture, b, parentId);
    const page = await readParentOrderVersionPage(createBetterSqliteDbPort(b.sqlite), parentId);
    expect(page.versions.find((fact) => fact.versionId === loser.versionId))
      .toMatchObject({ order: loser.order });
    const before = savedOrder(b, parentId);
    expect(inPeer(b, () => restoreSavedParentOrder(b.driver, { parentId,
      versionId: loser.versionId, hostName: b.name, updatedAt: new Date().toISOString() }))).toBe(true);
    const restored = savedOrder(b, parentId);
    expect(restored.versionId).not.toBe(before.versionId);
    expect(restored.versionId).not.toBe(loser.versionId);
    expect(restored.order.filter((id) => loser.order.includes(id)))
      .toEqual(loser.order.filter((id) => before.order.includes(id)));
    expect(originalSnapshot(b, restored.versionId)).toMatchObject({ kind: 'user',
      parent_version_ids_json: JSON.stringify([before.versionId]) });
  }
  await exchange(fixture, 1, 2);
  await settle(fixture);
  fixture.peers.forEach(reopenPeer);
  for (const peer of fixture.peers) {
    expect(savedOrder(peer, 'folder')).toEqual(savedOrder(b, 'folder'));
    expect(new Set(savedOrder(peer, 'folder').order)).toEqual(new Set(['nested-3', 'nested-4', 'nested-5', 'later-nested']));
    expect(savedOrder(peer, ROOT_CHILD_ORDER_ID)).toEqual(savedOrder(b, ROOT_CHILD_ORDER_ID));
    expect(savedOrder(peer, ROOT_CHILD_ORDER_ID).order).toContain('later-root');
    expect(peer.sqlite.prepare("SELECT parent_id FROM nodes WHERE id = 'nested-1'").pluck().get())
      .toBe('other-folder');
    expect(peer.sqlite.prepare("SELECT deleted_at FROM nodes WHERE id = 'nested-2'").pluck().get())
      .toBeTruthy();
  }
}

function selectDurableLoser(fixture: Fixture, peer: SimulatorPeer, parentId: string) {
  const candidates = fixture.originals.map((facts) => facts.get(parentId)!)
    .sort((a, b) => a.versionId < b.versionId ? -1 : 1).slice(1);
  const current = savedOrder(peer, parentId).order;
  const loser = candidates.find((fact) => JSON.stringify(fact.order.filter((id) => current.includes(id)))
    !== JSON.stringify(current.filter((id) => fact.order.includes(id))));
  expect(loser, 'a saved losing user edit must still change the surviving members').toBeDefined();
  return loser!;
}
