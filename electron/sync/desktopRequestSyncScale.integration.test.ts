// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

type ScaleRequests = { source?: unknown; target?: unknown };
type FailurePeer = { diagnostics(): string };
type FailureFixture = { left: FailurePeer; right: FailurePeer; root: string;
  leftSnapshot: { origin: string }; rightSnapshot: { origin: string } };

it('measures an empty receiver pulling a 3800-node and 24000-state library over production HTTP', { meta: { calibratedMs: 20 * 60_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const output = path.resolve('.tmp/artifacts/t343-request-scale.json');
  let passed = false;
  const requests: ScaleRequests = {};
  const observed: Record<string, unknown> = {};
  try {
    const workload = await fixture.left.invoke('seed_request_scale');
    observed.workload = workload;
    const [{ snapshot: source }, { snapshot: target }] = await Promise.all([
      fixture.restartLeft(), fixture.restartRight()
    ]);
    const started = performance.now();
    const result = await fixture.right.invoke('round', { input: { kind: 'request_reconcile',
      peerOrigin: source.origin, peer: {
        deviceId: source.deviceId, libraryEpoch: `${source.deviceId}-epoch`
      } } });
    const elapsedMs = performance.now() - started;
    Object.assign(observed, { result, elapsedMs });
    requests.source = await fixture.left.invoke('request_counts');
    requests.target = await fixture.right.invoke('request_counts');
    const requestCount = Object.values(z.record(z.string(), z.number().int().nonnegative()).parse(requests.source)).reduce<number>((total, count) => total + Number(count), 0)
      + Object.values(z.record(z.string(), z.number().int().nonnegative()).parse(requests.target)).reduce<number>((total, count) => total + Number(count), 0);
    observed.requestCount = requestCount;
    await fixture.right.close();
    const db = new Database(target.databasePath, { readonly: true });
    try {
      const persisted = { nodes: db.prepare("SELECT count(*) FROM nodes WHERE id LIKE 't326-complete-%'").pluck().get(),
        states: db.prepare('SELECT count(*) FROM topic_daily_count_entries').pluck().get(),
        bodyBytes: db.prepare("SELECT sum(length(CAST(content AS BLOB))) FROM nodes WHERE id LIKE 't326-complete-%'").pluck().get() };
      observed.persisted = persisted;
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, JSON.stringify({ workload, elapsedMs, requestCount, requests, result, persisted, root: fixture.root }, null, 2));
      expect(result).toMatchObject({ complete: true });
      expect(requestCount).toBeLessThan(1000);
      expect(persisted).toEqual({ nodes: 3800, states: 24000, bodyBytes: 3800 * 8192 });
    } finally { db.close(); }
    passed = true;
  } catch (error) {
    await saveScaleFailure(output, error, fixture, requests, observed);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
    else console.info('Request scale fixture:', fixture.root);
  }
});

async function saveScaleFailure(output: string, error: unknown, fixture: FailureFixture, requests: ScaleRequests,
  observed: Record<string, unknown> = {}) {
  try {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify({ ...observed, error: String(error), requests,
      diagnostics: { source: fixture.left.diagnostics(), target: fixture.right.diagnostics() },
      origins: [fixture.leftSnapshot.origin, fixture.rightSnapshot.origin], root: fixture.root }, null, 2));
  } catch (reportError) {
    console.error('Could not write request scale failure evidence:', reportError);
  }
  throw error;
}

it('preserves the original failure and captured counts after the receiver has closed', async () => {
  const root = await fs.mkdtemp(path.resolve('.tmp/artifacts/T637-scale-failure-'));
  const original = new Error('original_scale_assertion');
  const requests = { source: { pulls: 60 }, target: {} };
  const observed = { result: { complete: false }, persisted: { nodes: 3800, states: 24000 } };
  let invocations = 0;
  const peer = { async invoke() { invocations++; throw new Error('fixture_unavailable'); }, diagnostics: () => 'closed receiver' };
  const output = path.join(root, 'failure.json');
  const fixture = { left: peer, right: peer, root,
    leftSnapshot: { origin: 'http://localhost:1' }, rightSnapshot: { origin: 'http://localhost:2' } };
  try {
    await expect(saveScaleFailure(output, original, fixture, requests, observed)).rejects.toBe(original);
    expect(invocations).toBe(0);
    expect(JSON.parse(await fs.readFile(output, 'utf8'))).toMatchObject({ error: String(original), requests, root, ...observed });
    await expect(saveScaleFailure(path.join(output, 'blocked'), original, fixture, requests)).rejects.toBe(original);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
