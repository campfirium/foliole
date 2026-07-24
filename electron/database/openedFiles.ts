import path from 'node:path';

import type { NativeExternalSearchBrowseEntry } from '../../lib/platform/nativeStorageContract.js';

import {
  OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID,
  OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH
} from './externalOpenedDocumentConstants.js';
import { loadOpenedExternalSearchBrowseEntries, loadOpenedExternalSearchFolder } from './externalOpenedDocuments.js';
import { listLocalFiles } from './localFiles.js';

function compareOpenedAt(left: NativeExternalSearchBrowseEntry, right: NativeExternalSearchBrowseEntry) {
  return (right.last_opened_at ?? '').localeCompare(left.last_opened_at ?? '');
}

function toLocalOpenedFileEntry(entry: ReturnType<typeof listLocalFiles>[number]): NativeExternalSearchBrowseEntry {
  return {
    absolute_path: entry.absolutePath,
    editable: entry.missingAt === null,
    extension: path.extname(entry.absolutePath).toLowerCase() === '.txt' ? 'txt' : 'md',
    file_name: path.basename(entry.absolutePath),
    file_size: entry.fileSize,
    folder_id: OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID,
    folder_path: OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH,
    imported_node_id: null,
    is_present: entry.missingAt === null,
    last_opened_at: entry.lastOpenedAt,
    modified_at: entry.modifiedAt ?? entry.lastOpenedAt,
    opening_text: null,
    reference: { absolute_path: entry.absolutePath, kind: 'local_path' },
    relative_path: entry.absolutePath,
    source_kind: 'local_file',
    title: entry.title
  };
}

export function loadOpenedFilesBrowseEntries() {
  const localEntries = listLocalFiles().map(toLocalOpenedFileEntry);
  const localPaths = new Set(localEntries.map((entry) => entry.absolute_path));
  const externalEntries = loadOpenedExternalSearchBrowseEntries().map((entry) => ({
    ...entry,
    editable: false,
    source_kind: 'external_document' as const
  })).filter((entry) => !localPaths.has(entry.absolute_path));
  return [...localEntries, ...externalEntries].sort(compareOpenedAt);
}

export function loadOpenedFilesFolder() {
  const entries = loadOpenedFilesBrowseEntries();
  if (entries.length === 0) {
    return null;
  }
  return {
    ...(loadOpenedExternalSearchFolder() ?? {
      attachment_mode: 'document_relative_first_then_fixed_root' as const,
      attachment_root_path: null,
      created_at: new Date().toISOString(),
      excluded_dirs: [],
      folder_path: OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH,
      id: OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID,
      indexed_at: new Date().toISOString(),
      last_error: null,
      status: 'ready' as const,
      updated_at: new Date().toISOString()
    }),
    document_count: entries.length,
    folder_path: OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH
  };
}
