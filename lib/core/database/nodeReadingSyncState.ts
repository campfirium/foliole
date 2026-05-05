import { randomUUID } from 'node:crypto';

import type { DatabaseBindParams, DatabaseDriver, DatabaseRow } from './driver.js';
import { appendSyncChangeLog, computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

export interface NodeReadingSyncPayload {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: 'active' | 'done' | 'dismissed';
}

export interface WriteNodeReadingSyncInput {
  nodeId: string;
  deviceId?: string;
  reading?: NodeReadingSyncPayload | null;
  updatedAt: string;
}

interface ExistingNodeReadingRow extends DatabaseRow {
  node_id: string;
}

function hasExistingNodeReading(driver: DatabaseDriver, nodeId: string) {
  return Boolean(
    driver.queryOne<ExistingNodeReadingRow>('SELECT node_id FROM node_reading WHERE node_id = ?', [nodeId])
  );
}

function toNodeReadingHash(nodeId: string, reading: NodeReadingSyncPayload) {
  return computeSyncContentHash('node_reading', toNodeReadingPayload(nodeId, reading));
}

function toNodeReadingPayload(nodeId: string, reading: NodeReadingSyncPayload) {
  return {
    intervalDurationMs: reading.intervalDurationMs,
    intervalGrowthFactor: reading.intervalGrowthFactor,
    lastHandledAt: reading.lastHandledAt,
    nextAt: reading.nextAt,
    nodeId,
    priority: reading.priority,
    readingPosition: reading.readingPosition,
    repetitionCount: reading.repetitionCount,
    state: reading.state
  };
}

function toNodeReadingTombstoneHash(nodeId: string, deletedAt: string) {
  return computeSyncContentHash('node_reading', {
    deletedAt,
    nodeId,
    objectType: 'node_reading'
  });
}

function recordNodeReadingTombstone(driver: DatabaseDriver, input: WriteNodeReadingSyncInput & { deviceId: string }) {
  const contentHash = toNodeReadingTombstoneHash(input.nodeId, input.updatedAt);
  upsertSyncObjectState(driver, {
    objectType: 'node_reading',
    objectId: input.nodeId,
    contentHash,
    deletedAt: input.updatedAt,
    lastModifiedByDeviceId: input.deviceId,
    updatedAt: input.updatedAt,
    syncDirty: true
  });
  appendSyncChangeLog(driver, {
    changeId: randomUUID(),
    objectType: 'node_reading',
    objectId: input.nodeId,
    changeType: 'delete',
    deviceId: input.deviceId,
    contentHash,
    payloadJson: JSON.stringify({ nodeId: input.nodeId }),
    createdAt: input.updatedAt,
    appliedAt: input.updatedAt
  });
}

function recordNodeReadingUpsert(
  driver: DatabaseDriver,
  input: WriteNodeReadingSyncInput & { deviceId: string; reading: NodeReadingSyncPayload }
) {
  const contentHash = toNodeReadingHash(input.nodeId, input.reading);
  upsertSyncObjectState(driver, {
    objectType: 'node_reading',
    objectId: input.nodeId,
    contentHash,
    lastModifiedByDeviceId: input.deviceId,
    updatedAt: input.updatedAt,
    syncDirty: true
  });
  appendSyncChangeLog(driver, {
    changeId: randomUUID(),
    objectType: 'node_reading',
    objectId: input.nodeId,
    changeType: 'upsert',
    deviceId: input.deviceId,
    contentHash,
    payloadJson: JSON.stringify(toNodeReadingPayload(input.nodeId, input.reading)),
    createdAt: input.updatedAt,
    appliedAt: input.updatedAt
  });
}

export function writeNodeReadingSnapshotWithSync(
  driver: DatabaseDriver,
  input: WriteNodeReadingSyncInput,
  runUpsert: (params?: DatabaseBindParams) => void,
  runDelete: (params?: DatabaseBindParams) => void
) {
  const existed = hasExistingNodeReading(driver, input.nodeId);
  if (!input.reading) {
    runDelete([input.nodeId]);
    if (existed && input.deviceId) {
      recordNodeReadingTombstone(driver, { ...input, deviceId: input.deviceId });
    }
    return;
  }

  runUpsert([
    input.nodeId,
    input.reading.intervalDurationMs,
    input.reading.intervalGrowthFactor,
    input.reading.lastHandledAt,
    input.reading.nextAt,
    input.reading.priority,
    input.reading.readingPosition,
    input.reading.repetitionCount,
    input.reading.state
  ]);
  if (input.deviceId) {
    recordNodeReadingUpsert(driver, { ...input, deviceId: input.deviceId, reading: input.reading });
  }
}
