import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { matchesFtsSearchFields, type FtsSearchQueryPlan } from '../../lib/core/database/ftsSearchQuery.js';

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

export function searchExternalMirrorDocuments(queryPlan: FtsSearchQueryPlan): ExternalSearchRow[] {
  const folders = loadExternalSearchFolders().filter((folder) =>
    folder.access_mode === 'remote_mirror' && folder.mirror_enabled !== false
  );
  if (!queryPlan.normalizedQuery || folders.length === 0) return [];
  const ids = folders.map((folder) => folder.id);
  const candidates = queryPlan.advancedQuery
    ? [...new Set([...queryPlan.aliasSpellings, ...queryPlan.queryTokens
      .filter((token) => !['AND', 'OR', 'NOT'].includes(token))
      .map((token) => token.toLocaleLowerCase())])]
    : [queryPlan.normalizedQuery];
  const candidateFilter = queryPlan.aliasSpellings.length === 0
    ? `AND EXISTS (SELECT 1 FROM json_each(?) candidate
         WHERE instr(lower(d.file_name), candidate.value) > 0
           OR instr(lower(d.relative_path), candidate.value) > 0
           OR instr(lower(COALESCE(CAST(cbd.data AS TEXT), d.content)), candidate.value) > 0)`
    : '';
  const rows = openDatabaseConnection().driver.queryAll<MirrorSearchRow>(
    `SELECT d.document_id, d.folder_id, d.file_name, d.relative_path,
      d.source_modified_at AS modified_at, COALESCE(CAST(cbd.data AS TEXT), d.content) AS text
     FROM external_documents d LEFT JOIN content_blob_data cbd ON cbd.hash = d.body_blob_hash
     WHERE d.is_present = 1 AND d.folder_id IN (${ids.map(() => '?').join(', ')})
       ${candidateFilter}
     ORDER BY d.source_modified_ms DESC`, queryPlan.aliasSpellings.length === 0
      ? [...ids, JSON.stringify(candidates)] : ids
  ).filter((row) => matchesFtsSearchFields([row.file_name, row.relative_path, row.text], queryPlan));
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
