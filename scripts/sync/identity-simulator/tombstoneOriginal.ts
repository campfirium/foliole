import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { createSyncIdentitySourceView } from '../../../electron/database/syncIdentitySourceView.js';
import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { deleteNodesPermanently } from '../../../lib/core/database/nodePermanentDeleteMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../../lib/core/database/workspaceSearchSidecar.js';
import { readSyncIdentityNodeFactGlobalPage } from '../../../lib/core/sync/syncIdentityNodeFactGlobalRead.js';

import { assertHealthy } from './assertions.js';
import { edit, remove, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve } from './transport.js';

function originalVersion(peer: SimulatorPeer, versionId: string) {
  return peer.sqlite.prepare(`SELECT version_id, object_id, parent_version_id, host_name,
    created_at, content_hash, body_text, snapshot_json FROM node_sync_versions WHERE version_id = ?`).get(versionId);
}

function loseOriginal(peer: SimulatorPeer, versionId: string) {
  // Simulate lost persisted immutable facts, preserving the real tombstone and its original reference.
  peer.sqlite.pragma('foreign_keys = OFF');
  try { expect(peer.sqlite.prepare('DELETE FROM node_sync_versions WHERE version_id = ?').run(versionId).changes).toBe(1); }
  finally { peer.sqlite.pragma('foreign_keys = ON'); }
}

async function assertRepairRequired(peer: SimulatorPeer) {
  return inPeer(peer, async () => {
    const view = await createSyncIdentitySourceView(peer.sqlite, `${peer.root}/missing-original-view.db`);
    try {
      const page = await readSyncIdentityNodeFactGlobalPage(view.port, null);
      expect(page.entries.find((entry) => entry.object_id === 'topic'))
        .toMatchObject({ repair_required: true });
      return view.driver.queryOne<{ digest: string }>(
        "SELECT digest FROM sync_identity_node_facts WHERE node_id = 'topic'")?.digest;
    } finally { view.close(); }
  });
}

/** Losing one original can be repaired from its holder; matching incomplete histories never prove completion. */
export async function runIdentityTombstoneOriginal(root: string, bothMissing: boolean) {
  const scenario = `identity-tombstone-original-${bothMissing ? 'both' : 'one'}`;
  process.env.FOLIOLE_SIM_SCENARIO = scenario;
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const a = openPeer(root, 'a', scenario);
  const b = openPeer(root, 'b', scenario);
  const peers = [a, b];
  pairPeers(peers);
  const endpoint = await serve(a);
  try {
    edit(a, 'original content before deletion');
    remove(a);
    inPeer(a, () => {
      const deletedAt = a.sqlite.prepare("SELECT deleted_at FROM nodes WHERE id = 'topic'").pluck().get();
      if (typeof deletedAt !== 'string') throw new Error('fixture_deletion_missing');
      initializeWorkspaceSearchSidecar(a);
      deleteNodesPermanently(a.driver, { nodeIds: ['topic'], nodeOrder: [], deletedAt });
    });
    const versionId = a.sqlite.prepare("SELECT version_id FROM node_sync_tombstones WHERE node_id = 'topic'").pluck().get();
    if (typeof versionId !== 'string') throw new Error('fixture_tombstone_original_missing');
    await inPeer(b, () => runDesktopSyncIdentityRound(route(endpoint, b)));
    const original = originalVersion(a, versionId);
    expect(original).toBeTruthy();
    expect(originalVersion(b, versionId)).toEqual(original);
    const tombstone = b.sqlite.prepare("SELECT * FROM node_sync_tombstones WHERE node_id = 'topic'").get();
    expect(tombstone).toBeTruthy();
    loseOriginal(b, versionId);
    if (bothMissing) loseOriginal(a, versionId);
    reopenPeer(a);
    reopenPeer(b);
    const receiverFacts = await assertRepairRequired(b);
    if (bothMissing) {
      expect(await assertRepairRequired(a)).toBe(receiverFacts);
      const state = (peer: SimulatorPeer) => peer.sqlite.prepare(`SELECT content_hash,
        current_version_id, deleted_at FROM sync_object_state WHERE object_type = 'node' AND object_id = 'topic'`).get();
      expect(state(b)).toEqual(state(a));
      await expect(inPeer(b, () => runDesktopSyncIdentityRound(route(endpoint, b)))).rejects.toThrow();
      await expect(inPeer(b, () => runDesktopSyncIdentityRound(route(endpoint, b)))).rejects.toThrow();
      expect(originalVersion(a, versionId)).toBeUndefined();
      expect(originalVersion(b, versionId)).toBeUndefined();
      expect(b.sqlite.prepare("SELECT * FROM node_sync_tombstones WHERE node_id = 'topic'").get()).toEqual(tombstone);
      return;
    }
    const repaired = await inPeer(b, () => runDesktopSyncIdentityRound(route(endpoint, b)));
    expect(repaired.verifiedCandidateCount).toBe(0);
    expect(originalVersion(b, versionId)).toEqual(original);
    expect(b.sqlite.prepare("SELECT * FROM node_sync_tombstones WHERE node_id = 'topic'").get()).toEqual(tombstone);
    reopenPeer(b);
    expect(originalVersion(b, versionId)).toEqual(original);
    peers.forEach((peer) => assertHealthy(peer, []));
  } finally {
    await endpoint.close();
    for (const peer of peers) peer.sqlite.close();
  }
}
