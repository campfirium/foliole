import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { requireDatabaseHostName } from './syncHostIdentity.js';
import { WORKSPACE_BODY_STATUS_SQL } from './workspaceBodyStatus.js';
import {
  buildWorkspaceListNodesById,
  type WorkspaceListNodeSnapshot,
  type WorkspaceNodeRow
} from './workspaceListSnapshotNodes.js';
import { applyResolvedOpenings, buildPdfOpeningById } from './workspaceListSnapshotOpening.js';
import {
  normalizeWorkspaceSnapshot,
  resolveWorkspaceSnapshotActiveNodeId
} from './workspaceSnapshotContract.js';
import { loadUntitledSequenceByParent } from './workspaceUntitledSequence.js';

interface NodeOrderRow extends DatabaseRow {
  node_id: string;
}

interface PdfOpeningRow extends DatabaseRow {
  node_id: string;
  text: string;
}

interface WorkspaceMetaRow extends DatabaseRow {
  value: string;
}

const ACTIVE_NODE_META_KEY = 'active_node_id';

function queryWorkspaceRows(driver: DatabaseDriver) {
  const hostName = requireDatabaseHostName(driver);
  return driver.queryAll<WorkspaceNodeRow>(
    `SELECT
       n.id,
       n.parent_id,
       n.kind,
       n.priority,
       n.desired_retention,
       n.enable_short_term,
       n.sequential_reading_enabled,
       n.shelved_at,
       n.manual_child_order,
       n.title,
       n.is_title_manual,
       n.hide_title_heading,
       n.virtual_filter,
       n.content AS collection_source_content,
       n.body_blob_hash,
       n.opening_text,
       ${WORKSPACE_BODY_STATUS_SQL} AS body_status,
       CASE WHEN n.body_blob_hash IS NOT NULL OR LENGTH(TRIM(n.content)) > 0 THEN 1 ELSE 0 END AS has_content,
       CASE WHEN n.reveal IS NOT NULL THEN 1 ELSE 0 END AS has_reveal,
       CASE WHEN n.anchor_resolution_status LIKE 'unmapped_%' THEN NULL ELSE n.anchor_link END AS anchor_link,
       n.image_regions,
       n.import_content_fingerprint,
       n.import_source_fingerprint,
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
     LEFT JOIN node_reading rd ON rd.node_id = n.id
     LEFT JOIN node_reading_host_state rds ON rds.node_id = n.id AND rds.host_name = ?
     LEFT JOIN node_review nr ON nr.node_id = n.id`
    , [hostName]
  );
}

function queryNodeOrderRows(driver: DatabaseDriver) {
  return driver.queryAll<NodeOrderRow>(
    `SELECT node_order.node_id
     FROM node_order
     JOIN nodes ON nodes.id = node_order.node_id
     ORDER BY node_order.position ASC`
  );
}

function queryPdfOpeningRows(driver: DatabaseDriver) {
  return driver.queryAll<PdfOpeningRow>(
    `SELECT
       na.node_id,
       ppt.text
     FROM node_attachments na
     INNER JOIN attachments a
       ON a.id = na.attachment_id
     INNER JOIN pdf_page_text ppt
       ON ppt.attachment_id = a.id
     WHERE na.role = 'reference'
       AND a.mime_type = 'application/pdf'
     ORDER BY na.node_id ASC, ppt.page ASC`
  );
}

function loadPersistedActiveNodeId(driver: DatabaseDriver) {
  const row = driver.queryOne<WorkspaceMetaRow>(
    'SELECT value FROM workspace_meta WHERE key = ?',
    [ACTIVE_NODE_META_KEY]
  );
  return row && row.value !== '' ? row.value : null;
}

function buildNodeOrder(driver: DatabaseDriver, rows: WorkspaceNodeRow[], nodesById: Record<string, unknown>) {
  const nodeOrder = queryNodeOrderRows(driver)
    .map((row) => row.node_id)
    .filter((nodeId) => Boolean(nodesById[nodeId]));
  const orderedNodeIds = new Set(nodeOrder);
  for (const row of rows) {
    if (!orderedNodeIds.has(row.id)) {
      nodeOrder.push(row.id);
    }
  }
  return nodeOrder;
}

function resolveActiveNodeId(
  driver: DatabaseDriver,
  nodeOrder: string[],
  nodesById: Record<string, WorkspaceListNodeSnapshot>
) {
  const persistedActiveNodeId = loadPersistedActiveNodeId(driver);
  return resolveWorkspaceSnapshotActiveNodeId({
    activeNodeId: persistedActiveNodeId,
    nodeOrder,
    nodesById
  });
}

function resolveCapturedWorkspaceVersion(rows: WorkspaceNodeRow[]) {
  return rows.reduce<string | null>(
    (version, row) => (version === null || row.updated_at > version ? row.updated_at : version),
    null
  );
}

export function loadWorkspaceListSnapshot(
  driver: DatabaseDriver,
  options?: { includePdfOpenings?: boolean }
) {
  const rows = queryWorkspaceRows(driver);
  if (rows.length === 0) {
    return null;
  }
  const { directOpeningById, nodesById, trashedNodeDeletedAtById, trashedNodeIds } = buildWorkspaceListNodesById(rows);
  const pdfOpeningById = options?.includePdfOpenings === false
    ? new Map<string, string>()
    : buildPdfOpeningById(queryPdfOpeningRows(driver), nodesById);
  const nodeOrder = buildNodeOrder(driver, rows, nodesById);
  applyResolvedOpenings({ directOpeningById, nodeOrder, nodesById, pdfOpeningById });
  const activeNodeId = resolveActiveNodeId(driver, nodeOrder, nodesById);

  return normalizeWorkspaceSnapshot({
    activeNodeId,
    capturedWorkspaceVersion: resolveCapturedWorkspaceVersion(rows),
    nodeOrder,
    nodesById,
    trashedNodeDeletedAtById,
    trashedNodeIds,
    untitledSequenceByParent: loadUntitledSequenceByParent(driver)
  });
}
