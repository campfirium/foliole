import type { AideContextSnapshot } from '../../lib/core/assistant/aideAttachedContextCandidates.js';
import { resolveAideContextSource, type AideContextNode } from '../../lib/core/assistant/aideAttachedContextSource.js';
import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { readDiveNode } from '../../lib/core/nodes/dive.js';
import { parseManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import { readTopicCollections } from '../../lib/core/nodes/topicCollectionsFrontmatter.js';
import { isManualVirtualNodeFilter, parseVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { openDatabaseConnection } from '../database/connection.js';

interface ContextRow extends DatabaseRow, NodeBodyRow {
  anchor_link: string | null;
  id: string;
  kind: string;
  reveal: string | null;
  title: string;
}

interface CollectionRow extends DatabaseRow {
  id: string;
  kind: string;
  manual_child_order: string | null;
  parent_id: string | null;
  title: string;
  virtual_filter: string | null;
}

const CHILD_LIMIT = 40;
const NODE_COLUMNS = `n.id, n.parent_id, n.kind, n.title, n.content, n.body_blob_hash, n.reveal, n.anchor_link,
  cbd.data AS body_blob_data`;

export function loadAideAttachedContextSnapshot(nodeId: string, selectionText?: string): AideContextSnapshot | null {
  const { driver } = openDatabaseConnection();
  const rows = driver.queryAll<ContextRow>(
    `WITH RECURSIVE chain(id, depth) AS (
       SELECT id, 0 FROM nodes WHERE id = ? AND deleted_at IS NULL
       UNION ALL
       SELECT n.parent_id, chain.depth + 1 FROM nodes n JOIN chain ON n.id = chain.id
       WHERE n.parent_id IS NOT NULL AND chain.depth < 64
     )
     SELECT ${NODE_COLUMNS} FROM chain JOIN nodes n ON n.id = chain.id
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     ORDER BY chain.depth ASC`,
    [nodeId]
  );
  const [focusRow, ...ancestorRows] = rows;
  if (!focusRow) return null;
  const focus = toContextNode(focusRow);
  const ancestors = ancestorRows.map(toContextNode);
  const children = driver.queryAll<ContextRow>(
    `SELECT ${NODE_COLUMNS} FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.parent_id = ? AND n.deleted_at IS NULL
     ORDER BY COALESCE(n.position, 999999), n.created_at, n.id LIMIT ${CHILD_LIMIT}`,
    [nodeId]
  ).map(toContextNode);
  const chain = resolveAideContextSource(focus, ancestors);
  return {
    ancestors,
    children,
    collections: chain ? readSourceCollections(chain.source) : { dives: [], indexes: [] },
    focus,
    ...(selectionText?.trim() ? { selectionText } : {})
  };
}

function toContextNode(row: ContextRow): AideContextNode {
  return {
    anchor: readAnchor(row.anchor_link),
    content: requireResolvedNodeBody(row).content,
    id: row.id,
    kind: row.kind,
    reveal: row.reveal,
    title: row.title
  };
}

function readAnchor(value: string | null): AideContextNode['anchor'] {
  try {
    return parseStoredAnchorLink(value);
  } catch {
    return null;
  }
}

function readSourceCollections(source: AideContextNode) {
  const dives: string[] = [];
  const indexes = new Set(readCollectionNames(source.content));
  const rows = openDatabaseConnection().driver.queryAll<CollectionRow>(
    `SELECT id, kind, manual_child_order, parent_id, title, virtual_filter FROM nodes
     WHERE kind = 'folder' AND deleted_at IS NULL AND virtual_filter IS NOT NULL`,
    []
  );
  for (const row of rows) {
    const virtualFilter = parseVirtualNodeFilter(row.virtual_filter);
    const order = parseManualChildOrder(row.manual_child_order) ?? [];
    if (!order.includes(source.id)) continue;
    const dive = readDiveNode({
      id: row.id, kind: row.kind, manualChildOrder: order, parentNodeId: row.parent_id, title: row.title, virtualFilter
    });
    if (dive) dives.push(dive.title);
    else if (row.parent_id === VIRTUAL_ROOT_NODE_ID && isManualVirtualNodeFilter(virtualFilter)) indexes.add(row.title);
  }
  return { dives, indexes: [...indexes] };
}

function readCollectionNames(content: string) {
  try {
    return readTopicCollections(content);
  } catch {
    return [];
  }
}
