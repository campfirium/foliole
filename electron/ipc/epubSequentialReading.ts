import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { writeNodeReadingSnapshotWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import {
  buildSequentialReadingReleaseUpdates,
  type SequentialReadingReleaseCandidate,
  type SequentialReadingReleaseMode
} from '../../lib/core/review/sequentialReadingRelease.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';

interface NodeReadingRow extends DatabaseRow, NodeBodyRow {
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

function readSequentialReadingCandidates(driver: DatabaseDriver, nodeIds: string[], hostName: string) {
  const selectNode = driver.prepare(
    `SELECT n.id AS node_id, n.content, n.body_blob_hash, cbd.data AS body_blob_data, n.priority,
            rd.interval_duration_ms, rd.interval_growth_factor, rd.last_handled_at,
            rd.next_at, rd.priority AS reading_priority, rd.repetition_count, rd.state,
            rds.reading_position
     FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     LEFT JOIN node_reading rd ON rd.node_id = n.id
     LEFT JOIN node_reading_host_state rds ON rds.node_id = n.id AND rds.host_name = ?
     WHERE n.id = ? AND n.deleted_at IS NULL`
  );
  return nodeIds.flatMap((nodeId) => {
    const row = selectNode.get([hostName, nodeId]) as (NodeReadingRow & { reading_priority: number | null }) | undefined;
    if (!row) return [];
    const body = requireResolvedNodeBody(row, row.node_id);
    return [toCandidate({ ...row, content: body.content, priority: row.reading_priority ?? row.priority })];
  });
}

function prepareSequentialReadingStatements(driver: DatabaseDriver) {
  return {
    deleteHostState: driver.prepare('DELETE FROM node_reading_host_state WHERE node_id = ?'),
    deleteReading: driver.prepare('DELETE FROM node_reading WHERE node_id = ?'),
    updateSource: driver.prepare(
      `UPDATE nodes
       SET sequential_reading_enabled = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1
       WHERE id = ? AND deleted_at IS NULL`
    ),
    upsertHostState: driver.prepare(
      `INSERT INTO node_reading_host_state (node_id, host_name, reading_position, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(node_id, host_name) DO UPDATE SET
         reading_position = excluded.reading_position,
         updated_at = excluded.updated_at`
    ),
    upsertReading: driver.prepare(
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
    )
  };
}

export function applyEpubSequentialReadingMode(args: {
  driver: DatabaseDriver;
  importedAt: string;
  mode: SequentialReadingReleaseMode;
  nodeIds: string[];
  sourceNodeId: string;
}) {
  const hostName = loadOrCreateDesktopHostName(args.importedAt);
  const statements = prepareSequentialReadingStatements(args.driver);
  const candidates = readSequentialReadingCandidates(args.driver, args.nodeIds, hostName);
  const updates = buildSequentialReadingReleaseUpdates({
    candidates,
    defaultPriority: 0,
    mode: args.mode,
    now: args.importedAt
  });

  args.driver.transaction(() => {
    statements.updateSource.run([args.mode === 'sequential' ? 1 : 0, args.importedAt, hostName, args.sourceNodeId]);
    for (const update of updates) {
      writeNodeReadingSnapshotWithSync(args.driver, {
        hostName,
        nodeId: update.nodeId,
        reading: update.reading,
        updatedAt: args.importedAt
      }, {
        deleteDeviceState: statements.deleteHostState.run,
        deleteReading: statements.deleteReading.run,
        upsertDeviceState: statements.upsertHostState.run,
        upsertReading: statements.upsertReading.run
      });
    }
  });
}
