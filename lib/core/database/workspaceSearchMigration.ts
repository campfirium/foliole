import type { DatabaseMigrationTarget } from './migrationTypes.js';

function hasTable(sqlite: DatabaseMigrationTarget, tableName: string) {
  return sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).all(tableName).length > 0;
}

function readColumnNames(sqlite: DatabaseMigrationTarget, tableName: string) {
  return new Set(
    (sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: unknown }>)
      .map((column) => (typeof column.name === 'string' ? column.name : ''))
      .filter(Boolean)
  );
}

function hasColumns(sqlite: DatabaseMigrationTarget, tableName: string, requiredColumns: string[]) {
  const columnNames = readColumnNames(sqlite, tableName);
  return requiredColumns.every((column) => columnNames.has(column));
}

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

function recreateWorkspaceSearchTables(sqlite: DatabaseMigrationTarget) {
  sqlite.exec('DROP TABLE IF EXISTS node_search');
  sqlite.exec('DROP TABLE IF EXISTS pdf_search');
  sqlite.exec(`CREATE VIRTUAL TABLE node_search USING fts5(
    title,
    path,
    content,
    node_id UNINDEXED,
    updated_at UNINDEXED,
    tokenize = 'trigram'
  )`);
  sqlite.exec(`CREATE VIRTUAL TABLE pdf_search USING fts5(
    title,
    path,
    text,
    node_id UNINDEXED,
    attachment_id UNINDEXED,
    page UNINDEXED,
    updated_at UNINDEXED,
    page_text_length UNINDEXED,
    tokenize = 'trigram'
  )`);
  sqlite.exec('DELETE FROM node_search');
  sqlite.exec('DELETE FROM pdf_search');
}

function repopulateNodeSearch(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(`${NODE_PATHS_CTE_SQL}
    INSERT INTO node_search (title, path, content, node_id, updated_at)
    SELECT trim(n.title), COALESCE(paths.path, ''), n.content, n.id, n.updated_at
    FROM nodes n
    LEFT JOIN node_paths paths
      ON paths.node_id = n.id
    WHERE n.deleted_at IS NULL`);
}

function repopulatePdfSearch(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(`${NODE_PATHS_CTE_SQL}
    INSERT INTO pdf_search (title, path, text, node_id, attachment_id, page, updated_at, page_text_length)
    SELECT
      COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document'),
      COALESCE(paths.path, ''),
      ppt.text,
      n.id,
      a.id,
      CAST(ppt.page AS TEXT),
      n.updated_at,
      CAST(length(ppt.text) AS TEXT)
    FROM pdf_page_text ppt
    INNER JOIN attachments a
      ON a.id = ppt.attachment_id
     AND a.mime_type = 'application/pdf'
     AND a.pdf_index_status = 'ready'
    INNER JOIN node_attachments na
      ON na.attachment_id = a.id
     AND na.role = 'reference'
    INNER JOIN nodes n
      ON n.id = na.node_id
     AND n.deleted_at IS NULL
    LEFT JOIN node_paths paths
      ON paths.node_id = n.id`);
}

export function migrateWorkspaceSearchIndexes(sqlite: DatabaseMigrationTarget) {
  recreateWorkspaceSearchTables(sqlite);
  if (hasColumns(sqlite, 'nodes', ['id', 'title', 'content', 'updated_at', 'deleted_at'])) {
    repopulateNodeSearch(sqlite);
  }

  if (
    hasTable(sqlite, 'node_attachments') &&
    hasTable(sqlite, 'attachments') &&
    hasTable(sqlite, 'pdf_page_text') &&
    hasColumns(sqlite, 'nodes', ['id', 'updated_at', 'deleted_at'])
  ) {
    repopulatePdfSearch(sqlite);
  }
}
