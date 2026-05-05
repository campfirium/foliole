import type { DatabaseBindParams, DatabaseDriver, DatabaseRow } from './driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

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
    interval_duration_ms: reading.intervalDurationMs,
    interval_growth_factor: reading.intervalGrowthFactor,
    last_handled_at: reading.lastHandledAt,
    next_at: reading.nextAt,
    node_id: nodeId,
    priority: reading.priority,
    reading_position: reading.readingPosition,
    repetition_count: reading.repetitionCount,
    state: reading.state
  };
}

function toNodeReadingTombstoneHash(nodeId: string, deletedAt: string) {
  return computeSyncContentHash('node_reading', {
    deleted_at: deletedAt,
    node_id: nodeId,
    object_type: 'node_reading'
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
