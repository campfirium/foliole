import type { ReadwiseSourceInput } from '../database/readwiseSourceTypes.js';

export const READWISE_READER_LIST_URL = 'https://readwise.io/api/v3/list/';
export const READWISE_EXPORT_URL = 'https://readwise.io/api/v2/export/';

export interface ReadwiseTokenSyncFetchResult {
  documents: unknown[];
  exportBooks: unknown[];
  fetchedAt: string;
  nextPageCursor: string | null;
}

export interface ReadwiseTokenSyncNormalizedBatch {
  nextCursor: string | null;
  sources: ReadwiseSourceInput[];
}

export interface ReadwiseTokenSyncResult {
  checked_at: string;
  document_count: number;
  message: string;
  source_count: number;
  status: 'blocked_secondary' | 'failed' | 'invalid_token' | 'not_connected' | 'rate_limited' | 'synced';
}

export async function fetchReadwiseTokenSyncBatch(input: {
  fetchImpl?: typeof fetch;
  pageCursor?: string | null;
  token: string;
  updatedAfter?: string | null;
}): Promise<ReadwiseTokenSyncFetchResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const documents = await fetchReadwiseJson(fetchImpl, buildReaderListUrl(input), input.token);
  const exportBooks = input.pageCursor
    ? { results: [] as unknown[] }
    : await fetchReadwiseJson(fetchImpl, buildExportUrl(input.updatedAfter), input.token);
  return {
    documents: Array.isArray(documents.results) ? documents.results : [],
    exportBooks: Array.isArray(exportBooks.results) ? exportBooks.results : [],
    fetchedAt: new Date().toISOString(),
    nextPageCursor: stringValue(documents.nextPageCursor) ?? stringValue(documents.next_page_cursor)
  };
}

export function normalizeReadwiseTokenSyncBatch(batch: ReadwiseTokenSyncFetchResult): ReadwiseTokenSyncNormalizedBatch {
  const books = batch.exportBooks.map(normalizeExportBook).filter((book): book is NormalizedExportBook => Boolean(book));
  const sources = batch.documents
    .map((document) => normalizeReaderDocument(document, books, batch.fetchedAt))
    .filter((source): source is ReadwiseSourceInput => Boolean(source));
  return { nextCursor: batch.nextPageCursor, sources };
}

async function fetchReadwiseJson(fetchImpl: typeof fetch, url: string, token: string) {
  const response = await fetchImpl(url, { headers: { Authorization: `Token ${token}` }, method: 'GET' });
  if (response.status === 401 || response.status === 403) throw new ReadwiseSyncHttpError('invalid_token');
  if (response.status === 429) throw new ReadwiseSyncHttpError('rate_limited');
  if (!response.ok) throw new ReadwiseSyncHttpError('failed');
  return response.json() as Promise<Record<string, unknown>>;
}

export class ReadwiseSyncHttpError extends Error {
  constructor(readonly status: ReadwiseTokenSyncResult['status']) {
    super(status);
  }
}

function buildReaderListUrl(input: { pageCursor?: string | null; updatedAfter?: string | null }) {
  const url = new URL(READWISE_READER_LIST_URL);
  if (input.updatedAfter) url.searchParams.set('updatedAfter', input.updatedAfter);
  if (input.pageCursor) url.searchParams.set('pageCursor', input.pageCursor);
  return url.toString();
}

function buildExportUrl(updatedAfter?: string | null) {
  const url = new URL(READWISE_EXPORT_URL);
  if (updatedAfter) url.searchParams.set('updatedAfter', updatedAfter);
  return url.toString();
}

interface NormalizedExportBook {
  annotations: NonNullable<ReadwiseSourceInput['annotations']>;
  readwiseBookId: string;
  title: string;
  url: string | null;
}

function normalizeReaderDocument(document: unknown, books: NormalizedExportBook[], updatedAt: string): ReadwiseSourceInput | null {
  const value = objectValue(document);
  const readerDocumentId = stringValue(value.id);
  if (!readerDocumentId || stringValue(value.location) === 'feed') return null;
  const title = stringValue(value.title) ?? '';
  const url = stringValue(value.source_url) ?? stringValue(value.url);
  const book = findExportBook(books, title, url);
  return {
    annotations: book?.annotations ?? [],
    author: stringValue(value.author),
    category: stringValue(value.category),
    location: stringValue(value.location),
    rawSourceUrl: stringValue(value.raw_source_url),
    readerDocumentId,
    readwiseBookId: book?.readwiseBookId ?? null,
    remoteUpdatedAt: stringValue(value.updated_at),
    sourceUrl: url,
    syncStatus: 'synced',
    tags: stringArray(value.tags),
    title,
    updatedAt
  };
}

function normalizeExportBook(book: unknown): NormalizedExportBook | null {
  const value = objectValue(book);
  const readwiseBookId = stringValue(value.user_book_id) ?? stringValue(value.id);
  if (!readwiseBookId) return null;
  return {
    annotations: (Array.isArray(value.highlights) ? value.highlights : []).map((highlight) => {
      const item = objectValue(highlight);
      return {
        annotationKind: stringValue(item.note) ? 'note' as const : 'highlight' as const,
        deletedAt: stringValue(item.deleted_at),
        highlightId: stringValue(item.id) ?? '',
        location: stringValue(item.location),
        note: stringValue(item.note),
        readwiseBookId,
        remoteUpdatedAt: stringValue(item.updated_at),
        text: stringValue(item.text)
      };
    }).filter((highlight) => highlight.highlightId),
    readwiseBookId,
    title: stringValue(value.title) ?? '',
    url: stringValue(value.source_url) ?? stringValue(value.url)
  };
}

function findExportBook(books: NormalizedExportBook[], title: string, url: string | null) {
  return books.find((book) => Boolean(url) && book.url === url) ?? books.find((book) => book.title === title);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
