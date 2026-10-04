import { expect } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { probeDesktopSyncIdentities } from '../../../electron/sync/desktopSyncIdentityProbe.js';
import { receiveDesktopSyncIdentityCandidatePages,
  runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';

import { openPeer, pairPeers } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve, type Endpoint } from './transport.js';

export type NodeFixture = { peers: SimulatorPeer[]; servers: Endpoint[] };
export async function createNodeFixture(root: string, names: string[]) {
  const peers = names.map((name) => openPeer(root, name, 'node-retention-http'));
  pairPeers(peers);
  return { peers, servers: await Promise.all(peers.map(serve)) };
}
export async function closeNodeFixture(fixture: NodeFixture) {
  await Promise.all(fixture.servers.map((server) => server.close()));
  fixture.peers.forEach((peer) => peer.sqlite.close());
}
export async function exchangeNodes(fixture: NodeFixture, source: number, target: number) {
  const peer = fixture.peers[target]!;
  return inPeer(peer, () => runDesktopSyncIdentityRound(route(fixture.servers[source]!, peer)));
}
export function currentNode(peer: SimulatorPeer) {
  return loadCurrentSyncNodeRecord(createBetterSqliteDbPort(peer.sqlite), 'topic');
}
export async function collectNode(peer: SimulatorPeer) {
  const result = await inPeer(peer, () =>
    collectNodeVersionPayloads(createBetterSqliteDbPort(peer.sqlite), 'topic'));
  expect(result.skipped).toBeNull();
  return result;
}
export async function independentNodeReceives(fixture: NodeFixture, left = 0, right = 1,
  afterFreeze?: () => Promise<unknown>) {
  const probe = (source: number, target: number) => {
    const peer = fixture.peers[target]!;
    return inPeer(peer, () => probeDesktopSyncIdentities({
      endpointUrl: fixture.servers[source]!.origin, groupId: 'group',
      localDatabase: peer.sqlite, localDeviceId: peer.id,
      outputRoot: peer.root, secret: Buffer.alloc(32, 7).toString('base64url') }));
  };
  const fromLeft = await probe(left, right);
  const fromRight = await probe(right, left);
  try {
    await afterFreeze?.();
    for (const [candidate, source, target] of [[fromLeft, left, right], [fromRight, right, left]] as const) {
      const peer = fixture.peers[target]!;
      await inPeer(peer, () => receiveDesktopSyncIdentityCandidatePages({
        candidate, peer: route(fixture.servers[source]!, peer) }));
    }
  } finally {
    await fromLeft.cleanup();
    await fromRight.cleanup();
  }
}
