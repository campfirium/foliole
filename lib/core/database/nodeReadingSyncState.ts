import {
  CURRENT_READING_ORDER_SQL, currentReadingOrder, nextReadingOrderAt, type CurrentReadingOrderRow
} from '../review/readingHistoryOrder.js';
import type { ReadingState } from '../review/readingState.js';

import type { DatabaseBindParams, DatabaseDriver, DatabaseRow } from './driver.js';
import { recordTopicDailyCount } from './reviewDailyCounts.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

export interface NodeReadingSyncPayload {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: ReadingState;
}

export interface WriteNodeReadingSyncInput {
  nodeId: string;
  hostName?: string;
  reading?: NodeReadingSyncPayload | null;
  updatedAt: string;
  completedReviewDay?: string;
  /** Set by undo and redo: the restore is a deliberate act even though it puts back an older handled time. */
  historyOrder?: boolean;
}

interface ExistingNodeReadingRow extends DatabaseRow {
  node_id: string;
}

function hasExistingNodeReading(driver: DatabaseDriver, nodeId: string) {
  return Boolean(
    driver.queryOne<ExistingNodeReadingRow>('SELECT node_id FROM node_reading WHERE node_id = ?', [nodeId])
  );
}

function toNodeReadingHash(nodeId: string, reading: NodeReadingSyncPayload, historyOrderAt: string) {
  return computeSyncContentHash('node_reading', toNodeReadingPayload(nodeId, reading, historyOrderAt));
}

function toNodeReadingPayload(nodeId: string, reading: NodeReadingSyncPayload, historyOrderAt: string) {
  return {
    history_order_at: historyOrderAt,
    interval_duration_ms: reading.intervalDurationMs,
    interval_growth_factor: reading.intervalGrowthFactor,
    last_handled_at: reading.lastHandledAt,
    next_at: reading.nextAt,
    node_id: nodeId,
    priority: reading.priority,
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

/** The order this write takes in sync, after everything this library already holds for the node. */
function nextNodeReadingOrderAt(driver: DatabaseDriver, input: WriteNodeReadingSyncInput) {
  const current = currentReadingOrder(driver.queryOne<CurrentReadingOrderRow>(CURRENT_READING_ORDER_SQL, [input.nodeId]));
  const reading = input.reading;
  return nextReadingOrderAt({ current, next: reading ? { lastHandledAt: reading.lastHandledAt, profile: {
      interval_duration_ms: reading.intervalDurationMs, interval_growth_factor: reading.intervalGrowthFactor,
      last_handled_at: reading.lastHandledAt, next_at: reading.nextAt, priority: reading.priority,
      repetition_count: reading.repetitionCount, state: reading.state } } : null,
    now: input.updatedAt, restore: input.historyOrder === true });
}

function recordNodeReadingTombstone(
  driver: DatabaseDriver,
  input: WriteNodeReadingSyncInput & { hostName: string },
  orderAt = nextNodeReadingOrderAt(driver, { ...input, reading: null })
) {
  const contentHash = toNodeReadingTombstoneHash(input.nodeId, orderAt);
  upsertSyncObjectState(driver, {
    objectType: 'node_reading',
    objectId: input.nodeId,
    contentHash,
    deletedAt: orderAt,
    lastModifiedByHostName: input.hostName,
    updatedAt: orderAt,
    syncDirty: true
  });
}

function recordNodeReadingUpsert(
  driver: DatabaseDriver,
  input: WriteNodeReadingSyncInput & { hostName: string; reading: NodeReadingSyncPayload },
  historyOrderAt: string
) {
  const contentHash = toNodeReadingHash(input.nodeId, input.reading, historyOrderAt);
  upsertSyncObjectState(driver, {
    objectType: 'node_reading',
    objectId: input.nodeId,
    contentHash,
    lastModifiedByHostName: input.hostName,
    updatedAt: historyOrderAt,
    syncDirty: true
  });
}

export function writeNodeReadingSnapshotWithSync(
  driver: DatabaseDriver,
  input: WriteNodeReadingSyncInput,
  statements: {
    deleteDeviceState: (params?: DatabaseBindParams) => void;
    deleteReading: (params?: DatabaseBindParams) => void;
    upsertDeviceState: (params?: DatabaseBindParams) => void;
    upsertReading: (params?: DatabaseBindParams) => void;
  }
) {
  const existed = hasExistingNodeReading(driver, input.nodeId);
  // Computed before the write: the record must come after the one it replaces.
  const orderAt = input.hostName ? nextNodeReadingOrderAt(driver, input) : undefined;
  if (!input.reading) {
    statements.deleteReading([input.nodeId]);
    statements.deleteDeviceState([input.nodeId]);
    if (existed && input.hostName) {
      recordNodeReadingTombstone(driver, { ...input, hostName: input.hostName }, orderAt);
    }
    return;
  }

  statements.upsertReading([
    input.nodeId,
    input.reading.intervalDurationMs,
    input.reading.intervalGrowthFactor,
    input.reading.lastHandledAt,
    input.reading.nextAt,
    input.reading.priority,
    input.reading.repetitionCount,
    input.reading.state
  ]);
  // The stored row carries the same order as the record, so this library compares later records against it.
  if (orderAt) {
    driver.execute('UPDATE node_reading SET history_order_at = ? WHERE node_id = ?', [orderAt, input.nodeId]);
  }
  if (input.hostName && orderAt) {
    statements.upsertDeviceState([
      input.nodeId,
      input.hostName,
      input.reading.readingPosition,
      input.updatedAt
    ]);
    recordNodeReadingUpsert(driver, { ...input, hostName: input.hostName, reading: input.reading }, orderAt);
  }
}

export function saveNodeReadingStateWithSync(driver: DatabaseDriver, input: WriteNodeReadingSyncInput) {
  const deleteDeviceState = driver.prepare('DELETE FROM node_reading_host_state WHERE node_id = ?');
  const deleteReading = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const upsertDeviceState = driver.prepare(
    'INSERT OR REPLACE INTO node_reading_host_state (node_id, host_name, reading_position, updated_at) VALUES (?, ?, ?, ?)'
  );
  const upsertReading = driver.prepare(
    `INSERT INTO node_reading (
      node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(node_id) DO UPDATE SET
      interval_duration_ms = excluded.interval_duration_ms, interval_growth_factor = excluded.interval_growth_factor,
      last_handled_at = excluded.last_handled_at, next_at = excluded.next_at, priority = excluded.priority,
      repetition_count = excluded.repetition_count, state = excluded.state`
  );
  driver.transaction(() => {
    if (input.reading === null && input.hostName && !hasExistingNodeReading(driver, input.nodeId)) {
      recordNodeReadingTombstone(driver, { ...input, hostName: input.hostName });
    }
    writeNodeReadingSnapshotWithSync(driver, input, {
      deleteDeviceState: deleteDeviceState.run,
      deleteReading: deleteReading.run,
      upsertDeviceState: upsertDeviceState.run,
      upsertReading: upsertReading.run
    });
    if (input.completedReviewDay !== undefined) {
      const node = driver.queryOne<{ kind: string }>('SELECT kind FROM nodes WHERE id = ?', [input.nodeId]);
      if (!input.reading || !input.hostName || node?.kind !== 'topic') {
        throw new Error('Daily count requires a completed Topic review');
      }
      recordTopicDailyCount(driver, {
        day: input.completedReviewDay, nodeId: input.nodeId, hostName: input.hostName
      });
    }
  });
}
