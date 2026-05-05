import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { loadDatabaseDeviceId } from './syncDeviceIdentity.js';
import {
  buildOrderedNodeIds,
  buildWorkspaceSnapshotNode,
  resolveSnapshotActiveNodeId,
  type WorkspaceNodeAttachmentSnapshot,
  type WorkspaceNodeSnapshot
} from './workspaceSnapshotHelpers.js';
import { loadUntitledSequenceByParent } from './workspaceUntitledSequence.js';

export interface WorkspaceSnapshot {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, WorkspaceNodeSnapshot>;
  trashedNodeIds: string[];
  untitledSequenceByParent: Record<string, number>;
}

interface WorkspaceNodeRow extends DatabaseRow {
  id: string;
  parent_id: string | null;
  kind: string | null;
  priority: number | null;
  desired_retention: number | null;
  title: string;
  is_title_manual: number;
  hide_title_heading: number;
  opening_text: string | null;
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

interface NodeAttachmentSnapshotRow extends DatabaseRow {
  attachment_id: string;
  mime_type: string | null;
  node_id: string;
  original_name: string | null;
  role: string;
}

const ACTIVE_NODE_META_KEY = 'active_node_id';

function queryWorkspaceRows(driver: DatabaseDriver): WorkspaceNodeRow[] {
  const deviceId = loadDatabaseDeviceId(driver) ?? '*';
  return driver.queryAll<WorkspaceNodeRow>(
    `SELECT
       n.id,
       n.parent_id,
       n.kind,
       n.priority,
       n.desired_retention,
       n.title,
       n.is_title_manual,
       n.hide_title_heading,
       n.opening_text,
       n.virtual_filter,
       n.content,
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
     LEFT JOIN node_reading rd ON rd.node_id = n.id
     LEFT JOIN node_reading_device_state rds ON rds.node_id = n.id AND rds.device_id = ?
     LEFT JOIN node_review nr ON nr.node_id = n.id`
    , [deviceId]
  );
}

function queryNodeOrderRows(driver: DatabaseDriver): NodeOrderRow[] {
  return driver.queryAll<NodeOrderRow>('SELECT node_id FROM node_order ORDER BY position ASC');
}

function queryNodeAttachmentRows(driver: DatabaseDriver): NodeAttachmentSnapshotRow[] {
  return driver.queryAll<NodeAttachmentSnapshotRow>(
    `SELECT
       node_attachments.node_id,
       node_attachments.attachment_id,
       node_attachments.role,
       attachments.mime_type,
       attachments.original_name
     FROM node_attachments
     LEFT JOIN attachments ON attachments.id = node_attachments.attachment_id
     ORDER BY node_attachments.node_id ASC, node_attachments.role ASC, node_attachments.attachment_id ASC`
  );
}

function attachNodeAttachments(
  nodesById: Record<string, WorkspaceNodeSnapshot>,
  attachmentRows: NodeAttachmentSnapshotRow[]
) {
  for (const row of attachmentRows) {
    const node = nodesById[row.node_id];
    if (!node) {
      continue;
    }
    const attachment: WorkspaceNodeAttachmentSnapshot = {
      attachmentId: row.attachment_id,
      mimeType: row.mime_type,
      originalName: row.original_name,
      role: row.role
    };
    node.attachments = [...(node.attachments ?? []), attachment];
  }
}

function buildSnapshotRows(
  driver: DatabaseDriver,
  rows: WorkspaceNodeRow[],
  orderedRows: NodeOrderRow[]
): WorkspaceSnapshot {
  const nodesById: Record<string, WorkspaceNodeSnapshot> = {};
  const trashedNodeIds: string[] = [];

  for (const row of rows) {
    nodesById[row.id] = buildWorkspaceSnapshotNode(row);
    if (row.deleted_at) {
      trashedNodeIds.push(row.id);
    }
  }
  attachNodeAttachments(nodesById, queryNodeAttachmentRows(driver));
  const nodeOrder = buildOrderedNodeIds(rows, orderedRows, nodesById);

  return {
    activeNodeId: resolveSnapshotActiveNodeId(driver, nodeOrder, nodesById, trashedNodeIds, ACTIVE_NODE_META_KEY),
    nodeOrder,
    nodesById,
    trashedNodeIds,
    untitledSequenceByParent: {}
  };
}

export function loadWorkspaceSnapshot(driver: DatabaseDriver): WorkspaceSnapshot | null {
  const rows = queryWorkspaceRows(driver);
  if (rows.length === 0) {
    return null;
  }
  return {
    ...buildSnapshotRows(driver, rows, queryNodeOrderRows(driver)),
    untitledSequenceByParent: loadUntitledSequenceByParent(driver)
  };
}
