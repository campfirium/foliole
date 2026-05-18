import { OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID } from './externalOpenedDocumentConstants.js';
import { openExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';

export function pruneExternalSearchCache(validFolderIds: string[]) {
  const db = openExternalSearchCacheDatabase();
  const retainedFolderIds = [...validFolderIds, OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID];
  const placeholders = retainedFolderIds.map(() => '?').join(', ');
  const deleteDocumentsSql = placeholders
    ? `DELETE FROM external_search_documents WHERE folder_id NOT IN (${placeholders})`
    : 'DELETE FROM external_search_documents';
  const deleteFtsSql = placeholders
    ? `DELETE FROM external_search_fts WHERE folder_id NOT IN (${placeholders})`
    : 'DELETE FROM external_search_fts';
  db.transaction(() => {
    db.prepare(deleteDocumentsSql).run(...retainedFolderIds);
    db.prepare(deleteFtsSql).run(...retainedFolderIds);
  })();
}
