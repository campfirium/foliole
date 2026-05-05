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

export function migrateWorkspaceSearchIndexes(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS node_search USING fts5(
    title,
    content,
    node_id UNINDEXED,
    updated_at UNINDEXED,
    tokenize = 'trigram'
  )`);
  sqlite.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS pdf_search USING fts5(
    title,
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

  if (hasColumns(sqlite, 'nodes', ['id', 'title', 'content', 'updated_at', 'deleted_at'])) {
    sqlite.exec(`INSERT INTO node_search (title, content, node_id, updated_at)
      SELECT trim(title), content, id, updated_at
      FROM nodes
      WHERE deleted_at IS NULL`);
  }

  if (
    hasTable(sqlite, 'node_attachments') &&
    hasTable(sqlite, 'attachments') &&
    hasTable(sqlite, 'pdf_page_text') &&
    hasColumns(sqlite, 'nodes', ['id', 'updated_at', 'deleted_at'])
  ) {
    sqlite.exec(`INSERT INTO pdf_search (title, text, node_id, attachment_id, page, updated_at, page_text_length)
      SELECT
        COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document'),
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
       AND n.deleted_at IS NULL`);
  }
}
