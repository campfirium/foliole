import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';
import { syncCompanionObjectsFromDesktop } from '../../../src/shared/platform/companionDesktopSyncObjects.js';

import { assertBody, convergenceState } from './assertions.js';
import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve, type Endpoint } from './transport.js';

function exchange(endpoint: Endpoint, mobile: SimulatorPeer) {
  return inPeer(mobile, () => syncCompanionObjectsFromDesktop(endpoint.origin, { includeResources: false }));
}

/** A later desktop edit must survive a committed companion push, restart, and retry. */
export async function runCompanionIdentityLostReply(root: string, replyLost: boolean) {
  process.env.FOLIOLE_SIM_SCENARIO = 'companion-identity-lost-reply';
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const a = openPeer(root, 'a', 'companion-lost-reply');
  const b = openPeer(root, 'b', 'companion-lost-reply');
  pairPeers([a, b]);
  const endpoint = await serve(a);
  try {
    edit(a, 'original body');
    await exchange(endpoint, b);
    edit(b, 'mobile body');
    if (replyLost) endpoint.loseResponse = '/companion/sync-identity-push';
    let laterVersion = '';
    endpoint.afterResponse = (request) => {
      if (new URL(request, endpoint.origin).pathname !== '/companion/sync-identity-push' || laterVersion) return;
      assertBody(a, 'mobile body');
      laterVersion = edit(a, 'later desktop body');
    };
    const first = inPeer(b, () => {
      const pending = syncCompanionObjectsFromDesktop(endpoint.origin, { includeResources: false });
      expect(syncCompanionObjectsFromDesktop(endpoint.origin, { includeResources: false })).toBe(pending);
      return pending;
    });
    if (replyLost) {
      await expect(first).rejects.toThrow();
      assertBody(a, 'mobile body');
      laterVersion = edit(a, 'later desktop body');
    } else await first;
    expect(laterVersion).not.toBe('');
    reopenPeer(a);
    reopenPeer(b);
    await exchange(endpoint, b);
    for (const peer of [a, b]) {
      assertBody(peer, 'later desktop body');
      expect(peer.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get()).toBe(laterVersion);
      expect(peer.sqlite.prepare("SELECT body_text FROM node_text_alternatives WHERE node_id = 'topic' AND status = 'available'").pluck().all()).toEqual([]);
    }
    expect(convergenceState(a)).toEqual(convergenceState(b));
  } finally {
    await endpoint.close();
    for (const peer of [a, b]) peer.sqlite.close();
  }
}

/** Resource continuation repairs reconstructible bytes without exchanging fresh structure. */
export async function runCompanionIdentityResourceContinuation(root: string) {
  process.env.FOLIOLE_SIM_SCENARIO = 'companion-identity-resource-continuation';
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const a = openPeer(root, 'a', 'companion-resources');
  const b = openPeer(root, 'b', 'companion-resources');
  pairPeers([a, b]);
  const endpoint = await serve(a);
  try {
    edit(a, 'retained body');
    await inPeer(b, () => runDesktopSyncIdentityRound(route(endpoint, b)));
    const hash = b.sqlite.prepare("SELECT body_blob_hash FROM nodes WHERE id = 'topic'").pluck().get() as string;
    b.sqlite.prepare('DELETE FROM content_blob_data WHERE hash = ?').run(hash);
    b.sqlite.prepare("UPDATE content_blobs SET availability = 'missing' WHERE hash = ?").run(hash);
    edit(a, 'new desktop structure', 'later-topic');
    const start = endpoint.requests.length;
    const result = await inPeer(b, () => syncCompanionObjectsFromDesktop(endpoint.origin, { resourcesOnly: true }));
    expect(result.appliedPackObjectCount).toBe(0);
    expect(result.remainingStructureChangeCount).toBeNull();
    expect(b.sqlite.prepare("SELECT 1 FROM nodes WHERE id = 'later-topic'").get()).toBeUndefined();
    expect(b.sqlite.prepare('SELECT CAST(data AS TEXT) FROM content_blob_data WHERE hash = ?').pluck().get(hash)).toBe('retained body');
    expect(endpoint.requests.slice(start).some(request => request.includes('sync-identity'))).toBe(false);
    reopenPeer(b);
    assertBody(b, 'retained body');
    expect(b.sqlite.prepare('SELECT CAST(data AS TEXT) FROM content_blob_data WHERE hash = ?').pluck().get(hash)).toBe('retained body');
  } finally {
    await endpoint.close();
    for (const peer of [a, b]) peer.sqlite.close();
  }
}
