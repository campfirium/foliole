import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { openDatabaseConnection } from '../database/connection.js';

interface TrashedMaterial extends DatabaseRow {
  deleted_at: string;
  id: string;
  kind: string;
  parent_id: string | null;
  title: string;
  updated_at: string;
}

export function listAgentControlMaterialTrash(query: string, limit: number, offset: number) {
  // Desktop deletion stamps the subtree. Agent deletion can hide descendants through their ancestor alone.
  const rows = openDatabaseConnection().driver.queryAll<TrashedMaterial>(
    `WITH RECURSIVE matching_ancestors(id, parent_id, deleted_at) AS (
       SELECT id, parent_id, deleted_at FROM nodes
       WHERE ? <> '' AND instr(source_search_lower(title), ?) > 0
       UNION
       SELECT parent.id, parent.parent_id, parent.deleted_at
       FROM matching_ancestors child JOIN nodes parent ON parent.id = child.parent_id
       WHERE coalesce(trim(child.deleted_at), '') = '' OR trim(parent.deleted_at) <> ''
     )
     SELECT n.id, n.kind, n.title, n.parent_id, n.deleted_at, n.updated_at
     FROM nodes n LEFT JOIN nodes parent ON parent.id = n.parent_id
     WHERE trim(n.deleted_at) <> '' AND coalesce(trim(parent.deleted_at), '') = ''
       AND (? = '' OR n.id IN (SELECT id FROM matching_ancestors))
     ORDER BY n.deleted_at DESC, n.id ASC
     LIMIT ? OFFSET ?`,
    [query, query, query, limit + 1, offset]
  );
  return {
    results: rows.slice(0, limit),
    next_offset: rows.length > limit ? offset + limit : null
  };
}
