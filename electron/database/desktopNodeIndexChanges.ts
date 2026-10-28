import type { Database } from 'better-sqlite3';

import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { PriorityIndexNode } from '../../lib/core/nodes/workspaceNodePriorityState.js';

const NODE_COLUMNS = ['id', 'parent_id', 'priority', 'created_at', 'deleted_at', 'kind', 'shelved_at',
  'body_blob_hash', 'content', 'reveal', 'anchor_link', 'anchor_resolution_status'];

// TEMP writes roll back with the originating statement/savepoint/outer transaction.
export function installDesktopNodeIndexChanges(sqlite: Database) {
  sqlite.exec(`CREATE TEMP TABLE IF NOT EXISTS desktop_node_index_changes (id TEXT PRIMARY KEY);
    CREATE TEMP TABLE IF NOT EXISTS desktop_node_index_order_dirty (id INTEGER PRIMARY KEY);`);
  for (const event of ['INSERT', 'DELETE', 'UPDATE'] as const) {
    const row = event === 'DELETE' ? 'OLD' : 'NEW';
    const update = event === 'UPDATE' ? ` OF ${NODE_COLUMNS.join(',')}` : '';
    sqlite.exec(`CREATE TEMP TRIGGER IF NOT EXISTS desktop_node_index_${event.toLowerCase()}
      AFTER ${event}${update} ON main.nodes BEGIN
        INSERT INTO desktop_node_index_changes VALUES (${row}.id) ON CONFLICT(id) DO NOTHING;
        ${event === 'UPDATE' ? 'INSERT INTO desktop_node_index_changes VALUES (OLD.id) ON CONFLICT(id) DO NOTHING;' : ''}
      END`);
    sqlite.exec(`CREATE TEMP TRIGGER IF NOT EXISTS desktop_node_index_order_${event.toLowerCase()}
      AFTER ${event} ON main.parent_child_order BEGIN
        INSERT INTO desktop_node_index_order_dirty VALUES (1) ON CONFLICT(id) DO NOTHING;
      END`);
  }
}

export function desktopNodeIndexHasChanges(sqlite: Database) {
  return Boolean(sqlite.prepare(`SELECT 1 FROM temp.desktop_node_index_changes
    UNION ALL SELECT 1 FROM temp.desktop_node_index_order_dirty LIMIT 1`).get());
}

export function clearDesktopNodeIndexChanges(sqlite: Database) {
  sqlite.exec('DELETE FROM temp.desktop_node_index_changes; DELETE FROM temp.desktop_node_index_order_dirty');
}

interface NodeRow {
  id: string; parent_id: string | null; priority: number | null; created_at: string;
  deleted_at: string | null; kind: string; shelved_at: string | null;
  has_content: number; has_reveal: number; anchor_link: string | null;
}

export function readDesktopIndexNodes(sqlite: Database, ids?: readonly string[]): PriorityIndexNode[] {
  const rows = sqlite.prepare(`SELECT id, parent_id, priority, created_at, deleted_at, kind, shelved_at,
    CASE WHEN body_blob_hash IS NOT NULL OR LENGTH(TRIM(content)) > 0 THEN 1 ELSE 0 END AS has_content,
    CASE WHEN reveal IS NOT NULL THEN 1 ELSE 0 END AS has_reveal,
    CASE WHEN anchor_resolution_status LIKE 'unmapped_%' THEN NULL ELSE anchor_link END AS anchor_link
    FROM nodes${ids ? ' WHERE id IN (SELECT value FROM json_each(?))' : ''}`)
    .all(...(ids ? [JSON.stringify(ids)] : [])) as NodeRow[];
  return rows.map(row => ({ id: row.id, parentNodeId: row.parent_id, priority: row.priority,
    createdAt: row.created_at, deletedAt: row.deleted_at, kind: row.kind, shelvedAt: row.shelved_at,
    hasContent: row.has_content === 1, hasReveal: row.has_reveal === 1,
    anchorKind: parseStoredAnchorLink(row.anchor_link)?.kind ?? null }));
}
