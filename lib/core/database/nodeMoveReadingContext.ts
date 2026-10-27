import type { NativeMoveNodesArgs } from '../../platform/nativeMoveContract.js';
import { findSequentialReadingSourcesForNode } from '../review/sequentialReadingLookup.js';
import type { SequentialReadingNode, SequentialReadingNodes } from '../review/sequentialReadingTypes.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { projectParentChildOrder } from './parentChildOrder.js';
import { requireDatabaseHostName } from './syncHostIdentity.js';

interface ReadingRow extends DatabaseRow {
  id: string; parent_id: string | null; kind: SequentialReadingNode['kind']; title: string;
  created_at: string; updated_at: string; has_content: number; priority: number | null;
  sequential_reading_enabled: number | null; shelved_at: string | null; manual_child_order: string | null;
  anchor_kind: 'highlight' | 'cloze' | 'image-excerpt' | null;
  interval_duration_ms: number | null; interval_growth_factor: number | null; last_handled_at: string | null;
  next_at: string | null; reading_priority: number | null; reading_position: number | null;
  repetition_count: number | null; reading_state: NonNullable<SequentialReadingNode['reading']>['state'] | null;
}

function loadReadingNodes(driver: DatabaseDriver, nodeIds: string[]): SequentialReadingNodes {
  const rows = driver.queryAll<ReadingRow>(`SELECT n.id, n.parent_id, n.kind, n.title, n.created_at, n.updated_at,
    n.priority, n.sequential_reading_enabled, n.shelved_at, n.manual_child_order,
    CASE WHEN n.body_blob_hash IS NOT NULL OR LENGTH(TRIM(n.content)) > 0 THEN 1 ELSE 0 END AS has_content,
    CASE WHEN n.anchor_resolution_status LIKE 'unmapped_%' THEN NULL ELSE json_extract(n.anchor_link, '$.kind') END AS anchor_kind,
    r.interval_duration_ms, r.interval_growth_factor, r.last_handled_at, r.next_at,
    r.priority AS reading_priority, h.reading_position, r.repetition_count, r.state AS reading_state
    FROM nodes n LEFT JOIN node_reading r ON r.node_id = n.id
    LEFT JOIN node_reading_host_state h ON h.node_id = n.id AND h.host_name = ?
    WHERE n.id IN (SELECT value FROM json_each(?)) AND n.deleted_at IS NULL`,
  [requireDatabaseHostName(driver), JSON.stringify(nodeIds)]);
  return Object.fromEntries(rows.map((row) => [row.id, {
    id: row.id, parentNodeId: row.parent_id, kind: row.kind, title: row.title, createdAt: row.created_at,
    updatedAt: row.updated_at, content: '', hasContent: row.has_content === 1, review: null,
    priority: row.priority, shelvedAt: row.shelved_at,
    sequentialReadingEnabled: row.sequential_reading_enabled == null ? null : row.sequential_reading_enabled === 1,
    manualChildOrder: row.manual_child_order ? JSON.parse(row.manual_child_order) as string[] : null,
    anchorLink: row.anchor_kind ? { kind: row.anchor_kind } : null,
    reading: row.reading_state && row.last_handled_at && row.next_at ? {
      intervalDurationMs: row.interval_duration_ms ?? 0, intervalGrowthFactor: row.interval_growth_factor ?? 1,
      lastHandledAt: row.last_handled_at, nextAt: row.next_at, priority: row.reading_priority ?? 0,
      readingPosition: row.reading_position ?? 0, repetitionCount: row.repetition_count ?? 0, state: row.reading_state
    } : null
  }]));
}

export function captureMoveReadingScope(driver: DatabaseDriver, input: NativeMoveNodesArgs) {
  const ancestorIds = driver.queryAll<{ id: string }>(`WITH RECURSIVE ancestors(id, parent_id) AS (
    SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
    UNION SELECT n.id, n.parent_id FROM nodes n JOIN ancestors a ON n.id = a.parent_id)
    SELECT id FROM ancestors`, [JSON.stringify(input.nodes.flatMap((node) =>
    [node.nodeId, ...(node.parentNodeId ? [node.parentNodeId] : [])]))]).map((row) => row.id);
  const ancestors = loadReadingNodes(driver, ancestorIds);
  const moved = { ...ancestors };
  input.nodes.forEach((node) => { moved[node.nodeId] = { ...moved[node.nodeId]!, parentNodeId: node.parentNodeId }; });
  const roots = new Set(input.nodes.flatMap((node) => [node.nodeId,
    ...findSequentialReadingSourcesForNode(node.nodeId, ancestors),
    ...findSequentialReadingSourcesForNode(node.nodeId, moved)]));
  const descendants = driver.queryAll<{ id: string }>(`WITH RECURSIVE subtree(id) AS (
    SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL
    UNION SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id WHERE n.deleted_at IS NULL)
    SELECT id FROM subtree`, [JSON.stringify([...roots])]).map((row) => row.id);
  return { nodeIds: [...new Set([...ancestorIds, ...descendants])], descendantIds: new Set(descendants) };
}

export function loadMoveReadingContext(driver: DatabaseDriver, scope: ReturnType<typeof captureMoveReadingScope>) {
  const nodesById = loadReadingNodes(driver, scope.nodeIds);
  const parentIds = [...new Set(Object.values(nodesById).flatMap((node) =>
    node.parentNodeId && scope.descendantIds.has(node.parentNodeId) ? [node.parentNodeId] : []))];
  const rows = driver.queryAll<{ parent_id: string; child_ids_json: string }>(
    'SELECT parent_id, child_ids_json FROM parent_child_order WHERE parent_id IN (SELECT value FROM json_each(?))',
    [JSON.stringify(parentIds)]);
  const orders = new Map(rows.map((row) => [row.parent_id, JSON.parse(row.child_ids_json) as string[]]));
  const members = Object.values(nodesById).map((node) => ({ id: node.id, parent_id: node.parentNodeId,
    title: node.title, created_at: node.createdAt, deleted_at: null }));
  return { nodesById, nodeOrder: projectParentChildOrder(members, orders) };
}
