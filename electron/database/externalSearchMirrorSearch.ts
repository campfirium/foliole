import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { type FtsSearchQueryPlan } from '../../lib/core/database/ftsSearchQuery.js';
import { searchStoredSources, type StoredSourceSearchRow } from '../../lib/core/database/storedSourceSearch.js';

import { openDatabaseConnection } from './connection.js';
import type { ExternalSearchRow } from './externalSearchCacheSupport.js';
import { loadExternalSearchFolders } from './externalSearchFolders.js';

interface MirrorSearchRow extends DatabaseRow {
  document_id: string;
  file_name: string;
  folder_id: string;
  modified_at: string;
  relative_path: string;
  text: string;
}

export function searchExternalMirrorDocuments(queryPlan: FtsSearchQueryPlan, candidates?: readonly StoredSourceSearchRow[]): ExternalSearchRow[] {
  const folders = loadExternalSearchFolders().filter((folder) =>
    folder.access_mode === 'remote_mirror' && folder.mirror_enabled !== false
  );
  if (!queryPlan.normalizedQuery || folders.length === 0) return [];
  const ids = folders.map((folder) => folder.id);
  const rows = (candidates ?? searchStoredSources(openDatabaseConnection().driver, 'external', queryPlan))
    .map((indexed) => ({ ...JSON.parse(indexed.metadata), text: indexed.content, modified_at: indexed.updated_at }) as MirrorSearchRow)
    .filter((row) => ids.includes(row.folder_id));
  const folderPathById = new Map(folders.map((folder) => [folder.id, folder.folder_path]));
  return rows.map((row) => ({
    absolute_path: `mirror-document:${row.document_id}`,
    file_name: row.file_name,
    folder_id: row.folder_id,
    folder_path: folderPathById.get(row.folder_id) ?? '',
    modified_at: row.modified_at,
    rank: 900,
    relative_path: row.relative_path,
    text: row.text
  }));
}
