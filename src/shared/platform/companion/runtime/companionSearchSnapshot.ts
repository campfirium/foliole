import { ANDROID_COMPANION_QUERY_DEFINITIONS } from '../../../../../lib/core/database/androidCompanionQueryDefinitions';
import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';

import { iosSearchParams, normalizeRow, readIosCompanionDatabase } from './iosCompanionActiveDatabase';

type SearchKind = 'topicSearch' | 'externalDocumentSearch' | 'pdfPageTextSearch';

async function readResults(db: DbPort, kind: SearchKind, query: string) {
  const definition = ANDROID_COMPANION_QUERY_DEFINITIONS[kind];
  // Project before crossing the bridge: result snapshots never carry document bodies.
  const projection = definition.columns.map(({ source }) => {
    if (source === 'content' || source === 'text') return `'' AS ${source}`;
    if (source === 'reference_json') return 'NULL AS reference_json';
    if (source === 'opening_text') return 'substr(opening_text, 1, 160) AS opening_text';
    return source;
  }).join(', ');
  const rows = await db.query<DbRow>(`SELECT ${projection} FROM (${definition.sql})`, iosSearchParams(definition.sql, query, -1));
  return rows.map((row) => normalizeRow(row, definition.columns));
}

export function loadCompanionSearchSnapshot(query: string) {
  // The owner serializes this whole operation with production writes. Do not
  // enqueue separate owner reads between categories or keep a transaction open.
  return readIosCompanionDatabase(async (db) => ({
    topics: await readResults(db, 'topicSearch', query),
    pdf: await readResults(db, 'pdfPageTextSearch', query),
    external: await readResults(db, 'externalDocumentSearch', query)
  }));
}
