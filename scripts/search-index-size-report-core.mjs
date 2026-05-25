import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  readContentBlobStats,
  readFtsShadowStats,
  readInvalidationStats,
  readKeepImportCacheStats,
  readNodeSearchStats
} from './search-index-size-report-sections.mjs';
import { getNumber } from './search-index-size-report-sql.mjs';

function openReadOnlyDatabase(dbPath) {
  if (!existsSync(dbPath)) {
    throw new Error(`database not found: ${dbPath}`);
  }
  return new DatabaseSync(dbPath, { readOnly: true });
}

function readDatabaseStats(db, dbPath) {
  const pageCount = getNumber(db, 'PRAGMA page_count');
  const pageSize = getNumber(db, 'PRAGMA page_size');
  const freelistCount = getNumber(db, 'PRAGMA freelist_count');
  return {
    path: dbPath,
    pageCount,
    pageSize,
    estimatedBytes: pageCount * pageSize,
    freelistCount,
    reusableBytes: freelistCount * pageSize
  };
}

export function buildSearchIndexSizeReport(dbPath) {
  const db = openReadOnlyDatabase(dbPath);
  try {
    return {
      database: readDatabaseStats(db, dbPath),
      nodeSearch: readNodeSearchStats(db),
      ftsShadowTables: {
        nodeSearch: readFtsShadowStats(db, 'node_search'),
        pdfSearch: readFtsShadowStats(db, 'pdf_search')
      },
      searchIndexInvalidations: readInvalidationStats(db),
      keepImportItemCache: readKeepImportCacheStats(db),
      contentBlobData: readContentBlobStats(db)
    };
  } finally {
    db.close();
  }
}
