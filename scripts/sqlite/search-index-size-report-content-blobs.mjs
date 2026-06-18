import { getNumber, tableExists } from './search-index-size-report-sql.mjs';

const ZERO_SELECT = 'SELECT NULL AS hash WHERE 0';

export function readContentBlobStats(db) {
  if (!tableExists(db, 'content_blob_data')) {
    return emptyContentBlobStats();
  }
  const refs = referenceSql(db);
  const manifest = manifestSql(db);
  return {
    totalRows: getNumber(db, 'SELECT COUNT(*) FROM content_blob_data'),
    totalBytes: getNumber(db, 'SELECT COALESCE(SUM(length(data)), 0) FROM content_blob_data'),
    referencedByNodes: countReferencedRows(db, refs.node),
    referencedByNodeBytes: sumReferencedBytes(db, refs.node),
    referencedByExternalDocuments: countReferencedRows(db, refs.externalDocument),
    referencedByExternalDocumentBytes: sumReferencedBytes(db, refs.externalDocument),
    knownOwnerRows: countReferencedRows(db, refs.knownOwner),
    knownOwnerBytes: sumReferencedBytes(db, refs.knownOwner),
    manifestCoveredRows: countReferencedRows(db, manifest.textBody),
    manifestCoveredBytes: sumReferencedBytes(db, manifest.textBody),
    manifestOnlyRows: countManifestOnlyRows(db, manifest.textBody),
    manifestOnlyBytes: sumManifestOnlyBytes(db, manifest.textBody),
    unreferencedByKnownOwnersRows: countUnreferencedRows(db, refs.knownOwner),
    unreferencedByKnownOwnersBytes: sumUnreferencedBytes(db, refs.knownOwner)
  };
}

function emptyContentBlobStats() {
  return {
    totalRows: 0,
    totalBytes: 0,
    referencedByNodes: 0,
    referencedByNodeBytes: 0,
    referencedByExternalDocuments: 0,
    referencedByExternalDocumentBytes: 0,
    knownOwnerRows: 0,
    knownOwnerBytes: 0,
    manifestCoveredRows: 0,
    manifestCoveredBytes: 0,
    manifestOnlyRows: 0,
    manifestOnlyBytes: 0,
    unreferencedByKnownOwnersRows: 0,
    unreferencedByKnownOwnersBytes: 0
  };
}

function referenceSql(db) {
  const node = hashColumnExists(db, 'nodes')
    ? 'SELECT DISTINCT body_blob_hash AS hash FROM nodes WHERE body_blob_hash IS NOT NULL'
    : ZERO_SELECT;
  const externalDocument = hashColumnExists(db, 'external_documents')
    ? 'SELECT DISTINCT body_blob_hash AS hash FROM external_documents WHERE body_blob_hash IS NOT NULL'
    : ZERO_SELECT;
  return {
    externalDocument,
    knownOwner: `${node} UNION ${externalDocument}`,
    node
  };
}

function manifestSql(db) {
  return {
    textBody: tableExists(db, 'content_blobs')
      ? "SELECT hash, stored_size_bytes FROM content_blobs WHERE kind = 'text_body'"
      : 'SELECT NULL AS hash, 0 AS stored_size_bytes WHERE 0'
  };
}

function hashColumnExists(db, tableName) {
  if (!tableExists(db, tableName)) {
    return false;
  }
  return db.prepare(`PRAGMA table_info("${tableName}")`).all()
    .some((column) => column.name === 'body_blob_hash');
}

function countReferencedRows(db, refSql) {
  return getNumber(db, `
    WITH refs AS (${refSql})
    SELECT COUNT(DISTINCT cbd.hash)
    FROM content_blob_data cbd
    INNER JOIN refs ON refs.hash = cbd.hash
  `);
}

function sumReferencedBytes(db, refSql) {
  return getNumber(db, `
    WITH refs AS (${refSql})
    SELECT COALESCE(SUM(length(cbd.data)), 0)
    FROM content_blob_data cbd
    WHERE cbd.hash IN (SELECT hash FROM refs)
  `);
}

function countUnreferencedRows(db, refSql) {
  return getNumber(db, `
    WITH refs AS (${refSql})
    SELECT COUNT(*)
    FROM content_blob_data cbd
    LEFT JOIN refs ON refs.hash = cbd.hash
    WHERE refs.hash IS NULL
  `);
}

function sumUnreferencedBytes(db, refSql) {
  return getNumber(db, `
    WITH refs AS (${refSql})
    SELECT COALESCE(SUM(length(cbd.data)), 0)
    FROM content_blob_data cbd
    LEFT JOIN refs ON refs.hash = cbd.hash
    WHERE refs.hash IS NULL
  `);
}

function countManifestOnlyRows(db, manifestSqlText) {
  return getNumber(db, `
    WITH manifest AS (${manifestSqlText})
    SELECT COUNT(*)
    FROM manifest
    LEFT JOIN content_blob_data cbd ON cbd.hash = manifest.hash
    WHERE cbd.hash IS NULL
  `);
}

function sumManifestOnlyBytes(db, manifestSqlText) {
  return getNumber(db, `
    WITH manifest AS (${manifestSqlText})
    SELECT COALESCE(SUM(manifest.stored_size_bytes), 0)
    FROM manifest
    LEFT JOIN content_blob_data cbd ON cbd.hash = manifest.hash
    WHERE cbd.hash IS NULL
  `);
}
