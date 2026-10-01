import { buildFtsSearchQueryPlan } from '../../lib/core/database/ftsSearchQuery.js';
import { searchStoredSources } from '../../lib/core/database/storedSourceSearch.js';
import type { WorkspaceRemovedSearchEntry } from '../../lib/core/database/workspaceRemovedSearchEntry.js';
import { buildExcerpt } from '../../lib/core/database/workspaceSearchResultBuilders.js';
import type { WorkspaceSearchResult } from '../../lib/core/database/workspaceSearchResults.js';

import { openDatabaseConnection } from './connection.js';

export function searchRemovedSources(query: string, groups: string[][]): WorkspaceSearchResult[] {
  const plan = buildFtsSearchQueryPlan(query, groups);
  return searchStoredSources(openDatabaseConnection().driver, 'removed', plan).map((row) => {
    const metadata = JSON.parse(row.metadata) as WorkspaceRemovedSearchEntry;
    const entry = { ...metadata, content: row.content, hasSourceUpdate: Boolean(metadata.hasSourceUpdate),
      id: row.source_key, title: row.title };
    return { id: row.source_key, kind: 'removed', title: row.title,
      excerpt: buildExcerpt(row.content, plan.normalizedQuery), updatedAt: row.updated_at,
      removedMatch: { entry, query: plan.normalizedQuery }, externalMatch: null, nodeMatch: null, pdfMatch: null };
  });
}
