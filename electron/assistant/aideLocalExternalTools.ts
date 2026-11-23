import { sliceAideMaterialText } from '../../lib/core/assistant/aideMaterialText.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { openExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';

import type { AideLocalToolHandler } from './aideLocalReadTools.js';

interface ExternalDocumentRow extends DatabaseRow {
  absolute_path: string;
  content: string;
  file_name: string;
  folder_path: string;
  modified_at: string;
  relative_path: string;
}

// External documents are files outside the library that Foliole indexes for search; their text is kept in the search cache.
export const AIDE_LOCAL_EXTERNAL_TOOLS: Record<string, AideLocalToolHandler> = {
  read_external_document: async (args) => {
    const row = openExternalSearchCacheDatabase().prepare(
      `SELECT absolute_path, content, file_name, folder_path, modified_at, relative_path
       FROM external_search_documents WHERE absolute_path = ? AND is_present = 1`
    ).get(String(args.path)) as ExternalDocumentRow | undefined;
    if (!row) return { ok: false, payload: { error: 'not_found', message: 'No External document has that path.' } };
    const segment = sliceAideMaterialText(row.content, typeof args.offset === 'number' ? args.offset : 0,
      typeof args.length === 'number' ? args.length : undefined);
    return { ok: true, payload: { document: {
      file_name: row.file_name, folder_path: row.folder_path, modified_at: row.modified_at, path: row.absolute_path,
      relative_path: row.relative_path, ...segment
    } } };
  }
};
