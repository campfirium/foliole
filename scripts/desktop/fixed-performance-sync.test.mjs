// @vitest-environment node
import { Buffer } from 'node:buffer';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.ts';
import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.ts';
import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.ts';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.ts';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.ts';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.ts';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.ts';
import { createDesktopFramedSyncFiles } from '../../electron/sync/desktopFramedSyncFiles.ts';
import { REQUEST_SYNC_BATCH_OBJECTS } from '../../lib/core/sync/requestSyncBatchContract.ts';
import { receiveRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchReceiver.ts';
import { requestSyncBatchMessages, withRequestSyncBatchSnapshot } from '../../lib/core/sync/requestSyncBatchSnapshot.ts';
import { prepareRequestSyncWire } from '../../lib/core/sync/requestSyncWire.ts';
import fixtureModule from './fixed-performance-request-fixture.cjs';
import benchmark from './fixed-performance-sync.cjs';
import workload from './sync-pack-load-workload.cjs';

const services = { initialize: initializeDatabaseSchema, createDriver: createBetterSqlite3Driver,
  createPort: createBetterSqliteDbPort, flush: flushNodeSyncVersionWithDriver,
  inventory: readFramedSyncInventory, compare: compareFramedSyncInventories,
  createFiles: createDesktopFramedSyncFiles, batchObjects: REQUEST_SYNC_BATCH_OBJECTS,
  batchSnapshot: withRequestSyncBatchSnapshot, batchMessages: requestSyncBatchMessages,
  prepareWire: prepareRequestSyncWire, receiveBatch: receiveRequestSyncBatch,
  protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION };

test('applies real request versions and replays identical facts without changing the tree or original identities', async () => {
  const contexts = [];
  const fixture = await fixtureModule.prepareRequestFixture(130, { ...services,
    async prepareWire(input) {
      const wire = await prepareRequestSyncWire(input);
      contexts.push(Buffer.from(wire.contextId).toString('hex'));
      return wire;
    } });
  try {
    expect(fixture.db.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
    await fixture.apply(); fixture.assertResult();
    const versions = fixture.db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
    const nodes = fixture.db.prepare('SELECT * FROM nodes ORDER BY id').all();
    expect(versions).toHaveLength(130);
    expect(fixture.db.prepare("SELECT parent_id FROM nodes WHERE id='bench-24'").pluck().get()).toBe('bench-1');
    expect(fixture.db.prepare("SELECT count(*) FROM sync_object_state WHERE object_type = 'node_position'").pluck().get()).toBe(0);
    await fixture.apply(); fixture.assertResult();
    expect(contexts).toHaveLength(4);
    expect(new Set(contexts).size).toBe(4);
    expect(fixture.db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
    expect(fixture.db.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(nodes);
    expect(fixture.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('sync_pack_manifest', 'framed_sync_outbound_publications')").all()).toEqual([]);
  } finally { await fixture.close(); }
});

test.each(['new', 'existing'])('keeps first and unchanged measurements with the sustained %s request workload', async mode => {
  const report = await benchmark.runFixedSyncBenchmark({ nodeCount: 25, repeats: 2 }, services);
  expect(report.boundary).toContain('production request batch receive');
  for (const mode of ['first', 'unchanged']) {
    expect(report[mode]).toHaveLength(2);
    for (const sample of report[mode]) {
      expect(sample.nodeCount).toBe(25);
      expect(sample.durationMs).toBeGreaterThan(0);
      expect(sample.sqliteChangedRows).toBeGreaterThanOrEqual(0);
    }
  }
  const root = mkdtempSync(path.join(os.tmpdir(), 'request-performance-'));
  try {
    const markerPath = path.join(root, 'ready');
    const profilePath = path.join(root, 'apply.cpuprofile');
    const result = await workload.runSyncPackLoad({ markerPath, nodeCount: 25, blockMs: 0, mode, profilePath }, services);
    expect(JSON.parse(readFileSync(profilePath, 'utf8')).samples.length).toBeGreaterThan(0);
    expect(readFileSync(markerPath, 'utf8')).toBe('ready');
    expect(result.result).toMatchObject({ mode, nodeCount: 25, initialNodeCount: mode === 'new' ? 0 : 25 });
    expect(result.result.passes).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(2200);
    expect(result.endedAt - result.startedAt).toBe(result.durationMs);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30_000);
