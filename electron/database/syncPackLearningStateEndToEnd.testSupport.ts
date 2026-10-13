import { expect } from 'vitest';

import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

export function seedReading(peer: RestorePeer, id: string, parentId: string | null = null) {
  const driver = createBetterSqlite3Driver(peer.sqlite);
  const title = parentId ? 'Hidden Child' : 'Reading Topic';
  const handledAt = parentId ? '2026-05-06T10:16:00.000Z' : '2026-05-06T09:05:00.000Z';
  const nextAt = parentId ? '2026-05-07T10:16:00.000Z' : '2026-05-07T09:05:00.000Z';
  peer.sqlite.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES (?, ?, 'topic', ?, '', '2026-05-06T09:00:00.000Z', '2026-05-06T09:00:00.000Z')`).run(id, parentId, title);
  flushNodeSyncVersionWithDriver(driver, id, 'desktop-source', '2026-05-06T09:00:00.000Z', `${id}-version`);
  saveNodeReadingStateWithSync(driver, { nodeId: id, hostName: 'desktop-source', updatedAt: handledAt,
    reading: { intervalDurationMs: 120000, intervalGrowthFactor: 1.5, lastHandledAt: handledAt, nextAt,
      priority: 0.75, readingPosition: 0, repetitionCount: 2, state: 'active' } });
  return { node_id: id, interval_duration_ms: 120000, interval_growth_factor: 1.5,
    last_handled_at: handledAt, next_at: nextAt, priority: 0.75, repetition_count: 2, state: 'active' };
}

export function reading(peer: RestorePeer, id: string) {
  return peer.sqlite.prepare(`SELECT node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
    next_at, priority, repetition_count, state FROM node_reading WHERE node_id = ?`).get(id);
}

export async function sendReadingNode(source: RestorePeer, target: RestorePeer, id: string) {
  const local = await readRequestSyncInventorySnapshot(source.db);
  const difference = compareFramedSyncInventories({ local, remote: [] })
    .find(value => value.objectType === 'node' && value.globalId === id);
  expect(difference).toBeDefined();
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference!);
}
