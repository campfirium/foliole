import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { runDesktopSyncIdentityRestoreRound } from '../../../electron/sync/desktopSyncIdentityRestoreRound.js';
import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { loadNodeBodyResolution } from '../../../lib/core/database/nodeBodyResolution.js';

import { assertBody, assertHealthy } from './assertions.js';
import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve } from './transport.js';

function originalVersions(peer: SimulatorPeer) {
  return peer.sqlite.prepare(`SELECT version_id, object_id, parent_version_id, host_name,
    created_at, content_hash, body_text, snapshot_json FROM node_sync_versions ORDER BY version_id`).all();
}

function assertGiantParentBody(peer: SimulatorPeer, content: string) {
  expect(peer.sqlite.prepare("SELECT content FROM nodes WHERE id = 'z-parent'").get())
    .toEqual({ content: '' });
  const resolution = loadNodeBodyResolution(peer.driver, 'z-parent');
  expect(resolution?.status).toBe('resolved');
  if (resolution?.status !== 'resolved') throw new Error('giant_parent_body_unavailable');
  expect(resolution.source).toBe('blob');
  expect(resolution.content === content).toBe(true);
  assertBody(peer, content, 'z-parent');
}

function seedRestore(a: SimulatorPeer, b: SimulatorPeer) {
  edit(b, 'previous library', 'target-only');
  for (const peer of [a, b]) peer.sqlite.prepare(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES ('giant-parent-restore', 'group', '2026-10-04T00:00:00.000Z', ?, ?, 'now')`)
    .run(a.id, peer === a ? 'now' : null);
}

/** The child sorts before its giant parent, so global object order cannot replace structural fact staging. */
export async function runIdentityGiantParent(root: string, mode: 'download' | 'upload' | 'restore') {
  const scenario = `identity-giant-parent-${mode}`;
  process.env.FOLIOLE_SIM_SCENARIO = scenario;
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const a = openPeer(root, 'a', scenario);
  const b = openPeer(root, 'b', scenario);
  const peers = [a, b];
  pairPeers(peers);
  const origin = mode === 'upload' ? b : a;
  const receiver = mode === 'upload' ? a : b;
  const body = '中😀'.repeat(900_000);
  edit(origin, body, 'z-parent', { kind: 'folder', title: 'Giant parent' });
  edit(origin, 'small child body', 'a-child', { parentNodeId: 'z-parent' });
  const expected = originalVersions(origin);
  if (mode === 'restore') seedRestore(a, b);
  const endpoint = await serve(a);
  const execute = () => inPeer(b, () => mode === 'restore'
    ? runDesktopSyncIdentityRestoreRound(route(endpoint, b), 'giant-parent-restore')
    : runDesktopSyncIdentityRound(route(endpoint, b)));
  try {
    let armed = false;
    if (mode === 'restore') endpoint.interrupt = { path: '/companion/sync-identity-pack', remaining: 10 };
    else endpoint.afterResponse = () => {
      if (armed || !receiver.sqlite.prepare('SELECT COUNT(*) FROM sync_identity_fact_staging').pluck().get()) return;
      armed = true;
      endpoint.interrupt = { path: mode === 'upload' ? '/companion/sync-identity-push' :
        '/companion/sync-identity-pack', remaining: 1 };
    };
    await expect(execute()).rejects.toThrow();
    expect(endpoint.interrupt).toBeNull();
    endpoint.afterResponse = undefined;
    expect(receiver.sqlite.prepare("SELECT id FROM nodes WHERE id = 'a-child'").get()).toBeUndefined();
    expect(receiver.sqlite.prepare("SELECT id FROM nodes WHERE id = 'z-parent'").get()).toBeUndefined();
    if (mode === 'restore') assertBody(receiver, 'previous library', 'target-only');
    reopenPeer(a);
    reopenPeer(b);
    const result = await execute();
    if ('verifiedCandidateCount' in result) expect(result.verifiedCandidateCount).toBe(0);
    else expect(result.applied).toBe(true);
    expect(originalVersions(receiver)).toEqual(expected);
    assertGiantParentBody(receiver, body);
    assertBody(receiver, 'small child body', 'a-child');
    expect(receiver.sqlite.prepare("SELECT parent_id FROM nodes WHERE id = 'a-child'").get())
      .toEqual({ parent_id: 'z-parent' });
    reopenPeer(receiver);
    expect(originalVersions(receiver)).toEqual(expected);
    assertGiantParentBody(receiver, body);
    if (mode === 'restore') expect(receiver.sqlite.prepare("SELECT id FROM nodes WHERE id = 'target-only'").get()).toBeUndefined();
    peers.forEach((peer) => assertHealthy(peer, []));
  } finally {
    await endpoint.close();
    for (const peer of peers) peer.sqlite.close();
  }
}
