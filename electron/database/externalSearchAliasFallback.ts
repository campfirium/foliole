import { type FtsSearchQueryPlan } from '../../lib/core/database/ftsSearchQuery.js';

import type { ExternalSearchRow } from './externalSearchCacheSupport.js';

export function readAliasFallbackExternalRows(db: import('better-sqlite3').Database, plan: FtsSearchQueryPlan) {
  if (!plan.expandedExpression) return [];
  const clauses = plan.aliasSpellings.map(() => `(instr(lower(file_name), ?) > 0
    OR instr(lower(relative_path), ?) > 0 OR instr(lower(content), ?) > 0)`);
  return db.prepare(`SELECT absolute_path, file_name, folder_id, folder_path,
    relative_path, content AS text, modified_at, 500 AS rank
    FROM external_search_fts WHERE ${clauses.join(' OR ')}`)
    .all(...plan.aliasSpellings.flatMap((term) => [term, term, term])) as ExternalSearchRow[];
}
