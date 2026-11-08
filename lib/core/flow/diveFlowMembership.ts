import { VIRTUAL_ROOT_NODE_ID } from '../database/specialNodeIds.js';
import { readDiveNode } from '../nodes/dive.js';
import { parseManualChildOrder } from '../nodes/manualChildOrder.js';
import { parseVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';
import type { DbPort } from '../sync/dbPort.js';

export async function readDiveFlowMembers(db: DbPort, id: string): Promise<string[]> {
  const [row] = await db.query<{ title: string; virtual_filter: string; manual_child_order: string | null }>(
    "SELECT title, virtual_filter, manual_child_order FROM nodes WHERE id = ? AND kind = 'folder' AND parent_id IS NULL AND deleted_at IS NULL",
    [id]);
  const dive = row && readDiveNode({ id, title: row.title, kind: 'folder', parentNodeId: null,
    virtualFilter: parseVirtualNodeFilter(row.virtual_filter), manualChildOrder: parseManualChildOrder(row.manual_child_order) });
  if (!dive?.directSourceIds.length) return [];

  // Resolve visibility through source ancestors, then descend only through the referenced branches.
  const members = await db.query<{ id: string }>(`WITH RECURSIVE
    sources AS (
      SELECT id, parent_id, deleted_at, kind FROM nodes WHERE id IN (SELECT value FROM json_each(?))
      AND kind IN ('folder', 'topic') AND virtual_filter IS NULL AND anchor_link IS NULL
    ), ancestors(source_id, id, parent_id, deleted_at) AS (
      SELECT id, id, parent_id, deleted_at FROM sources
      UNION
      SELECT a.source_id, n.id, n.parent_id, n.deleted_at FROM ancestors a JOIN nodes n ON n.id = a.parent_id
    ), visible_sources AS (
      SELECT source_id FROM ancestors GROUP BY source_id
      HAVING MAX(parent_id IS NULL) = 1 AND MAX(deleted_at IS NOT NULL OR id = ?) = 0
    ), members(id, kind, within_topic) AS (
      SELECT id, kind, kind = 'topic' FROM sources JOIN visible_sources ON source_id = id
      UNION
      SELECT n.id, n.kind, m.within_topic OR n.kind = 'topic'
      FROM members m JOIN nodes n ON n.parent_id = m.id
      WHERE n.deleted_at IS NULL AND (m.within_topic OR
        (n.kind IN ('folder', 'topic') AND n.virtual_filter IS NULL AND n.anchor_link IS NULL))
    )
    SELECT DISTINCT id FROM members WHERE within_topic AND kind IN ('topic', 'item') ORDER BY id`,
  [JSON.stringify(dive.directSourceIds), VIRTUAL_ROOT_NODE_ID]);
  return members.map(member => member.id);
}
