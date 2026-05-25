import type { DatabaseDriver } from './driver.js';

const NODE_PATHS_CTE_SQL = `WITH RECURSIVE node_paths(node_id, path) AS (
    SELECT id, ''
    FROM nodes
    WHERE parent_id IS NULL
      AND deleted_at IS NULL
    UNION ALL
    SELECT
      child.id,
      CASE
        WHEN paths.path = '' THEN COALESCE(NULLIF(trim(parent.title), ''), 'Untitled')
        ELSE paths.path || ' / ' || COALESCE(NULLIF(trim(parent.title), ''), 'Untitled')
      END
    FROM nodes child
    INNER JOIN nodes parent
      ON parent.id = child.parent_id
     AND parent.deleted_at IS NULL
    INNER JOIN node_paths paths
      ON paths.node_id = parent.id
    WHERE child.deleted_at IS NULL
  )`;

const TEMP_SUBTREE_SEED_IDS_SQL = `CREATE TEMP TABLE IF NOT EXISTS temp_workspace_search_subtree_seed_ids (
  id TEXT PRIMARY KEY
) WITHOUT ROWID`;

const TEMP_SUBTREE_AFFECTED_IDS_SQL = `CREATE TEMP TABLE IF NOT EXISTS temp_workspace_search_subtree_affected_ids (
  id TEXT PRIMARY KEY
) WITHOUT ROWID`;

const INSERT_SUBTREE_AFFECTED_IDS_SQL = `WITH RECURSIVE node_descendants(id) AS (
    SELECT n.id
    FROM nodes n
    INNER JOIN temp_workspace_search_subtree_seed_ids seeds
      ON seeds.id = n.id
    UNION ALL
    SELECT child.id
    FROM nodes child
    INNER JOIN node_descendants
      ON child.parent_id = node_descendants.id
  )
  INSERT OR IGNORE INTO temp_workspace_search_subtree_affected_ids (id)
  SELECT id
  FROM node_descendants`;

const UPDATE_NODE_SEARCH_PATH_SQL = `${NODE_PATHS_CTE_SQL}
  UPDATE node_search
  SET path = COALESCE((SELECT path FROM node_paths WHERE node_paths.node_id = node_search.node_id), '')
  WHERE node_id IN (SELECT id FROM temp_workspace_search_subtree_affected_ids)
    AND EXISTS (SELECT 1 FROM nodes WHERE nodes.id = node_search.node_id AND nodes.deleted_at IS NULL)`;

const UPDATE_PDF_SEARCH_PATH_SQL = `${NODE_PATHS_CTE_SQL}
  UPDATE pdf_search
  SET path = COALESCE((SELECT path FROM node_paths WHERE node_paths.node_id = pdf_search.node_id), '')
  WHERE node_id IN (SELECT id FROM temp_workspace_search_subtree_affected_ids)
    AND EXISTS (SELECT 1 FROM nodes WHERE nodes.id = pdf_search.node_id AND nodes.deleted_at IS NULL)`;

function toUniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function prepareSubtreeAffectedIds(driver: DatabaseDriver, rootIds: string[]) {
  const seedIds = toUniqueIds(rootIds);
  driver.execute(TEMP_SUBTREE_SEED_IDS_SQL);
  driver.execute(TEMP_SUBTREE_AFFECTED_IDS_SQL);
  driver.execute('DELETE FROM temp_workspace_search_subtree_seed_ids');
  driver.execute('DELETE FROM temp_workspace_search_subtree_affected_ids');
  if (seedIds.length === 0) return false;
  const insertSeed = driver.prepare('INSERT OR IGNORE INTO temp_workspace_search_subtree_seed_ids (id) VALUES (?)');
  seedIds.forEach((id) => insertSeed.run([id]));
  driver.execute(INSERT_SUBTREE_AFFECTED_IDS_SQL);
  return true;
}

export function deleteWorkspaceSearchIndexForExistingSubtreeRootIds(driver: DatabaseDriver, rootIds: string[]) {
  const seedIds = toUniqueIds(rootIds);
  if (seedIds.length === 0) return;
  const placeholders = seedIds.map(() => '?').join(', ');
  const affectedIdsSql = `WITH RECURSIVE node_descendants(id) AS (
      SELECT id
      FROM nodes
      WHERE id IN (${placeholders})
      UNION ALL
      SELECT child.id
      FROM nodes child
      INNER JOIN node_descendants
        ON child.parent_id = node_descendants.id
    )
    SELECT id FROM node_descendants`;
  driver.execute(`DELETE FROM node_search WHERE node_id IN (${affectedIdsSql})`, seedIds);
  driver.execute(`DELETE FROM pdf_search WHERE node_id IN (${affectedIdsSql})`, seedIds);
}

export function deleteWorkspaceSearchIndexForSubtreeRootIds(driver: DatabaseDriver, rootIds: string[]) {
  if (!prepareSubtreeAffectedIds(driver, rootIds)) return;
  driver.execute('DELETE FROM node_search WHERE node_id IN (SELECT id FROM temp_workspace_search_subtree_affected_ids)');
  driver.execute('DELETE FROM pdf_search WHERE node_id IN (SELECT id FROM temp_workspace_search_subtree_affected_ids)');
}

export function syncWorkspaceSearchPathForSubtreeRootIds(driver: DatabaseDriver, rootIds: string[]) {
  if (!prepareSubtreeAffectedIds(driver, rootIds)) return;
  driver.execute(UPDATE_NODE_SEARCH_PATH_SQL);
  driver.execute(UPDATE_PDF_SEARCH_PATH_SQL);
}
