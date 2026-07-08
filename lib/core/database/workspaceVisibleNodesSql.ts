export const VISIBLE_NODES_CTE_SQL = `WITH RECURSIVE visible_nodes(id) AS (
  SELECT id
  FROM nodes
  WHERE parent_id IS NULL
    AND deleted_at IS NULL
  UNION ALL
  SELECT child.id
  FROM nodes child
  INNER JOIN visible_nodes parent
    ON parent.id = child.parent_id
  WHERE child.deleted_at IS NULL
)`;
