import {
  estimateTablePayloadBytes,
  getNumber,
  numberValue,
  safeSection,
  tableExists
} from './search-index-size-report-sql.mjs';

const TOP_DUPLICATE_LIMIT = 10;

export function readNodeSearchStats(db) {
  return safeSection(
    db,
    'node_search',
    () => {
      const duplicateNodeIds = db
        .prepare(
          `
      SELECT node_id, COUNT(*) AS rows
      FROM node_search
      GROUP BY node_id
      HAVING COUNT(*) > 1
      ORDER BY rows DESC, node_id ASC
      LIMIT ?
    `
        )
        .all(TOP_DUPLICATE_LIMIT);
      const topDuplicatedContent = db
        .prepare(
          `
      SELECT length(content) AS contentBytes, COUNT(*) AS copies
      FROM node_search
      GROUP BY content
      HAVING COUNT(*) > 1
      ORDER BY (length(content) * COUNT(*)) DESC
      LIMIT ?
    `
        )
        .all(TOP_DUPLICATE_LIMIT);
      return {
        totalRows: getNumber(db, 'SELECT COUNT(*) FROM node_search'),
        distinctNodeIds: getNumber(db, 'SELECT COUNT(DISTINCT node_id) FROM node_search'),
        duplicateNodeIdGroups: getNumber(
          db,
          `
        SELECT COUNT(*) FROM (
          SELECT node_id FROM node_search GROUP BY node_id HAVING COUNT(*) > 1
        )
      `
        ),
        duplicateNodeRows: getNumber(
          db,
          `
        SELECT COALESCE(SUM(rows - 1), 0) FROM (
          SELECT COUNT(*) AS rows FROM node_search GROUP BY node_id HAVING COUNT(*) > 1
        )
      `
        ),
        distinctContentCount: getNumber(db, 'SELECT COUNT(DISTINCT content) FROM node_search'),
        topDuplicateNodeIds: duplicateNodeIds.map((row) => ({
          nodeId: row.node_id,
          rows: numberValue(row.rows)
        })),
        topDuplicatedContent: topDuplicatedContent.map((row) => ({
          contentBytes: numberValue(row.contentBytes),
          copies: numberValue(row.copies)
        }))
      };
    },
    emptyNodeSearchStats()
  );
}

function emptyNodeSearchStats() {
  return {
    totalRows: 0,
    distinctNodeIds: 0,
    duplicateNodeIdGroups: 0,
    duplicateNodeRows: 0,
    distinctContentCount: 0,
    topDuplicateNodeIds: [],
    topDuplicatedContent: []
  };
}

export function readFtsShadowStats(db, prefix) {
  const shadowTables = ['data', 'idx', 'content', 'docsize', 'config'].map(
    (suffix) => `${prefix}_${suffix}`
  );
  return Object.fromEntries(
    shadowTables.map((tableName) => [
      tableName,
      {
        estimatedPayloadBytes: estimateTablePayloadBytes(db, tableName),
        rows: tableExists(db, tableName) ? getNumber(db, `SELECT COUNT(*) FROM "${tableName}"`) : 0
      }
    ])
  );
}

export function readInvalidationStats(db) {
  return safeSection(
    db,
    'search_index_invalidations',
    () => ({
      totalRows: getNumber(db, 'SELECT COUNT(*) FROM search_index_invalidations'),
      estimatedPayloadBytes: estimateTablePayloadBytes(db, 'search_index_invalidations'),
      completedAtRange: db
        .prepare(
          `
      SELECT MIN(completed_at) AS minCompletedAt, MAX(completed_at) AS maxCompletedAt
      FROM search_index_invalidations
      WHERE status = 'completed'
    `
        )
        .get(),
      byStatus: db
        .prepare(
          `
      SELECT status, COUNT(*) AS rows
      FROM search_index_invalidations
      GROUP BY status
      ORDER BY status ASC
    `
        )
        .all()
        .map((row) => ({ status: row.status, rows: numberValue(row.rows) }))
    }),
    { totalRows: 0, estimatedPayloadBytes: 0, completedAtRange: null, byStatus: [] }
  );
}

export function readKeepImportCacheStats(db) {
  return safeSection(
    db,
    'keep_import_item_cache',
    () => ({
      totalRows: getNumber(db, 'SELECT COUNT(*) FROM keep_import_item_cache'),
      contentBytes: getNumber(
        db,
        'SELECT COALESCE(SUM(length(content)), 0) FROM keep_import_item_cache'
      ),
      previewBytes: getNumber(
        db,
        'SELECT COALESCE(SUM(length(content_preview)), 0) FROM keep_import_item_cache'
      ),
      rowsWhereContentEqualsPreview: getNumber(
        db,
        `
      SELECT COUNT(*) FROM keep_import_item_cache
      WHERE content IS NOT NULL
        AND content_preview IS NOT NULL
        AND content = content_preview
    `
      ),
      rowsWherePreviewIsPrefixOfContent: getNumber(
        db,
        `
      SELECT COUNT(*) FROM keep_import_item_cache
      WHERE content IS NOT NULL
        AND content_preview IS NOT NULL
        AND content != content_preview
        AND instr(content, content_preview) = 1
    `
      )
    }),
    {
      totalRows: 0,
      contentBytes: 0,
      previewBytes: 0,
      rowsWhereContentEqualsPreview: 0,
      rowsWherePreviewIsPrefixOfContent: 0
    }
  );
}

export function readContentBlobStats(db) {
  if (!tableExists(db, 'content_blob_data')) {
    return { totalRows: 0, totalBytes: 0, referencedByNodes: 0, orphanRows: 0, orphanBytes: 0 };
  }
  const nodeRefsAvailable = tableExists(db, 'nodes');
  return {
    totalRows: getNumber(db, 'SELECT COUNT(*) FROM content_blob_data'),
    totalBytes: getNumber(db, 'SELECT COALESCE(SUM(length(data)), 0) FROM content_blob_data'),
    referencedByNodes: nodeRefsAvailable
      ? getNumber(
          db,
          `
      SELECT COUNT(DISTINCT cbd.hash)
      FROM content_blob_data cbd
      INNER JOIN nodes n ON n.body_blob_hash = cbd.hash
    `
        )
      : 0,
    orphanRows: nodeRefsAvailable
      ? getNumber(
          db,
          `
      SELECT COUNT(*)
      FROM content_blob_data cbd
      LEFT JOIN nodes n ON n.body_blob_hash = cbd.hash
      WHERE n.id IS NULL
    `
        )
      : 0,
    orphanBytes: nodeRefsAvailable
      ? getNumber(
          db,
          `
      SELECT COALESCE(SUM(length(cbd.data)), 0)
      FROM content_blob_data cbd
      LEFT JOIN nodes n ON n.body_blob_hash = cbd.hash
      WHERE n.id IS NULL
    `
        )
      : 0
  };
}
