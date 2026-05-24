import type { PersistedNodeViewState } from '../../platform/persistedNodeViewState.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { loadDatabaseDeviceId } from './syncDeviceIdentity.js';
import { attachWorkspaceNodeAttachments } from './workspaceSnapshotAttachments.js';
import { normalizeWorkspaceSnapshot } from './workspaceSnapshotContract.js';
import {
  buildOrderedNodeIds,
  buildWorkspaceSnapshotNode,
  resolveSnapshotActiveNodeId,
  type WorkspaceNodeSnapshot
} from './workspaceSnapshotHelpers.js';
import { loadPersistedNodeViewById } from './workspaceSnapshotNodeViewState.js';
import { loadUntitledSequenceByParent } from './workspaceUntitledSequence.js';

export interface WorkspaceSnapshot {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, WorkspaceNodeSnapshot>;
  persistedNodeViewById?: Record<string, PersistedNodeViewState | undefined>;
  trashedNodeDeletedAtById?: Record<string, string>;
  trashedNodeIds: string[];
  untitledSequenceByParent: Record<string, number>;
}

export interface WorkspaceSnapshotLoadOptions {
  includeBody?: boolean;
}

interface WorkspaceNodeRow extends DatabaseRow {
  id: string;
  parent_id: string | null;
  kind: string | null;
  priority: number | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  sequential_reading_enabled: number | null;
  title: string;
  is_title_manual: number;
  hide_title_heading: number;
  opening_text: string | null;
  body_status: string | null;
  virtual_filter: string | null;
  content: string;
  reveal: string | null;
  anchor_link: string | null;
  image_regions: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  reading_interval_duration_ms: number | null;
  reading_interval_growth_factor: number | null;
  reading_last_handled_at: string | null;
  reading_next_at: string | null;
  reading_priority: number | null;
  reading_position: number | null;
  reading_repetition_count: number | null;
  reading_state: string | null;
  review_due: string | null;
  review_last_review_at: string | null;
  review_state: number | null;
  review_stability: number | null;
  review_difficulty: number | null;
  review_elapsed_days: number | null;
  review_scheduled_days: number | null;
  review_reps: number | null;
  review_lapses: number | null;
}

interface NodeOrderRow extends DatabaseRow {
  node_id: string;
}

const ACTIVE_NODE_META_KEY = 'active_node_id';

function buildBodySelection(options: WorkspaceSnapshotLoadOptions) {
  if (options.includeBody) {
    return {
      bodyJoin: 'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash',
      bodyStatusExpression: `CASE
         WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL AND cb.availability IN ('fetching', 'failed') THEN cb.availability
         WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL THEN 'missing'
         WHEN TRIM(COALESCE(CAST(cbd.data AS TEXT), n.content)) = '' THEN 'empty'
         ELSE 'ready'
       END`,
      contentExpression: 'COALESCE(CAST(cbd.data AS TEXT), n.content)'
    };
  }
  return {
    bodyJoin: '',
    bodyStatusExpression: `CASE
         WHEN n.body_blob_hash IS NOT NULL AND cb.availability IN ('fetching', 'failed') THEN cb.availability
         WHEN n.body_blob_hash IS NOT NULL AND (cb.hash IS NULL OR cb.availability = 'missing') THEN 'missing'
         WHEN n.body_blob_hash IS NOT NULL THEN 'ready'
         WHEN TRIM(n.content) = '' THEN 'empty'
         ELSE 'ready'
       END`,
    contentExpression: "''"
  };
}

function queryWorkspaceRows(driver: DatabaseDriver, options: WorkspaceSnapshotLoadOptions = {}): WorkspaceNodeRow[] {
  const deviceId = loadDatabaseDeviceId(driver) ?? '*';
  const { bodyJoin, bodyStatusExpression, contentExpression } = buildBodySelection(options);
  return driver.queryAll<WorkspaceNodeRow>(
    `SELECT
       n.id,
       n.parent_id,
       n.kind,
       n.priority,
       n.desired_retention,
       n.enable_short_term,
       n.sequential_reading_enabled,
       n.title,
       n.is_title_manual,
       n.hide_title_heading,
       n.body_blob_hash,
       n.opening_text,
       ${bodyStatusExpression} AS body_status,
       n.virtual_filter,
       ${contentExpression} AS content,
       n.reveal,
       n.anchor_link,
       n.image_regions,
       n.created_at,
       n.updated_at,
       n.deleted_at,
       rd.interval_duration_ms AS reading_interval_duration_ms,
       rd.interval_growth_factor AS reading_interval_growth_factor,
       rd.last_handled_at AS reading_last_handled_at,
       rd.next_at AS reading_next_at,
       rd.priority AS reading_priority,
       rds.reading_position AS reading_position,
       rd.repetition_count AS reading_repetition_count,
       rd.state AS reading_state,
       nr.due AS review_due,
       nr.last_review_at AS review_last_review_at,
       nr.state AS review_state,
       nr.stability AS review_stability,
       nr.difficulty AS review_difficulty,
       nr.elapsed_days AS review_elapsed_days,
       nr.scheduled_days AS review_scheduled_days,
       nr.reps AS review_reps,
       nr.lapses AS review_lapses
     FROM nodes n
     LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash
     ${bodyJoin}
     LEFT JOIN node_reading rd ON rd.node_id = n.id
     LEFT JOIN node_reading_device_state rds ON rds.node_id = n.id AND rds.device_id = ?
     LEFT JOIN node_review nr ON nr.node_id = n.id`
    , [deviceId]
  );
}

function queryNodeOrderRows(driver: DatabaseDriver): NodeOrderRow[] {
  return driver.queryAll<NodeOrderRow>(
    `SELECT node_order.node_id
     FROM node_order
     JOIN nodes ON nodes.id = node_order.node_id
     WHERE nodes.kind = 'folder'
     ORDER BY node_order.position ASC`
  );
}

function buildSnapshotRows(
  driver: DatabaseDriver,
  rows: WorkspaceNodeRow[],
  orderedRows: NodeOrderRow[]
): WorkspaceSnapshot {
  const nodesById: Record<string, WorkspaceNodeSnapshot> = {};
  const trashedNodeDeletedAtById: Record<string, string> = {};
  const trashedNodeIds: string[] = [];

  for (const row of rows) {
    nodesById[row.id] = buildWorkspaceSnapshotNode(row);
    if (row.deleted_at) {
      trashedNodeIds.push(row.id);
      trashedNodeDeletedAtById[row.id] = row.deleted_at;
    }
  }
  attachWorkspaceNodeAttachments(driver, nodesById);
  const nodeOrder = buildOrderedNodeIds(rows, orderedRows, nodesById);
  const persistedNodeViewById = loadPersistedNodeViewById(driver);

  return normalizeWorkspaceSnapshot({
    activeNodeId: resolveSnapshotActiveNodeId(driver, nodeOrder, nodesById, trashedNodeIds, ACTIVE_NODE_META_KEY),
    nodeOrder,
    nodesById,
    ...(Object.keys(persistedNodeViewById).length > 0 ? { persistedNodeViewById } : {}),
    trashedNodeDeletedAtById,
    trashedNodeIds,
    untitledSequenceByParent: {}
  });
}

export function loadWorkspaceSnapshot(driver: DatabaseDriver, options: WorkspaceSnapshotLoadOptions = {}): WorkspaceSnapshot | null {
  const rows = queryWorkspaceRows(driver, options);
  if (rows.length === 0) {
    return null;
  }
  return {
    ...buildSnapshotRows(driver, rows, queryNodeOrderRows(driver)),
    untitledSequenceByParent: loadUntitledSequenceByParent(driver)
  };
}
