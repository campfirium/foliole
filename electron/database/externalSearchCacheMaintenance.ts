import { openExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';

export function pruneExternalSearchCache(validFolderIds: string[]) {
  const db = openExternalSearchCacheDatabase();
  const placeholders = validFolderIds.map(() => '?').join(', ');
  const deleteDocumentsSql = placeholders
    ? `DELETE FROM external_search_documents WHERE folder_id NOT IN (${placeholders})`
    : 'DELETE FROM external_search_documents';
  const deleteFtsSql = placeholders
    ? `DELETE FROM external_search_fts WHERE folder_id NOT IN (${placeholders})`
    : 'DELETE FROM external_search_fts';
  db.transaction(() => {
    db.prepare(deleteDocumentsSql).run(...validFolderIds);
    db.prepare(deleteFtsSql).run(...validFolderIds);
  })();
}
