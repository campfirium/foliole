// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('measures an empty receiver pulling a 3800-node and 24000-state library over production HTTP', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const output = path.resolve('.tmp/artifacts/t343-request-scale.json');
  let passed = false;
  try {
    const workload = await fixture.left.invoke('seed_request_scale');
    const [{ snapshot: source }, { snapshot: target }] = await Promise.all([
      fixture.restartLeft(), fixture.restartRight()
    ]);
    const started = performance.now();
    const result = await fixture.right.invoke('round', { input: { kind: 'request_reconcile',
      peerOrigin: source.origin, peer: {
        deviceId: source.deviceId, libraryEpoch: `${source.deviceId}-epoch`
      } } });
    const elapsedMs = performance.now() - started;
    const requests = { source: await fixture.left.invoke('request_counts'), target: await fixture.right.invoke('request_counts') };
    await fixture.right.close();
    const db = new Database(target.databasePath, { readonly: true });
    try {
      const persisted = { nodes: db.prepare("SELECT count(*) FROM nodes WHERE id LIKE 't326-complete-%'").pluck().get(),
        states: db.prepare('SELECT count(*) FROM topic_daily_count_entries').pluck().get(),
        bodyBytes: db.prepare("SELECT sum(length(CAST(content AS BLOB))) FROM nodes WHERE id LIKE 't326-complete-%'").pluck().get() };
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, JSON.stringify({ workload, elapsedMs, requests, result, persisted, root: fixture.root }, null, 2));
      expect(result).toMatchObject({ complete: true });
      expect(persisted).toEqual({ nodes: 3800, states: 24000, bodyBytes: 3800 * 8192 });
    } finally { db.close(); }
    passed = true;
  } catch (error) {
    const requests = { source: await fixture.left.invoke('request_counts'), target: await fixture.right.invoke('request_counts') };
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify({ error: String(error), requests, diagnostics: { source: fixture.left.diagnostics(), target: fixture.right.diagnostics() }, origins: [fixture.leftSnapshot.origin, fixture.rightSnapshot.origin], root: fixture.root }, null, 2));
    throw error;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
    else console.info('Request scale fixture:', fixture.root);
  }
}, 20 * 60_000);
