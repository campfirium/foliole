import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceSyncBridge';

export interface CompanionExternalDocument {
  bodyStatus?: 'missing' | 'ready';
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

type NativeExternalDocument = Omit<CompanionExternalDocument, 'bodyStatus'> & {
  content_status?: 'missing' | 'ready';
};

type NativeExternalDocumentSearchResult = Omit<CompanionExternalDocumentSearchResult, 'bodyStatus'> & {
  content_status?: 'missing' | 'ready';
};

export async function loadCompanionExternalDocument(documentId: string) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null as CompanionExternalDocument | null;
  }
  const document = (await FolioleCompanionSync.loadExternalDocument({ document_id: documentId })).document as NativeExternalDocument | null;
  return document ? normalizeExternalDocument(document) : null;
}

export async function searchCompanionExternalDocuments(query: string, limit?: number) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as CompanionExternalDocumentSearchResult[];
  }
  const results = (await FolioleCompanionSync.searchExternalDocuments({ limit, query })).results as NativeExternalDocumentSearchResult[];
  return results.map(normalizeExternalDocumentSearchResult);
}

function normalizeExternalDocument<T extends NativeExternalDocument>(document: T): CompanionExternalDocument & Omit<T, 'content_status'> {
  const { content_status, ...rest } = document;
  return {
    ...rest,
    bodyStatus: content_status === 'missing' ? 'missing' : 'ready'
  };
}

function normalizeExternalDocumentSearchResult(document: NativeExternalDocumentSearchResult): CompanionExternalDocumentSearchResult {
  return normalizeExternalDocument(document);
}
