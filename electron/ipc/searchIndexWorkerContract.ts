import type { FullTextSearchIndexStrategy } from '../../lib/core/database/fullTextSearchIndexStrategy.js';
import type { SearchIndexInvalidationRow } from '../../lib/core/database/searchIndexInvalidations.js';
import type { WorkspaceSearchSourceState } from '../../lib/core/database/workspaceSearchSourceState.js';

export type SearchIndexWork =
  | { strategy: FullTextSearchIndexStrategy; source: WorkspaceSearchSourceState }
  | { rows: SearchIndexInvalidationRow[] };

export type SearchIndexWorkerInput = SearchIndexWork & { dbPath: string; searchDbPath: string };
