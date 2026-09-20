function visibleNodesCte(childIndex: string) {
  return `WITH RECURSIVE visible_nodes(id) AS (
  SELECT id
  FROM nodes
  WHERE parent_id IS NULL
    AND deleted_at IS NULL
  UNION ALL
  SELECT child.id
  FROM nodes child${childIndex}
  INNER JOIN visible_nodes parent
    ON parent.id = child.parent_id
  WHERE child.deleted_at IS NULL
)`;
}

export const VISIBLE_NODES_CTE_SQL = visibleNodesCte('');

// Snapshot reads must follow parent links without repeated scans of all live nodes.
export const SNAPSHOT_VISIBLE_NODES_CTE_SQL = visibleNodesCte(' INDEXED BY idx_nodes_parent_id');
