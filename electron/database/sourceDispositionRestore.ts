import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { writeNodeReadingSnapshotWithSync } from '../../lib/core/database/nodeReadingSyncState.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import type { SourceDisposition, SourceDispositionKey, SourceDispositionRestoreResult, SourceKeyRow } from './sourceDispositionStates.js';
import {
  readReadwiseRuleIds,
  sourceDispositionKeyId,
  toSourceDispositionKey
} from './sourceDispositionStates.js';
import { withTransaction } from './transaction.js';

interface SourceCandidateRow extends SourceKeyRow {
  deleted_at: string | null;
  node_id: string;
  reading_state: string | null;
}

interface SourceDispositionRow extends DatabaseRow, SourceDispositionKey {
  disposition: SourceDisposition;
}

const VALID_DISPOSITIONS = new Set<string>(['dismissed', 'hard_deleted', 'soft_deleted']);

function readDispositionRows(driver: DatabaseDriver) {
  return driver.queryAll<SourceDispositionRow>(
    `SELECT source_kind AS sourceKind,
            source_scope AS sourceScope,
            original_title AS originalTitle,
            disposition
     FROM source_disposition_states`
  ).filter((row) => VALID_DISPOSITIONS.has(row.disposition));
}

function readSourceCandidates(driver: DatabaseDriver) {
  const rows = driver.queryAll<SourceCandidateRow>(
    `SELECT item.rule_id, item.source_path, cache.title, nodes.id AS node_id,
            nodes.deleted_at, reading.state AS reading_state
     FROM keep_import_items item
     INNER JOIN keep_import_item_cache cache
       ON cache.rule_id = item.rule_id
      AND cache.source_path = item.source_path
     INNER JOIN nodes
       ON nodes.id = item.last_node_id
     LEFT JOIN node_reading reading
       ON reading.node_id = nodes.id`
  );
  const readwiseRuleIds = readReadwiseRuleIds();
  return rows.flatMap((row) => {
    const key = toSourceDispositionKey(row, readwiseRuleIds);
    return key ? [{ ...key, nodeId: row.node_id, deletedAt: row.deleted_at, readingState: row.reading_state }] : [];
  });
}

function isCurrentActiveCandidate(candidate: { deletedAt: string | null; readingState: string | null }) {
  return candidate.deletedAt === null && (candidate.readingState === null || candidate.readingState === 'active');
}

function applyDismissedState(driver: DatabaseDriver, nodeIds: string[], updatedAt: string, deviceId: string) {
  if (nodeIds.length === 0) return;
  const upsertReading = driver.prepare(
    `INSERT INTO node_reading (
       node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
       next_at, priority, repetition_count, state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       interval_duration_ms = excluded.interval_duration_ms,
       interval_growth_factor = excluded.interval_growth_factor,
       last_handled_at = excluded.last_handled_at,
       next_at = excluded.next_at,
       priority = excluded.priority,
       repetition_count = excluded.repetition_count,
       state = excluded.state`
  );
  const upsertDeviceState = driver.prepare(
    `INSERT INTO node_reading_device_state (node_id, device_id, reading_position, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(node_id, device_id) DO UPDATE SET
       reading_position = excluded.reading_position,
       updated_at = excluded.updated_at`
  );
  const deleteReading = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteDeviceState = driver.prepare('DELETE FROM node_reading_device_state WHERE node_id = ?');
  for (const nodeId of nodeIds) {
    writeNodeReadingSnapshotWithSync(driver, {
      deviceId,
      nodeId,
      reading: {
        intervalDurationMs: 0,
        intervalGrowthFactor: 1,
        lastHandledAt: updatedAt,
        nextAt: updatedAt,
        priority: 0,
        readingPosition: 0,
        repetitionCount: 0,
        state: 'dismissed'
      },
      updatedAt
    }, {
      deleteDeviceState: deleteDeviceState.run,
      deleteReading: deleteReading.run,
      upsertDeviceState: upsertDeviceState.run,
      upsertReading: upsertReading.run
    });
  }
}

function applyTrashState(driver: DatabaseDriver, nodeIds: string[], updatedAt: string, deviceId: string) {
  if (nodeIds.length === 0) return;
  const setDeletedAt = driver.prepare(
    `UPDATE nodes
     SET deleted_at = ?, updated_at = ?, last_modified_by_device_id = ?, sync_dirty = 1
     WHERE id = ?`
  );
  for (const nodeId of nodeIds) {
    setDeletedAt.run([updatedAt, updatedAt, deviceId, nodeId]);
  }
}

export function restoreSourceDispositions(): SourceDispositionRestoreResult {
  const connection = openDatabaseConnection();
  const updatedAt = new Date().toISOString();
  const deviceId = loadOrCreateDesktopDeviceId(updatedAt);
  return withTransaction(connection.driver, () => {
    const dispositionsByKey = new Map(readDispositionRows(connection.driver).map((row) => [sourceDispositionKeyId(row), row.disposition]));
    const dismissedNodeIds: string[] = [];
    const trashNodeIds: string[] = [];
    for (const candidate of readSourceCandidates(connection.driver)) {
      if (!isCurrentActiveCandidate(candidate)) continue;
      const disposition = dispositionsByKey.get(sourceDispositionKeyId(candidate));
      if (disposition === 'dismissed') dismissedNodeIds.push(candidate.nodeId);
      if (disposition === 'hard_deleted' || disposition === 'soft_deleted') trashNodeIds.push(candidate.nodeId);
    }
    applyDismissedState(connection.driver, dismissedNodeIds, updatedAt, deviceId);
    applyTrashState(connection.driver, trashNodeIds, updatedAt, deviceId);
    return {
      dismissedCount: dismissedNodeIds.length,
      trashedCount: trashNodeIds.length
    };
  });
}
