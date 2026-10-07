import type { FullTextSearchIndexStrategy } from '../../lib/core/database/fullTextSearchIndexStrategy.js';
import type { SearchIndexInvalidationRow } from '../../lib/core/database/searchIndexInvalidations.js';
import type { WorkspaceSearchSourceState } from '../../lib/core/database/workspaceSearchSourceState.js';
import type { NodeVersionBodyStorage } from '../../lib/core/sync/syncNodeTombstoneVersion.js';

export type SearchIndexWork = (
  | { strategy: FullTextSearchIndexStrategy; source: WorkspaceSearchSourceState }
  | { rows: SearchIndexInvalidationRow[] }
) & { bodyStorage?: NodeVersionBodyStorage };

export type SearchIndexWorkerInput = SearchIndexWork & { dbPath: string; searchDbPath: string };
