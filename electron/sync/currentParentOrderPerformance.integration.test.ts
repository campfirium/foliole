// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { buildDesktopFramedSyncFixture, createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { createDesktopFramedSyncFaultProxy } from './desktopFramedSyncTwoProcessFaultProxy.js';

function storage(databasePath: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const tables = ['parent_child_order', 'parent_order_versions', 'parent_order_sources',
      'node_version_member_positions', 'sync_object_state'];
    const bytes = db.prepare(`SELECT name, SUM(pgsize) bytes FROM dbstat
      WHERE name IN (${tables.map(() => '?').join(',')}) GROUP BY name`).all(...tables);
    const orders = db.prepare('SELECT parent_id, child_ids_json FROM parent_child_order ORDER BY parent_id').all();
    return { bytes, orders };
  } finally { db.close(); }
}

it('measures saved parent edits through the authenticated production round in two processes', async () => {
  const count = Number(process.env.FOLIOLE_ORDER_PERFORMANCE_COUNT ?? 200);
  const rounds = Number(process.env.FOLIOLE_ORDER_PERFORMANCE_ROUNDS ?? 1);
  const output = path.resolve(process.env.FOLIOLE_ORDER_PERFORMANCE_OUTPUT ??
    `.tmp/artifacts/t340-order-performance/smoke-${Date.now()}`);
  await fs.mkdir(output, { recursive: true });
  const script = process.env.FOLIOLE_ORDER_PERFORMANCE_SCRIPT ?? path.join(output, 'production-fixture.mjs');
  if (!process.env.FOLIOLE_ORDER_PERFORMANCE_SCRIPT) await buildDesktopFramedSyncFixture(script);
  const reports: unknown[] = [];
  for (const kind of ['topics', 'items']) {
    const fixture = await createDesktopFramedSyncTwoProcessFixture(script, true, true);
    await fs.writeFile(path.join(output, `${kind}-fixture.json`), JSON.stringify({
      root: fixture.root, left: fixture.leftSnapshot.databasePath, right: fixture.rightSnapshot.databasePath,
      pids: [fixture.leftSnapshot.pid, fixture.rightSnapshot.pid]
    }, null, 2));
    const proxy = await createDesktopFramedSyncFaultProxy({ fault: 'observe', targetOrigin: fixture.rightSnapshot.origin });
    const input = { kind: 'request_reconcile', peer: { deviceId: fixture.rightSnapshot.deviceId, libraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch` },
      peerOrigin: proxy.origin };
    try {
      expect(fixture.leftSnapshot.pid).not.toBe(fixture.rightSnapshot.pid);
      console.info(`${kind}: seeding ${count} nodes`);
      await fixture.left.invoke('seed_parent_order_performance', { count, kind });
      console.info(`${kind}: initial production synchronization`);
      expect(await fixture.left.invoke('round', { input })).toMatchObject({ complete: true });
      for (let round = 0; round < rounds; round += 1) {
        for (const workload of round % 2 ? ['many', 'single'] : ['single', 'many']) {
          const edit = await fixture.left.invoke('edit_parent_order_performance', { count, kind, workload });
          const before = proxy.wireBytes();
          const started = performance.now();
          const result = await fixture.left.invoke('round', { input });
          const durationMs = performance.now() - started;
          expect(result).toMatchObject({ complete: true });
          const after = proxy.wireBytes();
          const left = storage(fixture.leftSnapshot.databasePath);
          const right = storage(fixture.rightSnapshot.databasePath);
          expect(right.orders).toEqual(left.orders);
          reports.push({ count, kind, round, workload, edit, durationMs, result,
            sessionBytes: after.sessionBytes - before.sessionBytes,
            transferBytes: after.transferBytes - before.transferBytes,
            storage: { left: left.bytes, right: right.bytes } });
          await fs.writeFile(path.join(output, 'measurements.json'), JSON.stringify(reports, null, 2));
          console.info(`${kind}: ${workload} round ${round + 1} complete`);
        }
      }
      await fs.writeFile(path.join(output, `${kind}-fixture.json`), JSON.stringify({
        root: fixture.root, left: fixture.leftSnapshot.databasePath, right: fixture.rightSnapshot.databasePath,
        pids: [fixture.leftSnapshot.pid, fixture.rightSnapshot.pid]
      }, null, 2));
    } finally {
      await proxy.close();
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    }
  }
}, 3_600_000);
