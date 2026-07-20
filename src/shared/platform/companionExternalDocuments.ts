import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import {
  FolioleCompanionSync,
  isNativeCompanionExternalDirectoryRuntime,
  isNativeCompanionExternalDocumentReadRuntime,
  isNativeCompanionExternalDocumentSearchRuntime,
  isNativeCompanionSyncObjectReadRuntime
} from './companionWorkspaceRuntimeRepository';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from './externalLibraryBrowseModel';
import {
  parseExternalLibraryFolderOrder,
  sortExternalLibraryFolders
} from './externalLibraryFolderOrder';

export interface CompanionExternalDocument {
  bodyStatus?: 'failed' | 'fetching' | 'missing' | 'ready';
  content: string;
  document_id: string;
  extension: string;
  file_name: string;
  folder_id: string;
  opening_text: string | null;
  relative_path: string;
  title: string;
  updated_at: string;
}

export interface CompanionExternalDocumentSearchResult extends CompanionExternalDocument {
  excerpt: string;
  match_start: number;
}

interface CompanionExternalDirectoryEntry extends ExternalLibraryBrowseEntry {
  documentId: string;
}

export interface CompanionExternalDirectory {
  entries: CompanionExternalDirectoryEntry[];
  folders: ExternalLibraryFolder[];
}

type NativeExternalDocument = Omit<CompanionExternalDocument, 'bodyStatus'> & {
  content_status?: 'failed' | 'fetching' | 'missing' | 'ready';
};

type NativeExternalDocumentSearchResult = Omit<CompanionExternalDocumentSearchResult, 'bodyStatus'> & {
  content_status?: 'failed' | 'fetching' | 'missing' | 'ready';
};

interface SyncSettingPayload {
  key?: string;
  value_json?: string;
}

export async function loadCompanionExternalDocument(documentId: string) {
  if (!isNativeCompanionExternalDocumentReadRuntime()) {
    return null as CompanionExternalDocument | null;
  }
  const document = (await FolioleCompanionSync.loadExternalDocument({ document_id: documentId })).document as NativeExternalDocument | null;
  return document ? normalizeExternalDocument(document) : null;
}

export async function loadCompanionExternalDirectory() {
  if (!isNativeCompanionExternalDirectoryRuntime()) {
    return { entries: [], folders: [] } satisfies CompanionExternalDirectory;
  }
  const directory = await FolioleCompanionSync.loadExternalDirectory();
  const folderOrder = await loadCompanionExternalFolderOrder();
  return {
    entries: directory.entries.map((entry) => ({
      absolutePath: entry.absolute_path,
      documentId: entry.document_id,
      extension: entry.extension,
      fileName: entry.file_name,
      folderId: entry.folder_id,
      modifiedAt: entry.modified_at,
      openingText: entry.opening_text,
      relativePath: entry.relative_path,
      title: entry.title
    })),
    folders: sortExternalLibraryFolders(directory.folders.map((folder) => ({
      documentCount: folder.document_count,
      folderPath: folder.folder_path,
      id: folder.id
    })), folderOrder)
  } satisfies CompanionExternalDirectory;
}

async function loadCompanionExternalFolderOrder() {
  if (!isNativeCompanionSyncObjectReadRuntime()) return [];
  const index = await FolioleCompanionSync.loadSyncIndex();
  const settingObjectIds = index.entries
    .filter((entry) => entry.object_type === 'setting' && entry.object_id.endsWith(':app_settings'))
    .map((entry) => entry.object_id);
  if (settingObjectIds.length === 0) return [];
  const objects = await FolioleCompanionSync.loadSyncObjects({
    object_ids: settingObjectIds,
    object_types: ['setting']
  });
  const settings = objects.objects
    .map((object) => parseSettingPayload(object.payload_json))
    .filter((payload): payload is SyncSettingPayload => Boolean(payload?.key === 'app_settings' && payload.value_json))
    .at(-1);
  return parseExternalLibraryFolderOrder(parseAppSettingValue(settings?.value_json));
}

function parseSettingPayload(payloadJson: string | null): SyncSettingPayload | null {
  if (!payloadJson) return null;
  try {
    return JSON.parse(payloadJson) as SyncSettingPayload;
  } catch {
    return null;
  }
}

function parseAppSettingValue(valueJson: string | undefined) {
  if (!valueJson) return null;
  try {
    const settings = JSON.parse(valueJson) as Record<string, unknown>;
    const value = settings[APP_SETTINGS_STORAGE_KEYS.externalLibraryFolderOrder];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export async function searchCompanionExternalDocuments(query: string, limit?: number) {
  if (!isNativeCompanionExternalDocumentSearchRuntime()) {
    return [] as CompanionExternalDocumentSearchResult[];
  }
  const results = (await FolioleCompanionSync.searchExternalDocuments({ ...(limit !== undefined ? { limit } : {}), query })).results as NativeExternalDocumentSearchResult[];
  return results.map(normalizeExternalDocumentSearchResult);
}

function normalizeExternalDocument<T extends NativeExternalDocument>(document: T): CompanionExternalDocument & Omit<T, 'content_status'> {
  const { content_status, ...rest } = document;
  return {
    ...rest,
    bodyStatus: normalizeBodyStatus(content_status)
  };
}

function normalizeBodyStatus(status: NativeExternalDocument['content_status']) {
  return status === 'failed' || status === 'fetching' || status === 'missing' ? status : 'ready';
}

function normalizeExternalDocumentSearchResult(document: NativeExternalDocumentSearchResult): CompanionExternalDocumentSearchResult {
  return normalizeExternalDocument(document);
}
