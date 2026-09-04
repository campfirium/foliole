import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { WORKSPACE_BODY_STATUS_SQL } from '../../lib/core/database/workspaceBodyStatus.js';
import { buildWorkspaceSnapshotNode } from '../../lib/core/database/workspaceSnapshotHelpers.js';
import type {
  NativeNodeMutationPatchResult,
  NativeNodeSnapshotArgs,
  NativeTextImportResult
} from '../../lib/platform/nativeContract.js';
import { openDatabaseConnection } from '../database/connection.js';

interface ImportedNodeRow extends DatabaseRow, NodeBodyRow {
  anchor_link: string | null;
  body_blob_data: Uint8Array | string | null;
  body_blob_hash: string | null;
  body_status: string | null;
  content: string;
  created_at: string;
  deleted_at: string | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  hide_title_heading: number;
  id: string;
  image_regions: string | null;
  is_title_manual: number;
  kind: string | null;
  manual_child_order: string | null;
  opening_text: string | null;
  parent_id: string | null;
  priority: number | null;
  reading_interval_duration_ms: number | null;
  reading_interval_growth_factor: number | null;
  reading_last_handled_at: string | null;
  reading_next_at: string | null;
  reading_position: number | null;
  reading_priority: number | null;
  reading_repetition_count: number | null;
  reading_state: string | null;
  reveal: string | null;
  review_difficulty: number | null;
  review_due: string | null;
  review_elapsed_days: number | null;
  review_lapses: number | null;
  review_last_review_at: string | null;
  review_reps: number | null;
  review_scheduled_days: number | null;
  review_stability: number | null;
  review_state: number | null;
  sequential_reading_enabled: number | null;
  shelved_at: string | null;
  title: string;
  updated_at: string;
  virtual_filter: string | null;
}

interface NodeOrderRow extends DatabaseRow {
  node_id: string;
}

interface NodeIdRow extends DatabaseRow {
  id: string;
}

function hasPersistedNode(result: NativeTextImportResult) {
  return typeof result.node_id === 'string';
}

function isPatchableImport(result: NativeTextImportResult) {
  return hasPersistedNode(result) && result.result_status !== 'failed' && result.source_kind !== 'epub';
}

function readImportedNodeRows(driver: DatabaseDriver, nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return [];
  }
  const placeholders = nodeIds.map(() => '?').join(', ');
  const hostName = requireDatabaseHostName(driver);
  return driver.queryAll<ImportedNodeRow>(
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
       n.body_blob_hash,
       cbd.data AS body_blob_data,
       n.opening_text,
       ${WORKSPACE_BODY_STATUS_SQL} AS body_status,
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
     LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     LEFT JOIN node_reading rd ON rd.node_id = n.id
     LEFT JOIN node_reading_host_state rds ON rds.node_id = n.id AND rds.host_name = ?
     LEFT JOIN node_review nr ON nr.node_id = n.id
     WHERE n.id IN (${placeholders})`,
    [hostName, ...nodeIds]
  );
}

function readNodeOrder(driver: DatabaseDriver) {
  const nodeOrder = driver.queryAll<NodeOrderRow>(
    `SELECT node_order.node_id
     FROM node_order
     JOIN nodes ON nodes.id = node_order.node_id
     ORDER BY node_order.position ASC`
  ).map((row) => row.node_id);
  const orderedNodeIds = new Set(nodeOrder);
  for (const row of driver.queryAll<NodeIdRow>('SELECT id FROM nodes WHERE deleted_at IS NULL ORDER BY created_at ASC')) {
    if (!orderedNodeIds.has(row.id)) {
      nodeOrder.push(row.id);
    }
  }
  return nodeOrder;
}

function toNodeMutationSnapshot(row: ImportedNodeRow, nodeOrder: string[]): NativeNodeSnapshotArgs {
  const body = resolveNodeBody(row);
  if (body.status === 'unavailable') {
    throw new Error(`node_body_unavailable:${row.id}`);
  }
  const node = buildWorkspaceSnapshotNode({
    ...row,
    content: body.content
  });
  const position = nodeOrder.indexOf(node.id);
  return {
    nodeId: node.id,
    parentNodeId: node.parentNodeId,
    kind: node.kind,
    priority: node.priority ?? null,
    desiredRetention: node.desiredRetention ?? null,
    enableShortTerm: node.enableShortTerm ?? null,
    sequentialReadingEnabled: node.sequentialReadingEnabled ?? null,
    shelvedAt: node.shelvedAt ?? null,
    manualChildOrder: node.kind === 'folder' ? node.manualChildOrder ?? null : null,
    title: node.title,
    isTitleManual: node.isTitleManual,
    hideTitleHeading: node.hideTitleHeading,
    content: node.content,
    virtualFilter: node.virtualFilter ?? null,
    reveal: node.reveal,
    anchorLink: node.anchorLink,
    imageRegions: node.imageRegions ?? null,
    reading: node.reading,
    review: node.review,
    position: position >= 0 ? position : null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt
  };
}

export function buildImportNodeMutationPatch(
  results: Array<NativeTextImportResult | null | undefined>
): NativeNodeMutationPatchResult | null {
  const persisted = results.filter((result): result is NativeTextImportResult => Boolean(result && hasPersistedNode(result)));
  if (persisted.length === 0 || persisted.some((result) => !isPatchableImport(result))) {
    return null;
  }
  const patchable = persisted;
  const nodeIds = [...new Set(patchable.map((result) => result.node_id).filter((nodeId): nodeId is string => Boolean(nodeId)))];
  let driver: DatabaseDriver;
  try {
    driver = openDatabaseConnection().driver;
  } catch {
    return null;
  }
  const nodeOrder = readNodeOrder(driver);
  const nodeRows = readImportedNodeRows(driver, nodeIds);
  let nodes: NativeNodeSnapshotArgs[];
  try {
    nodes = nodeRows.map((row) => toNodeMutationSnapshot(row, nodeOrder));
  } catch {
    return null;
  }
  if (nodes.length !== nodeIds.length) {
    return null;
  }
  return {
    createdNodeIds: patchable
      .filter((result) => result.duplicate_semantic === 'new' && result.node_id)
      .map((result) => result.node_id as string),
    nodeOrder,
    nodes,
    updatedNodeIds: patchable
      .filter((result) => result.duplicate_semantic === 'updated' && result.node_id)
      .map((result) => result.node_id as string)
  };
}

export function withTextImportNodeMutationPatch<T extends NativeTextImportResult | null>(result: T): T {
  const nodeMutationPatch = buildImportNodeMutationPatch([result]);
  return (nodeMutationPatch && result ? { ...result, node_mutation_patch: nodeMutationPatch } : result) as T;
}

export function withDirectoryImportNodeMutationPatch<T extends { entries: NativeTextImportResult[] }>(result: T): T {
  const nodeMutationPatch = buildImportNodeMutationPatch(result.entries);
  return nodeMutationPatch ? { ...result, node_mutation_patch: nodeMutationPatch } : result;
}
