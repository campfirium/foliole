// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import type { DesktopFramedSyncFixtureProcess, DesktopFramedSyncFixtureSnapshot }
  from './desktopFramedSyncTwoProcess.testSupport.js';

const nodeId = 't326-complete-00000';
const content = 'Three peers retain this changed body 中文😀';
// 7.2 bounds inventory entries and edit traffic, not body transfer; small bodies keep the 30000-node relay affordable.
const bodyBytes = 256;
const costsSchema = z.object({ aborted: z.number(), requests: z.array(z.object({
  receivedBytes: z.number(), sentBytes: z.number(), status: z.number(), overlapping: z.boolean()
})) });

// The 30000-node plan scale takes about 13 minutes locally, so it runs on request; hosted runs keep the same contract at 5x.
const fullScale = process.env.FOLIOLE_SYNC_THREE_PEER_SCALE === '1';
const [smallCount, largeCount] = fullScale ? [5150, 30000] : [1000, 5150];

it(`relays one edit across three persistent peers without library-sized wire growth at ${largeCount} nodes`, async () => {
  const small = await measureScale(smallCount);
  const large = await measureScale(largeCount);
  // The library grows at least fivefold; doubling traffic already rejects linear growth.
  expect(large.bytes).toBeLessThan(small.bytes * 2);
}, fullScale ? 1_800_000 : 600_000);

async function measureScale(count: number) {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const third = await fixture.startThird();
  const peers = [fixture.left, fixture.right, third.process];
  const snapshots = [fixture.leftSnapshot, fixture.rightSnapshot, third.snapshot];
  let passed = false;
  try {
    await Promise.all(peers.map(peer => peer.invoke('register_order_member', { deviceId: third.snapshot.deviceId })));
    await reconnectFixturePeer(fixture.right, third.snapshot);
    const started = performance.now();
    const phase = (name: string) => console.info(`[three-peer-scale] ${count} ${name} ${Math.round(performance.now() - started)}ms`);
    await fixture.left.invoke('seed_complete_inventory', { count, bodyBytes });
    phase('seeded');
    await populatePeer(fixture.left, fixture.leftSnapshot, fixture.rightSnapshot, count);
    phase('first hop');
    await populatePeer(fixture.right, fixture.rightSnapshot, third.snapshot, count);
    phase('second hop');
    await assertInventories(peers, count);
    await third.process.seed({ nodeId, content, title: 'Three peer scale edit' });
    await Promise.all(peers.map(peer => peer.invoke('cost_start')));
    expect(await reconnectFixturePeer(third.process, fixture.rightSnapshot)).toMatchObject({ complete: true });
    expect(await reconnectFixturePeer(fixture.right, fixture.leftSnapshot)).toMatchObject({ complete: true });
    const costs = (await Promise.all(peers.map(peer => peer.invoke('cost_stop')))).map(value => costsSchema.parse(value));
    const requests = costs.flatMap(cost => cost.requests);
    expect(costs.every(cost => cost.aborted === 0)).toBe(true);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(request => request.status === 200 && !request.overlapping)).toBe(true);
    phase('edit relayed');
    const bytes = requests.reduce((sum, request) => sum + request.receivedBytes + request.sentBytes, 0);
    for (const snapshot of snapshots) assertPersisted(snapshot, count);
    await assertInventories(peers, count);
    expect(await reconnectFixturePeer(fixture.left, third.snapshot)).toMatchObject({ complete: true });
    await assertInventories(peers, count);
    await fs.mkdir('.tmp/artifacts/s358-three-peer-scale', { recursive: true });
    await fs.writeFile(`.tmp/artifacts/s358-three-peer-scale/${count}.json`, JSON.stringify({
      count, bodyBytes, bytes, costs, scope: 'Three independent processes, disk SQLite, production HTTP; server socket bytes including headers',
      pids: snapshots.map(snapshot => snapshot.pid)
    }, null, 2));
    passed = true;
    return { count, bytes };
  } finally {
    await Promise.allSettled(peers.map(peer => peer.close()));
    if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
    else console.info('Three peer scale fixture retained:', fixture.root);
  }
}

async function populatePeer(source: DesktopFramedSyncFixtureProcess,
  sourceSnapshot: DesktopFramedSyncFixtureSnapshot, target: DesktopFramedSyncFixtureSnapshot, count: number) {
  await source.invoke('activation_start');
  await source.invoke('activation_stop');
  await source.invoke('round', { input: { kind: 'trigger_peer_sync',
    peer: { deviceId: target.deviceId, libraryEpoch: `${target.deviceId}-epoch` }, peerOrigin: target.origin } });
  await vi.waitFor(() => {
    const db = new Database(target.databasePath, { readonly: true });
    try {
      expect(db.prepare("SELECT count(*) FROM nodes WHERE id LIKE 't326-complete-%'").pluck().get()).toBe(count);
    } finally { db.close(); }
    const sourceDb = new Database(sourceSnapshot.databasePath, { readonly: true });
    try {
      expect(sourceDb.prepare("SELECT json_extract(value, '$.status') FROM settings WHERE key = 'sync_group_last_trigger_result'")
        .pluck().get()).toBe('completed');
    } finally { sourceDb.close(); }
  }, { timeout: 180_000, interval: 250 });
  expect(await reconnectFixturePeer(source, target)).toMatchObject({ complete: true });
}

async function assertInventories(peers: DesktopFramedSyncFixtureProcess[], count: number) {
  const inventories = await Promise.all(peers.map(readFixtureInventory));
  for (const inventory of inventories) {
    expect(inventory.filter(entry => entry.objectType === 'node')).toHaveLength(count + 1);
    expect(inventory.some(entry => ['node_position', 'pdf_page_text'].includes(entry.objectType))).toBe(false);
    for (const other of inventories) {
      expect(compareFramedSyncDatabaseInventories({ local: inventory, remote: other })).toEqual([]);
    }
  }
}

function assertPersisted(snapshot: DesktopFramedSyncFixtureSnapshot, count: number) {
  const db = new Database(snapshot.databasePath, { readonly: true });
  try {
    expect(db.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe(content);
    expect(db.prepare("SELECT count(*) FROM nodes WHERE id LIKE 't326-complete-%'").pluck().get()).toBe(count);
    expect(db.prepare("SELECT count(*) FROM nodes WHERE id LIKE 't326-complete-%' AND id <> ? AND length(CAST(content AS BLOB)) = ?")
      .pluck().get(nodeId, bodyBytes)).toBe(count - 1);
  } finally { db.close(); }
}
