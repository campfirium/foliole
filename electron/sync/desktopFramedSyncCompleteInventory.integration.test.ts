// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';

import { readFixtureInventory } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from './desktopFramedSyncTwoProcess.testSupport.js';

const costBatch = process.env.FOLIOLE_SYNC_COST_SAMPLES === '1';
const cases = costBatch
  ? Array.from({ length: 6 }, (_, sample) => [300, 1000, 10000].map(count => ({ count, sample }))).flat()
  : [1000, 4097, 10000].map(count => ({ count, sample: 0 }));
const costSchema = z.object({ pid: z.number(), startingRss: z.number(), peakRss: z.number(),
  endingRss: z.number(), sampleCount: z.number(), intervalMs: z.number(), aborted: z.number(),
  requests: z.array(z.object({ route: z.string(), durationMs: z.number(), receivedBytes: z.number(),
    sentBytes: z.number(), status: z.number(), overlapping: z.boolean() })) });

it.each(cases)('persists $count complete 8 KiB bodies, sample $sample, through peer reconciliation and restart', async ({ count, sample }) => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  let passed = false;
  let measuring = false;
  const report: Record<string, unknown> = { count, sample, warmup: costBatch && sample === 0,
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    cpus: os.cpus().length, loadBefore: os.loadavg(), startedAt: new Date().toISOString(),
    scope: 'Two independent Electron-as-Node processes, disk SQLite, real loopback HTTP, 8192-byte bodies',
    wireScope: 'Server sockets, both directions including HTTP headers; overlapping requests invalidate attribution',
    rssScope: 'Each child process sampled every 25ms and response finish; may miss shorter peaks; excludes parent test process' };
  try {
    expect(await fixture.left.invoke('seed_complete_inventory', { count }))
      .toEqual({ nodeCount: count, bodyBytes: 8192 });
    const before = await readFixtureInventory(fixture.left);
    const nodes = before.filter((entry) => entry.objectType === 'node');
    expect(nodes.filter(entry => entry.globalId.startsWith('t326-complete-'))).toHaveLength(count);
    expect(nodes.filter(entry => entry.globalId === 'special-inbox')).toHaveLength(1);
    expect(nodes).toHaveLength(count + 1);
    // Exercise the coordinator: a wall-budget yield must resume without another user/timer trigger.
    await fixture.left.invoke('activation_start');
    await fixture.left.invoke('activation_stop');
    await Promise.all([fixture.left.invoke('cost_start'), fixture.right.invoke('cost_start')]);
    measuring = true;
    const started = performance.now();
    const first = await fixture.left.invoke('round', { input: { kind: 'trigger_peer_sync',
      peer: { deviceId: fixture.rightSnapshot.deviceId, libraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch` },
      peerOrigin: fixture.rightSnapshot.origin } });
    const firstFinished = performance.now();
    await vi.waitFor(() => expect(readCompletion(fixture.leftSnapshot.databasePath)).toBe('completed'), { timeout: 30000 });
    const costs = (await Promise.all([fixture.left.invoke('cost_stop'), fixture.right.invoke('cost_stop')]))
      .map(value => costSchema.parse(value));
    measuring = false;
    Object.assign(report, { first, firstRoundMs: firstFinished - started,
      completedRoundMs: performance.now() - started, costs });
    expect(costs.every(cost => cost.aborted === 0 && cost.sampleCount > 0)).toBe(true);
    const requests = costs.flatMap(cost => cost.requests);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(request => !request.overlapping && request.status === 200)).toBe(true);
    await fs.mkdir('.tmp/artifacts', { recursive: true });
    await fs.writeFile(`.tmp/artifacts/t369-complete-inventory-${count}.json`, JSON.stringify({
      count, first, firstRoundMs: firstFinished - started, continuationMs: performance.now() - firstFinished
    }, null, 2));
    await verifyPersistentInventory(fixture, count);
    passed = true;
  } finally {
    if (measuring) report.incompleteCosts = await Promise.allSettled([
      fixture.left.invoke('cost_stop'), fixture.right.invoke('cost_stop')]);
    Object.assign(report, { passed, loadAfter: os.loadavg(), finishedAt: new Date().toISOString(),
      fixtureRoot: fixture.root });
    await fs.mkdir('.tmp/artifacts/t328-cost', { recursive: true });
    await fs.writeFile(`.tmp/artifacts/t328-cost/${count}-${sample}.json`, JSON.stringify(report, null, 2));
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

async function verifyPersistentInventory(
  fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>, count: number
) {
  for (const peer of [fixture.leftSnapshot, fixture.rightSnapshot]) {
    const db = new Database(peer.databasePath, { readonly: true });
    try { expect(db.prepare('SELECT article_id FROM attachment_parse_queue').all()).toEqual([]); }
    finally { db.close(); }
  }
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
}
