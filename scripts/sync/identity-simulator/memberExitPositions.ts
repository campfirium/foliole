import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { leaveDesktopSyncGroupDevice } from '../../../electron/database/syncGroupStore.js';
import { createSyncIdentitySourceView } from '../../../electron/database/syncIdentitySourceView.js';
import { uploadDesktopSyncIdentityPage } from '../../../electron/sync/desktopSyncIdentityPush.js';
import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { nodePositionFactId, type NodePositionPayload } from '../../../lib/core/sync/nodeVersionMemberPositionFact.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { buildSyncIdentityPackPage } from '../../../lib/core/sync/syncIdentityPackPage.js';

import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve } from './transport.js';

type SavedPosition = NodePositionPayload & { resolved_revision: number | null };
function position(peer: SimulatorPeer, owner: SimulatorPeer) {
  return peer.sqlite.prepare(`SELECT * FROM node_version_member_positions
    WHERE device_identity_key = ? AND object_id = 'topic'`).get(owner.id) as SavedPosition | undefined;
}
async function collect(peer: SimulatorPeer) {
  await inPeer(peer, () => collectNodeVersionPayloads(createBetterSqliteDbPort(peer.sqlite), 'topic'));
}

/** Frozen legitimate relays arrive after newer originals over the production authenticated pack route. */
export async function runIdentityMemberExitPositions(root: string) {
  const scenario = 'identity-member-exit-positions';
  process.env.FOLIOLE_SIM_SCENARIO = scenario;
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const peers = ['a', 'b', 'c'].map((name) => openPeer(root, name, scenario));
  const [a, b, c] = peers as [SimulatorPeer, SimulatorPeer, SimulatorPeer];
  pairPeers(peers);
  const servers = await Promise.all(peers.map((peer) => serve(peer)));
  const [sa, , sc] = servers as [Awaited<ReturnType<typeof serve>>, Awaited<ReturnType<typeof serve>>, Awaited<ReturnType<typeof serve>>];
  let old: Awaited<ReturnType<typeof createSyncIdentitySourceView>> | undefined;
  try {
    edit(a, 'first original');
    await inPeer(b, () => runDesktopSyncIdentityRound(route(sa, b)));
    const first = position(b, a)!;
    expect(first).toBeTruthy();
    old = await inPeer(b, () => createSyncIdentitySourceView(b.sqlite, `${b.root}/old-position-view.db`));
    edit(a, 'newer original');
    await inPeer(c, () => runDesktopSyncIdentityRound(route(sa, c)));
    const newest = position(c, a)!;
    expect(newest.proof_revision).toBeGreaterThan(first.proof_revision);
    for (const peer of [b, c]) inPeer(peer, () => leaveDesktopSyncGroupDevice(a.id, '2026-10-04T00:00:00.000Z'));
    expect(position(b, c)).toBeUndefined();
    await collect(b);
    expect(position(b, a)?.resolved_revision).toBeNull();
    await collect(c);
    expect(position(c, a)?.resolved_revision).toBeNull();
    await inPeer(b, () => runDesktopSyncIdentityRound(route(sc, b)));
    for (const peer of [b, c]) {
      await collect(peer);
      expect(position(peer, a)).toMatchObject({ proof_revision: newest.proof_revision,
        adopted_version_id: newest.adopted_version_id, resolved_revision: newest.proof_revision });
    }
    await replayOldOriginal(b, c, sc, old, first);
    reopenPeer(b); reopenPeer(c);
    for (const peer of [b, c]) expect(position(peer, a)).toMatchObject({
      proof_revision: newest.proof_revision, resolved_revision: newest.proof_revision });
    expect(sc.requests.filter((value) => value === '/companion/sync-identity-push').length).toBeGreaterThanOrEqual(2);
    await fs.writeFile(`${root}/result.json`, JSON.stringify({ first, newest,
      b: position(b, a), c: position(c, a), requests: servers.map((server) => server.requests) }, null, 2));
  } finally {
    old?.close();
    await Promise.all(servers.map((server) => server.close()));
    for (const peer of peers) peer.sqlite.close();
  }
}

async function replayOldOriginal(sender: SimulatorPeer, target: SimulatorPeer,
  endpoint: Awaited<ReturnType<typeof serve>>, view: Awaited<ReturnType<typeof createSyncIdentitySourceView>>,
  original: SavedPosition) {
  const id = nodePositionFactId(original);
  const entry = view.driver.queryOne<{ object_type: string; object_id: string; fingerprint: string }>(
    "SELECT object_type, object_id, fingerprint FROM sync_identity_index_rows WHERE object_type = 'node_position' AND object_id = ?", [id]);
  if (!entry) throw new Error('fixture_original_position_missing');
  const page = buildSyncIdentityPackPage({ group_id: 'group', source_peer_id: sender.id,
    target_peer_id: target.id, source_view_id: view.sourceViewId,
    page_index: 0, previous_page_id: null, objects: [entry] });
  const before = position(target, { ...sender, id: original.device_identity_key });
  const state = () => target.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type = 'node_position' AND object_id = ?").get(id);
  const beforeState = state();
  for (let index = 0; index < 2; index++) {
    await inPeer(sender, () => uploadDesktopSyncIdentityPage({ localViewPath: `${sender.root}/old-position-view.db`,
      page, peer: route(endpoint, sender) }));
    expect(position(target, { ...sender, id: original.device_identity_key })).toEqual(before);
    expect(state()).toEqual(beforeState);
  }
}
