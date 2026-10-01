import { buildNodeBodyContentSql } from './nodeBodyResolution.js';
import { NODE_PDF_RESOURCES_SQL } from './nodePdfResourcesSql.js';

const NODE_BODY_CONTENT_SQL = buildNodeBodyContentSql();

export const NODE_PATHS_CTE_SQL = `WITH RECURSIVE node_paths(node_id, path, is_trashed) AS (
    SELECT id, '', deleted_at IS NOT NULL
    FROM nodes
    WHERE parent_id IS NULL
    UNION ALL
    SELECT
      child.id,
      CASE
        WHEN paths.path = '' THEN COALESCE(NULLIF(trim(parent.title), ''), 'Untitled')
        ELSE paths.path || ' / ' || COALESCE(NULLIF(trim(parent.title), ''), 'Untitled')
      END,
      MAX(paths.is_trashed, child.deleted_at IS NOT NULL)
    FROM nodes child INDEXED BY idx_nodes_parent_id
    INNER JOIN nodes parent
      ON parent.id = child.parent_id
    INNER JOIN node_paths paths
      ON paths.node_id = parent.id
  )`;

export const NODE_SEARCH_INSERT_AFFECTED_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO search.node_search (title, path, content, node_id, updated_at, is_trashed)
  SELECT trim(n.title), COALESCE(paths.path, ''), ${NODE_BODY_CONTENT_SQL}, n.id, n.updated_at, COALESCE(paths.is_trashed, n.deleted_at IS NOT NULL)
  FROM nodes n
  LEFT JOIN node_paths paths
    ON paths.node_id = n.id
  LEFT JOIN content_blob_data cbd
    ON cbd.hash = n.body_blob_hash
  WHERE n.id IN (SELECT id FROM temp_workspace_search_affected_ids)

    AND paths.node_id IS NOT NULL`;

export const PDF_SEARCH_INSERT_AFFECTED_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO search.pdf_search (title, path, text, node_id, attachment_id, page, updated_at, page_text_length, is_trashed)
  SELECT
    COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document'),
    COALESCE(paths.path, ''),
    ppt.text,
    n.id,
    a.id,
    CAST(ppt.page AS TEXT),
    n.updated_at,
    CAST(length(ppt.text) AS TEXT),
    COALESCE(paths.is_trashed, n.deleted_at IS NOT NULL)
  FROM (${NODE_PDF_RESOURCES_SQL}) a
  INNER JOIN nodes n
    ON n.id = a.node_id
  LEFT JOIN node_paths paths
    ON paths.node_id = n.id
  INNER JOIN pdf_page_text ppt
    ON ppt.attachment_id = a.id
  WHERE a.node_id IN (SELECT id FROM temp_workspace_search_affected_ids)
    AND a.pdf_index_status = 'ready'
    AND paths.node_id IS NOT NULL`;

export const NODE_SEARCH_REBUILD_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO search.node_search (title, path, content, node_id, updated_at, is_trashed)
  SELECT trim(n.title), COALESCE(paths.path, ''), ${NODE_BODY_CONTENT_SQL}, n.id, n.updated_at, COALESCE(paths.is_trashed, n.deleted_at IS NOT NULL)
  FROM nodes n
  LEFT JOIN node_paths paths
    ON paths.node_id = n.id
  LEFT JOIN content_blob_data cbd
    ON cbd.hash = n.body_blob_hash`;

export const PDF_SEARCH_REBUILD_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO search.pdf_search (title, path, text, node_id, attachment_id, page, updated_at, page_text_length, is_trashed)
  SELECT
    COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document'),
    COALESCE(paths.path, ''),
    ppt.text,
    n.id,
    a.id,
    CAST(ppt.page AS TEXT),
    n.updated_at,
    CAST(length(ppt.text) AS TEXT),
    COALESCE(paths.is_trashed, n.deleted_at IS NOT NULL)
  FROM pdf_page_text ppt
  INNER JOIN (${NODE_PDF_RESOURCES_SQL}) a
    ON a.id = ppt.attachment_id AND a.pdf_index_status = 'ready'
  INNER JOIN nodes n
    ON n.id = a.node_id
  LEFT JOIN node_paths paths
    ON paths.node_id = n.id`;
