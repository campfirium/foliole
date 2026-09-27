import { matchesFtsSearchFields, type FtsSearchQueryPlan } from '../../lib/core/database/ftsSearchQuery.js';

import type { ExternalSearchRow } from './externalSearchCacheSupport.js';

export function readAliasFallbackExternalRows(db: import('better-sqlite3').Database, plan: FtsSearchQueryPlan) {
  if (!plan.expandedExpression) return [];
  const rows: ExternalSearchRow[] = [];
  const statement = db.prepare(`SELECT absolute_path, file_name, folder_id, folder_path,
    relative_path, content AS text, modified_at, 500 AS rank
    FROM external_search_documents
    WHERE is_present = 1 AND (instr(lower(file_name), ?) > 0
      OR instr(lower(relative_path), ?) > 0 OR instr(lower(content), ?) > 0)`);
  for (const spelling of plan.aliasSpellings) {
    for (const row of statement.all(spelling, spelling, spelling) as ExternalSearchRow[]) {
      if (matchesFtsSearchFields([row.file_name, row.relative_path, row.text], plan)) rows.push(row);
    }
  }
  return rows;
}
