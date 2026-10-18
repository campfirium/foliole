// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';

import { readFixtureInventory } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from './desktopFramedSyncTwoProcess.testSupport.js';

it.each([1000, 10000])('persists %i complete 8 KiB bodies through peer reconciliation and restart', async (count) => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  let passed = false;
  try {
    expect(await fixture.left.invoke('seed_complete_inventory', { count }))
      .toEqual({ nodeCount: count, bodyBytes: 8192 });
    const before = await readFixtureInventory(fixture.left);
    expect(before.filter((entry) => entry.objectType === 'node')).toHaveLength(count);
    // Exercise the coordinator: a wall-budget yield must resume without another user/timer trigger.
    await fixture.left.invoke('activation_start');
    await fixture.left.invoke('activation_stop');
    const started = performance.now();
    const first = await fixture.left.invoke('round', { input: { kind: 'trigger_peer_sync',
      peer: { deviceId: fixture.rightSnapshot.deviceId, libraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch` },
      peerOrigin: fixture.rightSnapshot.origin } });
    const firstFinished = performance.now();
    await vi.waitFor(() => expect(readCompletion(fixture.leftSnapshot.databasePath)).toBe('completed'), { timeout: 30000 });
    for (const peer of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      const db = new Database(peer.databasePath, { readonly: true });
      try { expect(db.prepare('SELECT article_id FROM attachment_parse_queue').all()).toEqual([]); }
      finally { db.close(); }
    }
    await fs.writeFile(`.tmp/artifacts/t369-complete-inventory-${count}.json`, JSON.stringify({
      count, first, firstRoundMs: firstFinished - started, continuationMs: performance.now() - firstFinished
    }, null, 2));
    expect(compareFramedSyncInventories({ local: await readFixtureInventory(fixture.left),
      remote: await readFixtureInventory(fixture.right) })).toEqual([]);
    const source = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
    const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
    expect(received.nodes).toEqual(source.nodes);
    expect(received.versions).toEqual(source.versions);
    expect(received.nodes).toHaveLength(count);
    expect(received.nodes.every(node => {
      if (!node || typeof node !== 'object' || !('content' in node)) return false;
      return typeof node.content === 'string' && Buffer.byteLength(node.content) === 8192;
    })).toBe(true);
    expect(source.framedSync.outboundHolds).toBe(0);
    const restarted = await fixture.restartRight();
    expect(restarted.snapshot.pid).not.toBe(fixture.rightSnapshot.pid);
    const reopened = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
    expect(reopened.nodes).toEqual(source.nodes);
    expect(reopened.versions).toEqual(source.versions);
    passed = true;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 2_700_000);

function readCompletion(databasePath: string) {
  const db = new Database(databasePath, { readonly: true });
  try {
    return db.prepare("SELECT json_extract(value, '$.status') FROM settings WHERE key = 'sync_group_last_trigger_result'").pluck().get();
  } finally { db.close(); }
}
