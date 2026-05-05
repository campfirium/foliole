import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceSyncBridge';

export interface CompanionExternalDocument {
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

export async function loadCompanionExternalDocument(documentId: string) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null as CompanionExternalDocument | null;
  }
  return (await FolioleCompanionSync.loadExternalDocument({ document_id: documentId })).document;
}

export async function searchCompanionExternalDocuments(query: string, limit?: number) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as CompanionExternalDocumentSearchResult[];
  }
  return (await FolioleCompanionSync.searchExternalDocuments({ limit, query })).results;
}
