import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { writeNodeReadingSnapshotWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import {
  buildSequentialReadingReleaseUpdates,
  type SequentialReadingReleaseCandidate,
  type SequentialReadingReleaseMode
} from '../../lib/core/review/sequentialReadingRelease.js';
import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';

interface NodeReadingRow extends DatabaseRow {
  content: string;
  interval_duration_ms: number | null;
  interval_growth_factor: number | null;
  last_handled_at: string | null;
  next_at: string | null;
  node_id: string;
  priority: number | null;
  reading_position: number | null;
  repetition_count: number | null;
  state: string | null;
}

function toCandidate(row: NodeReadingRow): SequentialReadingReleaseCandidate {
  return {
    content: row.content,
    nodeId: row.node_id,
    priority: row.priority,
    reading: row.state === 'active' || row.state === 'done' || row.state === 'dismissed' || row.state === 'locked'
      ? {
          intervalDurationMs: row.interval_duration_ms,
          intervalGrowthFactor: row.interval_growth_factor,
          lastHandledAt: row.last_handled_at,
          nextAt: row.next_at,
          priority: row.priority,
          readingPosition: row.reading_position,
          repetitionCount: row.repetition_count,
          state: row.state
        }
      : null
  };
}

function readSequentialReadingCandidates(driver: DatabaseDriver, nodeIds: string[], deviceId: string) {
  const selectNode = driver.prepare(
    `SELECT n.id AS node_id, n.content, n.priority,
            rd.interval_duration_ms, rd.interval_growth_factor, rd.last_handled_at,
            rd.next_at, rd.priority AS reading_priority, rd.repetition_count, rd.state,
            rds.reading_position
     FROM nodes n
     LEFT JOIN node_reading rd ON rd.node_id = n.id
     LEFT JOIN node_reading_device_state rds ON rds.node_id = n.id AND rds.device_id = ?
     WHERE n.id = ? AND n.deleted_at IS NULL`
  );
  return nodeIds.flatMap((nodeId) => {
    const row = selectNode.get([deviceId, nodeId]) as (NodeReadingRow & { reading_priority: number | null }) | undefined;
    return row ? [toCandidate({ ...row, priority: row.reading_priority ?? row.priority })] : [];
  });
}

export function applyEpubSequentialReadingMode(args: {
  driver: DatabaseDriver;
  importedAt: string;
  mode: SequentialReadingReleaseMode;
  nodeIds: string[];
  sourceNodeId: string;
}) {
  const deviceId = loadOrCreateDesktopDeviceId(args.importedAt);
  const updateSource = args.driver.prepare(
    `UPDATE nodes
     SET sequential_reading_enabled = ?, updated_at = ?, last_modified_by_device_id = ?, sync_dirty = 1
     WHERE id = ? AND deleted_at IS NULL`
  );
  const upsertReading = args.driver.prepare(
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
  const upsertDeviceState = args.driver.prepare(
    `INSERT INTO node_reading_device_state (node_id, device_id, reading_position, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(node_id, device_id) DO UPDATE SET
       reading_position = excluded.reading_position,
       updated_at = excluded.updated_at`
  );
  const deleteReading = args.driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteDeviceState = args.driver.prepare('DELETE FROM node_reading_device_state WHERE node_id = ?');
  const candidates = readSequentialReadingCandidates(args.driver, args.nodeIds, deviceId);
  const updates = buildSequentialReadingReleaseUpdates({
    candidates,
    defaultPriority: 0,
    mode: args.mode,
    now: args.importedAt
  });

  args.driver.transaction(() => {
    updateSource.run([args.mode === 'sequential' ? 1 : 0, args.importedAt, deviceId, args.sourceNodeId]);
    for (const update of updates) {
      writeNodeReadingSnapshotWithSync(args.driver, {
        deviceId,
        nodeId: update.nodeId,
        reading: update.reading,
        updatedAt: args.importedAt
      }, {
        deleteDeviceState: deleteDeviceState.run,
        deleteReading: deleteReading.run,
        upsertDeviceState: upsertDeviceState.run,
        upsertReading: upsertReading.run
      });
    }
  });
}
